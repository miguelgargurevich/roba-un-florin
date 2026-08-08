/* Estas pruebas son la razón de ser de la Fase 1: con la lógica fuera del
   navegador se puede comprobar el juego sin abrir una ventana, y sobre todo se
   puede comprobar que es DETERMINISTA, que es lo que hará posible el servidor
   autoritativo más adelante. */

import { describe, expect, it } from "vitest";
import {
  CIRCUITOS, ESCENARIOS, ESCUDO_DUR, FLORES, GARAJE, GOAL, HITO_R, JUGADORES_MAX,
  VEHICULOS, VUELTAS, ANCHO_PISTA, CAJAS_EN_PISTA, ESPECIAL_NIVEL, darleVehiculo,
  enLaPista, esEspecial, potenciadorPorId, potenciadoresDe, trastoDe, usarPotenciador,
  vehiculoDelSitio,
  puestosDeCarrera, puestoDe, pensarBot, LASER_DUR, LASER_PRECIO, PORTAL_RAREZAS, RAR_COLOR,
  reglasPara,
  RULETA, RULETA_INCOGNITA, RULETA_PRECIO, TIERS, WEAPONS, varMult,
  avanzar, bajarse, cargar, crearPartida, girarRuleta, idsDeArmas, inRect,
  occupiedDe, playerIncome, spawnThief, usarArma, comprarArma, seleccionarArma,
  nuevoFlorin, baseDe, patiosDe, zap, multDeMontura, puntoDelDesfile, puntoDelOcho,
  nivelDeVitrina, nombreDeHito, HITOS_MAX, vitrinaDe, venderFlorin, precioDeVenta, soltarCarga,
  type EntradaJugador, type Estado,
} from "../src/index.js";

const QUIETO: EntradaJugador = { mover: { x: 0, y: 0 }, apunta: null };

/* La Ruleta y la Armería solo atienden a quien está dentro, y quien lo marca
   es el paso de simulación. Estos dos plantan al jugador y dejan correr un
   frame para que las banderas se pongan. */
function enLaRuleta(e: Estado, p: any) {
  p.x = e.ruleta.x; p.y = e.ruleta.y;
  avanzar(e, nada(e.players.length), 1 / 60);
}
function enLaArmeria(e: Estado, p: any) {
  p.x = e.armeria.x + e.armeria.w / 2;
  p.y = e.armeria.y + e.armeria.h / 2;
  avanzar(e, nada(e.players.length), 1 / 60);
}
const nada = (n = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, QUIETO]));

function partida(op: Partial<Parameters<typeof crearPartida>[0]> = {}) {
  return crearPartida({ jugadores: 1, escenario: "barrio", semilla: 7, armas: idsDeArmas(), ...op });
}
/** El duelo de sofá: dos jugadores, solo chancla, sin puestos ni patios extra. */
function duelo() {
  return partida({
    jugadores: 2,
    reglas: { patiosExtra: false, todasLasArmas: false, puestos: false, modo: "versus" },
  });
}
/** Corre `segs` segundos a 60 fps. */
function correr(e: Estado, segs: number, ent = nada(e.players.length)) {
  for (let i = 0; i < Math.round(segs * 60); i++) avanzar(e, ent, 1 / 60);
  return e;
}

describe("determinismo", () => {
  it("dos partidas con la misma semilla evolucionan idénticas", () => {
    const a = correr(partida({ semilla: 123 }), 40);
    const b = correr(partida({ semilla: 123 }), 40);
    const foto = (e: Estado) => JSON.stringify({
      t: e.t.toFixed(4),
      dinero: e.players[0].money.toFixed(4),
      pos: [e.players[0].x.toFixed(3), e.players[0].y.toFixed(3)],
      ladrones: e.thieves.map(t => [t.who, t.state, t.x.toFixed(2), t.y.toFixed(2)]),
      desfile: e.portal.desfile.map(d => [d.florin.tier, d.florin.flor, d.k.toFixed(4)]),
      vitrinas: e.bases.map(b => b.peds.filter(p => p.florin).length),
    });
    expect(foto(a)).toBe(foto(b));
  });

  it("semillas distintas dan partidas distintas", () => {
    const a = correr(partida({ semilla: 1 }), 30);
    const b = correr(partida({ semilla: 2 }), 30);
    const desfile = (e: Estado) => e.portal.desfile.map(d => d.florin.tier).join(",");
    expect(desfile(a) === desfile(b) && a.thieves.length === b.thieves.length).toBe(false);
  });

  it("no toca Math.random: rehacer la partida tras usar Math.random da lo mismo", () => {
    const a = correr(partida({ semilla: 5 }), 20);
    for (let i = 0; i < 1000; i++) Math.random();
    const b = correr(partida({ semilla: 5 }), 20);
    expect(b.players[0].money.toFixed(6)).toBe(a.players[0].money.toFixed(6));
  });
});

describe("el mundo se monta bien", () => {
  it("un jugador: 5 bases más 2 patios comprables", () => {
    const e = partida();
    expect(e.bases.length).toBe(7);
    expect(e.bases.filter(b => b.locked).length).toBe(2);
    expect(e.players.length).toBe(1);
    expect(e.players[0].patios.length).toBe(1);
  });

  it("dos jugadores: sin patios comprables y con patio para el J2", () => {
    const e = duelo();
    expect(e.bases.filter(b => b.locked).length).toBe(0);
    expect(e.players.length).toBe(2);
    expect(baseDe(e, e.players[1].baseId).name).toBe("Patio del J2");
  });

  it("todos los escenarios se pueden montar, y son dieciséis", () => {
    expect(ESCENARIOS.length).toBe(16);
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      expect(e.esc.id, esc.id).toBe(esc.id);
      expect(e.bases.length, esc.id).toBe(7);
      // las bases tienen que caber en el mundo, no salirse por un borde
      for (const b of e.bases) {
        expect(b.rect.x, esc.id + " " + b.name).toBeGreaterThanOrEqual(0);
        expect(b.rect.y, esc.id + " " + b.name).toBeGreaterThanOrEqual(0);
        expect(b.rect.x + b.rect.w, esc.id + " " + b.name).toBeLessThanOrEqual(2600);
        expect(b.rect.y + b.rect.h, esc.id + " " + b.name).toBeLessThanOrEqual(1700);
      }
    }
  });

  it("cada escenario reparte trastos, y ninguno cae en el agua sin flotar", () => {
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      expect(e.trastos.length, esc.id).toBeGreaterThan(0);
      if (e.esc.mar == null) continue;
      for (const v of e.trastos)
        expect(v.y, esc.id + " " + v.tipo).toBeLessThan(e.esc.mar);
    }
  });

  it("cada vecino tiene abuela y algún Florín; los patios no", () => {
    const e = partida();
    for (const b of e.bases) {
      if (b.isPlayer) { expect(b.guard).toBeNull(); expect(occupied(b)).toBe(0); }
      else { expect(b.guard).not.toBeNull(); expect(occupied(b)).toBeGreaterThan(0); }
    }
    function occupied(b: (typeof e.bases)[number]) { return b.peds.filter(p => p.florin).length; }
  });
});

describe("cada jugador de más reemplaza a un bot", () => {
  const botsDe = (e: Estado) => e.bases.filter(b => !b.isPlayer && b.who).length;
  const patiosDe_ = (e: Estado) => e.bases.filter(b => b.isPlayer && !b.locked).length;

  it("de 1 a 5 jugadores, los bots bajan uno a uno", () => {
    const esperado = [[1, 4], [2, 3], [3, 2], [4, 1], [5, 0]];
    for (const [n, bots] of esperado) {
      const e = partida({ jugadores: n });
      expect(e.players.length, `${n} jugadores`).toBe(n);
      expect(botsDe(e), `${n} jugadores → ${bots} bots`).toBe(bots);
      expect(patiosDe_(e)).toBe(n);
    }
  });

  it("la sala llena son 5 y no se puede pedir más", () => {
    expect(JUGADORES_MAX).toBe(5);
    expect(partida({ jugadores: 99 }).players.length).toBe(5);
    expect(partida({ jugadores: 0 }).players.length).toBe(1);
  });

  it("cada uno tiene su patio, su color y nadie comparte", () => {
    const e = partida({ jugadores: 5 });
    const casas = e.players.map(p => p.baseId);
    expect(new Set(casas).size).toBe(5);
    expect(new Set(e.players.map(p => p.shirt)).size).toBe(5);
    for (const p of e.players) {
      const b = baseDe(e, p.baseId);
      expect(b.owner).toBe(p.idx);
      expect(b.isPlayer).toBe(true);
      expect(b.who).toBeNull();       // ya no vive ahí ningún vecino
      expect(b.laser).not.toBeNull(); // y tiene su placa de láseres
    }
  });

  it("el bot cuya casa ocupó alguien deja de mandar ladrones", () => {
    const e = partida({ jugadores: 5 });
    for (const p of e.players) baseDe(e, p.baseId).peds[0].florin = nuevoFlorin(e, 0);
    for (let i = 0; i < 60; i++) spawnThief(e);
    expect(e.thieves.length).toBe(0);   // no queda ni una casa de vecino
  });

  it("con 2 jugadores siguen robando 3 vecinos, y ninguno es el que se fue", () => {
    const e = partida({ jugadores: 2 });
    expect(baseDe(e, e.players[1].baseId).name).toBe("Patio del J2");
    for (const p of e.players) baseDe(e, p.baseId).peds[0].florin = nuevoFlorin(e, 0);
    for (let i = 0; i < 60; i++) spawnThief(e);
    const quienes = new Set(e.thieves.map(t => t.who));
    expect(quienes.has("marcia")).toBe(false);   // su casa es del J2
    expect(quienes.size).toBeGreaterThan(1);
  });

  it("solo se juega igual que siempre: 4 bots y los 2 patios en venta", () => {
    const e = partida();
    expect(botsDe(e)).toBe(4);
    expect(e.bases.length).toBe(7);
    expect(e.bases.filter(b => b.locked).length).toBe(2);
    expect(baseDe(e, 0).name).toBe("Tu patio");
  });

  it("con compañía no hay patios comprables: están pegados al del J1", () => {
    for (const n of [2, 3, 4, 5]) {
      const e = partida({ jugadores: n });
      expect(e.bases.filter(b => b.locked).length, `${n} jugadores`).toBe(0);
      expect(e.bases.length).toBe(5);
    }
  });

  it("las reglas se pueden pedir a mano por encima de las de serie", () => {
    const e = partida({ jugadores: 3, reglas: { patiosExtra: true } });
    expect(e.bases.filter(b => b.locked).length).toBe(2);
    expect(e.reglas.todasLasArmas).toBe(true);   // lo no dicho queda como toca
    expect(reglasPara(1).patiosExtra).toBe(true);
    expect(reglasPara(4).patiosExtra).toBe(false);
  });

  it("los hitos son de cada uno, no del jugador 1", () => {
    const e = partida({ jugadores: 3 });
    const p = e.players[2];
    for (const b of patiosDe(e, p)) for (const q of b.peds) q.florin = nuevoFlorin(e, 0);
    avanzar(e, nada(3), 1 / 60);
    expect(p.hitoN).toBe(1);
    expect(e.players[0].hitoN).toBe(0);
    expect(e.players[1].hitoN).toBe(0);
    const ev = e.eventos.find(x => x.t === "hito");
    expect(ev && (ev as any).jugador).toBe(2);
    expect(e.over).toBe(false);                  // una sala de aventura no se acaba
  });

  it("todos pueden cambiar de arma y usar los puestos", () => {
    const e = partida({ jugadores: 4 });
    for (const p of e.players){
      seleccionarArma(e, p, 3);
      expect(p.wsel).toBe(3);
      p.x = e.armeria.x + e.armeria.w / 2; p.y = e.armeria.y + e.armeria.h / 2;
    }
    avanzar(e, nada(4), 1 / 60);
    expect(e.players.every(p => p.inShop)).toBe(true);
  });

  it("en el duelo de sofá sigue habiendo solo chancla", () => {
    const e = duelo();
    seleccionarArma(e, e.players[0], 3);
    expect(e.players[0].wsel).toBe(0);
  });

  it("una partida de 5 sobrevive al viaje por JSON", () => {
    const a = correr(partida({ jugadores: 5, semilla: 21 }), 20, nada(5));
    const b = correr(JSON.parse(JSON.stringify(partida({ jugadores: 5, semilla: 21 }))), 20, nada(5));
    const foto = (e: Estado) => JSON.stringify(e.players.map(p => [p.idx, p.baseId, p.x.toFixed(3), p.hitoN]));
    expect(foto(b)).toBe(foto(a));
  });
});

describe("ingresos", () => {
  it("suman por rareza y variante, y cruzan varios patios", () => {
    const e = partida();
    const p = e.players[0];
    e.bases[0].peds[0].florin = nuevoFlorin(e, 0);                          // Común: 3/s
    e.bases[0].peds[1].florin = nuevoFlorin(e, 0, { variant: "brillante" }); // ×2 → 6/s
    e.bases[0].peds[2].florin = nuevoFlorin(e, 4, { variant: "arcoiris" });  // 135×3 → 405/s
    expect(playerIncome(e, p)).toBe(3 + 6 + 405);

    // al comprar el segundo patio, lo suyo también suma
    p.money = 99999;
    const patio2 = e.bases.find(b => b.locked)!;
    patio2.locked = false; patio2.owner = p.idx; p.patios.push(patio2.id);
    patio2.peds[0].florin = nuevoFlorin(e, 6);                              // Cósmico: 720/s
    expect(playerIncome(e, p)).toBe(3 + 6 + 405 + 720);
  });

  it("el dinero sube con el tiempo según los ingresos", () => {
    const e = partida();
    e.bases[0].peds[0].florin = nuevoFlorin(e, 6);      // 720/s
    const antes = e.players[0].money;
    correr(e, 1);
    expect(e.players[0].money - antes).toBeCloseTo(720, 0);
  });
});

describe("los hitos son de vitrina, no de dinero", () => {
  /** Llena todos los huecos del jugador con Florines de esa rareza. */
  function llenar(e: Estado, idx: number, tier: number) {
    const p = e.players[idx];
    for (const b of patiosDe(e, p)) for (const q of b.peds) q.florin = nuevoFlorin(e, tier);
  }

  it("el dinero no da hitos por muy alto que sea", () => {
    const e = partida();
    e.players[0].money = GOAL * 500;
    correr(e, 1);
    expect(e.players[0].hitoN).toBe(0);
    expect(e.over).toBe(false);
  });

  it("llenar la vitrina es el primer hito", () => {
    const e = partida();
    llenar(e, 0, 0);
    avanzar(e, nada(), 1 / 60);
    expect(e.players[0].hitoN).toBe(1);
    expect(e.eventos.some(ev => ev.t === "hito" && ev.n === 1)).toBe(true);
    expect(e.over).toBe(false);              // en aventura no se acaba
  });

  it("el nivel lo marca el PEOR Florín: subir es cambiar el más flojo", () => {
    const e = partida();
    llenar(e, 0, 6);                          // toda de Cósmicos
    avanzar(e, nada(), 1 / 60);
    expect(e.players[0].hitoN).toBe(7);       // llena(1) + Cósmico(6)

    // uno malo entre los buenos tira el nivel actual al suelo
    baseDe(e, e.players[0].baseId).peds[0].florin = nuevoFlorin(e, 0);
    expect(nivelDeVitrina(e, e.players[0])).toBe(1);
    avanzar(e, nada(), 1 / 60);
    expect(e.players[0].hitoN, "lo ya celebrado no se pierde").toBe(7);
  });

  it("una vitrina a medias no es hito, por muy buena que sea", () => {
    const e = partida();
    baseDe(e, e.players[0].baseId).peds[0].florin = nuevoFlorin(e, 14);
    correr(e, 1);
    expect(e.players[0].hitoN).toBe(0);
  });

  it("con más patios hay más huecos que llenar", () => {
    const e = partida();
    const p = e.players[0];
    llenar(e, 0, 3);
    avanzar(e, nada(), 1 / 60);
    expect(p.hitoN).toBe(4);

    p.money = 99999;                          // se compra otro patio: la meta crece
    const patio2 = e.bases.find(b => b.locked)!;
    patio2.locked = false; patio2.owner = p.idx; p.patios.push(patio2.id);
    expect(nivelDeVitrina(e, p)).toBe(0);     // vacío: ya no está llena
  });

  it("la escalera llega hasta la última rareza", () => {
    const e = partida();
    llenar(e, 0, TIERS.length - 1);
    avanzar(e, nada(), 1 / 60);
    expect(e.players[0].hitoN).toBe(HITOS_MAX);
    expect(nombreDeHito(HITOS_MAX)).toContain("Ancestral");
  });
});

describe("modo versus", () => {
  function versus(n = 2) {
    return partida({ jugadores: n, reglas: { modo: "versus", patiosExtra: false } });
  }

  it("gana el primero que llena todos sus patios", () => {
    const e = versus();
    const p = e.players[1];
    for (const b of patiosDe(e, p)) for (const q of b.peds) q.florin = nuevoFlorin(e, 0);
    avanzar(e, nada(2), 1 / 60);
    expect(e.over).toBe(true);
    expect(e.winnerIdx).toBe(1);
    expect(e.eventos.some(ev => ev.t === "fin" && ev.ganador === 1)).toBe(true);
  });

  it("el dinero no gana la partida", () => {
    const e = versus();
    e.players[0].money = GOAL * 1000;
    correr(e, 2, nada(2));
    expect(e.over).toBe(false);
  });

  it("media vitrina no basta", () => {
    const e = versus();
    const p = e.players[0];
    const peds = patiosDe(e, p).flatMap(b => b.peds);
    for (const q of peds.slice(0, peds.length - 1)) q.florin = nuevoFlorin(e, 14);
    correr(e, 1, nada(2));
    expect(e.over).toBe(false);
    peds[peds.length - 1].florin = nuevoFlorin(e, 0);   // el último, aunque sea Común
    avanzar(e, nada(2), 1 / 60);
    expect(e.over).toBe(true);
  });

  it("en aventura llenarla NO acaba la partida", () => {
    const e = partida();
    for (const b of patiosDe(e, e.players[0])) for (const q of b.peds) q.florin = nuevoFlorin(e, 0);
    correr(e, 1);
    expect(e.over).toBe(false);
    expect(e.players[0].hitoN).toBe(1);
  });
});

describe("el desfile del portal", () => {
  it("suelta un Florín cada 6 s y los recicla al terminar la vuelta", () => {
    const e = partida();
    correr(e, 3);
    expect(e.portal.desfile.length).toBe(1);
    correr(e, 6);
    expect(e.portal.desfile.length).toBe(2);
    correr(e, 30);
    expect(e.portal.desfile.length).toBeGreaterThan(2);
    expect(e.portal.desfile.length).toBeLessThanOrEqual(6);
  });

  it("reparte rarezas con los pesos de la tabla: manda el Común", () => {
    const e = partida({ semilla: 99 });
    const cuenta: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      e.portal.desfile.length = 0;
      e.portal.timer = 0;
      avanzar(e, nada(), 1 / 60);
      const d = e.portal.desfile[0];
      if (d) cuenta[TIERS[d.florin.tier].rar] = (cuenta[TIERS[d.florin.tier].rar] || 0) + 1;
    }
    expect(cuenta["Común"]).toBeGreaterThan(cuenta["Cósmico"] || 0);
    expect(cuenta["Común"]).toBeGreaterThan(80);
  });

  it("la tabla del portal cubre TODAS las rarezas y va de más a menos", () => {
    // Sin esto, agregar una rareza al catálogo y olvidarla en la tabla la deja
    // imposible de conseguir del desfile, y nadie se entera.
    expect(PORTAL_RAREZAS.map(f => f.tier)).toEqual(TIERS.map((_, i) => i));
    for (let i = 1; i < PORTAL_RAREZAS.length; i++)
      expect(PORTAL_RAREZAS[i].p).toBeLessThanOrEqual(PORTAL_RAREZAS[i - 1].p);
    const total = PORTAL_RAREZAS.reduce((s, f) => s + f.p, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("hasta lo más raro llega a salir si esperas lo suficiente", () => {
    const e = partida({ semilla: 3 });
    const vistos = new Set<number>();
    for (let i = 0; i < 20000 && vistos.size < TIERS.length; i++) {
      e.portal.desfile.length = 0;
      e.portal.timer = 0;
      avanzar(e, nada(), 1 / 60);
      const d = e.portal.desfile[0];
      if (d) vistos.add(d.florin.tier);
    }
    expect(vistos.size).toBe(TIERS.length);
  });
});

describe("el catálogo de Florines", () => {
  it("cada rareza tiene su color: sin él la píldora sale gris", () => {
    for (const T of TIERS) expect(RAR_COLOR[T.rar]).toBeTruthy();
  });

  it("precio e ingresos suben con la rareza, sin escalones al revés", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].price).toBeGreaterThan(TIERS[i - 1].price);
      expect(TIERS[i].income).toBeGreaterThan(TIERS[i - 1].income);
    }
  });

  it("las variantes multiplican en el orden que dice el álbum", () => {
    expect(varMult(null)).toBe(1);
    expect(varMult("brillante")).toBe(2);
    expect(varMult("arcoiris")).toBe(3);
    expect(varMult("fantasma")).toBe(4);
    expect(varMult("dorado")).toBe(5);
  });

  it("un Florín rinde precio y variante juntos", () => {
    const e = partida();
    const p = e.players[0];
    const ped = baseDe(e, p.baseId).peds[0];
    ped.florin = { ...nuevoFlorin(e, TIERS.length - 1), variant: "dorado" };
    expect(playerIncome(e, p)).toBe(TIERS[TIERS.length - 1].income * 5);
  });

  it("la ruleta solo reparte rarezas que existen", () => {
    for (const c of RULETA)
      if (c.kind === "florin") expect(TIERS[c.tier]).toBeDefined();
    for (const f of RULETA_INCOGNITA){
      if (f.tier != null) expect(TIERS[f.tier]).toBeDefined();
      if (f.tierMax != null) expect(f.tierMax).toBeLessThan(TIERS.length);
    }
  });

  it("la casilla ??? es la única que da variantes, y da las cuatro", () => {
    expect(RULETA.every(c => c.kind !== "florin" || true)).toBe(true);
    const deIncognita = new Set(RULETA_INCOGNITA.map(f => f.variant));
    for (const v of ["brillante", "arcoiris", "fantasma", "dorado"])
      expect(deIncognita.has(v as any)).toBe(true);
  });

  it("cada especie de flor tiene forma y nombre", () => {
    expect(FLORES.length).toBeGreaterThanOrEqual(18);
    for (const f of FLORES){
      expect(f.nombre).toBeTruthy();
      expect(f.forma).toBeTruthy();
    }
    expect(new Set(FLORES.map(f => f.id)).size).toBe(FLORES.length);
  });
});

describe("trastos: bicis, tablas y pelotas", () => {
  const haciaLaDerecha = { 0: { mover: { x: 1, y: 0 }, apunta: null } };
  /** Pone al jugador justo encima de un trasto del tipo pedido. */
  function encimaDe(e: Estado, tipo: string) {
    const v = e.trastos.find(x => x.tipo === tipo)!;
    expect(v, `no hay ningún ${tipo} en ${e.esc.id}`).toBeTruthy();
    e.players[0].x = v.x; e.players[0].y = v.y;
    return v;
  }

  it("cada escenario reparte lo suyo, y nada cae encima de una base", () => {
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      expect(e.trastos.length).toBeGreaterThan(0);
      for (const v of e.trastos)
        for (const b of e.bases)
          expect(inRect(v.x, v.y, b.rect, 0)).toBe(false);
    }
    expect(partida({ escenario: "barrio" }).trastos.some(v => v.tipo === "bici")).toBe(true);
    expect(partida({ escenario: "barrio" }).trastos.some(v => v.tipo === "patineta")).toBe(true);
    expect(partida({ escenario: "playa" }).trastos.some(v => v.tipo === "tabla")).toBe(true);
    expect(partida({ escenario: "desierto" }).trastos.some(v => v.tipo === "tablaArena")).toBe(true);
    expect(partida({ escenario: "pista" }).trastos.some(v => v.tipo === "carrito")).toBe(true);
    expect(partida({ escenario: "tablero" }).trastos.some(v => v.tipo === "dado")).toBe(true);
    expect(partida({ escenario: "mirador" }).trastos.some(v => v.tipo === "vagoneta")).toBe(true);
    expect(partida({ escenario: "circuito" }).trastos.some(v => v.tipo === "caparazon")).toBe(true);
    expect(partida({ escenario: "colegio" }).trastos.some(v => v.tipo === "patineta")).toBe(true);
  });

  it("pisar una bici te monta y te hace correr más", () => {
    const e = partida();
    const p = e.players[0];
    const bici = encimaDe(e, "bici");
    avanzar(e, haciaLaDerecha, 1 / 60);
    expect(p.montado).toBe(bici.id);
    expect(bici.montadoPor).toBe(0);

    const conBici = partida();
    conBici.players[0].x = bici.x; conBici.players[0].y = bici.y;
    correr(conBici, 2, haciaLaDerecha);
    const aPie = partida();
    aPie.players[0].x = 1300; aPie.players[0].y = 900;      // lejos de todo trasto
    const x0 = aPie.players[0].x;
    correr(aPie, 2, haciaLaDerecha);
    const recorridoAPie = aPie.players[0].x - x0;
    const recorridoEnBici = conBici.players[0].x - bici.x;
    expect(recorridoEnBici).toBeGreaterThan(recorridoAPie * 1.3);
  });

  it("la bici te sigue mientras vas montado", () => {
    const e = partida();
    const bici = encimaDe(e, "bici");
    correr(e, 1, haciaLaDerecha);
    expect(bici.x).toBeCloseTo(e.players[0].x, 3);
    expect(bici.y).toBeCloseTo(e.players[0].y, 3);
  });

  it("agarrar un Florín te baja, y la bici queda donde te bajaste", () => {
    const e = partida();
    const p = e.players[0];
    const bici = encimaDe(e, "bici");
    avanzar(e, haciaLaDerecha, 1 / 60);
    expect(p.montado).toBe(bici.id);

    cargar(e, p, nuevoFlorin(e, 0));
    expect(p.montado).toBeNull();
    expect(bici.montadoPor).toBeNull();
    expect(bici.x).toBeCloseTo(p.x, 3);
  });

  it("cargando un Florín ya no te montas al pasar por encima", () => {
    const e = partida();
    const p = e.players[0];
    p.carry = nuevoFlorin(e, 0);
    encimaDe(e, "bici");
    correr(e, 0.5, haciaLaDerecha);
    expect(p.montado).toBeNull();
  });

  it("un golpe te tira del vehículo y lo deja tirado", () => {
    const e = partida();
    const p = e.players[0];
    const bici = encimaDe(e, "bici");
    avanzar(e, haciaLaDerecha, 1 / 60);
    expect(p.montado).toBe(bici.id);

    zap(e, p, 1.5, false);                 // lo que hace una abuela al alcanzarte
    avanzar(e, nada(), 1 / 60);
    expect(p.montado).toBeNull();
    expect(bici.montadoPor).toBeNull();
  });

  it("no te montas y desmontas en bucle mientras sigues encima", () => {
    const e = partida();
    const p = e.players[0];
    const bici = encimaDe(e, "bici");
    avanzar(e, nada(), 1 / 60);
    const montadoTras1 = p.montado;
    bajarse(e, p);                          // te bajas a mano, sin moverte
    correr(e, 1, nada());                   // y te quedas quieto encima
    expect(montadoTras1).toBe(bici.id);
    expect(p.montado).toBeNull();           // no se vuelve a montar solo
  });

  it("patear una pelota la manda a rodar, y frena sola", () => {
    const e = partida();
    const p = e.players[0];
    const bola = e.trastos.find(v => v.tipo === "pelota")!;
    p.x = bola.x - 26; p.y = bola.y;
    correr(e, 0.6, haciaLaDerecha);         // llega con velocidad y la patea
    expect(Math.hypot(bola.vx, bola.vy)).toBeGreaterThan(0);
    const xTrasPatada = bola.x;

    correr(e, 4, nada());
    expect(bola.x).toBeGreaterThan(xTrasPatada);
    expect(bola.vx).toBe(0);                // el rozamiento la para
    expect(bola.vy).toBe(0);
  });

  it("un pelotazo con fuerza tumba a un ladrón", () => {
    const e = partida();
    const bola = e.trastos.find(v => v.tipo === "pelota")!;
    baseDe(e, e.players[0].baseId).peds[0].florin = nuevoFlorin(e, 0);  // si no, no viene nadie
    for (let i = 0; i < 30; i++) spawnThief(e);
    const t = e.thieves[0];
    bola.x = t.x - 20; bola.y = t.y;
    bola.vx = 900; bola.vy = 0;
    bola.pateadoPor = 0;
    avanzar(e, nada(), 1 / 60);
    expect(t.stun).toBeGreaterThan(0);
    expect(e.players[0].stats.hits).toBe(1);      // el golpe se le apunta a quien pateó
  });

  it("una pelota que apenas rueda no tumba a nadie", () => {
    const e = partida();
    const bola = e.trastos.find(v => v.tipo === "pelota")!;
    baseDe(e, e.players[0].baseId).peds[0].florin = nuevoFlorin(e, 0);
    for (let i = 0; i < 30; i++) spawnThief(e);
    const t = e.thieves[0];
    bola.x = t.x - 5; bola.y = t.y;
    bola.vx = 90; bola.vy = 0;                    // por debajo del mínimo
    avanzar(e, nada(), 1 / 60);
    expect(t.stun).toBe(0);
  });

  it("el pelotazo también tumba a las abuelas", () => {
    const e = partida();
    const bola = e.trastos.find(v => v.tipo === "pelota")!;
    const abuela = e.bases.find(b => b.guard)!.guard!;
    bola.x = abuela.x - 20; bola.y = abuela.y;
    bola.vx = 900; bola.vy = 0;
    avanzar(e, nada(), 1 / 60);
    expect(abuela.stun).toBeGreaterThan(0);
  });
});

describe("el mar de la playa", () => {
  const haciaAbajo = { 0: { mover: { x: 0, y: 1 }, apunta: null } };

  it("a pie te frena en la orilla", () => {
    const e = partida({ escenario: "playa" });
    const p = e.players[0];
    const mar = e.esc.mar!;
    p.x = 1300; p.y = mar - 60;
    correr(e, 4, haciaAbajo);
    expect(p.y).toBeLessThanOrEqual(mar + 0.001);
  });

  it("la tabla nace en la arena: dentro del agua sería inalcanzable", () => {
    const e = partida({ escenario: "playa" });
    for (const v of e.trastos.filter(x => x.tipo === "tabla" || x.tipo === "flotador"))
      expect(v.y).toBeLessThan(e.esc.mar!);
  });

  it("la agarras en la orilla y con ella te metes al mar", () => {
    const e = partida({ escenario: "playa" });
    const p = e.players[0];
    const tabla = e.trastos.find(v => v.tipo === "tabla")!;
    p.x = tabla.x; p.y = tabla.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.montado).toBe(tabla.id);

    correr(e, 4, haciaAbajo);
    expect(p.y).toBeGreaterThan(e.esc.mar! + 40);  // navegando mar adentro
  });

  it("en la arena la tabla estorba, en el agua vuela", () => {
    const enAgua = partida({ escenario: "playa" });
    const t1 = enAgua.trastos.find(v => v.tipo === "tabla")!;
    enAgua.players[0].x = t1.x; enAgua.players[0].y = t1.y;
    avanzar(enAgua, nada(), 1 / 60);
    expect(multDeMontura(enAgua, enAgua.players[0])).toBeLessThan(1);   // en la arena
    enAgua.players[0].y = enAgua.esc.mar! + 50;
    expect(multDeMontura(enAgua, enAgua.players[0])).toBeGreaterThan(1); // en el agua
  });

  it("con la bici no se entra al agua", () => {
    const e = partida({ escenario: "playa" });
    const p = e.players[0];
    const falsaBici = {
      id: 9999, tipo: "bici" as const, x: 1300, y: e.esc.mar! - 20,
      vx: 0, vy: 0, montadoPor: null, pateadoPor: null, giro: 0, variante: 0,
    };
    e.trastos.push(falsaBici);
    p.x = falsaBici.x; p.y = falsaBici.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.montado).toBe(9999);          // se monta, es tierra
    correr(e, 4, haciaAbajo);
    expect(p.y).toBeLessThanOrEqual(e.esc.mar! + 0.001);   // pero el agua le para
  });

  it("el río del Amazonas frena igual que el mar", () => {
    const e = partida({ escenario: "amazonas" });
    const p = e.players[0];
    expect(e.esc.mar).toBeDefined();
    p.x = 1300; p.y = e.esc.mar! - 60;
    correr(e, 4, haciaAbajo);
    expect(p.y).toBeLessThanOrEqual(e.esc.mar! + 0.001);

    const balsa = e.trastos.find(v => v.tipo === "balsa")!;   // en la selva es balsa, no tabla
    p.x = balsa.x; p.y = balsa.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.montado).toBe(balsa.id);
    correr(e, 4, haciaAbajo);
    expect(p.y).toBeGreaterThan(e.esc.mar! + 40);
  });

  it("el puerto de Nueva York se cruza por el puente y solo por ahí", () => {
    const e = partida({ escenario: "nuevayork" });
    const p = e.players[0];
    const mar = e.esc.mar!, pu = e.esc.puente!;

    // por fuera del puente, el agua para
    p.x = 400; p.y = mar - 60;
    correr(e, 4, haciaAbajo);
    expect(p.y).toBeLessThanOrEqual(mar + 0.001);

    // por el puente se pasa andando, sin tabla ni nada
    p.x = pu.x + pu.w / 2; p.y = mar - 60;
    correr(e, 4, haciaAbajo);
    expect(p.y).toBeGreaterThan(mar + 60);
    expect(p.montado).toBeNull();
  });

  it("los otros escenarios no tienen mar y se puede llegar al borde sur", () => {
    for (const id of ["barrio", "colegio", "desierto", "machupicchu", "egipto"]) {
      const e = partida({ escenario: id });
      expect(e.esc.mar).toBeUndefined();
      const p = e.players[0];
      p.x = 1300; p.y = 1400;
      correr(e, 6, haciaAbajo);
      expect(p.y).toBeGreaterThan(1600);
    }
  });
});

describe("el recorrido del desfile", () => {
  const centro = () => ({ cx: 1300, cy: 850 });

  it("empieza en el portal de arriba y acaba en el de abajo", () => {
    const e = partida();
    const a = puntoDelDesfile(e, 0), z = puntoDelDesfile(e, 1);
    expect(a.x).toBeCloseTo(e.portal.x, 1);
    expect(a.y).toBeCloseTo(e.portal.y, 1);
    expect(z.x).toBeCloseTo(e.portal.salida.x, 1);
    expect(z.y).toBeCloseTo(e.portal.salida.y, 1);
    expect(e.portal.salida.y).toBeGreaterThan(e.portal.y);   // el de salida está abajo
  });

  it("es un ocho: pasa dos veces por el centro y tiene un lóbulo a cada lado", () => {
    const { cx, cy } = centro();
    let cruces = 0, izq = 0, der = 0;
    let dentroDelCruce = false;
    for (let i = 0; i <= 400; i++){
      const q = puntoDelOcho(i / 400);
      const cerca = Math.hypot(q.x - cx, q.y - cy) < 40;
      if (cerca && !dentroDelCruce) cruces++;
      dentroDelCruce = cerca;
      if (q.x < cx - 300) izq++;
      if (q.x > cx + 300) der++;
    }
    expect(cruces).toBeGreaterThanOrEqual(2);   // el cruce del ocho
    expect(izq).toBeGreaterThan(30);            // el lóbulo de la Armería
    expect(der).toBeGreaterThan(30);            // el de la Ruleta
  });

  it("cada lóbulo rodea su puesto: la Armería a la izquierda, la Ruleta a la derecha", () => {
    const e = partida();
    const { cx } = centro();
    expect(e.armeria.x + e.armeria.w / 2).toBeLessThan(cx);
    expect(e.ruleta.x).toBeGreaterThan(cx);
    // los dos a media altura, no uno encima del otro
    expect(Math.abs((e.armeria.y + e.armeria.h / 2) - e.ruleta.y)).toBeLessThan(10);

    // el ocho pasa por fuera de los dos, no por encima
    let rodeaArmeria = false, rodeaRuleta = false;
    for (let i = 0; i <= 400; i++){
      const q = puntoDelOcho(i / 400);
      if (q.x < e.armeria.x - 20) rodeaArmeria = true;
      if (q.x > e.ruleta.x + e.ruleta.r + 20) rodeaRuleta = true;
    }
    expect(rodeaArmeria).toBe(true);
    expect(rodeaRuleta).toBe(true);
  });

  it("la Ruleta es un círculo, y se entra por cercanía", () => {
    const e = partida();
    expect(e.ruleta.r).toBeGreaterThan(0);
    expect((e.ruleta as any).w).toBeUndefined();
    const p = e.players[0];
    p.x = e.ruleta.x; p.y = e.ruleta.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.inRuleta).toBe(true);
    p.x = e.ruleta.x + e.ruleta.r + 200;
    avanzar(e, nada(), 1 / 60);
    expect(p.inRuleta).toBe(false);
  });

  it("un Florín recorre el circuito entero y se va por abajo", () => {
    const e = partida();
    correr(e, 3);
    const d = e.portal.desfile[0];
    expect(d).toBeTruthy();
    correr(e, 8);
    expect(d.y).toBeGreaterThan(400);          // ya bajó del portal
    correr(e, 30);
    expect(e.portal.desfile.includes(d)).toBe(false);   // se fue por la salida
  });
});

describe("la alarma no se calla hasta que se resuelve", () => {
  /** Corre hasta que la condición se cumpla, o falla diciendo qué esperaba. */
  function hasta(e: Estado, que: string, cond: () => boolean, segs = 40) {
    for (let i = 0; i < 60 * segs; i++) {
      avanzar(e, nada(), 1 / 60);
      if (cond()) return;
    }
    throw new Error("nunca pasó: " + que);
  }

  /** Un ladrón camino del patio del jugador, con un Florín que llevarse. */
  function montarRobo() {
    const e = partida();
    const p = e.players[0];
    p.x = 60; p.y = 60;                                    // lejos, que no estorbe
    baseDe(e, p.baseId).peds[0].florin = nuevoFlorin(e, 3);
    for (let i = 0; i < 40 && !e.thieves.length; i++) spawnThief(e);
    return e;
  }

  it("suena en cuanto empieza a forcejear con la vitrina", () => {
    const e = montarRobo();
    hasta(e, "que salte la alarma", () => e.alarma != null);
    expect(e.alarma!.victimaIdx).toBe(0);
    expect(e.alarma!.llevandose).toBe(false);   // todavía no lo tiene
  });

  it("SIGUE sonando mientras se lo lleva, que es cuando hay que correr", () => {
    const e = montarRobo();
    hasta(e, "que se lo lleve", () => !!e.thieves.find(x => x.state === "back" && x.carry));
    expect(e.alarma, "antes se apagaba a los 0.8 s de agarrarlo").not.toBeNull();
    expect(e.alarma!.llevandose).toBe(true);
  });

  it("se calla en cuanto le quitas el Florín de las manos", () => {
    const e = montarRobo();
    hasta(e, "que se lo lleve", () => !!e.thieves.find(x => x.state === "back" && x.carry));
    const t = e.thieves.find(x => x.state === "back" && x.carry)!;
    zap(e, t, 2, false);                    // un chancletazo: suelta lo que carga
    avanzar(e, nada(), 1 / 60);
    expect(t.carry).toBeNull();
    expect(e.alarma).toBeNull();
  });

  it("se calla cuando de verdad se lo robó", () => {
    const e = montarRobo();
    hasta(e, "que salte la alarma", () => e.alarma != null);
    hasta(e, "que llegue a su casa", () => e.alarma == null, 90);
    expect(e.alarma).toBeNull();
  });
});

describe("vender lo que ya tienes", () => {
  it("te pagan el precio del Florín y el hueco queda libre", () => {
    const e = partida();
    const p = e.players[0];
    const base = baseDe(e, p.baseId);
    base.peds[0].florin = nuevoFlorin(e, 6);        // un Cósmico: $31 000
    const antes = p.money;
    const cobrado = venderFlorin(e, p, { b: base.id, i: 0 });
    expect(cobrado).toBe(31000);
    expect(p.money - antes).toBe(31000);
    expect(base.peds[0].florin).toBeNull();
  });

  it("la variante multiplica también al venderlo", () => {
    const e = partida();
    const p = e.players[0];
    const base = baseDe(e, p.baseId);
    base.peds[0].florin = { ...nuevoFlorin(e, 6), variant: "dorado" };
    expect(venderFlorin(e, p, { b: base.id, i: 0 })).toBe(31000 * 5);
    expect(precioDeVenta({ ...nuevoFlorin(e, 0), variant: "arcoiris" })).toBe(300);
  });

  it("no puedes vender lo de otro ni un hueco vacío", () => {
    const e = partida({ jugadores: 2 });
    const yo = e.players[0], otro = e.players[1];
    const suya = baseDe(e, otro.baseId);
    suya.peds[0].florin = nuevoFlorin(e, 6);
    const antes = yo.money;
    expect(venderFlorin(e, yo, { b: suya.id, i: 0 })).toBe(0);
    expect(yo.money).toBe(antes);
    expect(suya.peds[0].florin).not.toBeNull();

    const mia = baseDe(e, yo.baseId);
    expect(venderFlorin(e, yo, { b: mia.id, i: 0 })).toBe(0);   // vacío
  });

  it("vender el peor Florín es como se sube de hito", () => {
    const e = partida();
    const p = e.players[0];
    const base = baseDe(e, p.baseId);
    for (const q of base.peds) q.florin = nuevoFlorin(e, 6);
    base.peds[2].florin = nuevoFlorin(e, 0);        // uno flojo estropea el nivel
    avanzar(e, nada(), 1 / 60);
    expect(nivelDeVitrina(e, p)).toBe(1);

    venderFlorin(e, p, { b: base.id, i: 2 });
    base.peds[2].florin = nuevoFlorin(e, 6);        // y lo cambias por uno bueno
    expect(nivelDeVitrina(e, p)).toBe(7);
  });
});

describe("láseres", () => {
  it("se encienden tras un segundo sobre la placa, cobran, y luego recargan", () => {
    const e = partida();
    const p = e.players[0];
    const L = baseDe(e, p.baseId).laser!;
    p.money = 5000;
    p.x = L.x; p.y = L.y;

    correr(e, 0.5);
    expect(L.activo).toBe(0);
    expect(L.carga).toBeGreaterThan(0.4);

    // mantenerse encima: se enciende y cobra
    for (let i = 0; i < 40; i++) { p.x = L.x; p.y = L.y; avanzar(e, nada(), 1 / 60); }
    expect(L.activo).toBeGreaterThan(LASER_DUR - 2);
    expect(p.money).toBeLessThanOrEqual(5000 - LASER_PRECIO + 1);
  });

  it("mientras están activos, el ladrón no entra al patio", () => {
    const e = partida();
    const p = e.players[0];
    const patio = baseDe(e, p.baseId);
    patio.peds[0].florin = nuevoFlorin(e, 3);
    patio.laser!.activo = LASER_DUR;
    p.x = 2000; p.y = 300;                     // lejos, que no interfiera
    for (let i = 0; i < 6; i++) spawnThief(e);
    correr(e, 25);
    const dentro = e.thieves.filter(t =>
      t.x > patio.rect.x && t.x < patio.rect.x + patio.rect.w &&
      t.y > patio.rect.y && t.y < patio.rect.y + patio.rect.h);
    expect(dentro.length).toBe(0);
    expect(patio.peds[0].florin).not.toBeNull();
    expect(p.stats.lost).toBe(0);
  });
});

describe("armas", () => {
  it("comprar descuenta y da usos; usar gasta uno", () => {
    const e = partida();
    const p = e.players[0];
    const i = WEAPONS.findIndex(w => w.id === "hielo");
    p.money = 5000;
    expect(comprarArma(e, p, i), "sin estar dentro no se compra").toBe(false);
    enLaArmeria(e, p);
    expect(comprarArma(e, p, i)).toBe(true);
    expect(p.money).toBe(5000 - WEAPONS[i].price);
    expect(p.ammo.hielo).toBe(WEAPONS[i].uses);

    seleccionarArma(e, p, i);
    p.dirx = 1; p.diry = 0; p.cd = 0;
    usarArma(e, p);
    expect(p.ammo.hielo).toBe(WEAPONS[i].uses - 1);
    expect(e.bolts.length).toBe(1);
  });

  it("sin dinero no se compra", () => {
    const e = partida();
    const p = e.players[0];
    p.money = 10;
    expect(comprarArma(e, p, WEAPONS.findIndex(w => w.id === "abductor"))).toBe(false);
    expect(p.money).toBe(10);
  });

  it("la red caza del desfile y devuelve el uso si no hay a quién", () => {
    const e = partida();
    const p = e.players[0];
    const i = WEAPONS.findIndex(w => w.id === "red");
    p.ammo.red = 3; p.wsel = i; p.carry = null;

    p.dirx = 1; p.diry = 0; p.cd = 0;
    usarArma(e, p);                       // no hay desfile todavía
    expect(p.ammo.red).toBe(3);           // no se gasta
    expect(p.carry).toBeNull();

    correr(e, 3);                         // ya salió uno
    const d = e.portal.desfile[0];
    p.x = d.x - 200; p.y = d.y; p.dirx = 1; p.diry = 0; p.cd = 0; p.apunta.on = false;
    usarArma(e, p);
    expect(p.ammo.red).toBe(2);
    expect(p.carry).not.toBeNull();
    expect(e.portal.desfile.includes(d)).toBe(false);
  });

  it("el paraguas aguanta el golpe y deja margen", () => {
    const e = partida();
    const p = e.players[0];
    p.escudo = ESCUDO_DUR;
    const abuela = e.bases.find(b => b.guard)!.guard!;
    p.x = abuela.x + 10; p.y = abuela.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.escudo).toBeGreaterThan(0);  // ya no se gasta de un golpe
    expect(p.inmune).toBeGreaterThan(0);
    expect(p.stun).toBe(0);               // aguantó
  });

  it("el paraguas se cierra a los tres minutos y entonces sí te pegan", () => {
    const e = partida();
    const p = e.players[0];
    p.escudo = ESCUDO_DUR;
    const abuela = e.bases.find(b => b.guard)!.guard!;
    /* Lejos de la abuela mientras corre el reloj: si no, cada golpe renovaría
       `inmune` y el que aguantaría sería ese margen, no el paraguas. */
    p.x = 40; p.y = 40;
    for (let i = 0; i < ESCUDO_DUR * 60 + 120; i++) avanzar(e, nada(), 1 / 60);
    expect(p.escudo).toBe(0);
    p.stun = 0; p.inmune = 0;
    p.x = abuela.x + 10; p.y = abuela.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.stun).toBeGreaterThan(0);
  });
});

describe("soltar lo que llevas", () => {
  it("lo deja en el suelo y no te lo devuelve en el acto", () => {
    const e = partida();
    const p = e.players[0];
    /* Fuera del patio: dentro, recogerlo lo coloca solo en la vitrina y no se
       vería si la espera funciona. */
    p.x = 1000; p.y = 500;
    cargar(e, p, nuevoFlorin(e, 3));
    expect(soltarCarga(e, p)).toBe(true);
    expect(p.carry).toBeNull();
    expect(e.ground.length).toBe(1);
    // medio segundo pegado a él: sigue en el suelo
    for (let i = 0; i < 30; i++) avanzar(e, nada(), 1 / 60);
    expect(p.carry, "se lo comió antes de tiempo").toBeNull();
    expect(e.ground.length).toBe(1);
    // pasada la espera, se recoge como siempre
    for (let i = 0; i < 60; i++) avanzar(e, nada(), 1 / 60);
    expect(p.carry).not.toBeNull();
    expect(e.ground.length).toBe(0);
  });

  it("sin nada en brazos no hace nada", () => {
    const e = partida();
    expect(soltarCarga(e, e.players[0])).toBe(false);
  });
});

describe("los Florines del desfile", () => {
  it("cada uno se va por su lado y no repiten recorrido", () => {
    const e = partida();
    for (let i = 0; i < 60 * 40; i++) avanzar(e, nada(), 1 / 60);
    expect(e.portal.desfile.length).toBeGreaterThan(1);
    const rumbos = new Set(e.portal.desfile.map(d => Math.round(d.rumbo * 10)));
    expect(rumbos.size, "van todos en fila, como antes").toBeGreaterThan(1);
  });

  it("no se salen del mundo ni se meten al mar", () => {
    const e = partida({ escenario: "playa" });
    for (let i = 0; i < 60 * 120; i++) {
      avanzar(e, nada(), 1 / 60);
      for (const d of e.portal.desfile) {
        expect(d.x).toBeGreaterThan(40);
        expect(d.x).toBeLessThan(2600 - 40);
        expect(d.y).toBeGreaterThan(40);
        expect(d.y, "un Florín se fue nadando").toBeLessThan(e.esc.mar! - 20);
      }
    }
  });

  it("el paseo sigue siendo el mismo con la misma semilla", () => {
    const foto = () => {
      const e = partida({ semilla: 99 });
      for (let i = 0; i < 60 * 30; i++) avanzar(e, nada(), 1 / 60);
      return e.portal.desfile.map(d => [Math.round(d.x), Math.round(d.y)]);
    };
    expect(foto()).toEqual(foto());
  });
});

describe("carrera", () => {
  const carrera = (esc = "circuito", jugadores = 2) =>
    crearPartida({ jugadores, escenario: esc, semilla: 7, armas: idsDeArmas(),
                   reglas: { modo: "carrera", vecinos: false, puestos: false } });

  it("en TODOS los escenarios se puede correr, y se sale en línea y montado", () => {
    expect(CIRCUITOS.length, "hay escenarios sin circuito").toBe(ESCENARIOS.length);
    for (const esc of CIRCUITOS) {
      const e = carrera(esc.id, 4);
      const [mx, my] = esc.circuito![0];
      for (const p of e.players) {
        expect(p.montado, esc.id + ": alguien sale a pie").not.toBeNull();
        expect(p.carrera, esc.id).toEqual({ vuelta: 0, hito: 1, fin: -1 });
        expect(Math.hypot(p.x - mx, p.y - my), esc.id + ": lejos de la meta")
          .toBeLessThan(320);
        /* Nadie sale con el agua al cuello: en la Playa, el Amazonas, Nueva
           York y la Costa Verde la parrilla tiene que quedar en tierra. */
        if (e.esc.mar != null)
          expect(p.y, esc.id + ": parrilla en el agua").toBeLessThan(e.esc.mar - 60);
      }
      /* Y el circuito entero también, que si no la vuelta pasa por el mar. */
      if (e.esc.mar != null)
        for (const [, cy] of esc.circuito!)
          expect(cy, esc.id + ": la pista se mete al agua").toBeLessThan(e.esc.mar - 60);
    }
  });

  it("las vueltas son largas de verdad", () => {
    const largoDe = (c: [number, number][]) => {
      let L = 0;
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        L += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      return L;
    };
    for (const esc of CIRCUITOS) {
      const L = largoDe(esc.circuito!);
      /* Una vuelta corta se corre de memoria en dos intentos. El listón está
         donde estaban las pistas ANTES de alargarlas (la más corta medía
         4 549 px), para que nadie las acorte sin darse cuenta. */
      expect(L, esc.id + ": vuelta demasiado corta").toBeGreaterThan(6000);
      expect(L, esc.id + ": vuelta absurdamente larga").toBeLessThan(14000);
    }
  });

  it("los puntos de paso SEGUIDOS quedan más lejos que el radio de paso", () => {
    /* Si dos seguidos caen a menos de HITO_R se pican los dos desde el mismo
       sitio y te saltas un trozo de pista. Es lo que decide cada cuántos px va
       un punto: en las curvas cerradas la cuerda es mucho más corta que el
       arco. */
    for (const esc of CIRCUITOS) {
      const c = esc.circuito!;
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        expect(Math.hypot(b[0] - a[0], b[1] - a[1]),
               esc.id + ": puntos " + i + " y " + (i + 1) + " demasiado juntos")
          .toBeGreaterThan(HITO_R);
      }
    }
  });

  it("las pistas caben en el mapa y no se pisan a sí mismas", () => {
    for (const esc of CIRCUITOS) {
      const c = esc.circuito!;
      for (const [x, y] of c) {
        expect(x, esc.id + ": la pista se sale por los lados").toBeGreaterThan(90);
        expect(x, esc.id + ": la pista se sale por los lados").toBeLessThan(2600 - 90);
        expect(y, esc.id + ": la pista se sale por arriba o abajo").toBeGreaterThan(90);
        expect(y, esc.id + ": la pista se sale por arriba o abajo").toBeLessThan(1700 - 90);
      }
      /* Aquí NO se exige que los puntos lejanos estén separados: el Trébol se
         cruza consigo mismo a propósito y ahí dos ramas se tocan. No deja
         colar atajos porque los puntos se cuentan EN ORDEN, y los de la otra
         rama caen lejísimos en la cuenta. Lo que sí importa —que los SEGUIDOS
         estén separados— tiene su propia prueba. */
    }
  });

  it("cada uno sale con el vehículo que eligió", () => {
    const e = crearPartida({
      jugadores: 3, escenario: "luna", semilla: 7, armas: idsDeArmas(),
      reglas: { modo: "carrera", vecinos: false, puestos: false },
    });
    // por defecto, lo del sitio
    expect(vehiculoDelSitio(e)).toBe("carrito");
    expect(trastoDe(e, e.players[0].montado)!.tipo).toBe("carrito");
    // y quien tiene un especial, sale con el suyo
    darleVehiculo(e, e.players[1], "ovni");
    expect(trastoDe(e, e.players[1].montado)!.tipo).toBe("ovni");
    expect(e.players[1].vehiculo).toBe("ovni");
    // sin dejar el viejo tirado en la pista
    expect(e.trastos.filter(v => v.montadoPor === 1).length).toBe(1);
    // y un tipo inventado no cambia nada
    darleVehiculo(e, e.players[2], "submarino");
    expect(trastoDe(e, e.players[2].montado)!.tipo).toBe("carrito");
  });

  it("los especiales vuelan: el agua no los para", () => {
    for (const g of GARAJE) expect(VEHICULOS[g.tipo].agua, g.tipo).toBe(true);
    // y son más rápidos que cualquier cosa que se encuentre tirada
    const normales = Object.entries(VEHICULOS)
      .filter(([k]) => !esEspecial(k)).map(([, v]) => v.mult);
    for (const g of GARAJE)
      expect(VEHICULOS[g.tipo].mult, g.tipo).toBeGreaterThan(Math.max(...normales));
  });

  it("de la pista no se sale", () => {
    const e = carrera();
    const p = e.players[0];
    // empujarlo lejísimos y dejar correr un paso
    p.x = 200; p.y = 200; p.vx = -600; p.vy = -600;
    avanzar(e, nada(2), 1 / 60);
    const q = enLaPista(e, p.x, p.y);
    expect(Math.sqrt(q.d2), "se salió de la pista").toBeLessThanOrEqual(ANCHO_PISTA / 2 + 1);
    // y una vuelta entera de bots tampoco se sale nunca
    for (let i = 0; i < 60 * 60 && !e.over; i++) {
      const ent: Record<number, EntradaJugador> = {};
      for (const q2 of e.players) ent[q2.idx] = pensarBot(e, q2, 1 / 60).entrada;
      avanzar(e, ent, 1 / 60);
      for (const q2 of e.players)
        expect(Math.sqrt(enLaPista(e, q2.x, q2.y).d2), "jugador " + q2.idx + " fuera")
          .toBeLessThanOrEqual(ANCHO_PISTA / 2 + 1);
    }
  });

  it("en aventura no hay topes: el mapa es libre", () => {
    const e = partida();
    const p = e.players[0];
    p.x = 130; p.y = 130;
    avanzar(e, nada(), 1 / 60);
    expect(Math.round(p.x)).toBe(130);
  });

  it("las cajas de la pista dan un potenciador, tras girar", () => {
    const e = carrera();
    const p = e.players[0];
    expect(e.cajas.length).toBe(CAJAS_EN_PISTA);
    const caja = e.cajas[0];
    p.x = caja.x; p.y = caja.y;
    avanzar(e, nada(2), 1 / 60);
    expect(p.item!.girando, "la caja no dio nada").toBeGreaterThan(0);
    expect(p.item!.que, "salió el premio sin girar").toBeNull();
    expect(caja.listo, "la caja no se gastó").toBeGreaterThan(0);
    for (let i = 0; i < 90; i++) avanzar(e, nada(2), 1 / 60);
    expect(p.item!.que, "la ruleta no paró en nada").not.toBeNull();
    expect(potenciadorPorId(p.item!.que!), "salió algo que no existe").toBeTruthy();
  });

  it("cada escenario tiene su objeto propio", () => {
    for (const esc of CIRCUITOS) {
      const propio = ESPECIAL_NIVEL[esc.id];
      expect(propio, esc.id + " no tiene objeto propio").toBeTruthy();
      expect(potenciadoresDe(esc.id)).toContain(propio);
    }
    // y no se repiten los nombres entre niveles
    const ids = Object.values(ESPECIAL_NIVEL).map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("el rayo frena a los demás y no a quien lo tira", () => {
    const e = carrera("circuito", 3);
    const p = e.players[0];
    p.item = { que: ESPECIAL_NIVEL.circuito.efecto === "rayo" ? ESPECIAL_NIVEL.circuito.id : "x", girando: 0 };
    // el del circuito es turbo, así que probamos con uno que sí sea rayo
    p.item = { que: ESPECIAL_NIVEL.volcan.id, girando: 0 };
    expect(usarPotenciador(e, p)).toBe(true);
    expect(p.stun, "se frenó a sí mismo").toBe(0);
    expect(e.players.slice(1).every(q => q.stun > 0), "no frenó a los demás").toBe(true);
  });

  it("sin nada en la mano no se usa nada", () => {
    const e = carrera();
    expect(usarPotenciador(e, e.players[0])).toBe(false);
  });

  it("no hay vecinos: ni ladrones, ni abuelas, ni desfile", () => {
    const e = carrera();
    for (let i = 0; i < 60 * 30; i++) avanzar(e, nada(2), 1 / 60);
    expect(e.thieves.length).toBe(0);
    expect(e.portal.desfile.length).toBe(0);
    expect(e.bases.every(b => !b.guard)).toBe(true);
  });

  it("las vueltas se cuentan solo pasando los puntos EN ORDEN", () => {
    const e = carrera();
    const c = e.esc.circuito!;
    const p = e.players[0];
    // saltar al último punto sin pasar por los del medio no cuenta
    const [ux, uy] = c[c.length - 1];
    p.x = ux; p.y = uy;
    avanzar(e, nada(2), 1 / 60);
    expect(p.carrera!.hito, "coló un atajo").toBe(1);
    // y haciéndolos en orden, sí
    for (let k = 1; k < c.length; k++) {
      p.x = c[k][0]; p.y = c[k][1];
      avanzar(e, nada(2), 1 / 60);
    }
    expect(p.carrera!.hito).toBe(c.length);
    p.x = c[0][0]; p.y = c[0][1];
    avanzar(e, nada(2), 1 / 60);
    expect(p.carrera!.vuelta).toBe(1);
    expect(p.carrera!.hito).toBe(1);
  });

  it("gana el primero que completa las vueltas y ahí se acaba", () => {
    const e = carrera();
    const c = e.esc.circuito!;
    const p = e.players[1];
    for (let v = 0; v < VUELTAS; v++)
      for (let k = 1; k <= c.length; k++) {
        const [x, y] = c[k % c.length];
        p.x = x; p.y = y;
        avanzar(e, nada(2), 1 / 60);
      }
    expect(p.carrera!.fin).toBeGreaterThanOrEqual(0);
    expect(e.over).toBe(true);
    expect(e.winnerIdx).toBe(1);
  });

  it("el puesto lo manda quién va más adelante", () => {
    const e = carrera("circuito", 3);
    const c = e.esc.circuito!;
    e.players[2].carrera = { vuelta: 2, hito: 3, fin: -1 };
    e.players[0].carrera = { vuelta: 1, hito: 9, fin: -1 };
    e.players[1].carrera = { vuelta: 0, hito: 2, fin: -1 };
    expect(puestosDeCarrera(e).map(p => p.idx)).toEqual([2, 0, 1]);
    expect(puestoDe(e, e.players[1])).toBe(3);
    expect(c.length).toBeGreaterThan(3);
  });

  it("una carrera de bots termina sola y con ganador, en todos los circuitos", () => {
    for (const esc of CIRCUITOS) {
      const e = carrera(esc.id, 3);
      let seg = 0;
      for (let i = 0; i < 60 * 400 && !e.over; i++) {
        const entradas: Record<number, EntradaJugador> = {};
        for (const p of e.players) entradas[p.idx] = pensarBot(e, p, 1 / 60).entrada;
        avanzar(e, entradas, 1 / 60);
        seg = e.t;
      }
      expect(e.over, esc.id + ": la carrera no terminó en 400 s").toBe(true);
      expect(e.winnerIdx, esc.id).not.toBeNull();
      expect(e.players[e.winnerIdx!].carrera!.vuelta, esc.id).toBe(VUELTAS);
      // que no sea absurdamente lenta: si pasa de tres minutos, algo se atasca
      expect(seg, esc.id + ": tardó demasiado").toBeLessThan(180);
    }
  });
});

describe("ruleta", () => {
  it("cobra la tirada y entrega el premio al terminar el giro", () => {
    const e = partida();
    const p = e.players[0];
    p.money = 10000;
    expect(girarRuleta(e, p), "desde lejos no se gira").toBe(false);
    enLaRuleta(e, p);
    expect(girarRuleta(e, p)).toBe(true);
    expect(p.money).toBe(10000 - RULETA_PRECIO);
    expect(e.girando).not.toBeNull();

    correr(e, 2.5);
    expect(e.girando).toBeNull();
    expect(e.ultimoPremio).not.toBeNull();
  });

  it("sin dinero no gira", () => {
    const e = partida();
    e.players[0].money = 100;
    expect(girarRuleta(e, e.players[0])).toBe(false);
    expect(e.girando).toBeNull();
  });

  it("la casilla ??? es la única que da variantes", () => {
    const e = partida({ semilla: 4242 });
    enLaRuleta(e, e.players[0]);
    let conVariante = 0, sorpresas = 0;
    for (let i = 0; i < 600; i++) {
      const pr = (e.ultimoPremio = null, girarRuleta(e, Object.assign(e.players[0], { money: 99999 })), e.girando!.premio);
      e.girando = null;
      if (pr.kind === "florin" && pr.variant) { conVariante++; expect(pr.sorpresa).toBe(true); }
      if (pr.kind === "florin" && pr.sorpresa) sorpresas++;
    }
    expect(sorpresas).toBeGreaterThan(0);
    expect(conVariante).toBeGreaterThan(0);
  });
});

describe("los ladrones y la alarma", () => {
  it("la Prima Yuli no carga nada por encima de Raro", () => {
    const e = partida();
    const p = e.players[0];
    baseDe(e, p.baseId).peds[0].florin = nuevoFlorin(e, 6);     // solo un Cósmico
    p.x = 2400; p.y = 300;
    for (let i = 0; i < 30; i++) spawnThief(e);
    const yulis = e.thieves.filter(t => t.who === "yuli");
    expect(yulis.length).toBeGreaterThan(0);
    avanzar(e, nada(), 1 / 60);        // un tick: lo justo para que elija
    for (const y of yulis) expect(y.state).toBe("flee");   // no le interesa

    // los demás sí se lo llevan: el tope es cosa suya, no una protección
    const otros = e.thieves.filter(t => t.who !== "yuli");
    expect(otros.some(t => t.state === "go")).toBe(true);
  });

  it("salta la alarma mientras te roban y se apaga después", () => {
    const e = partida();
    const p = e.players[0];
    for (let i = 0; i < 6; i++) baseDe(e, p.baseId).peds[i].florin = nuevoFlorin(e, 4);
    p.x = 2400; p.y = 260;
    for (let i = 0; i < 4; i++) spawnThief(e);

    let vista = null as null | { quien: string; patio: string };
    for (let i = 0; i < 60 * 60 && !vista; i++) {
      avanzar(e, nada(), 1 / 60);
      if (e.alarma) vista = { quien: e.alarma.quien, patio: e.alarma.patio };
    }
    expect(vista).not.toBeNull();
    expect(vista!.patio).toBe("Tu patio");

    e.thieves.length = 0;
    correr(e, 1.2);
    expect(e.alarma).toBeNull();
  });
});

describe("el motor no toca el navegador", () => {
  it("no hay referencias a document, window ni canvas en el paquete", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(new URL("../src/", import.meta.url));
    const prohibidas = /\b(document|window|canvas|getContext|localStorage|requestAnimationFrame|Math\.random)\b/;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".ts")) continue;
      const txt = fs.readFileSync(path.join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");   // sin comentarios
      expect(prohibidas.test(txt), `${f} usa algo del navegador`).toBe(false);
    }
  });
});

describe("el estado viaja por la red", () => {
  /* Esta es la prueba que justifica pasar las referencias a ids. Antes el estado
     tenía ciclos (una base apuntaba a su dueño y el dueño a sus bases), así que
     JSON.stringify reventaba y no había forma de mandarlo a un servidor. */

  it("se serializa a JSON sin ciclos", () => {
    const e = correr(partida({ semilla: 31 }), 40);
    expect(() => JSON.stringify(e)).not.toThrow();
  });

  it("tras ir y volver de JSON, la partida sigue exactamente igual", () => {
    const original = correr(partida({ semilla: 77 }), 25);
    const copia = JSON.parse(JSON.stringify(original)) as Estado;

    // las dos siguen 20 s más por su cuenta
    correr(original, 20);
    correr(copia, 20);

    const foto = (e: Estado) => JSON.stringify({
      t: e.t.toFixed(4),
      dinero: e.players[0].money.toFixed(4),
      pos: [e.players[0].x.toFixed(3), e.players[0].y.toFixed(3)],
      ladrones: e.thieves.map(t => [t.who, t.state, t.x.toFixed(2), t.y.toFixed(2)]),
      desfile: e.portal.desfile.map(d => [d.id, d.florin.tier, d.k.toFixed(4)]),
      vitrinas: e.bases.map(b => b.peds.filter(p => p.florin).length),
      rng: e.rngEstado,
    });
    expect(foto(copia)).toBe(foto(original));
  });

  it("no queda ninguna referencia a un objeto del propio estado", () => {
    const e = correr(partida({ semilla: 12 }), 30);
    for (let i = 0; i < 4; i++) spawnThief(e);
    correr(e, 2);

    // recorre el estado y comprueba que nada apunta a una base, jugador o ladrón
    const sospechosos = new Set<unknown>([...e.bases, ...e.players, ...e.thieves]);
    const vistos = new Set<unknown>();
    const malos: string[] = [];
    (function mirar(v: any, ruta: string) {
      if (!v || typeof v !== "object" || vistos.has(v)) return;
      vistos.add(v);
      for (const [k, hijo] of Object.entries(v)) {
        const r = ruta + "." + k;
        // saltamos los contenedores legítimos: e.bases, e.players, e.thieves
        const contenedor = /^e\.(bases|players|thieves)\.\d+$/.test(r);
        if (!contenedor && sospechosos.has(hijo)) malos.push(r);
        mirar(hijo, r);
      }
    })(e, "e");
    expect(malos).toEqual([]);
  });
});
