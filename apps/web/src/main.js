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
  inRect, laserActivo, lerp, money, nuevaPartidaMotor, nuevoFlorin, occupied,
  occupiedDe, orbitaDelCentro, playerIncome, puntoDelDesfile, rumboDeTiro,
  bajarse, conAtajosDeSala as conAtajosMotor, nombreDeHito, patiosDe, precioDeVenta,
  puestoDe, puestosDeCarrera, VUELTAS, CIRCUITOS, pensarBot, GARAJE, VEHICULOS,
  TRASTOS_ESCENARIO, darleVehiculo,
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
   Vive aquí y no en el motor porque es cosa de la portada, no del juego. */
let modoLocal = "aventura";

function nuevaPartida(modo){
  pops = []; puffs = [];
  const G2 = nuevaPartidaMotor(modo, ESCENARIOS[escSel].id, modoLocal === "carrera");
  if (modoLocal === "carrera" && vehSel) darleVehiculo(G2, G2.players[0], vehSel);
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
  mm.width = 300; mm.height = 200;
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
  if (k === "b") { if (document.getElementById("album").hidden) abrirAlbum(); else cerrarAlbum(); }
  if (k === "t") togglePanel("arm");
  if (k === "r") togglePanel("rul");
  if (k === "escape" && !document.getElementById("album").hidden) cerrarAlbum();
  if (k >= "1" && k <= "9") elegirArma(+k - 1);
  if (k === "0") elegirArma(9);
  if (k === "q") elegirArma((G.wsel + WEAPONS.length - 1) % WEAPONS.length);
  if (k === "e") elegirArma((G.wsel + 1) % WEAPONS.length);
  if (k === "enter" && !G.local2){
    if (!G.started || G.over) startGame(1);
  }
});
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

/* ============================================================
   Álbum de Florines: qué has llegado a tener, entre partidas
   ============================================================ */
const ALBUM_VARIANTES = [null, "brillante", "arcoiris", "fantasma", "dorado"];
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
  pintarGaraje();
  return true;
}

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

function renderAlbum(){
  const grid = document.getElementById("albumGrid");
  grid.innerHTML = "";
  let n = 0;
  TIERS.forEach((T, tier) => {
    ALBUM_VARIANTES.forEach(v => {
      const tenido = !!album[albumKey(tier, v)];
      if (tenido) n++;
      const cel = document.createElement("div");
      cel.className = "albumCel " + (tenido ? "tenido" : "nunca");
      const inc = T.income * varMult(v);
      cel.innerHTML =
        '<span class="rar" style="color:' + (RAR_COLOR[T.rar] || "#FFEFE2") + '">' + T.rar + '</span>' +
        '<span class="nm">' + (tenido ? T.name : "???") + (v ? " " + VARIANTES[v].icon : "") + '</span>' +
        '<span class="dt">' + money(T.price) + ' · ' + inc + '/s</span>' +
        '<span class="q">' + (v ? VARIANTES[v].label + " ×" + varMult(v) : "normal") + '</span>';
      grid.appendChild(cel);
    });
  });
  document.getElementById("albumCuenta").textContent = n + " / " + ALBUM_TOTAL;
}

function abrirAlbum(){
  if (!G || !G.started || G.over) return;
  renderAlbum();
  document.getElementById("album").hidden = false;
  if (!G.paused) togglePause();
}
function cerrarAlbum(){
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
const tiro = { id:null, ox:0, oy:0, apuntando:false };
el.throwB.addEventListener("pointerdown", e => {
  e.preventDefault(); Snd.unlock();
  tiro.id = e.pointerId; tiro.ox = e.clientX; tiro.oy = e.clientY; tiro.apuntando = false;
  try { el.throwB.setPointerCapture?.(e.pointerId); } catch (_){}
});
el.throwB.addEventListener("pointermove", e => {
  if (e.pointerId !== tiro.id) return;
  const dx = e.clientX - tiro.ox, dy = e.clientY - tiro.oy, m = Math.hypot(dx, dy);
  if (m < 14) return;                     // margen para que un toque simple no cuente como apuntar
  tiro.apuntando = true;
  const p = G.player, a = p.apunta;
  a.on = true;
  a.wx = p.x + dx/m*300; a.wy = (p.y - 12) + dy/m*300;
});
el.throwB.addEventListener("pointerup", e => {
  if (e.pointerId !== tiro.id) return;
  tiro.id = null;
  usarArma(G, G.player);
  if (tiro.apuntando) G.player.apunta.on = false;   // el apuntado táctil dura un lanzamiento
});
el.throwB.addEventListener("pointercancel", () => { tiro.id = null; });
el.throwB.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " "){ e.preventDefault(); usarArma(G, G.player); }
});
/* Una X en cada panel. Todas pasan por aquí para que ninguna se quede sin
   cerrar cuando se añada un panel nuevo. */
for (const b of document.querySelectorAll(".cerrarX")){
  const qué = b.dataset.cerrar;
  b.addEventListener("click", () => {
    if (qué === "arm" || qué === "rul") cerrarPanel(qué);
    else if (qué === "album") cerrarAlbum();
    else if (qué === "bautizo") cerrarBautizo();
  });
}
el.pause.addEventListener("click", togglePause);
el.sound.addEventListener("click", toggleSound);
el.hand.addEventListener("click", () => { toggleZurdo(); empujarPreferencias(); });
/* ---- paneles de Armería y Ruleta: se abren con su botón, no al pasar ---- */
function panelDisponible(cual){
  if (!G || !G.started || G.over || G.local2) return false;
  return cual === "arm" ? !!G.player.inShop : !!G.player.inRuleta;
}
function cerrarPanel(cual){
  (cual === "arm" ? el.arm : el.rul).hidden = true;
  renderBotonesPanel();
}
function togglePanel(cual){
  if (!panelDisponible(cual)){
    if (G && G.started && !G.over && !G.local2){
      const p = G.player;
      const donde = cual === "arm" ? "la Armería" : "la Ruleta";
      pop(p.x, p.y-62, "Tienes que estar en " + donde, "#FF6B90");
    }
    return;
  }
  const caja = cual === "arm" ? el.arm : el.rul;
  const abrir = caja.hidden;
  // solo un panel a la vez: si están pegados, uno taparía al otro
  el.arm.hidden = true; el.rul.hidden = true;
  caja.hidden = !abrir;
  if (abrir){
    if (cual === "arm") renderRack();
    else { G.ultimoPremio = null; construirTira(null); renderRuleta(); }
    Snd.unlock();
  }
  renderBotonesPanel();
}
/* ---- el "entra aquí" que sale sobre tu cabeza ----
   La pista de antes decía "entra y toca 🧰 arriba": había que adivinar cuál de
   los seis iconos de la barra era ese. Encima del personaje no hay nada que
   adivinar, y en el celular queda al alcance del pulgar. */
const elAccion = document.getElementById("accion");
let accionActual = null;
elAccion.addEventListener("click", () => { if (accionActual) togglePanel(accionActual); });

function pintarAccion(){
  const puedo = G && G.started && !G.over && !G.paused && !G.local2;
  const cual = !puedo ? null
    : panelDisponible("arm") ? "arm"
    : panelDisponible("rul") ? "rul" : null;
  const yaAbierto = !el.arm.hidden || !el.rul.hidden;
  if (!cual || yaAbierto){ elAccion.hidden = true; accionActual = null; return; }
  if (cual !== accionActual){
    accionActual = cual;
    elAccion.textContent = cual === "arm"
      ? "🧰 Entrar a la Armería"
      : "🎰 Girar la Ruleta · " + money(RULETA_PRECIO);
  }
  const p = G.player;
  elAccion.style.left = ((p.x - cam.x) * ZOOM) + "px";
  elAccion.style.top  = ((p.y - cam.y) * ZOOM - 58) + "px";
  elAccion.hidden = false;
}

/* Quedó sin botones que repintar: la Armería y la Ruleta ya solo se abren
   desde el cartel que sale encima del personaje. Se deja la función porque la
   llaman desde varios sitios y así el día que vuelva a haber botones no hay
   que buscarlos. */
function renderBotonesPanel(){}

for (const b of document.querySelectorAll("#modoFila .modoBtn"))
  b.addEventListener("click", () => elegirModoLocal(b.dataset.modo));

el.rulBtn.addEventListener("click", girarRuleta);
el.btnInicio.addEventListener("click", volverAlInicio);
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

function vehiculosQuePuedoUsar(){
  const delSitio = (TRASTOS_ESCENARIO[ESCENARIOS[escSel].id] || [])
    .map(t => t.tipo).filter(t => VEHICULOS[t]);
  const mios = GARAJE.map(g => g.tipo).filter(tengoVehiculo);
  return [...new Set([...delSitio, ...mios])];
}

function pintarVehiculos(){
  const corriendo = modoLocal === "carrera";
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
    b.className = "escBtn" + (tipo === vehSel ? " sel" : "");
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

function elegirModoLocal(m){
  modoLocal = m;
  for (const b of document.querySelectorAll("#modoFila .modoBtn")){
    const suyo = b.dataset.modo === m;
    b.classList.toggle("sel", suyo);
    b.setAttribute("aria-pressed", String(suyo));
  }
  escBtns.forEach((b, k) => {
    const no = m === "carrera" && !puedeCorrer(k);
    b.classList.toggle("nocorre", no);
    b.disabled = no;
  });
  if (m === "carrera" && !puedeCorrer(escSel))
    elegirEscenario(ESCENARIOS.findIndex(e => e.id === CIRCUITOS[0].id));
  pintarVehiculos();
  const jugar = document.getElementById("btnStart");
  jugar.textContent = m === "carrera" ? "Correr ▸"
    : (typeof guardadaEnLaNube !== "undefined" && guardadaEnLaNube
        ? "Empezar de cero ▸" : "Jugar solo ▸");
  const sel = document.getElementById("salaModo");
  if (sel && m === "carrera") sel.value = "carrera";
  if (sel && m !== "carrera" && sel.value === "carrera") sel.value = "aventura";
  Snd.unlock();
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
  if (!jugador){ btnSeguir.hidden = true; btnUno.textContent = "Jugar solo ▸"; refrescarOnline(); return; }
  elCuenta.nombre.textContent = jugador.apodo;
  if (nube.desconectado){
    decir("El servidor no responde. Puedes jugar igual: tu progreso queda en este navegador.", "mal");
    btnSeguir.hidden = true;
    btnUno.textContent = "Jugar solo ▸";
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
  btnUno.textContent = hay ? "Empezar de cero ▸" : "1 jugador ▸";
  if (!hay) return;
  const g = guardadaEnLaNube;
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
  if (sala){ salirDeLaSala(); return; }
  if (G && G.started && !G.over) guardarPartidaAhora();
  el.arm.hidden = true; el.rul.hidden = true;
  abrirArmas(false);
  cerrarBautizo();
  document.getElementById("album").hidden = true;
  if (!G.paused) togglePause();
  el.title.hidden = false;
  buscarPartidaGuardada();
}

function salirDeLaSala(){
  sala?.cerrar();
  sala = null;
  elSala.panel.hidden = true;
  el.title.hidden = false;
}

elSala.crear.addEventListener("click", () => {
  conectar({ modo: elSala.modo.value, escenario: ESCENARIOS[escSel].id });
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
despertarCuenta();

document.getElementById("btnStart").addEventListener("click", () => startGame(1));
document.getElementById("btnAgain").addEventListener("click", () => startGame());
/* El duelo de dos en un teclado se retiró al llegar las salas: jugar con gente
   es online. El motor sigue sabiendo de N jugadores, así que no se perdió nada
   — lo que se fue es el reparto de teclas de un solo teclado. */

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
function invalidarSuelo(){ sueloCv = null; sembrarFauna(G ? G.esc : ESCENARIOS[escSel]); }

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
function libreDeco(x, y, m){
  const caja = { x:x-m, y:y-m, w:m*2, h:m*2 };
  const choca = r => caja.x < r.x+r.w && caja.x+caja.w > r.x &&
                     caja.y < r.y+r.h && caja.y+caja.h > r.y;
  for (const r of vetoDeco) if (choca(r)) return false;
  for (const b of G.bases) if (choca({ x:b.rect.x-24, y:b.rect.y-46, w:b.rect.w+48, h:b.rect.h+70 })) return false;
  if (choca({ x:G.armeria.x-30, y:G.armeria.y-30, w:G.armeria.w+60, h:G.armeria.h+60 })) return false;
  const ru = G.ruleta;
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
    const x0 = 60 + (WORLD_W-120) * (banda/n);
    const x1 = 60 + (WORLD_W-120) * ((banda+1)/n);
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
  const mira = Math.cos(giro) >= 0 ? 1 : -1;
  const pelo = esCamello ? "#C9A46A" : ["#EDE3D0","#C9B79A","#8B6F52"][i % 3];
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
  if (!esCamello){                                        // la borla de la llama
    c.fillStyle = "#E2453C";
    c.beginPath(); c.arc(mira*15, -67, 2.8, 0, 6.283); c.fill();
  }
  c.fillStyle = esCamello ? "#8A6A3C" : "#B5A088";        // manta de montar
  rr(c, -14, -34, 24, 9, 3); c.fill();
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
  if (esc.id === "pista"){
    CALLES_PISTA.forEach((y, k) => {
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
      const A = ANILLO_TABLERO, b = A.banda / 2;
      a.f = (a.f + a.vel * dt) % 1;
      const per = (A.w + A.h) * 2, d = a.f * per;
      if (d < A.w)                    { a.x = A.x + d;                  a.y = A.y + b; }
      else if (d < A.w + A.h)         { a.x = A.x + A.w - b;            a.y = A.y + (d - A.w); }
      else if (d < A.w*2 + A.h)       { a.x = A.x + A.w - (d - A.w - A.h); a.y = A.y + A.h - b; }
      else                            { a.x = A.x + b;                  a.y = A.y + A.h - (d - A.w*2 - A.h); }
    } else if (a.tipo === "trencito"){
      sobreOvalo(a, OVALO_TREN, dt);
    } else if (a.tipo === "kart"){
      sobreOvalo(a, OVALO_KART, dt);
    } else if (a.tipo === "cajaItem"){         // flota quieta en su sitio del circuito
      const p = puntoOvalo(OVALO_KART, a.f);
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
    else if (a.tipo === "mono")      dibujarMono(ctx, a);
    else if (a.tipo === "bolido")    dibujarBolido(ctx, a);
    else if (a.tipo === "ficha")     dibujarFicha(ctx, a);
    else if (a.tipo === "trencito")  dibujarTrencito(ctx, a);
    else if (a.tipo === "kart")      dibujarKart(ctx, a);
    else if (a.tipo === "cajaItem")  dibujarCajaItem(ctx, a);
    else                             dibujarRana(ctx, a);
  }
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
    for (let x=0;x<=WORLD_W;x+=60) c.lineTo(x, k*200 + Math.sin(x*.004 + k)*36);
    c.lineTo(WORLD_W, k*200+120); c.lineTo(0, k*200+120);
    c.closePath(); c.fill();
  }
  c.fillStyle = E.mancha;
  for (let i=0;i<12;i++){
    const x = azEntre(i,0,WORLD_W), y = azEntre(i+31,0,WORLD_H), r = 40+az(i+3)*50;
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
  const RIO = WORLD_H - 240;          // tiene que casar con `mar` del escenario

  /* la espesura: manchas de verde a distintas alturas para dar profundidad */
  for (let i=0;i<26;i++){
    const x = azEntre(i,0,WORLD_W), y = azEntre(i+31,0,RIO), r = 50+az(i+3)*70;
    c.fillStyle = i%2 ? "rgba(45,85,40,.3)" : "rgba(70,110,55,.26)";
    c.beginPath(); c.ellipse(x,y,r,r*.6,i,0,6.283); c.fill();
  }

  /* el río, con su ribera de barro y la corriente marcada */
  const barro = c.createLinearGradient(0, RIO-70, 0, RIO+6);
  barro.addColorStop(0, "rgba(90,70,40,0)");
  barro.addColorStop(1, "rgba(105,80,45,.7)");
  c.fillStyle = barro; c.fillRect(0, RIO-70, WORLD_W, 76);

  const agua = c.createLinearGradient(0, RIO, 0, WORLD_H);
  agua.addColorStop(0, "#6E7A3A");
  agua.addColorStop(.4, "#4A6B4E");
  agua.addColorStop(1, "#2E4A48");
  c.fillStyle = agua;
  c.beginPath();
  c.moveTo(0, RIO);
  for (let x=0;x<=WORLD_W;x+=30) c.lineTo(x, RIO + Math.sin(x*.009)*18 + Math.sin(x*.003)*11);
  c.lineTo(WORLD_W, WORLD_H); c.lineTo(0, WORLD_H);
  c.closePath(); c.fill();
  c.strokeStyle = "rgba(200,220,180,.35)"; c.lineWidth = 4; c.lineCap = "round";
  for (let k=0;k<5;k++){                                       // la corriente
    c.beginPath();
    const y0 = RIO + 46 + k*36;
    for (let x=0;x<=WORLD_W;x+=40){
      const y = y0 + Math.sin(x*.012 + k)*7;
      x === 0 ? c.moveTo(x,y) : c.lineTo(x,y);
    }
    c.stroke();
  }
  c.lineCap = "butt";

  /* nenúfares gigantes y un caimán, dentro del agua */
  for (let i=0;i<9;i++){
    const x = azEntre(i+90, 60, WORLD_W-60), y = azEntre(i+140, RIO+40, WORLD_H-40);
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
    const x = azEntre(i+500, 300, WORLD_W-300), y = azEntre(i+520, RIO+70, WORLD_H-70);
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
    c.fillRect(0, y, WORLD_W, alto);
    c.fillStyle = "rgba(120,116,104,.85)";        // el muro de piedra del andén
    c.fillRect(0, y + alto, WORLD_W, 16);
    c.strokeStyle = "rgba(60,58,52,.5)"; c.lineWidth = 2;
    for (let x = 0; x < WORLD_W; x += 46){
      c.strokeRect(x, y + alto, 46, 16);
    }
  }
  c.fillStyle = E.mancha;
  for (let i=0;i<16;i++){
    const x = azEntre(i,0,WORLD_W), y = azEntre(i+41,0,WORLD_H), r = 30+az(i+3)*44;
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
    const x = azEntre(i+300,0,WORLD_W), y = azEntre(i+700,0,WORLD_H);
    c.beginPath(); c.ellipse(x, y, 190+az(i)*130, 34+az(i+9)*22, 0, 0, 6.283); c.fill();
  }
}

/* ---------- Nueva York: Central Park, el puerto, la Estatua y el puente ---------- */
function decoNuevaYork(c, E){
  const PUERTO = 1430;                       // tiene que casar con `mar` del escenario
  const PUENTE = { x: 1880, w: 340 };        // y con `puente`

  c.fillStyle = E.mancha;
  for (let i=0;i<20;i++){
    const x = azEntre(i,0,WORLD_W), y = azEntre(i+31,0,PUERTO), r = 34+az(i+3)*50;
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
  c.fillStyle = muelle; c.fillRect(0, PUERTO-70, WORLD_W, 76);
  const agua = c.createLinearGradient(0, PUERTO, 0, WORLD_H);
  agua.addColorStop(0, "#3E6E86");
  agua.addColorStop(.5, "#2A526E");
  agua.addColorStop(1, "#1B3A54");
  c.fillStyle = agua;
  c.beginPath();
  c.moveTo(0, PUERTO);
  for (let x=0;x<=WORLD_W;x+=30) c.lineTo(x, PUERTO + Math.sin(x*.01)*12 + Math.sin(x*.004)*7);
  c.lineTo(WORLD_W, WORLD_H); c.lineTo(0, WORLD_H);
  c.closePath(); c.fill();
  c.strokeStyle = "rgba(210,230,245,.28)"; c.lineWidth = 3; c.lineCap = "round";
  for (let k=0;k<4;k++){
    c.beginPath();
    for (let x=0;x<=WORLD_W;x+=40){
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
  c.fillRect(PB.x, PUERTO - 40, PB.w, WORLD_H - PUERTO + 40);
  c.fillStyle = "rgba(0,0,0,.22)";
  c.fillRect(PB.x, PUERTO - 40, 12, WORLD_H - PUERTO + 40);
  c.fillRect(PB.x + PB.w - 12, PUERTO - 40, 12, WORLD_H - PUERTO + 40);
  c.fillStyle = "#FFD84D";                    // la línea del medio
  for (let y = PUERTO - 20; y < WORLD_H; y += 70) c.fillRect(PB.x + PB.w/2 - 3, y, 6, 34);
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
    c.fillRect(0, cy, WORLD_W, 150);
    c.fillStyle = "rgba(160,160,170,.5)";                     // bordillos
    c.fillRect(0, cy-8, WORLD_W, 8);
    c.fillRect(0, cy+150, WORLD_W, 8);
    c.fillStyle = "#FFD84D";                                  // línea central
    for (let x = 20; x < WORLD_W; x += 90) c.fillRect(x, cy+72, 46, 6);
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
    const x = azEntre(i,0,WORLD_W), y = azEntre(i+31,0,WORLD_H), r = 26+az(i+3)*48;
    c.beginPath(); c.ellipse(x,y,r,r*.6,i,0,6.283); c.fill();
  }
  // aceras: dos franjas de bordillo cruzando el barrio
  c.fillStyle = "rgba(255,239,226,.10)";
  c.fillRect(0, 620, WORLD_W, 26);
  c.fillRect(0, 1180, WORLD_W, 26);
  c.strokeStyle = "rgba(92,42,24,.5)"; c.lineWidth = 3;
  c.strokeRect(0, 620, WORLD_W, 26); c.strokeRect(0, 1180, WORLD_W, 26);

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
  vetoDeco.push({ x:cx-16, y:cy-16, w:cw+32, h:ch+32 });
  c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 5;
  c.strokeRect(cx, cy, cw, ch);
  c.beginPath(); c.moveTo(cx+cw/2, cy); c.lineTo(cx+cw/2, cy+ch); c.stroke();
  c.beginPath(); c.arc(cx+cw/2, cy+ch/2, 56, 0, 6.283); c.stroke();
  c.strokeRect(cx, cy+ch/2-70, 62, 140);
  c.strokeRect(cx+cw-62, cy+ch/2-70, 62, 140);

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
  const MAR = WORLD_H - 210;

  // arena mojada justo antes del agua
  const moj = c.createLinearGradient(0, MAR-90, 0, MAR+10);
  moj.addColorStop(0, "rgba(169,131,74,0)");
  moj.addColorStop(1, "rgba(150,112,60,.55)");
  c.fillStyle = moj;
  c.fillRect(0, MAR-90, WORLD_W, 100);

  // el agua, en dos tonos
  const agua = c.createLinearGradient(0, MAR, 0, WORLD_H);
  agua.addColorStop(0, "#37D6E0");
  agua.addColorStop(.45, "#1FA8C4");
  agua.addColorStop(1, "#166F9E");
  c.fillStyle = agua;
  c.beginPath();
  c.moveTo(0, MAR);
  for (let x=0;x<=WORLD_W;x+=30) c.lineTo(x, MAR + Math.sin(x*.011)*16 + Math.sin(x*.004)*9);
  c.lineTo(WORLD_W, WORLD_H); c.lineTo(0, WORLD_H);
  c.closePath(); c.fill();

  // espuma de la orilla y crestas mar adentro
  c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 7; c.lineCap = "round";
  c.beginPath();
  for (let x=0;x<=WORLD_W;x+=30){
    const y = MAR + Math.sin(x*.011)*16 + Math.sin(x*.004)*9;
    x === 0 ? c.moveTo(x,y) : c.lineTo(x,y);
  }
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 4;
  for (let f=1;f<=3;f++){
    c.beginPath();
    for (let x=0;x<=WORLD_W;x+=30){
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
    const x = azEntre(i,60,WORLD_W-60), y = azEntre(i+55,60,MAR-110);
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
    const x0 = 180 + (WORLD_W-360)*(banda/5), x1 = 180 + (WORLD_W-360)*((banda+1)/5);
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
    let x = azEntre(i,0,WORLD_W), y = azEntre(i+61,0,WORLD_H);
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
const CALLES_PISTA = [250, 700, 1150, 1560];             // las calles de la pista naranja
const OVALO_TREN   = { x: 1300, y: 850, rx: 1090, ry: 700 };
const OVALO_KART   = { x: 1300, y: 850, rx: 1110, ry: 720, ancho: 150 };
const ANILLO_TABLERO = { x: 120, y: 110, w: WORLD_W - 240, h: WORLD_H - 220, banda: 120 };
/** Punto de un óvalo por fracción de vuelta (0..1). */
const puntoOvalo = (o, f) => ({
  x: o.x + Math.cos(f * 6.283) * o.rx,
  y: o.y + Math.sin(f * 6.283) * o.ry,
});

/* ---------- la pista naranja: rizo, rampas y aceleradores ---------- */
function decoPista(c, E){
  c.fillStyle = E.mancha;                                  // pelusa de la alfombra
  for (let i=0;i<26;i++){
    const x = azEntre(i,0,WORLD_W), y = azEntre(i+53,0,WORLD_H), r = 26+az(i+3)*44;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* Las calles: naranja con los dos muretes y la ranura del medio. Van de lado
     a lado porque es lo que hace una pista de juguete montada en el suelo. */
  for (const y of CALLES_PISTA){
    c.fillStyle = "rgba(0,0,0,.18)";                       // la pista levanta un poco
    c.fillRect(0, y + 30, WORLD_W, 10);
    const canal = c.createLinearGradient(0, y - 24, 0, y + 24);
    canal.addColorStop(0, "#C4661A"); canal.addColorStop(.35, "#F09A3E");
    canal.addColorStop(.75, "#E4842A"); canal.addColorStop(1, "#B85A16");
    c.fillStyle = canal;
    c.fillRect(0, y - 34, WORLD_W, 68);
    for (const my of [y - 34, y + 24]){                    // los dos muretes
      c.fillStyle = "#A85018"; c.fillRect(0, my, WORLD_W, 10);
      c.fillStyle = "rgba(255,255,255,.28)"; c.fillRect(0, my, WORLD_W, 3);
    }
    c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 3;
    c.setLineDash([26, 26]);
    c.beginPath(); c.moveTo(0, y); c.lineTo(WORLD_W, y); c.stroke();
    c.setLineDash([]);
    /* Las juntas entre piezas, con su pestaña: una pista de juguete se ve que
       está hecha de trozos que encajan. */
    for (let x = 0; x < WORLD_W; x += 210){
      c.fillStyle = "rgba(0,0,0,.16)"; c.fillRect(x, y - 34, 5, 68);
      c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(x + 5, y - 34, 2, 68);
      c.fillStyle = "#C4661A"; rr(c, x - 9, y - 8, 18, 16, 4); c.fill();
    }
  }

  /* El rizo. Se monta sobre la calle de arriba y se ve como lo que es: un aro
     de plástico de canto, con sus dos patas y la sombra en la alfombra. */
  const rizo = { x: 330, y: CALLES_PISTA[1], r: 150 };
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
  }, WORLD_H-120);

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
  }, WORLD_H-100);

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
  const A = ANILLO_TABLERO, b = A.banda;
  c.fillStyle = E.mancha;                                  // el cartón gastado
  for (let i=0;i<14;i++){
    const x = azEntre(i+11,0,WORLD_W), y = azEntre(i+71,0,WORLD_H), r = 40+az(i)*60;
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
    const x = azEntre(i+5,0,WORLD_W), y = azEntre(i+61,0,WORLD_H), r = 34+az(i+3)*50;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* La vía de madera: tabla clara, traviesas y los dos rieles oscuros. */
  const O = OVALO_TREN;
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
  const O = OVALO_KART;
  c.fillStyle = E.mancha;
  for (let i=0;i<16;i++){
    const x = azEntre(i+9,0,WORLD_W), y = azEntre(i+83,0,WORLD_H), r = 40+az(i)*56;
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
    const x = azEntre(i+3,0,WORLD_W), y = azEntre(i+51,0,MAR-200), r = 40+az(i)*60;
    c.beginPath(); c.ellipse(x,y,r,r*.5,i,0,6.283); c.fill();
  }

  /* el mar, en bandas de azul que van aclarando hacia la orilla */
  const agua = c.createLinearGradient(0, MAR, 0, WORLD_H);
  agua.addColorStop(0, "#4E8FA8"); agua.addColorStop(1, "#1E4E68");
  c.fillStyle = agua;
  c.fillRect(0, MAR, WORLD_W, WORLD_H - MAR);
  c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 4;
  for (let k=0;k<7;k++){
    const y = MAR + 24 + k*30;
    c.beginPath();
    for (let x=0;x<=WORLD_W;x+=40) c[x?"lineTo":"moveTo"](x, y + Math.sin(x/120 + k)*6);
    c.stroke();
  }

  /* el acantilado: el canto de tierra que cae al mar, con sus grietas */
  c.fillStyle = "#7A6242";
  c.fillRect(0, MAR - 70, WORLD_W, 70);
  c.fillStyle = "#9A7F58";
  c.fillRect(0, MAR - 70, WORLD_W, 22);
  c.strokeStyle = "rgba(50,40,26,.5)"; c.lineWidth = 3;
  for (let x=30;x<WORLD_W;x+=70){
    c.beginPath(); c.moveTo(x, MAR - 62); c.lineTo(x + azEntre(x,-14,14), MAR - 6); c.stroke();
  }
  /* la espuma donde rompe */
  c.fillStyle = "rgba(255,255,255,.5)";
  for (let x=0;x<WORLD_W;x+=26){
    c.beginPath(); c.ellipse(x, MAR + 6 + Math.sin(x/90)*5, 16, 5, 0, 0, 6.283); c.fill();
  }

  /* la ciclovía roja pegada al borde, que es la marca de la Costa Verde */
  c.fillStyle = "#8A3A32";
  c.fillRect(0, MAR - 132, WORLD_W, 46);
  c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 3;
  c.setLineDash([30, 26]);
  c.beginPath(); c.moveTo(0, MAR - 109); c.lineTo(WORLD_W, MAR - 109); c.stroke();
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

/* ---------- Nazca: las líneas dibujadas en la pampa ---------- */
function decoNazca(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<18;i++){
    const x = azEntre(i+7,0,WORLD_W), y = azEntre(i+37,0,WORLD_H), r = 44+az(i)*70;
    c.beginPath(); c.ellipse(x,y,r,r*.45,i,0,6.283); c.fill();
  }
  /* el suelo rayado del desierto */
  c.strokeStyle = "rgba(255,239,226,.05)"; c.lineWidth = 6;
  for (let y=0;y<WORLD_H;y+=34){
    c.beginPath(); c.moveTo(0, y + Math.sin(y/200)*10); c.lineTo(WORLD_W, y - Math.sin(y/240)*10); c.stroke();
  }

  /* Las líneas: surcos claros, un trazo continuo cada figura. Están dibujadas
     a mano con puntos porque una curva bonita no se ve como algo rascado. */
  const linea = (pts, cerrar) => {
    c.strokeStyle = "#EBD3A2"; c.lineWidth = 13; c.lineJoin = "round"; c.lineCap = "round";
    c.beginPath();
    pts.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y));
    if (cerrar) c.closePath();
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 5;
    c.stroke();
  };
  // el colibrí, arriba a la izquierda
  const cb = (dx, dy, k) => ([dx*k, dy*k]);
  linea([[330,300],[430,340],[560,350],[700,345],[820,330]]);          // el pico
  linea([[560,350],[520,430],[430,520],[360,600]]);                    // ala izquierda
  linea([[560,350],[620,440],[700,540],[760,620]]);                    // ala derecha
  linea([[560,350],[556,470],[548,600],[540,700],[500,760]]);          // cuerpo y cola
  linea([[540,700],[600,780]]);
  // el mono, abajo a la derecha
  linea([[1900,1180],[1990,1120],[2090,1140],[2140,1230],[2090,1320],[1980,1330],[1910,1270]], true);
  linea([[2140,1230],[2230,1180],[2300,1250],[2260,1350],[2160,1380]]); // la cola en espiral
  linea([[1900,1180],[1830,1090],[1760,1120]]);                        // brazo
  // la araña, arriba a la derecha
  const ax = 1980, ay = 420;
  linea([[ax-40,ay],[ax+40,ay],[ax+40,ay+90],[ax-40,ay+90]], true);
  for (let k=0;k<4;k++){
    const off = k*34 - 50;
    linea([[ax-40, ay+20+off*0.4],[ax-150, ay-30+off],[ax-210, ay+40+off]]);
    linea([[ax+40, ay+20+off*0.4],[ax+150, ay-30+off],[ax+210, ay+40+off]]);
  }

  /* el mirador de fierro que hay en la carretera, y piedras sueltas */
  sembrar(c, 2, 5401, 70, (c,x,y) => {
    vetoDeco.push({ x:x-60, y:y-90, w:120, h:130 });
    c.fillStyle = "rgba(0,0,0,.22)";
    c.beginPath(); c.ellipse(x, y+22, 52, 14, 0, 0, 6.283); c.fill();
    c.strokeStyle = "#A8A29A"; c.lineWidth = 7;
    c.beginPath(); c.moveTo(x-40, y+20); c.lineTo(x-10, y-70); c.stroke();
    c.beginPath(); c.moveTo(x+40, y+20); c.lineTo(x+10, y-70); c.stroke();
    for (let k=0;k<4;k++){
      const yy = y + 12 - k*22, w = 38 - k*7;
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(x-w, yy); c.lineTo(x+w, yy); c.stroke();
    }
    c.fillStyle = "#8A8478"; rr(c, x-34, y-88, 68, 20, 4); c.fill();
  });
  sembrar(c, 12, 5501, 20, (c,x,y,i) => {
    c.fillStyle = i%2 ? "#8A6A44" : "#A08258";
    c.beginPath(); c.ellipse(x, y, 9+az(i)*6, 7+az(i+2)*4, az(i)*3, 0, 6.283); c.fill();
  });
}

/* ---------- El Volcán: ceniza, lava y el cráter ---------- */
function decoVolcan(c, E){
  c.fillStyle = E.mancha;
  for (let i=0;i<20;i++){
    const x = azEntre(i+13,0,WORLD_W), y = azEntre(i+67,0,WORLD_H), r = 50+az(i)*70;
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
  rio([[0,430],[380,470],[760,400],[1150,470],[1500,420],[1900,480],[2300,430],[WORLD_W,470]], 30);
  rio([[0,1260],[420,1200],[820,1290],[1240,1210],[1660,1300],[2100,1230],[WORLD_W,1280]], 24);
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
    crater(azEntre(i+2,60,WORLD_W-60), azEntre(i+91,60,WORLD_H-60), 26 + az(i)*70);
  c.fillStyle = E.mancha;
  for (let i=0;i<14;i++){
    const x = azEntre(i+23,0,WORLD_W), y = azEntre(i+77,0,WORLD_H), r = 50+az(i)*70;
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

function pintarSuelo(){
  const E = visualDe(G.esc.id);
  sueloCv = document.createElement("canvas");
  sueloCv.width = WORLD_W; sueloCv.height = WORLD_H;
  const c = sueloCv.getContext("2d");

  vetoDeco = [];
  c.fillStyle = E.suelo;
  c.fillRect(0,0,WORLD_W,WORLD_H);

  const S = E.deco === "colegio" ? 70 : 90;
  c.lineWidth = 2; c.strokeStyle = E.loseta;
  c.beginPath();
  for (let x=0;x<=WORLD_W;x+=S){ c.moveTo(x,0); c.lineTo(x,WORLD_H); }
  for (let y=0;y<=WORLD_H;y+=S){ c.moveTo(0,y); c.lineTo(WORLD_W,y); }
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
  else if (E.deco === "nazca")    decoNazca(c, E);
  else if (E.deco === "volcan")   decoVolcan(c, E);
  else if (E.deco === "luna")     decoLuna(c, E);

  c.strokeStyle = E.borde; c.lineWidth = 16;
  c.strokeRect(8,8,WORLD_W-16,WORLD_H-16);
}

function drawFloor(){
  if (!sueloCv) pintarSuelo();
  ctx.drawImage(sueloCv, 0, 0);
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

  /* Patio en venta: reja de barrotes y el cartel de "métete para comprarlo" */
  if (b.locked){
    ctx.strokeStyle = "rgba(255,239,226,.22)"; ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = r.x+26; x < r.x+r.w-20; x += 34){ ctx.moveTo(x, r.y+18); ctx.lineTo(x, r.y+r.h-18); }
    ctx.moveTo(r.x+20, r.y+34);      ctx.lineTo(r.x+r.w-20, r.y+34);
    ctx.moveTo(r.x+20, r.y+r.h-34);  ctx.lineTo(r.x+r.w-20, r.y+r.h-34);
    ctx.stroke();
    ctx.fillStyle = "#FFEFE2";
    ctx.font = "800 15px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("EN VENTA · métete para comprarlo", r.x+r.w/2, r.y+r.h/2);
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
function drawFlorin(x, y, s, f, t){
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
    const pulso = REDUCED ? 1 : 1 + Math.sin(t*4)*(variant === "dorado" ? .2 : .12);
    const col = arco ? "hsl(" + ((t*90)%360|0) + " 90% 65%)"
              : variant === "dorado"   ? "#FFD84D"
              : variant === "fantasma" ? "#B8C2FF"
              : "#FFFFFF";
    ctx.save();
    ctx.globalAlpha = arco ? .5 : variant === "dorado" ? .55 : variant === "fantasma" ? .3 : .38;
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

  /* ---- destellos de la variante, por encima del bloque ---- */
  if (variant && !REDUCED){
    const arco = variant === "arcoiris", oro = variant === "dorado";
    const n = arco ? 6 : oro ? 8 : variant === "fantasma" ? 3 : 4;
    for (let i=0;i<n;i++){
      const a = -t*(arco ? 2.2 : oro ? 1.1 : 1.6) + i*(6.283/n);
      const rr = 24 + Math.sin(t*3+i)*3;
      const px = Math.cos(a)*rr, py = top+H*.45 + Math.sin(a)*rr*.55;
      ctx.fillStyle = arco ? "hsl(" + (((t*120)+i*60)%360|0) + " 95% 70%)"
                    : oro  ? (i%2 ? "#FFD84D" : "#FFF0A5")
                    : variant === "fantasma" ? "rgba(184,194,255,.9)"
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

function drawArmeria(){
  const a = G.armeria;
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

function drawRuleta(){
  const r = G.ruleta;
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

  // Con dos jugadores el zoom se abre lo necesario para que ambos quepan
  if (G.local2 && G.players.length > 1){
    const a = G.players[0], b = G.players[1];
    const ancho = Math.abs(a.x-b.x) + 420, alto = Math.abs(a.y-b.y) + 380;
    ZOOM = clamp(Math.min(VW/ancho, VH/alto), .34, 1.05);
  }
  const visW = VW/ZOOM, visH = VH/ZOOM;
  const foco = G.local2 && G.players.length > 1
    ? { x:(G.players[0].x+G.players[1].x)/2, y:(G.players[0].y+G.players[1].y)/2 }
    : G.player;
  cam.x = visW >= WORLD_W ? (WORLD_W-visW)/2 : clamp(foco.x-visW/2, 0, WORLD_W-visW);
  cam.y = visH >= WORLD_H ? (WORLD_H-visH)/2 : clamp(foco.y-visH/2, 0, WORLD_H-visH);

  ctx.setTransform(DPR*ZOOM, 0, 0, DPR*ZOOM, -cam.x*DPR*ZOOM, -cam.y*DPR*ZOOM);

  drawFloor();
  const corriendo = G.reglas?.modo === "carrera";
  if (corriendo){
    drawCircuito();                  // la pista es lo único que importa
  } else {
    drawRuta();                      // la alfombra va debajo de todo
    for (const b of G.bases) drawBase(b);
    drawArmeria();
    drawPortal();
    if (!G.local2) drawRuleta();
  }
  drawCascaras();
  drawTrastos();
  drawFauna();
  if (!corriendo){ for (const b of G.bases) drawLaser(b); drawDesfile(); }
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
  drawPerson(p.x, p.y, p.face, M ? 0 : p.walk, {
    skin:"#F0C08A", shirt:p.shirt, hair:"#3A1B33", stun:p.stun, carry:p.carry,
    montado: !!M,
    alpha: p.invis > 0 ? (p.invis < 2 ? .3 + Math.sin(G.t*14)*.15 : .34) : 1
  });
  if (G.local2){                            // etiqueta J1 / J2
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(15,7,14,.85)";
    ctx.strokeText("J"+(p.idx+1), p.x, p.y+36);
    ctx.fillStyle = p.shirt;
    ctx.fillText("J"+(p.idx+1), p.x, p.y+36);
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
  const sx = w/WORLD_W, sy = h/WORLD_H;
  mctx.clearRect(0,0,w,h);
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
  const a = G.armeria;
  mctx.strokeStyle = "#FF3D6E"; mctx.lineWidth = 3;
  mctx.strokeRect(a.x*sx, a.y*sy, a.w*sx, a.h*sy);
  mctx.strokeStyle = "#FF5C86"; mctx.lineWidth = 3;
  for (const P of [G.portal, G.portal.salida]){
    mctx.beginPath(); mctx.arc(P.x*sx, P.y*sy, 6, 0, 6.283); mctx.stroke();
  }
  if (!G.local2){
    const ru = G.ruleta;
    mctx.strokeStyle = "#FFC53D"; mctx.lineWidth = 3;
    mctx.beginPath(); mctx.arc(ru.x*sx, ru.y*sy, ru.r*sx, 0, 6.283); mctx.stroke();
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
    return;
  }
  el.j2.hidden = true;
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
    bau.boton.hidden = true; bau.soltar.hidden = true;
    const w0 = WEAPONS[G.wsel];
    el.throwB.classList.toggle("cool", G.cd > 0 ||
      (w0.id === "chancla" ? G.chancla.state !== "held" : G.ammo[w0.id] <= 0));
    pintarAccion();
    return;
  }
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
}

/* ============================================================
   Flujo del juego
   ============================================================ */
function startGame(modo){
  if (sala) salirDeLaSala();
  const m = modo === 2 ? 2 : (modo === 1 ? 1 : (G && G.local2 ? 2 : 1));
  G = nuevaPartida(m);
  G.started = true;
  aLaCancha();
}

/** Deja la pantalla lista para jugar con el G que sea: nuevo o revivido. */
function aLaCancha(){
  G.paused = false;
  G.over = false;
  guardaEn = GUARDA_CADA;
  pops = []; puffs = [];
  document.getElementById("app").classList.toggle("dos", !!G.local2);
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
  document.getElementById("lbSteals").textContent = "Los que robaste tú";
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
    aLaRuleta: () => { G.player.x = G.ruleta.x; G.player.y = G.ruleta.y; },
    aLaArmeria: () => { const a = G.armeria; G.player.x = a.x + a.w/2; G.player.y = a.y + a.h/2; },
    montar: tipo => { const v = G.trastos.find(t => t.tipo === tipo); if (!v) return null;
                      G.player.x = v.x; G.player.y = v.y; return v.tipo; },
    dinero: n => { G.player.money = n; },
    vehiculo: (tipo, quien = 0) => { darleVehiculo(G, G.players[quien], tipo); return tipo; },
    cargar: tier => { G.player.carry = nuevoFlorin(G, tier ?? 3); },
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
