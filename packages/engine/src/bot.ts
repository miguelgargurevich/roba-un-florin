/* El vecino que juega solo.

   Cuando en una sala sobran asientos, los rellena esto: sin bots, los sitios
   vacíos eran muñecos plantados en su patio y el mapa parecía un museo.

   No es una IA: es una lista de prioridades y un rumbo. Lo que la hace parecer
   viva es que persigue lo que tú persigues —el desfile, los patios ajenos— y
   que reacciona a las abuelas. Y lo que la hace justa es que juega con las
   mismas reglas: se acerca, aguanta los 0,55 s del aro y carga, igual que tú.

   Determinista a propósito: no toca `Math.random` ni el azar del motor, solo
   mira el estado y el reloj. Así una partida con bots se puede reproducir y
   guardar como cualquier otra. */

import type { Estado, Jugador, EntradaJugador } from "./tipos.js";
import { clamp, dist2 } from "./util.js";
import { ANCHO_PISTA, dificultadDe } from "./datos.js";
import { celdaLibreDe, centroDelMapa, enLaPista, esMiPatio, esPared, freePedDe, patiosDe } from "./estado.js";

/** Lo que decide el bot en un paso: hacia dónde va y si tira la chancla. */
export interface PlanBot {
  entrada: EntradaJugador;
  usar: boolean;
  /** En el tenis, con cuánta fuerza le pega (0 a 1). `null` es «no le pega».
      El fútbol no lo necesita: allí la pelota se mueve al pasarle por encima,
      y aquí no —una pelota de tenis se golpea o no se golpea—. */
  patear?: number | null;
}

/** A esta distancia deja de andar y se queda quieto para que cargue el aro. */
const PEGADO = 34;
/** A quién le tira la chancla y desde dónde. */
const TIRO = 300;
/** Cada cuánto se replantea a dónde iba. */
const REPENSAR = 0.8;

const QUIETO: EntradaJugador = { mover: { x: 0, y: 0 }, apunta: null };

/** ¿Hay una abuela o un ladrón lo bastante cerca como para gastarle un chanclazo? */
function aQuienLeTiro(e: Estado, p: Jugador): { x: number; y: number } | null {
  let mejor: { x: number; y: number } | null = null;
  let bd = TIRO * TIRO;
  for (const t of e.thieves) {
    if (t.stun > 0) continue;
    const d = dist2(p.x, p.y, t.x, t.y);
    if (d < bd) { bd = d; mejor = { x: t.x, y: t.y }; }
  }
  for (const b of e.bases) {
    const g = b.guard;
    if (!g || g.stun > 0) continue;
    /* Solo a la abuela que le está respirando encima: las de su casa, en su
       sitio, no molestan a nadie. */
    const d = dist2(p.x, p.y, g.x, g.y);
    if (d < bd && d < 220 * 220) { bd = d; mejor = { x: g.x, y: g.y }; }
  }
  return mejor;
}

/* ---- el bot futbolista ----
   Dos papeles y nada más: el más cercano a la pelota va a por ella, y el resto
   se queda entre la pelota y su arco. Con eso ya hay presión, pases de rebote y
   alguien atrás; afinarlo más (desmarques, coberturas) es un juego distinto.

   Ir "a por la pelota" no es ir a la pelota: es ponerse DETRÁS, en la línea que
   va de la pelota al arco contrario, para que al pasar por encima la patada
   —que sale en la dirección en la que corres— la mande a puerta. */
function aDondeVoyEnElPartido(e: Estado, p: Jugador): { x: number; y: number } | null {
  const f = e.futbol;
  if (!f) return null;
  const balon = e.trastos.find(t => t.id === f.balon);
  if (!balon) return null;

  const mio = p.equipo ?? 0;
  const arcoRival = f.arcos[1 - mio];
  const arcoMio = f.arcos[mio];
  const metaX = arcoRival.x + arcoRival.w / 2, metaY = arcoRival.y + arcoRival.h / 2;

  /* ¿Soy el que va a por ella? El más cercano de los míos que esté en pie. */
  const compis = e.players.filter(q => (q.equipo ?? 0) === mio && q.stun <= 0);
  const yoVoy = compis.every(q => q.idx === p.idx ||
    dist2(p.x, p.y, balon.x, balon.y) <= dist2(q.x, q.y, balon.x, balon.y));

  if (yoVoy) {
    const dx = metaX - balon.x, dy = metaY - balon.y;
    const d = Math.hypot(dx, dy) || 1;
    /* El punto de carrera: por detrás de la pelota, en la línea al arco. */
    const detrasX = balon.x - (dx / d) * 70, detrasY = balon.y - (dy / d) * 70;

    /* Y en cuanto se llega, se apunta AL ARCO y no a la pelota. Apuntando a la
       pelota el bot se paraba a un palmo de ella —`PEGADO` frena al llegar— y
       el partido acababa 0-0 con seis mirándola. Apuntando al arco la atraviesa
       corriendo, y la patada sale en la dirección en la que corres, que es
       justo hacia donde hay que mandarla. */
    if (dist2(p.x, p.y, detrasX, detrasY) < 110 * 110) return { x: metaX, y: metaY };
    return { x: detrasX, y: detrasY };
  }

  /* El resto, a defender: en la recta entre la pelota y el arco propio, a un
     tercio del camino. Ni encima del portero ni pegado al delantero rival. */
  const px = arcoMio.x + arcoMio.w / 2, py = arcoMio.y + arcoMio.h / 2;
  return { x: balon.x + (px - balon.x) * 0.34 + (p.idx % 2 ? 90 : -90),
           y: balon.y + (py - balon.y) * 0.34 + (p.idx % 2 ? 120 : -120) };
}

/* ---- el bot tenista ----
   No persigue la pelota: se pone donde VA A CAER. Perseguirla es lo que hace
   un perro, y además llega siempre tarde — la pelota va a 1 300 px/s y él a
   200. Con la parábola resuelta llega a tiempo, que es lo que convierte el
   peloteo en un peloteo y no en un punto por saque.

   Y cuando la pelota no es suya, vuelve al centro de su campo: quedarse donde
   acabó el último golpe es regalar el siguiente. */

/** Cuánto tarda en arrancar: no se mueve hasta que la pelota está a menos de
    esta parte de campo rival de la red. Es su tiempo de reacción, y es la
    palanca de la dificultad. En 0 —arrancar solo al cruzar la red— ni el saque
    devolvía; sin nada, lo devolvía TODO y el punto no se acababa nunca. */
const REACCION = 0.35;
/** Lo rápido que corre el tenista de la máquina, sobre tu velocidad.

    Es la palanca fina, y hace falta una: la reacción sola no sirve de knob
    —medido, o no devuelve ni el saque o lo devuelve absolutamente todo—,
    porque su destino es exacto y llegar o no llegar es un salto, no una
    cuesta. Corriendo un poco más lento, las que van al rincón se le escapan y
    las de al lado no: eso sí es una cuesta. */
const TENIS_BRIO = 0.68;
/** Y el del vóley, aparte. Aquí la pelota es MUY generosa a propósito —tiene
    que serlo, o un humano no llega a una sola: 36 % de las que cruzaban,
    medido—, y con una pelota así el bot no falla nunca: 0-0 en cinco minutos.
    Las dos palancas son independientes: la pelota decide si TÚ llegas, y esto
    decide si ÉL llega. */
const VOLEY_BRIO = 0.38;

/** Dónde va a picar la pelota, resolviendo su vuelo. */
function dondeVaAPicar(b: { x: number; y: number; z?: number; vz?: number; vx: number; vy: number }) {
  const g = 1600;                                  // la misma gravedad del motor
  const z = b.z ?? 0, vz = b.vz ?? 0;
  if (z <= 0 && vz <= 0) return { x: b.x, y: b.y };   // ya rueda: está donde está
  const T = (vz + Math.sqrt(vz * vz + 2 * g * z)) / g;
  return { x: b.x + b.vx * T, y: b.y + b.vy * T };
}

function aDondeVoyEnElTenis(e: Estado, p: Jugador): { x: number; y: number } | null {
  const t = e.tenis;
  if (!t) return null;
  const balon = e.trastos.find(x => x.id === t.balon);
  if (!balon) return null;

  const mio = (p.equipo ?? 0) as 0 | 1;
  const c = t.cancha;
  const cy = c.y + c.h / 2;
  const haciaMi = mio === 0 ? -1 : 1;
  /* En dobles, el segundo se queda más cerca de la red: los dos al fondo
     dejan un hueco delante por el que cabe cualquier dejada. */
  const suyos = e.players.filter(q => (q.equipo ?? 0) === mio);
  const puesto = suyos.findIndex(q => q.idx === p.idx);
  const casa = { x: t.redX + haciaMi * (c.w / 2) * (0.66 - puesto * 0.30), y: cy };

  /* Mientras la pelota sea del otro lado —o la acabe de golpear él mismo— no
     hay nada que ir a buscar. */
  if (t.saque > 0 || t.ultimoToque == null || t.ultimoToque === mio) return casa;

  /* No sale corriendo hasta que la pelota cruza la red. No es un truco para
     hacerlo más fácil: es el tiempo de reacción que tiene cualquiera, y es lo
     único que le impide estar SIEMPRE donde va a caer. Sin esto —con la pelota
     ya lenta— los dos lo devolvían todo y el punto no se acababa nunca: 273
     golpes y cero puntos en cinco minutos, medido. */
  const haciaElRival = -haciaMi;
  if ((balon.x - t.redX) * haciaElRival > (c.w / 2) * REACCION) return casa;

  const caída = dondeVaAPicar(balon);
  /* Si va a picar en el campo de enfrente, todavía no es cosa suya. */
  const lado = caída.x < t.redX ? 0 : 1;
  if (lado !== mio) return casa;

  /* Un paso por detrás del bote: hay que golpearla, no chocar con ella. */
  return {
    x: clamp(caída.x + haciaMi * 30, c.x + 40, c.x + c.w - 40),
    y: clamp(caída.y, c.y + 40, c.y + c.h - 40),
  };
}

/** A dónde piensa mandarla: al hueco que deje el rival, y al fondo.

    Se calcula SIEMPRE que la pelota sea suya, no solo cuando ya la tiene al
    alcance. La puntería del motor se lee de `p.apunta`, que llega con la
    entrada del tick anterior: calculándola solo en el momento de golpear, el
    primer golpe salía sin puntería —o sea, de vuelta a las manos del rival— y
    el peloteo no se acababa nunca. Medido: 99 px de carrera por golpe, con un
    brazo de 100. Así ningún punto podía morir. */
function aDondeLaMando(e: Estado, p: Jugador): { x: number; y: number } | null {
  const t = e.tenis;
  if (!t || t.ganador != null) return null;
  const mio = (p.equipo ?? 0) as 0 | 1;
  if (t.saque > 0 || t.ultimoToque === mio) return null;

  const c = t.cancha, cy = c.y + c.h / 2;
  /* Al lado contrario de donde esté el rival, pero a una distancia MEDIDA: a
     268 px/s y con la pelota tres cuartos de segundo en el aire, el otro llega
     a unos 300 px. Mandarla siempre al rincón (450 px) hacía imbatible cada
     golpe y los puntos duraban uno; dejarla donde él estaba las devolvía todas
     y no duraban nunca. El desvío va y viene entre 140 y 290 px, así que unas
     llegan y otras no — que es lo que hace que haya peloteo. Medido con eso:
     partidos de 7-6 y 7-5 en poco más de un minuto, con tres golpes por punto. */
  const rivales = e.players.filter(q => (q.equipo ?? 0) !== mio);
  const suY = rivales.length
    ? rivales.reduce((s, q) => s + q.y, 0) / rivales.length : cy;
  const desvío = 120 + 120 * Math.abs(Math.sin(e.t * 0.9 + p.idx * 1.7));
  const lejos = suY > cy ? -1 : 1;
  return { x: t.redX, y: clamp(suY + lejos * desvío, c.y + 70, c.y + c.h - 70) };
}

/** ¿Ya la tiene al alcance? Entonces, con cuánta fuerza. */
function golpeDelBot(e: Estado, p: Jugador): number | null {
  const t = e.tenis;
  if (!t || t.ganador != null || t.saque > 0 || p.stun > 0) return null;
  const balon = e.trastos.find(x => x.id === t.balon);
  if (!balon) return null;

  const mio = (p.equipo ?? 0) as 0 | 1;
  if (t.ultimoToque === mio) return null;
  if ((balon.x < t.redX ? 0 : 1) !== mio) return null;
  /* Un pelo antes de que se le escape: el alcance del motor es 100. */
  if (dist2(p.x, p.y, balon.x, balon.y) > 88 * 88) return null;

  /* La fuerza va y viene con el reloj: siempre a fondo es previsible y siempre
     corto es un regalo. Sale del reloj y del número de jugador, así que sigue
     siendo reproducible. */
  return 0.62 + Math.sin(e.t * 1.3 + p.idx * 2.3) * 0.3;
}

/* ---- el bot basquetbolista ----
   Tres papeles y ninguno más: el que la lleva va al aro y tira en cuanto está
   a tiro; los suyos se abren para no taparle; y si anda suelta, todos a por
   ella. */
function aDondeVoyEnBasquet(e: Estado, p: Jugador): { x: number; y: number } | null {
  const b = e.basquet;
  if (!b) return null;
  const balon = e.trastos.find(t => t.id === b.balon);
  if (!balon) return null;
  const mio = (p.equipo ?? 0) as 0 | 1;
  const aro = b.aros[1 - mio];

  if (b.conLaBola === p.idx) return { x: aro.x, y: aro.y };

  const laLlevaUnMio = b.conLaBola != null &&
    (e.players.find(q => q.idx === b.conLaBola)?.equipo ?? 0) === mio;
  if (laLlevaUnMio) {
    /* Abrirse: dos amontonados en el aro se estorban y encima le tapan el tiro
       al que la lleva. */
    const haciaDentro = aro.x > b.cancha.x + b.cancha.w / 2 ? -1 : 1;
    return { x: aro.x + haciaDentro * 200, y: aro.y + (p.idx % 2 ? 200 : -200) };
  }
  /* La lleva el rival, o anda suelta: a por ella. */
  return { x: balon.x, y: balon.y };
}

/** ¿Tira? Solo si la lleva y está a tiro: de lejos el error del motor se abre
    tanto que tirar es regalar la pelota. */
function tiroDelBot(e: Estado, p: Jugador): number | null {
  const b = e.basquet;
  if (!b || b.ganador != null || b.saque > 0 || p.stun > 0) return null;
  if (b.conLaBola !== p.idx) return null;
  const aro = b.aros[1 - ((p.equipo ?? 0) as 0 | 1)];
  return Math.hypot(aro.x - p.x, aro.y - p.y) > 300 ? null : 0.8;
}

/* ---- el bot bolichero ----
   Al que le toca se pone detrás de la bola, escorado hacia el lado desde el que
   piensa atacar; el que espera se aparta de la pista. Y apunta al HUECO —entre
   el pino 1 y el 3—, que es donde apunta cualquiera: al pino de delante en
   pleno centro la bola se frena y deja los de atrás en pie. */
function aDondeVoyEnBolos(e: Estado, p: Jugador): { x: number; y: number } | null {
  const b = e.bolos;
  if (!b) return null;
  const bola = e.trastos.find(t => t.id === b.balon);
  if (!bola) return null;
  const idx = e.players.indexOf(p);
  if (idx !== b.turno)
    return { x: b.pista.x + b.pista.w + 90, y: b.faltaY };
  /* Detrás de la bola, y con un poco de escora que va cambiando: dos manos
     idénticas seguidas serían dos plenos idénticos o dos fallos idénticos. */
  const escora = Math.sin(e.t * 0.5 + idx * 1.9) * 60;
  return { x: bola.x + escora * 0.2, y: bola.y + 46 };
}

/** A dónde apunta: al HUECO entre los dos pinos en pie más cercanos. Al pino de
    delante en pleno centro la bola se frena y deja los de atrás en pie.

    Se calcula SIEMPRE que sea su turno, no solo cuando ya puede lanzar. El
    motor lee `p.apunta` de la entrada del tick ANTERIOR: calculándola solo en
    el momento de tirar, la primera bola salía sin puntería —o sea, recta por el
    centro— y salían 35-35 exactos en todas las semillas, con cero plenos en
    veinte bolas. Es el mismo bicho que ya mordió en el tenis. */
function aDondeApuntaElBolichero(e: Estado, p: Jugador): { x: number; y: number } | null {
  const b = e.bolos;
  if (!b || b.ganador != null) return null;
  if (e.players.indexOf(p) !== b.turno) return null;
  const enPie = b.pinos.filter(x => x.pie);
  if (!enPie.length) return null;
  /* Los dos más cercanos a quien lanza: con todos en pie, el hueco entre ellos
     cae justo al lado del primero, que es el bolsillo. */
  const cerca = enPie.slice().sort((m, n) => n.y - m.y).slice(0, 2);
  const mx = cerca.reduce((s, x) => s + x.x, 0) / cerca.length;
  const my = cerca.reduce((s, x) => s + x.y, 0) / cerca.length;
  /* Y falla un poco, que si no cada mano es un pleno. Del reloj y del asiento,
     así que sigue siendo reproducible. */
  const desvio = Math.sin(e.t * 1.7 + p.idx * 2.6) * 46;
  return { x: mx + desvio, y: my };
}

/** ¿Lanza ya, y con cuánta fuerza? */
function tiroDelBolichero(e: Estado, p: Jugador): number | null {
  const b = e.bolos;
  if (!b || b.ganador != null || b.rodando || b.espera > 0) return null;
  if (e.players.indexOf(p) !== b.turno) return null;
  const bola = e.trastos.find(t => t.id === b.balon);
  if (!bola) return null;
  if (dist2(p.x, p.y, bola.x, bola.y) > 62 * 62) return null;
  /* Y no antes de tener la puntería puesta: la del tick anterior. */
  if (!p.apunta.on) return null;
  return 0.72;
}

/* ---- el bot luchador ----
   No va al rival: va al punto desde el que empujarlo lo saca. Yendo al rival
   lo empujas hacia donde tú estabas, que suele ser el centro — o sea, lo
   salvas. Hay que ponerse en la línea que va del BORDE MÁS CERCANO A ÉL hasta
   él, y embestir desde el lado de dentro. */
function aDondeVoyEnLucha(e: Estado, p: Jugador): { x: number; y: number } | null {
  const l = e.lucha;
  if (!l) return null;
  const rival = e.players.find(q => (q.equipo ?? 0) !== (p.equipo ?? 0) && q.stun <= 0)
             ?? e.players.find(q => q.idx !== p.idx);
  if (!rival) return null;

  /* Por dónde se sale él: el borde del círculo más cercano a él. */
  const dx = rival.x - l.ring.x, dy = rival.y - l.ring.y;
  const d = Math.hypot(dx, dy) || 1;
  const salidaX = l.ring.x + (dx / d) * l.ring.r, salidaY = l.ring.y + (dy / d) * l.ring.r;
  /* Y yo me pongo al otro lado de él, en esa misma línea. */
  const ex = rival.x - salidaX, ey = rival.y - salidaY;
  const m = Math.hypot(ex, ey) || 1;
  const detrasX = rival.x + (ex / m) * 60, detrasY = rival.y + (ey / m) * 60;
  /* Al llegar detrás, apuntar a la SALIDA y atravesarlo: si apunta al rival se
     planta a un palmo y no empuja nada. Es el bicho de siempre. */
  if (dist2(p.x, p.y, detrasX, detrasY) < 80 * 80) return { x: salidaX, y: salidaY };
  return { x: detrasX, y: detrasY };
}

/* ---- el bot tirador ----
   Al que le toca se pone en la raya; el que espera, a un lado. Y apunta al
   centro con un temblor: si apuntara clavado al centro sacaría cincuenta cada
   vez, y no habría partida. */
function aDondeVoyEnDardos(e: Estado, p: Jugador): { x: number; y: number } | null {
  const d = e.dardos;
  if (!d) return null;
  const i = e.players.indexOf(p);
  if (i !== d.turno) return { x: d.tablero.x + 320, y: d.raya };
  return { x: d.tablero.x, y: d.raya + 40 };
}

/** A dónde apunta. Se calcula SIEMPRE que sea su turno: el motor lee
    `p.apunta` del tick anterior, y calculándola solo al tirar el primer dardo
    saldría sin puntería. Es el bicho que ya mordió en el tenis y en los bolos. */
function aDondeApuntaElTirador(e: Estado, p: Jugador): { x: number; y: number } | null {
  const d = e.dardos;
  if (!d || d.ganador != null) return null;
  if (e.players.indexOf(p) !== d.turno) return null;
  /* El temblor sale del reloj y del asiento: reproducible, y distinto para cada
     uno. Del tamaño de un anillo, así que a veces cae en el 25 y a veces en el
     centro. */
  const anillo = d.tablero.r / 5;
  return {
    x: d.tablero.x + Math.sin(e.t * 1.9 + p.idx * 2.3) * anillo * 1.1,
    y: d.tablero.y + Math.cos(e.t * 1.4 + p.idx * 1.7) * anillo * 1.1,
  };
}

/** ¿Tira ya? Cuando está en la raya y con la puntería puesta. Aguanta casi
    todo el pulso: un bot que tira a lo loco no es rival. */
function tiroDelTirador(e: Estado, p: Jugador): number | null {
  const d = e.dardos;
  if (!d || d.ganador != null || d.espera > 0 || p.stun > 0) return null;
  const i = e.players.indexOf(p);
  if (i !== d.turno || d.tiros[i] >= d.total) return null;
  if (Math.abs(p.y - (d.raya + 40)) > 60) return null;
  if (!p.apunta.on) return null;
  return 0.82;
}

/* ---- el bot de la carrera de obstáculos ----
   Dos cosas, y las dos importan: mirar MÁS ALLÁ de la baliza —si no, va de
   cono en cono como un cono— y apartarse del que tiene justo delante. Sin lo
   segundo entraba en línea recta a la baliza y se comía el cono que está en esa
   misma línea, que es exactamente donde se pusieron. */
function aDondeVoyEnCarreraObs(e: Estado, p: Jugador): { x: number; y: number } | null {
  const c = e.carreraObs;
  if (!c) return null;
  const idx = e.players.indexOf(p);
  const j = c.jugadores[idx];
  if (!j) return null;

  const cp = c.trazado[j.checkpoint];
  const sig = c.trazado[(j.checkpoint + 1) % c.trazado.length];
  if (!cp) return null;
  /* Corta la curva: apunta entre la baliza y la siguiente. */
  let mx = cp.x * 0.65 + sig.x * 0.35, my = cp.y * 0.65 + sig.y * 0.35;

  /* Y esquiva: si un cono le queda en el camino, empuja la meta a un lado —al
     lado por el que ya viene escorado, que es el desvío más corto. */
  const dx = mx - p.x, dy = my - p.y, d = Math.hypot(dx, dy) || 1;
  for (const o of c.obstaculos) {
    const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
    /* ¿Está delante y cerca de la línea? Proyección sobre el rumbo. */
    const t = ((ox - p.x) * dx + (oy - p.y) * dy) / (d * d);
    if (t < 0 || t > 1) continue;
    if (t * d > 240) continue;                 // los de más allá, cuando lleguen
    const px = p.x + dx * t, py = p.y + dy * t;
    const lejos = Math.hypot(ox - px, oy - py);
    if (lejos > o.w) continue;
    /* Normal a la ruta, hacia el lado contrario al cono. El desvío se TOPA a
       un 55 % de lo que falta: sin ese tope, con la baliza cerca el empujón
       lateral giraba el rumbo más de 90°, cancelaba el avance y el bot se
       quedaba oscilando justo fuera del radio del punto de paso. */
    const nx = -dy / d, ny = dx / d;
    const lado = (ox - px) * nx + (oy - py) * ny > 0 ? -1 : 1;
    const desvio = Math.min(o.w + 46, d * 0.55);
    mx += nx * lado * desvio;
    my += ny * lado * desvio;
    break;
  }
  return { x: mx, y: my };
}

/* ---- el bot del laberinto ----
   Va a por su gema POR PASILLOS, no en línea recta: en un laberinto la gema más
   cercana en línea recta suele estar al otro lado de un muro, y el bot se queda
   empujando la pared. Se recorre la rejilla a lo ancho (BFS) desde su celda, que
   con 13x13 es baratísimo y da el camino más corto DE VERDAD.

   Y cada uno va a una gema DISTINTA: con todos detrás de la misma iban en fila
   india, el de delante se las comía todas y los de atrás no cogían ni una
   —medido: 0-5, 0-6, y la partida sin acabar— y acababan los dos parados en la
   misma celda. */
function aDondeVoyEnLaberinto(e: Estado, p: Jugador): { x: number; y: number } | null {
  const l = e.laberinto;
  if (!l || !l.gemas.length) return null;
  const c = l.celda;
  const celdaDe = (x: number, y: number): [number, number] =>
    [Math.floor((x - l.origen.x) / c), Math.floor((y - l.origen.y) / c)];
  const centro = (id: number) => ({
    x: l.origen.x + (id % l.ancho) * c + c / 2,
    y: l.origen.y + Math.floor(id / l.ancho) * c + c / 2,
  });

  /* La celda LIBRE, no la que dice `floor`: rozando el borde de un pasillo te
     sitúa en la pared de al lado, y desde una pared no hay camino por pasillos
     — el bot acababa tirando en línea recta contra el muro para siempre. */
  const [px, py] = celdaLibreDe(l, p.x, p.y);
  const inicio = py * l.ancho + px;

  /* El fantasma encima: huir por el pasillo que más lo aleje. Una gema no vale
     la que te va a quitar. */
  const gh = l.fantasma;
  /* Huir solo cuando el fantasma está DE VERDAD encima: una celda. Con 200 px
     —dos celdas— el bot alternaba entre huir e ir a por la gema en cada
     replanteo, y el resultado era subir, bajar, subir… sin moverse del sitio.
     Costó encontrarlo porque las dos decisiones eran correctas por separado. */
  if (dist2(p.x, p.y, gh.x, gh.y) < 110 * 110) {
    const [fx, fy] = celdaLibreDe(l, gh.x, gh.y);
    const salidas = ([[0,-1],[0,1],[-1,0],[1,0]] as [number, number][])
      .map(([dx, dy]) => [px + dx, py + dy] as [number, number])
      .filter(([x, y]) => !esPared(l, x, y));
    if (salidas.length) {
      const lejos = salidas.reduce((m, s) =>
        Math.abs(s[0] - fx) + Math.abs(s[1] - fy) > Math.abs(m[0] - fx) + Math.abs(m[1] - fy) ? s : m);
      return centro(lejos[1] * l.ancho + lejos[0]);
    }
  }

  /* Una gema por celda, con su posición real: hay que ir a la GEMA, no al
     centro de la celda — orbitando el centro no se coge nunca. */
  const gemaEn = new Map<number, { x: number; y: number }>();
  for (const g of l.gemas) {
    const [gx, gy] = celdaLibreDe(l, g.x, g.y);
    gemaEn.set(gy * l.ancho + gx, g);
  }

  /* BFS: distancia y primer paso hacia cada celda alcanzable. */
  const antes = new Map<number, number>([[inicio, -1]]);
  const orden: number[] = [];
  const cola = [inicio];
  while (cola.length) {
    const id = cola.shift()!;
    orden.push(id);
    const x = id % l.ancho, y = Math.floor(id / l.ancho);
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]] as [number, number][]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= l.ancho || ny >= l.alto) continue;
      if (esPared(l, nx, ny)) continue;
      const nid = ny * l.ancho + nx;
      if (antes.has(nid)) continue;
      antes.set(nid, id);
      cola.push(nid);
    }
  }

  /* Las gemas alcanzables, en orden de cercanía por pasillo (`orden` ya viene
     ordenado por el BFS). Cada bot coge la que le toca por su puesto. */
  const alcanzables = orden.filter(id => gemaEn.has(id));
  if (!alcanzables.length) {
    const g = l.gemas.reduce((m, x) =>
      dist2(p.x, p.y, x.x, x.y) < dist2(p.x, p.y, m.x, m.y) ? x : m);
    return { x: g.x, y: g.y };
  }
  /* ---- comprometerse ----
     Si sigue habiendo gema donde dijo que iba, se sigue yendo ahí. Eligiendo
     cada vez «la más cercana», en el borde de dos celdas la más cercana cambia
     de una a otra: el bot subía, bajaba, subía… y se quedaba en el sitio para
     siempre. Medido: los dos jugadores clavados en la misma celda desde el
     segundo veinte hasta el final de la prueba. */
  const puesto = Math.max(0, e.players.indexOf(p));
  const antesMeta = p.bot?.meta;
  const sigue = antesMeta != null && gemaEn.has(antesMeta) && antes.has(antesMeta);
  const meta = sigue ? antesMeta! : alcanzables[Math.min(puesto, alcanzables.length - 1)];
  if (p.bot) p.bot.meta = meta;

  /* Si la gema está en mi celda o en la de al lado, voy DERECHO a ella. */
  const gema = gemaEn.get(meta)!;
  if (meta === inicio || antes.get(meta) === inicio) return { x: gema.x, y: gema.y };

  /* Si no, al primer paso del camino más corto. */
  let paso = meta, prev = antes.get(paso) ?? -1;
  while (prev >= 0 && prev !== inicio) { paso = prev; prev = antes.get(paso) ?? -1; }
  return centro(paso);
}

/* ---- el bot del billar ----
   Elige la bola con la tacada más limpia —la que mejor esté alineada con una
   hoya desde la blanca— y se pone DETRÁS de la blanca en esa línea. Apuntar a
   la bola más cercana sin mirar a qué hoya va es tirar por tirar. */

/** La mejor jugada: qué bola, a qué hoya, y lo alineado que está. */
function mejorTacada(bl: NonNullable<Estado["billar"]>) {
  const blanca = bl.bolas.find(b => b.color === 0 && !b.hoya);
  if (!blanca) return null;
  let mejor: { bola: typeof blanca; hoya: { x: number; y: number }; nota: number } | null = null;
  for (const bola of bl.bolas) {
    if (bola.color === 0 || bola.hoya) continue;
    for (const hoya of bl.hoyas) {
      /* Lo alineado: el ángulo entre "blanca → bola" y "bola → hoya". Cuanto más
         recto, más fácil. Un corte de más de 90° no entra ni por suerte. */
      const ax = bola.x - blanca.x, ay = bola.y - blanca.y;
      const bx = hoya.x - bola.x, by = hoya.y - bola.y;
      const na = Math.hypot(ax, ay) || 1, nb = Math.hypot(bx, by) || 1;
      const cos = (ax * bx + ay * by) / (na * nb);
      if (cos <= 0.15) continue;
      /* Nota: alineación primero, y de dos igual de rectas, la más cerca. */
      const nota = cos * 1000 - (na + nb) * 0.12;
      if (!mejor || nota > mejor.nota) mejor = { bola, hoya, nota };
    }
  }
  return mejor ? { blanca, ...mejor } : null;
}

function aDondeVoyEnBillar(e: Estado, p: Jugador): { x: number; y: number } | null {
  const bl = e.billar;
  if (!bl) return null;
  const i = e.players.indexOf(p);
  if (i !== bl.turno) return { x: bl.mesa.x - 70, y: bl.mesa.y + 60 };
  const jugada = mejorTacada(bl);
  if (!jugada) return null;
  /* Detrás de la blanca, en la línea de la jugada. */
  const dx = jugada.bola.x - jugada.blanca.x, dy = jugada.bola.y - jugada.blanca.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: jugada.blanca.x - (dx / d) * 40, y: jugada.blanca.y - (dy / d) * 40 };
}

/** A dónde apunta. SIEMPRE que sea su turno, no solo al tirar: el motor lee
    `p.apunta` del tick anterior. Ya van tres juegos con este mismo bicho. */
function aDondeApuntaElTaquista(e: Estado, p: Jugador): { x: number; y: number } | null {
  const bl = e.billar;
  if (!bl || bl.ganador != null) return null;
  if (e.players.indexOf(p) !== bl.turno) return null;
  const jugada = mejorTacada(bl);
  /* Apunta a la bola, no a la hoya: la blanca tiene que golpear la bola. */
  return jugada ? { x: jugada.bola.x, y: jugada.bola.y } : null;
}

/** ¿Taca ya? Con la mesa quieta, junto a la blanca y con la puntería puesta. */
function tacadaDelBot(e: Estado, p: Jugador): number | null {
  const bl = e.billar;
  if (!bl || bl.ganador != null || bl.espera > 0 || bl.rodando || p.stun > 0) return null;
  const i = e.players.indexOf(p);
  if (i !== bl.turno) return null;
  const blanca = bl.bolas.find(b => b.color === 0 && !b.hoya);
  if (!blanca) return null;
  if (dist2(p.x, p.y, blanca.x, blanca.y) > 66 * 66) return null;
  if (!p.apunta.on) return null;
  /* Más fuerte si la jugada es larga: una tacada floja se queda a medio camino.
     El vaivén del reloj es lo que evita que dos tacadas iguales salgan iguales. */
  const jugada = mejorTacada(bl);
  const largo = jugada ? Math.hypot(jugada.hoya.x - jugada.blanca.x, jugada.hoya.y - jugada.blanca.y) : 600;
  return clamp(largo / 1400 + Math.sin(e.t * 1.3 + p.idx * 2.1) * 0.12, 0.3, 1);
}

/* ---- el bot del air hockey ----
   Una paleta no persigue el disco: se pone ENTRE el disco y su propio arco, y
   solo sale a buscarlo cuando ya viene a su campo. Persiguiéndolo se deja el
   arco abierto y el rival marca por el hueco que acaba de dejar. */
function aDondeVoyEnHockey(e: Estado, p: Jugador): { x: number; y: number } | null {
  const h = e.hockey;
  if (!h) return null;
  const m = h.mesa, pk = h.puck;
  const mio = (p.equipo ?? 0) as 0 | 1;
  const cx = m.x + m.w / 2;
  const arcoMio = h.arcos[mio], arcoSuyo = h.arcos[1 - mio];
  const miArcoX = arcoMio.x + arcoMio.w / 2, miArcoY = arcoMio.y + arcoMio.h / 2;

  /* El saque, y el disco muerto en mitad de la mesa: van los dos a por él. Sin
     esto, en el saque el disco cae justo en la línea, cada uno cree que es del
     otro y se quedan mirándolo — 0-0 para siempre, medido. */
  const parado = Math.hypot(pk.vx, pk.vy) < 40 && Math.abs(pk.x - cx) < 130;
  const suCampo = !parado && h.saque <= 0 && (pk.x < cx ? 0 : 1) !== mio;
  if (suCampo)
    /* Cubriendo, se pega MÁS a su arco: con el zurdazo en el juego, un disco
       lanzado desde media mesa llega en medio segundo y desde el medio del
       campo no hay tiempo de reaccionar — salían 0-5 en diecisiete segundos. */
    return { x: pk.x + (miArcoX - pk.x) * 0.70, y: pk.y + (miArcoY - pk.y) * 0.54 };

  /* Y con el disco de este lado, a pegarle: por DETRÁS, en la línea que va del
     disco al arco contrario. Es el mismo truco del bot futbolista — yendo al
     disco lo empujas hacia donde estabas, que es tu propio arco. */
  /* Y apunta a un PALO, no al centro. Al centro no entra ninguna: el que
     defiende cubre justo esa línea y las para todas — 0-0 de cinco minutos,
     medido. El palo va cambiando con el reloj, así que el de enfrente no puede
     plantarse en un sitio y quedarse. */
  const palo = Math.sin(e.t * 0.7 + p.idx * 2.1) > 0 ? 0.14 : 0.86;
  const sx = arcoSuyo.x + arcoSuyo.w / 2, sy = arcoSuyo.y + arcoSuyo.h * palo;
  const dx = sx - pk.x, dy = sy - pk.y, d = Math.hypot(dx, dy) || 1;
  const detrasX = pk.x - (dx / d) * 46, detrasY = pk.y - (dy / d) * 46;
  /* Y al llegar detrás, apunta AL ARCO y no al disco: yendo al disco se planta
     a 46 px de él —`PEGADO` frena al llegar— y el contacto son 42. Cuatro
     píxeles de menos y no lo toca nunca. Es literalmente el mismo bicho que
     dejaba los partidos de fútbol en 0-0 con seis mirando la pelota. */
  if (dist2(p.x, p.y, detrasX, detrasY) < 76 * 76) return { x: sx, y: sy };
  return { x: detrasX, y: detrasY };
}

/* ---- el bot voleibolista ----
   Lo mismo que el tenista: no persigue la pelota, se pone donde VA A CAER. Y
   aquí importa el doble, porque en vóley el suelo es el punto — llegar tarde no
   te cuesta un bote, te cuesta el tanto. */
function aDondeVoyEnVoley(e: Estado, p: Jugador): { x: number; y: number } | null {
  const v = e.voley;
  if (!v) return null;
  const balon = e.trastos.find(x => x.id === v.balon);
  if (!balon) return null;

  const mio = (p.equipo ?? 0) as 0 | 1;
  const c = v.cancha, cy = c.y + c.h / 2;
  const haciaMi = mio === 0 ? -1 : 1;
  const suyos = e.players.filter(q => (q.equipo ?? 0) === mio);
  const puesto = suyos.findIndex(q => q.idx === p.idx);
  const casa = { x: v.redX + haciaMi * (c.w / 2) * (0.55 - puesto * 0.28), y: cy };

  if (v.saque > 0) return casa;
  const caída = dondeVaAPicar(balon);
  /* Si va a caer enfrente no es cosa suya. Y si cae de este lado sí lo es
     SIEMPRE, aunque la haya tocado él: en vóley tu propio pase también hay que
     ir a buscarlo — es justo de lo que va el juego. */
  if ((caída.x < v.redX ? 0 : 1) !== mio) return casa;
  return {
    x: clamp(caída.x, c.x + 40, c.x + c.w - 40),
    y: clamp(caída.y, c.y + 40, c.y + c.h - 40),
  };
}

/** ¿Zurdazo? Solo con el disco al alcance y de su lado: si no, el choque
    automático de siempre ya hace el trabajo. Apunta a un palo, como al
    embestir — al centro las para todas el que defiende. */
function zurdazoDelBot(e: Estado, p: Jugador):
    { fuerza: number; apunta: { x: number; y: number } } | null {
  const h = e.hockey;
  if (!h || h.ganador != null || h.saque > 0 || p.stun > 0) return null;
  const pk = h.puck;
  if (dist2(p.x, p.y, pk.x, pk.y) > 70 * 70) return null;
  const mio = (p.equipo ?? 0) as 0 | 1;
  const cx = h.mesa.x + h.mesa.w / 2;
  if ((pk.x < cx ? 0 : 1) !== mio) return null;      // el disco es del otro
  const arco = h.arcos[1 - mio];
  /* Y solo DETRÁS del disco, empujándolo hacia adelante. Zurdando desde
     cualquier ángulo el bot dejó de embestir —que era lo que le hacía marcar— y
     los partidos pasaron a 0-0 al reloj: el que defiende cubre la línea al
     palo, y un tiro de lado se lo come. Es el mismo principio de siempre: hay
     que estar detrás. */
  const haciaRival = Math.sign(arco.x - cx) || 1;
  if ((pk.x - p.x) * haciaRival <= 0) return null;
  const palo = Math.sin(e.t * 0.7 + p.idx * 2.1) > 0 ? 0.16 : 0.84;
  return {
    fuerza: 0.55 + Math.abs(Math.sin(e.t * 1.1 + p.idx)) * 0.4,
    apunta: { x: arco.x + arco.w / 2, y: arco.y + arco.h * palo },
  };
}

/** A dónde piensa mandarla: al hueco, con el mismo desvío medido del tenis. */
function aDondeLaMandoEnVoley(e: Estado, p: Jugador): { x: number; y: number } | null {
  const v = e.voley;
  if (!v || v.ganador != null || v.saque > 0) return null;
  const mio = (p.equipo ?? 0) as 0 | 1;
  const c = v.cancha, cy = c.y + c.h / 2;
  const rivales = e.players.filter(q => (q.equipo ?? 0) !== mio);
  const suY = rivales.length ? rivales.reduce((s, q) => s + q.y, 0) / rivales.length : cy;
  const desvío = 120 + 180 * Math.abs(Math.sin(e.t * 0.9 + p.idx * 1.7));
  return { x: v.redX, y: clamp(suY + (suY > cy ? -1 : 1) * desvío, c.y + 70, c.y + c.h - 70) };
}

/** ¿Le da, y cómo? Levanta la primera y remata la segunda. */
function toqueDelBot(e: Estado, p: Jugador): number | null {
  const v = e.voley;
  if (!v || v.ganador != null || v.saque > 0 || v.bloqueo > 0 || p.stun > 0) return null;
  const balon = e.trastos.find(x => x.id === v.balon);
  if (!balon) return null;
  const mio = (p.equipo ?? 0) as 0 | 1;
  if ((balon.x < v.redX ? 0 : 1) !== mio) return null;
  if ((balon.z ?? 0) > 230) return null;
  if (dist2(p.x, p.y, balon.x, balon.y) > 120 * 120) return null;
  /* Nunca se queda la pelota: el tercer toque cruza solo, y eso lo impone el
     motor, no el bot. */
  const suyos = v.ultimoToque === mio ? v.toques : 0;
  return suyos === 0 ? 0.2 : 0.85;
}

/** A dónde va: lo que lleva pesa más que lo que podría llevarse. */
function aDondeVoy(e: Estado, p: Jugador): { x: number; y: number } | null {
  if (e.reglas.modo === "futbol") return aDondeVoyEnElPartido(e, p);
  if (e.reglas.modo === "tenis") return aDondeVoyEnElTenis(e, p);
  if (e.reglas.modo === "voley") return aDondeVoyEnVoley(e, p);
  if (e.reglas.modo === "basquet") return aDondeVoyEnBasquet(e, p);
  if (e.reglas.modo === "hockey") return aDondeVoyEnHockey(e, p);
  if (e.reglas.modo === "lucha") return aDondeVoyEnLucha(e, p);
  if (e.reglas.modo === "carreraObs") return aDondeVoyEnCarreraObs(e, p);
  if (e.reglas.modo === "bolos") return aDondeVoyEnBolos(e, p);
  if (e.reglas.modo === "dardos") return aDondeVoyEnDardos(e, p);
  if (e.reglas.modo === "billar") return aDondeVoyEnBillar(e, p);
  if (e.reglas.modo === "laberinto") return aDondeVoyEnLaberinto(e, p);
  /* Corriendo solo existe el siguiente punto de paso. Mira un poco más allá
     para cortar la curva en vez de ir de baliza en baliza como un cono.

     Pero el punto al que mira tiene que estar DENTRO de la pista: con los
     trazados largos, la mezcla caía a veces al otro lado de una ese y el bot
     se quedaba empujando el tope para siempre, sin nada de velocidad a lo
     largo que lo despegara. Se proyecta sobre el asfalto y se acabó. */
  if (e.reglas.modo === "carrera" && e.esc.circuito?.length) {
    const c = e.esc.circuito;
    const r = p.carrera;
    const i = r ? r.hito % c.length : 0;
    const [x1, y1] = c[i];
    const [x2, y2] = c[(i + 1) % c.length];
    /* Si viene rozando el tope, primero vuelve al asfalto y luego sigue. Sin
       esto, en un vértice cerrado el bot empuja contra el muro, el muro le
       quita toda la velocidad y se queda ahí hasta el fin de los tiempos. */
    const yo = enLaPista(e, p.x, p.y);
    if (yo.d2 > (ANCHO_PISTA * 0.40) ** 2) return { x: yo.cx, y: yo.cy };

    /* Cuánto mira hacia el punto siguiente. Mirando más allá corta mejor la
       curva en vez de ir de baliza en baliza como un cono, y eso es lo que hace
       que en difícil se le note oficio. */
    const k = dificultadDe(e.reglas).traza;
    const mx = x1 * (1 - k) + x2 * k, my = y1 * (1 - k) + y2 * k;
    const q = enLaPista(e, mx, my);
    const borde = ANCHO_PISTA * 0.3;
    if (q.d2 <= borde * borde) return { x: mx, y: my };
    const d = Math.sqrt(q.d2) || 1;
    return { x: q.cx + (mx - q.cx) / d * borde, y: q.cy + (my - q.cy) / d * borde };
  }

  // 1. con las manos llenas, a casa
  if (p.carry) {
    const hueco = freePedDe(e, p);
    if (hueco) return { x: hueco.x, y: hueco.y };
    const patio = patiosDe(e, p)[0];
    return patio ? { x: patio.rect.x + patio.rect.w / 2, y: patio.rect.y + patio.rect.h / 2 } : null;
  }

  /* Sin tope de distancia: un bot en la esquina del mapa tiene que cruzarlo
     entero a por el Florín más cercano, que es lo que haría cualquiera. Con un
     radio de visión se quedaban plantados en su casa, porque desde ahí no se
     ve nada — las casas están a 2 000 px unas de otras. */
  let mejor: { x: number; y: number } | null = null;
  let bd = Infinity;

  // 2. lo que hay tirado en el suelo: es lo más barato de conseguir
  for (const g of e.ground) {
    if (g.espera && g.espera > 0) continue;
    const d = dist2(p.x, p.y, g.x, g.y);
    if (d < bd) { bd = d; mejor = { x: g.x, y: g.y }; }
  }

  // 3. el desfile, que pasa solo y no es de nadie
  for (const d0 of e.portal.desfile) {
    const d = dist2(p.x, p.y, d0.x, d0.y);
    if (d < bd) { bd = d; mejor = { x: d0.x, y: d0.y }; }
  }

  // 4. y si no, a robarle a alguien
  for (const b of e.bases) {
    if (esMiPatio(p, b)) continue;
    for (const ped of b.peds) {
      if (!ped.florin) continue;
      const d = dist2(p.x, p.y, ped.x, ped.y);
      if (d < bd) { bd = d; mejor = { x: ped.x, y: ped.y }; }
    }
  }
  /* Si no queda nada que robar, al centro: por ahí pasa el desfile y están la
     Armería y la Ruleta. El desvío por jugador evita que los cuatro terminen
     amontonados en el mismo punto. */
  if (!mejor) {
    const c = centroDelMapa();
    const a = p.idx * 1.7;
    mejor = { x: c.cx + Math.cos(a) * 260, y: c.cy + Math.sin(a) * 200 };
  }
  return mejor;
}

/** Un paso de bot. Devuelve la entrada como si la hubiera tecleado alguien. */
export function pensarBot(e: Estado, p: Jugador, dt: number): PlanBot {
  if (p.stun > 0) return { entrada: QUIETO, usar: false, patear: null };

  /* En estos juegos la chancla no pinta nada y encima estorba… salvo en dos: en
     la LUCHA es media pelea, y en los DARDOS es el único precio de tomarse su
     tiempo apuntando. Sin ella, aguantar el pulso al máximo es un cincuenta
     gratis y el juego no tiene decisión. */
  const esJuego = !!(e.basquet || e.bolos || e.carreraObs || e.laberinto || e.billar || e.hockey);
  const tenis = e.reglas.modo === "tenis", voley = e.reglas.modo === "voley";
  const basquet = e.reglas.modo === "basquet", bolos = e.reglas.modo === "bolos";
  const hockey = e.reglas.modo === "hockey", dardos = e.reglas.modo === "dardos";
  const billar = e.reglas.modo === "billar";
  const taco = billar ? tacadaDelBot(e, p) : null;
  const puntoTaco = billar ? aDondeApuntaElTaquista(e, p) : null;
  const dardo = dardos ? tiroDelTirador(e, p) : null;
  const puntoDardo = dardos ? aDondeApuntaElTirador(e, p) : null;
  const zurdazo = hockey ? zurdazoDelBot(e, p) : null;
  const bolear = bolos ? tiroDelBolichero(e, p) : null;
  const puntoBolos = bolos ? aDondeApuntaElBolichero(e, p) : null;
  const raqueta = tenis ? golpeDelBot(e, p)
                : voley ? toqueDelBot(e, p)
                : basquet ? tiroDelBot(e, p)
                : zurdazo ? zurdazo.fuerza
                : dardo ?? taco ?? bolear;
  const enLucha = !!e.lucha || !!e.dardos;
  /* Y en los dardos, el que espera hostiga al que tira. */
  const aTirando = e.dardos && e.players.indexOf(p) !== e.dardos.turno
    ? e.players[e.dardos.turno] : null;
  const rivalEnLucha = enLucha ? e.players.find(q => q.idx !== p.idx) : aTirando;
  /* En la lucha la chancla es la mitad del juego: a uno aturdido se le empuja
     dos veces y media más. A 60 px solo se la tiraba pegado —o sea, casi
     nunca—, y contra un humano que sí la usaba desde lejos la pelea era 3-0 en
     siete segundos. Se la tira desde donde la tiraría cualquiera. */
  const blancoLucha = rivalEnLucha && dist2(p.x, p.y, rivalEnLucha.x, rivalEnLucha.y) < 260 * 260
    ? { x: rivalEnLucha.x, y: rivalEnLucha.y } : null;
  const blanco = tenis ? aDondeLaMando(e, p)
               : voley ? aDondeLaMandoEnVoley(e, p)
               : bolos ? puntoBolos
               : dardos ? puntoDardo
               : billar ? puntoTaco
               : hockey ? (zurdazo ? zurdazo.apunta : null)
               : enLucha ? blancoLucha : aQuienLeTiro(e, p);
  const usarLucha = enLucha && !!blancoLucha;
  const usar = !tenis && !voley && !esJuego && !!blanco && p.cd <= 0 && p.chancla.state === "held";

  /* La memoria, antes de decidir: el laberinto la usa para comprometerse con su
     gema, y sin ella creada no habría dónde apuntarlo. */
  const b = (p.bot ??= { x: p.x, y: p.y, repensar: 0 });
  b.repensar -= dt;
  /* En el partido se replantea casi cada frame: la pelota se mueve, y un bot
     que apunta a donde estaba hace medio segundo llega tarde a todo. */
  const llegó = dist2(p.x, p.y, b.x, b.y) < PEGADO * PEGADO ||
                (e.reglas.modo === "carrera" && b.repensar <= REPENSAR - 0.25) ||
                (e.reglas.modo === "carreraObs" && b.repensar <= REPENSAR - 0.12) ||
                (e.reglas.modo === "futbol" && b.repensar <= REPENSAR - 0.12) ||
                /* En el tenis, cada dos fotogramas: el sitio donde va a picar
                   cambia con cada bote y con cada golpe, y medio segundo tarde
                   es medio campo tarde. */
                (["tenis", "voley", "basquet", "hockey"].includes(e.reglas.modo) &&
                 b.repensar <= REPENSAR - 0.03);
  /* El laberinto NO se replantea rápido, aunque apetezca: el primer paso del
     camino más corto cambia según de qué lado del borde de la celda estés, así
     que replanteando cada poco el bot sube, baja, sube… y no se mueve del sitio.
     Medido: los dos jugadores clavados en la misma celda desde el segundo veinte
     hasta el final. Se replantea al LLEGAR al paso anterior, que es cuando
     estás en el centro de una celda y la respuesta es una sola. */
  if (b.repensar <= 0 || llegó) {
    const meta = aDondeVoy(e, p);
    b.repensar = REPENSAR;
    if (meta) { b.x = meta.x; b.y = meta.y; }
  }

  const dx = b.x - p.x, dy = b.y - p.y;
  const m = Math.hypot(dx, dy);
  /* Pegado al objetivo se planta: el aro tarda 0,55 s en llenarse y si sigue
     empujando se pasa de largo y vuelve a empezar. */
  const corriendo = e.reglas.modo === "carrera" || e.reglas.modo === "carreraObs" ||
                    e.reglas.modo === "laberinto";
  const mover = m < PEGADO && !corriendo
    ? { x: 0, y: 0 }
    /* El bamboleo evita la línea recta de robot. Sale del reloj y del número de
       jugador, así que sigue siendo reproducible. */
    : (() => {
        /* El bamboleo evita la línea recta de robot… salvo en el laberinto, que
           es todo pasillos de una celda: ahí desvía lo justo para no dar nunca
           con el centro de la celda, y el bot se queda orbitando la gema. */
        const vaivén = e.reglas.modo === "laberinto"
          ? 0 : Math.sin(e.t * 1.7 + p.idx * 2.1) * 0.18;
        const a = Math.atan2(dy, dx) + vaivén;
        return { x: Math.cos(a), y: Math.sin(a) };
      })();

  /* Lo rápido que va, según la dificultad. El motor respeta los vectores de
     módulo menor que 1 (solo normaliza los que se pasan), así que escalar aquí
     es escalar su velocidad, sin tocar el movimiento de nadie más. Es la
     palanca del problema medido: los bots le sacaban dos vueltas a un jugador
     en red. */
  const brío = e.reglas.modo === "carrera" ? dificultadDe(e.reglas).rivales
             : e.reglas.modo === "tenis" ? TENIS_BRIO
             : e.reglas.modo === "voley" ? VOLEY_BRIO
             /* En hockey corre un pelo menos que tú: la paleta llega a casi
                todo por geometría, y con la misma velocidad no le marcas. */
             : e.reglas.modo === "hockey" ? 0.82
             : e.bolos ? 0.8
             : e.dardos ? 0.7
             : e.laberinto ? 0.75
             : e.billar ? 0.6
             : e.hockey ? 0.85
             : 1;
  /* En los juegos con pelota, el bot patea cuando está cerca. */
  let kickForce: number | null = null;
  if (e.basquet || e.bolos || e.hockey || e.voley) {
    const balon = e.basquet ? e.trastos.find(t => t.id === e.basquet!.balon)
                : e.bolos ? e.trastos.find(t => t.id === e.bolos!.balon)
                : null;
    if (balon && dist2(p.x, p.y, balon.x, balon.y) < 80 * 80) {
      kickForce = 0.4 + Math.sin(e.t * 2.1 + p.idx * 1.7) * 0.3;
    }
  }

  return {
    entrada: { mover: { x: mover.x * brío, y: mover.y * brío }, apunta: blanco },
    usar: usar || !!usarLucha,
    patear: raqueta ?? kickForce,
  };
}
