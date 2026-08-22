/* Creación de la partida y consultas sobre el estado.
   Nada de esto dibuja ni suena: solo monta el mundo y responde preguntas. */

import type {
  Base, Billar, DesfileItem, Estado, Evento, Florin, Jugador, Laser, Pedestal, RefObjetivo,
  Rect, RefPed, Reglas, SitioDeJuego, JuegoDeSitio, Sonido, Tenis, Trasto, Variante, Voley, Circulo, Pino, Dardos, Bola, Laberinto, Jaula, Fantasma, Especial,
} from "./tipos.js";
import {
  ESCENARIOS, FLORES, GOAL, LASER_CARGA, PATIOS_PRECIO, TIERS, TRASTOS_ESCENARIO,
  ANCHO_PISTA, CAJAS_EN_PISTA, CENTRO_X, ESCALA_MAPA, OCHO_A, OCHO_B, VARIANTES, dificultadDe, montarEscenario, VEHICULOS, WORLD_H, WORLD_W, esEspecial, esVehiculo, varMult,
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
   A pie te frena en la orilla; con tabla o flotador se entra, y el agua pasa a
   ser un carril rápido por el sur del mapa.

   En un mapa de zonas el mar es de CADA ZONA: en el Multiverso hay agua en La
   Playa, Nueva York, el Amazonas, la Costa Verde y El Descubrimiento, y tierra
   seca en las otras diecinueve. Por eso todo lo que pregunta por el mar pregunta
   también por la `x`. */
export function marEn(e: Estado, x: number): number | null {
  const zonas = e.esc.zonas;
  if (!zonas?.length) return e.esc.mar ?? null;
  const z = zonas.find(q => x >= q.x0 && x < q.x1);
  return z?.mar ?? null;
}
export const hayMar = (e: Estado) => e.esc.mar != null || !!e.esc.zonas?.some(z => z.mar != null);
export const enElMar = (e: Estado, x: number, y: number) => {
  const mar = marEn(e, x);
  return mar != null && y > mar;
};

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
  return { cx: CENTRO_X, cy: WORLD_H / 2 };
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
  /* Un mapa de zonas siembra ZONA POR ZONA con la receta de cada una: en el
     Multiverso eso es lo que hace que en La Prehistoria haya dinosaurios y en
     La Construcción grúas, y de paso lo que evita que la densidad del mapa
     entero se multiplique por cuarenta y uno. Un mapa normal es una sola zona
     que ocupa todo. */
  const franjas = e.esc.zonas?.length
    ? e.esc.zonas.map(z => ({ id: z.id, x0: z.x0, x1: z.x1 }))
    : [{ id: e.esc.id, x0: 0, x1: WORLD_W }];

  for (const franja of franjas) {
    const receta = TRASTOS_ESCENARIO[franja.id] || [];
    const ancho = franja.x1 - franja.x0;
    /* Las recetas se escribieron para el mapa chico. Se reparte la MISMA
       densidad, no la misma cantidad: con las cuatro bicis de siempre, un mapa
       casi el doble de grande se cruza andando. */
    const escala = (ancho * WORLD_H) / (2600 * 1700);
    for (const { tipo, n: base } of receta) {
      const n = Math.max(1, Math.round(base * escala));
      /* `agua` quiere decir dos cosas según qué sea: en una tabla o una balsa es
         "SOLO en el agua", y en un especial —el dragón, el ovni— es "también
         sobre el agua", que vuela. Así que solo los normales necesitan orilla. */
      const aguaOnly = !!VEHICULOS[tipo]?.agua && !esEspecial(tipo);
      for (let k = 0; k < n; k++) {
        for (let intento = 0; intento < 40; intento++) {
          const x = rnd(e, franja.x0 + 90, franja.x1 - 90);
          const mar = marEn(e, x);
          /* Lo que flota nace en la orilla, no mar adentro: si naciera dentro del
             agua sería inalcanzable, porque a pie el tope de la orilla te frena
             antes de llegar. */
          const y = mar != null
            ? (aguaOnly ? rnd(e, mar - 70, mar - 10) : rnd(e, 90, mar - 110))
            : rnd(e, 90, WORLD_H - 90);
          /* Lo que solo funciona en el agua no tiene sentido en una zona seca:
             una tabla de surf tirada en el desierto no la monta nadie. */
          if (aguaOnly && mar == null) break;
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
}

/** Cómo se llama la zona en la que cae esa `x`, para los carteles. */
function zonaDeX(esc: Estado["esc"], x: number): string | null {
  const z = esc.zonas?.find((q: { id: string; x0: number; x1: number }) => x >= q.x0 && x < q.x1);
  if (!z) return null;
  return ESCENARIOS.find(e => e.id === z.id)?.nombre?.replace(/^(El|La|Los|Las) /, "") || z.id;
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
  /* El mar de la zona del patio: en el Multiverso el agua es de cinco zonas y
     no del mapa entero. */
  const marAqui = marEn(e, r.x + r.w / 2);
  const abajo = marAqui != null ? marAqui - 40 : WORLD_H - 40;
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
    money: 260, ammo, wsel: 0, cd: 0, inShop: false, inRuleta: false, inFusion: false,
    enSitio: null, fullWarn: 0,
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
   El mapa no cambia: hay un patio y ocho casas de vecinos. El primer jugador
   toma el patio; **cada jugador de más ocupa una casa vecina, y el vecino que
   vivía ahí sale a jugar en vez de quedarse a que le roben**. Así se reparte
   sin mover una piedra del escenario.

   Los Marcianos van primeros a propósito: es el sitio que ya usaba el J2 del
   duelo de sofá, así que dos jugadores siguen empezando donde empezaban. */
const SLOTS: { casa: number | null; shirt: string }[] = [
  { casa: null, shirt: "#3DDC97" },
  { casa: 3,    shirt: "#FFB020" },
  { casa: 0,    shirt: "#FF5C86" },
  { casa: 1,    shirt: "#37D6E0" },
  { casa: 2,    shirt: "#B57BE0" },
  { casa: 4,    shirt: "#F2A65A" },
  { casa: 5,    shirt: "#7FE0C4" },
  { casa: 6,    shirt: "#E86BA0" },
  { casa: 7,    shirt: "#9AA8FF" },
];
/** Cuántos caben en un mapa: uno por patio y uno por casa de vecino. */
export const JUGADORES_MAX = SLOTS.length;
/** Cuántos caben en una SALA. Menos que el mapa a propósito: cada asiento
    vacío lo mueve un bot en el servidor, y nueve simulados por sala es pedirle
    al VPS algo que nadie ha pedido todavía. */
export const SALA_MAX = 5;
/** Cuántos caben en un partido: 5 contra 5. La cancha da para eso. */
export const FUTBOL_MAX = 10;
/** Camisetas de sobra, para cuando hay más jugadores que `SLOTS`. */
const CAMISETAS = ["#3DDC97", "#FFB020", "#FF5C86", "#37D6E0", "#B57BE0",
                   "#F2A65A", "#7FE0C4", "#E86BA0", "#9AA8FF", "#C6E86B"];

/** Cómo se llama el que vive en cada casa, para cuando sale a jugar él mismo. */
const APODOS: Record<string, string> = {
  marcia: "el Marciano", mayo: "Mayo", sobri: "la Sobri",
  yuli: "Yuli", meche: "Meche", chato: "el Chato",
  wilber: "don Wílber", charo: "la Tía Charo",
};

export interface OpcionesPartida {
  /** cuántos juegan, de 1 a 5. Cada uno de más ocupa una casa de vecino. */
  jugadores?: number;
  /** De esos, cuántos de los ÚLTIMOS asientos los lleva la máquina. Solo cambia
      cómo se llaman: quien mueve a un bot es quien simula (el cliente cuando
      juegas solo, el servidor en una sala). */
  bots?: number;
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
export function colocarPuestos(bases: Base[], zonas?: { x0: number; x1: number }[]) {
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
    /* Las fracciones son de un mapa NORMAL alrededor del centro de casa, no del
       mundo entero: en el Multiverso, `WORLD_W * fx` mandaba la Fusionadora al
       kilómetro 43 — libre, sí, pero a dos minutos y medio andando. */
    const ancho = Math.min(WORLD_W, 3600);
    const sitios = orden.map(([fx, fy]) =>
      [Math.round(CENTRO_X + (fx - 0.5) * ancho - w / 2),
       Math.round(WORLD_H * fy - h / 2)] as [number, number]);
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
  const armerias = [arm0, buscar(300, 150, { x: arm0.x + 150, y: arm0.y + 75 },
                                 anillo(Math.PI / 4), (x, y) => ({ x, y, w: 300, h: 150 }))];
  const ruletas = [rul0, buscar(184, 184, rul0,
                                anillo(-Math.PI * 0.75), (x, y) => ({ x: x + 92, y: y + 92, r: 92 }))];

  /* ---- los puestos de las otras zonas ----
     Con dos Armerías para 86 400 px, la más cercana quedaba a dos minutos y
     medio ANDANDO: comprar dejaba de ser una decisión y pasaba a ser un viaje.
     Así que cada tramo de tres zonas tiene los suyos, y de paso el Multiverso
     deja de tener un único centro comercial en el kilómetro 43.

     Se ponen a dedo y no buscando sitio: buscar cuesta 36 pruebas por puesto
     contra todas las bases, y esto corre al crear la partida. A dedo caen en el
     medio de su tramo, que es tierra de nadie — las casas van al centro de cada
     zona y los patios al principio del mapa. */
  const TRAMO = 3;
  if (zonas && zonas.length > TRAMO) {
    for (let i = TRAMO; i < zonas.length; i += TRAMO) {
      const z0 = zonas[i], z1 = zonas[Math.min(i + TRAMO, zonas.length) - 1];
      const mx = Math.round((z0.x0 + z1.x1) / 2);
      armerias.push({ x: mx - 460, y: cy - 75, w: 300, h: 150 });
      ruletas.push({ x: mx + 320, y: cy, r: 92 });
    }
  }
  return { armerias, ruletas, fusion };
}

export function crearPartida(op: OpcionesPartida): Estado {
  /* Montar el escenario es lo PRIMERO: fija el tamaño del mundo y pasa sus
     fracciones a píxeles. Todo lo que viene después —las bases, los trastos,
     la pasarela, la pista— se coloca con ese mundo ya puesto. */
  const esc = montarEscenario(ESCENARIOS.find(x => x.id === op.escenario) || ESCENARIOS[0]);
  const semilla = op.semilla ?? 1;
  const C = esc.casas, P = esc.patios;

  /* Cuántos caben AQUÍ: uno por patio y uno por cada casa que este mapa haya
     conseguido colocar. En los cinco escenarios con mar no entran las ocho
     —media parte de abajo es agua—, y sin este tope un jugador de más apuntaba
     a una casa que no existe. */
  /* En un partido no hace falta casa: no se roba a nadie, no hay vitrina y el
     patio no pinta nada. Por eso el fútbol no está atado a `SLOTS` —que existe
     para repartir casas— y da para 5 contra 5 o lo que se pida. En todo lo
     demás, cada jugador de más ocupa una casa de vecino y el tope es ese. */
  const enPartido = esMinijuego(op.reglas?.modo ?? "aventura");
  const n = enPartido
    ? clampEntero(op.jugadores ?? 2, 2, cupoDe(op.reglas!.modo as JuegoDeSitio))
    : clampEntero(op.jugadores ?? 1, 1, Math.min(JUGADORES_MAX, 1 + C.length));
  const reglas: Reglas = { ...reglasPara(n), ...(op.reglas || {}) };
  /* En un minijuego el barrio se apaga AQUÍ, no en quien llama. Es lo único que
     no se puede dejar a la buena voluntad del que arma la partida: olvidarlo no
     da un error, da un partido con ladrones dentro. */
  if (enPartido) { reglas.vecinos = false; reglas.puestos = false; reglas.patiosExtra = false; }

  /* Las bases se montan siempre igual y en el mismo orden: `baseDe` indexa por
     id, así que estos índices son un contrato y no se pueden reordenar. Los
     `SLOTS` de los jugadores apuntan a ellos por posición. */
  const VECINOS: [string, string, string][] = [
    ["Casa de Mayo", "#FFD84D", "mayo"],
    ["Doña Chancla", "#FF9EC4", "sobri"],
    ["Casa de la Prima Yuli", "#FF5C86", "yuli"],
    ["Nave de los Marcianos", "#8B6BEE", "marcia"],
    ["Quiosco de Doña Meche", "#5CE1EA", "meche"],
    ["Casa del Chato", "#9BD97F", "chato"],
    ["Bodega de don Wílber", "#E8734A", "wilber"],
    ["Casa de la Tía Charo", "#6B8CFF", "charo"],
  ];
  /* "Patio del J1" solo cuando hay OTRO humano al que distinguir. Con vecinos
     que juegan solos sigue siendo tu patio: nadie lo va a confundir. */
  const humanos = n - clampEntero(op.bots ?? 0, 0, Math.max(0, n - 1));
  const bases: Base[] = [
    makeBase(0, humanos > 1 ? "Patio del J1" : "Tu patio", P[0][0], P[0][1], true, "#3DDC97"),
  ];
  /* Una base por sitio que traiga el escenario, con el vecino que le toque. La
     lista de vecinos se recorre en círculo: el mapa normal trae ocho casas y sale
     cada uno una vez, y el Multiverso trae veinticuatro y salen tres veces cada
     uno —los mismos vecinos repartidos por veinticuatro mundos, que es justo el
     chiste—. Al que repite se le añade en qué zona vive, o el cartel del mapa y
     el aviso de la alarma dirían lo mismo en tres sitios distintos. */
  C.forEach(([cx0, cy0], k) => {
    const [nombre, color, quien] = VECINOS[k % VECINOS.length];
    const repite = k >= VECINOS.length;
    const zona = repite ? zonaDeX(esc, cx0) : null;
    /* El id es la posición en la lista, no `k`: `baseDe` es `e.bases[id]`, y en
       un mapa con menos casas de las ocho un hueco descolocaría todo. */
    bases.push(makeBase(bases.length, zona ? nombre + " · " + zona : nombre,
                        cx0, cy0, false, color, quien));
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
  /* Los últimos asientos los puede llevar la máquina. Un bot no es "el J3": es
     el vecino de esa casa, que hoy ha salido a jugar. Por eso conserva el
     nombre de la casa y se queda con el apodo del que vive allí — todo lo demás
     (el color, dejar de ser fuente de ladrones) es igual que con un humano. */
  const primerBot = humanos;
  const jugadores: Jugador[] = [];
  for (let i = 0; i < n; i++) {
    /* Pasado el reparto de casas —o siempre, en un partido— todos salen del
       patio: `baseId` tiene que apuntar a algo, y en fútbol nunca se mira. */
    const slot = SLOTS[i] ?? { casa: null, shirt: CAMISETAS[i % CAMISETAS.length] };
    const base = slot.casa == null || enPartido ? bases[0] : bases[slot.casa + 1];
    const esBot = i >= primerBot && i > 0;
    const vecino = base.who;
    if (slot.casa != null && !enPartido) {
      if (!esBot) base.name = "Patio del J" + (i + 1);
      base.isPlayer = true;
      base.who = null;
      base.color = slot.shirt;
    }
    const p = mkJugador(i, base, slot.shirt, op.armas);
    if (esBot) p.apodo = APODOS[vecino || ""] || "el vecino";
    jugadores.push(p);
  }
  for (const p of jugadores) for (const id of p.patios) { bases[id].owner = p.idx; ponerLaser(bases[id]); }

  /* Los dos puestos van al centro, uno a cada lado del cruce del ocho: la
     Armería a la izquierda y la Ruleta a la derecha. El desfile les da la
     vuelta a los dos, así que el centro del mapa es de verdad el centro. */
  const { cx, cy } = centroDelMapa();
  const { armerias, ruletas, fusion } = colocarPuestos(bases, esc.zonas);
  /* El portal de salida se aparta de la orilla. Con el margen fijo de siempre
     medido desde abajo acababa dentro del agua en cuanto el mapa creció —el mar
     va en fracción del alto y el margen no—, y los Florines del desfile salían
     nadando mar adentro, donde no los alcanza nadie. */
  const marCentro = esc.zonas?.length
    ? (esc.zonas.find(z => cx >= z.x0 && cx < z.x1)?.mar ?? null)
    : (esc.mar ?? null);
  const finca = marCentro != null ? marCentro - 90 : WORLD_H - 240;
  const portal = {
    x: cx, y: 240, r: 34, timer: 2.5, desfile: [],
    salida: { x: cx, y: Math.min(WORLD_H - 240, finca), r: 34 },
  };

  const e: Estado = {
    t: 0, reglas, esc, semilla, rngEstado: semilla | 0,
    bases, players: jugadores, armerias, ruletas, fusion, cochera: null, sitios: [], portal,
    bolts: [], blasts: [], cascaras: [], trastos: [], perros: [], slowmo: 0,
    thieves: [], ground: [], thiefTimer: 14,
    girando: null, ultimoPremio: null, cajas: [],
    alarma: null, futbol: null, tenis: null,
    basquet: null, bolos: null, lucha: null, dardos: null,
    carreraObs: null, laberinto: null, billar: null, hockey: null, voley: null,
    fiesta: null,
    brujoSuelto: null, brujoCada: 65,
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
  /* O se ARMA un minijuego, o se PONEN los sitios desde los que armarlos.
     Nunca las dos: dentro de una cancha no se cuelga otra cancha. */
  const armar = ARMAR[reglas.modo as JuegoDeSitio];
  if (armar) armar(e);
  else ponerLosSitios(e);
  return e;
}

/* ---- la tabla de los minijuegos ----
   Un modo por juego, y una sola lista. Es la lista la que decide TODO lo demás:
   quién arma la cancha, cuántos caben, y —lo importante— que el barrio se
   apague. Mientras los minijuegos se armaban desde el cliente sobre una partida
   de aventura, el modo se quedaba en "aventura" y debajo del partido seguían
   corriendo los ladrones, el desfile y los puestos: te robaban la vitrina a
   media pichanga y el cartel de "Jugar básquet" salía DENTRO del básquet. */
const ARMAR: Record<JuegoDeSitio, (e: Estado) => void> = {
  futbol: aLaCancha,
  tenis: aLaCanchaDeTenis,
  basquet: aLaCanchaDeBasquet,
  bolos: aLaPistaDeBolos,
  lucha: aLaLucha,
  dardos: aLosDardos,
  voley: aLaCanchaDeVoley,
  carreraObs: aLaCarreraDeObs,
  laberinto: aElLaberinto,
  billar: aLaMesaDeBillar,
  hockey: aAirHockey,
};

/** ¿Este modo es un minijuego? Entonces el barrio no corre debajo. */
export const esMinijuego = (modo: Reglas["modo"]): modo is JuegoDeSitio =>
  Object.prototype.hasOwnProperty.call(ARMAR, modo);

/** Cuánta gente cabe en cada minijuego. Los que no están aquí, dos.
    Se resuelve al preguntar y no al cargar el módulo: `TENIS_MAX` se declara
    más abajo, con el resto del tenis. */
const cupoDe = (juego: JuegoDeSitio): number =>
  juego === "futbol" ? FUTBOL_MAX
  : juego === "tenis" || juego === "voley" ? TENIS_MAX      // individual o dobles
  : juego === "basquet" ? 6                                 // hasta 3 contra 3
  : juego === "carreraObs" ? 5                              // una carrera es de varios
  : 2;

/* ---- los sitios con minijuego ----
   Sitios del mundo a los que te metes y se arma un partido, sin pasar por el
   menú. El primero fue la canchita del colegio; ahora es una lista, para que el
   siguiente juego traiga sus reglas y no otra copia de la misma fontanería.

   Cada juego dice dónde puede vivir y de qué tamaño es; el resto —buscar hueco,
   avisar de que estás dentro, el cartel— es común. */
export const CANCHITA = { w: 900, h: 560 };
export const CANCHA_TENIS = { w: 780, h: 500 };
const MED_BASQUET = { w: 600, h: 420 };
/* La PUERTA de la bolera, no la bolera: el sitio del mundo solo tiene que ser
   un cuadro reconocible al que te metes — la pista de verdad (460 x 1500) se
   monta aparte, en el centro del mapa. Con la medida de la pista aquí no cabía
   en el patio del colegio y el mundo se quedaba sin bolera; hay prueba de que
   están los ocho sitios. */
const MED_BOLOS = { w: 300, h: 520 };
const MED_LUCHA = { w: 400, h: 400 };
const MED_DARDOS = { w: 200, h: 200 };
/* Igual que la bolera: esto es la PUERTA, no el circuito. El óvalo de verdad
   (1 400 x 900) se monta en el centro del mapa. Con 800 x 600 aquí, era el
   sitio más grande de los ocho y se quedaba fuera del patio del colegio. */
const MED_CARRERA_OBS = { w: 460, h: 340 };
/* La PUERTA, no el laberinto: el de verdad mide 13x92 = 1 196 px de lado y se
   monta en el centro del mapa. Con 640 aquí era, con los once sitios puestos,
   el que se quedaba fuera del patio del colegio. */
const MED_LABERINTO = { w: 380, h: 380 };
const MED_BILLAR = { w: 500, h: 300 };
const MED_HOCKEY = { w: 500, h: 300 };
const MED_VOLEY = { w: 600, h: 360 };

/* `listo` es lo que separa un minijuego de un cartel. Un sitio que no está
   listo NO se cuelga en el mundo: se puede armar a mano (y probar), pero nadie
   se lo encuentra jugando. La regla es la misma que se aplicó al tenis cuando
   su puerta estaba hecha y sus reglas no — un cartel que invita a un sitio
   donde no se puede jugar es peor que no tener cartel.

   Medido con `banco/mini.ts` (dos bots, cinco minutos, escenario colegio):
   fútbol acaba 3-2 en 91 s y tenis 7-5 en 80 s. De los demás, ninguno se
   termina jugando: básquet y lucha llegan a 0-0 y se acaban por reloj, bolos,
   voley, billar y hockey no acaban nunca, el laberinto se queda a medias, la
   carrera se "gana" en 21 s porque los puntos de paso son las cuatro esquinas
   y no hay que recorrer nada, y `pasoDardos` está vacío: no tiene reglas.
   A todos les falta además su rama en `pensarBot`, así que el rival no juega.
   Según se vayan terminando, se les pone `listo: true` y aparecen solos. */
const SITIOS: {
  juego: JuegoDeSitio; rotulo: string; medida: { w: number; h: number };
  donde: string; listo: boolean;
}[] = [
  { juego: "futbol", rotulo: "LA PICHANGA", medida: CANCHITA, donde: "colegio", listo: true },
  { juego: "tenis", rotulo: "LA CANCHA DE TENIS", medida: CANCHA_TENIS, donde: "colegio", listo: true },
  { juego: "basquet", rotulo: "LA CANCHA DE BÁSQUET", medida: MED_BASQUET, donde: "colegio", listo: true },
  { juego: "bolos", rotulo: "LOS BOLOS", medida: MED_BOLOS, donde: "colegio", listo: true },
  { juego: "lucha", rotulo: "EL RING", medida: MED_LUCHA, donde: "colegio", listo: true },
  { juego: "dardos", rotulo: "LOS DARDOS", medida: MED_DARDOS, donde: "colegio", listo: true },
  { juego: "voley", rotulo: "LA CANCHA DE VÓLEY", medida: MED_VOLEY, donde: "colegio", listo: true },
  { juego: "carreraObs", rotulo: "LA CARRERA", medida: MED_CARRERA_OBS, donde: "colegio", listo: true },
  { juego: "laberinto", rotulo: "EL LABERINTO", medida: MED_LABERINTO, donde: "colegio", listo: true },
  { juego: "billar", rotulo: "EL BILLAR", medida: MED_BILLAR, donde: "colegio", listo: true },
  { juego: "hockey", rotulo: "AIR HOCKEY", medida: MED_HOCKEY, donde: "colegio", listo: true },
];

/** Los minijuegos que de verdad se juegan de principio a fin. Lo lee también el
    cliente, para no ofrecer en el menú lo que el mundo no cuelga. */
export const JUEGOS_LISTOS: JuegoDeSitio[] =
  SITIOS.filter(S => S.listo).map(S => S.juego);

function ponerLosSitios(e: Estado): void {
  for (const S of SITIOS) {
    if (!S.listo) continue;
    const zona = e.esc.zonas?.find(z => z.id === S.donde);
    if (e.esc.id !== S.donde && !zona) continue;
    const x0 = zona ? zona.x0 : 0, x1 = zona ? zona.x1 : WORLD_W;
    const sitio = buscarHuecoDeSitio(e, x0, x1, S.medida);
    if (sitio) e.sitios.push({ juego: S.juego, rect: sitio, rotulo: S.rotulo });
  }
}

/** Un hueco libre para una cancha, de grande a chica y de fuera hacia el centro. */
function buscarHuecoDeSitio(e: Estado, x0: number, x1: number,
                            medida: { w: number; h: number }): Rect | null {
  const libre = (x: number, y: number, w: number, h: number) => {
    if (x < x0 + 60 || x + w > x1 - 60 || y < 80 || y + h > WORLD_H - 60) return false;
    const choca = (r: { x: number; y: number; w: number; h: number }, m = 40) =>
      x < r.x + r.w + m && x + w > r.x - m && y < r.y + r.h + m && y + h > r.y - m;
    if (e.bases.some(b => choca(b.rect))) return false;
    if (e.armerias.some(a => choca(a))) return false;
    if (e.ruletas.some(r => choca({ x: r.x - r.r, y: r.y - r.r, w: r.r * 2, h: r.r * 2 }))) return false;
    if (e.fusion && choca(e.fusion)) return false;
    /* Ni encima de otro sitio de juego: dos canchas superpuestas son una sola. */
    if (e.sitios.some(s => choca(s.rect))) return false;
    /* Ni encima de la columna del desfile ni de los dos portales: por ahí bajan
       los Florines, y un partido cruzado por el desfile son dos cosas
       peleándose por el mismo sitio. */
    for (const P of [e.portal, e.portal.salida])
      if (choca({ x: P.x - 90, y: P.y - 90, w: 180, h: 180 }, 60)) return false;
    if (choca({ x: e.portal.x - 110, y: e.portal.y, w: 220,
                h: e.portal.salida.y - e.portal.y }, 20)) return false;
    return true;
  };

  const medio = (x0 + x1) / 2;
  /* De grande a chica: en el Multiverso la zona del colegio está despejada y
     cabe entera; en el colegio a secas el patio va lleno —ocho casas, cinco
     patios, dos puestos de cada y la Fusionadora— y hay que apretarse. Una
     cancha chica sigue siendo una cancha; ninguna, no. */
  for (const k of [1, 0.82, 0.66, 0.52]) {
    const w = Math.round(medida.w * k), h = Math.round(medida.h * k);
    for (const fy of [0.74, 0.62, 0.86, 0.30, 0.18, 0.46]) {
      for (const dx of [-820, 820, -1180, 1180, -450, 450, -1450, 1450, 0]) {
        const x = Math.round(medio + dx - w / 2);
        const y = Math.round(WORLD_H * fy - h / 2);
        if (libre(x, y, w, h)) return { x, y, w, h };
      }
    }
  }
  return null;
}

/* ---- el partido ----
   Una cancha, dos arcos y una pelota. La pelota NO es nueva: es un trasto
   `pelota` como los siete que hay tirados por el patio del colegio, y se patea
   con el mismo código. Lo único que añade el fútbol es a dónde vuelve cuando
   entra, quién gana y cuándo se acaba. */
export const CANCHA = { w: 1900, h: 1150 };
/** Lo que mide la boca de cada arco. */
const ARCO = { w: 70, h: 340 };
/** Goles para ganar antes de que se acabe el reloj, y cuánto dura. */
export const FUTBOL_META = 3, FUTBOL_RELOJ = 240, FUTBOL_SAQUE = 2.5;

function aLaCancha(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const cancha = { x: Math.round(cx - CANCHA.w / 2), y: Math.round(cy - CANCHA.h / 2),
                   w: CANCHA.w, h: CANCHA.h };
  /* Los arcos van POR DENTRO del borde: si la boca cayera fuera de la cancha, la
     pelota tendría que salirse para entrar, y la cancha la devuelve. */
  const arcoY = Math.round(cy - ARCO.h / 2);
  const arcos: [Rect, Rect] = [
    { x: cancha.x, y: arcoY, w: ARCO.w, h: ARCO.h },
    { x: cancha.x + cancha.w - ARCO.w, y: arcoY, w: ARCO.w, h: ARCO.h },
  ];

  /* La pelota del partido: se le pide una al reparto de trastos y, si no hay
     (el escenario podría no sembrar pelotas), se pone una. */
  let balon = e.trastos.find(t => t.tipo === "pelota");
  if (!balon) {
    balon = { id: nuevoId(e), tipo: "pelota", x: cx, y: cy, vx: 0, vy: 0,
              montadoPor: null, pateadoPor: null, giro: 0, variante: 0 };
    e.trastos.push(balon);
  }
  /* Las demás pelotas estorban: en un partido tiene que haber UNA, o nadie sabe
     cuál cuenta. Lo mismo con todo lo que se monta: un partido en bicicleta no. */
  e.trastos = e.trastos.filter(t => t === balon);

  e.futbol = {
    cancha, arcos, balon: balon.id, goles: [0, 0],
    reloj: FUTBOL_RELOJ, saque: FUTBOL_SAQUE, ultimoGol: null,
    meta: FUTBOL_META, quieto: 0, ganador: null,
  };
  repartirEquipos(e);
  sacarDelCentro(e);
}

/** Los pares a un equipo y los impares al otro: 3v3 son seis asientos. */
function repartirEquipos(e: Estado): void {
  e.players.forEach((p, i) => { p.equipo = (i % 2) as 0 | 1; });
}

/** Saque del centro: la pelota quieta en el medio y cada equipo en su mitad. */
export function sacarDelCentro(e: Estado): void {
  const f = e.futbol;
  if (!f) return;
  const cx = f.cancha.x + f.cancha.w / 2, cy = f.cancha.y + f.cancha.h / 2;
  const balon = e.trastos.find(t => t.id === f.balon);
  if (balon) { balon.x = cx; balon.y = cy; balon.vx = 0; balon.vy = 0; balon.pateadoPor = null; }
  f.saque = FUTBOL_SAQUE;

  /* Cada equipo en su mitad, en fila y separados: sin esto salen los seis
     amontonados en el centro y el primer saque es un choque. */
  const porEquipo = [0, 1].map(q => e.players.filter(p => p.equipo === q));
  porEquipo.forEach((equipo, q) => {
    equipo.forEach((p, k) => {
      const lado = q === 0 ? -1 : 1;
      p.x = cx + lado * (180 + k * 150);
      p.y = cy + (k - (equipo.length - 1) / 2) * 220;
      p.vx = 0; p.vy = 0;
      p.stun = 0;
      p.montado = null;
    });
  });
}

/* ---- el tenis ----
   Dos lados, una red y un peloteo. Comparte con el fútbol todo lo que ya
   estaba: la pelota es un trasto, se le pega con el mismo botón y vuela con la
   misma altura y la misma gravedad. Lo que trae de nuevo son sus reglas, que
   son las tres de siempre y ninguna más: que bote dos veces en tu campo, que
   se te vaya fuera, que la mandes a la red.

   Nadie cruza la red: cada uno se queda en su mitad. Es una regla del tenis
   de verdad y además evita el amontonamiento de seis piernas alrededor de la
   pelota, que es exactamente lo que el tenis NO es. */
export const CANCHA_TENIS_JUEGO = { w: 1560, h: 900 };
/** Lo alto que es la red y lo ancho de su franja, para saber si la pelota la pegó. */
export const RED_ALTO = 40, RED_ANCHO = 16;
/** Puntos para ganar, y lo que se espera entre punto y punto. */
export const TENIS_META = 7, TENIS_SAQUE = 2.2;
/** Cuánta gente cabe: individual o dobles. Más de dos por lado es una pelea. */
export const TENIS_MAX = 4;

function aLaCanchaDeTenis(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const cancha = {
    x: Math.round(cx - CANCHA_TENIS_JUEGO.w / 2), y: Math.round(cy - CANCHA_TENIS_JUEGO.h / 2),
    w: CANCHA_TENIS_JUEGO.w, h: CANCHA_TENIS_JUEGO.h,
  };

  /* La pelota del partido, igual que en el fútbol: se pide una al reparto de
     trastos y, si el escenario no sembró ninguna, se pone. Las demás estorban:
     en un peloteo tiene que haber UNA, o no se sabe cuál cuenta el punto. */
  let balon = e.trastos.find(t => t.tipo === "pelota");
  if (!balon) {
    balon = { id: nuevoId(e), tipo: "pelota", x: cx, y: cy, z: 0, vz: 0, vx: 0, vy: 0,
              montadoPor: null, pateadoPor: null, giro: 0, variante: 0 };
    e.trastos.push(balon);
  }
  e.trastos = e.trastos.filter(t => t === balon);

  e.tenis = {
    cancha, redX: Math.round(cx), redAlto: RED_ALTO, balon: balon.id,
    puntos: [0, 0], meta: TENIS_META, saque: TENIS_SAQUE, sacador: 0,
    ultimoToque: null, botes: 0, ladoDelBote: null, ultimoPunto: null, ganador: null,
  };
  repartirEquipos(e);
  colocarParaElSaque(e);
}

/** En qué mitad de la cancha cae una x: la 0 es la de la izquierda. */
export const ladoDeLaCancha = (t: Tenis, x: number): 0 | 1 => (x < t.redX ? 0 : 1);

/** Dónde espera cada uno mientras se saca, y dónde queda la pelota. */
export function colocarParaElSaque(e: Estado): void {
  const t = e.tenis;
  if (!t) return;
  const c = t.cancha;
  const cy = c.y + c.h / 2;
  const medio = c.w / 2;

  const balon = e.trastos.find(x => x.id === t.balon);
  const lado = t.sacador === 0 ? -1 : 1;
  /* La pelota espera al lado de quien saca, no en el centro: así se ve de quién
     es el saque sin tener que leer ningún cartel. */
  if (balon) {
    balon.x = t.redX + lado * medio * 0.78;
    balon.y = cy;
    balon.vx = 0; balon.vy = 0; balon.z = 0; balon.vz = 0;
    balon.pateadoPor = null;
  }
  t.ultimoToque = null;
  t.botes = 0;
  t.ladoDelBote = null;

  /* Cada equipo en su mitad y en fila. En dobles, uno delante y otro detrás:
     puestos a la par se tapan el uno al otro. */
  const porEquipo = [0, 1].map(q => e.players.filter(p => p.equipo === q));
  porEquipo.forEach((equipo, q) => {
    const suLado = q === 0 ? -1 : 1;
    equipo.forEach((p, k) => {
      p.x = t.redX + suLado * medio * (0.72 - k * 0.34);
      p.y = cy + (k - (equipo.length - 1) / 2) * 200;
      p.vx = 0; p.vy = 0;
      p.stun = 0;
      p.montado = null;
    });
  });
}

/* ---- básquet ----
   Dos equipos, una pelota que se LLEVA y dos aros. Los aros son círculos de
   verdad y están en el suelo: visto desde arriba, la canasta es la pelota
   cayendo dentro del aro, que es exactamente lo que se ve desde arriba. */
export const CANCHA_BASQUET = { w: 1400, h: 820 };
export const BASQUET_META = 11, BASQUET_RELOJ = 180, BASQUET_SAQUE = 1.8;
/** Lo que mide el aro y desde dónde vale tres. */
export const ARO_R = 44, BASQUET_TRIPLE = 330;

export function aLaCanchaDeBasquet(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const cancha = {
    x: Math.round(cx - CANCHA_BASQUET.w / 2), y: Math.round(cy - CANCHA_BASQUET.h / 2),
    w: CANCHA_BASQUET.w, h: CANCHA_BASQUET.h,
  };
  const aros: [Circulo, Circulo] = [
    { x: Math.round(cancha.x + cancha.w * 0.10), y: cy, r: ARO_R },
    { x: Math.round(cancha.x + cancha.w * 0.90), y: cy, r: ARO_R },
  ];

  let balon = e.trastos.find(t => t.tipo === "pelota");
  if (!balon) {
    balon = { id: nuevoId(e), tipo: "pelota", x: cx, y: cy, z: 0, vz: 0, vx: 0, vy: 0,
              montadoPor: null, pateadoPor: null, giro: 0, variante: 0 };
    e.trastos.push(balon);
  }
  e.trastos = e.trastos.filter(t => t === balon);

  e.basquet = {
    cancha, aros, triple: BASQUET_TRIPLE, balon: balon.id, conLaBola: null,
    suelta: 0, tiroDesde: 0, puntos: [0, 0], meta: BASQUET_META,
    reloj: BASQUET_RELOJ, saque: BASQUET_SAQUE, ultimaCanasta: null, ganador: null,
  };
  repartirEquipos(e);
  sacarDeMedioBasquet(e);
}

/** Salto inicial: la pelota al centro y cada equipo en su mitad. */
export function sacarDeMedioBasquet(e: Estado): void {
  const b = e.basquet;
  if (!b) return;
  const c = b.cancha, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const balon = e.trastos.find(t => t.id === b.balon);
  if (balon) {
    balon.x = cx; balon.y = cy; balon.vx = 0; balon.vy = 0;
    balon.z = 0; balon.vz = 0; balon.pateadoPor = null;
  }
  b.conLaBola = null;
  b.suelta = 0;

  const porEquipo = [0, 1].map(q => e.players.filter(p => p.equipo === q));
  porEquipo.forEach((equipo, q) => {
    const lado = q === 0 ? -1 : 1;
    equipo.forEach((p, k) => {
      p.x = cx + lado * (150 + k * 130);
      p.y = cy + (k - (equipo.length - 1) / 2) * 200;
      p.vx = 0; p.vy = 0;
      p.stun = 0;
      p.montado = null;
    });
  });
}

/* ---- los bolos ----
   Por turnos, dos bolas por mano. La pista es larga y estrecha, los diez pinos
   en triángulo al fondo, y la bola se lanza desde detrás de la raya de falta.

   Los pinos NO son trastos: no se patean, no vuelan y no se montan. Son diez
   círculos con sitio de nacimiento, y "tumbado" significa que se ha movido de
   él — no que algo lo haya tocado. Esa diferencia es la que permite que un pino
   se lleve al de al lado, que es la mitad de la gracia. */
export const PISTA_BOLOS = { w: 460, h: 1500 };
/** Manos que juega cada uno, y lo que separa a los pinos entre sí. */
export const BOLOS_MANOS = 5, PINO_SEP = 54;
/** Radio del pino y de la bola. */
export const PINO_R = 13, BOLA_R = 22;

/** Los diez, en triángulo, con el 1 mirando a quien lanza. */
function ponerLosPinos(cx: number, y0: number): Pino[] {
  const pinos: Pino[] = [];
  for (let fila = 0; fila < 4; fila++)
    for (let k = 0; k <= fila; k++) {
      const x = cx + (k - fila / 2) * PINO_SEP;
      const y = y0 - fila * PINO_SEP * 0.87;      // triángulo, no cuadrícula
      pinos.push({ x, y, ox: x, oy: y, vx: 0, vy: 0, pie: true });
    }
  return pinos;
}

export function aLaPistaDeBolos(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const pista = {
    x: Math.round(cx - PISTA_BOLOS.w / 2), y: Math.round(cy - PISTA_BOLOS.h / 2),
    w: PISTA_BOLOS.w, h: PISTA_BOLOS.h,
  };
  /* Se lanza desde abajo y los pinos están arriba: la pista se lee de un
     vistazo porque va en el eje largo de la pantalla. */
  const faltaY = pista.y + pista.h - 190;

  let balon = e.trastos.find(t => t.tipo === "pelota");
  if (!balon) {
    balon = { id: nuevoId(e), tipo: "pelota", x: cx, y: faltaY + 60, z: 0, vz: 0, vx: 0, vy: 0,
              montadoPor: null, pateadoPor: null, giro: 0, variante: 0 };
    e.trastos.push(balon);
  }
  e.trastos = e.trastos.filter(t => t === balon);

  e.bolos = {
    pista, faltaY, pinos: ponerLosPinos(cx, pista.y + 300), balon: balon.id,
    turno: 0, bola: 0, enPieAlEmpezar: 10,
    manos: e.players.map(() => 0), puntos: e.players.map(() => 0),
    total: BOLOS_MANOS, rodando: false, espera: 0, ultimo: null, ganador: null,
  };
  repartirEquipos(e);
  colocarParaTirar(e);
}

/** La bola a la raya y cada uno en su sitio: el que tira detrás de la bola, el
    que espera a un lado de la pista para no estorbar. */
export function colocarParaTirar(e: Estado): void {
  const b = e.bolos;
  if (!b) return;
  const cx = b.pista.x + b.pista.w / 2;
  const balon = e.trastos.find(t => t.id === b.balon);
  if (balon) {
    balon.x = cx; balon.y = b.faltaY + 40;
    balon.vx = 0; balon.vy = 0; balon.z = 0; balon.vz = 0;
    balon.pateadoPor = null;
  }
  b.rodando = false;
  b.espera = 0;
  b.enPieAlEmpezar = b.pinos.filter(p => p.pie).length;

  e.players.forEach((p, i) => {
    if (i === b.turno) { p.x = cx; p.y = b.faltaY + 100; }
    else { p.x = b.pista.x + b.pista.w + 90 + (i % 2) * 70; p.y = b.faltaY; }
    p.vx = 0; p.vy = 0; p.stun = 0; p.montado = null;
  });
}

/** Los diez otra vez en pie. */
export function reponerLosPinos(e: Estado): void {
  const b = e.bolos;
  if (!b) return;
  for (const pino of b.pinos) {
    pino.x = pino.ox; pino.y = pino.oy;
    pino.vx = 0; pino.vy = 0; pino.pie = true;
  }
}


/* ---- la lucha del patio ----
   Sumo con chancla. El ring es un círculo y el punto es sacar al otro: no hay
   vidas ni golpes que contar, o estás dentro o no estás. */
export const LUCHA_META = 5, LUCHA_RELOJ = 120, LUCHA_SAQUE = 1.4, LUCHA_R = 250;

export function aLaLucha(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  e.lucha = {
    ring: { x: cx, y: cy, r: LUCHA_R }, puntos: [0, 0], meta: LUCHA_META,
    reloj: LUCHA_RELOJ, saque: LUCHA_SAQUE, ultimoPunto: null, ganador: null,
  };
  repartirEquipos(e);
  colocarEnElRing(e);
}

/** Cada uno en su lado del círculo, mirándose. */
export function colocarEnElRing(e: Estado): void {
  const l = e.lucha;
  if (!l) return;
  const porEquipo = [0, 1].map(q => e.players.filter(p => p.equipo === q));
  porEquipo.forEach((equipo, q) => {
    const lado = q === 0 ? -1 : 1;
    equipo.forEach((p, k) => {
      p.x = l.ring.x + lado * l.ring.r * 0.55;
      p.y = l.ring.y + (k - (equipo.length - 1) / 2) * 130;
      p.vx = 0; p.vy = 0;
      p.stun = 0;
      p.montado = null;
      p.chancla.state = "held";
    });
  });
}

/* ---- los dardos ----
   Por turnos, seis cada uno. La diana es de anillos concéntricos y el centro
   vale cincuenta; lo que decide no es la fuerza —un dardo no llega más al centro
   por tirarlo fuerte— sino el PULSO: el error se cierra mientras aguantas.

   Y lo que le da precio a tomarse el tiempo no es un medidor tramposo, es el
   otro: te puede chanclear mientras apuntas. */
export const DARDOS_CADA_UNO = 6, DARDOS_ESPERA = 0.9;
export const DIANA_R = 150;
/** El vaivén del péndulo: cuánto se va la mano a cada lado, y a qué ritmo.

    El arco (176) es algo MÁS ANCHO que la diana (150 de radio), a propósito:
    soltar en el extremo del vaivén es fallar el tablero entero. Si el arco
    cupiera dentro, cualquier momento valdría y el péndulo sería un adorno.

    A 2,6 rad/s el vaivén tarda 2,4 s en ir y volver, y al cruzar el centro la
    marca va a 458 px/s. O sea: acertar el anillo del centro (30 px) pide
    soltar con menos de 65 ms de error. Se puede —un vaivén es periódico y eso
    se anticipa, no se reacciona— pero no se regala. */
export const DARDO_ARCO = 176, DARDO_VAIVEN = 2.6;

/** Dónde está la punta del dardo AHORA MISMO: el centro de la diana, más el
    vaivén del péndulo a lo ancho, y a la altura que apuntes tú.

    Vive aquí y exportada a propósito, y es LA función: la usa el motor al
    soltar, la usa el bot para elegir el momento y la usa la guía que se dibuja.
    Si fueran tres cuentas parecidas, la guía mentiría — y una guía que miente
    es peor que no tener guía. */
/** El error que NO controlas, del pulso más malo al mejor.

    Antes valía 84→38 y era el juego entero: apuntabas al centro, aguantabas, y
    tirabas un dado con el radio más chico. Ahora el reto lo pone el péndulo —el
    momento de soltar— y este error es solo el temblor de la mano. De ahí que
    baje tanto: si siguiera en 38, clavar el péndulo en el centro seguiría
    saliendo 25 la mitad de las veces y el momento no se notaría.

    Aguantar sigue pagando (36→9), pero YA NO BASTA: el péndulo no se para por
    aguantar, así que la paciencia afina la mano y el momento sigue siendo tuyo.
    Y el precio de tomarse el tiempo es el de siempre: el otro te chanclea. */
const DARDO_ERROR_MAX = 36, DARDO_ERROR_MIN = 9;

/** El radio del temblor para un pulso dado. Exportada por lo mismo que
    `puntoDelPendulo`: el círculo que dibuja la guía tiene que ser EL círculo
    del que sale el dardo, no uno parecido. */
export function errorDelDardo(k: number): number {
  return DARDO_ERROR_MAX - (DARDO_ERROR_MAX - DARDO_ERROR_MIN) * clamp(k, 0, 1);
}

export function puntoDelPendulo(d: Dardos, apuntaY: number | null): { x: number; y: number } {
  return {
    x: d.tablero.x + Math.sin(d.pendulo) * DARDO_ARCO,
    y: apuntaY ?? d.tablero.y,
  };
}

/** Lo que vale cada anillo, de dentro hacia fuera. El último es el borde. */
export const DIANA_ANILLOS = [50, 25, 15, 10, 5];

export function aLosDardos(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const tablero = { x: cx, y: cy - 300, r: DIANA_R };
  const raya = cy + 120;
  e.dardos = {
    tablero, raya, dardos: [], turno: 0,
    tiros: e.players.map(() => 0), puntos: e.players.map(() => 0),
    total: DARDOS_CADA_UNO, ultimo: null, espera: 0, pendulo: 0, ganador: null,
  };
  repartirEquipos(e);
  colocarParaTirarDardo(e);
}

/** Lo que vale un dardo según lo cerca del centro que haya caído. */
export function valorDelDardo(d: Dardos, x: number, y: number): number {
  const dist = Math.hypot(x - d.tablero.x, y - d.tablero.y);
  if (dist > d.tablero.r) return 0;                 // fuera de la diana
  const paso = d.tablero.r / DIANA_ANILLOS.length;
  return DIANA_ANILLOS[Math.min(DIANA_ANILLOS.length - 1, Math.floor(dist / paso))];
}

/** El que tira, en la raya; el que espera, a un lado. */
export function colocarParaTirarDardo(e: Estado): void {
  const d = e.dardos;
  if (!d) return;
  d.espera = 0;
  e.players.forEach((p, i) => {
    if (i === d.turno) { p.x = d.tablero.x; p.y = d.raya + 40; }
    /* El que espera, al lado y CERCA: a 320 px se quedaba fuera del alcance de
       la chancla, y sin chancla aguantar el pulso al máximo no cuesta nada. */
    else { p.x = d.tablero.x + 200 + (i % 2) * 60; p.y = d.raya; }
    p.vx = 0; p.vy = 0; p.montado = null;
  });
}


/* ---- la carrera de obstáculos ----
   La hermana chica del modo carrera: mismos puntos de paso en bucle y mismo
   "gana el primero en dar N vueltas", pero A PIE y con una regla propia — los
   obstáculos están EN el camino y tocarlos te tumba.

   El trazado es un óvalo de ocho balizas en vez de cuatro esquinas: con cuatro,
   la línea recta entre dos de ellas se saltaba media pista y el circuito era un
   rombo que nadie recorría. Y los obstáculos van EN la línea, alternando dentro
   y fuera, para que la curva corta pase rozándolos: ahí está la decisión de
   cada tramo, arriesgar por dentro o rodear seguro. */
export const OBS_VUELTAS = 3, OBS_SALIDA = 2.4, OBS_ANCHO = 150;
/** Lo que mide un cono y lo que te cuesta llevártelo por delante. */
export const OBS_CONO = 46, OBS_TROPIEZO = 0.85;

export function aLaCarreraDeObs(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  /* Un óvalo de ocho balizas: 1 400 x 900, que a 268 px/s son unos 15 s de
     vuelta y 45 s de carrera. */
  const rx = 700, ry = 450;
  const trazado = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) };
  });

  /* Los conos se derivan de los TRAMOS, no de un reparto propio: dos por
     tramo, a un tercio y a dos tercios del camino entre baliza y baliza, y
     desplazados a un lado de la recta. Así ninguno cae ENCIMA de una baliza —
     con un reparto propio de catorce conos sobre ocho balizas, alguno caía en
     una de ellas y los bots se quedaban clavados a 175 px, esquivando el cono
     y sin poder tocar el punto de paso (medido: cuatro de cinco atascados). */
  const obstaculos: Rect[] = [];
  trazado.forEach((a0, k) => {
    const b0 = trazado[(k + 1) % trazado.length];
    [0.34, 0.68].forEach((t, m) => {
      const mx = a0.x + (b0.x - a0.x) * t, my = a0.y + (b0.y - a0.y) * t;
      const dx = b0.x - a0.x, dy = b0.y - a0.y, d = Math.hypot(dx, dy) || 1;
      /* Perpendicular a la recta, alternando lado: la curva corta pasa
         rozándolos, que es donde está la decisión de cada tramo. */
      const lado = (k + m) % 2 ? 1 : -1;
      obstaculos.push({
        x: Math.round(mx + (-dy / d) * lado * 52 - OBS_CONO / 2),
        y: Math.round(my + (dx / d) * lado * 52 - OBS_CONO / 2),
        w: OBS_CONO, h: OBS_CONO,
      });
    });
  });

  const jugadores = e.players.map(() => ({ vuelta: 0, checkpoint: 1, fin: -1 }));
  e.carreraObs = {
    trazado, ancho: OBS_ANCHO, obstaculos, vueltas: OBS_VUELTAS,
    jugadores, salida: OBS_SALIDA, ganador: null,
  };
  repartirEquipos(e);
  /* En la parrilla, detrás de la primera baliza y en fila: saliendo todos del
     mismo píxel el primer paso es un empujón. */
  const p0 = trazado[0], p1 = trazado[1];
  const dx = p0.x - p1.x, dy = p0.y - p1.y, d = Math.hypot(dx, dy) || 1;
  e.players.forEach((p, i) => {
    p.x = p0.x + (dx / d) * 40 - (dy / d) * ((i - (e.players.length - 1) / 2) * 90);
    p.y = p0.y + (dy / d) * 40 + (dx / d) * ((i - (e.players.length - 1) / 2) * 90);
    p.vx = 0; p.vy = 0; p.stun = 0; p.montado = null;
  });
}


/* ---- el laberinto ----
   Cavado con vuelta atrás recursiva. La celda mide 92 px porque un jugador ocupa
   unos 40 de ancho: con celdas más chicas no cabe por su propio pasillo.

   Va por FASES: cada una es más grande, con más jaulas y un fantasma más. Y lo
   que se busca no son gemas: son los **amigos del colegio metidos en jaulas**.
   Un amigo liberado no desaparece — se queda ahí celebrando, que es la mitad
   del premio. */
export const LAB_CELDA = 92;

/** NOVENTA Y NUEVE niveles. No son 99 laberintos escritos a mano: son tres
    curvas y un bestiario, y de ahí sale cada nivel.

    Antes eran tres fases con las tallas a mano (15, 19, 23). Con 99 eso no se
    puede, y tampoco se puede dejar la talla quieta: el pedido era que crezca
    «cada 9 niveles un poco más», y eso es exactamente lo que hace `ladoDelNivel`
    — un escalón de dos celdas cada nueve niveles, sin tope, de 15 en el primero
    a 35 en el último.

    Que no quepa en pantalla ya no es un problema: la cámara TE SIGUE en cuanto
    el laberinto es más grande que la vista, y hay mapita en la esquina. Lo que
    sí es un límite de verdad es el borde del mundo (2 100 px de alto), y por eso
    dentro del laberinto el jugador se clampa al LABERINTO y no al mundo: aquí el
    laberinto ES el mundo. */
/* ---- el bestiario ----
   Cada nivel tiene su monstruo de cabecera, y a los seis niveles lo acompañan
   los de los niveles anteriores. Es lo que hace que 99 niveles no sean el mismo
   nivel 99 veces: cambia a QUIÉN tienes detrás, y cada uno corre lo suyo.

   Son bichos NUESTROS, no los de nadie. Se parecen de género a los monstruos de
   los juegos de laberinto que le gustan al jugador —un venado con cuernos, un
   conejo de felpa, un payaso— porque ese es el escalofrío que se busca, pero ni
   los nombres ni los dibujos son de otro juego: esto se publica en un dominio
   público y meter el personaje de otro es meterse en un lío ajeno. La Profe, de
   hecho, es del colegio de este juego y de ningún otro.

   `vel` es un multiplicador sobre `FANTASMA_VEL`, y es la mitad de la
   personalidad: La Mano corre y el Muñeco arrastra. Que se note DE UN VISTAZO
   cuál te viene detrás es justo lo que hace que la silueta importe. */
export const BESTIARIO: { id: string; nombre: string; vel: number; color: string }[] = [
  { id: "sombra", nombre: "LA SOMBRA", vel: 1.00, color: "#FF5C86" },
  { id: "venado", nombre: "EL VENADO", vel: 1.07, color: "#E8DCC0" },
  { id: "conejo", nombre: "EL CONEJO", vel: 0.93, color: "#F7A8CF" },
  { id: "mano",   nombre: "LA MANO",   vel: 1.12, color: "#FF9E5C" },
  { id: "payaso", nombre: "EL PAYASO", vel: 1.00, color: "#FF7A3D" },
  { id: "arana",  nombre: "LA ARAÑA",  vel: 1.05, color: "#B98CFF" },
  { id: "muneco", nombre: "EL MUÑECO", vel: 0.88, color: "#C08A4A" },
  { id: "profe",  nombre: "LA PROFE",  vel: 0.97, color: "#5CE1EA" },
];
/* ---- EL BRUJO SUPREMO ----
   El jefe del nivel 100, y solo del nivel 100 — por eso NO está en el
   BESTIARIO: el bestiario rota por los 99 niveles y el Brujo no es uno más de
   la rueda, es el final. Corre más que todos, la chancla y la linterna apenas
   lo congelan, el mochilazo ni lo mueve, y cada quince segundos ALTERA LA
   REALIDAD con su magia: abre muros donde no había paso, o te lanza a otra
   dimensión del laberinto. */
export const BRUJO = { id: "brujo", nombre: "EL BRUJO SUPREMO", vel: 1.15, color: "#E14CFF" };
/** Cada cuánto lanza su magia, y cuántos muros abre por hechizo. */
export const LAB_MAGIA = 15, LAB_MAGIA_MUROS = 8;
/* ---- las pistas del Brujo ----
   Lo que suelta en cada aparición. No son adornos: cada una enseña UNA regla
   del enfrentamiento oculto en el nivel 100 del laberinto — dónde está, que la
   chancla sola no basta, que rescatar a todos le rompe la magia, que hay
   portales. Quien las lee llega al duelo sabiendo jugar. El orden rota con
   cada aparición, así que verlo tres veces son tres pistas distintas. */
export const BRUJO_FRASES = [
  "¡Jajá! Otro Florín para mi colección… ven a buscarlos al FONDO del laberinto",
  "99 niveles no se atreve nadie… y en el 100 estoy YO",
  "Tu chancla me hace cosquillas… mientras tenga mi magia",
  "Mi magia sale de los que tengo PRESOS… ¿y quién va a rescatarlos a todos?",
  "En mi Multiverso las dimensiones se cruzan por portales… no te pierdas",
  "Guardo TRES Florines que nadie ha visto jamás… y no pienso soltarlos",
];
/** Cada cuánto aparece (normal y en su casa, el Multiverso), y cuánto se queda. */
export const BRUJO_VISITA = 130, BRUJO_VISITA_MULTI = 60, BRUJO_SE_QUEDA = 8;

/** Los chanclazos que aguanta en el duelo, y lo que corre desesperado. */
export const BRUJO_VIDAS = 3, BRUJO_FURIA = 1.28;
/** La lluvia del final: cuántos florines suelta y lo que dura el festejo. */
export const LLUVIA_FLORINES = 28, LLUVIA_DURA = 3.2;

/** El color de un bicho por su id. Es la señal que se lee a CUALQUIER tamaño:
    en el nivel 30 el laberinto mide 57 celdas y un monstruo son doce píxeles de
    pantalla — ahí la silueta no se distingue y el color sí. Es lo que hacen los
    fantasmas del Pac-Man, y por eso lo hacen. */
export function colorDeBicho(id: string): string {
  if (id === BRUJO.id) return BRUJO.color;
  return BESTIARIO.find(b => b.id === id)?.color ?? "#FF5C86";
}

export const LAB_NIVELES = 100;
/** ¿Es el nivel 100? El final es UN nivel especial, no una curva: el Multiverso
    gigante con las ocho dimensiones cruzadas y el Brujo Supremo. Todo lo que
    pregunta por él pasa por aquí, para que "final" signifique una sola cosa. */
export const esNivelFinal = (n: number) => n >= LAB_NIVELES - 1;
export const LAB_FASES = LAB_NIVELES;

/** El escalón: cada SEIS niveles cambia todo a la vez. Con 99 niveles eso son
    dieciséis escalones, del laberinto de 15 celdas al de 47 — 4 324 px de lado,
    que es cuatro veces el primero. Cabe porque no tiene que caber: la cámara te
    sigue y el mapita de la esquina te sitúa.

    Que sea UN número y no uno por cosa es a propósito: si el tamaño creciera
    cada 6, los monstruos cada 8 y las jaulas cada 5, cada nivel cambiaría algo
    distinto y no se sabría qué. Así, cada seis niveles se nota un salto entero. */
export const LAB_ESCALON = 3;
const escalon = (n: number) => Math.floor(Math.max(0, n) / LAB_ESCALON);

/** Impar siempre, que es como funciona el cavado (celdas de paso en las
    impares, paredes en las pares) — y 15 + 2k lo es siempre. */
/* ---- la forma del laberinto ----
   No es cuadrado, y eso es a propósito: las pantallas son anchas y un laberinto
   cuadrado dejaba dos franjas de patio vacío a los lados. Con la proporción del
   mundo (3 600 × 2 100, o sea 1,7:1 — casi 16:9) el laberinto LLENA la pantalla
   a lo ancho, que es lo que se pidió.

   El alto crece un escalón cada tres niveles con tope: sin tope, el último
   mediría 79 celdas de alto y cruzarlo sería un paseo, no una persecución. */
export function altoDelNivel(n: number): number {
  /* El final es EL MÁS GRANDE de todos: 59 × 35 celdas, 5 400 px de ancho.
     Cuatro pantallas — para eso están los portales. */
  if (esNivelFinal(n)) return 35;
  return 15 + 2 * Math.min(escalon(n), 9);
}
export function anchoDelNivel(n: number): number {
  /* Impar siempre, que es como funciona el cavado. */
  const a = Math.round(altoDelNivel(n) * 1.7);
  return a % 2 ? a : a + 1;
}
/** El lado, para lo que solo necesita una medida (el reloj, las pruebas). */
export function ladoDelNivel(n: number): number { return altoDelNivel(n); }
/** Jaulas y monstruos. Los dos tienen tope, y los topes NO son por gusto:
    dieciséis escalones sin freno serían veinte jaulas y diecisiete monstruos.
    Ocho monstruos es el bestiario entero a la vez —el final de verdad— y
    dieciséis jaulas es lo que cabe en la fila (1 200 px de rastro a 46 px de
    separación dan para veintiséis, así que sobra). */
export function jaulasDelNivel(n: number): number {
  /* En el final se rescata a TODOS: un preso de cada dimensión más los tres
     Florines nuevos. La cuenta sale de la lista, no de la curva. */
  if (esNivelFinal(n)) return TEMA_MULTIVERSO.presos.length;
  return Math.min(4 + escalon(n), 16);
}
export function monstruosDelNivel(n: number): number {
  if (esNivelFinal(n)) return 5;         // el Brujo y su séquito
  return Math.min(1 + escalon(n), BESTIARIO.length);
}

/** Los amigos que pueden estar en las jaulas. */
export const AMIGOS = ["mayo", "sobri", "yuli", "marcia", "meche", "chato", "wilber", "charo"];

/* ---- los temas ----
   El laberinto no vive solo en el colegio: cada bloque de tres niveles se
   ambienta en uno de los escenarios que ya tiene el juego, y con el escenario
   cambia A QUIÉN RESCATAS. En el zoológico son los animales de los recintos; en
   la nave, los marcianitos; en la Prehistoria, los dinos. Es lo que hace que
   subir de nivel se sienta como VIAJAR y no como repetir el mismo pasillo.

   Los presos y los colores salen de aquí, así que añadir un tema es añadir una
   fila — y los dibujos de los animales son LOS MISMOS del recinto del zoo, no
   una copia (`dibujarAnimal` en el cliente).

   `pinta` le dice al cliente con qué mano dibujarlos. Los marcianitos son los
   vecinos Marcianos que este juego ya tiene desde el primer día, con su traje;
   no son el personaje de ningún otro juego. */
export const LAB_TEMAS: {
  id: string; nombre: string; pinta: string;
  presos: { id: string; label: string }[];
  pared: string; suelo: string; suelo2: string; fondo: string;
}[] = [
  { id: "colegio", nombre: "EL COLEGIO", pinta: "persona",
    presos: AMIGOS.map(a => ({ id: a, label: a })),
    pared: "#8B6BEE", suelo: "#2C1C40", suelo2: "#28183A", fondo: "#150E1F" },
  { id: "zoo", nombre: "EL ZOOLÓGICO", pinta: "animal",
    presos: [{ id: "jirafa", label: "Jirafa" }, { id: "leon", label: "León" },
             { id: "mono", label: "Mono" }, { id: "flamenco", label: "Flamencos" },
             { id: "oso", label: "Oso" }],
    pared: "#6FCF6A", suelo: "#1E3320", suelo2: "#1A2C1C", fondo: "#0E1810" },
  { id: "nave", nombre: "LA NAVE ESPACIAL", pinta: "marcianito",
    presos: [{ id: "rojo", label: "el Rojo" }, { id: "cian", label: "el Cian" },
             { id: "amarillo", label: "el Amarillo" }, { id: "verde", label: "el Verde" },
             { id: "morado", label: "el Morado" }],
    pared: "#5CE1EA", suelo: "#16283A", suelo2: "#122334", fondo: "#0A1420" },
  { id: "prehistoria", nombre: "LA PREHISTORIA", pinta: "dino",
    presos: [{ id: "cuellilargo", label: "Cuellilargo" }, { id: "pinchudo", label: "Pinchudo" },
             { id: "chiquito", label: "Chiquito" }, { id: "cornudo", label: "Tricornio" }],
    pared: "#FF9E5C", suelo: "#3A2416", suelo2: "#331F13", fondo: "#1C120A" },
  { id: "egipto", nombre: "EGIPTO", pinta: "momia",
    presos: [{ id: "momia1", label: "la Momia" }, { id: "momia2", label: "el Faraón" },
             { id: "momia3", label: "el Escriba" }, { id: "momia4", label: "la Reina" }],
    pared: "#FFC53D", suelo: "#3A3016", suelo2: "#332A13", fondo: "#1C170A" },
  /* Los tres nuevos salen del decorado que ya tiene cada escenario: el Amazonas
     tiene río, lianas y caimanes, así que se rescatan bichos de selva; el Volcán
     tiene cráter y ríos de lava, así que dragoncitos; y la Luna tiene módulo,
     bandera y huellas de bota, así que astronautas —distintos de los
     marcianitos de la nave, que van con su traje de color y su visor. */
  { id: "amazonas", nombre: "EL AMAZONAS", pinta: "selva",
    presos: [{ id: "guacamayo", label: "el Guacamayo" }, { id: "perezoso", label: "el Perezoso" },
             { id: "rana", label: "la Rana" }, { id: "tucan", label: "el Tucán" },
             { id: "caiman", label: "el Caimán" }],
    pared: "#3DDC97", suelo: "#17301F", suelo2: "#13281A", fondo: "#0A1810" },
  { id: "volcan", nombre: "EL VOLCÁN", pinta: "dragon",
    presos: [{ id: "rojo", label: "el Dragoncito" }, { id: "naranja", label: "Chispa" },
             { id: "negro", label: "Carboncito" }, { id: "azul", label: "el Raro" }],
    pared: "#FF5C5C", suelo: "#3A1A18", suelo2: "#331614", fondo: "#1C0C0A" },
  { id: "luna", nombre: "LA LUNA", pinta: "astronauta",
    presos: [{ id: "uno", label: "la Astronauta" }, { id: "dos", label: "el Comandante" },
             { id: "tres", label: "la Ingeniera" }, { id: "cuatro", label: "el Novato" }],
    pared: "#C9D4E8", suelo: "#22262E", suelo2: "#1D2028", fondo: "#101218" },
];
/* ---- EL MULTIVERSO: el tema del nivel 100 ----
   No entra en la rotación: es el final. El laberinto se parte en OCHO BANDAS
   verticales —una por dimensión, cada una con los colores de su tema— y en cada
   banda hay un preso de ese mundo. Y en las bandas centrales, los tres Florines
   nuevos: los más espectaculares jamás vistos, que solo existen aquí.

   Los ids de los presos son los reales de cada tema (elegidos SIN colisiones:
   «rojo» existe en la nave y en el volcán, así que de la nave va el Cian y del
   volcán Carboncito), y así el cliente los dibuja con el pintor de su mundo sin
   ninguna tabla nueva. */
export const TEMA_MULTIVERSO = {
  id: "multiverso", nombre: "EL MULTIVERSO", pinta: "multi",
  presos: [
    { id: "mayo",        label: "Mayo" },            // el colegio
    { id: "leon",        label: "el León" },         // el zoológico
    { id: "cian",        label: "el Cian" },         // la nave
    { id: "cuellilargo", label: "Cuellilargo" },     // la Prehistoria
    { id: "momia2",      label: "el Faraón" },       // Egipto
    { id: "guacamayo",   label: "el Guacamayo" },    // el Amazonas
    { id: "negro",       label: "Carboncito" },      // el Volcán
    { id: "dos",         label: "el Comandante" },   // la Luna
    { id: "florin-prisma",   label: "el Florín Prisma" },
    { id: "florin-eclipse",  label: "el Florín Eclipse" },
    { id: "florin-infinito", label: "el Florín Infinito" },
  ],
  pared: "#E14CFF", suelo: "#241436", suelo2: "#1F1030", fondo: "#0E0618",
};

export function temaDelNivel(n: number) {
  if (esNivelFinal(n)) return TEMA_MULTIVERSO;
  return LAB_TEMAS[escalon(n) % LAB_TEMAS.length];
}

/* ---- los especiales del bloque ----
   Cada tres niveles cambia la pareja: una comida y un arma. Es lo que mantiene
   los 99 niveles distintos DESPUÉS de que el tamaño y la cantidad topen —
   cinco comidas por cuatro armas por tres formas de laberinto son sesenta
   combinaciones, y el monstruo de cabecera rota aparte.

   Ninguno es un adorno. Cada uno cambia una decisión concreta del nivel: con
   Granadilla ya no hay que explorar a ciegas, con Tiza puedes cerrar un pasillo
   y trabajar tranquilo, con Helado te arriesgas a un callejón porque te
   perdonan una. */
export const LAB_COMIDAS: { id: string; nombre: string; efecto: string; dura: number; dice: string }[] = [
  { id: "mango",      nombre: "MANGO",         efecto: "veloz",  dura: 8,  dice: "¡Corres más!" },
  { id: "chicha",     nombre: "CHICHA MORADA", efecto: "calma",  dura: 7,  dice: "¡Se retiran!" },
  { id: "granadilla", nombre: "GRANADILLA",    efecto: "luz",    dura: 14, dice: "¡Ves las jaulas!" },
  { id: "helado",     nombre: "HELADO",        efecto: "escudo", dura: 25, dice: "¡Te perdonan una!" },
  { id: "maracuya",   nombre: "MARACUYÁ",      efecto: "fila",   dura: 0,  dice: "¡Tu fila te alcanza!" },
];
export const LAB_ARMAS: { id: string; nombre: string; usos: number; dice: string }[] = [
  { id: "tiza",     nombre: "TIZA",      usos: 2, dice: "una raya que no cruzan" },
  { id: "silbato",  nombre: "SILBATO",   usos: 2, dice: "huyen de ti" },
  { id: "linterna", nombre: "LINTERNA",  usos: 3, dice: "congela al de delante" },
  { id: "mochila",  nombre: "MOCHILAZO", usos: 1, dice: "todos a su esquina" },
];
export function especialesDelNivel(n: number): {
  comida: typeof LAB_COMIDAS[number]; arma: typeof LAB_ARMAS[number];
} {
  const b = escalon(n);
  /* Cinco y cuatro, que no tienen divisor común: la pareja no se repite hasta
     el bloque veinte, o sea el nivel sesenta. */
  return { comida: LAB_COMIDAS[b % LAB_COMIDAS.length], arma: LAB_ARMAS[b % LAB_ARMAS.length] };
}
/** Lo que dura un poder, del propio catálogo. */
export function comidaPorId(id: string) { return LAB_COMIDAS.find(c => c.id === id); }
export function armaPorId(id: string) { return LAB_ARMAS.find(a => a.id === id); }
/** El alcance de las armas del laberinto, en celdas. */
export const LAB_SILBATO = 5, LAB_LINTERNA = 4, LAB_MOCHILA = 3;
export const LAB_TIZA_DURA = 12, LAB_HUIDA = 7, LAB_CONGELA = 5;
/** El reloj del nivel. No es uno para toda la partida —con 99 niveles eso no
    tiene sentido—: cada nivel trae el suyo, y quedarse sin tiempo acaba la
    racha. La cuenta sale de lo que el nivel PIDE: un rato por jaula más el
    tamaño del laberinto, porque cruzar uno de 47 celdas cuesta lo suyo. */
export function relojDelNivel(n: number): number {
  /* Sale de lo que el nivel PIDE: un rato por jaula más lo que mide el
     laberinto. El tamaño pesa el doble desde que es rectangular — el de arriba
     mide 57 × 33 celdas y cruzarlo de punta a punta son 5 244 px.

     El final lleva un plus: once jaulas repartidas por ocho dimensiones y un
     Brujo tirándote a otra parte no se hacen con el reloj de un nivel normal. */
  const base = 35 + jaulasDelNivel(n) * 12 + (anchoDelNivel(n) + altoDelNivel(n)) * 2;
  return esNivelFinal(n) ? base + 95 : base;
}

/* ---- las variantes ----
   El tamaño y la cantidad solos convierten el nivel 60 en el nivel 1 pero más
   largo. Lo que de verdad cambia una persecución es la FORMA del laberinto y el
   RITMO de los monstruos, y eso es lo que rota aquí.

   El trenzado es el que más se nota: un laberinto cavado de la forma normal no
   tiene bucles —entre dos puntos hay un solo camino—, así que huir es elegir
   bien la primera vez y luego rezar. Tumbando algunas paredes de más aparecen
   bucles, y con bucles se puede DAR LA VUELTA a un monstruo. Son dos juegos
   distintos, y a partir del nivel 7 se alternan. */
export function varianteDelNivel(n: number): {
  trenzado: number; caza: number; retirada: number; nombre: string;
} {
  /* El final tiene forma propia: dimensiones cruzadas — bucles de sobra para
     poder darle la vuelta al Brujo, y el ritmo del tope. */
  if (esNivelFinal(n))
    return { trenzado: 0.3, caza: FANTASMA_CAZA + 6, retirada: 2.5,
             nombre: "dimensiones cruzadas" };
  const forma = escalon(n) % 3;
  return {
    /* Qué parte de los callejones sin salida se abre. 0 es el laberinto puro. */
    trenzado: forma === 0 ? 0 : forma === 1 ? 0.18 : 0.38,
    /* Y el ritmo aprieta con los escalones: menos descanso arriba, con suelo.
       Sin suelo, en el nivel 90 no habría ventana para rescatar a nadie. */
    caza: FANTASMA_CAZA + Math.min(escalon(n) * 0.4, 6),
    retirada: Math.max(2.5, FANTASMA_RETIRADA - escalon(n) * 0.15),
    nombre: forma === 0 ? "sin vueltas" : forma === 1 ? "con atajos" : "todo bucles",
  };
}

/** El de cabecera del nivel: el que se anuncia en el cartel. */
export function monstruoDelNivel(n: number): { id: string; nombre: string; vel: number } {
  if (esNivelFinal(n)) return BRUJO;
  return BESTIARIO[Math.max(0, n) % BESTIARIO.length];
}
/** Quiénes salen en el nivel: el de cabecera primero y detrás los ya conocidos,
    hacia atrás. Así el monstruo nuevo es el que ves primero. */
export function monstruosDe(n: number): { id: string; nombre: string; vel: number }[] {
  /* El final: el Brujo delante y un séquito de los rápidos y los raros. */
  if (esNivelFinal(n))
    return [BRUJO, BESTIARIO[3], BESTIARIO[5], BESTIARIO[1], BESTIARIO[7]];
  const cuantos = monstruosDelNivel(n);
  const salen = [];
  for (let k = 0; k < cuantos; k++)
    salen.push(BESTIARIO[((n - k) % BESTIARIO.length + BESTIARIO.length) % BESTIARIO.length]);
  return salen;
}
/** El radio de quien anda por ahí, para las paredes. Va HOLGADO a propósito:
    con 22 sobre pasillos de 92 px, cualquiera que fuera un poco descentrado se
    clavaba en la esquina de la celda de al lado. */
export const LAB_BULTO = 15;
/** Lo que corren los fantasmas y lo que cuesta que te pillen.

    Van más lentos que tú a propósito (tú vas a 268): el castigo de que te
    pillen es volver a la entrada, y eso ya es carísimo en un laberinto de 23
    celdas. Cuando iban a 168 te cazaban veinte o treinta veces por partida y el
    juego era un pasillo de ida y vuelta. */
export const FANTASMA_VEL = 132, FANTASMA_STUN = 1.2;
/** Lo que te dejan en paz después de devolverte a la entrada. */
export const FANTASMA_TREGUA = 3.2;
/** La ronda: lo que persiguen y lo que se retiran. */
export const FANTASMA_CAZA = 9, FANTASMA_RETIRADA = 5;
/** Lo que dura la partida entera, y el descanso entre fases. */
export const LAB_RELOJ = 240, LAB_ENTRE_FASES = 2.2;
/** Lo que se separan los amigos en la fila, y cuánto rastro se guarda. Con
    ciento veinte migas de 10 px hay 1 200 px de fila: de sobra para los nueve
    amigos de la última fase. */
export const LAB_FILA = 46, LAB_MIGA = 10, LAB_RASTRO = 120;

export function aElLaberinto(e: Estado): void {
  /* El laberinto se queda SOLO. Los demás minijuegos ya limpian sus trastos;
     aquí es todavía más necesario, porque una patineta tirada en un pasillo se
     monta sola al pisarla y te lleva a donde ella quiera. */
  e.trastos = [];
  e.laberinto = {
    origen: { x: 0, y: 0 }, celda: LAB_CELDA, celdas: [], ancho: 0, alto: 0,
    fase: 0, fases: LAB_FASES, jaulas: [], fantasmas: [],
    puntos: e.players.map(() => 0),
    entrada: { x: 0, y: 0 }, rastros: e.players.map(() => []),
    ronda: FANTASMA_CAZA, entreFases: 0,
    caza: FANTASMA_CAZA, retirada: FANTASMA_RETIRADA, forma: "sin vueltas",
    especiales: [], tizas: [], tema: LAB_TEMAS[0].id,
    portales: [], portalCd: e.players.map(() => 0), magia: 0, magiaN: 0,
    duelo: false, brujoVidas: 0, lluvia: [], festejo: 0,
    poderes: e.players.map(() => null), bolsas: e.players.map(() => null),
    reloj: relojDelNivel(0), ganador: null,
  };
  repartirEquipos(e);
  montarFaseDelLaberinto(e, 0);
}

/** Monta una fase: rejilla nueva, jaulas nuevas y fantasmas nuevos. */
export function montarFaseDelLaberinto(e: Estado, fase: number): void {
  const l = e.laberinto;
  if (!l) return;
  const { cx, cy } = centroDelMapa();
  /* RECTANGULAR, en la proporción del mundo: un laberinto cuadrado dejaba dos
     franjas de patio vacío a los lados de la pantalla. */
  const ancho = anchoDelNivel(fase), alto = altoDelNivel(fase);
  const c = LAB_CELDA;
  const origen = { x: Math.round(cx - (ancho * c) / 2), y: Math.round(cy - (alto * c) / 2) };
  const centroDe = (gx: number, gy: number) =>
    ({ x: origen.x + gx * c + c / 2, y: origen.y + gy * c + c / 2 });

  /* Todo pared, y se cava de dos en dos: una celda de paso y una de pared entre
     medias, que es lo que hace que salgan pasillos y no una sala. */
  const celdas: boolean[][] = [];
  for (let y = 0; y < alto; y++) { celdas[y] = []; for (let x = 0; x < ancho; x++) celdas[y][x] = true; }
  const pila: [number, number][] = [[1, 1]];
  celdas[1][1] = false;
  while (pila.length) {
    const [gx, gy] = pila[pila.length - 1];
    const dirs: [number, number][] = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    const sinVer = dirs.filter(([dx, dy]) => celdas[gy + dy]?.[gx + dx]);
    if (!sinVer.length) { pila.pop(); continue; }
    const [dx, dy] = sinVer[Math.floor(azar(e) * sinVer.length)];
    celdas[gy + dy / 2][gx + dx / 2] = false;
    celdas[gy + dy][gx + dx] = false;
    pila.push([gx + dx, gy + dy]);
  }

  /* ---- el trenzado ----
     El cavado normal no deja bucles: entre dos puntos hay UN camino, así que
     huir es acertar la primera vez y luego rezar. Abriendo parte de los
     callejones sin salida aparecen bucles, y con bucles se puede dar la vuelta
     a un monstruo. Son dos juegos distintos, y por eso rota por niveles.

     Se tumba la pared que da a OTRO PASILLO, no una cualquiera: tumbar paredes
     al azar deja salas, y una sala no es un laberinto. */
  const V = varianteDelNivel(fase);
  const T = temaDelNivel(fase);
  const salidasDe = (x: number, y: number) =>
    ([[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][])
      .filter(([dx, dy]) => celdas[y + dy]?.[x + dx] === false).length;
  if (V.trenzado > 0) {
    const ciegos: [number, number][] = [];
    for (let y = 1; y < alto - 1; y++) for (let x = 1; x < ancho - 1; x++)
      if (!celdas[y][x] && salidasDe(x, y) === 1) ciegos.push([x, y]);
    const cuantos = Math.floor(ciegos.length * V.trenzado);
    for (let k = 0; k < cuantos; k++) {
      const [x, y] = ciegos[Math.floor(azar(e) * ciegos.length)];
      const opciones = ([[0, -2], [0, 2], [-2, 0], [2, 0]] as [number, number][])
        .filter(([dx, dy]) => celdas[y + dy]?.[x + dx] === false &&
                              celdas[y + dy / 2]?.[x + dx / 2] === true);
      if (!opciones.length) continue;
      const [dx, dy] = opciones[Math.floor(azar(e) * opciones.length)];
      celdas[y + dy / 2][x + dx / 2] = false;
    }
  }

  const libres: [number, number][] = [];
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++)
    if (!celdas[y][x] && !(x === 1 && y === 1)) libres.push([x, y]);

  /* Las jaulas van en los CALLEJONES SIN SALIDA —un amigo al fondo de un
     callejón con un monstruo detrás es justo la decisión que este juego
     quiere—, pero REPARTIDAS por todo el laberinto y no amontonadas al fondo.
     Poniéndolas en las celdas más lejanas, el laberinto se convertía en una
     excursión: cuatro rescates en tres minutos, medido. */
  const cuantas = jaulasDelNivel(fase);
  const final = esNivelFinal(fase);
  /* En el final el laberinto se parte en OCHO BANDAS verticales, una por
     dimensión. La banda de una celda es esto, y de aquí sale todo lo demás:
     dónde nace cada preso, de qué color se pinta cada tramo y qué conecta cada
     portal. */
  const bandaDe = (gx: number) => Math.min(7, Math.floor(gx * 8 / ancho));
  const callejones = libres.filter(([x, y]) => salidasDe(x, y) === 1);
  /* Con trenzado quedan pocos callejones —es el punto del trenzado—, así que
     ahí se completa con los cruces más lejanos de la entrada. Sin esto, un nivel
     «todo bucles» nacía con dos jaulas en vez de doce. */
  if (callejones.length < cuantas) {
    const lejos = libres.slice()
      .sort((a2, b2) => (Math.abs(b2[0] - 1) + Math.abs(b2[1] - 1)) -
                        (Math.abs(a2[0] - 1) + Math.abs(a2[1] - 1)));
    const salto2 = Math.max(1, Math.floor(lejos.length / (cuantas * 2)));
    for (const cel of lejos.filter((_, k) => k % salto2 === 0)) {
      if (callejones.length >= cuantas * 2) break;
      if (!callejones.some(([x, y]) => x === cel[0] && y === cel[1])) callejones.push(cel);
    }
  }
  /* Uno de cada N a lo largo de la lista, que recorre la rejilla en orden: así
     salen esparcidos por el mapa y no todos en la misma esquina. */
  const salto = Math.max(1, Math.floor(callejones.length / cuantas));
  const candidatas = callejones.filter((_, k) => k % salto === 0);
  const elegidas = candidatas.slice(0, cuantas);
  if (elegidas.length < cuantas) {
    const resto = libres
      .filter(([x, y]) => !elegidas.some(([ex, ey]) => ex === x && ey === y))
      .sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]));
    elegidas.push(...resto.slice(0, cuantas - elegidas.length));
  }
  /* ---- el final: cada preso EN SU DIMENSIÓN ----
     El preso del zoológico nace en la banda del zoológico y el Faraón en la de
     Egipto; los tres Florines nuevos, en las bandas centrales. Con el reparto
     genérico salían mezclados, y entonces las bandas serían pintura y no
     mundos. Se elige entre los callejones de la banda —la jaula al fondo de un
     callejón es la decisión de este juego— y si el trenzado no dejó ninguno,
     cualquier celda libre de la banda lejos de la entrada. */
  if (final) {
    elegidas.length = 0;
    const usadas = new Set<string>();
    T.presos.forEach((_, k) => {
      const banda = k < 8 ? k : [2, 4, 6][k - 8];
      const deLaBanda = (lista: [number, number][]) =>
        lista.filter(([x, y]) => bandaDe(x) === banda && !usadas.has(x + "," + y) &&
                                 Math.abs(x - 1) + Math.abs(y - 1) > 6);
      const cands = deLaBanda(callejones).length ? deLaBanda(callejones) : deLaBanda(libres);
      const [x, y] = cands.length ? cands[Math.floor(azar(e) * cands.length)]
                                  : libres[Math.floor(azar(e) * libres.length)];
      usadas.add(x + "," + y);
      elegidas.push([x, y]);
    });
  }
  const jaulas: Jaula[] = elegidas.map(([x, y], k) => {
    const sitio = centroDe(x, y);
    return {
      ...sitio,
      quien: final ? T.presos[k].id : T.presos[(fase * 3 + k) % T.presos.length].id,
      libre: false, porQuien: null, puesto: 0,
      amigo: { ...sitio },
    };
  });

  /* ---- los dos especiales del bloque ----
     Uno de comer y un arma, tirados LEJOS de la entrada y lejos de las jaulas:
     un especial pegado a la salida es un regalo, y encima de una jaula no se ve.
     Ir por ellos tiene que ser una decisión —desviarse cuesta tiempo—, que es
     justo lo que los hace interesantes. */
  const { comida, arma } = especialesDelNivel(fase);
  const ocupadas = new Set(elegidas.map(([x, y]) => x + "," + y));
  const lejosDeTodo = libres
    .filter(([x, y]) => !ocupadas.has(x + "," + y))
    .filter(([x, y]) => Math.abs(x - 1) + Math.abs(y - 1) > (ancho + alto) / 4);
  const paraEspecial = (k: number): { x: number; y: number } => {
    if (!lejosDeTodo.length) return centroDe(Math.floor(ancho / 2), Math.floor(alto / 2));
    /* Repartidos por la lista, que recorre la rejilla en orden: uno tira a un
       lado del laberinto y el otro al otro. */
    const [x, y] = lejosDeTodo[Math.floor(lejosDeTodo.length * (k === 0 ? 0.28 : 0.72))];
    return centroDe(x, y);
  };
  const especiales: Especial[] = [
    { ...paraEspecial(0), clase: "comida", tipo: comida.id, tomado: false },
    { ...paraEspecial(1), clase: "arma", tipo: arma.id, tomado: false },
  ];

  /* Los monstruos nacen repartidos por las esquinas del fondo, LEJOS de la
     entrada: nacer al lado de donde apareces es una emboscada, no un juego.
     Cada uno trae su tipo del bestiario, y con él su dibujo y su velocidad. */
  const quienes = monstruosDe(fase);
  const esquinas: [number, number][] = [
    [ancho - 2, alto - 2], [1, alto - 2], [ancho - 2, 1],
    [Math.floor(ancho / 2), Math.floor(alto / 2)], [Math.floor(ancho / 2), alto - 2],
    [Math.floor(ancho * 0.75), 1], [Math.floor(ancho * 0.25), alto - 2],
    [ancho - 2, Math.floor(alto / 2)],
  ];
  const fantasmas: Fantasma[] = quienes.map((m, k) => {
    const [ex, ey] = esquinas[k % esquinas.length];
    const cerca = libres.reduce((mm, [x, y]) =>
      Math.abs(x - ex) + Math.abs(y - ey) < Math.abs(mm[0] - ex) + Math.abs(mm[1] - ey) ? [x, y] : mm, libres[0]);
    const sitio = centroDe(cerca[0], cerca[1]);
    return { ...sitio, vx: 0, vy: 0, casa: { ...sitio }, tipo: m.id, vel: m.vel, stun: 0, huye: 0 };
  });

  l.origen = origen; l.celda = c; l.celdas = celdas;
  l.ancho = ancho; l.alto = alto;
  l.fase = fase; l.jaulas = jaulas; l.fantasmas = fantasmas;
  l.especiales = especiales;
  l.tizas = [];
  l.poderes = e.players.map(() => null);
  l.bolsas = e.players.map(() => null);
  l.entreFases = 0;

  /* ---- los portales del final ----
     Cuatro pares que CRUZAN el Multiverso: la dimensión 0 con la 7, la 1 con la
     6… Sin ellos, un laberinto de 5 400 px es una caminata; con ellos es un
     mapa que se piensa — a la Luna se puede llegar por el colegio. Nacen en
     celdas libres de su banda, lejos de las jaulas. */
  l.portales = [];
  if (final) {
    const tomadas = new Set(elegidas.map(([x, y]) => x + "," + y));
    for (let par = 0; par < 4; par++)
      for (const banda of [par, 7 - par]) {
        const cands = libres.filter(([x, y]) => bandaDe(x) === banda &&
          !tomadas.has(x + "," + y) && Math.abs(x - 1) + Math.abs(y - 1) > 4);
        const [x, y] = cands[Math.floor(azar(e) * cands.length)] ?? libres[0];
        tomadas.add(x + "," + y);
        l.portales.push({ ...centroDe(x, y), par });
      }
  }
  l.portalCd = e.players.map(() => 0);
  l.magia = final ? LAB_MAGIA : 0;
  l.magiaN = 0;
  l.duelo = false;
  l.brujoVidas = final ? BRUJO_VIDAS : 0;
  l.lluvia = [];
  l.festejo = 0;

  /* El ritmo también es del nivel: arriba persiguen más y descansan menos. */
  l.caza = V.caza; l.retirada = V.retirada; l.forma = V.nombre;
  l.tema = T.id;
  l.ronda = V.caza;
  /* El reloj es DE ESTE NIVEL, no de la partida. Con 99 niveles un solo reloj
     no significa nada: o sobra para los tres primeros o no llega ni al décimo. */
  l.reloj = relojDelNivel(fase);
  /* Todos salen de la entrada, separados un poco para no nacer encajados. */
  const entrada = centroDe(1, 1);
  l.entrada = entrada;
  l.rastros = e.players.map(() => [{ ...entrada }]);
  e.players.forEach((p, i) => {
    p.x = entrada.x + (i % 2 ? 16 : -16);
    p.y = entrada.y + (i > 1 ? 16 : -16);
    p.vx = 0; p.vy = 0; p.stun = 0; p.inmune = 0; p.montado = null;
    if (p.bot) p.bot.meta = undefined;
  });
}

/** ¿Es pared esta celda? Lo de fuera de la rejilla también. */
export const esPared = (l: Laberinto, gx: number, gy: number): boolean =>
  l.celdas[gy]?.[gx] !== false;

/** En qué celda está algo. */
export const celdaDeLaberinto = (l: Laberinto, x: number, y: number): [number, number] =>
  [Math.floor((x - l.origen.x) / l.celda), Math.floor((y - l.origen.y) / l.celda)];

/** El centro de una celda, en píxeles. */
export const centroDeCelda = (l: Laberinto, gx: number, gy: number) =>
  ({ x: l.origen.x + gx * l.celda + l.celda / 2,
     y: l.origen.y + gy * l.celda + l.celda / 2 });

/** La celda LIBRE donde está algo, o la libre más cercana si `floor` lo ha
    metido en una de pared.

    Esto no es un detalle: rozando el borde de un pasillo, `floor` te sitúa en la
    celda de pared de al lado. Desde ahí el camino por pasillos no existe, y
    tanto el bot como el fantasma acababan tirando en línea recta contra el muro
    y sin moverse — medido: los dos jugadores y el fantasma congelados en el
    segundo 20, y la partida sin acabar nunca. */
export function celdaLibreDe(l: Laberinto, x: number, y: number): [number, number] {
  const [gx, gy] = celdaDeLaberinto(l, x, y);
  if (!esPared(l, gx, gy)) return [gx, gy];
  let mejor: [number, number] | null = null, bd = Infinity;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cy = gy + dy;
      if (esPared(l, cx, cy)) continue;
      const c = centroDeCelda(l, cx, cy);
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; mejor = [cx, cy]; }
    }
  return mejor ?? [gx, gy];
}


/* ---- el billar ----
   Por turnos, y con la regla que hace que un turno sea interesante: **si metes,
   sigues tirando**. La blanca metida vuelve a la mesa y el turno se va.

   La física de choques y de hoyas ya estaba escrita; lo que no había era quién
   tira, cuándo, y qué pasa después. */
export const MESA_BILLAR = { w: 1100, h: 620 };
export const BOLA_BILLAR_R = 15, HOYA_R = 32, BILLAR_ESPERA = 0.7;
/** Cuántas de color hay. */
export const BILLAR_COLORES = 7;

export function aLaMesaDeBillar(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const mesa = {
    x: Math.round(cx - MESA_BILLAR.w / 2), y: Math.round(cy - MESA_BILLAR.h / 2),
    w: MESA_BILLAR.w, h: MESA_BILLAR.h,
  };
  /* Seis hoyas, como una mesa de verdad: las cuatro esquinas y dos en medio de
     los lados largos. Con solo cuatro, la mitad de la mesa no tiene salida. */
  const b = 34;
  const hoyas = [
    { x: mesa.x + b, y: mesa.y + b }, { x: mesa.x + mesa.w - b, y: mesa.y + b },
    { x: mesa.x + b, y: mesa.y + mesa.h - b }, { x: mesa.x + mesa.w - b, y: mesa.y + mesa.h - b },
    { x: mesa.x + mesa.w / 2, y: mesa.y + b - 6 },
    { x: mesa.x + mesa.w / 2, y: mesa.y + mesa.h - b + 6 },
  ];

  /* El triángulo, a la derecha; la blanca, a la izquierda. */
  const bolas: Bola[] = [];
  const px = mesa.x + mesa.w * 0.68, py = cy;
  const paso = BOLA_BILLAR_R * 2 + 2;
  let n = 0;
  for (let fila = 0; fila < 4 && n < BILLAR_COLORES; fila++)
    for (let k = 0; k <= fila && n < BILLAR_COLORES; k++, n++)
      bolas.push({
        x: px + fila * paso * 0.87,
        y: py + (k - fila / 2) * paso,
        vx: 0, vy: 0, color: n + 1, hoya: false,
      });
  bolas.push({ x: mesa.x + mesa.w * 0.22, y: cy, vx: 0, vy: 0, color: 0, hoya: false });

  e.billar = {
    mesa, hoyas, bolas, turno: 0, puntos: e.players.map(() => 0),
    rodando: false, ultimo: null, espera: 0, ganador: null,
  };
  repartirEquipos(e);
  colocarParaTacar(e);
}

/** La blanca a la mesa, en un hueco libre de la banda izquierda. */
export function reponerLaBlanca(e: Estado): void {
  const bl = e.billar;
  if (!bl) return;
  const blanca = bl.bolas.find(b => b.color === 0);
  if (!blanca) return;
  blanca.hoya = false;
  blanca.vx = 0; blanca.vy = 0;
  /* Un sitio donde no toque a nadie: se prueba desde el punto de saque hacia
     arriba y hacia abajo. Sin esto puede reaparecer dentro de otra bola. */
  const cy = bl.mesa.y + bl.mesa.h / 2;
  const x = bl.mesa.x + bl.mesa.w * 0.22;
  for (const dy of [0, -60, 60, -120, 120, -180, 180]) {
    const y = clamp(cy + dy, bl.mesa.y + HOYA_R, bl.mesa.y + bl.mesa.h - HOYA_R);
    const libre = bl.bolas.every(b =>
      b.color === 0 || b.hoya || dist2(b.x, b.y, x, y) > (BOLA_BILLAR_R * 2.4) ** 2);
    if (libre) { blanca.x = x; blanca.y = y; return; }
  }
  blanca.x = x; blanca.y = cy;
}

/** El que tira, junto a la blanca; el que espera, al borde de la mesa. */
export function colocarParaTacar(e: Estado): void {
  const bl = e.billar;
  if (!bl) return;
  bl.espera = 0;
  bl.rodando = false;
  const blanca = bl.bolas.find(b => b.color === 0);
  e.players.forEach((p, i) => {
    if (i === bl.turno && blanca) { p.x = blanca.x - 46; p.y = blanca.y; }
    else { p.x = bl.mesa.x - 70; p.y = bl.mesa.y + 60 + (i % 3) * 90; }
    p.vx = 0; p.vy = 0; p.stun = 0; p.montado = null;
  });
}


/* ---- air hockey ----
   Una mesa, un disco y dos arcos. Nadie cruza la línea del medio: es la regla
   del juego de verdad y además es lo que lo hace un duelo de reflejos en vez
   de un montón de gente persiguiendo un disco. */
export const MESA_HOCKEY = { w: 1200, h: 700 };
export const HOCKEY_META = 5, HOCKEY_SAQUE = 1.4, HOCKEY_RELOJ = 150;
/** Lo que mide la boca del arco y lo hondo que es. */
const ARCO_HOCKEY = { w: 16, h: 210 };

export function aAirHockey(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const mesa = {
    x: Math.round(cx - MESA_HOCKEY.w / 2), y: Math.round(cy - MESA_HOCKEY.h / 2),
    w: MESA_HOCKEY.w, h: MESA_HOCKEY.h,
  };
  const ay = Math.round(cy - ARCO_HOCKEY.h / 2);
  const arcos: [Rect, Rect] = [
    { x: mesa.x, y: ay, w: ARCO_HOCKEY.w, h: ARCO_HOCKEY.h },
    { x: mesa.x + mesa.w - ARCO_HOCKEY.w, y: ay, w: ARCO_HOCKEY.w, h: ARCO_HOCKEY.h },
  ];
  e.hockey = {
    mesa, arcos, puck: { x: cx, y: cy, vx: 0, vy: 0 }, puntos: [0, 0],
    meta: HOCKEY_META, saque: HOCKEY_SAQUE, sacador: 0, ultimoGol: null,
    quieto: 0, recarga: e.players.map(() => 0), reloj: HOCKEY_RELOJ, ganador: null,
  };
  repartirEquipos(e);
  sacarEnHockey(e);
}

/** Disco al centro y cada uno en su mitad. */
export function sacarEnHockey(e: Estado): void {
  const h = e.hockey;
  if (!h) return;
  const m = h.mesa, cx = m.x + m.w / 2, cy = m.y + m.h / 2;
  h.puck.x = cx; h.puck.y = cy; h.puck.vx = 0; h.puck.vy = 0;
  h.quieto = 0;

  const porEquipo = [0, 1].map(q => e.players.filter(p => p.equipo === q));
  porEquipo.forEach((equipo, q) => {
    const lado = q === 0 ? -1 : 1;
    equipo.forEach((p, k) => {
      p.x = cx + lado * (150 + k * 130);
      p.y = cy + (k - (equipo.length - 1) / 2) * 190;
      p.vx = 0; p.vy = 0;
      p.stun = 0;
      p.montado = null;
    });
  });
}

/* ---- vóley ----
   El mismo esqueleto que el tenis —dos lados, una red, la pelota con altura—
   con una regla menos y una más: aquí el suelo NO es legal (un toque de suelo
   es el punto) y hay tres toques por lado antes de pasarla. */
export const CANCHA_VOLEY_JUEGO = { w: 1180, h: 620 };
export const VOLEY_META = 5, VOLEY_SAQUE = 2.2, VOLEY_RED_ALTO = 62;
/** Toques que puede dar un lado antes de mandarla al otro. */
export const VOLEY_TOQUES = 3;

export function aLaCanchaDeVoley(e: Estado): void {
  const { cx, cy } = centroDelMapa();
  const cancha = {
    x: Math.round(cx - CANCHA_VOLEY_JUEGO.w / 2), y: Math.round(cy - CANCHA_VOLEY_JUEGO.h / 2),
    w: CANCHA_VOLEY_JUEGO.w, h: CANCHA_VOLEY_JUEGO.h,
  };

  /* La pelota es un trasto, como la del fútbol y la del tenis: así vuela con la
     misma `z`, la misma gravedad y el mismo código de dibujo con sombra. */
  let balon = e.trastos.find(t => t.tipo === "pelota");
  if (!balon) {
    balon = { id: nuevoId(e), tipo: "pelota", x: cx, y: cy, z: 0, vz: 0, vx: 0, vy: 0,
              montadoPor: null, pateadoPor: null, giro: 0, variante: 0 };
    e.trastos.push(balon);
  }
  e.trastos = e.trastos.filter(t => t === balon);

  e.voley = {
    cancha, redX: Math.round(cx), redAlto: VOLEY_RED_ALTO, balon: balon.id,
    puntos: [0, 0], meta: VOLEY_META, saque: VOLEY_SAQUE, sacador: 0,
    ultimoToque: null, toques: 0, enviada: false, bloqueo: 0,
    ultimoPunto: null, ganador: null,
  };
  repartirEquipos(e);
  colocarParaElSaqueDeVoley(e);
}

/** En qué mitad cae una x. La 0 es la de la izquierda. */
export const ladoDeVoley = (v: Voley, x: number): 0 | 1 => (x < v.redX ? 0 : 1);

/** Cada uno en su mitad y la pelota en la mano del que saca. */
export function colocarParaElSaqueDeVoley(e: Estado): void {
  const v = e.voley;
  if (!v) return;
  const c = v.cancha, cy = c.y + c.h / 2, medio = c.w / 2;

  const balon = e.trastos.find(x => x.id === v.balon);
  const haciaSacador = v.sacador === 0 ? -1 : 1;
  if (balon) {
    balon.x = v.redX + haciaSacador * medio * 0.82;
    balon.y = cy;
    balon.vx = 0; balon.vy = 0; balon.z = 0; balon.vz = 0;
    balon.pateadoPor = null;
  }
  v.ultimoToque = null;
  v.toques = 0;
  v.enviada = false;
  v.bloqueo = 0;

  const porEquipo = [0, 1].map(q => e.players.filter(p => p.equipo === q));
  porEquipo.forEach((equipo, q) => {
    const suLado = q === 0 ? -1 : 1;
    equipo.forEach((p, k) => {
      p.x = v.redX + suLado * medio * (0.62 - k * 0.30);
      p.y = cy + (k - (equipo.length - 1) / 2) * 190;
      p.vx = 0; p.vy = 0;
      p.stun = 0;
      p.montado = null;
    });
  });
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
