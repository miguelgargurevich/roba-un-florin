/* Tipos del motor.
   Regla de oro de este paquete: aquí NO entra nada del navegador. Ni canvas, ni
   DOM, ni audio, ni localStorage, ni Math.random. Todo lo que el jugador ve o
   escucha sale como `Evento` y lo interpreta quien renderice. */

export type Variante = "brillante" | "arcoiris" | "fantasma" | "dorado" | null;

/** Un Florín. `flor` es la especie (forma), `tier` la rareza (colores y valor). */
export interface Florin {
  tier: number;
  variant: Variante;
  nombre: string | null;
  flor: number;
  bob: number;
}

/** Un Florín tirado en el suelo: es un Florín con posición propia. */
export interface FlorinSuelo extends Florin {
  x: number;
  y: number;
  t: number;
}

/** Sitio donde se expone un Florín dentro de una base. */
export interface Pedestal {
  x: number;
  y: number;
  florin: Florin | null;
  pop: number;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface Laser {
  activo: number;
  recarga: number;
  carga: number;
  x: number;
  y: number;
  r: number;
  warn: number;
}

export interface Abuela {
  baseId: number;
  x: number; y: number;
  vx: number; vy: number;
  stun: number; frozen: number;
  abducido: number;
  wp: number; face: number; walk: number;
  alert: number;
  kx: number; ky: number;
  isGuard: boolean;
  carry: Florin | null;
}

/** Una casa del barrio: la tuya (patio) o la de un vecino. */
export interface Base {
  id: number;
  name: string;
  rect: Rect;
  peds: Pedestal[];
  isPlayer: boolean;
  color: string;
  who: string | null;
  refill: number;
  guard: Abuela | null;
  locked: boolean;
  price: number;
  warn: number;
  laser: Laser | null;
  /** idx del jugador dueño, o null si es de un vecino o está en venta */
  owner: number | null;
}

export interface Chancla {
  state: "held" | "out" | "back";
  x: number; y: number;
  vx: number; vy: number;
  spin: number; travel: number;
}

export interface Stats { steals: number; hits: number; lost: number; froze: number }

/** Cómo se apunta a un pedestal concreto sin guardar el objeto. */
export interface RefPed { b: number; i: number }
/** A lo que el jugador le está haciendo el aro: una vitrina o alguien del desfile. */
export type RefObjetivo =
  | { tipo: "ped"; b: number; i: number }
  | { tipo: "desfile"; id: number };

export interface Jugador {
  idx: number;
  /** id de su patio de salida */
  baseId: number;
  /** ids de todos sus patios */
  patios: number[];
  shirt: string;
  x: number; y: number;
  vx: number; vy: number;
  face: number; walk: number;
  dirx: number; diry: number;
  carry: Florin | null;
  stun: number; boost: number; invis: number;
  escudo: number; inmune: number;
  money: number;
  ammo: Record<string, number>;
  wsel: number;
  cd: number;
  inShop: boolean;
  inRuleta: boolean;
  fullWarn: number;
  chancla: Chancla;
  grab: { ped: RefObjetivo | null; t: number };
  apunta: { on: boolean; wx: number; wy: number };
  stats: Stats;
}

export interface Ladron {
  id: number;
  x: number; y: number;
  homeId: number;
  victimId: number;
  state: "go" | "grab" | "back" | "flee";
  target: RefPed | null;
  carry: Florin | null;
  stun: number; frozen: number; abducido: number;
  kx: number; ky: number;
  grabT: number;
  spd: number; walk: number; face: number;
  salto: number; saltoT: number;
  who: string;
  isGuard: boolean;
}

/** Un Florín desfilando por el circuito del portal. */
export interface DesfileItem {
  id: number;
  florin: Florin;
  k: number;
  x: number; y: number;
  face: number;
  pop: number;
  esDesfile: true;
}

export interface Portal {
  x: number; y: number; r: number;
  timer: number;
  desfile: DesfileItem[];
}

export interface Cascara { x: number; y: number; duenoIdx: number | null; t: number }

export interface Perro {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  duenoIdx: number;
  face: number; walk: number;
  presaId: number | null;
  muerde: number;
}

export interface Bala { x: number; y: number; vx: number; vy: number; life: number; ownerIdx: number | null }
export interface Rafaga { x: number; y: number; ang?: number; life: number; kind: "cone" | "ring"; r?: number }

export type Premio =
  | { kind: "florin"; tier: number; variant: Variante; sorpresa?: boolean }
  | { kind: "dinero"; monto: number }
  | { kind: "arma"; arma: number };

export interface Girando { t: number; dur: number; premio: Premio; jugadorIdx: number }

export interface Alarma {
  quien: string; color: string; patio: string;
  x: number; y: number;
  pip: number;
  resto?: number;
}

/* ---- Eventos: lo único que el motor le cuenta al mundo de afuera ---- */
export type Evento =
  | { t: "texto"; x: number; y: number; txt: string; color: string }
  | { t: "polvo"; x: number; y: number; color: string; n: number }
  | { t: "sonido"; cual: Sonido }
  | { t: "album"; tier: number; variant: Variante }
  | { t: "hito"; n: number; monto: number }
  | { t: "fin"; ganador: number | null };

export type Sonido =
  | "throw" | "whack" | "grab" | "place" | "buy" | "ouch" | "lost" | "win" | "alarma";

/** Lo que el anfitrión (teclado, joystick, red…) le pasa al motor cada tick. */
export interface EntradaJugador {
  /** dirección de movimiento, ya normalizada o no: el motor la normaliza */
  mover: { x: number; y: number };
  /** hacia dónde apunta el arma en coordenadas del mundo, o null para usar el rumbo */
  apunta: { x: number; y: number } | null;
}

export interface Escenario {
  id: string;
  nombre: string;
  casas: [number, number][];
  patios: [number, number][];
}

export interface Estado {
  t: number;
  mode: 1 | 2;
  esc: Escenario;
  semilla: number;
  rngEstado: number;

  bases: Base[];
  players: Jugador[];
  armeria: Rect;
  ruleta: Rect;
  portal: Portal;

  bolts: Bala[];
  blasts: Rafaga[];
  cascaras: Cascara[];
  perros: Perro[];
  slowmo: number;
  thieves: Ladron[];
  ground: FlorinSuelo[];
  thiefTimer: number;

  girando: Girando | null;
  ultimoPremio: Premio | null;

  hito: number;
  hitoN: number;
  fiesta: number;
  alarma: Alarma | null;

  over: boolean;
  winnerIdx: number | null;
  /** contador para los ids de ladrones y del desfile */
  proximoId: number;

  /** Se vacía en cada tick: el anfitrión lo consume para pintar y sonar. */
  eventos: Evento[];
}
