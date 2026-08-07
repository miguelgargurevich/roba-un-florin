/* Utilidades del motor.

   Lo importante de este archivo es el RNG: el prototipo usaba Math.random() por
   todos lados, y eso hace la simulación imposible de reproducir y de testear. Aquí
   el azar vive en el estado (`rngEstado`), así que dos máquinas con la misma
   semilla y las mismas entradas obtienen exactamente la misma partida. Eso es lo
   que después permite que el servidor sea la autoridad y detecte tramposos. */

import type { Estado, Rect } from "./tipos.js";

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const inRect = (x: number, y: number, r: Rect, pad = 0) =>
  x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;

/* ---- azar reproducible (mulberry32) ---- */

/** Devuelve [0,1) y avanza el estado del generador. */
export function azar(e: Estado): number {
  e.rngEstado = (e.rngEstado + 0x6d2b79f5) | 0;
  let t = e.rngEstado;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rnd = (e: Estado, a: number, b: number) => a + azar(e) * (b - a);
export const pick = <T>(e: Estado, arr: T[]): T => arr[(azar(e) * arr.length) | 0];

/** Sortea una fila de una tabla con pesos en `p`. */
export function tiraDeTabla<T extends { p: number }>(e: Estado, tabla: T[]): T {
  const total = tabla.reduce((s, x) => s + x.p, 0);
  let r = azar(e) * total;
  for (const fila of tabla) {
    r -= fila.p;
    if (r <= 0) return fila;
  }
  return tabla[tabla.length - 1];
}

/** Formato de dinero, aquí porque los textos de evento lo usan. */
export const money = (v: number) =>
  "$" + Math.floor(v).toLocaleString("es-MX").replace(/,/g, " ");
