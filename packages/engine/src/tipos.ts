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
  /** id del trasto que lleva debajo, o null si va a pie */
  montado: number | null;
  /** el último trasto tocado: una acción por visita, o te montas y desmontas
      en el mismo frame mientras sigues encima */
  trastoUsado: number | null;
  grab: { ped: RefObjetivo | null; t: number };
  apunta: { on: boolean; wx: number; wy: number };
  stats: Stats;
  /* Los hitos son de cada uno, y son de VITRINA, no de dinero: llenarla, y
     luego subirle la rareza. El dinero no sirve de vara — entre 54/s y
     522 000/s hay 174 000×, así que cualquier escalera de plata es eterna al
     empezar e instantánea al final. Dieciocho huecos son dieciocho huecos. */
  hitoN: number;
  /** cuenta atrás de la fiesta del último hito, para que el HUD la enseñe */
  fiesta: number;
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
  /** el de arriba: por aquí salen */
  x: number; y: number; r: number;
  timer: number;
  desfile: DesfileItem[];
  /** el de abajo: por aquí se van, tras hacer el ocho */
  salida: { x: number; y: number; r: number };
}

/** La Ruleta es un círculo de verdad, no una caja. */
export interface Circulo { x: number; y: number; r: number }

/* ---- trastos: lo del escenario con lo que se puede jugar ----
   Antes las bicis y las pelotas eran pintura sobre el suelo cacheado. En cuanto
   se mueven dejan de servir ahí y pasan a ser estado del motor, porque afectan
   al juego (velocidad) y porque en dos jugadores los dos tienen que ver la
   misma pelota rodar. */
export type TipoTrasto =
  // se montan
  | "bici" | "patineta" | "tabla" | "flotador" | "tablaArena"
  | "balsa" | "llama" | "camello"
  // se patean
  | "pelota" | "mata" | "coco" | "piedra";

export interface Trasto {
  id: number;
  tipo: TipoTrasto;
  x: number; y: number;
  /** solo lo usan los que ruedan; los vehículos siguen a quien los monta */
  vx: number; vy: number;
  /** idx del jugador que va encima, o null */
  montadoPor: number | null;
  /** quién le dio la última patada, para apuntarle el golpe */
  pateadoPor: number | null;
  /** para dibujarlo ladeado, o rodando */
  giro: number;
  /** color/aspecto, sorteado al nacer */
  variante: number;
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
  /** idx del jugador al que le están robando */
  victimaIdx: number;
  /** false mientras forcejea con la vitrina, true cuando ya se lo lleva */
  llevandose: boolean;
}

/* ---- Eventos: lo único que el motor le cuenta al mundo de afuera ---- */
export type Evento =
  | { t: "texto"; x: number; y: number; txt: string; color: string }
  | { t: "polvo"; x: number; y: number; color: string; n: number }
  | { t: "sonido"; cual: Sonido }
  | { t: "album"; tier: number; variant: Variante }
  | { t: "hito"; n: number; monto: number; jugador: number }
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
  /** y desde la que empieza el agua: a pie te frena en la orilla, y con tabla
      o flotador se puede entrar. La playa, el río del Amazonas, el puerto de
      Nueva York. */
  mar?: number;
  /** un paso franco sobre el agua, entre x y x+w. El puente de Brooklyn se
      cruza andando: si no, sería un dibujo bonito y nada más. */
  puente?: { x: number; w: number };
}

/* Lo que antes decidía `mode: 1 | 2`. Separado, porque eran cuatro reglas
   distintas metidas en un número: una sala de amigos quiere todas las armas y
   los puestos abiertos (como el modo solo) pero sin patios comprables (como el
   duelo), y con `mode` esa combinación no se podía expresar. */
export interface Reglas {
  /** los 2 patios comprables del suroeste */
  patiosExtra: boolean;
  /** todas las armas, o solo la chancla */
  todasLasArmas: boolean;
  /** Armería y Ruleta abiertas */
  puestos: boolean;
  /* aventura: sin fin, cada uno con sus hitos.
     versus:   gana el primero que llena todos sus patios. */
  modo: "aventura" | "versus";
}

export interface Estado {
  t: number;
  reglas: Reglas;
  esc: Escenario;
  semilla: number;
  rngEstado: number;

  bases: Base[];
  players: Jugador[];
  armeria: Rect;
  ruleta: Circulo;
  portal: Portal;

  bolts: Bala[];
  blasts: Rafaga[];
  cascaras: Cascara[];
  trastos: Trasto[];
  perros: Perro[];
  slowmo: number;
  thieves: Ladron[];
  ground: FlorinSuelo[];
  thiefTimer: number;

  girando: Girando | null;
  ultimoPremio: Premio | null;

  alarma: Alarma | null;

  over: boolean;
  winnerIdx: number | null;
  /** contador para los ids de ladrones y del desfile */
  proximoId: number;

  /** Se vacía en cada tick: el anfitrión lo consume para pintar y sonar. */
  eventos: Evento[];
}
