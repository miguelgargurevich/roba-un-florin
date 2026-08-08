import { WebSocket } from "ws";
import { SignJWT } from "jose";
const SEC = new TextEncoder().encode(process.env.SEC);
const token = await new SignJWT({ sub: "anfitrion", name: "Anfitrion" })
  .setProtectedHeader({ alg: "HS256" }).setIssuer("florin").setAudience("florin")
  .setExpirationTime("2h").sign(SEC);
const ws = new WebSocket("wss://salas.florin.gargurevich.dev");
await new Promise(r => ws.on("open", r));
ws.send(JSON.stringify({ t: "entrar", token, modo: "aventura", escenario: "barrio" }));
ws.on("message", d => {
  const m = JSON.parse(d);
  if (m.t === "bienvenida") console.log("CODIGO=" + m.codigo);
  if (m.t === "gente") console.log("gente:", m.gente.map(g => g.apodo + (g.conectado?"":"(ido)")).join(", "));
  if (m.t === "error") console.log("error:", m.motivo);
});
setInterval(() => ws.send(JSON.stringify({ t: "ping" })), 4000);
setInterval(() => ws.send(JSON.stringify({ t: "entrada", mover: { x: 0, y: 0 }, apunta: null })), 500);
setTimeout(() => process.exit(0), 180000);
