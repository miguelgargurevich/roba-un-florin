/* Creación de la partida y consultas sobre el estado.
   Nada de esto dibuja ni suena: solo monta el mundo y responde preguntas. */

import type {
  Base, DesfileItem, Estado, Evento, Florin, Jugador, Laser, Pedestal, RefObjetivo,
  RefPed, Sonido, Variante,
} from "./tipos.js";
import {
  ESCENARIOS, FLORES, GOAL, LASER_CARGA, PATIOS_PRECIO, TIERS, VARIANTES,
  WORLD_H, WORLD_W, varMult,
} from "./datos.js";
import { azar, dist2, inRect, rnd } from "./util.js";

/* ---- eventos: el único canal hacia el mundo exterior ---- */
export const texto = (e: Estado, x: number, y: number, txt: string, color: string) =>
  e.eventos.push({ t: "texto", x, y, txt, color });
export const polvo = (e: Estado, x: number, y: number, color: string, n = 8) =>
  e.eventos.push({ t: "polvo", x, y, color, n });
export const sonar = (e: Estado, cual: Sonido) => e.eventos.push({ t: "sonido", cual });

/* ---- Florines ---- */
export const florAlAzar = (e: Estado) => (azar(e) * FLORES.length) | 0;

/** Único sitio donde nace un Florín: así nadie olvida darle su especie. */
export function nuevoFlorin(e: Estado, tier: number, extra?: Partial<Florin>): Florin {
  return { tier, variant: null, nombre: null, flor: florAlAzar(e), bob: 0, ...(extra || {}) };
}
/** Copia un Florín conservando lo que lo hace suyo: nombre, variante y especie. */
export function mismoFlorin<T extends object>(f: Florin, extra?: T): Florin & T {
  return {
    tier: f.tier, nombre: f.nombre || null, variant: f.variant || null,
    flor: f.flor | 0, bob: 0, ...(extra || {}),
  } as Florin & T;
}
export const florinIncome = (f: Florin) => TIERS[f.tier].income * varMult(f.variant);

/* ---- resolver ids ----
   El estado guarda ids y no objetos, para que se pueda serializar y mandar por
   la red. Estas funciones son el único sitio donde se traduce id → objeto. */
export const baseDe = (e: Estado, id: number): Base => e.bases[id];
export const jugadorDe = (e: Estado, idx: number | null): Jugador | null =>
  idx == null ? null : e.players[idx] || null;
export const pedDe = (e: Estado, r: RefPed | null): Pedestal | null =>
  r ? (e.bases[r.b]?.peds[r.i] || null) : null;
export const desfileDe = (e: Estado, id: number): DesfileItem | null =>
  e.portal.desfile.find(d => d.id === id) || null;
export const patiosDe = (e: Estado, p: Jugador): Base[] => p.patios.map(id => e.bases[id]);
/** El objetivo del aro: puede ser una vitrina o alguien del desfile. */
export function objetivoDe(e: Estado, r: RefObjetivo | null): Pedestal | DesfileItem | null {
  if (!r) return null;
  return r.tipo === "ped" ? pedDe(e, r) : desfileDe(e, r.id);
}
export const nuevoId = (e: Estado) => ++e.proximoId;

/* ---- consultas sobre bases y jugadores ---- */
export const freePed = (b: Base): Pedestal | null => b.peds.find(p => !p.florin) || null;
export const occupied = (b: Base): Pedestal[] => b.peds.filter(p => p.florin);

export function freePedDe(e: Estado, p: Jugador): Pedestal | null {
  for (const b of patiosDe(e, p)) { const ped = freePed(b); if (ped) return ped; }
  return null;
}
export function occupiedDe(e: Estado, p: Jugador): Pedestal[] {
  const out: Pedestal[] = [];
  for (const b of patiosDe(e, p)) for (const ped of b.peds) if (ped.florin) out.push(ped);
  return out;
}
export const esMiPatio = (p: Jugador, b: Base) => p.patios.indexOf(b.id) >= 0;

export function playerIncome(e: Estado, p: Jugador): number {
  return occupiedDe(e, p).reduce((s, q) => s + florinIncome(q.florin!), 0);
}

/* ---- láseres ---- */
export function ponerLaser(b: Base): void {
  b.laser = {
    activo: 0, recarga: 0, carga: 0, warn: 0,
    x: b.rect.x + 46, y: b.rect.y + b.rect.h - 42, r: 34,
  };
}
export const laserActivo = (b: Base) => !!(b.laser && b.laser.activo > 0);

/** ¿Este punto está dentro de un patio cerrado a cal y canto? */
export function bloqueadoPorLaser(e: Estado, x: number, y: number, quien: Jugador | null): Base | null {
  for (const b of e.bases) {
    if (!laserActivo(b)) continue;
    if (quien && b.owner === quien.idx) continue;
    if (inRect(x, y, b.rect, 6)) return b;
  }
  return null;
}

/* ---- el circuito del desfile ---- */
export function orbitaDelCentro(e: Estado) {
  const a = e.armeria;
  return { cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: 300, ry: 200 };
}
export const PORTAL_BAJADA = 0.26, PORTAL_ORBITA = 0.48;

/** Dónde está un Florín del desfile según lo avanzado de su recorrido (0 a 1). */
export function puntoDelDesfile(e: Estado, k: number) {
  const P = e.portal, o = orbitaDelCentro(e);
  const entrada = { x: o.cx, y: o.cy - o.ry };
  if (k < PORTAL_BAJADA) {
    const f = k / PORTAL_BAJADA;
    return { x: P.x + (entrada.x - P.x) * f, y: P.y + (entrada.y - P.y) * f };
  }
  if (k < PORTAL_BAJADA + PORTAL_ORBITA) {
    const f = (k - PORTAL_BAJADA) / PORTAL_ORBITA;
    const a = -1.5708 + f * 6.283;
    return { x: o.cx + Math.cos(a) * o.rx, y: o.cy + Math.sin(a) * o.ry };
  }
  const f = (k - PORTAL_BAJADA - PORTAL_ORBITA) / (1 - PORTAL_BAJADA - PORTAL_ORBITA);
  return { x: entrada.x + (P.x - entrada.x) * f, y: entrada.y + (P.y - entrada.y) * f };
}

/* ---- construcción del mundo ---- */
function makeBase(id: number, name: string, x: number, y: number,
                  isPlayer: boolean, color: string, who?: string | null): Base {
  const rect = { x, y, w: 380, h: 330 };
  const peds: Pedestal[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
    peds.push({ x: rect.x + 68 + c * 122, y: rect.y + 108 + r * 138, florin: null, pop: 0 });
  return {
    id, name, rect, peds, isPlayer, color, who: who || null,
    refill: 0, guard: null, locked: false, price: 0, warn: 0, laser: null, owner: null,
  };
}

function mkJugador(idx: number, base: Base, shirt: string, ammoIds: string[]): Jugador {
  const ammo: Record<string, number> = {};
  for (const id of ammoIds) ammo[id] = 0;
  return {
    idx, baseId: base.id, patios: [base.id], shirt,
    x: base.rect.x + base.rect.w / 2, y: base.rect.y + base.rect.h / 2,
    vx: 0, vy: 0, face: 1, walk: 0, dirx: 1, diry: 0,
    carry: null, stun: 0, boost: 0, invis: 0, escudo: 0, inmune: 0,
    money: 260, ammo, wsel: 0, cd: 0, inShop: false, inRuleta: false, fullWarn: 0,
    chancla: { state: "held", x: 0, y: 0, vx: 0, vy: 0, spin: 0, travel: 0 },
    grab: { ped: null, t: 0 },
    apunta: { on: false, wx: 0, wy: 0 },
    stats: { steals: 0, hits: 0, lost: 0, froze: 0 },
  };
}

export interface OpcionesPartida {
  modo?: 1 | 2;
  escenario?: string;
  semilla?: number;
  armas: string[];
}

export function crearPartida(op: OpcionesPartida): Estado {
  const mode: 1 | 2 = op.modo === 2 ? 2 : 1;
  const esc = ESCENARIOS.find(x => x.id === op.escenario) || ESCENARIOS[0];
  const semilla = op.semilla ?? 1;
  const C = esc.casas, P = esc.patios;

  const bases: Base[] = [
    makeBase(0, mode === 2 ? "Patio del J1" : "Tu patio", P[0][0], P[0][1], true, "#3DDC97"),
    makeBase(1, "Casa de Mayo", C[0][0], C[0][1], false, "#FFD84D", "mayo"),
    makeBase(2, "Doña Chancla", C[1][0], C[1][1], false, "#FF9EC4", "sobri"),
    makeBase(3, "Casa de la Prima Yuli", C[2][0], C[2][1], false, "#FF5C86", "yuli"),
    mode === 2
      ? makeBase(4, "Patio del J2", C[3][0], C[3][1], true, "#FFB020")
      : makeBase(4, "Nave de los Marcianos", C[3][0], C[3][1], false, "#8B6BEE", "marcia"),
  ];
  const patioJ2 = bases[4];

  if (mode === 1) {
    PATIOS_PRECIO.forEach((precio, k) => {
      const b = makeBase(5 + k, "Patio " + (k + 2), P[k + 1][0], P[k + 1][1], true, "#3DDC97");
      b.locked = true; b.price = precio;
      bases.push(b);
    });
  }

  const armeria = { x: WORLD_W / 2 - 150, y: 750, w: 300, h: 150 };
  const ruleta = { x: WORLD_W / 2 - 150, y: 1350, w: 300, h: 130 };
  const portal = { x: WORLD_W / 2, y: 240, r: 34, timer: 2.5, desfile: [] };

  const jugadores = [mkJugador(0, bases[0], "#3DDC97", op.armas)];
  if (mode === 2) jugadores.push(mkJugador(1, patioJ2, "#FFB020", op.armas));
  for (const p of jugadores) for (const id of p.patios) { bases[id].owner = p.idx; ponerLaser(bases[id]); }

  const e: Estado = {
    t: 0, mode, esc, semilla, rngEstado: semilla | 0,
    bases, players: jugadores, armeria, ruleta, portal,
    bolts: [], blasts: [], cascaras: [], perros: [], slowmo: 0,
    thieves: [], ground: [], thiefTimer: 14,
    girando: null, ultimoPremio: null,
    hito: GOAL, hitoN: 0, fiesta: 0, alarma: null,
    over: false, winnerIdx: null, proximoId: 0,
    eventos: [],
  };

  /* Florines iniciales de los vecinos y sus abuelas. Va después de crear el
     estado porque necesita el RNG, que vive en él. */
  for (const b of bases) {
    b.refill = rnd(e, 3, 7);
    if (b.isPlayer) continue;
    const n = 2 + ((azar(e) * 2) | 0);
    for (let i = 0; i < n; i++)
      b.peds[i].florin = nuevoFlorin(e, (azar(e) * 2) | 0, { bob: rnd(e, 0, 6.28) });
    b.guard = {
      baseId: b.id,
      x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2,
      vx: 0, vy: 0, stun: 0, frozen: 0, abducido: 0,
      wp: 0, face: 1, walk: 0, alert: 0, kx: 0, ky: 0,
      isGuard: true, carry: null,
    };
  }
  return e;
}

/* Reexportados por comodidad de quien consume el motor */
export { VARIANTES, TIERS, FLORES, GOAL, LASER_CARGA, WORLD_W, WORLD_H, dist2 };
export type { Variante, Evento };
