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
];

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
    desc:"Te aguanta el próximo golpe sin soltar lo que cargas." },
];

export const PORTAL_CADA = 6;                 // segundos entre Florines
export const PORTAL_VUELTA = 26;              // lo que tarda uno en hacer el recorrido
export const PORTAL_MAX = 6;                  // tope de Florines en el desfile a la vez
/* Qué sale: los Comunes salen mucho, los Cósmicos casi nunca. Los pesos suman 100. */
export const PORTAL_RAREZAS: { p: number; tier: number }[] = [
  { p:34, tier:0 }, { p:24, tier:1 }, { p:18, tier:2 }, { p:12, tier:3 },
  { p:7,  tier:4 }, { p:4,  tier:5 }, { p:1,  tier:6 },
];

export const LASER_DUR = 60, LASER_RECARGA = 30, LASER_PRECIO = 800, LASER_CARGA = 1;

export const RULETA_PRECIO = 1200;
export type CasillaRuleta =
  | { p: number; kind: "florin"; tier: number }
  | { p: number; kind: "dinero"; monto: number }
  | { p: number; kind: "arma" }
  | { p: number; kind: "incognita" };
export const RULETA: CasillaRuleta[] = [
  { p:20, kind:"florin", tier:0 },
  { p:16, kind:"florin", tier:1 },
  { p:14, kind:"florin", tier:2 },
  { p:12, kind:"incognita" },
  { p:10, kind:"florin", tier:3 },
  { p:8,  kind:"dinero", monto:500 },
  { p:6,  kind:"florin", tier:4 },
  { p:6,  kind:"arma" },
  { p:4,  kind:"dinero", monto:2500 },
  { p:3,  kind:"florin", tier:5 },
  { p:1,  kind:"florin", tier:6 },
];
export interface FilaIncognita { p: number; tier?: number; tierMax?: number; variant: "brillante" | "arcoiris" | null }
export const RULETA_INCOGNITA: FilaIncognita[] = [
  { p:45, tierMax:4, variant:"brillante" },
  { p:25, tierMax:3, variant:"arcoiris" },
  { p:20, tier:6,    variant:null },
  { p:10, tier:6,    variant:"arcoiris" },     // el premio gordo
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
  "Legendario":"#FF5C86","Mítico":"#FFD84D","Cósmico":"#5CE1EA"
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
];

export const VARIANTES = {
  brillante: { label:"Brillante", icon:"✨", mult:2, color:"#FFFFFF" },
  arcoiris:  { label:"Arcoíris",  icon:"🌈", mult:3, color:"#5CE1EA" },
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
    patios:[[70,90],[70,450],[70,810]] },
  { id:"desierto", nombre:"El Desierto",
    casas:[[70,90],[2150,90],[2150,1290],[1750,700]],
    patios:[[70,1290],[70,900],[70,510]] },
];

export const varMult = (v: string | null) =>
  (v && (VARIANTES as any)[v] ? (VARIANTES as any)[v].mult : 1) as number;
export const varLabel = (v: string | null) =>
  (v && (VARIANTES as any)[v] ? (VARIANTES as any)[v].icon + " " + (VARIANTES as any)[v].label : "");
export const florNombre = (f: { flor: number }) => FLORES[(f.flor | 0) % FLORES.length].nombre;
