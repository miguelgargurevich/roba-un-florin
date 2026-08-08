/* El servidor de salas. Un http mínimo para la salud y el resto por WebSocket. */

import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { HZ } from "./protocolo.js";
import type { DelCliente, DeLaSala } from "./protocolo.js";
import { Registro, type Asiento, type Sala } from "./salas.js";
import { ajustesDelEntorno, quienEs } from "./jwt.js";

const PUERTO = Number(process.env.PORT || 5182);
const aj = ajustesDelEntorno();          // si falta el secreto, no arranca. A propósito.
const registro = new Registro();

const http = createServer((req, res) => {
  if (req.url === "/salud") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, salas: registro.tamaño }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http });

interface Sesion { sala: Sala; asiento: Asiento }
const sesiones = new Map<WebSocket, Sesion>();

const mandar = (ws: WebSocket, m: DeLaSala) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
};

wss.on("connection", ws => {
  ws.on("message", async bruto => {
    let m: DelCliente;
    try { m = JSON.parse(String(bruto)); } catch { return; }

    const s = sesiones.get(ws);
    if (s) s.asiento.ultimaSeñal = Date.now();

    if (m.t === "ping") { mandar(ws, { t: "pong" }); return; }

    if (m.t === "entrar") {
      const quien = await quienEs(m.token, aj);
      if (!quien) { mandar(ws, { t: "error", motivo: "Hay que entrar con tu cuenta." }); return; }

      const sala = m.codigo ? registro.buscar(m.codigo) : registro.crear(m.escenario, m.modo);
      if (!sala) { mandar(ws, { t: "error", motivo: "No existe esa sala." }); return; }

      const asiento = sala.sentar(quien.userId, m.apodo || quien.apodo, x => mandar(ws, x));
      if (!asiento) { mandar(ws, { t: "error", motivo: "La sala está llena." }); return; }

      sala.vehiculoDe(asiento, m.vehiculo);
      sesiones.set(ws, { sala, asiento });
      mandar(ws, {
        t: "bienvenida", codigo: sala.codigo, idx: asiento.idx,
        apodo: asiento.apodo, modo: sala.modo, mundo: sala.estado, gente: sala.gente,
        enParrilla: sala.esperando,
      });
      sala.difundir({ t: "gente", gente: sala.gente });
      return;
    }

    if (!s) return;                    // todo lo demás exige estar sentado
    if (m.t === "entrada") {
      s.asiento.entrada = { mover: m.mover, apunta: m.apunta };
    } else if (m.t === "arma")    s.sala.arma(s.asiento, m.i);
    else if (m.t === "comprar")   s.sala.comprar(s.asiento, m.i);
    else if (m.t === "arrancar")  s.sala.arrancar();
    else if (m.t === "usar")      s.sala.usar(s.asiento);
    else if (m.t === "ruleta")    s.sala.ruleta(s.asiento);
    else if (m.t === "bajarse")   s.sala.bajar(s.asiento);
    else if (m.t === "vender")    s.sala.vender(s.asiento, m.b, m.i);
    else if (m.t === "soltar")    s.sala.soltarFlorin(s.asiento);
  });

  ws.on("close", () => {
    const s = sesiones.get(ws);
    if (!s) return;
    s.sala.soltar(s.asiento.userId);
    s.sala.difundir({ t: "gente", gente: s.sala.gente });
    sesiones.delete(ws);
  });
});

/* El reloj. `dt` real y no fijo: si el proceso se atasca un momento, el mundo
   no se queda atrás — `Sala.avanzar` ya trocea en pasos fijos por dentro. */
let anterior = Date.now();
setInterval(() => {
  const ahora = Date.now();
  const dt = Math.min(0.25, (ahora - anterior) / 1000);
  anterior = ahora;
  registro.avanzar(dt);
}, 1000 / HZ);

http.listen(PUERTO, () => console.log(`salas escuchando en :${PUERTO}`));
