/* Creación de la partida y consultas sobre el estado.
   Nada de esto dibuja ni suena: solo monta el mundo y responde preguntas. */

import type {
  Base, DesfileItem, Estado, Evento, Florin, Jugador, Laser, Pedestal, RefObjetivo,
  Rect, RefPed, Reglas, Sonido, Trasto, Variante,
} from "./tipos.js";
import {
  ESCENARIOS, FLORES, GOAL, LASER_CARGA, PATIOS_PRECIO, TIERS, TRASTOS_ESCENARIO,
  ANCHO_PISTA, CAJAS_EN_PISTA, ESCALA_MAPA, OCHO_A, OCHO_B, VARIANTES, dificultadDe, montarEscenario, VEHICULOS, WORLD_H, WORLD_W, esVehiculo, varMult,
} from "./datos.js";
import { azar, clamp, dist2, inRect, rnd } from "./util.js";

/* ---- eventos: el único canal hacia el mundo exterior ---- */
export const texto = (e: Estado, x: number, y: number, txt: string, color: string) =>
  e.eventos.push({ t: "texto", x, y, txt, color });
export const polvo = (e: Estado, x: number, y: number, color: string, n = 8) =>
  e.eventos.push({ t: "polvo", x, y, color, n });
export const sonar = (e: Estado, cual: Sonido) => e.eventos.push({ t: "sonido", cual });

/* ---- Florines ---- */
export const florAlAzar = (e: Estado) => (azar(e) * FLORES.length) | 0;

/** Único sitio donde nace un Florín: así nadie olvida darle su especie. */
export function nuevoFlorin(e: Estado, tier: number, extra?: Partial<Florin>): Florin {
  return { tier, variant: null, nombre: null, flor: florAlAzar(e), bob: 0, ...(extra || {}) };
}
/** Copia un Florín conservando lo que lo hace suyo: nombre, variante y especie. */
export function mismoFlorin<T extends object>(f: Florin, extra?: T): Florin & T {
  return {
    tier: f.tier, nombre: f.nombre || null, variant: f.variant || null,
    flor: f.flor | 0, bob: 0, ...(extra || {}),
  } as Florin & T;
}
export const florinIncome = (f: Florin) => TIERS[f.tier].income * varMult(f.variant);

/* ---- resolver ids ----
   El estado guarda ids y no objetos, para que se pueda serializar y mandar por
   la red. Estas funciones son el único sitio donde se traduce id → objeto. */
export const baseDe = (e: Estado, id: number): Base => e.bases[id];
export const jugadorDe = (e: Estado, idx: number | null): Jugador | null =>
  idx == null ? null : e.players[idx] || null;
export const pedDe = (e: Estado, r: RefPed | null): Pedestal | null =>
  r ? (e.bases[r.b]?.peds[r.i] || null) : null;
export const desfileDe = (e: Estado, id: number): DesfileItem | null =>
  e.portal.desfile.find(d => d.id === id) || null;
export const patiosDe = (e: Estado, p: Jugador): Base[] => p.patios.map(id => e.bases[id]);
/** El objetivo del aro: puede ser una vitrina o alguien del desfile. */
export function objetivoDe(e: Estado, r: RefObjetivo | null): Pedestal | DesfileItem | null {
  if (!r) return null;
  return r.tipo === "ped" ? pedDe(e, r) : desfileDe(e, r.id);
}
export const nuevoId = (e: Estado) => ++e.proximoId;
export const trastoDe = (e: Estado, id: number | null): Trasto | null =>
  id == null ? null : e.trastos.find(x => x.id === id) || null;

/* ---- el mar ----
   Solo la playa lo tiene. A pie te frena en la orilla; con tabla o flotador se
   entra, y el agua pasa a ser un carril rápido por el sur del mapa. */
export const hayMar = (e: Estado) => e.esc.mar != null;
export const enElMar = (e: Estado, y: number) => e.esc.mar != null && y > e.esc.mar;

/** ¿Está sobre el puente? Ahí se pasa a pie, aunque debajo haya agua. */
export const enElPuente = (e: Estado, x: number) => {
  const p = e.esc.puente;
  return !!p && x > p.x && x < p.x + p.w;
};

/** ¿Puede este jugador estar en esa `y`, o el agua se lo impide? */
export function puedeMojarse(e: Estado, p: Jugador): boolean {
  const v = trastoDe(e, p.montado);
  return !!(v && VEHICULOS[v.tipo]?.agua);
}

/* ---- consultas sobre bases y jugadores ---- */
export const freePed = (b: Base): Pedestal | null => b.peds.find(p => !p.florin) || null;
export const occupied = (b: Base): Pedestal[] => b.peds.filter(p => p.florin);

export function freePedDe(e: Estado, p: Jugador): Pedestal | null {
  for (const b of patiosDe(e, p)) { const ped = freePed(b); if (ped) return ped; }
  return null;
}
export function occupiedDe(e: Estado, p: Jugador): Pedestal[] {
  const out: Pedestal[] = [];
  for (const b of patiosDe(e, p)) for (const ped of b.peds) if (ped.florin) out.push(ped);
  return out;
}
export const esMiPatio = (p: Jugador, b: Base) => p.patios.indexOf(b.id) >= 0;

export function playerIncome(e: Estado, p: Jugador): number {
  return occupiedDe(e, p).reduce((s, q) => s + florinIncome(q.florin!), 0);
}

/* ---- la escalera de hitos ----

   El hito es la VITRINA, no el dinero. Nivel 1 es tenerla llena; a partir de
   ahí sube con la rareza del PEOR Florín que tengas puesto, así que subir de
   nivel es cambiar el más flojo por uno mejor. Nunca se infla: dieciocho
   huecos son dieciocho huecos con 3/s y con 29 000/s. */
export const HITOS_MAX = TIERS.length;   // llena (1) + una por rareza a partir de Común

/** Nivel de vitrina AHORA MISMO. 0 = ni siquiera está llena. */
export function nivelDeVitrina(e: Estado, p: Jugador): number {
  const patios = patiosDe(e, p);
  const huecos = patios.reduce((s, b) => s + b.peds.length, 0);
  if (!huecos) return 0;
  const puestos = occupiedDe(e, p);
  if (puestos.length < huecos) return 0;
  const peor = Math.min(...puestos.map(q => q.florin!.tier));
  return 1 + peor;
}

/** Cuántos huecos tiene y cuántos llenos: lo que enseña la barra del HUD. */
export function vitrinaDe(e: Estado, p: Jugador) {
  const huecos = patiosDe(e, p).reduce((s, b) => s + b.peds.length, 0);
  const llenos = occupiedDe(e, p).length;
  return { huecos, llenos, nivel: nivelDeVitrina(e, p) };
}

/** Cómo se llama el hito de ese nivel. */
export function nombreDeHito(nivel: number): string {
  if (nivel <= 0) return "Llena tu vitrina";
  if (nivel === 1) return "¡Vitrina llena!";
  const T = TIERS[Math.min(nivel - 1, TIERS.length - 1)];
  return "¡Vitrina de " + T.rar + "!";
}

/* ---- láseres ---- */
export function ponerLaser(b: Base): void {
  b.laser = {
    activo: 0, recarga: 0, carga: 0, warn: 0,
    x: b.rect.x + 46, y: b.rect.y + b.rect.h - 42, r: 34,
  };
}
export const laserActivo = (b: Base) => !!(b.laser && b.laser.activo > 0);

/** ¿Este punto está dentro de un patio cerrado a cal y canto? */
export function bloqueadoPorLaser(e: Estado, x: number, y: number, quien: Jugador | null): Base | null {
  for (const b of e.bases) {
    if (!laserActivo(b)) continue;
    if (quien && b.owner === quien.idx) continue;
    if (inRect(x, y, b.rect, 6)) return b;
  }
  return null;
}

/* ---- el circuito del desfile ----

   Los Florines salen del portal de arriba, bajan al centro, hacen un ocho
   echado —un ∞— rodeando la Armería por la izquierda y la Ruleta por la
   derecha, y se van por el portal de abajo. El cruce del ocho cae justo en el
   centro del mapa, entre los dos puestos.

   La curva es una lemniscata de Gerono, que es la forma más simple de un ocho
   tumbado: x = A·cos t, y = (B/2)·sin 2t. Pasa por el origen en t = π/2 y en
   t = 3π/2, que es exactamente el cruce que se quiere. */
/* Viven en `datos.ts`, que es donde está el tamaño del mundo del que salen: el
   repartidor de casas necesita saber por dónde pasa la pasarela para no
   plantarle una encima, y no puede importar de aquí sin morderse la cola. */
export { OCHO_A, OCHO_B } from "./datos.js";

export function centroDelMapa() {
  return { cx: WORLD_W / 2, cy: WORLD_H / 2 };
}

/** Un punto del ocho, con f de 0 a 1. Empieza y acaba en el cruce del centro.

   La lemniscata pasa por el cruce dos veces, en t = π/2 y en t = 3π/2, y las dos
   son el mismo punto del mapa. Así que arrancar en una o en otra sale por un
   lóbulo o por el otro, y el signo de `giro` decide en qué sentido se recorre:
   cuatro caminos distintos, los cuatro dando la vuelta entera y volviendo al
   cruce en f = 1. Eso es lo que se elige al entrar. */
export function puntoDelOcho(f: number, lado: 0 | 1 = 0, giro: 1 | -1 = 1) {
  const { cx, cy } = centroDelMapa();
  const t = Math.PI / 2 + lado * Math.PI + giro * f * Math.PI * 2;
  return { x: cx + OCHO_A * Math.cos(t), y: cy + (OCHO_B / 2) * Math.sin(2 * t) };
}

/* Lo que se lleva cada tramo del recorrido. La vuelta al ocho es lo que se
   quiere mirar, así que se lleva la mayor parte del tiempo. */
export const PORTAL_BAJADA = 0.16, PORTAL_OCHO = 0.68;

/** Dónde está un Florín del desfile según lo avanzado de su recorrido (0 a 1). */
export function puntoDelDesfile(e: Estado, k: number, lado: 0 | 1 = 0, giro: 1 | -1 = 1) {
  const P = e.portal, S = P.salida, { cx, cy } = centroDelMapa();
  if (k < PORTAL_BAJADA) {                       // bajada desde el portal de arriba
    const f = k / PORTAL_BAJADA;
    return { x: P.x + (cx - P.x) * f, y: P.y + (cy - P.y) * f };
  }
  if (k < PORTAL_BAJADA + PORTAL_OCHO) {         // el ocho
    return puntoDelOcho((k - PORTAL_BAJADA) / PORTAL_OCHO, lado, giro);
  }
  const f = (k - PORTAL_BAJADA - PORTAL_OCHO) / (1 - PORTAL_BAJADA - PORTAL_OCHO);
  return { x: cx + (S.x - cx) * f, y: cy + (S.y - cy) * f };   // salida por abajo
}

/* Se mantiene el nombre viejo porque el cliente lo usa para no sembrar decorado
   encima de la alfombra del desfile: ahora devuelve la caja que ocupa el ocho. */
export function orbitaDelCentro(e: Estado) {
  const { cx, cy } = centroDelMapa();
  return { cx, cy, rx: OCHO_A, ry: OCHO_B / 2 };
}

/* ---- reparto de trastos ----
   El motor no sabe de canteros ni de canchas (eso es decorado del cliente), así
   que solo esquiva lo que sí es suyo: las bases, la columna del centro y el
   agua. Si un adorno del cliente se solapa con una bici, mala suerte: la bici
   se dibuja encima y se sigue pudiendo montar. */
function sitioLibreTrasto(e: Estado, x: number, y: number, m: number): boolean {
  const choca = (r: { x: number; y: number; w: number; h: number }) =>
    x - m < r.x + r.w && x + m > r.x && y - m < r.y + r.h && y + m > r.y;
  for (const b of e.bases) if (choca({ x: b.rect.x - 20, y: b.rect.y - 20, w: b.rect.w + 40, h: b.rect.h + 40 })) return false;
  for (const a of e.armerias)
    if (choca({ x: a.x - 30, y: a.y - 30, w: a.w + 60, h: a.h + 60 })) return false;
  for (const r of e.ruletas)
    if (choca({ x: r.x - r.r - 30, y: r.y - r.r - 30, w: (r.r + 30) * 2, h: (r.r + 30) * 2 })) return false;
  for (const P of [e.portal, e.portal.salida])
    if (choca({ x: P.x - 80, y: P.y - 80, w: 160, h: 160 })) return false;
  for (const otro of e.trastos) if (dist2(x, y, otro.x, otro.y) < 60 * 60) return false;
  /* La cochera entera, no solo sus plazas: en la Edad Media caía un dragón
     salvaje en el hueco del borde y parecía que el juego te regalaba uno. */
  if (e.cochera && choca({ x: e.cochera.x - 10, y: e.cochera.y - 10,
                           w: e.cochera.w + 20, h: e.cochera.h + 20 })) return false;
  return true;
}

function sembrarTrastos(e: Estado): void {
  const receta = TRASTOS_ESCENARIO[e.esc.id] || [];
  for (const { tipo, n: base } of receta) {
    /* Las recetas se escribieron para el mapa chico. Se reparte la MISMA
       densidad, no la misma cantidad: con las cuatro bicis de siempre, un mapa
       casi el doble de grande se cruza andando. */
    const n = Math.max(1, Math.round(base * ESCALA_MAPA));
    const aguaOnly = VEHICULOS[tipo]?.agua;
    for (let k = 0; k < n; k++) {
      for (let intento = 0; intento < 40; intento++) {
        const x = rnd(e, 90, WORLD_W - 90);
        /* Lo que flota nace en la orilla, no mar adentro: si naciera dentro del
           agua sería inalcanzable, porque a pie el tope de la orilla te frena
           antes de llegar. */
        const y = e.esc.mar != null
          ? (aguaOnly ? rnd(e, e.esc.mar - 70, e.esc.mar - 10) : rnd(e, 90, e.esc.mar - 110))
          : rnd(e, 90, WORLD_H - 90);
        if (!sitioLibreTrasto(e, x, y, 34)) continue;
        e.trastos.push({
          id: nuevoId(e), tipo: tipo as Trasto["tipo"], x, y, vx: 0, vy: 0,
          montadoPor: null, pateadoPor: null,
          giro: rnd(e, -0.6, 0.6), variante: (azar(e) * 5) | 0,
        });
        break;
      }
    }
  }
}

/* ---- la cochera ----
   Lo que compras en el Garaje es tuyo para siempre, pero hasta ahora solo se
   notaba en carrera, eligiéndolo del menú. En aventura seguías yendo a pie
   mientras el ovni de 300 000 dormía en un `localStorage`. Ahora está aparcado
   al lado de tu patio: sales de casa y lo montas.

   Una plaza por vehículo, en rejilla de tres en fondo. */
const PLAZA = 96;

/** Las plazas puestas en `cols` columnas: cuánto ocupa eso. */
export function medirCochera(n: number, cols = Math.min(3, Math.max(1, n))) {
  const filas = Math.ceil(n / cols);
  return { cols, filas, w: cols * PLAZA + 24, h: filas * PLAZA + 34 };
}

/** Cuántas columnas tiene una cochera ya montada, leyéndolo de su ancho. */
export const colsDeCochera = (c: Rect) => Math.max(1, Math.round((c.w - 24) / PLAZA));

/** Dónde caben las plazas: pegada al patio, por el lado que tenga sitio.
    Si en ancho no cabe, se prueba más estrecha y más alta: en un patio
    encajonado entre otros dos, tres en fondo no entran pero dos sí. */
function ponerCochera(e: Estado, patio: Base, n: number): Rect | null {
  if (n <= 0) return null;
  const r = patio.rect, HUECO = 26;
  /* El agua no vale ni para lo que flota: si la cochera naciera en el mar,
     los especiales de tierra —la grúa, el monster— quedarían inalcanzables. */
  const abajo = e.esc.mar != null ? e.esc.mar - 40 : WORLD_H - 40;
  const chocaOtra = (x: number, y: number, w: number, h: number) =>
    e.bases.some(b => b !== patio &&
      x < b.rect.x + b.rect.w + 30 && x + w > b.rect.x - 30 &&
      y < b.rect.y + b.rect.h + 30 && y + h > b.rect.y - 30) ||
    e.armerias.some(a => x < a.x + a.w + 20 && x + w > a.x - 20 &&
                         y < a.y + a.h + 20 && y + h > a.y - 20) ||
    e.ruletas.some(c => x < c.x + c.r + 20 && x + w > c.x - c.r - 20 &&
                        y < c.y + c.r + 20 && y + h > c.y - c.r - 20) ||
    (x < e.fusion.x + e.fusion.w + 20 && x + w > e.fusion.x - 20 &&
     y < e.fusion.y + e.fusion.h + 20 && y + h > e.fusion.y - 20);
  const cabe = (x: number, y: number, w: number, h: number) =>
    x >= 40 && y >= 60 && x + w <= WORLD_W - 40 && y + h <= abajo &&
    !chocaOtra(x, y, w, h);

  /** Lo lejos que queda del patio, por el lado más corto. */
  const lejania = (x: number, y: number, w: number, h: number) =>
    Math.max(r.x - (x + w), x - (r.x + r.w), r.y - (y + h), y - (r.y + r.h));

  /* Formas posibles, de la que mejor queda a la que peor: tres en fondo es la
     de referencia y de ahí se abre. Las torres —más de tres filas— van al
     final: pegada al patio pero de nueve plazas de alto se ve peor que a un
     palmo y cuadrada. Que haya formas MUY anchas importa: con un vecino a la
     derecha y una casa arriba, la única franja libre es baja y larga. */
  const formas = Array.from({ length: Math.min(n, 9) }, (_, k) => k + 1)
    .sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  const esTorre = (cols: number) => Math.ceil(n / cols) > 3;

  /* Pegada a un lado del patio, deslizándola a lo largo de ese lado y, si no
     hay manera, apartándola. Correrla es mucho mejor que alejarla: en La Italia
     la Fusionadora cae justo a la derecha del patio y basta con subir la
     cochera un palmo para que entre. */
  const porLosLados = (juego: number[]): Rect | null => {
    for (const d of [0, 70, 150, 250, 360]) {
      for (const cols of juego) {
        const { w, h } = medirCochera(n, cols);
        const corrida = (a: number, largo: number, propio: number) =>
          [0, 0.5, -0.5, 1, -1].map(f => a + (largo - propio) / 2 + f * (largo / 2 + propio / 2));
        const aY = corrida(r.y, r.h, h), aX = corrida(r.x, r.w, w);
        const sitios: [number, number][] = [
          ...aY.map(y => [r.x + r.w + HUECO + d, y] as [number, number]),
          ...aY.map(y => [r.x - w - HUECO - d, y] as [number, number]),
          ...aX.map(x => [x, r.y + r.h + HUECO + d] as [number, number]),
          ...aX.map(x => [x, r.y - h - HUECO - d] as [number, number]),
        ];
        const bueno = sitios.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number])
                            .find(([x, y]) => cabe(x, y, w, h));
        if (bueno) return { x: bueno[0], y: bueno[1], w, h };
      }
    }
    return null;
  };

  /* Ningún lado del patio sirve: se barre la manzana entera y se coge el hueco
     libre más cercano. Una cochera a un par de pasos de la puerta sigue siendo
     la tuya; una encima del patio del vecino no la quiere nadie. */
  const porLaManzana = (juego: number[]): Rect | null => {
    let mejor: Rect | null = null, mejorD = Infinity;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    juego.forEach((cols, orden) => {
      const { w, h } = medirCochera(n, cols);
      for (let dy = -700; dy <= 700; dy += 40) {
        for (let dx = -700; dx <= 700; dx += 40) {
          const x = Math.round(cx + dx - w / 2), y = Math.round(cy + dy - h / 2);
          if (!cabe(x, y, w, h)) continue;
          // lo cerca que queda, más un pellizco por usar una forma menos bonita
          const d = lejania(x, y, w, h) + orden * 20;
          if (d < mejorD){ mejor = { x, y, w, h }; mejorD = d; }
        }
      }
    });
    return mejor;
  };

  /* Se agotan las formas decentes por completo —al lado y por la manzana—
     antes de admitir una torre. */
  const decentes = formas.filter(c => !esTorre(c));
  for (const juego of [decentes, formas]) {
    if (!juego.length) continue;
    const sitio = porLosLados(juego) || porLaManzana(juego);
    if (sitio) return sitio;
  }

  /* Ni eso: se pone igualmente al lado, metida dentro del mundo. Solapar con
     el vecino es feo; quedarse sin los vehículos que ya has pagado, peor. */
  const { w, h } = medirCochera(n, 1);
  return {
    x: clamp(r.x + r.w + HUECO, 40, WORLD_W - 40 - w),
    y: clamp(Math.round(r.y + (r.h - h) / 2), 60, Math.round(abajo - h)),
    w, h,
  };
}

/** La plaza número `k` de una cochera de `cols` columnas. */
const plazaDe = (c: Rect, cols: number, k: number) => ({
  x: c.x + 12 + (k % cols) * PLAZA + PLAZA / 2,
  y: c.y + 22 + ((k / cols) | 0) * PLAZA + PLAZA / 2,
});

/** Aparca en la cochera lo que el jugador tenga comprado. */
function aparcarEnLaCochera(e: Estado, tipos: string[]): void {
  const patio = e.bases.find(b => b.isPlayer);
  if (!patio) return;
  const mios = tipos.filter(t => VEHICULOS[t]);
  e.cochera = ponerCochera(e, patio, mios.length);
  if (!e.cochera) return;
  const cols = colsDeCochera(e.cochera);
  mios.forEach((tipo, k) => {
    const { x, y } = plazaDe(e.cochera!, cols, k);
    e.trastos.push({
      id: nuevoId(e), tipo: tipo as Trasto["tipo"], x, y,
      vx: 0, vy: 0, montadoPor: null, pateadoPor: null,
      giro: 0, variante: 0,          // aparcados rectos, que es lo que hace que parezca una cochera
    });
  });
}

/** Lo que está aparcado ahora mismo, en el orden de las plazas. */
const aparcados = (e: Estado): Trasto[] =>
  e.cochera
    ? e.trastos.filter(v => v.montadoPor == null && inRect(v.x, v.y, e.cochera!, 0))
    : [];

/** Uno recién comprado en el Garaje: entra en la cochera sin esperar a la
    siguiente partida. Si no cabe, la cochera crece y se recolocan las plazas
    —los que estén aparcados están en casa, moverlos no le estorba a nadie. */
export function aparcarNuevo(e: Estado, tipo: string): boolean {
  if (e.reglas.modo !== "aventura" || !VEHICULOS[tipo]) return false;
  const patio = e.bases.find(b => b.isPlayer);
  if (!patio) return false;
  const ya = aparcados(e);
  if (ya.some(v => v.tipo === tipo)) return false;     // ya lo tienes en casa
  const nuevo: Trasto = {
    id: nuevoId(e), tipo: tipo as Trasto["tipo"], x: 0, y: 0,
    vx: 0, vy: 0, montadoPor: null, pateadoPor: null, giro: 0, variante: 0,
  };
  const todos = [...ya, nuevo];
  e.cochera = ponerCochera(e, patio, todos.length);
  if (!e.cochera) return false;
  const cols = colsDeCochera(e.cochera);
  todos.forEach((v, k) => { const { x, y } = plazaDe(e.cochera!, cols, k); v.x = x; v.y = y; });
  e.trastos.push(nuevo);
  return true;
}

/* ---- construcción del mundo ---- */
function makeBase(id: number, name: string, x: number, y: number,
                  isPlayer: boolean, color: string, who?: string | null): Base {
  const rect = { x, y, w: 380, h: 330 };
  const peds: Pedestal[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
    peds.push({ x: rect.x + 68 + c * 122, y: rect.y + 108 + r * 138, florin: null, pop: 0 });
  return {
    id, name, rect, peds, isPlayer, color, who: who || null,
    refill: 0, guard: null, locked: false, price: 0, warn: 0, laser: null, owner: null,
  };
}

function mkJugador(idx: number, base: Base, shirt: string, ammoIds: string[]): Jugador {
  const ammo: Record<string, number> = {};
  for (const id of ammoIds) ammo[id] = 0;
  return {
    idx, baseId: base.id, patios: [base.id], shirt,
    x: base.rect.x + base.rect.w / 2, y: base.rect.y + base.rect.h / 2,
    vx: 0, vy: 0, face: 1, walk: 0, dirx: 1, diry: 0,
    carry: null, stun: 0, boost: 0, invis: 0, escudo: 0, inmune: 0,
    money: 260, ammo, wsel: 0, cd: 0, inShop: false, inRuleta: false, inFusion: false, fullWarn: 0,
    chancla: { state: "held", x: 0, y: 0, vx: 0, vy: 0, spin: 0, travel: 0 },
    montado: null, trastoUsado: null,
    grab: { ped: null, t: 0 },
    apunta: { on: false, wx: 0, wy: 0 },
    stats: { steals: 0, hits: 0, lost: 0, froze: 0 },
    hitoN: 0, fiesta: 0,
  };
}

const clampEntero = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, Math.round(v) || a));

/* ---- los sitios de los jugadores ----
   El mapa no cambia: hay un patio y cuatro casas de vecinos. El primer jugador
   toma el patio; **cada jugador de más ocupa una casa vecina, y el bot que
   vivía ahí deja de existir**. Así una sala llena son 5 humanos y ningún bot,
   y jugar solo son 4 bots, sin mover una piedra del escenario.

   Los Marcianos van primeros a propósito: es el sitio que ya usaba el J2 del
   duelo de sofá, así que dos jugadores siguen empezando donde empezaban. */
const SLOTS: { casa: number | null; shirt: string }[] = [
  { casa: null, shirt: "#3DDC97" },
  { casa: 3,    shirt: "#FFB020" },
  { casa: 0,    shirt: "#FF5C86" },
  { casa: 1,    shirt: "#37D6E0" },
  { casa: 2,    shirt: "#B57BE0" },
];
export const JUGADORES_MAX = SLOTS.length;

export interface OpcionesPartida {
  /** cuántos humanos, de 1 a 5. Cada uno de más reemplaza a un bot. */
  jugadores?: number;
  escenario?: string;
  semilla?: number;
  armas: string[];
  /** Lo que no se diga, se rellena con lo de siempre (ver `reglasPara`). */
  reglas?: Partial<Reglas>;
  /** Los especiales comprados en el Garaje. Vienen del cliente porque son del
      jugador y no de la partida: se aparcan en la cochera de tu patio. */
  garaje?: string[];
}

/** Los valores por defecto dependen de cuántos sean: solo o acompañado. */
export function reglasPara(jugadores: number): Reglas {
  const solo = jugadores <= 1;
  return {
    // Los dos patios comprables están pegados al del primer jugador: con
    // compañía le darían una ventaja de salida que nadie más puede igualar.
    patiosExtra: solo,
    todasLasArmas: true,
    puestos: true,
    modo: "aventura",
    vecinos: true,
    dificultad: "normal",
  };
}

/** Dónde van las Armerías y las Ruletas de un mapa, esquivando las bases.

    Vive aparte de `crearPartida` porque también hace falta al REVIVIR una
    partida guardada: las de antes del mapa grande traen un solo puesto de cada
    y en el centro de un mundo que ya no existe, así que el desfile —que sí pasa
    por el centro nuevo— les pasaba a 400 px de la Ruleta. */
export function colocarPuestos(bases: Base[]) {
  const { cx, cy } = centroDelMapa();
  const chocaBase = (x: number, y: number, w: number, h: number) =>
    bases.some(b => x < b.rect.x + b.rect.w + 40 && x + w > b.rect.x - 40 &&
                    y < b.rect.y + b.rect.h + 40 && y + h > b.rect.y - 40);
  /* El de fuera está para que desde una esquina haya uno a mano sin cruzar el
     mapa entero, así que se le pide LEJOS del central. Puesto a dedo en una
     diagonal caía dentro de una casa en cuanto el reparto del escenario era
     otro (en el colegio, encima de Doña Chancla). */
  const LEJOS = WORLD_W * 0.34;
  /* Primero libre y lejos; si no hay, libre aunque quede cerca. Estar LIBRE
     manda sobre estar lejos: un puesto dentro de una casa tapa el botón de
     entrar, que es la única forma de usarlo, mientras que uno algo cerca del
     otro solo es menos cómodo. */
  const buscar = <T>(w: number, h: number, centro: { x: number; y: number },
                     orden: [number, number][], hacer: (x: number, y: number) => T): T => {
    const sitios = orden.map(([fx, fy]) =>
      [Math.round(WORLD_W * fx - w / 2), Math.round(WORLD_H * fy - h / 2)] as [number, number]);
    const libres = sitios.filter(([x, y]) => !chocaBase(x, y, w, h));
    const lejos = (p: [number, number]) =>
      Math.hypot(p[0] + w / 2 - centro.x, p[1] + h / 2 - centro.y);
    const elegido = libres.find(p => lejos(p) >= LEJOS)
      ?? [...libres].sort((a, b) => lejos(b) - lejos(a))[0]
      ?? [...sitios].sort((a, b) => lejos(b) - lejos(a))[0];
    return hacer(elegido[0], elegido[1]);
  };
  /* Un anillo alrededor del centro, no cuatro esquinas: con solo las
     diagonales, en el colegio ninguna quedaba a la vez libre y lejos, y en El
     Desierto —once bases— hacía falta un segundo radio. Orden fijo, así que el
     sitio elegido es el mismo en cada partida. */
  const anillo = (desde: number): [number, number][] =>
    [0.30, 0.25, 0.35].flatMap(rr =>
      Array.from({ length: 12 }, (_, k) => {
        const a = desde + k * (Math.PI / 6);
        return [0.5 + Math.cos(a) * rr * 0.9, 0.5 + Math.sin(a) * rr] as [number, number];
      }));
  const arm0 = { x: cx - 450, y: cy - 75, w: 300, h: 150 };
  const rul0 = { x: cx + 300, y: cy, r: 92 };
  // la Armería de fuera empieza a buscar por abajo-derecha y la Ruleta por arriba-izquierda
  /* La Fusionadora busca sitio como los demás. Puesta a dedo encima del centro
     caía justo sobre la poza de La Catarata: el sitio bueno depende del mapa. */
  const fusion = buscar(260, 140, { x: cx, y: cy },
                        anillo(Math.PI * 0.5), (x, y) => ({ x, y, w: 260, h: 140 }));
  return {
    armerias: [arm0, buscar(300, 150, { x: arm0.x + 150, y: arm0.y + 75 },
                            anillo(Math.PI / 4), (x, y) => ({ x, y, w: 300, h: 150 }))],
    ruletas: [rul0, buscar(184, 184, rul0,
                           anillo(-Math.PI * 0.75), (x, y) => ({ x: x + 92, y: y + 92, r: 92 }))],
    fusion,
  };
}

export function crearPartida(op: OpcionesPartida): Estado {
  const n = clampEntero(op.jugadores ?? 1, 1, JUGADORES_MAX);
  const reglas: Reglas = { ...reglasPara(n), ...(op.reglas || {}) };
  /* Montar el escenario es lo PRIMERO: fija el tamaño del mundo y pasa sus
     fracciones a píxeles. Todo lo que viene después —las bases, los trastos,
     la pasarela, la pista— se coloca con ese mundo ya puesto. */
  const esc = montarEscenario(ESCENARIOS.find(x => x.id === op.escenario) || ESCENARIOS[0]);
  const semilla = op.semilla ?? 1;
  const C = esc.casas, P = esc.patios;

  /* Las bases se montan siempre igual y en el mismo orden: `baseDe` indexa por
     id, así que estos índices son un contrato y no se pueden reordenar. */
  /* Los cuatro de siempre van primero y en este orden: los índices son el
     contrato de `baseDe` y los `SLOTS` de los jugadores apuntan a ellos. Las
     dos casas del final son las que trajo el mapa grande, y son siempre de
     vecino: `JUGADORES_MAX` sigue en 5. */
  const VECINOS: [string, string, string][] = [
    ["Casa de Mayo", "#FFD84D", "mayo"],
    ["Doña Chancla", "#FF9EC4", "sobri"],
    ["Casa de la Prima Yuli", "#FF5C86", "yuli"],
    ["Nave de los Marcianos", "#8B6BEE", "marcia"],
    ["Quiosco de Doña Meche", "#5CE1EA", "meche"],
    ["Casa del Chato", "#9BD97F", "chato"],
  ];
  const bases: Base[] = [
    makeBase(0, n > 1 ? "Patio del J1" : "Tu patio", P[0][0], P[0][1], true, "#3DDC97"),
  ];
  VECINOS.forEach(([nombre, color, quien], k) => {
    if (!C[k]) return;
    bases.push(makeBase(k + 1, nombre, C[k][0], C[k][1], false, color, quien));
  });

  if (reglas.patiosExtra) {
    PATIOS_PRECIO.forEach((precio, k) => {
      if (!P[k + 1]) return;
      const b = makeBase(bases.length, "Patio " + (k + 2), P[k + 1][0], P[k + 1][1], true, "#3DDC97");
      b.locked = true; b.price = precio;
      bases.push(b);
    });
  }

  /* Cada jugador de más se queda con su casa: deja de ser de un vecino (`who`
     a null, que es lo que mira spawnThief para saber de dónde salen ladrones) y
     pasa a ser un patio con su color. */
  const jugadores: Jugador[] = [];
  for (let i = 0; i < n; i++) {
    const slot = SLOTS[i];
    const base = slot.casa == null ? bases[0] : bases[slot.casa + 1];
    if (slot.casa != null) {
      base.name = "Patio del J" + (i + 1);
      base.isPlayer = true;
      base.who = null;
      base.color = slot.shirt;
    }
    jugadores.push(mkJugador(i, base, slot.shirt, op.armas));
  }
  for (const p of jugadores) for (const id of p.patios) { bases[id].owner = p.idx; ponerLaser(bases[id]); }

  /* Los dos puestos van al centro, uno a cada lado del cruce del ocho: la
     Armería a la izquierda y la Ruleta a la derecha. El desfile les da la
     vuelta a los dos, así que el centro del mapa es de verdad el centro. */
  const { cx, cy } = centroDelMapa();
  const { armerias, ruletas, fusion } = colocarPuestos(bases);
  /* El portal de salida se aparta de la orilla. Con el margen fijo de siempre
     medido desde abajo acababa dentro del agua en cuanto el mapa creció —el mar
     va en fracción del alto y el margen no—, y los Florines del desfile salían
     nadando mar adentro, donde no los alcanza nadie. */
  const finca = esc.mar != null ? esc.mar - 90 : WORLD_H - 240;
  const portal = {
    x: cx, y: 240, r: 34, timer: 2.5, desfile: [],
    salida: { x: cx, y: Math.min(WORLD_H - 240, finca), r: 34 },
  };

  const e: Estado = {
    t: 0, reglas, esc, semilla, rngEstado: semilla | 0,
    bases, players: jugadores, armerias, ruletas, fusion, cochera: null, portal,
    bolts: [], blasts: [], cascaras: [], trastos: [], perros: [], slowmo: 0,
    thieves: [], ground: [], thiefTimer: 14,
    girando: null, ultimoPremio: null, cajas: [],
    alarma: null,
    over: false, winnerIdx: null, proximoId: 0,
    eventos: [],
  };

  /* Florines iniciales de los vecinos y sus abuelas. Va después de crear el
     estado porque necesita el RNG, que vive en él. */
  for (const b of bases) {
    b.refill = rnd(e, 3, 7);
    if (b.isPlayer) continue;
    // en carrera las casas son decorado: ni Florines que robar ni abuela que huir
    if (!reglas.vecinos) continue;
    const n = 2 + ((azar(e) * 2) | 0);
    for (let i = 0; i < n; i++)
      b.peds[i].florin = nuevoFlorin(e, (azar(e) * 2) | 0, { bob: rnd(e, 0, 6.28) });
    b.guard = {
      baseId: b.id,
      x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2,
      vx: 0, vy: 0, stun: 0, frozen: 0, abducido: 0,
      wp: 0, face: 1, walk: 0, alert: 0, kx: 0, ky: 0,
      isGuard: true, carry: null,
    };
  }

  /* Antes de sembrar: los que ya están aparcados cuentan como ocupados, así
     que no aparece una bici tirada encima del trineo de Santa. Solo en
     aventura: en carrera sales de la parrilla y el especial se elige en el
     menú, y en el duelo de sofá darle un ovni a uno de los dos no es un duelo. */
  if (reglas.modo === "aventura") aparcarEnLaCochera(e, op.garaje || []);
  sembrarTrastos(e);       // después de las bases: necesita saber dónde no caben
  if (reglas.modo === "carrera") aLaLineaDeSalida(e);
  return e;
}

/* ---- la parrilla ----
   Una carrera empieza distinta: todos en la línea, montados y mirando hacia el
   primer punto de paso. Si cada uno saliera de su patio ganaría el que lo
   tuviera más cerca, antes de empezar. */
function aLaLineaDeSalida(e: Estado): void {
  const c = e.esc.circuito;
  if (!c || !c.length) return;

  const [mx, my] = c[0];
  const [sx, sy] = c[1] || c[0];
  const ang = Math.atan2(sy - my, sx - mx);
  /* En fila de a dos y hacia atrás, como una parrilla: perpendicular al rumbo
     para el hueco de al lado, y en contra para la fila siguiente. */
  const lx = Math.cos(ang + Math.PI / 2), ly = Math.sin(ang + Math.PI / 2);
  const ax = -Math.cos(ang), ay = -Math.sin(ang);

  /* Las cajas: repartidas por la pista, siempre en el mismo sitio y en el eje
     del asfalto, para que se pueda pasar por ellas a propósito y no de rebote. */
  e.cajas = [];
  /* Cuántas hay lo dice la dificultad: de sobra en fácil (más ayudas y más
     caos a tu favor) y pocas en difícil (que gane quien conduce mejor, no quien
     tuvo suerte con la caja). */
  const cuantas = dificultadDe(e.reglas).cajas;
  for (let k = 0; k < cuantas; k++) {
    const f = ((k + 0.5) / cuantas) * c.length;
    const i = Math.floor(f) % c.length, t = f - Math.floor(f);
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    e.cajas.push({
      id: nuevoId(e),
      x: Math.round(ax + (bx - ax) * t),
      y: Math.round(ay + (by - ay) * t),
      listo: 0,
    });
  }

  e.players.forEach((p, i) => {
    const fila = i >> 1, lado = i % 2 ? 1 : -1;
    p.x = clamp(mx + lx * lado * 58 + ax * fila * 90, 40, WORLD_W - 40);
    p.y = clamp(my + ly * lado * 58 + ay * fila * 90, 40, WORLD_H - 40);
    p.vx = 0; p.vy = 0;
    p.face = Math.cos(ang) >= 0 ? 1 : -1;
    p.carrera = { vuelta: 0, hito: 1, fin: -1 };
    p.item = { que: null, girando: 0 };

    darleVehiculo(e, p, p.vehiculo || vehiculoDelSitio(e), i);
  });
}

/* ---- los topes de la pista ----
   Una carrera en la que puedes cortar campo a través no es una carrera: se va
   en línea recta de punto a punto y el trazado da igual. Así que fuera del
   asfalto hay tope y no se pasa.

   El corredor se empuja al borde del corredor más cercano en vez de frenarlo
   en seco: chocar contra un muro y quedarte pegado es lo más frustrante que
   hay, y rozándolo se sigue avanzando. */
function alSegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const largo = dx * dx + dy * dy;
  const t = largo ? clamp(((px - ax) * dx + (py - ay) * dy) / largo, 0, 1) : 0;
  const cx = ax + dx * t, cy = ay + dy * t;
  return { d2: (px - cx) ** 2 + (py - cy) ** 2, cx, cy };
}

/** Devuelve el punto de la pista más cercano y a qué distancia está. */
export function enLaPista(e: Estado, x: number, y: number) {
  const c = e.esc.circuito!;
  let mejor = { d2: Infinity, cx: x, cy: y };
  for (let i = 0; i < c.length; i++) {
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    const q = alSegmento(x, y, ax, ay, bx, by);
    if (q.d2 < mejor.d2) mejor = q;
  }
  return mejor;
}

/** ¿Está sobre el asfalto? Sin decidir nada: solo mirar. */
export function sobreLaPista(e: Estado, p: { x: number; y: number }): boolean {
  if (e.reglas.modo !== "carrera" || !e.esc.circuito?.length) return true;
  const borde = ANCHO_PISTA / 2;
  return enLaPista(e, p.x, p.y).d2 <= borde * borde;
}

/** Empuja a quien se salga de la pista. Solo en carrera, solo si hay pista y
    solo si la dificultad tiene topes: en fácil no hay muro y de la pista se
    sale — lo que te disuade de cortar por el césped es que ahí vas más lento. */
export function dentroDeLaPista(e: Estado, p: { x: number; y: number; vx: number; vy: number }): boolean {
  if (e.reglas.modo !== "carrera" || !e.esc.circuito?.length) return true;
  if (!dificultadDe(e.reglas).topes) return true;
  const borde = ANCHO_PISTA / 2;
  const q = enLaPista(e, p.x, p.y);
  if (q.d2 <= borde * borde) return true;
  const d = Math.sqrt(q.d2) || 1;
  p.x = q.cx + (p.x - q.cx) / d * borde;
  p.y = q.cy + (p.y - q.cy) / d * borde;
  /* Se le quita la velocidad que iba HACIA fuera y se le deja la que va a lo
     largo: así rozar el tope frena un poco pero no te clava. */
  const nx = (p.x - q.cx) / borde, ny = (p.y - q.cy) / borde;
  const haciaFuera = p.vx * nx + p.vy * ny;
  if (haciaFuera > 0) { p.vx -= nx * haciaFuera; p.vy -= ny * haciaFuera; }
  return false;
}

/** Con qué se corre aquí si nadie eligió: lo primero montable del escenario,
    pero nunca uno de agua.

    Los circuitos van todos por tierra —los de costa se recortan por encima de
    la orilla—, y un vehículo de agua fuera del agua no te lleva, lo llevas tú:
    penaliza a 0,9×, más lento que ir a pie. En La Playa salía por defecto la
    tabla de surf y en El Amazonas la balsa, así que las dos carreras se corrían
    con el trasto a cuestas: 118 s y 109 s frente a los 48-87 s del resto, con
    la misma vuelta que Machu Picchu, que tarda 74 s. */
export const vehiculoDelSitio = (e: Estado): string => {
  const hay = (TRASTOS_ESCENARIO[e.esc.id] || []).map(t => t.tipo).filter(esVehiculo);
  return hay.find(t => !VEHICULOS[t]?.agua) || "bici";
};

/** Le pone (o le cambia) el vehículo a alguien, ahí donde esté.

    Se crea aparte de los que hay sueltos por el mapa: en una carrera nadie
    empieza a pie, y el que elige ovni tiene que salir en ovni aunque en ese
    escenario no haya ninguno tirado. */
export function darleVehiculo(e: Estado, p: Jugador, tipo: string, variante = 0): void {
  if (!VEHICULOS[tipo]) return;
  const viejo = e.trastos.findIndex(v => v.id === p.montado);
  if (viejo >= 0) e.trastos.splice(viejo, 1);
  const v: Trasto = {
    id: nuevoId(e), tipo: tipo as Trasto["tipo"], x: p.x, y: p.y, vx: 0, vy: 0,
    montadoPor: p.idx, pateadoPor: null, giro: 0, variante,
  };
  e.trastos.push(v);
  p.montado = v.id;
  p.vehiculo = tipo;
}

/* Reexportados por comodidad de quien consume el motor */
export { VARIANTES, TIERS, FLORES, GOAL, LASER_CARGA, VEHICULOS, WORLD_W, WORLD_H, dist2 };
export type { Variante, Evento };
