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
import { dist2 } from "./util.js";
import { ANCHO_PISTA, dificultadDe } from "./datos.js";
import { centroDelMapa, enLaPista, esMiPatio, freePedDe, patiosDe } from "./estado.js";

/** Lo que decide el bot en un paso: hacia dónde va y si tira la chancla. */
export interface PlanBot {
  entrada: EntradaJugador;
  usar: boolean;
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

/** A dónde va: lo que lleva pesa más que lo que podría llevarse. */
function aDondeVoy(e: Estado, p: Jugador): { x: number; y: number } | null {
  if (e.reglas.modo === "futbol") return aDondeVoyEnElPartido(e, p);
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
  if (p.stun > 0) return { entrada: QUIETO, usar: false };

  const blanco = aQuienLeTiro(e, p);
  const usar = !!blanco && p.cd <= 0 && p.chancla.state === "held";

  /* La meta se recuerda un rato. Recalculándola cada frame, dos Florines a la
     misma distancia lo dejaban temblando en el sitio sin ir a por ninguno. */
  const b = (p.bot ??= { x: p.x, y: p.y, repensar: 0 });
  b.repensar -= dt;
  /* En el partido se replantea casi cada frame: la pelota se mueve, y un bot
     que apunta a donde estaba hace medio segundo llega tarde a todo. */
  const llegó = dist2(p.x, p.y, b.x, b.y) < PEGADO * PEGADO ||
                (e.reglas.modo === "carrera" && b.repensar <= REPENSAR - 0.25) ||
                (e.reglas.modo === "futbol" && b.repensar <= REPENSAR - 0.12);
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
  const brío = e.reglas.modo === "carrera" ? dificultadDe(e.reglas).rivales : 1;
  return { entrada: { mover: { x: mover.x * brío, y: mover.y * brío }, apunta: blanco }, usar };
}
