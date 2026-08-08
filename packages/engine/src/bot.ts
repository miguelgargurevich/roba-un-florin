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
import { centroDelMapa, esMiPatio, freePedDe, patiosDe } from "./estado.js";

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

/** A dónde va: lo que lleva pesa más que lo que podría llevarse. */
function aDondeVoy(e: Estado, p: Jugador): { x: number; y: number } | null {
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
  const llegó = dist2(p.x, p.y, b.x, b.y) < PEGADO * PEGADO;
  if (b.repensar <= 0 || llegó) {
    const meta = aDondeVoy(e, p);
    b.repensar = REPENSAR;
    if (meta) { b.x = meta.x; b.y = meta.y; }
  }

  const dx = b.x - p.x, dy = b.y - p.y;
  const m = Math.hypot(dx, dy);
  /* Pegado al objetivo se planta: el aro tarda 0,55 s en llenarse y si sigue
     empujando se pasa de largo y vuelve a empezar. */
  const mover = m < PEGADO
    ? { x: 0, y: 0 }
    /* El bamboleo evita la línea recta de robot. Sale del reloj y del número de
       jugador, así que sigue siendo reproducible. */
    : (() => {
        const a = Math.atan2(dy, dx) + Math.sin(e.t * 1.7 + p.idx * 2.1) * 0.18;
        return { x: Math.cos(a), y: Math.sin(a) };
      })();

  return { entrada: { mover, apunta: blanco }, usar };
}
