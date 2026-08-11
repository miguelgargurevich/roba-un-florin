/* El protocolo entre el cliente y la sala.

   Por qué WebSocket pelado y no Colyseus: lo que Colyseus aporta de verdad es
   su sincronización por esquema, y para usarla habría que traducir todo el
   estado del motor a @colyseus/schema y mantener las dos formas en paralelo.
   El estado ya es JSON serializable —para eso se pasó a ids— así que el resto
   de Colyseus (salas, reconexión, códigos) son las doscientas líneas de
   `salas.ts`. Menos maquinaria y control total del formato, que es justo lo
   que importa cuando lo que se manda es el mundo entero.

   Dos canales, porque no todo cambia al mismo ritmo:

   - `mundo`: el estado completo. Se manda al entrar y cada RESYNC_CADA
     segundos, por si un cliente se perdió algo.
   - `tick`: solo lo que se mueve, a TICKS_POR_SEG. Es lo que hace que se vea
     fluido sin mandar 8 KB sesenta veces por segundo. */

import type { Estado } from "@florin/engine";

/** Cuántas veces por segundo simula la sala. */
export const HZ = 30;
/** Cuántas veces por segundo se manda lo que se mueve. */
export const TICKS_POR_SEG = 20;
/** Cada cuánto se manda el mundo entero, por si acaso. */
export const RESYNC_CADA = 3;
/** Si no llega nada de un cliente en este tiempo, se le da por ido. */
export const SIN_SEÑALES = 20;
/** Cuánto se le guarda el sitio a quien se cae antes de que lo juegue un bot.
    Mientras tanto su muñeco no se mueve: sus Florines son suyos y volver de
    un túnel no debería costarte la vitrina. */
export const ESPERA_VUELTA = 45;
/** Los segundos de cuenta atrás desde que alguien da la salida. */
export const CUENTA_ATRAS = 3;

/* ---- lo que manda el cliente ---- */
export type DelCliente =
  | { t: "entrar"; token?: string; codigo?: string; escenario?: string; apodo?: string;
      modo?: "aventura" | "versus" | "carrera" | "futbol";
      /** con qué quiere correr; el servidor no comprueba si de verdad lo tiene */
      vehiculo?: string }
  | { t: "entrada"; mover: { x: number; y: number }; apunta: { x: number; y: number } | null }
  | { t: "arma"; i: number }
  | { t: "comprar"; i: number }
  | { t: "usar" }
  /** Patear en un partido. `fuerza` de 0 a 1: la carga del botón. El servidor
      la recorta igual, así que mandar 99 no llega más lejos. */
  | { t: "patear"; fuerza?: number }
  | { t: "ruleta" }
  | { t: "bajarse" }
  | { t: "vender"; b: number; i: number }
  | { t: "soltar" }
  | { t: "arrancar" }
  | { t: "item" }
  | { t: "ping" };

/* ---- lo que manda la sala ---- */
export type DeLaSala =
  | { t: "bienvenida"; codigo: string; idx: number; apodo: string; modo: string;
      mundo: Estado; gente: Presencia[]; enParrilla: boolean }
  | { t: "mundo"; mundo: Estado }
  | { t: "tick"; n: number; movil: Movil }
  | { t: "gente"; gente: Presencia[] }
  | { t: "eventos"; eventos: Estado["eventos"] }
  /** cuenta atrás de la salida; `en` son segundos, 0 es ¡YA! */
  | { t: "salida"; en: number }
  | { t: "pong" }
  | { t: "error"; motivo: string };

export interface Presencia { idx: number; apodo: string; conectado: boolean }

/* Lo que cambia cada frame. Todo lo demás (vitrinas, dinero, patios) llega en
   el `mundo` periódico: cambia poco y no merece ancho de banda cada 50 ms. */
export interface Movil {
  t: number;
  jug: [number, number, number, number, number, number][];   // idx,x,y,face,walk,stun
  lad: [number, number, number, number, number][];           // id,x,y,face,walk
  des: [number, number, number][];                           // id,x,y
  tra: [number, number, number, number][];                   // id,x,y,giro
  suelo: [number, number, number][];                         // índice,x,y
}

const r2 = (v: number) => Math.round(v * 100) / 100;   // dos decimales bastan para dibujar

export function fotoMovil(e: Estado): Movil {
  return {
    t: r2(e.t),
    jug: e.players.map(p => [p.idx, r2(p.x), r2(p.y), p.face, r2(p.walk), r2(p.stun)]),
    lad: e.thieves.map(x => [x.id, r2(x.x), r2(x.y), x.face, r2(x.walk)]),
    des: e.portal.desfile.map(d => [d.id, r2(d.x), r2(d.y)]),
    tra: e.trastos.filter(v => v.vx || v.vy || v.montadoPor != null)
                  .map(v => [v.id, r2(v.x), r2(v.y), r2(v.giro)]),
    suelo: e.ground.map((g, i) => [i, r2(g.x), r2(g.y)]),
  };
}
