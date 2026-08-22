/* @florin/engine — la simulación de Roba un Florín, sin navegador.

   Se usa así:

     const e = crearPartida({ modo: 1, escenario: "catarata", semilla: 7, armas: idsDeArmas() });
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
  crearPartida, reglasPara, JUGADORES_MAX, SALA_MAX, FUTBOL_MAX, TENIS_MAX,
  TENIS_META, TENIS_SAQUE, RED_ALTO, RED_ANCHO, ladoDeLaCancha, colocarParaElSaque, esMinijuego, JUEGOS_LISTOS,
  VOLEY_META, VOLEY_TOQUES, ladoDeVoley, BASQUET_META, ARO_R, BASQUET_TRIPLE, HOCKEY_META,
  LUCHA_META, LUCHA_R,
  OBS_VUELTAS, OBS_ANCHO, OBS_CONO,
  BOLOS_MANOS, PINO_R, BOLA_R, PINO_SEP,
  DARDOS_CADA_UNO, DIANA_R, DIANA_ANILLOS, valorDelDardo, DARDO_ARCO, DARDO_VAIVEN, puntoDelPendulo, errorDelDardo,
  BILLAR_COLORES, BOLA_BILLAR_R, HOYA_R,
  LAB_CELDA, LAB_FASES, LAB_BULTO, AMIGOS, esPared,
  LAB_FILA, LAB_MIGA, LAB_RASTRO,
  LAB_NIVELES, ladoDelNivel, jaulasDelNivel, monstruosDelNivel, relojDelNivel,
  BESTIARIO, monstruoDelNivel, monstruosDe, montarFaseDelLaberinto,
  LAB_ESCALON, varianteDelNivel, anchoDelNivel, altoDelNivel,
  LAB_COMIDAS, LAB_ARMAS, especialesDelNivel, comidaPorId, armaPorId, colorDeBicho,
  LAB_TEMAS, temaDelNivel, TEMA_MULTIVERSO, BRUJO, LAB_MAGIA, esNivelFinal, BRUJO_VIDAS, LLUVIA_FLORINES, LLUVIA_DURA,
  celdaLibreDe, centroDeCelda,
  LAB_SILBATO, LAB_LINTERNA, LAB_MOCHILA, LAB_TIZA_DURA, LAB_HUIDA, LAB_CONGELA,
  freePed, freePedDe, occupied, occupiedDe, esMiPatio,
  playerIncome, florinIncome, mismoFlorin, nuevoFlorin, laserActivo,
  bloqueadoPorLaser, orbitaDelCentro, puntoDelDesfile, ponerLaser,
  PORTAL_BAJADA, PORTAL_OCHO, OCHO_A, OCHO_B, centroDelMapa, puntoDelOcho,
  baseDe, jugadorDe, pedDe, desfileDe, patiosDe, objetivoDe,
  nivelDeVitrina, vitrinaDe, nombreDeHito, HITOS_MAX,
  trastoDe, hayMar, enElMar, enElPuente, puedeMojarse,
  darleVehiculo, vehiculoDelSitio, dentroDeLaPista, enLaPista, colocarPuestos, aparcarNuevo,
  aLaCanchaDeBasquet, aLaPistaDeBolos, aLaLucha, aLosDardos, aLaCanchaDeVoley, aLaCarreraDeObs, aElLaberinto,
  aLaMesaDeBillar, aAirHockey,
} from "./estado.js";
export type { OpcionesPartida } from "./estado.js";
export { pensarBot } from "./bot.js";
export type { PlanBot } from "./bot.js";
export {
  avanzar, usarArma, comprarArma, seleccionarArma, girarRuleta, premioDeRuleta,
  textoDePremio, spawnThief, sacarDelPortal, comprarPatio, rumboDeTiro, ponerFiesta, enFiesta,
  patear, PATEO_ALCANCE, TENIS_ALCANCE, VOLEY_ALCANCE, BASQUET_ALCANCE,
  maxTier, rollTier, blancosDe, dropCarried, zap, knock, applyKnock, escudoAguanta,
  bajarse, cargar, multDeMontura, venderFlorin, precioDeVenta, soltarCarga,
  puestosDeCarrera, puestoDe, usarPotenciador, fundir, queSaleDeFundir,
} from "./simular.js";

import { WEAPONS } from "./datos.js";
/** Ids de arma, que es lo que el motor necesita para montar la munición. */
export const idsDeArmas = () => WEAPONS.map(w => w.id);
