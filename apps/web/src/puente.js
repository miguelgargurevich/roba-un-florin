/* El puente entre el motor y el navegador.

   Todo lo que el cliente necesita del motor entra por aquí, y todo lo que el
   motor cuenta (eventos) se traduce aquí a partículas, sonido y progreso. El
   resto del cliente sigue siendo el mismo código de dibujo de siempre. */

import {
  ESCENARIOS as ESC_MOTOR, FLORES, GOAL, LADRONES, LASER_CARGA, LASER_DUR,
  LASER_PRECIO, LASER_RECARGA, PORTAL_CADA, PORTAL_MAX, PORTAL_VUELTA,
  RAR_COLOR, RULETA, RULETA_PRECIO, TIERS, VARIANTES, WEAPONS, WORLD_H, WORLD_W,
  avanzar, blancosDe, bloqueadoPorLaser, clamp, comprarArma, crearPartida, dist2,
  esMiPatio, florNombre, florinIncome, freePed, freePedDe, girarRuleta as girarEnMotor,
  idsDeArmas, inRect, laserActivo, lerp, mismoFlorin, money, nuevoFlorin,
  occupied, occupiedDe, orbitaDelCentro, patiosDe, playerIncome, puntoDelDesfile,
  rumboDeTiro, seleccionarArma, textoDePremio, usarArma, varLabel, varMult,
  VEHICULOS, bajarse, enElMar, trastoDe, nivelDeVitrina, vitrinaDe, nombreDeHito,
  venderFlorin, precioDeVenta, soltarCarga,
} from "@florin/engine";

export {
  FLORES, GOAL, LADRONES, LASER_CARGA, LASER_DUR, LASER_PRECIO, LASER_RECARGA,
  PORTAL_CADA, PORTAL_MAX, PORTAL_VUELTA, RAR_COLOR, RULETA, RULETA_PRECIO,
  TIERS, VARIANTES, WEAPONS, WORLD_H, WORLD_W,
  avanzar, blancosDe, bloqueadoPorLaser, clamp, comprarArma, dist2, esMiPatio,
  florNombre, florinIncome, freePed, freePedDe, idsDeArmas, inRect, laserActivo,
  lerp, mismoFlorin, money, nuevoFlorin, occupied, occupiedDe, orbitaDelCentro,
  patiosDe, playerIncome, puntoDelDesfile, rumboDeTiro, seleccionarArma,
  textoDePremio, usarArma, varLabel, varMult,
  VEHICULOS, bajarse, enElMar, trastoDe, nivelDeVitrina, vitrinaDe, nombreDeHito,
  venderFlorin, precioDeVenta, soltarCarga,
};

/* ---- escenarios: el motor pone el reparto, el cliente el aspecto ---- */
export const VISUALES = {
  barrio: {
    icono: "🏘️",
    desc: "La cuadra de tierra de siempre. Tus patios juntos al suroeste.",
    suelo: "#B45E38", loseta: "rgba(255,239,226,.07)", mancha: "rgba(120,58,32,.22)",
    borde: "#5C2A18", deco: "manchas",
  },
  colegio: {
    icono: "🏫",
    desc: "El patio del Colegio Mixto Santa Teresita: cancha, jardines, palmeras, la bandera y las rayuelas del recreo.",
    suelo: "#C9BFA8", loseta: "rgba(255,255,255,.13)", mancha: "rgba(150,140,120,.22)",
    borde: "#8A7A62", deco: "colegio",
  },
  playa: {
    icono: "🏖️",
    desc: "Mar, orilla y castillos de arena. Nadie construye sobre la playa.",
    suelo: "#E0BE84", loseta: "rgba(255,255,255,.11)", mancha: "rgba(198,158,98,.3)",
    borde: "#A9834A", deco: "olas",
  },
  desierto: {
    icono: "🌵",
    desc: "Tierra rajada y mucho espacio vacío entre casa y casa.",
    suelo: "#C98B52", loseta: "rgba(255,239,226,.06)", mancha: "rgba(150,100,50,.24)",
    borde: "#8A5A2A", deco: "grietas",
  },
  machupicchu: {
    icono: "🏔️",
    desc: "Andenes de piedra en la ceja de selva, con llamas, ruinas incas y la neblina de la montaña.",
    suelo: "#7E9B63", loseta: "rgba(255,255,255,.08)", mancha: "rgba(70,95,55,.28)",
    borde: "#4A6138", deco: "andenes",
  },
  nuevayork: {
    icono: "🗽",
    desc: "Asfalto, taxis amarillos, rascacielos, hidrantes y las tapas de alcantarilla echando vapor.",
    suelo: "#4A4A52", loseta: "rgba(255,255,255,.05)", mancha: "rgba(25,25,30,.3)",
    borde: "#2A2A30", deco: "asfalto",
  },
  egipto: {
    icono: "🐫",
    desc: "Arena, pirámides, la esfinge, obeliscos con jeroglíficos y palmeras datileras.",
    suelo: "#E3C48A", loseta: "rgba(255,255,255,.07)", mancha: "rgba(190,150,90,.3)",
    borde: "#B08A4A", deco: "duna",
  },
  amazonas: {
    icono: "🐊",
    desc: "Selva espesa con el río al sur, lianas, nenúfares, guacamayos, monos y algún caimán.",
    suelo: "#3E6B3A", loseta: "rgba(255,255,255,.05)", mancha: "rgba(25,55,25,.32)",
    borde: "#24421F", deco: "selva",
  },

  /* Los cuatro de juguete. El suelo del cuarto, a lo grande. */
  pista: {
    icono: "🏎️",
    desc: "La alfombra del cuarto con la pista naranja montada encima: el rizo, rampas de salto, aceleradores y bólidos a toda.",
    suelo: "#46506E", loseta: "rgba(255,255,255,.05)", mancha: "rgba(28,32,48,.3)",
    borde: "#2A3049", deco: "pista",
  },
  tablero: {
    icono: "🎲",
    desc: "El tablero gigante: casillas de colores, la cárcel, el aparcamiento gratis, casitas, hoteles, los mazos y los dados rodando.",
    suelo: "#D9D2B8", loseta: "rgba(255,255,255,.14)", mancha: "rgba(150,142,115,.2)",
    borde: "#8A8266", deco: "tablero",
  },
  mirador: {
    icono: "🚂",
    desc: "Vía de madera sobre la mesa verde: la montaña con su mirador, el túnel, la estación y los trencitos dando vueltas.",
    suelo: "#5E8A4E", loseta: "rgba(255,255,255,.07)", mancha: "rgba(50,80,42,.26)",
    borde: "#3E5C34", deco: "mirador",
  },
  circuito: {
    icono: "🍄",
    desc: "Circuito de karts: pianitos, tuberías, bloques ?, cajas de ítem, aceleradores, monedas y setas.",
    suelo: "#57893F", loseta: "rgba(255,255,255,.06)", mancha: "rgba(45,75,35,.26)",
    borde: "#31531F", deco: "circuito",
  },
};

/** La lista para el selector de la portada: reparto del motor + aspecto local. */
export const ESCENARIOS = ESC_MOTOR.map(e => ({ ...e, ...VISUALES[e.id] }));
export const visualDe = id => VISUALES[id] || VISUALES.barrio;

/* ---- azar del cliente ----
   Ojo: esto es SOLO para adornos (partículas, decorado). El azar que afecta al
   juego vive en el motor y es reproducible; si se mezclaran, se rompería el
   determinismo que hace posible el servidor autoritativo. */
export const azar2 = (a, b) => a + Math.random() * (b - a);

/* ---- arranque de partida ---- */
let semillaSiguiente = (Date.now() % 2147483647) | 0;

/* El código de dibujo, heredado del prototipo, lee `G.money`, `G.ammo`, etc.
   como atajos del jugador 1. El motor no los tiene (allí un jugador es un
   jugador), así que se reponen aquí encima del estado. Es un puente de
   compatibilidad: cuando el cliente se reescriba, esto se cae. */
const ATAJOS = ["money", "ammo", "wsel", "cd", "chancla", "grab", "apunta", "stats",
                "inShop", "inRuleta", "hitoN", "fiesta"];
function conAtajos(G) {
  Object.defineProperty(G, "player", {
    get: () => G.players[0], configurable: true, enumerable: false,
  });
  for (const k of ATAJOS) {
    Object.defineProperty(G, k, {
      get: () => G.players[0][k],
      set: v => { G.players[0][k] = v; },
      configurable: true, enumerable: false,
    });
  }
  return G;
}

/* `local2` es el duelo de sofá: dos personas en un teclado. Es una decisión del
   cliente, no del motor — para el motor son dos jugadores y unas reglas. Vive
   como bandera del cliente al lado de `started` y `paused`. */
export function nuevaPartidaMotor(modo, escenarioId) {
  const local2 = modo === 2;
  const G = conAtajos(crearPartida({
    jugadores: local2 ? 2 : 1,
    escenario: escenarioId,
    armas: idsDeArmas(),
    reglas: local2
      ? { patiosExtra: false, todasLasArmas: false, puestos: false, modo: "versus" }
      : undefined,
    semilla: (semillaSiguiente = (semillaSiguiente * 48271) % 2147483647),
  }));
  G.local2 = local2;
  return G;
}

/* El mundo que llega de una sala es JSON pelado: hay que devolverle los atajos
   que el código de dibujo espera, y decirle quién eres tú. En una sala «tú» no
   siempre eres el jugador 0, así que `player` apunta a tu sitio. */
export function conAtajosDeSala(mundo, idx){
  if (!mundo) return mundo;
  if (mundo.__conAtajos === idx) return mundo;
  Object.defineProperty(mundo, "player", {
    get: () => mundo.players[idx] || mundo.players[0], configurable: true, enumerable: false,
  });
  for (const k of ATAJOS) {
    Object.defineProperty(mundo, k, {
      get: () => (mundo.players[idx] || mundo.players[0])[k],
      set: v => { (mundo.players[idx] || mundo.players[0])[k] = v; },
      configurable: true, enumerable: false,
    });
  }
  Object.defineProperty(mundo, "__conAtajos", { value: idx, configurable: true, enumerable: false });
  mundo.started = true; mundo.paused = false; mundo.local2 = false;
  return mundo;
}

/** Envuelve girarRuleta del motor para que el cliente sepa si arrancó. */
export const girarRuleta = (G, p, dur) => girarEnMotor(G, p, dur);

/* ---- revivir una partida guardada ----
   Esto es lo que el paso a ids hizo posible: el estado es JSON y nada más, así
   que volver a montarlo es parsearlo y devolverle los atajos del cliente. Si
   viene roto (de una versión vieja del juego, por ejemplo), devuelve null y el
   jugador empieza de nuevo — vale más eso que arrancar en un estado imposible. */
export function revivirPartida(texto){
  try {
    const G = JSON.parse(texto);
    if (!G || !Array.isArray(G.players) || !G.players.length || !Array.isArray(G.bases)) return null;
    if (!G.esc || !VISUALES[G.esc.id]) return null;
    G.eventos = [];
    /* Las partidas guardadas antes de los trastos no traen el campo. Se rellena
       en vez de rechazarlas: perder el guardado de ayer por una función nueva
       sería un pésimo intercambio. Nacen sin nada montado, que es lo correcto. */
    if (!Array.isArray(G.trastos)) G.trastos = [];
    for (const p of G.players){
      if (p.montado === undefined) p.montado = null;
      if (p.trastoUsado === undefined) p.trastoUsado = null;
      /* Los hitos eran de dinero y vivían en el estado. En los guardados viejos
         el número no significa lo mismo, así que se parte de cero: se volverán
         a celebrar los de vitrina, que es más amable que no celebrar ninguno. */
      if (p.hitoN === undefined) p.hitoN = 0;
      delete p.hito;
      if (p.fiesta === undefined) p.fiesta = 0;
    }
    if (!G.reglas) G.reglas = { patiosExtra: true, todasLasArmas: true, puestos: true, modo: "aventura" };
    if (G.reglas.modo === undefined) G.reglas.modo = G.reglas.duelo ? "versus" : "aventura";
    G.local2 = false;              // nunca se guardó una partida de sofá
    return conAtajos(G);
  } catch (_){ return null; }
}
