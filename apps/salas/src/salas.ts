/* Las salas: quién está dentro, quién manda y qué se le cuenta a cada uno.

   Aquí no hay reglas de juego. La sala solo corre `avanzar()` del motor con las
   entradas que le llegan y reparte el resultado. Todo lo que decide qué pasa
   está en @florin/engine y se prueba sin red. */

import {
  JUGADORES_MAX, avanzar, bajarse, crearPartida, girarRuleta, idsDeArmas,
  seleccionarArma, soltarCarga, usarArma, venderFlorin,
  type EntradaJugador, type Estado,
} from "@florin/engine";
import {
  HZ, RESYNC_CADA, SIN_SEÑALES, TICKS_POR_SEG,
  fotoMovil, type DeLaSala, type Presencia,
} from "./protocolo.js";

const QUIETO: EntradaJugador = { mover: { x: 0, y: 0 }, apunta: null };

/* Sin vocales: así el azar no escribe palabrotas ni códigos que se confundan al
   dictarlos por teléfono, que es exactamente para lo que sirve un código. */
const LETRAS = "BCDFGHJKLMNPQRSTVWXYZ";

export interface Asiento {
  idx: number;
  userId: string;
  apodo: string;
  /** null mientras esté desconectado: el patio sigue siendo suyo. */
  enviar: ((m: DeLaSala) => void) | null;
  entrada: EntradaJugador;
  ultimaSeñal: number;
}

export class Sala {
  readonly codigo: string;
  readonly creada: number;
  estado: Estado;
  asientos: Asiento[] = [];
  private n = 0;
  private acumulado = 0;
  private desdeTick = 0;
  private desdeResync = 0;

  /* El reloj se inyecta en vez de pasarse en cada llamada: `sentar(..., 0)` era
     un filo afiladísimo — el guardián de inactividad daba al jugador por ido en
     el primer tick y la sala se quedaba muda sin decir por qué. */
  readonly modo: "aventura" | "versus";

  constructor(codigo: string, escenario: string, private reloj: () => number,
              modo: "aventura" | "versus" = "aventura") {
    this.modo = modo;
    this.codigo = codigo;
    const ahora = reloj();
    this.creada = ahora;
    /* La sala se monta ya con los cinco sitios. Sentar a alguien no rehace el
       mundo: solo le asigna un patio que ya existe. Rehacerlo al entrar cada
       amigo tiraría la partida de los que ya estaban jugando. */
    this.estado = crearPartida({
      jugadores: JUGADORES_MAX,
      escenario,
      armas: idsDeArmas(),
      reglas: { modo },
      semilla: (ahora ^ (codigo.charCodeAt(0) * 7919)) | 0,
    });
  }

  get gente(): Presencia[] {
    return this.asientos.map(a => ({ idx: a.idx, apodo: a.apodo, conectado: !!a.enviar }));
  }
  get vacia(): boolean { return this.asientos.every(a => !a.enviar); }

  /** Sienta a alguien, o le devuelve su sitio si ya estaba y volvió. */
  sentar(userId: string, apodo: string, enviar: (m: DeLaSala) => void): Asiento | null {
    const suyo = this.asientos.find(a => a.userId === userId);
    if (suyo) {                       // volvió: recupera su patio y su dinero
      suyo.enviar = enviar;
      suyo.apodo = apodo;
      suyo.ultimaSeñal = this.reloj();
      return suyo;
    }
    if (this.asientos.length >= JUGADORES_MAX) return null;
    const asiento: Asiento = {
      idx: this.asientos.length, userId, apodo, enviar,
      entrada: { mover: { x: 0, y: 0 }, apunta: null }, ultimaSeñal: this.reloj(),
    };
    this.asientos.push(asiento);
    return asiento;
  }

  soltar(userId: string): void {
    const a = this.asientos.find(x => x.userId === userId);
    if (a) { a.enviar = null; a.entrada = { mover: { x: 0, y: 0 }, apunta: null }; }
  }

  difundir(m: DeLaSala): void {
    for (const a of this.asientos) { try { a.enviar?.(m); } catch { /* ya se fue */ } }
  }

  /** Un paso de reloj. `dt` en segundos. */
  avanzar(dt: number): void {
    const ahora = this.reloj();
    this.acumulado += dt;
    const paso = 1 / HZ;
    let vueltas = 0;
    while (this.acumulado >= paso && vueltas < 5) {   // tope: si el server se atasca, no espirales
      this.acumulado -= paso;
      vueltas++;
      const entradas: Record<number, EntradaJugador> = {};
      for (let i = 0; i < this.estado.players.length; i++) {
        const a = this.asientos[i];
        // los sitios sin nadie se quedan quietos: no hay bots que los jueguen
        entradas[i] = a && a.enviar ? a.entrada : QUIETO;
      }
      avanzar(this.estado, entradas, paso);
      if (this.estado.eventos.length) {
        this.difundir({ t: "eventos", eventos: this.estado.eventos.slice() });
        this.estado.eventos.length = 0;
      }
    }

    this.desdeTick += dt;
    if (this.desdeTick >= 1 / TICKS_POR_SEG) {
      this.desdeTick = 0;
      this.difundir({ t: "tick", n: ++this.n, movil: fotoMovil(this.estado) });
    }
    this.desdeResync += dt;
    if (this.desdeResync >= RESYNC_CADA) {
      this.desdeResync = 0;
      this.difundir({ t: "mundo", mundo: this.estado });
    }

    for (const a of this.asientos) {
      if (a.enviar && ahora - a.ultimaSeñal > SIN_SEÑALES * 1000) this.soltar(a.userId);
    }
  }

  /* ---- acciones sueltas ---- */
  arma(a: Asiento, i: number): void { seleccionarArma(this.estado, this.estado.players[a.idx], i); }
  usar(a: Asiento): void { usarArma(this.estado, this.estado.players[a.idx]); }
  ruleta(a: Asiento): void { girarRuleta(this.estado, this.estado.players[a.idx], 2.2); }
  bajar(a: Asiento): void { bajarse(this.estado, this.estado.players[a.idx], true); }
  vender(a: Asiento, b: number, i: number): void { venderFlorin(this.estado, this.estado.players[a.idx], { b, i }); }
  /* Ojo con el nombre: `soltar(userId)` de arriba es soltar el ASIENTO al
     desconectarse. Esto es soltar el Florín que llevas en las manos. */
  soltarFlorin(a: Asiento): void { soltarCarga(this.estado, this.estado.players[a.idx]); }
}

export class Registro {
  private salas = new Map<string, Sala>();
  /** Se le inyecta el reloj para que las pruebas no dependan del tiempo real. */
  constructor(private ahora: () => number = () => Date.now(),
              private azar: () => number = Math.random) {}

  get tamaño(): number { return this.salas.size; }
  buscar(codigo: string): Sala | undefined { return this.salas.get(codigo.toUpperCase()); }

  crear(escenario = "barrio", modo: "aventura" | "versus" = "aventura"): Sala {
    let codigo = "";
    do {
      codigo = Array.from({ length: 4 }, () =>
        LETRAS[(this.azar() * LETRAS.length) | 0]).join("");
    } while (this.salas.has(codigo));
    const sala = new Sala(codigo, escenario, this.ahora, modo);
    this.salas.set(codigo, sala);
    return sala;
  }

  /** Un paso para todas, y tira las que se quedaron sin nadie. */
  avanzar(dt: number): void {
    const ahora = this.ahora();
    for (const [codigo, sala] of this.salas) {
      sala.avanzar(dt);
      // Se da un margen: si se cae la conexión de todos a la vez, la sala
      // sobrevive un minuto para que puedan volver a lo suyo.
      if (sala.vacia && ahora - sala.creada > 60_000) this.salas.delete(codigo);
    }
  }
}
