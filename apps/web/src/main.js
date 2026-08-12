/* Roba un Florín — cliente web.

   Este archivo ya NO tiene reglas de juego: solo dibuja, escucha al jugador y
   traduce lo que el motor cuenta. Las reglas viven en @florin/engine, que corre
   igual aquí que en un servidor.

   Sigue siendo un archivo grande porque el dibujo del prototipo se movió tal
   cual: eso era lo que se quería, que el juego se viera y se jugara idéntico
   mientras se separaba la lógica. */

import {
  ESCENARIOS, FLORES, GOAL, LADRONES, LASER_CARGA, LASER_DUR, LASER_PRECIO,
  LASER_RECARGA, PORTAL_CADA, PORTAL_MAX, PORTAL_VUELTA, RAR_COLOR, RULETA,
  RULETA_PRECIO, TIERS, VARIANTES, WEAPONS, WORLD_H, WORLD_W,
  avanzar, azar2, bloqueadoPorLaser, clamp, comprarArma, dist2, esMiPatio,
  florNombre, florinIncome, freePed, freePedDe, girarRuleta as girarEnMotor,
  inRect, laserActivo, lerp, money, nuevaPartidaMotor, nuevoFlorin, occupied, DIFICULTADES,
  dificultadDe,
  occupiedDe, orbitaDelCentro, playerIncome, puntoDelDesfile, rumboDeTiro,
  bajarse, conAtajosDeSala as conAtajosMotor, nombreDeHito, patiosDe, precioDeVenta,
  puestoDe, puestosDeCarrera, VUELTAS, CIRCUITOS, pensarBot, GARAJE, VEHICULOS,
  fundir, queSaleDeFundir,
  TRASTOS_ESCENARIO, darleVehiculo, esEspecial, ANCHO_PISTA, aparcarNuevo, comprarPatio,
  ponerFiesta, enFiesta, patear, TENIS_META, JUEGOS_LISTOS, VOLEY_META, VOLEY_TOQUES,
  usarPotenciador, potenciadoresDe, potenciadorPorId,
  soltarCarga, trastoDe,
  venderFlorin,
  revivirPartida, seleccionarArma, textoDePremio,
  usarArma, varLabel, vitrinaDe,
  varMult, visualDe,
} from "./puente.js";
import { nube } from "./nube.js";
import { conectarSala } from "./sala.js";

/* ---- lo que antes vivía dentro del estado del juego y ahora es del cliente ----
   Las partículas y los avisos flotantes son adorno: el motor no sabe de ellos,
   solo emite eventos y aquí se convierten en cosas que se ven. */
let pops = [], puffs = [];

function animarParticulas(dt){
  for (let i=pops.length-1;i>=0;i--){
    const q = pops[i]; q.life -= dt; q.y -= 34*dt;
    if (q.life <= 0) pops.splice(i,1);
  }
  for (let i=puffs.length-1;i>=0;i--){
    const q = puffs[i];
    q.life -= dt; q.x += q.vx*dt; q.y += q.vy*dt; q.vy += 320*dt;
    if (q.life <= 0) puffs.splice(i,1);
  }
}

/** Traduce los eventos del tick a partículas, sonido y progreso guardado. */
function consumirEventos(){
  for (const ev of G.eventos){
    switch (ev.t){
      case "texto":  pop(ev.x, ev.y, ev.txt, ev.color); break;
      case "polvo":  puff(ev.x, ev.y, ev.color, ev.n); break;
      case "sonido": { const f = ev.cual === "throw" ? "throw_" : ev.cual;
                       if (Snd[f]) Snd[f](); break; }
      case "album":  vistoEnAlbum(ev.tier, ev.variant); break;
      case "vehiculo":
        /* En una sala el evento llega para todos: solo es tuyo si el jugador
           que lo ganó eres tú. */
        if (ev.jugador === (sala ? sala.estado.idx : 0)){
          if (!ganarVehiculo(ev.tipo))
            pop(G.player.x, G.player.y - 96, "Ya lo tenías — toma " + money(4000), "#FFC53D");
        }
        break;
      case "fin":    endGame(ev.ganador == null ? null : G.players[ev.ganador]); break;
      case "hito":   guardarPartidaAhora(); break;   // el HUD ya lo celebra leyendo G.fiesta
    }
  }
}

/** Lo que el jugador está pidiendo este tick, en el formato que espera el motor. */
function entradas(dt){
  const out = {};
  for (const p of G.players){
    /* Jugando solo una carrera, del 2 al 5 los lleva la máquina: es la misma
       `pensarBot` que juega los asientos libres de una sala. */
    if (p.idx > 0 && !G.local2){
      const plan = pensarBot(G, p, dt || 1/60);
      out[p.idx] = plan.entrada;
      if (plan.usar) usarArma(G, p);
      /* En el tenis la pelota no se mueve al pisarla: hay que golpearla, y eso
         el bot lo pide aparte. */
      if (plan.patear != null) patear(G, p, plan.patear);
      continue;
    }
    const T = p.idx === 0 ? (G.local2 ? TECLAS_J1 : TECLAS_1P) : TECLAS_J2;
    let x = 0, y = 0;
    if (T.left.some(k => keys.has(k)))  x -= 1;
    if (T.right.some(k => keys.has(k))) x += 1;
    if (T.up.some(k => keys.has(k)))    y -= 1;
    if (T.down.some(k => keys.has(k)))  y += 1;
    if (p.idx === 0 && joy.on){ x += joy.dx; y += joy.dy; }   // el joystick es del J1
    out[p.idx] = {
      mover: { x, y },
      apunta: p.idx === 0 && mira.on ? { x: mira.wx, y: mira.wy } : null,
    };
  }
  return out;
}

/* Dónde apunta el ratón / el arrastre táctil, en coordenadas del mundo. */
const mira = { on:false, wx:0, wy:0 };

/** Soltar el Florín que llevas, para poder coger otro. Queda en el suelo y lo
    recoge quien pase — tú incluido. */
function soltarLoQueLlevo(){
  if (!G || !G.started || G.over || !G.player.carry) return;
  if (sala) sala.soltar(); else soltarCarga(G, G.player);
}

/** Bajarse a mano de lo que lleves debajo. */
function bajarseDelTrasto(){
  if (!G || !G.started || G.over || G.player.montado == null) return;
  if (sala) sala.bajarse(); else bajarse(G, G.player, true);
  renderWbar();
}

/** Arranca una partida nueva en el escenario elegido. */
/* Si en la portada eliges Carrera, jugar solo arranca una carrera contra bots.
   Vive aquí y no en el motor porque es cosa de la portada, no del juego.

   La fuente de verdad es el BOTÓN marcado, no una variable: guardándola aparte
   se desincronizaban —la portada decía Carrera y arrancaba una aventura— y
   además así el que lee el código no tiene que buscar quién la puso. */
const modoElegido = () => {
  const sel = document.querySelector("#modoFila .modoBtn.sel, #minijuegosFila .modoBtn.sel");
  return sel?.dataset.modo || "aventura";
};

function nuevaPartida(modo){
  pops = []; puffs = [];
  /* En el orden del catálogo del Garaje, no el de compra: así cada vehículo
     tiene siempre la misma plaza y te acostumbras a dónde está el tuyo. */
  const misTrastos = GARAJE.map(g => g.tipo).filter(tengoVehiculo);
  const esFutbol = modoElegido() === "futbol";
  const G2 = nuevaPartidaMotor(modo, ESCENARIOS[escSel].id, modoElegido() === "carrera", difSel,
                               misTrastos, rivSel, esFutbol ? ladoSel : 0, canchaSel);
  if (modoElegido() === "carrera" && vehSel) darleVehiculo(G2, G2.players[0], vehSel);
  G2.started = false; G2.paused = false;    // banderas del cliente, no del motor
  return G2;
}

/* Gira la ruleta y, si arrancó, monta la animación de la tira.

   En una sala esto NO decide nada: se le pide al servidor y la tira se monta
   cuando el `girando` llega de vuelta en el estado. Girar aquí gastaría tu
   dinero en un mundo que el siguiente resync tira a la basura. */
function girarRuleta(){
  const p = G.player;
  if (!p || !p.inRuleta || G.girando) return;
  if (sala){ sala.ruleta(); return; }
  const premio = (() => {
    const antes = G.girando;
    const ok = girarEnMotor(G, p, REDUCED ? .35 : 2.2);
    return ok ? G.girando.premio : null;
  })();
  if (!premio){ renderRuleta(); return; }
  construirTira(premio);
  const ancho = el.rul.querySelector(".rulTira").clientWidth || 520;
  G.girando.destino = RUL_IDX*RUL_CEL_W + RUL_CEL_W/2 - ancho/2;
  G.ultimoPremioTxt = null;
  Snd.unlock();
  renderRuleta();
}

"use strict";

/* ============================================================
   Constantes del mundo
   ============================================================ */
/* Precios de los patios extra. Dónde caen los pone el escenario. */


/* ============================================================
   Escenarios
   ============================================================
   Mismas reglas en todos: cambia el sitio (suelo, colores, decorado) y el
   reparto de casas y patios. La columna del centro (portal, Armería, Ruleta) NO
   se mueve nunca, porque es el bucle principal del juego.
   `casas` son las 4 vecinas en orden Mayo · El Sobri · Prima Yuli · Marcianos,
   y la 4ª es la que en dos jugadores pasa a ser el patio del J2.
   `patios` son los tuyos: el primero es el de salida, los otros dos se compran. */
let escSel = 0;
try {
  const g0 = localStorage.getItem("florin_escenario");
  const i0 = ESCENARIOS.findIndex(e => e.id === g0);
  if (i0 >= 0) escSel = i0;
} catch (_){}
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Cada Florín es un bloquecito cúbico (tierra, oro, obsidiana…) con su flor arriba.
   top/strip = capa de arriba · side/sideDark = caras del bloque · petal/petal2/center = la flor */



/* La pasarela es un desfile: del portal sale un Florín cada PORTAL_CADA segundos,
   le da una vuelta a la Armería y se vuelve a meter. No es de nadie: si lo quieres,
   tienes que atraparlo al pasar, igual que robas de una vitrina. */


/* Seguridad láser: te paras en la placa LASER_CARGA segundos, pagas y tu patio
   queda cerrado LASER_DUR. Después la placa necesita LASER_RECARGA para volver. */


/* Ruleta: cada tirada cuesta RULETA_PRECIO. Los pesos suman 100.
   "incognita" abre la tabla secreta de abajo, de donde salen las variantes. */


/* Los vecinos que te roban: cada base manda su propio ladrón, con maña distinta */


/* Especies de flor. Los COLORES siguen viniendo de la rareza (para que se siga
   leyendo de un vistazo qué vale cada Florín), pero la FORMA la pone la especie:
   así dos Comunes ya no son idénticos. Cada Florín nace con una al azar y la
   conserva toda su vida, igual que el nombre.
   n:null = usa los pétalos de la rareza · centro:0 = flor sin disco central */



/* Variantes especiales: solo salen de la ruleta y multiplican los ingresos.
   Viajan con el Florín, igual que el nombre: si te lo roban, se lo llevan así. */



/* Ingresos reales de un Florín, ya con su variante aplicada */

/* Copia un Florín conservando lo que lo hace suyo: nombre y variante */


/* ============================================================
   Utilidades
   ============================================================ */


const mmss  = s => Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");

/* ============================================================
   Audio (WebAudio, sin archivos externos)
   ============================================================ */
const Snd = (() => {
  let ac = null, muted = false;
  const ensure = () => {
    if (!ac) { try { ac = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){ ac = null; } }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  };
  function tone(freq, dur, type="square", vol=.12, slide=0){
    if (muted) return;
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide), c.currentTime+dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime+dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime+dur+.02);
  }
  function noise(dur=.12, vol=.18){
    if (muted) return;
    const c = ensure(); if (!c) return;
    const len = Math.floor(c.sampleRate*dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1-i/len);
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    const f = c.createBiquadFilter(); f.type="bandpass"; f.frequency.value=1400;
    s.connect(f).connect(g).connect(c.destination); s.start();
  }
  return {
    toggle(){ muted = !muted; if(!muted) ensure(); return muted; },
    get muted(){ return muted; },
    unlock(){ ensure(); },
    throw_(){ noise(.1,.1); tone(720,.12,"sawtooth",.06,-380); },
    whack(){ noise(.16,.26); tone(180,.18,"square",.16,-120); },
    kick(){ noise(.08,.22); tone(260,.12,"triangle",.14,-200); },
    dardo(){ noise(.03,.08); tone(1200,.06,"sine",.05,-400); },
    bowl(){ noise(.1,.18); tone(300,.15,"square",.1,-180); },
    swish(){ noise(.06,.12); tone(800,.1,"sine",.08,-300); },
    puck(){ noise(.05,.15); tone(400,.08,"triangle",.12,-250); },
    grab(){ tone(520,.07,"triangle",.11); setTimeout(()=>tone(780,.09,"triangle",.11),60); },
    place(){ tone(660,.08,"square",.09); setTimeout(()=>tone(990,.12,"square",.09),70); },
    buy(){ [523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.1,"square",.09),i*55)); },
    ouch(){ tone(300,.22,"sawtooth",.12,-190); },
    lost(){ tone(400,.2,"sawtooth",.1,-250); setTimeout(()=>tone(240,.3,"sawtooth",.1,-140),140); },
    win(){ [523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>tone(f,.22,"square",.1),i*130)); },
    /* dos notas alternas, como una alarma de coche: se distingue del resto */
    alarma(){ tone(880,.13,"square",.13); setTimeout(()=>tone(660,.16,"square",.13),140); }
  };
})();

/* ============================================================
   DOM
   ============================================================ */
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
const mm = document.getElementById("minimap");
const mctx = mm.getContext("2d");
const el = {
  money:  document.getElementById("uiMoney"),
  rate:   document.getElementById("uiRate"),
  goal:   document.getElementById("uiGoal"),
  goalCard:  document.getElementById("uiGoalCard"),
  goalLabel: document.getElementById("uiGoalLabel"),
  alarma:    document.getElementById("alarma"),
  alarmaTxt: document.getElementById("alarmaTxt"),
  bar:    document.getElementById("uiBar"),
  lost:   document.getElementById("uiLost"),
  title:  document.getElementById("scrTitle"),
  end:    document.getElementById("scrEnd"),
  touch:  document.getElementById("touch"),
  ring:   document.getElementById("joyring"),
  nub:    document.getElementById("joynub"),
  throwB: document.getElementById("throwBtn"),
  pause:  document.getElementById("btnPause"),
  sound:  document.getElementById("btnSound"),
  hand:   document.getElementById("btnHand"),
  wsel:   document.getElementById("wsel"),
  wselBtn: document.getElementById("wselBtn"),
  wselIc: document.getElementById("wselIc"),
  wselNm: document.getElementById("wselNm"),
  wselN:  document.getElementById("wselN"),
  wmenu:  document.getElementById("wmenu"),
  arm:    document.getElementById("armeria"),
  rack:   document.getElementById("rack"),
  armMon: document.getElementById("armMoney"),
  wIcon:  document.getElementById("wIcon"),
  j2:      document.getElementById("hudJ2"),
  j2money: document.getElementById("uiJ2Money"),
  j2rate:  document.getElementById("uiJ2Rate"),
  j2bar:   document.getElementById("uiJ2Bar"),
  wSvg:   document.getElementById("wSvg"),
  btnInicio: document.getElementById("btnInicio"),
  rul:     document.getElementById("ruleta"),
  fus:     document.getElementById("fusion"),
  rulStrip:document.getElementById("rulStrip"),
  rulMon:  document.getElementById("rulMoney"),
  rulBtn:  document.getElementById("rulGirar"),
  rulMsg:  document.getElementById("rulMsg"),
};

let VW=0, VH=0, DPR=1, ZOOM=1;
function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = cv.clientWidth; VH = cv.clientHeight;
  cv.width = Math.round(VW*DPR); cv.height = Math.round(VH*DPR);
  ZOOM = clamp(Math.min(VW/1150, VH/820), .46, 1.05);
  /* El alto sale de la proporción del mundo. Con 200 fijos y un mapa más
     apaisado, el minimapa estiraba el mundo a lo alto y las distancias que
     enseñaba eran mentira. */
  mm.width = 300; mm.height = Math.round(300 * WORLD_H / miniAncho());
}
window.addEventListener("resize", resize);

/* ============================================================
   Estado
   ============================================================ */
let G = null;


/* Teclas de cada jugador. Con un jugador, WASD y flechas hacen lo mismo. */
const TECLAS_1P = { up:["w","arrowup"], down:["s","arrowdown"], left:["a","arrowleft"], right:["d","arrowright"], fire:[" "] };
const TECLAS_J1 = { up:["w"], down:["s"], left:["a"], right:["d"], fire:[" "] };
const TECLAS_J2 = { up:["arrowup"], down:["arrowdown"], left:["arrowleft"], right:["arrowright"], fire:[".",",","enter"] };



/* ============================================================
   Entrada
   ============================================================ */
const keys = new Set();
window.addEventListener("keydown", e => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === " ") { if (sala) sala.usar(); else usarArma(G, G.players[0]); }
  // Ojo: el mapa de teclas es del CLIENTE. Antes esto leía `players[1].teclas`,
  // un campo del prototipo que el motor nunca tuvo: en cuanto se extrajo el
  // motor, cualquier tecla en el duelo reventaba y el modo quedó injugable.
  if (G.local2 && G.players[1] && TECLAS_J2.fire.includes(k)) usarArma(G, G.players[1]);
  if (k === "p") togglePause();
  if (k === "m") toggleSound();
  // La N sirve para dos cosas según el momento: si vas montado te bajas, y si
  // no, bautizas. Nunca coinciden — montado no puedes cargar un Florín.
  if (k === "n"){ if (G.player.montado != null) bajarseDelTrasto(); else abrirBautizo(); }
  if (k === "f") soltarLoQueLlevo();
  if (k === "x") usarMiItem();       // la E ya cambia de arma
  /* La B abre el álbum… salvo en un partido, donde es la de patear: a media
     pichanga nadie quiere el álbum, y el que lo quiera tiene el botón 📖. */
  if (k === "b" && !elPartido())
    { if (document.getElementById("album").hidden) abrirAlbum(); else cerrarAlbum(); }
  if (k === "t") togglePanel("arm");
  if (k === "r") togglePanel("rul");
  if (k === "escape" && !document.getElementById("album").hidden) cerrarAlbum();
  if (k === "escape" && !elTienda.hidden) cerrarTienda();
  /* En teclado se patea con B, aguantándola para cargar. */
  if (k === "b" && elPartido() && G.started && !G.over && !pateo.desde)
    pateo.desde = performance.now();
  if (k === "escape" && !document.getElementById("salirAviso").hidden) cerrarSalir();
  if (k >= "1" && k <= "9") elegirArma(+k - 1);
  if (k === "0") elegirArma(9);
  if (k === "q") elegirArma((G.wsel + WEAPONS.length - 1) % WEAPONS.length);
  if (k === "e") elegirArma((G.wsel + 1) % WEAPONS.length);
  if (k === "enter" && !G.local2){
    if (!G.started || G.over) startGame(1);
  }
});
window.addEventListener("keyup", e => {
  keys.delete(e.key.toLowerCase());
  if (e.key.toLowerCase() === "b") soltarPateo();
});
window.addEventListener("blur", () => keys.clear());

/* ============================================================
   Álbum de Florines: qué has llegado a tener, entre partidas
   ============================================================ */
/* Sale del catálogo del motor, no de una lista a mano: al añadir la Cristal, la
   Lava y la Galaxia el álbum se quedó en 75 casillas y no las enseñaba. */
const ALBUM_VARIANTES = [null, ...Object.keys(VARIANTES)];
const ALBUM_TOTAL = TIERS.length * ALBUM_VARIANTES.length;
let album = {};
try { album = JSON.parse(localStorage.getItem("florin_album") || "{}") || {}; } catch (_){ album = {}; }
const albumKey = (tier, variant) => tier + ":" + (variant || "base");

const guardarAlbumLocal = () => {
  try { localStorage.setItem("florin_album", JSON.stringify(album)); } catch (_){}
};

/* ============================================================
   El Garaje
   ============================================================
   Los vehículos especiales son del JUGADOR, no de la partida: se compran una
   vez con dinero de aventura (o se ganan en la Ruleta) y quedan para siempre.
   Se guardan como el álbum — en el navegador — porque son un logro, no un
   estado de partida. */
let garaje = {};
try { garaje = JSON.parse(localStorage.getItem("florin_garaje") || "{}") || {}; } catch (_){ garaje = {}; }
const tengoVehiculo = tipo => !!garaje[tipo];
const guardarGaraje = () => {
  try { localStorage.setItem("florin_garaje", JSON.stringify(garaje)); } catch (_){}
};

function ganarVehiculo(tipo, comoLoDigo){
  if (garaje[tipo]) return false;
  garaje[tipo] = 1;
  guardarGaraje();
  const v = VEHICULOS[tipo];
  pop(G.player.x, G.player.y - 96, comoLoDigo || ("🔧 " + v.icon + " ¡" + v.label + " al Garaje!"), "#8B6BEE");
  /* Aparcado ya, sin esperar a la siguiente partida: si compras el ovni y no
     aparece hasta que reinicies, parece que no lo compraste. */
  if (aparcarNuevo(G, tipo)) invalidarSuelo();
  pintarGaraje();
  return true;
}

/* ============================================================
   La Tienda del inicio
   ============================================================
   El Garaje, los patios y la venta de Florines siempre estuvieron DENTRO de la
   partida: para gastar lo acumulado había que entrar a jugar y cruzar el mapa
   hasta el puesto. Aquí es lo mismo, desde la portada.

   La plata NO es un monedero aparte: es la de tu partida. Un saldo que solo
   viviera en el menú sería otra economía que cuadrar, y los precios están
   pensados contra lo que se junta jugando. De dónde sale, por orden: la partida
   que dejaste pausada al volver al inicio, y si no, la guardada en la nube. */
let menuG = null;                 // la guardada, revivida, cuando no hay partida viva

function partidaDelMenu(){
  if (sala) return null;          // en una sala manda el servidor: aquí no se toca nada
  if (G && G.started && !G.over && !G.local2) return { g: G, de: "tu partida" };
  if (guardadaEnLaNube){
    if (!menuG) menuG = revivirPartida(guardadaEnLaNube.estado);
    if (menuG) return { g: menuG, de: "tu partida guardada" };
  }
  return null;
}

/** Deja por escrito lo que se acaba de comprar o vender. */
function guardarDelMenu(g){
  const datos = {
    escenario: g.esc.id, dinero: Math.round(g.player.money),
    hito: g.hitoN, segundos: g.t, estado: JSON.stringify(g),
  };
  if (guardadaEnLaNube) Object.assign(guardadaEnLaNube, datos);
  if (nube.hayCuenta) nube.guardarPartida(datos);
  pintarBotonSeguir();
}

/** Una tarjeta de la Tienda, con el mismo aspecto que las del Armería. */
function tarjeta(grid, { icon, nombre, precio, desc, tuyo, puedo, alTocar }){
  const b = document.createElement("button");
  b.type = "button";
  b.className = "buy" + (tuyo ? " tuyo" : "");
  b.disabled = !!tuyo || !puedo;
  b.innerHTML =
    '<span class="ic">' + icon + '</span>' +
    '<span><span class="nm">' + nombre + '</span><br>' +
    (tuyo ? '<span class="ya">✔ ' + tuyo + '</span>'
          : '<span class="pr">' + precio + '</span>') +
    '<br><span class="ds">' + desc + '</span></span>';
  if (!b.disabled) b.addEventListener("click", () => { alTocar(); Snd.unlock(); });
  grid.appendChild(b);
  return b;
}

function pintarTienda(){
  const p = partidaDelMenu();
  const g = p && p.g;
  const plata = g ? g.player.money : 0;
  document.getElementById("tiendaMoney").textContent = money(plata);
  document.getElementById("tiendaSub").textContent = p
    ? "Se paga con la plata de " + p.de + ", y lo que compres se guarda en ella."
    : "Aquí se gasta la plata de tu partida. Empieza una —o entra a tu cuenta para recuperar la guardada— y vuelve.";

  /* ---- vehículos: son del JUGADOR, valen para todas las partidas ---- */
  const gridV = document.getElementById("tiendaGrid");
  gridV.innerHTML = "";
  for (const item of GARAJE){
    const v = VEHICULOS[item.tipo];
    tarjeta(gridV, {
      icon: v.icon, nombre: v.label, precio: money(item.precio), desc: item.comoSale,
      tuyo: tengoVehiculo(item.tipo) ? "ya es tuyo" : null,
      puedo: !!g && plata >= item.precio,
      alTocar: () => {
        g.player.money -= item.precio;
        garaje[item.tipo] = 1;
        guardarGaraje();
        if (g === G) aparcarNuevo(G, item.tipo);     // a su plaza en la cochera
        guardarDelMenu(g);
        pintarGaraje(); pintarVehiculos(); pintarTienda();
      },
    });
  }

  /* ---- patios: eso sí es de ESTA partida ---- */
  const gridP = document.getElementById("tiendaPatios");
  gridP.innerHTML = "";
  const enVenta = g ? g.bases.filter(b => b.locked) : [];
  if (!g || !enVenta.length){
    gridP.innerHTML = '<p class="albumSub">' +
      (g ? "Ya son tuyos todos los patios de esta partida." :
           "Los patios se compran dentro de una partida.") + '</p>';
  } else for (const b of enVenta){
    tarjeta(gridP, {
      icon: "🏡", nombre: b.name, precio: money(b.price),
      desc: "Seis pedestales más para tu vitrina. Sube la meta y sube los ingresos.",
      tuyo: null, puedo: plata >= b.price,
      alTocar: () => {
        comprarPatio(g, g.player, b);
        guardarDelMenu(g);
        if (g === G) invalidarSuelo();
        pintarTienda();
      },
    });
  }

  /* ---- vender: lo que tienes puesto en la vitrina ---- */
  const gridS = document.getElementById("tiendaVender");
  gridS.innerHTML = "";
  const mios = [];
  if (g) for (const b of patiosDe(g, g.player))
    b.peds.forEach((ped, i) => { if (ped.florin) mios.push({ b, i, ped }); });
  if (!mios.length){
    gridS.innerHTML = '<p class="albumSub">' +
      (g ? "Tu vitrina está vacía. Roba unos cuantos y vuelve." :
           "Aquí saldrán los Florines de tu vitrina.") + '</p>';
  } else for (const m of mios){
    const f = m.ped.florin, T = TIERS[f.tier];
    tarjeta(gridS, {
      icon: "🪴", nombre: f.nombre || T.name,
      precio: "+" + money(precioDeVenta(f)),
      desc: (f.variant ? varLabel(f.variant) + " · " : "") + T.rar +
            " · " + money(florinIncome(f)) + "/s",
      tuyo: null, puedo: true,
      alTocar: () => {
        venderFlorin(g, g.player, { tipo: "ped", b: m.b.id, i: m.i });
        guardarDelMenu(g);
        pintarTienda();
      },
    });
  }
}

function abrirTienda(){ menuG = null; pintarTienda(); elTienda.hidden = false; }
function cerrarTienda(){ elTienda.hidden = true; menuG = null; }
const elTienda = document.getElementById("tienda");
document.getElementById("btnTienda").addEventListener("click", abrirTienda);
document.getElementById("tiendaCerrar").addEventListener("click", cerrarTienda);

/* ============================================================
   Las fiestas
   ============================================================
   El servidor no simula nada: solo dice "hay fiesta, esto es lo que baja y
   hasta cuándo". Cada cliente lo aplica en SU partida, que es lo que permite
   que la fiesta llegue igual al que juega solo sin cuenta y al que está en una
   sala. Se pregunta cada minuto: un evento empieza a una hora, no a un segundo.

   El regalo va aparte, contra el servidor y una sola vez por cuenta: si lo
   diera el cliente, recargar la página sería una máquina de Florines. */
const FIESTA_CADA = 60_000;
let fiestaViva = null;             // lo último que dijo el servidor
let fiestaPuestaEn = null;         // el id que ya está aplicado a esta partida

async function mirarSiHayFiesta(){
  const r = await nube.fiestaViva();
  if (!r) return;
  fiestaViva = r;
  fiestaDesde = Date.now();       // desde aquí se descuentan los segundos
  aplicarFiesta();
  pintarCartelFiesta();
}

/** Mete la fiesta en la partida que esté en marcha. */
function aplicarFiesta(){
  if (!G || !G.started || G.over) return;
  const f = fiestaViva?.ahora;
  if (!f){ fiestaPuestaEn = null; return; }
  if (fiestaPuestaEn === f.id && enFiesta(G)) return;    // ya está puesta
  ponerFiesta(G, f.nombre, f.florines.map(x => ({ tier: x.tier, variant: x.variante || null })),
              fiestaViva.segundosQueQuedan);
  fiestaPuestaEn = f.id;
  pop(G.player.x, G.player.y - 110, "🎉 ¡" + f.nombre + "!", "#FFD84D");
  Snd.win();
  recogerRegaloSiToca();
}

/** El regalo del evento: lo entrega el servidor y lo coloca el cliente. */
async function recogerRegaloSiToca(){
  const f = fiestaViva?.ahora;
  if (!f || !fiestaViva.regaloPendiente || !nube.hayCuenta) return;
  if (!G || !G.started || G.over) return;
  const r = await nube.recogerRegalo(f.id);
  const premio = r && r.florin;
  if (!premio) return;
  fiestaViva.regaloPendiente = false;
  const hueco = freePedDe(G, G.player);
  const fl = nuevoFlorin(G, premio.tier, { variant: premio.variante || null });
  if (hueco){ hueco.florin = fl; hueco.pop = 1; }
  else if (!G.player.carry) G.player.carry = fl;
  else { pop(G.player.x, G.player.y - 90, "El regalo no cabe: haz sitio en la vitrina", "#FF6B90"); return; }
  vistoEnAlbum(premio.tier, premio.variante || null);
  pop(G.player.x, G.player.y - 90, "🎁 ¡Regalo de la fiesta!", "#FFD84D");
  guardarPartidaAhora();
}

const elFiestaCartel = document.getElementById("fiestaCartel");
/* El cartel sirve para dos cosas: avisar de la que viene y acompañar a la que
   está. Se ve igual en el menú y jugando — el aviso no sirve de nada si solo
   lo ve quien ya está dentro.

   La cuenta atrás la lleva `Date.now()` contra la hora de arranque que dio el
   servidor, y no el reloj de la partida: en el menú no hay partida que corra, y
   el que la tiene pausada tampoco avanza. */
let fiestaDesde = 0;               // cuándo contestó el servidor, en ms del reloj

function segundosDeFiesta(){
  const pasado = (Date.now() - fiestaDesde) / 1000;
  const viva = fiestaViva?.ahora ? fiestaViva.segundosQueQuedan - pasado : -1;
  const proxima = fiestaViva?.siguiente ? fiestaViva.segundosParaLaSiguiente - pasado : -1;
  return { viva, proxima };
}

/* El aviso del admin. Viaja en la misma respuesta que la fiesta, así que no
   hay un sondeo más: lo que llega, se pinta. */
const elAviso = document.getElementById("avisoCartel");
function pintarAviso(){
  const a = fiestaViva?.anuncio;
  const quedan = a ? fiestaViva.segundosDeAnuncio - (Date.now() - fiestaDesde) / 1000 : -1;
  const hay = !!a && quedan > 0;
  elAviso.hidden = !hay;
  if (!hay) return;
  elAviso.textContent = "📣 " + a.texto;
  // si además hay cartel de fiesta, este baja para no taparlo
  elAviso.classList.toggle("conFiesta", !elFiestaCartel.hidden);
}

function pintarCartelFiesta(){
  const { viva, proxima } = segundosDeFiesta();
  const f = viva > 0 ? fiestaViva.ahora : (proxima > 0 ? fiestaViva.siguiente : null);
  elFiestaCartel.hidden = !f;
  pintarAviso();
  if (!f) return;
  const empezada = viva > 0;
  elFiestaCartel.classList.toggle("avisa", !empezada);
  elFiestaCartel.innerHTML = "<b>" + (empezada ? "🎉 " : "⏳ ") +
    f.nombre.replace(/[<>&]/g, "") + "</b> · " +
    (empezada ? "por la pasarela · " + mmss(viva)
              : "empieza en " + mmss(proxima));
  pintarAviso();                       // otra vez: ya se sabe si el de arriba está puesto
}

/* Un tic por segundo para el cartel. El HUD ya repinta jugando, pero en el menú
   no corre nada y una cuenta atrás congelada no avisa de nada.

   Y cuando la cuenta atrás llega a cero, se le pregunta al servidor en vez de
   esperar al sondeo del minuto: es justo el momento en que hay que enterarse. */
setInterval(() => {
  if (!fiestaViva) return;
  const antes = segundosDeFiesta();
  pintarCartelFiesta();
  if (antes.proxima > -1 && antes.proxima <= 0) mirarSiHayFiesta();
}, 1000);

/* ---- el panel de admin ----
   Elegir qué baja por la pasarela es elegir de una parrilla de rareza × variante:
   la misma que el álbum, que es donde ya se sabe qué existe. */
const elAdmin = document.getElementById("admin");
const adminSel = new Set();                   // "tier:variante" de lo que baja
let adminRegalo = null;

const claveFlorin = (tier, v) => tier + ":" + (v || "");
const partesFlorin = k => ({ tier: +k.split(":")[0], variante: k.split(":")[1] || null });

function celdaFlorin(grid, tier, variante, elegida, alTocar){
  const T = TIERS[tier];
  const b = document.createElement("button");
  b.type = "button";
  b.className = "adminCel" + (elegida ? " sel" : "");
  b.innerHTML = (variante ? VARIANTES[variante].icon : "🪴") +
    '<span>' + T.name.replace("Florín ", "") + '</span>' +
    '<span class="rr">' + (variante ? VARIANTES[variante].label : T.rar) + '</span>';
  b.addEventListener("click", () => { alTocar(); Snd.unlock(); });
  grid.appendChild(b);
}

function pintarAdmin(){
  const rejilla = document.getElementById("adminFlorines");
  const regalo = document.getElementById("adminRegalo");
  rejilla.innerHTML = ""; regalo.innerHTML = "";
  /* De la rareza más alta hacia abajo: lo que se manda en una fiesta es lo
     bueno, y tenerlo primero ahorra desplazarse. */
  const variantes = [null, ...ALBUM_VARIANTES.filter(Boolean)];
  for (let tier = TIERS.length - 1; tier >= 0; tier--){
    for (const v of variantes){
      const k = claveFlorin(tier, v);
      celdaFlorin(rejilla, tier, v, adminSel.has(k), () => {
        if (adminSel.has(k)) adminSel.delete(k); else adminSel.add(k);
        pintarAdmin();
      });
    }
  }
  const variado = document.getElementById("adminVariado").checked;
  regalo.hidden = variado;                 // variado: no hay uno que elegir
  if (!variado){
    for (let tier = TIERS.length - 1; tier >= 0; tier--){
      for (const v of variantes){
        const k = claveFlorin(tier, v);
        celdaFlorin(regalo, tier, v, adminRegalo === k, () => {
          adminRegalo = adminRegalo === k ? null : k;
          pintarAdmin();
        });
      }
    }
  }
  document.getElementById("adminAviso").textContent =
    adminSel.size ? adminSel.size + " elegidos" : "elige al menos uno";
}

async function pintarListaAvisos(){
  const caja = document.getElementById("adminAvisos");
  const filas = await nube.avisosMandados();
  caja.innerHTML = "";
  if (!filas || !filas.length) return;
  for (const a of filas.slice(0, 6)){
    const div = document.createElement("div");
    div.className = "fila";
    const hasta = new Date(a.terminaEn);
    const vivo = !a.cancelado && hasta > new Date();
    div.innerHTML = '<span>' + (vivo ? "🟢 " : "⚪️ ") +
      a.texto.replace(/[<>&]/g, "").slice(0, 70) + '</span>';
    if (vivo){
      const b = document.createElement("button");
      b.textContent = "Quitar";
      b.addEventListener("click", async () => {
        await nube.cancelarAviso(a.id); pintarListaAvisos(); mirarSiHayFiesta();
      });
      div.appendChild(b);
    }
    caja.appendChild(div);
  }
}

document.getElementById("adminMandar").addEventListener("click", async () => {
  const caja = document.getElementById("adminMsg");
  const texto = caja.value.trim();
  const minutos = +document.getElementById("adminMsgDura").value || 5;
  if (!texto){ decir("Escribe el mensaje.", "mal"); return; }
  const r = await nube.mandarAviso({ texto, duraSegundos: Math.round(minutos * 60), empiezaEn: null });
  if (!r){ decir("No se pudo mandar. ¿Sigue tu sesión abierta?", "mal"); return; }
  caja.value = "";
  decir("📣 Aviso mandado.", "bien");
  pintarListaAvisos();
  mirarSiHayFiesta();                  // para verlo tú también, sin esperar al minuto
});

async function pintarListaFiestas(){
  const caja = document.getElementById("adminLista");
  const filas = await nube.fiestasProgramadas();
  caja.innerHTML = "";
  if (!filas || !filas.length){ caja.innerHTML = '<p class="albumSub">Todavía no hay ninguna.</p>'; return; }
  for (const f of filas){
    const d = new Date(f.empiezaEn);
    const div = document.createElement("div");
    div.className = "fila";
    div.innerHTML = '<span><b>' + f.nombre.replace(/[<>&]/g, "") + '</b><br>' +
      d.toLocaleString() + " · " + Math.round(f.duraSegundos / 60) + " min · " +
      f.florines.length + " Florines" + (f.cancelado ? " · cancelada" : "") + '</span>';
    if (!f.cancelado){
      const b = document.createElement("button");
      b.textContent = "Cancelar";
      b.addEventListener("click", async () => { await nube.cancelarFiesta(f.id); pintarListaFiestas(); });
      div.appendChild(b);
    }
    caja.appendChild(div);
  }
}

function abrirAdmin(){
  if (!nube.esAdmin) return;
  if (!document.getElementById("adminCuando").value){
    /* Por defecto, dentro de cinco minutos: el `datetime-local` quiere la hora
       LOCAL sin zona, así que se le resta el desfase antes de recortarlo. */
    const d = new Date(Date.now() + 5 * 60_000 - new Date().getTimezoneOffset() * 60_000);
    document.getElementById("adminCuando").value = d.toISOString().slice(0, 16);
  }
  pintarAdmin();
  pintarListaFiestas();
  pintarListaAvisos();
  elAdmin.hidden = false;
}
function cerrarAdmin(){ elAdmin.hidden = true; }
document.getElementById("adminVariado").addEventListener("change", pintarAdmin);
document.getElementById("btnAdmin").addEventListener("click", abrirAdmin);
document.getElementById("adminCerrar").addEventListener("click", cerrarAdmin);

document.getElementById("adminCrear").addEventListener("click", async () => {
  const nombre = document.getElementById("adminNombre").value.trim() || "Fiesta en la pasarela";
  const cuando = document.getElementById("adminCuando").value;
  const minutos = +document.getElementById("adminDura").value || 15;
  if (!adminSel.size){ decir("Elige al menos un Florín para la pasarela.", "mal"); return; }
  if (!cuando){ decir("Ponle hora a la fiesta.", "mal"); return; }
  const r = await nube.programarFiesta({
    nombre,
    empiezaEn: new Date(cuando).toISOString(),   // el servidor lo guarda en UTC
    duraSegundos: Math.round(minutos * 60),
    florines: [...adminSel].map(partesFlorin),
    regalo: adminRegalo ? partesFlorin(adminRegalo) : null,
    regaloVariado: document.getElementById("adminVariado").checked,
  });
  if (!r){ decir("No se pudo programar. ¿Sigue tu sesión abierta?", "mal"); return; }
  decir("🎪 " + nombre + " programada.", "bien");
  pintarListaFiestas();
  mirarSiHayFiesta();
});

function vistoEnAlbum(tier, variant){
  const k = albumKey(tier, variant);
  if (album[k]) return;
  album[k] = 1;
  guardarAlbumLocal();
  nube.registrarEnAlbum(tier, variant);     // si no hay cuenta, no hace nada
  const T = TIERS[tier];
  pop(G.player.x, G.player.y - 82,
      "📖 ¡Nuevo en el álbum!" , RAR_COLOR[T.rar] || "#FFC53D");
}

/* Los Florines del álbum, con su dibujo y su rebote. Verlos ahí es la mitad de
   la gracia de coleccionarlos: una lista de nombres no motiva a nadie. */
let albumCanvas = [];
let albumRaf = 0;

function renderAlbum(){
  const grid = document.getElementById("albumGrid");
  grid.innerHTML = "";
  albumCanvas = [];
  let n = 0;
  TIERS.forEach((T, tier) => {
    ALBUM_VARIANTES.forEach(v => {
      const tenido = !!album[albumKey(tier, v)];
      if (tenido) n++;
      const cel = document.createElement("div");
      cel.className = "albumCel " + (tenido ? "tenido" : "nunca");
      const inc = T.income * varMult(v);
      const cv = document.createElement("canvas");
      cv.className = "albumFlor";
      cv.width = 84; cv.height = 84;
      cel.appendChild(cv);
      const txt = document.createElement("div");
      txt.className = "albumTxt";
      txt.innerHTML =
        '<span class="rar" style="color:' + (RAR_COLOR[T.rar] || "#FFEFE2") + '">' + T.rar + '</span>' +
        '<span class="nm">' + (tenido ? T.name : "???") + (v ? " " + VARIANTES[v].icon : "") + '</span>' +
        '<span class="dt">' + money(T.price) + ' · ' + inc + '/s</span>' +
        '<span class="q">' + (v ? VARIANTES[v].label + " ×" + varMult(v) : "normal") + '</span>';
      cel.appendChild(txt);
      grid.appendChild(cel);
      /* La flor es siempre la misma para cada casilla: el álbum es una ficha,
         no una tirada. Sale del número de rareza, así que no cambia al abrirlo. */
      albumCanvas.push({ cv, c: cv.getContext("2d"),
                         f: { tier, variant: v, flor: (tier * 3 + ALBUM_VARIANTES.indexOf(v)) },
                         tenido, fase: (tier * 7 + ALBUM_VARIANTES.indexOf(v) * 3) * 0.37 });
    });
  });
  document.getElementById("albumCuenta").textContent = n + " / " + ALBUM_TOTAL;
  /* La lista de variantes se escribe sola: así no se queda vieja al añadir una. */
  document.getElementById("albumSub").innerHTML =
    "Las " + Object.keys(VARIANTES).length + " variantes — " +
    Object.values(VARIANTES).map(v => v.icon + " " + v.label + " (×" + v.mult + ")").join(", ") +
    " — solo salen de la casilla <b>???</b> de la Ruleta.";
  animarAlbum();
}

function animarAlbum(){
  cancelAnimationFrame(albumRaf);
  const paso = () => {
    const t = performance.now() / 1000;
    for (const a of albumCanvas){
      /* Solo los que se ven. Son 75 casillas y redibujarlas todas cada frame
         se nota en una tableta, aunque la mayoría estén fuera de la ventana. */
      const r = a.cv.getBoundingClientRect();
      if (r.bottom < -40 || r.top > innerHeight + 40) continue;
      const { c } = a;
      c.clearRect(0, 0, 84, 84);
      c.save();
      /* Los que no tienes salen en silueta: se ve la forma, no cuál es. */
      if (!a.tenido) c.filter = "grayscale(1) brightness(.35)";
      const bob = Math.sin(t * 2.2 + a.fase) * 3;
      drawFlorinEn(c, 42, 46 + bob, 1.25, a.f, t + a.fase);
      c.restore();
    }
    albumRaf = requestAnimationFrame(paso);
  };
  paso();
}

function pararAlbum(){ cancelAnimationFrame(albumRaf); albumRaf = 0; albumCanvas = []; }

function abrirAlbum(){
  if (!G || !G.started || G.over) return;
  renderAlbum();
  document.getElementById("album").hidden = false;
  if (!G.paused) togglePause();
}
function cerrarAlbum(){
  pararAlbum();
  document.getElementById("album").hidden = true;
  if (G.paused) togglePause();
}

/* ---- modo zurdo: espeja los controles y se recuerda entre partidas ---- */
let zurdo = false;
try { zurdo = localStorage.getItem("florin_zurdo") === "1"; } catch (_){}
function aplicarZurdo(){
  document.getElementById("app").classList.toggle("zurdo", zurdo);
  el.hand.textContent = zurdo ? "🤚" : "✋";
  el.hand.title = zurdo ? "Zurdo (toca para diestro)" : "Diestro (toca para zurdo)";
  el.hand.setAttribute("aria-label", zurdo ? "Cambiar a modo diestro" : "Cambiar a modo zurdo");
}
function toggleZurdo(){
  zurdo = !zurdo;
  try { localStorage.setItem("florin_zurdo", zurdo ? "1" : "0"); } catch (_){}
  aplicarZurdo();
}

/* ---- puntería: a dónde mandar la chancla ----
   Con ratón, el arma va hacia el cursor. En táctil, arrastras desde el botón rosa
   y sale en esa dirección. Sin apuntar, sale hacia donde caminas (como antes). */
function pantallaAMundo(px, py){ return { x: cam.x + px/ZOOM, y: cam.y + py/ZOOM }; }
function apuntarAPantalla(px, py){          // el ratón y el arrastre apuntan al jugador 1
  const w = pantallaAMundo(px, py), a = G.player.apunta;
  a.wx = w.x; a.wy = w.y; a.on = true;
}

// Joystick táctil (el ratón no lo usa: con ratón apuntas y haces clic)
const joy = { id:null, ox:0, oy:0, dx:0, dy:0, on:false };
function ladoDelJoystick(x){
  return zurdo ? x > VW*0.44 : x < VW*0.56;   // el lado libre, opuesto al botón
}
function joyStart(e){
  if (e.pointerType === "mouse") return;
  if (!ladoDelJoystick(e.clientX)) return;
  joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
  joy.dx = 0; joy.dy = 0; joy.on = true;
  el.ring.style.left = joy.ox+"px"; el.ring.style.top = joy.oy+"px";
  el.nub.style.left = joy.ox+"px";  el.nub.style.top = joy.oy+"px";
  el.ring.classList.add("on"); el.nub.classList.add("on");
  Snd.unlock();
}
function joyMove(e){
  if (e.pointerId !== joy.id) return;
  let dx = e.clientX-joy.ox, dy = e.clientY-joy.oy;
  const m = Math.hypot(dx,dy), max = 52;
  if (m > max){ dx = dx/m*max; dy = dy/m*max; }
  joy.dx = dx/max; joy.dy = dy/max;
  el.nub.style.left = (joy.ox+dx)+"px"; el.nub.style.top = (joy.oy+dy)+"px";
}
function joyEnd(e){
  if (e.pointerId !== joy.id) return;
  joy.id = null; joy.on = false; joy.dx = 0; joy.dy = 0;
  el.ring.classList.remove("on"); el.nub.classList.remove("on");
}
cv.addEventListener("pointerdown", e => {
  // si la captura falla, el joystick debe arrancar igual: sin esto te quedas sin moverte
  try { cv.setPointerCapture?.(e.pointerId); } catch (_){}
  if (e.pointerType === "mouse"){         // con ratón: clic = lanzar hacia el cursor
    Snd.unlock();
    apuntarAPantalla(e.clientX, e.clientY);
    usarArma(G, G.player);
    return;
  }
  joyStart(e);
});
cv.addEventListener("pointermove", e => {
  if (e.pointerType === "mouse") apuntarAPantalla(e.clientX, e.clientY);
  joyMove(e);
});
cv.addEventListener("pointerup", joyEnd);
cv.addEventListener("pointercancel", joyEnd);
/* Red de seguridad. El `pointerup` puede no llegar nunca al canvas: si la
   captura falló, si el dedo sale de la ventana, o si el sistema se lleva el
   gesto (una llamada, una notificación, el gesto de volver atrás). Cuando eso
   pasa, `joy.on` se queda en true y el muñeco camina solo hasta que tocas otra
   vez. Escuchar también en la ventana no cuesta nada y cierra ese agujero. */
for (const t of ["pointerup", "pointercancel"]) window.addEventListener(t, joyEnd);
window.addEventListener("blur", () => joyEnd({ pointerId: joy.id }));

/* Botón de arma: un toque lanza hacia donde caminas; si arrastras, apuntas */
/* El partido que se esté jugando en una cancha, o null. Los tres (fútbol,
   tenis, vóley) tienen `cancha` y equipos, y el HUD, la cámara y las camisetas
   solo necesitan eso. Preguntar `G.futbol || G.tenis || …` en quince sitios es
   como se olvida el decimosexto. */
const elPartido = () => (G && (G.futbol || G.tenis || G.voley)) || null;

/* ---- patear ----
   Un toque la empuja; aguantando, se carga y sale el pelotazo. Pasado cierto
   punto el balón sale POR EL AIRE, y ahí es donde aparecen los centros — y los
   cabezazos, que es lo mismo pero rematando lo que viene volando.

   La fuerza la manda quien juega y el motor la recorta: un cliente que mande 99
   no llega más lejos que uno honesto. */
const elPateo = document.getElementById("pateoBtn");
const PATEO_CARGA = 1.1;                    // segundos hasta la fuerza máxima
const pateo = { desde: 0, id: null };

function fuerzaDePateo(){
  if (!pateo.desde) return 0;
  return clamp((performance.now() - pateo.desde) / 1000 / PATEO_CARGA, 0, 1);
}
function soltarPateo(){
  if (!pateo.desde) return;
  const f = fuerzaDePateo();
  pateo.desde = 0; pateo.id = null;
  elPateo.querySelector(".carga b").style.width = "0%";
  if (sala) sala.patear(f);
  else if (elPartido()) patear(G, G.player, f);
  Snd.unlock();
}
elPateo.addEventListener("pointerdown", e => {
  e.preventDefault();
  pateo.desde = performance.now(); pateo.id = e.pointerId;
  try { elPateo.setPointerCapture?.(e.pointerId); } catch (_){}
});
elPateo.addEventListener("pointerup", e => { if (e.pointerId === pateo.id) soltarPateo(); });
elPateo.addEventListener("pointercancel", () => { pateo.desde = 0; pateo.id = null; });

/* ---- la lista rápida de armas ----
   Dejando apretado el botón de lanzar sale la fila de armas justo encima, que
   es donde ya está el pulgar. Antes había que ir a la barra de arriba a buscar
   el selector: dos gestos y mirar a otro lado en mitad de una pelea. */
const elArmas = document.getElementById("armasRapidas");
const LARGO = 320;                       // ms de aguante para que cuente como "dejar apretado"

function pintarArmasRapidas(){
  elArmas.innerHTML = "";
  WEAPONS.forEach((w, i) => {
    const inf = w.id === "chancla";
    const balas = inf ? Infinity : G.ammo[w.id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "arApr" + (G.wsel === i ? " sel" : "") + (balas <= 0 ? " locked" : "");
    b.innerHTML = '<span class="ic">' + w.icon + '</span>' +
                  '<span class="n">' + (inf ? "∞" : balas) + '</span>';
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(G.wsel === i));
    /* `pointerdown` y no `click`: viniendo de una pulsación larga, el `click`
       de iOS llega tarde o no llega. */
    b.addEventListener("pointerdown", ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (balas > 0) elegirArma(i);        // pasa por aquí para que en una sala lo decida el servidor
      cerrarArmasRapidas();
      Snd.unlock();
    });
    elArmas.appendChild(b);
  });
}
function abrirArmasRapidas(){
  if (!G || !G.started || G.over) return;
  pintarArmasRapidas();
  elArmas.hidden = false;
}
function cerrarArmasRapidas(){ elArmas.hidden = true; }

const tiro = { id:null, ox:0, oy:0, apuntando:false, reloj:0, abrio:false };
el.throwB.addEventListener("pointerdown", e => {
  e.preventDefault(); Snd.unlock();
  tiro.id = e.pointerId; tiro.ox = e.clientX; tiro.oy = e.clientY;
  tiro.apuntando = false; tiro.abrio = false;
  try { el.throwB.setPointerCapture?.(e.pointerId); } catch (_){}
  clearTimeout(tiro.reloj);
  tiro.reloj = setTimeout(() => {
    /* Aguantaste sin arrastrar: es "elegir arma", no "lanzar". */
    if (tiro.id !== e.pointerId || tiro.apuntando) return;
    tiro.abrio = true;
    abrirArmasRapidas();
  }, LARGO);
});
el.throwB.addEventListener("pointermove", e => {
  if (e.pointerId !== tiro.id) return;
  const dx = e.clientX - tiro.ox, dy = e.clientY - tiro.oy, m = Math.hypot(dx, dy);
  if (m < 14) return;                     // margen para que un toque simple no cuente como apuntar
  if (tiro.abrio) return;                 // ya está eligiendo arma: no apunta
  clearTimeout(tiro.reloj);               // arrastrar es apuntar, no aguantar
  tiro.apuntando = true;
  const p = G.player, a = p.apunta;
  a.on = true;
  a.wx = p.x + dx/m*300; a.wy = (p.y - 12) + dy/m*300;
});
el.throwB.addEventListener("pointerup", e => {
  if (e.pointerId !== tiro.id) return;
  tiro.id = null;
  clearTimeout(tiro.reloj);
  /* Si la pulsación abrió la lista, soltar NO lanza: sería tirar la chancla
     cada vez que quieres cambiar de arma. */
  if (tiro.abrio){ tiro.abrio = false; return; }
  usarArma(G, G.player);
  if (tiro.apuntando) G.player.apunta.on = false;   // el apuntado táctil dura un lanzamiento
});
el.throwB.addEventListener("pointercancel", () => {
  tiro.id = null; clearTimeout(tiro.reloj); tiro.abrio = false;
});
/* Tocar fuera la cierra, como cualquier menú. */
document.addEventListener("pointerdown", e => {
  if (!elArmas.hidden && !elArmas.contains(e.target) && e.target !== el.throwB)
    cerrarArmasRapidas();
});
el.throwB.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " "){ e.preventDefault(); usarArma(G, G.player); }
});
/* Una X en cada panel. Todas pasan por aquí para que ninguna se quede sin
   cerrar cuando se añada un panel nuevo. */
for (const b of document.querySelectorAll(".cerrarX")){
  const qué = b.dataset.cerrar;
  b.addEventListener("click", () => {
    if (qué === "arm" || qué === "rul" || qué === "fus") cerrarPanel(qué);
    else if (qué === "album") cerrarAlbum();
    else if (qué === "tienda") cerrarTienda();
    else if (qué === "admin") cerrarAdmin();
    else if (qué === "bautizo") cerrarBautizo();
  });
}
el.pause.addEventListener("click", togglePause);
el.sound.addEventListener("click", toggleSound);
el.hand.addEventListener("click", () => { toggleZurdo(); empujarPreferencias(); });
/* ---- paneles de Armería y Ruleta: se abren con su botón, no al pasar ---- */
function panelDisponible(cual){
  if (!G || !G.started || G.over || G.local2) return false;
  return cual === "arm" ? !!G.player.inShop
       : cual === "fus" ? !!G.player.inFusion
       : !!G.player.inRuleta;
}
const cajaDe = cual => cual === "arm" ? el.arm : cual === "fus" ? el.fus : el.rul;
function cerrarPanel(cual){
  cajaDe(cual).hidden = true;
  renderBotonesPanel();
}
function togglePanel(cual){
  if (!panelDisponible(cual)){
    if (G && G.started && !G.over && !G.local2){
      const p = G.player;
      const donde = cual === "arm" ? "la Armería" : cual === "fus" ? "la Fusionadora" : "la Ruleta";
      pop(p.x, p.y-62, "Tienes que estar en " + donde, "#FF6B90");
    }
    return;
  }
  const caja = cajaDe(cual);
  const abrir = caja.hidden;
  // solo un panel a la vez: si están pegados, uno taparía al otro
  el.arm.hidden = true; el.rul.hidden = true; el.fus.hidden = true;
  caja.hidden = !abrir;
  if (abrir){
    if (cual === "arm") renderRack();
    else if (cual === "fus"){ fusElegidos = []; renderFusion(); }
    else { G.ultimoPremio = null; construirTira(null); renderRuleta(); }
    Snd.unlock();
  }
  renderBotonesPanel();
}
/* ---- el panel de la Fusionadora ----
   Trabaja sobre la vitrina, no sobre lo que llevas en brazos: solo se carga un
   Florín a la vez, así que pedir dos serían dos viajes. */
let fusElegidos = [];

function renderFusion(){
  const rejilla = document.getElementById("fusRejilla");
  const btn = document.getElementById("fusBtn");
  const msg = document.getElementById("fusMsg");
  document.getElementById("fusMoney").textContent = money(G.player.money);
  const llenos = occupiedDe(G, G.player);
  rejilla.innerHTML = "";
  fusElegidos = fusElegidos.filter(i => i < llenos.length);
  llenos.forEach((ped, i) => {
    const f = ped.florin;
    const cel = document.createElement("button");
    cel.type = "button";
    cel.className = "fusCel" + (fusElegidos.includes(i) ? " sel" : "");
    const cv = document.createElement("canvas");
    cv.width = 60; cv.height = 60;
    drawFlorinEn(cv.getContext("2d"), 30, 36, .95, f, performance.now() / 1000 + i);
    cel.appendChild(cv);
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = TIERS[f.tier].name.replace("Florín ", "") +
                     (f.variant ? " " + VARIANTES[f.variant].icon : "");
    cel.appendChild(nm);
    cel.addEventListener("click", () => {
      const k = fusElegidos.indexOf(i);
      if (k >= 0) fusElegidos.splice(k, 1);
      else if (fusElegidos.length < 2) fusElegidos.push(i);
      else fusElegidos = [fusElegidos[1], i];      // el más viejo cede el sitio
      renderFusion();
      Snd.unlock();
    });
    rejilla.appendChild(cel);
  });
  if (!llenos.length){
    rejilla.innerHTML = '<span class="rulMsg">Tu vitrina está vacía. Trae Florines primero.</span>';
  }
  /* El botón dice exactamente qué va a salir, para que nadie funda a ciegas. */
  if (fusElegidos.length < 2){
    btn.disabled = true; btn.textContent = "Elige dos";
    msg.textContent = llenos.length < 2 ? "Hacen falta dos Florines en la vitrina." : "";
    return;
  }
  const A = llenos[fusElegidos[0]].florin, B = llenos[fusElegidos[1]].florin;
  const r = queSaleDeFundir(A, B);
  if (!r.ok){
    btn.disabled = true; btn.textContent = "No se puede";
    msg.textContent = r.motivo || "";
    return;
  }
  const nombre = TIERS[r.tier].name + (r.variant ? " " + VARIANTES[r.variant].icon : "");
  btn.disabled = G.player.money < r.precio;
  btn.textContent = "Fundir · " + money(r.precio);
  msg.innerHTML = "Sale un <b>" + nombre + "</b>" +
    (G.player.money < r.precio ? " — te falta plata" : "");
}

document.getElementById("fusBtn").addEventListener("click", () => {
  if (fusElegidos.length !== 2) return;
  const ok = fundir(G, G.player, fusElegidos[0], fusElegidos[1]);
  if (ok){ fusElegidos = []; guardarPartidaAhora(); }
  renderFusion();
});

/* ---- el "entra aquí" que sale sobre tu cabeza ----
   La pista de antes decía "entra y toca 🧰 arriba": había que adivinar cuál de
   los seis iconos de la barra era ese. Encima del personaje no hay nada que
   adivinar, y en el celular queda al alcance del pulgar. */
const elAccion = document.getElementById("accion");
let accionActual = null;
elAccion.addEventListener("click", () => {
  if (accionActual && accionActual.startsWith("sitio:")) armarSitio(accionActual.slice(6));
  else if (accionActual) togglePanel(accionActual);
});

function pintarAccion(){
  const puedo = G && G.started && !G.over && !G.paused && !G.local2;
  const cual = !puedo ? null
    : panelDisponible("arm") ? "arm"
    : panelDisponible("fus") ? "fus"
    : panelDisponible("rul") ? "rul"
    : (G.player.enSitio && G.reglas?.modo !== "futbol" && G.reglas?.modo !== "tenis")
        ? "sitio:" + G.player.enSitio : null;
  const yaAbierto = !el.arm.hidden || !el.rul.hidden || !el.fus.hidden;
  if (!cual || yaAbierto){ elAccion.hidden = true; accionActual = null; return; }
  if (cual !== accionActual){
    accionActual = cual;
    elAccion.textContent = cual === "arm" ? "🧰 Entrar a la Armería"
      : cual === "fus" ? "⚗️ Abrir la Fusionadora"
      : cual === "sitio:futbol" ? "⚽ Armar la pichanga · " + ladoSel + " contra " + ladoSel
      : cual === "sitio:tenis" ? "🎾 Jugar tenis · uno contra uno"
      : cual === "sitio:basquet" ? "🏀 Jugar básquet · uno contra uno"
      : cual === "sitio:bolos" ? "🎳 Jugar bolos · dos turnos"
      : cual === "sitio:lucha" ? "🥊 Pelear en el ring · uno contra uno"
      : cual === "sitio:dardos" ? "🎯 Tirar dardos · cinco tiros"
      : cual === "sitio:voley" ? "🏐 Jugar voley · uno contra uno"
      : cual === "sitio:carreraObs" ? "🏃 Carrera de obstáculos · contra el rival"
      : cual === "sitio:laberinto" ? "🔮 Entrar al laberinto · recoge las gemas"
      : cual === "sitio:billar" ? "🎱 Jugar billar · una bola a la vez"
      : cual === "sitio:hockey" ? "🏒 Air hockey · uno contra uno"
      : "🎰 Girar la Ruleta · " + money(RULETA_PRECIO);
  }
  const p = G.player;
  elAccion.style.left = ((p.x - cam.x) * ZOOM) + "px";
  elAccion.style.top  = ((p.y - cam.y) * ZOOM - 58) + "px";
  elAccion.hidden = false;
}

/* ---- la pichanga desde el mundo ----
   Metiéndote a la canchita se arma el partido sin pasar por el menú. Tu partida
   queda GUARDADA aquí mismo —no en la nube, que puede no haberla— y al acabar el
   partido se vuelve a ella con todo donde estaba: el dinero, la vitrina, los
   ladrones a medio camino. La pichanga es un rato en el patio, no mudarse. */
let aventuraEnEspera = null;

/* Armar un minijuego es crear una partida CON ESE MODO. El motor hace el
   resto: monta su cancha y apaga el barrio.

   Antes esto creaba una partida de aventura y le rellenaba el estado del juego
   desde aquí (`aLaCanchaDeBasquet(G)`), con el modo en "aventura": el partido
   se dibujaba encima del patio y debajo seguían corriendo los ladrones, el
   desfile y los puestos — y el cartel de "Jugar básquet" volvía a salir DENTRO
   del básquet, porque el sitio seguía puesto. */
const MINIJUEGOS = {
  futbol:     "⚽ ¡Pichanga en el patio! Al terminar vuelves a lo tuyo.",
  tenis:      "🎾 ¡Al tenis! Primero a " + TENIS_META + " puntos.",
  basquet:    "🏀 ¡A básquet! Primero en 5 puntos.",
  bolos:      "🎳 ¡A bolos! Dos turnos.",
  lucha:      "🥊 ¡Al ring! Derriba al rival.",
  dardos:     "🎯 ¡Dardos! 5 tiradas cada uno.",
  voley:      "🏐 ¡Voley! Primero en 5 puntos.",
  carreraObs: "🏃 ¡Carrera de obstáculos!",
  laberinto:  "🔮 ¡Al laberinto! Recoge todas las gemas.",
  billar:     "🎱 ¡Billar! Entran todas las bolas.",
  hockey:     "🏒 ¡Air hockey! Primero a 7.",
};

function armarSitio(juego){
  if (!G || !G.started || G.over || G.local2 || G.player.enSitio !== juego) return;
  aventuraEnEspera = { estado: JSON.stringify(G), esc: G.esc.id };
  guardarPartidaAhora();                    // y en la nube también, si hay cuenta
  /* La del patio se juega en el patio: te metiste a ESE sitio. */
  G = juego === "futbol"
    ? nuevaPartidaMotor(1, "colegio", false, "normal", [], 0, ladoSel, "colegio")
    : nuevaPartidaMotor(1, "colegio", false, "normal", [], 0, 0, "colegio",
                        juego === "tenis" ? 1 : 0, juego === "tenis" ? null : juego);
  G.started = true;
  aLaCancha();
  invalidarSuelo();
  decir(MINIJUEGOS[juego], "bien");
  Snd.unlock();
}

/** De vuelta al barrio tras el partido, con la aventura como la dejaste. */
function volverDeLaPichanga(){
  if (!aventuraEnEspera) return false;
  const G2 = revivirPartida(aventuraEnEspera.estado);
  aventuraEnEspera = null;
  if (!G2){ decir("No se pudo volver a tu partida.", "mal"); return false; }
  G = G2;
  G.started = true;
  aLaCancha();
  invalidarSuelo();
  return true;
}

/* Quedó sin botones que repintar: la Armería y la Ruleta ya solo se abren
   desde el cartel que sale encima del personaje. Se deja la función porque la
   llaman desde varios sitios y así el día que vuelva a haber botones no hay
   que buscarlos. */
function renderBotonesPanel(){}

/* El menú solo ofrece los minijuegos que se juegan de principio a fin
   (`JUEGOS_LISTOS`, en el motor). Los que están a medias se quedan fuera del
   menú y fuera del mundo: entrar a uno que no se puede terminar es peor que no
   verlo. Se apuntan solos en cuanto su `listo` pase a true. */
for (const b of document.querySelectorAll("#minijuegosFila .modoBtn")){
  const j = b.dataset.modo;
  if (j && !JUEGOS_LISTOS.includes(j)) b.remove();
}

for (const b of document.querySelectorAll("#modoFila .modoBtn, #minijuegosFila .modoBtn"))
  b.addEventListener("click", () => elegirModoLocal(b.dataset.modo));

el.rulBtn.addEventListener("click", girarRuleta);
/* El 🏠 pregunta antes de salir. Está en la barra de arriba, pegado al libro y
   al sonido, y en una tableta se roza sin querer: perder la partida por eso es
   lo peor que puede pasar en un juego de acumular. */
const salirAviso = document.getElementById("salirAviso");
el.btnInicio.addEventListener("click", () => {
  if (!G || !G.started || G.over){ volverAlInicio(); return; }   // nada que perder
  document.getElementById("salirTxt").textContent = sala
    ? "Vas a salir de la sala. Los demás siguen jugando sin ti."
    : "Tu partida queda guardada y puedes seguirla desde el inicio.";
  salirAviso.hidden = false;
  if (!G.paused) togglePause();
});
const cerrarSalir = () => {
  salirAviso.hidden = true;
  if (G && G.started && !G.over && G.paused) togglePause();
};
document.getElementById("salirNo").addEventListener("click", cerrarSalir);
document.getElementById("salirSi").addEventListener("click", () => {
  salirAviso.hidden = true;
  volverAlInicio();
});
document.getElementById("btnAlbum").addEventListener("click", abrirAlbum);
document.getElementById("albumCerrar").addEventListener("click", cerrarAlbum);
aplicarZurdo();
/* ---- selector de escenario en la portada ---- */
const escFila = document.getElementById("escFila");
const escDesc = document.getElementById("escDesc");
const escBtns = ESCENARIOS.map((e, i) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "escBtn";
  b.innerHTML = '<span class="ic">' + e.icono + '</span><span>' + e.nombre + '</span>';
  b.setAttribute("aria-label", "Escenario " + e.nombre + ": " + e.desc);
  b.addEventListener("click", () => { elegirEscenario(i); empujarPreferencias(); });
  escFila.appendChild(b);
  return b;
});
/* ---- a qué jugamos ----
   El modo manda sobre el escenario: en carrera solo valen los que tienen
   circuito, y si el elegido no lo tiene se salta al primero que sí. */
const puedeCorrer = i => CIRCUITOS.some(c => c.id === ESCENARIOS[i].id);

/* Con qué corres: lo del escenario más lo que tengas en el Garaje. */
let vehSel = null;
const vehFila = document.getElementById("vehFila");
const vehTitulo = document.getElementById("vehTitulo");
try { vehSel = localStorage.getItem("florin_vehiculo") || null; } catch (_){}

/* Todo lo que se monta en el juego, no solo lo que hay tirado en este
   escenario: si existe la llama y el camello, se puede correr con ellos en
   cualquier sitio. Los de agua fuera del agua van un poco más lentos —de eso
   ya se encarga `multDeMontura`—, así que elegir tabla en el Volcán es una
   decisión tonta pero legítima. */
function vehiculosQuePuedoUsar(){
  const delSitio = (TRASTOS_ESCENARIO[ESCENARIOS[escSel].id] || [])
    .map(t => t.tipo).filter(t => VEHICULOS[t]);
  const normales = Object.keys(VEHICULOS).filter(t => !esEspecial(t));
  const mios = GARAJE.map(g => g.tipo).filter(tengoVehiculo);
  // primero lo del sitio, que es lo que pega, y después el resto
  return [...new Set([...delSitio, ...normales, ...mios])];
}

function pintarVehiculos(){
  const corriendo = modoElegido() === "carrera";
  vehTitulo.hidden = !corriendo;
  vehFila.hidden = !corriendo;
  if (!corriendo) return;
  const lista = vehiculosQuePuedoUsar();
  if (!lista.includes(vehSel)) vehSel = lista[0] || null;
  vehFila.innerHTML = "";
  for (const tipo of lista){
    const v = VEHICULOS[tipo];
    const b = document.createElement("button");
    b.type = "button";
    /* Clase propia aunque se vea igual: compartir `.escBtn` con los escenarios
       hacía que cualquier `querySelectorAll(".escBtn")` mezclara las dos filas. */
    b.className = "escBtn vehBtn" + (tipo === vehSel ? " sel" : "");
    b.innerHTML = '<span class="ic">' + v.icon + '</span><span>' + v.label + '</span>';
    b.setAttribute("aria-pressed", String(tipo === vehSel));
    b.addEventListener("click", () => {
      vehSel = tipo;
      try { localStorage.setItem("florin_vehiculo", tipo); } catch (_){}
      pintarVehiculos();
      Snd.unlock();
    });
    vehFila.appendChild(b);
  }
}

/* ---- vecinos que juegan ----
   Jugando solo, el barrio era tuyo: nadie más robaba. Ahora los vecinos pueden
   salir a jugar ellos mismos —los lleva `pensarBot`, el mismo de las salas— y
   cada uno que juega se queda con SU casa: deja de tener Florines que robarle y
   pasa a competir contigo. Por eso el tope es cinco y no ocho: con los ocho
   jugando no quedaría una sola casa a la que robar, que es el juego entero.
   (El motor sí admite llenar el mapa —nueve— porque entre personas es una
   partida legítima; el que se planta en cinco es este menú.) */
const RIVALES = [
  { n: 0, label: "Ninguno",  icon: "🙅", desc: "El barrio para ti solo: los vecinos se quedan en casa y solo salen ladrones." },
  { n: 1, label: "Uno",      icon: "🧒", desc: "El Marciano sale a jugar. Su nave deja de tener Florines: ahora te los roba a ti." },
  { n: 2, label: "Dos",      icon: "👦", desc: "El Marciano y Mayo. Dos que van a por los mismos Florines que tú." },
  { n: 3, label: "Tres",     icon: "👧", desc: "El Marciano, Mayo y la Sobri: tres rivales y cinco casas todavía llenas." },
  { n: 4, label: "Cuatro",   icon: "👨‍👦", desc: "Con Yuli, que corre más que nadie. Medio barrio jugando." },
  { n: 5, label: "Cinco",    icon: "👨‍👩‍👧‍👦", desc: "Y Doña Meche. El barrio entero detrás de los mismos Florines: no queda casa tranquila." },
];
const RIV_MAX = RIVALES[RIVALES.length - 1].n;
let rivSel = 0;
try { rivSel = Math.min(RIV_MAX, Math.max(0, +localStorage.getItem("florin_rivales") || 0)); } catch (_){}
const rivFila = document.getElementById("rivFila");
const rivTitulo = document.getElementById("rivTitulo");
const rivDesc = document.getElementById("rivDesc");

function pintarRivales(){
  const enAventura = modoElegido() === "aventura";
  rivTitulo.hidden = !enAventura;
  rivFila.hidden = !enAventura;
  rivDesc.hidden = !enAventura;
  if (!enAventura) return;
  rivFila.innerHTML = "";
  for (const R of RIVALES){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "escBtn rivBtn" + (R.n === rivSel ? " sel" : "");
    b.innerHTML = '<span class="ic">' + R.icon + '</span><span>' + R.label + '</span>';
    b.setAttribute("aria-pressed", String(R.n === rivSel));
    b.addEventListener("click", () => {
      rivSel = R.n;
      try { localStorage.setItem("florin_rivales", String(rivSel)); } catch (_){}
      pintarRivales(); Snd.unlock();
    });
    rivFila.appendChild(b);
  }
  rivDesc.textContent = (RIVALES.find(R => R.n === rivSel) || RIVALES[0]).desc;
}

/* ---- la pichanga ----
   Cuántos por lado. Los que faltan los llevan los bots, igual que los asientos
   libres de una carrera: una pichanga de uno contra nadie no es una pichanga. */
const LADOS = [
  { n: 3, label: "3 contra 3", icon: "⚽" },
  { n: 4, label: "4 contra 4", icon: "🥅" },
  { n: 5, label: "5 contra 5", icon: "🏆" },
];
/* Dónde se juega. El colegio es el de siempre; el estadio y la calle existen
   SOLO para esto (`soloFutbol`), así que no ensucian el selector de escenarios
   de la aventura. */
const CANCHAS = [
  { id: "colegio", label: "El colegio", icon: "🏫" },
  { id: "estadio", label: "El estadio", icon: "🏟️" },
  { id: "calle",   label: "La calle",   icon: "🛣️" },
];
let canchaSel = "colegio";
try { canchaSel = localStorage.getItem("florin_cancha") || "colegio"; } catch (_){}
if (!CANCHAS.some(c => c.id === canchaSel)) canchaSel = "colegio";
let ladoSel = 3;
try {
  const n = +localStorage.getItem("florin_futbol");
  if (LADOS.some(L => L.n === n)) ladoSel = n;
} catch (_){}

function pintarFutbol(){
  const hay = modoElegido() === "futbol";
  const fila = document.getElementById("futFila");
  const filaC = document.getElementById("canchaFila");
  document.getElementById("futTitulo").hidden = !hay;
  document.getElementById("canchaTitulo").hidden = !hay;
  fila.hidden = !hay;
  filaC.hidden = !hay;
  if (!hay) return;
  filaC.innerHTML = "";
  for (const C of CANCHAS){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "escBtn canchaBtn" + (C.id === canchaSel ? " sel" : "");
    b.innerHTML = '<span class="ic">' + C.icon + '</span><span>' + C.label + '</span>';
    b.setAttribute("aria-pressed", String(C.id === canchaSel));
    b.addEventListener("click", () => {
      canchaSel = C.id;
      try { localStorage.setItem("florin_cancha", canchaSel); } catch (_){}
      pintarFutbol(); Snd.unlock();
    });
    filaC.appendChild(b);
  }
  fila.innerHTML = "";
  for (const L of LADOS){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "escBtn futBtn" + (L.n === ladoSel ? " sel" : "");
    b.innerHTML = '<span class="ic">' + L.icon + '</span><span>' + L.label + '</span>';
    b.setAttribute("aria-pressed", String(L.n === ladoSel));
    b.addEventListener("click", () => {
      ladoSel = L.n;
      try { localStorage.setItem("florin_futbol", String(ladoSel)); } catch (_){}
      pintarFutbol(); Snd.unlock();
    });
    fila.appendChild(b);
  }
}

/* Qué tan brava es la carrera. La fila sale solo al elegir Carrera, igual que
   la de vehículos: en aventura la dificultad no pinta nada. */
let difSel = "normal";
const difFila = document.getElementById("difFila");
const difTitulo = document.getElementById("difTitulo");
const difDesc = document.getElementById("difDesc");

function pintarDificultad(){
  const corriendo = modoElegido() === "carrera";
  difTitulo.hidden = !corriendo;
  difFila.hidden = !corriendo;
  difDesc.hidden = !corriendo;
  if (!corriendo) return;
  difFila.innerHTML = "";
  for (const [id, D] of Object.entries(DIFICULTADES)){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "escBtn difBtn" + (id === difSel ? " sel" : "");
    b.innerHTML = '<span class="ic">' + D.icon + '</span><span>' + D.label + '</span>';
    b.setAttribute("aria-pressed", String(id === difSel));
    b.addEventListener("click", () => { difSel = id; pintarDificultad(); Snd.unlock(); });
    difFila.appendChild(b);
  }
  difDesc.textContent = DIFICULTADES[difSel].desc;
}

function elegirModoLocal(m){
  for (const b of document.querySelectorAll("#modoFila .modoBtn, #minijuegosFila .modoBtn")){
    const suyo = b.dataset.modo === m;
    b.classList.toggle("sel", suyo);
    b.setAttribute("aria-pressed", String(suyo));
  }
  const esMinijuego = ["basquet","bolos","lucha","dardos","carreraObs","laberinto","billar","hockey"].includes(m);
  escBtns.forEach((b, k) => {
    const no = (m === "carrera" && !puedeCorrer(k)) || esMinijuego;
    b.classList.toggle("nocorre", no);
    b.disabled = no;
  });
  if (m === "carrera" && !puedeCorrer(escSel))
    elegirEscenario(ESCENARIOS.findIndex(e => e.id === CIRCUITOS[0].id));
  pintarVehiculos();
  pintarDificultad();
  pintarRivales();
  pintarFutbol();
  rotularBotonJugar();
  const sel = document.getElementById("salaModo");
  if (sel){
    if (m === "carrera" || m === "futbol") sel.value = m;
    else if (sel.value === "carrera" || sel.value === "futbol") sel.value = "aventura";
  }
  Snd.unlock();
}

/** Qué dice el botón grande. Depende del modo y de si hay partida guardada, y
    los dos cambian por su cuenta: por eso se decide en un solo sitio. */
function rotularBotonJugar(){
  const b = document.getElementById("btnStart");
  if (!b) return;
  const m = modoElegido();
  if (m === "futbol"){ b.textContent = "Jugar la pichanga ▸"; return; }
  if (m === "carrera"){ b.textContent = "Correr ▸"; return; }
  const labels = { basquet:"Jugar básquet ▸", bolos:"Jugar bolos ▸", lucha:"Pelear ▸",
    dardos:"Tirar dardos ▸", carreraObs:"Correr obstáculos ▸", laberinto:"Entrar al laberinto ▸",
    billar:"Jugar billar ▸", hockey:"Jugar air hockey ▸" };
  if (labels[m]){ b.textContent = labels[m]; return; }
  b.textContent = (typeof guardadaEnLaNube !== "undefined" && guardadaEnLaNube
    ? "Empezar de cero ▸" : "Jugar solo ▸");
}

function elegirEscenario(i){
  escSel = i;
  try { localStorage.setItem("florin_escenario", ESCENARIOS[i].id); } catch (_){}
  escBtns.forEach((b, k) => {
    b.classList.toggle("sel", k === i);
    b.setAttribute("aria-pressed", String(k === i));
  });
  escDesc.textContent = ESCENARIOS[i].desc;
  pintarVehiculos();
  Snd.unlock();
}
elegirEscenario(escSel);
/* El menú abre en Aventura, así que su fila tiene que estar pintada desde el
   principio: las otras las pinta `elegirModoLocal` al cambiar de modo. */
pintarRivales();
pintarFutbol();

/* ============================================================
   Cuenta en la nube (opcional)
   ============================================================
   El juego entero funciona sin esto: si no hay servidor, el bloque de la cuenta
   ni siquiera aparece y todo sigue en localStorage. Tener cuenta solo agrega
   que el álbum y la partida te sigan a otro navegador, y que salgas en el
   ranking. */
const elCuenta = {
  caja:     document.getElementById("cuenta"),
  entrar:   document.getElementById("cuentaEntrar"),
  hola:     document.getElementById("cuentaHola"),
  email:    document.getElementById("cuentaEmail"),
  clave:    document.getElementById("cuentaClave"),
  apodo:    document.getElementById("cuentaApodo"),
  btnEntrar:document.getElementById("cuentaBtnEntrar"),
  btnReg:   document.getElementById("cuentaBtnRegistro"),
  btnSalir: document.getElementById("cuentaBtnSalir"),
  nombre:   document.getElementById("cuentaNombre"),
  msg:      document.getElementById("cuentaMsg"),
  rank:     document.getElementById("rankLista"),
};
let modoRegistro = false;      // el mismo formulario sirve para entrar y para registrarse

function decir(texto, clase){
  elCuenta.msg.textContent = texto || "";
  elCuenta.msg.className = "cuentaMsg" + (clase ? " " + clase : "");
}

function pintarRanking(items){
  if (!items || !items.length){ elCuenta.rank.hidden = true; return; }
  const yo = nube.jugador?.apodo;
  elCuenta.rank.innerHTML = items.map((r, i) =>
    '<li' + (r.apodo === yo ? ' class="yo"' : '') + '>' +
      '<span class="pos">' + (i + 1) + '</span>' +
      '<span class="quien">' + r.apodo.replace(/[<>&]/g, "") + '</span>' +
      '<span class="plata">' + money(r.mejorDinero) + '</span>' +
    '</li>').join("");
  elCuenta.rank.hidden = false;
}

/** Trae el ranking y, de paso, nos dice si hay servidor: si no, no molestamos. */
async function despertarCuenta(){
  const items = await nube.ranking();
  if (items === null && !nube.hayCuenta) return;     // sin API y sin sesión: ni se muestra
  elCuenta.caja.hidden = false;
  pintarRanking(items);
}

/** El álbum se une, no se pisa: lo que tengas aquí y lo que tengas allá. */
async function sincronizarAlbum(){
  const remoto = await nube.traerAlbum();
  if (!remoto) return;
  let nuevasAqui = 0;
  for (const k of remoto) if (!album[k]){ album[k] = 1; nuevasAqui++; }
  if (nuevasAqui) guardarAlbumLocal();

  const enRemoto = new Set(remoto);
  for (const k of Object.keys(album)){
    if (enRemoto.has(k)) continue;
    const [tier, variante] = k.split(":");
    nube.registrarEnAlbum(+tier, variante === "base" ? null : variante);
  }
  if (nuevasAqui && !document.getElementById("album").hidden) renderAlbum();
  return nuevasAqui;
}

/** Al entrar, la cuenta manda: tus preferencias son las que guardaste. */
async function traerPreferencias(){
  const p = await nube.perfil();
  if (!p) return;
  const i = ESCENARIOS.findIndex(e => e.id === p.escenarioPreferido);
  if (i >= 0 && i !== escSel) elegirEscenario(i);
  if (p.zurdo !== zurdo) toggleZurdo();
}

const empujarPreferencias = () => {
  if (nube.hayCuenta) nube.guardarPreferencias(
    nube.jugador.apodo, ESCENARIOS[escSel].id, zurdo);
};

/** Todo lo que cambia cuando alguien entra o sale de su cuenta. */
async function alEntrarOSalir(jugador){
  elCuenta.entrar.hidden = !!jugador;
  elCuenta.hola.hidden = !jugador;
  if (!jugador){ btnSeguir.hidden = true; rotularBotonJugar(); refrescarOnline(); return; }
  elCuenta.nombre.textContent = jugador.apodo;
  if (nube.desconectado){
    decir("El servidor no responde. Puedes jugar igual: tu progreso queda en este navegador.", "mal");
    btnSeguir.hidden = true;
    rotularBotonJugar();
    refrescarOnline();
    return;
  }
  await traerPreferencias();
  const nuevas = await sincronizarAlbum();
  if (nuevas) decir("Recuperamos " + nuevas + " lámina(s) de tu álbum.", "bien");
  await buscarPartidaGuardada();
  refrescarOnline();
  pintarRanking(await nube.ranking());
}

async function intentar(accion, fn){
  elCuenta.btnEntrar.disabled = elCuenta.btnReg.disabled = true;
  decir(accion + "…");
  try { await fn(); decir(""); }
  catch (e){ decir(e.message || "No se pudo.", "mal"); }
  finally { elCuenta.btnEntrar.disabled = elCuenta.btnReg.disabled = false; }
}

elCuenta.btnEntrar.addEventListener("click", () => {
  const email = elCuenta.email.value.trim(), clave = elCuenta.clave.value;
  if (!email || !clave) return decir("Falta el correo o la contraseña.", "mal");
  intentar("Entrando", () => nube.entrar(email, clave));
});

elCuenta.btnReg.addEventListener("click", () => {
  if (!modoRegistro){                       // primer clic: pide el apodo y se queda esperando
    modoRegistro = true;
    elCuenta.apodo.hidden = false;
    elCuenta.apodo.focus();
    elCuenta.btnReg.textContent = "Crear cuenta ▸";
    return decir("Elige un apodo: es el que sale en el ranking.");
  }
  const email = elCuenta.email.value.trim(), clave = elCuenta.clave.value;
  const apodo = elCuenta.apodo.value.trim();
  if (!email || !clave || !apodo) return decir("Faltan datos: correo, contraseña y apodo.", "mal");
  intentar("Creando la cuenta", () => nube.registro(email, clave, apodo));
});

elCuenta.btnSalir.addEventListener("click", () => {
  nube.salir();
  decir("Listo. Tu álbum sigue guardado en este navegador.");
});

for (const campo of [elCuenta.email, elCuenta.clave, elCuenta.apodo])
  campo.addEventListener("keydown", e => {
    if (e.key === "Enter") (modoRegistro ? elCuenta.btnReg : elCuenta.btnEntrar).click();
  });

/* ---- guardado automático ----
   Cada GUARDA_CADA segundos de partida, no de reloj: si pausas, no se guarda.
   Solo en un jugador; el duelo local es de una sentada. */
const GUARDA_CADA = 15;
let guardaEn = GUARDA_CADA;

function guardarSiTocaEn(dt){
  if (!nube.hayCuenta || G.local2) return;
  guardaEn -= dt;
  if (guardaEn > 0) return;
  guardaEn = GUARDA_CADA;
  guardarPartidaAhora();
}

function guardarPartidaAhora(){
  if (!nube.hayCuenta || G.local2 || !G.started) return;
  nube.guardarPartida({
    escenario: G.esc.id,
    dinero: Math.round(G.player.money),
    hito: G.hitoN,
    segundos: G.t,
    estado: JSON.stringify(G),
  });
}


/* ---- seguir la partida guardada ---- */
const btnSeguir = document.getElementById("btnSeguir");
let guardadaEnLaNube = null;

const btnUno = document.getElementById("btnStart");

async function buscarPartidaGuardada(){
  guardadaEnLaNube = nube.hayCuenta ? await nube.cargarPartida() : null;
  const hay = !!guardadaEnLaNube;
  btnSeguir.hidden = !hay;
  // Solo se guarda una partida por jugador, así que empezar otra pisa la vieja.
  // Que el botón lo diga es más honesto que un cartel de confirmación.
  rotularBotonJugar();
  pintarBotonSeguir();
}

/* Volver a la partida que sigue viva y pausada. Vale con y sin cuenta: es la
   que tienes en la mano, no la de la nube. */
const btnVolver = document.getElementById("btnVolver");
function pintarBotonVolver(){
  btnVolver.hidden = !(G && G.started && !G.over && !sala);
}
btnVolver.addEventListener("click", () => {
  if (!G || !G.started || G.over) return;
  cerrarTienda();
  aLaCancha();
  Snd.unlock();
});

/** El rótulo del botón, aparte: la Tienda lo repinta al cobrar o al pagar sin
    tener que volver a preguntarle al servidor. */
function pintarBotonSeguir(){
  const g = guardadaEnLaNube;
  btnSeguir.hidden = !g;
  if (!g) return;
  btnSeguir.textContent =
    "Seguir donde quedaste ▸ " + money(g.dinero) + " · " + mmss(g.segundos);
}

btnSeguir.addEventListener("click", () => {
  const G2 = guardadaEnLaNube && revivirPartida(guardadaEnLaNube.estado);
  if (!G2){
    decir("Esa partida guardada ya no se puede abrir. Empieza una nueva.", "mal");
    btnSeguir.hidden = true;
    return;
  }
  G = G2;
  G.started = true;
  aLaCancha();
  invalidarSuelo();
  Snd.unlock();
});

/** Elegir arma: en una sala lo decide el servidor, aquí solo se pide. */
function elegirArma(i){
  if (sala) sala.arma(i); else seleccionarArma(G, G.player, i);
  renderWbar();
}

/* ============================================================
   Salas con amigos
   ============================================================
   El servidor manda; aquí solo se manda lo que tocas y se dibuja lo que llega.
   El mundo de una sala NO se simula en el cliente: si lo hiciera, cada uno
   vería un juego distinto en cuanto hubiera un milisegundo de diferencia. */
let sala = null;

const URL_SALAS = (import.meta.env?.VITE_SALAS
  || location.origin.replace(/^http/, "ws").replace(":5180", ":5182"));

const elSala = {
  caja:   document.getElementById("online"),
  aviso:  document.getElementById("salaAviso"),
  sinCuenta: document.getElementById("salaSinCuenta"),
  modo:   document.getElementById("salaModo"),
  codigo: document.getElementById("salaCodigo"),
  crear:  document.getElementById("btnCrearSala"),
  entrar: document.getElementById("btnEntrarSala"),
  msg:    document.getElementById("salaMsg"),
  panel:  document.getElementById("sala"),
  cod:    document.getElementById("salaCod"),
  modoTxt:document.getElementById("salaModoTxt"),
  gente:  document.getElementById("salaGente"),
  estado: document.getElementById("salaEstado"),
  salir:  document.getElementById("salaSalir"),
  arrancar: document.getElementById("salaArrancar"),
};

const decirSala = (t, mal) => {
  elSala.msg.textContent = t || "";
  elSala.msg.className = "cuentaMsg" + (mal ? " mal" : "");
};

/** Solo se puede entrar a una sala con cuenta: la sala guarda tu patio. */
function refrescarOnline(){
  const hay = nube.hayCuenta && !nube.desconectado;
  elSala.caja.hidden = !hay;
  elSala.sinCuenta.hidden = hay;
  elSala.aviso.textContent = hay ? "" : "— hazte una cuenta arriba";
}

function pintarGente(){
  const g = sala?.estado.gente || [];
  elSala.gente.innerHTML = g.map(x =>
    '<li class="' + (x.conectado ? "" : "ido") + '"><span class="pip"></span>' +
    x.apodo.replace(/[<>&]/g, "") + (x.idx === sala.estado.idx ? " (tú)" : "") +
    (x.conectado ? "" : " · se cayó") + '</li>').join("");
  /* El botón de dar la salida solo mientras la carrera espera en la línea. */
  const esperando = !!sala?.estado.enParrilla;
  elSala.arrancar.hidden = !esperando;
  if (esperando) elSala.arrancar.disabled = sala.estado.cuenta != null;
}

function conectar(opciones){
  if (sala) sala.cerrar();
  decirSala("Conectando…");
  sala = conectarSala({
    url: URL_SALAS,
    token: JSON.parse(localStorage.getItem("florin_sesion") || "{}").accessToken,
    apodo: nube.jugador?.apodo,
    vehiculo: vehSel || undefined,
    ...opciones,
    al: ev => {
      if (ev.tipo === "entrado"){
        decirSala("");
        G = conAtajosMotor(sala.estado.mundo, sala.estado.idx);
        G.started = true;
        aLaCancha();
        invalidarSuelo();
        elSala.panel.hidden = false;
        elSala.cod.textContent = sala.estado.codigo;
        elSala.modoTxt.textContent = sala.estado.modo;
        elSala.estado.textContent = "";
        pintarGente();
        if (sala.estado.enParrilla)
          decirSala("En la parrilla. Cuando estén todos, den la salida.");
        Snd.unlock();
      } else if (ev.tipo === "salida"){
        pintarCuentaAtras(ev.en);
        pintarGente();
      } else if (ev.tipo === "gente"){
        pintarGente();
      } else if (ev.tipo === "eventos"){
        // los eventos del motor llegan por la red: se pintan y suenan igual
        G.eventos = ev.eventos;
        consumirEventos();
        G.eventos = [];
      } else if (ev.tipo === "caido"){
        elSala.estado.textContent = "Se cortó… reconectando";
      } else if (ev.tipo === "error"){
        decirSala(ev.motivo, true);
        salirDeLaSala();
      }
    },
  });
}

/* Volver al inicio. Desde una sala te devuelve al lobby; jugando solo, guarda
   antes de salir para que "Seguir donde quedaste" tenga qué seguir. */
function volverAlInicio(){
  /* Lo primero, quitar el cartel del final: es una capa por encima de todo y si
     se queda puesta, el inicio aparece detrás y no se puede tocar nada. */
  el.end.hidden = true;
  if (sala){ salirDeLaSala(); return; }
  if (G && G.started && !G.over) guardarPartidaAhora();
  el.arm.hidden = true; el.rul.hidden = true;
  abrirArmas(false);
  cerrarBautizo();
  document.getElementById("album").hidden = true;
  if (!G.paused) togglePause();
  el.title.hidden = false;
  pintarBotonVolver();
  buscarPartidaGuardada();
}

function salirDeLaSala(){
  sala?.cerrar();
  sala = null;
  elSala.panel.hidden = true;
  el.title.hidden = false;
}

elSala.crear.addEventListener("click", () => {
  /* En un partido, el "escenario" es la CANCHA: el estadio y la calle no están
     en el selector de la portada, que es para elegir dónde robar Florines. */
  const modo = elSala.modo.value;
  conectar({ modo, escenario: modo === "futbol" ? canchaSel : ESCENARIOS[escSel].id });
});
elSala.entrar.addEventListener("click", () => {
  const c = elSala.codigo.value.trim().toUpperCase();
  if (c.length !== 4) return decirSala("El código son 4 letras.", true);
  conectar({ codigo: c });
});
elSala.codigo.addEventListener("keydown", e => { if (e.key === "Enter") elSala.entrar.click(); });
/* Los dos selectores de modo son el mismo ajuste: el de la portada y el del
   lobby se siguen el uno al otro. */
elSala.modo.addEventListener("change", () => elegirModoLocal(
  elSala.modo.value === "carrera" ? "carrera" : "aventura"));
elSala.arrancar.addEventListener("click", () => {
  sala?.arrancar();
  elSala.arrancar.disabled = true;
});
elSala.salir.addEventListener("click", salirDeLaSala);

/* ---- la ranura del objeto ----
   Mientras la ruleta gira se ven iconos pasando: no saber qué te tocó es la
   mitad de la gracia. */
const elItem = document.getElementById("itemSlot");
const elItemIc = document.getElementById("itemIc");
const elItemNm = document.getElementById("itemNm");

function usarMiItem(){
  if (!G || !G.started || G.over) return;
  const it = G.player?.item;
  if (!it || !it.que || it.girando > 0) return;
  if (sala) sala.item(); else usarPotenciador(G, G.player);
}
/* `pointerdown` y no `click`: con el otro pulgar apoyado en el joystick, Safari
   se guarda el `click` hasta que sueltas el primer dedo. Así el objeto sale en
   cuanto lo tocas, sin dejar de conducir. */
elItem.addEventListener("pointerdown", e => { e.preventDefault(); usarMiItem(); });
elItem.addEventListener("click", e => e.preventDefault());

function pintarItem(){
  const corriendo = G.reglas?.modo === "carrera";
  const it = corriendo ? G.player?.item : null;
  if (!it || (!it.que && it.girando <= 0)){ elItem.hidden = true; return; }
  elItem.hidden = false;
  if (it.girando > 0){
    const lista = potenciadoresDe(G.esc.id);
    const cual = lista[(Math.floor(G.t * 14) % lista.length + lista.length) % lista.length];
    elItem.classList.add("girando"); elItem.classList.remove("listo");
    elItemIc.textContent = cual.icon;
    elItemNm.textContent = "…";
    return;
  }
  const pot = potenciadorPorId(it.que);
  elItem.classList.remove("girando"); elItem.classList.add("listo");
  elItemIc.textContent = pot ? pot.icon : "?";
  elItemNm.textContent = pot ? pot.nombre : "";
}

/* El 3 · 2 · 1 · ¡YA! de la salida, a pantalla completa. */
const elSalida = document.getElementById("cuentaAtras");
let borrarCuenta = null;
function pintarCuentaAtras(en){
  clearTimeout(borrarCuenta);
  elSalida.textContent = en > 0 ? String(en) : "¡YA!";
  elSalida.hidden = false;
  Snd.unlock();
  borrarCuenta = setTimeout(() => { elSalida.hidden = true; }, en > 0 ? 1100 : 900);
}

/* Recién acá, con todo el formulario montado, se enchufa la cuenta. */
nube.alCambiar(alEntrarOSalir);
/* El botón de programar fiestas aparece y desaparece con la sesión. */
nube.alCambiar(() => { document.getElementById("btnAdmin").hidden = !nube.esAdmin; });
despertarCuenta();

/* La fiesta se pregunta al entrar y cada minuto. Un evento empieza a una hora,
   no a un segundo: sondear más seguido sería gastar batería por nada. */
mirarSiHayFiesta();
setInterval(mirarSiHayFiesta, FIESTA_CADA);

document.getElementById("btnStart").addEventListener("click", () => startGame(1));
document.getElementById("btnAgain").addEventListener("click", () => startGame());
/* La otra salida del final. Sin esto, terminar una carrera te dejaba con un
   único botón que repetía carrera: para pasarte a aventura había que recargar
   la página, porque el panel de fin tapa la barra de arriba con el 🏠. */
document.getElementById("btnMenu").addEventListener("click", volverAlInicio);
/* Tras una pichanga armada desde el patio, la salida natural es volver a lo que
   estabas haciendo, no al menú. */
document.getElementById("btnVolverBarrio").addEventListener("click", () => {
  el.end.hidden = true;
  if (!volverDeLaPichanga()) volverAlInicio();
});
/* El duelo de dos en un teclado se retiró al llegar las salas: jugar con gente
   es online. El motor sigue sabiendo de N jugadores, así que no se perdió nada
   — lo que se fue es el reparto de teclas de un solo teclado. */

/* Safari en iPad hace zoom con la pinza aunque el viewport diga que no, y con
   dos pulgares jugando eso pasa solo. `gesturestart` es lo único que lo para. */
for (const g of ["gesturestart", "gesturechange", "gestureend"])
  document.addEventListener(g, e => e.preventDefault(), { passive: false });
/* Y el doble toque rápido, que en iOS sigue haciendo zoom pese a touch-action
   cuando cae FUERA de un botón.

   Lo de "fuera de un botón" estaba en el comentario y no en el código, y eso
   rompía la Armería en tableta: cancelar un `touchend` se lleva por delante el
   `click` que iOS genera después, así que la segunda arma que tocabas no se
   compraba. Y bastaba con venir del joystick o del botón de entrar para que la
   PRIMERA ya cayera dentro de los 320 ms. Sobre un control no se cancela nunca:
   ahí el doble toque no hace zoom, hace lo que dice el botón. */
let ultimoToque = 0;
const CONTROLES = 'button, a, input, select, textarea, label, [role="button"]';
document.addEventListener("touchend", e => {
  const ahora = Date.now();
  const enUnControl = e.target instanceof Element && e.target.closest(CONTROLES);
  if (!enUnControl && ahora - ultimoToque < 320) e.preventDefault();
  ultimoToque = ahora;
}, { passive: false });

const isTouch = matchMedia("(pointer: coarse)").matches;

/* Si el celular se pone vertical, además del cartel de "gira el teléfono" hay
   que PARAR la partida: si no, te siguen robando mientras giras el aparato. */
{
  const vertical = matchMedia("(pointer:coarse) and (orientation:portrait) and (max-width:560px)");
  const mirar = () => {
    if (vertical.matches && G && G.started && !G.over && !G.paused) togglePause();
  };
  vertical.addEventListener?.("change", mirar);
  addEventListener("orientationchange", () => setTimeout(mirar, 120));
}

/* Las reglas van abiertas con ratón y plegadas en el celular, donde ocupaban
   tres pantallas de scroll por delante del botón de jugar. El corte es por
   ALTO y no por ancho: lo que hace ilegible la portada es que no quepa a lo
   largo, y eso incluye un teléfono en horizontal (~390 px). */
{
  const como = document.getElementById("comoSeJuega");
  if (como) como.open = !isTouch && innerHeight >= 700;
}
if (isTouch){
  el.touch.classList.add("on");
  document.getElementById("app").classList.add("touch");
}

/* ============================================================
   Bautizar Florines: acércate a uno de tu vitrina y ponle nombre
   ============================================================ */
const bau = {
  caja:   document.getElementById("bautizo"),
  input:  document.getElementById("bautizoInput"),
  que:    document.getElementById("bautizoQue"),
  titulo: document.getElementById("bautizoTitulo"),
  boton:  document.getElementById("nameBtn"),
  soltar: document.getElementById("dropBtn"),
  bajar:  document.getElementById("bajarBtn"),
  vender: document.getElementById("bautizoVender"),
  ped: null,
};

// El pedestal de TU vitrina que tienes al lado (o null)
function florinAlLado(){
  if (!G || !G.started || G.over) return null;
  let cerca = null, d2 = 66*66;
  /* Solo TU vitrina: en una sala, los patios de los demás son suyos y no se
     bautizan ni se venden desde aquí. */
  for (const p of (G.local2 ? G.players : [G.player]))
    for (const b of patiosDe(G, p)) for (const ped of b.peds){
      if (!ped.florin) continue;
      const d = dist2(p.x, p.y, ped.x, ped.y);
      if (d < d2){ d2 = d; cerca = ped; }
    }
  return cerca;
}

function abrirBautizo(){
  const ped = florinAlLado();
  if (!ped) return;
  bau.ped = ped;
  const T = TIERS[ped.florin.tier];
  bau.titulo.textContent = ped.florin.nombre ? "Cámbiale el nombre" : "Bautiza tu Florín";
  bau.que.textContent = T.name + " · " + T.rar + " · " + florNombre(ped.florin) +
    (ped.florin.variant ? " " + varLabel(ped.florin.variant) : "") +
    " · " + florinIncome(ped.florin) + "/s";
  bau.vender.textContent = "Vender por " + money(precioDeVenta(ped.florin));
  bau.input.value = ped.florin.nombre || "";
  bau.caja.hidden = false;
  if (!G.paused) togglePause();          // que no te roben mientras escribes
  setTimeout(() => { bau.input.focus(); bau.input.select(); }, 30);
}

function cerrarBautizo(){
  bau.caja.hidden = true;
  bau.ped = null;
  if (G.paused) togglePause();
}

function guardarNombre(){
  if (!bau.ped || !bau.ped.florin){ cerrarBautizo(); return; }
  const n = bau.input.value.trim().slice(0, 14);
  bau.ped.florin.nombre = n || null;
  if (n){
    pop(bau.ped.x, bau.ped.y - 78, "¡Se llama " + n + "!", "#3DDC97");
    puff(bau.ped.x, bau.ped.y - 20, TIERS[bau.ped.florin.tier].petal, 10);
    Snd.place();
  }
  cerrarBautizo();
}

/** Vender el Florín que tienes al lado: te lo pagan y el hueco queda libre. */
function venderElDeAlLado(){
  const ped = bau.ped;
  if (!ped || !ped.florin) return;
  const ref = refDelPedestal(ped);
  if (!ref) return;
  if (sala) sala.vender(ref.b, ref.i);
  else venderFlorin(G, G.player, ref);
  cerrarBautizo();
}

/** De un pedestal a su {b, i}, que es como lo nombra el motor. */
function refDelPedestal(ped){
  for (const b of G.bases){
    const i = b.peds.indexOf(ped);
    if (i >= 0) return { b: b.id, i };
  }
  return null;
}

bau.soltar.addEventListener("click", soltarLoQueLlevo);
/** ¿Vas montado en algo y sin ningún panel encima? Es lo que decide si se ve
    el botón de bajarse, y lo preguntan las dos ramas del HUD. */
const montado = () => G.player.montado != null && bau.caja.hidden;
/* Bajarse de lo que montas, con botón propio. Antes solo estaba la tecla, que
   en tableta no existe: te subías a un elefante y ya no te bajabas. */
function bajarmeYa(){
  if (!G || !G.started || G.over || G.player.montado == null) return;
  bajarseDelTrasto();          // la de siempre: en sala lo manda el servidor
  Snd.unlock();
}
bau.bajar.addEventListener("click", bajarmeYa);
bau.vender.addEventListener("click", venderElDeAlLado);
document.getElementById("bautizoOk").addEventListener("click", guardarNombre);
document.getElementById("bautizoCancelar").addEventListener("click", cerrarBautizo);
document.getElementById("bautizoQuitar").addEventListener("click", () => {
  if (bau.ped && bau.ped.florin) bau.ped.florin.nombre = null;
  cerrarBautizo();
});
bau.input.addEventListener("keydown", e => {
  e.stopPropagation();                    // que WASD no mueva al jugador mientras escribes
  if (e.key === "Enter") guardarNombre();
  if (e.key === "Escape") cerrarBautizo();
});
bau.boton.addEventListener("click", e => { e.preventDefault(); abrirBautizo(); });

function togglePause(){
  if (!G.started || G.over) return;
  G.paused = !G.paused;
  el.pause.textContent = G.paused ? "▶" : "⏸";
}
function toggleSound(){
  const m = Snd.toggle();
  el.sound.textContent = m ? "🔇" : "🔊";
}

/* ============================================================
   Acciones
   ============================================================ */
function pop(x, y, text, color){
  pops.push({ x, y, text, color, life:1.1 });
}
function puff(x, y, color, n=8){
  if (REDUCED) return;
  for (let i=0;i<n;i++)
    puffs.push({ x, y, vx:azar2(-70,70), vy:azar2(-110,-20), life:azar2(.35,.7), color, r:azar2(2,5) });
}

/* ---- armas ---------------------------------------------------- */


/* El paraguas: se come el próximo golpe y se gasta. Solo lo llevan los jugadores.
   Tras aguantar deja un margen de invulnerabilidad: la abuela golpea en cada
   frame mientras la tengas encima, así que sin margen el escudo no servía de nada. */








/* Versiones para jugadores: con patios comprables, "tu vitrina" son varios patios */

/* ============================================================
   Seguridad láser de los patios propios
   ============================================================ */

/* ¿Este punto está dentro de un patio cerrado a cal y canto? */

/* ============================================================
   El desfile del portal
   ============================================================
   El recorrido tiene tres tramos: bajar en línea recta del portal a la Armería,
   darle una vuelta completa, y subir de vuelta al portal. Portal, Armería y
   Ruleta comparten la columna del centro, así que la bajada es vertical. */
const PORTAL_BAJADA = .26, PORTAL_ORBITA = .48;   // fracciones del recorrido


/* Dónde está un Florín del desfile según lo avanzado de su recorrido (0 a 1) */



/* ============================================================
   Ruleta de Florines
   ============================================================ */

/* Traduce una casilla en el premio concreto que te vas a llevar */


/* Entrega el premio: el Florín te lo llevas en brazos, o al suelo si vas cargado */

/* ---- la tira que rueda: puro adorno, el premio ya está decidido ---- */
const RUL_CEL_W = 114;                        // 108 de celda + 6 de hueco
const RUL_IDX = 18;                           // dónde se planta el premio
function celdaDeCasilla(e){
  if (e.kind === "dinero")    return { txt: money(e.monto), col:"#FFC53D" };
  if (e.kind === "arma")      return { txt: "🎁 Arma", col:"#BFE9FF" };
  if (e.kind === "incognita") return { txt: "???", col:"#8B6BEE" };
  const T = TIERS[e.tier];
  return { txt: T.rar, col: RAR_COLOR[T.rar] || "#FFEFE2" };
}
function celdaDePremio(pr){
  if (pr.kind === "dinero") return { txt: money(pr.monto), col:"#FFC53D" };
  if (pr.kind === "arma")   return { txt: WEAPONS[pr.arma].icon + " Arma", col:"#BFE9FF" };
  const T = TIERS[pr.tier];
  return { txt: (pr.variant ? VARIANTES[pr.variant].icon + " " : "") + T.rar,
           col: pr.variant ? VARIANTES[pr.variant].color : (RAR_COLOR[T.rar] || "#FFEFE2") };
}
function pintarCelda(c){
  const d = document.createElement("div");
  d.className = "rulCel";
  d.textContent = c.txt;
  d.style.borderColor = c.col;
  d.style.color = c.col;
  return d;
}
/* Una casilla al azar para rellenar la tira. Es adorno, así que tira del azar
   del cliente: el del motor está reservado para lo que decide la partida, y
   gastarlo aquí desincronizaría una sala. */
function casillaDeAdorno(){
  const total = RULETA.reduce((s, x) => s + x.p, 0);
  let r = azar2(0, total);
  for (const fila of RULETA){ r -= fila.p; if (r <= 0) return fila; }
  return RULETA[RULETA.length - 1];
}

/* Con premio, lo planta en RUL_IDX; sin premio, es solo adorno al abrir el puesto */
function construirTira(premio){
  el.rulStrip.style.transform = "translateX(0px)";
  el.rulStrip.innerHTML = "";
  for (let i=0;i<RUL_IDX+8;i++){
    el.rulStrip.appendChild(pintarCelda(
      premio && i === RUL_IDX ? celdaDePremio(premio) : celdaDeCasilla(casillaDeAdorno())));
  }
}


function renderRuleta(){
  if (el.rul.hidden) return;
  el.rulMon.textContent = money(G.money);
  const g = G.girando;
  if (g){
    const k = clamp(g.t/g.dur, 0, 1);
    const e = 1 - Math.pow(1-k, 3);                 // frena suave
    el.rulStrip.style.transform = "translateX(" + (-g.destino*e) + "px)";
    el.rulBtn.disabled = true;
    el.rulMsg.textContent = "Girando…";
    return;
  }
  el.rulBtn.disabled = G.money < RULETA_PRECIO;
  el.rulBtn.textContent = "Girar · " + money(RULETA_PRECIO);
  if (G.ultimoPremio) el.rulMsg.innerHTML = "¡Te llevas <b>" + textoDePremio(G.ultimoPremio) + "</b>!";
  else el.rulMsg.innerHTML = G.money < RULETA_PRECIO
    ? "Te falta plata para girar: junta " + money(RULETA_PRECIO) + "."
    : "Hay casillas <b>???</b>: de ahí salen las variantes ✨ y 🌈.";
}

/* Comprar un patio extra: por proximidad, sin teclas nuevas */




/* ============================================================
   Update
   ============================================================ */

/* Todo lo que le pasa a UN jugador. Con dos, esto corre dos veces. */

/* ============================================================
   Dibujo del mundo
   ============================================================ */
const cam = { x:0, y:0 };

/* ============================================================
   El suelo y su decorado
   ============================================================
   Se pinta UNA vez por partida en un canvas del tamaño del mundo y luego solo se
   estampa: así el decorado puede ser todo lo rico que quiera sin costar nada por
   frame. Se invalida al empezar partida (cambio de escenario). */
let sueloCv = null;

/* ---- el suelo por mosaicos ----
   Un solo lienzo del tamaño del mundo tiene techo: iOS no pasa de 16,7 Mpx, y
   un valle de varias zonas se sale de largo. Así que el suelo se guarda en
   trozos de MOSAICO px y solo se pintan los que se ven; el resto ni existe.
   Con eso el tamaño del mapa deja de ser un límite.

   Cada mosaico se pinta con el MISMO código de decorado, recortado a su
   rectángulo. Sale coherente entre trozos porque el decorado es determinista:
   `az(i)` con semillas fijas da siempre el mismo adorno en el mismo sitio. */
const MOSAICO = 1024;
let mosaicos = new Map();
let mosaicoDe = null;          // en qué escenario se pintaron los que hay

function invalidarSuelo(){
  sueloCv = null;
  mosaicos = new Map();
  mosaicoDe = null;
  sembrarFauna(G ? G.esc : ESCENARIOS[escSel]);
}

/* aleatorio estable: el mismo adorno cae siempre en el mismo sitio */
const az = i => { const v = Math.sin(i*12.9898)*43758.5453; return v - Math.floor(v); };
const azEntre = (i,a,b) => a + az(i)*(b-a);

function rr(c,x,y,w,h,r){
  c.beginPath();
  c.moveTo(x+r,y);
  c.arcTo(x+w,y,x+w,y+h,r);
  c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r);
  c.arcTo(x,y,x+w,y,r);
  c.closePath();
}

/* Zonas que el escenario reserva para sus elementos fijos (canteros, cancha,
   la bandera, el emblema…) y donde no se debe sembrar nada encima. */
let vetoDeco = [];

/* ¿cabe un adorno aquí sin pisar una base ni la columna del centro? */
/* ---- la caja donde dibuja el decorado ----
   Normalmente es el mundo entero. En El Valle no: cada zona se pinta con el
   origen movido a su franja y `DECO_W` valiendo lo que mide esa zona, así que
   los decorados —que se escribieron pensando "0 a WORLD_W"— caen donde toca
   sin tocarles una línea. */
let DECO_W = 0, DECO_H = 0, DECO_X = 0;
/* El mar de la caja que se está pintando. En un mapa de zonas cada una trae el
   suyo —o ninguno—, así que un decorado con agua no puede leerlo del escenario:
   `G.esc.mar` no existe en el Multiverso y salía NaN. */
let DECO_MAR = null;

/* ¿Este bulto del decorado cae sobre una cancha?

   El decorado FIJO de cada escenario —los canteros del colegio, la cancha
   pintada en el suelo— se escribió cuando no había minijuegos, y las canchas
   buscan hueco con lo que el motor conoce: casas, puestos, portales. Los
   canteros no están en esa lista y no pueden estarlo (son dibujo del cliente),
   así que el que se cruce se queda sin pintar. Medido: el cantero de (430,1420)
   se comía la esquina de la cancha de tenis. */
function sobreUnSitio(x, y, w, h, m = 10){
  for (const s of (G && G.sitios) || []){
    const c = s.rect;
    if (x < c.x + c.w + m && x + w > c.x - m &&
        y < c.y + c.h + m && y + h > c.y - m) return true;
  }
  return false;
}

function libreDeco(x, y, m){
  const caja = { x:x-m, y:y-m, w:m*2, h:m*2 };
  /* Dentro de la canchita no se siembra nada: una palmera en el área no es
     decorado, es un obstáculo que además no lo es. */
  for (const s of (G && G.sitios) || []){
    const c = s.rect;
    if (caja.x < c.x+c.w+30 && caja.x+caja.w > c.x-30 &&
        caja.y < c.y+c.h+30 && caja.y+caja.h > c.y-30) return false;
  }
  const choca = r => caja.x < r.x+r.w && caja.x+caja.w > r.x &&
                     caja.y < r.y+r.h && caja.y+caja.h > r.y;
  for (const r of vetoDeco) if (choca(r)) return false;
  for (const b of G.bases) if (choca({ x:b.rect.x-24, y:b.rect.y-46, w:b.rect.w+48, h:b.rect.h+70 })) return false;
  for (const a of G.armerias)
    if (choca({ x:a.x-30, y:a.y-30, w:a.w+60, h:a.h+60 })) return false;
  for (const ru of G.ruletas)
    if (choca({ x:ru.x-ru.r-30, y:ru.y-ru.r-30, w:(ru.r+30)*2, h:(ru.r+30)*2 })) return false;
  const ru = G.ruletas[0];
  if (choca({ x:ru.x-ru.r-30, y:ru.y-ru.r-30, w:(ru.r+30)*2, h:(ru.r+30)*2 })) return false;
  for (const P of [G.portal, G.portal.salida])
    if (choca({ x:P.x-90, y:P.y-90, w:180, h:180 })) return false;
  /* La alfombra del desfile: la caja que ocupa el ocho más las dos rectas de
     entrada y salida. Se reserva de más a propósito — un cactus en medio del
     desfile se ve peor que un hueco de decorado. */
  const o = orbitaDelCentro(G);
  if (choca({ x:o.cx-o.rx-26, y:o.cy-o.ry-26, w:(o.rx+26)*2, h:(o.ry+26)*2 })) return false;
  if (choca({ x:G.portal.x-24, y:G.portal.y, w:48, h:G.portal.salida.y-G.portal.y })) return false;
  return true;
}

/* Coloca n adornos buscando sitio libre entre y0 e y1, y llama a pintar(c,x,y,i).
   Reparte por bandas verticales para que no se apelotonen a lo ancho. */
function sembrarEnFranja(c, n, semilla, margen, pintar, y0, y1){
  let puestos = 0;
  for (let banda=0; banda<n; banda++){
    const x0 = 60 + (DECO_W-120) * (banda/n);
    const x1 = 60 + (DECO_W-120) * ((banda+1)/n);
    for (let k=0;k<26;k++){
      const i = semilla + banda*37 + k;
      const x = azEntre(i, x0, x1), y = azEntre(i+7777, y0, y1);
      if (!libreDeco(x, y, margen)) continue;
      pintar(c, x, y, puestos);
      puestos++;
      break;
    }
  }
  return puestos;
}

/* Sitio para un adorno GRANDE (un volcán, una cueva). `sembrar` no sirve: parte
   el mapa en bandas y se rinde a los 26 intentos, y con un margen del tamaño de
   un volcán no encuentra nada en un mapa con cuatro casas, tres patios y la
   alfombra del desfile — medido, 0 de 2 volcanes puestos. Aquí se barre el mapa
   entero y, si aun así no cabe, se afloja el margen en vez de no dibujar nada:
   un volcán un poco justo se ve mejor que un escenario volcánico sin volcanes. */
function huecoGrande(semilla, margen, y0, y1){
  for (let intento=0; intento<4; intento++){
    const m = margen * (1 - intento * .22);
    for (let k=0;k<160;k++){
      const i = semilla + intento*911 + k*13;
      const x = azEntre(i, 90, DECO_W-90), y = azEntre(i+4242, y0, y1);
      if (libreDeco(x, y, m)) return [x, y];
    }
  }
  return null;
}

/* Lo mismo por todo el mapa. `maxY` permite dejar zonas fuera (en la playa, el agua). */
function sembrar(c, n, semilla, margen, pintar, maxY){
  return sembrarEnFranja(c, n, semilla, margen, pintar, 60, maxY == null ? WORLD_H-60 : maxY);
}

/* La rayuela (el "mundo") pintada con tiza de colores, como se juega de verdad:
   1, 2 y 3 sueltos, 4 y 5 en la misma línea, 6 suelto, 7 y 8 en la misma línea,
   9 suelto y el 10 grande arriba. (x,y) es el centro de la casilla del 1. */
const TIZAS = ["#FFEFE2","#FF9EC4","#5CE1EA","#FFD84D","#9BD97F","#FFB020","#D8A0FF","#FF7196"];
function rayuela(c, x, y, s){
  const W = 34, H = 30;
  /* cada fila: los números que la ocupan. De abajo hacia arriba. */
  const filas = [[1],[2],[3],[4,5],[6],[7,8],[9],[10]];
  c.save();
  c.translate(x, y); c.scale(s, s);
  c.lineWidth = 3.2; c.lineJoin = "round";
  c.textAlign = "center"; c.textBaseline = "middle";

  let base = 0;                                  // borde inferior de la fila
  filas.forEach((nums, f) => {
    const grande = nums[0] === 10;
    const h = grande ? 46 : H;
    const top = base - h;
    nums.forEach((n, k) => {
      const tiza = TIZAS[(n-1) % TIZAS.length];
      let x0, w;
      if (grande){ x0 = -W; w = W*2; }
      else if (nums.length === 2){ x0 = k === 0 ? -W : 0; w = W; }
      else { x0 = -W/2; w = W; }

      c.fillStyle = "rgba(255,255,255,.07)";
      if (grande){
        // el 10 lleva el techo redondeado: es el "cielo"
        c.beginPath();
        c.moveTo(x0, base);
        c.lineTo(x0, top+14);
        c.quadraticCurveTo(x0, top, x0+18, top);
        c.lineTo(x0+w-18, top);
        c.quadraticCurveTo(x0+w, top, x0+w, top+14);
        c.lineTo(x0+w, base);
        c.closePath();
      } else {
        c.beginPath(); c.rect(x0, top, w, h);
      }
      c.fill();
      c.strokeStyle = tiza; c.stroke();
      c.fillStyle = tiza;
      c.font = (grande ? "800 26px " : "800 17px ") + "system-ui, sans-serif";
      c.fillText(String(n), x0 + w/2, top + h/2 + (grande ? 3 : 1));
    });
    base = top;
  });

  // la piedrita, tirada en una casilla cualquiera
  c.fillStyle = "rgba(90,80,70,.75)";
  c.beginPath(); c.ellipse(-8, -H*2.4, 6, 4.5, .4, 0, 6.283); c.fill();
  c.restore();
}

/* ---- casa del barrio ----
   Vista de tres cuartos, como el resto del decorado: el punto (x,y) es donde
   pisa el suelo y la casa crece hacia arriba. Fachada de un color, techo de
   calamina en otro, y siempre una puerta y una ventana para que se lea. */
const CASA_PARED = ["#C4693F","#9E6A8C","#6E8AA8","#B8955A","#8A7BA8","#A85E5E"];
const CASA_TECHO = ["#7A4A2A","#5C3A52","#3E5468","#7A6238","#4E4470","#6E3A3A"];
function casaBarrio(c, x, y, i, esc){
  const w = 104 * esc, h = 74 * esc, alero = 12 * esc;
  const p = CASA_PARED[i % CASA_PARED.length], t = CASA_TECHO[i % CASA_TECHO.length];

  /* La casa se reserva su sitio: es un bulto sólido, y una bolsa de basura o un
     poste dibujados sobre el techo se ven rotos. */
  vetoDeco.push({ x: x-w/2-alero-8, y: y-h-46*esc, w: w+alero*2+16, h: h+52*esc });

  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(x, y+4, w*.56, 13*esc, 0, 0, 6.283); c.fill();

  // fachada
  c.fillStyle = p;
  rr(c, x-w/2, y-h, w, h, 5*esc); c.fill();
  c.fillStyle = "rgba(0,0,0,.16)";                       // sombra del alero
  c.fillRect(x-w/2, y-h, w, 9*esc);

  // puerta y ventana
  c.fillStyle = "#3A2416";
  rr(c, x-16*esc, y-38*esc, 26*esc, 38*esc, 3*esc); c.fill();
  c.fillStyle = "#FFC53D";
  c.beginPath(); c.arc(x+6*esc, y-19*esc, 2.4*esc, 0, 6.283); c.fill();
  c.fillStyle = az(i) > .5 ? "#FFE066" : "#5CE1EA";      // unas encendidas, otras no
  rr(c, x+18*esc, y-46*esc, 26*esc, 22*esc, 3*esc); c.fill();
  c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 2*esc;
  c.beginPath();
  c.moveTo(x+31*esc, y-46*esc); c.lineTo(x+31*esc, y-24*esc);
  c.moveTo(x+18*esc, y-35*esc); c.lineTo(x+44*esc, y-35*esc);
  c.stroke();

  // techo de calamina, con sus ondas y el alero sobresaliendo
  c.fillStyle = t;
  rr(c, x-w/2-alero, y-h-22*esc, w+alero*2, 26*esc, 4*esc); c.fill();
  c.strokeStyle = "rgba(0,0,0,.22)"; c.lineWidth = 2*esc;
  for (let k=1;k<7;k++){
    const cx = x-w/2-alero + (w+alero*2)*(k/7);
    c.beginPath(); c.moveTo(cx, y-h-20*esc); c.lineTo(cx, y-h+2*esc); c.stroke();
  }
  // tanque de agua: no hay casa en el barrio sin uno
  c.fillStyle = "#3E5468";
  rr(c, x+w/2-30*esc, y-h-40*esc, 20*esc, 20*esc, 4*esc); c.fill();
  c.fillStyle = "#5C7A94";
  rr(c, x+w/2-32*esc, y-h-43*esc, 24*esc, 7*esc, 3*esc); c.fill();
}

/* ---- bicicleta ---- */
const BICI_COLOR = ["#FF5C86","#5CE1EA","#FFD84D","#9BD97F","#FF9EC4"];
function biciBarrio(c, x, y, i, giro = (az(i+5)-.5)*.7){
  const esc = .95;
  c.save(); c.translate(x, y); c.rotate(giro); c.scale(esc, esc);

  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(0, 6, 30, 8, 0, 0, 6.283); c.fill();

  c.strokeStyle = "#2A1226"; c.lineWidth = 3.5;          // ruedas
  for (const rx of [-20, 20]){
    c.beginPath(); c.arc(rx, 0, 12, 0, 6.283); c.stroke();
    c.strokeStyle = "rgba(255,239,226,.35)"; c.lineWidth = 1.2;
    for (let k=0;k<4;k++){
      const a = k*.785 + az(i)*1.5;
      c.beginPath(); c.moveTo(rx, 0);
      c.lineTo(rx+Math.cos(a)*11, Math.sin(a)*11); c.stroke();
    }
    c.strokeStyle = "#2A1226"; c.lineWidth = 3.5;
  }
  c.strokeStyle = BICI_COLOR[i % BICI_COLOR.length]; c.lineWidth = 4;
  c.beginPath();                                          // cuadro
  c.moveTo(-20, 0); c.lineTo(-4, -12); c.lineTo(12, -12); c.lineTo(20, 0);
  c.moveTo(-4, -12); c.lineTo(4, 0); c.lineTo(20, 0);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(12, -12); c.lineTo(16, -20); c.stroke();   // manubrio
  c.strokeStyle = "#2A1226"; c.lineWidth = 3;
  c.beginPath(); c.moveTo(11, -20); c.lineTo(21, -20); c.stroke();
  c.fillStyle = "#2A1226";
  rr(c, -10, -18, 14, 5, 2); c.fill();                    // asiento
  c.restore();
}

/* ---- pelotas ---- */
function pelotaBarrio(c, x, y, i, giro = 0){
  const r = 12;
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(x, y+r*.75, r*1.05, r*.4, 0, 0, 6.283); c.fill();

  if (i % 3 === 0){                                       // la de fútbol
    c.fillStyle = "#FFEFE2";
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    c.fillStyle = "#2A1226";
    c.beginPath(); c.arc(x, y-r*.15, r*.36, 0, 6.283); c.fill();
    for (let k=0;k<3;k++){
      const a = k*2.094 + 1.2;
      c.beginPath();
      c.arc(x+Math.cos(a)*r*.72, y+Math.sin(a)*r*.72, r*.22, 0, 6.283); c.fill();
    }
  } else {                                                // las de plástico, a rayas
    const base = i % 3 === 1 ? "#FF5C86" : "#5CE1EA";
    c.fillStyle = base;
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.clip();
    c.fillStyle = "rgba(255,239,226,.85)";
    c.fillRect(x-r, y-r*.28, r*2, r*.34);
    c.fillStyle = "rgba(0,0,0,.14)";
    c.fillRect(x-r, y+r*.3, r*2, r);
    c.restore();
  }
  c.fillStyle = "rgba(255,255,255,.4)";                   // brillo
  c.beginPath(); c.ellipse(x-r*.32, y-r*.42, r*.26, r*.18, -.6, 0, 6.283); c.fill();
}

/* ---- patineta ---- */
const TABLA_COLOR = ["#FF3D6E","#37D6E0","#FFC53D","#8B6BEE","#3DDC97"];
function dibujarPatineta(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(0, 5, 25, 7, 0, 0, 6.283); c.fill();
  c.fillStyle = "#3A2416";                             // ruedas
  for (const rx of [-14, 14]){
    c.beginPath(); c.ellipse(rx, 3, 4, 3.4, 0, 0, 6.283); c.fill();
  }
  c.fillStyle = TABLA_COLOR[i % TABLA_COLOR.length];   // la tabla
  rr(c, -24, -6, 48, 9, 4.5); c.fill();
  c.fillStyle = "rgba(255,255,255,.3)";                // la lija
  rr(c, -19, -5, 38, 3, 1.5); c.fill();
  c.restore();
}

/* ---- tabla de surf ---- */
function dibujarTabla(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.16)";
  c.beginPath(); c.ellipse(0, 6, 27, 8, 0, 0, 6.283); c.fill();
  c.fillStyle = "#FFEFE2";
  c.beginPath();
  c.moveTo(-28, 0);
  c.quadraticCurveTo(-16, -10, 16, -8);
  c.quadraticCurveTo(28, -5, 28, 0);
  c.quadraticCurveTo(28, 5, 16, 8);
  c.quadraticCurveTo(-16, 10, -28, 0);
  c.closePath(); c.fill();
  c.strokeStyle = "rgba(0,0,0,.22)"; c.lineWidth = 1.4; c.stroke();
  c.fillStyle = TABLA_COLOR[i % TABLA_COLOR.length];   // la franja del centro
  c.beginPath();
  c.moveTo(-24, 0); c.quadraticCurveTo(0, -4, 26, 0);
  c.quadraticCurveTo(0, 4, -24, 0);
  c.closePath(); c.fill();
  c.restore();
}

/* ---- flotador ---- */
function dibujarFlotador(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.14)";
  c.beginPath(); c.ellipse(0, 6, 20, 7, 0, 0, 6.283); c.fill();
  const col = TABLA_COLOR[i % TABLA_COLOR.length];
  for (let k=0;k<6;k++){                               // gajos de dos colores
    c.fillStyle = k % 2 ? "#FFEFE2" : col;
    c.beginPath(); c.moveTo(0, 0);
    c.ellipse(0, 0, 19, 15, 0, k*1.047, (k+1)*1.047);
    c.closePath(); c.fill();
  }
  c.fillStyle = "#1FA8C4";                             // el agujero
  c.beginPath(); c.ellipse(0, 0, 8, 6, 0, 0, 6.283); c.fill();
  c.strokeStyle = "rgba(0,0,0,.2)"; c.lineWidth = 1.4;
  c.beginPath(); c.ellipse(0, 0, 19, 15, 0, 0, 6.283); c.stroke();
  c.restore();
}

/* ---- tabla de arena ---- */
function dibujarTablaArena(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(0, 6, 24, 7, 0, 0, 6.283); c.fill();
  c.fillStyle = "#8B5A2B";
  rr(c, -24, -8, 48, 14, 7); c.fill();
  c.fillStyle = TABLA_COLOR[(i+2) % TABLA_COLOR.length];
  rr(c, -20, -6, 40, 6, 3); c.fill();
  c.strokeStyle = "#3A2416"; c.lineWidth = 2;          // las correas
  c.beginPath();
  c.moveTo(-9, -8); c.lineTo(-9, 6);
  c.moveTo(9, -8);  c.lineTo(9, 6);
  c.stroke();
  c.restore();
}

/* ---- mata rodadora ---- */
function dibujarMata(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.strokeStyle = "#A2832F"; c.lineWidth = 2.5;
  c.beginPath();
  for (let k=0;k<9;k++){
    const a = k*.7 + i, r = 12 + az(i*4+k)*11;
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a)*r, Math.sin(a)*r*.8);
  }
  c.stroke();
  c.strokeStyle = "rgba(162,131,47,.6)"; c.lineWidth = 2;
  c.beginPath(); c.ellipse(0, 0, 16, 13, 0, 0, 6.283); c.stroke();
  c.restore();
}

/* ---- balsa de troncos ---- */
function dibujarBalsa(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.18)";
  c.beginPath(); c.ellipse(0, 7, 30, 9, 0, 0, 6.283); c.fill();
  for (let k=0;k<5;k++){                                 // los troncos atados
    c.fillStyle = k%2 ? "#8B6F52" : "#7A5F44";
    rr(c, -28, -13 + k*5.6, 56, 5.4, 2.7); c.fill();
  }
  c.strokeStyle = "#4E3A26"; c.lineWidth = 2;            // la soga
  for (const lx of [-16, 16]){
    c.beginPath(); c.moveTo(lx, -14); c.lineTo(lx, 15); c.stroke();
  }
  c.fillStyle = TABLA_COLOR[i % TABLA_COLOR.length];     // la pértiga
  rr(c, 20, -30, 4, 44, 2); c.fill();
  c.restore();
}

/* ---- llama y camello: los dos se montan, y los dos son un bicho de perfil ---- */
function dibujarBestia(c, x, y, giro, i, cual, trote){
  const esCamello = cual === "camello";
  const esCaballo = cual === "caballo";
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const pelo = esCamello ? "#C9A46A"
             : esCaballo ? ["#6E4A2E","#3A2A22","#C9B79A"][i % 3]
             : ["#EDE3D0","#C9B79A","#8B6F52"][i % 3];
  c.save(); c.translate(x, y);
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(0, 11, 26, 8, 0, 0, 6.283); c.fill();
  c.fillStyle = esCamello ? "#A8854E" : "#6E5A44";       // patas
  /* Al trote las patas van en diagonal: adelanta la delantera de un lado con la
     trasera del otro. Cada pata gira desde el hombro, no se desliza. */
  const paso = G.t * 9, fase = [0, Math.PI, Math.PI, 0];
  [-14,-8,8,14].forEach((px, k) => {
    c.save(); c.translate(px + 2, -6);
    if (trote) c.rotate(Math.sin(paso + fase[k]) * .55 * trote);
    c.fillRect(-2, 0, 4, 18);
    c.restore();
  });
  c.fillStyle = pelo;                                    // cuerpo
  rr(c, -20, -30, 40, 26, 12); c.fill();
  if (esCamello){                                        // las jorobas
    c.beginPath(); c.arc(-6, -32, 11, Math.PI, 0); c.fill();
    c.beginPath(); c.arc(9, -33, 10, Math.PI, 0); c.fill();
  }
  c.fillRect(mira*15 - 2, -50, 6, 24);                   // cuello
  c.beginPath(); c.ellipse(mira*19, -55, 9, 7, 0, 0, 6.283); c.fill();
  c.fillStyle = "#3A2416";
  c.beginPath();                                          // oreja
  c.moveTo(mira*15, -61); c.lineTo(mira*16, -69); c.lineTo(mira*20, -61); c.closePath(); c.fill();
  c.beginPath(); c.arc(mira*22, -56, 1.6, 0, 6.283); c.fill();
  if (esCaballo){                                         // la crin, hasta el lomo
    c.fillStyle = "#2A1A10";
    for (let k = 0; k < 5; k++)
      c.fillRect(mira*(12 - k*4) - 1.5, -58 + k*3, 3, 8);
  } else if (!esCamello){                                 // la borla de la llama
    c.fillStyle = "#E2453C";
    c.beginPath(); c.arc(mira*15, -67, 2.8, 0, 6.283); c.fill();
  }
  c.fillStyle = esCamello ? "#8A6A3C" : esCaballo ? "#8A4A3C" : "#B5A088";   // manta
  rr(c, -14, -34, 24, 9, 3); c.fill();
  c.restore();
}

/* El dinosaurio. No es una bestia más de `dibujarBestia`: es del doble de alto,
   se apoya en dos patas y la cola le hace de contrapeso, así que hay que
   dibujarlo entero aparte. Al andar cabecea y bate la cola — un tiranosaurio
   que se desliza en línea recta parece un juguete de ruedas. */
function dibujarDino(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const t = trote || 0;
  const paso = G.t * 6;
  const cabeceo = Math.sin(paso) * .06 * t;
  const piel  = ["#5C8A46","#7A6A3E","#8A5240"][i % 3];
  const panza = ["#B9C98A","#C4B686","#C99A82"][i % 3];
  c.save(); c.translate(x, y);
  c.fillStyle = "rgba(0,0,0,.26)";
  c.beginPath(); c.ellipse(0, 14, 40, 11, 0, 0, 6.283); c.fill();
  c.scale(mira, 1);
  c.rotate(cabeceo);

  /* la cola: tres tramos que se afinan y ondean con retraso entre sí */
  c.strokeStyle = piel; c.lineCap = "round";
  const colaY = -34;
  c.lineWidth = 15;
  c.beginPath(); c.moveTo(-14, colaY);
  c.quadraticCurveTo(-40, colaY - 4 + Math.sin(paso*.8)*5,
                     -60, colaY - 10 + Math.sin(paso*.8 - .6)*9);
  c.stroke();
  c.lineWidth = 8;
  c.beginPath(); c.moveTo(-58, colaY - 9 + Math.sin(paso*.8 - .6)*9);
  c.quadraticCurveTo(-76, colaY - 16 + Math.sin(paso*.8 - 1)*12,
                     -92, colaY - 26 + Math.sin(paso*.8 - 1.4)*15);
  c.stroke();

  /* las patas traseras, en zigzag como las de un ave: muslo, caña y pie */
  [[-6, 0], [4, Math.PI]].forEach(([px, fase], k) => {
    const sw = Math.sin(paso + fase) * t;
    c.save(); c.translate(px, -26);
    c.strokeStyle = k ? piel : "#4A7038";
    c.lineWidth = 13;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-6 + sw*7, 14); c.stroke();   // muslo
    c.lineWidth = 8;
    c.beginPath(); c.moveTo(-6 + sw*7, 14); c.lineTo(4 + sw*10, 30); c.stroke();  // caña
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(4 + sw*10, 30);
    c.lineTo(14 + sw*10, 36 - Math.max(0, sw)*6); c.stroke();             // el pie
    c.restore();
  });

  /* el cuerpo, echado hacia adelante */
  c.fillStyle = piel;
  c.beginPath();
  c.moveTo(-16, -44);
  c.quadraticCurveTo(4, -52, 22, -44);
  c.quadraticCurveTo(30, -32, 20, -20);
  c.quadraticCurveTo(0, -12, -14, -22);
  c.closePath(); c.fill();
  c.fillStyle = panza;                                   // la panza más clara
  c.beginPath();
  c.moveTo(-12, -22); c.quadraticCurveTo(4, -13, 20, -21);
  c.quadraticCurveTo(6, -17, -12, -22); c.closePath(); c.fill();

  /* los bracitos ridículos, con dos garras */
  c.strokeStyle = piel; c.lineWidth = 5;
  c.beginPath(); c.moveTo(18, -32); c.lineTo(27, -26 + Math.sin(paso)*2*t); c.stroke();
  c.strokeStyle = "#EDE3D0"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(27, -26); c.lineTo(32, -28); c.stroke();
  c.beginPath(); c.moveTo(27, -26); c.lineTo(32, -23); c.stroke();

  /* el cuello y la cabezota */
  c.strokeStyle = piel; c.lineWidth = 13; c.lineCap = "round";
  c.beginPath(); c.moveTo(16, -44); c.quadraticCurveTo(26, -56, 30, -64); c.stroke();
  c.fillStyle = piel;
  c.beginPath();
  c.moveTo(20, -62);
  c.quadraticCurveTo(30, -76, 46, -74);
  c.lineTo(58, -68); c.lineTo(56, -60); c.lineTo(36, -56);
  c.quadraticCurveTo(24, -55, 20, -62);
  c.closePath(); c.fill();
  /* la mandíbula, que se abre un poco al correr */
  c.save(); c.translate(36, -62); c.rotate(.18 + Math.max(0, Math.sin(paso*.5)) * .22 * t);
  c.fillStyle = piel;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(22, 2); c.lineTo(20, 9); c.lineTo(0, 8); c.closePath(); c.fill();
  c.fillStyle = "#FFF6E1";                               // los dientes de abajo
  for (let k=0;k<4;k++){
    c.beginPath(); c.moveTo(3+k*5, 1); c.lineTo(6+k*5, 1); c.lineTo(4.5+k*5, -4); c.closePath(); c.fill();
  }
  c.restore();
  c.fillStyle = "#FFF6E1";                               // los de arriba
  for (let k=0;k<5;k++){
    c.beginPath(); c.moveTo(32+k*5, -60); c.lineTo(35+k*5, -60); c.lineTo(33.5+k*5, -54); c.closePath(); c.fill();
  }
  c.fillStyle = "#FFD84D";                               // el ojo
  c.beginPath(); c.ellipse(34, -69, 4.4, 3.6, 0, 0, 6.283); c.fill();
  c.fillStyle = "#1A1410";
  c.beginPath(); c.ellipse(35, -69, 1.4, 3, 0, 0, 6.283); c.fill();

  /* la cresta de púas del lomo, de la nuca a la cola */
  c.fillStyle = "#3E5C30";
  for (let k=0;k<8;k++){
    const px = 14 - k*4.2, py = -46 - Math.sin(k/8*Math.PI)*3;
    const h = 7 - Math.abs(k-3)*.9;
    c.beginPath(); c.moveTo(px-3, py); c.lineTo(px+3, py); c.lineTo(px, py-h); c.closePath(); c.fill();
  }
  c.restore();
}

/* ---- la moto de nieve ---- */
function dibujarMotonieve(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const col = ["#E2453C","#3B7BC4","#FFD84D"][i % 3];
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(x, y + 12, 28, 8, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.scale(mira, 1);
  c.fillStyle = "#3A3238";                                 // la oruga de atrás
  rr(c, -26, -2, 30, 13, 4); c.fill();
  c.fillStyle = "#5A5248";
  for (let k = 0; k < 6; k++){
    const off = trote ? (G.t * 90 + k * 5) % 30 : k * 5;
    c.fillRect(-26 + off, -2, 2.5, 13);
  }
  c.fillStyle = col;                                       // el carenado
  c.beginPath();
  c.moveTo(-24, -4); c.lineTo(10, -12); c.lineTo(26, -8);
  c.lineTo(24, 2); c.lineTo(-22, 4); c.closePath(); c.fill();
  c.fillStyle = "rgba(255,255,255,.28)";
  c.beginPath(); c.moveTo(2, -11); c.lineTo(20, -8); c.lineTo(18, -3); c.lineTo(2, -5); c.closePath(); c.fill();
  c.fillStyle = "#2A2226";                                 // el asiento
  rr(c, -20, -12, 20, 8, 3); c.fill();
  c.strokeStyle = "#2A2226"; c.lineWidth = 3;              // el manillar
  c.beginPath(); c.moveTo(8, -12); c.lineTo(14, -24); c.stroke();
  c.beginPath(); c.moveTo(9, -24); c.lineTo(20, -24); c.stroke();
  c.fillStyle = "#C9C2B8";                                 // el esquí de delante
  c.beginPath();
  c.moveTo(14, 4); c.lineTo(36, 4); c.quadraticCurveTo(42, 2, 38, -3);
  c.lineTo(16, 0); c.closePath(); c.fill();
  c.restore();
}

/* ---- el elefante ---- */
function dibujarElefante(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const paso = G.t * 6, fase = [0, Math.PI, Math.PI, 0];
  const piel = ["#9A97A0","#8A8794","#A8A4AE"][i % 3];
  c.save(); c.translate(x, y); c.scale(mira, 1);
  c.fillStyle = "rgba(0,0,0,.24)";
  c.beginPath(); c.ellipse(0, 14, 34, 10, 0, 0, 6.283); c.fill();
  c.fillStyle = "#6E6B76";                                  // las patas, columnas
  [-18, -8, 10, 20].forEach((px, k) => {
    c.save(); c.translate(px, -10);
    if (trote) c.rotate(Math.sin(paso + fase[k]) * .28 * trote);
    rr(c, -6, 0, 12, 24, 4); c.fill();
    c.restore();
  });
  c.fillStyle = piel;                                       // el cuerpo
  c.beginPath(); c.ellipse(0, -30, 30, 20, 0, 0, 6.283); c.fill();
  c.beginPath(); c.ellipse(26, -38, 16, 14, 0, 0, 6.283); c.fill();   // la cabeza
  c.fillStyle = "#8A8794";                                  // la oreja, enorme
  c.beginPath(); c.ellipse(20, -40, 13, 15, .2, 0, 6.283); c.fill();
  /* la trompa, que se mece */
  c.strokeStyle = piel; c.lineCap = "round"; c.lineWidth = 9;
  c.beginPath(); c.moveTo(38, -36);
  c.quadraticCurveTo(50, -28 + Math.sin(paso*.7)*4, 46, -12 + Math.sin(paso*.7)*5);
  c.stroke();
  c.fillStyle = "#FFF6E1";                                  // los colmillos
  c.beginPath(); c.moveTo(36, -30); c.lineTo(48, -24); c.lineTo(36, -26); c.closePath(); c.fill();
  c.fillStyle = "#3A3238";
  c.beginPath(); c.arc(31, -42, 1.8, 0, 6.283); c.fill();
  c.fillStyle = piel;                                       // la colita
  c.strokeStyle = piel; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-29, -34); c.lineTo(-38, -22); c.stroke();
  c.fillStyle = "#C0452F";                                  // la manta de montar
  rr(c, -16, -46, 28, 10, 3); c.fill();
  c.restore();
}

/* ---- el auto chocón ---- */
function dibujarChocon(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const col = ["#E2453C","#FFD84D","#5CE1EA","#8B6BEE"][i % 4];
  const chispa = Math.sin(G.t * 18 + i) > .6;
  c.fillStyle = "rgba(0,0,0,.24)";
  c.beginPath(); c.ellipse(x, y + 10, 28, 8, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.scale(mira, 1);
  c.fillStyle = "#2A2226";                                  // ruedas pequeñas
  for (const rx of [-14, 14]){ c.beginPath(); c.ellipse(rx, 6, 6, 5, 0, 0, 6.283); c.fill(); }
  c.fillStyle = "#3A3238";                                  // el parachoques de goma
  c.beginPath(); c.ellipse(0, 0, 28, 14, 0, 0, 6.283); c.fill();
  c.fillStyle = col;                                        // la carrocería
  c.beginPath(); c.ellipse(0, -3, 22, 11, 0, 0, 6.283); c.fill();
  c.fillStyle = "rgba(255,255,255,.25)";
  c.beginPath(); c.ellipse(-6, -6, 10, 4, -.2, 0, 6.283); c.fill();
  c.fillStyle = "#2A3A4A";                                  // el asiento
  rr(c, -8, -14, 14, 10, 3); c.fill();
  /* el mástil y la chispa del techo */
  c.strokeStyle = "#8A8478"; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-2, -14); c.lineTo(-6, -34); c.stroke();
  if (chispa){
    c.fillStyle = "#FFF6E1";
    c.beginPath(); c.arc(-6, -35, 4, 0, 6.283); c.fill();
    c.fillStyle = "#5CE1EA";
    c.beginPath(); c.arc(-6, -35, 2, 0, 6.283); c.fill();
  }
  c.restore();
}

/* ---- la patineta flotante ---- */
function dibujarHoverboard(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const flota = Math.sin(G.t * 3 + i) * 3;
  c.fillStyle = "rgba(0,0,0,.18)";
  c.beginPath(); c.ellipse(x, y + 16, 24, 6, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y + flota); c.scale(mira, 1);
  /* el haz que la sostiene */
  c.fillStyle = "rgba(92,225,234,.22)";
  c.beginPath(); c.moveTo(-18, 4); c.lineTo(18, 4); c.lineTo(24, 16); c.lineTo(-24, 16); c.closePath(); c.fill();
  c.fillStyle = "#5CE1EA";
  for (const bx of [-13, 13]){
    c.beginPath(); c.ellipse(bx, 5, 6, 2.6, 0, 0, 6.283); c.fill();
  }
  const g = c.createLinearGradient(-22, 0, 22, 0);
  g.addColorStop(0, "#8B6BEE"); g.addColorStop(.5, "#C9C2D8"); g.addColorStop(1, "#8B6BEE");
  c.fillStyle = g;
  rr(c, -22, -6, 44, 10, 5); c.fill();
  c.fillStyle = "rgba(255,255,255,.35)";
  rr(c, -18, -5, 36, 3, 2); c.fill();
  c.restore();
}

/* ---- lo que se patea en los sitios de paseo ---- */
function dibujarBolaNieve(c, x, y, giro, i){
  c.fillStyle = "rgba(120,150,180,.22)";
  c.beginPath(); c.ellipse(x, y + 7, 12, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = "#F4F8FC";
  c.beginPath(); c.arc(x, y, 11, 0, 6.283); c.fill();
  c.fillStyle = "rgba(190,210,230,.6)";
  c.beginPath(); c.arc(x + 3, y + 3, 7, 0, 6.283); c.fill();
  c.fillStyle = "rgba(255,255,255,.9)";
  c.beginPath(); c.arc(x - 3, y - 4, 4, 0, 6.283); c.fill();
}

function dibujarBanano(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(0, 6, 12, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = "#FFD84D";
  c.beginPath();
  c.moveTo(-12, 2); c.quadraticCurveTo(0, -12, 12, 0);
  c.quadraticCurveTo(0, -4, -10, 6); c.closePath(); c.fill();
  c.fillStyle = "#8A6A3C";
  c.fillRect(10, -3, 4, 4);
  c.restore();
}

function dibujarAlgodon(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro * .3);
  c.fillStyle = "rgba(0,0,0,.18)";
  c.beginPath(); c.ellipse(0, 10, 9, 3, 0, 0, 6.283); c.fill();
  c.fillStyle = "#C9A46A"; c.fillRect(-1.5, -2, 3, 12);     // el palito
  c.fillStyle = ["#FF9EC4","#B7A6F0","#9BE8E8"][i % 3];     // la nube
  for (const [dx, dy, r] of [[0,-10,10],[-7,-6,7],[7,-6,7],[0,-16,7]]){
    c.beginPath(); c.arc(dx, dy, r, 0, 6.283); c.fill();
  }
  c.fillStyle = "rgba(255,255,255,.45)";
  c.beginPath(); c.arc(-4, -13, 3.4, 0, 6.283); c.fill();
  c.restore();
}

function dibujarTuerca(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.24)";
  c.beginPath(); c.ellipse(0, 6, 11, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = ["#8A8794","#A8A4AE","#6E6B76"][i % 3];
  c.beginPath();
  for (let k = 0; k < 6; k++){
    const a = k * 1.047;
    c[k ? "lineTo" : "moveTo"](Math.cos(a) * 11, Math.sin(a) * 11);
  }
  c.closePath(); c.fill();
  c.fillStyle = "#3E4A5C";
  c.beginPath(); c.arc(0, 0, 5, 0, 6.283); c.fill();
  c.fillStyle = "rgba(255,255,255,.22)";
  c.beginPath(); c.moveTo(-9, -5); c.lineTo(0, -10); c.lineTo(2, -6); c.lineTo(-7, -2); c.closePath(); c.fill();
  c.restore();
}

/* ---- el caballo ----
   No vale reusar el cuerpo de la llama: la llama tiene el cuello vertical y un
   caballo con eso parece un avestruz. El cuello va inclinado hacia delante, el
   cuerpo es más largo y las patas más finas. */
function dibujarCaballo(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const paso = G.t * 9, fase = [0, Math.PI, Math.PI, 0];
  const pelo = ["#6E4A2E","#3A2A22","#C9B79A","#8A6A4E"][i % 4];
  const crin = ["#2A1A10","#1A1008","#8A6A3C","#3A2416"][i % 4];
  c.save(); c.translate(x, y); c.scale(mira, 1);
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(0, 11, 28, 8, 0, 0, 6.283); c.fill();
  c.strokeStyle = "#4A3222"; c.lineCap = "round"; c.lineWidth = 4.5;
  [-16, -10, 10, 16].forEach((px, k) => {                 // las cuatro patas
    const sw = trote ? Math.sin(paso + fase[k]) * .55 * trote : 0;
    c.save(); c.translate(px, -8);
    c.rotate(sw);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 10); c.stroke();
    c.beginPath(); c.moveTo(0, 10); c.lineTo(Math.max(0, sw) * 6, 19); c.stroke();
    c.restore();
  });
  c.fillStyle = pelo;                                      // el cuerpo, alargado
  c.beginPath(); c.ellipse(0, -20, 25, 13, 0, 0, 6.283); c.fill();
  c.fillStyle = crin;                                      // la cola
  c.beginPath();
  c.moveTo(-23, -26); c.quadraticCurveTo(-36, -20 + Math.sin(paso*.6)*4, -32, -2);
  c.quadraticCurveTo(-26, -14, -22, -20); c.closePath(); c.fill();
  /* el cuello, inclinado hacia delante: esto es lo que lo hace caballo */
  c.fillStyle = pelo;
  c.beginPath();
  c.moveTo(12, -28); c.lineTo(24, -52); c.lineTo(32, -50); c.lineTo(22, -24);
  c.closePath(); c.fill();
  c.beginPath(); c.ellipse(30, -54, 11, 7, -.5, 0, 6.283); c.fill();   // la cabeza
  c.beginPath(); c.ellipse(37, -60, 6, 4.5, -.5, 0, 6.283); c.fill();  // el hocico
  c.fillStyle = crin;                                      // la crin
  for (let k = 0; k < 6; k++){
    const t = k / 5;
    c.beginPath();
    c.moveTo(13 + t*12, -29 - t*22); c.lineTo(8 + t*12, -33 - t*22);
    c.lineTo(13 + t*12, -36 - t*22); c.closePath(); c.fill();
  }
  c.fillStyle = pelo;
  c.beginPath();                                           // la oreja
  c.moveTo(25, -58); c.lineTo(25, -66); c.lineTo(30, -59); c.closePath(); c.fill();
  c.fillStyle = "#1A1410";
  c.beginPath(); c.arc(33, -56, 1.6, 0, 6.283); c.fill();
  c.fillStyle = "#8A4A3C";                                 // la manta de montar
  rr(c, -14, -30, 26, 10, 3); c.fill();
  c.restore();
}

/* ---- lo que se patea en los sitios nuevos ---- */
function dibujarLadrillo(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(0, 7, 13, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = ["#B5533A","#A8472F","#C46248"][i % 3];
  rr(c, -12, -6, 24, 12, 2); c.fill();
  c.fillStyle = "rgba(0,0,0,.18)";                    // los tres huecos
  for (const hx of [-6, 0, 6]){ c.beginPath(); c.arc(hx, 0, 2.4, 0, 6.283); c.fill(); }
  c.fillStyle = "rgba(255,255,255,.18)";
  c.fillRect(-12, -6, 24, 2);
  c.restore();
}

function dibujarBarril(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(0, 9, 12, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = "#8A5A32";
  c.beginPath();
  c.moveTo(-9, -10); c.quadraticCurveTo(-13, 0, -9, 10);
  c.lineTo(9, 10); c.quadraticCurveTo(13, 0, 9, -10); c.closePath(); c.fill();
  c.fillStyle = "#5A5248";                            // los aros
  c.fillRect(-12, -5, 24, 3); c.fillRect(-12, 3, 24, 3);
  c.fillStyle = "#A87244";
  c.beginPath(); c.ellipse(0, -10, 9, 3.4, 0, 0, 6.283); c.fill();
  c.restore();
}

function dibujarAnfora(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(0, 10, 10, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = ["#C08A5A","#A87244","#D0A070"][i % 3];
  c.beginPath();                                      // la panza
  c.moveTo(-4, -12); c.quadraticCurveTo(-12, -2, -6, 10);
  c.lineTo(6, 10); c.quadraticCurveTo(12, -2, 4, -12); c.closePath(); c.fill();
  c.fillRect(-4, -16, 8, 5);                          // el cuello
  c.beginPath(); c.ellipse(0, -17, 6, 2.6, 0, 0, 6.283); c.fill();
  c.strokeStyle = "#8A5A32"; c.lineWidth = 2.4;       // las asas
  c.beginPath(); c.arc(-7, -10, 4, -1.2, 1.6); c.stroke();
  c.beginPath(); c.arc(7, -10, 4, 1.6, 4.3); c.stroke();
  c.strokeStyle = "rgba(60,40,24,.5)"; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke();
  c.restore();
}

function dibujarCofre(c, x, y, giro, i){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.24)";
  c.beginPath(); c.ellipse(0, 9, 14, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = "#8A5A32";
  rr(c, -13, -3, 26, 12, 2); c.fill();
  c.fillStyle = "#A87244";                            // la tapa curva
  c.beginPath(); c.moveTo(-13, -3); c.quadraticCurveTo(0, -16, 13, -3); c.closePath(); c.fill();
  c.fillStyle = "#FFD84D";                            // los herrajes
  c.fillRect(-13, -4, 26, 2.5);
  rr(c, -2.5, -6, 5, 8, 1); c.fill();
  c.fillStyle = "#5A5248";
  c.beginPath(); c.arc(0, 0, 1.6, 0, 6.283); c.fill();
  c.restore();
}

/* ---- el dragón ----
   De la Edad Media. Cuerpo de lagarto, alas de murciélago que baten, cuello
   largo y una llamita en el hocico. Vuela, así que flota sobre su sombra. */
function dibujarDragon(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const flota = Math.sin(G.t * 2.4 + i) * 5;
  const ala = Math.sin(G.t * 6 + i);
  const piel  = ["#3E7A4E","#7A3E5E","#3E5A8A"][i % 3];
  const panza = ["#A8D08A","#D0A0B8","#8AB0D8"][i % 3];
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(x, y + 22, 36, 10, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y + flota); c.scale(mira * 1.28, 1.28);
  /* la cola, con su punta de flecha */
  c.strokeStyle = piel; c.lineCap = "round"; c.lineWidth = 9;
  c.beginPath(); c.moveTo(-12, -18);
  c.quadraticCurveTo(-40, -12 + Math.sin(G.t*3)*6, -60, -28 + Math.sin(G.t*3-.7)*9);
  c.stroke();
  c.fillStyle = piel;
  c.beginPath(); c.moveTo(-58, -26); c.lineTo(-72, -34); c.lineTo(-60, -18); c.closePath(); c.fill();
  /* el ala de atrás, más oscura */
  const alaForma = (k) => {
    c.beginPath();
    c.moveTo(0, -22);
    c.quadraticCurveTo(-14, -52 - k*12, -34, -44 - k*16);
    c.lineTo(-26, -30 - k*8); c.lineTo(-30, -22 - k*6);
    c.lineTo(-18, -20 - k*4); c.lineTo(-16, -14);
    c.closePath(); c.fill();
  };
  c.fillStyle = "rgba(0,0,0,.28)"; c.save(); c.translate(6, 2); alaForma(ala * .5); c.restore();
  c.fillStyle = piel;                                     // cuerpo
  c.beginPath(); c.ellipse(-4, -20, 20, 13, -.1, 0, 6.283); c.fill();
  c.fillStyle = panza;
  c.beginPath(); c.ellipse(-4, -15, 15, 7, -.1, 0, 6.283); c.fill();
  /* las patas encogidas, que va volando */
  c.strokeStyle = piel; c.lineWidth = 5;
  c.beginPath(); c.moveTo(-6, -10); c.lineTo(-2, -2); c.lineTo(6, -3); c.stroke();
  c.beginPath(); c.moveTo(6, -12); c.lineTo(11, -4); c.lineTo(18, -5); c.stroke();
  /* cuello y cabeza */
  c.strokeStyle = piel; c.lineWidth = 10;
  c.beginPath(); c.moveTo(10, -26); c.quadraticCurveTo(22, -38, 26, -48); c.stroke();
  c.fillStyle = piel;
  c.beginPath(); c.ellipse(30, -52, 13, 8, .25, 0, 6.283); c.fill();
  c.beginPath();                                          // el hocico
  c.moveTo(38, -54); c.lineTo(50, -50); c.lineTo(38, -46); c.closePath(); c.fill();
  c.beginPath();                                          // el cuerno
  c.moveTo(24, -58); c.lineTo(20, -70); c.lineTo(30, -60); c.closePath(); c.fill();
  c.fillStyle = "#FFD84D";
  c.beginPath(); c.ellipse(32, -55, 3.4, 2.8, 0, 0, 6.283); c.fill();
  c.fillStyle = "#1A1410";
  c.beginPath(); c.ellipse(33, -55, 1.3, 2.4, 0, 0, 6.283); c.fill();
  /* la llamita, que crece cuando corre */
  const fuego = 6 + (trote || 0) * 14 + Math.sin(G.t * 14) * 3;
  c.fillStyle = "#FF8A2B";
  c.beginPath(); c.moveTo(50, -52); c.lineTo(50 + fuego, -50); c.lineTo(50, -48); c.closePath(); c.fill();
  c.fillStyle = "#FFD84D";
  c.beginPath(); c.moveTo(50, -51); c.lineTo(50 + fuego * .6, -50); c.lineTo(50, -49); c.closePath(); c.fill();
  /* la cresta del lomo */
  c.fillStyle = panza;
  for (let k = 0; k < 5; k++){
    const px = 4 - k * 6;
    c.beginPath(); c.moveTo(px - 3, -31); c.lineTo(px + 3, -31); c.lineTo(px, -39); c.closePath(); c.fill();
  }
  /* El ala de delante, aclarada: con el mismo tono que el cuerpo tapaba al
     jinete y el conjunto se leía como una mancha. */
  c.fillStyle = panza; c.globalAlpha = .85; alaForma(ala); c.globalAlpha = 1;
  c.restore();
}

/* ---- la grúa de obra ----
   Camión con la pluma levantada y unos fierros colgando del gancho, que se
   balancean con la marcha. Es lo que pidió el dueño del repo, literal. */
function dibujarGrua(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const vaiven = Math.sin(G.t * 2.2) * (0.25 + (trote || 0) * 0.75);
  c.fillStyle = "rgba(0,0,0,.26)";
  c.beginPath(); c.ellipse(x, y + 12, 34, 10, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.scale(mira * 1.15, 1.15);
  c.fillStyle = "#2A2226";                                 // ruedas
  for (const rx of [-20, -6, 18]){ c.beginPath(); c.arc(rx, 8, 9, 0, 6.283); c.fill(); }
  c.fillStyle = "#8A8478";
  for (const rx of [-20, -6, 18]){ c.beginPath(); c.arc(rx, 8, 4, 0, 6.283); c.fill(); }
  c.fillStyle = "#FFB020";                                 // chasis
  rr(c, -28, -6, 52, 12, 3); c.fill();
  c.fillStyle = "#E28A10";
  rr(c, -28, -2, 52, 5, 2); c.fill();
  c.fillStyle = "#FFC53D";                                 // cabina
  rr(c, 12, -20, 17, 16, 4); c.fill();
  c.fillStyle = "#2A3A4A";
  rr(c, 15, -17, 11, 8, 2); c.fill();
  /* La pluma sale hacia ATRÁS y bien arriba. Saliendo hacia delante quedaba
     justo detrás del jinete, que mide cuarenta píxeles y la tapaba entera: la
     grúa se leía como un palé con ruedas. */
  c.save(); c.translate(-14, -14); c.rotate(-2.42);
  c.fillStyle = "#FFB020"; rr(c, 0, -5, 74, 10, 2); c.fill();
  c.strokeStyle = "#C97C0A"; c.lineWidth = 2;
  for (let k = 0; k < 8; k++){
    c.beginPath(); c.moveTo(4 + k*9, -5); c.lineTo(13 + k*9, 5); c.stroke();
  }
  c.restore();
  /* el cable y los fierros colgando */
  const gx = -14 + Math.cos(-2.42) * 74, gy = -14 + Math.sin(-2.42) * 74;
  c.strokeStyle = "#5A5248"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + vaiven * 10, gy + 26); c.stroke();
  c.save(); c.translate(gx + vaiven * 10, gy + 26); c.rotate(vaiven * .18);
  c.fillStyle = "#8A8478";                                 // el gancho
  rr(c, -4, -4, 8, 6, 2); c.fill();
  c.fillStyle = "#A8654A";                                 // los fierros, atados
  for (let k = 0; k < 3; k++) rr(c, -22 + k*2, 2 + k*4, 44, 3.5, 1.5), c.fill();
  c.strokeStyle = "#3A2416"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-6, 1); c.lineTo(-6, 15); c.stroke();
  c.beginPath(); c.moveTo(8, 1); c.lineTo(8, 15); c.stroke();
  c.restore();
  c.restore();
}

/* ---- el monster truck ----
   Todo son las ruedas: el chasis es la excusa para que quepan. Rebota al
   andar, que es lo que hacen estos con la suspensión. */
function dibujarMonster(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const bote = Math.sin(G.t * 7) * 2.2 * (trote || 0);
  const col = ["#E2453C","#3B7BC4","#8B6BEE"][i % 3];
  c.fillStyle = "rgba(0,0,0,.28)";
  c.beginPath(); c.ellipse(x, y + 14, 32, 9, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y + bote); c.scale(mira, 1);
  c.fillStyle = col;                                       // la carrocería, arriba
  rr(c, -20, -26, 40, 18, 5); c.fill();
  c.fillStyle = "rgba(255,255,255,.22)";
  rr(c, -14, -23, 16, 7, 2); c.fill();
  c.fillStyle = "#2A2226";                                 // el eje
  rr(c, -22, -10, 44, 5, 2); c.fill();
  /* las cuatro ruedas enormes, con taco */
  for (const rx of [-18, 18]){
    c.fillStyle = "#1A1410";
    c.beginPath(); c.arc(rx, 0, 16, 0, 6.283); c.fill();
    c.fillStyle = "#3A3238";
    for (let k = 0; k < 8; k++){
      const a = G.t * (trote ? 7 : 0) * mira + k * 0.785;
      c.save(); c.translate(rx, 0); c.rotate(a);
      c.fillRect(-2, -16, 4, 5);
      c.restore();
    }
    c.fillStyle = "#C9C2B8";
    c.beginPath(); c.arc(rx, 0, 6, 0, 6.283); c.fill();
  }
  c.restore();
}

/* ---- el carro romano ----
   Una biga: dos ruedas, la cesta detrás y un caballo tirando. El jinete va de
   pie, así que `sube` es poco. */
function dibujarCarroRomano(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const paso = G.t * 9;
  c.fillStyle = "rgba(0,0,0,.24)";
  c.beginPath(); c.ellipse(x, y + 12, 36, 10, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.scale(mira * 1.22, 1.22);
  /* el caballo, delante */
  c.fillStyle = "#8A6A4E";
  for (const [px, f] of [[26, 0], [40, Math.PI]]){
    c.save(); c.translate(px, -4);
    if (trote) c.rotate(Math.sin(paso + f) * .5 * trote);
    c.fillRect(-2, 0, 4, 16); c.restore();
  }
  c.fillStyle = "#9A7A56";
  rr(c, 22, -22, 26, 16, 7); c.fill();
  c.fillRect(44, -34, 5, 16);                              // cuello
  c.beginPath(); c.ellipse(48, -37, 8, 5.5, .2, 0, 6.283); c.fill();
  c.fillStyle = "#3A2416";
  c.beginPath(); c.moveTo(44, -42); c.lineTo(45, -48); c.lineTo(49, -42); c.closePath(); c.fill();
  c.beginPath(); c.arc(52, -38, 1.4, 0, 6.283); c.fill();
  c.fillStyle = "#C0452F";                                 // la crin
  for (let k = 0; k < 4; k++) c.fillRect(38 - k*3, -32 + k, 3, 7);
  /* las varas */
  c.strokeStyle = "#8A6A3C"; c.lineWidth = 3;
  c.beginPath(); c.moveTo(20, -12); c.lineTo(-2, -6); c.stroke();
  /* la cesta del carro */
  c.fillStyle = "#C9A46A";
  c.beginPath();
  c.moveTo(-24, -6); c.lineTo(4, -6); c.lineTo(4, -34);
  c.quadraticCurveTo(-12, -36, -24, -24); c.closePath(); c.fill();
  c.fillStyle = "#B08A50";                                 // la sombra de dentro
  c.beginPath();
  c.moveTo(-20, -8); c.lineTo(0, -8); c.lineTo(0, -28);
  c.quadraticCurveTo(-11, -30, -20, -22); c.closePath(); c.fill();
  c.fillStyle = "#FFD84D";                                 // el filo dorado
  rr(c, -24, -36, 28, 5, 2); c.fill();
  c.fillRect(-24, -22, 28, 3);
  /* la rueda de radios */
  c.save(); c.translate(-12, 2); c.rotate(trote ? G.t * 6 * mira : 0);
  c.strokeStyle = "#6A4E30"; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, 13, 0, 6.283); c.stroke();
  c.lineWidth = 2;
  for (let k = 0; k < 6; k++){
    const a = k * 1.047;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); c.stroke();
  }
  c.restore();
  c.restore();
}

/* ---- la carabela ----
   La Santa María de juguete: casco, palo mayor con la cruz y la vela hinchada
   que ondea. Flota, así que se mece en vez de rodar. */
function dibujarCarabela(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const mece = Math.sin(G.t * 1.8 + i) * 0.06;
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(x, y + 14, 32, 8, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.rotate(mece); c.scale(mira, 1);
  /* el casco */
  c.fillStyle = "#8A5A32";
  c.beginPath();
  c.moveTo(-28, -6); c.lineTo(28, -6);
  c.quadraticCurveTo(22, 12, -18, 12);
  c.quadraticCurveTo(-28, 10, -28, -6); c.closePath(); c.fill();
  c.fillStyle = "#6E4526";
  rr(c, -28, -8, 56, 5, 2); c.fill();
  c.fillStyle = "#C9A46A";                                 // el castillo de popa
  rr(c, -28, -20, 16, 14, 3); c.fill();
  /* el palo y la vela */
  c.fillStyle = "#6E4526";
  c.fillRect(2, -52, 4, 46);
  c.fillStyle = "#FFF6E1";
  c.beginPath();
  c.moveTo(4, -48);
  c.quadraticCurveTo(30 + Math.sin(G.t * 2) * 4, -34, 4, -14);
  c.closePath(); c.fill();
  c.strokeStyle = "#E2453C"; c.lineWidth = 3;              // la cruz
  c.beginPath(); c.moveTo(12, -40); c.lineTo(12, -24); c.stroke();
  c.beginPath(); c.moveTo(7, -33); c.lineTo(18, -33); c.stroke();
  /* la banderita del tope */
  c.fillStyle = "#FFD84D";
  c.beginPath(); c.moveTo(4, -52); c.lineTo(18, -48); c.lineTo(4, -44); c.closePath(); c.fill();
  c.restore();
}

/* ---- el trineo de Santa ----
   Dos renos tirando, el trineo rojo con el saco y los cascabeles. Vuela, así
   que flota sobre su sombra y va dejando polvo de nieve. */
function dibujarTrineo(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const flota = Math.sin(G.t * 2 + i) * 4;
  const paso = G.t * 8;
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(x, y + 22, 40, 10, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y + flota); c.scale(mira, 1);
  /* los dos renos, delante y en fila */
  [[34, 0], [62, Math.PI]].forEach(([rx, fase]) => {
    c.strokeStyle = "#6E4526"; c.lineWidth = 3.4; c.lineCap = "round";
    for (const px of [-6, 6]){
      const sw = trote ? Math.sin(paso + fase + px) * .5 : 0;
      c.save(); c.translate(rx + px, -6); c.rotate(sw);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 13); c.stroke();
      c.restore();
    }
    c.fillStyle = "#8A6A4E";
    c.beginPath(); c.ellipse(rx, -16, 15, 9, 0, 0, 6.283); c.fill();
    c.fillRect(rx + 10, -30, 5, 16);
    c.beginPath(); c.ellipse(rx + 15, -33, 8, 6, .2, 0, 6.283); c.fill();
    c.strokeStyle = "#5A3E22"; c.lineWidth = 2;          // la cornamenta
    for (const d of [-1, 1]){
      c.beginPath();
      c.moveTo(rx + 12, -38); c.lineTo(rx + 12 + d*6, -48);
      c.moveTo(rx + 12 + d*3, -43); c.lineTo(rx + 12 + d*9, -45); c.stroke();
    }
    c.fillStyle = "#E2453C";                              // la nariz
    c.beginPath(); c.arc(rx + 22, -33, 3.4, 0, 6.283); c.fill();
  });
  /* las riendas */
  c.strokeStyle = "#8A5A32"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(10, -12); c.lineTo(28, -18); c.stroke();
  /* el patín */
  c.strokeStyle = "#C9C2D8"; c.lineWidth = 4; c.lineCap = "round";
  c.beginPath();
  c.moveTo(-30, 12); c.lineTo(18, 12); c.quadraticCurveTo(28, 12, 26, 2); c.stroke();
  /* el cuerpo del trineo */
  c.fillStyle = "#C0452F";
  c.beginPath();
  c.moveTo(-30, 8); c.lineTo(16, 8); c.lineTo(14, -12);
  c.quadraticCurveTo(-6, -18, -30, -12); c.closePath(); c.fill();
  c.fillStyle = "#FFD84D";
  c.fillRect(-30, -4, 46, 4);
  /* el saco de regalos */
  c.fillStyle = "#8A5A32";
  c.beginPath(); c.ellipse(-18, -20, 14, 12, .2, 0, 6.283); c.fill();
  c.fillStyle = "#3DDC97";
  c.beginPath(); c.arc(-24, -28, 5, 0, 6.283); c.fill();
  c.fillStyle = "#5CE1EA";
  c.beginPath(); c.arc(-13, -30, 4.5, 0, 6.283); c.fill();
  /* cascabeles y nieve que va dejando */
  if (!REDUCED) for (let k = 0; k < 4; k++){
    const f = ((G.t * .6 + k / 4) % 1);
    c.globalAlpha = (1 - f) * .8;
    c.fillStyle = "#FFFFFF";
    c.beginPath(); c.arc(-34 - f * 26, 4 + Math.sin(G.t * 3 + k) * 6, 2.6, 0, 6.283); c.fill();
    c.globalAlpha = 1;
  }
  c.restore();
}

/* ---- la alfombra voladora ----
   Con el genio saliendo de la lámpara al timón. Ondea como una tela de verdad:
   el borde va en onda y con retraso respecto al centro. */
function dibujarAlfombra(c, x, y, giro, i, trote){
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const flota = Math.sin(G.t * 2.4 + i) * 4;
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(x, y + 20, 34, 9, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y + flota); c.scale(mira, 1);
  /* la tela: una banda que ondula de punta a punta */
  const alto = (px) => Math.sin(G.t * 4 + px * 0.09) * 5;
  const grad = c.createLinearGradient(-34, 0, 34, 0);
  grad.addColorStop(0, "#8B2E5E"); grad.addColorStop(.5, "#C0452F"); grad.addColorStop(1, "#8B2E5E");
  c.fillStyle = grad;
  c.beginPath();
  c.moveTo(-34, alto(-34));
  for (let px = -34; px <= 34; px += 6) c.lineTo(px, alto(px));
  for (let px = 34; px >= -34; px -= 6) c.lineTo(px, alto(px) + 11);
  c.closePath(); c.fill();
  /* la greca dorada */
  c.strokeStyle = "#FFD84D"; c.lineWidth = 2;
  c.beginPath();
  for (let px = -34; px <= 34; px += 6) c[px === -34 ? "moveTo" : "lineTo"](px, alto(px) + 3);
  c.stroke();
  c.beginPath();
  for (let px = -34; px <= 34; px += 6) c[px === -34 ? "moveTo" : "lineTo"](px, alto(px) + 8);
  c.stroke();
  /* los flecos de las puntas */
  c.strokeStyle = "#FFD84D"; c.lineWidth = 1.6;
  for (const px of [-34, 34]) for (let k = 0; k < 4; k++){
    c.beginPath();
    c.moveTo(px, alto(px) + 2 + k * 3);
    c.lineTo(px + (px < 0 ? -5 : 5), alto(px) + 4 + k * 3);
    c.stroke();
  }
  /* la lámpara, delante */
  c.fillStyle = "#FFD84D";
  c.beginPath(); c.ellipse(22, alto(22) - 8, 9, 6, 0, 0, 6.283); c.fill();
  c.beginPath();
  c.moveTo(29, alto(29) - 10); c.lineTo(38, alto(38) - 13); c.lineTo(30, alto(30) - 6);
  c.closePath(); c.fill();
  /* el genio, saliendo de ella en humo azul */
  const g = c.createLinearGradient(0, -52, 0, -6);
  g.addColorStop(0, "#7FD3F0"); g.addColorStop(1, "rgba(127,211,240,.25)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(24, alto(24) - 12);
  c.quadraticCurveTo(6, -30, 8, -44);
  c.quadraticCurveTo(12, -54, 22, -50);
  c.quadraticCurveTo(30, -44, 26, -30);
  c.quadraticCurveTo(24, -20, 30, alto(30) - 12);
  c.closePath(); c.fill();
  c.fillStyle = "#5FB8D8";                                 // el torso
  c.beginPath(); c.ellipse(16, -44, 11, 9, 0, 0, 6.283); c.fill();
  c.fillStyle = "#7FD3F0";
  c.beginPath(); c.arc(17, -56, 8, 0, 6.283); c.fill();    // la cabeza
  c.fillStyle = "#2A1226";                                 // el turbante
  c.beginPath(); c.arc(17, -60, 8, Math.PI, 0); c.fill();
  c.fillStyle = "#FF6B90";
  c.beginPath(); c.arc(17, -66, 3, 0, 6.283); c.fill();
  c.fillStyle = "#1A1410";                                 // los ojos
  c.beginPath(); c.arc(14, -56, 1.5, 0, 6.283); c.fill();
  c.beginPath(); c.arc(20, -56, 1.5, 0, 6.283); c.fill();
  c.strokeStyle = "#5FB8D8"; c.lineWidth = 4; c.lineCap = "round";
  c.beginPath(); c.moveTo(24, -46); c.lineTo(34, -40 + Math.sin(G.t * 3) * 3); c.stroke();
  c.restore();
}

/* ---- los especiales ----
   No se encuentran tirados: se ganan en la Ruleta o se compran en el Garaje.
   Se dibujan más grandes y con brillo propio: si te costaron 300 000, tienen
   que notarse desde el otro lado del mapa. */
function dibujarOvni(c, x, y, giro, i, trote){
  const flota = Math.sin(G.t * 2.2 + i) * 4;
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(x, y + 22, 30, 9, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y + flota);
  c.fillStyle = "rgba(140,220,255,.16)";                 // el haz de luz
  c.beginPath();
  c.moveTo(-14, 4); c.lineTo(14, 4); c.lineTo(26, 26); c.lineTo(-26, 26);
  c.closePath(); c.fill();
  c.fillStyle = "#7FD3F0";                               // la cúpula
  c.beginPath(); c.arc(0, -8, 15, Math.PI, 0); c.fill();
  c.fillStyle = "rgba(255,255,255,.4)";
  c.beginPath(); c.ellipse(-5, -13, 5, 3.4, -.4, 0, 6.283); c.fill();
  const plato = c.createLinearGradient(-32, 0, 32, 0);
  plato.addColorStop(0, "#5A5A66"); plato.addColorStop(.5, "#C9C2D8"); plato.addColorStop(1, "#5A5A66");
  c.fillStyle = plato;
  c.beginPath(); c.ellipse(0, -6, 32, 11, 0, 0, 6.283); c.fill();
  c.fillStyle = "#3A3444";
  c.beginPath(); c.ellipse(0, -2, 32, 8, 0, 0, 6.283); c.fill();
  for (let k = 0; k < 6; k++){                           // las luces girando
    const a = G.t * 2.4 + k * 1.047;
    const lx = Math.cos(a) * 26, ly = -4 + Math.sin(a) * 7;
    c.fillStyle = ["#FF6B90","#FFC53D","#8FE388","#5CE1EA","#8B6BEE","#FFEFE2"][k];
    c.globalAlpha = .5 + Math.sin(a) * .5;
    c.beginPath(); c.arc(lx, ly, 3.4, 0, 6.283); c.fill();
  }
  c.globalAlpha = 1;
  c.restore();
}

function dibujarChanclaVoladora(c, x, y, giro, i, trote){
  const aletea = Math.sin(G.t * 12) * .5;
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(0, 16, 26, 8, 0, 0, 6.283); c.fill();
  c.fillStyle = "#FFEFE2";                               // las alitas
  for (const lado of [-1, 1]){
    c.save(); c.scale(1, lado); c.rotate(aletea * lado * .3);
    c.beginPath(); c.ellipse(-4, -20, 20, 9, -.5, 0, 6.283); c.fill();
    c.restore();
  }
  c.fillStyle = "#7A0F2E";                               // la suela
  c.beginPath(); c.ellipse(0, 2, 30, 15, 0, 0, 6.283); c.fill();
  c.fillStyle = "#FF3D6E";
  c.beginPath(); c.ellipse(0, -1, 26, 12, 0, 0, 6.283); c.fill();
  c.strokeStyle = "#7A0F2E"; c.lineWidth = 5; c.lineCap = "round";
  c.beginPath(); c.moveTo(12, -1); c.lineTo(-6, -8); c.stroke();   // las tiras
  c.beginPath(); c.moveTo(12, -1); c.lineTo(-6, 6); c.stroke();
  c.lineCap = "butt";
  c.restore();
}

function dibujarCondor(c, x, y, giro, i, trote){
  const alas = Math.sin(G.t * 4.5 + i);
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(x, y + 24, 30, 9, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y + alas * 3); c.scale(mira, 1);
  c.fillStyle = "#2A2226";                               // las alas, enormes
  for (const lado of [-1, 1]){
    c.save(); c.scale(1, lado); c.rotate(alas * lado * .18);
    c.beginPath();
    c.moveTo(-6, -4); c.quadraticCurveTo(-30, -26, -54, -14);
    c.quadraticCurveTo(-30, -6, -6, 4); c.closePath(); c.fill();
    c.restore();
  }
  c.fillStyle = "#3A3238";
  c.beginPath(); c.ellipse(0, 0, 20, 11, 0, 0, 6.283); c.fill();
  c.fillStyle = "#FFEFE2";                               // el collar blanco
  c.beginPath(); c.ellipse(13, -2, 8, 6, 0, 0, 6.283); c.fill();
  c.fillStyle = "#2A2226";
  c.beginPath(); c.arc(21, -6, 7, 0, 6.283); c.fill();
  c.fillStyle = "#C97A1F";                               // la carúncula y el pico
  c.beginPath(); c.moveTo(26, -6); c.lineTo(36, -3); c.lineTo(26, 0); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(22, -13, 5, 4, -.4, 0, 6.283); c.fill();
  c.restore();
}

function dibujarAmaru(c, x, y, giro, i, trote){
  const onda = G.t * 3;
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(x, y + 22, 32, 9, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.scale(mira, 1);
  /* el cuerpo: anillos que se ondulan, de la cola a la cabeza */
  for (let k = 8; k >= 0; k--){
    const f = k / 8;
    const bx = -f * 54, by = Math.sin(onda + k * .7) * 9 * f;
    c.fillStyle = k % 2 ? "#2E8B32" : "#4FB84A";
    c.beginPath(); c.ellipse(bx, by, 13 - f * 7, 11 - f * 6, 0, 0, 6.283); c.fill();
  }
  c.fillStyle = "#E2453C";                               // las alas de plumas
  for (const lado of [-1, 1]){
    c.save(); c.scale(1, lado); c.rotate(Math.sin(onda * 1.6) * .18);
    c.beginPath();
    c.moveTo(-10, -4); c.quadraticCurveTo(-26, -30, -44, -18);
    c.quadraticCurveTo(-24, -8, -10, 2); c.closePath(); c.fill();
    c.restore();
  }
  c.fillStyle = "#4FB84A";                               // la cabeza
  c.beginPath(); c.ellipse(14, 0, 15, 12, 0, 0, 6.283); c.fill();
  c.fillStyle = "#FFC53D";                               // la cresta de oro
  for (let k = 0; k < 4; k++){
    c.beginPath();
    c.moveTo(6 + k * 5, -10); c.lineTo(9 + k * 5, -21); c.lineTo(12 + k * 5, -10);
    c.closePath(); c.fill();
  }
  c.fillStyle = "#FFEFE2"; c.beginPath(); c.arc(21, -3, 3.4, 0, 6.283); c.fill();
  c.fillStyle = "#2A1226"; c.beginPath(); c.arc(22, -3, 1.7, 0, 6.283); c.fill();
  c.fillStyle = "#E2453C";                               // la lengua bífida
  c.beginPath(); c.moveTo(28, 3); c.lineTo(40, 1); c.lineTo(34, 4); c.lineTo(40, 7);
  c.closePath(); c.fill();
  c.restore();
}

/* ---- los de juguete: carrito, vagoneta, dado y caparazón ---- */
const CARRITO_COLOR = ["#E2453C","#FFC53D","#5CE1EA","#8FE388","#FF6B90"];

/* Visto desde arriba: techo, capó, dos franjas y las cuatro ruedas asomando. */
function dibujarCarrito(c, x, y, giro, i, trote){
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(0, 7, 22, 8, 0, 0, 6.283); c.fill();
  c.fillStyle = "#2A1A16";                                  // ruedas
  for (const [rx, ry] of [[-11,-9],[11,-9],[-11,9],[11,9]]){
    const bote = trote ? Math.sin(G.t*22 + rx) * .8 * trote : 0;
    rr(c, rx-4, ry-3.5+bote, 8, 7, 2.5); c.fill();
  }
  const col = CARRITO_COLOR[i % CARRITO_COLOR.length];
  c.fillStyle = col;                                        // la carrocería
  rr(c, -19, -11, 38, 22, 7); c.fill();
  c.strokeStyle = "rgba(0,0,0,.22)"; c.lineWidth = 2;
  rr(c, -19, -11, 38, 22, 7); c.stroke();
  c.fillStyle = "#2A3A4A";                                  // el parabrisas
  rr(c, 1, -8, 9, 16, 3); c.fill();
  c.fillStyle = "rgba(255,255,255,.55)";                    // la franja de carreras
  c.fillRect(-16, -2.2, 12, 4.4);
  c.fillStyle = "#FFEFC0";                                  // faros
  c.beginPath(); c.arc(18, -6, 2.4, 0, 6.283); c.fill();
  c.beginPath(); c.arc(18, 6, 2.4, 0, 6.283); c.fill();
  c.restore();
}

/* La vagoneta de madera del tren de juguete: cubo, ruedas y el imán delante. */
function dibujarVagoneta(c, x, y, giro, i, trote){
  const col = ["#C0452F","#3B7BC4","#F2B33D","#5FA85A"][i % 4];
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(0, 8, 24, 8, 0, 0, 6.283); c.fill();
  c.fillStyle = "#3A2A1E";                                  // ruedas de madera
  for (const rx of [-12, 12]){
    const bote = trote ? Math.sin(G.t*20 + rx) * .7 * trote : 0;
    c.beginPath(); c.arc(rx, 8+bote, 5.5, 0, 6.283); c.fill();
    c.fillStyle = "#C9A46A"; c.beginPath(); c.arc(rx, 8+bote, 2.2, 0, 6.283); c.fill();
    c.fillStyle = "#3A2A1E";
  }
  c.fillStyle = col;                                        // el cajón
  rr(c, -20, -13, 40, 22, 4); c.fill();
  c.fillStyle = "rgba(0,0,0,.22)";                          // el hueco de la carga
  rr(c, -16, -10, 32, 13, 3); c.fill();
  c.fillStyle = "#8A8478";                                  // el imán del enganche
  c.fillRect(20, -3, 7, 6);
  c.restore();
}

/* El dado del Tablero. Los puntos van según la cara que quedó arriba. */
const CARAS_DADO = [[[0,0]],[[-1,-1],[1,1]],[[-1,-1],[0,0],[1,1]],
                    [[-1,-1],[1,-1],[-1,1],[1,1]],[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],
                    [[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]];
function dibujarDado(c, x, y, giro, i){
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(x, y+10, 13, 5, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "#FFEFE2";
  rr(c, -12, -12, 24, 24, 6); c.fill();
  c.strokeStyle = "rgba(0,0,0,.2)"; c.lineWidth = 1.6;
  rr(c, -12, -12, 24, 24, 6); c.stroke();
  c.fillStyle = "#2A1226";
  for (const [px, py] of CARAS_DADO[i % 6]){
    c.beginPath(); c.arc(px*6, py*6, 2.4, 0, 6.283); c.fill();
  }
  c.restore();
}

/* El caparazón del Circuito: verde el común, rojo el que persigue. */
function dibujarCaparazon(c, x, y, giro, i){
  const rojo = i % 4 === 0;
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(x, y+9, 13, 5, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "#F2E3C0";                                  // la panza
  c.beginPath(); c.ellipse(0, 4, 13, 7, 0, 0, 6.283); c.fill();
  c.fillStyle = rojo ? "#E2453C" : "#4FB84A";               // el caparazón
  c.beginPath(); c.arc(0, 1, 13, Math.PI, 0); c.fill();
  c.fillStyle = "rgba(255,255,255,.75)";                    // sus manchas
  for (const px of [-6.5, 0, 6.5]){
    c.beginPath(); c.ellipse(px, -4, 3, 2.6, 0, 0, 6.283); c.fill();
  }
  c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1.6;
  c.beginPath(); c.arc(0, 1, 13, Math.PI, 0); c.stroke();
  c.restore();
}

/* ---- coco y piedra: lo que rueda en la selva y en la montaña ---- */
function dibujarCoco(c, x, y, giro){
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(x, y+9, 12, 4.5, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = "#6B4A2A";
  c.beginPath(); c.arc(0, 0, 12, 0, 6.283); c.fill();
  c.strokeStyle = "rgba(60,40,20,.7)"; c.lineWidth = 1.6;  // las fibras
  for (let k=0;k<4;k++){
    c.beginPath(); c.ellipse(0, 0, 12, 5 + k*2, k*.8, 0, 6.283); c.stroke();
  }
  c.fillStyle = "#3A2416";                                 // los tres ojos
  for (const [ox,oy] of [[-3.5,-3],[3.5,-3],[0,3]]){
    c.beginPath(); c.arc(ox, oy, 1.9, 0, 6.283); c.fill();
  }
  c.restore();
}

function dibujarPiedra(c, x, y, giro, i){
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(x, y+9, 14, 5, 0, 0, 6.283); c.fill();
  c.save(); c.translate(x, y); c.rotate(giro);
  c.fillStyle = ["#8A8478","#9A9182","#736D62"][i % 3];
  c.beginPath();
  for (let k=0;k<7;k++){                                   // canto rodado, no un círculo
    const a = k*.897, r = 11 + az(i*5+k)*4;
    const px = Math.cos(a)*r, py = Math.sin(a)*r;
    k ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fill();
  c.fillStyle = "rgba(255,255,255,.16)";
  c.beginPath(); c.ellipse(-3.5, -4, 4.5, 3, -.5, 0, 6.283); c.fill();
  c.restore();
}

/* ============================================================
   Fauna: los bichos que se mueven
   ============================================================
   Son adorno puro y viven en el CLIENTE, no en el motor: no afectan a nada del
   juego, así que no tienen por qué viajar por la red veinte veces por segundo
   ni gastar estado de partida. Por eso usan `azar2` y no el RNG del motor. */
let fauna = [];

function sembrarFauna(esc){
  fauna = [];
  /* `ritmo` es el reloj del bicho (a qué velocidad respira, aletea o salta) y
     `vel` es a qué velocidad se DESPLAZA. Son dos cosas distintas: mezclarlas
     hacía que un delfín, que avanza a 35 px/s, agitara la cola treinta veces
     por segundo. */
  const nuevo = (tipo, x, y, extra) => fauna.push({
    tipo, x, y, x0: x, y0: y,
    t: azar2(0, 6.283), ritmo: azar2(.5, 1.1), vel: 1, mirada: 1,
    ...extra,
  });
  if (esc.id === "amazonas"){
    const RIO = WORLD_H - 240;
    // los delfines rosados: salen y se meten, siguiendo el río
    for (let i = 0; i < 4; i++)
      nuevo("delfin", azar2(200, WORLD_W - 200), azar2(RIO + 70, WORLD_H - 90),
            { rumbo: i % 2 ? 1 : -1, mirada: i % 2 ? 1 : -1,
              vel: azar2(26, 44), ritmo: azar2(.34, .5) });
    for (let i = 0; i < 5; i++) nuevo("guacamayo", azar2(150, WORLD_W - 150), azar2(120, RIO - 200), { r: azar2(60, 130), ritmo: azar2(.4, .65) });
    for (let i = 0; i < 4; i++) nuevo("mono", azar2(150, WORLD_W - 150), azar2(150, RIO - 160), { r: azar2(40, 90), ritmo: azar2(.45, .7) });
    for (let i = 0; i < 6; i++) nuevo("rana", azar2(120, WORLD_W - 120), azar2(150, RIO - 90), { salto: 0, ritmo: azar2(.5, .8) });
  }
  /* Los de juguete también tienen quien se mueva: sin eso el decorado es una
     foto y la pista o el circuito se ven muertos. */
  if (esc.id === "prehistoria"){
    /* Los pterodáctilos planean en círculos altos y los raptores cruzan la
       pampa a la carrera. Es lo que hace que el sitio no parezca un museo. */
    for (let i = 0; i < 5; i++)
      nuevo("pterodactilo", azar2(200, WORLD_W - 200), azar2(120, WORLD_H - 200),
            { r: azar2(90, 180), ritmo: azar2(.3, .5) });
    for (let i = 0; i < 3; i++)
      nuevo("raptor", azar2(200, WORLD_W - 200), azar2(200, WORLD_H - 150),
            { rumbo: i % 2 ? 1 : -1, mirada: i % 2 ? 1 : -1,
              vel: azar2(70, 120), ritmo: azar2(1.4, 2.0) });
  }
  if (esc.id === "pista"){
    CALLES_PISTA().forEach((y, k) => {
      for (let i = 0; i < 2; i++)
        nuevo("bolido", azar2(200, WORLD_W - 200), y, {
          rumbo: (k + i) % 2 ? 1 : -1, mirada: (k + i) % 2 ? 1 : -1,
          vel: azar2(190, 330), carril: y, color: (k*2+i) % 5, ritmo: azar2(.7, 1.1) });
    });
  }
  if (esc.id === "tablero"){
    for (let i = 0; i < 4; i++)
      nuevo("ficha", 0, 0, { f: i / 4, vel: azar2(.014, .026), color: i, ritmo: 1 });
  }
  if (esc.id === "mirador"){
    for (let i = 0; i < 2; i++)
      nuevo("trencito", 0, 0, { f: i / 2, vel: azar2(.020, .030), color: i, ritmo: 1 });
  }
  if (esc.id === "circuito"){
    for (let i = 0; i < 3; i++)
      nuevo("kart", 0, 0, { f: i / 3, vel: azar2(.030, .046), color: i, ritmo: 1 });
    for (let i = 0; i < 6; i++)
      nuevo("cajaItem", 0, 0, { f: (i + .5) / 6, vel: 0, giro: azar2(0, 6.283), ritmo: azar2(.5, .8) });
  }
}

/* Coloca a `a` sobre el óvalo `O` según su fracción de vuelta y le deja el
   ángulo de la tangente en `a.ang`, que es hacia donde mira. */
function sobreOvalo(a, O, dt){
  a.f = (a.f + a.vel * dt) % 1;
  const p = puntoOvalo(O, a.f);
  a.x = p.x; a.y = p.y;
  a.ang = Math.atan2(Math.cos(a.f * 6.283) * O.ry, -Math.sin(a.f * 6.283) * O.rx);
}

function animarFauna(dt){
  const RIO = WORLD_H - 240;
  /* Lo que se gira no salta de mirar a la izquierda a mirar a la derecha: se
     da la vuelta. `mirada` va de -1 a 1 y el dibujo la usa de escala, así que
     al pasar por 0 el bicho queda de canto, que es lo que hace de verdad. */
  const girar = (a, dt) => {
    a.mirada += (a.rumbo - a.mirada) * (1 - Math.pow(.001, dt * .9));
  };
  for (const a of fauna){
    a.t += dt * a.ritmo;
    if (a.tipo === "delfin"){
      a.x += a.rumbo * a.vel * dt;
      if (a.x < 140) a.rumbo = 1;
      if (a.x > WORLD_W - 140) a.rumbo = -1;
      a.x = clamp(a.x, 90, WORLD_W - 90);
      girar(a, dt);
      a.salto = Math.sin(a.t);                 // el arco de salir del agua
      a.y = clamp(a.y0 - Math.max(0, a.salto) * 26, RIO + 40, WORLD_H - 60);
    } else if (a.tipo === "pterodactilo"){     // planea en círculos anchos y lentos
      a.x = a.x0 + Math.cos(a.t * .4) * a.r;
      a.y = a.y0 + Math.sin(a.t * .55) * a.r * .38;
      a.mirada = Math.sin(a.t * .4) >= 0 ? -1 : 1;
    } else if (a.tipo === "raptor"){           // cruza la pampa a zancadas
      a.x += a.rumbo * a.vel * dt;
      if (a.x < 140) a.rumbo = 1;
      if (a.x > WORLD_W - 140) a.rumbo = -1;
      a.x = clamp(a.x, 90, WORLD_W - 90);
      girar(a, dt);
      a.y = a.y0 + Math.abs(Math.sin(a.t * 2)) * -5;   // el brinco de cada zancada
    } else if (a.tipo === "guacamayo"){        // vuela en círculos amplios
      a.x = a.x0 + Math.cos(a.t * .5) * a.r;
      a.y = a.y0 + Math.sin(a.t * .7) * a.r * .45;
    } else if (a.tipo === "bolido"){           // corre por su calle de la pista
      a.x += a.rumbo * a.vel * dt;
      if (a.x < 130) a.rumbo = 1;
      if (a.x > WORLD_W - 130) a.rumbo = -1;
      a.x = clamp(a.x, 80, WORLD_W - 80);
      girar(a, dt);
      a.y = a.carril + Math.sin(a.t * 1.4) * 4;
    } else if (a.tipo === "ficha"){            // da la vuelta al tablero a saltitos
      const A = ANILLO_TABLERO(), b = A.banda / 2;
      a.f = (a.f + a.vel * dt) % 1;
      const per = (A.w + A.h) * 2, d = a.f * per;
      if (d < A.w)                    { a.x = A.x + d;                  a.y = A.y + b; }
      else if (d < A.w + A.h)         { a.x = A.x + A.w - b;            a.y = A.y + (d - A.w); }
      else if (d < A.w*2 + A.h)       { a.x = A.x + A.w - (d - A.w - A.h); a.y = A.y + A.h - b; }
      else                            { a.x = A.x + b;                  a.y = A.y + A.h - (d - A.w*2 - A.h); }
    } else if (a.tipo === "trencito"){
      sobreOvalo(a, OVALO_TREN(), dt);
    } else if (a.tipo === "kart"){
      sobreOvalo(a, OVALO_KART(), dt);
    } else if (a.tipo === "cajaItem"){         // flota quieta en su sitio del circuito
      const p = puntoOvalo(OVALO_KART(), a.f);
      a.x = p.x; a.y = p.y;
    } else if (a.tipo === "mono"){             // se columpia de un lado a otro
      a.x = a.x0 + Math.sin(a.t * .8) * a.r;
      a.y = a.y0 + Math.abs(Math.cos(a.t * .8)) * 16;
    } else if (a.tipo === "rana"){             // saltitos cortos y un descanso
      /* Salta y espera. El seno pelado la tenía botando sin parar, que no es
         lo que hace una rana. */
      const ciclo = (a.t * .5) % 1;
      a.salto = ciclo < .32 ? Math.sin(ciclo / .32 * Math.PI) : 0;
      a.y = a.y0 - a.salto * 16;
      a.x = a.x0 + Math.sin(a.t * .22) * 26;
    }
  }
}

function drawFauna(){
  for (const a of fauna){
    if (a.tipo === "delfin")         dibujarDelfin(ctx, a);
    else if (a.tipo === "guacamayo") dibujarGuacamayo(ctx, a);
    else if (a.tipo === "pterodactilo") dibujarPterodactilo(ctx, a);
    else if (a.tipo === "raptor")    dibujarRaptor(ctx, a);
    else if (a.tipo === "mono")      dibujarMono(ctx, a);
    else if (a.tipo === "bolido")    dibujarBolido(ctx, a);
    else if (a.tipo === "ficha")     dibujarFicha(ctx, a);
    else if (a.tipo === "trencito")  dibujarTrencito(ctx, a);
    else if (a.tipo === "kart")      dibujarKart(ctx, a);
    else if (a.tipo === "cajaItem")  dibujarCajaItem(ctx, a);
    else                             dibujarRana(ctx, a);
  }
}

/* ---- lo que vuela y corre por la Prehistoria ---- */
function dibujarPterodactilo(c, a){
  const bat = Math.sin(a.t * 2.6);                       // el aleteo, lento y planeado
  c.save(); c.translate(a.x, a.y); c.scale(a.mirada || .01, 1);
  c.fillStyle = "rgba(0,0,0,.13)";                       // la sombra, lejos abajo
  c.beginPath(); c.ellipse(0, 46, 22, 6, 0, 0, 6.283); c.fill();
  c.fillStyle = "#8A6A4E";
  /* el ala membranosa: del hombro al dedo largo y de vuelta al cuerpo */
  for (const lado of [-1, 1]){
    c.beginPath();
    c.moveTo(0, -2);
    c.quadraticCurveTo(lado*20, -12 - bat*10, lado*40, -6 - bat*14);
    c.quadraticCurveTo(lado*26, 8 - bat*4, 0, 5);
    c.closePath(); c.fill();
  }
  c.fillStyle = "#6E5240";
  c.beginPath(); c.ellipse(0, 0, 7, 10, 0, 0, 6.283); c.fill();    // el cuerpo
  c.beginPath(); c.ellipse(0, -12, 4.5, 6, 0, 0, 6.283); c.fill(); // la cabeza
  c.beginPath();                                          // el pico largo
  c.moveTo(-2, -15); c.lineTo(2, -15); c.lineTo(0, -28); c.closePath(); c.fill();
  c.beginPath();                                          // la cresta de la nuca
  c.moveTo(-1, -16); c.lineTo(-9, -22); c.lineTo(-2, -12); c.closePath(); c.fill();
  c.restore();
}

function dibujarRaptor(c, a){
  const paso = a.t * 3;
  c.save(); c.translate(a.x, a.y); c.scale(a.mirada || .01, 1);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(0, 10, 17, 5, 0, 0, 6.283); c.fill();
  c.strokeStyle = "#8A6A3E"; c.lineCap = "round";
  c.lineWidth = 5;                                        // las dos patas, alternas
  [0, Math.PI].forEach(f => {
    const sw = Math.sin(paso + f);
    c.beginPath(); c.moveTo(-1, -4); c.lineTo(-4 + sw*5, 4); c.lineTo(2 + sw*7, 10); c.stroke();
  });
  c.lineWidth = 4;                                        // la cola, tiesa y horizontal
  c.beginPath(); c.moveTo(-8, -8);
  c.quadraticCurveTo(-20, -10 + Math.sin(paso*.7)*3, -30, -13); c.stroke();
  c.fillStyle = "#9A7748";
  c.beginPath(); c.ellipse(-2, -9, 11, 6.5, -.12, 0, 6.283); c.fill();   // el cuerpo
  c.strokeStyle = "#9A7748"; c.lineWidth = 4;
  c.beginPath(); c.moveTo(6, -12); c.lineTo(12, -19); c.stroke();        // el cuello
  c.fillStyle = "#9A7748";
  c.beginPath(); c.ellipse(15, -20, 6.5, 4, .2, 0, 6.283); c.fill();     // la cabeza
  c.fillStyle = "#FFD84D";
  c.beginPath(); c.arc(16, -21, 1.5, 0, 6.283); c.fill();
  c.restore();
}

/* ---- lo que corre por los escenarios de juguete ---- */
/* Son adorno: no chocan, no se pueden coger y el motor no sabe que existen. */
function dibujarBolido(c, a){
  c.save(); c.translate(a.x, a.y); c.scale(a.mirada || .01, 1);
  c.fillStyle = "rgba(0,0,0,.25)";
  c.beginPath(); c.ellipse(0, 8, 24, 7, 0, 0, 6.283); c.fill();
  c.fillStyle = "rgba(255,255,255,.18)";                 // la estela
  c.beginPath(); c.moveTo(-24, -6); c.lineTo(-64, -2); c.lineTo(-64, 2); c.lineTo(-24, 6); c.closePath(); c.fill();
  c.fillStyle = "#2A1A16";
  for (const [rx, ry] of [[-12,-9],[12,-9],[-12,9],[12,9]]){ rr(c, rx-4, ry-3.5, 8, 7, 2.5); c.fill(); }
  c.fillStyle = CARRITO_COLOR[a.color % CARRITO_COLOR.length];
  rr(c, -20, -11, 40, 22, 7); c.fill();
  c.fillStyle = "#2A3A4A"; rr(c, 2, -8, 9, 16, 3); c.fill();
  c.fillStyle = "rgba(255,255,255,.5)"; c.fillRect(-17, -2.2, 12, 4.4);
  c.restore();
}

function dibujarFicha(c, a){
  const salto = Math.abs(Math.sin(a.f * 82)) * 11;        // un brinco por casilla
  const col = ["#C9C2A8","#E2453C","#5CE1EA","#FFD84D"][a.color % 4];
  c.fillStyle = "rgba(0,0,0,.22)";
  c.beginPath(); c.ellipse(a.x, a.y + 12, 13 - salto*.3, 5, 0, 0, 6.283); c.fill();
  c.save(); c.translate(a.x, a.y - salto);
  c.fillStyle = col;
  c.beginPath(); c.ellipse(0, 8, 13, 5, 0, 0, 6.283); c.fill();   // la peana
  c.beginPath();
  c.moveTo(-8, 8); c.quadraticCurveTo(-3, -6, -5, -14);
  c.lineTo(5, -14); c.quadraticCurveTo(3, -6, 8, 8);
  c.closePath(); c.fill();
  c.beginPath(); c.arc(0, -19, 7, 0, 6.283); c.fill();
  c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1.6;
  c.beginPath(); c.arc(0, -19, 7, 0, 6.283); c.stroke();
  c.restore();
}

function dibujarTrencito(c, a){
  const col = a.color % 2 ? "#3B7BC4" : "#C0452F";
  c.save(); c.translate(a.x, a.y); c.rotate(a.ang);
  c.fillStyle = "rgba(0,0,0,.24)";
  c.beginPath(); c.ellipse(0, 10, 34, 10, 0, 0, 6.283); c.fill();
  /* dos vagones detrás de la locomotora */
  for (const dx of [-52, -26]){
    c.fillStyle = "#C9A46A"; rr(c, dx-11, -12, 22, 24, 4); c.fill();
    c.fillStyle = "rgba(0,0,0,.22)"; rr(c, dx-8, -9, 16, 18, 3); c.fill();
  }
  c.fillStyle = col; rr(c, -12, -14, 34, 28, 6); c.fill();       // la caldera
  c.fillStyle = "#2A2A30"; rr(c, 18, -10, 9, 20, 3); c.fill();   // la trompa
  c.fillStyle = "#3A2A1E";                                        // la chimenea
  c.beginPath(); c.arc(10, 0, 6, 0, 6.283); c.fill();
  c.fillStyle = "rgba(255,255,255,.5)";                           // el humo
  for (let k=0;k<3;k++){
    const f = (G.t * .9 + k/3) % 1;
    c.globalAlpha = (1 - f) * .5;
    c.beginPath(); c.arc(10 + f*26, -6 - f*16, 4 + f*7, 0, 6.283); c.fill();
  }
  c.globalAlpha = 1;
  c.fillStyle = "#F2E3C0";
  c.beginPath(); c.arc(0, 0, 6, 0, 6.283); c.fill();              // la cara
  c.fillStyle = "#2A1226";
  c.beginPath(); c.arc(-2, -2, 1.6, 0, 6.283); c.fill();
  c.beginPath(); c.arc(3, -2, 1.6, 0, 6.283); c.fill();
  c.restore();
}

function dibujarKart(c, a){
  c.save(); c.translate(a.x, a.y); c.rotate(a.ang);
  c.fillStyle = "rgba(0,0,0,.25)";
  c.beginPath(); c.ellipse(0, 9, 22, 8, 0, 0, 6.283); c.fill();
  c.fillStyle = "#2A1A16";
  for (const [rx, ry] of [[-11,-11],[12,-10],[-11,11],[12,10]]){ rr(c, rx-5, ry-4, 10, 8, 3); c.fill(); }
  c.fillStyle = ["#E2453C","#4FB84A","#2E6FD9"][a.color % 3];
  rr(c, -16, -10, 32, 20, 6); c.fill();
  c.fillStyle = "#2A2A30"; rr(c, -4, -6, 9, 12, 3); c.fill();     // el asiento
  c.fillStyle = "#F0C08A";                                         // el piloto
  c.beginPath(); c.arc(-1, 0, 6.5, 0, 6.283); c.fill();
  c.fillStyle = ["#E2453C","#4FB84A","#2E6FD9"][a.color % 3];      // su gorra
  c.beginPath(); c.arc(-1, -1, 6.5, Math.PI*1.05, Math.PI*1.95); c.fill();
  c.restore();
}

function dibujarCajaItem(c, a){
  const flota = Math.sin(a.t * 2) * 7;
  const gira = Math.cos(a.giro + G.t * 1.6);               // el balanceo de la caja
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(a.x, a.y + 26, 20, 7, 0, 0, 6.283); c.fill();
  c.save(); c.translate(a.x, a.y + flota); c.scale(gira < 0 ? -1 : 1, 1);
  c.globalAlpha = .85;
  c.fillStyle = "#FFEFE2"; rr(c, -22, -22, 44, 44, 8); c.fill();
  c.strokeStyle = "#FFC53D"; c.lineWidth = 5;
  rr(c, -22, -22, 44, 44, 8); c.stroke();
  c.globalAlpha = 1;
  c.fillStyle = "#E2453C"; c.font = "800 26px system-ui, sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("?", 0, 1);
  c.restore();
}

/* ---- el delfín rosado del Amazonas ---- */
function dibujarDelfin(c, a){
  const fuera = Math.max(0, a.salto);          // cuánto asoma del agua
  c.save(); c.translate(a.x, a.y); c.scale(a.mirada || .01, 1); c.rotate(-fuera * .5);
  c.fillStyle = "rgba(20,50,50,.28)";          // su sombra bajo el agua
  c.beginPath(); c.ellipse(0, 16, 34, 9, 0, 0, 6.283); c.fill();
  c.fillStyle = "#E88AA8";                     // el cuerpo, rosado
  c.beginPath();
  c.moveTo(-34, 2);
  c.quadraticCurveTo(-14, -17, 16, -13);
  c.quadraticCurveTo(34, -10, 42, 0);          // el hocico largo, que es lo suyo
  c.quadraticCurveTo(30, 6, 14, 8);
  c.quadraticCurveTo(-10, 12, -34, 2);
  c.closePath(); c.fill();
  c.fillStyle = "#D06B8E";
  c.beginPath();                                // la aleta dorsal, apenas una joroba
  c.moveTo(-4, -12); c.quadraticCurveTo(2, -22, 10, -12); c.closePath(); c.fill();
  c.beginPath();                                // la cola
  c.moveTo(-30, 2); c.lineTo(-46, -9); c.lineTo(-42, 3); c.lineTo(-46, 12);
  c.closePath(); c.fill();
  c.fillStyle = "#FFC3D6";                      // la panza más clara
  c.beginPath(); c.ellipse(-2, 5, 20, 4, .05, 0, 6.283); c.fill();
  c.fillStyle = "#3A2416";
  c.beginPath(); c.arc(18, -6, 1.8, 0, 6.283); c.fill();
  c.restore();
  if (fuera > .5){                              // salpicadura al salir
    c.fillStyle = "rgba(255,255,255,.5)";
    for (let k = 0; k < 4; k++){
      const ang = -2.4 + k * .6;
      c.beginPath();
      c.arc(a.x + Math.cos(ang) * 26, a.y + 14 + Math.sin(ang) * 8, 2.6, 0, 6.283);
      c.fill();
    }
  }
}

function dibujarGuacamayo(c, a){
  const ala = Math.sin(a.t * 8) * 9;
  c.save(); c.translate(a.x, a.y);
  c.fillStyle = "rgba(0,0,0,.13)";
  c.beginPath(); c.ellipse(0, 26, 12, 4, 0, 0, 6.283); c.fill();
  c.fillStyle = "#E2453C";
  c.beginPath(); c.ellipse(0, 0, 8, 11, .2, 0, 6.283); c.fill();
  c.fillStyle = "#37D6E0";                      // las alas batiendo
  c.beginPath(); c.ellipse(-11, -2 - ala, 10, 4, -.5 - ala * .04, 0, 6.283); c.fill();
  c.beginPath(); c.ellipse(11, -2 - ala, 10, 4, .5 + ala * .04, 0, 6.283); c.fill();
  c.fillStyle = "#FFD84D";
  c.beginPath(); c.moveTo(-3, 8); c.lineTo(3, 26); c.lineTo(6, 7); c.closePath(); c.fill();
  c.fillStyle = "#EDE3D0";
  c.beginPath(); c.arc(1, -11, 4.5, 0, 6.283); c.fill();
  c.fillStyle = "#3A2416";
  c.beginPath(); c.moveTo(4, -12); c.lineTo(10, -9); c.lineTo(4, -7); c.closePath(); c.fill();
  c.restore();
}

function dibujarMono(c, a){
  c.save(); c.translate(a.x, a.y);
  c.strokeStyle = "#4E7A34"; c.lineWidth = 2;   // la liana de la que cuelga
  c.beginPath(); c.moveTo(a.x0 - a.x, -70); c.lineTo(0, -18); c.stroke();
  c.fillStyle = "#8B6F52";
  c.beginPath(); c.ellipse(0, 0, 11, 13, 0, 0, 6.283); c.fill();
  c.beginPath(); c.arc(0, -15, 8, 0, 6.283); c.fill();
  c.fillStyle = "#C9A97E";
  c.beginPath(); c.ellipse(0, -13, 5.5, 6, 0, 0, 6.283); c.fill();
  for (const ox of [-8, 8]){ c.fillStyle = "#8B6F52"; c.beginPath(); c.arc(ox, -17, 4, 0, 6.283); c.fill(); }
  c.fillStyle = "#3A2416";
  c.beginPath(); c.arc(-2.4, -14, 1.3, 0, 6.283); c.fill();
  c.beginPath(); c.arc(2.4, -14, 1.3, 0, 6.283); c.fill();
  c.strokeStyle = "#8B6F52"; c.lineWidth = 2.6;
  c.beginPath(); c.moveTo(9, 6); c.quadraticCurveTo(26, 4, 22, -12); c.stroke();
  c.restore();
}

function dibujarRana(c, a){
  c.save(); c.translate(a.x, a.y);
  c.fillStyle = "rgba(0,0,0,.16)";
  c.beginPath(); c.ellipse(0, 10 + a.salto * 12, 10, 3.4, 0, 0, 6.283); c.fill();
  c.fillStyle = "#3DDC97";
  c.beginPath(); c.ellipse(0, 0, 10, 7.5, 0, 0, 6.283); c.fill();
  for (const ox of [-6, 6]){ c.beginPath(); c.arc(ox, -6, 4.2, 0, 6.283); c.fill(); }
  c.fillStyle = "#2FA875";                       // las patas, estiradas al saltar
  for (const ox of [-9, 9]){
    c.beginPath(); c.ellipse(ox, 5 + a.salto * 3, 4, 2.6, ox > 0 ? .6 : -.6, 0, 6.283); c.fill();
  }
  c.fillStyle = "#FFEFE2";
  for (const ox of [-6, 6]){ c.beginPath(); c.arc(ox, -6.5, 2.4, 0, 6.283); c.fill(); }
  c.fillStyle = "#1B1B20";
  for (const ox of [-6, 6]){ c.beginPath(); c.arc(ox, -6.5, 1.2, 0, 6.283); c.fill(); }
  c.restore();
}

/* ---- cómo se ve ir montado ----
   Antes el trasto se dibujaba en la posición exacta del jugador y el jugador
   encima, a la misma altura: no parecía subido, parecía que lo llevaba a
   cuestas. Tres cosas lo arreglan — el trasto baja a los pies, el jinete sube,
   y en vez de dos sombras solapadas hay una sola debajo de todo el conjunto. */
const MONTURA = {
  bici:       { baja: 6,  sube: 15, sombra: 30, atras: 0 },
  patineta:   { baja: 8,  sube: 8,  sombra: 26, atras: 0 },
  tablaArena: { baja: 8,  sube: 9,  sombra: 26, atras: 0 },
  tabla:      { baja: 9,  sube: 7,  sombra: 30, atras: 0 },
  balsa:      { baja: 10, sube: 8,  sombra: 32, atras: 0 },
  flotador:   { baja: 9,  sube: 5,  sombra: 22, atras: 0 },
  /* `atras`: el jinete se sienta hacia la cola. Sin esto la cabeza del animal
     queda tapada por la del jugador y la llama se ve como un bulto blanco. */
  llama:      { baja: 4,  sube: 28, sombra: 28, atras: 11 },
  camello:    { baja: 4,  sube: 32, sombra: 30, atras: 12 },
  /* El dinosaurio va aparte: es el doble de alto que la llama, así que el
     jinete sube el doble y se sienta casi sobre la cadera, que es donde
     tendría dónde agarrarse. */
  dino:       { baja: 2,  sube: 50, sombra: 40, atras: 21 },
  caballo:    { baja: 4,  sube: 30, sombra: 30, atras: 11 },
  /* En el carro y en la carabela vas DE PIE, no sentado: subes poco y te
     colocas donde está el hueco, atrás del todo. */
  carroRomano:{ baja: 6,  sube: 14, sombra: 38, atras: 16 },
  carabela:   { baja: 8,  sube: 22, sombra: 32, atras: 12 },
  motonieve:  { baja: 5,  sube: 16, sombra: 30, atras: 4 },
  elefante:   { baja: 4,  sube: 38, sombra: 36, atras: 14 },
  chocon:     { baja: 6,  sube: 12, sombra: 30, atras: 2 },
  hoverboard: { baja: 10, sube: 8,  sombra: 26, atras: 0 },
  dragon:     { baja: 0,  sube: 44, sombra: 38, atras: 6 },
  monster:    { baja: 3,  sube: 26, sombra: 32, atras: 0 },
  /* En la grúa vas en la cabina, que está adelante y alta. */
  grua:       { baja: 4,  sube: 24, sombra: 36, atras: -14 },
  /* En el trineo vas sentado dentro del saco; en la alfombra, cruzado encima. */
  trineo:     { baja: 2,  sube: 22, sombra: 34, atras: 16 },
  alfombra:   { baja: 6,  sube: 14, sombra: 30, atras: 0 },
  /* En el carrito y en la vagoneta vas metido dentro: subes poco y te sientas
     atrás, que es donde está el hueco. */
  carrito:    { baja: 5,  sube: 12, sombra: 26, atras: 6 },
  vagoneta:   { baja: 5,  sube: 14, sombra: 27, atras: 4 },
  /* Los especiales van por el aire, así que el jinete sube bastante más. */
  ovni:       { baja: 2,  sube: 20, sombra: 30, atras: 0 },
  chancla:    { baja: 6,  sube: 16, sombra: 28, atras: 0 },
  condor:     { baja: 4,  sube: 22, sombra: 30, atras: 10 },
  amaru:      { baja: 4,  sube: 24, sombra: 32, atras: 14 },
};
const monturaDe = p => (p.montado != null ? MONTURA[trastoDe(G, p.montado)?.tipo] : null) || null;

/* Todo lo que se puede montar o patear. Va después de las cáscaras y antes de
   la gente: así el que va montado sale dibujado encima de su bici. */
/* Un balón por el aire se dibuja más grande y con la sombra separada debajo:
   es lo único que distingue "va volando" de "va rodando" en una vista cenital. */
function altoDeTrasto(v){ return v.z ? v.z : 0; }

function drawTrastos(){
  for (const v of G.trastos){
    const i = v.variante;
    if (v.montadoPor != null){
      /* Lo que alguien lleva montado se dibuja aparte: a los pies del jinete,
         con su sombra y con la inclinación de la marcha. */
      const p = G.players[v.montadoPor];
      if (!p) continue;
      const M = MONTURA[v.tipo] || { baja: 6, sube: 10, sombra: 26 };
      const anda = Math.min(1, Math.hypot(p.vx, p.vy) / 300);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.24)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + M.baja + 8, M.sombra, M.sombra * .3, 0, 0, 6.283);
      ctx.fill();
      ctx.translate(p.x, p.y + M.baja);
      ctx.rotate(Math.sin(G.t * 9) * .035 * anda);      // el vaivén de ir rodando
      if (p.face < 0) ctx.scale(-1, 1);                 // mirar a la izquierda es un espejo
      ctx.translate(-p.x, -(p.y + M.baja));
      dibujarTrasto(v, p.x, p.y + M.baja, 0, anda);
      ctx.restore();
      continue;
    }
    /* Por el aire: la sombra se queda en el suelo y el balón sube y crece. Es
       lo único que distingue "va volando" de "va rodando" mirando desde arriba. */
    const alto = v.z || 0;
    if (alto > 1){
      const k = clamp(alto / 260, 0, 1);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0," + (0.26 - k * 0.14).toFixed(2) + ")";
      ctx.beginPath();
      ctx.ellipse(v.x, v.y + 6, 13 - k * 5, (13 - k * 5) * 0.38, 0, 0, 6.283);
      ctx.fill();
      ctx.translate(v.x, v.y - alto * 0.55);
      ctx.scale(1 + k * 0.55, 1 + k * 0.55);
      dibujarTrasto(v, 0, 0, v.giro);
      ctx.restore();
      continue;
    }
    dibujarTrasto(v, v.x, v.y, v.giro);
  }
}

function dibujarTrasto(v, x, y, giro, trote){
  {
    const i = v.variante;
    if (v.tipo === "bici")            biciBarrio(ctx, x, y, i, giro);
    else if (v.tipo === "patineta")   dibujarPatineta(ctx, x, y, giro, i);
    else if (v.tipo === "tabla")      dibujarTabla(ctx, x, y, giro, i);
    else if (v.tipo === "flotador")   dibujarFlotador(ctx, x, y, giro, i);
    else if (v.tipo === "tablaArena") dibujarTablaArena(ctx, x, y, giro, i);
    else if (v.tipo === "balsa")      dibujarBalsa(ctx, x, y, giro, i);
    else if (v.tipo === "llama")      dibujarBestia(ctx, x, y, giro, i, "llama", trote);
    else if (v.tipo === "camello")    dibujarBestia(ctx, x, y, giro, i, "camello", trote);
    else if (v.tipo === "dino")       dibujarDino(ctx, x, y, giro, i, trote);
    else if (v.tipo === "caballo")    dibujarCaballo(ctx, x, y, giro, i, trote);
    else if (v.tipo === "carroRomano") dibujarCarroRomano(ctx, x, y, giro, i, trote);
    else if (v.tipo === "carabela")   dibujarCarabela(ctx, x, y, giro, i, trote);
    else if (v.tipo === "motonieve")  dibujarMotonieve(ctx, x, y, giro, i, trote);
    else if (v.tipo === "elefante")   dibujarElefante(ctx, x, y, giro, i, trote);
    else if (v.tipo === "chocon")     dibujarChocon(ctx, x, y, giro, i, trote);
    else if (v.tipo === "hoverboard") dibujarHoverboard(ctx, x, y, giro, i, trote);
    else if (v.tipo === "bolaNieve")  dibujarBolaNieve(ctx, x, y, giro, i);
    else if (v.tipo === "banano")     dibujarBanano(ctx, x, y, giro, i);
    else if (v.tipo === "algodon")    dibujarAlgodon(ctx, x, y, giro, i);
    else if (v.tipo === "tuerca")     dibujarTuerca(ctx, x, y, giro, i);
    else if (v.tipo === "dragon")     dibujarDragon(ctx, x, y, giro, i, trote);
    else if (v.tipo === "monster")    dibujarMonster(ctx, x, y, giro, i, trote);
    else if (v.tipo === "grua")       dibujarGrua(ctx, x, y, giro, i, trote);
    else if (v.tipo === "trineo")     dibujarTrineo(ctx, x, y, giro, i, trote);
    else if (v.tipo === "alfombra")   dibujarAlfombra(ctx, x, y, giro, i, trote);
    else if (v.tipo === "ladrillo")   dibujarLadrillo(ctx, x, y, giro, i);
    else if (v.tipo === "barril")     dibujarBarril(ctx, x, y, giro, i);
    else if (v.tipo === "anfora")     dibujarAnfora(ctx, x, y, giro, i);
    else if (v.tipo === "cofre")      dibujarCofre(ctx, x, y, giro, i);
    else if (v.tipo === "mata")       dibujarMata(ctx, x, y, giro, i);
    else if (v.tipo === "ovni")       dibujarOvni(ctx, x, y, giro, i, trote);
    else if (v.tipo === "chancla")    dibujarChanclaVoladora(ctx, x, y, giro, i, trote);
    else if (v.tipo === "condor")     dibujarCondor(ctx, x, y, giro, i, trote);
    else if (v.tipo === "amaru")      dibujarAmaru(ctx, x, y, giro, i, trote);
    else if (v.tipo === "carrito")    dibujarCarrito(ctx, x, y, giro, i, trote);
    else if (v.tipo === "vagoneta")   dibujarVagoneta(ctx, x, y, giro, i, trote);
    else if (v.tipo === "dado")       dibujarDado(ctx, x, y, giro, i);
    else if (v.tipo === "caparazon")  dibujarCaparazon(ctx, x, y, giro, i);
    else if (v.tipo === "coco")       dibujarCoco(ctx, x, y, giro);
    else if (v.tipo === "piedra")     dibujarPiedra(ctx, x, y, giro, i);
    else                              pelotaBarrio(ctx, x, y, i, giro);
  }
}

/* ---------- Egipto: pirámides, la esfinge, obeliscos y datileras ---------- */
function decoEgipto(c, E){
  /* dunas: bandas suaves de arena más y menos tostada */
  for (let k=0;k<9;k++){
    c.fillStyle = k%2 ? "rgba(255,240,200,.12)" : "rgba(180,140,80,.12)";
    c.beginPath();
    c.moveTo(0, k*200);
    for (let x=0;x<=DECO_W;x+=60) c.lineTo(x, k*200 + Math.sin(x*.004 + k)*36);
    c.lineTo(DECO_W, k*200+120); c.lineTo(0, k*200+120);
    c.closePath(); c.fill();
  }
  c.fillStyle = E.mancha;
  for (let i=0;i<12;i++){
    const x = azEntre(i,0,DECO_W), y = azEntre(i+31,0,DECO_H), r = 40+az(i+3)*50;
    c.beginPath(); c.ellipse(x,y,r,r*.4,0,0,6.283); c.fill();
  }

  /* las pirámides, vistas en tres cuartos: dos caras y la arista */
  sembrar(c, 4, 31, 130, (c,x,y,i) => {
    const w = 190 + az(i)*90, h = 150 + az(i+4)*70;
    vetoDeco.push({ x:x-w/2-20, y:y-h-20, w:w+40, h:h+50 });
    c.fillStyle = "rgba(120,90,40,.3)";                       // sombra en la arena
    c.beginPath();
    c.moveTo(x-w/2, y); c.lineTo(x+w/2+50, y+16); c.lineTo(x+w/2, y+26); c.lineTo(x-w/2-30, y+10);
    c.closePath(); c.fill();
    c.fillStyle = "#D9B676";                                  // cara iluminada
    c.beginPath(); c.moveTo(x, y-h); c.lineTo(x-w/2, y); c.lineTo(x, y+14); c.closePath(); c.fill();
    c.fillStyle = "#B08A4A";                                  // cara en sombra
    c.beginPath(); c.moveTo(x, y-h); c.lineTo(x+w/2, y); c.lineTo(x, y+14); c.closePath(); c.fill();
    c.strokeStyle = "rgba(90,65,25,.45)"; c.lineWidth = 2;    // los escalones
    for (let k=1;k<9;k++){
      const f = k/9;
      c.beginPath();
      c.moveTo(x - (w/2)*f, y - h*(1-f));
      c.lineTo(x + (w/2)*f, y - h*(1-f));
      c.stroke();
    }
    c.strokeStyle = "rgba(255,240,200,.5)"; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(x, y-h); c.lineTo(x, y+14); c.stroke();   // la arista
    c.fillStyle = "#FFD84D";                                  // el remate dorado
    c.beginPath(); c.moveTo(x, y-h); c.lineTo(x-9, y-h+16); c.lineTo(x+9, y-h+16); c.closePath(); c.fill();
  });

  /* la esfinge: una sola, tumbada y mirando al este */
  sembrar(c, 1, 401, 120, (c,x,y) => {
    vetoDeco.push({ x:x-95, y:y-80, w:190, h:110 });
    c.fillStyle = "rgba(120,90,40,.28)";
    c.beginPath(); c.ellipse(x, y+10, 92, 18, 0, 0, 6.283); c.fill();
    c.fillStyle = "#CBA96C";                                  // el cuerpo tumbado
    rr(c, x-88, y-34, 150, 44, 12); c.fill();
    c.fillStyle = "#BC9856";                                  // las patas delanteras
    rr(c, x+34, y-14, 56, 20, 8); c.fill();
    c.fillStyle = "#D9B676";                                  // la cabeza
    rr(c, x+46, y-72, 40, 42, 8); c.fill();
    c.fillStyle = "#37D6E0";                                  // el nemes rayado
    for (let k=0;k<4;k++) c.fillRect(x+46, y-72+k*10, 40, 4.5);
    c.fillStyle = "#3A2416";
    c.beginPath(); c.arc(x+78, y-56, 2.6, 0, 6.283); c.fill();
  });

  /* obeliscos con jeroglíficos */
  sembrar(c, 5, 901, 44, (c,x,y,i) => {
    const h = 96 + az(i)*40;
    c.fillStyle = "rgba(120,90,40,.28)";
    c.beginPath(); c.ellipse(x, y+6, 22, 8, 0, 0, 6.283); c.fill();
    c.fillStyle = "#C9A05E";
    c.beginPath();
    c.moveTo(x-11, y); c.lineTo(x-8, y-h); c.lineTo(x+8, y-h); c.lineTo(x+11, y);
    c.closePath(); c.fill();
    c.fillStyle = "#FFD84D";                                  // la punta
    c.beginPath(); c.moveTo(x-8, y-h); c.lineTo(x, y-h-18); c.lineTo(x+8, y-h); c.closePath(); c.fill();
    c.fillStyle = "rgba(90,65,25,.6)";                        // jeroglíficos
    for (let k=0;k<6;k++){
      const gy = y - 14 - k*(h-24)/6;
      c.fillRect(x-4, gy, 8, 2.4);
      if (k%2) c.fillRect(x-2, gy-5, 4, 3.4);
      else { c.beginPath(); c.arc(x, gy-5, 2.2, 0, 6.283); c.fill(); }
    }
  });

  /* palmeras datileras y cráneos resecos */
  sembrar(c, 8, 1501, 40, (c,x,y,i) => {
    c.fillStyle = "rgba(120,90,40,.25)";
    c.beginPath(); c.ellipse(x, y+6, 20, 7, 0, 0, 6.283); c.fill();
    c.fillStyle = "#8B6F52";
    c.beginPath();
    c.moveTo(x-6, y+4); c.quadraticCurveTo(x-2, y-38, x-9, y-72);
    c.lineTo(x+1, y-72); c.quadraticCurveTo(x+5, y-38, x+6, y+4);
    c.closePath(); c.fill();
    for (let k=0;k<7;k++){
      const a = -2.7 + k*.63;
      c.fillStyle = k%2 ? "#5B8C3E" : "#6FA84C";
      c.save(); c.translate(x-4, y-74); c.rotate(a);
      c.beginPath(); c.moveTo(0,0); c.quadraticCurveTo(28,-14, 54,4);
      c.quadraticCurveTo(28,0, 0,5); c.closePath(); c.fill();
      c.restore();
    }
    c.fillStyle = "#C4693F";                                  // racimo de dátiles
    for (let k=0;k<5;k++)
      { c.beginPath(); c.arc(x-4+az(i*3+k)*14-7, y-66+az(i+k)*8, 2.6, 0, 6.283); c.fill(); }
  });
  sembrar(c, 6, 2001, 24, (c,x,y) => {
    c.fillStyle = "#EDE3D0";
    c.beginPath(); c.ellipse(x, y, 13, 10, 0, 0, 6.283); c.fill();
    c.beginPath(); c.moveTo(x-13,y-3); c.lineTo(x-24,y-14); c.lineTo(x-18,y-1); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x+13,y-3); c.lineTo(x+24,y-14); c.lineTo(x+18,y-1); c.closePath(); c.fill();
    c.fillStyle = "#3A2416";
    c.beginPath(); c.ellipse(x-5, y-2, 3, 3.6, 0, 0, 6.283); c.fill();
    c.beginPath(); c.ellipse(x+5, y-2, 3, 3.6, 0, 0, 6.283); c.fill();
  });
}

/* ---------- El Amazonas: el río, la espesura y sus bichos ---------- */
function decoAmazonas(c, E){
  const RIO = DECO_H - 240;          // tiene que casar con `mar` del escenario

  /* la espesura: manchas de verde a distintas alturas para dar profundidad */
  for (let i=0;i<26;i++){
    const x = azEntre(i,0,DECO_W), y = azEntre(i+31,0,RIO), r = 50+az(i+3)*70;
    c.fillStyle = i%2 ? "rgba(45,85,40,.3)" : "rgba(70,110,55,.26)";
    c.beginPath(); c.ellipse(x,y,r,r*.6,i,0,6.283); c.fill();
  }

  /* el río, con su ribera de barro y la corriente marcada */
  const barro = c.createLinearGradient(0, RIO-70, 0, RIO+6);
  barro.addColorStop(0, "rgba(90,70,40,0)");
  barro.addColorStop(1, "rgba(105,80,45,.7)");
  c.fillStyle = barro; c.fillRect(0, RIO-70, DECO_W, 76);

  const agua = c.createLinearGradient(0, RIO, 0, DECO_H);
  agua.addColorStop(0, "#6E7A3A");
  agua.addColorStop(.4, "#4A6B4E");
  agua.addColorStop(1, "#2E4A48");
  c.fillStyle = agua;
  c.beginPath();
  c.moveTo(0, RIO);
  for (let x=0;x<=DECO_W;x+=30) c.lineTo(x, RIO + Math.sin(x*.009)*18 + Math.sin(x*.003)*11);
  c.lineTo(DECO_W, DECO_H); c.lineTo(0, DECO_H);
  c.closePath(); c.fill();
  c.strokeStyle = "rgba(200,220,180,.35)"; c.lineWidth = 4; c.lineCap = "round";
  for (let k=0;k<5;k++){                                       // la corriente
    c.beginPath();
    const y0 = RIO + 46 + k*36;
    for (let x=0;x<=DECO_W;x+=40){
      const y = y0 + Math.sin(x*.012 + k)*7;
      x === 0 ? c.moveTo(x,y) : c.lineTo(x,y);
    }
    c.stroke();
  }
  c.lineCap = "butt";

  /* nenúfares gigantes y un caimán, dentro del agua */
  for (let i=0;i<9;i++){
    const x = azEntre(i+90, 60, DECO_W-60), y = azEntre(i+140, RIO+40, DECO_H-40);
    c.fillStyle = "#4E8C3A";
    c.beginPath(); c.ellipse(x, y, 26+az(i)*12, 20+az(i+2)*9, az(i)*3, 0, 6.283); c.fill();
    c.fillStyle = "#3E7030";
    c.beginPath(); c.moveTo(x, y); c.lineTo(x+22, y+8); c.lineTo(x+12, y+16); c.closePath(); c.fill();
    if (i % 3 === 0){                                          // su flor
      c.fillStyle = "#FFEFE2";
      for (let k=0;k<8;k++){
        const a = k*.785;
        c.beginPath();
        c.ellipse(x+Math.cos(a)*6, y+Math.sin(a)*5, 4.6, 2.6, a, 0, 6.283); c.fill();
      }
      c.fillStyle = "#FFD84D";
      c.beginPath(); c.arc(x, y, 3, 0, 6.283); c.fill();
    }
  }
  for (let i=0;i<2;i++){                                       // caimán al acecho
    const x = azEntre(i+500, 300, DECO_W-300), y = azEntre(i+520, RIO+70, DECO_H-70);
    c.fillStyle = "#3E5A34";
    rr(c, x-52, y-9, 104, 18, 8); c.fill();
    c.beginPath(); c.moveTo(x+52, y); c.lineTo(x+78, y-6); c.lineTo(x+78, y+6); c.closePath(); c.fill();
    c.fillStyle = "#2E4628";
    for (let k=0;k<7;k++){
      c.beginPath();
      c.moveTo(x-44+k*13, y-9); c.lineTo(x-39+k*13, y-17); c.lineTo(x-34+k*13, y-9);
      c.closePath(); c.fill();
    }
    c.fillStyle = "#FFD84D";
    c.beginPath(); c.arc(x+34, y-10, 3.4, 0, 6.283); c.fill();
    c.fillStyle = "#1B1B20";
    c.beginPath(); c.arc(x+34, y-10, 1.5, 0, 6.283); c.fill();
  }

  /* árboles enormes con lianas */
  sembrar(c, 9, 41, 62, (c,x,y,i) => {
    vetoDeco.push({ x:x-40, y:y-96, w:80, h:110 });
    c.fillStyle = "rgba(0,0,0,.24)";
    c.beginPath(); c.ellipse(x, y+8, 36, 12, 0, 0, 6.283); c.fill();
    c.fillStyle = "#6B4A2A";                                   // tronco con raíces
    rr(c, x-11, y-70, 22, 78, 5); c.fill();
    c.beginPath(); c.moveTo(x-11, y+8); c.lineTo(x-28, y+10); c.lineTo(x-11, y-14); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x+11, y+8); c.lineTo(x+28, y+10); c.lineTo(x+11, y-14); c.closePath(); c.fill();
    for (const [dx,dy,r] of [[0,-96,40],[-26,-78,28],[26,-80,30],[-10,-112,26]]){
      c.fillStyle = ["#2F6B2A","#3E8434","#265C22"][(i+Math.abs(dx))%3];
      c.beginPath(); c.arc(x+dx, y+dy, r, 0, 6.283); c.fill();
    }
    c.strokeStyle = "#4E7A34"; c.lineWidth = 2.4;              // lianas colgando
    for (let k=0;k<3;k++){
      const lx = x - 24 + k*24;
      c.beginPath(); c.moveTo(lx, y-86);
      c.quadraticCurveTo(lx + (k-1)*12, y-50, lx + (k-1)*6, y-16);
      c.stroke();
    }
  }, RIO - 90);


  /* helechos del sotobosque */
  sembrar(c, 14, 1301, 20, (c,x,y,i) => {
    for (let k=0;k<6;k++){
      const a = -1.5708 + (k-2.5)*.34;
      c.strokeStyle = k%2 ? "#4E8C3A" : "#3E7030"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a)*14, y + Math.sin(a)*16,
                         x + Math.cos(a)*24, y + Math.sin(a)*20 + 4);
      c.stroke();
    }
  }, RIO - 40);
}

/* ---------- Machu Picchu: andenes, ruinas, llamas y neblina ---------- */
function decoMachuPicchu(c, E){
  /* andenes: las terrazas escalonadas de la ladera, en bandas horizontales */
  for (let k = 0; k < 7; k++){
    const y = 120 + k * 230, alto = 150;
    c.fillStyle = k % 2 ? "rgba(120,150,95,.35)" : "rgba(100,130,80,.3)";
    c.fillRect(0, y, DECO_W, alto);
    c.fillStyle = "rgba(120,116,104,.85)";        // el muro de piedra del andén
    c.fillRect(0, y + alto, DECO_W, 16);
    c.strokeStyle = "rgba(60,58,52,.5)"; c.lineWidth = 2;
    for (let x = 0; x < DECO_W; x += 46){
      c.strokeRect(x, y + alto, 46, 16);
    }
  }
  c.fillStyle = E.mancha;
  for (let i=0;i<16;i++){
    const x = azEntre(i,0,DECO_W), y = azEntre(i+41,0,DECO_H), r = 30+az(i+3)*44;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* ruinas: recintos de piedra sin techo, con sus vanos trapezoidales */
  sembrar(c, 6, 61, 76, (c,x,y,i) => {
    const w = 110 + az(i)*40, h = 78 + az(i+3)*26;
    vetoDeco.push({ x:x-w/2-12, y:y-h-12, w:w+24, h:h+30 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+6, w*.55, 14, 0, 0, 6.283); c.fill();
    c.fillStyle = "#9A9182";
    rr(c, x-w/2, y-h, w, h, 4); c.fill();
    c.strokeStyle = "rgba(60,58,52,.55)"; c.lineWidth = 2;   // sillares
    for (let f=0; f<4; f++){
      const fy = y-h + f*(h/4);
      c.beginPath(); c.moveTo(x-w/2, fy); c.lineTo(x+w/2, fy); c.stroke();
      for (let q=0;q<4;q++){
        const qx = x-w/2 + (w/4)*q + (f%2 ? w/8 : 0);
        c.beginPath(); c.moveTo(qx, fy); c.lineTo(qx, fy + h/4); c.stroke();
      }
    }
    c.fillStyle = "#3A3630";                                  // la puerta trapezoidal
    c.beginPath();
    c.moveTo(x-15, y); c.lineTo(x-11, y-40); c.lineTo(x+11, y-40); c.lineTo(x+15, y);
    c.closePath(); c.fill();
  });

  /* llamas: la estampa del sitio */
  sembrar(c, 7, 601, 38, (c,x,y,i) => {
    const cuerpo = ["#EDE3D0","#C9B79A","#8B6F52"][i % 3];
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+9, 20, 6, 0, 0, 6.283); c.fill();
    c.fillStyle = "#6E5A44";                                  // patas
    for (const px of [-11,-6,7,12]) c.fillRect(x+px, y-6, 3.4, 15);
    c.fillStyle = cuerpo;                                     // cuerpo
    rr(c, x-16, y-26, 32, 22, 10); c.fill();
    const mira = i % 2 ? 1 : -1;
    c.fillRect(x + mira*11, y-42, 5, 20);                     // cuello
    c.beginPath(); c.ellipse(x + mira*15, y-46, 8, 6.5, 0, 0, 6.283); c.fill();
    c.fillStyle = "#3A2416";                                  // orejas y ojo
    c.beginPath(); c.moveTo(x+mira*12, y-51); c.lineTo(x+mira*13, y-58); c.lineTo(x+mira*16, y-51); c.closePath(); c.fill();
    c.beginPath(); c.arc(x + mira*17, y-47, 1.5, 0, 6.283); c.fill();
    c.fillStyle = "#E2453C";                                  // su borla de lana
    c.beginPath(); c.arc(x + mira*12, y-56, 2.6, 0, 6.283); c.fill();
  });

  /* piedras sueltas y matas de ichu */
  sembrar(c, 12, 1201, 22, (c,x,y,i) => {
    c.fillStyle = i%2 ? "#8A8478" : "#736D62";
    c.beginPath(); c.ellipse(x, y, 9+az(i)*7, 7+az(i+2)*5, az(i)*3, 0, 6.283); c.fill();
  });
  sembrar(c, 14, 1801, 20, (c,x,y,i) => {
    c.strokeStyle = "#B5A75E"; c.lineWidth = 2;
    for (let k=0;k<7;k++){
      const a = -1.5708 + (k-3)*.22;
      c.beginPath(); c.moveTo(x, y);
      c.lineTo(x + Math.cos(a)*(11+az(i*3+k)*9), y + Math.sin(a)*(15+az(i+k)*8));
      c.stroke();
    }
  });

  /* neblina de la montaña: jirones claros por encima de todo */
  c.fillStyle = "rgba(255,255,255,.13)";
  for (let i=0;i<9;i++){
    const x = azEntre(i+300,0,DECO_W), y = azEntre(i+700,0,DECO_H);
    c.beginPath(); c.ellipse(x, y, 190+az(i)*130, 34+az(i+9)*22, 0, 0, 6.283); c.fill();
  }
}

/* ---------- Nueva York: Central Park, el puerto, la Estatua y el puente ---------- */
function decoNuevaYork(c, E){
  const PUERTO = 1430;                       // tiene que casar con `mar` del escenario
  const PUENTE = { x: 1880, w: 340 };        // y con `puente`

  c.fillStyle = E.mancha;
  for (let i=0;i<20;i++){
    const x = azEntre(i,0,DECO_W), y = azEntre(i+31,0,PUERTO), r = 34+az(i+3)*50;
    c.beginPath(); c.ellipse(x,y,r,r*.55,i,0,6.283); c.fill();
  }

  /* ---- Central Park: toda la banda derecha ---- */
  const PK = { x: 1960, y: 500, w: 600, h: 900 };
  vetoDeco.push({ x:PK.x-20, y:PK.y-20, w:PK.w+40, h:PK.h+40 });
  c.fillStyle = "#3E7A3A";
  rr(c, PK.x, PK.y, PK.w, PK.h, 26); c.fill();
  c.fillStyle = "rgba(255,255,255,.05)";     // claros de césped
  for (let i=0;i<14;i++){
    const x = azEntre(i+900, PK.x+40, PK.x+PK.w-40), y = azEntre(i+940, PK.y+40, PK.y+PK.h-40);
    c.beginPath(); c.ellipse(x, y, 50+az(i)*40, 30+az(i+2)*24, 0, 0, 6.283); c.fill();
  }
  c.strokeStyle = "#B8A98A"; c.lineWidth = 13; c.lineCap = "round";
  c.beginPath();                              // los caminos serpenteando
  c.moveTo(PK.x+50, PK.y+40);
  c.bezierCurveTo(PK.x+PK.w-80, PK.y+240, PK.x+70, PK.y+560, PK.x+PK.w-60, PK.y+PK.h-40);
  c.stroke();
  c.beginPath();
  c.moveTo(PK.x+PK.w-40, PK.y+90); c.bezierCurveTo(PK.x+90, PK.y+330, PK.x+PK.w-90, PK.y+700, PK.x+60, PK.y+PK.h-60);
  c.stroke();
  c.lineCap = "butt";
  const LAGO = { x: PK.x+120, y: PK.y+300, rx: 170, ry: 105 };
  c.fillStyle = "#2F6F86";                    // el lago
  c.beginPath(); c.ellipse(LAGO.x+60, LAGO.y, LAGO.rx, LAGO.ry, .2, 0, 6.283); c.fill();
  c.strokeStyle = "rgba(255,255,255,.3)"; c.lineWidth = 3;
  c.beginPath(); c.ellipse(LAGO.x+60, LAGO.y, LAGO.rx-14, LAGO.ry-10, .2, 0, 6.283); c.stroke();
  for (let i=0;i<26;i++){                     // los árboles
    const x = azEntre(i+700, PK.x+40, PK.x+PK.w-40), y = azEntre(i+760, PK.y+40, PK.y+PK.h-40);
    if (Math.hypot((x-LAGO.x-60)/LAGO.rx, (y-LAGO.y)/LAGO.ry) < 1.15) continue;
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+16, 20, 7, 0, 0, 6.283); c.fill();
    c.fillStyle = "#6B4A2A";
    c.fillRect(x-4, y-4, 8, 20);
    for (const [dx,dy,r] of [[0,-22,22],[-14,-10,15],[14,-12,16]]){
      c.fillStyle = ["#2F6B2A","#3E8434","#265C22"][(i+Math.abs(dx))%3];
      c.beginPath(); c.arc(x+dx, y+dy, r, 0, 6.283); c.fill();
    }
  }
  c.fillStyle = "rgba(255,239,226,.75)";      // el letrero
  c.font = "800 26px system-ui, sans-serif"; c.textAlign = "center";
  c.fillText("CENTRAL PARK", PK.x+PK.w/2, PK.y+PK.h-26);

  /* ---- el puerto ---- */
  const muelle = c.createLinearGradient(0, PUERTO-70, 0, PUERTO+6);
  muelle.addColorStop(0, "rgba(30,30,36,0)");
  muelle.addColorStop(1, "rgba(35,35,42,.8)");
  c.fillStyle = muelle; c.fillRect(0, PUERTO-70, DECO_W, 76);
  const agua = c.createLinearGradient(0, PUERTO, 0, DECO_H);
  agua.addColorStop(0, "#3E6E86");
  agua.addColorStop(.5, "#2A526E");
  agua.addColorStop(1, "#1B3A54");
  c.fillStyle = agua;
  c.beginPath();
  c.moveTo(0, PUERTO);
  for (let x=0;x<=DECO_W;x+=30) c.lineTo(x, PUERTO + Math.sin(x*.01)*12 + Math.sin(x*.004)*7);
  c.lineTo(DECO_W, DECO_H); c.lineTo(0, DECO_H);
  c.closePath(); c.fill();
  c.strokeStyle = "rgba(210,230,245,.28)"; c.lineWidth = 3; c.lineCap = "round";
  for (let k=0;k<4;k++){
    c.beginPath();
    for (let x=0;x<=DECO_W;x+=40){
      const y = PUERTO + 55 + k*45 + Math.sin(x*.014 + k)*6;
      x === 0 ? c.moveTo(x,y) : c.lineTo(x,y);
    }
    c.stroke();
  }
  c.lineCap = "butt";

  /* ---- la Estatua de la Libertad, en su isla ---- */
  const LX = 620, LY = PUERTO + 130;
  c.fillStyle = "#6E6A58";                    // la isla
  c.beginPath(); c.ellipse(LX, LY+34, 96, 34, 0, 0, 6.283); c.fill();
  c.fillStyle = "#8A8674";
  c.beginPath(); c.ellipse(LX, LY+28, 82, 26, 0, 0, 6.283); c.fill();
  c.fillStyle = "#9A8F70";                    // el pedestal
  rr(c, LX-38, LY-34, 76, 62, 4); c.fill();
  c.fillStyle = "#B0A585";
  rr(c, LX-30, LY-52, 60, 20, 3); c.fill();
  const V = "#5FBFA8", VS = "#4A9E8A";        // el verdín del cobre
  c.fillStyle = V;                            // la túnica
  c.beginPath();
  c.moveTo(LX-22, LY-52); c.lineTo(LX-12, LY-128);
  c.lineTo(LX+14, LY-128); c.lineTo(LX+24, LY-52);
  c.closePath(); c.fill();
  c.fillStyle = VS;
  for (let k=0;k<4;k++){                      // los pliegues
    c.fillRect(LX-18+k*10, LY-124, 2.6, 70);
  }
  c.fillStyle = V;
  c.beginPath(); c.arc(LX+1, LY-140, 13, 0, 6.283); c.fill();   // la cabeza
  c.fillStyle = VS;                           // la corona de siete puntas
  for (let k=0;k<7;k++){
    const a = -2.6 + k*.53;
    c.beginPath();
    c.moveTo(LX+1 + Math.cos(a)*11, LY-140 + Math.sin(a)*11);
    c.lineTo(LX+1 + Math.cos(a)*24, LY-140 + Math.sin(a)*24);
    c.lineTo(LX+1 + Math.cos(a+.16)*11, LY-140 + Math.sin(a+.16)*11);
    c.closePath(); c.fill();
  }
  c.fillStyle = V;                            // el brazo de la antorcha
  c.save(); c.translate(LX+12, LY-126); c.rotate(-.75);
  rr(c, 0, -7, 58, 13, 6); c.fill();
  c.restore();
  c.fillStyle = V;                            // la tablilla
  c.save(); c.translate(LX-20, LY-108); c.rotate(.35);
  rr(c, -16, -12, 26, 34, 3); c.fill();
  c.restore();
  const tx = LX+52, ty = LY-165;              // la antorcha encendida
  c.fillStyle = "#B0A585"; rr(c, tx-5, ty, 10, 16, 3); c.fill();
  c.fillStyle = "#FFC53D";
  c.beginPath(); c.moveTo(tx, ty-26); c.lineTo(tx-9, ty-2); c.lineTo(tx+9, ty-2); c.closePath(); c.fill();
  c.fillStyle = "#FFEFA0";
  c.beginPath(); c.moveTo(tx, ty-17); c.lineTo(tx-4.5, ty-3); c.lineTo(tx+4.5, ty-3); c.closePath(); c.fill();

  /* ---- el puente de Brooklyn: el único paso a pie sobre el agua ---- */
  const PB = PUENTE;
  c.fillStyle = "#8A8478";                    // la calzada
  c.fillRect(PB.x, PUERTO - 40, PB.w, DECO_H - PUERTO + 40);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.fillRect(PB.x, PUERTO - 40, 12, DECO_H - PUERTO + 40);
  c.fillRect(PB.x + PB.w - 12, PUERTO - 40, 12, DECO_H - PUERTO + 40);
  c.fillStyle = "#FFD84D";                    // la línea del medio
  for (let y = PUERTO - 20; y < DECO_H; y += 70) c.fillRect(PB.x + PB.w/2 - 3, y, 6, 34);
  for (const ty2 of [PUERTO + 40, PUERTO + 210]){   // las dos torres de piedra
    c.fillStyle = "#9A8F80";
    rr(c, PB.x - 26, ty2 - 26, 30, 52, 4); c.fill();
    rr(c, PB.x + PB.w - 4, ty2 - 26, 30, 52, 4); c.fill();
    c.fillStyle = "#6E6558";                  // los dos arcos ojivales de cada torre
    for (const ax of [PB.x - 18, PB.x + PB.w + 4]){
      c.beginPath(); c.moveTo(ax, ty2+16); c.lineTo(ax, ty2-2);
      c.quadraticCurveTo(ax+7, ty2-16, ax+14, ty2-2); c.lineTo(ax+14, ty2+16);
      c.closePath(); c.fill();
    }
    c.strokeStyle = "rgba(255,239,226,.5)"; c.lineWidth = 2;   // los tirantes
    for (let k=1;k<7;k++){
      c.beginPath();
      c.moveTo(PB.x - 11, ty2 - 22);
      c.lineTo(PB.x + (PB.w/7)*k, ty2 + 60);
      c.moveTo(PB.x + PB.w + 11, ty2 - 22);
      c.lineTo(PB.x + PB.w - (PB.w/7)*k, ty2 + 60);
      c.stroke();
    }
  }
  c.fillStyle = "rgba(255,239,226,.7)";
  c.font = "800 17px system-ui, sans-serif"; c.textAlign = "center";
  c.save(); c.translate(PB.x + PB.w/2, PUERTO + 130); c.rotate(-1.5708);
  c.fillText("BROOKLYN BRIDGE", 0, 0);
  c.restore();
  c.textAlign = "left";

  /* la avenida: dos calzadas con su línea discontinua y los pasos de cebra */
  const calles = [520, 1180];
  for (const cy of calles){
    c.fillStyle = "rgba(20,20,24,.5)";
    c.fillRect(0, cy, DECO_W, 150);
    c.fillStyle = "rgba(160,160,170,.5)";                     // bordillos
    c.fillRect(0, cy-8, DECO_W, 8);
    c.fillRect(0, cy+150, DECO_W, 8);
    c.fillStyle = "#FFD84D";                                  // línea central
    for (let x = 20; x < DECO_W; x += 90) c.fillRect(x, cy+72, 46, 6);
    c.fillStyle = "rgba(255,255,255,.8)";                     // paso de cebra
    for (let k=0;k<7;k++) c.fillRect(760 + k*26, cy+8, 15, 134);
  }

  /* rascacielos vistos desde arriba: azoteas con tanques y aire acondicionado */
  sembrar(c, 7, 71, 88, (c,x,y,i) => {
    const w = 130 + az(i)*70, h = 110 + az(i+5)*60;
    vetoDeco.push({ x:x-w/2-14, y:y-h-14, w:w+28, h:h+34 });
    c.fillStyle = "rgba(0,0,0,.3)";
    c.fillRect(x-w/2+10, y-h+12, w, h);                       // sombra proyectada
    c.fillStyle = ["#6E7078","#5A5C66","#7C7E88"][i%3];
    c.fillRect(x-w/2, y-h, w, h);
    c.fillStyle = "rgba(0,0,0,.25)";                          // gravilla de la azotea
    for (let k=0;k<18;k++)
      c.fillRect(x-w/2+az(i*7+k)*w, y-h+az(i*3+k)*h, 3, 3);
    c.fillStyle = "#3A3C44";                                  // el pretil
    c.lineWidth = 0; c.fillRect(x-w/2, y-h, w, 9);
    c.fillRect(x-w/2, y-9, w, 9); c.fillRect(x-w/2, y-h, 9, h); c.fillRect(x+w/2-9, y-h, 9, h);
    c.fillStyle = "#9AA0AA";                                  // tanque de agua
    rr(c, x-w/2+18, y-h+20, 26, 26, 4); c.fill();
    c.fillStyle = "#C2C7CF";                                  // aire acondicionado
    rr(c, x+w/2-56, y-40, 34, 24, 3); c.fill();
    c.strokeStyle = "rgba(0,0,0,.3)"; c.lineWidth = 1.6;
    for (let k=0;k<4;k++){
      c.beginPath(); c.moveTo(x+w/2-52+k*8, y-38); c.lineTo(x+w/2-52+k*8, y-18); c.stroke();
    }
  }, PUERTO - 120);

  /* taxis amarillos aparcados */
  sembrar(c, 8, 801, 40, (c,x,y,i) => {
    c.save(); c.translate(x, y); c.rotate(i%2 ? 0 : 1.5708);
    c.fillStyle = "rgba(0,0,0,.25)";
    c.beginPath(); c.ellipse(0, 6, 32, 11, 0, 0, 6.283); c.fill();
    c.fillStyle = "#FFC53D";
    rr(c, -30, -15, 60, 30, 8); c.fill();
    c.fillStyle = "#2A2A30";                                  // parabrisas y luneta
    rr(c, -18, -11, 14, 22, 3); c.fill();
    rr(c, 6, -11, 14, 22, 3); c.fill();
    c.fillStyle = "#1B1B20";                                  // ruedas
    for (const [rx,ry] of [[-19,-17],[13,-17],[-19,13],[13,13]]) rr(c, rx, ry, 12, 5, 2.5), c.fill();
    c.fillStyle = "#FFEFE2";                                  // el cartel de TAXI
    rr(c, -6, -20, 12, 6, 2); c.fill();
    c.restore();
  }, PUERTO - 90);

  /* hidrantes, tapas de alcantarilla con vapor y bolsas de basura */
  sembrar(c, 10, 1401, 22, (c,x,y,i) => {
    if (i % 3 === 0){                                         // hidrante
      c.fillStyle = "rgba(0,0,0,.2)";
      c.beginPath(); c.ellipse(x, y+10, 11, 4, 0, 0, 6.283); c.fill();
      c.fillStyle = "#E2453C";
      rr(c, x-7, y-18, 14, 28, 4); c.fill();
      c.fillRect(x-12, y-12, 24, 6);
      c.beginPath(); c.arc(x, y-19, 6, 0, 6.283); c.fill();
    } else if (i % 3 === 1){                                  // alcantarilla con vapor
      c.fillStyle = "#4A4A52";
      c.beginPath(); c.ellipse(x, y, 17, 13, 0, 0, 6.283); c.fill();
      c.strokeStyle = "rgba(20,20,24,.7)"; c.lineWidth = 2;
      for (let k=-2;k<=2;k++){
        c.beginPath(); c.moveTo(x-13, y+k*4.5); c.lineTo(x+13, y+k*4.5); c.stroke();
      }
      c.fillStyle = "rgba(255,255,255,.16)";
      for (let k=0;k<3;k++){
        c.beginPath();
        c.ellipse(x + az(i*5+k)*16-8, y - 18 - k*16, 15+k*6, 9+k*4, 0, 0, 6.283);
        c.fill();
      }
    } else {                                                  // bolsas de basura
      c.fillStyle = "#22222A";
      c.beginPath(); c.ellipse(x, y, 14, 12, az(i), 0, 6.283); c.fill();
      c.beginPath(); c.ellipse(x+16, y+4, 11, 9, az(i+1), 0, 6.283); c.fill();
      c.fillStyle = "rgba(255,255,255,.07)";
      c.beginPath(); c.ellipse(x-4, y-4, 5, 4, 0, 0, 6.283); c.fill();
    }
  }, PUERTO - 90);
}

/* ---------- El Barrio: casas, postes, tendederos, bicis, pelotas y rayuela ---------- */
function decoBarrio(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<22;i++){
    const x = azEntre(i,0,DECO_W), y = azEntre(i+31,0,DECO_H), r = 26+az(i+3)*48;
    c.beginPath(); c.ellipse(x,y,r,r*.6,i,0,6.283); c.fill();
  }
  // aceras: dos franjas de bordillo cruzando el barrio
  c.fillStyle = "rgba(255,239,226,.10)";
  c.fillRect(0, 620, DECO_W, 26);
  c.fillRect(0, 1180, DECO_W, 26);
  c.strokeStyle = "rgba(92,42,24,.5)"; c.lineWidth = 3;
  c.strokeRect(0, 620, DECO_W, 26); c.strokeRect(0, 1180, DECO_W, 26);

  /* Las casas van pegadas a las dos veredas, mirando a la calle: es lo que hace
     que esto parezca una cuadra y no un descampado con cosas. Se pintan antes
     que el resto para que las bicis y las pelotas queden delante. */
  sembrarEnFranja(c, 6, 5501, 82, (c,x,y,i) => casaBarrio(c, x, y, i, .9 + az(i)*.3), 500, 606);
  sembrarEnFranja(c, 6, 6101, 82, (c,x,y,i) => casaBarrio(c, x, y, i+3, .9 + az(i+9)*.3), 1060, 1166);

  sembrar(c, 7, 11, 46, (c,x,y) => {          // poste de luz con su charco de luz
    c.fillStyle = "rgba(255,197,61,.10)";
    c.beginPath(); c.ellipse(x, y+26, 62, 30, 0, 0, 6.283); c.fill();
    c.fillStyle = "#4A3526"; c.fillRect(x-4, y-54, 8, 80);
    c.fillStyle = "#3A2416"; c.fillRect(x-16, y-62, 32, 10);
    c.fillStyle = "#FFE066";
    c.beginPath(); c.ellipse(x, y-52, 13, 7, 0, 0, 6.283); c.fill();
  });

  sembrar(c, 6, 401, 70, (c,x,y,i) => {       // tendedero con ropa colgada
    const w = 150;
    c.strokeStyle = "#4A3526"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(x-w/2, y-40); c.lineTo(x-w/2, y+16); c.stroke();
    c.beginPath(); c.moveTo(x+w/2, y-40); c.lineTo(x+w/2, y+16); c.stroke();
    c.strokeStyle = "rgba(255,239,226,.5)"; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x-w/2, y-36); c.quadraticCurveTo(x, y-24, x+w/2, y-36); c.stroke();
    const ropa = ["#FF5C86","#5CE1EA","#FFD84D","#9BD97F","#D8CFD4"];
    for (let k=0;k<4;k++){
      const rx = x-w/2+22+k*34, ry = y-30+Math.sin(k)*3;
      c.fillStyle = ropa[(i+k)%ropa.length];
      rr(c, rx-9, ry, 18, 24, 4); c.fill();
    }
  });

  sembrar(c, 9, 901, 26, (c,x,y,i) => {       // bolsas de basura y un tacho
    if (i%3 === 0){
      c.fillStyle = "#3DDC97"; rr(c, x-13, y-20, 26, 30, 5); c.fill();
      c.fillStyle = "#2F9E6E"; rr(c, x-16, y-24, 32, 8, 3); c.fill();
    } else {
      c.fillStyle = "#2A1226";
      c.beginPath(); c.ellipse(x, y, 15, 12, az(i), 0, 6.283); c.fill();
      c.fillStyle = "rgba(255,255,255,.08)";
      c.beginPath(); c.ellipse(x-4, y-4, 5, 4, 0, 0, 6.283); c.fill();
    }
  });

  // la rayuela completa, del 1 al 10, en tiza de colores
  sembrar(c, 3, 1301, 130, (c,x,y,i) => rayuela(c, x, y+120, .95 + az(i)*.2));
}

/* ---------- El Colegio Santa Teresita: patio, jardines, palmeras y bandera ---------- */
function decoColegio(c, E){
  /* jardines: los canteros redondeados del patio central */
  const cantero = (x, y, w, h) => {
    if (sobreUnSitio(x-6, y-6, w+12, h+12)) return;
    vetoDeco.push({ x:x-16, y:y-16, w:w+32, h:h+32 });
    c.fillStyle = "#C4693F";                       // bordillo de ladrillo
    rr(c, x-6, y-6, w+12, h+12, 26); c.fill();
    c.fillStyle = "#4FB265";                       // césped
    rr(c, x, y, w, h, 22); c.fill();
    c.fillStyle = "rgba(47,122,70,.35)";           // vetas del pasto
    for (let k=0;k*46<w;k++) c.fillRect(x+k*46, y, 22, h);
    c.fillStyle = "#3E9C56";
    rr(c, x, y, w, 10, 8); c.fill();
  };
  cantero(300, 380, 420, 190);
  cantero(1780, 300, 360, 170);
  cantero(1640, 1160, 460, 200);
  cantero(430, 1420, 380, 160);

  /* la cancha del patio, con sus líneas pintadas */
  const cx = 780, cy = 780, cw = 520, ch = 330;
  if (!sobreUnSitio(cx, cy, cw, ch)){
  vetoDeco.push({ x:cx-16, y:cy-16, w:cw+32, h:ch+32 });
  c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 5;
  c.strokeRect(cx, cy, cw, ch);
  c.beginPath(); c.moveTo(cx+cw/2, cy); c.lineTo(cx+cw/2, cy+ch); c.stroke();
  c.beginPath(); c.arc(cx+cw/2, cy+ch/2, 56, 0, 6.283); c.stroke();
  c.strokeRect(cx, cy+ch/2-70, 62, 140);
  c.strokeRect(cx+cw-62, cy+ch/2-70, 62, 140);
  }

  /* asta con la bandera del Perú */
  const ax = 1300, ay = 470;
  vetoDeco.push({ x:ax-70, y:ay-150, w:150, h:180 });
  c.fillStyle = "rgba(0,0,0,.2)";
  c.beginPath(); c.ellipse(ax, ay+8, 26, 9, 0, 0, 6.283); c.fill();
  c.fillStyle = "#D8CFD4"; rr(c, ax-16, ay-6, 32, 14, 5); c.fill();
  c.fillStyle = "#EBE3D2"; c.fillRect(ax-3, ay-118, 6, 116);
  c.fillStyle = "#FFD84D"; c.beginPath(); c.arc(ax, ay-122, 5, 0, 6.283); c.fill();
  const bw = 58, bh = 38, by = ay-116;
  c.fillStyle = "#E0224F"; c.fillRect(ax+3, by, bw/3, bh);
  c.fillStyle = "#FFEFE2"; c.fillRect(ax+3+bw/3, by, bw/3, bh);
  c.fillStyle = "#E0224F"; c.fillRect(ax+3+bw*2/3, by, bw/3, bh);
  c.strokeStyle = "rgba(0,0,0,.22)"; c.lineWidth = 1.6;
  c.strokeRect(ax+3, by, bw, bh);

  /* el emblema ST pintado en el patio */
  const ex = 1300, ey = 1200, er = 105;
  vetoDeco.push({ x:ex-er-20, y:ey-er-20, w:(er+20)*2, h:(er+20)*2 });
  c.fillStyle = "rgba(47,122,70,.62)";
  c.beginPath(); c.ellipse(ex, ey, er, er*1.1, 0, 0, 6.283); c.fill();
  c.fillStyle = "rgba(235,227,210,.7)";
  c.beginPath(); c.ellipse(ex, ey, er-13, (er-13)*1.1, 0, 0, 6.283); c.fill();
  c.fillStyle = "rgba(47,122,70,.9)";
  c.font = "800 96px Georgia, serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("ST", ex, ey+6);

  /* palmeras: tronco anillado y sus hojas */
  const palmera = (c, x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(0, 6, 24, 8, 0, 0, 6.283); c.fill();
    c.fillStyle = "#8A5A2A";
    c.beginPath();
    c.moveTo(-7, 6); c.quadraticCurveTo(-3, -34, -11, -68);
    c.lineTo(-1, -68); c.quadraticCurveTo(5, -34, 7, 6);
    c.closePath(); c.fill();
    c.strokeStyle = "rgba(90,55,20,.6)"; c.lineWidth = 2;
    for (let k=0;k<6;k++){
      c.beginPath(); c.moveTo(-7+k*.7, -6-k*10); c.lineTo(6-k*.7, -8-k*10); c.stroke();
    }
    for (let k=0;k<7;k++){                        // hojas
      const a = -2.6 + k*.62;
      c.fillStyle = k%2 ? "#3E9C56" : "#4FB265";
      c.save(); c.translate(-6, -70); c.rotate(a);
      c.beginPath();
      c.moveTo(0,0); c.quadraticCurveTo(30, -12, 58, 6);
      c.quadraticCurveTo(30, 2, 0, 6);
      c.closePath(); c.fill();
      c.restore();
    }
    c.fillStyle = "#8A5A2A";
    c.beginPath(); c.arc(-6, -70, 5, 0, 6.283); c.fill();
    c.restore();
  };
  sembrar(c, 8, 71, 60, (c,x,y,i) => palmera(c, x, y, .9 + az(i)*.5));

  /* arbustos recortados en bolita */
  sembrar(c, 12, 421, 26, (c,x,y,i) => {
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(x, y+13, 17, 6, 0, 0, 6.283); c.fill();
    const r = 14 + az(i)*7;
    c.fillStyle = "#3E9C56";
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    c.fillStyle = "#5FBF6E";
    c.beginPath(); c.arc(x-r*.3, y-r*.3, r*.55, 0, 6.283); c.fill();
  });

  /* bancas del patio */
  sembrar(c, 7, 821, 34, (c,x,y,i) => {
    c.save(); c.translate(x,y); if (i%2) c.rotate(1.5708);
    c.fillStyle = "rgba(0,0,0,.18)";
    rr(c, -32, 8, 64, 8, 3); c.fill();
    c.fillStyle = "#C4693F"; rr(c, -32, -6, 64, 13, 4); c.fill();
    c.fillStyle = "#A2532F"; rr(c, -32, -20, 64, 10, 4); c.fill();
    c.fillStyle = "#6E6A78";
    c.fillRect(-27, 6, 6, 12); c.fillRect(21, 6, 6, 12);
    c.restore();
  });

  /* tachos de basura del colegio */
  sembrar(c, 6, 1521, 22, (c,x,y) => {
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(x, y+14, 14, 5, 0, 0, 6.283); c.fill();
    c.fillStyle = "#3DDC97"; rr(c, x-12, y-14, 24, 28, 4); c.fill();
    c.fillStyle = "#2F9E6E"; rr(c, x-15, y-18, 30, 7, 3); c.fill();
  });

  /* y las rayuelas del recreo, en tiza de colores */
  sembrar(c, 4, 1901, 130, (c,x,y,i) => rayuela(c, x, y+120, .95 + az(i)*.25));
}

/* ---------- La Playa: mar con orilla y castillos de arena ---------- */
function decoPlaya(c, E){
  /* el mar ocupa la franja de abajo; el reparto de casas deja ese borde libre */
  const MAR = DECO_H - 210;

  // arena mojada justo antes del agua
  const moj = c.createLinearGradient(0, MAR-90, 0, MAR+10);
  moj.addColorStop(0, "rgba(169,131,74,0)");
  moj.addColorStop(1, "rgba(150,112,60,.55)");
  c.fillStyle = moj;
  c.fillRect(0, MAR-90, DECO_W, 100);

  // el agua, en dos tonos
  const agua = c.createLinearGradient(0, MAR, 0, DECO_H);
  agua.addColorStop(0, "#37D6E0");
  agua.addColorStop(.45, "#1FA8C4");
  agua.addColorStop(1, "#166F9E");
  c.fillStyle = agua;
  c.beginPath();
  c.moveTo(0, MAR);
  for (let x=0;x<=DECO_W;x+=30) c.lineTo(x, MAR + Math.sin(x*.011)*16 + Math.sin(x*.004)*9);
  c.lineTo(DECO_W, DECO_H); c.lineTo(0, DECO_H);
  c.closePath(); c.fill();

  // espuma de la orilla y crestas mar adentro
  c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 7; c.lineCap = "round";
  c.beginPath();
  for (let x=0;x<=DECO_W;x+=30){
    const y = MAR + Math.sin(x*.011)*16 + Math.sin(x*.004)*9;
    x === 0 ? c.moveTo(x,y) : c.lineTo(x,y);
  }
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 4;
  for (let f=1;f<=3;f++){
    c.beginPath();
    for (let x=0;x<=DECO_W;x+=30){
      const y = MAR + 44*f + Math.sin(x*.013 + f*1.7)*11;
      x === 0 ? c.moveTo(x,y) : c.lineTo(x,y);
    }
    c.stroke();
  }

  // toallas tendidas en la arena
  sembrar(c, 6, 3301, 46, (c,x,y,i) => {
    const pares = [["#FF3D6E","#FFEFE2"],["#5CE1EA","#FFEFE2"],["#FFD84D","#E0224F"],
                   ["#9BD97F","#FFEFE2"]];
    const [a1,a2] = pares[i%pares.length];
    c.save(); c.translate(x,y); c.rotate(-.5 + az(i+9)*1);
    c.fillStyle = "rgba(0,0,0,.12)";
    rr(c, -37, -23, 74, 50, 5); c.fill();
    c.fillStyle = a1; rr(c, -34, -25, 68, 48, 5); c.fill();
    c.fillStyle = a2;
    for (let k=0;k<3;k++) c.fillRect(-34, -18+k*15, 68, 7);
    c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 2;
    rr(c, -34, -25, 68, 48, 5); c.stroke();
    c.restore();
  }, MAR - 130);

  // conchas y estrellas de mar en la arena seca, nunca dentro del agua
  for (let i=0;i<44;i++){
    const x = azEntre(i,60,DECO_W-60), y = azEntre(i+55,60,MAR-110);
    if (!libreDeco(x,y,18)) continue;
    if (i%4 === 0){
      c.fillStyle = "#FF9EC4";                 // estrella de mar
      c.save(); c.translate(x,y); c.rotate(az(i)*6.283);
      c.beginPath();
      for (let k=0;k<5;k++){
        const a = k*1.2566;
        c.lineTo(Math.cos(a)*16, Math.sin(a)*16);
        c.lineTo(Math.cos(a+.628)*6.5, Math.sin(a+.628)*6.5);
      }
      c.closePath(); c.fill();
      c.restore();
    } else {
      c.fillStyle = "rgba(255,239,226,.75)";   // conchita
      c.beginPath(); c.arc(x, y, 8+az(i)*4, Math.PI, 0); c.closePath(); c.fill();
      c.strokeStyle = "rgba(169,131,74,.6)"; c.lineWidth = 1.4;
      c.beginPath();
      for (let k=0;k<3;k++){ c.moveTo(x, y); c.lineTo(x-5+k*5, y-7); }
      c.stroke();
    }
  }

  // CASTILLOS DE ARENA, más grandes y cerca de la orilla
  const castillo = (c, x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(0, 6, 54, 14, 0, 0, 6.283); c.fill();
    // foso
    c.strokeStyle = "rgba(150,112,60,.5)"; c.lineWidth = 6;
    c.beginPath(); c.ellipse(0, 4, 62, 20, 0, 0, 6.283); c.stroke();
    const arena = "#D8B276", arenaOsc = "#B08A50", arenaClara = "#EBD3A2";
    // cuerpo central
    c.fillStyle = arena;  c.fillRect(-26, -40, 52, 46);
    c.fillStyle = arenaOsc; c.fillRect(-26, -40, 52, 6);
    // torres laterales
    for (const tx of [-42, 30]){
      c.fillStyle = arena;     c.fillRect(tx, -54, 22, 60);
      c.fillStyle = arenaClara; c.fillRect(tx, -54, 22, 5);
      for (let k=0;k<3;k++){    // almenas
        c.fillStyle = arena;
        c.fillRect(tx + k*8, -62, 6, 9);
      }
    }
    // almenas del cuerpo
    for (let k=0;k<5;k++) c.fillStyle = arena, c.fillRect(-26 + k*11, -48, 7, 10);
    // puerta
    c.fillStyle = "#7A5A32";
    c.beginPath(); c.moveTo(-9, 6); c.lineTo(-9, -14); c.arc(0, -14, 9, Math.PI, 0); c.lineTo(9, 6);
    c.closePath(); c.fill();
    // banderitas
    for (const [bx, by] of [[-31,-62],[41,-62]]){
      c.strokeStyle = "#4A3526"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by-18); c.stroke();
      c.fillStyle = "#FF3D6E";
      c.beginPath(); c.moveTo(bx, by-18); c.lineTo(bx+15, by-13); c.lineTo(bx, by-8);
      c.closePath(); c.fill();
    }
    // palita apoyada
    c.strokeStyle = "#FFD84D"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(46, 6); c.lineTo(58, -22); c.stroke();
    c.fillStyle = "#FFD84D";
    c.beginPath(); c.ellipse(59, -26, 6, 8, .4, 0, 6.283); c.fill();
    c.restore();
  };
  // uno por banda, junto a la orilla, para que queden repartidos a lo ancho
  for (let banda=0; banda<5; banda++){
    const x0 = 180 + (DECO_W-360)*(banda/5), x1 = 180 + (DECO_W-360)*((banda+1)/5);
    for (let k=0;k<24;k++){
      const i = banda*53 + k;
      const x = azEntre(i, x0, x1), y = azEntre(i+313, MAR-250, MAR-120);
      if (!libreDeco(x, y, 95)) continue;
      castillo(c, x, y, .85 + az(i)*.5);
      break;
    }
  }

  // sombrillas, siempre en la arena
  sembrar(c, 5, 2201, 54, (c,x,y,i) => {
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(x, y+6, 34, 10, 0, 0, 6.283); c.fill();
    c.strokeStyle = "#8A5A2A"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x, y+6); c.lineTo(x, y-44); c.stroke();
    for (let k=0;k<6;k++){
      c.fillStyle = k%2 ? "#FF3D6E" : "#FFEFE2";
      c.beginPath();
      c.moveTo(x, y-44);
      c.arc(x, y-44, 40, Math.PI + k*(Math.PI/6), Math.PI + (k+1)*(Math.PI/6));
      c.closePath(); c.fill();
    }
  }, MAR - 130);
}

/* ---------- El Desierto: cactus, rocas, huesos y rodadoras ---------- */
function decoDesierto(c, E){
  c.strokeStyle = E.mancha; c.lineWidth = 5; c.lineCap = "round";
  for (let i=0;i<16;i++){
    let x = azEntre(i,0,DECO_W), y = azEntre(i+61,0,DECO_H);
    c.beginPath(); c.moveTo(x,y);
    for (let k=0;k<5;k++){
      x += 60 + az(i*5+k)*70 * (k%2 ? -1 : 1);
      y += 44 + az(i*7+k)*50;
      c.lineTo(x,y);
    }
    c.stroke();
  }

  sembrar(c, 9, 41, 52, (c,x,y,i) => {        // saguaro
    c.fillStyle = "rgba(0,0,0,.18)";
    c.beginPath(); c.ellipse(x, y+30, 30, 10, 0, 0, 6.283); c.fill();
    const verde = "#4A8C4E", verdeOsc = "#376B3A";
    c.fillStyle = verde; rr(c, x-13, y-70, 26, 100, 13); c.fill();
    if (i%3 !== 2){ rr(c, x-38, y-40, 25, 16, 8); c.fill(); rr(c, x-38, y-62, 15, 30, 7); c.fill(); }
    if (i%2 === 0){ rr(c, x+13, y-52, 25, 15, 7); c.fill(); rr(c, x+24, y-76, 14, 30, 7); c.fill(); }
    c.strokeStyle = verdeOsc; c.lineWidth = 2;
    for (let k=0;k<5;k++){
      c.beginPath(); c.moveTo(x-6, y-62+k*20); c.lineTo(x-6, y-50+k*20); c.stroke();
      c.beginPath(); c.moveTo(x+6, y-62+k*20); c.lineTo(x+6, y-50+k*20); c.stroke();
    }
    if (i%4 === 0){                            // con su flor
      c.fillStyle = "#FF5C86";
      c.beginPath(); c.arc(x, y-74, 7, 0, 6.283); c.fill();
      c.fillStyle = "#FFE066";
      c.beginPath(); c.arc(x, y-74, 3, 0, 6.283); c.fill();
    }
  });

  sembrar(c, 10, 501, 30, (c,x,y,i) => {      // rocas
    const s = .8 + az(i)*.8;
    c.save(); c.translate(x,y); c.scale(s,s);
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(0, 10, 26, 8, 0, 0, 6.283); c.fill();
    c.fillStyle = "#8A7A6A";
    c.beginPath();
    c.moveTo(-24,10); c.lineTo(-14,-12); c.lineTo(6,-18); c.lineTo(22,-4); c.lineTo(18,10);
    c.closePath(); c.fill();
    c.fillStyle = "#A2937F";
    c.beginPath();
    c.moveTo(-14,-12); c.lineTo(6,-18); c.lineTo(10,-8); c.lineTo(-8,-4);
    c.closePath(); c.fill();
    c.restore();
  });

  sembrar(c, 5, 1101, 34, (c,x,y) => {        // calavera de vaca
    c.fillStyle = "#EBE3D2";
    rr(c, x-17, y-14, 34, 30, 12); c.fill();
    c.beginPath(); c.moveTo(x-8, y+14); c.lineTo(x+8, y+14); c.lineTo(x+4, y+26);
    c.lineTo(x-4, y+26); c.closePath(); c.fill();
    c.strokeStyle = "#EBE3D2"; c.lineWidth = 7; c.lineCap = "round";
    c.beginPath(); c.moveTo(x-15, y-9); c.quadraticCurveTo(x-40, y-20, x-33, y-38); c.stroke();
    c.beginPath(); c.moveTo(x+15, y-9); c.quadraticCurveTo(x+40, y-20, x+33, y-38); c.stroke();
    c.fillStyle = "#3A2416";
    c.beginPath(); c.ellipse(x-7, y-4, 4.5, 5.5, 0, 0, 6.283); c.fill();
    c.beginPath(); c.ellipse(x+7, y-4, 4.5, 5.5, 0, 0, 6.283); c.fill();
  });

  sembrar(c, 3, 2101, 46, (c,x,y) => {        // letrero viejo torcido
    c.save(); c.translate(x,y); c.rotate(-.12);
    c.fillStyle = "#8A5A2A"; c.fillRect(-4, -20, 8, 46);
    c.fillStyle = "#A2743C"; rr(c, -42, -46, 84, 28, 4); c.fill();
    c.strokeStyle = "#6B4420"; c.lineWidth = 3; rr(c, -42, -46, 84, 28, 4); c.stroke();
    c.fillStyle = "#EBD3A2"; c.font = "800 13px system-ui, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("NI AGUA", 0, -32);
    c.restore();
  });
}

/* ============================================================
   Los cuatro escenarios de juguete
   ============================================================
   Geometría compartida: el decorado la pinta y lo que se mueve encima la
   recorre. Si cambian aquí, cambian en los dos sitios a la vez. */
/* En fracciones del mundo, como las casas en el motor: si el mapa crece, las
   calles y los óvalos crecen con él en vez de quedarse en una esquina. */
/* Funciones y no constantes: el tamaño del mundo lo fija cada escenario al
   empezar, así que calcularlas al cargar el módulo las dejaba con el valor del
   primer mapa. */
const CALLES_PISTA = () => [.147, .412, .676, .918].map(f => Math.round(DECO_H * f));
const OVALO_TREN   = () => ({ x: DECO_W/2, y: DECO_H/2, rx: DECO_W*.419, ry: DECO_H*.412 });
const OVALO_KART   = () => ({ x: DECO_W/2, y: DECO_H/2, rx: DECO_W*.427, ry: DECO_H*.424,
                              ancho: Math.round(DECO_W*.058) });
const ANILLO_TABLERO = () => ({ x: 120, y: 110, w: DECO_W - 240, h: DECO_H - 220, banda: 120 });
/** Punto de un óvalo por fracción de vuelta (0..1). */
const puntoOvalo = (o, f) => ({
  x: o.x + Math.cos(f * 6.283) * o.rx,
  y: o.y + Math.sin(f * 6.283) * o.ry,
});

/* ---------- la pista naranja: rizo, rampas y aceleradores ---------- */
function decoPista(c, E){
  c.fillStyle = E.mancha;                                  // pelusa de la alfombra
  for (let i=0;i<26;i++){
    const x = azEntre(i,0,DECO_W), y = azEntre(i+53,0,DECO_H), r = 26+az(i+3)*44;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* Las calles: naranja con los dos muretes y la ranura del medio. Van de lado
     a lado porque es lo que hace una pista de juguete montada en el suelo. */
  for (const y of CALLES_PISTA()){
    c.fillStyle = "rgba(0,0,0,.18)";                       // la pista levanta un poco
    c.fillRect(0, y + 30, DECO_W, 10);
    const canal = c.createLinearGradient(0, y - 24, 0, y + 24);
    canal.addColorStop(0, "#C4661A"); canal.addColorStop(.35, "#F09A3E");
    canal.addColorStop(.75, "#E4842A"); canal.addColorStop(1, "#B85A16");
    c.fillStyle = canal;
    c.fillRect(0, y - 34, DECO_W, 68);
    for (const my of [y - 34, y + 24]){                    // los dos muretes
      c.fillStyle = "#A85018"; c.fillRect(0, my, DECO_W, 10);
      c.fillStyle = "rgba(255,255,255,.28)"; c.fillRect(0, my, DECO_W, 3);
    }
    c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 3;
    c.setLineDash([26, 26]);
    c.beginPath(); c.moveTo(0, y); c.lineTo(DECO_W, y); c.stroke();
    c.setLineDash([]);
    /* Las juntas entre piezas, con su pestaña: una pista de juguete se ve que
       está hecha de trozos que encajan. */
    for (let x = 0; x < DECO_W; x += 210){
      c.fillStyle = "rgba(0,0,0,.16)"; c.fillRect(x, y - 34, 5, 68);
      c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(x + 5, y - 34, 2, 68);
      c.fillStyle = "#C4661A"; rr(c, x - 9, y - 8, 18, 16, 4); c.fill();
    }
  }

  /* El rizo. Se monta sobre la calle de arriba y se ve como lo que es: un aro
     de plástico de canto, con sus dos patas y la sombra en la alfombra. */
  const rizo = { x: 330, y: CALLES_PISTA()[1], r: 150 };
  vetoDeco.push({ x: rizo.x-200, y: rizo.y-200, w: 400, h: 400 });
  c.fillStyle = "rgba(0,0,0,.2)";                          // la sombra en el suelo
  c.beginPath(); c.ellipse(rizo.x + 16, rizo.y + rizo.r - 18, rizo.r*.9, 30, 0, 0, 6.283); c.fill();
  c.fillStyle = "#8A4413";                                 // las dos patas
  for (const dx of [-rizo.r*.72, rizo.r*.72]){
    c.beginPath();
    c.moveTo(rizo.x + dx - 16, rizo.y + rizo.r - 6);
    c.lineTo(rizo.x + dx - 7,  rizo.y + rizo.r*.35);
    c.lineTo(rizo.x + dx + 7,  rizo.y + rizo.r*.35);
    c.lineTo(rizo.x + dx + 16, rizo.y + rizo.r - 6);
    c.closePath(); c.fill();
  }
  c.strokeStyle = "#8A4413"; c.lineWidth = 68;             // el canto exterior
  c.beginPath(); c.arc(rizo.x, rizo.y, rizo.r, 0, 6.283); c.stroke();
  const aro = c.createLinearGradient(rizo.x - rizo.r, 0, rizo.x + rizo.r, 0);
  aro.addColorStop(0, "#B85A16"); aro.addColorStop(.4, "#F09A3E");
  aro.addColorStop(.62, "#FFB65C"); aro.addColorStop(1, "#C4661A");
  c.strokeStyle = aro; c.lineWidth = 48;                   // la superficie por donde corre
  c.beginPath(); c.arc(rizo.x, rizo.y, rizo.r, 0, 6.283); c.stroke();
  c.strokeStyle = "rgba(0,0,0,.22)"; c.lineWidth = 9;      // el murete de dentro
  c.beginPath(); c.arc(rizo.x, rizo.y, rizo.r - 21, 0, 6.283); c.stroke();
  c.beginPath(); c.arc(rizo.x, rizo.y, rizo.r + 21, 0, 6.283); c.stroke();
  c.strokeStyle = "rgba(255,255,255,.2)"; c.lineWidth = 3; // la ranura
  c.setLineDash([18, 18]);
  c.beginPath(); c.arc(rizo.x, rizo.y, rizo.r, 0, 6.283); c.stroke();
  c.setLineDash([]);
  c.fillStyle = "rgba(255,255,255,.16)";                   // el brillo del plástico
  c.beginPath(); c.arc(rizo.x, rizo.y, rizo.r, Math.PI*1.15, Math.PI*1.45); c.lineWidth = 1;
  c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 10; c.stroke();
  c.fillStyle = "#EBD3A2"; c.font = "800 21px system-ui, sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("EL RIZO", rizo.x, rizo.y);

  /* Rampas de salto: la cuña naranja con sus rayas. */
  sembrar(c, 5, 4101, 62, (c,x,y,i) => {
    vetoDeco.push({ x:x-72, y:y-30, w:144, h:70 });
    c.save(); c.translate(x, y); c.rotate(az(i)*.5 - .25);
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(0, 26, 60, 12, 0, 0, 6.283); c.fill();
    c.fillStyle = "#D9741F";
    c.beginPath(); c.moveTo(-58, 24); c.lineTo(58, -14); c.lineTo(58, 24); c.closePath(); c.fill();
    c.fillStyle = "#F09A3E";
    c.beginPath(); c.moveTo(-50, 20); c.lineTo(52, -10); c.lineTo(52, 20); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,.3)";
    for (let k=0;k<4;k++) c.fillRect(-34 + k*22, 4, 5, 15);
    c.restore();
  }, DECO_H-120);

  /* Aceleradores: la pareja de rodillos amarillos con sus flechas. */
  sembrar(c, 6, 4201, 46, (c,x,y,i) => {
    vetoDeco.push({ x:x-54, y:y-46, w:108, h:96 });
    c.save(); c.translate(x, y);
    c.fillStyle = "rgba(0,0,0,.26)";
    c.beginPath(); c.ellipse(0, 34, 44, 12, 0, 0, 6.283); c.fill();
    c.fillStyle = "#1C1C22"; rr(c, -42, -26, 84, 62, 10); c.fill();   // el canto
    c.fillStyle = "#33333C"; rr(c, -42, -32, 84, 62, 10); c.fill();   // la caja
    c.strokeStyle = "rgba(255,255,255,.16)"; c.lineWidth = 2;
    rr(c, -42, -32, 84, 62, 10); c.stroke();
    /* los dos rodillos amarillos, con sus estrías girando */
    for (const ry of [-16, 12]){
      c.fillStyle = "#C99A1F"; rr(c, -32, ry-1, 64, 16, 8); c.fill();
      c.fillStyle = "#FFC53D"; rr(c, -32, ry-3, 64, 16, 8); c.fill();
      c.fillStyle = "rgba(0,0,0,.22)";
      for (let k=0;k<7;k++) c.fillRect(-27 + k*9, ry-2, 3, 14);
      c.fillStyle = "rgba(255,255,255,.4)"; c.fillRect(-28, ry-2, 56, 3);
    }
    c.fillStyle = "#5CE1EA";                               // el piloto de encendido
    c.beginPath(); c.arc(33, -24, 4, 0, 6.283); c.fill();
    c.restore();
    /* las flechas del suelo, delante de la máquina */
    for (let k=0;k<3;k++){
      c.fillStyle = ["rgba(255,197,61,.75)","rgba(255,197,61,.5)","rgba(255,197,61,.3)"][k];
      c.beginPath();
      c.moveTo(x + 46 + k*20, y - 18); c.lineTo(x + 64 + k*20, y); c.lineTo(x + 46 + k*20, y + 18);
      c.lineTo(x + 54 + k*20, y); c.closePath(); c.fill();
    }
  }, DECO_H-100);

  /* Piezas de pista sueltas y los conectores naranjas, como las deja un niño. */
  sembrar(c, 9, 4301, 26, (c,x,y,i) => {
    c.save(); c.translate(x, y); c.rotate(az(i)*3.14);
    c.fillStyle = "#B0561A"; rr(c, -30, -13, 60, 26, 4); c.fill();
    c.fillStyle = "#F09A3E"; rr(c, -30, -9, 60, 18, 3); c.fill();
    c.restore();
  });
}

/* ---------- el tablero: el anillo de casillas, la cárcel y las casitas ---------- */
const COLORES_TABLERO = ["#8B4A2B","#8B4A2B","#7FD3F0","#7FD3F0","#7FD3F0",
                         "#E86FA8","#E86FA8","#E86FA8","#F2933C","#F2933C","#F2933C",
                         "#E2453C","#E2453C","#E2453C","#FFD84D","#FFD84D","#FFD84D",
                         "#4FB84A","#4FB84A","#4FB84A","#2E6FD9","#2E6FD9"];
function decoTablero(c, E){
  const A = ANILLO_TABLERO(), b = A.banda;
  c.fillStyle = E.mancha;                                  // el cartón gastado
  for (let i=0;i<14;i++){
    const x = azEntre(i+11,0,DECO_W), y = azEntre(i+71,0,DECO_H), r = 40+az(i)*60;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* El anillo: banda crema con su marco. Las casas de los vecinos caen encima
     de las casillas, que es justo lo que pasa cuando juegas en el suelo. */
  c.fillStyle = "#EFE9D4";
  c.fillRect(A.x, A.y, A.w, b);
  c.fillRect(A.x, A.y + A.h - b, A.w, b);
  c.fillRect(A.x, A.y, b, A.h);
  c.fillRect(A.x + A.w - b, A.y, b, A.h);
  c.strokeStyle = "#4A4436"; c.lineWidth = 4;
  c.strokeRect(A.x, A.y, A.w, A.h);
  c.strokeRect(A.x + b, A.y + b, A.w - b*2, A.h - b*2);

  /* Las casillas, con su franja de color mirando hacia dentro. */
  const casilla = (x, y, w, h, col, hacia) => {
    c.strokeStyle = "#4A4436"; c.lineWidth = 2.5;
    c.strokeRect(x, y, w, h);
    if (!col) return;
    c.fillStyle = col;
    if (hacia === "abajo")      c.fillRect(x+2, y+h-28, w-4, 26);
    else if (hacia === "arriba")c.fillRect(x+2, y+2, w-4, 26);
    else if (hacia === "der")   c.fillRect(x+w-28, y+2, 26, h-4);
    else                        c.fillRect(x+2, y+2, 26, h-4);
  };
  const N = 9;
  for (let k=0;k<N;k++){
    const w = (A.w - b*2) / N, x = A.x + b + k*w;
    casilla(x, A.y, w, b, COLORES_TABLERO[k % COLORES_TABLERO.length], "abajo");
    casilla(x, A.y + A.h - b, w, b, COLORES_TABLERO[(k+11) % COLORES_TABLERO.length], "arriba");
  }
  const M = 6;
  for (let k=0;k<M;k++){
    const h = (A.h - b*2) / M, y = A.y + b + k*h;
    casilla(A.x, y, b, h, COLORES_TABLERO[(k+5) % COLORES_TABLERO.length], "der");
    casilla(A.x + A.w - b, y, b, h, COLORES_TABLERO[(k+16) % COLORES_TABLERO.length], "izq");
  }

  /* Las cuatro esquinas. Dibujadas a mano y no con emoji: un emoji cambia de
     dibujo según el aparato y aquí desentonaba con todo lo demás. */
  const esquina = (x, y, texto, col, pintar) => {
    c.fillStyle = col;
    c.fillRect(x+3, y+3, b-6, b-6);
    c.strokeStyle = "#4A4436"; c.lineWidth = 3;
    c.strokeRect(x+3, y+3, b-6, b-6);
    c.save(); c.translate(x + b/2, y + b/2 - 12);
    pintar(c);
    c.restore();
    c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "800 12px system-ui, sans-serif";
    c.fillStyle = "#2A1226";
    c.fillText(texto, x + b/2, y + b/2 + 30);
  };
  esquina(A.x, A.y + A.h - b, "SALIDA", "#F2933C", c => {    // la flecha gorda
    c.fillStyle = "#E2453C";
    c.beginPath();
    c.moveTo(-26, -9); c.lineTo(8, -9); c.lineTo(8, -20); c.lineTo(30, 0);
    c.lineTo(8, 20); c.lineTo(8, 9); c.lineTo(-26, 9); c.closePath(); c.fill();
  });
  esquina(A.x, A.y, "CÁRCEL", "#C9C2A8", c => {              // la reja con su preso
    c.fillStyle = "#F0C08A";
    c.beginPath(); c.arc(0, -4, 9, 0, 6.283); c.fill();
    c.fillStyle = "#3A1B33";
    c.beginPath(); c.arc(0, -6, 9, Math.PI*1.05, Math.PI*1.95); c.fill();
    c.fillStyle = "#5A5A66"; rr(c, -8, 5, 16, 12, 2); c.fill();
    c.strokeStyle = "#4A4436"; c.lineWidth = 3.5;
    c.strokeRect(-24, -22, 48, 44);
    for (const dx of [-12, 0, 12]){
      c.beginPath(); c.moveTo(dx, -22); c.lineTo(dx, 22); c.stroke();
    }
  });
  esquina(A.x + A.w - b, A.y, "APARCA GRATIS", "#8FE388", c => {   // el cochecito
    c.fillStyle = "#2A1A16";
    for (const [rx, ry] of [[-13,7],[13,7]]){ c.beginPath(); c.arc(rx, ry, 5, 0, 6.283); c.fill(); }
    c.fillStyle = "#E2453C"; rr(c, -24, -8, 48, 16, 6); c.fill();
    c.fillStyle = "#C0342C"; rr(c, -12, -19, 22, 14, 5); c.fill();
    c.fillStyle = "#7FD3F0"; rr(c, -9, -17, 16, 9, 3); c.fill();
    c.fillStyle = "#FFEFC0"; c.beginPath(); c.arc(21, -2, 3, 0, 6.283); c.fill();
  });
  esquina(A.x + A.w - b, A.y + A.h - b, "A LA CÁRCEL", "#F0A0A0", c => {  // el guardia
    c.fillStyle = "#F0C08A";
    c.beginPath(); c.arc(0, -6, 10, 0, 6.283); c.fill();
    c.fillStyle = "#2E6FD9";
    c.beginPath(); c.arc(0, -9, 10, Math.PI, 0); c.fill();
    c.fillRect(-12, -10, 24, 4);
    c.fillStyle = "#FFD84D"; c.beginPath(); c.arc(0, -14, 2.6, 0, 6.283); c.fill();
    c.fillStyle = "#2E6FD9"; rr(c, -11, 5, 22, 16, 4); c.fill();
    c.strokeStyle = "#F0C08A"; c.lineWidth = 5; c.lineCap = "round";
    c.beginPath(); c.moveTo(8, 8); c.lineTo(26, -4); c.stroke();   // señalando
    c.lineCap = "butt";
  });

  /* Casitas verdes y hoteles rojos repartidos, como fichas olvidadas. */
  sembrar(c, 10, 4401, 24, (c,x,y,i) => {
    const hotel = i % 3 === 0;
    vetoDeco.push({ x:x-30, y:y-30, w:60, h:52 });
    c.fillStyle = "rgba(0,0,0,.22)";
    c.beginPath(); c.ellipse(x, y+11, hotel ? 22 : 15, 6, 0, 0, 6.283); c.fill();
    c.fillStyle = hotel ? "#E2453C" : "#4FB84A";
    if (hotel){
      rr(c, x-20, y-6, 40, 17, 3); c.fill();
      c.beginPath(); c.moveTo(x-22, y-6); c.lineTo(x, y-22); c.lineTo(x+22, y-6); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.4)";
      for (let k=0;k<3;k++) c.fillRect(x-13 + k*11, y-2, 6, 8);
    } else {
      rr(c, x-13, y-4, 26, 14, 2.5); c.fill();
      c.beginPath(); c.moveTo(x-15, y-4); c.lineTo(x, y-17); c.lineTo(x+15, y-4); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.4)";
      c.fillRect(x-4, y-1, 8, 8);
    }
  });

  /* Los dos mazos de cartas. */
  sembrar(c, 3, 4501, 34, (c,x,y,i) => {
    vetoDeco.push({ x:x-42, y:y-34, w:84, h:68 });
    c.save(); c.translate(x, y); c.rotate(az(i)*.6 - .3);
    for (let k=3;k>=0;k--){
      c.fillStyle = k ? "rgba(0,0,0,.14)" : (i % 2 ? "#F2933C" : "#7FD3F0");
      rr(c, -30 + k*2, -22 + k*2, 60, 44, 5); c.fill();
    }
    c.fillStyle = "#2A1226"; c.font = "800 22px system-ui, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(i % 2 ? "?" : "★", 0, 0);
    c.restore();
  });
}

/* ---------- el mirador: la montaña, la vía de madera y la estación ---------- */
function decoMirador(c, E){
  c.fillStyle = E.mancha;                                  // el fieltro de la mesa
  for (let i=0;i<18;i++){
    const x = azEntre(i+5,0,DECO_W), y = azEntre(i+61,0,DECO_H), r = 34+az(i+3)*50;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* La vía de madera: tabla clara, traviesas y los dos rieles oscuros. */
  const O = OVALO_TREN();
  const via = (ancho, color) => {
    c.strokeStyle = color; c.lineWidth = ancho;
    c.beginPath(); c.ellipse(O.x, O.y, O.rx, O.ry, 0, 0, 6.283); c.stroke();
  };
  via(80, "#8A6A3C");                                      // el canto de la tabla
  via(74, "#C9A46A");                                      // la cara de arriba
  c.strokeStyle = "rgba(255,239,226,.14)"; c.lineWidth = 20;  // la veta clara
  c.beginPath(); c.ellipse(O.x, O.y, O.rx - 22, O.ry - 22, 0, 0, 6.283); c.stroke();
  c.strokeStyle = "rgba(110,80,45,.55)"; c.lineWidth = 6;  // traviesas, una a una
  c.setLineDash([7, 24]);
  c.beginPath(); c.ellipse(O.x, O.y, O.rx, O.ry, 0, 0, 6.283); c.stroke();
  c.setLineDash([]);
  for (const d of [-19, 19]){                              // las dos ranuras del riel
    c.strokeStyle = "#5A3E22"; c.lineWidth = 9;
    c.beginPath(); c.ellipse(O.x, O.y, O.rx + d, O.ry + d*.7, 0, 0, 6.283); c.stroke();
    c.strokeStyle = "rgba(0,0,0,.3)"; c.lineWidth = 4;
    c.beginPath(); c.ellipse(O.x, O.y, O.rx + d, O.ry + d*.7, 0, 0, 6.283); c.stroke();
  }
  /* Las juntas donde encaja una tabla con la siguiente. */
  c.strokeStyle = "rgba(90,62,34,.45)"; c.lineWidth = 74;
  c.setLineDash([3, 176]);
  c.beginPath(); c.ellipse(O.x, O.y, O.rx, O.ry, 0, 0, 6.283); c.stroke();
  c.setLineDash([]);

  /* La montaña, en la esquina que el escenario deja libre a propósito. */
  const M = { x: 90, y: 110, w: 520, h: 630 };
  vetoDeco.push({ x:M.x-20, y:M.y-20, w:M.w+40, h:M.h+40 });
  c.fillStyle = "rgba(0,0,0,.18)";
  c.beginPath(); c.ellipse(M.x+M.w/2, M.y+M.h-20, M.w*.52, 44, 0, 0, 6.283); c.fill();
  /* Dos picos detrás y el grande delante, con la ladera de la derecha en
     sombra: tres tonos bastan para que se lea montaña y no cucurucho. */
  c.fillStyle = "#6E5F4C";
  for (const [px, py, pw] of [[.16, .40, .34], [.86, .34, .30]]){
    c.beginPath();
    c.moveTo(M.x+M.w*(px-pw), M.y+M.h);
    c.lineTo(M.x+M.w*px,      M.y+M.h*py);
    c.lineTo(M.x+M.w*(px+pw), M.y+M.h);
    c.closePath(); c.fill();
  }
  const cima = { x: M.x+M.w*.52, y: M.y+M.h*.12 };
  c.fillStyle = "#9A8B74";                                  // la ladera al sol
  c.beginPath();
  c.moveTo(M.x+M.w*.02, M.y+M.h);
  c.lineTo(M.x+M.w*.30, M.y+M.h*.38);
  c.lineTo(cima.x, cima.y);
  c.lineTo(M.x+M.w*.76, M.y+M.h*.42);
  c.lineTo(M.x+M.w*.98, M.y+M.h);
  c.closePath(); c.fill();
  c.fillStyle = "#7E7058";                                  // la de la sombra
  c.beginPath();
  c.moveTo(cima.x, cima.y);
  c.lineTo(M.x+M.w*.76, M.y+M.h*.42);
  c.lineTo(M.x+M.w*.98, M.y+M.h);
  c.lineTo(cima.x + 14, M.y+M.h);
  c.closePath(); c.fill();
  c.strokeStyle = "rgba(60,52,40,.35)"; c.lineWidth = 4;    // las grietas
  for (const [dx, dy] of [[-.16, .34], [.10, .30], [-.05, .52]]){
    c.beginPath();
    c.moveTo(cima.x + M.w*dx*.35, cima.y + M.h*dy*.4);
    c.quadraticCurveTo(cima.x + M.w*dx, cima.y + M.h*dy, cima.x + M.w*dx*1.5, M.y+M.h-30);
    c.stroke();
  }
  c.fillStyle = "#FFEFE2";                                  // la nieve de la cumbre
  c.beginPath();
  c.moveTo(M.x+M.w*.40, M.y+M.h*.26);
  c.lineTo(M.x+M.w*.52, M.y+M.h*.12);
  c.lineTo(M.x+M.w*.64, M.y+M.h*.28);
  c.quadraticCurveTo(M.x+M.w*.52, M.y+M.h*.20, M.x+M.w*.40, M.y+M.h*.26);
  c.closePath(); c.fill();
  /* El mirador propiamente: plataforma de madera con barandilla y catalejo. */
  const mx = M.x+M.w*.52, my = M.y+M.h*.34;
  c.fillStyle = "#C9A46A";
  rr(c, mx-62, my, 124, 26, 5); c.fill();
  c.strokeStyle = "#8A6A3C"; c.lineWidth = 4;
  c.beginPath(); c.moveTo(mx-58, my); c.lineTo(mx-58, my-24);
  c.lineTo(mx+58, my-24); c.lineTo(mx+58, my); c.stroke();
  for (let k=-2;k<=2;k++){
    c.beginPath(); c.moveTo(mx+k*24, my); c.lineTo(mx+k*24, my-24); c.stroke();
  }
  c.fillStyle = "#3A3630";
  c.save(); c.translate(mx+30, my-30); c.rotate(-.5);
  rr(c, -4, -22, 8, 26, 3); c.fill();
  c.restore();
  c.fillStyle = "#2A2018";                                  // la boca del túnel
  const tx = M.x+M.w*.5, ty = M.y+M.h-46;
  c.beginPath(); c.moveTo(tx-52, ty+46); c.lineTo(tx-52, ty); c.arc(tx, ty, 52, Math.PI, 0); c.lineTo(tx+52, ty+46); c.closePath(); c.fill();
  c.strokeStyle = "#9A8A70"; c.lineWidth = 9;
  c.beginPath(); c.moveTo(tx-56, ty+46); c.lineTo(tx-56, ty); c.arc(tx, ty, 56, Math.PI, 0); c.lineTo(tx+56, ty+46); c.stroke();
  c.fillStyle = "#EBD3A2"; c.font = "800 15px system-ui, sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("EL MIRADOR", mx, my+13);

  /* La estación de madera, con su andén y el cartel. */
  sembrar(c, 1, 4601, 96, (c,x,y) => {
    vetoDeco.push({ x:x-120, y:y-56, w:240, h:120 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+42, 104, 20, 0, 0, 6.283); c.fill();
    c.fillStyle = "#C9A46A"; rr(c, x-100, y-14, 200, 56, 6); c.fill();
    c.fillStyle = "#E2453C"; rr(c, x-108, y-44, 216, 34, 6); c.fill();
    c.fillStyle = "rgba(0,0,0,.2)";
    for (let k=0;k<9;k++) c.fillRect(x-100 + k*23, y-44, 8, 34);
    c.fillStyle = "#FFEFE2"; c.font = "800 15px system-ui, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("ESTACIÓN", x, y+12);
  });

  /* Árboles de madera: tronco cilíndrico y copa de disco. */
  sembrar(c, 12, 4701, 30, (c,x,y,i) => {
    vetoDeco.push({ x:x-26, y:y-42, w:52, h:60 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+14, 18, 6, 0, 0, 6.283); c.fill();
    c.fillStyle = "#9A7040"; c.fillRect(x-6, y-6, 12, 20);
    c.fillStyle = i%2 ? "#3E8A3A" : "#4FA84A";
    c.beginPath(); c.arc(x, y-18, 22, 0, 6.283); c.fill();
    c.fillStyle = "rgba(255,255,255,.16)";
    c.beginPath(); c.arc(x-7, y-25, 8, 0, 6.283); c.fill();
  });

  /* Señales de paso a nivel y topes de vía. */
  sembrar(c, 6, 4801, 22, (c,x,y,i) => {
    c.fillStyle = "#EFE9D4"; c.fillRect(x-2.5, y-26, 5, 30);
    c.save(); c.translate(x, y-30); c.rotate(az(i)*.4-.2);
    c.fillStyle = "#E2453C";
    c.beginPath(); c.moveTo(0,-14); c.lineTo(13,0); c.lineTo(0,14); c.lineTo(-13,0); c.closePath(); c.fill();
    c.fillStyle = "#FFEFE2"; c.font = "800 13px system-ui, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("✕", 0, 1);
    c.restore();
  });
}

/* ---------- el circuito: asfalto, pianitos, tuberías y cajas de ítem ---------- */
function decoCircuito(c, E){
  const O = OVALO_KART();
  c.fillStyle = E.mancha;
  for (let i=0;i<16;i++){
    const x = azEntre(i+9,0,DECO_W), y = azEntre(i+83,0,DECO_H), r = 40+az(i)*56;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* El asfalto y los pianitos rojiblancos de los dos bordes. */
  for (const [ancho, color] of [[O.ancho+34, "#E2453C"], [O.ancho, "#4A4A52"]]){
    c.strokeStyle = color; c.lineWidth = ancho;
    c.beginPath(); c.ellipse(O.x, O.y, O.rx, O.ry, 0, 0, 6.283); c.stroke();
  }
  c.strokeStyle = "#FFEFE2"; c.lineWidth = O.ancho + 34;    // el blanco del pianito
  c.setLineDash([34, 34]);
  c.beginPath(); c.ellipse(O.x, O.y, O.rx, O.ry, 0, 0, 6.283); c.stroke();
  c.setLineDash([]);
  c.strokeStyle = "#4A4A52"; c.lineWidth = O.ancho;
  c.beginPath(); c.ellipse(O.x, O.y, O.rx, O.ry, 0, 0, 6.283); c.stroke();
  c.strokeStyle = "rgba(255,255,255,.3)"; c.lineWidth = 5;  // la línea del medio
  c.setLineDash([40, 44]);
  c.beginPath(); c.ellipse(O.x, O.y, O.rx, O.ry, 0, 0, 6.283); c.stroke();
  c.setLineDash([]);

  /* La meta a cuadros, arriba del todo. */
  const meta = puntoOvalo(O, .75);
  c.save(); c.translate(meta.x, meta.y);
  for (let f=0; f<6; f++) for (let k=0;k<2;k++){
    c.fillStyle = (f+k) % 2 ? "#FFEFE2" : "#2A1226";
    c.fillRect(-O.ancho/2 + f*(O.ancho/6), -22 + k*22, O.ancho/6, 22);
  }
  c.restore();

  /* Aceleradores: las flechas del suelo. */
  for (const f of [.10, .40, .60, .90]){
    const p = puntoOvalo(O, f);
    const ang = Math.atan2(Math.cos(f*6.283)*O.ry, -Math.sin(f*6.283)*O.rx);
    c.save(); c.translate(p.x, p.y); c.rotate(ang);
    for (let k=0;k<3;k++){
      c.fillStyle = ["#5CE1EA","#FFC53D","#FF6B90"][k];
      c.beginPath();
      c.moveTo(-30 + k*22, -34); c.lineTo(-8 + k*22, 0); c.lineTo(-30 + k*22, 34);
      c.lineTo(-20 + k*22, 0); c.closePath(); c.fill();
    }
    c.restore();
  }

  /* Tuberías. Una tubería es un CILINDRO: tiene cuerpo, un labio que sobresale
     y una boca por la que se ve el hueco. La versión plana de antes era una
     mancha verde con un agujero; esto se lee como algo en lo que te metes. */
  sembrar(c, 6, 4901, 56, (c,x,y) => {
    vetoDeco.push({ x:x-64, y:y-72, w:128, h:130 });
    const RX = 44, RY = 17, ALTO = 46, LABIO = 12;
    c.fillStyle = "rgba(0,0,0,.26)";
    c.beginPath(); c.ellipse(x + 10, y + ALTO - 2, RX, RY, 0, 0, 6.283); c.fill();

    /* el cuerpo: rectángulo entre las dos elipses, más oscuro a los lados */
    const cuerpo = c.createLinearGradient(x - RX, 0, x + RX, 0);
    cuerpo.addColorStop(0,   "#1B5A1F");
    cuerpo.addColorStop(.32, "#4FB84A");
    cuerpo.addColorStop(.52, "#6FD666");
    cuerpo.addColorStop(1,   "#256A26");
    c.fillStyle = cuerpo;
    c.beginPath();
    c.moveTo(x - RX*.82, y);
    c.lineTo(x - RX*.82, y + ALTO);
    c.ellipse(x, y + ALTO, RX*.82, RY*.82, 0, Math.PI, 0, true);
    c.lineTo(x + RX*.82, y);
    c.closePath(); c.fill();

    /* el labio: un anillo más ancho que el cuerpo */
    const labio = c.createLinearGradient(x - RX, 0, x + RX, 0);
    labio.addColorStop(0,   "#256A26");
    labio.addColorStop(.30, "#5FC957");
    labio.addColorStop(.50, "#7FE375");
    labio.addColorStop(1,   "#2E8B32");
    c.fillStyle = labio;
    c.beginPath();
    c.moveTo(x - RX, y - LABIO);
    c.lineTo(x - RX, y);
    c.ellipse(x, y, RX, RY, 0, Math.PI, 0, true);
    c.lineTo(x + RX, y - LABIO);
    c.closePath(); c.fill();
    c.beginPath(); c.ellipse(x, y - LABIO, RX, RY, 0, 0, 6.283); c.fill();

    /* la boca */
    c.fillStyle = "#123F14";
    c.beginPath(); c.ellipse(x, y - LABIO, RX - 11, RY - 5, 0, 0, 6.283); c.fill();
    c.fillStyle = "#0B2A0D";
    c.beginPath(); c.ellipse(x, y - LABIO + 3, RX - 14, RY - 7, 0, 0, 6.283); c.fill();

    /* el brillo del plástico y la junta del labio */
    c.fillStyle = "rgba(255,255,255,.3)";
    c.beginPath(); c.ellipse(x - RX*.52, y - LABIO - 1, 7, 3.4, -.35, 0, 6.283); c.fill();
    c.fillStyle = "rgba(255,255,255,.16)";
    c.fillRect(x - RX*.55, y + 2, 7, ALTO - 6);
    c.strokeStyle = "rgba(0,0,0,.28)"; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y, RX, RY, 0, Math.PI*.02, Math.PI*.98); c.stroke();
  });

  /* Bloques ?: el cubo con su bisel, los cuatro remaches y el canto de abajo
     en sombra, que es lo que hace que parezca un bloque y no una pegatina. */
  sembrar(c, 7, 5001, 34, (c,x,y,i) => {
    vetoDeco.push({ x:x-38, y:y-40, w:76, h:86 });
    const R = 25;
    c.fillStyle = "rgba(0,0,0,.24)";
    c.beginPath(); c.ellipse(x, y+R+10, R+3, 9, 0, 0, 6.283); c.fill();
    c.fillStyle = "#7A4A12";                                 // el canto inferior
    rr(c, x-R, y-R+7, R*2, R*2, 6); c.fill();
    const cara = c.createLinearGradient(0, y-R, 0, y+R);
    cara.addColorStop(0, "#F7BE55"); cara.addColorStop(1, "#D98A1E");
    c.fillStyle = cara; rr(c, x-R, y-R, R*2, R*2, 6); c.fill();
    c.fillStyle = "rgba(255,255,255,.30)";                   // el bisel de arriba
    c.beginPath();
    c.moveTo(x-R+3, y-R+3); c.lineTo(x+R-3, y-R+3);
    c.lineTo(x+R-9, y-R+9); c.lineTo(x-R+9, y-R+9); c.closePath(); c.fill();
    c.fillStyle = "rgba(0,0,0,.18)";                         // y el de abajo
    c.beginPath();
    c.moveTo(x-R+3, y+R-3); c.lineTo(x+R-3, y+R-3);
    c.lineTo(x+R-9, y+R-9); c.lineTo(x-R+9, y+R-9); c.closePath(); c.fill();
    c.fillStyle = "#8A5A18";                                 // remaches
    for (const [dx,dy] of [[-16,-16],[16,-16],[-16,16],[16,16]]){
      c.beginPath(); c.arc(x+dx, y+dy, 3.2, 0, 6.283); c.fill();
      c.fillStyle = "rgba(255,255,255,.35)";
      c.beginPath(); c.arc(x+dx-1, y+dy-1, 1.3, 0, 6.283); c.fill();
      c.fillStyle = "#8A5A18";
    }
    c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "800 31px system-ui, sans-serif";
    c.fillStyle = "rgba(0,0,0,.35)";
    c.fillText(i % 4 === 3 ? "!" : "?", x, y+4);
    c.fillStyle = "#FFEFE2";
    c.fillText(i % 4 === 3 ? "!" : "?", x, y+1);
  });

  /* Monedas y setas, el confeti del circuito. */
  sembrar(c, 10, 5101, 18, (c,x,y,i) => {
    if (i % 3 === 2){                                       // una seta
      c.fillStyle = "rgba(0,0,0,.2)";
      c.beginPath(); c.ellipse(x, y+11, 15, 5, 0, 0, 6.283); c.fill();
      c.fillStyle = "#F2E3C0"; rr(c, x-8, y-2, 16, 13, 4); c.fill();
      c.fillStyle = "#E2453C";
      c.beginPath(); c.arc(x, y-2, 15, Math.PI, 0); c.fill();
      c.fillStyle = "#FFEFE2";
      for (const dx of [-8, 0, 8]){
        c.beginPath(); c.arc(x+dx, y-8, 3.6, 0, 6.283); c.fill();
      }
    } else {
      c.fillStyle = "rgba(0,0,0,.2)";                        // la sombrita
      c.beginPath(); c.ellipse(x, y+14, 9, 3.4, 0, 0, 6.283); c.fill();
      c.fillStyle = "#A87A12";                               // el canto
      c.beginPath(); c.ellipse(x, y+1, 11, 14, 0, 0, 6.283); c.fill();
      const oro = c.createLinearGradient(x-11, y-14, x+11, y+14);
      oro.addColorStop(0, "#FFE98A"); oro.addColorStop(.5, "#FFD84D"); oro.addColorStop(1, "#D9A81E");
      c.fillStyle = oro;
      c.beginPath(); c.ellipse(x, y-2, 11, 14, 0, 0, 6.283); c.fill();
      c.strokeStyle = "rgba(168,122,18,.85)"; c.lineWidth = 2;   // el aro de dentro
      c.beginPath(); c.ellipse(x, y-2, 6.5, 9.5, 0, 0, 6.283); c.stroke();
      c.fillStyle = "rgba(255,255,255,.55)";                 // el brillo
      c.beginPath(); c.ellipse(x-4.5, y-8, 2.6, 3.6, -.4, 0, 6.283); c.fill();
    }
  });
}

/* ============================================================
   Los cuatro de correr
   ============================================================ */

/* ---------- La Costa Verde: acantilado, mar y ciclovía ---------- */
function decoCostaVerde(c, E){
  const MAR = 1480;                          // tiene que casar con `mar`
  c.fillStyle = E.mancha;
  for (let i=0;i<16;i++){
    const x = azEntre(i+3,0,DECO_W), y = azEntre(i+51,0,MAR-200), r = 40+az(i)*60;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* el mar, en bandas de azul que van aclarando hacia la orilla */
  const agua = c.createLinearGradient(0, MAR, 0, DECO_H);
  agua.addColorStop(0, "#4E8FA8"); agua.addColorStop(1, "#1E4E68");
  c.fillStyle = agua;
  c.fillRect(0, MAR, DECO_W, DECO_H - MAR);
  c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 4;
  for (let k=0;k<7;k++){
    const y = MAR + 24 + k*30;
    c.beginPath();
    for (let x=0;x<=DECO_W;x+=40) c[x?"lineTo":"moveTo"](x, y + Math.sin(x/120 + k)*6);
    c.stroke();
  }

  /* el acantilado: el canto de tierra que cae al mar, con sus grietas */
  c.fillStyle = "#7A6242";
  c.fillRect(0, MAR - 70, DECO_W, 70);
  c.fillStyle = "#9A7F58";
  c.fillRect(0, MAR - 70, DECO_W, 22);
  c.strokeStyle = "rgba(50,40,26,.5)"; c.lineWidth = 3;
  for (let x=30;x<DECO_W;x+=70){
    c.beginPath(); c.moveTo(x, MAR - 62); c.lineTo(x + azEntre(x,-14,14), MAR - 6); c.stroke();
  }
  /* la espuma donde rompe */
  c.fillStyle = "rgba(255,255,255,.5)";
  for (let x=0;x<DECO_W;x+=26){
    c.beginPath(); c.ellipse(x, MAR + 6 + Math.sin(x/90)*5, 16, 5, 0, 0, 6.283); c.fill();
  }

  /* la ciclovía roja pegada al borde, que es la marca de la Costa Verde */
  c.fillStyle = "#8A3A32";
  c.fillRect(0, MAR - 132, DECO_W, 46);
  c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 3;
  c.setLineDash([30, 26]);
  c.beginPath(); c.moveTo(0, MAR - 109); c.lineTo(DECO_W, MAR - 109); c.stroke();
  c.setLineDash([]);

  /* palmeras del malecón y bancas mirando al mar */
  sembrar(c, 11, 5201, 30, (c,x,y,i) => {
    vetoDeco.push({ x:x-26, y:y-70, w:52, h:90 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+12, 20, 6, 0, 0, 6.283); c.fill();
    c.strokeStyle = "#8A6A3C"; c.lineWidth = 7; c.lineCap = "round";
    c.beginPath(); c.moveTo(x, y+10); c.quadraticCurveTo(x + 8, y-24, x + 4, y-52); c.stroke();
    c.lineCap = "butt";
    c.fillStyle = i%2 ? "#3E8A3A" : "#4FA84A";
    for (let k=0;k<6;k++){
      const a = -1.6 + (k-2.5)*.52;
      c.save(); c.translate(x+4, y-52); c.rotate(a);
      c.beginPath(); c.ellipse(20, 0, 22, 7, 0, 0, 6.283); c.fill();
      c.restore();
    }
  }, MAR - 180);

  /* parapentes: lo que siempre hay volando sobre el malecón */
  sembrar(c, 4, 5301, 40, (c,x,y,i) => {
    c.fillStyle = "rgba(0,0,0,.14)";
    c.beginPath(); c.ellipse(x, y+52, 30, 9, 0, 0, 6.283); c.fill();
    const col = ["#FF6B90","#FFC53D","#5CE1EA","#8FE388"][i % 4];
    c.fillStyle = col;
    c.beginPath(); c.moveTo(x-42, y); c.quadraticCurveTo(x, y-34, x+42, y); 
    c.quadraticCurveTo(x, y-14, x-42, y); c.closePath(); c.fill();
    c.strokeStyle = "rgba(255,239,226,.7)"; c.lineWidth = 1.6;
    for (const dx of [-30,-10,10,30]){
      c.beginPath(); c.moveTo(x+dx, y-4); c.lineTo(x, y+22); c.stroke();
    }
    c.fillStyle = "#2A1226";
    c.beginPath(); c.arc(x, y+26, 6, 0, 6.283); c.fill();
  }, MAR - 260);
}

/* ---------- Nazca: las líneas dibujadas en la pampa ----------
   Las figuras son las de verdad y están dibujadas como están hechas: de UN
   SOLO TRAZO continuo que nunca se cruza consigo mismo — así se rascaron, y
   por eso se puede caminar entera una figura sin levantar el pie. Son cinco de
   las famosas: el colibrí, el mono de la cola en espiral, la araña, el cóndor
   y el astronauta de la ladera. */
/* ---------- La Catarata ----------
   El paseo al cerro, como en la foto: paredes de roca a los lados con
   vegetación colgando, el camino inca de piedra que baja zigzagueando, la
   caída de agua sobre la poza, y la gente sentada en las piedras alrededor. */
function decoCatarata(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<18;i++){
    const x = azEntre(i+5,0,DECO_W), y = azEntre(i+35,0,DECO_H), r = 46+az(i)*70;
    c.beginPath(); c.ellipse(x,y,r,r*.42,i,0,6.283); c.fill();
  }

  /* Los cerros: dos paredones de roca, uno a cada lado, con la vegetación
     pegada. Van al fondo, antes que nada. */
  const paredon = (x0, ancho, lado) => {
    c.fillStyle = "#8A8478";
    c.beginPath();
    c.moveTo(x0, 0);
    for (let y = 0; y <= DECO_H; y += 90)
      c.lineTo(x0 + lado * (ancho + Math.sin(y / 190) * 60), y);
    c.lineTo(x0, DECO_H); c.closePath(); c.fill();
    /* las vetas de la roca */
    c.strokeStyle = "rgba(80,74,64,.35)"; c.lineWidth = 5;
    for (let k = 0; k < 7; k++){
      c.beginPath();
      for (let y = 0; y <= DECO_H; y += 120)
        c[y ? "lineTo" : "moveTo"](x0 + lado * (30 + k * (ancho / 8) + Math.sin(y / 150 + k) * 26), y);
      c.stroke();
    }
    /* la maleza del borde, colgando hacia el valle */
    for (let y = 20; y < DECO_H; y += 54){
      const bx = x0 + lado * (ancho + Math.sin(y / 190) * 60);
      c.fillStyle = ["#3E6B36","#4C7C3C","#2F5A2C"][(y / 54 | 0) % 3];
      c.beginPath(); c.ellipse(bx, y, 34, 24, 0, 0, 6.283); c.fill();
      c.fillStyle = "rgba(255,255,255,.07)";
      c.beginPath(); c.ellipse(bx - lado * 10, y - 8, 14, 9, 0, 0, 6.283); c.fill();
    }
  };
  paredon(0, 220, 1);
  paredon(DECO_W, 240, -1);
  vetoDeco.push({ x: 0, y: 0, w: 300, h: DECO_H });
  vetoDeco.push({ x: DECO_W - 320, y: 0, w: 320, h: DECO_H });

  /* La catarata y su poza, arriba en el centro. Es lo que da nombre al sitio,
     así que va a dedo y no sembrada: tiene que estar donde se ve al entrar. */
  const cx = DECO_W * 0.5, cy = DECO_H * 0.22;
  vetoDeco.push({ x: cx - 230, y: cy - 200, w: 460, h: 620 });
  /* el farallón del que cae */
  c.fillStyle = "#6E6860";
  c.beginPath();
  c.moveTo(cx - 200, cy - 190); c.lineTo(cx + 200, cy - 190);
  c.lineTo(cx + 150, cy + 120); c.lineTo(cx - 160, cy + 120);
  c.closePath(); c.fill();
  c.fillStyle = "#8A8478";
  c.beginPath();
  c.moveTo(cx - 200, cy - 190); c.lineTo(cx - 30, cy - 190);
  c.lineTo(cx - 60, cy + 120); c.lineTo(cx - 160, cy + 120);
  c.closePath(); c.fill();
  /* el chorro: tres velos de agua a distinta velocidad */
  for (const [w, alpha, vel] of [[42, .55, 1], [26, .8, 1.7], [12, .95, 2.6]]){
    c.fillStyle = "rgba(238,250,255," + alpha + ")";
    c.beginPath();
    c.moveTo(cx - w/2, cy - 190);
    for (let y = cy - 190; y <= cy + 150; y += 20)
      c.lineTo(cx - w/2 + Math.sin(y / 40 + G.t * vel) * 5, y);
    for (let y = cy + 150; y >= cy - 190; y -= 20)
      c.lineTo(cx + w/2 + Math.sin(y / 40 + G.t * vel) * 5, y);
    c.closePath(); c.fill();
  }
  /* la espuma donde golpea */
  c.fillStyle = "rgba(255,255,255,.75)";
  for (let k = 0; k < 9; k++){
    const a = k * .7 + G.t * .5;
    c.beginPath();
    c.ellipse(cx + Math.cos(a) * 40, cy + 150 + Math.sin(a) * 14, 16 + (k%3)*5, 10, 0, 0, 6.283);
    c.fill();
  }
  /* la poza: el agua verdosa y honda, con el borde de piedras */
  const poza = c.createRadialGradient(cx, cy + 250, 20, cx, cy + 250, 190);
  poza.addColorStop(0, "#2E6E6A"); poza.addColorStop(1, "#4E8A72");
  c.fillStyle = poza;
  c.beginPath(); c.ellipse(cx, cy + 250, 185, 110, 0, 0, 6.283); c.fill();
  c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 3;
  for (let k = 1; k <= 3; k++){
    c.beginPath();
    c.ellipse(cx, cy + 250, 60 * k + Math.sin(G.t * 1.4 + k) * 6, 36 * k, 0, 0, 6.283);
    c.stroke();
  }
  /* las piedras del borde, y la gente sentada encima */
  for (let k = 0; k < 16; k++){
    const a = k * 0.3927;
    const px = cx + Math.cos(a) * 200, py = cy + 250 + Math.sin(a) * 125;
    c.fillStyle = ["#9A9184","#8A8478","#B0A89A"][k % 3];
    c.beginPath(); c.ellipse(px, py, 20 + (k%3)*4, 13, a, 0, 6.283); c.fill();
  }
  /* la gente: unos sentados en las piedras y otros metidos en el agua */
  const gente = [[-150,-70,0],[-190,30,0],[150,-60,0],[196,40,0],[-90,120,0],[80,130,0],
                 [-50,40,1],[40,60,1],[0,96,1]];
  gente.forEach(([dx, dy, dentro], k) => {
    const px = cx + dx, py = cy + 250 + dy;
    const col = ["#E2453C","#3B7BC4","#FFD84D","#8B6BEE","#3DDC97"][k % 5];
    if (!dentro){
      c.fillStyle = col; rr(c, px - 6, py - 14, 12, 15, 4); c.fill();
      c.fillStyle = "#E8B08A"; c.beginPath(); c.arc(px, py - 18, 5.5, 0, 6.283); c.fill();
      c.fillStyle = "#3A2416"; c.beginPath(); c.arc(px, py - 20, 5.5, Math.PI, 0); c.fill();
      c.strokeStyle = col; c.lineWidth = 3;               // las piernas colgando
      c.beginPath(); c.moveTo(px - 3, py + 1); c.lineTo(px - 4, py + 9); c.stroke();
      c.beginPath(); c.moveTo(px + 3, py + 1); c.lineTo(px + 4, py + 9); c.stroke();
    } else {
      /* metido en la poza: solo asoma de la cintura para arriba */
      c.fillStyle = col; rr(c, px - 6, py - 10, 12, 11, 4); c.fill();
      c.fillStyle = "#E8B08A"; c.beginPath(); c.arc(px, py - 14, 5.5, 0, 6.283); c.fill();
      c.fillStyle = "rgba(255,255,255,.5)";
      c.beginPath(); c.ellipse(px, py + 1, 14, 5, 0, 0, 6.283); c.fill();
    }
  });

  /* el camino inca: escalones de piedra que bajan zigzagueando hasta la poza */
  const camino = [];
  for (let k = 0; k <= 26; k++){
    const t = k / 26;
    camino.push([cx + Math.sin(t * 5.2) * 300 * (1 - t * .4), cy + 420 + t * (DECO_H - cy - 500)]);
  }
  c.strokeStyle = "rgba(150,140,120,.55)"; c.lineWidth = 62; c.lineCap = "round"; c.lineJoin = "round";
  c.beginPath();
  camino.forEach(([px, py], k) => k ? c.lineTo(px, py) : c.moveTo(px, py));
  c.stroke();
  /* los escalones, perpendiculares al camino */
  c.strokeStyle = "rgba(90,84,72,.5)"; c.lineWidth = 4;
  for (let k = 1; k < camino.length; k++){
    const [ax, ay] = camino[k-1], [bx, by] = camino[k];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L * 28, ny = dx / L * 28;
    for (const f of [0.33, 0.66]){
      const mx = ax + dx * f, my = ay + dy * f;
      c.beginPath(); c.moveTo(mx - nx, my - ny); c.lineTo(mx + nx, my + ny); c.stroke();
    }
  }

  /* la vegetación suelta del valle: helechos, arbustos y agaves */
  sembrar(c, 26, 8500, 34, (c,x,y,i) => {
    if (i % 3 === 0){                                     // agave, de penca dura
      c.fillStyle = "rgba(0,0,0,.18)";
      c.beginPath(); c.ellipse(x, y+8, 18, 6, 0, 0, 6.283); c.fill();
      for (let k = 0; k < 9; k++){
        const a = -Math.PI/2 + (k - 4) * 0.38;
        c.fillStyle = k % 2 ? "#5E8A4A" : "#4C7C3C";
        c.beginPath();
        c.moveTo(x, y + 6);
        c.lineTo(x + Math.cos(a) * 26 - 4, y + 6 + Math.sin(a) * 26);
        c.lineTo(x + Math.cos(a) * 24 + 4, y + 6 + Math.sin(a) * 24);
        c.closePath(); c.fill();
      }
    } else {                                              // arbusto
      c.fillStyle = "rgba(0,0,0,.16)";
      c.beginPath(); c.ellipse(x, y+8, 20, 6, 0, 0, 6.283); c.fill();
      c.fillStyle = ["#3E6B36","#4C7C3C","#2F5A2C"][i % 3];
      for (const [dx, dy, r] of [[0,-8,17],[-13,-2,12],[13,-2,12]]){
        c.beginPath(); c.arc(x+dx, y+dy, r, 0, 6.283); c.fill();
      }
      c.fillStyle = "rgba(255,255,255,.10)";
      c.beginPath(); c.arc(x-6, y-13, 7, 0, 6.283); c.fill();
    }
  });
}

/* ---------- Farellones ---------- */
function decoNevado(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<20;i++){
    const x = azEntre(i+9,0,DECO_W), y = azEntre(i+29,0,DECO_H), r = 50+az(i)*80;
    c.beginPath(); c.ellipse(x,y,r,r*.4,i,0,6.283); c.fill();
  }
  /* las pistas balizadas: bandas de nieve pisada que bajan */
  c.fillStyle = "rgba(200,220,240,.5)";
  for (let k=0;k<3;k++){
    const x0 = DECO_W * (0.2 + k*0.3);
    c.beginPath();
    c.moveTo(x0-90, 0); c.lineTo(x0+90, 0);
    c.lineTo(x0+150, DECO_H); c.lineTo(x0-150, DECO_H);
    c.closePath(); c.fill();
  }
  c.strokeStyle = "rgba(150,180,210,.35)"; c.lineWidth = 3;
  for (let k=0;k<26;k++){
    const y = k * 84;
    c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(DECO_W*.3, y+26, DECO_W*.7, y-26, DECO_W, y); c.stroke();
  }
  /* el telesilla, cruzando el mapa en diagonal */
  const y0 = DECO_H * .18, y1 = DECO_H * .82;
  c.strokeStyle = "#4A5462"; c.lineWidth = 4;
  c.beginPath(); c.moveTo(120, y0); c.lineTo(DECO_W-120, y1); c.stroke();
  for (let k=0;k<=6;k++){
    const t = k/6, px = 120 + (DECO_W-240)*t, py = y0 + (y1-y0)*t;
    vetoDeco.push({ x:px-22, y:py-70, w:44, h:96 });
    c.fillStyle = "rgba(90,110,130,.25)";
    c.beginPath(); c.ellipse(px, py+22, 22, 8, 0, 0, 6.283); c.fill();
    c.fillStyle = "#5A6678"; rr(c, px-5, py-66, 10, 88, 3); c.fill();
    c.fillStyle = "#7E8A9E"; rr(c, px-20, py-72, 40, 8, 3); c.fill();
  }
  for (let k=0;k<9;k++){                                  // las sillitas colgando
    const t = ((k/9) + (G.t*0.012)) % 1;
    const px = 120 + (DECO_W-240)*t, py = y0 + (y1-y0)*t;
    c.strokeStyle = "#4A5462"; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px, py+18); c.stroke();
    c.fillStyle = ["#E2453C","#FFD84D","#3B7BC4"][k%3];
    rr(c, px-10, py+18, 20, 12, 3); c.fill();
  }
  /* pinos nevados */
  sembrar(c, 24, 8600, 40, (c,x,y,i) => {
    vetoDeco.push({ x:x-24, y:y-72, w:48, h:88 });
    c.fillStyle = "rgba(120,150,180,.22)";
    c.beginPath(); c.ellipse(x, y+12, 22, 7, 0, 0, 6.283); c.fill();
    c.fillStyle = "#5A3E22"; c.fillRect(x-4, y-6, 8, 18);
    for (let k=0;k<3;k++){
      const ay = y - 4 - k*20, an = 24 - k*5;
      c.fillStyle = ["#2F5A3C","#26492F","#376644"][i % 3];
      c.beginPath(); c.moveTo(x-an, ay); c.lineTo(x, ay-30); c.lineTo(x+an, ay); c.closePath(); c.fill();
      c.fillStyle = "#F4F8FC";                            // la nieve encima
      c.beginPath(); c.moveTo(x-an*.7, ay-8); c.lineTo(x, ay-30); c.lineTo(x+an*.7, ay-8);
      c.quadraticCurveTo(x, ay-14, x-an*.7, ay-8); c.closePath(); c.fill();
    }
  });
  /* muñecos de nieve y banderines de pista */
  sembrar(c, 12, 8700, 26, (c,x,y,i) => {
    if (i % 2 === 0){
      c.fillStyle = "rgba(120,150,180,.2)";
      c.beginPath(); c.ellipse(x, y+12, 16, 5, 0, 0, 6.283); c.fill();
      c.fillStyle = "#FFFFFF";
      c.beginPath(); c.arc(x, y+2, 13, 0, 6.283); c.fill();
      c.beginPath(); c.arc(x, y-14, 9, 0, 6.283); c.fill();
      c.fillStyle = "#2A2226";
      c.beginPath(); c.arc(x-3, y-16, 1.4, 0, 6.283); c.fill();
      c.beginPath(); c.arc(x+3, y-16, 1.4, 0, 6.283); c.fill();
      for (let k=0;k<3;k++){ c.beginPath(); c.arc(x, y-2+k*5, 1.4, 0, 6.283); c.fill(); }
      c.fillStyle = "#FF7A1A";
      c.beginPath(); c.moveTo(x, y-13); c.lineTo(x+9, y-11); c.lineTo(x, y-10); c.closePath(); c.fill();
      c.strokeStyle = "#5A3E22"; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(x-12, y); c.lineTo(x-22, y-8); c.stroke();
      c.beginPath(); c.moveTo(x+12, y); c.lineTo(x+22, y-8); c.stroke();
    } else {
      c.fillStyle = "#5A6678"; c.fillRect(x-1.5, y-24, 3, 26);
      c.fillStyle = i % 4 === 1 ? "#E2453C" : "#3B7BC4";
      c.beginPath(); c.moveTo(x+1, y-24); c.lineTo(x+18, y-19); c.lineTo(x+1, y-14); c.closePath(); c.fill();
    }
  });
}

/* ---------- El Zoológico ---------- */
function decoZoo(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<18;i++){
    const x = azEntre(i+21,0,DECO_W), y = azEntre(i+51,0,DECO_H), r = 44+az(i)*64;
    c.beginPath(); c.ellipse(x,y,r,r*.42,i,0,6.283); c.fill();
  }
  /* los caminos de gravilla entre recintos */
  c.strokeStyle = "rgba(190,175,140,.4)"; c.lineWidth = 58; c.lineCap = "round";
  c.beginPath(); c.moveTo(120, DECO_H*.5); c.bezierCurveTo(DECO_W*.35, DECO_H*.2, DECO_W*.65, DECO_H*.8, DECO_W-120, DECO_H*.5); c.stroke();

  /* los recintos: un rectángulo de hierba cercado, con su animal y su cartel */
  const bichos = ["jirafa", "leon", "mono", "flamenco", "oso"];
  /* Con `sembrar` casi ninguno encontraba sitio: un recinto es más grande que
     una casa y el reparto se rinde a los 26 intentos, igual que pasó con los
     volcanes de la Prehistoria. `huecoGrande` barre el mapa entero. */
  const recintos = [];
  for (let k = 0; k < 6; k++){
    const sitio = huecoGrande(8800 + k * 131, 130, 220, DECO_H - 220);
    if (sitio) recintos.push(sitio);
  }
  recintos.forEach(([x, y], i) => {
    const an = 210, al = 150;
    vetoDeco.push({ x:x-an/2-14, y:y-al/2-30, w:an+28, h:al+60 });
    c.fillStyle = "#7E9A52";                              // la hierba del recinto
    rr(c, x-an/2, y-al/2, an, al, 12); c.fill();
    c.fillStyle = "rgba(255,255,255,.08)";
    rr(c, x-an/2, y-al/2, an, al*.4, 12); c.fill();
    /* la reja */
    c.strokeStyle = "#5A6E4A"; c.lineWidth = 5;
    rr(c, x-an/2, y-al/2, an, al, 12); c.stroke();
    c.strokeStyle = "#7A8E5A"; c.lineWidth = 2.5;
    for (let k=1;k<12;k++){
      c.beginPath(); c.moveTo(x-an/2+k*(an/12), y-al/2); c.lineTo(x-an/2+k*(an/12), y+al/2); c.stroke();
    }
    /* el cartel */
    c.fillStyle = "#8A6A3C"; c.fillRect(x-3, y+al/2, 6, 20);
    c.fillStyle = "#E4DCC8"; rr(c, x-40, y+al/2+16, 80, 18, 3); c.fill();
    c.fillStyle = "#5A4526"; rr(c, x-32, y+al/2+22, 64, 5, 2); c.fill();
    /* el animal */
    const cual = bichos[i % bichos.length];
    c.save(); c.translate(x, y+10);
    if (cual === "jirafa"){
      c.fillStyle = "#E8B84D";
      c.fillRect(-4, -70, 12, 60);                        // el cuello larguísimo
      c.beginPath(); c.ellipse(-8, -20, 26, 16, 0, 0, 6.283); c.fill();
      c.beginPath(); c.ellipse(8, -74, 12, 8, -.3, 0, 6.283); c.fill();
      c.fillStyle = "#A8763A";
      for (let k=0;k<6;k++) c.beginPath(), c.arc(-20+k*8, -24+((k%2)*10), 4.5, 0, 6.283), c.fill();
      for (let k=0;k<4;k++) c.beginPath(), c.arc(0, -60+k*12, 3.4, 0, 6.283), c.fill();
      c.fillStyle = "#6E4526";
      for (const px of [-20,-8,4,16]) c.fillRect(px, -8, 4, 20);
    } else if (cual === "leon"){
      c.fillStyle = "#C9863C";
      c.beginPath(); c.ellipse(-6, -14, 24, 14, 0, 0, 6.283); c.fill();
      c.fillStyle = "#8A5A22";                            // la melena
      c.beginPath(); c.arc(18, -20, 17, 0, 6.283); c.fill();
      c.fillStyle = "#E0A050";
      c.beginPath(); c.arc(19, -20, 11, 0, 6.283); c.fill();
      c.fillStyle = "#3A2416";
      c.beginPath(); c.arc(16, -22, 1.6, 0, 6.283); c.fill();
      c.beginPath(); c.arc(23, -22, 1.6, 0, 6.283); c.fill();
      c.fillStyle = "#C9863C";
      for (const px of [-20,-8,2]) c.fillRect(px, -4, 5, 14);
    } else if (cual === "mono"){
      c.fillStyle = "#8A6A4E";
      c.beginPath(); c.ellipse(0, -14, 14, 16, 0, 0, 6.283); c.fill();
      c.beginPath(); c.arc(0, -32, 10, 0, 6.283); c.fill();
      c.fillStyle = "#D8B08A";
      c.beginPath(); c.arc(0, -30, 7, 0, 6.283); c.fill();
      c.fillStyle = "#3A2416";
      c.beginPath(); c.arc(-3, -32, 1.4, 0, 6.283); c.fill();
      c.beginPath(); c.arc(3, -32, 1.4, 0, 6.283); c.fill();
      c.strokeStyle = "#8A6A4E"; c.lineWidth = 4;
      c.beginPath(); c.moveTo(12, -12); c.quadraticCurveTo(28, -18, 24, 0); c.stroke();
    } else if (cual === "flamenco"){
      c.fillStyle = "rgba(90,150,190,.45)";               // la laguna
      c.beginPath(); c.ellipse(0, 6, 60, 22, 0, 0, 6.283); c.fill();
      for (const dx of [-22, 6, 30]){
        c.strokeStyle = "#FF9EC4"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(dx, 4); c.lineTo(dx+2, -20); c.stroke();
        c.fillStyle = "#FF9EC4";
        c.beginPath(); c.ellipse(dx+4, -28, 11, 8, 0, 0, 6.283); c.fill();
        c.beginPath(); c.arc(dx+12, -36, 4.5, 0, 6.283); c.fill();
        c.fillStyle = "#2A2226";
        c.beginPath(); c.moveTo(dx+15, -35); c.lineTo(dx+22, -31); c.lineTo(dx+15, -32); c.closePath(); c.fill();
      }
    } else {
      c.fillStyle = "#6E5A4A";                            // el oso
      c.beginPath(); c.ellipse(-4, -14, 22, 15, 0, 0, 6.283); c.fill();
      c.beginPath(); c.arc(16, -22, 12, 0, 6.283); c.fill();
      c.beginPath(); c.arc(10, -33, 5, 0, 6.283); c.fill();
      c.beginPath(); c.arc(22, -33, 5, 0, 6.283); c.fill();
      c.fillStyle = "#3A2416";
      c.beginPath(); c.arc(13, -24, 1.6, 0, 6.283); c.fill();
      c.beginPath(); c.arc(20, -24, 1.6, 0, 6.283); c.fill();
      c.fillStyle = "#C9A46A";
      c.beginPath(); c.ellipse(23, -19, 6, 4.5, 0, 0, 6.283); c.fill();
    }
    c.restore();
  });
  /* papeleras y bancos del paseo */
  sembrar(c, 12, 8900, 24, (c,x,y,i) => {
    if (i % 2){
      c.fillStyle = "#5A6E4A"; rr(c, x-9, y-14, 18, 20, 3); c.fill();
      c.fillStyle = "#7A8E5A"; rr(c, x-11, y-17, 22, 5, 2); c.fill();
    } else {
      c.fillStyle = "rgba(0,0,0,.2)";
      c.beginPath(); c.ellipse(x, y+8, 22, 5, 0, 0, 6.283); c.fill();
      c.fillStyle = "#8A6A3C"; rr(c, x-20, y-6, 40, 6, 2); c.fill();
      rr(c, x-20, y-18, 40, 5, 2); c.fill();
      c.fillStyle = "#5A5248"; c.fillRect(x-17, y, 4, 8); c.fillRect(x+13, y, 4, 8);
    }
  });
}

/* ---------- El Parque de Diversiones ---------- */
function decoFeria(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<18;i++){
    const x = azEntre(i+23,0,DECO_W), y = azEntre(i+53,0,DECO_H), r = 46+az(i)*66;
    c.beginPath(); c.ellipse(x,y,r,r*.42,i,0,6.283); c.fill();
  }
  /* el suelo de la feria: baldosas de colores apagados */
  for (let x=0;x<DECO_W;x+=120) for (let y=0;y<DECO_H;y+=120){
    if (((x/120)+(y/120)) % 2) continue;
    c.fillStyle = "rgba(255,255,255,.04)";
    rr(c, x, y, 120, 120, 8); c.fill();
  }

  /* la rueda de la fortuna, que gira */
  const rueda = huecoGrande(9000, 170, 260, DECO_H*.6);
  if (rueda){
    const [rx, ry] = rueda;
    vetoDeco.push({ x:rx-170, y:ry-190, w:340, h:290 });
    c.fillStyle = "rgba(0,0,0,.24)";
    c.beginPath(); c.ellipse(rx, ry+96, 90, 20, 0, 0, 6.283); c.fill();
    c.strokeStyle = "#8A8478"; c.lineWidth = 9;            // el soporte en A
    c.beginPath(); c.moveTo(rx-70, ry+96); c.lineTo(rx, ry); c.lineTo(rx+70, ry+96); c.stroke();
    const gira = G.t * 0.35;
    c.strokeStyle = "#C9C2D8"; c.lineWidth = 5;            // los radios
    for (let k=0;k<12;k++){
      const a = gira + k * 0.5236;
      c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + Math.cos(a)*150, ry + Math.sin(a)*150); c.stroke();
    }
    c.strokeStyle = "#E4DCC8"; c.lineWidth = 8;
    c.beginPath(); c.arc(rx, ry, 150, 0, 6.283); c.stroke();
    for (let k=0;k<12;k++){                                // las cabinas
      const a = gira + k * 0.5236;
      const px = rx + Math.cos(a)*150, py = ry + Math.sin(a)*150;
      c.fillStyle = ["#E2453C","#FFD84D","#5CE1EA","#8B6BEE","#3DDC97","#FF9EC4"][k%6];
      rr(c, px-13, py+2, 26, 20, 6); c.fill();
      c.fillStyle = "rgba(0,0,0,.22)"; rr(c, px-9, py+7, 18, 9, 3); c.fill();
    }
    c.fillStyle = "#8A8478";
    c.beginPath(); c.arc(rx, ry, 14, 0, 6.283); c.fill();
  }

  /* la montaña rusa: un bucle de vía con su vagoneta */
  const mr = huecoGrande(9100, 140, 240, DECO_H-260);
  if (mr){
    const [mx, my] = mr;
    vetoDeco.push({ x:mx-150, y:my-120, w:300, h:220 });
    const pista = [];
    for (let k=0;k<=40;k++){
      const t = k/40, a = t*6.283;
      pista.push([mx + Math.cos(a)*130, my + Math.sin(a)*70 - Math.sin(a*2)*36]);
    }
    c.strokeStyle = "#6E6878"; c.lineWidth = 5;            // los pilares
    for (let k=0;k<pista.length;k+=4){
      c.beginPath(); c.moveTo(pista[k][0], pista[k][1]); c.lineTo(pista[k][0], my+96); c.stroke();
    }
    c.strokeStyle = "#E2453C"; c.lineWidth = 7; c.lineJoin = "round";
    c.beginPath();
    pista.forEach(([px,py],k)=> k?c.lineTo(px,py):c.moveTo(px,py));
    c.closePath(); c.stroke();
    c.strokeStyle = "#FFD84D"; c.lineWidth = 2.5; c.stroke();
    const f = (G.t*0.09) % 1, idx = (f*pista.length)|0;    // la vagoneta
    for (let v=0;v<3;v++){
      const [px,py] = pista[(idx - v*2 + pista.length) % pista.length];
      c.fillStyle = ["#3B7BC4","#8B6BEE","#3DDC97"][v];
      rr(c, px-9, py-9, 18, 13, 4); c.fill();
    }
  }

  /* carpas de rayas y puestos */
  sembrar(c, 12, 9200, 46, (c,x,y,i) => {
    vetoDeco.push({ x:x-44, y:y-58, w:88, h:76 });
    c.fillStyle = "rgba(0,0,0,.22)";
    c.beginPath(); c.ellipse(x, y+16, 42, 11, 0, 0, 6.283); c.fill();
    const a = ["#E2453C","#8B6BEE","#3DDC97"][i % 3];
    for (let k=0;k<7;k++){                                 // las rayas del toldo
      c.fillStyle = k % 2 ? a : "#FFF6E1";
      c.beginPath();
      c.moveTo(x-40+k*11.4, y-8); c.lineTo(x, y-56); c.lineTo(x-29+k*11.4, y-8);
      c.closePath(); c.fill();
    }
    c.fillStyle = "#E4DCC8"; rr(c, x-40, y-10, 80, 26, 3); c.fill();
    c.fillStyle = "#2A2226"; rr(c, x-30, y-4, 60, 14, 2); c.fill();
    c.fillStyle = "#FFD84D";
    c.beginPath(); c.moveTo(x, y-56); c.lineTo(x, y-68); c.lineTo(x+16, y-62); c.closePath(); c.fill();
  });
  /* globos sueltos */
  sembrar(c, 14, 9300, 22, (c,x,y,i) => {
    const sube = Math.sin(G.t * 1.2 + i) * 6;
    c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x+4, y-14, x, y-26+sube); c.stroke();
    c.fillStyle = ["#E2453C","#FFD84D","#5CE1EA","#FF9EC4","#3DDC97"][i % 5];
    c.beginPath(); c.ellipse(x, y-36+sube, 11, 13, 0, 0, 6.283); c.fill();
    c.fillStyle = "rgba(255,255,255,.45)";
    c.beginPath(); c.ellipse(x-4, y-40+sube, 3.4, 4.5, -.3, 0, 6.283); c.fill();
  });
}

/* ---------- La Nave Espacial ---------- */
function decoNave(c, E){
  /* el suelo de chapa: placas remachadas */
  for (let x=0;x<DECO_W;x+=160) for (let y=0;y<DECO_H;y+=160){
    c.fillStyle = ((x/160)+(y/160)) % 2 ? "rgba(255,255,255,.028)" : "rgba(0,0,0,.05)";
    rr(c, x+3, y+3, 154, 154, 6); c.fill();
    c.fillStyle = "rgba(200,220,240,.10)";
    for (const [rx, ry] of [[12,12],[146,12],[12,146],[146,146]]){
      c.beginPath(); c.arc(x+rx, y+ry, 2.6, 0, 6.283); c.fill();
    }
  }
  /* los pasillos: bandas más claras con línea central */
  c.fillStyle = "rgba(150,190,230,.07)";
  c.fillRect(0, DECO_H*.5-70, DECO_W, 140);
  c.fillRect(DECO_W*.5-70, 0, 140, DECO_H);
  c.strokeStyle = "rgba(92,225,234,.30)"; c.lineWidth = 3;
  c.setLineDash([26, 22]);
  c.beginPath(); c.moveTo(0, DECO_H*.5); c.lineTo(DECO_W, DECO_H*.5); c.stroke();
  c.beginPath(); c.moveTo(DECO_W*.5, 0); c.lineTo(DECO_W*.5, DECO_H); c.stroke();
  c.setLineDash([]);

  /* las ventanas al espacio, en los bordes */
  const ventana = (x, y) => {
    vetoDeco.push({ x:x-56, y:y-46, w:112, h:92 });
    c.fillStyle = "#8A94A8";
    c.beginPath(); c.ellipse(x, y, 52, 42, 0, 0, 6.283); c.fill();
    c.fillStyle = "#0A0C18";
    c.beginPath(); c.ellipse(x, y, 44, 34, 0, 0, 6.283); c.fill();
    for (let k=0;k<14;k++){                                // las estrellas
      const sx = x + azEntre(k+x, -38, 38), sy = y + azEntre(k+y, -28, 28);
      c.fillStyle = "rgba(255,255,255," + (0.4 + az(k)*0.6) + ")";
      c.beginPath(); c.arc(sx, sy, 0.9 + az(k+3)*1.4, 0, 6.283); c.fill();
    }
    c.fillStyle = "rgba(139,107,238,.35)";                 // una nebulosa
    c.beginPath(); c.ellipse(x+12, y-8, 18, 11, .4, 0, 6.283); c.fill();
    c.fillStyle = "rgba(255,255,255,.13)";                 // el reflejo del cristal
    c.beginPath(); c.ellipse(x-16, y-14, 16, 9, -.5, 0, 6.283); c.fill();
    c.fillStyle = "#6E7A8E";
    for (let k=0;k<8;k++){
      const a = k*0.785;
      c.beginPath(); c.arc(x + Math.cos(a)*48, y + Math.sin(a)*38, 3.2, 0, 6.283); c.fill();
    }
  };
  for (const [fx, fy] of [[0.12,0.14],[0.5,0.10],[0.88,0.14],[0.12,0.86],[0.88,0.86]])
    ventana(DECO_W*fx, DECO_H*fy);

  /* consolas con pantallitas */
  sembrar(c, 10, 9400, 50, (c,x,y,i) => {
    vetoDeco.push({ x:x-44, y:y-40, w:88, h:66 });
    c.fillStyle = "rgba(0,0,0,.3)";
    c.beginPath(); c.ellipse(x, y+22, 40, 10, 0, 0, 6.283); c.fill();
    c.fillStyle = "#5A6678"; rr(c, x-38, y-8, 76, 30, 5); c.fill();
    c.fillStyle = "#7E8A9E"; rr(c, x-38, y-34, 76, 28, 5); c.fill();
    c.fillStyle = "#0E1626"; rr(c, x-32, y-30, 64, 20, 3); c.fill();
    /* la gráfica de la pantalla, que se mueve */
    c.strokeStyle = ["#5CE1EA","#3DDC97","#FFD84D"][i % 3]; c.lineWidth = 2;
    c.beginPath();
    for (let k=0;k<=12;k++)
      c[k?"lineTo":"moveTo"](x-30+k*5, y-20 + Math.sin(G.t*2 + k*.8 + i)*6);
    c.stroke();
    for (let k=0;k<5;k++){                                 // los botones
      c.fillStyle = ["#E2453C","#FFD84D","#3DDC97","#5CE1EA","#FF9EC4"][k];
      c.beginPath(); c.arc(x-26+k*13, y+6, 4, 0, 6.283); c.fill();
    }
  });
  /* rejillas de ventilación y tripulantes de colores */
  sembrar(c, 16, 9500, 26, (c,x,y,i) => {
    if (i % 3 === 0){                                      // la rejilla
      c.fillStyle = "#2E3646"; rr(c, x-16, y-12, 32, 24, 3); c.fill();
      c.fillStyle = "#4A5462";
      for (let k=0;k<4;k++) rr(c, x-13, y-9+k*6, 26, 3.4, 1), c.fill();
    } else {                                               // un tripulante
      const col = ["#E2453C","#3B7BC4","#FFD84D","#3DDC97","#FF9EC4","#8B6BEE"][i % 6];
      c.fillStyle = "rgba(0,0,0,.26)";
      c.beginPath(); c.ellipse(x, y+13, 12, 4, 0, 0, 6.283); c.fill();
      c.fillStyle = col;                                   // el cuerpo de judía
      c.beginPath();
      c.moveTo(x-10, y+12); c.lineTo(x-10, y-6);
      c.quadraticCurveTo(x-10, y-18, x+2, y-18);
      c.quadraticCurveTo(x+11, y-18, x+11, y-6);
      c.lineTo(x+11, y+12); c.closePath(); c.fill();
      c.fillStyle = col;                                   // la mochila
      rr(c, x-15, y-6, 6, 13, 3); c.fill();
      c.fillStyle = "#9FD8F0";                             // el visor
      rr(c, x-2, y-14, 15, 9, 4); c.fill();
      c.fillStyle = "rgba(255,255,255,.5)";
      rr(c, x+1, y-13, 6, 3.4, 2); c.fill();
      c.fillStyle = "rgba(0,0,0,.16)";
      rr(c, x-10, y+8, 21, 4, 2); c.fill();
    }
  });
}

/* ---------- La Construcción ----------
   Torres a medio hacer con el hormigón visto, andamios, montones de arena y
   grava, y las vallas naranjas. */
function decoObra(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<20;i++){
    const x = azEntre(i+3,0,DECO_W), y = azEntre(i+31,0,DECO_H), r = 40+az(i)*60;
    c.beginPath(); c.ellipse(x,y,r,r*.4,i,0,6.283); c.fill();
  }
  /* Rodadas de camión: tramos cortos y por pares, que es como quedan las
     huellas. De punta a punta parecían un pentagrama sobre la obra. */
  c.strokeStyle = "rgba(80,70,58,.13)"; c.lineWidth = 6;
  for (let i=0;i<22;i++){
    const x0 = azEntre(i+90, 60, DECO_W-460), y0 = azEntre(i+140, 80, DECO_H-120);
    const dx = azEntre(i+7, 260, 420), dy = azEntre(i+17, -70, 70);
    for (const off of [-9, 9]){
      c.beginPath(); c.moveTo(x0, y0+off);
      c.quadraticCurveTo(x0+dx*.5, y0+off+dy, x0+dx, y0+off+dy*.4);
      c.stroke();
    }
  }

  /* los edificios a medio hacer */
  sembrar(c, 6, 7100, 90, (c,x,y,i) => {
    const pisos = 3 + (i % 3), an = 120, al = 46;
    vetoDeco.push({ x:x-an/2-16, y:y-pisos*al-20, w:an+32, h:pisos*al+50 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+10, an*.6, 16, 0, 0, 6.283); c.fill();
    for (let k=0;k<pisos;k++){
      const py = y - k*al;
      c.fillStyle = k === pisos-1 ? "#B0A89A" : "#9A9084";   // el último, más claro
      rr(c, x-an/2, py-al, an, al-4, 2); c.fill();
      c.fillStyle = "rgba(0,0,0,.22)";                        // los huecos de ventana
      for (let w=0;w<3;w++) rr(c, x-an/2+14+w*38, py-al+10, 24, 20, 2), c.fill();
      c.fillStyle = "#8A8478";                                // el forjado
      c.fillRect(x-an/2-6, py-al-4, an+12, 5);
    }
    /* los fierros que asoman arriba, sin doblar */
    c.strokeStyle = "#A8654A"; c.lineWidth = 3;
    for (let w=0;w<5;w++){
      const fx = x-an/2+16+w*22;
      c.beginPath(); c.moveTo(fx, y-pisos*al-4);
      c.lineTo(fx+azEntre(i*7+w,-4,4), y-pisos*al-20); c.stroke();
    }
    /* el andamio pegado a un lado */
    c.strokeStyle = "#C9A46A"; c.lineWidth = 3;
    for (let k=0;k<=pisos;k++){
      c.beginPath(); c.moveTo(x+an/2, y-k*al); c.lineTo(x+an/2+26, y-k*al); c.stroke();
    }
    c.beginPath(); c.moveTo(x+an/2+26, y+8); c.lineTo(x+an/2+26, y-pisos*al); c.stroke();
  });

  /* montones de arena y de grava */
  sembrar(c, 9, 7200, 46, (c,x,y,i) => {
    vetoDeco.push({ x:x-40, y:y-30, w:80, h:50 });
    const arena = i % 2 === 0;
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+10, 38, 11, 0, 0, 6.283); c.fill();
    /* Dos tonos y un filo claro arriba: con un solo color plano los montones
       se leían como charcos grises sobre la tierra. */
    c.fillStyle = arena ? "#B89A5E" : "#6E6660";
    c.beginPath();
    c.moveTo(x-38, y+10); c.quadraticCurveTo(x, y-34, x+38, y+10); c.closePath(); c.fill();
    c.fillStyle = arena ? "#E8D0A0" : "#9A928A";
    c.beginPath();
    c.moveTo(x-38, y+10); c.quadraticCurveTo(x-6, y-32, x+6, y+10); c.closePath(); c.fill();
    c.strokeStyle = arena ? "#F2E4C0" : "#B8B0A6"; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(x-20, y-12); c.quadraticCurveTo(x-2, y-32, x+14, y-10); c.stroke();
    if (!arena){                                    // piedras sueltas en la grava
      c.fillStyle = "#6E6660";
      for (let k=0;k<5;k++)
        c.fillRect(x-24+k*10, y+azEntre(i*4+k,-6,6), 5, 4);
    }
  });

  /* conos, palés y carretillas */
  sembrar(c, 14, 7300, 26, (c,x,y,i) => {
    if (i % 3 === 0){                                // palé de ladrillos
      c.fillStyle = "#8A6A3C"; rr(c, x-16, y+2, 32, 6, 1); c.fill();
      c.fillStyle = "#B5533A";
      for (let k=0;k<6;k++) rr(c, x-14+(k%3)*10, y-6-((k/3)|0)*7, 9, 6, 1), c.fill();
    } else if (i % 3 === 1){                         // cono
      c.fillStyle = "rgba(0,0,0,.24)";
      c.beginPath(); c.ellipse(x, y+7, 10, 3.4, 0, 0, 6.283); c.fill();
      c.fillStyle = "#FF7A1A";
      c.beginPath(); c.moveTo(x-9, y+7); c.lineTo(x, y-14); c.lineTo(x+9, y+7); c.closePath(); c.fill();
      c.fillStyle = "#FFF6E1"; c.fillRect(x-5.5, y-4, 11, 4);
    } else {                                         // carretilla
      c.fillStyle = "#5A5248";
      c.beginPath(); c.arc(x-8, y+6, 5, 0, 6.283); c.fill();
      c.fillStyle = "#FFB020";
      c.beginPath();
      c.moveTo(x-14, y-6); c.lineTo(x+12, y-6); c.lineTo(x+6, y+4); c.lineTo(x-10, y+4);
      c.closePath(); c.fill();
      c.strokeStyle = "#8A8478"; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(x+12, y-6); c.lineTo(x+22, y-2); c.stroke();
    }
  });
}

/* ---------- La Edad Media ----------
   El castillo con sus torres, casas de entramado, el pozo, campos arados y
   aldeanos yendo a lo suyo. */
function decoMedieval(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<18;i++){
    const x = azEntre(i+11,0,DECO_W), y = azEntre(i+41,0,DECO_H), r = 46+az(i)*66;
    c.beginPath(); c.ellipse(x,y,r,r*.42,i,0,6.283); c.fill();
  }
  /* campos arados: bandas de surcos */
  for (let b=0;b<4;b++){
    const bx = azEntre(b+70, 100, DECO_W-500), by = azEntre(b+80, 100, DECO_H-380);
    c.fillStyle = "rgba(120,96,58,.20)";
    rr(c, bx, by, 380, 260, 10); c.fill();
    c.strokeStyle = "rgba(90,70,42,.28)"; c.lineWidth = 4;
    for (let k=0;k<11;k++){
      c.beginPath(); c.moveTo(bx+10, by+16+k*22); c.lineTo(bx+370, by+16+k*22); c.stroke();
    }
  }

  /* el castillo, uno solo y grande */
  const castillo = huecoGrande(7400, 150, 260, DECO_H*.6);
  if (castillo){
    const [cx, cy] = castillo;
    vetoDeco.push({ x:cx-130, y:cy-150, w:260, h:200 });
    c.fillStyle = "rgba(0,0,0,.24)";
    c.beginPath(); c.ellipse(cx, cy+44, 128, 22, 0, 0, 6.283); c.fill();
    c.fillStyle = "#9A9184";                          // el cuerpo
    rr(c, cx-96, cy-70, 192, 114, 4); c.fill();
    c.fillStyle = "#8A8176";
    rr(c, cx-96, cy-70, 192, 12, 3); c.fill();
    for (const tx of [cx-116, cx+76]){                // las dos torres
      c.fillStyle = "#A8A092"; rr(c, tx, cy-110, 40, 154, 4); c.fill();
      c.fillStyle = "#8A8176";
      for (let k=0;k<3;k++) c.fillRect(tx+k*14, cy-120, 9, 12);   // las almenas
      c.fillStyle = "#C0452F";                        // el tejado cónico
      c.beginPath();
      c.moveTo(tx-6, cy-120); c.lineTo(tx+20, cy-152); c.lineTo(tx+46, cy-120);
      c.closePath(); c.fill();
      c.fillStyle = "rgba(0,0,0,.3)";                 // la saetera
      rr(c, tx+16, cy-84, 8, 20, 3); c.fill();
    }
    c.fillStyle = "#8A8176";                          // almenas del centro
    for (let k=0;k<7;k++) c.fillRect(cx-92+k*28, cy-82, 16, 14);
    c.fillStyle = "#5A3E22";                          // el portón
    c.beginPath();
    c.moveTo(cx-24, cy+44); c.lineTo(cx-24, cy-6);
    c.quadraticCurveTo(cx, cy-34, cx+24, cy-6); c.lineTo(cx+24, cy+44);
    c.closePath(); c.fill();
    c.strokeStyle = "#3A2416"; c.lineWidth = 2.5;     // el rastrillo
    for (let k=1;k<5;k++){
      c.beginPath(); c.moveTo(cx-24+k*10, cy-16); c.lineTo(cx-24+k*10, cy+44); c.stroke();
    }
    c.fillStyle = "#FFD84D";                          // la bandera
    c.beginPath(); c.moveTo(cx, cy-152); c.lineTo(cx, cy-176); c.lineTo(cx+22, cy-168); c.closePath(); c.fill();
  }

  /* casas de entramado de madera */
  sembrar(c, 10, 7500, 56, (c,x,y,i) => {
    vetoDeco.push({ x:x-44, y:y-64, w:88, h:84 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+16, 42, 12, 0, 0, 6.283); c.fill();
    c.fillStyle = "#E4DCC8";                          // el muro encalado
    rr(c, x-34, y-30, 68, 46, 2); c.fill();
    c.strokeStyle = "#5A3E22"; c.lineWidth = 4;       // el entramado
    c.beginPath(); c.moveTo(x-34, y-14); c.lineTo(x+34, y-14); c.stroke();
    c.beginPath(); c.moveTo(x-14, y-30); c.lineTo(x-14, y+16); c.stroke();
    c.beginPath(); c.moveTo(x+14, y-30); c.lineTo(x+14, y+16); c.stroke();
    c.beginPath(); c.moveTo(x-34, y-30); c.lineTo(x-14, y-14); c.stroke();
    c.fillStyle = ["#8A4A3C","#6E4526","#7A5C32"][i % 3];   // el tejado a dos aguas
    c.beginPath();
    c.moveTo(x-42, y-30); c.lineTo(x, y-64); c.lineTo(x+42, y-30); c.closePath(); c.fill();
    c.fillStyle = "#3A2416";                          // la puerta
    rr(c, x-7, y-6, 14, 22, 2); c.fill();
  });

  /* el pozo, y aldeanos yendo a lo suyo */
  sembrar(c, 3, 7600, 40, (c,x,y) => {
    vetoDeco.push({ x:x-26, y:y-40, w:52, h:60 });
    c.fillStyle = "rgba(0,0,0,.22)";
    c.beginPath(); c.ellipse(x, y+10, 24, 8, 0, 0, 6.283); c.fill();
    c.fillStyle = "#8A8478";
    c.beginPath(); c.ellipse(x, y, 22, 11, 0, 0, 6.283); c.fill();
    c.fillStyle = "#3A3238";
    c.beginPath(); c.ellipse(x, y-2, 15, 7, 0, 0, 6.283); c.fill();
    c.strokeStyle = "#6E4526"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x-16, y-4); c.lineTo(x-16, y-34); c.stroke();
    c.beginPath(); c.moveTo(x+16, y-4); c.lineTo(x+16, y-34); c.stroke();
    c.fillStyle = "#8A4A3C";
    c.beginPath(); c.moveTo(x-24, y-34); c.lineTo(x, y-48); c.lineTo(x+24, y-34); c.closePath(); c.fill();
    c.strokeStyle = "#5A5248"; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, y-34); c.lineTo(x, y-18); c.stroke();
    c.fillStyle = "#6E4526"; rr(c, x-5, y-18, 10, 8, 1); c.fill();
  });
  sembrar(c, 12, 7700, 24, (c,x,y,i) => {
    /* aldeanos: los mismos monigotes del juego, en pequeño y de espaldas */
    const col = ["#8A5A32","#5A6E8A","#8A4A6A","#6E7A46"][i % 4];
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+11, 8, 3, 0, 0, 6.283); c.fill();
    c.fillStyle = col; rr(c, x-6, y-6, 12, 17, 4); c.fill();
    c.fillStyle = "#E8B08A";
    c.beginPath(); c.arc(x, y-11, 6, 0, 6.283); c.fill();
    c.fillStyle = ["#3A2416","#8A6A3C","#2A1A10"][i % 3];   // el pelo o la caperuza
    c.beginPath(); c.arc(x, y-13, 6, Math.PI, 0); c.fill();
  });
}

/* ---------- Italia ----------
   El Coliseo, la torre inclinada, cipreses y columnas caídas. */
function decoItalia(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<16;i++){
    const x = azEntre(i+13,0,DECO_W), y = azEntre(i+43,0,DECO_H), r = 44+az(i)*62;
    c.beginPath(); c.ellipse(x,y,r,r*.42,i,0,6.283); c.fill();
  }
  /* la vía empedrada, que cruza el mapa */
  c.fillStyle = "rgba(150,138,120,.35)";
  c.fillRect(0, DECO_H*.5-46, DECO_W, 92);
  c.fillStyle = "rgba(110,100,86,.30)";
  for (let x=0;x<DECO_W;x+=34) for (let k=0;k<3;k++)
    rr(c, x+((k%2)?17:0), DECO_H*.5-40+k*30, 28, 24, 4), c.fill();

  /* el Coliseo */
  const col = huecoGrande(7800, 150, 240, DECO_H*.62);
  if (col){
    const [cx, cy] = col;
    vetoDeco.push({ x:cx-140, y:cy-110, w:280, h:180 });
    c.fillStyle = "rgba(0,0,0,.24)";
    c.beginPath(); c.ellipse(cx, cy+56, 136, 26, 0, 0, 6.283); c.fill();
    /* el óvalo de fuera, con las arcadas en dos pisos */
    c.fillStyle = "#D8C8A8";
    c.beginPath(); c.ellipse(cx, cy, 130, 74, 0, 0, 6.283); c.fill();
    c.fillStyle = "#C4B292";
    c.beginPath(); c.ellipse(cx, cy-16, 130, 74, 0, 0, 6.283); c.fill();
    c.fillStyle = "#E4D8BE";
    c.beginPath(); c.ellipse(cx, cy-26, 130, 74, 0, 0, 6.283); c.fill();
    /* la parte derrumbada: media corona más baja */
    c.fillStyle = "#C4B292";
    c.beginPath(); c.ellipse(cx, cy-14, 130, 74, 0, 3.6, 5.9); c.lineTo(cx, cy-14); c.fill();
    c.fillStyle = "#3A3238";                          // la arena de dentro
    c.beginPath(); c.ellipse(cx, cy-20, 88, 46, 0, 0, 6.283); c.fill();
    c.fillStyle = "#C9A46A";
    c.beginPath(); c.ellipse(cx, cy-22, 80, 40, 0, 0, 6.283); c.fill();
    /* las arcadas */
    c.fillStyle = "rgba(60,50,38,.55)";
    for (let k=0;k<18;k++){
      const a = (k/18)*6.283;
      const ax = cx + Math.cos(a)*118, ay = cy - 22 + Math.sin(a)*66;
      if (ay < cy - 40) continue;
      c.beginPath(); c.ellipse(ax, ay, 7, 12, 0, 0, 6.283); c.fill();
      c.beginPath(); c.ellipse(ax, ay-22, 6, 10, 0, 0, 6.283); c.fill();
    }
  }

  /* la torre inclinada */
  const torre = huecoGrande(7900, 110, 240, DECO_H-260);
  if (torre){
    const [tx, ty] = torre;
    vetoDeco.push({ x:tx-70, y:ty-190, w:140, h:220 });
    c.fillStyle = "rgba(0,0,0,.24)";
    c.beginPath(); c.ellipse(tx, ty+16, 46, 14, 0, 0, 6.283); c.fill();
    c.save(); c.translate(tx, ty+16); c.rotate(0.13);      // la inclinación, que es el chiste
    c.fillStyle = "#F2ECDC";
    rr(c, -28, -178, 56, 178, 4); c.fill();
    c.fillStyle = "rgba(0,0,0,.10)"; rr(c, 10, -178, 18, 178, 4); c.fill();
    c.strokeStyle = "#C4B292"; c.lineWidth = 2;           // los pisos de columnitas
    for (let k=1;k<7;k++){
      const yy = -178 + k*25;
      c.beginPath(); c.moveTo(-28, yy); c.lineTo(28, yy); c.stroke();
      c.fillStyle = "rgba(120,108,90,.5)";
      for (let w=0;w<6;w++) c.fillRect(-24+w*9, yy+4, 3, 16);
    }
    c.fillStyle = "#E4D8BE";
    rr(c, -32, -196, 64, 20, 3); c.fill();
    c.restore();
  }

  /* cipreses y columnas caídas */
  sembrar(c, 16, 8000, 40, (c,x,y,i) => {
    if (i % 3 === 2){                                   // columna caída
      c.save(); c.translate(x, y); c.rotate(azEntre(i, -.4, .4));
      c.fillStyle = "rgba(0,0,0,.2)";
      c.beginPath(); c.ellipse(0, 6, 26, 6, 0, 0, 6.283); c.fill();
      c.fillStyle = "#E4DCC8";
      rr(c, -24, -6, 48, 12, 5); c.fill();
      c.fillStyle = "rgba(0,0,0,.12)";
      for (const fx of [-12, 0, 12]) c.fillRect(fx, -6, 2, 12);
      c.restore();
    } else {                                            // ciprés
      vetoDeco.push({ x:x-16, y:y-70, w:32, h:84 });
      c.fillStyle = "rgba(0,0,0,.2)";
      c.beginPath(); c.ellipse(x, y+10, 14, 5, 0, 0, 6.283); c.fill();
      c.fillStyle = "#6E4526"; c.fillRect(x-3, y-4, 6, 14);
      c.fillStyle = ["#2F5A2C","#3E6B36","#254A24"][i % 3];
      c.beginPath();
      c.moveTo(x, y-72); c.quadraticCurveTo(x+15, y-30, x+9, y-2);
      c.lineTo(x-9, y-2); c.quadraticCurveTo(x-15, y-30, x, y-72); c.fill();
    }
  });
}

/* ---------- El Descubrimiento ----------
   La costa: las tres carabelas fondeadas, chozas de los nativos, hogueras,
   tótems y palmeras. */
function decoAmerica(c, E){
  const mar = DECO_MAR ?? (DECO_H - 300);
  c.fillStyle = E.mancha;
  for (let i=0;i<16;i++){
    const x = azEntre(i+17,0,DECO_W), y = azEntre(i+47,0,mar-60), r = 44+az(i)*60;
    c.beginPath(); c.ellipse(x,y,r,r*.42,i,0,6.283); c.fill();
  }
  /* el mar y su orilla de espuma */
  const agua = c.createLinearGradient(0, mar-20, 0, DECO_H);
  agua.addColorStop(0, "#4FA8C8"); agua.addColorStop(1, "#1E6E96");
  c.fillStyle = agua; c.fillRect(0, mar, DECO_W, DECO_H-mar);
  c.fillStyle = "#E8DCB0";
  for (let x=0;x<DECO_W;x+=40){
    c.beginPath(); c.ellipse(x, mar, 30, 12, 0, 0, 6.283); c.fill();
  }
  c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 4;
  for (let k=0;k<3;k++){
    c.beginPath();
    for (let x=0;x<=DECO_W;x+=40)
      c[x?"lineTo":"moveTo"](x, mar+26+k*46 + Math.sin(x/120+k)*7);
    c.stroke();
  }
  /* las tres carabelas fondeadas, ahí como decorado */
  [[0.22, 0.55], [0.44, 0.30], [0.68, 0.62]].forEach(([fx, fy], k) => {
    const x = DECO_W*fx, y = mar + (DECO_H-mar)*fy;
    c.fillStyle = "rgba(0,0,0,.18)";
    c.beginPath(); c.ellipse(x, y+12, 34, 8, 0, 0, 6.283); c.fill();
    c.fillStyle = "#8A5A32";
    c.beginPath();
    c.moveTo(x-30, y-6); c.lineTo(x+30, y-6);
    c.quadraticCurveTo(x+22, y+12, x-18, y+12);
    c.quadraticCurveTo(x-30, y+8, x-30, y-6); c.closePath(); c.fill();
    c.fillStyle = "#C9A46A"; rr(c, x-30, y-20, 16, 14, 3); c.fill();
    c.fillStyle = "#6E4526"; c.fillRect(x+1, y-56, 4, 50);
    c.fillStyle = "#FFF6E1";
    c.beginPath(); c.moveTo(x+3, y-52); c.quadraticCurveTo(x+30, y-36, x+3, y-16); c.closePath(); c.fill();
    c.strokeStyle = "#E2453C"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x+12, y-44); c.lineTo(x+12, y-26); c.stroke();
    c.beginPath(); c.moveTo(x+6, y-36); c.lineTo(x+19, y-36); c.stroke();
  });

  /* la aldea: chozas de paja */
  sembrar(c, 9, 8100, 52, (c,x,y,i) => {
    vetoDeco.push({ x:x-40, y:y-56, w:80, h:74 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+14, 38, 11, 0, 0, 6.283); c.fill();
    c.fillStyle = "#C9A46A";
    c.beginPath(); c.moveTo(x-36, y+14); c.lineTo(x, y-56); c.lineTo(x+36, y+14); c.closePath(); c.fill();
    c.strokeStyle = "rgba(120,90,50,.45)"; c.lineWidth = 2;    // las hojas de la paja
    for (let k=1;k<5;k++){
      const t = k/5;
      c.beginPath(); c.moveTo(x-36*t, y+14-70*(1-t)+0); c.lineTo(x+36*t, y+14-70*(1-t)); c.stroke();
    }
    c.fillStyle = "#5A3E22";
    c.beginPath();
    c.moveTo(x-10, y+14); c.lineTo(x-10, y-6); c.quadraticCurveTo(x, y-16, x+10, y-6);
    c.lineTo(x+10, y+14); c.closePath(); c.fill();
  }, mar - 90);

  /* hogueras y palmeras en la playa */
  sembrar(c, 14, 8200, 30, (c,x,y,i) => {
    if (i % 2 === 0){                                    // palmera
      vetoDeco.push({ x:x-26, y:y-64, w:52, h:78 });
      c.fillStyle = "rgba(0,0,0,.2)";
      c.beginPath(); c.ellipse(x, y+10, 16, 5, 0, 0, 6.283); c.fill();
      c.strokeStyle = "#8A6A3C"; c.lineWidth = 7; c.lineCap = "round";
      c.beginPath(); c.moveTo(x, y+8); c.quadraticCurveTo(x-8, y-24, x-2, y-48); c.stroke();
      c.fillStyle = "#3E7A4E";
      for (let k=0;k<6;k++){
        const a = -Math.PI/2 + (k-2.5)*0.5;
        c.save(); c.translate(x-2, y-48); c.rotate(a);
        c.beginPath(); c.ellipse(0, -18, 7, 20, 0, 0, 6.283); c.fill();
        c.restore();
      }
    } else {                                             // hoguera
      c.fillStyle = "#5A5248";
      for (let k=0;k<7;k++){
        const a = k*.9;
        c.beginPath(); c.ellipse(x+Math.cos(a)*20, y+Math.sin(a)*10, 6, 4, a, 0, 6.283); c.fill();
      }
      c.strokeStyle = "#6A4E30"; c.lineWidth = 5; c.lineCap = "round";
      c.beginPath(); c.moveTo(x-11, y+4); c.lineTo(x+8, y-11); c.stroke();
      c.beginPath(); c.moveTo(x+11, y+4); c.lineTo(x-8, y-11); c.stroke();
      c.fillStyle = "#FF8A2B";
      c.beginPath();
      c.moveTo(x-9, y-3); c.quadraticCurveTo(x-3, y-20, x, y-30);
      c.quadraticCurveTo(x+4, y-18, x+9, y-3); c.closePath(); c.fill();
      c.fillStyle = "#FFD84D";
      c.beginPath();
      c.moveTo(x-4, y-3); c.quadraticCurveTo(x, y-13, x+1, y-19);
      c.quadraticCurveTo(x+3, y-11, x+4, y-3); c.closePath(); c.fill();
    }
  }, mar - 40);
}

/* ---------- La Prehistoria ----------
   Volcanes al fondo, helechos gigantes, huesos a medio enterrar, pozos de brea
   y una cueva con pinturas rupestres. Todo lo que se dibuja aquí es adorno: lo
   único de la prehistoria con lo que se juega es el dinosaurio, que es un
   trasto normal y vive en el motor. */
function decoPrehistoria(c, E){
  /* tierra revuelta: manchas de barro y ceniza */
  c.fillStyle = E.mancha;
  for (let i=0;i<22;i++){
    const x = azEntre(i+7,0,DECO_W), y = azEntre(i+37,0,DECO_H), r = 40+az(i)*55;
    c.beginPath(); c.ellipse(x,y,r,r*.40,i,0,6.283); c.fill();
  }
  /* Grietas de tierra seca. Cortas y tenues a propósito: con tramos largos los
     quiebros se cerraban solos y el suelo se llenaba de triángulos. */
  c.strokeStyle = "rgba(40,28,18,.09)"; c.lineWidth = 2;
  for (let i=0;i<34;i++){
    const x = azEntre(i+300,0,DECO_W), y = azEntre(i+900,0,DECO_H);
    const a = azEntre(i+55, 0, 6.283);
    c.beginPath(); c.moveTo(x,y);
    let px = x, py = y;
    for (let k=0;k<3;k++){
      px += Math.cos(a + azEntre(i*9+k,-.5,.5)) * 26;
      py += Math.sin(a + azEntre(i*9+k,-.5,.5)) * 26;
      c.lineTo(px, py);
    }
    c.stroke();
  }

  /* ---- los volcanes del fondo, humeando ---- */
  const volcan = (x, y, k) => {
    vetoDeco.push({ x:x-150*k, y:y-190*k, w:300*k, h:230*k });
    c.save(); c.translate(x, y); c.scale(k, k);
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(0, 34, 160, 26, 0, 0, 6.283); c.fill();
    c.fillStyle = "#4A3E36";                                  // la ladera
    c.beginPath(); c.moveTo(-150, 34); c.lineTo(-34, -140);
    c.lineTo(34, -140); c.lineTo(150, 34); c.closePath(); c.fill();
    c.fillStyle = "#5C4E42";                                  // la cara iluminada
    c.beginPath(); c.moveTo(0, -140); c.lineTo(34, -140); c.lineTo(150, 34); c.lineTo(60, 34); c.closePath(); c.fill();
    c.fillStyle = "#E2453C";                                  // el cráter
    c.beginPath(); c.ellipse(0, -140, 34, 11, 0, 0, 6.283); c.fill();
    c.fillStyle = "#FFC53D";
    c.beginPath(); c.ellipse(0, -141, 20, 6, 0, 0, 6.283); c.fill();
    /* dos coladas de lava bajando */
    c.strokeStyle = "#D8452E"; c.lineWidth = 9; c.lineCap = "round";
    c.beginPath(); c.moveTo(-10,-136); c.quadraticCurveTo(-52,-60,-72,32); c.stroke();
    c.beginPath(); c.moveTo(12,-136); c.quadraticCurveTo(48,-70,58,32); c.stroke();
    c.strokeStyle = "#FFB020"; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(-10,-136); c.quadraticCurveTo(-52,-60,-72,32); c.stroke();
    /* la humareda */
    c.fillStyle = "rgba(190,180,172,.30)";
    for (let i=0;i<5;i++){
      const yy = -160 - i*40, rr0 = 26 + i*15;
      c.beginPath(); c.arc(azEntre(i+k*10,-22,22), yy, rr0, 0, 6.283); c.fill();
    }
    c.restore();
  };
  /* Los volcanes buscan sitio: puestos a dedo, uno acababa dentro de un patio.
     Van en la mitad de arriba, que es donde queda "el fondo". */
  for (let v=0; v<2; v++){
    const p = huecoGrande(6000 + v*77, 175, 280, DECO_H * .5);
    if (p) volcan(p[0], p[1], v ? .78 : 1);
  }

  /* ---- los helechos y las cícadas gigantes ---- */
  sembrar(c, 16, 6100, 46, (c,x,y,i) => {
    vetoDeco.push({ x:x-42, y:y-70, w:84, h:90 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+12, 30, 9, 0, 0, 6.283); c.fill();
    c.fillStyle = "#6A5236";
    c.fillRect(x-4, y-16, 8, 28);                              // el tronquito
    /* siete frondas abiertas en abanico, cada una con sus foliolos */
    for (let k=0;k<7;k++){
      const a = -Math.PI/2 + (k-3) * .42 + az(i*7+k)*.1;
      const L = 40 + az(i*5+k)*22;
      const ex = x + Math.cos(a)*L, ey = y - 14 + Math.sin(a)*L;
      c.strokeStyle = ["#3E6B36","#4C7C3C","#2F5A2C"][(i+k)%3];
      c.lineWidth = 4.5; c.lineCap = "round";
      c.beginPath(); c.moveTo(x, y-14);
      c.quadraticCurveTo(x + Math.cos(a)*L*.6, y-14 + Math.sin(a)*L*.6 - 10, ex, ey);
      c.stroke();
      c.lineWidth = 2;
      for (let f=1; f<=4; f++){                                // los foliolos
        const t = f/5;
        const px = x + (ex-x)*t, py = (y-14) + (ey-(y-14))*t - Math.sin(t*Math.PI)*8;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.sin(a)*9, py + Math.cos(a)*9); c.stroke();
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.sin(a)*9, py - Math.cos(a)*9); c.stroke();
      }
    }
  });

  /* ---- los pozos de brea: negros, espesos y con burbujas ---- */
  sembrar(c, 5, 6200, 60, (c,x,y,i) => {
    vetoDeco.push({ x:x-58, y:y-34, w:116, h:68 });
    c.fillStyle = "#4A3A26";                                   // el borde de barro
    c.beginPath(); c.ellipse(x, y, 56, 30, az(i), 0, 6.283); c.fill();
    c.fillStyle = "#17120E";
    c.beginPath(); c.ellipse(x, y, 47, 24, az(i), 0, 6.283); c.fill();
    c.fillStyle = "rgba(255,255,255,.07)";                     // el brillo aceitoso
    c.beginPath(); c.ellipse(x-13, y-7, 17, 7, -.4, 0, 6.283); c.fill();
    for (let k=0;k<3;k++){                                     // burbujas reventadas
      const bx = x + azEntre(i*4+k, -30, 30), by = y + azEntre(i*4+k+9, -14, 14);
      c.strokeStyle = "rgba(120,110,100,.35)"; c.lineWidth = 2;
      c.beginPath(); c.arc(bx, by, 4 + az(i+k)*4, 0, 6.283); c.stroke();
    }
  });

  /* ---- esqueletos a medio enterrar: costillar, columna y calavera ---- */
  sembrar(c, 4, 6300, 70, (c,x,y,i) => {
    vetoDeco.push({ x:x-110, y:y-40, w:220, h:80 });
    c.save(); c.translate(x, y); c.rotate(azEntre(i, -.35, .35));
    c.strokeStyle = "#E4DCC8"; c.lineCap = "round";
    c.lineWidth = 8;
    c.beginPath(); c.moveTo(-96, 0);                            // la columna
    c.quadraticCurveTo(0, -14, 88, 4); c.stroke();
    c.lineWidth = 5.5;
    for (let k=0;k<7;k++){                                      // las costillas
      const t = k/6, cx = -72 + t*128, cy = -10 + Math.sin(t*Math.PI)*-4;
      c.beginPath(); c.moveTo(cx, cy);
      c.quadraticCurveTo(cx-6, cy+26, cx+4, cy+38); c.stroke();
    }
    c.fillStyle = "#E4DCC8";                                    // la calavera
    c.beginPath(); c.ellipse(-108, -2, 22, 13, -.2, 0, 6.283); c.fill();
    c.beginPath(); c.ellipse(-126, 2, 11, 7, -.2, 0, 6.283); c.fill();   // el hocico
    c.fillStyle = "#6A6252";
    c.beginPath(); c.arc(-110, -6, 4, 0, 6.283); c.fill();      // la cuenca del ojo
    c.restore();
  });

  /* ---- las huellas: tres dedos, en fila y alternando pie ---- */
  sembrar(c, 7, 6400, 40, (c,x,y,i) => {
    const a = azEntre(i, 0, 6.283);
    c.fillStyle = "rgba(50,36,22,.30)";
    for (let k=0;k<5;k++){
      const px = x + Math.cos(a)*k*54, py = y + Math.sin(a)*k*54 + (k%2 ? 16 : -16);
      c.save(); c.translate(px, py); c.rotate(a);
      c.beginPath(); c.ellipse(0, 0, 15, 11, 0, 0, 6.283); c.fill();
      for (const d of [-.6, 0, .6]){                            // los tres dedos
        c.beginPath();
        c.ellipse(Math.cos(d)*17, Math.sin(d)*17, 7, 5, d, 0, 6.283); c.fill();
      }
      c.restore();
    }
  });

  /* ---- el nido con los huevos ---- */
  sembrar(c, 3, 6500, 44, (c,x,y,i) => {
    vetoDeco.push({ x:x-44, y:y-30, w:88, h:60 });
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x, y+6, 40, 14, 0, 0, 6.283); c.fill();
    c.strokeStyle = "#7A5C34"; c.lineWidth = 5;                 // las ramas del nido
    for (let k=0;k<9;k++){
      const a = k*.7;
      c.beginPath();
      c.ellipse(x, y, 36 - (k%3)*3, 17 - (k%3)*2, a, a, a + 2.4); c.stroke();
    }
    c.fillStyle = "#EDE0C4";                                    // tres huevos
    for (const [ex, ey, r] of [[-12,-2,11],[10,-4,12],[0,7,10]]){
      c.beginPath(); c.ellipse(x+ex, y+ey, r*.78, r, .2, 0, 6.283); c.fill();
      c.fillStyle = "rgba(160,140,110,.35)";
      c.beginPath(); c.arc(x+ex+3, y+ey+3, r*.3, 0, 6.283); c.fill();
      c.fillStyle = "#EDE0C4";
    }
  });

  /* ---- la fogata: leños en pirámide y un fuego siempre distinto ---- */
  sembrar(c, 4, 6600, 40, (c,x,y,i) => {
    vetoDeco.push({ x:x-34, y:y-40, w:68, h:66 });
    c.fillStyle = "#5A5248";                                    // el círculo de piedras
    for (let k=0;k<8;k++){
      const a = k*.785;
      c.beginPath(); c.ellipse(x+Math.cos(a)*26, y+Math.sin(a)*13, 7, 5, a, 0, 6.283); c.fill();
    }
    c.strokeStyle = "#6A4E30"; c.lineWidth = 6; c.lineCap = "round";
    c.beginPath(); c.moveTo(x-14, y+6); c.lineTo(x+10, y-14); c.stroke();
    c.beginPath(); c.moveTo(x+14, y+6); c.lineTo(x-10, y-14); c.stroke();
    c.fillStyle = "#FF8A2B";                                    // la llama
    c.beginPath();
    c.moveTo(x-11, y-2); c.quadraticCurveTo(x-4, y-22, x, y-34);
    c.quadraticCurveTo(x+5, y-20, x+11, y-2); c.closePath(); c.fill();
    c.fillStyle = "#FFD84D";
    c.beginPath();
    c.moveTo(x-5, y-2); c.quadraticCurveTo(x-1, y-14, x+1, y-22);
    c.quadraticCurveTo(x+4, y-12, x+5, y-2); c.closePath(); c.fill();
  });

  /* ---- la cueva pintada: la roca, la boca oscura y las figuras ocres ---- */
  const cueva = (cx, cy) => {
    vetoDeco.push({ x:cx-130, y:cy-120, w:260, h:170 });
    c.fillStyle = "rgba(0,0,0,.22)";
    c.beginPath(); c.ellipse(cx, cy+42, 128, 22, 0, 0, 6.283); c.fill();
    c.fillStyle = "#6E6254";                                    // el peñasco
    c.beginPath();
    c.moveTo(cx-126, cy+42); c.lineTo(cx-96, cy-64); c.lineTo(cx-30, cy-110);
    c.lineTo(cx+52, cy-98); c.lineTo(cx+112, cy-30); c.lineTo(cx+126, cy+42);
    c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,.07)";                      // la cara con luz
    c.beginPath();
    c.moveTo(cx-30, cy-110); c.lineTo(cx+52, cy-98); c.lineTo(cx+112, cy-30);
    c.lineTo(cx+40, cy-40); c.closePath(); c.fill();
    c.fillStyle = "#1A1410";                                    // la boca
    c.beginPath();
    c.moveTo(cx-34, cy+42); c.quadraticCurveTo(cx-30, cy-30, cx+4, cy-32);
    c.quadraticCurveTo(cx+38, cy-30, cx+34, cy+42); c.closePath(); c.fill();
    /* las pinturas rupestres: manos en negativo, bisontes y cazadores palotes */
    c.fillStyle = "rgba(178,86,44,.75)";
    for (const [hx, hy] of [[-88,-32],[-72,-14],[-96,-8]]){     // manos sopladas
      c.save(); c.translate(cx+hx, cy+hy); c.scale(.85,.85);
      c.beginPath(); c.ellipse(0, 4, 7, 9, 0, 0, 6.283); c.fill();
      for (const d of [-.9,-.45,0,.45,.9]){
        c.beginPath(); c.ellipse(Math.sin(d)*7, -6 - Math.cos(d)*5, 2.2, 5, d, 0, 6.283); c.fill();
      }
      c.restore();
    }
    /* un bisonte de perfil, gordo por delante y flaco por detrás */
    c.save(); c.translate(cx+54, cy-52);
    c.beginPath();
    c.moveTo(-22,4); c.quadraticCurveTo(-20,-12,-6,-14);
    c.quadraticCurveTo(10,-16,20,-6); c.lineTo(24,-10); c.lineTo(26,0);
    c.quadraticCurveTo(14,8,-4,8); c.closePath(); c.fill();
    c.fillRect(-18,6,3,10); c.fillRect(-8,6,3,10); c.fillRect(8,6,3,9); c.fillRect(16,6,3,9);
    c.strokeStyle = "rgba(178,86,44,.75)"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(22,-10); c.lineTo(28,-16); c.stroke();   // el cuerno
    c.restore();
    /* dos cazadores palote con la lanza en alto */
    c.strokeStyle = "rgba(40,30,24,.7)"; c.lineWidth = 2.6; c.lineCap = "round";
    for (const [px, py] of [[-82,-54],[-62,-48]]){
      c.save(); c.translate(cx+px, cy+py);
      c.beginPath(); c.arc(0,-14,3.4,0,6.283); c.stroke();
      c.beginPath(); c.moveTo(0,-11); c.lineTo(0,2); c.stroke();
      c.beginPath(); c.moveTo(0,-8); c.lineTo(-7,-14); c.stroke();
      c.beginPath(); c.moveTo(0,-8); c.lineTo(8,-16); c.stroke();
      c.beginPath(); c.moveTo(0,2); c.lineTo(-6,12); c.stroke();
      c.beginPath(); c.moveTo(0,2); c.lineTo(6,12); c.stroke();
      c.beginPath(); c.moveTo(10,-22); c.lineTo(6,-10); c.stroke();  // la lanza
      c.restore();
    }
  };
  const sitioCueva = huecoGrande(6800, 145, 240, DECO_H - 170);
  if (sitioCueva) cueva(sitioCueva[0], sitioCueva[1]);

  /* ---- y peñascos sueltos por todas partes ---- */
  sembrar(c, 20, 6700, 22, (c,x,y,i) => {
    c.fillStyle = "rgba(0,0,0,.18)";
    c.beginPath(); c.ellipse(x, y+7, 15, 5, 0, 0, 6.283); c.fill();
    c.fillStyle = ["#7A7264","#8A8172","#655D52"][i % 3];
    c.beginPath();
    for (let k=0;k<7;k++){
      const a = k * .898, r = 12 + az(i*3+k)*8;
      c[k ? "lineTo" : "moveTo"](x + Math.cos(a)*r, y + Math.sin(a)*r*.75);
    }
    c.closePath(); c.fill();
  });
}

/* ---------- El Volcán: ceniza, lava y el cráter ---------- */
function decoVolcan(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<20;i++){
    const x = azEntre(i+13,0,DECO_W), y = azEntre(i+67,0,DECO_H), r = 50+az(i)*70;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* ríos de lava: el borde oscuro y el chorro brillante por dentro */
  const rio = (pts, ancho) => {
    c.lineJoin = "round"; c.lineCap = "round";
    for (const [w, col] of [[ancho+14, "#5A1E10"], [ancho, "#E2453C"],
                            [ancho*.55, "#FF9E3D"], [ancho*.25, "#FFE066"]]){
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      pts.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y));
      c.stroke();
    }
  };
  rio([[0,430],[380,470],[760,400],[1150,470],[1500,420],[1900,480],[2300,430],[DECO_W,470]], 30);
  rio([[0,1260],[420,1200],[820,1290],[1240,1210],[1660,1300],[2100,1230],[DECO_W,1280]], 24);
  rio([[1290,470],[1310,760],[1280,1000],[1300,1210]], 18);

  /* el cráter, en el medio: labio de roca y la boca al rojo */
  const cx = 1300, cy = 850;
  vetoDeco.push({ x:cx-260, y:cy-200, w:520, h:400 });
  c.fillStyle = "#2A2226";
  c.beginPath(); c.ellipse(cx, cy, 240, 175, 0, 0, 6.283); c.fill();
  c.fillStyle = "#4A3A36";
  c.beginPath(); c.ellipse(cx, cy-8, 210, 150, 0, 0, 6.283); c.fill();
  for (const [r, col] of [[150, "#7A2A18"], [110, "#E2453C"], [70, "#FF9E3D"], [34, "#FFE066"]]){
    c.fillStyle = col;
    c.beginPath(); c.ellipse(cx, cy, r, r*.7, 0, 0, 6.283); c.fill();
  }

  /* rocas volcánicas y fumarolas */
  sembrar(c, 14, 5601, 26, (c,x,y,i) => {
    c.fillStyle = "rgba(0,0,0,.3)";
    c.beginPath(); c.ellipse(x, y+10, 16, 5, 0, 0, 6.283); c.fill();
    c.fillStyle = ["#4A424A","#3A343C","#5A5058"][i % 3];
    c.beginPath();
    for (let k=0;k<6;k++){
      const a = k*1.047, r = 13 + az(i*4+k)*7;
      c[k?"lineTo":"moveTo"](x + Math.cos(a)*r, y + Math.sin(a)*r*.8);
    }
    c.closePath(); c.fill();
    c.fillStyle = "rgba(255,158,61,.4)";
    c.beginPath(); c.arc(x-3, y-3, 3.5, 0, 6.283); c.fill();
  });
  sembrar(c, 8, 5701, 34, (c,x,y,i) => {
    c.fillStyle = "rgba(255,239,226,.13)";
    for (let k=0;k<4;k++){
      c.beginPath();
      c.arc(x + Math.sin(k*1.7 + i)*13, y - k*24, 13 + k*7, 0, 6.283);
      c.fill();
    }
  });
}

/* ---------- La Luna: cráteres, la bandera y el módulo ---------- */
function decoLuna(c, E){
  /* cráteres: un anillo claro y el hueco en sombra. Es lo único que hay que
     hacer bien aquí — el resto del suelo es polvo. */
  const crater = (x, y, r) => {
    c.fillStyle = "#A2A2AA";
    c.beginPath(); c.ellipse(x, y, r, r*.72, 0, 0, 6.283); c.fill();
    c.fillStyle = "#6E6E78";
    c.beginPath(); c.ellipse(x, y+2, r*.82, r*.58, 0, 0, 6.283); c.fill();
    c.fillStyle = "rgba(255,255,255,.13)";
    c.beginPath(); c.ellipse(x - r*.25, y - r*.28, r*.42, r*.24, -.4, 0, 6.283); c.fill();
  };
  for (let i=0;i<26;i++)
    crater(azEntre(i+2,60,DECO_W-60), azEntre(i+91,60,DECO_H-60), 26 + az(i)*70);
  c.fillStyle = E.mancha;
  for (let i=0;i<14;i++){
    const x = azEntre(i+23,0,DECO_W), y = azEntre(i+77,0,DECO_H), r = 50+az(i)*70;
    c.beginPath(); c.ellipse(x,y,r,r*.4,i,0,6.283); c.fill();
  }

  /* la Tierra saliendo por el horizonte, arriba a la derecha */
  const tx = 2180, ty = 240;
  vetoDeco.push({ x:tx-180, y:ty-180, w:360, h:360 });
  c.fillStyle = "rgba(90,150,220,.2)";
  c.beginPath(); c.arc(tx, ty, 168, 0, 6.283); c.fill();
  c.fillStyle = "#2E6FD9";
  c.beginPath(); c.arc(tx, ty, 140, 0, 6.283); c.fill();
  c.fillStyle = "#4FB84A";
  for (const [dx,dy,rx,ry,g] of [[-40,-30,52,34,.4],[36,20,44,30,-.3],[-10,66,34,20,.2],[70,-58,26,18,0]]){
    c.beginPath(); c.ellipse(tx+dx, ty+dy, rx, ry, g, 0, 6.283); c.fill();
  }
  c.fillStyle = "rgba(255,255,255,.35)";
  c.beginPath(); c.ellipse(tx-24, ty-72, 60, 16, -.3, 0, 6.283); c.fill();
  c.beginPath(); c.ellipse(tx+36, ty+78, 52, 14, .25, 0, 6.283); c.fill();
  c.fillStyle = "rgba(255,255,255,.22)";
  c.beginPath(); c.arc(tx - 46, ty - 46, 44, 0, 6.283); c.fill();

  /* el módulo lunar, con sus patas y la escalerilla */
  sembrar(c, 1, 5801, 90, (c,x,y) => {
    vetoDeco.push({ x:x-80, y:y-100, w:160, h:150 });
    c.fillStyle = "rgba(0,0,0,.3)";
    c.beginPath(); c.ellipse(x, y+38, 72, 18, 0, 0, 6.283); c.fill();
    c.strokeStyle = "#8A8478"; c.lineWidth = 7;
    for (const dx of [-58, 58]){
      c.beginPath(); c.moveTo(x + dx*.45, y-6); c.lineTo(x + dx, y+34); c.stroke();
      c.fillStyle = "#A8A29A"; c.beginPath(); c.ellipse(x+dx, y+36, 13, 5, 0, 0, 6.283); c.fill();
    }
    c.fillStyle = "#C9A46A"; rr(c, x-46, y-30, 92, 40, 6); c.fill();   // la falda dorada
    c.fillStyle = "#9A9182";                                           // el habitáculo
    c.beginPath();
    c.moveTo(x-34, y-30); c.lineTo(x-26, y-78); c.lineTo(x+26, y-78); c.lineTo(x+34, y-30);
    c.closePath(); c.fill();
    c.fillStyle = "#2A3A4A";
    c.beginPath(); c.arc(x-12, y-58, 8, 0, 6.283); c.fill();
    c.beginPath(); c.arc(x+12, y-58, 8, 0, 6.283); c.fill();
    c.strokeStyle = "#8A8478"; c.lineWidth = 3;
    for (let k=0;k<4;k++){ c.beginPath(); c.moveTo(x-8, y+2+k*8); c.lineTo(x+8, y+2+k*8); c.stroke(); }
  });

  /* la bandera tiesa, que en la Luna no ondea */
  sembrar(c, 1, 5901, 40, (c,x,y) => {
    c.fillStyle = "rgba(0,0,0,.25)";
    c.beginPath(); c.ellipse(x, y+10, 12, 4, 0, 0, 6.283); c.fill();
    c.fillStyle = "#EFE9D4"; c.fillRect(x-2, y-64, 4, 74);
    c.fillStyle = "#E2453C"; c.fillRect(x+2, y-64, 46, 30);
    c.fillStyle = "#FFEFE2"; c.fillRect(x+2, y-54, 46, 4);
    c.fillRect(x+2, y-44, 46, 4);
  });

  /* huellas de bota, que es lo primero que uno busca en la Luna */
  sembrar(c, 16, 6001, 16, (c,x,y,i) => {
    c.fillStyle = "rgba(60,60,68,.5)";
    for (let k=0;k<4;k++){
      const a = az(i)*6.283;
      c.save();
      c.translate(x + Math.cos(a)*k*22, y + Math.sin(a)*k*22);
      c.rotate(a);
      rr(c, -5, -8, 10, 16, 4); c.fill();
      c.restore();
    }
  });
}

/* ---- la pista de una carrera ----
   Se dibuja con los MISMOS puntos que cuenta el motor. Si se dibujara aparte,
   la pista que ves y la que te suma vuelta acabarían siendo dos cosas. */
function drawCircuito(){
  const c = G.esc.circuito;
  if (!c || !c.length) return;
  const cerrado = pts => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= pts.length; i++){
      const [x0, y0] = pts[i % pts.length];
      const [x1, y1] = pts[(i + 1) % pts.length];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.closePath();
  };
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(20,14,20,.35)"; ctx.lineWidth = 210;  // la sombra del asfalto
  cerrado(c); ctx.stroke();
  ctx.strokeStyle = "#4A4A52"; ctx.lineWidth = 190;
  cerrado(c); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 5; // la raya del medio
  ctx.setLineDash([46, 52]);
  cerrado(c); ctx.stroke();
  ctx.setLineDash([]);

  /* el siguiente punto de paso, marcado: sin esto en un mapa grande no sabes
     para dónde ir */
  const r = G.player?.carrera;
  if (r && !G.over){
    const [hx, hy] = c[r.hito % c.length];
    const pulso = REDUCED ? 1 : 1 + Math.sin(G.t * 5) * .08;
    ctx.strokeStyle = "#5CE1EA"; ctx.lineWidth = 7;
    ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.arc(hx, hy, 60 * pulso, 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* Los topes de los dos bordes. Lo que son cambia con el sitio: el motor solo
     sabe que hay un ancho de pista, y aquí se decide si eso es una valla, unos
     conos o un montón de piedras. */
  dibujarTopes(c);

  /* Las cajas de ítem. Las que alguien acaba de reventar se dibujan en
     fantasma con su cuenta atrás: así sabes que ahí va a volver a haber una. */
  for (const caja of G.cajas || []){
    const flota = Math.sin(G.t * 2 + caja.id) * 6;
    if (caja.listo > 0){
      ctx.globalAlpha = .2;
      ctx.strokeStyle = "#FFC53D"; ctx.lineWidth = 3;
      rr(ctx, caja.x - 20, caja.y - 20, 40, 40, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(caja.x, caja.y + 26, 20, 7, 0, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(caja.x, caja.y + flota);
    ctx.globalAlpha = .9;
    ctx.fillStyle = "#FFEFE2"; rr(ctx, -23, -23, 46, 46, 9); ctx.fill();
    ctx.strokeStyle = "#FFC53D"; ctx.lineWidth = 5;
    rr(ctx, -23, -23, 46, 46, 9); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#E2453C";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("?", 0, 2);
    ctx.restore();
  }

  /* la meta a cuadros, atravesada en el punto 0 */
  const [mx, my] = c[0], [sx, sy] = c[1] || c[0];
  const ang = Math.atan2(sy - my, sx - mx) + Math.PI / 2;
  ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
  for (let f=0; f<8; f++) for (let k=0; k<2; k++){
    ctx.fillStyle = (f + k) % 2 ? "#FFEFE2" : "#2A1226";
    ctx.fillRect(-96 + f*24, -26 + k*26, 24, 26);
  }
  ctx.restore();
}

/** Un tope cada tantos px a lo largo de los dos bordes de la pista.

    En fácil no hay: de la pista se sale y se vuelve. Dibujarlos igual sería
    mentir sobre lo que va a pasar cuando llegues al borde. */
function dibujarTopes(c){
  if (!dificultadDe(G.reglas).topes) return;
  const V = visualDe(G.esc.id);
  const cual = V.topes || "conos";
  const media = ANCHO_PISTA / 2;
  let sobra = 0;
  for (let i = 0; i < c.length; i++){
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    const dx = bx - ax, dy = by - ay, largo = Math.hypot(dx, dy) || 1;
    const nx = -dy / largo, ny = dx / largo;         // la perpendicular
    const cada = 62;
    for (let d = sobra; d < largo; d += cada){
      const px = ax + dx * (d / largo), py = ay + dy * (d / largo);
      for (const lado of [-1, 1])
        unTope(cual, px + nx * media * lado, py + ny * media * lado,
               Math.atan2(dy, dx), (i * 97 + d) | 0);
    }
    sobra = (sobra - largo) % cada + cada;
  }
}

function unTope(cual, x, y, ang, i){
  ctx.save(); ctx.translate(x, y);
  if (cual === "valla"){                              // guardarraíl de carretera
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(-32, 4, 64, 5);
    ctx.fillStyle = "#8A8478"; ctx.fillRect(-3, -6, 6, 12);
    ctx.fillStyle = "#C9C2B8"; rr(ctx, -32, -10, 64, 7, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillRect(-32, -10, 64, 2);
  } else if (cual === "conos"){
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 8, 12, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#E2453C";
    ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(0, -18); ctx.lineTo(10, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#FFEFE2"; ctx.fillRect(-6.5, -4, 13, 5);
  } else if (cual === "piedras"){
    ctx.rotate(az(i) * 3);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 7, 13, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = ["#8A8478","#9A9182","#736D62"][i % 3];
    ctx.beginPath();
    for (let k = 0; k < 6; k++){
      const a = k * 1.047, r = 11 + az(i * 3 + k) * 6;
      ctx[k ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r * .8);
    }
    ctx.closePath(); ctx.fill();
  } else if (cual === "huesos"){                     // fémures clavados en la tierra
    ctx.rotate(az(i) * .6 - .3);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 8, 13, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#E4DCC8";
    /* un hueso es una caña con dos cabezas: dos círculos arriba, dos abajo */
    ctx.beginPath(); ctx.arc(-5, -18, 5.5, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -20, 5.5, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(-4, 4, 5, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(5, 5, 5, 0, 6.283); ctx.fill();
    rr(ctx, -4.5, -18, 9, 24, 4); ctx.fill();
    ctx.fillStyle = "rgba(150,138,112,.35)";
    ctx.fillRect(-4.5, -8, 3, 14);
  } else if (cual === "cantos"){                      // cantos rodados del río
    ctx.rotate(az(i) * 3);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(0, 7, 14, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = ["#9A9184","#8A8478","#B0A89A"][i % 3];
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath(); ctx.ellipse(-4, -3, 5, 3, -.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#5E7A46";                          // el musgo del canto
    ctx.beginPath(); ctx.ellipse(5, 3, 5, 3, .3, 0, 6.283); ctx.fill();
  } else if (cual === "rejas"){                       // reja de recinto
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(0, 8, 13, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#5A6E4A";
    ctx.fillRect(-14, -18, 3, 26); ctx.fillRect(11, -18, 3, 26);
    ctx.fillStyle = "#7A8E5A";
    for (let k = 0; k < 4; k++) ctx.fillRect(-11, -16 + k*7, 22, 2.5);
    ctx.fillStyle = "#5A6E4A"; ctx.fillRect(-14, -21, 28, 3);
  } else if (cual === "bombillas"){                   // poste con bombillas de feria
    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.beginPath(); ctx.ellipse(0, 8, 9, 3.4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#E4DCC8"; ctx.fillRect(-2, -22, 4, 30);
    const enc = Math.sin(G.t * 3 + i * 1.7) > 0;
    for (let k = 0; k < 3; k++){
      ctx.fillStyle = enc ? ["#FFD84D","#FF6B90","#5CE1EA"][k] : "rgba(180,170,190,.5)";
      ctx.beginPath(); ctx.arc((k - 1) * 8, -24, 3.6, 0, 6.283); ctx.fill();
    }
  } else if (cual === "bidones"){                     // bidones de la nave
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(0, 9, 12, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = ["#6E7A8E","#5A6678","#7E8A9E"][i % 3];
    rr(ctx, -10, -14, 20, 24, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.16)"; rr(ctx, -10, -14, 6, 24, 3); ctx.fill();
    ctx.fillStyle = "#FFB020"; ctx.fillRect(-10, -6, 20, 4);
    ctx.fillStyle = "#C9C2D8";
    ctx.beginPath(); ctx.ellipse(0, -14, 10, 3.4, 0, 0, 6.283); ctx.fill();
  } else if (cual === "vallaObra"){                   // la valla naranja de obra
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 8, 14, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#5A5248";
    ctx.fillRect(-2, -4, 4, 12);
    ctx.fillStyle = "#FF7A1A"; rr(ctx, -15, -14, 30, 11, 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)";           // las rayas
    for (let k = 0; k < 3; k++){
      ctx.save(); ctx.beginPath(); ctx.rect(-15, -14, 30, 11); ctx.clip();
      ctx.beginPath();
      ctx.moveTo(-14 + k*11, -3); ctx.lineTo(-8 + k*11, -14);
      ctx.lineTo(-4 + k*11, -14); ctx.lineTo(-10 + k*11, -3);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  } else if (cual === "empalizada"){                  // estacas puntiagudas
    ctx.rotate(az(i) * .3 - .15);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 8, 9, 3.5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = ["#8A6A3C","#7A5C32","#9A7A46"][i % 3];
    ctx.beginPath();
    ctx.moveTo(-5, 8); ctx.lineTo(-5, -14); ctx.lineTo(0, -22);
    ctx.lineTo(5, -14); ctx.lineTo(5, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.fillRect(1, -14, 4, 22);
    ctx.strokeStyle = "#5A4526"; ctx.lineWidth = 2;    // la cuerda que las ata
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(6, -4); ctx.stroke();
  } else if (cual === "columnas"){                    // columnitas romanas
    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.beginPath(); ctx.ellipse(0, 9, 11, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#E4DCC8";
    rr(ctx, -8, 4, 16, 5, 1); ctx.fill();              // la base
    rr(ctx, -5, -16, 10, 20, 1); ctx.fill();           // el fuste
    ctx.fillStyle = "rgba(0,0,0,.12)";                 // las estrías
    for (const fx of [-2.5, 0.5]) ctx.fillRect(fx, -16, 1.5, 20);
    ctx.fillStyle = "#F2ECDC";
    rr(ctx, -8, -20, 16, 5, 1); ctx.fill();            // el capitel
  } else if (cual === "totems"){                      // tótems tallados
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 8, 10, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#8A5A32";
    rr(ctx, -7, -22, 14, 30, 3); ctx.fill();
    const cols = ["#E2453C","#FFD84D","#5CE1EA"];
    for (let k = 0; k < 3; k++){                       // las caras pintadas
      ctx.fillStyle = cols[(i + k) % 3];
      ctx.fillRect(-7, -20 + k*9, 14, 3);
      ctx.fillStyle = "#2A1A10";
      ctx.beginPath(); ctx.arc(-3, -15 + k*9, 1.3, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -15 + k*9, 1.3, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = "#C9A46A";                         // las alas del remate
    ctx.beginPath(); ctx.moveTo(-7, -22); ctx.lineTo(-14, -26); ctx.lineTo(-7, -18); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(7, -22); ctx.lineTo(14, -26); ctx.lineTo(7, -18); ctx.closePath(); ctx.fill();
  } else if (cual === "postes"){                      // los de madera del tren
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 8, 9, 3.5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#8A6A3C"; rr(ctx, -4, -20, 8, 28, 3); ctx.fill();
    ctx.fillStyle = "#C9A46A"; rr(ctx, -12, -18, 24, 7, 3); ctx.fill();
  } else if (cual === "tuberias"){
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 9, 14, 5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#2E8B32";
    ctx.beginPath(); ctx.ellipse(0, 2, 14, 9, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#4FB84A";
    ctx.beginPath(); ctx.ellipse(0, -2, 14, 9, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#1B5A1F";
    ctx.beginPath(); ctx.ellipse(0, -2, 8, 5, 0, 0, 6.283); ctx.fill();
  } else if (cual === "nieve"){                       // bloques de hielo / luna
    ctx.rotate(az(i) * .6 - .3);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(-11, 4, 22, 5);
    ctx.fillStyle = "#C9C2D8"; rr(ctx, -11, -12, 22, 18, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(-11, -12, 22, 4);
  } else {                                            // llantas apiladas
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 7, 13, 4.5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#2A2226";
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = i % 2 ? "#FFEFE2" : "#E2453C";
    ctx.beginPath(); ctx.ellipse(0, -1, 7, 5, 0, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

/** El mosaico (cx,cy), pintándolo si es la primera vez que se ve. */
/* Cuántos mosaicos se guardan a la vez. Un lienzo de 1024x1024 ocupa unos 4 MB,
   así que la caché NO puede crecer con el mapa: recorrer el Multiverso de punta
   a punta toca 255 trozos —un giga de memoria— y una tableta se cae mucho antes.
   En pantalla caben seis (tres columnas de dos), así que con doce hay una
   columna de margen a cada lado: andando no se repinta nada y la cuenta se queda
   en 48 MB en vez de crecer sin freno. */
const MOSAICOS_MAX = 12;

function trozoDeSuelo(cx, cy){
  const clave = cx + "," + cy;
  if (mosaicoDe !== G.esc.id){ mosaicos = new Map(); mosaicoDe = G.esc.id; }
  const ya = mosaicos.get(clave);
  if (ya){
    /* Sacar y volver a meter lo pone al final del Map, que en JS conserva el
       orden de inserción: así el primero es siempre el más viejo sin llevar
       ninguna cuenta aparte. */
    mosaicos.delete(clave); mosaicos.set(clave, ya);
    return ya;
  }
  const cv = document.createElement("canvas");
  cv.width = MOSAICO; cv.height = MOSAICO;
  const c = cv.getContext("2d");
  /* Se dibuja el decorado ENTERO con el origen movido y recortado al trozo: el
     navegador tira lo de fuera y el resultado encaja con el mosaico vecino. */
  c.translate(-cx * MOSAICO, -cy * MOSAICO);
  pintarDecorado(c);
  mosaicos.set(clave, cv);
  while (mosaicos.size > MOSAICOS_MAX){
    const viejo = mosaicos.keys().next().value;
    const lienzo = mosaicos.get(viejo);
    /* Encogerlo antes de soltarlo: en Safari el lienzo suelto puede tardar en
       irse, y lo que ocupa es el mapa de píxeles, no el objeto. */
    lienzo.width = lienzo.height = 1;
    mosaicos.delete(viejo);
  }
  return cv;
}

function pintarSuelo(){
  const E = visualDe(G.esc.id);
  sueloCv = document.createElement("canvas");
  sueloCv.width = DECO_W; sueloCv.height = DECO_H;
  const c = sueloCv.getContext("2d");
  pintarDecorado(c);
}

/* ---- qué trozo de mundo enseña el minimapa ----
   Normalmente el mundo entero. En un mapa muy apaisado, no: el Multiverso mide
   86 400 x 2 100 y el minimapa salía de 300 x 7 px — una raya donde no se
   distingue nada. Ahí se enseña una VENTANA del ancho de un mapa normal y pico,
   que es lo que se puede recorrer sin que se haga de noche.

   Lo usan el `resize` (para el alto del lienzo) y el dibujo, así que vive aquí y
   no en ninguno de los dos. */
const MINI_VENTANA = 3600 * 1.6;
const miniLargo = () => WORLD_W / WORLD_H > 3;
const miniAncho = () => (miniLargo() ? MINI_VENTANA : WORLD_W);

/** Todo el decorado del escenario, en coordenadas de mundo. */
function pintarDecorado(c){
  vetoDeco = [];
  const zonas = G.esc.zonas;
  if (!zonas){
    DECO_W = WORLD_W; DECO_H = WORLD_H; DECO_X = 0;
    DECO_MAR = G.esc.mar ?? null;
    unDecorado(c, G.esc.id);
    bordeDelMapa(c, G.esc.id);
    return;
  }
  /* El Multiverso: cada zona con su decorado, en su franja. */
  for (const z of zonas){
    c.save();
    c.beginPath(); c.rect(z.x0, 0, z.x1 - z.x0, WORLD_H); c.clip();
    c.translate(z.x0, 0);
    DECO_W = z.x1 - z.x0; DECO_H = WORLD_H; DECO_X = z.x0;
    DECO_MAR = z.mar ?? null;
    unDecorado(c, z.id);
    c.restore();
  }
  /* Y las juntas entre zonas, para que no parezca un collage. */
  DECO_W = WORLD_W; DECO_H = WORLD_H; DECO_X = 0;
  for (let k = 1; k < zonas.length; k++) juntaDeZonas(c, zonas[k].x0, zonas[k-1].id, zonas[k].id);
  bordeDelMapa(c, zonas[0].id);
}

/* La costura entre dos zonas. Cada zona pinta su suelo de un color plano, así
   que sin esto el cambio es una raya vertical perfecta que delata el collage.
   Se mezclan los dos suelos con un degradado ancho y se siembra matorral
   encima, que es lo que hay entre un sitio y el siguiente cuando vas andando. */
function juntaDeZonas(c, x, idIzq, idDer){
  const ANCHO = 260;
  /* el suelo de cada lado, desvanecido hacia el otro */
  const izq = c.createLinearGradient(x - ANCHO, 0, x, 0);
  izq.addColorStop(0, "rgba(0,0,0,0)");
  izq.addColorStop(1, visualDe(idDer).suelo);
  c.globalAlpha = .55; c.fillStyle = izq;
  c.fillRect(x - ANCHO, 0, ANCHO, WORLD_H);
  const der = c.createLinearGradient(x, 0, x + ANCHO, 0);
  der.addColorStop(0, visualDe(idIzq).suelo);
  der.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = der;
  c.fillRect(x, 0, ANCHO, WORLD_H);
  c.globalAlpha = 1;
  /* y una vereda de tierra pisada por el medio, que es por donde se cruza */
  const g = c.createLinearGradient(x - 120, 0, x + 120, 0);
  g.addColorStop(0, "rgba(120,104,74,0)");
  g.addColorStop(.5, "rgba(120,104,74,.5)");
  g.addColorStop(1, "rgba(120,104,74,0)");
  c.fillStyle = g;
  c.fillRect(x - 120, 0, 240, WORLD_H);
  for (let k = 0; k < 44; k++){
    const y = azEntre(k + x, 40, WORLD_H - 40);
    const px = x + azEntre(k + 900, -150, 150);
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(px, y + 7, 15, 5, 0, 0, 6.283); c.fill();
    c.fillStyle = ["#5E7A46","#4C6B3A","#6E8A52"][k % 3];
    for (const [dx, dy, r] of [[0,-6,13],[-9,0,9],[9,0,9]]){
      c.beginPath(); c.arc(px + dx, y + dy, r, 0, 6.283); c.fill();
    }
  }
}

/** El decorado de un sitio, dentro de la caja que esté puesta. */
function unDecorado(c, id){
  const E = visualDe(id);
  c.fillStyle = E.suelo;
  c.fillRect(0,0,DECO_W,DECO_H);

  const S = E.deco === "colegio" ? 70 : 90;
  c.lineWidth = 2; c.strokeStyle = E.loseta;
  c.beginPath();
  for (let x=0;x<=DECO_W;x+=S){ c.moveTo(x,0); c.lineTo(x,DECO_H); }
  for (let y=0;y<=DECO_H;y+=S){ c.moveTo(0,y); c.lineTo(DECO_W,y); }
  c.stroke();

  if (E.deco === "manchas")       decoBarrio(c, E);
  else if (E.deco === "colegio")  decoColegio(c, E);
  else if (E.deco === "olas")     decoPlaya(c, E);
  else if (E.deco === "grietas")  decoDesierto(c, E);
  else if (E.deco === "andenes")  decoMachuPicchu(c, E);
  else if (E.deco === "asfalto")  decoNuevaYork(c, E);
  else if (E.deco === "duna")     decoEgipto(c, E);
  else if (E.deco === "selva")    decoAmazonas(c, E);
  else if (E.deco === "pista")    decoPista(c, E);
  else if (E.deco === "tablero")  decoTablero(c, E);
  else if (E.deco === "mirador")  decoMirador(c, E);
  else if (E.deco === "circuito") decoCircuito(c, E);
  else if (E.deco === "costa")    decoCostaVerde(c, E);
  else if (E.deco === "prehistoria") decoPrehistoria(c, E);
  else if (E.deco === "catarata") decoCatarata(c, E);
  else if (E.deco === "nevado")   decoNevado(c, E);
  else if (E.deco === "zoo")      decoZoo(c, E);
  else if (E.deco === "feria")    decoFeria(c, E);
  else if (E.deco === "nave")     decoNave(c, E);
  else if (E.deco === "obra")     decoObra(c, E);
  else if (E.deco === "medieval") decoMedieval(c, E);
  else if (E.deco === "italia")   decoItalia(c, E);
  else if (E.deco === "america")  decoAmerica(c, E);
  else if (E.deco === "volcan")   decoVolcan(c, E);
  else if (E.deco === "luna")     decoLuna(c, E);
  else if (E.deco === "estadio")  decoEstadio(c, E);
  else if (E.deco === "calle")    decoCalle(c, E);

}

/** El marco del mapa. Va aparte de `unDecorado` porque en El Valle se dibuja
    UNA vez alrededor de todo, no una por zona: si no, las juntas entre zonas
    salían con una raya gorda en medio. */
function bordeDelMapa(c, id){
  c.strokeStyle = visualDe(id).borde; c.lineWidth = 16;
  c.strokeRect(8, 8, WORLD_W - 16, WORLD_H - 16);
}

function drawFloor(){
  /* Por mosaicos: solo los que tocan la pantalla. Lo que costaba pintar el
     suelo dejó de depender del tamaño del mundo. */
  const w = VW / ZOOM, h = VH / ZOOM;
  const x0 = Math.max(0, Math.floor(cam.x / MOSAICO));
  const y0 = Math.max(0, Math.floor(cam.y / MOSAICO));
  const x1 = Math.min(Math.ceil(WORLD_W / MOSAICO) - 1, Math.floor((cam.x + w) / MOSAICO));
  const y1 = Math.min(Math.ceil(WORLD_H / MOSAICO) - 1, Math.floor((cam.y + h) / MOSAICO));
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++)
      ctx.drawImage(trozoDeSuelo(cx, cy), cx * MOSAICO, cy * MOSAICO);
  return;
}

function drawFloorEntero(){
  if (!sueloCv) pintarSuelo();
  /* Solo el trozo que se ve, no el mapa entero. Volcando el lienzo completo, lo
     que cuesta pintar el suelo crece con el mundo aunque en pantalla quepa lo
     mismo; recortando, cuesta igual con un mapa de 2600 que con uno de 3600 —y
     eso es lo que se nota en una tableta, no en un portátil. */
  const w = VW / ZOOM, h = VH / ZOOM;
  const x = clamp(cam.x, 0, Math.max(0, WORLD_W - w));
  const y = clamp(cam.y, 0, Math.max(0, WORLD_H - h));
  const sw = Math.min(w, WORLD_W - x), sh = Math.min(h, WORLD_H - y);
  ctx.drawImage(sueloCv, x, y, sw, sh, x, y, sw, sh);
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function drawBase(b){
  const r = b.rect;
  const col = b.locked ? "#7A6A74" : b.color;
  ctx.save();
  // piso de la base
  ctx.fillStyle = b.locked ? "rgba(0,0,0,.24)"
                : b.isPlayer ? "rgba(61,220,151,.13)" : "rgba(0,0,0,.17)";
  roundRect(r.x,r.y,r.w,r.h,26); ctx.fill();
  ctx.lineWidth = 6; ctx.setLineDash([16,12]);
  ctx.strokeStyle = col + (b.isPlayer && !b.locked ? "" : "88");
  roundRect(r.x,r.y,r.w,r.h,26); ctx.stroke();
  ctx.setLineDash([]);

  // letrero
  const rotulo = b.locked ? b.name.toUpperCase() + " · " + money(b.price) : b.name.toUpperCase();
  const lw = Math.max(150, rotulo.length*11 + 34);
  ctx.fillStyle = "#2A1226";
  roundRect(r.x+r.w/2-lw/2, r.y-38, lw, 34, 12); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 3;
  roundRect(r.x+r.w/2-lw/2, r.y-38, lw, 34, 12); ctx.stroke();
  ctx.fillStyle = b.locked ? "#FFC53D" : col;
  ctx.font = "700 16px " + "system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(rotulo, r.x+r.w/2, r.y-20);

  /* Patio en venta.

     Antes eran barrotes verticales de lado a lado y parecía una cárcel, que es
     justo lo contrario de lo que se quiere vender. Ahora es lo que es: un
     terreno baldío con su cerco de estacas y su cartel de SE VENDE clavado. La
     hierba seca y los pedestales fantasma dicen "aquí cabrían tus Florines"
     mucho mejor que una reja. */
  if (b.locked){
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;

    // hierba seca y piedritas: está abandonado, no encerrado
    ctx.strokeStyle = "rgba(200,180,120,.28)"; ctx.lineWidth = 2.5;
    for (let i = 0; i < 26; i++){
      const gx = azEntre(b.id * 71 + i, r.x + 24, r.x + r.w - 24);
      const gy = azEntre(b.id * 71 + i + 300, r.y + 24, r.y + r.h - 24);
      ctx.beginPath();
      for (let k = -1; k <= 1; k++){
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + k * 5 + azEntre(i + k, -2, 2), gy - 11 - Math.abs(k) * -3);
      }
      ctx.stroke();
    }

    // los huecos donde irían los Florines, marcados en fantasma
    for (const ped of b.peds){
      ctx.strokeStyle = "rgba(255,239,226,.14)"; ctx.lineWidth = 3;
      ctx.setLineDash([7, 7]);
      roundRect(ped.x - 27, ped.y + 4, 54, 20, 7); ctx.stroke();
      ctx.setLineDash([]);
    }

    // el cerco: estaquitas de madera con dos cuerdas, no barrotes
    const estacas = [];
    const paso = 62;
    for (let x = r.x + 16; x <= r.x + r.w - 16; x += paso) estacas.push([x, r.y + 12], [x, r.y + r.h - 12]);
    for (let y = r.y + 12 + paso; y < r.y + r.h - 20; y += paso) estacas.push([r.x + 16, y], [r.x + r.w - 16, y]);
    ctx.strokeStyle = "rgba(200,170,110,.5)"; ctx.lineWidth = 2.5;
    ctx.setLineDash([9, 7]);
    for (const dy of [-4, 4]){
      ctx.beginPath();
      ctx.rect(r.x + 16, r.y + 12 + dy, r.w - 32, r.h - 24);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const [ex, ey] of estacas){
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(ex, ey + 9, 5, 2.5, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#8A6A3C";
      ctx.beginPath();
      ctx.moveTo(ex - 3.5, ey + 9); ctx.lineTo(ex - 2.5, ey - 12);
      ctx.lineTo(ex + 2.5, ey - 12); ctx.lineTo(ex + 3.5, ey + 9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,239,226,.22)"; ctx.fillRect(ex - 2.5, ey - 12, 2, 21);
    }

    // el cartel de SE VENDE, clavado y un poco chueco
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.045);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(-6, 22, 12, 46);
    ctx.fillStyle = "#8A6A3C"; ctx.fillRect(-5, 20, 10, 46);   // el palo
    ctx.fillStyle = "rgba(0,0,0,.3)";
    roundRect(-124, -34, 248, 62, 6); ctx.fill();
    ctx.fillStyle = "#EFE4C8";                                  // la tabla
    roundRect(-128, -38, 256, 62, 6); ctx.fill();
    ctx.strokeStyle = "#8A6A3C"; ctx.lineWidth = 4;
    roundRect(-128, -38, 256, 62, 6); ctx.stroke();
    ctx.fillStyle = "#8A6A3C";                                  // los clavos
    for (const nx of [-116, 116]){
      ctx.beginPath(); ctx.arc(nx, -26, 3.4, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(nx, 12, 3.4, 0, 6.283); ctx.fill();
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#B03A2E";
    ctx.font = "800 25px " + (getComputedStyle(document.body).getPropertyValue("--display") || "system-ui");
    ctx.fillText("SE VENDE", 0, -18);
    ctx.fillStyle = "#4A3A20";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillText(money(b.price) + " · métete para comprarlo", 0, 8);
    ctx.restore();
    ctx.restore();
    return;
  }

  // pedestales
  for (const ped of b.peds){
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(ped.x, ped.y+22, 30, 11, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = ped.florin ? "#4A2540" : "rgba(42,18,38,.5)";
    roundRect(ped.x-27, ped.y+4, 54, 20, 7); ctx.fill();
    ctx.strokeStyle = ped.florin ? b.color : "rgba(255,239,226,.18)";
    ctx.lineWidth = 3;
    roundRect(ped.x-27, ped.y+4, 54, 20, 7); ctx.stroke();

    if (ped.florin){
      const bob = Math.sin(ped.florin.bob)*4;
      const s = 1 + Math.max(0, ped.pop)*.35;
      drawFlorin(ped.x, ped.y-16+bob, s, ped.florin, ped.florin.bob);
      const T = TIERS[ped.florin.tier];
      let ny = ped.y - 76 + bob;
      if (ped.florin.nombre){                        // el nombre que le pusiste
        ctx.font = "800 13px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const w = ctx.measureText(ped.florin.nombre).width + 16;
        ctx.fillStyle = "rgba(27,12,26,.82)";
        roundRect(ped.x - w/2, ny - 10, w, 20, 7); ctx.fill();
        ctx.strokeStyle = b.color; ctx.lineWidth = 2;
        roundRect(ped.x - w/2, ny - 10, w, 20, 7); ctx.stroke();
        ctx.fillStyle = "#FFEFE2";
        ctx.fillText(ped.florin.nombre, ped.x, ny);
        ny -= 20;
      }
      /* píldora de rareza: hasta ahora la rareza existía pero no se veía */
      const rarCol = RAR_COLOR[T.rar] || "#FFEFE2";
      const etq = (ped.florin.variant ? VARIANTES[ped.florin.variant].icon + " " : "") + T.rar.toUpperCase();
      ctx.font = "800 10px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const rw = ctx.measureText(etq).width + 14;
      ctx.fillStyle = "rgba(27,12,26,.86)";
      roundRect(ped.x - rw/2, ny - 8, rw, 16, 8); ctx.fill();
      ctx.strokeStyle = rarCol; ctx.lineWidth = 1.6;
      roundRect(ped.x - rw/2, ny - 8, rw, 16, 8); ctx.stroke();
      ctx.fillStyle = rarCol;
      ctx.fillText(etq, ped.x, ny);
    }
  }
  ctx.restore();
}

/* Recibe el Florín entero (tier + variante + especie de flor) en vez de sueltos:
   así ningún sitio se olvida de pasar uno y salen todos iguales sin querer. */
/* Dibuja un Florín en el lienzo que le den. Antes solo sabía pintar en el del
   juego; el álbum necesita el mismo dibujo en su propia casilla, y repetir el
   código habría dejado dos Florines que se parecen pero no son iguales. */
function drawFlorinEn(ctx, x, y, s, f, t){
  const tier = f.tier, variant = f.variant || null;
  const FL = FLORES[(f.flor|0) % FLORES.length];
  const T = TIERS[tier];
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  if (T.style === "dance") ctx.rotate(Math.sin(t*3)*0.12);

  const W = 15, H = 29, D = 9;     // medio ancho, alto y profundidad del bloque
  const top = -H/2 + 3;            // borde superior de la cara frontal
  const bot = top + H;

  /* ---- aura de la variante, detrás de todo ----
     El arcoíris cicla el tono; el dorado late más fuerte porque es el ×5; el
     fantasma casi no tiene aura, lo suyo es que se transparenta el bloque. */
  if (variant){
    const arco = variant === "arcoiris";
    const lava = variant === "lava", galaxia = variant === "galaxia";
    const pulso = REDUCED ? 1
                : 1 + Math.sin(t*(lava ? 6 : 4))*(variant === "dorado" ? .2 : lava ? .26 : .12);
    const col = arco ? "hsl(" + ((t*90)%360|0) + " 90% 65%)"
              : variant === "dorado"   ? "#FFD84D"
              : variant === "fantasma" ? "#B8C2FF"
              : variant === "cristal"  ? "#9FE8F0"
              : lava    ? (Math.sin(t*6) > 0 ? "#FF6B2B" : "#FFB020")
              : galaxia ? "hsl(" + (260 + Math.sin(t*.7)*40 | 0) + " 80% 62%)"
              : "#FFFFFF";
    ctx.save();
    ctx.globalAlpha = arco ? .5 : variant === "dorado" ? .55 : variant === "fantasma" ? .3
                    : lava ? .6 : galaxia ? .5 : variant === "cristal" ? .34 : .38;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, top + H*.45, (W+13)*pulso, (H*.72)*pulso, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, top + H*.45, (W+9)*pulso, (H*.6)*pulso, 0, 0, 6.283);
    ctx.stroke();
  }

  /* ---- efectos detrás del bloque ---- */
  if (T.style === "turbo"){                     // cohete del Girasolón
    const f = 5 + Math.sin(t*14)*3;
    ctx.fillStyle = "#FF7A2F";
    ctx.beginPath(); ctx.moveTo(-9,bot-2); ctx.lineTo(0,bot+9+f); ctx.lineTo(9,bot-2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#FFD84D";
    ctx.beginPath(); ctx.moveTo(-4.5,bot-2); ctx.lineTo(0,bot+4+f*.6); ctx.lineTo(4.5,bot-2); ctx.closePath(); ctx.fill();
  }
  if (T.style === "cosmic"){                    // anillo orbital
    ctx.strokeStyle = "rgba(92,225,234,.8)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, top+H*.6, 27, 9, Math.sin(t*.9)*.45, 0, 6.283); ctx.stroke();
  }
  if (T.style === "amaru"){                     // la serpiente enroscada detrás
    ctx.strokeStyle = "rgba(61,220,151,.75)"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i=0;i<=22;i++){
      const a = -.4 + i*.28, rr2 = 24 - i*.5;
      const px = Math.cos(a + t*.8)*rr2, py = top+H*.55 + Math.sin(a + t*.8)*rr2*.45;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.lineCap = "butt";
  }
  if (T.style === "astro"){                     // órbita de un satelito
    const a = t*1.6;
    ctx.fillStyle = "#FFC53D";
    ctx.beginPath(); ctx.arc(Math.cos(a)*26, top+H*.5 + Math.sin(a)*11, 2.6, 0, 6.283); ctx.fill();
  }
  if (T.style === "inca"){                      // rayos de sol
    ctx.strokeStyle = "rgba(255,216,77,.55)"; ctx.lineWidth = 2;
    for (let i=0;i<12;i++){
      const a = i*.5236 + t*.35, r0 = 20, r1 = 20 + (i%2 ? 9 : 5);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r0, top+H*.5 + Math.sin(a)*r0*.55);
      ctx.lineTo(Math.cos(a)*r1, top+H*.5 + Math.sin(a)*r1*.55);
      ctx.stroke();
    }
  }

  /* ---- el bloque ----
     El Fantasma se ve a través: se baja el alfa aquí y se repone después de los
     accesorios, para que los destellos de la variante salgan sólidos. */
  if (variant === "fantasma") ctx.globalAlpha = .5;
  ctx.fillStyle = T.sideDark;                   // cara derecha
  ctx.beginPath();
  ctx.moveTo(W,top); ctx.lineTo(W+D,top-D); ctx.lineTo(W+D,top-D+H); ctx.lineTo(W,bot);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = T.top;                        // cara de arriba
  ctx.beginPath();
  ctx.moveTo(-W,top); ctx.lineTo(-W+D,top-D); ctx.lineTo(W+D,top-D); ctx.lineTo(W,top);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.13)";
  ctx.beginPath();
  ctx.moveTo(-W,top); ctx.lineTo(-W+D,top-D); ctx.lineTo(W+D,top-D); ctx.lineTo(W,top);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = T.side;                       // cara frontal
  ctx.fillRect(-W, top, W*2, H);

  if (T.strip){                                 // pasto dentado sobre la tierra
    const cols = 8, cw = (W*2)/cols;
    for (let i=0;i<cols;i++){
      ctx.fillStyle = i%2 ? T.top : T.strip;
      ctx.fillRect(-W+i*cw, top, cw+.4, 5 + (i%3)*2);
    }
    ctx.fillStyle = T.strip;
    ctx.beginPath();
    ctx.moveTo(W,top); ctx.lineTo(W+D,top-D); ctx.lineTo(W+D,top-D+7); ctx.lineTo(W,top+7);
    ctx.closePath(); ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,.13)";            // textura pixelada
  const spots = [[-12,12],[-4,19],[5,10],[9,22],[-9,25],[1,15],[11,15]];
  for (const sp of spots) ctx.fillRect(sp[0], top+sp[1], 3.6, 3.6);

  ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 1.5;  // contorno del cubo
  ctx.strokeRect(-W, top, W*2, H);
  ctx.beginPath();
  ctx.moveTo(-W,top); ctx.lineTo(-W+D,top-D); ctx.lineTo(W+D,top-D);
  ctx.lineTo(W+D,top-D+H); ctx.lineTo(W,bot);
  ctx.moveTo(W+D,top-D); ctx.lineTo(W,top);
  ctx.stroke();

  /* ---- la flor plantada arriba ---- */
  const sway = Math.sin(t*2)*2;
  const fx = 2, fy = top - D + 4;

  if (FL.cactus){                                 // el cactus no tiene tallo: es una pala
    ctx.fillStyle = "#4FB265";
    roundRect(fx-5.5, fy-17, 11, 19, 5); ctx.fill();
    ctx.strokeStyle = "#2F7A46"; ctx.lineWidth = 1.4;
    roundRect(fx-5.5, fy-17, 11, 19, 5); ctx.stroke();
    roundRect(fx+4, fy-12, 6.5, 10, 3); ctx.fillStyle = "#4FB265"; ctx.fill();
    ctx.strokeStyle = "#BFE9FF"; ctx.lineWidth = .9;   // espinas
    ctx.beginPath();
    for (let i=0;i<4;i++){
      const sy = fy-14+i*4;
      ctx.moveTo(fx-6.5, sy); ctx.lineTo(fx-3.5, sy);
      ctx.moveTo(fx+6.5, sy); ctx.lineTo(fx+3.5, sy);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#3E9C56"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx+sway*.5, fy-8, fx+sway, fy-14); ctx.stroke();
    ctx.fillStyle = "#4FB265";
    if (FL.hojas >= 1){
      ctx.beginPath(); ctx.ellipse(fx-4.5, fy-7, 4.2, 2.2, -0.5, 0, 6.283); ctx.fill();
    }
    if (FL.hojas >= 2){
      ctx.beginPath(); ctx.ellipse(fx+4.6, fy-11, 3.6, 2, 0.5, 0, 6.283); ctx.fill();
    }
  }

  const cx = fx+sway, cy = fy-15;
  const n = FL.n == null ? T.n : FL.n;
  const R = FL.R;
  // la cabeza va un poco más grande que antes: a tamaño de juego, si no, todas
  // las especies se veían como la misma manchita de color
  const FS = 1.24;
  const petalo = (forma) => {                     // cada especie recorta distinto
    ctx.beginPath();
    if (forma === "ovalo")        ctx.ellipse(0,0,3.4,5.3,0,0,6.283);
    else if (forma === "tira")    ctx.ellipse(0,-1.2,1.5,6.2,0,0,6.283);
    else if (forma === "bolita")  ctx.arc(0,-1.5,3.1,0,6.283);
    else if (forma === "copa"){
      ctx.moveTo(-3.4,4.5);
      ctx.quadraticCurveTo(-4.2,-5.5, 0,-8);
      ctx.quadraticCurveTo(4.2,-5.5, 3.4,4.5);
      ctx.closePath();
    }
    else if (forma === "punta"){
      ctx.moveTo(0,-7.6); ctx.lineTo(2.5,1); ctx.lineTo(0,3.2); ctx.lineTo(-2.5,1);
      ctx.closePath();
    }
    else if (forma === "estrella"){
      ctx.moveTo(0,-8.6); ctx.lineTo(1.9,-.5); ctx.lineTo(0,2.4); ctx.lineTo(-1.9,-.5);
      ctx.closePath();
    }
    else if (forma === "corazon"){
      ctx.moveTo(0,3.4);
      ctx.quadraticCurveTo(-5,-1.5, -2.4,-4.6);
      ctx.quadraticCurveTo(0,-6.4, 0,-3);
      ctx.quadraticCurveTo(0,-6.4, 2.4,-4.6);
      ctx.quadraticCurveTo(5,-1.5, 0,3.4);
      ctx.closePath();
    }
    else if (forma === "orquidea"){
      ctx.moveTo(0,3);
      ctx.quadraticCurveTo(-3.8,-1, -2,-6.2);
      ctx.quadraticCurveTo(0,-7.6, 2,-6.2);
      ctx.quadraticCurveTo(3.8,-1, 0,3);
      ctx.closePath();
    }
    else if (forma === "rizo"){                   // pétalo de rosa, enroscado
      ctx.moveTo(0,3.2);
      ctx.quadraticCurveTo(-4.4,1.4, -3.2,-3.4);
      ctx.quadraticCurveTo(-1.4,-6.4, 1.4,-4.6);
      ctx.quadraticCurveTo(3.6,-2.8, 2.2,0);
      ctx.quadraticCurveTo(1.2,2, 0,3.2);
      ctx.closePath();
    }
    else if (forma === "abanico"){                // ave del paraíso: pétalo ancho y quebrado
      ctx.moveTo(0,3.4);
      ctx.lineTo(-4.4,-4.2); ctx.lineTo(-1.4,-3.2); ctx.lineTo(0,-8.4);
      ctx.lineTo(1.4,-3.2); ctx.lineTo(4.4,-4.2);
      ctx.closePath();
    }
    else if (forma === "lanza"){                  // hoja larga de bambú
      ctx.moveTo(0,4);
      ctx.quadraticCurveTo(-2.2,-2, 0,-8.8);
      ctx.quadraticCurveTo(2.2,-2, 0,4);
      ctx.closePath();
    }
    else ctx.ellipse(0,0,3.4,5.3,0,0,6.283);
  };

  if (FL.forma === "campana"){                    // una sola campana colgando
    const grd = ctx.createLinearGradient(0, cy-6, 0, cy+7);
    grd.addColorStop(0, T.petal2); grd.addColorStop(1, T.petal);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(FS, FS); ctx.rotate(sway*.05);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-3, -6);
    ctx.quadraticCurveTo(-7.5, 3, -6, 7);
    ctx.quadraticCurveTo(0, 10, 6, 7);
    ctx.quadraticCurveTo(7.5, 3, 3, -6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = T.center;                     // el badajo
    ctx.beginPath(); ctx.arc(0, 7.4, 1.7, 0, 6.283); ctx.fill();
    ctx.restore();
  } else if (FL.forma === "sombrero"){            // hongo: sombrerito con lunares
    ctx.save(); ctx.translate(cx, cy+2); ctx.scale(FS, FS); ctx.rotate(sway*.04);
    ctx.fillStyle = "#EDE3D0";                    // el pie
    rr(ctx, -2.2, -1, 4.4, 9, 1.6); ctx.fill();
    const grd = ctx.createLinearGradient(0, -8, 0, 1);
    grd.addColorStop(0, T.petal); grd.addColorStop(1, T.petal2);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-8.4, 0);
    ctx.quadraticCurveTo(-8, -9.4, 0, -9.4);
    ctx.quadraticCurveTo(8, -9.4, 8.4, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = T.center;                     // los lunares
    for (const [lx, ly, lr] of [[-4,-3.4,1.5],[1.2,-5.6,1.7],[4.6,-2.6,1.2]]){
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  } else {
    for (let i=0;i<n;i++){
      const a = (i/n)*6.283 + (T.style === "turbo" ? t*2 : 0);
      ctx.save(); ctx.translate(cx,cy); ctx.scale(FS,FS); ctx.rotate(a); ctx.translate(0,-R);
      const grd = ctx.createLinearGradient(0,-5,0,5);
      grd.addColorStop(0, T.petal); grd.addColorStop(1, T.petal2);
      ctx.fillStyle = grd;
      petalo(FL.forma); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    if (FL.pelusa){                               // diente de león: una bolita en cada punta
      ctx.fillStyle = "rgba(255,255,255,.9)";
      for (let i=0;i<n;i++){
        const a = (i/n)*6.283;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a-1.5708)*(R+3.4)*FS, cy + Math.sin(a-1.5708)*(R+3.4)*FS,
                1.3*FS, 0, 6.283);
        ctx.fill();
      }
    }
    if (FL.labio){                                // la orquídea tiene labio abajo
      ctx.save(); ctx.translate(cx, cy+4.5*FS); ctx.scale(FS, FS);
      ctx.fillStyle = T.center;
      ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 2.6, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    if (FL.centro > 0){
      ctx.fillStyle = T.center;
      ctx.beginPath(); ctx.arc(cx,cy,FL.centro*FS,0,6.283); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1.2; ctx.stroke();
      if (FL.semillas){                           // pipas del girasol
        ctx.fillStyle = "rgba(0,0,0,.32)";
        for (let i=0;i<7;i++){
          const a = i*2.4, rr = (1.1 + (i%3)*1.2)*FS;
          ctx.beginPath();
          ctx.arc(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr, .8, 0, 6.283);
          ctx.fill();
        }
      }
    }
  }

  /* ---- carita en la cara frontal ---- */
  const dark = (T.style === "ninja" || T.style === "cosmic" || T.style === "amaru");
  const ink = dark ? "#FFEFE2" : "#241209";
  const ey = top + 13;
  const blink = Math.sin(t*.9) > .984;
  ctx.fillStyle = ink;
  if (blink){
    ctx.fillRect(-9, ey+2, 5, 1.8); ctx.fillRect(4, ey+2, 5, 1.8);
  } else {
    ctx.fillRect(-9, ey, 5, 5); ctx.fillRect(4, ey, 5, 5);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillRect(-8.2, ey+.8, 1.7, 1.7); ctx.fillRect(4.8, ey+.8, 1.7, 1.7);
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, ey+7, 3.6, .35, 2.79); ctx.stroke();

  /* ---- accesorios ---- */
  if (T.style === "ninja"){                     // banda ninja sobre los ojos
    ctx.fillStyle = "#E0224F";
    ctx.fillRect(-W, ey-4.5, W*2, 4.5);
    ctx.beginPath();
    ctx.moveTo(W-1, ey-4); ctx.lineTo(W+11, ey-9+Math.sin(t*5)*3); ctx.lineTo(W+10, ey-1);
    ctx.closePath(); ctx.fill();
  }
  if (T.style === "king"){                      // corona sobre la flor
    ctx.fillStyle = "#FFD84D"; ctx.strokeStyle = "#A97800"; ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx-8, cy-9); ctx.lineTo(cx-5, cy-16); ctx.lineTo(cx-1.5, cy-10.5);
    ctx.lineTo(cx+1.5, cy-17); ctx.lineTo(cx+5, cy-10.5); ctx.lineTo(cx+8, cy-16);
    ctx.lineTo(cx+8, cy-8); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  if (T.style === "chancla"){                   // su chanclita de la suerte
    ctx.save(); ctx.translate(W+D+8, top+15); ctx.rotate(Math.sin(t*4)*.6 - .35);
    ctx.fillStyle = "#7A0F2E";
    ctx.beginPath(); ctx.ellipse(0,0,4.6,8.4,0,0,6.283); ctx.fill();
    ctx.fillStyle = "#FF5C86";
    ctx.beginPath(); ctx.ellipse(0,-.6,3.3,6.8,0,0,6.283); ctx.fill();
    ctx.strokeStyle = "#7A0F2E"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0,-1); ctx.lineTo(-2.6,-5.6); ctx.moveTo(0,-1); ctx.lineTo(2.6,-5.6); ctx.stroke();
    ctx.restore();
  }
  if (T.style === "dance"){                     // notas musicales
    ctx.fillStyle = "rgba(255,239,226,.75)";
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("♪", -W-7, top+6+Math.sin(t*4)*4);
    ctx.fillText("♫", W+13, top+14+Math.sin(t*4+1.6)*4);
  }
  if (T.style === "cosmic"){                    // chispas
    ctx.fillStyle = "#FFEFE2";
    for (let i=0;i<5;i++){
      const a = t*1.3 + i*1.26, rr = 31 + Math.sin(t*2+i)*4;
      ctx.beginPath(); ctx.arc(Math.cos(a)*rr, top+H*.55 + Math.sin(a)*rr*.5, 1.5, 0, 6.283); ctx.fill();
    }
  }
  if (T.style === "cebiche"){                   // su limón y su ají al lado
    ctx.save(); ctx.translate(W+D+7, top+16);
    ctx.fillStyle = "#C6E86B";
    ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1;
    for (let i=0;i<5;i++){
      const a = i*1.256;
      ctx.beginPath(); ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(a)*4.2, Math.sin(a)*4.2); ctx.stroke();
    }
    ctx.fillStyle = "#E2453C";                  // el ají, bailando
    ctx.save(); ctx.translate(-2, 9); ctx.rotate(Math.sin(t*4)*.5);
    ctx.beginPath(); ctx.ellipse(0, 0, 1.9, 4.4, 0, 0, 6.283); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  if (T.style === "futbol"){                    // pelotita dando botes
    const bx = W+D+8, by = top+20 - Math.abs(Math.sin(t*4))*11;
    ctx.fillStyle = "#FFEFE2";
    ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#241209";
    ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "#FFEFE2"; ctx.lineWidth = 2;   // la banda de la camiseta
    ctx.beginPath(); ctx.moveTo(-W, ey+9); ctx.lineTo(W, ey+5); ctx.stroke();
  }
  if (T.style === "chasqui"){                   // vincha y quipu colgando
    ctx.fillStyle = "#E2453C";
    ctx.fillRect(-W, ey-6, W*2, 3.4);
    ctx.fillStyle = "#FFD84D";
    for (let i=-1;i<2;i++) ctx.fillRect(i*7-1, ey-6, 2, 3.4);
    ctx.strokeStyle = "#8B5A2B"; ctx.lineWidth = 1.4;   // el quipu
    ctx.beginPath(); ctx.moveTo(-W-4, top+19); ctx.lineTo(-W-4, top+27); ctx.stroke();
    const hilos = ["#E2453C","#FFD84D","#5CE1EA"];
    for (let i=0;i<3;i++){
      ctx.strokeStyle = hilos[i]; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-W-4, top+21+i*2.4);
      ctx.lineTo(-W-9-i, top+25+i*2.4 + Math.sin(t*3+i)*1.4);
      ctx.stroke();
    }
  }
  if (T.style === "robot"){                     // antena, tornillos y ojo rojo
    ctx.strokeStyle = "#5A6472"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(W-4, top); ctx.lineTo(W+2, top-11); ctx.stroke();
    ctx.fillStyle = Math.sin(t*5) > 0 ? "#FF3D6E" : "#7A1D33";
    ctx.beginPath(); ctx.arc(W+2, top-12.5, 2.4, 0, 6.283); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.3)";
    for (const [sx, sy] of [[-W+3, top+3],[W-4, top+3],[-W+3, bot-4],[W-4, bot-4]]){
      ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, 6.283); ctx.fill();
    }
  }
  if (T.style === "momia"){                     // vendas cruzando la cara
    ctx.strokeStyle = "rgba(255,247,230,.85)"; ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-W, ey-3);  ctx.lineTo(W, ey+1);
    ctx.moveTo(-W, ey+7);  ctx.lineTo(W, ey+4);
    ctx.moveTo(-W, ey+14); ctx.lineTo(W, ey+17);
    ctx.stroke();
    ctx.fillStyle = "#37D6E0";                  // los ojos en la rendija
    ctx.fillRect(-8, ey+2, 4, 2.4); ctx.fillRect(4, ey+2, 4, 2.4);
  }
  if (T.style === "astro"){                     // casco con visor
    ctx.strokeStyle = "#D9DDE3"; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, ey+3, 13, 3.4, 6.02); ctx.stroke();
    ctx.fillStyle = "rgba(92,225,234,.22)";
    ctx.beginPath(); ctx.arc(0, ey+3, 12, 3.4, 6.02); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.65)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, ey+3, 8.5, 3.6, 4.5); ctx.stroke();
  }
  if (T.style === "inca"){                      // el tumi sobre la flor
    ctx.fillStyle = "#FFD84D"; ctx.strokeStyle = "#A97800"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx-2, cy-9); ctx.lineTo(cx+2, cy-9); ctx.lineTo(cx+2, cy-15);
    ctx.lineTo(cx+7, cy-15); ctx.lineTo(cx, cy-22); ctx.lineTo(cx-7, cy-15);
    ctx.lineTo(cx-2, cy-15); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#E0224F";
    ctx.beginPath(); ctx.arc(cx, cy-16.5, 1.6, 0, 6.283); ctx.fill();
  }
  if (T.style === "amaru"){                     // escamas en la cara frontal
    ctx.strokeStyle = "rgba(61,220,151,.35)"; ctx.lineWidth = 1;
    for (let f=0;f<4;f++){
      for (let k=-2;k<=2;k++){
        ctx.beginPath();
        ctx.arc(k*6 + (f%2 ? 3 : 0), top+8+f*6, 3.4, 3.4, 6.02);
        ctx.stroke();
      }
    }
  }
  if (variant === "fantasma") ctx.globalAlpha = 1;   // de aquí en adelante, sólido

  /* ---- la firma de las tres nuevas, encima del bloque ----
     El aura y las chispas solas no bastan para distinguirlas de un vistazo:
     cada una necesita algo que solo tenga ella. */
  if (variant === "cristal"){
    /* facetas: dos triángulos claros y un brillo que recorre la cara */
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, top, W*2, H); ctx.clip();
    ctx.fillStyle = "rgba(223,248,252,.34)";
    ctx.beginPath();
    ctx.moveTo(-W, top+H*.2); ctx.lineTo(0, top); ctx.lineTo(0, top+H*.55); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, top+H*.35); ctx.lineTo(2, top+H*.1); ctx.lineTo(2, top+H*.8); ctx.closePath(); ctx.fill();
    const bx = ((t*.5) % 1) * (W*3) - W*1.5;
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath();
    ctx.moveTo(bx, top); ctx.lineTo(bx+5, top); ctx.lineTo(bx-6, top+H); ctx.lineTo(bx-11, top+H);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (variant === "lava"){
    /* grietas encendidas, que laten */
    const brasa = .55 + Math.sin(t*6)*.35;
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, top, W*2, H); ctx.clip();
    ctx.strokeStyle = "rgba(255,140,40," + brasa.toFixed(2) + ")";
    ctx.lineWidth = 2.4; ctx.lineCap = "round";
    for (let k = 0; k < 3; k++){
      const y0 = top + H*(.22 + k*.26);
      ctx.beginPath();
      ctx.moveTo(-W+2, y0);
      ctx.lineTo(-W*.3, y0 + (k%2 ? 4 : -4));
      ctx.lineTo(W*.35, y0 + (k%2 ? -3 : 5));
      ctx.lineTo(W-2, y0 + (k%2 ? 3 : -2));
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,232,120," + (brasa*.7).toFixed(2) + ")";
    ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    /* y humo que sube */
    if (!REDUCED) for (let k = 0; k < 3; k++){
      const f = ((t*.5 + k/3) % 1);
      ctx.globalAlpha = (1-f)*.35;
      ctx.fillStyle = "#8A8478";
      ctx.beginPath();
      ctx.arc(Math.sin(t+k)*5, top - f*22, 2.5 + f*4, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else if (variant === "galaxia"){
    /* el bloque es un trozo de cielo: estrellas dentro y una nebulosa */
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, top, W*2, H); ctx.clip();
    ctx.fillStyle = "rgba(18,12,40,.72)";
    ctx.fillRect(-W, top, W*2, H);
    const neb = ctx.createRadialGradient(2, top+H*.4, 2, 2, top+H*.4, W*1.4);
    neb.addColorStop(0, "rgba(139,107,238,.75)");
    neb.addColorStop(.6, "rgba(255,158,196,.30)");
    neb.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = neb;
    ctx.fillRect(-W, top, W*2, H);
    for (let k = 0; k < 16; k++){
      const ex = -W + ((k*37) % (W*2));
      const ey = top + ((k*53) % H);
      const brillo = .35 + Math.abs(Math.sin(t*1.6 + k))*.65;
      ctx.fillStyle = "rgba(255,255,255," + brillo.toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(ex, ey, k % 4 === 0 ? 1.5 : .9, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  /* ---- destellos de la variante, por encima del bloque ---- */
  if (variant && !REDUCED){
    const arco = variant === "arcoiris", oro = variant === "dorado";
    const lava = variant === "lava", galaxia = variant === "galaxia";
    const n = arco ? 6 : oro ? 8 : variant === "fantasma" ? 3
            : galaxia ? 10 : lava ? 7 : variant === "cristal" ? 5 : 4;
    for (let i=0;i<n;i++){
      const a = -t*(arco ? 2.2 : oro ? 1.1 : 1.6) + i*(6.283/n);
      const rr = 24 + Math.sin(t*3+i)*3;
      const px = Math.cos(a)*rr, py = top+H*.45 + Math.sin(a)*rr*.55;
      ctx.fillStyle = arco ? "hsl(" + (((t*120)+i*60)%360|0) + " 95% 70%)"
                    : oro  ? (i%2 ? "#FFD84D" : "#FFF0A5")
                    : variant === "fantasma" ? "rgba(184,194,255,.9)"
                    : variant === "cristal"  ? (i%2 ? "#DFF8FC" : "#7FD3F0")
                    /* la lava chispea como una brasa: naranja, rojo y ceniza */
                    : lava    ? ["#FFD84D","#FF6B2B","#C0452F"][i % 3]
                    /* la galaxia son estrellas de verdad, cada una de un color */
                    : galaxia ? ["#FFFFFF","#B8C2FF","#FF9EC4","#8FE8FF"][i % 4]
                    : "#FFFFFF";
      ctx.save();
      ctx.translate(px, py); ctx.rotate(a);
      ctx.beginPath();                          // chispita de 4 puntas
      ctx.moveTo(0,-3.4); ctx.lineTo(1,-1); ctx.lineTo(3.4,0); ctx.lineTo(1,1);
      ctx.lineTo(0,3.4);  ctx.lineTo(-1,1); ctx.lineTo(-3.4,0); ctx.lineTo(-1,-1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** El de siempre, en el lienzo del juego. */
function drawFlorin(x, y, s, f, t){ drawFlorinEn(ctx, x, y, s, f, t); }

/* ---------- El Estadio ----------
   Tribunas a los cuatro lados, focos en las esquinas y la hinchada. La gente va
   en el DECORADO —es cacheado, se pinta una vez— y lo que se mueve (el oleaje
   de la hinchada) va aparte, en `drawHinchada`, encima de todo. */
function decoEstadio(c, E){
  const GRADA = 300;            // lo que ocupa la tribuna por cada lado
  // el foso de atletismo alrededor del campo
  c.fillStyle = "#B4552F";
  c.fillRect(GRADA - 70, GRADA - 70, DECO_W - (GRADA - 70) * 2, DECO_H - (GRADA - 70) * 2);
  c.fillStyle = E.suelo;
  c.fillRect(GRADA, GRADA, DECO_W - GRADA * 2, DECO_H - GRADA * 2);

  /* Las gradas: escalones que suben hacia fuera, más oscuros cuanto más arriba,
     que es lo que da la sensación de que el campo está hundido. */
  const grada = (x, y, w, h, vertical) => {
    const pasos = 7;
    for (let k = 0; k < pasos; k++){
      const f = k / pasos;
      c.fillStyle = "rgba(0,0,0," + (0.10 + f * 0.22).toFixed(2) + ")";
      if (vertical) c.fillRect(x, y + h * f * 0.5, w, h * 0.5 / pasos + 1);
      else c.fillRect(x + w * f * 0.5, y, w * 0.5 / pasos + 1, h);
    }
  };
  c.fillStyle = "#4A3F52";
  c.fillRect(0, 0, DECO_W, GRADA);                        // arriba
  c.fillRect(0, DECO_H - GRADA, DECO_W, GRADA);           // abajo
  c.fillRect(0, 0, GRADA, DECO_H);                        // izquierda
  c.fillRect(DECO_W - GRADA, 0, GRADA, DECO_H);           // derecha
  grada(0, 0, DECO_W, GRADA, true);
  grada(0, DECO_H, DECO_W, -GRADA, true);

  /* La hinchada, en filas. Cada cabecita es determinista (`az`), así que el
     mosaico se puede repintar y sale igual. */
  const CAMISETAS = ["#FF3D6E", "#FFC53D", "#5CE1EA", "#FFEFE2", "#8B6BEE"];
  const gente = (x0, y0, x1, y1, filas) => {
    for (let f = 0; f < filas; f++){
      const t = f / Math.max(1, filas - 1);
      for (let i = 0; i < 60; i++){
        const px = x0 + (x1 - x0) * ((i + (f % 2) * 0.5) / 60);
        const py = y0 + (y1 - y0) * t;
        const k = (f * 97 + i * 13);
        c.fillStyle = CAMISETAS[k % CAMISETAS.length];
        c.beginPath(); c.arc(px, py, 7, 0, 6.283); c.fill();
        c.fillStyle = "#3A2416";
        c.beginPath(); c.arc(px, py - 7, 5, 0, 6.283); c.fill();
      }
    }
  };
  gente(20, 40, DECO_W - 20, GRADA - 60, 6);
  gente(20, DECO_H - 40, DECO_W - 20, DECO_H - GRADA + 60, 6);

  // los cuatro focos
  for (const [fx, fy] of [[0.06,0.06],[0.94,0.06],[0.06,0.94],[0.94,0.94]]){
    const x = DECO_W * fx, y = DECO_H * fy;
    c.fillStyle = "#2A2430"; c.fillRect(x - 8, y - 10, 16, 90);
    c.fillStyle = "#D8CFD4"; rr(c, x - 52, y - 46, 104, 44, 8); c.fill();
    c.fillStyle = "#FFF6D0";
    for (let i = 0; i < 8; i++)
      { c.beginPath(); c.arc(x - 40 + (i % 4) * 26, y - 34 + ((i / 4) | 0) * 22, 8, 0, 6.283); c.fill(); }
  }

  // el túnel de vestuarios
  c.fillStyle = "#1E1A22";
  rr(c, DECO_W / 2 - 90, DECO_H - GRADA - 26, 180, 60, 10); c.fill();
  c.fillStyle = "#8E7F92";
  c.font = "700 22px system-ui, sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("VESTUARIOS", DECO_W / 2, DECO_H - GRADA + 4);
}

/* ---------- La Calle ----------
   Pichanga de barrio: asfalto con parches, paredes con arcos pintados, carros
   estacionados y los vecinos mirando desde la vereda. */
function decoCalle(c, E){
  // la vereda a los lados
  c.fillStyle = "#9A948E";
  c.fillRect(0, 0, DECO_W, 180);
  c.fillRect(0, DECO_H - 180, DECO_W, 180);
  c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 3;
  for (let x = 0; x < DECO_W; x += 120){
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 180); c.stroke();
    c.beginPath(); c.moveTo(x, DECO_H - 180); c.lineTo(x, DECO_H); c.stroke();
  }
  // parches y grietas del asfalto
  for (let i = 0; i < 40; i++){
    const x = azEntre(i, 0, DECO_W), y = azEntre(i + 61, 200, DECO_H - 200);
    c.fillStyle = "rgba(30,28,26,.22)";
    c.beginPath(); c.ellipse(x, y, 40 + az(i) * 60, 16 + az(i + 9) * 24, az(i) * 3, 0, 6.283); c.fill();
  }
  // las paredes del fondo, con sus arcos pintados y grafitis
  for (const lado of [0, 1]){
    const x = lado ? DECO_W - 90 : 0;
    c.fillStyle = "#8A6A58"; c.fillRect(x, 180, 90, DECO_H - 360);
    c.fillStyle = "rgba(0,0,0,.14)";
    for (let y = 180; y < DECO_H - 180; y += 44)
      c.fillRect(x, y, 90, 6);
    // el arco pintado
    c.strokeStyle = "#F2EDE4"; c.lineWidth = 9;
    c.strokeRect(x + (lado ? 10 : 18), DECO_H / 2 - 150, 62, 300);
  }
  // carros estacionados en la vereda
  const CARROS = ["#FF5C86", "#5CE1EA", "#FFC53D", "#9BD97F", "#8B6BEE"];
  for (let i = 0; i < 7; i++){
    const x = azEntre(i + 5, 200, DECO_W - 300), y = i % 2 ? 92 : DECO_H - 92;
    c.fillStyle = "rgba(0,0,0,.2)";
    c.beginPath(); c.ellipse(x + 70, y + 30, 80, 16, 0, 0, 6.283); c.fill();
    c.fillStyle = CARROS[i % CARROS.length];
    rr(c, x, y - 26, 150, 56, 12); c.fill();
    c.fillStyle = "rgba(255,255,255,.35)";
    rr(c, x + 30, y - 18, 54, 26, 6); c.fill();
    c.fillStyle = "#2A2430";
    c.beginPath(); c.arc(x + 34, y + 30, 14, 0, 6.283); c.fill();
    c.beginPath(); c.arc(x + 116, y + 30, 14, 0, 6.283); c.fill();
  }
  // los vecinos mirando
  for (let i = 0; i < 14; i++){
    const x = azEntre(i + 31, 120, DECO_W - 120), y = i % 2 ? 40 : DECO_H - 40;
    c.fillStyle = ["#FF3D6E","#FFC53D","#5CE1EA","#9BD97F"][i % 4];
    c.beginPath(); c.arc(x, y, 9, 0, 6.283); c.fill();
    c.fillStyle = "#3A2416";
    c.beginPath(); c.arc(x, y - 9, 6, 0, 6.283); c.fill();
  }
}

/* ---- la canchita del colegio, en la aventura ----
   Un sitio del mundo, como la Ruleta: se ve desde lejos, dice para qué sirve y
   metiéndote se arma la pichanga. */
function drawCanchita(){
  for (const sitio of G.sitios || []) dibujarSitio(sitio);
}

function dibujarSitio(sitio){
  const c = sitio.rect;
  const esTenis = sitio.juego === "tenis";
  const esVoley = sitio.juego === "voley";
  const conRed = esTenis || esVoley;
  ctx.save();
  /* La superficie dice a qué se juega antes de leer el cartel: césped y arcos
     de fierro para la pichanga, tierra y red para el tenis. Dos canchas verdes
     con arcos, una al lado de la otra, se leerían como una sola partida en dos. */
  ctx.fillStyle = esTenis ? "rgba(193,102,63,.62)"
                : esVoley ? "rgba(224,190,132,.62)"
                : "rgba(94,154,82,.55)";
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 5;
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  ctx.beginPath();
  ctx.moveTo(c.x + c.w/2, c.y); ctx.lineTo(c.x + c.w/2, c.y + c.h); ctx.stroke();

  if (conRed){
    // la red, con su cinta blanca arriba
    ctx.fillStyle = "rgba(28,20,26,.55)";
    ctx.fillRect(c.x + c.w/2 - 5, c.y - 8, 10, c.h + 16);
    ctx.fillStyle = "#F3EAF0";
    ctx.fillRect(c.x + c.w/2 - 8, c.y - 11, 16, 6);
    ctx.fillRect(c.x + c.w/2 - 8, c.y + c.h + 5, 16, 6);
    /* Las rayas de dentro son lo que distingue una cancha de otra de un
       vistazo: cuadros de saque en el tenis, líneas de ataque en el vóley. */
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3;
    ctx.beginPath();
    if (esVoley){
      const at = c.w * 0.17;
      ctx.moveTo(c.x + c.w/2 - at, c.y); ctx.lineTo(c.x + c.w/2 - at, c.y + c.h);
      ctx.moveTo(c.x + c.w/2 + at, c.y); ctx.lineTo(c.x + c.w/2 + at, c.y + c.h);
    } else {
      const pas = c.h * 0.12, saq = c.w * 0.24;
      ctx.moveTo(c.x, c.y + pas); ctx.lineTo(c.x + c.w, c.y + pas);
      ctx.moveTo(c.x, c.y + c.h - pas); ctx.lineTo(c.x + c.w, c.y + c.h - pas);
      ctx.moveTo(c.x + c.w/2 - saq, c.y + pas); ctx.lineTo(c.x + c.w/2 - saq, c.y + c.h - pas);
      ctx.moveTo(c.x + c.w/2 + saq, c.y + pas); ctx.lineTo(c.x + c.w/2 + saq, c.y + c.h - pas);
    }
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(c.x + c.w/2, c.y + c.h/2, 78, 0, 6.283); ctx.stroke();
    // los dos arquitos de fierro
    for (const lado of [0, 1]){
      const ax = lado ? c.x + c.w - 12 : c.x - 22;
      ctx.fillStyle = "#D8CFD4";
      ctx.fillRect(ax, c.y + c.h/2 - 90, 34, 12);
      ctx.fillRect(ax, c.y + c.h/2 + 78, 34, 12);
      ctx.fillRect(lado ? ax + 24 : ax, c.y + c.h/2 - 90, 10, 180);
      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2;
      for (let y = c.y + c.h/2 - 84; y < c.y + c.h/2 + 84; y += 16){
        ctx.beginPath(); ctx.moveTo(ax + 2, y); ctx.lineTo(ax + 32, y); ctx.stroke();
      }
    }
  }

  // el cartel
  const dentro = G.player.enSitio === sitio.juego;
  const ico = esTenis ? "🎾" : esVoley ? "🏐" : "⚽";
  const rot = dentro ? ico + " TOCA EL BOTÓN Y SE ARMA" : ico + " " + sitio.rotulo;
  const lw = rot.length * 11 + 30;
  /* El cartel va DENTRO del borde de arriba, no encima. Fuera se choca con lo
     que haya pegado a la cancha —el de la Ruleta se montaba encima del de
     tenis y no se leía ninguno—; dentro no hay nada con qué chocar, porque
     dentro de una cancha no se pone nada. */
  const ly = c.y + 10;
  ctx.fillStyle = "#2A1226";
  roundRect(c.x + c.w/2 - lw/2, ly, lw, 32, 12); ctx.fill();
  ctx.strokeStyle = dentro ? "#FFC53D" : "#3DDC97"; ctx.lineWidth = 3;
  roundRect(c.x + c.w/2 - lw/2, ly, lw, 32, 12); ctx.stroke();
  ctx.fillStyle = dentro ? "#FFC53D" : "#3DDC97";
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(rot, c.x + c.w/2, ly + 16);
  ctx.restore();
}

/* ---- la cancha del partido ----
   Las líneas y los dos arcos. Se pinta sobre el suelo del colegio: la pichanga
   se juega en el patio de siempre, con la cancha marcada a lo grande. */
const CAMISETA = ["#3DDC97", "#FF5C86"];      // locales y visitantes

/* La hinchada: la ola de siempre, y un salto de todos cuando cae un gol. Va
   encima del decorado y no dentro, porque el decorado es un mosaico cacheado y
   esto se mueve. Todo sale de `G.t` y del marcador: nada que guardar. */
function drawHinchada(){
  if (G.esc.id !== "estadio" || REDUCED) return;
  const f = G.futbol;
  const GRADA = 300;
  const festejo = f && f.ultimoGol != null && f.saque > 0 ? 1 : 0;
  const COLORES = ["#FF3D6E", "#FFC53D", "#5CE1EA", "#FFEFE2", "#8B6BEE"];
  ctx.save();
  for (const arriba of [true, false]){
    for (let fila = 0; fila < 6; fila++){
      const y0 = arriba ? 40 + (GRADA - 100) * (fila / 5)
                        : WORLD_H - 40 - (GRADA - 100) * (fila / 5);
      for (let i = 0; i < 60; i++){
        const x = 20 + (WORLD_W - 40) * ((i + (fila % 2) * 0.5) / 60);
        /* La ola recorre el estadio; en el gol saltan todos a la vez. */
        const ola = Math.sin(G.t * 2.2 - x * 0.004 + fila * 0.3);
        const alto = festejo ? Math.abs(Math.sin(G.t * 9 + i)) * 16
                             : Math.max(0, ola) * 9;
        if (alto < 0.6) continue;
        const k = (fila * 97 + i * 13);
        ctx.fillStyle = COLORES[k % COLORES.length];
        ctx.beginPath(); ctx.arc(x, y0 - alto, 7, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#3A2416";
        ctx.beginPath(); ctx.arc(x, y0 - alto - 7, 5, 0, 6.283); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawCancha(){
  const f = G.futbol;
  if (!f) return;
  const c = f.cancha;
  ctx.save();
  /* La superficie es del sitio. En la calle no hay césped: hay asfalto y unas
     rayas pintadas que ya casi no se ven, que es de lo que va una pichanga de
     barrio. En el colegio y el estadio, césped bien opaco — debajo está el
     patio con sus canteros, y un cantero medio transparentado dentro del área
     parece un obstáculo que no lo es. */
  const enLaCalle = G.esc.id === "calle";
  if (enLaCalle){
    ctx.fillStyle = "#57534F";
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = "rgba(0,0,0,.10)";
    for (let i = 0; i < 26; i++){
      const x = azEntre(i + 200, c.x, c.x + c.w), y = azEntre(i + 311, c.y, c.y + c.h);
      ctx.beginPath();
      ctx.ellipse(x, y, 30 + az(i) * 50, 12 + az(i + 7) * 20, az(i) * 3, 0, 6.283);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#5E9A52";
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = "rgba(255,255,255,.05)";
    for (let x = c.x; x < c.x + c.w; x += 150) ctx.fillRect(x, c.y, 75, c.h);
  }
  /* Las rayas de la calle están medio borradas: las pintó alguien hace años. */
  ctx.strokeStyle = enLaCalle ? "rgba(255,255,255,.40)" : "rgba(255,255,255,.72)";
  ctx.lineWidth = enLaCalle ? 5 : 6;
  if (enLaCalle) ctx.setLineDash([34, 16]);
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  ctx.setLineDash([]);
  // la del medio y el círculo central
  ctx.beginPath();
  ctx.moveTo(c.x + c.w/2, c.y); ctx.lineTo(c.x + c.w/2, c.y + c.h); ctx.stroke();
  ctx.beginPath(); ctx.arc(c.x + c.w/2, c.y + c.h/2, 120, 0, 6.283); ctx.stroke();
  // las áreas
  const areaH = 460, areaW = 210;
  ctx.strokeRect(c.x, c.y + c.h/2 - areaH/2, areaW, areaH);
  ctx.strokeRect(c.x + c.w - areaW, c.y + c.h/2 - areaH/2, areaW, areaH);

  /* Los arcos, cada uno del color de quien lo defiende: sin eso, a los dos
     minutos ya nadie se acuerda de hacia dónde ataca. */
  f.arcos.forEach((a, q) => {
    ctx.fillStyle = CAMISETA[q] + "33";
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = CAMISETA[q]; ctx.lineWidth = 7;
    ctx.strokeRect(a.x, a.y, a.w, a.h);
    // la red
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2;
    for (let y = a.y + 12; y < a.y + a.h; y += 22){
      ctx.beginPath(); ctx.moveTo(a.x + 3, y); ctx.lineTo(a.x + a.w - 3, y); ctx.stroke();
    }
    for (let x = a.x + 12; x < a.x + a.w; x += 18){
      ctx.beginPath(); ctx.moveTo(x, a.y + 3); ctx.lineTo(x, a.y + a.h - 3); ctx.stroke();
    }
  });
  ctx.restore();
}

/* ---- la cancha de tenis ----
   Polvo de ladrillo, las rayas y la red. La red se pinta DEBAJO de la gente:
   nadie la cruza —eso lo impide el motor—, así que quien la tape es porque
   está pegado a ella, y ahí taparla es lo que pasaría de verdad. */
function drawCanchaTenis(){
  const t = G.tenis;
  if (!t) return;
  const c = t.cancha;
  ctx.save();

  // polvo de ladrillo, con sus manchas de tanto arrastrar los pies
  ctx.fillStyle = "#C1663F";
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = "rgba(255,255,255,.028)";
  for (let i = 0; i < 34; i++){
    const x = azEntre(i + 900, c.x, c.x + c.w), y = azEntre(i + 411, c.y, c.y + c.h);
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + az(i) * 26, 9 + az(i + 3) * 12, az(i) * 3, 0, 6.283);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 6;
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  /* Los pasillos del dobles y los cuadros de saque: no cambian ninguna regla
     —aquí la pelota solo tiene que caer del otro lado—, pero sin ellos esto es
     un rectángulo con una raya en medio y no se lee como una cancha. */
  ctx.lineWidth = 4;
  const pasillo = c.h * 0.11;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + pasillo); ctx.lineTo(c.x + c.w, c.y + pasillo);
  ctx.moveTo(c.x, c.y + c.h - pasillo); ctx.lineTo(c.x + c.w, c.y + c.h - pasillo);
  ctx.stroke();
  const saque = c.w * 0.24;
  ctx.beginPath();
  ctx.moveTo(t.redX - saque, c.y + pasillo); ctx.lineTo(t.redX - saque, c.y + c.h - pasillo);
  ctx.moveTo(t.redX + saque, c.y + pasillo); ctx.lineTo(t.redX + saque, c.y + c.h - pasillo);
  ctx.moveTo(t.redX - saque, c.y + c.h/2); ctx.lineTo(t.redX + saque, c.y + c.h/2);
  ctx.stroke();

  // la red, con sus postes y su cinta blanca arriba
  const rx = t.redX - 7;
  ctx.fillStyle = "rgba(28,20,26,.55)";
  ctx.fillRect(rx, c.y - 10, 14, c.h + 20);
  ctx.strokeStyle = "rgba(255,255,255,.30)"; ctx.lineWidth = 1.4;
  for (let y = c.y - 6; y < c.y + c.h + 14; y += 13){
    ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + 14, y); ctx.stroke();
  }
  ctx.fillStyle = "#F3EAF0";
  ctx.fillRect(rx - 2, c.y - 12, 18, 7);
  ctx.fillRect(rx - 2, c.y + c.h + 5, 18, 7);
  ctx.fillStyle = "#8E7F92";
  ctx.fillRect(rx - 4, c.y - 22, 22, 12);
  ctx.fillRect(rx - 4, c.y + c.h + 10, 22, 12);
  ctx.restore();
}

/* ---- la cancha de básquet ---- */
function drawBasquet(){
  const b = G.basquet;
  if (!b) return;
  const c = b.cancha;
  ctx.save();
  ctx.fillStyle = "rgba(193,102,63,.62)";
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 5;
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  ctx.beginPath();
  ctx.moveTo(c.x + c.w/2, c.y); ctx.lineTo(c.x + c.w/2, c.y + c.h); ctx.stroke();
  // aros
  for (const arco of b.aros){
    ctx.strokeStyle = "#FF5C86"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(arco.x + arco.w/2, arco.y + arco.h/2, 30, 0, 6.283); ctx.stroke();
  }
  ctx.restore();
}

/* ---- la pista de bolos ---- */
function drawBolos(){
  const b = G.bolos;
  if (!b) return;
  const p = b.pista;
  ctx.save();
  ctx.fillStyle = "#A0522D";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2;
  ctx.strokeRect(p.x, p.y, p.w, p.h);
  /* Los pinos: `pinLugar` dice dónde están y `pins` cuáles siguen en pie. Esto
     leía `b.pinos` con `pin.levantado`, que no existen en el estado — con la
     bolera colgada en el mundo, entrar reventaba el dibujado entero. */
  b.pinLugar.forEach((pin, i) => {
    if (!b.pins[i]) return;
    ctx.fillStyle = "#F5F5DC";
    ctx.beginPath(); ctx.arc(pin.x, pin.y, 8, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.restore();
}

/* ---- el ring de lucha ---- */
function drawLucha(){
  const l = G.lucha;
  if (!l) return;
  const r = l.ring;
  ctx.save();
  ctx.fillStyle = "rgba(200,200,200,.3)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "#FF5C86"; ctx.lineWidth = 4;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/* ---- los dardos ---- */
function drawDardos(){
  const d = G.dardos;
  if (!d) return;
  const t = d.tablero;
  ctx.save();
  ctx.fillStyle = "#2A1226";
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.283); ctx.fill();
  // anillos
  for (let i = 0; i < 5; i++){
    ctx.strokeStyle = i % 2 ? "#FF5C86" : "#FFC53D";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, 20 + i * 14, 0, 6.283); ctx.stroke();
  }
  // dardos clavados
  for (const dar of d.dardos){
    ctx.fillStyle = dar.dueño === 0 ? "#3DDC97" : "#FF5C86";   // el estado dice `dueño`
    ctx.beginPath(); ctx.arc(dar.x, dar.y, 4, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

/* ---- carrera de obstáculos ---- */
function drawCarreraObs(){
  const c = G.carreraObs;
  if (!c) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  for (let i = 0; i < c.trazado.length - 1; i++){
    const a = c.trazado[i], b = c.trazado[i + 1];
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const cp of c.trazado){
    ctx.fillStyle = "#FFC53D";
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 10, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

/* ---- el laberinto ---- */
function drawLaberinto(){
  const l = G.laberinto;
  if (!l) return;
  ctx.save();
  ctx.fillStyle = "#1B0C1A";
  const cw = 40, ch = 40;
  const ox = l.gemas.length ? l.gemas[0].x - cw/2 : 0;
  const oy = l.gemas.length ? l.gemas[0].y - ch/2 : 0;
  for (let y = 0; y < l.alto; y++){
    for (let x = 0; x < l.ancho; x++){
      const px = ox + x * cw, py = oy + y * ch;
      if (l.celdas[y][x]){
        ctx.fillStyle = "#3D2B4A";
        ctx.fillRect(px, py, cw, ch);
      }
    }
  }
  // gemas
  for (const g of l.gemas){
    ctx.fillStyle = "#FFC53D";
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - 8); ctx.lineTo(g.x + 6, g.y); ctx.lineTo(g.x, g.y + 8); ctx.lineTo(g.x - 6, g.y);
    ctx.closePath(); ctx.fill();
  }
  // fantasma
  if (l.fantasma){
    ctx.fillStyle = "rgba(255,61,110,.6)";
    ctx.beginPath(); ctx.arc(l.fantasma.x, l.fantasma.y, 12, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

/* ---- la mesa de billar ---- */
function drawBillar(){
  const bl = G.billar;
  if (!bl) return;
  const m = bl.mesa;
  ctx.save();
  ctx.fillStyle = "#0A5E2A";
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.strokeStyle = "#8B4513"; ctx.lineWidth = 8;
  ctx.strokeRect(m.x, m.y, m.w, m.h);
  for (const b of bl.bolas){
    ctx.fillStyle = b.color === 0 ? "#FFF" : ["#FF0","#F00","#00F","#F0F","#0FF","#F90","#800"][b.color] || "#888";
    ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}

/* ---- air hockey ---- */
function drawHockey(){
  const h = G.hockey;
  if (!h) return;
  const m = h.mesa;
  ctx.save();
  ctx.fillStyle = "#1A3A5C";
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.strokeStyle = "#FFF"; ctx.lineWidth = 2;
  ctx.strokeRect(m.x, m.y, m.w, m.h);
  // línea central
  ctx.beginPath(); ctx.moveTo(m.x + m.w/2, m.y); ctx.lineTo(m.x + m.w/2, m.y + m.h); ctx.stroke();
  // arcos
  ctx.strokeStyle = "#FF5C86"; ctx.lineWidth = 4;
  ctx.strokeRect(m.x - 5, m.y + m.h/2 - 40, 10, 80);
  ctx.strokeRect(m.x + m.w - 5, m.y + m.h/2 - 40, 10, 80);
  // puck
  ctx.fillStyle = "#333";
  ctx.beginPath(); ctx.arc(h.puck.x, h.puck.y, 10, 0, 6.283); ctx.fill();
  ctx.restore();
}

/* ---- la cancha de vóley ----
   Arena, la red en medio y las dos líneas de ataque. La pelota NO se pinta
   aquí: es un trasto como la del fútbol y la del tenis, así que ya la dibuja
   `drawTrastos` con su sombra y su altura — que es justo lo que hay que ver en
   un juego donde el suelo es el punto. */
function drawCanchaVoley(){
  const v = G.voley;
  if (!v) return;
  const c = v.cancha;
  ctx.save();

  ctx.fillStyle = "#E0BE84";                     // arena
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = "rgba(198,158,98,.30)";
  for (let i = 0; i < 32; i++){
    const x = azEntre(i + 620, c.x, c.x + c.w), y = azEntre(i + 733, c.y, c.y + c.h);
    ctx.beginPath();
    ctx.ellipse(x, y, 20 + az(i) * 30, 10 + az(i + 5) * 14, az(i) * 3, 0, 6.283);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 6;
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  // las líneas de ataque, a un tercio de la red por cada lado
  ctx.lineWidth = 4;
  const ataque = c.w * 0.17;
  ctx.beginPath();
  ctx.moveTo(v.redX - ataque, c.y); ctx.lineTo(v.redX - ataque, c.y + c.h);
  ctx.moveTo(v.redX + ataque, c.y); ctx.lineTo(v.redX + ataque, c.y + c.h);
  ctx.stroke();

  // la red, más alta que la del tenis y con su cinta blanca
  const rx = v.redX - 8;
  ctx.fillStyle = "rgba(28,20,26,.45)";
  ctx.fillRect(rx, c.y - 14, 16, c.h + 28);
  ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.4;
  for (let y = c.y - 10; y < c.y + c.h + 20; y += 16){
    ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + 16, y); ctx.stroke();
  }
  ctx.fillStyle = "#F3EAF0";
  ctx.fillRect(rx - 3, c.y - 17, 22, 9);
  ctx.fillRect(rx - 3, c.y + c.h + 8, 22, 9);
  ctx.fillStyle = "#8E7F92";
  ctx.fillRect(rx - 5, c.y - 30, 26, 14);
  ctx.fillRect(rx - 5, c.y + c.h + 16, 26, 14);
  ctx.restore();
}

/* ---- las luces de la fiesta ----
   Focos de colores barriendo la pasarela y papelitos cayendo sobre el ocho.
   Va todo con `G.t`, así que no hace falta guardar ni una partícula: dos
   clientes con la misma fiesta ven lo mismo, y apagarla no deja rastro. */
function drawFiesta(){
  if (!G.fiesta || !enFiesta(G)) return;
  /* La caja del ocho, que es por donde pasa el desfile: la fiesta ilumina la
     pasarela, no el mapa entero. */
  const { cx, cy, rx, ry } = orbitaDelCentro(G);
  const COLORES = ["#FF3D6E", "#FFC53D", "#5CE1EA", "#8B6BEE", "#3DDC97"];
  ctx.save();

  // los focos: cinco haces girando desde el centro del ocho
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < COLORES.length; i++){
    const a = G.t * 0.5 + (i / COLORES.length) * 6.283;
    const largo = rx * 1.35;
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * largo, cy + Math.sin(a) * largo);
    g.addColorStop(0, COLORES[i] + (REDUCED ? "18" : "30"));
    g.addColorStop(1, COLORES[i] + "00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, largo, a - 0.13, a + 0.13);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  /* Los papelitos. Determinista con `az`: cada uno cae a su ritmo y vuelve a
     empezar arriba, sin lista que mantener. */
  if (!REDUCED){
    const ALTO = ry * 4.4;
    for (let i = 0; i < 90; i++){
      const px = cx - rx * 1.2 + az(i * 7) * rx * 2.4;
      const vel = 60 + az(i * 13) * 90;
      const py = cy - ALTO / 2 + ((G.t * vel + az(i * 5) * ALTO) % ALTO);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(G.t * (1 + az(i * 3) * 3) + i);
      ctx.fillStyle = COLORES[i % COLORES.length];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(-4, -2.5, 8, 5);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---- la cochera ----
   El suelo de tu garaje, pegado al patio: cemento, sus plazas pintadas y el
   techo de calamina al fondo. Los vehículos los dibuja `drawTrastos` como
   cualquier otro, así que aquí solo va lo que está DEBAJO de ellos. */
function drawCochera(){
  const c = G.cochera;
  if (!c) return;
  const { x, y, w, h } = c;
  ctx.save();

  // la losa de cemento
  ctx.fillStyle = "rgba(24,16,24,.34)";
  roundRect(x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = "rgba(61,220,151,.55)"; ctx.lineWidth = 4;
  roundRect(x, y, w, h, 14); ctx.stroke();

  /* Las rayas de las plazas. Van a la medida del motor (96 px, 12 de borde y
     22 arriba por el techo): si aquí se pintaran a ojo, los vehículos
     aparcarían fuera de su raya. */
  const PL = 96;
  const cols = Math.max(1, Math.min(3, Math.round((w - 24) / PL)));
  const filas = Math.max(1, Math.round((h - 34) / PL));
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 3;
  for (let k = 1; k < cols; k++){
    const px = x + 12 + k * PL;
    ctx.beginPath(); ctx.moveTo(px, y + 26); ctx.lineTo(px, y + 22 + filas * PL); ctx.stroke();
  }
  for (let k = 1; k < filas; k++){
    const py = y + 22 + k * PL;
    ctx.beginPath(); ctx.moveTo(x + 14, py); ctx.lineTo(x + 12 + cols * PL, py); ctx.stroke();
  }

  // el techo de calamina y sus dos postes
  ctx.fillStyle = "#5C4A52";
  roundRect(x + 4, y - 6, w - 8, 22, 7); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 2;
  for (let px = x + 14; px < x + w - 10; px += 14){
    ctx.beginPath(); ctx.moveTo(px, y - 5); ctx.lineTo(px, y + 15); ctx.stroke();
  }
  ctx.fillStyle = "#463840";
  ctx.fillRect(x + 8, y + 14, 8, h - 20);
  ctx.fillRect(x + w - 16, y + 14, 8, h - 20);

  // el letrero, igual que el de las bases
  const rot = "TU COCHERA";
  const lw = rot.length * 11 + 34;
  ctx.fillStyle = "#2A1226";
  roundRect(x + w/2 - lw/2, y - 44, lw, 30, 11); ctx.fill();
  ctx.strokeStyle = "#3DDC97"; ctx.lineWidth = 3;
  roundRect(x + w/2 - lw/2, y - 44, lw, 30, 11); ctx.stroke();
  ctx.fillStyle = "#3DDC97";
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(rot, x + w/2, y - 29);
  ctx.restore();
}

/* ---- la Fusionadora ----
   Una máquina de barrio: dos tolvas arriba por donde entran los Florines, un
   tambor que gira y una boca abajo por donde sale el que resulta. */
function drawFusion(){
  const m = G.fusion;
  if (!m) return;
  const x = m.x, y = m.y, w = m.w, h = m.h;
  const dentro = !!G.player.inFusion;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(x + w/2, y + h + 6, w*.52, 14, 0, 0, 6.283); ctx.fill();
  /* el cuerpo */
  ctx.fillStyle = "#5A4E6E";
  roundRect(x, y, w, h, 14); ctx.fill();
  ctx.fillStyle = "#6E6088";
  roundRect(x + 6, y + 6, w - 12, h - 12, 10); ctx.fill();
  /* las dos tolvas de arriba */
  ctx.fillStyle = "#8B6BEE";
  for (const tx of [x + w*.24, x + w*.66]){
    ctx.beginPath();
    ctx.moveTo(tx - 26, y - 30); ctx.lineTo(tx + 26, y - 30);
    ctx.lineTo(tx + 12, y + 4);  ctx.lineTo(tx - 12, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(tx, y - 30, 26, 7, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#8B6BEE";
  }
  /* el tambor, que gira más rápido cuando estás dentro */
  const gira = G.t * (dentro ? 3.2 : 1.1);
  ctx.save();
  ctx.translate(x + w/2, y + h*.5);
  ctx.fillStyle = "#2A2236";
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#C9C2D8";
  for (let k = 0; k < 6; k++){
    const a = gira + k * 1.047;
    ctx.save(); ctx.rotate(a);
    ctx.fillRect(-3, -27, 6, 14);
    ctx.restore();
  }
  ctx.fillStyle = "#8B6BEE";
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.283); ctx.fill();
  ctx.restore();
  /* la boca de salida y las luces */
  ctx.fillStyle = "#2A2236";
  roundRect(x + w*.5 - 26, y + h - 16, 52, 22, 6); ctx.fill();
  for (let k = 0; k < 3; k++){
    const on = Math.sin(G.t * 4 + k * 2) > 0;
    ctx.fillStyle = on ? ["#FFD84D","#3DDC97","#FF6B90"][k] : "rgba(255,255,255,.18)";
    ctx.beginPath(); ctx.arc(x + 18 + k * 16, y + 16, 4.5, 0, 6.283); ctx.fill();
  }
  /* el cartel */
  ctx.fillStyle = dentro ? "#FFEFE2" : "#C9C2D8";
  ctx.font = "800 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FUSIONADORA", x + w/2, y - 42);
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(201,194,216,.85)";
  ctx.fillText(dentro ? "toca el botón" : "métete para juntar dos Florines", x + w/2, y - 26);
  ctx.restore();
}

function drawArmeria(){ for (const a of G.armerias) unaArmeria(a); }
function unaArmeria(a){
  ctx.save();
  ctx.fillStyle = "rgba(42,18,38,.62)";
  roundRect(a.x, a.y, a.w, a.h, 20); ctx.fill();
  ctx.strokeStyle = G.inShop ? "#FFEFE2" : "#FFC53D";
  ctx.lineWidth = 5; ctx.setLineDash([12,9]);
  roundRect(a.x, a.y, a.w, a.h, 20); ctx.stroke(); ctx.setLineDash([]);

  // toldo a rayas
  for (let i=0;i<8;i++){
    ctx.fillStyle = i%2 ? "#FF3D6E" : "#FFEFE2";
    ctx.fillRect(a.x+8+i*(a.w-16)/8, a.y-16, (a.w-16)/8, 16);
  }
  ctx.strokeStyle = "#5C2A18"; ctx.lineWidth = 3;
  ctx.strokeRect(a.x+8, a.y-16, a.w-16, 16);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFC53D";
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillText("ARMERÍA DE LA CUADRA", a.x+a.w/2, a.y+26);
  ctx.fillStyle = "rgba(255,239,226,.6)";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText(G.local2 ? "cerrada en modo dos jugadores"
               : !G.inShop ? "métete y toca el botón"
               : el.arm.hidden ? "toca 🧰 arriba (tecla T)" : "elige tu arma abajo ↓",
               a.x+a.w/2, a.y+46);

  // mostrador con los gadgets, en dos filas para que quepan los diez
  const gadgets = WEAPONS.slice(1);
  const porFila = Math.ceil(gadgets.length/2);
  ctx.font = "22px system-ui, sans-serif";
  gadgets.forEach((w,k) => {
    const fila = Math.floor(k/porFila), col = k % porFila;
    const x = a.x + 34 + col*((a.w-68)/(porFila-1));
    const y = a.y + 76 + fila*30 + Math.sin(G.t*2+k)*3;
    ctx.globalAlpha = G.ammo[w.id] > 0 ? 1 : .72;
    ctx.fillText(w.icon, x, y);
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

/* Los láseres del perímetro y la placa de activación */
function drawLaser(b){
  const L = b.laser; if (!L) return;
  const r = b.rect;
  ctx.save();

  if (L.activo > 0){
    const pulso = REDUCED ? .8 : .55 + Math.abs(Math.sin(G.t*4))*.45;
    // postes en las esquinas
    for (const [px,py] of [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]]){
      ctx.fillStyle = "#5C2A18";
      roundRect(px-6, py-16, 12, 26, 4); ctx.fill();
      ctx.fillStyle = "#FF3D6E";
      ctx.beginPath(); ctx.arc(px, py-18, 4.5, 0, 6.283); ctx.fill();
    }
    // el rayo del perímetro
    ctx.globalAlpha = pulso;
    ctx.strokeStyle = "#FF3D6E"; ctx.lineWidth = 3.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = pulso*.35;
    ctx.lineWidth = 11;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    // cuenta atrás
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "800 14px ui-monospace, monospace";
    const txt = "🔒 " + Math.ceil(L.activo) + " s";
    const w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = "rgba(27,12,26,.88)";
    roundRect(r.x+r.w/2-w/2, r.y+r.h+8, w, 22, 9); ctx.fill();
    ctx.strokeStyle = "#FF3D6E"; ctx.lineWidth = 2;
    roundRect(r.x+r.w/2-w/2, r.y+r.h+8, w, 22, 9); ctx.stroke();
    ctx.fillStyle = "#FF9EC4";
    ctx.fillText(txt, r.x+r.w/2, r.y+r.h+19);
  }

  // la placa: verde lista, gris recargando, y el aro de carga mientras la pisas
  const listo = L.activo <= 0 && L.recarga <= 0;
  ctx.fillStyle = listo ? "rgba(61,220,151,.22)" : "rgba(122,106,116,.2)";
  ctx.beginPath(); ctx.arc(L.x, L.y, L.r, 0, 6.283); ctx.fill();
  ctx.strokeStyle = listo ? "#3DDC97" : "#7A6A74";
  ctx.lineWidth = 3; ctx.setLineDash([7,5]);
  ctx.beginPath(); ctx.arc(L.x, L.y, L.r, 0, 6.283); ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(L.activo > 0 ? "🔒" : listo ? "🛡️" : "⏳", L.x, L.y-3);
  ctx.font = "800 9px system-ui, sans-serif";
  ctx.fillStyle = listo ? "#3DDC97" : "#9C8090";
  ctx.fillText(L.activo > 0 ? "ACTIVO" : listo ? money(LASER_PRECIO) : Math.ceil(L.recarga)+" s", L.x, L.y+15);
  if (L.carga > 0){
    ctx.strokeStyle = "#FFC53D"; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(L.x, L.y, L.r+5, -1.57, -1.57 + (L.carga/LASER_CARGA)*6.283);
    ctx.stroke();
  }
  ctx.restore();
}

/* El platillo que se lleva al abducido: baja, lo sube y se lo lleva */
function drawPlatillo(x, y, resto){
  const alto = 96 * clamp((10 - resto)/2.2, 0, 1);   // sube en los 2 primeros segundos
  const py = y - 30 - alto;
  ctx.save();
  // rayo tractor
  ctx.globalAlpha = .28;
  ctx.fillStyle = "#8B6BEE";
  ctx.beginPath();
  ctx.moveTo(x-13, py+6); ctx.lineTo(x+13, py+6);
  ctx.lineTo(x+24, y+10); ctx.lineTo(x-24, y+10);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // el platillo
  ctx.fillStyle = "#37D6E0";
  ctx.beginPath(); ctx.ellipse(x, py-4, 12, 9, 0, 3.14, 6.283); ctx.fill();
  ctx.fillStyle = "#8B6BEE";
  ctx.beginPath(); ctx.ellipse(x, py+2, 27, 8, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#241548";
  ctx.beginPath(); ctx.ellipse(x, py+5, 27, 5, 0, 0, 3.14); ctx.fill();
  // lucecitas
  for (let i=0;i<5;i++){
    const a = G.t*4 + i*1.26;
    ctx.fillStyle = i%2 ? "#FFE066" : "#5CE1EA";
    ctx.beginPath(); ctx.arc(x + Math.cos(a)*20, py+3, 2.2, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

function drawCascaras(){
  for (const c of G.cascaras){
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(0, 4, 11, 4, 0, 0, 6.283); ctx.fill();
    ctx.rotate(Math.sin(c.t*.6)*.15);
    ctx.fillStyle = "#FFD84D";
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 4.5, .35, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#E8B71E";
    ctx.beginPath(); ctx.ellipse(2, 1, 6, 2.6, .35, 0, 6.283); ctx.fill();
    ctx.restore();
  }
}

function drawPerros(){
  for (const d of G.perros){
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.beginPath(); ctx.ellipse(d.x, d.y+8, 14, 5, 0, 0, 6.283); ctx.fill();
    ctx.translate(d.x, d.y);
    ctx.scale(d.face, 1);
    const paso = Math.sin(d.walk)*2;
    ctx.fillStyle = "#C98B62";                       // patas
    ctx.fillRect(-8, 0, 3.4, 8+paso); ctx.fillRect(4, 0, 3.4, 8-paso);
    ctx.fillStyle = "#E8B08A";                       // cuerpo
    roundRect(-10, -8, 20, 11, 5); ctx.fill();
    roundRect(4, -16, 12, 12, 5); ctx.fill();        // cabeza
    ctx.fillStyle = "#C98B62";                       // orejas de chihuahua
    ctx.beginPath(); ctx.moveTo(6,-15); ctx.lineTo(4,-24); ctx.lineTo(11,-16); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(13,-15); ctx.lineTo(17,-23); ctx.lineTo(16,-14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#241209";                       // ojo y hocico
    ctx.fillRect(11, -12, 2.2, 2.2);
    ctx.beginPath(); ctx.arc(16, -8, 1.8, 0, 6.283); ctx.fill();
    if (d.muerde > 0){                               // dientes al morder
      ctx.fillStyle = "#FFEFE2";
      ctx.beginPath(); ctx.moveTo(14,-7); ctx.lineTo(18,-4); ctx.lineTo(13,-4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (d.life < 4 && !REDUCED){                     // avisa que se va a ir
      ctx.globalAlpha = .5 + Math.sin(G.t*9)*.4;
      ctx.fillStyle = "#E8B08A";
      ctx.font = "800 11px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(Math.ceil(d.life)+" s", d.x, d.y-32);
      ctx.globalAlpha = 1;
    }
  }
}

/* La alfombra del recorrido: se dibuja debajo de todo para que se vea por dónde
   va a pasar el desfile, y de paso explica sola la mecánica. */
function drawRuta(){
  /* La alfombra sigue el mismo recorrido que los Florines: bajada, ocho y
     salida. Se dibuja muestreando `puntoDelDesfile`, así que si el recorrido
     cambia en el motor la alfombra cambia sola y no hay dos verdades. */
  const trazar = () => {
    ctx.beginPath();
    for (let i = 0; i <= 220; i++){
      const q = puntoDelDesfile(G, i / 220);
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,92,134,.20)";
  ctx.lineWidth = 26;
  trazar();
  ctx.strokeStyle = "rgba(255,158,196,.34)";
  ctx.lineWidth = 3; ctx.setLineDash([12,14]);
  trazar();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPortal(){
  dibujarUnPortal(G.portal, true);
  dibujarUnPortal(G.portal.salida, false);
}

/* `entrada` decide el letrero: por arriba salen y por abajo se van. */
function dibujarUnPortal(P, entrada){
  ctx.save();
  // remolino: dos anillos girando en sentidos opuestos
  const gir = REDUCED ? 0 : G.t;
  for (let k=0;k<2;k++){
    ctx.strokeStyle = k ? "#FF5C86" : "#8B6BEE";
    ctx.lineWidth = 6 - k*2;
    ctx.beginPath();
    ctx.ellipse(P.x, P.y, P.r - k*8, (P.r - k*8)*.72,
                gir*(k ? -1.2 : .9), 0, 6.283);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(43,20,72,.85)";
  ctx.beginPath(); ctx.ellipse(P.x, P.y, P.r-13, (P.r-13)*.72, 0, 0, 6.283); ctx.fill();
  // chispas que salen del portal
  if (!REDUCED) for (let i=0;i<4;i++){
    const a = G.t*2.2 + i*1.57;
    ctx.fillStyle = i%2 ? "#5CE1EA" : "#FF9EC4";
    ctx.beginPath();
    ctx.arc(P.x + Math.cos(a)*(P.r+6), P.y + Math.sin(a)*(P.r+6)*.72, 2.4, 0, 6.283);
    ctx.fill();
  }

  // letrero
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const lw = 224;
  ctx.fillStyle = "#2A1226";
  roundRect(P.x-lw/2, P.y-P.r-46, lw, 34, 12); ctx.fill();
  ctx.strokeStyle = "#FF5C86"; ctx.lineWidth = 3;
  roundRect(P.x-lw/2, P.y-P.r-46, lw, 34, 12); ctx.stroke();
  ctx.fillStyle = "#FF9EC4";
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillText(entrada ? "PASARELA DE FLORINES" : "SALIDA DE LA PASARELA", P.x, P.y-P.r-29);
  ctx.fillStyle = "rgba(255,239,226,.6)";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText(entrada ? "de aquí salen · atrápalos al pasar" : "si llegan aquí, se te fueron",
               P.x, P.y+P.r+16);
  ctx.restore();
}

function drawDesfile(){
  for (const d of G.portal.desfile){
    const bob = Math.sin(d.florin.bob)*4;
    const sc = 1 + Math.max(0, d.pop)*.35;
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(d.x, d.y+16, 20, 7, 0, 0, 6.283); ctx.fill();
    drawFlorin(d.x, d.y + bob, .92*sc, d.florin, d.florin.bob);
    // píldora de rareza, para decidir a cuál vale la pena correrle
    const T = TIERS[d.florin.tier];
    const col = RAR_COLOR[T.rar] || "#FFEFE2";
    const etq = T.rar.toUpperCase();
    ctx.font = "800 10px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const rw = ctx.measureText(etq).width + 14;
    const ny = d.y - 52 + bob;
    ctx.fillStyle = "rgba(27,12,26,.86)";
    roundRect(d.x - rw/2, ny - 8, rw, 16, 8); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    roundRect(d.x - rw/2, ny - 8, rw, 16, 8); ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillText(etq, d.x, ny);
  }
}

function drawRuleta(){ for (const r of G.ruletas) unaRuleta(r); }
function unaRuleta(r){
  ctx.save();
  /* Es una ruleta: un círculo. Antes era una caja con una ruedita dibujada
     dentro, que es como poner la foto de una cosa en vez de la cosa. */
  ctx.fillStyle = "rgba(42,18,38,.62)";
  ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.fill();

  const ang = G.girando ? G.t*9 : G.t*.5;
  const R = r.r - 16;
  for (let i=0;i<12;i++){                       // los gajos de la rueda
    const a0 = ang + i*(6.283/12);
    ctx.fillStyle = i%3 === 0 ? "#FFC53D" : i%3 === 1 ? "#FF3D6E" : "#37D6E0";
    ctx.beginPath(); ctx.moveTo(r.x, r.y);
    ctx.arc(r.x, r.y, R, a0, a0 + 6.283/12); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = "rgba(42,18,38,.75)"; ctx.lineWidth = 2;
  for (let i=0;i<12;i++){                       // los radios
    const a0 = ang + i*(6.283/12);
    ctx.beginPath(); ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + Math.cos(a0)*R, r.y + Math.sin(a0)*R); ctx.stroke();
  }
  ctx.fillStyle = "#2A1226";                    // el eje
  ctx.beginPath(); ctx.arc(r.x, r.y, 11, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#FFEFE2";
  ctx.beginPath(); ctx.arc(r.x, r.y, 5, 0, 6.283); ctx.fill();

  ctx.strokeStyle = G.player.inRuleta ? "#FFEFE2" : "#FF3D6E";
  ctx.lineWidth = 6; ctx.setLineDash([14,10]);  // el aro de fuera
  ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#FFEFE2";                    // la aguja, arriba
  ctx.beginPath();
  ctx.moveTo(r.x, r.y - r.r + 20); ctx.lineTo(r.x - 9, r.y - r.r - 2);
  ctx.lineTo(r.x + 9, r.y - r.r - 2);
  ctx.closePath(); ctx.fill();

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#FF3D6E";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("RULETA DE FLORINES", r.x, r.y + r.r + 20);
  ctx.fillStyle = "rgba(255,239,226,.6)";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText(G.local2 ? "cerrada en modo dos jugadores"
               : !G.player.inRuleta ? "métete y toca el botón · " + money(RULETA_PRECIO)
               : el.rul.hidden ? "toca 🎰 arriba (tecla R)" : "gira abajo ↓",
               r.x, r.y + r.r + 38);
  ctx.restore();
}

function drawShadow(x,y,r){
  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.beginPath(); ctx.ellipse(x, y, r, r*.4, 0, 0, 6.283); ctx.fill();
}

/** mm:ss para las cuentas atrás cortas. */
function reloj(seg){
  const t = Math.max(0, Math.ceil(seg));
  return Math.floor(t/60) + ":" + String(t%60).padStart(2, "0");
}

function drawPerson(x, y, face, walk, opts){
  const { skin, shirt, hair, stun, carry, bandana, apron, frozen, alpha, cap, ears, montado } = opts;
  if (alpha != null) ctx.globalAlpha = alpha;
  const bounce = Math.sin(walk)*2.6;
  ctx.save();
  ctx.translate(x, y + (stun>0 ? Math.sin(G.t*40)*1.5 : 0));
  if (!montado) drawShadow(0, 22, 18);   // montado, la sombra la pone la montura

  /* Piernas. A caballo (o en bici) no caminas: las abres a los lados y quien
     mueve las patas es el animal. Si el jinete siguiera dando pasos en el aire
     parecería que lleva a la llama, no que va encima. */
  ctx.strokeStyle = "#3A2A44"; ctx.lineWidth = 6; ctx.lineCap = "round";
  if (montado){
    ctx.beginPath(); ctx.moveTo(-4,9); ctx.lineTo(-11, 21); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4,9);  ctx.lineTo(11, 21); ctx.stroke();
  } else {
    const sw = Math.sin(walk)*7;
    ctx.beginPath(); ctx.moveTo(-4,10); ctx.lineTo(-4+sw, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4,10);  ctx.lineTo(4-sw, 22); ctx.stroke();
  }

  // cuerpo
  ctx.fillStyle = shirt;
  roundRect(-11, -8+bounce*.3, 22, 20, 8); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 2;
  roundRect(-11, -8+bounce*.3, 22, 20, 8); ctx.stroke();
  if (apron){
    ctx.fillStyle = "rgba(255,239,226,.85)";
    roundRect(-7, -2+bounce*.3, 14, 13, 4); ctx.fill();
  }

  // brazos
  ctx.strokeStyle = skin; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(-10,-2); ctx.lineTo(-15-Math.sin(walk)*3, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10,-2);  ctx.lineTo(15+Math.sin(walk)*3, 7); ctx.stroke();

  // cabeza
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -20+bounce*.5, 11, 0, 6.283); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 2; ctx.stroke();
  // pelo
  ctx.fillStyle = hair;
  ctx.beginPath(); ctx.arc(0, -22+bounce*.5, 11, Math.PI*1.05, Math.PI*1.95); ctx.fill();
  if (bandana){
    ctx.fillStyle = bandana;
    ctx.fillRect(-11, -25+bounce*.5, 22, 5);
  }
  if (ears){                                   // orejas de gato (guiño a Acenix)
    const hy = -20+bounce*.5;
    ctx.fillStyle = ears;
    ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1.5;
    for (const sx of [-1,1]){
      ctx.beginPath();
      ctx.moveTo(sx*3, hy-9); ctx.lineTo(sx*9, hy-19); ctx.lineTo(sx*11, hy-6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  if (cap){                                    // gorra
    const hy = -20+bounce*.5;
    ctx.fillStyle = cap;
    ctx.beginPath(); ctx.arc(0, hy-4.5, 11, Math.PI, 0); ctx.fill();   // copa
    ctx.fillRect(-11, hy-6, 22, 2.6);                                  // banda
    ctx.fillRect(face>0 ? 9 : -20, hy-6, 11, 2.6);                     // visera
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(-11, hy-4.6, 22, 1.3);
  }
  // ojos
  ctx.fillStyle = "#2A1226";
  ctx.beginPath(); ctx.arc(-3.6*face+1, -20+bounce*.5, 1.7, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.arc(3.6*face+1, -20+bounce*.5, 1.7, 0, 6.283); ctx.fill();

  if (frozen > 0){                     // bloque de hielo
    ctx.fillStyle = "rgba(92,225,234,.32)";
    roundRect(-17, -34, 34, 58, 8); ctx.fill();
    ctx.strokeStyle = "rgba(191,233,255,.85)"; ctx.lineWidth = 2.5;
    roundRect(-17, -34, 34, 58, 8); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-10,-26); ctx.lineTo(4,-2); ctx.moveTo(10,-20); ctx.lineTo(-2,14); ctx.stroke();
  } else if (stun > 0){
    ctx.fillStyle = "#FFC53D"; ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    const a = G.t*6;
    ctx.fillText("★", Math.cos(a)*13, -36+Math.sin(a)*4);
    ctx.fillText("★", Math.cos(a+2.1)*13, -36+Math.sin(a+2.1)*4);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  if (carry) drawFlorin(x + 2, y - 46, .8, carry, G.t*2);
}

function drawChanclaSprite(x, y, spin, scale){
  ctx.save();
  ctx.translate(x,y); ctx.rotate(spin); ctx.scale(scale,scale);
  ctx.fillStyle = "#7A0F2E";
  ctx.beginPath(); ctx.ellipse(0,0,9,16,0,0,6.283); ctx.fill();
  ctx.fillStyle = "#FF3D6E";
  ctx.beginPath(); ctx.ellipse(0,-1,7,13.5,0,0,6.283); ctx.fill();
  ctx.strokeStyle = "#7A0F2E"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0,-2); ctx.lineTo(-5,-11); ctx.moveTo(0,-2); ctx.lineTo(5,-11); ctx.stroke();
  ctx.restore();
}

function drawGrabRing(){
  for (const jug of G.players) drawGrabRingDe(jug);
}
function drawGrabRingDe(jug){
  const g = jug.grab;
  if (!g.ped || g.t <= 0) return;
  const p = g.ped, frac = clamp(g.t/.55, 0, 1);
  ctx.save();
  ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,239,226,.25)";
  ctx.beginPath(); ctx.arc(p.x, p.y-16, 30, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = jug.shirt;
  ctx.beginPath(); ctx.arc(p.x, p.y-16, 30, -1.57, -1.57+frac*6.283); ctx.stroke();
  ctx.restore();
}

/* Guía de puntería: muestra a dónde va el arma seleccionada antes de lanzarla */
function drawAim(){
  /* En un partido, solo la tuya: seis punterías cruzando la cancha tapan la
     pelota, que es lo único que hay que mirar. */
  if (elPartido()){ drawAimDe(G.player); return; }
  for (const jug of G.players) drawAimDe(jug);
}
function drawAimDe(p){
  if (!G.started || G.over || G.paused) return;
  const w = WEAPONS[p.wsel];
  if (w.id === "refresco" || w.id === "capa") return;      // se usan sobre ti, no se apuntan
  const listo = (w.id === "chancla") ? p.chancla.state === "held" : p.ammo[w.id] > 0;
  if (!listo || p.cd > 0 || p.stun > 0) return;

  const d = rumboDeTiro(p), ox = p.x, oy = p.y - 12;
  ctx.save();
  ctx.globalAlpha = .8;
  ctx.strokeStyle = (G.local2 && w.id === "chancla") ? p.shirt : w.color;
  if (w.id === "taser"){                                   // radio de la descarga
    ctx.lineWidth = 2.5; ctx.setLineDash([9,7]);
    ctx.beginPath(); ctx.arc(ox, oy, 140, 0, 6.283); ctx.stroke();
  } else if (w.id === "secadora"){                          // cono de la ráfaga
    const a = Math.atan2(d.y, d.x);
    ctx.fillStyle = "rgba(191,233,255,.15)";
    ctx.beginPath(); ctx.moveTo(ox,oy); ctx.arc(ox, oy, 260, a-.7, a+.7); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2; ctx.setLineDash([9,7]); ctx.stroke();
  } else {                                                 // línea y mirilla
    const alcance = w.id === "hielo" ? 620 : 420;
    const tx = ox + d.x*alcance, ty = oy + d.y*alcance;
    ctx.lineWidth = 2.5; ctx.setLineDash([10,8]);
    ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(tx,ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(tx, ty, 7, 0, 6.283); ctx.stroke();
    ctx.fillStyle = w.color;
    ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,VW,VH);
  ctx.fillStyle = "#1B0C1A";
  ctx.fillRect(0,0,VW,VH);

  /* En un partido se ve la cancha ENTERA. Un fútbol en el que no ves el arco
     contrario no es un fútbol: es correr detrás de una pelota a ciegas. */
  if (elPartido()){
    const c = elPartido().cancha;
    /* En el estadio y en la calle se abre más: lo que hay ALREDEDOR —las
       tribunas, los carros, la gente— es medio chiste del sitio, y encuadrando
       solo la cancha no se ve nada de eso. */
    const marco = G.tenis || G.voley ? 260 : G.esc.id === "colegio" ? 180 : 620;
    ZOOM = clamp(Math.min(VW / (c.w + marco), VH / (c.h + marco)), .18, 1.05);
  }
  // Con dos jugadores el zoom se abre lo necesario para que ambos quepan
  else if (G.local2 && G.players.length > 1){
    const a = G.players[0], b = G.players[1];
    const ancho = Math.abs(a.x-b.x) + 420, alto = Math.abs(a.y-b.y) + 380;
    ZOOM = clamp(Math.min(VW/ancho, VH/alto), .34, 1.05);
  }
  const visW = VW/ZOOM, visH = VH/ZOOM;
  const laCancha = elPartido()?.cancha;
  const foco = laCancha
    ? { x: laCancha.x + laCancha.w / 2, y: laCancha.y + laCancha.h / 2 }
    : G.local2 && G.players.length > 1
      ? { x:(G.players[0].x+G.players[1].x)/2, y:(G.players[0].y+G.players[1].y)/2 }
      : G.player;
  cam.x = visW >= WORLD_W ? (WORLD_W-visW)/2 : clamp(foco.x-visW/2, 0, WORLD_W-visW);
  cam.y = visH >= WORLD_H ? (WORLD_H-visH)/2 : clamp(foco.y-visH/2, 0, WORLD_H-visH);

  ctx.setTransform(DPR*ZOOM, 0, 0, DPR*ZOOM, -cam.x*DPR*ZOOM, -cam.y*DPR*ZOOM);

  drawFloor();
  const corriendo = G.reglas?.modo === "carrera";
  const enPartido = G.reglas?.modo === "futbol";
  if (enPartido){
    drawCancha();                    // la cancha es lo único que importa
    drawHinchada();
  } else if (G.reglas?.modo === "tenis"){
    drawCanchaTenis();
  } else if (G.reglas?.modo === "voley"){
    drawCanchaVoley();
  } else if (corriendo){
    drawCircuito();                  // la pista es lo único que importa
  } else if (G.basquet){
    drawBasquet();
  } else if (G.bolos){
    drawBolos();
  } else if (G.lucha){
    drawLucha();
  } else if (G.dardos){
    drawDardos();
  } else if (G.voley){
    drawVoley();
  } else if (G.carreraObs){
    drawCarreraObs();
  } else if (G.laberinto){
    drawLaberinto();
  } else if (G.billar){
    drawBillar();
  } else if (G.hockey){
    drawHockey();
  } else {
    drawRuta();                      // la alfombra va debajo de todo
    drawCanchita();                  // debajo de la gente, encima del suelo
    for (const b of G.bases) drawBase(b);
    drawCochera();                   // debajo de los vehículos, que los pinta drawTrastos
    drawArmeria();
    drawFusion();
    drawPortal();
    if (!G.local2) drawRuleta();
  }
  drawCascaras();
  drawTrastos();
  drawFauna();
  if (!corriendo && !enPartido){ for (const b of G.bases) drawLaser(b); drawFiesta(); drawDesfile(); }
  drawGrabRing();
  drawAim();

  // florines en el suelo
  for (const g of G.ground){
    drawShadow(g.x, g.y+18, 15);
    drawFlorin(g.x, g.y + Math.sin(g.bob)*4, .95, g, g.bob);
    if (g.t < 3){
      ctx.fillStyle = "rgba(255,239,226,.8)";
      ctx.font = "700 12px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("¡en el suelo!", g.x, g.y+40);
    }
  }

  // abuelas
  for (const b of G.bases){
    const g = b.guard; if (!g) continue;
    drawPerson(g.x, g.y, g.face, g.walk, {
      skin:"#E8B48C", shirt:"#8E4A9E", hair:"#D8CFD4", stun:g.stun, carry:null, apron:true,
      frozen:g.frozen
    });
    // chancla en mano
    drawChanclaSprite(g.x + 17*g.face, g.y - 2, g.stun>0 ? G.t*8 : Math.sin(g.walk)*.5 + (g.face>0?.5:-.5), .8);
    if (g.alert > .2 && g.stun <= 0){
      ctx.fillStyle = "#FF3D6E"; ctx.font = "800 20px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.globalAlpha = g.alert;
      ctx.fillText("!", g.x, g.y-44);
      ctx.globalAlpha = 1;
    }
  }

  // ladrones
  for (const t of G.thieves){
    const K = LADRONES[t.who];
    drawPerson(t.x, t.y, t.face, t.walk, {
      skin:K.skin, shirt:K.shirt, hair:K.hair, cap:K.cap, ears:K.ears,
      stun:t.stun, carry:t.carry, frozen:t.frozen
    });
    // nombre debajo, para saber quién te está robando
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(15,7,14,.85)";
    ctx.strokeText(K.label, t.x, t.y+36);
    ctx.fillStyle = K.shirt;
    ctx.fillText(K.label, t.x, t.y+36);

    if (t.abducido > 0) drawPlatillo(t.x, t.y, t.abducido);

    if (t.state === "grab" && t.stun<=0){
      const frac = clamp(t.grabT/.85,0,1);
      ctx.strokeStyle = "#FF3D6E"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(t.x, t.y-40, 16, -1.57, -1.57+frac*6.283); ctx.stroke();
    }
  }

  drawPerros();

  // jugadores
  for (const p of G.players) drawJugador(p);

  function drawJugador(p){
  /* Montado, el jinete sube: es lo que hace que se lea "va encima" y no "lo
     lleva a cuestas". Su sombra la pone la montura, una sola para todo. */
  const M = monturaDe(p);
  if (M){
    ctx.save();
    ctx.translate(-p.face * (M.atras || 0), -M.sube);
  }
  dibujarJugadorCuerpo(p, M);
  if (M) ctx.restore();
  }

  function dibujarJugadorCuerpo(p, M){
  if (p.boost > 0 && !REDUCED){                 // estela del refresco
    ctx.strokeStyle = "rgba(255,158,196,.5)"; ctx.lineWidth = 4; ctx.lineCap = "round";
    for (let i=1;i<=3;i++){
      ctx.globalAlpha = .35/i;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx*0.02*i, p.y - p.vy*0.02*i);
      ctx.lineTo(p.x - p.vx*0.05*i, p.y - p.vy*0.05*i);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  /* En un partido la camiseta es del EQUIPO, no de cada uno: si cada jugador
     lleva su color, a los diez segundos nadie sabe a quién pasarle. */
  const camiseta = elPartido() && p.equipo != null ? CAMISETA[p.equipo] : p.shirt;
  drawPerson(p.x, p.y, p.face, M ? 0 : p.walk, {
    skin:"#F0C08A", shirt:camiseta, hair:"#3A1B33", stun:p.stun, carry:p.carry,
    montado: !!M,
    alpha: p.invis > 0 ? (p.invis < 2 ? .3 + Math.sin(G.t*14)*.15 : .34) : 1
  });
  /* Quién es: J1/J2 en el duelo de sofá, y su nombre cuando es un vecino que
     ha salido a jugar. Sin etiqueta, un rival es un muñeco de otro color y no
     se entiende que ese es el Marciano robándote. */
  /* En el partido, tú llevas una flecha y los demás nada: seis etiquetas
     corriendo tapan la pelota. */
  const quien = elPartido() ? (p.idx === 0 ? "TÚ" : null)
                         : (p.apodo || (G.local2 ? "J" + (p.idx + 1) : null));
  if (quien){
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(15,7,14,.85)";
    ctx.strokeText(quien, p.x, p.y+36);
    ctx.fillStyle = elPartido() && p.equipo != null ? CAMISETA[p.equipo] : p.shirt;
    ctx.fillText(quien, p.x, p.y+36);
  }
  if (p.escudo || p.inmune > 0){                // el paraguas abierto, o el margen tras aguantar
    ctx.strokeStyle = p.escudo ? "#5CE1EA" : "#FFEFE2";
    ctx.lineWidth = 3;
    ctx.globalAlpha = REDUCED ? .8 : .55 + Math.abs(Math.sin(G.t*3))*.45;
    ctx.beginPath(); ctx.ellipse(p.x, p.y-14, 28, 32, 0, 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = "15px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    /* Ahora el paraguas dura tres minutos, así que hay que poder ver cuánto
       queda: sin el reloj no sabes si te la puedes jugar. */
    const aviso = p.escudo > 0 ? "☂️ " + reloj(p.escudo) : "☂️";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(15,7,14,.85)";
    ctx.strokeText(aviso, p.x, p.y-52);
    ctx.fillStyle = p.escudo > 0 ? "#5CE1EA" : "#FFEFE2";
    ctx.fillText(aviso, p.x, p.y-52);
  }
  if (p.chancla.state === "held")
    drawChanclaSprite(p.x + 16*p.face, p.y - 4, (p.face>0?.6:-.6), .85);
  else
    drawChanclaSprite(p.chancla.x, p.chancla.y, p.chancla.spin, 1);
  }

  // balas de hielo
  for (const b of G.bolts){
    ctx.fillStyle = "#BFE9FF";
    ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(92,225,234,.75)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(b.x-b.vx*.02, b.y-b.vy*.02); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // ráfagas
  for (const bl of G.blasts){
    const f = clamp(bl.life/.42, 0, 1);
    ctx.globalAlpha = f;
    if (bl.kind === "cone"){
      ctx.fillStyle = "rgba(191,233,255,.45)";
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y);
      ctx.arc(bl.x, bl.y, 260*(1.15-f*.35), bl.ang-.7, bl.ang+.7);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = "#FFE066"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(bl.x, bl.y, (bl.r||140)*(1.1-f*.5), 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // partículas
  for (const q of puffs){
    ctx.globalAlpha = clamp(q.life*1.6,0,1);
    ctx.fillStyle = q.color;
    ctx.beginPath(); ctx.arc(q.x,q.y,q.r,0,6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // textos flotantes
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const q of pops){
    ctx.globalAlpha = clamp(q.life,0,1);
    ctx.font = "800 17px system-ui, sans-serif";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(15,7,14,.85)";
    ctx.strokeText(q.text, q.x, q.y);
    ctx.fillStyle = q.color;
    ctx.fillText(q.text, q.x, q.y);
  }
  ctx.globalAlpha = 1;

  /* ---- flecha al borde: por dónde te están robando ----
     draw() deja puesta la transformación del mundo, así que hay que volver a
     coordenadas de pantalla antes de pegar la flecha en el borde. */
  if (G.alarma && G.alarma.victimaIdx === 0 && !G.over){
    ctx.setTransform(DPR,0,0,DPR,0,0);
    const a = G.alarma;
    const sx = (a.x - cam.x) * ZOOM, sy = (a.y - cam.y) * ZOOM;
    const m = 46;                                  // margen desde el borde
    const fuera = sx < m || sx > VW-m || sy < m || sy > VH-m;
    if (fuera){
      const cxp = VW/2, cyp = VH/2;
      const dx = sx - cxp, dy = sy - cyp;
      const ang = Math.atan2(dy, dx);
      // el punto del rectángulo interior en esa dirección
      const k = Math.min((VW/2 - m) / Math.max(1e-3, Math.abs(Math.cos(ang))),
                         (VH/2 - m) / Math.max(1e-3, Math.abs(Math.sin(ang))));
      const px = cxp + Math.cos(ang)*k, py = cyp + Math.sin(ang)*k;
      const pulso = REDUCED ? 1 : 1 + Math.sin(G.t*9)*.12;
      ctx.save();
      ctx.translate(px, py); ctx.rotate(ang); ctx.scale(pulso, pulso);
      ctx.fillStyle = "#FF3D6E";
      ctx.beginPath();
      ctx.moveTo(19,0); ctx.lineTo(-8,-13); ctx.lineTo(-2,0); ctx.lineTo(-8,13);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#2A1226"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
      // la distancia, para saber si vale la pena correr
      const dist = Math.round(Math.hypot(a.x - G.player.x, a.y - G.player.y));
      ctx.font = "800 12px ui-monospace, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(15,7,14,.85)";
      ctx.strokeText(dist + " px", px, py + 26);
      ctx.fillStyle = "#FF9EC4";
      ctx.fillText(dist + " px", px, py + 26);
    }
  }

  drawMinimap();
}

function drawMinimap(){
  const w = mm.width, h = mm.height;
  /* Normalmente el mundo entero. En un mapa muy largo, no: el Multiverso mide
     86 400 x 2 100, y metido en 300 px de ancho sale una raya de cuarenta y uno
     a uno donde tu patio no llega ni a un píxel. Ahí se enseña una VENTANA
     alrededor de ti, del ancho de un mapa normal, que es lo que se puede
     recorrer sin que se te haga de noche. */
  const vw = miniAncho();
  const ox = miniLargo() ? clamp((G.player?.x ?? 0) - vw/2, 0, Math.max(0, WORLD_W - vw)) : 0;
  const sx = w/vw, sy = h/WORLD_H;
  mctx.clearRect(0,0,w,h);
  mctx.save();
  mctx.translate(-ox*sx, 0);
  mctx.fillStyle = "rgba(27,12,26,.6)";
  mctx.fillRect(0,0,w,h);
  for (const b of G.bases){
    mctx.fillStyle = b.locked ? "rgba(255,255,255,.04)"
                   : b.isPlayer ? "rgba(61,220,151,.3)" : "rgba(255,255,255,.08)";
    mctx.fillRect(b.rect.x*sx, b.rect.y*sy, b.rect.w*sx, b.rect.h*sy);
    mctx.strokeStyle = b.locked ? "#7A6A74" : b.color;
    mctx.lineWidth = 3;
    if (b.locked) mctx.setLineDash([5,5]);
    mctx.strokeRect(b.rect.x*sx, b.rect.y*sy, b.rect.w*sx, b.rect.h*sy);
    mctx.setLineDash([]);
    const n = occupied(b).length;
    if (n){
      mctx.fillStyle = b.color;
      mctx.font = "700 22px system-ui, sans-serif";
      mctx.textAlign = "center"; mctx.textBaseline = "middle";
      mctx.fillText(String(n), (b.rect.x+b.rect.w/2)*sx, (b.rect.y+b.rect.h/2)*sy);
    }
  }
  mctx.strokeStyle = "#FF3D6E"; mctx.lineWidth = 3;
  for (const a of G.armerias) mctx.strokeRect(a.x*sx, a.y*sy, a.w*sx, a.h*sy);
  mctx.strokeStyle = "#FF5C86"; mctx.lineWidth = 3;
  for (const P of [G.portal, G.portal.salida]){
    mctx.beginPath(); mctx.arc(P.x*sx, P.y*sy, 6, 0, 6.283); mctx.stroke();
  }
  if (!G.local2){
    mctx.strokeStyle = "#FFC53D"; mctx.lineWidth = 3;
    for (const ru of G.ruletas){
      mctx.beginPath(); mctx.arc(ru.x*sx, ru.y*sy, ru.r*sx, 0, 6.283); mctx.stroke();
    }
  }
  // los Florines del desfile, con el color de su rareza: se ve si vale la pena correr
  for (const d of G.portal.desfile){
    mctx.fillStyle = RAR_COLOR[TIERS[d.florin.tier].rar] || "#FFEFE2";
    mctx.beginPath(); mctx.arc(d.x*sx, d.y*sy, 4.5, 0, 6.283); mctx.fill();
  }

  for (const t of G.thieves){
    mctx.fillStyle = t.carry ? "#FF3D6E" : "#FFEFE2";
    mctx.beginPath(); mctx.arc(t.x*sx, t.y*sy, 4.5, 0, 6.283); mctx.fill();
  }
  for (const b of G.bases) if (b.guard){
    mctx.fillStyle = "#C58BD6";
    mctx.beginPath(); mctx.arc(b.guard.x*sx, b.guard.y*sy, 4, 0, 6.283); mctx.fill();
  }
  // patios con los láseres encendidos: borde rojo grueso
  for (const b of G.bases) if (laserActivo(b)){
    mctx.strokeStyle = "#FF3D6E"; mctx.lineWidth = 4;
    mctx.strokeRect(b.rect.x*sx, b.rect.y*sy, b.rect.w*sx, b.rect.h*sy);
  }
  // el patio que te están robando parpadea
  if (G.alarma && (REDUCED || Math.sin(G.t*10) > -.2)){
    const rb = G.bases.find(b => b.name === G.alarma.patio);
    if (rb){
      mctx.fillStyle = "rgba(255,61,110,.42)";
      mctx.fillRect(rb.rect.x*sx, rb.rect.y*sy, rb.rect.w*sx, rb.rect.h*sy);
      mctx.strokeStyle = "#FFEFE2"; mctx.lineWidth = 3;
      mctx.strokeRect(rb.rect.x*sx, rb.rect.y*sy, rb.rect.w*sx, rb.rect.h*sy);
    }
  }
  for (const d of G.perros){
    mctx.fillStyle = "#E8B08A";
    mctx.beginPath(); mctx.arc(d.x*sx, d.y*sy, 3.5, 0, 6.283); mctx.fill();
  }
  for (const jug of G.players){
    mctx.fillStyle = jug.shirt;
    mctx.beginPath(); mctx.arc(jug.x*sx, jug.y*sy, 6, 0, 6.283); mctx.fill();
    mctx.strokeStyle = "#0F070E"; mctx.lineWidth = 2; mctx.stroke();
  }
  mctx.restore();

  /* En qué zona estás. Sin esto, la ventana del minimapa del Multiverso es un
     trozo de mundo sin nombre: te dice dónde hay casas, no dónde estás tú. */
  if (G.esc.zonas && G.player){
    const z = G.esc.zonas.find(q => G.player.x >= q.x0 && G.player.x < q.x1);
    if (z){
      const nom = (ESCENARIOS.find(x => x.id === z.id)?.nombre || z.id).toUpperCase();
      mctx.font = "800 15px system-ui, sans-serif";
      mctx.textAlign = "center"; mctx.textBaseline = "top";
      mctx.lineWidth = 4; mctx.strokeStyle = "rgba(15,7,14,.92)";
      mctx.strokeText(nom, mm.width/2, 4);
      mctx.fillStyle = "#FFEFE2";
      mctx.fillText(nom, mm.width/2, 4);
    }
  }
}

/* ============================================================
   HUD de armas (HTML)
   ============================================================ */
/* ---- el desplegable de armas ----
   Trece armas en una fila se comían la pantalla, así que ahora solo se ve la que
   llevas y el resto vive en un menú. Las teclas 1-0 y Q/E siguen funcionando
   igual: el menú es otra forma de elegir, no la única. */
const chips = WEAPONS.map((w,i) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.setAttribute("role", "option");
  // teclas 1-9 para las nueve primeras, 0 para la décima, y Q/E para rotar por todas
  const tecla = i < 9 ? String(i+1) : i === 9 ? "0" : null;
  b.innerHTML = '<span class="ic">'+w.icon+'</span><span class="meta">'+
                '<span class="nm">'+w.name+'</span>'+
                '<span class="n"><span class="q"></span><i class="u"> usos</i></span></span>' +
                (tecla ? '<span class="tec">'+tecla+'</span>' : '');
  b.setAttribute("aria-label", w.name + (tecla ? " — tecla " + tecla : " — usa Q o E"));
  b.addEventListener("click", () => {
    Snd.unlock();
    elegirArma(i);
    abrirArmas(false);
  });
  el.wmenu.appendChild(b);
  return b;
});

function abrirArmas(abrir){
  const yaEsta = !el.wmenu.hidden;
  const quiero = abrir === undefined ? !yaEsta : abrir;
  if (quiero === yaEsta) return;
  el.wmenu.hidden = !quiero;
  el.wsel.classList.toggle("abierto", quiero);
  el.wselBtn.setAttribute("aria-expanded", String(quiero));
  if (quiero) chips[G.wsel]?.scrollIntoView({ block: "nearest" });
}

el.wselBtn.addEventListener("click", e => { e.stopPropagation(); Snd.unlock(); abrirArmas(); });
// Clic fuera y Escape lo cierran: es un menú, no una ventana.
document.addEventListener("pointerdown", e => {
  if (!el.wsel.contains(e.target)) abrirArmas(false);
});
window.addEventListener("keydown", e => { if (e.key === "Escape") abrirArmas(false); });

const rackBtns = WEAPONS.slice(1).map((w,k) => {
  const i = k+1;
  const b = document.createElement("button");
  b.className = "buy"; b.type = "button";
  b.innerHTML = '<span class="ic">'+w.icon+'</span><span>'+
                '<span class="nm">'+w.name+'</span><br>'+
                '<span class="pr">'+money(w.price)+' · +'+w.uses+' usos</span><br>'+
                '<span class="ds">'+w.desc+'</span></span>';
  b.addEventListener("click", () => {
    if (sala) sala.comprar(i); else comprarArma(G, G.player, i);
    renderWbar(); renderRack();
  });
  el.rack.appendChild(b);
  return b;
});

function renderWbar(){
  WEAPONS.forEach((w,i) => {
    const c = chips[i];
    const inf = w.id === "chancla";
    const n = inf ? "∞" : String(G.ammo[w.id]);
    const qEl = c.querySelector(".q");
    if (qEl.textContent !== n) qEl.textContent = n;
    c.querySelector(".u").style.display = inf ? "none" : "";
    c.classList.toggle("sel", G.wsel === i);
    c.classList.toggle("locked", !inf && G.ammo[w.id] <= 0);
  });
  const w = WEAPONS[G.wsel];
  const isCh = w.id === "chancla";
  el.wselIc.textContent = w.icon;
  el.wselNm.textContent = w.name;
  el.wselN.textContent  = isCh ? "∞" : G.ammo[w.id] + " usos";
  el.wselBtn.classList.toggle("vacio", !isCh && G.ammo[w.id] <= 0);
  el.wselBtn.setAttribute("aria-label", "Arma: " + w.name + ". Abrir la lista de armas.");
  el.wSvg.style.display = isCh ? "" : "none";
  el.wIcon.hidden = isCh;
  if (!isCh) el.wIcon.textContent = w.icon;
  el.throwB.setAttribute("aria-label", "Usar " + w.name);
}

function renderRack(){
  el.armMon.textContent = money(G.money);
  rackBtns.forEach((b,k) => { b.disabled = G.money < WEAPONS[k+1].price; });
  pintarGaraje();
}

/* ---- el mostrador del Garaje ----
   Se paga con el dinero de la partida, así que solo se compra jugando. Los
   precios son de aventura larga a propósito: el Amaru cuesta 750 000 porque
   tenerlo tiene que significar algo. */
const elGaraje = document.getElementById("garaje");
function pintarGaraje(){
  if (!elGaraje) return;
  const plata = G && G.started ? G.money : 0;
  elGaraje.innerHTML = "";
  for (const g of GARAJE){
    const v = VEHICULOS[g.tipo];
    const tuyo = tengoVehiculo(g.tipo);
    const b = document.createElement("button");
    b.className = "buy" + (tuyo ? " tuyo" : "");
    b.type = "button";
    b.disabled = tuyo || plata < g.precio;
    b.innerHTML =
      '<span class="ic">' + v.icon + '</span>' +
      '<span><span class="nm">' + v.label + '</span><br>' +
      (tuyo ? '<span class="ya">✔ ya es tuyo</span>'
            : '<span class="pr">' + money(g.precio) + '</span>') +
      '<br><span class="ds">' + g.comoSale + '</span></span>';
    b.addEventListener("click", () => {
      if (tengoVehiculo(g.tipo) || !G.started || G.money < g.precio) return;
      /* En una sala no se compra: el dinero lo lleva el servidor y una compra
         local se la tragaría el siguiente resync. */
      if (sala){ pop(G.player.x, G.player.y - 80, "El Garaje es de tu partida, no de la sala", "#FF6B90"); return; }
      G.player.money -= g.precio;
      ganarVehiculo(g.tipo, "🔧 " + v.icon + " ¡" + v.label + " es tuyo!");
      renderRack();
    });
    elGaraje.appendChild(b);
  }
}

/* ============================================================
   HUD
   ============================================================ */
/** Los tres rótulos de arriba: los de siempre, o los del partido. */
function rotularTarjetas(enPartido){
  document.querySelector(".card.money .label").textContent = enPartido ? "Tiempo" : "Dinero";
  document.querySelector(".card.rate .label").textContent = enPartido ? "Cómo va" : "Ingresos";
  document.querySelector(".card.stolen .label").textContent =
    enPartido ? "Chancletazos" : "Te robaron";
}

function hud(){
  if (G.local2){
    const a = G.players[0], b = G.players[1];
    el.j2.hidden = false;
    el.money.textContent = money(a.money);
    el.rate.textContent  = money(playerIncome(G, a)) + "/s";
    el.j2money.textContent = money(b.money);
    el.j2rate.textContent  = money(playerIncome(G, b)) + "/s";
    const va = vitrinaDe(G, a), vb = vitrinaDe(G, b);
    el.bar.style.width   = clamp(va.llenos/va.huecos*100, 0, 100).toFixed(1) + "%";
    el.j2bar.style.width = clamp(vb.llenos/vb.huecos*100, 0, 100).toFixed(1) + "%";
    el.goal.textContent  = va.llenos + " / " + va.huecos;
    el.lost.textContent  = a.stats.lost + " / " + b.stats.lost;
    bau.boton.hidden = !(isTouch && florinAlLado() && bau.caja.hidden);
    bau.soltar.hidden = !(G.player.carry && bau.caja.hidden);
    bau.bajar.hidden = !montado();
    return;
  }
  el.j2.hidden = true;
  /* ---- el marcador de la pichanga ----
     Se cuelga de la tarjeta de la meta, que es la que sobra en un partido: no
     hay vitrina que llenar. */
  /* Los rótulos de las tarjetas cambian en un partido y hay que DEVOLVERLOS al
     salir: volviendo al barrio, el dinero seguía debajo de un cartel que decía
     "Tiempo". */
  rotularTarjetas(!!elPartido());
  /* El botón de patear solo existe en un partido, y su barra se llena mientras
     aguantas: sin verla, cargar es adivinar. En el tenis el mismo botón es la
     raqueta, y la carga manda el fondo en vez de la fuerza. */
  const enPartido = !!elPartido() && G.started && !G.over;
  elPateo.hidden = !enPartido;
  /* En el tenis el mismo botón es la raqueta: con la pelotita se entiende sin
     leer nada. */
  if (enPartido) elPateo.querySelector(".ic").textContent =
    G.tenis ? "🎾" : G.voley ? "🏐" : "⚽";
  if (enPartido && pateo.desde)
    elPateo.querySelector(".carga b").style.width = (fuerzaDePateo() * 100).toFixed(0) + "%";
  if (G.reglas?.modo === "futbol"){
    const f = G.futbol;
    el.goalLabel.textContent = f.saque > 0 ? "¡Saque del centro!" : "Primero a " + f.meta;
    el.goal.textContent = f.goles[0] + " – " + f.goles[1];
    el.bar.style.width = clamp((1 - f.reloj / 240) * 100, 0, 100).toFixed(1) + "%";
    el.goalCard.classList.toggle("fiesta", f.ultimoGol != null && f.saque > 0);
    el.money.textContent = mmss(Math.max(0, f.reloj));
    el.rate.textContent = f.goles[0] > f.goles[1] ? "Vas ganando"
                        : f.goles[0] < f.goles[1] ? "Vas perdiendo" : "Empate";
    el.lost.textContent = G.stats.hits;
    el.alarma.hidden = true;
    bau.boton.hidden = true; bau.soltar.hidden = true; bau.bajar.hidden = true;
    cerrarArmasRapidas();
    const w1 = WEAPONS[G.wsel];
    el.throwB.classList.toggle("cool", G.cd > 0 ||
      (w1.id === "chancla" ? G.chancla.state !== "held" : G.ammo[w1.id] <= 0));
    pintarAccion();
    return;
  }

  /* ---- el marcador del tenis ----
     Mismas tarjetas que la pichanga: no hay vitrina que llenar ni dinero que
     contar, así que la de la meta lleva los puntos y la del dinero, el reloj
     de lo que llevas jugado. */
  if (G.reglas?.modo === "tenis"){
    const t = G.tenis;
    const mio = G.player.equipo ?? 0;
    el.goalLabel.textContent = t.saque > 0
      ? (t.sacador === mio ? "¡Tu saque!" : "Saca el otro")
      : "Primero a " + t.meta;
    el.goal.textContent = t.puntos[mio] + " – " + t.puntos[1 - mio];
    el.bar.style.width = clamp(t.puntos[mio] / t.meta * 100, 0, 100).toFixed(1) + "%";
    el.goalCard.classList.toggle("fiesta", t.saque > 0 && t.ultimoPunto != null);
    el.money.textContent = mmss(G.t);
    el.rate.textContent = t.puntos[mio] > t.puntos[1 - mio] ? "Vas ganando"
                        : t.puntos[mio] < t.puntos[1 - mio] ? "Vas perdiendo" : "Empate";
    el.lost.textContent = G.stats.hits;
    el.alarma.hidden = true;
    bau.boton.hidden = true; bau.soltar.hidden = true; bau.bajar.hidden = true;
    cerrarArmasRapidas();
    pintarAccion();
    return;
  }

  /* ---- el marcador del vóley ----
     Igual que el del tenis, más un dato que solo existe aquí: los toques que
     le quedan a tu lado. Sin verlo, el tercer toque —que cruza sí o sí— es una
     sorpresa en vez de una decisión. */
  if (G.reglas?.modo === "voley"){
    const v = G.voley;
    const mio = G.player.equipo ?? 0;
    el.goalLabel.textContent = v.saque > 0
      ? (v.sacador === mio ? "¡Tu saque!" : "Saca el otro")
      : v.ultimoToque === mio && !v.enviada
        ? "Toques: " + v.toques + " de " + VOLEY_TOQUES
        : "Primero a " + v.meta;
    el.goal.textContent = v.puntos[mio] + " – " + v.puntos[1 - mio];
    el.bar.style.width = clamp(v.puntos[mio] / v.meta * 100, 0, 100).toFixed(1) + "%";
    el.goalCard.classList.toggle("fiesta", v.saque > 0 && v.ultimoPunto != null);
    el.money.textContent = mmss(G.t);
    el.rate.textContent = v.puntos[mio] > v.puntos[1 - mio] ? "Vas ganando"
                        : v.puntos[mio] < v.puntos[1 - mio] ? "Vas perdiendo" : "Empate";
    el.lost.textContent = G.stats.hits;
    el.alarma.hidden = true;
    bau.boton.hidden = true; bau.soltar.hidden = true; bau.bajar.hidden = true;
    cerrarArmasRapidas();
    pintarAccion();
    return;
  }

  const inc = playerIncome(G, G.player);
  el.money.textContent = money(G.money);
  el.rate.textContent = money(inc) + "/s";
  /* La barra mide la VITRINA, no el dinero: cuántos huecos llenos de cuántos.
     El dinero ya no sirve de meta — entre la vitrina más pobre y la más rica
     hay 174 000× y ninguna cifra es interesante en los dos extremos. */

  if (G.reglas?.modo === "carrera"){
    /* Corriendo, la barra de la vitrina no dice nada: lo que importa es en qué
       vuelta vas y en qué puesto. */
    const r = G.player.carrera || { vuelta: 0 };
    const n = G.players.length;
    el.goalLabel.textContent = puestoDe(G, G.player) + "º de " + n;
    el.goal.textContent = "Vuelta " + Math.min(r.vuelta + 1, VUELTAS) + " / " + VUELTAS;
    el.bar.style.width = clamp((r.vuelta / VUELTAS) * 100, 0, 100).toFixed(1) + "%";
    el.goalCard.classList.toggle("fiesta", r.fin >= 0);
    el.lost.textContent = G.stats.hits;
    el.alarma.hidden = true;
    bau.boton.hidden = true; bau.soltar.hidden = true; bau.bajar.hidden = true;
    cerrarArmasRapidas();
    const w0 = WEAPONS[G.wsel];
    el.throwB.classList.toggle("cool", G.cd > 0 ||
      (w0.id === "chancla" ? G.chancla.state !== "held" : G.ammo[w0.id] <= 0));
    pintarAccion();
    pintarItem();
    return;
  }
  elItem.hidden = true;
  const v = vitrinaDe(G, G.player);
  el.goal.textContent = v.llenos + " / " + v.huecos;
  el.bar.style.width = clamp(v.llenos/v.huecos*100, 0, 100).toFixed(1) + "%";
  el.goalLabel.textContent = v.nivel > 0
    ? nombreDeHito(v.nivel).replace(/[¡!]/g, "")
    : G.hitoN > 0 ? "Vuelve a llenarla" : "Llena tu vitrina";
  el.goalCard.classList.toggle("fiesta", G.fiesta > 0);
  el.lost.textContent = G.stats.lost;

  // banda de alarma: quién te roba y de qué patio (solo si la víctima eres tú)
  if (G.alarma && G.alarma.victimaIdx === 0){
    el.alarma.hidden = false;
    /* Dos avisos distintos: forcejeando todavía se puede evitar; llevándoselo
       hay que salir corriendo detrás. La alarma ya no se apaga sola a los 0.8 s
       — sigue hasta que llegue a su casa o le quites el Florín. */
    el.alarmaTxt.innerHTML = G.alarma.llevandose
      ? "<b>" + G.alarma.quien + "</b> se lleva tu Florín de <b>" + G.alarma.patio + "</b> · ¡a por él!"
      : "<b>" + G.alarma.quien + "</b> te está robando en <b>" + G.alarma.patio + "</b>";
  } else el.alarma.hidden = true;

  const alLado = florinAlLado();
  bau.boton.hidden = !(isTouch && alLado && bau.caja.hidden);
  bau.soltar.hidden = !(G.player.carry && bau.caja.hidden);
  bau.bajar.hidden = !montado();

  const w = WEAPONS[G.wsel];
  const notReady = G.cd > 0 ||
    (w.id === "chancla" ? G.chancla.state !== "held" : G.ammo[w.id] <= 0);
  el.throwB.classList.toggle("cool", notReady);

  pintarAccion();
  /* Los paneles abiertos se repintan cada frame. La tira de la ruleta se movía
     solo al abrir y al pulsar: se quedaba en "Girando…" para siempre porque
     nadie volvía a mirar `G.girando`. */
  if (!el.rul.hidden) renderRuleta();
  if (!el.arm.hidden) renderRack();
  if (!elFiestaCartel.hidden || (G.fiesta && enFiesta(G))) pintarCartelFiesta();
}

/* ============================================================
   Flujo del juego
   ============================================================ */
function startGame(modo){
  if (sala) salirDeLaSala();
  const m = modo === 2 ? 2 : (modo === 1 ? 1 : (G && G.local2 ? 2 : 1));
  G = nuevaPartida(m);
  G.started = true;
  /* Del menú se sale directo a un minijuego cuando se eligió uno. Es la MISMA
     puerta que la del mundo: una partida con ese modo, y el motor arma su
     cancha. */
  const m2 = modoElegido();
  if (MINIJUEGOS[m2]) {
    G = m2 === "futbol"
      ? nuevaPartidaMotor(1, "colegio", false, "normal", [], 0, ladoSel, "colegio")
      : nuevaPartidaMotor(1, "colegio", false, "normal", [], 0, 0, "colegio",
                          m2 === "tenis" ? 1 : 0, m2 === "tenis" ? null : m2);
    G.started = true;
  }
  aLaCancha();                       // deja la pantalla lista, sea cual sea el G
  if (MINIJUEGOS[m2]) decir(MINIJUEGOS[m2], "bien");
}

/** Deja la pantalla lista para jugar con el G que sea: nuevo o revivido. */
function aLaCancha(){
  G.paused = false;
  G.over = false;
  fiestaPuestaEn = null;          // partida nueva: la fiesta hay que volver a ponerla
  aplicarFiesta();
  guardaEn = GUARDA_CADA;
  pops = []; puffs = [];
  document.getElementById("app").classList.toggle("dos", !!G.local2);
  document.getElementById("app").classList.toggle("partido",
    !!elPartido());
  el.title.hidden = true;
  el.end.hidden = true;
  el.arm.hidden = true;
  el.rul.hidden = true;
  el.alarma.hidden = true;
  abrirArmas(false);
  invalidarSuelo();                 // el decorado se repinta para el escenario nuevo
  document.getElementById("album").hidden = true;
  el.pause.textContent = "⏸";
  renderWbar(); renderRack(); renderBotonesPanel();
  Snd.unlock();
}

/** Cómo se llama el que va delante: su apodo en una sala, "un bot" si no. */
function nombreDeCorredor(p){
  if (sala && p.idx === sala.estado.idx) return "tú";
  const quien = sala?.estado.gente?.find(q => q.idx === p.idx && q.conectado);
  return quien ? quien.apodo : "un bot";
}

function endGame(ganador){
  G.over = true;
  const won = !!ganador;
  /* Los rótulos del cartel se reponen SIEMPRE al entrar: hay cuatro finales
     distintos (aventura, duelo, carrera y pichanga) y cada uno rotula lo suyo.
     Sin esto, una carrera después de un partido decía "Del otro equipo". */
  document.getElementById("lbHits").textContent = "Vecinos noqueados";

  /* Una carrera no se cuenta en Florines robados: se cuenta en puesto y en
     tiempo. Con el mismo cartel de siempre parecía que habías perdido. */

  if (G.reglas?.modo === "carrera"){
    /* En una sala el resultado lo dice el mundo del SERVIDOR, no `G`: `G` se
       reemplaza cada frame y en el momento del final puede no ser el de la
       carrera. Se vio en producción — el que llegó último leyó "¡Primero!" y
       un tiempo de 0:00, que era el reloj de otra partida. */
    const M = sala?.estado.mundo || G;
    const yo = sala ? M.players[sala.estado.idx] : G.player;
    const orden = puestosDeCarrera(M);
    const mio = orden.indexOf(yo) + 1;
    const gané = mio === 1;
    document.getElementById("endEyebrow").textContent = "Bandera a cuadros";
    document.getElementById("endTitle").innerHTML = gané
      ? "¡<em>Primero</em>!"
      : "Llegaste <em>" + mio + "º</em>";
    document.getElementById("endSub").textContent = gané
      ? "Tres vueltas y nadie te pasó. En " + mmss(M.t) + "."
      : "Ganó " + nombreDeCorredor(orden[0]) +
        ". Tú entraste " + mio + "º de " + M.players.length + ".";
    document.getElementById("lbSteals").textContent = "Puesto";
    document.getElementById("lbRate").textContent = "Recorrido";
    document.getElementById("stSteals").textContent = mio + "º";
    document.getElementById("stHits").textContent = yo.stats.hits;
    document.getElementById("stTime").textContent = mmss(M.t);
    document.getElementById("stRate").textContent = VUELTAS + " vueltas";
    el.end.hidden = false;
    if (gané) Snd.win();
    return;
  }
  if (G.local2 && ganador){
    const perdedor = G.players.find(p => p !== ganador);
    document.getElementById("endEyebrow").textContent = "Duelo terminado";
    document.getElementById("endTitle").innerHTML =
      "¡Gana <em>J" + (ganador.idx+1) + "</em>!";
    const vp = vitrinaDe(G, perdedor);
    document.getElementById("endSub").textContent =
      "J" + (ganador.idx+1) + " llenó su vitrina entera mientras J" + (perdedor.idx+1) +
      " se quedó en " + vp.llenos + " de " + vp.huecos +
      ". Las abuelas del barrio no quieren volver a ver a ninguno de los dos.";
    document.getElementById("stSteals").textContent = ganador.stats.steals + " / " + perdedor.stats.steals;
    document.getElementById("stHits").textContent   = ganador.stats.hits + " / " + perdedor.stats.hits;
    document.getElementById("stTime").textContent   = mmss(G.t);
    document.getElementById("stRate").textContent   = money(playerIncome(G, ganador)) + "/s";
    el.end.hidden = false;
    Snd.win();
    return;
  }
  /* ---- cómo acabó la pichanga ----
     Un partido no se cuenta en Florines robados: se cuenta en goles. Con el
     cartel de siempre, ganar 3-1 decía "Te dejaron pelado". */
  if (G.reglas?.modo === "futbol"){
    const f = G.futbol;
    const mio = G.player.equipo ?? 0;
    const ganaste = f.ganador === mio;
    const empate = f.ganador == null;
    document.getElementById("lbSteals").textContent = "Goles de tu equipo";
    document.getElementById("lbHits").textContent = "Del otro equipo";
    document.getElementById("lbRate").textContent = "Chancletazos que diste";
    document.getElementById("endEyebrow").textContent = "Se acabó la pichanga";
    document.getElementById("endTitle").innerHTML = empate
      ? "Quedaron <em>iguales</em>"
      : ganaste ? "¡<em>Ganaron</em> ustedes!" : "Ganaron <em>ellos</em>";
    document.getElementById("endSub").textContent = empate
      ? "Cuatro minutos y nadie se llevó nada. Otra y desempatan."
      : ganaste ? "A cobrar en el recreo." : "La revancha es ahí mismo, en el patio.";
    document.getElementById("stSteals").textContent = f.goles[mio];
    document.getElementById("stHits").textContent = f.goles[1 - mio];
    document.getElementById("stTime").textContent = mmss(G.t);
    document.getElementById("stRate").textContent = G.stats.hits;
    document.getElementById("btnVolverBarrio").hidden = !aventuraEnEspera;
    el.end.hidden = false;
    if (ganaste) Snd.win();
    return;
  }

  /* ---- cómo acabó el vóley ---- */
  if (G.reglas?.modo === "voley"){
    const v = G.voley;
    const mio = G.player.equipo ?? 0;
    const ganaste = v.ganador === mio;
    document.getElementById("lbSteals").textContent = "Tus puntos";
    document.getElementById("lbHits").textContent = "Los del otro";
    document.getElementById("lbRate").textContent = "Chancletazos que diste";
    document.getElementById("endEyebrow").textContent = "Se acabó el partido";
    document.getElementById("endTitle").innerHTML = ganaste
      ? "¡<em>Ganaron</em> ustedes!" : "Ganaron <em>ellos</em>";
    document.getElementById("endSub").textContent = ganaste
      ? "Ni una tocó tu arena." : "El suelo no perdona. Otra y lo das vuelta.";
    document.getElementById("stSteals").textContent = v.puntos[mio];
    document.getElementById("stHits").textContent = v.puntos[1 - mio];
    document.getElementById("stTime").textContent = mmss(G.t);
    document.getElementById("stRate").textContent = G.stats.hits;
    document.getElementById("btnVolverBarrio").hidden = !aventuraEnEspera;
    el.end.hidden = false;
    if (ganaste) Snd.win();
    return;
  }

  /* ---- cómo acabó el tenis ---- */
  if (G.reglas?.modo === "tenis"){
    const t = G.tenis;
    const mio = G.player.equipo ?? 0;
    const ganaste = t.ganador === mio;
    document.getElementById("lbSteals").textContent = "Tus puntos";
    document.getElementById("lbHits").textContent = "Los del otro";
    document.getElementById("lbRate").textContent = "Chancletazos que diste";
    document.getElementById("endEyebrow").textContent = "Se acabó el partido";
    document.getElementById("endTitle").innerHTML = ganaste
      ? "¡<em>Ganaste</em> el partido!" : "Te <em>ganaron</em>";
    document.getElementById("endSub").textContent = ganaste
      ? "Con la chancla en la mano y todo."
      : "La red no perdona. Otra y lo das vuelta.";
    document.getElementById("stSteals").textContent = t.puntos[mio];
    document.getElementById("stHits").textContent = t.puntos[1 - mio];
    document.getElementById("stTime").textContent = mmss(G.t);
    document.getElementById("stRate").textContent = G.stats.hits;
    document.getElementById("btnVolverBarrio").hidden = !aventuraEnEspera;
    el.end.hidden = false;
    if (ganaste) Snd.win();
    return;
  }

  document.getElementById("lbSteals").textContent = "Los que robaste tú";
  document.getElementById("lbHits").textContent = "Vecinos noqueados";
  document.getElementById("lbRate").textContent = "Ingresos finales";
  document.getElementById("endEyebrow").textContent = won ? "Meta cumplida" : "Fin del patio";
  document.getElementById("endTitle").innerHTML = won ? "¡Vitrina <em>llena</em>!" : "Te dejaron <em>pelado</em>";
  document.getElementById("endSub").textContent = won
    ? "Llenaste tu vitrina entera. Las abuelas del vecindario no te quieren volver a ver."
    : "Los vecinos se llevaron todo.";
  document.getElementById("stSteals").textContent = G.stats.steals;
  document.getElementById("stHits").textContent = G.stats.hits;
  document.getElementById("stTime").textContent = mmss(G.t);
  document.getElementById("stRate").textContent = money(playerIncome(G, G.player)) + "/s";
  document.getElementById("btnVolverBarrio").hidden = !aventuraEnEspera;
  el.end.hidden = false;
  if (won) Snd.win();
}

/* ============================================================
   Loop
   ============================================================ */
let last = performance.now();
function frame(now){
  const dt = Math.min(.05, (now-last)/1000);
  last = now;
  if (G.started && !G.paused && !G.over){
    if (sala){
      /* En una sala el mundo lo lleva el servidor: aquí solo se mandan las
         teclas y se acomoda lo que llega. Nada de `avanzar`: si el cliente
         simulara, cada uno vería un juego distinto. */
      const ent = entradas()[0];
      sala.entrada(ent.mover, ent.apunta);
      sala.aplicar(dt, ent);
      G = conAtajosMotor(sala.estado.mundo, sala.estado.idx);
    } else {
      avanzar(G, entradas(dt), dt);
      consumirEventos();
      guardarSiTocaEn(dt);
    }
  }
  animarParticulas(dt);
  animarFauna(dt);
  draw();
  hud();
  requestAnimationFrame(frame);
}







/* Enganche de pruebas. Vive SOLO en desarrollo: Vite evalúa
   `import.meta.env.DEV` a false al construir y borra el bloque entero, así que
   no llega a producción. Está aquí porque probar la Ruleta o ir montado exige
   colocar al jugador en un sitio concreto, y hacerlo a base de flechas es
   irrepetible. */
if (import.meta.env.DEV) {
  window.prueba = {
    estado: () => G,
    ir: (x, y) => { G.player.x = x; G.player.y = y; },
    aLaRuleta: () => { G.player.x = G.ruletas[0].x; G.player.y = G.ruletas[0].y; },
    aLaArmeria: () => { const a = G.armerias[0]; G.player.x = a.x + a.w/2; G.player.y = a.y + a.h/2; },
    montar: tipo => { const v = G.trastos.find(t => t.tipo === tipo); if (!v) return null;
                      G.player.x = v.x; G.player.y = v.y; return v.tipo; },
    dinero: n => { G.player.money = n; },
    vehiculo: (tipo, quien = 0) => { darleVehiculo(G, G.players[quien], tipo); return tipo; },
    cargar: tier => { G.player.carry = nuevoFlorin(G, tier ?? 3); },
    /* Cuántos mosaicos de suelo hay guardados y cuánto pesan: es lo que se
       sale de las manos en un mapa enorme. */
    suelo: () => ({ mosaicos: mosaicos.size, mb: +(mosaicos.size * 4).toFixed(1) }),
    /* Pintar de verdad un tramo del mundo, para medir. */
    barrer: (desde, hasta, paso = 900) => {
      const t0 = performance.now();
      let trozos = 0;
      for (let x = desde; x < hasta; x += paso){
        G.player.x = x;
        const cx = Math.floor(x / 1024);
        for (let cy = 0; cy < Math.ceil(WORLD_H / 1024); cy++){ trozoDeSuelo(cx, cy); trozos++; }
      }
      return { ms: Math.round(performance.now() - t0), trozos, guardados: mosaicos.size };
    },
    /* El panel de fiestas sin ser admin: para mirar cómo queda. Las llamadas
       a la API las sigue rechazando el servidor, que es quien manda. */
    panelDeFiestas: () => { pintarAdmin(); elAdmin.hidden = false; },
    /* La respuesta del servidor, a mano: sirve para ver el AVISO de la que
       viene, que si no habría que esperar a que llegue la hora. */
    fiestaCruda: payload => { fiestaViva = payload; fiestaDesde = Date.now();
                             fiestaPuestaEn = null; aplicarFiesta(); pintarCartelFiesta();
                             return document.getElementById("fiestaCartel").textContent; },
    /* Una fiesta sin servidor, para ver las luces y lo que baja. */
    fiesta: (segundos = 120, florines = [{ tier: TIERS.length - 1, variant: "galaxia" }]) => {
      fiestaViva = { ahora: { id: "prueba", nombre: "Noche de prueba",
                              florines: florines.map(f => ({ tier: f.tier, variante: f.variant })) },
                     segundosQueQuedan: segundos, regaloPendiente: false };
      fiestaDesde = Date.now();
      fiestaPuestaEn = null;
      aplicarFiesta(); pintarCartelFiesta();
      return enFiesta(G);
    },
    yo: () => ({ x: Math.round(G.player.x), y: Math.round(G.player.y),
                 dinero: Math.round(G.player.money), carry: !!G.player.carry,
                 suelo: G.ground.length, montado: G.player.montado,
                 inShop: G.player.inShop, inRuleta: G.player.inRuleta,
                 girando: !!G.girando }),
  };
}

resize();
G = nuevaPartida(1);
renderWbar(); renderRack(); renderBotonesPanel();
requestAnimationFrame(frame);
