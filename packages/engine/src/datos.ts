/* Tablas de datos del juego, copiadas literalmente del prototipo para no cambiar
   el balance al portar. Todo lo de aquí es dato puro: sin comportamiento.

   Nota para el reskin: los nombres de personajes (Mayo, El Sobri, la Prima Yuli,
   los Marcianos) y los de los Florines viven SOLO en estas tablas. Cambiarlos es
   editar este archivo, no tocar reglas. */

import type { Escenario } from "./tipos.js";

export const WORLD_W = 2600, WORLD_H = 1700;
export const GOAL = 60000;
export const PATIOS_PRECIO = [4000, 12000];

export const TIERS = [
  { name:"Florín Común",       rar:"Común",     price:100,   income:3,   n:5,  style:"plain",
    top:"#6FBF4A", strip:"#5FAF3E", side:"#8B5A2B", sideDark:"#6B4420",
    petal:"#E2453C", petal2:"#B82F28", center:"#FFE066" },
  { name:"Florín Bailarín",    rar:"Fiestero",  price:340,   income:9,   n:8,  style:"dance",
    top:"#7ED957", strip:"#63BD44", side:"#8B5A2B", sideDark:"#6B4420",
    petal:"#FFD84D", petal2:"#E8B71E", center:"#FFF3B0" },
  { name:"Girasolón Turbo",    rar:"Raro",      price:950,   income:24,  n:12, style:"turbo",
    top:"#5FAF3E", strip:"#4E9632", side:"#7A4A22", sideDark:"#5C3517",
    petal:"#FFB020", petal2:"#E08C0A", center:"#7A4A1E" },
  { name:"Florín Ninja",       rar:"Épico",     price:2400,  income:58,  n:6,  style:"ninja",
    top:"#5A4130", strip:"#4A3526", side:"#3E2C1E", sideDark:"#2C1E14",
    petal:"#B57BE0", petal2:"#8B4FC4", center:"#F0E68C" },
  { name:"Chancletín Florido", rar:"Legendario",price:5600,  income:135, n:6,  style:"chancla",
    top:"#6FBF4A", strip:"#5FAF3E", side:"#8B5A2B", sideDark:"#6B4420",
    petal:"#FF5C86", petal2:"#E0224F", center:"#FFD9E2" },
  { name:"Florín Rey Sol",     rar:"Mítico",    price:13000, income:310, n:10, style:"king",
    top:"#FFE066", strip:null,      side:"#E0A61B", sideDark:"#B37F0D",
    petal:"#FFF0A5", petal2:"#FFC53D", center:"#FF7A2F" },
  { name:"Florín Cósmico",     rar:"Cósmico",   price:31000, income:720, n:7,  style:"cosmic",
    top:"#3A2470", strip:null,      side:"#241548", sideDark:"#150C2E",
    petal:"#5CE1EA", petal2:"#2AB6C7", center:"#FFFFFF" },

  /* ---- de aquí para abajo, las rarezas de coleccionista ----
     Van DESPUÉS del Cósmico y nunca intercaladas: el tier se guarda como número
     en la partida y en cada lámina del álbum, así que meter una en medio
     convertiría el Cósmico de alguien en otra cosa.

     Suben suave (×1.3 por escalón, no ×2.4 como abajo) a propósito: lo que las
     hace especiales es que salen poco y se ven distintas, no que paguen una
     fortuna. Con la curva de abajo el último pagaría 19 000/s y los hitos de
     $60 000 dejarían de significar nada. */
  { name:"Florín Cebichero",   rar:"Sabrosón",  price:42000,  income:950,  n:5,  style:"cebiche",
    top:"#F2F0E4", strip:"#DCD9C6", side:"#C9C4AE", sideDark:"#A8A292",
    petal:"#9BD97F", petal2:"#6FBF4A", center:"#E2453C" },
  { name:"Florín Futbolero",   rar:"Hincha",    price:55000,  income:1250, n:6,  style:"futbol",
    top:"#4FB265", strip:"#3E9C56", side:"#7A4A22", sideDark:"#5C3517",
    petal:"#FFEFE2", petal2:"#E2453C", center:"#E2453C" },
  { name:"Florín Chasqui",     rar:"Mensajero", price:72000,  income:1600, n:5,  style:"chasqui",
    top:"#9A9182", strip:"#857D70", side:"#6E675C", sideDark:"#514C43",
    petal:"#E2453C", petal2:"#B82F28", center:"#FFD84D" },
  { name:"Florín Robot",       rar:"Cibernético", price:94000, income:2100, n:6, style:"robot",
    top:"#B8C2CC", strip:"#9AA5B1", side:"#7B8794", sideDark:"#5A6472",
    petal:"#5CE1EA", petal2:"#2AB6C7", center:"#FF3D6E" },
  { name:"Florín Momia",       rar:"Milenario", price:122000, income:2700, n:7,  style:"momia",
    top:"#E0D3AE", strip:"#CBBE97", side:"#B3A47C", sideDark:"#8E8262",
    petal:"#D8CFC0", petal2:"#B5AA97", center:"#37D6E0" },
  { name:"Florín Astronauta",  rar:"Orbital",   price:158000, income:3500, n:8,  style:"astro",
    top:"#F0F2F5", strip:"#D9DDE3", side:"#C2C7CF", sideDark:"#9AA0AA",
    petal:"#37D6E0", petal2:"#1FA8C4", center:"#FFC53D" },
  { name:"Florín Inca de Oro", rar:"Imperial",  price:205000, income:4500, n:9,  style:"inca",
    top:"#FFD84D", strip:null,      side:"#E0A61B", sideDark:"#B37F0D",
    petal:"#FF7A2F", petal2:"#E0224F", center:"#FFF0A5" },
  { name:"Florín Amaru",       rar:"Ancestral", price:265000, income:5800, n:6,  style:"amaru",
    top:"#1E5E4A", strip:"#17493A", side:"#123A2E", sideDark:"#0B2620",
    petal:"#3DDC97", petal2:"#1E9A66", center:"#FFD84D" },
];

/** Cuánto dura abierto el paraguas, en segundos. */
export const ESCUDO_DUR = 180;

export const WEAPONS = [
  { id:"chancla",  name:"Chancla",      icon:"🩴", price:0,    uses:0, cd:0,  color:"#FF3D6E",
    desc:"Bumerán. Noquea 3.6 s." },
  { id:"hielo",    name:"Congeladora",  icon:"🧊", price:900,  uses:3, cd:.5, color:"#5CE1EA",
    desc:"Congela 7 s a quien toque." },
  { id:"secadora", name:"Secadora",     icon:"💨", price:1500, uses:4, cd:.7, color:"#BFE9FF",
    desc:"Ráfaga en cono: los manda a volar." },
  { id:"taser",    name:"Chicharra",    icon:"⚡", price:2600, uses:3, cd:.9, color:"#FFE066",
    desc:"Descarga alrededor: noquea 5 s." },
  { id:"refresco", name:"Refresco",     icon:"🥤", price:700,  uses:2, cd:.4, color:"#FF9EC4",
    desc:"+75 % de velocidad por 9 s." },
  { id:"capa",     name:"Capa",         icon:"👻", price:1900, uses:2, cd:.4, color:"#D8CFD4",
    desc:"Las abuelas no te ven 8 s." },
  { id:"cascara",  name:"Cáscaras",     icon:"🍌", price:500,  uses:3, cd:.4, color:"#FFD84D",
    desc:"La sueltas al piso: quien la pise resbala 4 s." },
  { id:"perro",    name:"Chihuahua",    icon:"🐕", price:1400, uses:2, cd:.6, color:"#E8B08A",
    desc:"20 s morder ladrones dentro de tus patios." },
  { id:"reloj",    name:"Reloj",        icon:"⏱️", price:1800, uses:2, cd:.6, color:"#9BD97F",
    desc:"Ladrones y abuelas al 40 % por 6 s." },
  { id:"iman",     name:"Imán",         icon:"🧲", price:2000, uses:3, cd:.8, color:"#FF7A2F",
    desc:"Jala un Florín vecino desde 320 px." },
  { id:"abductor", name:"Rayo alien",   icon:"🛸", price:3400, uses:2, cd:1,  color:"#8B6BEE",
    desc:"Se lo lleva el platillo 10 s y lo suelta todo." },
  { id:"red",      name:"Red",          icon:"🕸️", price:1600, uses:3, cd:.6, color:"#BFE9FF",
    desc:"Caza al instante un Florín del desfile, sin esperar el aro." },
  { id:"paraguas", name:"Paraguas",     icon:"☂️", price:1100, uses:2, cd:.4, color:"#5CE1EA",
    desc:"Te protege tres minutos: aguanta los golpes sin soltar lo que cargas." },
];

export const PORTAL_CADA = 6;                 // segundos entre Florines
export const PORTAL_VUELTA = 26;              // lo que tarda uno en hacer el recorrido
export const PORTAL_MAX = 6;                  // tope de Florines en el desfile a la vez
/* Qué sale del portal. Los pesos suman 100 y el desfile NO respeta maxTier: lo
   raro puede salir desde el primer segundo, solo que casi nunca.
   El Amaru va a 0.4 → sale un par de veces por hora de juego. Con menos, nadie
   lo vería nunca; con más, deja de ser el que te hace cruzar el barrio
   corriendo. */
export const PORTAL_RAREZAS: { p: number; tier: number }[] = [
  { p:28.4, tier:0 }, { p:19,  tier:1 }, { p:13.5, tier:2 }, { p:9.5, tier:3 },
  { p:6.5,  tier:4 }, { p:5,   tier:5 }, { p:4,    tier:6 }, { p:3.4, tier:7 },
  { p:2.8,  tier:8 }, { p:2.3, tier:9 }, { p:1.9,  tier:10 },{ p:1.5, tier:11 },
  { p:1.1,  tier:12 },{ p:.7,  tier:13 },{ p:.4,   tier:14 },
];

export const LASER_DUR = 60, LASER_RECARGA = 30, LASER_PRECIO = 800, LASER_CARGA = 1;

/* ---- trastos del escenario ----
   Los vehículos son puro transporte: al agarrar un Florín te bajas, así que no
   sirven para escapar con el botín y no hay nada que reequilibrar. Lo que
   cambian es lo pesado que se hace cruzar un mapa de 2600×1700.

   `agua` marca los que solo funcionan dentro del mar; los demás, solo fuera. */
export interface Vehiculo { mult: number; agua: boolean; label: string; icon: string }
export const VEHICULOS: Record<string, Vehiculo> = {
  bici:       { mult:1.6,  agua:false, label:"bicicleta",     icon:"🚲" },
  patineta:   { mult:1.45, agua:false, label:"patineta",      icon:"🛹" },
  tablaArena: { mult:1.5,  agua:false, label:"tabla de arena",icon:"🏂" },
  llama:      { mult:1.5,  agua:false, label:"llama",         icon:"🦙" },
  camello:    { mult:1.55, agua:false, label:"camello",       icon:"🐫" },
  tabla:      { mult:1.7,  agua:true,  label:"tabla de surf", icon:"🏄" },
  balsa:      { mult:1.6,  agua:true,  label:"balsa",         icon:"🛶" },
  flotador:   { mult:1.15, agua:true,  label:"flotador",      icon:"🛟" },
  /* Los de juguete. El carrito es lo más rápido que hay: es un cochecito, y en
     la pista de plástico o en el circuito tiene que sentirse así. */
  carrito:    { mult:1.75, agua:false, label:"carrito",       icon:"🏎️" },
  vagoneta:   { mult:1.5,  agua:false, label:"vagoneta",      icon:"🚃" },
};
export const esVehiculo = (tipo: string) => tipo in VEHICULOS;

/** A qué distancia se monta o se patea un trasto. */
export const TRASTO_ALCANCE = 30;
/** Lo que empuja una patada, sobre la velocidad a la que ibas. */
export const PATADA = 2.6;
/** Rozamiento de lo que rueda: 1 = no frena nunca. */
export const RODAR_ROCE = 0.12;

/* Cada sitio con lo suyo. Una patineta en Machu Picchu o una pelota de fútbol
   en la selva rompen el escenario: lo que se monta y lo que rueda tiene que
   poder estar ahí. */
export const TRASTOS_ESCENARIO: Record<string, { tipo: string; n: number }[]> = {
  barrio:      [{ tipo:"bici", n:4 },       { tipo:"patineta", n:3 }, { tipo:"pelota", n:8 }],
  colegio:     [{ tipo:"patineta", n:4 },   { tipo:"pelota", n:7 }],
  playa:       [{ tipo:"tabla", n:3 },      { tipo:"flotador", n:2 }, { tipo:"pelota", n:6 }],
  desierto:    [{ tipo:"tablaArena", n:3 }, { tipo:"mata", n:7 }],
  machupicchu: [{ tipo:"llama", n:4 },      { tipo:"piedra", n:7 }],
  nuevayork:   [{ tipo:"patineta", n:5 },   { tipo:"bici", n:3 },     { tipo:"pelota", n:6 }],
  egipto:      [{ tipo:"camello", n:3 },    { tipo:"tablaArena", n:3 }, { tipo:"piedra", n:6 }],
  amazonas:    [{ tipo:"balsa", n:4 },      { tipo:"coco", n:8 }],
  pista:       [{ tipo:"carrito", n:5 },    { tipo:"pelota", n:6 }],
  tablero:     [{ tipo:"carrito", n:3 },    { tipo:"dado", n:8 }],
  mirador:     [{ tipo:"vagoneta", n:4 },   { tipo:"piedra", n:7 }],
  circuito:    [{ tipo:"carrito", n:5 },    { tipo:"caparazon", n:7 }],
};

export const RULETA_PRECIO = 1200;
export type CasillaRuleta =
  | { p: number; kind: "florin"; tier: number }
  | { p: number; kind: "dinero"; monto: number }
  | { p: number; kind: "arma" }
  | { p: number; kind: "incognita" };
/* La ruleta no lista las quince rarezas: la tira se volvería ilegible. Reparte
   las de abajo y va salteando arriba (7, 9, 11, 13, 14); las que faltan salen
   del desfile. */
export const RULETA: CasillaRuleta[] = [
  { p:18,  kind:"florin", tier:0 },
  { p:14,  kind:"florin", tier:1 },
  { p:12,  kind:"florin", tier:2 },
  { p:11,  kind:"incognita" },
  { p:9,   kind:"florin", tier:3 },
  { p:7,   kind:"dinero", monto:500 },
  { p:6,   kind:"florin", tier:4 },
  { p:6,   kind:"arma" },
  { p:4,   kind:"dinero", monto:2500 },
  { p:4,   kind:"florin", tier:5 },
  { p:3,   kind:"florin", tier:6 },
  { p:2.4, kind:"florin", tier:7 },
  { p:1.6, kind:"florin", tier:9 },
  { p:1,   kind:"florin", tier:11 },
  { p:.7,  kind:"florin", tier:13 },
  { p:.3,  kind:"florin", tier:14 },
];
export interface FilaIncognita {
  p: number; tier?: number; tierMax?: number;
  variant: "brillante" | "arcoiris" | "fantasma" | "dorado" | null;
}
/* La casilla ??? es de donde salen TODAS las variantes. Cuanto mejor la
   variante, más baja la rareza que la acompaña: un Dorado ×5 sobre un Cósmico
   pagaría más que toda la vitrina junta. */
export const RULETA_INCOGNITA: FilaIncognita[] = [
  { p:34, tierMax:6,  variant:"brillante" },
  { p:20, tierMax:5,  variant:"arcoiris" },
  { p:14, tierMax:9,  variant:null },
  { p:12, tierMax:4,  variant:"fantasma" },
  { p:9,  tierMax:3,  variant:"dorado" },
  { p:5,  tierMax:12, variant:null },
  { p:4,  tier:14,    variant:null },
  { p:2,  tier:14,    variant:"dorado" },      // el premio gordo
];

export const LADRONES: Record<string, any> = {
  mayo:   { label:"Mayo",    shirt:"#FFD84D", skin:"#F0C08A", hair:"#3A2416",
            cap:"#E8B71E", ears:null,      spd:.88, greedy:true,
            frase:"Mayo se llevó" },
  sobri:  { label:"El Sobri",shirt:"#FF9EC4", skin:"#C98B62", hair:"#2A1226",
            cap:null,      ears:null,      spd:1.02, greedy:false,
            frase:"El Sobri se llevó" },
  /* La Prima Yuli corre muchísimo, pero es conformista: solo carga lo barato */
  yuli:   { label:"La Prima Yuli", shirt:"#FF5C86", skin:"#E8B08A", hair:"#5A2A3E",
            cap:null,      ears:null,      spd:1.40, greedy:false, maxTier:2,
            frase:"La Prima Yuli se llevó" },
  /* Los Marcianos van por lo más caro y se teletransportan: cuesta acertarles */
  marcia: { label:"Marciano", shirt:"#8B6BEE", skin:"#9FE6A0", hair:"#2A1226",
            cap:null,      ears:"#8B6BEE", spd:1.05, greedy:true, salta:5,
            frase:"El Marciano se llevó" },
};

export const RAR_COLOR: Record<string, string> = {
  "Común":"#9BD97F","Fiestero":"#FF9EC4","Raro":"#FFB020","Épico":"#8B6BEE",
  "Legendario":"#FF5C86","Mítico":"#FFD84D","Cósmico":"#5CE1EA",
  "Sabrosón":"#C6E86B","Hincha":"#FF6B4A","Mensajero":"#D9A066",
  "Cibernético":"#8FA9C4","Milenario":"#E0D3AE","Orbital":"#7FA8FF",
  "Imperial":"#FF8A00","Ancestral":"#3DDC97"
};

export const FLORES = [
  { id:"amapola",    nombre:"Amapola",    n:null, forma:"ovalo",    R:6.5, centro:4.2, hojas:1 },
  { id:"margarita",  nombre:"Margarita",  n:13,   forma:"tira",     R:7.4, centro:3.6, hojas:1 },
  { id:"tulipan",    nombre:"Tulipán",    n:3,    forma:"copa",     R:3.4, centro:0,   hojas:2 },
  { id:"campanilla", nombre:"Campanilla", n:1,    forma:"campana",  R:0,   centro:0,   hojas:2 },
  { id:"girasol",    nombre:"Girasol",    n:15,   forma:"punta",    R:7.8, centro:5.6, hojas:1, semillas:true },
  { id:"orquidea",   nombre:"Orquídea",   n:5,    forma:"orquidea", R:6,   centro:2.8, hojas:0, labio:true },
  { id:"cactus",     nombre:"Cactus",     n:6,    forma:"ovalo",    R:4.4, centro:2.6, hojas:0, cactus:true },
  { id:"estrella",   nombre:"Estrella",   n:5,    forma:"estrella", R:6.8, centro:3.4, hojas:1 },
  { id:"pompon",     nombre:"Pompón",     n:11,   forma:"bolita",   R:6.2, centro:3,   hojas:1 },
  { id:"trebol",     nombre:"Trébol",     n:4,    forma:"corazon",  R:5.2, centro:2.4, hojas:2 },
  { id:"cantuta",    nombre:"Cantuta",    n:5,    forma:"copa",     R:5,   centro:2.2, hojas:2 },
  { id:"rosa",       nombre:"Rosa",       n:9,    forma:"rizo",     R:4.4, centro:1.6, hojas:2 },
  { id:"loto",       nombre:"Loto",       n:12,   forma:"punta",    R:6.6, centro:4,   hojas:0 },
  { id:"ave",        nombre:"Ave del Paraíso", n:4, forma:"abanico", R:6.2, centro:2, hojas:1 },
  { id:"hongo",      nombre:"Hongo",      n:1,    forma:"sombrero", R:0,   centro:0,   hojas:1 },
  { id:"diente",     nombre:"Diente de León", n:22, forma:"tira",   R:6.8, centro:2.2, hojas:1, pelusa:true },
  { id:"hibisco",    nombre:"Hibisco",    n:5,    forma:"corazon",  R:6.4, centro:3.2, hojas:1, labio:true },
  { id:"bambu",      nombre:"Bambú",      n:6,    forma:"lanza",    R:5.6, centro:0,   hojas:2 },
];

export const VARIANTES = {
  brillante: { label:"Brillante", icon:"✨", mult:2, color:"#FFFFFF" },
  arcoiris:  { label:"Arcoíris",  icon:"🌈", mult:3, color:"#5CE1EA" },
  fantasma:  { label:"Fantasma",  icon:"👻", mult:4, color:"#B8C2FF" },
  dorado:    { label:"Dorado",    icon:"👑", mult:5, color:"#FFD84D" },
};
/* Los escenarios: aquí solo va el REPARTO (lo que afecta al juego).
   El suelo, los colores y el decorado son cosa de quien dibuja. */
export const ESCENARIOS: Escenario[] = [
  { id:"barrio",   nombre:"El Barrio",
    casas:[[70,90],[2150,90],[2150,700],[2150,1290]],
    patios:[[70,1290],[520,1290],[70,900]] },
  { id:"colegio",  nombre:"Sta. Teresita",
    casas:[[70,90],[560,90],[70,660],[70,1290]],
    patios:[[2150,1290],[1700,1290],[2150,860]] },
  { id:"playa",    nombre:"La Playa",
    casas:[[2150,90],[2150,620],[2150,1100],[560,1100]],
    patios:[[70,90],[70,450],[70,810]],
    mar: WORLD_H - 210 },
  { id:"desierto", nombre:"El Desierto",
    casas:[[70,90],[2150,90],[2150,1290],[1750,700]],
    patios:[[70,1290],[70,900],[70,510]] },

  /* Los cuatro de viaje. Mismo reparto de siempre —un patio, cuatro casas y
     los dos comprables al lado— porque las reglas no cambian con el sitio. */
  { id:"machupicchu", nombre:"Machu Picchu",
    casas:[[70,90],[2150,90],[2150,700],[2150,1290]],
    patios:[[70,1290],[520,1290],[70,900]] },
  /* Nueva York se reparte a propósito: las casas arriba, los patios a la
     izquierda, Central Park ocupando toda la derecha y el puerto abajo. El
     puente de Brooklyn es el único paso a pie sobre el agua. */
  { id:"nuevayork",   nombre:"Nueva York",
    casas:[[70,80],[560,80],[1620,80],[2130,80]],
    patios:[[70,540],[70,910],[480,1060]],
    mar: 1430,
    puente: { x: 1880, w: 340 } },
  { id:"egipto",      nombre:"Egipto",
    casas:[[2150,90],[2150,700],[2150,1290],[70,90]],
    patios:[[70,1290],[520,1290],[70,880]] },
  { id:"amazonas",    nombre:"El Amazonas",
    casas:[[70,90],[2150,90],[560,90],[2150,620]],
    patios:[[70,1120],[520,1120],[70,760]],
    // el río corre por el sur: sin balsa te frena en la ribera
    mar: WORLD_H - 240 },

  /* Los cuatro de juguete: el suelo del cuarto convertido en cuadra. El
     reparto es el de siempre —cuatro casas, un patio y los dos comprables al
     lado— porque el sitio cambia el decorado, no las reglas. */
  { id:"pista",    nombre:"Hot Wheels",
    casas:[[70,90],[2150,90],[2150,700],[2150,1290]],
    patios:[[70,1290],[520,1290],[70,900]] },
  { id:"tablero",  nombre:"Monopoly",
    casas:[[70,90],[560,90],[1620,90],[2130,90]],
    patios:[[70,1290],[520,1290],[70,900]] },
  /* En el Mirador las casas van todas a la derecha y arriba: la esquina
     noroeste se deja libre a propósito para que quepa la montaña. */
  { id:"mirador",  nombre:"Thomas y el Mirador",
    casas:[[2150,90],[2150,700],[2150,1290],[1620,90]],
    patios:[[70,1290],[520,1290],[70,880]] },
  { id:"circuito", nombre:"Mario Kart",
    casas:[[70,90],[2150,90],[560,90],[2150,620]],
    patios:[[70,1120],[520,1120],[70,760]] },
];

export const varMult = (v: string | null) =>
  (v && (VARIANTES as any)[v] ? (VARIANTES as any)[v].mult : 1) as number;
export const varLabel = (v: string | null) =>
  (v && (VARIANTES as any)[v] ? (VARIANTES as any)[v].icon + " " + (VARIANTES as any)[v].label : "");
export const florNombre = (f: { flor: number }) => FLORES[(f.flor | 0) % FLORES.length].nombre;
