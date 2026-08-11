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
import { centroDelMapa, enLaPista, esMiPatio, freePedDe, patiosDe } from "./estado.js";

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

/** A dónde va: lo que lleva pesa más que lo que podría llevarse. */
function aDondeVoy(e: Estado, p: Jugador): { x: number; y: number } | null {
  if (e.reglas.modo === "futbol") return aDondeVoyEnElPartido(e, p);
  if (e.reglas.modo === "tenis") return aDondeVoyEnElTenis(e, p);
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

  /* En el tenis no hay a quién chanclear: hay una pelota que devolver. */
  const tenis = e.reglas.modo === "tenis";
  const raqueta = tenis ? golpeDelBot(e, p) : null;
  const blanco = tenis ? aDondeLaMando(e, p) : aQuienLeTiro(e, p);
  const usar = !tenis && !!blanco && p.cd <= 0 && p.chancla.state === "held";

  /* La meta se recuerda un rato. Recalculándola cada frame, dos Florines a la
     misma distancia lo dejaban temblando en el sitio sin ir a por ninguno. */
  const b = (p.bot ??= { x: p.x, y: p.y, repensar: 0 });
  b.repensar -= dt;
  /* En el partido se replantea casi cada frame: la pelota se mueve, y un bot
     que apunta a donde estaba hace medio segundo llega tarde a todo. */
  const llegó = dist2(p.x, p.y, b.x, b.y) < PEGADO * PEGADO ||
                (e.reglas.modo === "carrera" && b.repensar <= REPENSAR - 0.25) ||
                (e.reglas.modo === "futbol" && b.repensar <= REPENSAR - 0.12) ||
                /* En el tenis, cada dos fotogramas: el sitio donde va a picar
                   cambia con cada bote y con cada golpe, y medio segundo tarde
                   es medio campo tarde. */
                (e.reglas.modo === "tenis" && b.repensar <= REPENSAR - 0.03);
  if (b.repensar <= 0 || llegó) {
    const meta = aDondeVoy(e, p);
    b.repensar = REPENSAR;
    if (meta) { b.x = meta.x; b.y = meta.y; }
  }

  const dx = b.x - p.x, dy = b.y - p.y;
  const m = Math.hypot(dx, dy);
  /* Pegado al objetivo se planta: el aro tarda 0,55 s en llenarse y si sigue
     empujando se pasa de largo y vuelve a empezar. */
  const corriendo = e.reglas.modo === "carrera";
  const mover = m < PEGADO && !corriendo
    ? { x: 0, y: 0 }
    /* El bamboleo evita la línea recta de robot. Sale del reloj y del número de
       jugador, así que sigue siendo reproducible. */
    : (() => {
        const a = Math.atan2(dy, dx) + Math.sin(e.t * 1.7 + p.idx * 2.1) * 0.18;
        return { x: Math.cos(a), y: Math.sin(a) };
      })();

  /* Lo rápido que va, según la dificultad. El motor respeta los vectores de
     módulo menor que 1 (solo normaliza los que se pasan), así que escalar aquí
     es escalar su velocidad, sin tocar el movimiento de nadie más. Es la
     palanca del problema medido: los bots le sacaban dos vueltas a un jugador
     en red. */
  const brío = e.reglas.modo === "carrera" ? dificultadDe(e.reglas).rivales
             : e.reglas.modo === "tenis" ? TENIS_BRIO : 1;
  return {
    entrada: { mover: { x: mover.x * brío, y: mover.y * brío }, apunta: blanco },
    usar,
    patear: raqueta,
  };
}
