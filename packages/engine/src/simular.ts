/* La simulación. Puerto fiel del prototipo, con tres diferencias de fondo:

   1. El azar sale del estado (ver util.ts), no de Math.random.
   2. Los avisos, partículas y sonidos salen como eventos, no como llamadas a
      pop()/puff()/Snd.
   3. El movimiento llega como `entradas`, no leyendo el teclado.

   Todo lo demás —números, tiempos, condiciones— se mantiene igual a propósito:
   el objetivo de esta fase es que el juego se comporte exactamente como antes. */

import type {
  Base, Bala, DesfileItem, EntradaJugador, Estado, Florin, Jugador, Ladron,
  Pedestal, Premio, Abuela, RefObjetivo, RefPed, Trasto, Variante, JuegoDeSitio,
} from "./tipos.js";
import {
  ESCUDO_DUR, GARAJE, GOAL, LADRONES, LASER_CARGA, RULETA, RULETA_INCOGNITA, RULETA_PRECIO,
  PATADA, PORTAL_CADA, PORTAL_MAX, PORTAL_RAREZAS, PORTAL_VUELTA, dificultadDe,
  fusionTier, fusionPrecio,
  LASER_DUR, LASER_PRECIO, LASER_RECARGA, RODAR_ROCE, TRASTO_ALCANCE, HITO_R, VUELTAS,
  PORTAL_VEL, CAJA_GIRA, CAJA_VUELVE, potenciadoresDe, potenciadorPorId,
  TIERS, VARIANTES, VEHICULOS, WEAPONS, WORLD_H, WORLD_W, esVehiculo, varLabel, varMult,
} from "./datos.js";
import { azar, clamp, dist2, inRect, lerp, money, pick, rnd, tiraDeTabla } from "./util.js";
import {
  baseDe, bloqueadoPorLaser, desfileDe, enElMar, enElPuente, marEn, esMiPatio, florinIncome, freePed,
  freePedDe, jugadorDe, laserActivo, mismoFlorin, nivelDeVitrina, nombreDeHito,
  nuevoFlorin, nuevoId, occupied, occupiedDe, patiosDe, pedDe, playerIncome,
  polvo, ponerLaser, puedeMojarse, puntoDelDesfile, sacarDelCentro, sonar, texto, trastoDe, dentroDeLaPista,
  sobreLaPista, ladoDeLaCancha, colocarParaElSaque, TENIS_SAQUE,
  ladoDeVoley, colocarParaElSaqueDeVoley, VOLEY_SAQUE, VOLEY_TOQUES,
  sacarDeMedioBasquet, BASQUET_SAQUE, sacarEnHockey, HOCKEY_SAQUE,
  colocarEnElRing, LUCHA_SAQUE, OBS_TROPIEZO,
  colocarParaTirar, reponerLosPinos, BOLA_R, PINO_R,
  colocarParaTirarDardo, valorDelDardo, DIANA_ANILLOS, DARDOS_ESPERA,
} from "./estado.js";

/* Cualquier cosa a la que se pueda golpear */
type Blanco = Ladron | Abuela | Jugador;

export const maxTier = (e: Estado) => clamp(1 + Math.floor(e.t / 48), 1, TIERS.length - 1);

export function rollTier(e: Estado): number {
  const m = maxTier(e);
  const t = m - Math.floor(Math.pow(azar(e), 1.7) * (m + 1));
  return clamp(t, 0, TIERS.length - 1);
}

/** `espera` son segundos en los que nadie puede recogerlo. Sirve para soltar a
    mano: el radio de recogida es de 40 px y sueltas a 16, así que sin esta
    pausa el mismo frame te lo devuelve a los brazos y parece que el botón no
    hace nada. Cuando lo sueltas de un chanclazo va a cero, que ahí lo que
    quieres es poder correr a por él. */
export function dropCarried(
  e: Estado, who: { carry: Florin | null }, x: number, y: number, espera = 0,
) {
  if (!who.carry) return;
  e.ground.push(mismoFlorin(who.carry, { x, y, bob: rnd(e, 0, 6.28), t: 0, espera }));
  who.carry = null;
}

export function knock(en: any, dx: number, dy: number, force: number) {
  const m = Math.hypot(dx, dy) || 1;
  en.kx = (en.kx || 0) + dx / m * force;
  en.ky = (en.ky || 0) + dy / m * force;
}

export function applyKnock(en: any, dt: number) {
  if (!en.kx && !en.ky) return;
  en.x = clamp(en.x + en.kx * dt, 20, WORLD_W - 20);
  en.y = clamp(en.y + en.ky * dt, 20, WORLD_H - 20);
  const decay = Math.pow(0.015, dt);
  en.kx *= decay; en.ky *= decay;
  if (Math.abs(en.kx) < 4) en.kx = 0;
  if (Math.abs(en.ky) < 4) en.ky = 0;
}

/** El paraguas: mientras esté abierto aguanta los golpes.

    `escudo` son segundos que quedan, no un sí/no: se compra por ESCUDO_DUR y va
    bajando. `inmune` sigue siendo el margen corto de después de cada golpe —
    sin él, un enemigo pegado te vaciaría el aviso sesenta veces por segundo. */
export function escudoAguanta(e: Estado, en: any): boolean {
  if (!en) return false;
  if (en.inmune > 0) return true;
  if (!(en.escudo > 0)) return false;
  en.inmune = 0.9;
  texto(e, en.x, en.y - 58, "☂️ ¡Aguantó el paraguas!", "#5CE1EA");
  polvo(e, en.x, en.y - 10, "#5CE1EA", 14);
  sonar(e, "whack");
  return true;
}

export function zap(e: Estado, en: any, secs: number, frozen: boolean) {
  if (escudoAguanta(e, en)) return;
  en.stun = Math.max(en.stun, secs);
  if (frozen) en.frozen = Math.max(en.frozen || 0, secs);
  if (en.carry) dropCarried(e, en, en.x, en.y + 14);
}

export function blancosDe(e: Estado, dueno: Jugador | null): Blanco[] {
  const out: Blanco[] = [...e.thieves];
  for (const b of e.bases) if (b.guard) out.push(b.guard);
  for (const p of e.players) if (p !== dueno) out.push(p);
  return out;
}

export function rumboDeTiro(p: Jugador) {
  const aim = p.apunta;
  if (aim.on) {
    const dx = aim.wx - p.x, dy = aim.wy - (p.y - 12), m = Math.hypot(dx, dy);
    if (m > 8) return { x: dx / m, y: dy / m };
  }
  const m2 = Math.hypot(p.dirx, p.diry) || 1;
  return { x: p.dirx / m2, y: p.diry / m2 };
}

export function comprarPatio(e: Estado, p: Jugador, b: Base) {
  if (p.money < b.price) {
    if (!b.warn || e.t - b.warn > 1.6) {
      b.warn = e.t;
      texto(e, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2,
        "Falta " + money(b.price - p.money), "#FF6B90");
    }
    return;
  }
  p.money -= b.price;
  b.locked = false;
  b.owner = p.idx;
  ponerLaser(b);
  p.patios.push(b.id);
  texto(e, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 - 40, "¡" + b.name + " es tuyo!", "#3DDC97");
  polvo(e, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2, "#3DDC97", 18);
  sonar(e, "buy");
}

/** ¿Hay fiesta ahora mismo? Caduca sola: nadie tiene que apagarla. */
export const enFiesta = (e: Estado): boolean => !!e.fiesta && e.t < e.fiesta.hasta;

/** Poner (o quitar) la fiesta que anuncia el servidor. `segundos` es lo que le
    queda de vida a partir de AHORA. */
export function ponerFiesta(e: Estado, nombre: string,
                            florines: { tier: number; variant: Variante }[],
                            segundos: number): void {
  if (!florines.length || segundos <= 0) { e.fiesta = null; return; }
  e.fiesta = { nombre, hasta: e.t + segundos, florines: florines.slice() };
}

export function sacarDelPortal(e: Estado) {
  const P = e.portal;
  if (P.desfile.length >= PORTAL_MAX) return;
  /* En fiesta la tabla de rarezas no manda: bajan los que anunció el evento,
     que es de lo que va la fiesta. */
  const deFiesta = enFiesta(e)
    ? e.fiesta!.florines[(azar(e) * e.fiesta!.florines.length) | 0]
    : null;
  const fila = tiraDeTabla(e, PORTAL_RAREZAS);
  const p0 = puntoDelDesfile(e, 0);
  P.desfile.push({
    id: nuevoId(e),
    florin: deFiesta
      ? nuevoFlorin(e, deFiesta.tier, { variant: deFiesta.variant, bob: rnd(e, 0, 6.28) })
      : nuevoFlorin(e, fila.tier, { bob: rnd(e, 0, 6.28) }),
    k: 0, x: p0.x, y: p0.y,
    /* El camino se echa a suertes AQUÍ, al salir del portal, no en el cruce:
       el resultado es el mismo y así el recorrido entero es una función de `k`,
       que es lo que hace que dos clientes con la misma semilla vean lo mismo. */
    lado: (azar(e) < 0.5 ? 0 : 1) as 0 | 1,
    giro: (azar(e) < 0.5 ? 1 : -1) as 1 | -1,
    face: 1, pop: 1, esDesfile: true,
  });
  polvo(e, P.x, P.y, "#FF9EC4", 12);
}

export function spawnThief(e: Estado) {
  const victimas = e.players.filter(p => occupiedDe(e, p).length);
  if (!victimas.length) return;
  const victim = pick(e, victimas);
  const patios = patiosDe(e, victim).filter(b => occupied(b).length);
  if (!patios.length) return;
  let ladronas = e.bases.filter(b => !b.isPlayer && b.who);
  if (!ladronas.length) return;
  /* De los vecinos de al lado, no de los del otro extremo del mundo. En el
     Multiverso hay casas a 80 000 px: un ladrón de allí tardaba cinco minutos en
     llegar a tu patio, así que en la práctica no había ladrones. Se mira quién
     vive a menos de un mapa normal de la víctima; si no vive nadie cerca, vale
     cualquiera —mejor un ladrón lento que ninguno. */
  /* La víctima se sortea UNA vez: sirve para elegir vecino cercano y es la casa
     a la que va el ladrón. Sortearla dos veces gastaba dos tiradas del azar
     —adiós determinismo— y podía mandarlo a un patio distinto del que miró. */
  const victima = pick(e, patios);
  const cerca = ladronas.filter(b => Math.abs(b.rect.x - victima.rect.x) < 3600);
  if (cerca.length) ladronas = cerca;
  const from = pick(e, ladronas);
  const K = LADRONES[from.who!];
  const spd = (150 + Math.min(70, e.t * 0.28)) * K.spd;
  e.thieves.push({
    id: nuevoId(e),
    x: from.rect.x + from.rect.w / 2 + rnd(e, -90, 90),
    y: from.rect.y + from.rect.h / 2 + rnd(e, -70, 70),
    homeId: from.id, victimId: victima.id, state: "go", target: null, carry: null,
    stun: 0, frozen: 0, abducido: 0, kx: 0, ky: 0, grabT: 0,
    spd, walk: 0, face: 1,
    salto: K.salta ? K.salta : 0, saltoT: 0,
    who: from.who!, isGuard: false,
  });
}

/** Suelta lo que llevas al suelo, para poder coger otro. Lo puede recoger
    cualquiera, igual que si te lo hubieran tirado de un chancletazo. */
export function soltarCarga(e: Estado, p: Jugador): boolean {
  if (!p.carry) return false;
  const f = p.carry;
  dropCarried(e, p, p.x + p.face * 26, p.y + 18, 1.1);
  texto(e, p.x, p.y - 48, "Soltaste " + TIERS[f.tier].name, "#D8BCB0");
  sonar(e, "place");
  return true;
}

/* ---- vender lo que ya tienes en la vitrina ----
   Un Florín que no te sirve deja de ser un hueco desperdiciado: lo vendes por
   su precio y lo cambias por uno mejor. Es lo que hace que la escalera de
   hitos —que mide por el PEOR Florín— se pueda subir a propósito y no solo
   por suerte. */
export function venderFlorin(e: Estado, p: Jugador, ref: RefPed): number {
  const ped = pedDe(e, ref);
  if (!ped || !ped.florin) return 0;
  const base = baseDe(e, ref.b);
  if (base.owner !== p.idx) return 0;          // solo lo tuyo, y solo tú
  const f = ped.florin;
  const precio = Math.round(TIERS[f.tier].price * varMult(f.variant));
  p.money += precio;
  ped.florin = null;
  ped.pop = 1;
  texto(e, ped.x, ped.y - 46, "+" + money(precio), "#FFC53D");
  polvo(e, ped.x, ped.y - 10, "#FFC53D", 12);
  sonar(e, "buy");
  return precio;
}

/** Lo que te darían por él, para poder enseñarlo antes de vender. */
export const precioDeVenta = (f: Florin) =>
  Math.round(TIERS[f.tier].price * varMult(f.variant));

/* ---- ruleta ---- */
export function premioDeRuleta(e: Estado): Premio {
  const casilla = tiraDeTabla(e, RULETA);
  if (casilla.kind === "florin") return { kind: "florin", tier: casilla.tier, variant: null };
  if (casilla.kind === "dinero") return { kind: "dinero", monto: casilla.monto };
  if (casilla.kind === "arma") {
    const i = 1 + ((azar(e) * (WEAPONS.length - 1)) | 0);
    return { kind: "arma", arma: i };
  }
  if (casilla.kind === "vehiculo") {
    const g = GARAJE[(azar(e) * GARAJE.length) | 0];
    return { kind: "vehiculo", tipo: g.tipo };
  }
  const s = tiraDeTabla(e, RULETA_INCOGNITA);
  const tier = s.tier != null ? s.tier : ((azar(e) * ((s.tierMax ?? 0) + 1)) | 0);
  return { kind: "florin", tier, variant: s.variant, sorpresa: true };
}

export function textoDePremio(pr: Premio): string {
  if (pr.kind === "dinero") return money(pr.monto);
  if (pr.kind === "arma") return WEAPONS[pr.arma].icon + " " + WEAPONS[pr.arma].name + " ×2";
  if (pr.kind === "vehiculo") return VEHICULOS[pr.tipo].icon + " " + VEHICULOS[pr.tipo].label;
  const T = TIERS[pr.tier];
  return (pr.variant ? (VARIANTES as any)[pr.variant].icon + " " : "") + T.name +
    " · " + T.rar + (pr.variant ? " " + (VARIANTES as any)[pr.variant].label : "");
}

export function entregarPremio(e: Estado, p: Jugador, pr: Premio) {
  if (pr.kind === "dinero") {
    p.money += pr.monto;
    texto(e, p.x, p.y - 70, "+" + money(pr.monto), "#FFC53D");
    sonar(e, "buy");
    return;
  }
  if (pr.kind === "arma") {
    const w = WEAPONS[pr.arma];
    p.ammo[w.id] += 2;
    texto(e, p.x, p.y - 70, w.icon + " +2 usos", w.color);
    sonar(e, "buy");
    return;
  }
  if (pr.kind === "vehiculo") {
    const v = VEHICULOS[pr.tipo];
    texto(e, p.x, p.y - 70, v.icon + " ¡" + v.label.toUpperCase() + "!", "#8B6BEE");
    polvo(e, p.x, p.y - 20, "#8B6BEE", 22);
    e.eventos.push({ t: "vehiculo", tipo: pr.tipo, jugador: p.idx });
    sonar(e, "win");
    return;
  }
  const f = nuevoFlorin(e, pr.tier, { variant: pr.variant });
  if (!p.carry) cargar(e, p, f);
  else e.ground.push(mismoFlorin(f, { x: p.x + rnd(e, -24, 24), y: p.y + 34, bob: 0, t: 0 }));
  const col = pr.variant
    ? (VARIANTES as any)[pr.variant].color
    : ((TIERS[pr.tier] as any).petal as string);
  texto(e, p.x, p.y - 70, (pr.sorpresa ? "??? → " : "") + textoDePremio(pr), col);
  polvo(e, p.x, p.y - 20, col, 16);
  sonar(e, "place");
}

/** Arranca una tirada. Devuelve false si no se pudo (lejos, sin dinero, o ya
    girando).

    Lo de estar dentro se comprueba AQUÍ y no solo en la interfaz: en una sala
    manda el servidor, y un cliente retocado podía girar desde su patio. Lo
    mismo con la Armería. */
export function girarRuleta(e: Estado, p: Jugador, dur = 2.2): boolean {
  if (e.girando) return false;
  if (!p.inRuleta) return false;
  if (p.money < RULETA_PRECIO) {
    texto(e, p.x, p.y - 70, "Falta " + money(RULETA_PRECIO - p.money), "#FF6B90");
    sonar(e, "ouch");
    return false;
  }
  p.money -= RULETA_PRECIO;
  e.girando = { t: 0, dur, premio: premioDeRuleta(e), jugadorIdx: p.idx };
  e.ultimoPremio = null;
  return true;
}

/* ---- La Fusionadora ----
   Se meten dos Florines de la vitrina y sale uno. Trabaja sobre la vitrina y no
   sobre lo que llevas en brazos porque solo se puede cargar UNO a la vez: pedir
   dos serían dos viajes, y nadie haría el segundo. */

/** Qué saldría de fundir estos dos, o por qué no se puede. */
export function queSaleDeFundir(a: Florin, b: Florin): {
  ok: boolean; tier: number; variant: Variante; precio: number; motivo?: string;
} {
  const tope = TIERS.length - 1;
  const tier = fusionTier(a.tier, b.tier, tope);
  /* La mejor variante de las dos: fundir un Dorado con uno pelado te sube de
     rareza y te lo conserva. */
  const variant = varMult(a.variant) >= varMult(b.variant) ? a.variant : b.variant;
  const precio = fusionPrecio(tier);
  /* Y solo si MEJORA al mejor de los dos. Sin esto, meter un Amaru con un Común
     daría algo de media tabla y te habrías cargado el Amaru. */
  const mejorTier = Math.max(a.tier, b.tier);
  const mejorVar = Math.max(varMult(a.variant), varMult(b.variant));
  if (tier < mejorTier || (tier === mejorTier && varMult(variant) <= mejorVar))
    return { ok: false, tier, variant, precio,
             motivo: mejorTier >= tope ? "Ya es lo más alto que hay"
                                       : "De aquí no sale nada mejor" };
  return { ok: true, tier, variant, precio };
}

/** Funde dos Florines de la vitrina. `i` y `j` son índices de `occupiedDe`. */
export function fundir(e: Estado, p: Jugador, i: number, j: number): boolean {
  if (!p.inFusion || i === j) return false;
  const llenos = occupiedDe(e, p);
  const A = llenos[i], B = llenos[j];
  if (!A?.florin || !B?.florin) return false;
  const r = queSaleDeFundir(A.florin, B.florin);
  if (!r.ok) { texto(e, p.x, p.y - 62, r.motivo || "No se puede", "#FF6B90"); return false; }
  if (p.money < r.precio) {
    texto(e, p.x, p.y - 62, "Te falta plata: " + money(r.precio), "#FF6B90");
    return false;
  }
  p.money -= r.precio;
  /* El nuevo se queda en el pedestal del primero y el segundo queda libre: así
     la vitrina no se descoloca y se ve dónde apareció. */
  const nuevo = nuevoFlorin(e, r.tier, { variant: r.variant, bob: A.florin.bob });
  A.florin = nuevo;
  B.florin = null;
  A.pop = 1;
  e.eventos.push({ tipo: "album", tier: r.tier, variant: r.variant } as any);
  sonar(e, "win");
  polvo(e, A.x, A.y, VARIANTES[r.variant as keyof typeof VARIANTES]?.color || "#FFEFE2", 22);
  texto(e, A.x, A.y - 50, "¡" + TIERS[r.tier].name + "!", "#3DDC97");
  return true;
}

export function comprarArma(e: Estado, p: Jugador, i: number): boolean {
  const w = WEAPONS[i];
  if (!w || w.price === 0) return false;
  if (!p.inShop) return false;
  if (p.money < w.price) {
    texto(e, p.x, p.y - 62, "Falta " + money(w.price - p.money), "#FF6B90");
    sonar(e, "ouch");
    return false;
  }
  p.money -= w.price;
  p.ammo[w.id] += w.uses;
  p.wsel = i;
  texto(e, p.x, p.y - 62, w.icon + " +" + w.uses + " usos", w.color);
  sonar(e, "buy");
  return true;
}

export function seleccionarArma(e: Estado, p: Jugador, i: number) {
  if (i < 0 || i >= WEAPONS.length) return;
  if (!e.reglas.todasLasArmas) return;   // en el duelo de sofá solo hay chancla
  p.wsel = i;
}

/* ---- usar el arma ---- */
export function usarArma(e: Estado, p: Jugador) {
  if (e.over) return;
  if (p.stun > 0 || p.cd > 0) return;
  const w = WEAPONS[p.wsel];
  const r = rumboDeTiro(p);
  const dx = r.x, dy = r.y;

  if (w.id === "chancla") {
    const c = p.chancla;
    if (c.state !== "held") return;
    c.state = "out"; c.x = p.x; c.y = p.y - 12;
    c.vx = dx * 640; c.vy = dy * 640;
    c.travel = 0; c.spin = 0;
    sonar(e, "throw");
    return;
  }

  if (p.ammo[w.id] <= 0) {
    texto(e, p.x, p.y - 62, "Sin " + w.name.toLowerCase() + " · ve a la Armería", "#FF6B90");
    return;
  }
  p.ammo[w.id]--;
  p.cd = w.cd;

  if (w.id === "hielo") {
    e.bolts.push({ x: p.x + dx * 16, y: p.y - 12 + dy * 16, vx: dx * 820, vy: dy * 820, life: 1.1, ownerIdx: p.idx });
    sonar(e, "throw");
  }

  if (w.id === "secadora") {
    e.blasts.push({ x: p.x, y: p.y - 10, ang: Math.atan2(dy, dx), life: 0.4, kind: "cone" });
    let n = 0;
    for (const en of blancosDe(e, p)) {
      const ex = en.x - p.x, ey = (en.y - 14) - (p.y - 10);
      const d = Math.hypot(ex, ey);
      if (d > 260) continue;
      const a = Math.abs(Math.atan2(ey, ex) - Math.atan2(dy, dx));
      if (Math.min(a, 6.283 - a) > 0.7) continue;
      knock(en, ex, ey, 620);
      zap(e, en, 1.6, false);
      n++;
    }
    if (n) { p.stats.hits += n; texto(e, p.x + dx * 90, p.y - 60, "¡A volar! ×" + n, "#BFE9FF"); }
    polvo(e, p.x + dx * 40, p.y - 10, "#BFE9FF", 16);
    sonar(e, "throw");
  }

  if (w.id === "taser") {
    e.blasts.push({ x: p.x, y: p.y - 10, life: 0.45, kind: "ring", r: 140 });
    let n = 0;
    for (const en of blancosDe(e, p)) {
      if (dist2(en.x, en.y - 14, p.x, p.y - 10) > 140 * 140) continue;
      knock(en, en.x - p.x, en.y - p.y, 260);
      zap(e, en, 5, false);
      n++;
    }
    if (n) { p.stats.hits += n; texto(e, p.x, p.y - 64, "¡CHICHARRAZO! ×" + n, "#FFE066"); }
    polvo(e, p.x, p.y - 10, "#FFE066", 20);
    sonar(e, "whack");
  }

  if (w.id === "refresco") {
    p.boost = 9;
    texto(e, p.x, p.y - 62, "¡Turbo!", "#FF9EC4");
    polvo(e, p.x, p.y, "#FF9EC4", 14);
    sonar(e, "buy");
  }

  if (w.id === "capa") {
    p.invis = 8;
    texto(e, p.x, p.y - 62, "¡Modo fantasma!", "#D8CFD4");
    polvo(e, p.x, p.y, "#D8CFD4", 14);
    sonar(e, "buy");
  }

  if (w.id === "cascara") {
    e.cascaras.push({ x: p.x + dx * 26, y: p.y + 10 + dy * 18, duenoIdx: p.idx, t: 0 });
    texto(e, p.x, p.y - 62, "🍌 Puesta", "#FFD84D");
    sonar(e, "place");
  }

  if (w.id === "perro") {
    e.perros.push({
      x: p.x, y: p.y + 8, vx: 0, vy: 0, life: 20, duenoIdx: p.idx,
      face: 1, walk: 0, presaId: null, muerde: 0,
    });
    texto(e, p.x, p.y - 62, "¡Suelta al chihuahua!", "#E8B08A");
    polvo(e, p.x, p.y, "#E8B08A", 12);
    sonar(e, "buy");
  }

  if (w.id === "reloj") {
    e.slowmo = 6;
    texto(e, p.x, p.y - 62, "⏱️ ¡Todos en cámara lenta!", "#9BD97F");
    polvo(e, p.x, p.y - 10, "#9BD97F", 18);
    sonar(e, "buy");
  }

  if (w.id === "iman") {
    let best: Pedestal | null = null, bd = Infinity;
    for (const b of e.bases) {
      if (esMiPatio(p, b)) continue;
      for (const ped of b.peds) {
        if (!ped.florin) continue;
        const ex = ped.x - p.x, ey = ped.y - (p.y - 10);
        const d = Math.hypot(ex, ey);
        if (d > 320) continue;
        const a = Math.abs(Math.atan2(ey, ex) - Math.atan2(dy, dx));
        if (Math.min(a, 6.283 - a) > 0.8) continue;
        if (d < bd) { bd = d; best = ped; }
      }
    }
    if (!best) {
      texto(e, p.x, p.y - 62, "Nada que jalar por ahí", "#FF6B90");
      p.ammo[w.id]++; p.cd = 0;
    } else if (p.carry) {
      texto(e, p.x, p.y - 62, "Tienes las manos ocupadas", "#FF6B90");
      p.ammo[w.id]++; p.cd = 0;
    } else {
      e.blasts.push({ x: p.x, y: p.y - 10, ang: Math.atan2(best.y - p.y, best.x - p.x), life: 0.4, kind: "cone" });
      cargar(e, p, mismoFlorin(best.florin!));
      best.florin = null;
      p.stats.steals++;
      texto(e, best.x, best.y - 56, "🧲 ¡Jalado!", "#FF7A2F");
      polvo(e, best.x, best.y, "#FF7A2F", 14);
      sonar(e, "grab");
    }
  }

  if (w.id === "red") {
    let best: DesfileItem | null = null, bd = Infinity;
    for (const d of e.portal.desfile) {
      const ex = d.x - p.x, ey = d.y - (p.y - 10);
      const dd = Math.hypot(ex, ey);
      if (dd > 380) continue;
      const a = Math.abs(Math.atan2(ey, ex) - Math.atan2(dy, dx));
      if (Math.min(a, 6.283 - a) > 0.9) continue;
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best || p.carry) {
      texto(e, p.x, p.y - 62, best ? "Tienes las manos ocupadas" : "No hay nadie del desfile ahí", "#FF6B90");
      p.ammo[w.id]++; p.cd = 0;
    } else {
      cargar(e, p, mismoFlorin(best.florin));
      e.portal.desfile.splice(e.portal.desfile.indexOf(best), 1);
      p.stats.steals++;
      texto(e, best.x, best.y - 56, "🕸️ ¡A la red! " + TIERS[best.florin.tier].rar, "#BFE9FF");
      polvo(e, best.x, best.y, (TIERS[best.florin.tier] as any).petal, 14);
      sonar(e, "grab");
    }
  }

  if (w.id === "paraguas") {
    p.escudo = ESCUDO_DUR;
    texto(e, p.x, p.y - 62, "☂️ Escudo · 3 minutos", "#5CE1EA");
    polvo(e, p.x, p.y, "#5CE1EA", 12);
    sonar(e, "buy");
  }

  if (w.id === "abductor") {
    let best: Blanco | null = null, bd = Infinity;
    for (const en of blancosDe(e, p)) {
      if ((en as any).abducido > 0) continue;
      const ex = en.x - p.x, ey = (en.y - 14) - (p.y - 10);
      const d = Math.hypot(ex, ey);
      if (d > 420) continue;
      const a = Math.abs(Math.atan2(ey, ex) - Math.atan2(dy, dx));
      if (Math.min(a, 6.283 - a) > 0.7) continue;
      if (d < bd) { bd = d; best = en; }
    }
    if (!best) {
      texto(e, p.x, p.y - 62, "El rayo no agarró a nadie", "#FF6B90");
      p.ammo[w.id]++; p.cd = 0;
    } else {
      (best as any).abducido = 10;
      best.stun = Math.max(best.stun, 10);
      if ((best as any).carry) dropCarried(e, best as any, best.x, best.y + 14);
      p.stats.hits++;
      texto(e, best.x, best.y - 64, "🛸 ¡Abducido!", "#8B6BEE");
      polvo(e, best.x, best.y - 14, "#8B6BEE", 20);
      sonar(e, "whack");
    }
  }
}

/* ============================================================
   El tick
   ============================================================ */

/* ============================================================
   Carrera
   ============================================================
   Las vueltas se cuentan por puntos de paso EN ORDEN: por eso no sirve dar
   media vuelta ni cortar por el medio. El punto 0 es la meta. */

/** Cuántos puntos de paso lleva hechos, para ordenar la parrilla. */
function avanceDe(e: Estado, p: Jugador): number {
  const c = e.esc.circuito!;
  const r = p.carrera!;
  return r.vuelta * c.length + r.hito;
}

/** El orden de la carrera ahora mismo: primero el que va más adelante. */
export function puestosDeCarrera(e: Estado): Jugador[] {
  const c = e.esc.circuito;
  if (!c) return e.players.slice();
  return e.players.slice().sort((a, b) => {
    const ra = a.carrera, rb = b.carrera;
    if (!ra || !rb) return 0;
    // el que ya terminó va por delante, y entre ellos por orden de llegada
    if (ra.fin >= 0 || rb.fin >= 0) {
      if (ra.fin < 0) return 1;
      if (rb.fin < 0) return -1;
      return ra.fin - rb.fin;
    }
    const d = avanceDe(e, b) - avanceDe(e, a);
    if (d) return d;
    // empatados en puntos de paso, gana el que esté más cerca del siguiente
    const [hx, hy] = c[ra.hito % c.length];
    return dist2(a.x, a.y, hx, hy) - dist2(b.x, b.y, hx, hy);
  });
}

/** En qué puesto va uno, empezando por 1. */
export const puestoDe = (e: Estado, p: Jugador): number =>
  puestosDeCarrera(e).indexOf(p) + 1;

/* ---- las cajas de ítem ----
   Al pasarle por encima, la caja se rompe y en tu mano empieza a girar una
   ruleta: no sabes qué te tocó hasta que para. Es lo que hace que valga la
   pena desviarse a por una aunque vayas primero. */
function pasoCajas(e: Estado, dt: number): void {
  for (const caja of e.cajas) {
    if (caja.listo > 0) { caja.listo -= dt; continue; }
    for (const p of e.players) {
      if (p.item && (p.item.que || p.item.girando > 0)) continue;   // ya llevas uno
      if (dist2(p.x, p.y, caja.x, caja.y) > 46 * 46) continue;
      p.item = { que: null, girando: CAJA_GIRA };
      caja.listo = CAJA_VUELVE;
      polvo(e, caja.x, caja.y, "#FFC53D", 14);
      sonar(e, "grab");
      break;
    }
  }
  for (const p of e.players) {
    const it = p.item;
    if (!it || it.girando <= 0) continue;
    it.girando -= dt;
    if (it.girando > 0) continue;
    /* Y aquí para la ruleta. El especial del nivel pesa menos que los
       comunes: es el bueno y tiene que costar. */
    const lista = potenciadoresDe(e.esc.id);
    const comunes = lista.length - 1;
    const i = azar(e) < 0.18 ? lista.length - 1 : (azar(e) * comunes) | 0;
    const pot = lista[Math.min(i, lista.length - 1)];
    it.que = pot.id;
    it.girando = 0;
    texto(e, p.x, p.y - 76, pot.icon + " " + pot.nombre, "#FFC53D");
    sonar(e, "buy");
  }
}

/** Usa lo que lleves en la mano. Devuelve false si no llevabas nada. */
export function usarPotenciador(e: Estado, p: Jugador): boolean {
  const it = p.item;
  if (!it || !it.que || it.girando > 0) return false;
  const pot = potenciadorPorId(it.que);
  it.que = null;
  if (!pot) return false;

  if (pot.efecto === "turbo") {
    p.boost = Math.max(p.boost, 3.2);
    texto(e, p.x, p.y - 70, pot.icon + " ¡" + pot.nombre + "!", "#FF9EC4");
  } else if (pot.efecto === "escudo") {
    p.escudo = Math.max(p.escudo, 14);
    texto(e, p.x, p.y - 70, pot.icon + " protegido", "#5CE1EA");
  } else if (pot.efecto === "fantasma") {
    p.invis = Math.max(p.invis, 5);
    texto(e, p.x, p.y - 70, pot.icon + " " + pot.nombre, "#C9C2D8");
  } else if (pot.efecto === "cascara") {
    e.cascaras.push({ x: p.x - p.face * 46, y: p.y + 12, duenoIdx: p.idx, t: 0 });
    texto(e, p.x, p.y - 70, pot.icon + " ¡ahí va!", "#FFD84D");
  } else {
    /* El rayo: a todos los demás, no al que lo tira. Es el objeto de
       remontada, así que castiga sobre todo a quien va delante. */
    let cuantos = 0;
    for (const q of e.players) {
      if (q.idx === p.idx || (q.carrera && q.carrera.fin >= 0)) continue;
      zap(e, q, 1.6, false);
      cuantos++;
    }
    texto(e, p.x, p.y - 70, pot.icon + " ¡" + pot.nombre + "! (" + cuantos + ")", "#8B6BEE");
  }
  polvo(e, p.x, p.y - 18, "#FFC53D", 14);
  sonar(e, "whack");
  return true;
}

function pasoCarrera(e: Estado, dt: number): void {
  const c = e.esc.circuito;
  if (!c || !c.length) return;
  pasoCajas(e, dt);
  for (const p of e.players) {
    const r = (p.carrera ??= { vuelta: 0, hito: 1, fin: -1 });
    if (r.fin >= 0) continue;
    const [hx, hy] = c[r.hito % c.length];
    if (dist2(p.x, p.y, hx, hy) > HITO_R * HITO_R) continue;

    r.hito++;
    if (r.hito > c.length) {          // pasó por meta
      r.hito = 1;
      r.vuelta++;
      if (r.vuelta >= VUELTAS) {
        r.fin = e.t;
        const puesto = e.players.filter(q => q.carrera && q.carrera.fin >= 0).length;
        texto(e, p.x, p.y - 80, puesto === 1 ? "¡GANASTE!" : puesto + "º", "#FFC53D");
        polvo(e, p.x, p.y - 20, "#FFC53D", 26);
        sonar(e, "win");
        e.eventos.push({ t: "meta", jugador: p.idx, puesto, segundos: e.t });
        /* Se acaba cuando llega el primero: esperar a los últimos es aburrido
           y en una sala nadie quiere mirar cómo remolonea un bot. */
        if (puesto === 1) {
          e.over = true; e.winnerIdx = p.idx;
          e.eventos.push({ t: "fin", ganador: p.idx });
        }
      } else {
        texto(e, p.x, p.y - 74, "Vuelta " + (r.vuelta + 1) + "/" + VUELTAS, "#5CE1EA");
        sonar(e, "place");
      }
    }
  }
}

export function avanzar(e: Estado, entradas: Record<number, EntradaJugador>, dt: number) {
  e.eventos.length = 0;
  if (e.over) return e;

  e.t += dt;
  if (e.slowmo > 0) e.slowmo -= dt;

  /* ---- láseres: cuenta atrás y recarga de la placa ---- */
  for (const b of e.bases) {
    const L = b.laser; if (!L) continue;
    if (L.activo > 0) {
      L.activo -= dt;
      if (L.activo <= 0) {
        L.activo = 0; L.recarga = LASER_RECARGA;
        texto(e, b.rect.x + b.rect.w / 2, b.rect.y + 20, "Láseres apagados", "#FF6B90");
      }
    } else if (L.recarga > 0) {
      L.recarga -= dt;
      if (L.recarga <= 0) { L.recarga = 0; texto(e, L.x, L.y - 30, "Placa lista", "#3DDC97"); }
    }
  }

  for (const p of e.players) avanzarJugador(e, p, entradas[p.idx], dt);
  avanzarTrastos(e, dt);

  /* ---- balas de hielo ---- */
  for (let i = e.bolts.length - 1; i >= 0; i--) {
    const b = e.bolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let gone = b.life <= 0 || b.x < 10 || b.x > WORLD_W - 10 || b.y < 10 || b.y > WORLD_H - 10;
    if (!gone) {
      const dueno = jugadorDe(e, b.ownerIdx);
      for (const en of blancosDe(e, dueno)) {
        if (en.stun > 0 && (en as any).frozen > 0) continue;
        if (dist2(b.x, b.y, en.x, en.y - 14) < 30 * 30) {
          zap(e, en, 7, true);
          if (dueno) { dueno.stats.hits++; dueno.stats.froze++; }
          texto(e, en.x, en.y - 54, "¡Congelado!", "#5CE1EA");
          polvo(e, en.x, en.y - 14, "#BFE9FF", 14);
          sonar(e, "whack");
          gone = true; break;
        }
      }
    }
    if (gone) e.bolts.splice(i, 1);
  }

  for (let i = e.blasts.length - 1; i >= 0; i--) {
    e.blasts[i].life -= dt;
    if (e.blasts[i].life <= 0) e.blasts.splice(i, 1);
  }

  /* ---- ladrones ---- */
  /* En carrera no hay vecinos: ni ladrones, ni abuelas, ni desfile. Una abuela
     persiguiéndote mientras das vueltas no es gracioso, es ruido. */
  if (e.reglas.vecinos) {
  e.thiefTimer -= dt;
  if (e.thiefTimer <= 0) {
    spawnThief(e);
    let peor = 26;
    for (const p of e.players) {
      const mios = occupiedDe(e, p);
      const masCaro = mios.reduce((m, q) => Math.max(m, q.florin!.tier), 0);
      peor = Math.min(peor, 26 - Math.min(mios.length, 8) * 2.0 - masCaro * 0.7);
    }
    /* Cuántas casas de vecino hay EN TU BARRIO importa: uno de ocho manda más
       gente que uno de cuatro. Solo acelera —nunca frena— para que sacar
       vecinos a jugar no deje el mapa en silencio: los que quedan vienen
       igual de seguido, y encima tienes rivales sueltos.

       "En tu barrio" y no "en el mundo": el Multiverso tiene veinticuatro casas
       repartidas en 86 400 px, y contándolas todas salía un ladrón cada seis
       segundos —veintiocho en tres minutos, midiendo— cuando solo pueden venir
       las dos o tres que viven cerca. Se cuenta con el mismo radio con el que
       `spawnThief` elige quién sale. */
    const patios = e.players.flatMap(q => q.patios.map(id => baseDe(e, id).rect.x));
    const casas = e.bases.filter(b => !b.isPlayer && b.who &&
      patios.some(px => Math.abs(b.rect.x - px) < 3600)).length;
    const ritmo = Math.min(1, 6 / Math.max(1, casas));
    e.thiefTimer = clamp(peor * ritmo, 6, 26);
  }

  for (let i = e.thieves.length - 1; i >= 0; i--) {
    const t = e.thieves[i];
    const casa = baseDe(e, t.homeId), victima = baseDe(e, t.victimId);
    let objetivo = pedDe(e, t.target);
    applyKnock(t, dt);
    const marT = marEn(e, t.x);
    if (marT != null && !enElPuente(e, t.x) && t.y > marT) t.y = marT;
    if (t.abducido > 0) {
      t.abducido -= dt;
      if (t.abducido <= 0) {
        t.x = casa.rect.x + casa.rect.w / 2 + rnd(e, -60, 60);
        t.y = casa.rect.y + casa.rect.h / 2 + rnd(e, -50, 50);
        t.state = "go"; t.target = null;
        polvo(e, t.x, t.y - 14, "#8B6BEE", 14);
      }
      continue;
    }
    if (t.stun > 0) {
      t.stun -= dt;
      if (t.frozen > 0) t.frozen -= dt;
      continue;
    }
    const lento = e.slowmo > 0 ? 0.4 : 1;
    let tx: number | undefined, ty: number | undefined;
    let spd = t.spd * lento;

    if (laserActivo(victima)) {
      if (inRect(t.x, t.y, victima.rect, 6)) {
        const cx = victima.rect.x + victima.rect.w / 2, cy = victima.rect.y + victima.rect.h / 2;
        knock(t, t.x - cx, t.y - cy, 700);
        zap(e, t, 2.5, false);
        texto(e, t.x, t.y - 56, "¡Láser!", "#FF3D6E");
        polvo(e, t.x, t.y - 14, "#FF3D6E", 14);
        sonar(e, "whack");
        t.state = "flee"; t.target = null; objetivo = null;
        continue;
      }
      if (t.state === "go" || t.state === "grab") { t.state = "flee"; t.target = null; objetivo = null; }
    }

    if (t.salto) {
      t.saltoT += dt;
      if (t.saltoT >= t.salto) {
        t.saltoT = 0;
        const meta = t.state === "back" || t.state === "flee"
          ? { x: casa.rect.x + casa.rect.w / 2, y: casa.rect.y + casa.rect.h / 2 }
          : objetivo;
        if (meta) {
          const dx = meta.x - t.x, dy = meta.y - t.y, m = Math.hypot(dx, dy) || 1;
          const salto = Math.min(90, m);
          polvo(e, t.x, t.y - 14, "#8B6BEE", 10);
          t.x = clamp(t.x + dx / m * salto, 20, WORLD_W - 20);
          t.y = clamp(t.y + dy / m * salto, 20, WORLD_H - 20);
          polvo(e, t.x, t.y - 14, "#B57BE0", 10);
        }
      }
    }

    if (t.state === "go") {
      if (!objetivo || !objetivo.florin) {
        const K0 = LADRONES[t.who];
        let occ = occupied(victima);
        if (K0.maxTier != null) occ = occ.filter(q => q.florin!.tier <= K0.maxTier);
        if (!occ.length) { t.state = "flee"; t.target = null; objetivo = null; }
        else {
          const elegido = K0.greedy
            ? occ.reduce((a, b) => TIERS[b.florin!.tier].income > TIERS[a.florin!.tier].income ? b : a)
            : pick(e, occ);
          objetivo = elegido;
          t.target = { b: victima.id, i: victima.peds.indexOf(elegido) };
        }
      }
      if (objetivo && objetivo.florin) { tx = objetivo.x; ty = objetivo.y; }
    }
    if (t.state === "grab" && objetivo) { tx = objetivo.x; ty = objetivo.y; }
    if (t.state === "back" || t.state === "flee") {
      tx = casa.rect.x + casa.rect.w / 2; ty = casa.rect.y + casa.rect.h / 2;
      spd = t.spd * 1.14 * lento;
    }

    if (tx != null && ty != null) {
      const dx = tx - t.x, dy = ty - t.y, m = Math.hypot(dx, dy) || 1;
      if (m > 6) { t.x += dx / m * spd * dt; t.y += dy / m * spd * dt; t.face = dx > 0 ? 1 : -1; t.walk += spd * dt * 0.06; }

      if (t.state === "go" && m < 34) { t.state = "grab"; t.grabT = 0; }
      if (t.state === "grab") {
        if (!objetivo || !objetivo.florin) { t.state = "go"; t.target = null; objetivo = null; }
        else {
          t.grabT += dt;
          if (t.grabT >= 0.85) {
            const K = LADRONES[t.who];
            const fl = objetivo.florin;
            const robado = (fl.nombre || TIERS[fl.tier].name) +
              " (" + (fl.variant ? varLabel(fl.variant) + " " : "") + TIERS[fl.tier].rar + ")";
            t.carry = mismoFlorin(fl);
            objetivo.florin = null; t.target = null; objetivo = null;
            t.state = "back";
            const duenoV = jugadorDe(e, victima.owner);
            if (duenoV) duenoV.stats.lost++;
            texto(e, t.x, t.y + 52, "¡" + K.frase + " tu " + robado + "!", K.shirt);
            sonar(e, "lost");
          }
        }
      }
      /* `m` se midió contra el objetivo del principio del frame: si acaba de robar
         y pasó a "back", habría "llegado a casa" al instante. Se mide de nuevo. */
      if (t.state === "back" || t.state === "flee") {
        const hx = casa.rect.x + casa.rect.w / 2, hy = casa.rect.y + casa.rect.h / 2;
        if (Math.hypot(hx - t.x, hy - t.y) < 40) {
          if (t.carry) {
            const ped = freePed(casa);
            if (ped) ped.florin = mismoFlorin(t.carry, { bob: 0 });
            else e.ground.push(mismoFlorin(t.carry, { x: t.x + rnd(e, -20, 20), y: t.y + 30, bob: 0, t: 0 }));
          }
          e.thieves.splice(i, 1);
        }
      }
    }
  }

  /* ---- abuelas ---- */
  for (const b of e.bases) {
    const g = b.guard; if (!g) continue;
    applyKnock(g, dt);
    const marG = marEn(e, g.x);
    if (marG != null && !enElPuente(e, g.x) && g.y > marG) g.y = marG;
    if (g.abducido > 0) {
      g.abducido -= dt;
      if (g.abducido <= 0) {
        g.x = b.rect.x + b.rect.w / 2; g.y = b.rect.y + b.rect.h / 2;
        polvo(e, g.x, g.y - 14, "#8B6BEE", 14);
      }
      continue;
    }
    if (g.stun > 0) {
      g.stun -= dt; g.alert = 0;
      if (g.frozen > 0) g.frozen -= dt;
      continue;
    }
    const r = b.rect;
    let presa: Jugador | null = null, pd = Infinity;
    for (const p of e.players) {
      if (p.stun > 0 || p.invis > 0) continue;
      if (!inRect(p.x, p.y, r, 90)) continue;
      const d = dist2(p.x, p.y, g.x, g.y);
      if (d < pd) { pd = d; presa = p; }
    }
    const gs = e.slowmo > 0 ? 0.4 : 1;
    if (presa) {
      const p = presa;
      g.alert = Math.min(1, g.alert + dt * 4);
      const dx = p.x - g.x, dy = p.y - g.y, m = Math.hypot(dx, dy) || 1;
      g.x += dx / m * 212 * dt * gs; g.y += dy / m * 212 * dt * gs;
      g.face = dx > 0 ? 1 : -1; g.walk += dt * 11 * gs;
      if (m < 30 && !escudoAguanta(e, p)) {
        p.stun = 1.0;
        p.vx = -dx / m * 260; p.vy = -dy / m * 260;
        if (p.carry) {
          texto(e, p.x, p.y - 58, "¡Chancletazo de la abuela!", "#FFC53D");
          dropCarried(e, p, p.x + rnd(e, -16, 16), p.y + 22);
        } else texto(e, p.x, p.y - 58, "¡Sale de mi patio!", "#FFC53D");
        polvo(e, p.x, p.y - 10, "#FFEFE2", 12);
        sonar(e, "ouch");
      }
    } else {
      g.alert = Math.max(0, g.alert - dt * 2);
      const wps = [
        { x: r.x + 52, y: r.y + 52 }, { x: r.x + r.w - 52, y: r.y + 52 },
        { x: r.x + r.w - 52, y: r.y + r.h - 52 }, { x: r.x + 52, y: r.y + r.h - 52 },
      ];
      const w = wps[g.wp % 4];
      const dx = w.x - g.x, dy = w.y - g.y, m = Math.hypot(dx, dy) || 1;
      if (m < 12) g.wp++;
      else { g.x += dx / m * 92 * dt * gs; g.y += dy / m * 92 * dt * gs; g.face = dx > 0 ? 1 : -1; g.walk += dt * 4.4 * gs; }
    }
  }

  /* ---- los vecinos reponen sus vitrinas ---- */
  for (const b of e.bases) {
    if (b.isPlayer) continue;
    b.refill -= dt;
    if (b.refill <= 0) {
      b.refill = rnd(e, 7, 12);
      const ped = freePed(b);
      if (ped) { ped.florin = nuevoFlorin(e, rollTier(e), { bob: rnd(e, 0, 6.28) }); ped.pop = 1; }
    }
  }
  }   // fin de `if (e.reglas.vecinos)`

  /* ---- cáscaras ---- */
  for (let i = e.cascaras.length - 1; i >= 0; i--) {
    const c = e.cascaras[i];
    c.t += dt;
    let usada = false;
    const posibles: Blanco[] = [
      ...e.thieves,
      ...e.bases.filter(b => b.guard).map(b => b.guard!),
      ...e.players.filter(q => q.idx !== c.duenoIdx),
    ];
    for (const en of posibles) {
      if (en.stun > 0 || (en as any).abducido > 0) continue;
      if (dist2(en.x, en.y, c.x, c.y) > 26 * 26) continue;
      zap(e, en, 4, false);
      knock(en, rnd(e, -1, 1), rnd(e, -1, 1), 300);
      texto(e, en.x, en.y - 54, "¡Resbalón!", "#FFD84D");
      polvo(e, c.x, c.y, "#FFD84D", 12);
      const dc = jugadorDe(e, c.duenoIdx);
      if (dc) dc.stats.hits++;
      sonar(e, "whack");
      usada = true;
      break;
    }
    if (usada || c.t > 90) e.cascaras.splice(i, 1);
  }

  /* ---- chihuahuas ---- */
  for (let i = e.perros.length - 1; i >= 0; i--) {
    const d = e.perros[i];
    d.life -= dt;
    if (d.life <= 0) { polvo(e, d.x, d.y, "#E8B08A", 10); e.perros.splice(i, 1); continue; }
    if (d.muerde > 0) d.muerde -= dt;
    const amo = e.players[d.duenoIdx];
    let presa: Ladron | null = null, pd = Infinity;
    for (const t of e.thieves) {
      if (t.stun > 0 || t.abducido > 0) continue;
      if (!patiosDe(e, amo).some(b => inRect(t.x, t.y, b.rect, 70))) continue;
      const q = dist2(t.x, t.y, d.x, d.y);
      if (q < pd) { pd = q; presa = t; }
    }
    d.presaId = presa ? presa.id : null;
    if (presa) {
      const dx = presa.x - d.x, dy = presa.y - d.y, m = Math.hypot(dx, dy) || 1;
      d.x += dx / m * 236 * dt; d.y += dy / m * 236 * dt;
      d.face = dx > 0 ? 1 : -1; d.walk += dt * 13;
      if (m < 26 && d.muerde <= 0) {
        zap(e, presa, 3, false);
        knock(presa, dx, dy, 240);
        d.muerde = 1.2;
        amo.stats.hits++;
        texto(e, presa.x, presa.y - 56, "¡Mordida!", "#E8B08A");
        sonar(e, "whack");
      }
    } else {
      const dx = amo.x - d.x, dy = (amo.y + 16) - d.y, m = Math.hypot(dx, dy) || 1;
      if (m > 54) { d.x += dx / m * 180 * dt; d.y += dy / m * 180 * dt; d.face = dx > 0 ? 1 : -1; d.walk += dt * 9; }
    }
  }

  /* ---- el desfile del portal ---- */
  const P = e.portal;
  if (e.reglas.vecinos) {
  P.timer -= dt;
  if (P.timer <= 0) { P.timer = PORTAL_CADA; sacarDelPortal(e); }
  for (let i = P.desfile.length - 1; i >= 0; i--) {
    const d = P.desfile[i];
    if (d.pop > 0) d.pop -= dt * 2.2;
    d.k += dt / PORTAL_VUELTA;
    if (d.k >= 1) { polvo(e, P.x, P.y, "#8B6BEE", 10); P.desfile.splice(i, 1); continue; }

    /* Van por la pasarela, no sueltos por el mapa: bajan del portal de arriba,
       dan una vuelta entera al ocho y salen por el de abajo. Lo que cambia de
       uno a otro es POR DÓNDE tiran al llegar al cruce — cuatro caminos, echados
       a suertes al salir. Yendo sueltos se perdía la pasarela entera; dando
       todos exactamente la misma vuelta te aprendías el recorrido y esperabas
       sentado en un punto. */
    const q = puntoDelDesfile(e, d.k, d.lado, d.giro);
    d.face = q.x >= d.x ? 1 : -1;
    d.x = q.x; d.y = q.y;
    d.florin.bob += dt * 4.2;
  }
  }

  /* ---- ruleta ---- */
  if (e.girando) {
    e.girando.t += dt;
    if (e.girando.t >= e.girando.dur) {
      const gg = e.girando;
      e.girando = null;
      entregarPremio(e, e.players[gg.jugadorIdx], gg.premio);
      if (gg.premio.kind === "florin")
        e.eventos.push({ t: "album", tier: gg.premio.tier, variant: gg.premio.variant });
      e.ultimoPremio = gg.premio;
    }
  }

  /* ---- animación de vitrinas ---- */
  for (const b of e.bases) for (const ped of b.peds) {
    if (ped.pop > 0) ped.pop -= dt * 2.2;
    if (ped.florin) ped.florin.bob += dt * 2.4;
  }

  /* ---- alarma de robo ----
     Suena mientras el ladrón esté forcejeando con tu vitrina Y TAMBIÉN mientras
     se lo lleva a su casa. Antes se apagaba a los 0.8 s de que agarrara el
     Florín, que es justo cuando de verdad hay que salir corriendo: se avisaba
     del amago y se callaba durante el robo. Se apaga sola cuando ya no hay nada
     que hacer — porque llegó a su casa, o porque lo soltó y lo puedes recoger. */
  const robando = e.thieves.find(t => {
    if (t.stun > 0 || t.abducido > 0) return false;
    const victima = baseDe(e, t.victimId);
    if (victima.owner == null) return false;
    if (t.state === "grab") return !!pedDe(e, t.target)?.florin;
    return t.state === "back" && !!t.carry;      // ya lo tiene y va camino a casa
  });
  /* Un vecino que juega roba igual que un ladrón, así que avisa igual: mientras
     forcejea con tu vitrina todavía te da tiempo a cruzar el mapa. No hay
     versión "ya se lo lleva" como con los ladrones porque un jugador no va a
     ninguna casa concreta: en cuanto lo agarra, la carrera es por quitárselo. */
  const rival = e.players.find(p => {
    const ref = p.grab.ped;
    if (!ref || ref.tipo !== "ped" || p.grab.t <= 0 || p.stun > 0) return false;
    const casa = baseDe(e, (ref as any).b);
    return casa.owner != null && casa.owner !== p.idx && !!casa.peds[(ref as any).i]?.florin;
  });
  if (robando || rival) {
    const victima = robando ? baseDe(e, robando.victimId)
                            : baseDe(e, (rival!.grab.ped as any).b);
    if (!e.alarma) sonar(e, "alarma");
    else if (e.alarma.pip <= 0) { sonar(e, "alarma"); e.alarma.pip = 0.9; }
    e.alarma = {
      quien: robando ? LADRONES[robando.who].label
                     : (rival!.apodo || "J" + (rival!.idx + 1)),
      color: robando ? LADRONES[robando.who].shirt : rival!.shirt,
      patio: victima.name,
      x: robando ? robando.x : rival!.x,
      y: robando ? robando.y : rival!.y,
      pip: e.alarma ? e.alarma.pip - dt : 0.9,
      victimaIdx: victima.owner!,
      llevandose: !!robando && robando.state === "back",
    };
  } else {
    e.alarma = null;
  }

  if (e.reglas.modo === "carrera") { pasoCarrera(e, dt); return e; }
  /* Manda el MODO, no el estado que haya suelto. Preguntando `if (e.basquet)`
     bastaba con que alguien llenara ese campo desde fuera para que el juego
     "empezara" —y como el modo seguía siendo "aventura", el barrio seguía
     corriendo debajo—. El modo es lo que apaga las dos cosas a la vez. */
  const paso = PASOS[e.reglas.modo as JuegoDeSitio];
  if (paso) { paso(e, dt); return e; }

  /* ---- la meta: la vitrina ----

     Antes esto miraba el dinero, y con 174 000× de abanico entre la vitrina
     más pobre y la más rica no había número que valiera: eterno al empezar,
     instantáneo al final. Ahora el hito es llenar la vitrina y luego subirle
     la rareza, que es lo que el juego dice que importa y no se infla. */
  for (const p of e.players) {
    const nivel = nivelDeVitrina(e, p);
    if (nivel > p.hitoN) {
      p.hitoN = nivel;
      texto(e, p.x, p.y - 92, nombreDeHito(nivel), "#FFC53D");
      polvo(e, p.x, p.y - 20, "#FFC53D", 26);
      e.eventos.push({ t: "hito", n: nivel, monto: Math.floor(p.money), jugador: p.idx });
      p.fiesta = 2.2;
      sonar(e, "win");

      /* En versus se gana llenando los patios que tengas. Comprar uno más da
         ingresos pero alarga la meta: seis huecos se llenan antes que doce. */
      if (e.reglas.modo === "versus" && nivel >= 1) {
        e.over = true; e.winnerIdx = p.idx;
        e.eventos.push({ t: "fin", ganador: p.idx });
      }
    }
    if (p.fiesta > 0) p.fiesta -= dt;
  }
  return e;
}

/* ---- lo que le pasa a UN jugador ---- */
/* ============================================================
   Trastos: bicis, tablas, pelotas
   ============================================================ */

/** La pelota del partido que se juega EN EL AIRE (tenis, vóley), o null.

    Estos dos comparten tres excepciones frente a cualquier otra pelota del
    mapa: no se empuja al pisarla, no aturde a nadie mientras vuela, y mientras
    vuela tampoco la frena el rozamiento de rodar — que es lo que hace que la
    parábola calculada al golpearla se cumpla. Sin lo último, el saque de vóley
    se quedaba corto y caía en el propio campo: partidos enteros de puros
    saques fallados, medido. */
const balonEnElAire = (e: Estado): number | null =>
  e.tenis ? e.tenis.balon : e.voley ? e.voley.balon : e.basquet ? e.basquet.balon : null;

/** Le pone el Florín en las manos y, si iba montado, lo baja: el vehículo es
    para llegar, no para escapar con el botín. */
export function cargar(e: Estado, p: Jugador, f: Florin): void {
  p.carry = f;
  if (p.montado != null) bajarse(e, p, true);
}

/** Te bajas de lo que lleves y queda tirado donde estás. */
export function bajarse(e: Estado, p: Jugador, aviso = false): void {
  const v = trastoDe(e, p.montado);
  p.montado = null;
  if (!v) return;
  v.montadoPor = null;
  v.x = p.x; v.y = p.y;
  if (aviso) polvo(e, v.x, v.y, "#FFEFE2", 6);
}

/* Cuánto multiplica la velocidad lo que llevas debajo.

   La tabla se agarra en la arena y con ella te metes al agua — es como funciona
   surfear, y además es la única forma de que se pueda alcanzar: el tope de la
   orilla te echa fuera antes de poder tocar nada que flote mar adentro. Fuera
   de su elemento el trasto no te acelera, te estorba: la llevas a cuestas. */
export function multDeMontura(e: Estado, p: Jugador): number {
  const v = trastoDe(e, p.montado);
  if (!v) return 1;
  const info = VEHICULOS[v.tipo];
  if (!info) return 1;
  return info.agua === enElMar(e, p.x, p.y) ? info.mult : 0.9;
}

/* Montarse es automático al pisarlo, pero solo una vez por visita: sin el
   `trastoUsado` te bajarías y te volverías a montar en el mismo frame mientras
   sigues encima. Es el mismo bicho que ya mordió con la pasarela. */
function tocarTrastos(e: Estado, p: Jugador): void {
  let sigueCerca: number | null = null;

  for (const v of e.trastos) {
    if (v.montadoPor != null && v.montadoPor !== p.idx) continue;
    /* La pelota del tenis y la del vóley no se empujan al pisarlas: en un
       peloteo, arrastrarla con las piernas se salta las reglas de golpe. Se le
       pega, o no se le pega. */
    if (v.id === balonEnElAire(e)) continue;
    const cerca = dist2(p.x, p.y, v.x, v.y) < TRASTO_ALCANCE * TRASTO_ALCANCE;
    if (!cerca) continue;
    if (p.trastoUsado === v.id) { sigueCerca = v.id; continue; }

    if (esVehiculo(v.tipo)) {
      // ya montado en otro vehículo
      if (p.montado != null) continue;
      const info = VEHICULOS[v.tipo];
      p.montado = v.id;
      v.montadoPor = p.idx;
      p.trastoUsado = v.id;
      sigueCerca = v.id;
      texto(e, p.x, p.y - 40, info.icon + " " + info.label, "#5CE1EA");
      sonar(e, "grab");
    } else {
      // pelotas y matas: se patean en la dirección en la que ibas
      /* Menos si va por el aire: un balón volando se cabecea, no se lleva por
         delante. Sin esto, un centro moría en las piernas del primero que
         pasara por debajo. */
      if ((v.z ?? 0) > 24) continue;
      const vel = Math.hypot(p.vx, p.vy);
      if (vel < 40) continue;
      v.vx = (p.vx / vel) * vel * PATADA;
      v.vy = (p.vy / vel) * vel * PATADA;
      v.pateadoPor = p.idx;
      p.trastoUsado = v.id;
      sigueCerca = v.id;
      polvo(e, v.x, v.y, "#FFEFE2", 5);
      sonar(e, "whack");
    }
  }

  // al alejarse se olvida, y se puede volver a interactuar
  if (p.trastoUsado != null && sigueCerca !== p.trastoUsado) p.trastoUsado = null;
}

/* Lo que rueda: rozamiento, rebote en los bordes y, si va con fuerza, un
   pelotazo. Noquea menos que la chancla (1.6 s contra 3.6) y hay que calcular
   el rebote, así que es un arma gratis pero torpe — no deja la chancla de
   sobra. Solo golpea si va rápido: rozarla al caminar no tumba a nadie. */
const PELOTAZO_MIN = 260;      // por debajo de esto, la pelota solo rueda
const PELOTAZO_STUN = 1.6;

function avanzarTrastos(e: Estado, dt: number): void {
  for (const v of e.trastos) {
    if (v.montadoPor != null) continue;
    if (!v.vx && !v.vy) continue;
    /* La pelota del tenis y la del vóley, mientras vuelan, ni frenan ni tumban
       a nadie. Lo primero porque su parábola se calcula al golpearla y el
       rozamiento de rodar la dejaría siempre corta —o sea, siempre en la red—;
       lo segundo porque un pelotazo que aturde 1,6 s cada vez que cruza la
       cancha no es un partido, es una pelea de pelotazos.
       En tenis, solo antes del primer bote: lo que pica dentro ya rueda como
       cualquier pelota. En vóley no hay bote bueno, así que siempre. */
    const enElAire = v.id === balonEnElAire(e) && (v.z ?? 0) > 0 &&
                     (!e.tenis || e.tenis.botes === 0);
    /* Y la del básquet, mientras la lleva alguien, no se mueve sola: la
       coloca `pasoBasquet` delante del que bota. */
    if (e.basquet && v.id === e.basquet.balon && e.basquet.conLaBola != null) continue;
    /* Y la de los bolos NUNCA se mueve aquí: su rodadura, su rebote en las
       canaletas y su choque con los pinos son todo `pasoBolos`. Con el
       rozamiento de rodar de los trastos (0,12/s se come tres cuartos de la
       velocidad en 0,7 s) no llegaba a los pinos ni de milagro. */
    if (e.bolos && v.id === e.bolos.balon) continue;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.giro += Math.hypot(v.vx, v.vy) * dt * 0.06;
    if (v.x < 20 || v.x > WORLD_W - 20) { v.vx *= -0.7; v.x = clamp(v.x, 20, WORLD_W - 20); }
    if (v.y < 20 || v.y > WORLD_H - 20) { v.vy *= -0.7; v.y = clamp(v.y, 20, WORLD_H - 20); }

    const rapidez = Math.hypot(v.vx, v.vy);
    if (rapidez >= PELOTAZO_MIN && !enElAire) {
      const quien = jugadorDe(e, v.pateadoPor);
      for (const b of blancosDe(e, quien)) {
        if ((b as any).stun > 0) continue;
        if (dist2(v.x, v.y, b.x, b.y) > 30 * 30) continue;
        zap(e, b, PELOTAZO_STUN, false);
        knock(b as any, b.x - v.x, b.y - v.y, rapidez * 0.5);
        v.vx *= -0.45; v.vy *= -0.45;          // la pelota rebota en quien golpea
        if (quien) quien.stats.hits++;
        texto(e, b.x, b.y - 52, "¡Pelotazo!", "#FFC53D");
        sonar(e, "whack");
        break;
      }
    }

    const roce = enElAire ? 1 : Math.pow(RODAR_ROCE, dt);
    v.vx *= roce; v.vy *= roce;
    if (Math.hypot(v.vx, v.vy) < 6) { v.vx = 0; v.vy = 0; v.pateadoPor = null; }
  }
}

function avanzarJugador(e: Estado, p: Jugador, ent: EntradaJugador | undefined, dt: number) {
  p.money += playerIncome(e, p) * dt;

  let ix = ent ? ent.mover.x : 0;
  let iy = ent ? ent.mover.y : 0;
  const im = Math.hypot(ix, iy);
  if (im > 1) { ix /= im; iy /= im; }

  if (ent && ent.apunta) { p.apunta.on = true; p.apunta.wx = ent.apunta.x; p.apunta.wy = ent.apunta.y; }
  else if (ent) p.apunta.on = false;

  if (p.stun > 0) {
    p.stun -= dt; ix = iy = 0;
    if (p.montado != null) bajarse(e, p, true);   // un golpe te tira del vehículo
  }
  if (p.boost > 0) p.boost -= dt;
  if (p.invis > 0) p.invis -= dt;
  if (p.inmune > 0) p.inmune -= dt;
  if (p.escudo > 0){
    p.escudo -= dt;
    if (p.escudo <= 0){ p.escudo = 0; texto(e, p.x, p.y - 62, "☂️ Se cerró el paraguas", "#8E7F92"); }
  }
  if (p.cd > 0) p.cd -= dt;

  /* Sin topes (fácil), el césped te deja al 70 %. Es lo único que hace que
     valga la pena seguir el trazado cuando no hay muro que te devuelva: sin
     esto, cortar por fuera de cada curva salía gratis. */
  const hierba = e.reglas.modo === "carrera" && !dificultadDe(e.reglas).topes &&
                 !sobreLaPista(e, p) ? dificultadDe(e.reglas).fuera : 1;
  const speed = (p.carry ? 196 : 268) * (p.boost > 0 ? 1.75 : 1) * multDeMontura(e, p) * hierba;
  p.vx = lerp(p.vx, ix * speed, 1 - Math.pow(0.0009, dt));
  p.vy = lerp(p.vy, iy * speed, 1 - Math.pow(0.0009, dt));
  p.x = clamp(p.x + p.vx * dt, 22, WORLD_W - 22);
  p.y = clamp(p.y + p.vy * dt, 22, WORLD_H - 22);

  /* ---- la orilla ----
     A pie el agua te para en seco; con tabla o flotador se entra. Si te bajas
     estando dentro, el mismo tope te devuelve a la arena. */
  const marP = marEn(e, p.x);
  if (marP != null && !puedeMojarse(e, p) && !enElPuente(e, p.x) && p.y > marP) {
    p.y = marP;
    if (p.vy > 0) p.vy = 0;
  }

  /* El tope de la pista, después de mover y antes de nada más: si no, el aro
     y los puntos de paso se calcularían con una posición que ya no vale. */
  dentroDeLaPista(e, p);

  tocarTrastos(e, p);
  const montura = trastoDe(e, p.montado);
  if (montura) {
    montura.x = p.x; montura.y = p.y;
    /* Nada de meter el "mira a la izquierda" en el giro. Girar media vuelta un
       dibujo de perfil lo pone BOCA ABAJO —la bici acababa con las ruedas
       arriba— y además el giro se queda guardado, así que la dejabas del revés
       en el suelo al bajarte. Mirar a un lado es un espejo, y de eso se encarga
       quien dibuja: aquí la montura simplemente no gira. */
    montura.giro = 0;
  }
  if (Math.abs(ix) + Math.abs(iy) > 0.1) { p.dirx = ix; p.diry = iy; if (ix) p.face = ix > 0 ? 1 : -1; }
  p.walk += Math.hypot(p.vx, p.vy) * dt * 0.055;

  /* ---- placa de los láseres ---- */
  for (const b of patiosDe(e, p)) {
    const L = b.laser; if (!L) continue;
    if (dist2(p.x, p.y, L.x, L.y) > L.r * L.r) { L.carga = 0; continue; }
    if (L.activo > 0 || L.recarga > 0) { L.carga = 0; continue; }
    if (p.money < LASER_PRECIO) {
      L.carga = 0;
      if (!L.warn || e.t - L.warn > 2) {
        L.warn = e.t;
        texto(e, L.x, L.y - 34, "Los láseres cuestan " + money(LASER_PRECIO), "#FF6B90");
      }
      continue;
    }
    L.carga += dt;
    if (L.carga >= LASER_CARGA) {
      L.carga = 0;
      L.activo = LASER_DUR;
      p.money -= LASER_PRECIO;
      texto(e, L.x, L.y - 34, "¡Láseres encendidos! " + LASER_DUR + " s", "#FF3D6E");
      polvo(e, L.x, L.y, "#FF3D6E", 18);
      sonar(e, "buy");
    }
  }

  /* ---- patio ajeno con láseres ---- */
  const veta = bloqueadoPorLaser(e, p.x, p.y, p);
  if (veta && p.stun <= 0) {
    const cx = veta.rect.x + veta.rect.w / 2, cy = veta.rect.y + veta.rect.h / 2;
    knock(p, p.x - cx, p.y - cy, 640);
    if (!escudoAguanta(e, p)) {
      p.stun = Math.max(p.stun, 1.2);
      if (p.carry) dropCarried(e, p, p.x, p.y + 18);
      texto(e, p.x, p.y - 58, "¡Láseres del vecino!", "#FF3D6E");
      polvo(e, p.x, p.y - 10, "#FF3D6E", 12);
      sonar(e, "ouch");
    }
  }

  /* ---- comprar patios extra ---- */
  for (const b of e.bases) {
    if (!b.locked) continue;
    if (inRect(p.x, p.y, b.rect, -10)) comprarPatio(e, p, b);
  }

  /* ---- robar de vitrinas y atrapar del desfile ---- */
  if (!p.carry && p.stun <= 0) {
    let best: Pedestal | DesfileItem | null = null, bd = 52 * 52;
    let ref: RefObjetivo | null = null;
    for (const b of e.bases) {
      if (esMiPatio(p, b)) continue;
      for (let i = 0; i < b.peds.length; i++) {
        const ped = b.peds[i];
        if (!ped.florin) continue;
        const d = dist2(p.x, p.y, ped.x, ped.y);
        if (d < bd) { bd = d; best = ped; ref = { tipo: "ped", b: b.id, i }; }
      }
    }
    for (const d0 of e.portal.desfile) {
      const d = dist2(p.x, p.y, d0.x, d0.y);
      if (d < bd) { bd = d; best = d0; ref = { tipo: "desfile", id: d0.id }; }
    }
    if (best && ref) {
      const mismo = p.grab.ped && p.grab.ped.tipo === ref.tipo &&
        (ref.tipo === "ped" ? (p.grab.ped as any).b === ref.b && (p.grab.ped as any).i === ref.i
                            : (p.grab.ped as any).id === ref.id);
      if (!mismo) { p.grab.ped = ref; p.grab.t = 0; }
      p.grab.t += dt;
      if (p.grab.t >= 0.55) {
        const fl = (best as any).florin as Florin;
        cargar(e, p, mismoFlorin(fl));
        const T = TIERS[fl.tier];
        if ((best as DesfileItem).esDesfile) {
          texto(e, best.x, best.y - 56, "¡Atrapado! " + T.rar, "#FF9EC4");
          const i = e.portal.desfile.indexOf(best as DesfileItem);
          if (i >= 0) e.portal.desfile.splice(i, 1);
        } else {
          texto(e, best.x, best.y - 56,
            fl.nombre ? "¡" + fl.nombre + " es mío!" : "¡Robado! " + T.rar, "#FF3D6E");
          (best as Pedestal).florin = null;
          /* Si la vitrina era de otro jugador, a ese le acaban de robar. Sin
             esto, un vecino que juega te vaciaba el patio y el marcador de "te
             robaron" seguía en cero: volvías a casa y faltaban Florines sin
             que nada lo hubiera dicho. */
          const casa = baseDe(e, (ref as any).b);
          const dueño = casa.owner != null ? jugadorDe(e, casa.owner) : null;
          if (dueño && dueño !== p){ dueño.stats.lost++; sonar(e, "lost"); }
        }
        polvo(e, best.x, best.y, (T as any).petal, 12);
        p.grab.ped = null; p.grab.t = 0;
        p.stats.steals++;
        sonar(e, "grab");
      }
    } else { p.grab.ped = null; p.grab.t = 0; }
  } else { p.grab.ped = null; p.grab.t = 0; }

  /* ---- florines en el suelo ---- */
  for (let i = e.ground.length - 1; i >= 0; i--) {
    const g = e.ground[i];
    if (p.idx === 0) { g.bob += dt * 3; g.t += dt; if (g.espera! > 0) g.espera! -= dt; }
    if (!p.carry && p.stun <= 0 && !(g.espera! > 0) && dist2(p.x, p.y, g.x, g.y) < 40 * 40) {
      cargar(e, p, mismoFlorin(g));
      texto(e, g.x, g.y - 50, g.nombre ? "¡" + g.nombre + " volvió!" : "¡Recogido!", "#3DDC97");
      e.ground.splice(i, 1);
      sonar(e, "grab");
    }
  }

  /* ---- entregar en cualquiera de tus patios ---- */
  const patioAqui = p.carry ? patiosDe(e, p).find(b => inRect(p.x, p.y, b.rect, 8)) : null;
  if (patioAqui && p.carry) {
    const ped = freePed(patioAqui) || freePedDe(e, p);
    if (ped) {
      ped.florin = mismoFlorin(p.carry, { bob: 0 });
      ped.pop = 1;
      const TT = TIERS[p.carry.tier];
      e.eventos.push({ t: "album", tier: p.carry.tier, variant: p.carry.variant });
      texto(e, ped.x, ped.y - 58, "+" + florinIncome(p.carry) + "/s", "#3DDC97");
      polvo(e, ped.x, ped.y,
        p.carry.variant ? (VARIANTES as any)[p.carry.variant].color : (TT as any).petal, 14);
      p.carry = null;
      sonar(e, "place");
    } else if (!p.fullWarn || e.t - p.fullWarn > 2.2) {
      p.fullWarn = e.t;
      texto(e, p.x, p.y - 56, "¡Vitrina llena!", "#FFC53D");
    }
  }

  /* ---- chancla ---- */
  const c = p.chancla;
  if (c.state !== "held") {
    c.spin += dt * 17;
    if (c.state === "out") {
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.travel += Math.hypot(c.vx, c.vy) * dt;
      if (c.travel > 420 || c.x < 14 || c.x > WORLD_W - 14 || c.y < 14 || c.y > WORLD_H - 14) c.state = "back";
    } else {
      const dx = p.x - c.x, dy = (p.y - 12) - c.y, m = Math.hypot(dx, dy) || 1;
      c.x += dx / m * 760 * dt; c.y += dy / m * 760 * dt;
      if (m < 26) c.state = "held";
    }
    const golpear = (en: any, esJugador: boolean) => {
      en.stun = Math.max(en.stun, esJugador ? 2.2 : (en.isGuard ? 4.4 : 3.6));
      p.stats.hits++;
      texto(e, en.x, en.y - 52, "¡CHANCLETAZO!", "#FF3D6E");
      polvo(e, en.x, en.y - 14, "#FFEFE2", 14);
      sonar(e, "whack");
      if (en.carry) dropCarried(e, en, en.x, en.y + 14);
      if (esJugador) {
        const dx = en.x - p.x, dy = en.y - p.y, m = Math.hypot(dx, dy) || 1;
        en.vx = dx / m * 300; en.vy = dy / m * 300;
      }
      c.state = "back";
    };
    for (const t of e.thieves)
      if (t.stun <= 0 && dist2(c.x, c.y, t.x, t.y - 14) < 30 * 30) { t.isGuard = false; golpear(t, false); break; }
    if (c.state === "out")
      for (const b of e.bases) {
        const g = b.guard;
        if (g && g.stun <= 0 && dist2(c.x, c.y, g.x, g.y - 14) < 32 * 32) { g.isGuard = true; golpear(g, false); break; }
      }
    if (c.state === "out")
      for (const o of e.players) {
        if (o === p || o.stun > 0) continue;
        if (dist2(c.x, c.y, o.x, o.y - 14) < 30 * 30) { golpear(o, true); break; }
      }
  } else c.spin = 0;

  /* ---- estar en los puestos: solo marca la cercanía, el panel lo abre el host ---- */
  if (e.reglas.puestos) {
    p.inShop = e.armerias.some(a => inRect(p.x, p.y, a, 30));
    p.inRuleta = e.ruletas.some(r => dist2(p.x, p.y, r.x, r.y) < (r.r + 30) ** 2);
    p.inFusion = !!e.fusion && inRect(p.x, p.y, e.fusion, 30);
    p.enSitio = e.sitios.find(s => inRect(p.x, p.y, s.rect, 0))?.juego ?? null;
  }
}


/* ============================================================
   El partido
   ============================================================
   La pelota se patea con el mismo código que cualquier pelota del patio: aquí
   solo se la mantiene dentro de la cancha, se mira si entró y se lleva la
   cuenta. Lo demás —correr, chanclear, aturdirse— ya funcionaba. */
/* ---- patear y cabecear ----
   Correr por encima de la pelota ya la movía; esto es apuntar y pegarle. Un
   toque la empuja, aguantando el botón sale un pelotazo, y a partir de cierta
   fuerza SALE POR EL AIRE: eso es lo que hace que existan los centros, y con
   ellos los cabezazos.

   `fuerza` va de 0 a 1 y la manda quien juega (el botón la carga). El motor la
   recorta, así que un cliente que mande 99 no llega más lejos que uno honesto. */
export const PATEO_ALCANCE = 74;
const PATEO_BASE = 340, PATEO_TOPE = 980;
/** A partir de aquí el balón se eleva: por debajo, va rastrero. */
const PATEO_VUELA = 0.55;
export const GRAVEDAD = 1600;

/** ¿Cuál es la pelota del partido y está a mi alcance? */
function balonAlAlcance(e: Estado, p: Jugador): Trasto | null {
  const f = e.futbol;
  if (!f) return null;
  const b = e.trastos.find(t => t.id === f.balon);
  if (!b) return null;
  return dist2(p.x, p.y, b.x, b.y) < PATEO_ALCANCE * PATEO_ALCANCE ? b : null;
}

/**
 * Pegarle a la pelota. Si viene por el aire y la tienes encima, es un CABEZAZO:
 * sale más plano y menos fuerte, pero te deja rematar un centro sin esperar a
 * que bote — que es justo para lo que sirve un cabezazo.
 * Devuelve qué pasó, para que el cliente lo cuente.
 */
export function patear(e: Estado, p: Jugador,
                       fuerza = 0): "patada" | "cabezazo" | "golpe" | "pase" | "remate"
                                  | "tiro" | "bola" | "zurdazo" | "dardo" | null {
  /* El mismo botón es la raqueta en el tenis y las manos en el vóley. Se
     reparte aquí y no en el cliente para que teclado, botón y sala pidan
     siempre lo mismo. */
  if (e.tenis) return golpeDeTenis(e, p, clamp(fuerza, 0, 1));
  if (e.voley) return golpeDeVoley(e, p, clamp(fuerza, 0, 1));
  if (e.basquet) return tiroDeBasquet(e, p, clamp(fuerza, 0, 1));
  if (e.bolos) return tirarBolos(e, p, clamp(fuerza, 0, 1));
  if (e.hockey) return golpeDeHockey(e, p, clamp(fuerza, 0, 1));
  if (e.dardos) return tirarDardo(e, p, clamp(fuerza, 0, 1));
  const f = e.futbol;
  if (!f || f.ganador != null || p.stun > 0) return null;
  const b = balonAlAlcance(e, p);
  if (!b) return null;
  /* Durante el saque no se le pega: si no, el que saca lo hace desde el centro
     antes de que los demás se coloquen. */
  if (f.saque > 0) return null;

  const k = clamp(fuerza, 0, 1);
  /* Hacia donde apuntas, y si no apuntas, hacia donde corres. Quieto y sin
     apuntar, hacia donde miras: pegarle "a ninguna parte" no existe. */
  const a = p.apunta;
  let dx = a.on ? a.wx - p.x : p.vx, dy = a.on ? a.wy - p.y : p.vy;
  if (Math.hypot(dx, dy) < 1){ dx = p.face; dy = 0; }
  const m = Math.hypot(dx, dy) || 1;

  const porElAire = (b.z ?? 0) > 24;
  if (porElAire) {
    /* Cabezazo: el balón ya venía volando y lo bajas de testa. */
    const v = PATEO_BASE * (0.55 + k * 0.35);
    b.vx = dx / m * v; b.vy = dy / m * v;
    b.vz = 120;                        // un pique corto, no otro globo
    b.pateadoPor = p.idx;
    texto(e, p.x, p.y - 58, "¡De cabeza!", "#FFC53D");
    sonar(e, "kick");
    return "cabezazo";
  }

  const v = PATEO_BASE + (PATEO_TOPE - PATEO_BASE) * k;
  b.vx = dx / m * v; b.vy = dy / m * v;
  b.vz = k > PATEO_VUELA ? 260 + (k - PATEO_VUELA) * 900 : 0;
  b.z = b.z ?? 0;
  b.pateadoPor = p.idx;
  polvo(e, b.x, b.y, "#FFEFE2", k > PATEO_VUELA ? 10 : 5);
  sonar(e, "kick");
  return "patada";
}

function pasoFutbol(e: Estado, dt: number): void {
  const f = e.futbol;
  if (!f || f.ganador != null) return;

  const balon = e.trastos.find(t => t.id === f.balon);
  if (!balon) return;

  /* El saque: unos segundos de quietud tras cada gol para que se coloquen. La
     pelota no se mueve, pero la gente sí — así se sale corriendo al pitido. */
  if (f.saque > 0) {
    f.saque -= dt;
    balon.vx = 0; balon.vy = 0;
    return;
  }

  /* La pelota en el aire: sube, cae y bota. Mientras vuela nadie la empuja al
     rozarla —para eso está el cabezazo—, y por eso un centro cruza por encima
     de la marca en vez de quedarse en el primer par de piernas. */
  if ((balon.z ?? 0) > 0 || (balon.vz ?? 0) !== 0) {
    balon.vz = (balon.vz ?? 0) - GRAVEDAD * dt;
    balon.z = (balon.z ?? 0) + balon.vz * dt;
    if (balon.z <= 0) {
      balon.z = 0;
      /* Cada bote se come más de la mitad: dos botes y ya rueda. */
      balon.vz = Math.abs(balon.vz) > 140 ? Math.abs(balon.vz) * 0.42 : 0;
      if (balon.vz === 0) balon.z = 0;
    }
  }

  f.reloj -= dt;
  if (f.ultimoGol != null && f.reloj < f.reloj + 1) { /* el cliente ya lo celebró */ }

  /* ---- ¿gol? ----
     Se mira la boca del arco, no el fondo: si se mirara el fondo, un pelotazo
     fuerte podría atravesarlo entre dos frames y salir por el otro lado. */
  for (const q of [0, 1] as const) {
    const arco = f.arcos[q];
    if (!inRect(balon.x, balon.y, arco, 8)) continue;
    /* En el arco del equipo 0 marca el equipo 1: defiendes el tuyo. */
    const marca = (1 - q) as 0 | 1;
    f.goles[marca]++;
    f.ultimoGol = marca;
    texto(e, balon.x, balon.y - 60, "¡GOL!", marca === 0 ? "#3DDC97" : "#FF5C86");
    polvo(e, balon.x, balon.y, marca === 0 ? "#3DDC97" : "#FF5C86", 26);
    sonar(e, "win");
    e.eventos.push({ t: "gol", equipo: marca, goles: [f.goles[0], f.goles[1]] });
    if (f.goles[marca] >= f.meta) {
      f.ganador = marca;
      terminarPartido(e);
      return;
    }
    sacarDelCentro(e);
    return;
  }

  /* ---- la pelota no se sale ----
     Rebota en la banda en vez de irse: un saque de banda con seis jugadores es
     una regla más que explicar y una interrupción cada diez segundos. */
  const c = f.cancha, R = 16;
  if (balon.x < c.x + R) { balon.x = c.x + R; balon.vx = Math.abs(balon.vx) * 0.7; }
  if (balon.x > c.x + c.w - R) { balon.x = c.x + c.w - R; balon.vx = -Math.abs(balon.vx) * 0.7; }
  if (balon.y < c.y + R) { balon.y = c.y + R; balon.vy = Math.abs(balon.vy) * 0.7; }
  if (balon.y > c.y + c.h - R) { balon.y = c.y + c.h - R; balon.vy = -Math.abs(balon.vy) * 0.7; }

  /* La gente tampoco: fuera de la cancha no hay partido. */
  for (const p of e.players) {
    p.x = clamp(p.x, c.x + 20, c.x + c.w - 20);
    p.y = clamp(p.y, c.y + 20, c.y + c.h - 20);
  }

  /* ---- la pelota no se queda atrapada ----
     Una pelota muerta en una esquina, o pillada entre seis piernas que se la
     pisan unos a otros, no es un partido: es una foto. A los cuatro segundos
     sin ir a ninguna parte, al centro. El hockey ya tenía esta regla y el
     fútbol no, que es donde más pasa — ahí hay diez jugadores y cuatro
     esquinas. */
  f.quieto = Math.hypot(balon.vx, balon.vy) < 70 ? f.quieto + dt : 0;
  if (f.quieto > 4) {
    f.quieto = 0;
    texto(e, balon.x, balon.y - 46, "¡Bola al centro!", "#FFC53D");
    balon.x = c.x + c.w / 2; balon.y = c.y + c.h / 2;
    balon.vx = 0; balon.vy = 0; balon.z = 0; balon.vz = 0;
    balon.pateadoPor = null;
    polvo(e, balon.x, balon.y, "#FFC53D", 12);
    return;
  }

  if (f.reloj <= 0) {
    f.reloj = 0;
    /* Empate a los cuatro minutos: gana quien vaya ganando, y si van iguales
       se queda en empate. Alargar un empate con muerte súbita es otra regla
       que nadie pidió. */
    f.ganador = f.goles[0] === f.goles[1] ? null : (f.goles[0] > f.goles[1] ? 0 : 1);
    terminarPartido(e);
  }
}

/* ============================================================
   El tenis
   ============================================================
   Tres reglas y ninguna más: la pelota tiene que caer en el campo de enfrente,
   el de enfrente tiene que devolverla antes del segundo bote, y a la red no se
   le pega. Todo lo demás sale solo de esas tres.

   El estado que las sostiene son dos números: quién le dio el último y cuántas
   veces ha botado desde entonces. Con eso se sabe de quién es la culpa de todo
   lo que pueda pasar. */

/** El brazo llega un poco más lejos que el pie: es una raqueta. */
export const TENIS_ALCANCE = 124;
/** La pelota de tenis pica más viva que un balón: da tiempo a llegar. */
const TENIS_BOTE = 0.62;
/** A qué altura sale de la raqueta. Sin esto, quien juega pegado a la red se
    la comía siempre: la parábola nacía en el suelo, justo debajo de ella. */
const TENIS_SALIDA = 36;

/**
 * Un golpe de tenis. Con un solo botón hay dos cosas que decidir y solo caben
 * dos: **la carga manda el fondo y la puntería el lado**. Que apuntar mal
 * significara mandarla a tu propio campo no sería un fallo del jugador, sería
 * un juego roto — así que la dirección al otro lado la pone el motor.
 */
function golpeDeTenis(e: Estado, p: Jugador, k: number): "golpe" | null {
  const t = e.tenis;
  if (!t || t.ganador != null || p.stun > 0 || t.saque > 0) return null;
  const b = e.trastos.find(x => x.id === t.balon);
  if (!b) return null;
  if (dist2(p.x, p.y, b.x, b.y) > TENIS_ALCANCE * TENIS_ALCANCE) return null;

  const mio = (p.equipo ?? 0) as 0 | 1;
  /* Dos veces seguidas no le pega el mismo lado: o la devuelve el otro, o el
     punto es suyo. Esto también es lo que impide que en dobles los dos
     compañeros se turnen a peloteo entre ellos. */
  if (t.ultimoToque === mio) return null;
  /* Y solo en tu mitad: por encima del campo del otro la pelota es suya. */
  if (ladoDeLaCancha(t, b.x) !== mio) return null;

  const c = t.cancha;
  const haciaDonde = mio === 0 ? 1 : -1;
  /* De cerca de la red al fondo del campo contrario. */
  const fondo = 0.30 + 0.62 * k;
  const tx = t.redX + haciaDonde * (c.w / 2) * fondo;
  const a = p.apunta;
  const ty = clamp(a.on ? a.wy : b.y, c.y + 70, c.y + c.h - 70);

  /* El vuelo se resuelve al revés que en el fútbol: allí se elige la fuerza y
     se ve dónde cae; aquí se elige DÓNDE CAE y se despeja la fuerza. Es lo que
     hace que un solo botón baste, y de paso lo que garantiza que la pelota
     pase por encima de la red y no por debajo. */
  /* El tiempo de vuelo es LA palanca de dificultad: a igual distancia, más
     tiempo es una pelota más lenta y más rato para llegar a ella. Empezó en
     0,62 s y no había quien la devolviera. */
  const T = 0.92 + 0.38 * k;
  const z0 = Math.max(b.z ?? 0, TENIS_SALIDA);
  b.vx = (tx - b.x) / T;
  b.vy = (ty - b.y) / T;
  b.z = z0;
  b.vz = GRAVEDAD * T / 2 - z0 / T;      // así toca el suelo justo en el destino
  b.pateadoPor = p.idx;

  t.ultimoToque = mio;
  t.botes = 0;
  t.ladoDelBote = null;
  polvo(e, b.x, b.y - 10, "#FFEFE2", k > 0.6 ? 8 : 4);
  sonar(e, "whack");
  return "golpe";
}

/** El saque sale solo cuando se acaba la cuenta: con bots de por medio, un
    saque que hay que pedir es un partido que puede no empezar nunca. */
function saqueDeTenis(e: Estado): void {
  const t = e.tenis!;
  const b = e.trastos.find(x => x.id === t.balon);
  if (!b) return;
  const c = t.cancha;
  const haciaDonde = t.sacador === 0 ? 1 : -1;
  const tx = t.redX + haciaDonde * (c.w / 2) * 0.55;
  const ty = c.y + c.h / 2 + rnd(e, -c.h * 0.28, c.h * 0.28);
  const T = 1.15;
  b.z = 44;
  b.vx = (tx - b.x) / T;
  b.vy = (ty - b.y) / T;
  b.vz = GRAVEDAD * T / 2 - b.z / T;
  b.pateadoPor = e.players.find(p => p.equipo === t.sacador)?.idx ?? null;
  t.ultimoToque = t.sacador;
  t.botes = 0;
  t.ladoDelBote = null;
  texto(e, b.x, b.y - 50, "¡Saque!", "#FFC53D");
  sonar(e, "whack");
}

function puntoDeTenis(e: Estado, equipo: 0 | 1, motivo: string): void {
  const t = e.tenis!;
  t.puntos[equipo]++;
  t.ultimoPunto = { equipo, motivo };
  const color = equipo === 0 ? "#3DDC97" : "#FF5C86";
  const b = e.trastos.find(x => x.id === t.balon);
  if (b) { b.vx = 0; b.vy = 0; b.vz = 0; }
  texto(e, b ? b.x : t.redX, (b ? b.y : t.cancha.y) - 60, "¡Punto! " + motivo, color);
  if (b) polvo(e, b.x, b.y, color, 18);
  sonar(e, "win");
  e.eventos.push({ t: "punto", equipo, puntos: [t.puntos[0], t.puntos[1]], motivo });

  if (t.puntos[equipo] >= t.meta) {
    t.ganador = equipo;
    e.over = true;
    e.winnerIdx = e.players.find(p => p.equipo === equipo)?.idx ?? null;
    e.eventos.push({ t: "fin", ganador: e.winnerIdx });
    return;
  }
  /* Saca el que ganó el punto: es lo que hace que ganar un punto se note antes
     del siguiente, y ahorra llevar la cuenta de juegos y de cambios de lado. */
  t.sacador = equipo;
  t.saque = TENIS_SAQUE;
  colocarParaElSaque(e);
}

function pasoTenis(e: Estado, dt: number): void {
  const t = e.tenis;
  if (!t || t.ganador != null) return;
  const b = e.trastos.find(x => x.id === t.balon);
  if (!b) return;
  const c = t.cancha;

  /* Nadie cruza la red. Es regla del tenis y además es lo que impide que esto
     acabe siendo el fútbol: seis piernas alrededor de la misma pelota. */
  for (const p of e.players) {
    const mio = p.equipo ?? 0;
    p.y = clamp(p.y, c.y + 24, c.y + c.h - 24);
    p.x = mio === 0
      ? clamp(p.x, c.x + 24, t.redX - 40)
      : clamp(p.x, t.redX + 40, c.x + c.w - 24);
  }

  if (t.saque > 0) {
    t.saque -= dt;
    b.vx = 0; b.vy = 0; b.vz = 0; b.z = 0;
    if (t.saque <= 0) { t.saque = 0; saqueDeTenis(e); }
    return;
  }

  const antesZ = b.z ?? 0;
  const antesX = b.x - b.vx * dt;          // dónde estaba antes de que la movieran

  /* Sube, cae y pica. */
  let aterrizó = false;
  if (antesZ > 0 || (b.vz ?? 0) !== 0) {
    b.vz = (b.vz ?? 0) - GRAVEDAD * dt;
    b.z = antesZ + b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      const golpe = Math.abs(b.vz ?? 0);
      b.vz = golpe > 120 ? golpe * TENIS_BOTE : 0;
      aterrizó = true;
    }
  }

  /* ---- ¿le dio a la red? ----
     Se mira el CRUCE, no la cercanía: a 1 300 px/s la pelota se salta la
     franja entera entre dos fotogramas, y una red que a veces no está es peor
     que ninguna. Con el tramo recorrido se saca en qué punto la cruzó y a qué
     altura iba justo ahí. */
  if ((antesX - t.redX) * (b.x - t.redX) <= 0 && Math.abs(b.x - antesX) > 0.01) {
    const u = clamp((t.redX - antesX) / (b.x - antesX), 0, 1);
    const zAllí = antesZ + ((b.z ?? 0) - antesZ) * u;
    if (zAllí < t.redAlto) {
      b.x = t.redX - (b.x - antesX > 0 ? 12 : -12);
      if (t.ultimoToque != null) {
        puntoDeTenis(e, (1 - t.ultimoToque) as 0 | 1, "a la red");
        return;
      }
    }
  }

  if (aterrizó) {
    const lado = ladoDeLaCancha(t, b.x);
    t.botes++;
    t.ladoDelBote = lado;
    if (t.botes === 1) {
      /* El primer bote cae en el campo de enfrente o el punto es del otro. */
      if (t.ultimoToque != null && lado === t.ultimoToque) {
        puntoDeTenis(e, (1 - t.ultimoToque) as 0 | 1, "se quedó corta");
        return;
      }
    } else if (t.ultimoToque != null) {
      puntoDeTenis(e, t.ultimoToque, "doble bote");
      return;
    }
  }

  /* ---- fuera ----
     Se mira la pelota, no el bote: una que se va larga ya no vuelve, y esperar
     a que pique fuera solo alarga el punto.

     Pero solo cuenta ANTES del primer bote. Una que ya picó dentro es buena,
     y que después se vaya de la cancha es exactamente lo que pasa con un
     pelotazo bien puesto: no es un fallo de quien lo dio, es un punto suyo. */
  if (!inRect(b.x, b.y, c, 0) && t.ultimoToque != null) {
    if (t.botes === 0) puntoDeTenis(e, (1 - t.ultimoToque) as 0 | 1, "fuera");
    else puntoDeTenis(e, t.ultimoToque, "no la devolvió");
    return;
  }

  /* Y el caso raro: picó una vez y se murió rodando sin que nadie la tocara.
     Sin esto el peloteo se queda ahí para siempre, porque el segundo bote que
     tenía que acabarlo no llega nunca. */
  if (t.botes >= 1 && (b.z ?? 0) <= 0 && (b.vz ?? 0) === 0 &&
      Math.hypot(b.vx, b.vy) < 24 && t.ultimoToque != null)
    puntoDeTenis(e, t.ultimoToque, "no la devolvió");
}

function terminarPartido(e: Estado): void {
  const f = e.futbol!;
  e.over = true;
  e.winnerIdx = f.ganador == null
    ? null
    : (e.players.find(p => p.equipo === f.ganador)?.idx ?? null);
  e.eventos.push({ t: "fin", ganador: e.winnerIdx });
  sonar(e, "win");
}

/** Un paso por minijuego. La misma lista que arma la cancha en `estado.ts`,
    del otro lado: si un juego está en una y no en la otra, o no se arma o no
    avanza — y las dos formas de romperse se ven a la primera partida. */
const PASOS: Record<JuegoDeSitio, (e: Estado, dt: number) => void> = {
  futbol: pasoFutbol,
  tenis: pasoTenis,
  basquet: pasoBasquet,
  bolos: pasoBolos,
  lucha: pasoLucha,
  dardos: pasoDardos,
  voley: pasoVoley,
  carreraObs: pasoCarreraObs,
  laberinto: pasoLaberinto,
  billar: pasoBillar,
  hockey: pasoHockey,
};

function terminarJuegoIndividual(e: Estado, ganador: number | null): void {
  e.over = true;
  e.winnerIdx = ganador;
  e.eventos.push({ t: "fin", ganador });
  sonar(e, "win");
}

/* ============================================================
   Básquet
   ============================================================ */
/* ---- básquet ----
   Lo que lo separa del fútbol, que también es dos equipos y una pelota, es que
   aquí la pelota se LLEVA. De eso salen sus tres cosas: botarla mientras
   corres, tirar a un aro que —visto desde arriba— es un círculo en el suelo por
   el que la pelota entra cayendo, y que te la quiten de un chanclazo.

   Y de eso sale su única decisión: no aciertas por apretar en el momento justo
   —eso ya se probó en el vóley y era una lotería—, sino por DÓNDE TIRAS DESDE.
   Cerca y sin nadie encima, entra. Desde el otro campo y con un defensor en la
   cara, no. Aguantar el botón afina la puntería, pero no arregla la distancia. */
export const BASQUET_ALCANCE = 62;
/** Altura a la que la pelota pasa por el aro, y a la que sale de las manos. */
const ARO_ALTO = 88, TIRO_SALIDA = 62;
/** Cuánto se abre el error: por cada píxel de distancia, y con un defensor. */
/* Calibrado para que la bandeja entre siempre y el tiro de media se falle la
   mitad: el error es un radio y la canasta mide 44, así que acierta
   `44/err`. A 100 px err vale 34 (entra seguro), a 200 son 68 (65 %), a 300
   son 102 (43 %) y de tres, uno de cada tres — que por eso vale tres. */
const ERROR_POR_PX = 0.62, ERROR_DEFENSOR = 62;

/** ¿Quién la lleva? */
const conLaBolaDe = (e: Estado): Jugador | null => {
  const b = e.basquet;
  return b && b.conLaBola != null ? (e.players.find(p => p.idx === b.conLaBola) ?? null) : null;
};

/** El rival más cercano que le está respirando encima al tirador. */
function defensorEncima(e: Estado, p: Jugador): number {
  let d = Infinity;
  for (const q of e.players)
    if ((q.equipo ?? 0) !== (p.equipo ?? 0) && q.stun <= 0)
      d = Math.min(d, Math.hypot(q.x - p.x, q.y - p.y));
  return d;
}

/**
 * Tirar al aro. Siempre apunta al aro: lo que decide si entra es de dónde
 * tiras y quién tienes encima. La carga es apuntar —aguantando se afina hasta
 * un 45 %—, y el motor la recorta, así que un cliente que mande 99 no apunta
 * mejor que uno honesto.
 */
function tiroDeBasquet(e: Estado, p: Jugador, k: number): "tiro" | null {
  const b = e.basquet;
  if (!b || b.ganador != null || b.saque > 0 || p.stun > 0) return null;
  if (b.conLaBola !== p.idx) return null;
  const bola = e.trastos.find(t => t.id === b.balon);
  if (!bola) return null;

  const mio = (p.equipo ?? 0) as 0 | 1;
  const aro = b.aros[1 - mio];
  const d = Math.hypot(aro.x - p.x, aro.y - p.y);

  /* El error: crece con la distancia y con quien te tapa, y se cierra
     apuntando. Sale del azar del motor, así que la partida sigue siendo
     reproducible. */
  const encima = defensorEncima(e, p);
  const err = (d * ERROR_POR_PX + (encima < 90 ? ERROR_DEFENSOR * (1 - encima / 90) : 0))
            * (1 - 0.45 * k);
  const ang = rnd(e, 0, Math.PI * 2), radio = rnd(e, 0, err);
  const tx = aro.x + Math.cos(ang) * radio, ty = aro.y + Math.sin(ang) * radio;

  /* Un tiro es una parábola que pasa por el aro CAYENDO: se resuelve al revés,
     como el resto de este juego — se elige dónde llega y se despeja la fuerza. */
  const T = 0.62 + d / 900;
  bola.x = p.x; bola.y = p.y;
  bola.z = TIRO_SALIDA;
  bola.vx = (tx - bola.x) / T;
  bola.vy = (ty - bola.y) / T;
  bola.vz = (ARO_ALTO - TIRO_SALIDA + GRAVEDAD * T * T / 2) / T;
  bola.pateadoPor = p.idx;

  b.conLaBola = null;
  b.suelta = 0.5;                  // que no se la recoja él mismo al vuelo
  b.tiroDesde = d;
  polvo(e, p.x, p.y - 30, "#FFEFE2", 5);
  sonar(e, "throw");
  return "tiro";
}

function canasta(e: Estado, equipo: 0 | 1, vale: number): void {
  const b = e.basquet!;
  b.puntos[equipo] += vale;
  b.ultimaCanasta = { equipo, vale };
  const color = equipo === 0 ? "#3DDC97" : "#FF5C86";
  const aro = b.aros[1 - equipo];
  texto(e, aro.x, aro.y - 60, vale === 3 ? "¡TRIPLE!" : "¡CANASTA!", color);
  polvo(e, aro.x, aro.y, color, 22);
  sonar(e, "swish");
  e.eventos.push({ t: "gol", equipo, goles: [b.puntos[0], b.puntos[1]] });
  if (b.puntos[equipo] >= b.meta) {
    b.ganador = equipo;
    terminarJuegoIndividual(e, e.players.find(p => p.equipo === equipo)?.idx ?? null);
    return;
  }
  b.saque = BASQUET_SAQUE;
  sacarDeMedioBasquet(e);
}

function pasoBasquet(e: Estado, dt: number): void {
  const b = e.basquet;
  if (!b || b.ganador != null) return;
  const bola = e.trastos.find(t => t.id === b.balon);
  if (!bola) return;
  const c = b.cancha;

  /* Nadie se sale de la cancha. */
  for (const p of e.players) {
    p.x = clamp(p.x, c.x + 24, c.x + c.w - 24);
    p.y = clamp(p.y, c.y + 24, c.y + c.h - 24);
  }

  if (b.saque > 0) {
    b.saque -= dt;
    bola.vx = 0; bola.vy = 0; bola.vz = 0; bola.z = 0;
    return;
  }
  b.reloj -= dt;
  if (b.suelta > 0) b.suelta -= dt;

  /* ---- la lleva alguien ---- */
  const dueño = conLaBolaDe(e);
  if (dueño) {
    if (dueño.stun > 0) {
      /* Chanclazo: se le cae y queda suelta ahí mismo. Quitarle la pelota al
         que la lleva es la defensa de este juego. */
      b.conLaBola = null;
      b.suelta = 0.25;
      bola.vx = dueño.vx * 0.3; bola.vy = dueño.vy * 0.3;
      bola.z = 0; bola.vz = 0;
      texto(e, dueño.x, dueño.y - 50, "¡Se le cayó!", "#FFC53D");
    } else {
      /* Botando: la pelota va delante de quien corre, y sube y baja. */
      const m = Math.hypot(dueño.vx, dueño.vy) || 1;
      bola.x = dueño.x + (dueño.vx / m) * 20;
      bola.y = dueño.y + (dueño.vy / m) * 20 + 10;
      bola.vx = 0; bola.vy = 0; bola.vz = 0;
      bola.z = 14 + Math.abs(Math.sin(e.t * 9)) * 20;
      if (b.reloj <= 0) finBasquet(e);
      return;
    }
  }

  /* ---- suelta: vuela, bota y rueda ---- */
  const antesZ = bola.z ?? 0;
  if (antesZ > 0 || (bola.vz ?? 0) !== 0) {
    bola.vz = (bola.vz ?? 0) - GRAVEDAD * dt;
    bola.z = antesZ + bola.vz * dt;
    if ((bola.z ?? 0) <= 0) {
      bola.z = 0;
      const golpe = Math.abs(bola.vz ?? 0);
      bola.vz = golpe > 150 ? golpe * 0.52 : 0;
    }
  }

  /* ---- ¿entró? ----
     Cayendo (`vz < 0`), dentro del aro y a la altura del aro. Se mira cayendo
     porque una pelota que sube y roza el aro por debajo no es canasta: es una
     pelota que pasa por ahí. */
  if ((bola.vz ?? 0) < 0 && (bola.z ?? 0) > ARO_ALTO - 34 && (bola.z ?? 0) < ARO_ALTO + 34) {
    for (const q of [0, 1] as const) {
      const aro = b.aros[q];
      if (dist2(bola.x, bola.y, aro.x, aro.y) > aro.r * aro.r) continue;
      /* En el aro del 0 encesta el equipo 1: cada uno ataca el de enfrente. */
      const marca = (1 - q) as 0 | 1;
      canasta(e, marca, b.tiroDesde > b.triple ? 3 : 2);
      return;
    }
  }

  /* ---- recogerla ---- */
  if (b.suelta <= 0 && (bola.z ?? 0) < 70) {
    let mejor: Jugador | null = null, md = BASQUET_ALCANCE * BASQUET_ALCANCE;
    for (const p of e.players) {
      if (p.stun > 0) continue;
      const d = dist2(p.x, p.y, bola.x, bola.y);
      if (d < md) { md = d; mejor = p; }
    }
    if (mejor) {
      b.conLaBola = mejor.idx;
      bola.vx = 0; bola.vy = 0; bola.vz = 0;
      sonar(e, "grab");
    }
  }

  /* La pelota no se sale: rebota en la banda. */
  const R = 14;
  if (bola.x < c.x + R) { bola.x = c.x + R; bola.vx = Math.abs(bola.vx) * 0.6; }
  if (bola.x > c.x + c.w - R) { bola.x = c.x + c.w - R; bola.vx = -Math.abs(bola.vx) * 0.6; }
  if (bola.y < c.y + R) { bola.y = c.y + R; bola.vy = Math.abs(bola.vy) * 0.6; }
  if (bola.y > c.y + c.h - R) { bola.y = c.y + c.h - R; bola.vy = -Math.abs(bola.vy) * 0.6; }

  if (b.reloj <= 0) finBasquet(e);
}

function finBasquet(e: Estado): void {
  const b = e.basquet!;
  b.reloj = 0;
  b.ganador = b.puntos[0] === b.puntos[1] ? null : (b.puntos[0] > b.puntos[1] ? 0 : 1);
  terminarJuegoIndividual(e, b.ganador == null
    ? null : (e.players.find(p => p.equipo === b.ganador)?.idx ?? null));
}

/* ============================================================
   Bolos
   ============================================================ */
/* ---- los bolos ----
   La bola se lanza con el mismo botón de cargar que todo lo demás: **la carga
   es la fuerza y la puntería el ángulo**, y el motor recorta las dos. No hay
   ventana que acertar — apuntas y sueltas cuando te apetezca, que es lo que
   convierte esto en un juego de puntería y no en una lotería de reflejos.

   Los pinos se empujan entre ellos. Es lo único que hay que hacer bien aquí:
   una bola que borra los pinos que toca no son bolos, son diez interruptores.
   Un pino cuenta como tumbado cuando se ha MOVIDO de su sitio. */
export const BOLOS_ALCANCE = 70;
/** Fuerza de la bola, del toque flojo al bolazo. */
const BOLA_MIN = 620, BOLA_MAX = 1500;
/** Lo que se abre el ángulo con la puntería: 22° a cada lado y no más, o se
    lanza a la pared de al lado y no hay juego. */
const BOLOS_ANGULO = 0.38;
/** Lo que frena la bola y los pinos por segundo. */
const BOLA_ROCE = 0.62, PINO_ROCE = 0.75;
/** Desde este desvío, el pino está tumbado. */
const PINO_CAIDO = 16;

/** Lanzar la bola. Solo el que tiene el turno, y solo si no rueda ya una. */
function tirarBolos(e: Estado, p: Jugador, k: number): "bola" | null {
  const b = e.bolos;
  if (!b || b.ganador != null || b.rodando || b.espera > 0) return null;
  if (e.players.indexOf(p) !== b.turno) return null;
  const bola = e.trastos.find(t => t.id === b.balon);
  if (!bola) return null;
  /* Hay que estar junto a la bola: se lanza desde la raya, no desde la grada. */
  if (dist2(p.x, p.y, bola.x, bola.y) > BOLOS_ALCANCE * BOLOS_ALCANCE) return null;

  /* El ángulo sale de la puntería, pero TOPADO: apuntar a la pared de al lado
     no es una jugada, es tirar la bola. Sin el tope, con el ratón en cualquier
     sitio la bola salía de lado y no llegaba nunca a los pinos. */
  const a = p.apunta;
  let ang = 0;
  if (a.on) {
    const dx = a.wx - bola.x, dy = a.wy - bola.y;
    if (dy < 0) ang = clamp(Math.atan2(dx, -dy), -BOLOS_ANGULO, BOLOS_ANGULO);
  }
  const v = BOLA_MIN + (BOLA_MAX - BOLA_MIN) * clamp(k, 0, 1);
  bola.vx = Math.sin(ang) * v;
  bola.vy = -Math.cos(ang) * v;          // pista arriba: los pinos están al norte
  bola.pateadoPor = p.idx;
  b.rodando = true;
  b.enPieAlEmpezar = b.pinos.filter(x => x.pie).length;
  polvo(e, bola.x, bola.y, "#FFEFE2", 6);
  sonar(e, "throw");
  return "bola";
}

/** Cuenta lo de esta bola y pasa a la siguiente, o de mano, o acaba. */
function cerrarBolaDeBolos(e: Estado): void {
  const b = e.bolos!;
  const enPie = b.pinos.filter(x => x.pie).length;
  const tumbados = b.enPieAlEmpezar - enPie;
  const pleno = b.bola === 0 && enPie === 0;
  b.puntos[b.turno] += tumbados;
  b.ultimo = { quien: b.turno, tumbados, pleno };

  const quien = e.players[b.turno];
  const donde = { x: b.pista.x + b.pista.w / 2, y: b.pista.y + 380 };
  texto(e, donde.x, donde.y, pleno ? "¡PLENO!" : "+" + tumbados, pleno ? "#FFC53D" : "#3DDC97");
  if (pleno) polvo(e, donde.x, donde.y, "#FFC53D", 24);
  sonar(e, tumbados > 0 ? "win" : "ouch");
  e.eventos.push({ t: "punto", equipo: (b.turno % 2) as 0 | 1,
                   puntos: [b.puntos[0] ?? 0, b.puntos[1] ?? 0],
                   motivo: pleno ? "pleno" : tumbados + " pinos" });

  /* Segunda bola solo si queda algo que tumbar. */
  if (b.bola === 0 && enPie > 0) {
    b.bola = 1;
    colocarParaTirar(e);
    return;
  }

  /* Se acabó la mano: pinos nuevos y le toca al siguiente. */
  b.manos[b.turno]++;
  b.bola = 0;
  reponerLosPinos(e);
  if (b.manos.every((m, i) => m >= b.total)) {
    const mejor = Math.max(...b.puntos);
    const empate = b.puntos.filter(x => x === mejor).length > 1;
    b.ganador = empate ? null : b.puntos.indexOf(mejor);
    terminarJuegoIndividual(e, b.ganador == null ? null : e.players[b.ganador].idx);
    return;
  }
  b.turno = (b.turno + 1) % e.players.length;
  colocarParaTirar(e);
}

function pasoBolos(e: Estado, dt: number): void {
  const b = e.bolos;
  if (!b || b.ganador != null) return;
  const bola = e.trastos.find(t => t.id === b.balon);
  if (!bola) return;

  /* El que tira se queda detrás de la raya de falta; el resto, fuera de la
     pista. Sin esto se puede ir andando hasta los pinos y tirarlos a patadas. */
  e.players.forEach((p, i) => {
    if (i === b.turno) {
      p.x = clamp(p.x, b.pista.x + 30, b.pista.x + b.pista.w - 30);
      p.y = clamp(p.y, b.faltaY + 20, b.pista.y + b.pista.h - 30);
    }
  });

  if (b.espera > 0) {
    /* Los pinos siguen cayéndose mientras se espera: es justo lo que se está
       esperando a ver. */
    moverLosPinos(e, dt);
    b.espera -= dt;
    if (b.espera <= 0) cerrarBolaDeBolos(e);
    return;
  }
  if (!b.rodando) { moverLosPinos(e, dt); return; }

  /* ---- la bola ---- */
  const roce = Math.pow(BOLA_ROCE, dt);
  bola.vx *= roce; bola.vy *= roce;
  bola.x += bola.vx * dt;
  bola.y += bola.vy * dt;
  bola.giro += Math.hypot(bola.vx, bola.vy) * dt * 0.05;
  // las canaletas: la bola rebota flojo y sigue, como en una bolera de verdad
  if (bola.x < b.pista.x + BOLA_R) { bola.x = b.pista.x + BOLA_R; bola.vx = Math.abs(bola.vx) * 0.35; }
  if (bola.x > b.pista.x + b.pista.w - BOLA_R) { bola.x = b.pista.x + b.pista.w - BOLA_R; bola.vx = -Math.abs(bola.vx) * 0.35; }

  /* ---- la bola contra los pinos ---- */
  for (const pino of b.pinos) {
    const dx = pino.x - bola.x, dy = pino.y - bola.y;
    const d = Math.hypot(dx, dy);
    if (d > BOLA_R + PINO_R || d < 0.01) continue;
    const nx = dx / d, ny = dy / d;
    const golpe = Math.hypot(bola.vx, bola.vy);
    pino.vx += nx * golpe * 0.75;
    pino.vy += ny * golpe * 0.75;
    /* La bola apenas se desvía: pesa diez veces más que un pino, y por eso un
       pleno es posible en vez de que el primer pino la mande a la canaleta. */
    bola.vx = bola.vx * 0.94 - nx * 22;
    bola.vy = bola.vy * 0.94 - ny * 22;
    sonar(e, "whack");
  }

  moverLosPinos(e, dt);

  /* ---- ¿se acabó la bola? ----
     Cuando se para, cuando se sale por el fondo, o cuando pasa de largo de los
     pinos: los tres son "ya no va a tumbar nada más". */
  const parada = Math.hypot(bola.vx, bola.vy) < 40;
  const fuera = bola.y < b.pista.y + 20;
  const pasoDeLargo = bola.y < b.pista.y + 120 && bola.vy > -40;
  if (parada || fuera || pasoDeLargo) {
    bola.vx = 0; bola.vy = 0;
    b.rodando = false;
    b.espera = 1.1;                     // deja ver caer los pinos antes de contar
  }
}

/** Los pinos: se empujan entre ellos, ruedan y se caen.

    Va aparte y se llama TAMBIÉN durante la espera. Estaba dentro del bloque de
    "la bola rueda", así que los pinos que la bola tocaba en el último momento se
    quedaban con la velocidad congelada y no llegaban a moverse nunca: por eso no
    salía un pleno ni de casualidad en veinte bolas. */
function moverLosPinos(e: Estado, dt: number): void {
  const b = e.bolos!;
  /* Entre ellos: esto es lo que hace que un pleno sea un pleno — la cadena. */
  for (let i = 0; i < b.pinos.length; i++) {
    const a = b.pinos[i];
    for (let j = i + 1; j < b.pinos.length; j++) {
      const c = b.pinos[j];
      const dx = c.x - a.x, dy = c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > PINO_R * 2 || d < 0.01) continue;
      const nx = dx / d, ny = dy / d;
      const solape = (PINO_R * 2 - d) / 2;
      a.x -= nx * solape; a.y -= ny * solape;
      c.x += nx * solape; c.y += ny * solape;
      /* Se reparten la velocidad a lo largo de la normal: un choque elástico
         de pobre, pero suficiente para que la cadena se propague. */
      const va = a.vx * nx + a.vy * ny, vc = c.vx * nx + c.vy * ny;
      const t = (va - vc) * 0.9;
      a.vx -= nx * t; a.vy -= ny * t;
      c.vx += nx * t; c.vy += ny * t;
    }
  }

  /* Y cada uno: rueda, frena y, si se ha ido de su sitio, está tumbado. */
  const roceP = Math.pow(PINO_ROCE, dt);
  for (const pino of b.pinos) {
    if (!pino.vx && !pino.vy) continue;
    pino.x += pino.vx * dt;
    pino.y += pino.vy * dt;
    pino.vx *= roceP; pino.vy *= roceP;
    if (Math.hypot(pino.vx, pino.vy) < 8) { pino.vx = 0; pino.vy = 0; }
    if (pino.pie && Math.hypot(pino.x - pino.ox, pino.y - pino.oy) > PINO_CAIDO) {
      pino.pie = false;
      polvo(e, pino.x, pino.y, "#F5F5DC", 6);
    }
  }
}

/* ============================================================
   Lucha
   ============================================================ */
/* ---- la lucha del patio ----
   Sumo con chancla. El punto es sacar al otro del círculo, y para eso hay dos
   herramientas y las dos ya existían: EMPUJAR con el cuerpo —corriendo, y
   cuanto más rápido vayas más lo mueves— y ABLANDARLO con la chancla, porque a
   uno aturdido se le empuja como a un mueble.

   No hace falta ningún botón nuevo: la chancla es la de siempre. */
/** Lo cerca que hay que estar para empujar, y cuánto empuja el encontronazo. */
/* Calibrado sobre lo que un empujón MUEVE, que es `v0/6,6` px (la velocidad
   impuesta se gasta a un 11 % por fotograma): una embestida limpia mueve unos
   70 px y una sobre alguien aturdido unos 140, en un ring de 250 de radio. O
   sea, hacen falta varias. Con 340 y un ×2,4 un solo chanclazo te sacaba del
   centro de un golpe —218 px— y las peleas duraban nueve segundos. */
const SUMO_ALCANCE = 46, SUMO_EMPUJE = 200;
/** A uno aturdido se le empuja mucho más: es de lo que sirve la chancla aquí. */
const SUMO_ATURDIDO = 2.0;

function puntoDeLucha(e: Estado, equipo: 0 | 1, quien: Jugador): void {
  const l = e.lucha!;
  l.puntos[equipo]++;
  l.ultimoPunto = equipo;
  const color = equipo === 0 ? "#3DDC97" : "#FF5C86";
  texto(e, quien.x, quien.y - 56, "¡Fuera del ring!", color);
  polvo(e, quien.x, quien.y, color, 20);
  sonar(e, "win");
  e.eventos.push({ t: "punto", equipo, puntos: [l.puntos[0], l.puntos[1]], motivo: "fuera del ring" });
  if (l.puntos[equipo] >= l.meta) {
    l.ganador = equipo;
    terminarJuegoIndividual(e, e.players.find(p => p.equipo === equipo)?.idx ?? null);
    return;
  }
  l.saque = LUCHA_SAQUE;
  colocarEnElRing(e);
}

function pasoLucha(e: Estado, dt: number): void {
  const l = e.lucha;
  if (!l || l.ganador != null) return;

  if (l.saque > 0) {
    l.saque -= dt;
    for (const p of e.players) { p.vx = 0; p.vy = 0; }
    return;
  }
  l.reloj -= dt;

  /* ---- el empujón ----
     Chocarse mueve a los dos, pero al que va más rápido lo mueve menos: eso es
     lo que hace que embestir sirva y esperar quieto no. Y al aturdido lo mueve
     dos veces y media más, que es para lo que sirve la chancla aquí. */
  for (let i = 0; i < e.players.length; i++) {
    for (let j = i + 1; j < e.players.length; j++) {
      const a = e.players[i], b = e.players[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > SUMO_ALCANCE || d < 0.01) continue;
      const nx = dx / d, ny = dy / d;
      /* Se separan para no quedarse encajados uno dentro del otro. */
      const solape = (SUMO_ALCANCE - d) / 2;
      a.x -= nx * solape; a.y -= ny * solape;
      b.x += nx * solape; b.y += ny * solape;

      const va = Math.hypot(a.vx, a.vy), vb = Math.hypot(b.vx, b.vy);
      const empujeA = (SUMO_EMPUJE + va) * (b.stun > 0 ? SUMO_ATURDIDO : 1);
      const empujeB = (SUMO_EMPUJE + vb) * (a.stun > 0 ? SUMO_ATURDIDO : 1);
      /* Se empuja la VELOCIDAD, no el `kx/ky` del `knock`: ese solo lo gastan
         ladrones y abuelas —`applyKnock` no se llama nunca sobre un jugador—,
         así que un `knock` aquí no movería a nadie ni un píxel. Es el mismo
         atajo que ya usa el chanclazo cuando le da a una persona. */
      b.vx = nx * empujeA; b.vy = ny * empujeA;
      a.vx = -nx * empujeB; a.vy = -ny * empujeB;
      if (va + vb > 200) { sonar(e, "whack"); polvo(e, (a.x + b.x) / 2, (a.y + b.y) / 2, "#FFEFE2", 5); }
    }
  }

  /* ---- ¿alguien se salió? ---- */
  for (const p of e.players) {
    if (dist2(p.x, p.y, l.ring.x, l.ring.y) <= l.ring.r * l.ring.r) continue;
    const suyo = (p.equipo ?? 0) as 0 | 1;
    puntoDeLucha(e, (1 - suyo) as 0 | 1, p);
    return;
  }

  if (l.reloj <= 0) {
    l.reloj = 0;
    l.ganador = l.puntos[0] === l.puntos[1] ? null : (l.puntos[0] > l.puntos[1] ? 0 : 1);
    terminarJuegoIndividual(e, l.ganador == null
      ? null : (e.players.find(p => p.equipo === l.ganador)?.idx ?? null));
  }
}

/* ============================================================
   Dardos
   ============================================================ */
/* ---- los dardos ----
   La carga NO es fuerza: es PULSO. Un dardo no llega más al centro por tirarlo
   fuerte, así que aguantar el botón CIERRA EL ERROR en vez de empujar más. De
   0 a 1 el radio de error baja de 84 px a 17: con la diana en anillos de 30, eso
   es la diferencia entre acertar el anillo que buscas y acertar cualquiera.

   Y lo que le pone precio a tomarse el tiempo no es un medidor que castigue por
   pasarse —eso ya se probó en el vóley y es una lotería— sino el otro jugador:
   te puede chanclear mientras apuntas, y un dardo aturdido no sale. */
export const DARDO_ALCANCE = 90;
/** El error, del pulso más malo al mejor. */
/* A pulso máximo el error son 38 px y el anillo del centro mide 30, así que el
   cincuenta es probable pero NO seguro. Con 26 lo era siempre —el error caía
   entero dentro del anillo— y un cincuenta garantizado no es una decisión.
   Medido apuntando al centro: unos 29 de media a pulso 0 y unos 44 a pulso
   lleno, sobre un máximo de 50. */
const DARDO_ERROR_MAX = 84, DARDO_ERROR_MIN = 38;

/** Tirar un dardo. Solo el que tiene el turno, desde detrás de la raya. */
function tirarDardo(e: Estado, p: Jugador, k: number): "dardo" | null {
  const d = e.dardos;
  if (!d || d.ganador != null || d.espera > 0 || p.stun > 0) return null;
  const i = e.players.indexOf(p);
  if (i !== d.turno) return null;
  if (d.tiros[i] >= d.total) return null;
  /* Desde detrás de la raya: acercarse a la diana no es tirar mejor, es hacer
     trampa. El motor ya no te deja pasarla, y aquí se comprueba igual. */
  if (p.y < d.raya - 10) return null;

  /* A dónde apuntas, y si no apuntas, al centro. */
  const a = p.apunta;
  const mx = a.on ? a.wx : d.tablero.x;
  const my = a.on ? a.wy : d.tablero.y;
  const err = DARDO_ERROR_MAX - (DARDO_ERROR_MAX - DARDO_ERROR_MIN) * clamp(k, 0, 1);
  const ang = rnd(e, 0, Math.PI * 2), radio = rnd(e, 0, err);
  const x = mx + Math.cos(ang) * radio, y = my + Math.sin(ang) * radio;

  const vale = valorDelDardo(d, x, y);
  const centro = vale === DIANA_ANILLOS[0];
  d.dardos.push({ x, y, dueño: i, vale });
  d.puntos[i] += vale;
  d.tiros[i]++;
  d.ultimo = { quien: i, vale, centro };
  d.espera = DARDOS_ESPERA;

  const color = vale === 0 ? "#FF5C86" : centro ? "#FFC53D" : "#3DDC97";
  texto(e, x, y - 34, vale === 0 ? "¡Fuera!" : centro ? "¡CENTRO! 50" : "+" + vale, color);
  if (centro) polvo(e, x, y, "#FFC53D", 20);
  sonar(e, vale === 0 ? "ouch" : centro ? "win" : "grab");
  e.eventos.push({ t: "punto", equipo: (i % 2) as 0 | 1,
                   puntos: [d.puntos[0] ?? 0, d.puntos[1] ?? 0],
                   motivo: vale === 0 ? "fuera" : vale + " puntos" });
  return "dardo";
}

function pasoDardos(e: Estado, dt: number): void {
  const d = e.dardos;
  if (!d || d.ganador != null) return;

  /* La raya no se pasa, y de la diana no se acerca nadie. */
  for (const p of e.players) p.y = Math.max(p.y, d.raya);

  if (d.espera <= 0) return;
  d.espera -= dt;
  if (d.espera > 0) return;

  /* Se acabó la espera: o le toca al otro, o se acabó la partida. */
  if (d.tiros.every((t, i) => t >= d.total)) {
    const mejor = Math.max(...d.puntos);
    const empate = d.puntos.filter(x => x === mejor).length > 1;
    d.ganador = empate ? null : d.puntos.indexOf(mejor);
    terminarJuegoIndividual(e, d.ganador == null ? null : e.players[d.ganador].idx);
    return;
  }
  /* Al siguiente que le queden dardos. */
  let siguiente = d.turno;
  for (let n = 1; n <= e.players.length; n++) {
    const cand = (d.turno + n) % e.players.length;
    if (d.tiros[cand] < d.total) { siguiente = cand; break; }
  }
  d.turno = siguiente;
  colocarParaTirarDardo(e);
}

/* ============================================================
   Carrera de obstáculos
   ============================================================ */
/* ---- la carrera de obstáculos ----
   Puntos de paso en bucle y conos que te tumban. La única regla propia es esa:
   los conos están EN la línea, así que la curva corta pasa rozándolos y cada
   tramo es una decisión — por dentro y rápido, o por fuera y seguro.

   Los puntos de paso se cuentan EN ORDEN. Sin eso, un óvalo de ocho balizas se
   puede recorrer al revés, o cortando por el medio, y las vueltas no significan
   nada. */
function pasoCarreraObs(e: Estado, dt: number): void {
  const c = e.carreraObs;
  if (!c || c.ganador != null) return;

  if (c.salida > 0) {
    c.salida -= dt;
    for (const p of e.players) { p.vx = 0; p.vy = 0; }
    if (c.salida <= 0) { c.salida = 0; texto(e, e.players[0].x, e.players[0].y - 60, "¡Ya!", "#3DDC97"); }
    return;
  }

  for (let i = 0; i < e.players.length; i++) {
    const p = e.players[i];
    const j = c.jugadores[i];
    if (j.fin >= 0) continue;

    /* ---- los conos ----
       Llevarte uno por delante te tumba un rato. No hace falta más castigo: en
       una carrera, perder ocho décimas es perder el sitio. */
    if (p.stun <= 0 && p.inmune <= 0) {
      for (const o of c.obstaculos) {
        if (!inRect(p.x, p.y, o, 12)) continue;
        /* Y SALE DESPEDIDO del cono. Sin esto, en cuanto se le pasaba el
           aturdimiento seguía encima, tropezaba otra vez, y así para siempre:
           682 tropiezos en cinco minutos y ni una vuelta completa, medido.
           Un cono se lleva por delante UNA vez. */
        const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
        let dx = p.x - ox, dy = p.y - oy;
        let d = Math.hypot(dx, dy);
        /* Justo en el centro del cono no hay "hacia fuera" que calcular: se
           usa de dónde venía, y si tampoco iba a ninguna parte, hacia atrás. */
        if (d < 1) { dx = -p.vx; dy = -p.vy; d = Math.hypot(dx, dy); }
        if (d < 1) { dx = -1; dy = 0; d = 1; }
        const fuera = o.w / 2 + 30;
        p.x = ox + (dx / d) * fuera;
        p.y = oy + (dy / d) * fuera;
        p.vx = 0; p.vy = 0;
        zap(e, p, OBS_TROPIEZO, false);
        p.inmune = OBS_TROPIEZO + 0.35;      // ni el mismo cono ni el de al lado
        texto(e, p.x, p.y - 52, "¡Cono!", "#FF8A3D");
        polvo(e, p.x, p.y, "#FF8A3D", 8);
        sonar(e, "ouch");
        break;
      }
    }

    /* ---- el punto de paso ---- */
    const cp = c.trazado[j.checkpoint];
    if (!cp || dist2(p.x, p.y, cp.x, cp.y) > c.ancho * c.ancho) continue;
    j.checkpoint = (j.checkpoint + 1) % c.trazado.length;
    /* Volver a pasar por la baliza 0 es cerrar la vuelta. */
    if (j.checkpoint !== 1) continue;
    j.vuelta++;
    if (j.vuelta < c.vueltas) {
      texto(e, p.x, p.y - 60, "Vuelta " + (j.vuelta + 1) + " de " + c.vueltas, "#FFC53D");
      continue;
    }
    j.fin = e.t;
    const puesto = c.jugadores.filter(q => q.fin >= 0).length;
    e.eventos.push({ t: "meta", jugador: p.idx, puesto, segundos: e.t });
    texto(e, p.x, p.y - 60, puesto === 1 ? "¡PRIMERO!" : puesto + ".º", "#FFC53D");
    sonar(e, "win");
    if (puesto === 1) {
      c.ganador = i;
      terminarJuegoIndividual(e, p.idx);
      return;
    }
  }
}

/* ============================================================
   Laberinto
   ============================================================ */
function pasoLaberinto(e: Estado, dt: number): void {
  const l = e.laberinto!;
  if (l.ganador != null) return;
  // collect gems
  for (let i = l.gemas.length - 1; i >= 0; i--) {
    const g = l.gemas[i];
    for (const p of e.players) {
      if (dist2(p.x, p.y, g.x, g.y) < 24 * 24) {
        l.gemas.splice(i, 1);
        l.recolectadas++;
        sonar(e, "grab");
        texto(e, g.x, g.y - 20, "+1", "#FFC53D");
        break;
      }
    }
  }
  if (l.recolectadas >= l.totalGemas) { terminarJuegoIndividual(e, e.players[0]?.idx ?? null); return; }
  // ghost moves toward nearest player
  const gh = l.fantasma;
  let nearest: Jugador | null = null, nd = Infinity;
  for (const p of e.players) { const d = dist2(p.x, p.y, gh.x, gh.y); if (d < nd) { nd = d; nearest = p; } }
  if (nearest && nd > 0) {
    const spd = 120 * dt;
    gh.vx = (nearest.x - gh.x) / Math.sqrt(nd) * spd;
    gh.vy = (nearest.y - gh.y) / Math.sqrt(nd) * spd;
    gh.x += gh.vx; gh.y += gh.vy;
  }
  // ghost catches player
  for (const p of e.players) {
    if (dist2(p.x, p.y, gh.x, gh.y) < 20 * 20) {
      p.stun = 1;
      sonar(e, "ouch");
      texto(e, p.x, p.y - 40, "¡Te atrapó!", "#FF5C86");
    }
  }
}

/* ============================================================
   Billar
   ============================================================ */
function pasoBillar(e: Estado, dt: number): void {
  const bl = e.billar!;
  if (bl.ganador != null) return;
  const friccion = 0.985;
  for (const b of bl.bolas) {
    if (b.hoya) continue;
    b.vx *= friccion; b.vy *= friccion;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // bounce off walls
    const m = bl.mesa;
    if (b.x < m.x + 10) { b.x = m.x + 10; b.vx = Math.abs(b.vx) * 0.8; }
    if (b.x > m.x + m.w - 10) { b.x = m.x + m.w - 10; b.vx = -Math.abs(b.vx) * 0.8; }
    if (b.y < m.y + 10) { b.y = m.y + 10; b.vy = Math.abs(b.vy) * 0.8; }
    if (b.y > m.y + m.h - 10) { b.y = m.y + m.h - 10; b.vy = -Math.abs(b.vy) * 0.8; }
    // pocket check
    const esq = [[m.x + 15, m.y + 15], [m.x + m.w - 15, m.y + 15], [m.x + 15, m.y + m.h - 15], [m.x + m.w - 15, m.y + m.h - 15]];
    for (const [hx, hy] of esq) {
      if (dist2(b.x, b.y, hx, hy) < 18 * 18) { b.hoya = true; b.vx = 0; b.vy = 0; sonar(e, "place"); }
    }
  }
  // ball-ball collisions
  for (let i = 0; i < bl.bolas.length; i++) {
    for (let j = i + 1; j < bl.bolas.length; j++) {
      const a = bl.bolas[i], b = bl.bolas[j];
      if (a.hoya || b.hoya) continue;
      const d = dist2(a.x, a.y, b.x, b.y);
      const minD = 14;
      if (d < minD * minD && d > 0) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const m = Math.sqrt(d);
        const nx = dx / m, ny = dy / m;
        const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
        const dot = dvx * nx + dvy * ny;
        if (dot > 0) {
          a.vx -= dot * nx; a.vy -= dot * ny;
          b.vx += dot * nx; b.vy += dot * ny;
        }
        const sep = (minD - m) / 2;
        a.x -= nx * sep; a.y -= ny * sep;
        b.x += nx * sep; b.y += ny * sep;
      }
    }
  }
  // check if all colored balls are pocketed
  const colored = bl.bolas.filter(b => b.color !== 0);
  if (colored.every(b => b.hoya)) { terminarJuegoIndividual(e, e.players[bl.turno]?.idx ?? null); }
}

/* ============================================================
   Air Hockey
   ============================================================ */
/* ---- air hockey ----
   El único minijuego que no usa la altura: aquí todo pasa a ras de mesa, y esa
   es su gracia — es de reflejos, no de parábolas.

   Y el disco no se golpea con un botón: se choca con él. La paleta eres tú, y
   lo fuerte que sale depende de a qué velocidad ibas cuando lo alcanzaste. Por
   eso aquí no hay nada que apretar y el juego entero es correr bien. */
/** Radio del disco y de la paleta (tú). */
const PUCK_R = 16, PALETA_R = 26;
/** Lo que frena el disco por segundo, y su tope. */
const HOCKEY_ROCE = 0.55, PUCK_MAX = 1400;
/** El ZURDAZO: el botón de cargar, aquí. Un choque con la paleta empuja unos
    660 (430 más lo que llevaras encima); esto va de 700 a 1 250, o sea hasta
    casi el doble — se nota, y sigue siendo un disco que se puede seguir con la
    vista. A 1 900 cruzaba la mesa en medio segundo y rebotaba como una bala.

    El choque sigue existiendo y sigue siendo automático: es el toque de siempre,
    el que mantiene el juego fluido. El botón es el disparo que decides tú. */
export const HOCKEY_ALCANCE = 78;
const ZURDAZO_MIN = 750, ZURDAZO_MAX = 1150;
/** Lo que tarda en poder volver a zurdazo. */
export const ZURDAZO_RECARGA = 1.1;
/** Lo que empuja un choque, aparte de la velocidad que llevabas. */
const PALETA_EMPUJE = 430;

/**
 * El zurdazo: apuntas, cargas y sueltas. La dirección sale de la puntería y, si
 * no apuntas, del arco contrario — pegarle "a ninguna parte" no existe.
 */
function golpeDeHockey(e: Estado, p: Jugador, k: number): "zurdazo" | null {
  const h = e.hockey;
  if (!h || h.ganador != null || h.saque > 0 || p.stun > 0) return null;
  const i = e.players.indexOf(p);
  if ((h.recarga[i] ?? 0) > 0) return null;
  const pk = h.puck;
  if (dist2(p.x, p.y, pk.x, pk.y) > HOCKEY_ALCANCE * HOCKEY_ALCANCE) return null;

  const mio = (p.equipo ?? 0) as 0 | 1;
  const arco = h.arcos[1 - mio];
  const a = p.apunta;
  let dx = a.on ? a.wx - pk.x : (arco.x + arco.w / 2) - pk.x;
  let dy = a.on ? a.wy - pk.y : (arco.y + arco.h / 2) - pk.y;
  const m = Math.hypot(dx, dy) || 1;
  const v = ZURDAZO_MIN + (ZURDAZO_MAX - ZURDAZO_MIN) * clamp(k, 0, 1);
  /* Se lo saca BIEN de encima: con 2 px de margen no bastaba. El jugador se
     mueve 4,5 px por fotograma y el disco todavía no, así que al llegar el
     choque automático la distancia había bajado de 42 y le volvía a pegar — el
     zurdazo de 1 250 salía convertido en un toque de 606, medido. */
  pk.x = p.x + (dx / m) * (PALETA_R + PUCK_R + 30);
  pk.y = p.y + (dy / m) * (PALETA_R + PUCK_R + 30);
  pk.vx = (dx / m) * v;
  pk.vy = (dy / m) * v;
  h.quieto = 0;
  h.recarga[i] = ZURDAZO_RECARGA;
  texto(e, p.x, p.y - 52, "¡Zurdazo!", "#5CE1EA");
  polvo(e, pk.x, pk.y, "#CFE8FF", 10);
  sonar(e, "whack");
  return "zurdazo";
}

function pasoHockey(e: Estado, dt: number): void {
  const h = e.hockey;
  if (!h || h.ganador != null) return;
  const m = h.mesa, pk = h.puck;
  const cx = m.x + m.w / 2;

  /* Nadie cruza la línea del medio. Es la regla del juego de verdad y es lo
     que lo mantiene como un duelo en vez de un montón persiguiendo un disco. */
  for (const p of e.players) {
    const mio = p.equipo ?? 0;
    p.y = clamp(p.y, m.y + PALETA_R, m.y + m.h - PALETA_R);
    p.x = mio === 0
      ? clamp(p.x, m.x + PALETA_R, cx - PALETA_R)
      : clamp(p.x, cx + PALETA_R, m.x + m.w - PALETA_R);
  }

  for (let i = 0; i < h.recarga.length; i++)
    if (h.recarga[i] > 0) h.recarga[i] -= dt;

  if (h.saque > 0) {
    h.saque -= dt;
    pk.vx = 0; pk.vy = 0;
    return;
  }

  /* ---- el disco no se queda muerto ----
     Un disco parado en una esquina, o dos paletas plantadas cada una en su
     arco, no es un partido: es una foto. Medido sin esto, dos de cada tres
     partidos entre máquinas no acababan nunca — se quedaban en 3-0. A los tres
     segundos quieto vuelve al centro y se saca otra vez. */
  h.reloj -= dt;
  if (h.reloj <= 0) {
    h.reloj = 0;
    h.ganador = h.puntos[0] === h.puntos[1] ? null : (h.puntos[0] > h.puntos[1] ? 0 : 1);
    terminarJuegoIndividual(e, h.ganador == null
      ? null : (e.players.find(p => p.equipo === h.ganador)?.idx ?? null));
    return;
  }
  h.quieto = Math.hypot(pk.vx, pk.vy) < 60 ? h.quieto + dt : 0;
  if (h.quieto > 3) {
    texto(e, pk.x, pk.y - 46, "¡Disco al centro!", "#FFC53D");
    h.saque = HOCKEY_SAQUE;
    sacarEnHockey(e);
    return;
  }

  /* ---- las paletas ----
     Va antes de mover el disco: si se hace después, un choque puede meterlo
     dentro de la paleta y quedarse ahí pegado empujándolo cada fotograma.

     El disco sale por donde lo tocaste MÁS lo que llevabas encima. Eso es lo
     que hace que valga la pena salir a buscarlo corriendo en vez de esperarlo
     parado: un disco esperado sale flojo. */
  for (const p of e.players) {
    if (p.stun > 0) continue;
    const dx = pk.x - p.x, dy = pk.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > PALETA_R + PUCK_R) continue;
    const nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0;
    /* Y no se le pega a un disco que YA se va más rápido de lo que tú corres:
       no lo alcanzarías. Sin esto, la paleta le robaba la velocidad a cualquier
       disparo que le pasara cerca, empezando por los tuyos. */
    if (pk.vx * nx + pk.vy * ny < -300) continue;
    /* Se lo saca de encima primero: sin esto vuelve a chocar el fotograma
       siguiente y el disco se queda temblando contra la paleta. */
    pk.x = p.x + nx * (PALETA_R + PUCK_R + 1);
    pk.y = p.y + ny * (PALETA_R + PUCK_R + 1);
    pk.vx = nx * PALETA_EMPUJE + p.vx * 0.85;
    pk.vy = ny * PALETA_EMPUJE + p.vy * 0.85;
    sonar(e, "whack");
    polvo(e, pk.x, pk.y, "#CFE8FF", 4);
  }

  /* ---- el disco ---- */
  const roce = Math.pow(HOCKEY_ROCE, dt);
  pk.vx *= roce; pk.vy *= roce;
  const rapidez = Math.hypot(pk.vx, pk.vy);
  if (rapidez > PUCK_MAX) { pk.vx = pk.vx / rapidez * PUCK_MAX; pk.vy = pk.vy / rapidez * PUCK_MAX; }
  pk.x += pk.vx * dt;
  pk.y += pk.vy * dt;

  // las bandas de arriba y abajo: rebote casi limpio, que es de lo que va
  if (pk.y < m.y + PUCK_R) { pk.y = m.y + PUCK_R; pk.vy = Math.abs(pk.vy) * 0.92; sonar(e, "whack"); }
  if (pk.y > m.y + m.h - PUCK_R) { pk.y = m.y + m.h - PUCK_R; pk.vy = -Math.abs(pk.vy) * 0.92; sonar(e, "whack"); }

  /* ---- ¿gol? ----
     Se mira ANTES de rebotar en las bandas del fondo: si no, el disco rebota
     en la banda que está justo detrás del arco y no entra nunca. */
  for (const q of [0, 1] as const) {
    const a = h.arcos[q];
    const entro = q === 0 ? pk.x - PUCK_R < a.x + a.w : pk.x + PUCK_R > a.x;
    if (!entro || pk.y < a.y || pk.y > a.y + a.h) continue;
    /* En el arco del 0 marca el 1: cada uno defiende el suyo. */
    const marca = (1 - q) as 0 | 1;
    h.puntos[marca]++;
    h.ultimoGol = marca;
    texto(e, pk.x, pk.y - 50, "¡GOL!", marca === 0 ? "#3DDC97" : "#FF5C86");
    polvo(e, pk.x, pk.y, marca === 0 ? "#3DDC97" : "#FF5C86", 24);
    sonar(e, "win");
    e.eventos.push({ t: "gol", equipo: marca, goles: [h.puntos[0], h.puntos[1]] });
    if (h.puntos[marca] >= h.meta) {
      h.ganador = marca;
      terminarJuegoIndividual(e, e.players.find(p => p.equipo === marca)?.idx ?? null);
      return;
    }
    h.sacador = (1 - marca) as 0 | 1;      // saca el que acaba de encajar
    h.saque = HOCKEY_SAQUE;
    sacarEnHockey(e);
    return;
  }

  // y si no entró, rebota en el fondo
  if (pk.x < m.x + PUCK_R) { pk.x = m.x + PUCK_R; pk.vx = Math.abs(pk.vx) * 0.92; sonar(e, "whack"); }
  if (pk.x > m.x + m.w - PUCK_R) { pk.x = m.x + m.w - PUCK_R; pk.vx = -Math.abs(pk.vx) * 0.92; sonar(e, "whack"); }
}

/* ---- vóley ----
   Tenis con dos cambios, y de esos dos sale todo el juego:

   1. **el suelo no es legal**. En tenis un bote te da tiempo; aquí tocar el
      suelo ES el punto, así que la pelota se juega siempre en el aire.
   2. **tres toques por lado**. Con uno solo esto sería tenis sin botes. Los
      tres son lo que hace que un punto sea levantar, colocar y rematar — y por
      eso la carga del botón elige entre PASAR (se queda de tu lado, bien alta)
      y REMATAR (cruza la red). El tercer toque cruza sí o sí: si no, un lado
      podría quedarse la pelota para siempre. */
export const VOLEY_ALCANCE = 178;
/** Por encima de esto la pelota va demasiado alta para tocarla. Es lo que hace
    que un pase alto haya que esperarlo, en vez de volver a darle al salir. */
const VOLEY_TECHO = 230;
const VOLEY_SALIDA = 40;
/** Lo que tarda en llegar un pase (alto y lento) y un remate (tenso). */
const VOLEY_T_PASE = 1.45, VOLEY_T_REMATE = 1.25;

/** ¿Puede este jugador tocarla ahora mismo? */
function alAlcanceDeVoley(e: Estado, p: Jugador): Trasto | null {
  const v = e.voley;
  if (!v || v.ganador != null || p.stun > 0 || v.saque > 0 || v.bloqueo > 0) return null;
  const b = e.trastos.find(x => x.id === v.balon);
  if (!b) return null;
  if ((b.z ?? 0) > VOLEY_TECHO) return null;
  if (ladoDeVoley(v, b.x) !== ((p.equipo ?? 0) as 0 | 1)) return null;
  /* Si ya va para el otro lado, deja de ser tuya aunque todavía te sobrevuele:
     "si la mandas, ya no es tuya". */
  if (v.enviada && v.ultimoToque === ((p.equipo ?? 0) as 0 | 1)) return null;
  return dist2(p.x, p.y, b.x, b.y) < VOLEY_ALCANCE * VOLEY_ALCANCE ? b : null;
}

/**
 * Tocar la pelota. Flojo es un PASE —se queda de tu lado, bien alto, para que
 * te dé tiempo a colocarte— y fuerte es un REMATE, que cruza. El tercer toque
 * cruza siempre, tenga la carga que tenga.
 */
function golpeDeVoley(e: Estado, p: Jugador, k: number): "pase" | "remate" | null {
  const v = e.voley!;
  const b = alAlcanceDeVoley(e, p);
  if (!b) return null;

  const mio = (p.equipo ?? 0) as 0 | 1;
  /* Los toques son del LADO, y se cuentan desde que la pelota llegó a él. */
  if (v.ultimoToque !== mio) { v.toques = 0; }
  v.toques++;
  if (v.toques > VOLEY_TOQUES) {
    puntoDeVoley(e, (1 - mio) as 0 | 1, "cuatro toques");
    return null;
  }

  const c = v.cancha;
  const forzado = v.toques >= VOLEY_TOQUES;
  const cruza = forzado || k >= 0.5;
  /* El tercer toque cruza obligado, así que no puede salir con la fuerza que
     tuvieras: sin esto, la que cruza sola cae justo detrás de la red y es un
     regalo. Sale con media fuerza aunque no hayas cargado nada. */
  if (forzado) k = Math.max(k, 0.45);
  const haciaElRival = mio === 0 ? 1 : -1;
  const T = cruza ? VOLEY_T_REMATE : VOLEY_T_PASE;

  /* Un remate va al fondo del campo contrario; un pase se queda en el tuyo, un
     poco por delante de donde estás — que es donde vas a poder rematarlo. */
  const a = p.apunta;
  /* El pase cae ENCIMA DE TI, un paso por detrás. Apuntándolo a un sitio fijo
     del campo propio la levantada salía a medio campo de quien la daba —hasta
     700 px, y con 1,3 s de vuelo no llega nadie—: los bots pasaban una vez y
     veían caer su propia pelota. Un pase es para volver a darle, así que cae
     donde estás. */
  const tx = cruza
    ? v.redX + haciaElRival * (c.w / 2) * (0.28 + 0.60 * k)
    : clamp(p.x - haciaElRival * 80,
            mio === 0 ? c.x + 60 : v.redX + 60,
            mio === 0 ? v.redX - 60 : c.x + c.w - 60);
  const ty = cruza
    ? clamp(a.on ? a.wy : b.y, c.y + 70, c.y + c.h - 70)
    : clamp(p.y, c.y + 70, c.y + c.h - 70);

  /* El vuelo se resuelve al revés, como en el tenis: se elige DÓNDE cae y se
     despeja la fuerza. Es lo que garantiza que un remate pase por encima de la
     red en vez de estrellarse en ella por no calcular bien. */
  const z0 = Math.max(b.z ?? 0, VOLEY_SALIDA);
  b.vx = (tx - b.x) / T;
  b.vy = (ty - b.y) / T;
  b.z = z0;
  b.vz = GRAVEDAD * T / 2 - z0 / T;
  b.pateadoPor = p.idx;

  v.ultimoToque = mio;
  v.enviada = cruza;
  v.bloqueo = 0.28;
  polvo(e, b.x, b.y - 10, "#FFEFE2", cruza ? 8 : 4);
  sonar(e, "whack");
  texto(e, p.x, p.y - 58, cruza ? "¡Remate!" : "¡Va!", cruza ? "#FFC53D" : "#5CE1EA");
  return cruza ? "remate" : "pase";
}

/** El saque sale solo: con bots de por medio, un saque que hay que pedir es un
    partido que puede no empezar nunca. */
function saqueDeVoley(e: Estado): void {
  const v = e.voley!;
  const b = e.trastos.find(x => x.id === v.balon);
  if (!b) return;
  const c = v.cancha;
  const haciaElRival = v.sacador === 0 ? 1 : -1;
  const tx = v.redX + haciaElRival * (c.w / 2) * 0.55;
  const ty = c.y + c.h / 2 + rnd(e, -c.h * 0.30, c.h * 0.30);
  const T = 1.55;
  b.z = 48;
  b.vx = (tx - b.x) / T;
  b.vy = (ty - b.y) / T;
  b.vz = GRAVEDAD * T / 2 - b.z / T;
  b.pateadoPor = e.players.find(p => p.equipo === v.sacador)?.idx ?? null;
  v.ultimoToque = v.sacador;
  v.toques = 1;                    // el saque ES el primer toque de ese lado
  v.enviada = true;                // y ya va para el otro campo
  v.bloqueo = 0.2;
  texto(e, b.x, b.y - 50, "¡Saque!", "#FFC53D");
  sonar(e, "whack");
}

function puntoDeVoley(e: Estado, equipo: 0 | 1, motivo: string): void {
  const v = e.voley!;
  v.puntos[equipo]++;
  v.ultimoPunto = { equipo, motivo };
  const color = equipo === 0 ? "#3DDC97" : "#FF5C86";
  const b = e.trastos.find(x => x.id === v.balon);
  if (b) { b.vx = 0; b.vy = 0; b.vz = 0; }
  texto(e, b ? b.x : v.redX, (b ? b.y : v.cancha.y) - 60, "¡Punto! " + motivo, color);
  if (b) polvo(e, b.x, b.y, color, 18);
  sonar(e, "win");
  e.eventos.push({ t: "punto", equipo, puntos: [v.puntos[0], v.puntos[1]], motivo });

  if (v.puntos[equipo] >= v.meta) {
    v.ganador = equipo;
    terminarJuegoIndividual(e, e.players.find(p => p.equipo === equipo)?.idx ?? null);
    return;
  }
  /* Saca quien ganó el punto: es el punto-rally de siempre y ahorra llevar la
     cuenta de rotaciones. */
  v.sacador = equipo;
  v.saque = VOLEY_SAQUE;
  colocarParaElSaqueDeVoley(e);
}

function pasoVoley(e: Estado, dt: number): void {
  const v = e.voley;
  if (!v || v.ganador != null) return;
  const b = e.trastos.find(x => x.id === v.balon);
  if (!b) return;
  const c = v.cancha;

  /* Nadie cruza la red, como en el tenis: es regla de verdad y además impide
     que esto acabe siendo seis piernas alrededor de la pelota. */
  for (const p of e.players) {
    const mio = p.equipo ?? 0;
    p.y = clamp(p.y, c.y + 24, c.y + c.h - 24);
    p.x = mio === 0
      ? clamp(p.x, c.x + 24, v.redX - 40)
      : clamp(p.x, v.redX + 40, c.x + c.w - 24);
  }

  if (v.bloqueo > 0) v.bloqueo -= dt;

  if (v.saque > 0) {
    v.saque -= dt;
    b.vx = 0; b.vy = 0; b.vz = 0; b.z = 0;
    if (v.saque <= 0) { v.saque = 0; saqueDeVoley(e); }
    return;
  }

  const antesZ = b.z ?? 0;
  const antesX = b.x - b.vx * dt;

  b.vz = (b.vz ?? 0) - GRAVEDAD * dt;
  b.z = antesZ + b.vz * dt;

  /* ---- ¿le dio a la red? ----
     Se mira el CRUCE y no la cercanía: a mil y pico px/s la pelota se salta la
     franja entera entre dos fotogramas. */
  if ((antesX - v.redX) * (b.x - v.redX) <= 0 && Math.abs(b.x - antesX) > 0.01) {
    const u = clamp((v.redX - antesX) / (b.x - antesX), 0, 1);
    const zAllí = antesZ + ((b.z ?? 0) - antesZ) * u;
    if (zAllí < v.redAlto) {
      b.x = v.redX - (b.x - antesX > 0 ? 12 : -12);
      b.vx = 0; b.vy = 0;
      if (v.ultimoToque != null) { puntoDeVoley(e, (1 - v.ultimoToque) as 0 | 1, "a la red"); return; }
    } else if (v.ultimoToque != null) {
      /* Cruzó limpia: el lado de enfrente empieza sus tres toques de cero. */
      v.toques = 0;
      v.enviada = false;
    }
  }

  /* ---- el suelo ----
     Aquí está la diferencia con el tenis: no hay bote bueno. El suelo es el
     punto, y de quién sea el suelo decide de quién es. */
  if ((b.z ?? 0) <= 0) {
    b.z = 0; b.vz = 0;
    const dentro = inRect(b.x, b.y, c, 0);
    if (!dentro) {
      /* Fuera la manda quien la tocó por última vez: el punto es del otro. */
      if (v.ultimoToque != null) puntoDeVoley(e, (1 - v.ultimoToque) as 0 | 1, "fuera");
      else puntoDeVoley(e, 0, "fuera");
      return;
    }
    const dondeCayó = ladoDeVoley(v, b.x);
    puntoDeVoley(e, (1 - dondeCayó) as 0 | 1, "tocó el suelo");
    return;
  }

  /* Y fuera de la cancha por el aire tampoco vuelve. */
  if (!inRect(b.x, b.y, c, 0) && v.ultimoToque != null) {
    puntoDeVoley(e, (1 - v.ultimoToque) as 0 | 1, "fuera");
  }
}
