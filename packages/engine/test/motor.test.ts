/* Estas pruebas son la razón de ser de la Fase 1: con la lógica fuera del
   navegador se puede comprobar el juego sin abrir una ventana, y sobre todo se
   puede comprobar que es DETERMINISTA, que es lo que hará posible el servidor
   autoritativo más adelante. */

import { describe, expect, it } from "vitest";
import {
  CIRCUITOS, ESCENARIOS, ESCUDO_DUR, FLORES, GARAJE, GOAL, HITO_R, JUGADORES_MAX,
  VEHICULOS, VUELTAS, ANCHO_PISTA, CASAS_POR_MAPA, PATIOS_PRECIO, TIERRA_DEL_ESPECIAL,
  montarEscenario, esDeSuTierra, VARIANTES, fundir, queSaleDeFundir, TIER_SUPREMO,
  PORTAL_CADA, PORTAL_MAX, PORTAL_VUELTA, TRASTOS_ESCENARIO, CAJAS_EN_PISTA, ESPECIAL_NIVEL, darleVehiculo,
  enLaPista, esEspecial, potenciadorPorId, potenciadoresDe, trastoDe, usarPotenciador,
  vehiculoDelSitio,
  puestosDeCarrera, puestoDe, pensarBot, LASER_DUR, LASER_PRECIO, PORTAL_RAREZAS, RAR_COLOR, SALA_MAX,
  reglasPara,
  RULETA, RULETA_INCOGNITA, RULETA_PRECIO, TIERS, WEAPONS, varMult,
  avanzar, bajarse, cargar, crearPartida, girarRuleta, idsDeArmas, inRect,
  occupiedDe, playerIncome, spawnThief, usarArma, comprarArma, seleccionarArma,
  nuevoFlorin, baseDe, patiosDe, zap, multDeMontura, puntoDelDesfile, puntoDelOcho,
  centroDelMapa, WORLD_W, WORLD_H, OCHO_A, colocarPuestos, ponerFiesta, enFiesta, enElMar,
  nivelDeVitrina, nombreDeHito, HITOS_MAX, vitrinaDe, venderFlorin, precioDeVenta, soltarCarga,
  type EntradaJugador, type Estado,
} from "../src/index.js";

const QUIETO: EntradaJugador = { mover: { x: 0, y: 0 }, apunta: null };

/* La Ruleta y la Armería solo atienden a quien está dentro, y quien lo marca
   es el paso de simulación. Estos dos plantan al jugador y dejan correr un
   frame para que las banderas se pongan. */
function enLaRuleta(e: Estado, p: any) {
  p.x = e.ruletas[0].x; p.y = e.ruletas[0].y;
  avanzar(e, nada(e.players.length), 1 / 60);
}
function enLaArmeria(e: Estado, p: any) {
  p.x = e.armerias[0].x + e.armerias[0].w / 2;
  p.y = e.armerias[0].y + e.armerias[0].h / 2;
  avanzar(e, nada(e.players.length), 1 / 60);
}
const nada = (n = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, QUIETO]));

function partida(op: Partial<Parameters<typeof crearPartida>[0]> = {}) {
  return crearPartida({ jugadores: 1, escenario: "catarata", semilla: 7, armas: idsDeArmas(), ...op });
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
  it("un jugador: su patio, los vecinos y los patios comprables", () => {
    const e = partida();
    expect(e.bases.length).toBe(1 + CASAS_POR_MAPA + PATIOS_PRECIO.length);
    expect(e.bases.filter(b => b.locked).length).toBe(PATIOS_PRECIO.length);
    expect(e.players.length).toBe(1);
    expect(e.players[0].patios.length).toBe(1);
  });

  it("dos jugadores: sin patios comprables y con patio para el J2", () => {
    const e = duelo();
    expect(e.bases.filter(b => b.locked).length).toBe(0);
    expect(e.players.length).toBe(2);
    expect(baseDe(e, e.players[1].baseId).name).toBe("Patio del J2");
  });

  it("todos los escenarios se pueden montar, y son veinticinco", () => {
    expect(ESCENARIOS.length).toBe(25);
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      expect(e.esc.id, esc.id).toBe(esc.id);
      /* Las ocho casas caben en tierra firme; donde hay mar, alguna se queda
         fuera antes que nacer con los pies en el agua. Los patios comprables no
         se negocian: se reparten primero. */
      const casas = e.bases.filter(b => b.who != null).length;
      expect(casas, esc.id + ": pocas casas").toBeGreaterThanOrEqual(6);
      /* El Multiverso trae una casa por zona (veinticuatro): sin eso, ocho casas
         repartidas en 86 400 px dejarían el mundo vacío. */
      const tope = esc.zonas?.length ? esc.zonas.length : CASAS_POR_MAPA;
      expect(casas, esc.id + ": demasiadas casas").toBeLessThanOrEqual(tope);
      expect(e.bases.length, esc.id).toBe(1 + casas + PATIOS_PRECIO.length);
      // y ninguna con los pies en el mar
      if (e.esc.mar != null)
        for (const b of e.bases)
          expect(b.rect.y + b.rect.h, esc.id + " " + b.name + " en el agua")
            .toBeLessThanOrEqual(e.esc.mar);
      // las bases tienen que caber en el mundo, no salirse por un borde
      for (const b of e.bases) {
        expect(b.rect.x, esc.id + " " + b.name).toBeGreaterThanOrEqual(0);
        expect(b.rect.y, esc.id + " " + b.name).toBeGreaterThanOrEqual(0);
        expect(b.rect.x + b.rect.w, esc.id + " " + b.name).toBeLessThanOrEqual(WORLD_W);
        expect(b.rect.y + b.rect.h, esc.id + " " + b.name).toBeLessThanOrEqual(WORLD_H);
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

  it("cada jugador de más se queda una casa, y siempre queda a quién robar", () => {
    for (let n = 1; n <= JUGADORES_MAX; n++) {
      const e = partida({ jugadores: n });
      expect(e.players.length, `${n} jugadores`).toBe(n);
      expect(botsDe(e), `${n} jugadores`).toBe(CASAS_POR_MAPA - (n - 1));
      expect(patiosDe_(e)).toBe(n);
    }
  });

  it("con los cinco vecinos que deja elegir el menú, siempre queda a quién robar", () => {
    /* El motor admite llenar el mapa entero —nueve, sin nadie a quien robar—
       porque es una partida legítima entre personas. Lo que no puede pasar es
       que la aventura de un jugador se quede sin barrio, y eso lo garantiza el
       tope de la fila de "vecinos que juegan": cinco. */
    for (const esc of ESCENARIOS){
      const e = partida({ escenario: esc.id, jugadores: 6, bots: 5 });
      expect(botsDe(e), esc.id + ": sin vecinos a los que robar").toBeGreaterThan(0);
    }
  });

  it("el mapa da para nueve y una sala para cinco", () => {
    expect(JUGADORES_MAX).toBe(9);
    expect(SALA_MAX, "una sala no puede crecer sin querer").toBe(5);
    expect(partida({ jugadores: 99 }).players.length).toBe(JUGADORES_MAX);
    expect(partida({ jugadores: 0 }).players.length).toBe(1);
  });

  it("donde no caben las ocho casas, tampoco caben tantos jugadores", () => {
    /* La Playa pierde casas por el mar. Sin este tope, un jugador de más
       apuntaba a una casa que no existe. */
    const e = partida({ escenario: "playa", jugadores: JUGADORES_MAX });
    const casas = montarEscenario(ESCENARIOS.find(x => x.id === "playa")!).casas.length;
    expect(casas).toBeLessThan(CASAS_POR_MAPA);
    expect(e.players.length).toBe(1 + casas);
    for (const p of e.players) expect(baseDe(e, p.baseId), "un patio inventado").toBeTruthy();
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

  it("de la casa que ocupó un jugador ya no salen ladrones", () => {
    const e = partida({ jugadores: JUGADORES_MAX });
    for (const p of e.players) baseDe(e, p.baseId).peds[0].florin = nuevoFlorin(e, 0);
    for (let i = 0; i < 60; i++) spawnThief(e);
    const deVecino = new Set(e.bases.filter(b => b.who).map(b => b.who));
    for (const t of e.thieves)
      expect(deVecino.has(t.who), "salió un ladrón de una casa de jugador").toBe(true);
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

  it("solo se juega igual que siempre: todos los vecinos y los patios en venta", () => {
    const e = partida();
    expect(botsDe(e)).toBe(CASAS_POR_MAPA);
    expect(e.bases.length).toBe(1 + CASAS_POR_MAPA + PATIOS_PRECIO.length);
    expect(e.bases.filter(b => b.locked).length).toBe(PATIOS_PRECIO.length);
    expect(baseDe(e, 0).name).toBe("Tu patio");
  });

  it("con compañía no hay patios comprables: están pegados al del J1", () => {
    for (const n of [2, 3, 4, 5]) {
      const e = partida({ jugadores: n });
      expect(e.bases.filter(b => b.locked).length, `${n} jugadores`).toBe(0);
      expect(e.bases.length).toBe(1 + CASAS_POR_MAPA);
    }
  });

  it("las reglas se pueden pedir a mano por encima de las de serie", () => {
    const e = partida({ jugadores: 3, reglas: { patiosExtra: true } });
    expect(e.bases.filter(b => b.locked).length).toBe(PATIOS_PRECIO.length);
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
      p.x = e.armerias[0].x + e.armerias[0].w / 2; p.y = e.armerias[0].y + e.armerias[0].h / 2;
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
    expect(nombreDeHito(HITOS_MAX)).toContain(TIERS[TIERS.length - 1].rar);
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
  it("suelta uno cada tanto y los recicla al terminar la vuelta", () => {
    /* El ritmo y el tope salen del tamaño del mapa: un mapa grande con el
       desfile de siempre deja la pasarela medio vacía. */
    const e = partida();
    correr(e, 3);                       // el primero sale a los 2,5 s
    expect(e.portal.desfile.length).toBe(1);
    correr(e, PORTAL_CADA);
    expect(e.portal.desfile.length).toBe(2);
    correr(e, PORTAL_VUELTA * 2);
    expect(e.portal.desfile.length).toBeGreaterThan(2);
    expect(e.portal.desfile.length,
           "el desfile se pasó del tope").toBeLessThanOrEqual(PORTAL_MAX);
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

  it("la tabla del portal cubre todas las rarezas menos el Supremo", () => {
    /* Sin esto, agregar una rareza al catálogo y olvidarla en la tabla la deja
       imposible de conseguir del desfile, y nadie se entera.

       El Supremo es la excepción a propósito: es el ÚNICO que no se encuentra
       ni sale de la Ruleta, solo de fundir dos Amaru. Si algún día apareciera
       en el desfile dejaría de ser el final del juego. */
    expect(PORTAL_RAREZAS.map(f => f.tier))
      .toEqual(TIERS.slice(0, TIER_SUPREMO).map((_, i) => i));
    expect(PORTAL_RAREZAS.some(f => f.tier === TIER_SUPREMO),
           "el Supremo se coló en el desfile").toBe(false);
    expect(RULETA_INCOGNITA.some(f => (f.tier ?? -1) >= TIER_SUPREMO ||
                                      (f.tierMax ?? -1) >= TIER_SUPREMO),
           "el Supremo se coló en la Ruleta").toBe(false);
    for (let i = 1; i < PORTAL_RAREZAS.length; i++)
      expect(PORTAL_RAREZAS[i].p).toBeLessThanOrEqual(PORTAL_RAREZAS[i - 1].p);
    const total = PORTAL_RAREZAS.reduce((s, f) => s + f.p, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("hasta lo más raro llega a salir si esperas lo suficiente", () => {
    const e = partida({ semilla: 3 });
    const vistos = new Set<number>();
    for (let i = 0; i < 20000 && vistos.size < TIER_SUPREMO; i++) {
      e.portal.desfile.length = 0;
      e.portal.timer = 0;
      avanzar(e, nada(), 1 / 60);
      const d = e.portal.desfile[0];
      if (d) vistos.add(d.florin.tier);
    }
    // todas menos el Supremo, que solo sale de la Fusionadora
    expect(vistos.size).toBe(TIER_SUPREMO);
    expect(vistos.has(TIER_SUPREMO)).toBe(false);
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

  it("la casilla ??? es la única que da variantes, y las da TODAS", () => {
    /* Escrito contra el catálogo, no contra una lista: al añadir la Cristal, la
       Lava y la Galaxia, una variante que no saliera de la Ruleta sería una
       casilla del álbum imposible de conseguir. */
    const deIncognita = new Set(RULETA_INCOGNITA.map(f => f.variant));
    for (const v of Object.keys(VARIANTES))
      expect(deIncognita.has(v as any), v + " no sale de la casilla ???").toBe(true);
  });

  it("cuanto más rinde una variante, menos sale", () => {
    /* Si la Galaxia (x12) saliera tanto como la Brillante (x2), el álbum se
       llenaría al revés y el dinero se dispararía. */
    const chance: Record<string, number> = {};
    for (const f of RULETA_INCOGNITA)
      if (f.variant) chance[f.variant] = (chance[f.variant] || 0) + f.p;
    const orden = Object.keys(VARIANTES).sort(
      (a, b) => (VARIANTES as any)[a].mult - (VARIANTES as any)[b].mult);
    for (let i = 1; i < orden.length; i++)
      expect(chance[orden[i]], orden[i] + " (x" + (VARIANTES as any)[orden[i]].mult +
             ") sale tanto o más que " + orden[i-1])
        .toBeLessThanOrEqual(chance[orden[i-1]]);
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
    expect(partida({ escenario: "catarata" }).trastos.some(v => v.tipo === "bici")).toBe(true);
    expect(partida({ escenario: "catarata" }).trastos.some(v => v.tipo === "llama")).toBe(true);
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
    aPie.players[0].x = centroDelMapa().cx; aPie.players[0].y = centroDelMapa().cy + 50;      // lejos de todo trasto
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
    // en el colegio, que es donde hay pelotas: la Catarata reparte piedras
    const e = partida({ escenario: "colegio" });
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
    const e = partida({ escenario: "colegio" });
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
    const e = partida({ escenario: "colegio" });
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
    const e = partida({ escenario: "colegio" });
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
    p.x = centroDelMapa().cx; p.y = mar - 60;
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
      id: 9999, tipo: "bici" as const, x: centroDelMapa().cx, y: e.esc.mar! - 20,
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
    p.x = centroDelMapa().cx; p.y = e.esc.mar! - 60;
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
    for (const id of ["catarata", "colegio", "desierto", "machupicchu", "egipto"]) {
      const e = partida({ escenario: id });
      expect(e.esc.mar).toBeUndefined();
      const p = e.players[0];
      p.x = centroDelMapa().cx; p.y = WORLD_H - 300;
      correr(e, 6, haciaAbajo);
      expect(p.y).toBeGreaterThan(1600);
    }
  });
});

describe("el recorrido del desfile", () => {
  const centro = () => centroDelMapa();

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
      if (q.x < cx - OCHO_A * .45) izq++;
      if (q.x > cx + OCHO_A * .45) der++;
    }
    expect(cruces).toBeGreaterThanOrEqual(2);   // el cruce del ocho
    expect(izq).toBeGreaterThan(30);            // el lóbulo de la Armería
    expect(der).toBeGreaterThan(30);            // el de la Ruleta
  });

  it("cada lóbulo rodea su puesto: la Armería a la izquierda, la Ruleta a la derecha", () => {
    const e = partida();
    const { cx } = centro();
    expect(e.armerias[0].x + e.armerias[0].w / 2).toBeLessThan(cx);
    expect(e.ruletas[0].x).toBeGreaterThan(cx);
    // los dos a media altura, no uno encima del otro
    expect(Math.abs((e.armerias[0].y + e.armerias[0].h / 2) - e.ruletas[0].y)).toBeLessThan(10);

    // el ocho pasa por fuera de los dos, no por encima
    let rodeaArmeria = false, rodeaRuleta = false;
    for (let i = 0; i <= 400; i++){
      const q = puntoDelOcho(i / 400);
      if (q.x < e.armerias[0].x - 20) rodeaArmeria = true;
      if (q.x > e.ruletas[0].x + e.ruletas[0].r + 20) rodeaRuleta = true;
    }
    expect(rodeaArmeria).toBe(true);
    expect(rodeaRuleta).toBe(true);
  });

  it("la Ruleta es un círculo, y se entra por cercanía", () => {
    const e = partida();
    expect(e.ruletas[0].r).toBeGreaterThan(0);
    expect((e.ruletas[0] as any).w).toBeUndefined();
    const p = e.players[0];
    p.x = e.ruletas[0].x; p.y = e.ruletas[0].y;
    avanzar(e, nada(), 1 / 60);
    expect(p.inRuleta).toBe(true);
    p.x = e.ruletas[0].x + e.ruletas[0].r + 200;
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
  /* 90 s y no 40: el ladrón sale de una casa de vecino y tiene que cruzar el
     mapa hasta el patio, y el mapa ahora es casi el doble de grande. */
  function hasta(e: Estado, que: string, cond: () => boolean, segs = 90) {
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
  it("en el cruce cada uno tira por donde quiere", () => {
    const e = partida();
    /* Un rato largo: los caminos se echan a suertes, y con pocos Florines a la
       vez podrían coincidir por casualidad. */
    const vistos = new Set<string>();
    for (let i = 0; i < 60 * 300; i++) {
      avanzar(e, nada(), 1 / 60);
      for (const d of e.portal.desfile) vistos.add(d.lado + "/" + d.giro);
    }
    expect(vistos.size, "van todos por el mismo sitio, en fila").toBeGreaterThan(1);
  });

  it("todos dan la vuelta entera al ∞ y salen por el otro portal", () => {
    const e = partida();
    const { cx } = centroDelMapa();
    for (const lado of [0, 1] as const) for (const giro of [1, -1] as const) {
      let izq = false, der = false;
      for (let k = 0; k <= 1; k += 0.002) {
        const q = puntoDelDesfile(e, k, lado, giro);
        if (q.x < cx - OCHO_A * .8) izq = true;
        if (q.x > cx + OCHO_A * .8) der = true;
      }
      const camino = "camino " + lado + "/" + giro;
      expect(izq, camino + ": no pisó el lóbulo izquierdo").toBe(true);
      expect(der, camino + ": no pisó el lóbulo derecho").toBe(true);
      // y acaba en el portal de abajo, no en el de arriba
      const fin = puntoDelDesfile(e, 1, lado, giro);
      expect(Math.hypot(fin.x - e.portal.salida.x, fin.y - e.portal.salida.y),
             camino + ": no salió por el portal de abajo").toBeLessThan(2);
    }
  });

  it("no se salen del mundo ni se meten al mar", () => {
    const e = partida({ escenario: "playa" });
    for (let i = 0; i < 60 * 120; i++) {
      avanzar(e, nada(), 1 / 60);
      for (const d of e.portal.desfile) {
        expect(d.x).toBeGreaterThan(40);
        expect(d.x).toBeLessThan(WORLD_W - 40);
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

/* El reparto del mapa está en fracciones del mundo, así que estas pruebas valen
   a cualquier tamaño: son las que impiden que agrandar el mapa deje una casa
   fuera del borde o dos encima. */
describe("el reparto del mapa", () => {
  const CASA_W = 380, CASA_H = 330;
  const solapan = (a: number[], b: number[]) =>
    a[0] < b[0] + CASA_W && a[0] + CASA_W > b[0] &&
    a[1] < b[1] + CASA_H && a[1] + CASA_H > b[1];

  it("cada escenario trae su tamaño de mundo, y no se contagia al siguiente", () => {
    /* El Multiverso mide 86 400 de ancho y los demás 3 600. Si al cambiar de sitio
       no se volviera a fijar, el mapa siguiente se jugaría con el mundo del
       anterior: el jugador se saldría del mapa y la cámara se iría a un lado.
       Lo mismo al REVIVIR una partida guardada, que no pasa por `crearPartida`
       — de eso se encarga `revivirPartida` en el cliente llamando a
       `fijarMundo` con lo que trae el escenario guardado. */
    const multi = partida({ escenario: "multiverso" });
    expect(WORLD_W).toBe(86400);
    expect(multi.esc.mundo).toEqual({ w: 86400, h: 2100 });
    const normal = partida({ escenario: "catarata" });
    expect(WORLD_W, "el mundo del Multiverso se contagió al mapa siguiente").toBe(3600);
    expect(normal.esc.mundo).toBeUndefined();
    // y todo lo del mapa normal cabe en el mapa normal
    for (const b of normal.bases)
      expect(b.rect.x + b.rect.w, "una base se salió").toBeLessThanOrEqual(WORLD_W);
    for (const t of normal.trastos)
      expect(t.x, "un trasto se salió").toBeLessThanOrEqual(WORLD_W);
  });

  it("ninguna casa ni patio se sale del mundo", () => {
    for (const base of ESCENARIOS) {
      const esc = montarEscenario(base);
      for (const [x, y] of [...esc.casas, ...esc.patios]) {
      const donde = esc.id + " en " + x + "," + y;
      expect(x, donde).toBeGreaterThanOrEqual(0);
      expect(y, donde).toBeGreaterThanOrEqual(0);
      expect(x + CASA_W, donde + " se sale por la derecha").toBeLessThanOrEqual(WORLD_W);
      expect(y + CASA_H, donde + " se sale por abajo").toBeLessThanOrEqual(WORLD_H);
      }
    }
  });

  it("no hay dos encima", () => {
    for (const base of ESCENARIOS) {
      const esc = montarEscenario(base);
      const todas = [...esc.casas, ...esc.patios];
      for (let i = 0; i < todas.length; i++) for (let j = i + 1; j < todas.length; j++)
        expect(solapan(todas[i], todas[j]),
               esc.id + ": " + todas[i] + " pisa a " + todas[j]).toBe(false);
    }
  });

  it("el desfile no cruza por encima de ninguna casa", () => {
    /* Contra la CURVA, no contra su caja: el ocho no llena su rectángulo ni de
       lejos, y medir la caja daba por malos sitios que están perfectamente.
       Esto encontró siete escenarios en los que el desfile pasaba por dentro de
       un patio — los Florines se veían atravesando la casa. */
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      for (const base of e.bases) {
        const r = base.rect;
        let cerca = Infinity;
        for (const lado of [0, 1] as const) for (const giro of [1, -1] as const)
          for (let k = 0; k <= 1; k += 0.002) {
            const q = puntoDelDesfile(e, k, lado, giro);
            const dx = Math.max(r.x - q.x, 0, q.x - (r.x + r.w));
            const dy = Math.max(r.y - q.y, 0, q.y - (r.y + r.h));
            cerca = Math.min(cerca, Math.hypot(dx, dy));
          }
        expect(cerca, esc.id + ": el desfile pasa a " + Math.round(cerca) +
               "px de la base " + base.id).toBeGreaterThan(30);
      }
    }
  });

  it("no se corre con un trasto de agua a cuestas", () => {
    /* Los circuitos van por tierra, también los de costa. Un vehículo de agua
       fuera del agua penaliza a 0,9× —más lento que a pie—, así que darlo por
       defecto convertía la carrera en un paseo cargando la tabla: La Playa
       tardaba 118 s y El Amazonas 109, contra los 48-87 s del resto. */
    for (const esc of CIRCUITOS) {
      const v = vehiculoDelSitio(partida({ escenario: esc.id }));
      expect(VEHICULOS[v]?.agua, esc.id + " sale a correr en " + v).toBeFalsy();
    }
  });

  it("los dos puestos de cada clase están lejos y libres", () => {
    /* El par de fuera existe para que desde una esquina no haya que cruzar el
       mapa entero. Si acaba pegado al del centro no sirve de nada, y si acaba
       encima de una casa tapa el botón de entrar. */
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      /* Dos en un mapa normal. En uno de zonas, además, un par por cada tramo de
         tres zonas: con dos para 86 400 px la más cercana quedaba a dos minutos
         y medio ANDANDO. */
      const tramos = esc.zonas?.length ? Math.ceil((esc.zonas.length - 3) / 3) : 0;
      expect(e.armerias.length, esc.id).toBe(2 + tramos);
      expect(e.ruletas.length, esc.id).toBe(2 + tramos);
      const lejos = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(a.x - b.x, a.y - b.y);
      /* Lo intocable es que no caigan dentro de una casa (taparían el botón de
         entrar). Lo de estar lejos cede si no hay hueco, así que se pide un
         mínimo más flojo: lo bastante como para que el viaje valga la pena. */
      /* El par de casa se mide contra un mapa NORMAL: en el Multiverso los dos
         viven en la primera zona, cerca de tu patio, y los demás pares están
         repartidos por los otros tramos. */
      const suelo = Math.min(WORLD_W, 3600) * 0.22;
      expect(lejos(e.armerias[0], e.armerias[1]),
             esc.id + ": las dos Armerías están juntas").toBeGreaterThan(suelo);
      expect(lejos(e.ruletas[0], e.ruletas[1]),
             esc.id + ": las dos Ruletas están juntas").toBeGreaterThan(suelo);
      for (const b of e.bases) {
        const r = b.rect;
        for (const a of e.armerias)
          expect(a.x < r.x + r.w && a.x + a.w > r.x && a.y < r.y + r.h && a.y + a.h > r.y,
                 esc.id + ": una Armería cae dentro de la base " + b.id).toBe(false);
        for (const ru of e.ruletas)
          expect(ru.x + ru.r > r.x && ru.x - ru.r < r.x + r.w &&
                 ru.y + ru.r > r.y && ru.y - ru.r < r.y + r.h,
                 esc.id + ": una Ruleta cae dentro de la base " + b.id).toBe(false);
      }
    }
  });

  it("la Fusionadora no cae encima de una casa", () => {
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id });
      const m = e.fusion;
      expect(m, esc.id + ": no hay Fusionadora").toBeTruthy();
      for (const b of e.bases) {
        const r = b.rect;
        expect(m.x < r.x + r.w && m.x + m.w > r.x && m.y < r.y + r.h && m.y + m.h > r.y,
               esc.id + ": la Fusionadora cae dentro de la base " + b.id).toBe(false);
      }
    }
  });

  it("los circuitos caben en el mundo", () => {
    for (const base of CIRCUITOS) {
      const esc = montarEscenario(base);
      for (const [x, y] of esc.circuito!) {
        const donde = esc.id + " en " + x + "," + y;
        expect(x, donde).toBeGreaterThan(ANCHO_PISTA / 2);
        expect(x, donde).toBeLessThan(WORLD_W - ANCHO_PISTA / 2);
        expect(y, donde).toBeGreaterThan(ANCHO_PISTA / 2);
        expect(y, donde).toBeLessThan(WORLD_H - ANCHO_PISTA / 2);
      }
      // y los de costa no cruzan la orilla
      if (esc.mar != null) for (const [, y] of esc.circuito!)
        expect(y, esc.id + ": la pista se mete en el agua").toBeLessThan(esc.mar - ANCHO_PISTA / 2);
    }
  });
});

describe("lo brava que es la carrera", () => {
  const corrida = (dificultad: any) => {
    let hitos = 0;
    for (const esc of ["catarata", "prehistoria", "egipto", "colegio"]) {
      const e = crearPartida({ jugadores: 5, escenario: esc, semilla: 7, armas: ["chancla"],
                               reglas: { modo: "carrera", vecinos: false, dificultad } as any });
      for (let i = 0; i < 60 * 40; i++) {
        const ent: Record<number, EntradaJugador> = {};
        for (const p of e.players) ent[p.idx] = pensarBot(e, p, 1 / 60).entrada;
        avanzar(e, ent, 1 / 60);
      }
      const r = e.players[1].carrera!;
      hitos += r.vuelta * e.esc.circuito!.length + r.hito;
    }
    return hitos;
  };

  it("los rivales corren más cuanto más brava es", () => {
    /* Medido en cuatro mapas y 40 s: 194 / 228 / 261 puntos de paso. Si esto se
       aplana, la dificultad dejó de significar nada. */
    const facil = corrida("facil"), normal = corrida("normal"), dificil = corrida("dificil");
    expect(normal, `fácil ${facil} vs normal ${normal}`).toBeGreaterThan(facil * 1.08);
    expect(dificil, `normal ${normal} vs difícil ${dificil}`).toBeGreaterThan(normal * 1.08);
  });

  it("en fácil no hay topes y de la pista se sale", () => {
    for (const [dif, seSale] of [["facil", true], ["normal", false], ["dificil", false]] as const) {
      const e = crearPartida({ jugadores: 1, escenario: "catarata", semilla: 7, armas: ["chancla"],
                               reglas: { modo: "carrera", vecinos: false, dificultad: dif } as any });
      const p = e.players[0], c = e.esc.circuito!;
      p.x = c[0][0]; p.y = c[0][1]; p.vx = p.vy = 0;
      // empujarlo perpendicular a la pista un buen rato
      for (let i = 0; i < 60 * 2; i++)
        avanzar(e, { 0: { mover: { x: 0, y: -1 }, apunta: null } }, 1 / 60);
      const fuera = enLaPista(e, p.x, p.y).d2 > (ANCHO_PISTA / 2 + 4) ** 2;
      expect(fuera, dif + ": esperaba " + (seSale ? "poder salirme" : "que el tope me frenara")).toBe(seSale);
    }
  });

  it("en fácil el césped frena, que es lo que sustituye al tope", () => {
    /* Sin nada que penalice, en fácil sale a cuenta cortar por el césped en
       cada curva y el trazado deja de importar. */
    const rec = (dentro: boolean) => {
      const e = crearPartida({ jugadores: 1, escenario: "catarata", semilla: 7, armas: ["chancla"],
                               reglas: { modo: "carrera", vecinos: false, dificultad: "facil" } as any });
      const p = e.players[0], c = e.esc.circuito!;
      p.x = c[0][0]; p.y = c[0][1] + (dentro ? 0 : ANCHO_PISTA * 2.5); p.vx = p.vy = 0;
      const x0 = p.x;
      for (let i = 0; i < 60 * 2; i++)
        avanzar(e, { 0: { mover: { x: 1, y: 0 }, apunta: null } }, 1 / 60);
      return p.x - x0;
    };
    const asfalto = rec(true), cesped = rec(false);
    expect(cesped, `asfalto ${Math.round(asfalto)} vs césped ${Math.round(cesped)}`)
      .toBeLessThan(asfalto * 0.85);
  });
});

describe("la Fusionadora", () => {
  /** Deja dos Florines en la vitrina y mete al jugador en la máquina. */
  function conDos(tierA: number, varA: any, tierB: number, varB: any) {
    const e = partida();
    const p = e.players[0];
    p.money = 999999;
    const peds = baseDe(e, p.baseId).peds;
    peds[0].florin = nuevoFlorin(e, tierA, { variant: varA });
    peds[1].florin = nuevoFlorin(e, tierB, { variant: varB });
    p.x = e.fusion.x + e.fusion.w / 2; p.y = e.fusion.y + e.fusion.h / 2;
    avanzar(e, nada(), 1 / 60);
    return { e, p };
  }

  it("dos del montón suben de rareza", () => {
    const { e, p } = conDos(0, null, 0, null);
    expect(p.inFusion, "no me deja entrar").toBe(true);
    expect(fundir(e, p, 0, 1)).toBe(true);
    const quedan = occupiedDe(e, p);
    expect(quedan.length, "deberían quedar uno, no dos").toBe(1);
    expect(quedan[0].florin!.tier, "dos Comunes no dieron un Fiestero").toBe(1);
  });

  it("se queda con la mejor variante de las dos", () => {
    const { e, p } = conDos(2, "dorado", 2, null);
    expect(fundir(e, p, 0, 1)).toBe(true);
    const q = occupiedDe(e, p)[0].florin!;
    expect(q.tier).toBe(3);
    expect(q.variant, "se perdió el Dorado por el camino").toBe("dorado");
  });

  it("no deja fundir si el resultado sería peor que lo que metes", () => {
    /* Un Amaru con un Común daría algo de media tabla: la máquina no te deja
       cargarte el Amaru. */
    const { e, p } = conDos(TIERS.length - 1, null, 0, null);
    expect(queSaleDeFundir(nuevoFlorin(e, TIERS.length - 1), nuevoFlorin(e, 0)).ok).toBe(false);
    expect(fundir(e, p, 0, 1)).toBe(false);
    expect(occupiedDe(e, p).length, "se comió los Florines igual").toBe(2);
  });

  it("dos Amaru dan el Supremo, que no sale de ninguna otra parte", () => {
    /* Es el final del juego: el único Florín que no se encuentra, no lo trae el
       desfile y no sale de la Ruleta. Solo de juntar los dos más altos. */
    const amaru = TIER_SUPREMO - 1;
    const { e, p } = conDos(amaru, null, amaru, null);
    expect(fundir(e, p, 0, 1)).toBe(true);
    const q = occupiedDe(e, p)[0].florin!;
    expect(q.tier).toBe(TIER_SUPREMO);
    expect(TIERS[q.tier].rar).toBe("Supremo");
  });

  it("y en el Supremo ya no se puede fundir más", () => {
    const { e, p } = conDos(TIER_SUPREMO, null, TIER_SUPREMO, null);
    expect(fundir(e, p, 0, 1)).toBe(false);
    expect(occupiedDe(e, p).length).toBe(2);
  });

  it("dos Amaru Galaxia dan el Supremo Galaxia", () => {
    const amaru = TIER_SUPREMO - 1;
    const { e, p } = conDos(amaru, "galaxia", amaru, "galaxia");
    expect(fundir(e, p, 0, 1)).toBe(true);
    const q = occupiedDe(e, p)[0].florin!;
    expect(q.tier).toBe(TIER_SUPREMO);
    expect(q.variant).toBe("galaxia");
  });

  it("cobra, y sin plata no funde", () => {
    const { e, p } = conDos(0, null, 0, null);
    const precio = queSaleDeFundir(nuevoFlorin(e, 0), nuevoFlorin(e, 0)).precio;
    expect(precio).toBeGreaterThan(0);
    p.money = precio - 1;
    expect(fundir(e, p, 0, 1), "fundió sin pagar").toBe(false);
    p.money = precio;
    expect(fundir(e, p, 0, 1)).toBe(true);
    expect(p.money).toBe(0);
  });

  it("fuera de la máquina no se funde nada", () => {
    const { e, p } = conDos(0, null, 0, null);
    p.x = 50; p.y = 50;
    avanzar(e, nada(), 1 / 60);
    expect(p.inFusion).toBe(false);
    expect(fundir(e, p, 0, 1)).toBe(false);
  });
});

describe("vecinos que juegan solos", () => {
  const conVecinos = (bots: number) =>
    partida({ jugadores: 1 + bots, bots, reglas: { patiosExtra: true } });

  it("cada uno se queda con su casa y con su nombre", () => {
    const e = conVecinos(3);
    expect(e.players.length).toBe(4);
    expect(e.players[0].apodo, "tú no llevas apodo de vecino").toBeUndefined();
    expect(e.players.slice(1).map(p => p.apodo)).toEqual(["el Marciano", "Mayo", "la Sobri"]);
    // su casa sigue llamándose como se llamaba: es del vecino, no "Patio del J2"
    for (const p of e.players.slice(1)){
      const casa = baseDe(e, p.baseId);
      expect(casa.isPlayer, "la casa del vecino no es suya").toBe(true);
      expect(casa.who, "seguiría soltando ladrones").toBe(null);
      expect(casa.name, "el bot se llamó J-algo").not.toMatch(/^Patio del J/);
    }
  });

  it("con vecinos-máquina tu patio sigue siendo tuyo, no 'del J1'", () => {
    expect(baseDe(conVecinos(3), 0).name).toBe("Tu patio");
    expect(baseDe(partida({ jugadores: 2, reglas: { modo: "versus" } }), 0).name)
      .toBe("Patio del J1");
  });

  it("un humano de más sí es 'Patio del J2'", () => {
    const e = partida({ jugadores: 2, reglas: { modo: "versus" } });
    expect(e.players[1].apodo).toBeUndefined();
    expect(baseDe(e, e.players[1].baseId).name).toBe("Patio del J2");
  });

  it("quedan casas de vecino a las que robar", () => {
    const e = conVecinos(3);
    const ajenas = e.bases.filter(b => b.who != null);
    expect(ajenas.length, "el barrio se quedó sin nadie a quien robar")
      .toBeGreaterThanOrEqual(3);
    expect(ajenas.some(b => b.peds.some(p => p.florin)), "y sin Florines").toBe(true);
  });

  it("los patios comprables siguen ahí", () => {
    const e = conVecinos(2);
    expect(e.bases.some(b => b.locked && b.price)).toBe(true);
  });

  it("el vecino juega: se mueve y roba sin que nadie lo toque", () => {
    const e = conVecinos(1);
    const bot = e.players[1];
    const x0 = bot.x, y0 = bot.y;
    let robó = false;
    for (let k = 0; k < 60 * 90; k++){
      const ent: Record<number, EntradaJugador> = { 0: QUIETO };
      const plan = pensarBot(e, bot, 1 / 60);
      ent[1] = plan.entrada;
      if (plan.usar) usarArma(e, bot);
      avanzar(e, ent, 1 / 60);
      if (bot.stats.steals > 0) { robó = true; break; }
    }
    expect(Math.hypot(bot.x - x0, bot.y - y0), "el vecino no se movió").toBeGreaterThan(200);
    expect(robó, "el vecino no robó nada en minuto y medio").toBe(true);
  });

  it("cuando el vecino te roba, te enteras", () => {
    const e = conVecinos(1);
    const yo = e.players[0], vecino = e.players[1];
    const mia = baseDe(e, yo.baseId);
    mia.peds[0].florin = nuevoFlorin(e, 2, {});
    // el vecino pegado a mi vitrina, forcejeando
    vecino.x = mia.peds[0].x; vecino.y = mia.peds[0].y;
    const suyo = { 0: QUIETO, 1: QUIETO };
    avanzar(e, suyo, 1 / 60);
    avanzar(e, suyo, 1 / 60);
    expect(e.alarma, "no saltó la alarma").not.toBe(null);
    expect(e.alarma!.quien).toBe("el Marciano");
    expect(e.alarma!.victimaIdx).toBe(0);

    for (let k = 0; k < 60 && !vecino.carry; k++) avanzar(e, suyo, 1 / 60);
    expect(vecino.carry, "no llegó a robarlo").toBeTruthy();
    expect(yo.stats.lost, "el robo no contó como robo").toBe(1);
    expect(e.alarma, "la alarma se quedó sonando sin nadie robando").toBe(null);
  });

  it("la aventura no se acaba porque el vecino llene su vitrina", () => {
    const e = conVecinos(1);
    const bot = e.players[1];
    const casa = baseDe(e, bot.baseId);
    for (const ped of casa.peds) ped.florin = nuevoFlorin(e, 3, {});
    avanzar(e, nada(2), 1 / 60);
    expect(e.over, "la aventura terminó sola").toBe(false);
  });
});

describe("fútbol", () => {
  const partido = (jugadores = 6, semilla = 11) =>
    crearPartida({ jugadores, escenario: "colegio", semilla, armas: idsDeArmas(),
                   reglas: { modo: "futbol", vecinos: false, puestos: false, patiosExtra: false } });

  /** Deja correr el partido con todos llevados por la máquina. */
  function jugar(e: Estado, segundos: number){
    for (let k = 0; k < 60 * segundos && !e.over; k++){
      const ent: Record<number, EntradaJugador> = {};
      const tiran: any[] = [];
      for (const p of e.players){
        const plan = pensarBot(e, p, 1 / 60);
        ent[p.idx] = plan.entrada;
        if (plan.usar) tiran.push(p);
      }
      for (const p of tiran) usarArma(e, p);
      avanzar(e, ent, 1 / 60);
    }
  }

  it("hay una cancha, dos arcos, dos equipos y UNA pelota", () => {
    const e = partido();
    const f = e.futbol!;
    expect(f).not.toBe(null);
    expect(f.arcos.length).toBe(2);
    expect(e.trastos.filter(t => t.tipo === "pelota").length,
           "más de una pelota: nadie sabría cuál cuenta").toBe(1);
    expect(e.trastos.length, "quedaron trastos que estorban").toBe(1);
    const equipos = e.players.map(p => p.equipo);
    expect(equipos.filter(q => q === 0).length).toBe(3);
    expect(equipos.filter(q => q === 1).length).toBe(3);
  });

  it("el saque pone la pelota en el centro y a cada equipo en su mitad", () => {
    const e = partido();
    const f = e.futbol!;
    const balon = e.trastos.find(t => t.id === f.balon)!;
    const cx = f.cancha.x + f.cancha.w / 2;
    expect(Math.abs(balon.x - cx)).toBeLessThan(2);
    for (const p of e.players){
      if (p.equipo === 0) expect(p.x, "un local en campo contrario").toBeLessThan(cx);
      else expect(p.x, "un visitante en campo propio").toBeGreaterThan(cx);
    }
  });

  it("los bots juegan de verdad: marcan y el partido termina solo", () => {
    const e = partido();
    jugar(e, 300);
    const f = e.futbol!;
    expect(f.goles[0] + f.goles[1], "cuatro minutos y nadie tocó la pelota")
      .toBeGreaterThan(0);
    expect(e.over, "el partido no terminó solo").toBe(true);
    /* O alguien llegó a la meta, o se acabó el reloj. */
    expect(f.goles[0] === f.meta || f.goles[1] === f.meta || f.reloj <= 0).toBe(true);
  });

  it("gana el equipo, no el jugador", () => {
    const e = partido();
    jugar(e, 300);
    const f = e.futbol!;
    if (f.ganador == null) return;                 // empate a los cuatro minutos
    expect(f.goles[f.ganador]).toBeGreaterThan(f.goles[1 - f.ganador]);
    // `winnerIdx` es de un jugador: tiene que ser uno DEL equipo que ganó
    expect(e.players[e.winnerIdx!].equipo).toBe(f.ganador);
  });

  it("la pelota no se sale de la cancha", () => {
    const e = partido();
    const f = e.futbol!;
    const balon = e.trastos.find(t => t.id === f.balon)!;
    balon.vx = 4000; balon.vy = 2500;              // un pelotazo a la esquina
    jugar(e, 6);
    expect(balon.x).toBeGreaterThanOrEqual(f.cancha.x);
    expect(balon.x).toBeLessThanOrEqual(f.cancha.x + f.cancha.w);
    expect(balon.y).toBeGreaterThanOrEqual(f.cancha.y);
    expect(balon.y).toBeLessThanOrEqual(f.cancha.y + f.cancha.h);
  });

  it("un 4v4 también reparte parejo", () => {
    const e = partido(8, 3);
    expect(e.players.filter(p => p.equipo === 0).length).toBe(4);
    expect(e.players.filter(p => p.equipo === 1).length).toBe(4);
  });

  it("en fútbol no hay ladrones ni desfile: es un partido, no el barrio", () => {
    const e = partido();
    jugar(e, 30);
    expect(e.thieves.length, "salieron ladrones a media cancha").toBe(0);
    expect(e.portal.desfile.length, "el desfile cruzó el partido").toBe(0);
  });
});

describe("el Multiverso", () => {
  const multi = () => partida({ escenario: "multiverso" });

  it("son los veinticuatro escenarios cosidos, en orden y sin huecos", () => {
    const esc = ESCENARIOS.find(x => x.id === "multiverso")!;
    const ids = ESCENARIOS.filter(x => !x.zonas).map(x => x.id);
    expect(esc.zonas!.map(z => z.id)).toEqual(ids);
    // sin huecos ni solapes: cada zona empieza donde acaba la anterior
    esc.zonas!.forEach((z, i) => {
      if (i > 0) expect(z.x0, z.id).toBe(esc.zonas![i - 1].x1);
    });
    expect(esc.mundo!.w).toBe(esc.zonas!.length * 3600);
  });

  it("hay una casa de vecino en cada zona", () => {
    const e = multi();
    for (const z of e.esc.zonas!){
      const enZona = e.bases.filter(b => b.who &&
        b.rect.x + b.rect.w / 2 >= z.x0 && b.rect.x + b.rect.w / 2 < z.x1);
      expect(enZona.length, z.id + " se quedó sin vecino").toBe(1);
    }
  });

  it("los vecinos repetidos dicen en qué zona viven", () => {
    const e = multi();
    const nombres = e.bases.filter(b => b.who).map(b => b.name);
    expect(new Set(nombres).size, "dos casas con el mismo cartel").toBe(nombres.length);
  });

  it("tu patio, la pasarela y los puestos de casa están en la primera zona", () => {
    const e = multi();
    const mio = baseDe(e, e.players[0].baseId);
    expect(mio.rect.x).toBeLessThan(3600);
    expect(e.portal.x, "la pasarela se fue lejos de casa").toBeLessThan(3600);
    expect(Math.min(...e.armerias.map(a => a.x)), "ninguna Armería cerca").toBeLessThan(3600);
    expect(Math.min(...e.ruletas.map(r => r.x)), "ninguna Ruleta cerca").toBeLessThan(3600);
    expect(e.fusion.x, "la Fusionadora se fue lejos").toBeLessThan(3600);
  });

  it("cada zona siembra lo suyo: dinosaurios en la Prehistoria, grúas en la obra", () => {
    const e = multi();
    const zona = (id: string) => e.esc.zonas!.find(z => z.id === id)!;
    const dentro = (t: { x: number }, z: { x0: number; x1: number }) => t.x >= z.x0 && t.x < z.x1;
    expect(e.trastos.some(t => t.tipo === "dino" && dentro(t, zona("prehistoria"))),
           "sin dinosaurios en la Prehistoria").toBe(true);
    expect(e.trastos.some(t => t.tipo === "grua" && dentro(t, zona("construccion"))),
           "sin grúas en la obra").toBe(true);
    expect(e.trastos.some(t => t.tipo === "dino" && !dentro(t, zona("prehistoria"))),
           "un dinosaurio fuera de su zona").toBe(false);
  });

  it("el mar es de cada zona: hay agua en La Playa y tierra seca en el desierto", () => {
    const e = multi();
    const playa = e.esc.zonas!.find(z => z.id === "playa")!;
    const desierto = e.esc.zonas!.find(z => z.id === "desierto")!;
    expect(playa.mar, "La Playa sin mar").toBeGreaterThan(0);
    expect(desierto.mar, "el desierto con mar").toBeUndefined();
    // y a pie, el agua de la playa frena
    expect(enElMar(e, (playa.x0 + playa.x1) / 2, WORLD_H - 50)).toBe(true);
    expect(enElMar(e, (desierto.x0 + desierto.x1) / 2, WORLD_H - 50)).toBe(false);
  });

  it("los ladrones salen de un vecino cercano, no del otro extremo del mundo", () => {
    const e = multi();
    const mio = baseDe(e, e.players[0].baseId);
    for (const ped of mio.peds) ped.florin = nuevoFlorin(e, 2, {});
    for (let i = 0; i < 40; i++) spawnThief(e);
    expect(e.thieves.length).toBeGreaterThan(0);
    for (const t of e.thieves){
      const casa = baseDe(e, t.homeId);
      expect(Math.abs(casa.rect.x - mio.rect.x),
             casa.name + " manda ladrones desde la otra punta").toBeLessThan(3600);
    }
  });

  it("los ladrones vienen a un ritmo de barrio, no de mundo entero", () => {
    /* El ritmo sube con las casas de vecino que hay CERCA. Contando las
       veinticuatro del Multiverso salía un ladrón cada seis segundos, cuando solo
       pueden venir las dos o tres que viven a mano. */
    const cuantos = (esc: string) => {
      const e = partida({ escenario: esc, reglas: { patiosExtra: true } });
      const mio = baseDe(e, e.players[0].baseId);
      const vistos = new Set<number>();
      for (let k = 0; k < 60 * 180; k++){
        for (const ped of mio.peds) if (!ped.florin) ped.florin = nuevoFlorin(e, 2, {});
        avanzar(e, nada(), 1 / 60);
        for (const t of e.thieves) vistos.add(t.id);
      }
      return vistos.size;
    };
    const normal = cuantos("catarata");
    const multi = cuantos("multiverso");
    expect(multi, "el Multiverso manda más ladrones que un barrio entero")
      .toBeLessThanOrEqual(normal);
    expect(multi, "en el Multiverso no llega ningún ladrón").toBeGreaterThan(5);
  });

  it("una vuelta entera del desfile no crece con el mundo", () => {
    partida({ escenario: "multiverso" });
    const enElMulti = PORTAL_VUELTA;
    partida({ escenario: "catarata" });
    const enElNormal = PORTAL_VUELTA;
    expect(enElMulti, "la pasarela del Multiverso tarda una eternidad")
      .toBe(enElNormal);
  });
});

describe("la fiesta de la pasarela", () => {
  const LOS_BUENOS = [
    { tier: TIERS.length - 1, variant: "galaxia" as const },
    { tier: TIERS.length - 2, variant: "dorado" as const },
  ];
  /** Deja correr el desfile y devuelve lo que bajó por la pasarela. */
  function loQueBaja(e: Estado, segundos: number){
    const visto: { tier: number; variant: any }[] = [];
    const ids = new Set<number>();
    for (let k = 0; k < 60 * segundos; k++){
      avanzar(e, nada(), 1 / 60);
      for (const d of e.portal.desfile)
        if (!ids.has(d.id)){ ids.add(d.id); visto.push({ tier: d.florin.tier, variant: d.florin.variant }); }
    }
    return visto;
  }

  it("sin fiesta baja de todo, y casi todo del montón", () => {
    const e = partida();
    const v = loQueBaja(e, 120);
    expect(v.length, "no bajó nadie").toBeGreaterThan(3);
    expect(v.every(f => f.variant == null), "salieron variantes sin ruleta").toBe(true);
  });

  it("en fiesta baja SOLO lo anunciado", () => {
    const e = partida();
    ponerFiesta(e, "Noche de Wiracochas", LOS_BUENOS, 60);
    expect(enFiesta(e)).toBe(true);
    const v = loQueBaja(e, 50);
    expect(v.length, "la pasarela se quedó vacía").toBeGreaterThan(3);
    for (const f of v)
      expect(LOS_BUENOS.some(b => b.tier === f.tier && b.variant === f.variant),
             "bajó un tier " + f.tier + " que nadie anunció").toBe(true);
  });

  it("la fiesta se acaba sola y vuelve lo de siempre", () => {
    const e = partida();
    ponerFiesta(e, "Cinco segundos", LOS_BUENOS, 5);
    for (let k = 0; k < 60 * 6; k++) avanzar(e, nada(), 1 / 60);
    expect(enFiesta(e), "la fiesta no caducó").toBe(false);
    const v = loQueBaja(e, 120);
    expect(v.some(f => f.variant == null), "todo lo que baja sigue siendo de fiesta").toBe(true);
  });

  it("sin Florines anunciados no hay fiesta", () => {
    const e = partida();
    ponerFiesta(e, "Vacía", [], 60);
    expect(e.fiesta).toBe(null);
    expect(enFiesta(e)).toBe(false);
  });

  it("una fiesta viaja por la red como el resto del estado", () => {
    const e = partida();
    ponerFiesta(e, "Noche de Wiracochas", LOS_BUENOS, 60);
    const ida = JSON.parse(JSON.stringify(e));
    expect(ida.fiesta.nombre).toBe("Noche de Wiracochas");
    expect(ida.fiesta.florines).toEqual(LOS_BUENOS);
  });
});

describe("cuantos más vecinos, más ladrones", () => {
  /** Cuántos ladrones distintos salen en `segundos` con la vitrina llena. */
  function cuantosSalen(bots: number, segundos = 180){
    const e = partida({ jugadores: 1 + bots, bots, reglas: { patiosExtra: true } });
    for (const b of patiosDe(e, e.players[0]))
      b.peds.forEach(p => { p.florin = nuevoFlorin(e, 2, {}); });
    const ent = nada(e.players.length);
    const vistos = new Set<number>();
    for (let k = 0; k < 60 * segundos; k++){
      avanzar(e, ent, 1 / 60);
      for (const t of e.thieves) vistos.add(t.id);
      // reponer, que si la vitrina se vacía dejan de venir y no se mide nada
      for (const b of patiosDe(e, e.players[0]))
        b.peds.forEach(p => { if (!p.florin) p.florin = nuevoFlorin(e, 2, {}); });
    }
    return vistos.size;
  }

  it("con el barrio entero salen más que con medio barrio fuera", () => {
    const lleno = cuantosSalen(0);        // ocho casas de vecino
    const medio = cuantosSalen(5);        // tres, el resto están jugando
    expect(lleno, "ocho vecinos no mandan más gente que tres").toBeGreaterThan(medio);
  });

  it("sacar vecinos a jugar NO deja el barrio en silencio", () => {
    /* El ritmo solo acelera. Si además frenara, elegir vecinos en el menú
       saldría gratis: menos ladrones y encima el mapa más tranquilo. */
    const medio = cuantosSalen(5, 120);
    expect(medio, "se quedó sin ladrones").toBeGreaterThanOrEqual(6);
  });
});

describe("la cochera del patio", () => {
  const TODOS = GARAJE.map(g => g.tipo);
  const enLaCochera = (e: Estado) =>
    e.trastos.filter(v => e.cochera && inRect(v.x, v.y, e.cochera, 0));

  it("sin nada comprado no hay cochera", () => {
    const e = partida();
    expect(e.cochera).toBe(null);
  });

  it("aparca lo comprado, uno por plaza", () => {
    const e = partida({ garaje: ["ovni", "amaru", "trineo"] });
    expect(e.cochera).not.toBe(null);
    const dentro = enLaCochera(e);
    expect(dentro.map(v => v.tipo).sort()).toEqual(["amaru", "ovni", "trineo"]);
    // ninguno encima de otro: las plazas son de 96
    for (const a of dentro) for (const b of dentro)
      if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(60);
  });

  /** Lo que separa la cochera del patio, por su lado más corto. */
  const huecoAlPatio = (e: Estado) => {
    const c = e.cochera!, r = e.bases.find(b => b.isPlayer)!.rect;
    return Math.max(r.x - (c.x + c.w), c.x - (r.x + r.w),
                    r.y - (c.y + c.h), c.y - (r.y + r.h));
  };

  it("con lo que se tiene de verdad, va pegada al patio", () => {
    // tres vehículos es una partida larga ya; nueve es el caso extremo
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id, garaje: ["ovni", "amaru", "condor"] });
      expect(huecoAlPatio(e), esc.id + ": la cochera se fue lejos del patio")
        .toBeLessThan(130);
    }
  });

  it("con el garaje entero sigue estando al lado y sin pisar a nadie", () => {
    for (const esc of ESCENARIOS) {
      const e = partida({ escenario: esc.id, garaje: TODOS });
      const c = e.cochera!;
      const r = e.bases.find(b => b.isPlayer)!.rect;
      expect(c, esc.id).not.toBe(null);
      /* Nueve vehículos ocupan lo que una casa entera: en un patio encajonado
         se aparta lo justo, pero sigue siendo "la de tu casa" y no una cochera
         al otro lado del mapa. */
      expect(huecoAlPatio(e), esc.id + ": la cochera se fue lejos del patio")
        .toBeLessThan(380);
      // dentro del mundo y fuera del agua
      expect(c.x, esc.id).toBeGreaterThanOrEqual(0);
      expect(c.y, esc.id).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w, esc.id).toBeLessThanOrEqual(WORLD_W);
      expect(c.y + c.h, esc.id).toBeLessThanOrEqual(WORLD_H);
      if (e.esc.mar != null)
        expect(c.y + c.h, esc.id + ": la cochera acabó en el mar").toBeLessThan(e.esc.mar);
      expect(enLaCochera(e).length, esc.id).toBe(TODOS.length);
      // y sin pisarle el terreno a nadie
      for (const b of e.bases){
        if (b.rect === r) continue;
        const pisa = c.x < b.rect.x + b.rect.w && c.x + c.w > b.rect.x &&
                     c.y < b.rect.y + b.rect.h && c.y + c.h > b.rect.y;
        expect(pisa, esc.id + ": la cochera se metió en " + b.name).toBe(false);
      }
    }
  });

  it("los aparcados se montan como cualquier trasto", () => {
    const e = partida({ garaje: ["ovni"] });
    const p = e.players[0];
    const v = e.trastos.find(t => t.tipo === "ovni")!;
    p.x = v.x; p.y = v.y;
    avanzar(e, nada(), 1 / 60);
    expect(p.montado, "no me subí al ovni que compré").toBe(v.id);
  });

  it("en carrera no hay cochera: se sale de la parrilla", () => {
    const e = crearPartida({ jugadores: 2, escenario: "circuito", semilla: 7,
                             armas: idsDeArmas(), garaje: TODOS,
                             reglas: { modo: "carrera", vecinos: false, puestos: false } });
    expect(e.cochera).toBe(null);
  });

  it("no se siembra nada encima de lo aparcado", () => {
    const e = partida({ garaje: TODOS });
    const mios = new Set(enLaCochera(e).map(v => v.id));
    for (const v of e.trastos){
      if (mios.has(v.id)) continue;
      for (const m of e.trastos){
        if (!mios.has(m.id)) continue;
        expect(Math.hypot(v.x - m.x, v.y - m.y),
               "una " + v.tipo + " encima de mi " + m.tipo).toBeGreaterThan(50);
      }
    }
  });
});

describe("carrera", () => {
  const carrera = (esc = "circuito", jugadores = 2) =>
    crearPartida({ jugadores, escenario: esc, semilla: 7, armas: idsDeArmas(),
                   reglas: { modo: "carrera", vecinos: false, puestos: false } });

  it("en TODOS los escenarios se puede correr, y se sale en línea y montado", () => {
    /* Todos menos El Valle, que no es un sitio para dar vueltas sino para
       andar de una zona a otra. */
    const sinPista = ESCENARIOS.filter(e => !CIRCUITOS.includes(e)).map(e => e.id);
    expect(sinPista, "hay escenarios de más sin circuito").toEqual(["multiverso"]);
    for (const base of CIRCUITOS) {
      const esc = montarEscenario(base);
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
    for (const base of CIRCUITOS) {
      const esc = montarEscenario(base);
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
    for (const base of CIRCUITOS) {
      const esc = montarEscenario(base);
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
    for (const base of CIRCUITOS) {
      const esc = montarEscenario(base);
      const c = esc.circuito!;
      for (const [x, y] of c) {
        expect(x, esc.id + ": la pista se sale por los lados").toBeGreaterThan(90);
        expect(x, esc.id + ": la pista se sale por los lados").toBeLessThan(WORLD_W - 90);
        expect(y, esc.id + ": la pista se sale por arriba o abajo").toBeGreaterThan(90);
        expect(y, esc.id + ": la pista se sale por arriba o abajo").toBeLessThan(WORLD_H - 90);
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

  it("el dinosaurio se monta, es de la Prehistoria y no es un especial", () => {
    // se encuentra tirado: no se compra ni se gana
    expect(esEspecial("dino"), "el dino acabó en el Garaje").toBe(false);
    // y es el más rápido de los que se encuentran tirados
    const normales = Object.entries(VEHICULOS)
      .filter(([k]) => !esEspecial(k) && k !== "dino").map(([, v]) => v.mult);
    expect(VEHICULOS.dino.mult).toBeGreaterThan(Math.max(...normales));
    // en su escenario hay dinos de sobra para todos los que corren
    const hay = TRASTOS_ESCENARIO.prehistoria.find(t => t.tipo === "dino");
    expect(hay, "la Prehistoria se quedó sin dinos").toBeTruthy();
    // y montado de verdad: en carrera te toca el del sitio
    const e = carrera("prehistoria", 2);
    expect(vehiculoDelSitio(e)).toBe("dino");
    expect(trastoDe(e, e.players[0].montado)!.tipo).toBe("dino");
  });

  it("los de tierra propia se encuentran allí, y solo allí", () => {
    /* Es lo que le da sentido a comprarlos: en su mapa los montas gratis, y lo
       que pagas en el Garaje es poder sacarlos de ahí. */
    for (const [tipo, donde] of Object.entries(TIERRA_DEL_ESPECIAL)) {
      const suyo = partida({ escenario: donde });
      expect(suyo.trastos.some(t => t.tipo === tipo),
             tipo + " no aparece en " + donde).toBe(true);
      for (const esc of ESCENARIOS) {
        if (esDeSuTierra(tipo, esc.id)) continue;   // su sitio, o un valle que lo incluya
        const otro = partida({ escenario: esc.id });
        expect(otro.trastos.some(t => t.tipo === tipo),
               tipo + " apareció tirado en " + esc.id).toBe(false);
      }
    }
  });

  it("los especiales vuelan, menos los de obra", () => {
    /* Volar era la marca de la casa de los especiales, hasta que llegaron la
       grúa y el monster truck: un camión de obra que flota sobre el mar no lo
       quiere nadie. Los que no vuelan son exactamente los que tienen tierra
       propia y se encuentran tirados allí. */
    for (const g of GARAJE) {
      const vuela = VEHICULOS[g.tipo].agua;
      const deObra = !!TIERRA_DEL_ESPECIAL[g.tipo] && g.tipo !== "dragon";
      expect(vuela, g.tipo).toBe(!deObra);
    }
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

/* Reproduce lo que hay en la nube de quien dejó una partida a medias ANTES del
   mapa grande: mundo 2600x1700, `armeria`/`ruleta` en singular, cuatro casas. */
function guardadoViejo() {
  const e: any = JSON.parse(JSON.stringify(
    crearPartida({ jugadores: 1, escenario: "catarata", semilla: 7, armas: ["chancla"] })));
  e.armeria = { x: 850, y: 775, w: 300, h: 150 };
  e.ruleta = { x: 1600, y: 850, r: 92 };
  delete e.armerias; delete e.ruletas;
  e.bases = e.bases.slice(0, 7);
  e.esc.casas = [[70,90],[2150,90],[2150,700],[2150,1290]];
  e.esc.patios = [[70,1290],[520,1290],[70,900]];
  for (const b of e.bases) { b.rect.x = Math.min(b.rect.x, 2220); b.rect.y = Math.min(b.rect.y, 1370); }
  e.players[0].x = 1300; e.players[0].y = 850;
  return e;
}

describe("una partida guardada del mapa anterior", () => {
  it("con la migración del cliente, sigue avanzando sin reventar", () => {
    const e = guardadoViejo();
    // lo que hace revivirPartida en apps/web/src/puente.js
    const puestos = colocarPuestos(e.bases);
    e.armerias = puestos.armerias; e.ruletas = puestos.ruletas;
    delete e.armeria; delete e.ruleta;

    const nada = (): Record<number, EntradaJugador> =>
      ({ 0: { mover: { x: 1, y: 0 }, apunta: null } });
    expect(() => { for (let i = 0; i < 60 * 30; i++) avanzar(e, nada(), 1 / 60); }).not.toThrow();

    // y todo sigue dentro del mundo nuevo
    for (const p of e.players) {
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(WORLD_W);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(WORLD_H);
    }
    expect(e.portal.desfile.length).toBeGreaterThan(0);
  });

  it("y los puestos se le recolocan al centro nuevo, con el segundo par", () => {
    /* Sin esto, sus puestos se quedaban en el centro de un mundo que ya no
       existe y el desfile —que sí pasa por el centro nuevo— les daba vueltas a
       400 px de la Ruleta. */
    const e = guardadoViejo();
    const puestos = colocarPuestos(e.bases);
    expect(puestos.armerias.length).toBe(2);
    expect(puestos.ruletas.length).toBe(2);
    const { cx, cy } = centroDelMapa();
    const a = puestos.armerias[0];
    expect(Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy),
           "la Armería del centro quedó lejos del centro").toBeLessThan(500);
  });
});
