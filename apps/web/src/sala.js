/* El cliente de sala: lo único que habla con el servidor de salas.

   El servidor manda. Aquí no se decide nada del juego: se mandan las teclas y
   se dibuja lo que llega. Pero llega 20 veces por segundo y se dibuja 60, así
   que hay dos cosas que hacer para que no se vea a saltos:

   1. INTERPOLAR a los demás. Se guardan las dos últimas fotos y se dibuja el
      punto intermedio según el reloj. Se ve suave a costa de ir ~50 ms por
      detrás, que en los demás no se nota.

   2. ADELANTARSE con el tuyo. Si tu muñeco esperara a la respuesta del
      servidor, andar se sentiría pegajoso — y eso sí se nota. Así que se mueve
      al instante con tu tecla y luego se acerca despacio a donde dice el
      servidor. Si hay discrepancia, gana el servidor; solo que sin tirón. */

import { WORLD_H, WORLD_W, clamp, lerp } from "./puente.js";

const RECONECTAR_MS = 1500;
/** Cuánto tarda tu muñeco en aceptar la corrección del servidor. */
const RECONCILIAR = 6;
/** Velocidad base del jugador en el motor, para adelantarse. */
const VEL = 268;

export function conectarSala({ url, token, codigo, modo, escenario, apodo, al }) {
  let ws = null, vivo = true, reintento = null;
  const estado = {
    conectado: false, codigo: codigo || null, idx: null, modo: modo || "aventura",
    gente: [], mundo: null, error: null,
    /* Una carrera espera en la línea hasta que alguien da la salida. */
    enParrilla: false, cuenta: null,
  };

  /* Las dos últimas fotos de lo que se mueve, con la hora en que llegaron. */
  let antes = null, ahora = null, tAntes = 0, tAhora = 0;

  const mandar = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function abrir(){
    ws = new WebSocket(url);
    ws.addEventListener("open", () => {
      estado.error = null;
      mandar({ t: "entrar", token, codigo: estado.codigo, modo, escenario, apodo });
    });
    ws.addEventListener("message", ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "bienvenida"){
        estado.conectado = true;
        estado.codigo = m.codigo; estado.idx = m.idx; estado.modo = m.modo;
        estado.gente = m.gente; estado.mundo = m.mundo;
        estado.enParrilla = !!m.enParrilla; estado.cuenta = null;
        antes = ahora = null;
        al?.({ tipo: "entrado" });
      } else if (m.t === "mundo"){
        /* Llega el mundo entero: se acepta tal cual, pero se le devuelve al
           muñeco propio la posición que ya tenía dibujada, para que la
           resincronización no dé un tirón cada 3 segundos. */
        const mio = estado.mundo?.players?.[estado.idx];
        const px = mio?.x, py = mio?.y;
        estado.mundo = m.mundo;
        const nuevo = estado.mundo.players[estado.idx];
        if (nuevo && px != null){ nuevo.x = px; nuevo.y = py; }
      } else if (m.t === "tick"){
        antes = ahora; tAntes = tAhora;
        ahora = m.movil; tAhora = performance.now();
      } else if (m.t === "salida"){
        estado.cuenta = m.en;
        if (m.en <= 0) estado.enParrilla = false;
        al?.({ tipo: "salida", en: m.en });
      } else if (m.t === "gente"){
        estado.gente = m.gente;
        al?.({ tipo: "gente" });
      } else if (m.t === "eventos"){
        al?.({ tipo: "eventos", eventos: m.eventos });
      } else if (m.t === "error"){
        estado.error = m.motivo;
        al?.({ tipo: "error", motivo: m.motivo });
        cerrar();
      }
    });
    ws.addEventListener("close", () => {
      estado.conectado = false;
      /* Si el servidor ya dijo POR QUÉ te echó, ese motivo manda. Antes el
         cierre venía justo detrás y pisaba "Hay que entrar con tu cuenta" con
         un "se cortó… reconectando" que no ayuda a nadie. */
      if (estado.error) return;
      al?.({ tipo: "caido" });
      if (vivo) reintento = setTimeout(abrir, RECONECTAR_MS);
    });
    ws.addEventListener("error", () => { try { ws.close(); } catch (_){} });
  }
  abrir();

  /* Latido por temporizador y NO por el bucle de dibujo. El navegador congela
     requestAnimationFrame en una pestaña de fondo: sin esto, mirar otra cosa
     veinte segundos te echaba de la sala. */
  const latido = setInterval(() => mandar({ t: "ping" }), 5000);

  /* Mete en `mundo` las posiciones interpoladas. El resto del cliente dibuja
     `mundo` sin enterarse de que viene por la red. */
  function aplicar(dt, entrada){
    const M = estado.mundo;
    if (!M || !ahora) return;
    const f = antes && tAhora > tAntes
      ? clamp((performance.now() - tAhora) / (tAhora - tAntes), 0, 1.6)
      : 1;
    const mezcla = (viejo, nuevo) => viejo == null ? nuevo : viejo + (nuevo - viejo) * (1 + f);

    for (const [idx, x, y, face, walk, stun] of ahora.jug){
      const p = M.players[idx]; if (!p) continue;
      const prev = antes?.jug.find(q => q[0] === idx);
      const sx = mezcla(prev?.[1], x), sy = mezcla(prev?.[2], y);
      if (idx === estado.idx){
        // el tuyo: te adelantas con tu tecla y te acercas a lo que dice el servidor
        const m = Math.hypot(entrada.mover.x, entrada.mover.y) || 1;
        p.x = clamp(p.x + (entrada.mover.x / m) * VEL * dt * (m > .01 ? 1 : 0), 22, WORLD_W - 22);
        p.y = clamp(p.y + (entrada.mover.y / m) * VEL * dt * (m > .01 ? 1 : 0), 22, WORLD_H - 22);
        p.x = lerp(p.x, sx, 1 - Math.pow(0.001, dt * RECONCILIAR / 6));
        p.y = lerp(p.y, sy, 1 - Math.pow(0.001, dt * RECONCILIAR / 6));
      } else {
        p.x = sx; p.y = sy;
      }
      p.face = face; p.walk = walk; p.stun = stun;
    }
    const porId = (lista, id) => lista?.find(q => q[0] === id);
    for (const [id, x, y, face, walk] of ahora.lad){
      const t = M.thieves.find(q => q.id === id); if (!t) continue;
      const prev = porId(antes?.lad, id);
      t.x = mezcla(prev?.[1], x); t.y = mezcla(prev?.[2], y); t.face = face; t.walk = walk;
    }
    for (const [id, x, y] of ahora.des){
      const d = M.portal.desfile.find(q => q.id === id); if (!d) continue;
      const prev = porId(antes?.des, id);
      d.x = mezcla(prev?.[1], x); d.y = mezcla(prev?.[2], y);
    }
    for (const [id, x, y, giro] of ahora.tra){
      const v = M.trastos.find(q => q.id === id); if (!v) continue;
      v.x = x; v.y = y; v.giro = giro;
    }
    for (const [i, x, y] of ahora.suelo){
      const g = M.ground[i]; if (!g) continue;
      g.x = x; g.y = y;
    }
    M.t = ahora.t;
  }

  function cerrar(){
    vivo = false;
    clearInterval(latido);
    clearTimeout(reintento);
    try { ws?.close(); } catch (_){}
  }

  return {
    estado,
    aplicar,
    entrada: (mover, apunta) => mandar({ t: "entrada", mover, apunta }),
    arma: i => mandar({ t: "arma", i }),
    comprar: i => mandar({ t: "comprar", i }),
    usar: () => mandar({ t: "usar" }),
    ruleta: () => mandar({ t: "ruleta" }),
    bajarse: () => mandar({ t: "bajarse" }),
    vender: (b, i) => mandar({ t: "vender", b, i }),
    soltar: () => mandar({ t: "soltar" }),
    arrancar: () => mandar({ t: "arrancar" }),
    cerrar,
  };
}
