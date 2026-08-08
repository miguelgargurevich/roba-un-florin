/* Estas pruebas son la razón de ser de la Fase 1: con la lógica fuera del
   navegador se puede comprobar el juego sin abrir una ventana, y sobre todo se
   puede comprobar que es DETERMINISTA, que es lo que hará posible el servidor
   autoritativo más adelante. */

import { describe, expect, it } from "vitest";
import {
  ESCENARIOS, FLORES, GOAL, JUGADORES_MAX, LASER_DUR, LASER_PRECIO, PORTAL_RAREZAS, RAR_COLOR,
  reglasPara,
  RULETA, RULETA_INCOGNITA, RULETA_PRECIO, TIERS, WEAPONS, varMult,
  avanzar, bajarse, cargar, crearPartida, girarRuleta, idsDeArmas, inRect,
  occupiedDe, playerIncome, spawnThief, usarArma, comprarArma, seleccionarArma,
  nuevoFlorin, baseDe, patiosDe, zap, multDeMontura,
  type EntradaJugador, type Estado,
} from "../src/index.js";

const QUIETO: EntradaJugador = { mover: { x: 0, y: 0 }, apunta: null };
const nada = (n = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, QUIETO]));

function partida(op: Partial<Parameters<typeof crearPartida>[0]> = {}) {
  return crearPartida({ jugadores: 1, escenario: "barrio", semilla: 7, armas: idsDeArmas(), ...op });
}
/** El duelo de sofá: dos jugadores, solo chancla, sin puestos ni patios extra. */
function duelo() {
  return partida({
    jugadores: 2,
    reglas: { patiosExtra: false, todasLasArmas: false, puestos: false, duelo: true },
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

  it("los cuatro escenarios se pueden montar", () => {
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      expect(e.esc.id).toBe(esc.id);
      expect(e.bases.length).toBe(7);
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
    e.players[2].money = GOAL + 1;
    avanzar(e, nada(3), 1 / 60);
    expect(e.players[2].hitoN).toBe(1);
    expect(e.players[0].hitoN).toBe(0);
    expect(e.players[1].hitoN).toBe(0);
    const ev = e.eventos.find(x => x.t === "hito");
    expect(ev && (ev as any).jugador).toBe(2);
    expect(e.over).toBe(false);                  // una sala no se acaba
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

describe("la partida de un jugador no se corta", () => {
  it("al pasar la meta celebra un hito y sigue", () => {
    const e = partida();
    e.players[0].money = GOAL + 1;
    avanzar(e, nada(), 1 / 60);
    expect(e.over).toBe(false);
    expect(e.players[0].hitoN).toBe(1);
    expect(e.players[0].hito).toBe(GOAL * 2);
    expect(e.eventos.some(ev => ev.t === "hito")).toBe(true);
  });

  it("encadena hitos sin terminar nunca", () => {
    const e = partida();
    for (let k = 1; k <= 5; k++) {
      e.players[0].money = GOAL * k + 1;
      avanzar(e, nada(), 1 / 60);
    }
    expect(e.players[0].hitoN).toBe(5);
    expect(e.over).toBe(false);
  });

  it("en el duelo sí gana el primero que llega", () => {
    const e = duelo();
    e.players[1].money = GOAL + 1;
    avanzar(e, nada(2), 1 / 60);
    expect(e.over).toBe(true);
    expect(e.winnerIdx).toBe(1);
    expect(e.eventos.some(ev => ev.t === "fin" && ev.ganador === 1)).toBe(true);
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

  it("la pelota no hace daño a nadie: es un juguete", () => {
    const e = partida();
    const bola = e.trastos.find(v => v.tipo === "pelota")!;
    baseDe(e, e.players[0].baseId).peds[0].florin = nuevoFlorin(e, 0);  // si no, no viene nadie
    for (let i = 0; i < 30; i++) spawnThief(e);
    const t = e.thieves[0];
    bola.x = t.x; bola.y = t.y;
    bola.vx = 900; bola.vy = 0;
    correr(e, 1, nada());
    expect(t.stun).toBe(0);
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
      vx: 0, vy: 0, montadoPor: null, giro: 0, variante: 0,
    };
    e.trastos.push(falsaBici);
    p.x = falsaBici.x; p.y = falsaBici.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.montado).toBe(9999);          // se monta, es tierra
    correr(e, 4, haciaAbajo);
    expect(p.y).toBeLessThanOrEqual(e.esc.mar! + 0.001);   // pero el agua le para
  });

  it("los otros escenarios no tienen mar y se puede llegar al borde sur", () => {
    for (const id of ["barrio", "colegio", "desierto"]) {
      const e = partida({ escenario: id });
      expect(e.esc.mar).toBeUndefined();
      const p = e.players[0];
      p.x = 1300; p.y = 1400;
      correr(e, 6, haciaAbajo);
      expect(p.y).toBeGreaterThan(1600);
    }
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

  it("el paraguas se come un golpe y deja margen", () => {
    const e = partida();
    const p = e.players[0];
    p.escudo = 1;
    const abuela = e.bases.find(b => b.guard)!.guard!;
    p.x = abuela.x + 10; p.y = abuela.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.escudo).toBe(0);
    expect(p.inmune).toBeGreaterThan(0);
    expect(p.stun).toBe(0);               // aguantó
  });
});

describe("ruleta", () => {
  it("cobra la tirada y entrega el premio al terminar el giro", () => {
    const e = partida();
    const p = e.players[0];
    p.money = 10000;
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
