/* Creación de la partida y consultas sobre el estado.
   Nada de esto dibuja ni suena: solo monta el mundo y responde preguntas. */

import type {
  Base, DesfileItem, Estado, Evento, Florin, Jugador, Laser, Pedestal, RefObjetivo,
  RefPed, Reglas, Sonido, Trasto, Variante,
} from "./tipos.js";
import {
  ESCENARIOS, FLORES, GOAL, LASER_CARGA, PATIOS_PRECIO, TIERS, TRASTOS_ESCENARIO,
  ANCHO_PISTA, CAJAS_EN_PISTA, VARIANTES, VEHICULOS, WORLD_H, WORLD_W, esVehiculo, varMult,
} from "./datos.js";
import { azar, clamp, dist2, inRect, rnd } from "./util.js";

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
export const trastoDe = (e: Estado, id: number | null): Trasto | null =>
  id == null ? null : e.trastos.find(x => x.id === id) || null;

/* ---- el mar ----
   Solo la playa lo tiene. A pie te frena en la orilla; con tabla o flotador se
   entra, y el agua pasa a ser un carril rápido por el sur del mapa. */
export const hayMar = (e: Estado) => e.esc.mar != null;
export const enElMar = (e: Estado, y: number) => e.esc.mar != null && y > e.esc.mar;

/** ¿Está sobre el puente? Ahí se pasa a pie, aunque debajo haya agua. */
export const enElPuente = (e: Estado, x: number) => {
  const p = e.esc.puente;
  return !!p && x > p.x && x < p.x + p.w;
};

/** ¿Puede este jugador estar en esa `y`, o el agua se lo impide? */
export function puedeMojarse(e: Estado, p: Jugador): boolean {
  const v = trastoDe(e, p.montado);
  return !!(v && VEHICULOS[v.tipo]?.agua);
}

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

/* ---- la escalera de hitos ----

   El hito es la VITRINA, no el dinero. Nivel 1 es tenerla llena; a partir de
   ahí sube con la rareza del PEOR Florín que tengas puesto, así que subir de
   nivel es cambiar el más flojo por uno mejor. Nunca se infla: dieciocho
   huecos son dieciocho huecos con 3/s y con 29 000/s. */
export const HITOS_MAX = TIERS.length;   // llena (1) + una por rareza a partir de Común

/** Nivel de vitrina AHORA MISMO. 0 = ni siquiera está llena. */
export function nivelDeVitrina(e: Estado, p: Jugador): number {
  const patios = patiosDe(e, p);
  const huecos = patios.reduce((s, b) => s + b.peds.length, 0);
  if (!huecos) return 0;
  const puestos = occupiedDe(e, p);
  if (puestos.length < huecos) return 0;
  const peor = Math.min(...puestos.map(q => q.florin!.tier));
  return 1 + peor;
}

/** Cuántos huecos tiene y cuántos llenos: lo que enseña la barra del HUD. */
export function vitrinaDe(e: Estado, p: Jugador) {
  const huecos = patiosDe(e, p).reduce((s, b) => s + b.peds.length, 0);
  const llenos = occupiedDe(e, p).length;
  return { huecos, llenos, nivel: nivelDeVitrina(e, p) };
}

/** Cómo se llama el hito de ese nivel. */
export function nombreDeHito(nivel: number): string {
  if (nivel <= 0) return "Llena tu vitrina";
  if (nivel === 1) return "¡Vitrina llena!";
  const T = TIERS[Math.min(nivel - 1, TIERS.length - 1)];
  return "¡Vitrina de " + T.rar + "!";
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

/* ---- el circuito del desfile ----

   Los Florines salen del portal de arriba, bajan al centro, hacen un ocho
   echado —un ∞— rodeando la Armería por la izquierda y la Ruleta por la
   derecha, y se van por el portal de abajo. El cruce del ocho cae justo en el
   centro del mapa, entre los dos puestos.

   La curva es una lemniscata de Gerono, que es la forma más simple de un ocho
   tumbado: x = A·cos t, y = (B/2)·sin 2t. Pasa por el origen en t = π/2 y en
   t = 3π/2, que es exactamente el cruce que se quiere. */
/* La pasarela crece con el mapa, pero a la mitad de su ritmo: proporcional se
   comía el centro entero, y fija se quedaba en una pista de baile perdida en un
   descampado. Con esto ocupa el 41 % del ancho (antes el 48 %), y el sitio que
   sobra alrededor es justo donde caben las casas nuevas. */
export const OCHO_A = Math.round(WORLD_W * 0.206), OCHO_B = Math.round(WORLD_H * 0.32);

export function centroDelMapa() {
  return { cx: WORLD_W / 2, cy: WORLD_H / 2 };
}

/** Un punto del ocho, con f de 0 a 1. Empieza y acaba en el cruce del centro.

   La lemniscata pasa por el cruce dos veces, en t = π/2 y en t = 3π/2, y las dos
   son el mismo punto del mapa. Así que arrancar en una o en otra sale por un
   lóbulo o por el otro, y el signo de `giro` decide en qué sentido se recorre:
   cuatro caminos distintos, los cuatro dando la vuelta entera y volviendo al
   cruce en f = 1. Eso es lo que se elige al entrar. */
export function puntoDelOcho(f: number, lado: 0 | 1 = 0, giro: 1 | -1 = 1) {
  const { cx, cy } = centroDelMapa();
  const t = Math.PI / 2 + lado * Math.PI + giro * f * Math.PI * 2;
  return { x: cx + OCHO_A * Math.cos(t), y: cy + (OCHO_B / 2) * Math.sin(2 * t) };
}

/* Lo que se lleva cada tramo del recorrido. La vuelta al ocho es lo que se
   quiere mirar, así que se lleva la mayor parte del tiempo. */
export const PORTAL_BAJADA = 0.16, PORTAL_OCHO = 0.68;

/** Dónde está un Florín del desfile según lo avanzado de su recorrido (0 a 1). */
export function puntoDelDesfile(e: Estado, k: number, lado: 0 | 1 = 0, giro: 1 | -1 = 1) {
  const P = e.portal, S = P.salida, { cx, cy } = centroDelMapa();
  if (k < PORTAL_BAJADA) {                       // bajada desde el portal de arriba
    const f = k / PORTAL_BAJADA;
    return { x: P.x + (cx - P.x) * f, y: P.y + (cy - P.y) * f };
  }
  if (k < PORTAL_BAJADA + PORTAL_OCHO) {         // el ocho
    return puntoDelOcho((k - PORTAL_BAJADA) / PORTAL_OCHO, lado, giro);
  }
  const f = (k - PORTAL_BAJADA - PORTAL_OCHO) / (1 - PORTAL_BAJADA - PORTAL_OCHO);
  return { x: cx + (S.x - cx) * f, y: cy + (S.y - cy) * f };   // salida por abajo
}

/* Se mantiene el nombre viejo porque el cliente lo usa para no sembrar decorado
   encima de la alfombra del desfile: ahora devuelve la caja que ocupa el ocho. */
export function orbitaDelCentro(e: Estado) {
  const { cx, cy } = centroDelMapa();
  return { cx, cy, rx: OCHO_A, ry: OCHO_B / 2 };
}

/* ---- reparto de trastos ----
   El motor no sabe de canteros ni de canchas (eso es decorado del cliente), así
   que solo esquiva lo que sí es suyo: las bases, la columna del centro y el
   agua. Si un adorno del cliente se solapa con una bici, mala suerte: la bici
   se dibuja encima y se sigue pudiendo montar. */
function sitioLibreTrasto(e: Estado, x: number, y: number, m: number): boolean {
  const choca = (r: { x: number; y: number; w: number; h: number }) =>
    x - m < r.x + r.w && x + m > r.x && y - m < r.y + r.h && y + m > r.y;
  for (const b of e.bases) if (choca({ x: b.rect.x - 20, y: b.rect.y - 20, w: b.rect.w + 40, h: b.rect.h + 40 })) return false;
  if (choca({ x: e.armeria.x - 30, y: e.armeria.y - 30, w: e.armeria.w + 60, h: e.armeria.h + 60 })) return false;
  if (choca({ x: e.ruleta.x - e.ruleta.r - 30, y: e.ruleta.y - e.ruleta.r - 30,
              w: (e.ruleta.r + 30) * 2, h: (e.ruleta.r + 30) * 2 })) return false;
  for (const P of [e.portal, e.portal.salida])
    if (choca({ x: P.x - 80, y: P.y - 80, w: 160, h: 160 })) return false;
  for (const otro of e.trastos) if (dist2(x, y, otro.x, otro.y) < 60 * 60) return false;
  return true;
}

function sembrarTrastos(e: Estado): void {
  const receta = TRASTOS_ESCENARIO[e.esc.id] || [];
  for (const { tipo, n } of receta) {
    const aguaOnly = VEHICULOS[tipo]?.agua;
    for (let k = 0; k < n; k++) {
      for (let intento = 0; intento < 40; intento++) {
        const x = rnd(e, 90, WORLD_W - 90);
        /* Lo que flota nace en la orilla, no mar adentro: si naciera dentro del
           agua sería inalcanzable, porque a pie el tope de la orilla te frena
           antes de llegar. */
        const y = e.esc.mar != null
          ? (aguaOnly ? rnd(e, e.esc.mar - 70, e.esc.mar - 10) : rnd(e, 90, e.esc.mar - 110))
          : rnd(e, 90, WORLD_H - 90);
        if (!sitioLibreTrasto(e, x, y, 34)) continue;
        e.trastos.push({
          id: nuevoId(e), tipo: tipo as Trasto["tipo"], x, y, vx: 0, vy: 0,
          montadoPor: null, pateadoPor: null,
          giro: rnd(e, -0.6, 0.6), variante: (azar(e) * 5) | 0,
        });
        break;
      }
    }
  }
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
    montado: null, trastoUsado: null,
    grab: { ped: null, t: 0 },
    apunta: { on: false, wx: 0, wy: 0 },
    stats: { steals: 0, hits: 0, lost: 0, froze: 0 },
    hitoN: 0, fiesta: 0,
  };
}

const clampEntero = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, Math.round(v) || a));

/* ---- los sitios de los jugadores ----
   El mapa no cambia: hay un patio y cuatro casas de vecinos. El primer jugador
   toma el patio; **cada jugador de más ocupa una casa vecina, y el bot que
   vivía ahí deja de existir**. Así una sala llena son 5 humanos y ningún bot,
   y jugar solo son 4 bots, sin mover una piedra del escenario.

   Los Marcianos van primeros a propósito: es el sitio que ya usaba el J2 del
   duelo de sofá, así que dos jugadores siguen empezando donde empezaban. */
const SLOTS: { casa: number | null; shirt: string }[] = [
  { casa: null, shirt: "#3DDC97" },
  { casa: 3,    shirt: "#FFB020" },
  { casa: 0,    shirt: "#FF5C86" },
  { casa: 1,    shirt: "#37D6E0" },
  { casa: 2,    shirt: "#B57BE0" },
];
export const JUGADORES_MAX = SLOTS.length;

export interface OpcionesPartida {
  /** cuántos humanos, de 1 a 5. Cada uno de más reemplaza a un bot. */
  jugadores?: number;
  escenario?: string;
  semilla?: number;
  armas: string[];
  /** Lo que no se diga, se rellena con lo de siempre (ver `reglasPara`). */
  reglas?: Partial<Reglas>;
}

/** Los valores por defecto dependen de cuántos sean: solo o acompañado. */
export function reglasPara(jugadores: number): Reglas {
  const solo = jugadores <= 1;
  return {
    // Los dos patios comprables están pegados al del primer jugador: con
    // compañía le darían una ventaja de salida que nadie más puede igualar.
    patiosExtra: solo,
    todasLasArmas: true,
    puestos: true,
    modo: "aventura",
    vecinos: true,
  };
}

export function crearPartida(op: OpcionesPartida): Estado {
  const n = clampEntero(op.jugadores ?? 1, 1, JUGADORES_MAX);
  const reglas: Reglas = { ...reglasPara(n), ...(op.reglas || {}) };
  const esc = ESCENARIOS.find(x => x.id === op.escenario) || ESCENARIOS[0];
  const semilla = op.semilla ?? 1;
  const C = esc.casas, P = esc.patios;

  /* Las bases se montan siempre igual y en el mismo orden: `baseDe` indexa por
     id, así que estos índices son un contrato y no se pueden reordenar. */
  const bases: Base[] = [
    makeBase(0, n > 1 ? "Patio del J1" : "Tu patio", P[0][0], P[0][1], true, "#3DDC97"),
    makeBase(1, "Casa de Mayo", C[0][0], C[0][1], false, "#FFD84D", "mayo"),
    makeBase(2, "Doña Chancla", C[1][0], C[1][1], false, "#FF9EC4", "sobri"),
    makeBase(3, "Casa de la Prima Yuli", C[2][0], C[2][1], false, "#FF5C86", "yuli"),
    makeBase(4, "Nave de los Marcianos", C[3][0], C[3][1], false, "#8B6BEE", "marcia"),
  ];

  if (reglas.patiosExtra) {
    PATIOS_PRECIO.forEach((precio, k) => {
      const b = makeBase(5 + k, "Patio " + (k + 2), P[k + 1][0], P[k + 1][1], true, "#3DDC97");
      b.locked = true; b.price = precio;
      bases.push(b);
    });
  }

  /* Cada jugador de más se queda con su casa: deja de ser de un vecino (`who`
     a null, que es lo que mira spawnThief para saber de dónde salen ladrones) y
     pasa a ser un patio con su color. */
  const jugadores: Jugador[] = [];
  for (let i = 0; i < n; i++) {
    const slot = SLOTS[i];
    const base = slot.casa == null ? bases[0] : bases[slot.casa + 1];
    if (slot.casa != null) {
      base.name = "Patio del J" + (i + 1);
      base.isPlayer = true;
      base.who = null;
      base.color = slot.shirt;
    }
    jugadores.push(mkJugador(i, base, slot.shirt, op.armas));
  }
  for (const p of jugadores) for (const id of p.patios) { bases[id].owner = p.idx; ponerLaser(bases[id]); }

  /* Los dos puestos van al centro, uno a cada lado del cruce del ocho: la
     Armería a la izquierda y la Ruleta a la derecha. El desfile les da la
     vuelta a los dos, así que el centro del mapa es de verdad el centro. */
  const { cx, cy } = centroDelMapa();
  const armeria = { x: cx - 450, y: cy - 75, w: 300, h: 150 };
  const ruleta = { x: cx + 300, y: cy, r: 92 };
  /* El portal de salida se aparta de la orilla. Con el margen fijo de siempre
     medido desde abajo acababa dentro del agua en cuanto el mapa creció —el mar
     va en fracción del alto y el margen no—, y los Florines del desfile salían
     nadando mar adentro, donde no los alcanza nadie. */
  const finca = esc.mar != null ? esc.mar - 90 : WORLD_H - 240;
  const portal = {
    x: cx, y: 240, r: 34, timer: 2.5, desfile: [],
    salida: { x: cx, y: Math.min(WORLD_H - 240, finca), r: 34 },
  };

  const e: Estado = {
    t: 0, reglas, esc, semilla, rngEstado: semilla | 0,
    bases, players: jugadores, armeria, ruleta, portal,
    bolts: [], blasts: [], cascaras: [], trastos: [], perros: [], slowmo: 0,
    thieves: [], ground: [], thiefTimer: 14,
    girando: null, ultimoPremio: null, cajas: [],
    alarma: null,
    over: false, winnerIdx: null, proximoId: 0,
    eventos: [],
  };

  /* Florines iniciales de los vecinos y sus abuelas. Va después de crear el
     estado porque necesita el RNG, que vive en él. */
  for (const b of bases) {
    b.refill = rnd(e, 3, 7);
    if (b.isPlayer) continue;
    // en carrera las casas son decorado: ni Florines que robar ni abuela que huir
    if (!reglas.vecinos) continue;
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

  sembrarTrastos(e);       // después de las bases: necesita saber dónde no caben
  if (reglas.modo === "carrera") aLaLineaDeSalida(e);
  return e;
}

/* ---- la parrilla ----
   Una carrera empieza distinta: todos en la línea, montados y mirando hacia el
   primer punto de paso. Si cada uno saliera de su patio ganaría el que lo
   tuviera más cerca, antes de empezar. */
function aLaLineaDeSalida(e: Estado): void {
  const c = e.esc.circuito;
  if (!c || !c.length) return;

  const [mx, my] = c[0];
  const [sx, sy] = c[1] || c[0];
  const ang = Math.atan2(sy - my, sx - mx);
  /* En fila de a dos y hacia atrás, como una parrilla: perpendicular al rumbo
     para el hueco de al lado, y en contra para la fila siguiente. */
  const lx = Math.cos(ang + Math.PI / 2), ly = Math.sin(ang + Math.PI / 2);
  const ax = -Math.cos(ang), ay = -Math.sin(ang);

  /* Las cajas: repartidas por la pista, siempre en el mismo sitio y en el eje
     del asfalto, para que se pueda pasar por ellas a propósito y no de rebote. */
  e.cajas = [];
  for (let k = 0; k < CAJAS_EN_PISTA; k++) {
    const f = ((k + 0.5) / CAJAS_EN_PISTA) * c.length;
    const i = Math.floor(f) % c.length, t = f - Math.floor(f);
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    e.cajas.push({
      id: nuevoId(e),
      x: Math.round(ax + (bx - ax) * t),
      y: Math.round(ay + (by - ay) * t),
      listo: 0,
    });
  }

  e.players.forEach((p, i) => {
    const fila = i >> 1, lado = i % 2 ? 1 : -1;
    p.x = clamp(mx + lx * lado * 58 + ax * fila * 90, 40, WORLD_W - 40);
    p.y = clamp(my + ly * lado * 58 + ay * fila * 90, 40, WORLD_H - 40);
    p.vx = 0; p.vy = 0;
    p.face = Math.cos(ang) >= 0 ? 1 : -1;
    p.carrera = { vuelta: 0, hito: 1, fin: -1 };
    p.item = { que: null, girando: 0 };

    darleVehiculo(e, p, p.vehiculo || vehiculoDelSitio(e), i);
  });
}

/* ---- los topes de la pista ----
   Una carrera en la que puedes cortar campo a través no es una carrera: se va
   en línea recta de punto a punto y el trazado da igual. Así que fuera del
   asfalto hay tope y no se pasa.

   El corredor se empuja al borde del corredor más cercano en vez de frenarlo
   en seco: chocar contra un muro y quedarte pegado es lo más frustrante que
   hay, y rozándolo se sigue avanzando. */
function alSegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const largo = dx * dx + dy * dy;
  const t = largo ? clamp(((px - ax) * dx + (py - ay) * dy) / largo, 0, 1) : 0;
  const cx = ax + dx * t, cy = ay + dy * t;
  return { d2: (px - cx) ** 2 + (py - cy) ** 2, cx, cy };
}

/** Devuelve el punto de la pista más cercano y a qué distancia está. */
export function enLaPista(e: Estado, x: number, y: number) {
  const c = e.esc.circuito!;
  let mejor = { d2: Infinity, cx: x, cy: y };
  for (let i = 0; i < c.length; i++) {
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    const q = alSegmento(x, y, ax, ay, bx, by);
    if (q.d2 < mejor.d2) mejor = q;
  }
  return mejor;
}

/** Empuja a quien se salga de la pista. Solo en carrera y solo si hay pista. */
export function dentroDeLaPista(e: Estado, p: { x: number; y: number; vx: number; vy: number }): boolean {
  if (e.reglas.modo !== "carrera" || !e.esc.circuito?.length) return true;
  const borde = ANCHO_PISTA / 2;
  const q = enLaPista(e, p.x, p.y);
  if (q.d2 <= borde * borde) return true;
  const d = Math.sqrt(q.d2) || 1;
  p.x = q.cx + (p.x - q.cx) / d * borde;
  p.y = q.cy + (p.y - q.cy) / d * borde;
  /* Se le quita la velocidad que iba HACIA fuera y se le deja la que va a lo
     largo: así rozar el tope frena un poco pero no te clava. */
  const nx = (p.x - q.cx) / borde, ny = (p.y - q.cy) / borde;
  const haciaFuera = p.vx * nx + p.vy * ny;
  if (haciaFuera > 0) { p.vx -= nx * haciaFuera; p.vy -= ny * haciaFuera; }
  return false;
}

/** Con qué se corre aquí si nadie eligió: lo primero montable del escenario,
    pero nunca uno de agua.

    Los circuitos van todos por tierra —los de costa se recortan por encima de
    la orilla—, y un vehículo de agua fuera del agua no te lleva, lo llevas tú:
    penaliza a 0,9×, más lento que ir a pie. En La Playa salía por defecto la
    tabla de surf y en El Amazonas la balsa, así que las dos carreras se corrían
    con el trasto a cuestas: 118 s y 109 s frente a los 48-87 s del resto, con
    la misma vuelta que Machu Picchu, que tarda 74 s. */
export const vehiculoDelSitio = (e: Estado): string => {
  const hay = (TRASTOS_ESCENARIO[e.esc.id] || []).map(t => t.tipo).filter(esVehiculo);
  return hay.find(t => !VEHICULOS[t]?.agua) || "bici";
};

/** Le pone (o le cambia) el vehículo a alguien, ahí donde esté.

    Se crea aparte de los que hay sueltos por el mapa: en una carrera nadie
    empieza a pie, y el que elige ovni tiene que salir en ovni aunque en ese
    escenario no haya ninguno tirado. */
export function darleVehiculo(e: Estado, p: Jugador, tipo: string, variante = 0): void {
  if (!VEHICULOS[tipo]) return;
  const viejo = e.trastos.findIndex(v => v.id === p.montado);
  if (viejo >= 0) e.trastos.splice(viejo, 1);
  const v: Trasto = {
    id: nuevoId(e), tipo: tipo as Trasto["tipo"], x: p.x, y: p.y, vx: 0, vy: 0,
    montadoPor: p.idx, pateadoPor: null, giro: 0, variante,
  };
  e.trastos.push(v);
  p.montado = v.id;
  p.vehiculo = tipo;
}

/* Reexportados por comodidad de quien consume el motor */
export { VARIANTES, TIERS, FLORES, GOAL, LASER_CARGA, VEHICULOS, WORLD_W, WORLD_H, dist2 };
export type { Variante, Evento };
