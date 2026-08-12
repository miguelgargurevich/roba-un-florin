/* Tipos del motor.
   Regla de oro de este paquete: aquí NO entra nada del navegador. Ni canvas, ni
   DOM, ni audio, ni localStorage, ni Math.random. Todo lo que el jugador ve o
   escucha sale como `Evento` y lo interpreta quien renderice. */

import type { Dificultad } from "./datos.js";
export type { Dificultad };

export type Variante = "brillante" | "arcoiris" | "fantasma" | "dorado"
                     | "cristal" | "lava" | "galaxia" | null;

/** Un Florín. `flor` es la especie (forma), `tier` la rareza (colores y valor). */
export interface Florin {
  /** solo en los del suelo: segundos que faltan para poder recogerlo */
  espera?: number;
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
  /** solo los asientos que juega la máquina: a dónde iba y cuándo repensarlo */
  bot?: { x: number; y: number; repensar: number };
  /** Cómo se llama, cuando no es "J2": los vecinos que juegan solos llevan el
      nombre del que vive en esa casa. */
  apodo?: string;
  /** En fútbol, de qué equipo eres: 0 los de casa, 1 los de fuera. */
  equipo?: 0 | 1;
  /** en carrera: lo que llevas en la mano. `girando` son los segundos que le
      quedan a la ruleta de la caja antes de parar en algo. */
  item?: { que: string | null; girando: number };
  /** en carrera, con qué sale a la pista. Sin esto, lo que toque en el sitio. */
  vehiculo?: string;
  /** solo en carrera: vuelta, siguiente punto de paso, y en qué segundo cruzó
      la meta (-1 mientras corre) */
  carrera?: { vuelta: number; hito: number; fin: number };
  money: number;
  ammo: Record<string, number>;
  wsel: number;
  cd: number;
  inShop: boolean;
  inRuleta: boolean;
  /** ¿está dentro de la Fusionadora? */
  inFusion: boolean;
  /** En qué sitio de minijuego está parado, o null si en ninguno. */
  enSitio: JuegoDeSitio | null;
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
  /** cuánto le queda de paseo, de 0 a 1; al llegar a 1 se vuelve al portal */
  k: number;
  x: number; y: number;
  /** Por dónde tira al llegar al cruce del ocho. `lado` elige el lóbulo con el
      que empieza y `giro` el sentido en que lo recorre: cuatro caminos, y todos
      dan la vuelta entera al ∞ y salen por el portal de abajo. */
  lado: 0 | 1;
  giro: 1 | -1;
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
  | "balsa" | "llama" | "camello" | "carrito" | "vagoneta" | "dino"
  | "caballo" | "carroRomano" | "carabela"
  | "motonieve" | "elefante" | "chocon" | "hoverboard"
  // los especiales: no se encuentran tirados, se ganan o se compran
  | "ovni" | "chancla" | "condor" | "amaru" | "dragon" | "monster" | "grua"
  | "trineo" | "alfombra"
  // se patean
  | "pelota" | "mata" | "coco" | "piedra" | "dado" | "caparazon"
  | "ladrillo" | "barril" | "anfora" | "cofre"
  | "bolaNieve" | "banano" | "algodon" | "tuerca";

export interface Trasto {
  id: number;
  tipo: TipoTrasto;
  x: number; y: number;
  /** Solo la pelota del partido: a qué altura va y a qué velocidad sube. Sin
      esto no hay centros ni cabezazos, porque todo pasa a ras de suelo. */
  z?: number; vz?: number;
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
  | { kind: "arma"; arma: number }
  | { kind: "vehiculo"; tipo: string };

/** Una caja de ítem en la pista. `listo` son los segundos que tarda en volver
    después de que alguien la reviente. */
export interface CajaItem { id: number; x: number; y: number; listo: number }

export interface Girando { t: number; dur: number; premio: Premio; jugadorIdx: number }

/** Qué se juega en un sitio del mundo. */
export type JuegoDeSitio =
  | "futbol" | "tenis" | "basquet" | "bolos" | "lucha"
  | "dardos" | "voley" | "carreraObs" | "laberinto" | "billar" | "hockey";

/** Un sitio del mundo con su minijuego: dónde está y a qué se juega. */
export interface SitioDeJuego {
  juego: JuegoDeSitio;
  rect: Rect;
  /** Cómo se llama en el cartel: "LA PICHANGA", "LA CANCHA DE TENIS". */
  rotulo: string;
}

/** Un partido: la cancha, los dos arcos, el marcador y el reloj.

    La pelota NO vive aquí: es un trasto como los demás —se patea con el mismo
    código que una pelota tirada en el patio del colegio— y aquí solo se guarda
    cuál de todos es la del partido. */
export interface Futbol {
  cancha: Rect;
  /** El arco de cada equipo: el 0 defiende `arcos[0]`. */
  arcos: [Rect, Rect];
  balon: number;
  goles: [number, number];
  /** Segundos que le quedan al partido. */
  reloj: number;
  /** Cuenta atrás del saque: mientras corre, la pelota no se mueve. */
  saque: number;
  /** Quién acaba de marcar, para que el cliente lo celebre. */
  ultimoGol: 0 | 1 | null;
  /** Cuántos goles hacen falta para ganar antes de que se acabe el reloj. */
  meta: number;
  ganador: 0 | 1 | null;
}

/** Un partido de tenis: la cancha, la red, el marcador y de quién es el saque.

    Igual que en el fútbol, la pelota NO vive aquí: es un trasto con altura
    (`z`, `vz`) —la misma que hizo posibles los centros— y aquí solo se guarda
    cuál de todos es la del partido.

    Lo que el tenis añade y el fútbol no tenía es MEMORIA del punto: quién le
    dio el último y cuántas veces ha botado desde entonces. De esas dos cosas
    salen todas las reglas — que bote dos veces en tu campo, que se te vaya
    fuera, que la mandes a la red. */
export interface Tenis {
  cancha: Rect;
  /** La x de la red: parte la cancha en dos mitades, la 0 a la izquierda. */
  redX: number;
  /** Lo alto que es la red, en las mismas unidades que la altura de la pelota. */
  redAlto: number;
  balon: number;
  puntos: [number, number];
  /** Puntos para ganar. */
  meta: number;
  /** Segundos hasta el saque. Mientras corre, la pelota espera en la mano. */
  saque: number;
  sacador: 0 | 1;
  /** Quién le dio el último golpe: de él es la culpa si se va fuera o a la red. */
  ultimoToque: 0 | 1 | null;
  /** Botes en el suelo desde el último golpe, y en qué mitad botó. */
  botes: number;
  ladoDelBote: 0 | 1 | null;
  /** El último punto, para que el cliente lo cante: quién y por qué. */
  ultimoPunto: { equipo: 0 | 1; motivo: string } | null;
  ganador: 0 | 1 | null;
}

/* ---- Básquet ---- */
export interface Basquet {
  cancha: Rect;
  aros: [Rect, Rect];
  balon: number;
  puntos: [number, number];
  meta: number;
  reloj: number;
  saque: number;
  ganador: 0 | 1 | null;
}

/* ---- Bolos ---- */
export interface Bolos {
  pista: Rect;
  pinLugar: { x: number; y: number }[];
  pins: boolean[];
  balon: number;
  turno: number;
  tiradas: number;
  totalTiradas: number;
  puntos: number[];
  frames: number;
  meta: number;
  ganador: number | null;
}

/* ---- Lucha / Boxeo ---- */
export interface Lucha {
  ring: Rect;
  puntos: [number, number];
  meta: number;
  reloj: number;
  ganador: 0 | 1 | null;
}

/* ---- Dardos ---- */
export interface Dardos {
  tablero: { x: number; y: number; r: number };
  dardos: { x: number; y: number; dueño: number }[];
  turno: number;
  puntos: [number, number];
  meta: number;
  ganador: 0 | 1 | null;
}

/* ---- Carrera de obstáculos ---- */
export interface CarreraObs {
  trazado: { x: number; y: number }[];
  ancho: number;
  obstaculos: { x: number; y: number; w: number; h: number }[];
  checkpoints: number;
  vueltas: number;
  jugadores: { vuelta: number; checkpoint: number; fin: number }[];
  ganador: number | null;
}

/* ---- Laberinto / Pac-Man ---- */
export interface Laberinto {
  celdas: boolean[][];
  ancho: number;
  alto: number;
  gemas: { x: number; y: number }[];
  fantasma: { x: number; y: number; vx: number; vy: number; timer: number };
  recolectadas: number;
  totalGemas: number;
  ganador: number | null;
}

/* ---- Billar ---- */
export interface Billar {
  mesa: Rect;
  bolas: { x: number; y: number; vx: number; vy: number; color: number; hoya: boolean }[];
  turno: number;
  foul: boolean;
  puntos: [number, number];
  ganador: 0 | 1 | null;
}

/* ---- Air Hockey ---- */
export interface Hockey {
  mesa: Rect;
  porteros: [Rect, Rect];
  puck: { x: number; y: number; vx: number; vy: number };
  puntos: [number, number];
  meta: number;
  ganador: 0 | 1 | null;
}

/** Un partido de vóley. Es el esqueleto del tenis con una regla cambiada y
    otra añadida, y de ahí sale todo lo demás:

    - **la pelota NO puede tocar el suelo**. En tenis un bote es legal; aquí el
      suelo es el punto. Eso es lo que obliga a jugarla en el aire.
    - **tres toques por lado**. Con uno solo esto sería tenis sin botes; los
      tres son lo que convierte el punto en «levantar, colocar, rematar».

    Estaba escrito como un juego de perfil —gravedad hacia abajo en `y`, red
    horizontal, la pelota cayendo al borde de abajo—, dentro de un juego que se
    ve DESDE ARRIBA. Ahora la altura va donde va la de todos: en la `z` del
    trasto, la misma que trajo el fútbol y que usa el tenis. */
export interface Voley {
  cancha: Rect;
  /** La x de la red: parte la cancha en dos mitades, la 0 a la izquierda. */
  redX: number;
  redAlto: number;
  balon: number;
  puntos: [number, number];
  meta: number;
  saque: number;
  sacador: 0 | 1;
  /** Quién tocó el último y cuántas veces lleva ese lado. */
  ultimoToque: 0 | 1 | null;
  toques: number;
  /** ¿Ya va camino del otro lado? Entonces deja de ser del lado que la mandó.
      Sin esto, el que saca puede volver a darle a su propio saque mientras
      cruza su campo, reapuntarla tarde y dejar al de enfrente sin tiempo: 5-0
      todas las veces, medido. */
  enviada: boolean;
  /** Segundos en los que nadie puede tocarla, tras un toque. Sin esto un solo
      jugador la ametralla: sale de su mano y vuelve a estar a su alcance. */
  bloqueo: number;
  ultimoPunto: { equipo: 0 | 1; motivo: string } | null;
  ganador: 0 | 1 | null;
}

/** Un evento en marcha: qué baja por la pasarela y hasta cuándo. */
export interface Fiesta {
  /** Cómo se llama, para el cartel: "Noche de Wiracochas". */
  nombre: string;
  /** Los segundos de PARTIDA en que se acaba (`e.t`), no la hora del reloj. */
  hasta: number;
  /** De aquí sale lo que trae el desfile. Sin pesos: todos igual de probables. */
  florines: { tier: number; variant: Variante }[];
}

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
  | { t: "meta"; jugador: number; puesto: number; segundos: number }
  /** te ganaste un vehículo especial; quién lo guarda es cosa del cliente */
  | { t: "vehiculo"; tipo: string; jugador: number }
  | { t: "fin"; ganador: number | null }
  /** Gol en un partido: qué equipo marcó y cómo va el marcador. */
  | { t: "gol"; equipo: 0 | 1; goles: [number, number] }
  /** Punto de tenis: quién lo ganó, cómo va y por qué se acabó el peloteo. */
  | { t: "punto"; equipo: 0 | 1; puntos: [number, number]; motivo: string };

export type Sonido =
  | "throw" | "whack" | "grab" | "place" | "buy" | "ouch" | "lost" | "win" | "alarma" | "kick"
  | "dardo" | "bowl" | "swish" | "puck";

/** Lo que el anfitrión (teclado, joystick, red…) le pasa al motor cada tick. */
export interface EntradaJugador {
  /** dirección de movimiento, ya normalizada o no: el motor la normaliza */
  mover: { x: number; y: number };
  /** hacia dónde apunta el arma en coordenadas del mundo, o null para usar el rumbo */
  apunta: { x: number; y: number } | null;
}

/** Un trazado de circuito guardado en fracciones del mundo. */
export interface Trazado {
  base: [number, number][];
  cx: number; cy: number; w: number; h: number; alReves: boolean;
}

/* Un escenario se ESCRIBE en fracciones y se MONTA en píxeles. Los campos son
   los mismos en las dos formas; lo que cambia es qué significan los números.
   `montarEscenario` hace la conversión al empezar la partida, con el tamaño de
   mundo que pida el sitio. */
export interface Escenario {
  id: string;
  nombre: string;
  /** el tamaño de mundo que pide. Sin esto, el de siempre. */
  mundo?: { w: number; h: number };
  /** Si es un valle de varias zonas, dónde empieza cada una y qué decorado usa.
      Lo lee el cliente para pintar; el motor solo lo lleva de paseo. */
  zonas?: { id: string; x0: number; x1: number; mar?: number }[];
  /** Sitios que solo existen para jugar un partido: no salen en el selector de
      escenarios de la aventura, que va de robar Florines. */
  soloFutbol?: boolean;
  casas: [number, number][];
  patios: [number, number][];
  /** y desde la que empieza el agua: a pie te frena en la orilla, y con tabla
      o flotador se puede entrar. La playa, el río del Amazonas, el puerto de
      Nueva York. */
  mar?: number;
  /** un paso franco sobre el agua, entre x y x+w. El puente de Brooklyn se
      cruza andando: si no, sería un dibujo bonito y nada más. */
  puente?: { x: number; w: number };
  /** Los puntos de paso del circuito, en orden y en bucle. Sin esto aquí no se
      corre: el escenario no aparece en el modo carrera. Antes de montar es el
      trazado en fracciones; después, los puntos de verdad. */
  circuito?: [number, number][];
  trazado?: Trazado;
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
     versus:   gana el primero que llena todos sus patios.
     carrera:  tres vueltas al circuito, montado.
     y los MINIJUEGOS, que son los mismos ids que `JuegoDeSitio`: fútbol,
     tenis, básquet, bolos… Cada uno trae su cancha y sus reglas, y todos
     comparten lo importante: **el barrio no corre debajo**. Que un minijuego
     sea un modo no es burocracia — es lo único que apaga los ladrones, el
     desfile, los puestos y los patios mientras juegas. Armar la cancha desde
     fuera y dejar el modo en "aventura" deja las dos cosas encendidas a la vez
     (pasó, y se veía: te robaban a media pichanga). */
  modo: "aventura" | "versus" | "carrera" | JuegoDeSitio;
  /** ¿Hay vecinos? Ladrones, abuelas y desfile. En carrera solo estorban. */
  vecinos: boolean;
  /** Solo cuenta corriendo: qué tan brava es la carrera. Ver `DIFICULTADES`. */
  dificultad: Dificultad;
}

export interface Estado {
  t: number;
  reglas: Reglas;
  esc: Escenario;
  semilla: number;
  rngEstado: number;

  bases: Base[];
  players: Jugador[];
  /* Van en lista porque el mapa grande tiene dos de cada, en diagonal: con un
     solo par en el centro, ir a comprar desde una esquina era un viaje de ida y
     vuelta más largo que la propia partida. El primero de cada lista es el del
     centro, el de siempre. */
  armerias: Rect[];
  ruletas: Circulo[];
  /** La Fusionadora: se meten dos Florines de la vitrina y sale uno. */
  fusion: Rect;
  /** La cochera pegada a tu patio, con lo que has comprado en el Garaje.
      `null` cuando no tienes nada comprado o el modo no la usa (carrera). */
  cochera: Rect | null;
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
  /** solo en carrera: las cajas de ítem repartidas por la pista */
  cajas: CajaItem[];
  ultimoPremio: Premio | null;

  alarma: Alarma | null;

  /** El partido, cuando el modo es fútbol. */
  futbol: Futbol | null;
  /** El partido de tenis, cuando el modo es tenis. */
  tenis: Tenis | null;
  /** Partido de básquet. */
  basquet: Basquet | null;
  /** Juego de bolos. */
  bolos: Bolos | null;
  /** Ring de lucha. */
  lucha: Lucha | null;
  /** Tablero de dardos. */
  dardos: Dardos | null;
  /** Carrera de obstáculos. */
  carreraObs: CarreraObs | null;
  /** Laberinto tipo Pac-Man. */
  laberinto: Laberinto | null;
  /** Mesa de billar. */
  billar: Billar | null;
  /** Mesa de air hockey. */
  hockey: Hockey | null;
  /** Partido de voley. */
  voley: Voley | null;
  /** Los sitios del mundo donde se arma un minijuego: te metes y se juega, sin
      pasar por el menú. La canchita del colegio fue el primero.

      Es una LISTA y no un campo por juego a propósito: el segundo minijuego —y
      el tercero— traen sus reglas y nada más, en vez de otra bandera, otro
      botón y otro guardar-y-volver copiados. */
  sitios: SitioDeJuego[];

  /** La fiesta: mientras dura, la pasarela deja de traer Florines al azar y
      trae los que se hayan anunciado. La pone el cliente cuando el servidor
      dice que hay evento; el motor solo la respeta y la deja caducar. */
  fiesta: Fiesta | null;

  over: boolean;
  winnerIdx: number | null;
  /** contador para los ids de ladrones y del desfile */
  proximoId: number;

  /** Se vacía en cada tick: el anfitrión lo consume para pintar y sonar. */
  eventos: Evento[];
}
