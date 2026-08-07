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
  occupied, occupiedDe, orbitaDelCentro, playerIncome, puntoDelDesfile,
  rumboDeTiro, seleccionarArma, textoDePremio, usarArma, varLabel, varMult,
} from "@florin/engine";

export {
  FLORES, GOAL, LADRONES, LASER_CARGA, LASER_DUR, LASER_PRECIO, LASER_RECARGA,
  PORTAL_CADA, PORTAL_MAX, PORTAL_VUELTA, RAR_COLOR, RULETA, RULETA_PRECIO,
  TIERS, VARIANTES, WEAPONS, WORLD_H, WORLD_W,
  avanzar, blancosDe, bloqueadoPorLaser, clamp, comprarArma, dist2, esMiPatio,
  florNombre, florinIncome, freePed, freePedDe, idsDeArmas, inRect, laserActivo,
  lerp, mismoFlorin, money, nuevoFlorin, occupied, occupiedDe, orbitaDelCentro,
  playerIncome, puntoDelDesfile, rumboDeTiro, seleccionarArma, textoDePremio,
  usarArma, varLabel, varMult,
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
const ATAJOS = ["money", "ammo", "wsel", "cd", "chancla", "grab", "apunta", "stats", "inShop", "inRuleta"];
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

export function nuevaPartidaMotor(modo, escenarioId) {
  return conAtajos(crearPartida({
    modo, escenario: escenarioId, armas: idsDeArmas(),
    semilla: (semillaSiguiente = (semillaSiguiente * 48271) % 2147483647),
  }));
}

/** Envuelve girarRuleta del motor para que el cliente sepa si arrancó. */
export const girarRuleta = (G, p, dur) => girarEnMotor(G, p, dur);
