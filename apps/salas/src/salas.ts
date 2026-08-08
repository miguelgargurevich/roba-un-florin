/* Las salas: quién está dentro, quién manda y qué se le cuenta a cada uno.

   Aquí no hay reglas de juego. La sala solo corre `avanzar()` del motor con las
   entradas que le llegan y reparte el resultado. Todo lo que decide qué pasa
   está en @florin/engine y se prueba sin red. */

import {
  JUGADORES_MAX, avanzar, bajarse, comprarArma, crearPartida, darleVehiculo, girarRuleta,
  idsDeArmas, usarPotenciador,
  pensarBot,
  seleccionarArma, soltarCarga, usarArma, venderFlorin,
  type EntradaJugador, type Estado,
} from "@florin/engine";
import {
  CUENTA_ATRAS, ESPERA_VUELTA, HZ, RESYNC_CADA, SIN_SEÑALES, TICKS_POR_SEG,
  fotoMovil, type DeLaSala, type Presencia,
} from "./protocolo.js";


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
  /** cuándo se cayó, para saber desde cuándo le guardamos el sitio */
  seFue: number;
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
  readonly modo: "aventura" | "versus" | "carrera";
  /* Una carrera espera en la parrilla hasta que alguien da la salida. Sin
     esto los bots arrancaban al crear la sala y, con vueltas de medio minuto,
     el amigo que tardaba en entrar se la encontraba terminada. En aventura no
     hay nada que esperar: el mundo corre desde el primer momento. */
  private enParrilla: boolean;
  private salidaEn = 0;
  private ultimoAviso = -1;

  constructor(codigo: string, escenario: string, private reloj: () => number,
              modo: "aventura" | "versus" | "carrera" = "aventura") {
    this.modo = modo;
    this.enParrilla = modo === "carrera";
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
      // en carrera no hay vecinos: lo dice la regla, no un montón de ifs
      reglas: { modo, vecinos: modo !== "carrera", puestos: modo !== "carrera" },
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
      seFue: 0,
    };
    this.asientos.push(asiento);
    return asiento;
  }

  soltar(userId: string): void {
    const a = this.asientos.find(x => x.userId === userId);
    if (a) {
      a.enviar = null;
      a.entrada = { mover: { x: 0, y: 0 }, apunta: null };
      a.seFue = this.reloj();
    }
  }

  difundir(m: DeLaSala): void {
    for (const a of this.asientos) { try { a.enviar?.(m); } catch { /* ya se fue */ } }
  }

  /** Con qué sale a la pista quien acaba de sentarse.

      No se comprueba que de verdad lo tenga en su Garaje: el Garaje vive en el
      navegador de cada uno y traerlo aquí querría decir guardarlo en la base y
      confiar igual. Es un juego de barrio entre amigos; si alguien se hace
      trampa con un Amaru, el castigo es que sus amigos lo sepan. */
  vehiculoDe(a: Asiento, tipo: string | undefined): void {
    if (this.modo !== "carrera" || !tipo) return;
    darleVehiculo(this.estado, this.estado.players[a.idx], tipo);
  }

  /** Alguien da la salida. Vale cualquiera de los sentados: quien se anime. */
  arrancar(): void {
    if (!this.enParrilla || this.salidaEn) return;
    this.salidaEn = this.reloj() + CUENTA_ATRAS * 1000;
  }

  /** ¿La carrera sigue esperando en la línea? */
  get esperando(): boolean { return this.enParrilla; }

  /** Un paso de reloj. `dt` en segundos. */
  avanzar(dt: number): void {
    const ahora = this.reloj();

    /* En la parrilla el mundo no avanza: solo corre la cuenta atrás. Se sigue
       mandando la foto para que quien entre vea a los demás en la línea. */
    if (this.enParrilla) {
      if (this.salidaEn) {
        const quedan = Math.max(0, Math.ceil((this.salidaEn - ahora) / 1000));
        if (quedan !== this.ultimoAviso) {
          this.ultimoAviso = quedan;
          this.difundir({ t: "salida", en: quedan });
        }
        if (ahora >= this.salidaEn) this.enParrilla = false;
      }
      this.desdeTick += dt;
      const cadaTick0 = 1 / TICKS_POR_SEG;
      if (this.desdeTick >= cadaTick0) {
        this.desdeTick = Math.min(this.desdeTick - cadaTick0, cadaTick0);
        this.difundir({ t: "tick", n: ++this.n, movil: fotoMovil(this.estado) });
      }
      this.desdeResync += dt;
      if (this.desdeResync >= RESYNC_CADA) {
        this.desdeResync = Math.min(this.desdeResync - RESYNC_CADA, RESYNC_CADA);
        this.difundir({ t: "mundo", mundo: this.estado });
      }
      for (const a of this.asientos)
        if (a.enviar && ahora - a.ultimaSeñal > SIN_SEÑALES * 1000) this.soltar(a.userId);
      return;
    }

    this.acumulado += dt;
    const paso = 1 / HZ;
    let vueltas = 0;
    while (this.acumulado >= paso && vueltas < 5) {   // tope: si el server se atasca, no espirales
      this.acumulado -= paso;
      vueltas++;
      const entradas: Record<number, EntradaJugador> = {};
      const tiran: number[] = [];
      for (let i = 0; i < this.estado.players.length; i++) {
        const a = this.asientos[i];
        if (a && a.enviar) { entradas[i] = a.entrada; continue; }
        /* A quien se acaba de caer se le guarda el sitio quieto un rato: sus
           Florines son suyos y volver de un túnel no debería costarle la
           vitrina. Pasado ESPERA_VUELTA, o si nunca se sentó nadie, lo juega
           un bot — antes esos asientos eran muñecos plantados en su patio y el
           mapa parecía un museo. */
        if (a && ahora - a.seFue < ESPERA_VUELTA * 1000) {
          entradas[i] = a.entrada;
          continue;
        }
        const plan = pensarBot(this.estado, this.estado.players[i], paso);
        entradas[i] = plan.entrada;
        if (plan.usar) tiran.push(i);
      }
      for (const i of tiran) usarArma(this.estado, this.estado.players[i]);
      avanzar(this.estado, entradas, paso);
      if (this.estado.eventos.length) {
        this.difundir({ t: "eventos", eventos: this.estado.eventos.slice() });
        this.estado.eventos.length = 0;
      }
    }

    /* Restar el intervalo, NO poner a cero. Con el reloj a HZ=30 cada vuelta
       trae 33 ms; poniendo a cero se tiraba el sobrante y salía un tick cada
       dos vueltas — 15 por segundo en vez de 20 (medido: 14,2 contra
       producción). Restando, el resto se acumula y salen dos de cada tres
       vueltas, que son los 20 prometidos. El tope evita una ráfaga si el
       proceso se queda pillado un rato. */
    this.desdeTick += dt;
    const cadaTick = 1 / TICKS_POR_SEG;
    if (this.desdeTick >= cadaTick) {
      this.desdeTick = Math.min(this.desdeTick - cadaTick, cadaTick);
      this.difundir({ t: "tick", n: ++this.n, movil: fotoMovil(this.estado) });
    }
    this.desdeResync += dt;
    if (this.desdeResync >= RESYNC_CADA) {
      this.desdeResync = Math.min(this.desdeResync - RESYNC_CADA, RESYNC_CADA);
      this.difundir({ t: "mundo", mundo: this.estado });
    }

    for (const a of this.asientos) {
      if (a.enviar && ahora - a.ultimaSeñal > SIN_SEÑALES * 1000) this.soltar(a.userId);
    }
  }

  /* ---- acciones sueltas ---- */
  arma(a: Asiento, i: number): void { seleccionarArma(this.estado, this.estado.players[a.idx], i); }
  comprar(a: Asiento, i: number): void { comprarArma(this.estado, this.estado.players[a.idx], i); }
  usar(a: Asiento): void { usarArma(this.estado, this.estado.players[a.idx]); }
  item(a: Asiento): void { usarPotenciador(this.estado, this.estado.players[a.idx]); }
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

  crear(escenario = "catarata", modo: "aventura" | "versus" | "carrera" = "aventura"): Sala {
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
