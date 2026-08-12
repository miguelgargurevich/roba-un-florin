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
  venderFlorin, precioDeVenta, soltarCarga, puestoDe, puestosDeCarrera,
  VUELTAS, CIRCUITOS, JUGADORES_MAX, pensarBot, GARAJE, TRASTOS_ESCENARIO,
  darleVehiculo, vehiculoDelSitio, esEspecial, ANCHO_PISTA, enLaPista, aparcarNuevo, comprarPatio,
  ponerFiesta, enFiesta, patear, TENIS_META, JUEGOS_LISTOS,
  usarPotenciador, potenciadoresDe, potenciadorPorId, colocarPuestos,
  DIFICULTADES, dificultadDe, fijarMundo, MUNDO_NORMAL, fundir, queSaleDeFundir,
  aLaCanchaDeBasquet, aLaPistaDeBolos, aLaLucha, aLosDardos, aLaCanchaDeVoley, aLaCarreraDeObs, aElLaberinto,
  aLaMesaDeBillar, aAirHockey,
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
  venderFlorin, precioDeVenta, soltarCarga, puestoDe, puestosDeCarrera,
  VUELTAS, CIRCUITOS, JUGADORES_MAX, pensarBot, GARAJE, TRASTOS_ESCENARIO,
  darleVehiculo, vehiculoDelSitio, esEspecial, ANCHO_PISTA, enLaPista, DIFICULTADES, dificultadDe, aparcarNuevo, comprarPatio,
  ponerFiesta, enFiesta, patear, TENIS_META, JUEGOS_LISTOS,
  fundir, queSaleDeFundir,
  usarPotenciador, potenciadoresDe, potenciadorPorId, colocarPuestos,
  aLaCanchaDeBasquet, aLaPistaDeBolos, aLaLucha, aLosDardos, aLaCanchaDeVoley, aLaCarreraDeObs, aElLaberinto,
  aLaMesaDeBillar, aAirHockey,
};

/* ---- escenarios: el motor pone el reparto, el cliente el aspecto ---- */
export const VISUALES = {
  catarata: {
    icono: "🏞️",
    desc: "El paseo al cerro: camino inca de piedra, vegetación, y la caída de agua sobre la poza donde se meten los chicos y se sientan alrededor.",
    suelo: "#8E9A66", loseta: "rgba(255,255,255,.05)", mancha: "rgba(60,72,40,.24)",
    borde: "#4A5432", deco: "catarata", topes: "cantos",
  },
  colegio: {
    icono: "🏫",
    desc: "El patio del Colegio Mixto Santa Teresita: cancha, jardines, palmeras, la bandera y las rayuelas del recreo.",
    suelo: "#C9BFA8", loseta: "rgba(255,255,255,.13)", mancha: "rgba(150,140,120,.22)",
    borde: "#8A7A62", deco: "colegio", topes: "conos",
  },
  playa: {
    icono: "🏖️",
    desc: "Mar, orilla y castillos de arena. Nadie construye sobre la playa.",
    suelo: "#E0BE84", loseta: "rgba(255,255,255,.11)", mancha: "rgba(198,158,98,.3)",
    borde: "#A9834A", deco: "olas", topes: "piedras",
  },
  desierto: {
    icono: "🌵",
    desc: "Tierra rajada y mucho espacio vacío entre casa y casa.",
    suelo: "#C98B52", loseta: "rgba(255,239,226,.06)", mancha: "rgba(150,100,50,.24)",
    borde: "#8A5A2A", deco: "grietas", topes: "piedras",
  },
  machupicchu: {
    icono: "🏔️",
    desc: "Andenes de piedra en la ceja de selva, con llamas, ruinas incas y la neblina de la montaña.",
    suelo: "#7E9B63", loseta: "rgba(255,255,255,.08)", mancha: "rgba(70,95,55,.28)",
    borde: "#4A6138", deco: "andenes", topes: "piedras",
  },
  nuevayork: {
    icono: "🗽",
    desc: "Asfalto, taxis amarillos, rascacielos, hidrantes y las tapas de alcantarilla echando vapor.",
    suelo: "#4A4A52", loseta: "rgba(255,255,255,.05)", mancha: "rgba(25,25,30,.3)",
    borde: "#2A2A30", deco: "asfalto", topes: "valla",
  },
  egipto: {
    icono: "🐫",
    desc: "Arena, pirámides, la esfinge, obeliscos con jeroglíficos y palmeras datileras.",
    suelo: "#E3C48A", loseta: "rgba(255,255,255,.07)", mancha: "rgba(190,150,90,.3)",
    borde: "#B08A4A", deco: "duna", topes: "piedras",
  },
  amazonas: {
    icono: "🐊",
    desc: "Selva espesa con el río al sur, lianas, nenúfares, guacamayos, monos y algún caimán.",
    suelo: "#3E6B3A", loseta: "rgba(255,255,255,.05)", mancha: "rgba(25,55,25,.32)",
    borde: "#24421F", deco: "selva", topes: "postes",
  },

  /* Los cuatro de juguete. El suelo del cuarto, a lo grande. */
  pista: {
    icono: "🏎️",
    desc: "La alfombra del cuarto con la pista naranja montada encima: el rizo, rampas de salto, aceleradores y bólidos a toda.",
    suelo: "#46506E", loseta: "rgba(255,255,255,.05)", mancha: "rgba(28,32,48,.3)",
    borde: "#2A3049", deco: "pista", topes: "conos",
  },
  tablero: {
    icono: "🎲",
    desc: "El tablero gigante: casillas de colores, la cárcel, el aparcamiento gratis, casitas, hoteles, los mazos y los dados rodando.",
    suelo: "#D9D2B8", loseta: "rgba(255,255,255,.14)", mancha: "rgba(150,142,115,.2)",
    borde: "#8A8266", deco: "tablero", topes: "llantas",
  },
  mirador: {
    icono: "🚂",
    desc: "Vía de madera sobre la mesa verde: la montaña con su mirador, el túnel, la estación y los trencitos dando vueltas.",
    suelo: "#5E8A4E", loseta: "rgba(255,255,255,.07)", mancha: "rgba(50,80,42,.26)",
    borde: "#3E5C34", deco: "mirador", topes: "postes",
  },
  costaverde: {
    icono: "🌊",
    desc: "El malecón de Lima: acantilado, el mar abajo, parapentes, palmeras y la ciclovía pegada al borde.",
    suelo: "#8E9A6C", loseta: "rgba(255,255,255,.07)", mancha: "rgba(90,100,70,.26)",
    borde: "#5A6544", deco: "costa", topes: "valla",
  },
  prehistoria: {
    icono: "🦕",
    desc: "Antes de todo: volcanes humeando, helechos gigantes, huesos a medio enterrar, pozos de brea y una cueva pintada. Aquí se monta en dinosaurio.",
    suelo: "#7C6A4A", loseta: "rgba(255,239,226,.05)", mancha: "rgba(60,46,30,.26)",
    borde: "#4A3A26", deco: "prehistoria", topes: "huesos",
  },
  volcan: {
    icono: "🌋",
    desc: "Ceniza negra, ríos de lava, humaredas y el cráter en el medio. Cuidado con lo que arde.",
    suelo: "#3A3238", loseta: "rgba(255,255,255,.04)", mancha: "rgba(20,16,20,.35)",
    borde: "#1E1A1E", deco: "volcan", topes: "piedras",
  },
  construccion: {
    icono: "🏗️",
    desc: "La obra: torres a medio hacer, andamios, montones de arena, conos y una grúa moviendo fierros. Aquí viven la grúa y el monster truck.",
    suelo: "#8A7862", loseta: "rgba(255,255,255,.06)", mancha: "rgba(60,50,38,.26)",
    borde: "#5E564C", deco: "obra", topes: "vallaObra",
  },
  medieval: {
    icono: "🏰",
    desc: "La villa amurallada: casas de madera, el castillo, el pozo, campos de cultivo y aldeanos. Y dragones, que aquí son de la casa.",
    suelo: "#7E8A5E", loseta: "rgba(255,255,255,.05)", mancha: "rgba(52,60,38,.26)",
    borde: "#4A5432", deco: "medieval", topes: "empalizada",
  },
  italia: {
    icono: "🇮🇹",
    desc: "El Coliseo, la torre inclinada, los cipreses y las columnas. Se corre en carro romano por la vía empedrada.",
    suelo: "#C4A886", loseta: "rgba(255,255,255,.07)", mancha: "rgba(120,96,68,.22)",
    borde: "#8A6E4A", deco: "italia", topes: "columnas",
  },
  america: {
    icono: "🧭",
    desc: "La costa del Descubrimiento: las tres carabelas fondeadas, las chozas de los nativos, hogueras, tótems y palmeras.",
    suelo: "#B8A272", loseta: "rgba(255,255,255,.06)", mancha: "rgba(110,94,58,.24)",
    borde: "#7A6640", deco: "america", topes: "totems",
  },
  nevado: {
    icono: "🎿",
    desc: "El cerro nevado: pinos con nieve, el telesilla, las pistas balizadas y los muñecos de nieve. Se baja en moto de nieve.",
    suelo: "#E8EEF4", loseta: "rgba(140,170,200,.10)", mancha: "rgba(180,200,220,.5)",
    borde: "#9AB0C4", deco: "nevado", topes: "nieve",
  },
  zoo: {
    icono: "🦁",
    desc: "El zoológico: los recintos con sus rejas, la jirafa, el león, los monos, la laguna de los flamencos y los carteles.",
    suelo: "#9AA86A", loseta: "rgba(255,255,255,.06)", mancha: "rgba(66,78,44,.24)",
    borde: "#56643A", deco: "zoo", topes: "rejas",
  },
  feria: {
    icono: "🎡",
    desc: "El parque de diversiones: la rueda de la fortuna, la montaña rusa, el carrusel, las carpas de rayas y los puestos de algodón.",
    suelo: "#7A5E8A", loseta: "rgba(255,255,255,.07)", mancha: "rgba(48,34,58,.26)",
    borde: "#4A3358", deco: "feria", topes: "bombillas",
  },
  nave: {
    icono: "🚀",
    desc: "Dentro de la nave: pasillos de chapa, ventanas al espacio, consolas, rejillas de ventilación y tripulantes de colores.",
    suelo: "#3E4A5C", loseta: "rgba(150,190,230,.07)", mancha: "rgba(24,30,40,.34)",
    borde: "#26303E", deco: "nave", topes: "bidones",
  },
  multiverso: {
    icono: "🌌",
    desc: "Los veinticuatro sitios cosidos en un solo mapa, de la catarata a la Luna: 86 400 px que se cruzan andando, sin volver al menú. Tu casa está en la primera zona; el resto del multiverso es para robar.",
    suelo: "#8E9A66", loseta: "rgba(255,255,255,.05)", mancha: "rgba(60,72,40,.24)",
    borde: "#4A5432", deco: "catarata", topes: "cantos",
  },
  /* ---- las dos canchas ---- */
  estadio: {
    icono: "🏟️",
    desc: "El estadio: tribunas llenas, focos, banderas y la hinchada saltando. Aquí se juega en serio.",
    suelo: "#2E7A3E", loseta: "rgba(255,255,255,.04)", mancha: "rgba(20,60,28,.22)",
    borde: "#1B4A26", deco: "estadio", topes: "valla",
  },
  calle: {
    icono: "🛣️",
    desc: "Pichanga de barrio: asfalto, dos arcos pintados en la pared, carros estacionados y la gente mirando desde la vereda.",
    suelo: "#6E6A66", loseta: "rgba(255,255,255,.04)", mancha: "rgba(30,28,26,.26)",
    borde: "#403C38", deco: "calle", topes: "valla",
  },

  luna: {
    icono: "🌕",
    desc: "Polvo gris, cráteres, la bandera, el módulo lunar y la Tierra saliendo por el horizonte.",
    suelo: "#8E8E96", loseta: "rgba(255,255,255,.05)", mancha: "rgba(60,60,68,.3)",
    borde: "#55555E", deco: "luna", topes: "nieve",
  },
  circuito: {
    icono: "🍄",
    desc: "Circuito de karts: pianitos, tuberías, bloques ?, cajas de ítem, aceleradores, monedas y setas.",
    suelo: "#57893F", loseta: "rgba(255,255,255,.06)", mancha: "rgba(45,75,35,.26)",
    borde: "#31531F", deco: "circuito", topes: "tuberias",
  },
};

/** La lista para el selector de la portada: reparto del motor + aspecto local. */
/* Los escenarios de la AVENTURA. Las canchas de fútbol (`soloFutbol`) llevan su
   aspecto igual —hacen falta para dibujarlas— pero no salen aquí: el selector de
   la portada es para elegir dónde robar Florines, y en el estadio no hay a quién.
   Se eligen en su propia fila, la de "dónde se juega". */
export const ESCENARIOS = ESC_MOTOR.filter(e => !e.soloFutbol)
  .map(e => ({ ...e, ...VISUALES[e.id] }));
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
export function nuevaPartidaMotor(modo, escenarioId, carrera = false, dificultad = "normal",
                                  garaje = [], rivales = 0, futbol = 0, cancha = "colegio",
                                  tenis = 0, mini = null) {
  const local2 = modo === 2;
  /* La pichanga: dos equipos y una pelota, en la cancha del colegio. Los que
     faltan los lleva la máquina, igual que los asientos libres de una carrera. */
  if (futbol) {
    const G = conAtajos(crearPartida({
      jugadores: futbol * 2,
      escenario: cancha,
      armas: idsDeArmas(),
      reglas: { modo: "futbol", vecinos: false, puestos: false, patiosExtra: false },
      semilla: (semillaSiguiente = (semillaSiguiente * 48271) % 2147483647),
    }));
    G.local2 = false;
    return G;
  }
  /* Cualquier otro minijuego: el modo ES el juego, y con eso el motor arma su
     cancha y apaga el barrio. Antes esto se hacía al revés —se creaba una
     partida de AVENTURA y se le llamaba a `aLaCanchaDeBasquet(G)` desde aquí—,
     y como el modo se quedaba en "aventura" seguían corriendo debajo los
     ladrones, el desfile y los puestos. */
  if (mini) {
    const G = conAtajos(crearPartida({
      jugadores: 2,
      escenario: cancha,
      armas: idsDeArmas(),
      reglas: { modo: mini },
      semilla: (semillaSiguiente = (semillaSiguiente * 48271) % 2147483647),
    }));
    G.local2 = false;
    return G;
  }
  /* El tenis: dos lados, una red y un peloteo, en la cancha del colegio. El
     motor da para dobles; desde la puerta de la canchita se arma individual,
     que es a lo que se juega cuando entras tú solo. */
  if (tenis) {
    const G = conAtajos(crearPartida({
      jugadores: tenis * 2,
      escenario: cancha,
      armas: idsDeArmas(),
      reglas: { modo: "tenis", vecinos: false, puestos: false, patiosExtra: false },
      semilla: (semillaSiguiente = (semillaSiguiente * 48271) % 2147483647),
    }));
    G.local2 = false;
    return G;
  }
  /* Una carrera solo contra nadie no es una carrera: los otros cuatro asientos
     se llenan de bots, que es para lo que `pensarBot` vive en el motor. */
  const esc = carrera && !CIRCUITOS.some(x => x.id === escenarioId)
    ? CIRCUITOS[0].id : escenarioId;
  /* Los vecinos que juegan solo existen en la aventura de un jugador: en el
     duelo de sofá el segundo asiento es del que tienes al lado, y en carrera
     los rivales ya son los cuatro de la parrilla. */
  const bots = carrera || local2 ? 0 : Math.max(0, Math.min(JUGADORES_MAX - 1, rivales | 0));
  /* La parrilla se queda en cinco aunque el mapa dé para nueve: las tres
     dificultades se midieron contra cuatro rivales, y meter ocho cambiaría
     todas las carreras sin que nadie lo haya pedido. */
  const PARRILLA = 5;
  const G = conAtajos(crearPartida({
    jugadores: carrera ? PARRILLA : (local2 ? 2 : 1 + bots),
    bots,
    escenario: esc,
    armas: idsDeArmas(),
    garaje,                       // lo comprado en el Garaje, aparcado junto a tu patio
    reglas: carrera
      ? { patiosExtra: false, puestos: false, modo: "carrera", vecinos: false, dificultad }
      : local2
        ? { patiosExtra: false, todasLasArmas: false, puestos: false, modo: "versus" }
        /* Con vecinos jugando, la aventura sigue siendo la aventura: los patios
           comprables se quedan. `reglasPara` los quita en cuanto hay compañía
           —le darían ventaja de salida a uno—, pero aquí la compañía es la
           máquina y el protagonista eres tú. */
        : bots > 0 ? { patiosExtra: true } : undefined,
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
    /* El tamaño del mundo lo fija cada escenario al CREAR la partida, y una
       revivida no pasa por ahí: sin esto, retomar una partida normal después de
       haber jugado en El Valle la dejaba con un mundo de 10 800 px de ancho.
       Se toma del escenario guardado, que ya lo trae. */
    fijarMundo(G.esc.mundo?.w ?? MUNDO_NORMAL.w, G.esc.mundo?.h ?? MUNDO_NORMAL.h);
    G.eventos = [];
    /* Las partidas guardadas antes de los trastos no traen el campo. Se rellena
       en vez de rechazarlas: perder el guardado de ayer por una función nueva
       sería un pésimo intercambio. Nacen sin nada montado, que es lo correcto. */
    if (!Array.isArray(G.trastos)) G.trastos = [];
    /* Las de antes del mapa grande traen un solo puesto de cada, en singular y
       en el centro de un mundo que ya no existe. Convertirlos a lista sin más
       los dejaba a 400 px del centro nuevo, por donde SÍ pasa el desfile: se
       veía la pasarela dando vueltas lejos de la Ruleta. Se recolocan, y de paso
       les toca el segundo par. Las casas se quedan donde estaban —moverlas
       arrastraría los pedestales y con ellos los Florines, que son el progreso. */
    if (!Array.isArray(G.armerias) || !Array.isArray(G.ruletas) ||
        !G.armerias.length || !G.ruletas.length) {
      const puestos = colocarPuestos(G.bases);
      G.armerias = puestos.armerias;
      G.ruletas = puestos.ruletas;
    }
    delete G.armeria; delete G.ruleta;
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
