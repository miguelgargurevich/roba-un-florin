/* Estas pruebas son la razón de ser de la Fase 1: con la lógica fuera del
   navegador se puede comprobar el juego sin abrir una ventana, y sobre todo se
   puede comprobar que es DETERMINISTA, que es lo que hará posible el servidor
   autoritativo más adelante. */

import { describe, expect, it } from "vitest";
import {
  ESCENARIOS, GOAL, LASER_DUR, LASER_PRECIO, RULETA_PRECIO, TIERS, WEAPONS,
  avanzar, crearPartida, girarRuleta, idsDeArmas, occupiedDe, playerIncome,
  spawnThief, usarArma, comprarArma, seleccionarArma, nuevoFlorin, baseDe, patiosDe,
  type EntradaJugador, type Estado,
} from "../src/index.js";

const QUIETO: EntradaJugador = { mover: { x: 0, y: 0 }, apunta: null };
const nada = (n = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, QUIETO]));

function partida(op: Partial<Parameters<typeof crearPartida>[0]> = {}) {
  return crearPartida({ modo: 1, escenario: "barrio", semilla: 7, armas: idsDeArmas(), ...op });
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
    const e = partida({ modo: 2 });
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
    expect(e.hitoN).toBe(1);
    expect(e.hito).toBe(GOAL * 2);
    expect(e.eventos.some(ev => ev.t === "hito")).toBe(true);
  });

  it("encadena hitos sin terminar nunca", () => {
    const e = partida();
    for (let k = 1; k <= 5; k++) {
      e.players[0].money = GOAL * k + 1;
      avanzar(e, nada(), 1 / 60);
    }
    expect(e.hitoN).toBe(5);
    expect(e.over).toBe(false);
  });

  it("en dos jugadores sí gana el primero que llega", () => {
    const e = partida({ modo: 2 });
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
