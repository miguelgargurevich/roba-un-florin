/* La simulación. Puerto fiel del prototipo, con tres diferencias de fondo:

   1. El azar sale del estado (ver util.ts), no de Math.random.
   2. Los avisos, partículas y sonidos salen como eventos, no como llamadas a
      pop()/puff()/Snd.
   3. El movimiento llega como `entradas`, no leyendo el teclado.

   Todo lo demás —números, tiempos, condiciones— se mantiene igual a propósito:
   el objetivo de esta fase es que el juego se comporte exactamente como antes. */

import type {
  Base, Bala, DesfileItem, EntradaJugador, Estado, Florin, Jugador, Ladron,
  Pedestal, Premio, Abuela, RefObjetivo, RefPed, Trasto,
} from "./tipos.js";
import {
  ESCUDO_DUR, GOAL, LADRONES, LASER_CARGA, RULETA, RULETA_INCOGNITA, RULETA_PRECIO,
  PATADA, PORTAL_CADA, PORTAL_MAX, PORTAL_RAREZAS, PORTAL_VUELTA,
  LASER_DUR, LASER_PRECIO, LASER_RECARGA, RODAR_ROCE, TRASTO_ALCANCE,
  TIERS, VARIANTES, VEHICULOS, WEAPONS, WORLD_H, WORLD_W, esVehiculo, varLabel, varMult,
} from "./datos.js";
import { azar, clamp, dist2, inRect, lerp, money, pick, rnd, tiraDeTabla } from "./util.js";
import {
  baseDe, bloqueadoPorLaser, desfileDe, enElMar, enElPuente, esMiPatio, florinIncome, freePed,
  freePedDe, jugadorDe, laserActivo, mismoFlorin, nivelDeVitrina, nombreDeHito,
  nuevoFlorin, nuevoId, occupied, occupiedDe, patiosDe, pedDe, playerIncome,
  polvo, ponerLaser, puedeMojarse, puntoDelDesfile, sonar, texto, trastoDe,
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

export function sacarDelPortal(e: Estado) {
  const P = e.portal;
  if (P.desfile.length >= PORTAL_MAX) return;
  const fila = tiraDeTabla(e, PORTAL_RAREZAS);
  const p0 = puntoDelDesfile(e, 0);
  P.desfile.push({
    id: nuevoId(e),
    florin: nuevoFlorin(e, fila.tier, { bob: rnd(e, 0, 6.28) }),
    k: 0, x: p0.x, y: p0.y, face: 1, pop: 1, esDesfile: true,
  });
  polvo(e, P.x, P.y, "#FF9EC4", 12);
}

export function spawnThief(e: Estado) {
  const victimas = e.players.filter(p => occupiedDe(e, p).length);
  if (!victimas.length) return;
  const victim = pick(e, victimas);
  const patios = patiosDe(e, victim).filter(b => occupied(b).length);
  if (!patios.length) return;
  const ladronas = e.bases.filter(b => !b.isPlayer && b.who);
  if (!ladronas.length) return;
  const from = pick(e, ladronas);
  const K = LADRONES[from.who!];
  const spd = (150 + Math.min(70, e.t * 0.28)) * K.spd;
  e.thieves.push({
    id: nuevoId(e),
    x: from.rect.x + from.rect.w / 2 + rnd(e, -90, 90),
    y: from.rect.y + from.rect.h / 2 + rnd(e, -70, 70),
    homeId: from.id, victimId: pick(e, patios).id, state: "go", target: null, carry: null,
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
  const s = tiraDeTabla(e, RULETA_INCOGNITA);
  const tier = s.tier != null ? s.tier : ((azar(e) * ((s.tierMax ?? 0) + 1)) | 0);
  return { kind: "florin", tier, variant: s.variant, sorpresa: true };
}

export function textoDePremio(pr: Premio): string {
  if (pr.kind === "dinero") return money(pr.monto);
  if (pr.kind === "arma") return WEAPONS[pr.arma].icon + " " + WEAPONS[pr.arma].name + " ×2";
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

/** Arranca una tirada. Devuelve false si no se pudo (sin dinero o ya girando). */
export function girarRuleta(e: Estado, p: Jugador, dur = 2.2): boolean {
  if (e.girando) return false;
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

export function comprarArma(e: Estado, p: Jugador, i: number): boolean {
  const w = WEAPONS[i];
  if (!w || w.price === 0) return false;
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
  e.thiefTimer -= dt;
  if (e.thiefTimer <= 0) {
    spawnThief(e);
    let peor = 26;
    for (const p of e.players) {
      const mios = occupiedDe(e, p);
      const masCaro = mios.reduce((m, q) => Math.max(m, q.florin!.tier), 0);
      peor = Math.min(peor, 26 - Math.min(mios.length, 8) * 2.0 - masCaro * 0.7);
    }
    e.thiefTimer = clamp(peor, 10, 26);
  }

  for (let i = e.thieves.length - 1; i >= 0; i--) {
    const t = e.thieves[i];
    const casa = baseDe(e, t.homeId), victima = baseDe(e, t.victimId);
    let objetivo = pedDe(e, t.target);
    applyKnock(t, dt);
    if (e.esc.mar != null && !enElPuente(e, t.x) && t.y > e.esc.mar) t.y = e.esc.mar;
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
    if (e.esc.mar != null && !enElPuente(e, g.x) && g.y > e.esc.mar) g.y = e.esc.mar;
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
  P.timer -= dt;
  if (P.timer <= 0) { P.timer = PORTAL_CADA; sacarDelPortal(e); }
  for (let i = P.desfile.length - 1; i >= 0; i--) {
    const d = P.desfile[i];
    if (d.pop > 0) d.pop -= dt * 2.2;
    d.k += dt / PORTAL_VUELTA;
    if (d.k >= 1) { polvo(e, P.x, P.y, "#8B6BEE", 10); P.desfile.splice(i, 1); continue; }
    const q = puntoDelDesfile(e, d.k);
    d.face = q.x >= d.x ? 1 : -1;
    d.x = q.x; d.y = q.y;
    d.florin.bob += dt * 4.2;
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
  if (robando) {
    const victima = baseDe(e, robando.victimId);
    if (!e.alarma) sonar(e, "alarma");
    else if (e.alarma.pip <= 0) { sonar(e, "alarma"); e.alarma.pip = 0.9; }
    e.alarma = {
      quien: LADRONES[robando.who].label,
      color: LADRONES[robando.who].shirt,
      patio: victima.name,
      x: robando.x, y: robando.y,
      pip: e.alarma ? e.alarma.pip - dt : 0.9,
      victimaIdx: victima.owner!,
      llevandose: robando.state === "back",
    };
  } else {
    e.alarma = null;
  }

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
  return info.agua === enElMar(e, p.y) ? info.mult : 0.9;
}

/* Montarse es automático al pisarlo, pero solo una vez por visita: sin el
   `trastoUsado` te bajarías y te volverías a montar en el mismo frame mientras
   sigues encima. Es el mismo bicho que ya mordió con la pasarela. */
function tocarTrastos(e: Estado, p: Jugador): void {
  let sigueCerca: number | null = null;

  for (const v of e.trastos) {
    if (v.montadoPor != null && v.montadoPor !== p.idx) continue;
    const cerca = dist2(p.x, p.y, v.x, v.y) < TRASTO_ALCANCE * TRASTO_ALCANCE;
    if (!cerca) continue;
    if (p.trastoUsado === v.id) { sigueCerca = v.id; continue; }

    if (esVehiculo(v.tipo)) {
      // cargando un Florín no te montas: el vehículo es para llegar, no para huir
      if (p.montado != null || p.carry) continue;
      const info = VEHICULOS[v.tipo];
      p.montado = v.id;
      v.montadoPor = p.idx;
      p.trastoUsado = v.id;
      sigueCerca = v.id;
      texto(e, p.x, p.y - 40, info.icon + " " + info.label, "#5CE1EA");
      sonar(e, "grab");
    } else {
      // pelotas y matas: se patean en la dirección en la que ibas
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
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.giro += Math.hypot(v.vx, v.vy) * dt * 0.06;
    if (v.x < 20 || v.x > WORLD_W - 20) { v.vx *= -0.7; v.x = clamp(v.x, 20, WORLD_W - 20); }
    if (v.y < 20 || v.y > WORLD_H - 20) { v.vy *= -0.7; v.y = clamp(v.y, 20, WORLD_H - 20); }

    const rapidez = Math.hypot(v.vx, v.vy);
    if (rapidez >= PELOTAZO_MIN) {
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

    const roce = Math.pow(RODAR_ROCE, dt);
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

  const speed = (p.carry ? 196 : 268) * (p.boost > 0 ? 1.75 : 1) * multDeMontura(e, p);
  p.vx = lerp(p.vx, ix * speed, 1 - Math.pow(0.0009, dt));
  p.vy = lerp(p.vy, iy * speed, 1 - Math.pow(0.0009, dt));
  p.x = clamp(p.x + p.vx * dt, 22, WORLD_W - 22);
  p.y = clamp(p.y + p.vy * dt, 22, WORLD_H - 22);

  /* ---- la orilla ----
     A pie el agua te para en seco; con tabla o flotador se entra. Si te bajas
     estando dentro, el mismo tope te devuelve a la arena. */
  if (e.esc.mar != null && !puedeMojarse(e, p) && !enElPuente(e, p.x) && p.y > e.esc.mar) {
    p.y = e.esc.mar;
    if (p.vy > 0) p.vy = 0;
  }

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
    p.inShop = inRect(p.x, p.y, e.armeria, 30);
    p.inRuleta = dist2(p.x, p.y, e.ruleta.x, e.ruleta.y) < (e.ruleta.r + 30) ** 2;
  }
}
