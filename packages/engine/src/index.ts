/* @florin/engine — la simulación de Roba un Florín, sin navegador.

   Se usa así:

     const e = crearPartida({ modo: 1, escenario: "barrio", semilla: 7, armas: idsDeArmas() });
     avanzar(e, { 0: { mover: { x: 1, y: 0 }, apunta: null } }, 1/60);
     for (const ev of e.eventos) { ... pintar / sonar ... }

   Mismas entradas + misma semilla = misma partida, en el navegador y en el
   servidor. Eso es lo que permitirá más adelante que el servidor mande y no el
   cliente. */

export * from "./tipos.js";
export * from "./datos.js";
export {
  clamp, lerp, dist2, inRect, azar, rnd, pick, tiraDeTabla, money,
} from "./util.js";
export {
  crearPartida, reglasPara, JUGADORES_MAX,
  freePed, freePedDe, occupied, occupiedDe, esMiPatio,
  playerIncome, florinIncome, mismoFlorin, nuevoFlorin, laserActivo,
  bloqueadoPorLaser, orbitaDelCentro, puntoDelDesfile, ponerLaser,
  PORTAL_BAJADA, PORTAL_ORBITA,
  baseDe, jugadorDe, pedDe, desfileDe, patiosDe, objetivoDe,
  trastoDe, hayMar, enElMar, puedeMojarse,
} from "./estado.js";
export type { OpcionesPartida } from "./estado.js";
export {
  avanzar, usarArma, comprarArma, seleccionarArma, girarRuleta, premioDeRuleta,
  textoDePremio, spawnThief, sacarDelPortal, comprarPatio, rumboDeTiro,
  maxTier, rollTier, blancosDe, dropCarried, zap, knock, applyKnock, escudoAguanta,
  bajarse, cargar, multDeMontura,
} from "./simular.js";

import { WEAPONS } from "./datos.js";
/** Ids de arma, que es lo que el motor necesita para montar la munición. */
export const idsDeArmas = () => WEAPONS.map(w => w.id);
