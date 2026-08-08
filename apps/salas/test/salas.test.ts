/* La sala se prueba sin red y sin navegador: el registro y la clase Sala son
   objetos normales a los que se les inyecta el reloj y el azar. Lo que se
   comprueba aquí es el reparto de sitios, la reconexión y el protocolo — las
   reglas del juego ya las cubren los tests del motor. */

import { describe, expect, it } from "vitest";
import { JUGADORES_MAX } from "@florin/engine";
import { Registro, type Sala } from "../src/salas.js";
import { fotoMovil, TICKS_POR_SEG } from "../src/protocolo.js";
import type { DeLaSala } from "../src/protocolo.js";
import { quienEs, type AjustesJwt } from "../src/jwt.js";
import { SignJWT } from "jose";

/** Un cliente de mentira: guarda todo lo que le mandan. */
function cliente() {
  const recibido: DeLaSala[] = [];
  return {
    recibido,
    enviar: (m: DeLaSala) => { recibido.push(m); },
    ultimo: <T extends DeLaSala["t"]>(t: T) =>
      [...recibido].reverse().find(m => m.t === t) as Extract<DeLaSala, { t: T }> | undefined,
    cuantos: (t: DeLaSala["t"]) => recibido.filter(m => m.t === t).length,
  };
}

function registro() {
  let reloj = 1_000_000;
  let n = 0;
  const r = new Registro(() => reloj, () => ((n = (n * 9301 + 49297) % 233280) / 233280));
  /* Se avanza a pasitos como hace el bucle de verdad. De una sentada no vale:
     la sala trocea con un tope de 5 pasos por llamada para no espiralar si el
     proceso se atasca, así que un salto de un segundo se quedaría corto. */
  const PASO = 1 / 30;
  return {
    r,
    avanzar: (segs: number) => {
      for (let i = 0; i < Math.round(segs / PASO); i++) { reloj += PASO * 1000; r.avanzar(PASO); }
    },
    saltar: (segs: number) => { reloj += segs * 1000; },
  };
}

describe("códigos de sala", () => {
  it("son de 4 letras, sin vocales y sin repetirse", () => {
    const { r } = registro();
    const vistos = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = r.crear().codigo;
      expect(c).toMatch(/^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/);
      expect(vistos.has(c)).toBe(false);
      vistos.add(c);
    }
  });

  it("se busca sin importar mayúsculas, y lo que no existe no existe", () => {
    const { r } = registro();
    const s = r.crear();
    expect(r.buscar(s.codigo.toLowerCase())?.codigo).toBe(s.codigo);
    expect(r.buscar("ZZZZ")).toBeUndefined();
  });
});

describe("sentarse en una sala", () => {
  it("caben cinco y el sexto se queda fuera", () => {
    const { r } = registro();
    const s = r.crear();
    for (let i = 0; i < JUGADORES_MAX; i++)
      expect(s.sentar("u" + i, "J" + i, cliente().enviar)?.idx).toBe(i);
    expect(s.sentar("u9", "Tarde", cliente().enviar)).toBeNull();
  });

  it("cada uno recibe SU número de jugador", () => {
    const { r } = registro();
    const s = r.crear();
    expect(s.sentar("a", "Ana", cliente().enviar)!.idx).toBe(0);
    expect(s.sentar("b", "Beto", cliente().enviar)!.idx).toBe(1);
    expect(s.gente.map(g => g.apodo)).toEqual(["Ana", "Beto"]);
  });

  it("el mundo se monta una vez: sentarse no reinicia la partida de nadie", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    s.sentar("a", "Ana", cliente().enviar);
    s.estado.players[0].money = 12345;
    avanzar(1);
    s.sentar("b", "Beto", cliente().enviar);      // llega un amigo a mitad
    expect(s.estado.players[0].money).toBeGreaterThan(12000);
    expect(s.estado.t).toBeGreaterThan(0);
  });

  it("los cinco sitios existen desde el principio, con o sin gente", () => {
    const { r } = registro();
    const s = r.crear();
    expect(s.estado.players.length).toBe(JUGADORES_MAX);
    expect(s.estado.bases.filter(b => b.isPlayer).length).toBe(JUGADORES_MAX);
  });
});

describe("irse y volver", () => {
  it("al volver recuperas TU patio y tu dinero, no uno nuevo", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const a = cliente();
    const asiento = s.sentar("ana", "Ana", a.enviar)!;
    s.estado.players[asiento.idx].money = 7777;

    s.soltar("ana");
    expect(s.gente[0].conectado).toBe(false);
    avanzar(1);

    const b = cliente();
    const vuelta = s.sentar("ana", "Ana", b.enviar)!;
    expect(vuelta.idx).toBe(asiento.idx);
    expect(s.estado.players[vuelta.idx].money).toBeGreaterThan(7000);
    expect(s.gente[0].conectado).toBe(true);
  });

  it("quien se fue se queda quieto, no sigue caminando solo", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const asiento = s.sentar("ana", "Ana", cliente().enviar)!;
    asiento.entrada = { mover: { x: 1, y: 0 }, apunta: null };
    avanzar(1);
    const xCaminando = s.estado.players[0].x;
    expect(xCaminando).toBeGreaterThan(0);

    s.soltar("ana");
    avanzar(2);
    const xTrasFrenar = s.estado.players[0].x;
    avanzar(3);
    // Lo que importa no es que no se deslice —la inercia es la de siempre, la
    // misma que al soltar la tecla— sino que se DETENGA y no siga solo.
    expect(Math.abs(s.estado.players[0].x - xTrasFrenar)).toBeLessThan(1);
  });

  it("la sala aguanta un rato vacía y luego se recoge sola", () => {
    const { r, avanzar, saltar } = registro();
    const s = r.crear();
    s.sentar("ana", "Ana", cliente().enviar);
    s.soltar("ana");
    avanzar(1);
    expect(r.buscar(s.codigo)).toBeDefined();      // margen para volver
    saltar(90);
    avanzar(1);
    expect(r.buscar(s.codigo)).toBeUndefined();
  });
});

describe("lo que la sala cuenta", () => {
  it("manda los que se mueven a menudo y el mundo entero de vez en cuando", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const a = cliente();
    s.sentar("ana", "Ana", a.enviar);
    avanzar(1);
    /* Los 20 por segundo del protocolo, de verdad. El listón estaba en >=15 y
       por eso pasó desapercibido que salían 15 exactos: el reloj va a 30 Hz y
       el contador se ponía a cero en vez de restar, así que se tiraba el
       sobrante y salía un tick de cada dos vueltas. */
    expect(a.cuantos("tick")).toBeGreaterThanOrEqual(TICKS_POR_SEG - 1);
    expect(a.cuantos("mundo")).toBe(0);            // todavía no toca
    avanzar(3);
    expect(a.cuantos("mundo")).toBeGreaterThanOrEqual(1);
  });

  it("mantiene el ritmo de ticks aunque el reloj no case con el intervalo", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const a = cliente();
    s.sentar("ana", "Ana", a.enviar);
    avanzar(10);
    const porSegundo = a.cuantos("tick") / 10;
    expect(porSegundo).toBeGreaterThanOrEqual(TICKS_POR_SEG - 1);
    expect(porSegundo).toBeLessThanOrEqual(TICKS_POR_SEG + 1);
  });

  it("los dos ven exactamente lo mismo: hay una sola verdad", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const a = cliente(), b = cliente();
    s.sentar("ana", "Ana", a.enviar);
    s.sentar("beto", "Beto", b.enviar);
    avanzar(2);
    expect(JSON.stringify(a.ultimo("tick")!.movil))
      .toBe(JSON.stringify(b.ultimo("tick")!.movil));
  });

  it("los eventos del motor salen una vez y no se repiten", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const a = cliente();
    s.sentar("ana", "Ana", a.enviar);
    avanzar(4);                                     // da tiempo a que salga algo del portal
    const total = a.recibido.filter(m => m.t === "eventos").length;
    expect(total).toBeGreaterThan(0);
    expect(s.estado.eventos.length).toBe(0);        // se vacían al mandarlos
  });

  it("la foto de lo que se mueve es pequeña: 8 KB por frame no es opción", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    for (let i = 0; i < 5; i++) s.sentar("u" + i, "J" + i, cliente().enviar);
    avanzar(30);
    const foto = JSON.stringify(fotoMovil(s.estado)).length;
    const mundo = JSON.stringify(s.estado).length;
    expect(foto).toBeLessThan(mundo / 3);
    expect(foto).toBeLessThan(3000);
  });

  it("el que se desconecta deja de recibir, y los demás se enteran", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const a = cliente(), b = cliente();
    s.sentar("ana", "Ana", a.enviar);
    s.sentar("beto", "Beto", b.enviar);
    avanzar(1);
    const antesA = a.recibido.length;
    s.soltar("ana");
    avanzar(1);
    expect(a.recibido.length).toBe(antesA);         // ya no le llega nada
    expect(b.recibido.length).toBeGreaterThan(antesA - 1);
    expect(s.gente.find(g => g.apodo === "Ana")!.conectado).toBe(false);
  });
});

describe("acciones de un jugador", () => {
  it("cada uno mueve SOLO su muñeco", () => {
    const { r, avanzar } = registro();
    const s = r.crear();
    const a = s.sentar("ana", "Ana", cliente().enviar)!;
    s.sentar("beto", "Beto", cliente().enviar);
    const y0 = s.estado.players[1].y;
    a.entrada = { mover: { x: 0, y: 1 }, apunta: null };
    avanzar(1);
    expect(s.estado.players[0].y).toBeGreaterThan(0);
    expect(s.estado.players[1].y).toBe(y0);
  });

  it("cambiar de arma y usarla pasa por el motor", () => {
    const { r } = registro();
    const s = r.crear();
    const a = s.sentar("ana", "Ana", cliente().enviar)!;
    s.arma(a, 3);
    expect(s.estado.players[0].wsel).toBe(3);
    s.usar(a);                                       // sin munición: no revienta
    expect(s.estado.players[0].wsel).toBe(3);
  });
});

describe("el token manda", () => {
  const aj: AjustesJwt = { secret: "un-secreto-de-pruebas-de-mas-de-32-caracteres", issuer: "florin", audience: "florin" };
  const firmar = (claims: Record<string, unknown>, secreto = aj.secret) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("florin").setAudience("florin").setExpirationTime("1h")
      .sign(new TextEncoder().encode(secreto));

  it("un token bueno dice quién eres", async () => {
    const t = await firmar({ sub: "u1", name: "Migue" });
    expect(await quienEs(t, aj)).toEqual({ userId: "u1", apodo: "Migue" });
  });

  it("sin token, con basura, o firmado con otro secreto: nadie", async () => {
    expect(await quienEs(undefined, aj)).toBeNull();
    expect(await quienEs("no.es.un.token", aj)).toBeNull();
    expect(await quienEs(await firmar({ sub: "u1" }, "otro-secreto-distinto-de-32-caracteres!"), aj)).toBeNull();
  });

  it("un token caducado ya no vale", async () => {
    const t = await new SignJWT({ sub: "u1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("florin").setAudience("florin")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(aj.secret));
    expect(await quienEs(t, aj)).toBeNull();
  });
});
