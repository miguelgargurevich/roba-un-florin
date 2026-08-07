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
  seleccionarArma, textoDePremio, usarArma, varLabel, varMult, visualDe,
} from "./puente.js";

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
      case "fin":    endGame(ev.ganador == null ? null : G.players[ev.ganador]); break;
      case "hito":   break;               // el HUD ya lo celebra leyendo G.fiesta
    }
  }
}

/** Lo que el jugador está pidiendo este tick, en el formato que espera el motor. */
function entradas(){
  const out = {};
  for (const p of G.players){
    const T = p.idx === 0 ? (G.mode === 2 ? TECLAS_J1 : TECLAS_1P) : TECLAS_J2;
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

/** Arranca una partida nueva en el escenario elegido. */
function nuevaPartida(modo){
  pops = []; puffs = [];
  const G2 = nuevaPartidaMotor(modo, ESCENARIOS[escSel].id);
  G2.started = false; G2.paused = false;    // banderas del cliente, no del motor
  return G2;
}

/* Gira la ruleta y, si arrancó, monta la animación de la tira. */
function girarRuleta(){
  const p = G.players.find(q => q.inRuleta);
  if (!p || G.girando) return;
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
  tip:    document.getElementById("uiTip"),
  title:  document.getElementById("scrTitle"),
  end:    document.getElementById("scrEnd"),
  touch:  document.getElementById("touch"),
  ring:   document.getElementById("joyring"),
  nub:    document.getElementById("joynub"),
  throwB: document.getElementById("throwBtn"),
  pause:  document.getElementById("btnPause"),
  sound:  document.getElementById("btnSound"),
  hand:   document.getElementById("btnHand"),
  wbar:   document.getElementById("wbar"),
  arm:    document.getElementById("armeria"),
  rack:   document.getElementById("rack"),
  armMon: document.getElementById("armMoney"),
  wIcon:  document.getElementById("wIcon"),
  j2:      document.getElementById("hudJ2"),
  j2money: document.getElementById("uiJ2Money"),
  j2rate:  document.getElementById("uiJ2Rate"),
  j2bar:   document.getElementById("uiJ2Bar"),
  wSvg:   document.getElementById("wSvg"),
  btnArm:  document.getElementById("btnArm"),
  btnRul:  document.getElementById("btnRul"),
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
  if (k === " ") usarArma(G, G.players[0]);
  if (G.mode === 2 && G.players[1] && G.players[1].teclas.fire.includes(k)) usarArma(G, G.players[1]);
  if (k === "p") togglePause();
  if (k === "m") toggleSound();
  if (k === "n") abrirBautizo();
  if (k === "b") { if (document.getElementById("album").hidden) abrirAlbum(); else cerrarAlbum(); }
  if (k === "t") togglePanel("arm");
  if (k === "r") togglePanel("rul");
  if (k === "escape" && !document.getElementById("album").hidden) cerrarAlbum();
  if (k >= "1" && k <= "9") seleccionarArma(G, G.player, +k - 1); renderWbar();
  if (k === "0") seleccionarArma(G, G.player, 9); renderWbar();
  if (k === "q") seleccionarArma(G, G.player, (G.wsel + WEAPONS.length - 1) % WEAPONS.length); renderWbar();
  if (k === "e") seleccionarArma(G, G.player, (G.wsel + 1) % WEAPONS.length); renderWbar();
  if (k === "enter" && G.mode !== 2){
    if (!G.started || G.over) startGame(1);
  }
});
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

/* ============================================================
   Álbum de Florines: qué has llegado a tener, entre partidas
   ============================================================ */
const ALBUM_VARIANTES = [null, "brillante", "arcoiris"];
const ALBUM_TOTAL = TIERS.length * ALBUM_VARIANTES.length;
let album = {};
try { album = JSON.parse(localStorage.getItem("florin_album") || "{}") || {}; } catch (_){ album = {}; }
const albumKey = (tier, variant) => tier + ":" + (variant || "base");

function vistoEnAlbum(tier, variant){
  const k = albumKey(tier, variant);
  if (album[k]) return;
  album[k] = 1;
  try { localStorage.setItem("florin_album", JSON.stringify(album)); } catch (_){}
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
el.pause.addEventListener("click", togglePause);
el.sound.addEventListener("click", toggleSound);
el.hand.addEventListener("click", toggleZurdo);
/* ---- paneles de Armería y Ruleta: se abren con su botón, no al pasar ---- */
function panelDisponible(cual){
  if (!G || !G.started || G.over || G.mode === 2) return false;
  return cual === "arm" ? !!G.players[0].inShop : !!G.players[0].inRuleta;
}
function cerrarPanel(cual){
  (cual === "arm" ? el.arm : el.rul).hidden = true;
  renderBotonesPanel();
}
function togglePanel(cual){
  if (!panelDisponible(cual)){
    if (G && G.started && !G.over && G.mode === 1){
      const p = G.players[0];
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
function renderBotonesPanel(){
  for (const [cual, boton, caja] of [["arm", el.btnArm, el.arm], ["rul", el.btnRul, el.rul]]){
    const listo = panelDisponible(cual);
    boton.classList.toggle("lejos", !listo);
    boton.classList.toggle("on", !caja.hidden);
    boton.setAttribute("aria-pressed", String(!caja.hidden));
  }
}

el.btnArm.addEventListener("click", () => togglePanel("arm"));
el.btnRul.addEventListener("click", () => togglePanel("rul"));
el.rulBtn.addEventListener("click", girarRuleta);
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
  b.addEventListener("click", () => elegirEscenario(i));
  escFila.appendChild(b);
  return b;
});
function elegirEscenario(i){
  escSel = i;
  try { localStorage.setItem("florin_escenario", ESCENARIOS[i].id); } catch (_){}
  escBtns.forEach((b, k) => {
    b.classList.toggle("sel", k === i);
    b.setAttribute("aria-pressed", String(k === i));
  });
  escDesc.textContent = ESCENARIOS[i].desc;
  Snd.unlock();
}
elegirEscenario(escSel);

document.getElementById("btnStart").addEventListener("click", () => startGame(1));
document.getElementById("btnStart2").addEventListener("click", () => startGame(2));
document.getElementById("btnAgain").addEventListener("click", () => startGame());   // repite el modo

const isTouch = matchMedia("(pointer: coarse)").matches;
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
  ped: null
};

// El pedestal de TU vitrina que tienes al lado (o null)
function florinAlLado(){
  if (!G || !G.started || G.over) return null;
  let cerca = null, d2 = 66*66;
  for (const p of G.players)
    for (const b of p.patios) for (const ped of b.peds){
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
/* Con premio, lo planta en RUL_IDX; sin premio, es solo adorno al abrir el puesto */
function construirTira(premio){
  el.rulStrip.style.transform = "translateX(0px)";
  el.rulStrip.innerHTML = "";
  for (let i=0;i<RUL_IDX+8;i++){
    el.rulStrip.appendChild(pintarCelda(
      premio && i === RUL_IDX ? celdaDePremio(premio) : celdaDeCasilla(tiraDeTabla(RULETA))));
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
function invalidarSuelo(){ sueloCv = null; }

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
  if (choca({ x:G.ruleta.x-30,  y:G.ruleta.y-30,  w:G.ruleta.w+60,  h:G.ruleta.h+60  })) return false;
  if (choca({ x:G.portal.x-90,  y:G.portal.y-90,  w:180, h:180 })) return false;
  // la alfombra del desfile: bajada y órbita
  const o = orbitaDelCentro(G);
  if (choca({ x:o.cx-o.rx-26, y:o.cy-o.ry-26, w:(o.rx+26)*2, h:(o.ry+26)*2 })) return false;
  if (choca({ x:G.portal.x-24, y:G.portal.y, w:48, h:o.cy-o.ry-G.portal.y })) return false;
  return true;
}

/* Coloca n adornos buscando sitio libre, y llama a pintar(c,x,y,i).
   Reparte por bandas horizontales para que no se apelotonen, y `maxY` permite
   dejar zonas fuera (en la playa, el agua). */
function sembrar(c, n, semilla, margen, pintar, maxY){
  const limY = maxY == null ? WORLD_H-60 : maxY;
  let puestos = 0;
  for (let banda=0; banda<n; banda++){
    const x0 = 60 + (WORLD_W-120) * (banda/n);
    const x1 = 60 + (WORLD_W-120) * ((banda+1)/n);
    for (let k=0;k<26;k++){
      const i = semilla + banda*37 + k;
      const x = azEntre(i, x0, x1), y = azEntre(i+7777, 60, limY);
      if (!libreDeco(x, y, margen)) continue;
      pintar(c, x, y, puestos);
      puestos++;
      break;
    }
  }
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

/* ---------- El Barrio: postes, tendederos, basura y rayuela ---------- */
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

  // pelotas de playa
  sembrar(c, 3, 4001, 24, (c,x,y) => {
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(x, y+13, 15, 5, 0, 0, 6.283); c.fill();
    const gajos = ["#FFEFE2","#FF3D6E","#FFEFE2","#5CE1EA","#FFEFE2","#FFD84D"];
    for (let k=0;k<6;k++){
      c.fillStyle = gajos[k];
      c.beginPath(); c.moveTo(x, y);
      c.arc(x, y, 15, k*1.047, (k+1)*1.047); c.closePath(); c.fill();
    }
    c.strokeStyle = "rgba(0,0,0,.2)"; c.lineWidth = 1.6;
    c.beginPath(); c.arc(x, y, 15, 0, 6.283); c.stroke();
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

  sembrar(c, 7, 1701, 26, (c,x,y,i) => {      // mata rodadora
    c.strokeStyle = "#A2832F"; c.lineWidth = 2.5;
    c.beginPath();
    for (let k=0;k<9;k++){
      const a = k*.7 + az(i)*3, r = 12 + az(i*4+k)*11;
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a)*r, y + Math.sin(a)*r*.8);
    }
    c.stroke();
    c.strokeStyle = "rgba(162,131,47,.6)"; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y, 16, 13, 0, 0, 6.283); c.stroke();
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

  /* ---- aura de la variante, detrás de todo ---- */
  if (variant){
    const arco = variant === "arcoiris";
    const pulso = REDUCED ? 1 : 1 + Math.sin(t*4)*.12;
    const col = arco ? "hsl(" + ((t*90)%360|0) + " 90% 65%)" : "#FFFFFF";
    ctx.save();
    ctx.globalAlpha = arco ? .5 : .38;
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

  /* ---- el bloque ---- */
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
  const dark = (T.style === "ninja" || T.style === "cosmic");
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

  /* ---- destellos de la variante, por encima del bloque ---- */
  if (variant && !REDUCED){
    const arco = variant === "arcoiris";
    const n = arco ? 6 : 4;
    for (let i=0;i<n;i++){
      const a = -t*(arco ? 2.2 : 1.6) + i*(6.283/n);
      const rr = 24 + Math.sin(t*3+i)*3;
      const px = Math.cos(a)*rr, py = top+H*.45 + Math.sin(a)*rr*.55;
      ctx.fillStyle = arco ? "hsl(" + (((t*120)+i*60)%360|0) + " 95% 70%)" : "#FFFFFF";
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
  ctx.fillText(G.mode === 2 ? "cerrada en modo dos jugadores"
               : !G.inShop ? "entra y toca 🧰 arriba"
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
  const P = G.portal, o = orbitaDelCentro(G);
  const entrada = { x: o.cx, y: o.cy - o.ry };
  ctx.save();
  ctx.strokeStyle = "rgba(255,92,134,.20)";
  ctx.lineWidth = 26; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(P.x, P.y); ctx.lineTo(entrada.x, entrada.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, 6.283);
  ctx.stroke();
  // la línea punteada del centro de la alfombra
  ctx.strokeStyle = "rgba(255,158,196,.34)";
  ctx.lineWidth = 3; ctx.setLineDash([12,14]);
  ctx.beginPath();
  ctx.moveTo(P.x, P.y); ctx.lineTo(entrada.x, entrada.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, 6.283);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPortal(){
  const P = G.portal;
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
  ctx.fillText("PASARELA DE FLORINES", P.x, P.y-P.r-29);
  ctx.fillStyle = "rgba(255,239,226,.6)";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText("atrápalos cuando pasen", P.x, P.y+P.r+16);
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
  ctx.fillStyle = "rgba(42,18,38,.62)";
  roundRect(r.x, r.y, r.w, r.h, 20); ctx.fill();
  ctx.strokeStyle = G.player.inRuleta ? "#FFEFE2" : "#FF3D6E";
  ctx.lineWidth = 5; ctx.setLineDash([12,9]);
  roundRect(r.x, r.y, r.w, r.h, 20); ctx.stroke(); ctx.setLineDash([]);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#FF3D6E";
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillText("RULETA DE FLORINES", r.x+r.w/2, r.y+26);
  ctx.fillStyle = "rgba(255,239,226,.6)";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText(G.mode === 2 ? "cerrada en modo dos jugadores"
               : !G.player.inRuleta ? "entra y toca 🎰 arriba · " + money(RULETA_PRECIO)
               : el.rul.hidden ? "toca 🎰 arriba (tecla R)" : "gira abajo ↓",
               r.x+r.w/2, r.y+46);

  // la rueda, girando mientras hay tirada en curso
  const cx = r.x+r.w/2, cy = r.y+94, R = 26;
  const ang = G.girando ? G.t*9 : G.t*.8;
  for (let i=0;i<8;i++){
    const a0 = ang + i*(6.283/8);
    ctx.fillStyle = i%2 ? "#FF3D6E" : "#FFC53D";
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx, cy, R, a0, a0 + 6.283/8); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = "#2A1226"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();
  ctx.fillStyle = "#FFEFE2";
  ctx.beginPath(); ctx.moveTo(cx, cy-R-9); ctx.lineTo(cx-6, cy-R-1); ctx.lineTo(cx+6, cy-R-1);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawShadow(x,y,r){
  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.beginPath(); ctx.ellipse(x, y, r, r*.4, 0, 0, 6.283); ctx.fill();
}

function drawPerson(x, y, face, walk, opts){
  const { skin, shirt, hair, stun, carry, bandana, apron, frozen, alpha, cap, ears } = opts;
  if (alpha != null) ctx.globalAlpha = alpha;
  const bounce = Math.sin(walk)*2.6;
  ctx.save();
  ctx.translate(x, y + (stun>0 ? Math.sin(G.t*40)*1.5 : 0));
  drawShadow(0, 22, 18);

  // piernas
  ctx.strokeStyle = "#3A2A44"; ctx.lineWidth = 6; ctx.lineCap = "round";
  const sw = Math.sin(walk)*7;
  ctx.beginPath(); ctx.moveTo(-4,10); ctx.lineTo(-4+sw, 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4,10);  ctx.lineTo(4-sw, 22); ctx.stroke();

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
  ctx.strokeStyle = (G.mode === 2 && w.id === "chancla") ? p.shirt : w.color;
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
  if (G.mode === 2 && G.players.length > 1){
    const a = G.players[0], b = G.players[1];
    const ancho = Math.abs(a.x-b.x) + 420, alto = Math.abs(a.y-b.y) + 380;
    ZOOM = clamp(Math.min(VW/ancho, VH/alto), .34, 1.05);
  }
  const visW = VW/ZOOM, visH = VH/ZOOM;
  const foco = G.mode === 2 && G.players.length > 1
    ? { x:(G.players[0].x+G.players[1].x)/2, y:(G.players[0].y+G.players[1].y)/2 }
    : G.player;
  cam.x = visW >= WORLD_W ? (WORLD_W-visW)/2 : clamp(foco.x-visW/2, 0, WORLD_W-visW);
  cam.y = visH >= WORLD_H ? (WORLD_H-visH)/2 : clamp(foco.y-visH/2, 0, WORLD_H-visH);

  ctx.setTransform(DPR*ZOOM, 0, 0, DPR*ZOOM, -cam.x*DPR*ZOOM, -cam.y*DPR*ZOOM);

  drawFloor();
  drawRuta();                        // la alfombra va debajo de todo
  for (const b of G.bases) drawBase(b);
  drawArmeria();
  drawPortal();
  if (G.mode === 1) drawRuleta();
  drawCascaras();
  for (const b of G.bases) drawLaser(b);
  drawDesfile();
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
  drawPerson(p.x, p.y, p.face, p.walk, {
    skin:"#F0C08A", shirt:p.shirt, hair:"#3A1B33", stun:p.stun, carry:p.carry,
    alpha: p.invis > 0 ? (p.invis < 2 ? .3 + Math.sin(G.t*14)*.15 : .34) : 1
  });
  if (G.mode === 2){                            // etiqueta J1 / J2
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
    ctx.fillText("☂️", p.x, p.y-52);
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
  if (G.alarma && !G.over){
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
  const P = G.portal;
  mctx.strokeStyle = "#FF5C86"; mctx.lineWidth = 3;
  mctx.beginPath(); mctx.arc(P.x*sx, P.y*sy, 6, 0, 6.283); mctx.stroke();
  if (G.mode === 1){
    const ru = G.ruleta;
    mctx.strokeStyle = "#FFC53D"; mctx.lineWidth = 3;
    mctx.strokeRect(ru.x*sx, ru.y*sy, ru.w*sx, ru.h*sy);
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
const chips = WEAPONS.map((w,i) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.innerHTML = '<span class="ic">'+w.icon+'</span><span class="meta">'+
                '<span class="nm">'+w.name+'</span>'+
                '<span class="n"><span class="q"></span><i class="u"> usos</i></span></span>';
  // teclas 1-9 para las nueve primeras, 0 para la décima, y Q/E para rotar por todas
  const tecla = i < 9 ? String(i+1) : i === 9 ? "0" : null;
  b.setAttribute("aria-label", w.name + (tecla ? " — tecla " + tecla : " — usa Q o E"));
  b.addEventListener("click", () => { Snd.unlock(); seleccionarArma(G, G.player, i); renderWbar(); });
  el.wbar.appendChild(b);
  return b;
});

const rackBtns = WEAPONS.slice(1).map((w,k) => {
  const i = k+1;
  const b = document.createElement("button");
  b.className = "buy"; b.type = "button";
  b.innerHTML = '<span class="ic">'+w.icon+'</span><span>'+
                '<span class="nm">'+w.name+'</span><br>'+
                '<span class="pr">'+money(w.price)+' · +'+w.uses+' usos</span><br>'+
                '<span class="ds">'+w.desc+'</span></span>';
  b.addEventListener("click", () => { comprarArma(G, G.player, i); renderWbar(); renderRack(); });
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
  el.wSvg.style.display = isCh ? "" : "none";
  el.wIcon.hidden = isCh;
  if (!isCh) el.wIcon.textContent = w.icon;
  el.throwB.setAttribute("aria-label", "Usar " + w.name);
}

function renderRack(){
  el.armMon.textContent = money(G.money);
  rackBtns.forEach((b,k) => { b.disabled = G.money < WEAPONS[k+1].price; });
}

/* ============================================================
   HUD
   ============================================================ */
let lastTip = "";
function hud(){
  if (G.mode === 2){
    const a = G.players[0], b = G.players[1];
    el.j2.hidden = false;
    el.money.textContent = money(a.money);
    el.rate.textContent  = money(playerIncome(a)) + "/s";
    el.j2money.textContent = money(b.money);
    el.j2rate.textContent  = money(playerIncome(b)) + "/s";
    el.bar.style.width   = clamp(a.money/GOAL*100, 0, 100).toFixed(1) + "%";
    el.j2bar.style.width = clamp(b.money/GOAL*100, 0, 100).toFixed(1) + "%";
    el.goal.textContent  = "meta " + money(GOAL);
    el.lost.textContent  = a.stats.lost + " / " + b.stats.lost;
    const va = a.money >= b.money ? a : b;
    el.tip.innerHTML = va.money === b.money && a.money === b.money
      ? "¡Empatados! El primero en llegar a " + money(GOAL) + " gana."
      : "Va ganando <b style='color:" + va.shirt + "'>J" + (va.idx+1) + "</b> · " +
        "róbate su vitrina o dale un <b>chancletazo</b> para que suelte lo que carga.";
    bau.boton.hidden = !(isTouch && florinAlLado() && bau.caja.hidden);
    return;
  }
  el.j2.hidden = true;
  const inc = playerIncome(G.player);
  el.money.textContent = money(G.money);
  el.rate.textContent = money(inc) + "/s";
  // la barra mide el tramo del hito actual, así que se vuelve a llenar cada vez
  const base = G.hito - GOAL;
  el.goal.textContent = money(G.money) + " / " + money(G.hito);
  el.bar.style.width = clamp((G.money - base)/GOAL*100, 0, 100).toFixed(1) + "%";
  el.goalLabel.textContent = G.hitoN ? "Hito " + (G.hitoN + 1) : "Meta del patio";
  el.goalCard.classList.toggle("fiesta", G.fiesta > 0);
  el.lost.textContent = G.stats.lost;

  // banda de alarma: quién te roba y de qué patio
  if (G.alarma){
    el.alarma.hidden = false;
    el.alarmaTxt.innerHTML = "<b>" + G.alarma.quien + "</b> te está robando en <b>" +
      G.alarma.patio + "</b>";
  } else el.alarma.hidden = true;

  const alLado = florinAlLado();
  bau.boton.hidden = !(isTouch && alLado && bau.caja.hidden);

  const w = WEAPONS[G.wsel];
  const notReady = G.cd > 0 ||
    (w.id === "chancla" ? G.chancla.state !== "held" : G.ammo[w.id] <= 0);
  el.throwB.classList.toggle("cool", notReady);

  let tip;
  const p = G.player;
  const useKey = isTouch ? "el botón rosa" : "<span class='k'>espacio</span>";
  if (p.carry) tip = "Llevas un <b>" + TIERS[p.carry.tier].name + "</b> (" +
    (p.carry.variant ? varLabel(p.carry.variant) + " · " : "") + TIERS[p.carry.tier].rar +
    " · " + florNombre(p.carry) + ") · corre a <b>tu patio</b>: paga " + florinIncome(p.carry) + "/s.";
  else if (G.paused) tip = "<b>Pausa.</b> Toca ▶ para seguir.";
  else if (alLado && !alLado.florin.nombre)
    tip = "Puedes <b>bautizar</b> este Florín: " + (isTouch ? "toca el botón verde ✏️" : "tecla <span class='k'>N</span>") + ".";
  else if (alLado)
    tip = "Se llama <b>" + alLado.florin.nombre + "</b> · " + (isTouch ? "toca ✏️" : "<span class='k'>N</span>") + " para cambiarle el nombre.";
  else if (G.inShop && el.arm.hidden) tip = "Estás en la <b>Armería</b>: toca <b>🧰</b> arriba" + (isTouch ? "" : " o la tecla <span class='k'>T</span>") + " para abrirla.";
  else if (G.inShop) tip = "Compra gadgets y cámbialos con " + (isTouch ? "los chips de abajo" : "<span class='k'>1</span>–<span class='k'>9</span> o <span class='k'>Q</span>/<span class='k'>E</span>") + ". Cierra con <b>🧰</b>.";
  else if (G.player.inRuleta && el.rul.hidden) tip = "Estás en la <b>Ruleta</b>: toca <b>🎰</b> arriba" + (isTouch ? "" : " o la tecla <span class='k'>R</span>") + " para abrirla.";
  else if (G.player.inRuleta) tip = "<b>Ruleta</b>: " + money(RULETA_PRECIO) + " por tirada. Las casillas <b>???</b> dan las variantes ✨ y 🌈.";
  else if (G.grab.ped && G.grab.ped.esDesfile) tip = "No te muevas… <b>estás atrapando</b> uno del desfile.";
  else if (p.patios.some(b => laserActivo(b))){
    const b = p.patios.find(q => laserActivo(q));
    tip = "<b>Láseres encendidos</b> en " + b.name + ": nadie entra por " + Math.ceil(b.laser.activo) + " s.";
  }
  else if (G.slowmo > 0) tip = "<b>⏱️ Cámara lenta</b>: ladrones y abuelas al 40 %. Corre.";
  else if (G.perros.length) tip = "Tu <b>chihuahua</b> anda suelto: muerde a los ladrones que entren a tus patios.";
  else if (p.invis > 0) tip = "Eres <b>invisible</b>: las abuelas no te ven. Aprovecha.";
  else if (p.boost > 0) tip = "<b>Turbo activo</b>: agarra los florines más caros.";
  else if (inc === 0) tip = "Tu vitrina está vacía: <b>atrapa uno del desfile</b> en el centro, o roba en una casa vecina.";
  else if (G.grab.ped) tip = "No te muevas… <b>estás robando</b>.";
  else if (G.thieves.some(t => t.state === "grab")){
    const l = G.thieves.find(t => t.state === "grab");
    tip = "¡<b>" + LADRONES[l.who].label + "</b> está en tu vitrina! Dale con " + useKey + ".";
  }
  else if (w.id === "chancla" && G.chancla.state !== "held") tip = "Tu chancla viene de regreso… <b>espérala</b>.";
  else if (notReady) tip = "Sin usos de <b>" + w.name + "</b>. Compra más en la <b>Armería</b> (abajo, al centro).";
  else if (G.stats.lost > 0 && G.stats.lost % 3 === 0) tip = "Los vecinos vienen seguido. <b>Quédate cerca</b> de tu vitrina y chanclea.";
  else tip = "Arma: <b>" + w.name + "</b> · " +
    (isTouch ? "arrastra desde el botón rosa para <b>apuntar</b>" : "apunta con el cursor y " + useKey) + ".";
  if (tip !== lastTip){ el.tip.innerHTML = tip; lastTip = tip; }
}

/* ============================================================
   Flujo del juego
   ============================================================ */
function startGame(modo){
  const m = modo === 2 ? 2 : (modo === 1 ? 1 : (G && G.mode) || 1);
  G = nuevaPartida(m);
  G.started = true;
  document.getElementById("app").classList.toggle("dos", m === 2);
  el.title.hidden = true;
  el.end.hidden = true;
  el.arm.hidden = true;
  el.rul.hidden = true;
  el.alarma.hidden = true;
  invalidarSuelo();                 // el decorado se repinta para el escenario nuevo
  document.getElementById("album").hidden = true;
  el.pause.textContent = "⏸";
  lastTip = "";
  renderWbar(); renderRack(); renderBotonesPanel();
  Snd.unlock();
}

function endGame(ganador){
  G.over = true; G.winner = ganador || null;
  const won = !!ganador;
  if (G.mode === 2 && ganador){
    const perdedor = G.players.find(p => p !== ganador);
    document.getElementById("endEyebrow").textContent = "Duelo terminado";
    document.getElementById("endTitle").innerHTML =
      "¡Gana <em>J" + (ganador.idx+1) + "</em>!";
    document.getElementById("endSub").textContent =
      "J" + (ganador.idx+1) + " llegó a " + money(GOAL) + " mientras J" + (perdedor.idx+1) +
      " se quedó en " + money(perdedor.money) + ". Las abuelas del barrio no quieren volver a ver a ninguno de los dos.";
    document.getElementById("stSteals").textContent = ganador.stats.steals + " / " + perdedor.stats.steals;
    document.getElementById("stHits").textContent   = ganador.stats.hits + " / " + perdedor.stats.hits;
    document.getElementById("stTime").textContent   = mmss(G.t);
    document.getElementById("stRate").textContent   = money(playerIncome(ganador)) + "/s";
    el.end.hidden = false;
    Snd.win();
    return;
  }
  document.getElementById("endEyebrow").textContent = won ? "Meta cumplida" : "Fin del patio";
  document.getElementById("endTitle").innerHTML = won ? "¡Patio <em>lleno</em>!" : "Te dejaron <em>pelado</em>";
  document.getElementById("endSub").textContent = won
    ? "Llegaste a " + money(GOAL) + " con la vitrina más envidiada del barrio. Las abuelas del vecindario no te quieren volver a ver."
    : "Los vecinos se llevaron todo.";
  document.getElementById("stSteals").textContent = G.stats.steals;
  document.getElementById("stHits").textContent = G.stats.hits;
  document.getElementById("stTime").textContent = mmss(G.t);
  document.getElementById("stRate").textContent = money(playerIncome(G.player)) + "/s";
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
    avanzar(G, entradas(), dt);
    consumirEventos();
  }
  animarParticulas(dt);
  draw();
  hud();
  requestAnimationFrame(frame);
}

resize();
G = nuevaPartida(1);
renderWbar(); renderRack(); renderBotonesPanel();
requestAnimationFrame(frame);
