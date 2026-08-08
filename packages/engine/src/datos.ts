/* Tablas de datos del juego, copiadas literalmente del prototipo para no cambiar
   el balance al portar. Todo lo de aquí es dato puro: sin comportamiento.

   Nota para el reskin: los nombres de personajes (Mayo, El Sobri, la Prima Yuli,
   los Marcianos) y los de los Florines viven SOLO en estas tablas. Cambiarlos es
   editar este archivo, no tocar reglas. */

import type { Escenario } from "./tipos.js";

export const WORLD_W = 3600, WORLD_H = 2100;

/* Cuánto más grande es el mapa que aquel para el que se escribieron a mano las
   recetas de trastos y el ritmo del desfile. Todo lo que llena el mundo se
   multiplica por esto: si no, agrandar el mapa es repartir lo mismo por el
   doble de sitio, que es un descampado con las mismas cuatro bicis. */
export const ESCALA_MAPA = (WORLD_W * WORLD_H) / (2600 * 1700);
export const GOAL = 60000;
export const PATIOS_PRECIO = [4000, 12000, 30000, 70000];

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

export const PORTAL_CADA = 6 / ESCALA_MAPA;   // segundos entre Florines
/* Lo que tarda uno en el recorrido. Sube con la pasarela: con el tiempo fijo,
   un ocho más largo solo significaba Florines más veloces y más difíciles de
   atrapar, que no es lo que se quería al agrandar el mapa. */
export const PORTAL_VUELTA = Math.round(26 * (WORLD_W / 2600));
/** A qué velocidad pasean los Florines sueltos. */
export const PORTAL_VEL = 132;
export const PORTAL_MAX = Math.round(6 * ESCALA_MAPA);  // Florines en el desfile a la vez
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
  /* El dinosaurio. Lo más rápido que se encuentra tirado por ahí, y con
     diferencia lo más grande: si vas montado en un tiranosaurio, tiene que
     notarse desde el otro lado del mapa. */
  dino:       { mult:1.9,  agua:false, label:"dinosaurio",    icon:"🦖" },

  /* ---- los especiales ----
     No se encuentran tirados por el mapa: se ganan en la Ruleta o se compran
     en el Garaje con dinero de aventura, y una vez tuyos son tuyos para
     siempre. Todos vuelan o flotan (`agua`), que es medio chiste y medio
     ventaja: con uno de estos el mar deja de ser una pared. */
  ovni:       { mult:2.1,  agua:true,  label:"ovni",          icon:"🛸" },
  chancla:    { mult:1.95, agua:true,  label:"chancla voladora", icon:"🩴" },
  condor:     { mult:2.0,  agua:true,  label:"cóndor",        icon:"🦅" },
  amaru:      { mult:2.2,  agua:true,  label:"Amaru",         icon:"🐉" },
};

/** Lo que cuesta cada especial en el Garaje, y qué hay que haber hecho antes.
    Los precios son de aventura larga a propósito: son el premio a haber
    jugado, no una compra de las primeras. */
export const GARAJE: { tipo: string; precio: number; comoSale: string }[] = [
  { tipo:"chancla", precio: 45_000,  comoSale:"La chancla de tu mamá, pero con alas. Flota sobre el agua." },
  { tipo:"condor",  precio: 120_000, comoSale:"El cóndor de la sierra. Vuela por encima de todo." },
  { tipo:"ovni",    precio: 300_000, comoSale:"El platillo de los Marcianos. Nadie sabe cómo lo consiguieron." },
  { tipo:"amaru",   precio: 750_000, comoSale:"La serpiente alada. Lo más rápido que hay, y no es discutible." },
];
export const esEspecial = (tipo: string) => GARAJE.some(g => g.tipo === tipo);
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
  costaverde:  [{ tipo:"bici", n:5 },       { tipo:"patineta", n:4 }, { tipo:"pelota", n:5 }],
  prehistoria: [{ tipo:"dino", n:4 },       { tipo:"piedra", n:8 },   { tipo:"coco", n:5 }],
  volcan:      [{ tipo:"carrito", n:4 },    { tipo:"piedra", n:8 }],
  luna:        [{ tipo:"carrito", n:5 },    { tipo:"piedra", n:7 }],
};

export const RULETA_PRECIO = 1200;
export type CasillaRuleta =
  | { p: number; kind: "florin"; tier: number }
  | { p: number; kind: "dinero"; monto: number }
  | { p: number; kind: "arma" }
  | { p: number; kind: "vehiculo" }
  | { p: number; kind: "incognita" };
/* La ruleta no lista las quince rarezas: la tira se volvería ilegible. Reparte
   las de abajo y va salteando arriba (7, 9, 11, 13, 14); las que faltan salen
   del desfile. */
export const RULETA: CasillaRuleta[] = [
  /* Un vehículo especial sale poco a propósito: es EL premio de la Ruleta, y
     si saliera seguido dejaría de serlo. */
  { p:2,   kind:"vehiculo" },
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
  /* Los dos del mapa grande. Doña Meche es la del quiosco: va despacio pero
     solo se agacha por lo caro, así que cuando te la encuentras ya es tarde. */
  meche:  { label:"Doña Meche", shirt:"#5CE1EA", skin:"#D8A87A", hair:"#8A8478",
            cap:null,      ears:null,      spd:0.80, greedy:true,
            frase:"Doña Meche se llevó" },
  /* El Chato corre casi como la Prima Yuli y además carga de todo: es el que
     más lejos llega antes de que le tires la chancla. */
  chato:  { label:"El Chato",  shirt:"#9BD97F", skin:"#B57A50", hair:"#1A1008",
            cap:"#3DDC97", ears:null,      spd:1.30, greedy:false, maxTier:3,
            frase:"El Chato se llevó" },
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
/* ---- circuitos ----
   Un circuito son puntos de paso en bucle. El motor solo necesita eso: te
   cuenta la vuelta cuando los tocas EN ORDEN, que es lo que impide cortar por
   el medio. El dibujo de la pista lo pone el cliente uniendo los mismos
   puntos, así que lo que se ve y lo que se corre no pueden separarse. */

/** Cuántas vueltas dura una carrera. */
export const VUELTAS = 3;
/** A qué distancia cuenta que pasaste por un punto. Generoso a propósito: esto
    no es un simulador, y un niño no debería perder por pasar a 20 px. */
export const HITO_R = 140;
/** Lo ancho que es la pista. Fuera de aquí hay tope y no se pasa. */
export const ANCHO_PISTA = 190;
/** Cuántas cajas de ítem hay repartidas por el circuito. */
export const CAJAS_EN_PISTA = 10;

/* ---- lo brava que es una carrera ----

   En fácil no hay muro en el borde de la pista: te sales y vuelves. Lo que
   impide entonces cortar por el césped en cada curva no es un tope sino la
   hierba, que te deja al 70 % — salirse pasa a ser una torpeza que perdona en
   vez de un choque que frustra. Y no se puede atajar el circuito entero
   quitando el muro: los puntos de paso hay que pisarlos EN ORDEN, uno a uno.

   `rivales` es lo que más se nota, y solo sabe FRENAR: multiplica lo que el bot
   pide moverse, y el motor normaliza todo vector de módulo mayor que 1, así que
   pedir 1,06 se queda en 1,00 —medido, difícil no corría más que normal—. Por
   eso la escala llega hasta 1 y es normal el que baja un punto: estaba medido
   que los bots le sacaban dos vueltas a un jugador en red, y ese punto es
   justamente la latencia y la torpeza de quien juega con las manos.

   `traza` es cuánto mira más allá del punto de paso siguiente, para cortar la
   curva en vez de ir de baliza en baliza. Medido barriendo el parámetro en
   cuatro mapas, el óptimo está en 0,20 y de ahí para ARRIBA empeora: mirando
   demasiado lejos apunta fuera de la curva y acaba rozando el tope, que le
   quita la velocidad. Así que difícil corre en el punto óptimo y a fácil se le
   desvía a un trazado peor — al revés de lo que parecía. */
export type Dificultad = "facil" | "normal" | "dificil";

export const DIFICULTADES: Record<Dificultad, {
  label: string; icon: string; desc: string;
  /** ¿hay muro en el borde de la pista? */
  topes: boolean;
  /** cuánto te frena el césped cuando no hay muro */
  fuera: number;
  /** lo rápido que van los rivales, sobre tu velocidad */
  rivales: number;
  /** hasta cuánto miran hacia delante para cortar la curva */
  traza: number;
  /** cuántas cajas de ? hay repartidas */
  cajas: number;
}> = {
  facil:   { label:"Fácil",   icon:"🐣", desc:"Sin topes: te sales y vuelves. Los otros van más despacio y hay potenciadores de sobra.",
             topes:false, fuera:0.70, rivales:0.80, traza:0.36, cajas:14 },
  normal:  { label:"Normal",  icon:"🏁", desc:"Topes en la pista y los otros corren como tú.",
             topes:true,  fuera:1,    rivales:0.94, traza:0.27, cajas:10 },
  dificil: { label:"Difícil", icon:"🔥", desc:"Los otros corren más que tú y trazan mejor las curvas. Y hay menos potenciadores que repartir.",
             topes:true,  fuera:1,    rivales:1,    traza:0.20, cajas:6 },
};

/** Lo que toca en esta partida. Fuera de carrera no pinta nada, pero se
    devuelve `normal` para no tener que preguntar por el modo en cada sitio. */
export const dificultadDe = (r: { dificultad?: Dificultad }) =>
  DIFICULTADES[r.dificultad ?? "normal"] ?? DIFICULTADES.normal;
/** Lo que tarda una caja en volver después de que se la lleven. */
export const CAJA_VUELVE = 6;
/** Lo que gira la ruleta de la caja antes de pararse en algo. */
export const CAJA_GIRA = 1.1;

/* ---- potenciadores ----
   Cuatro que salen en todas partes, y uno propio de cada escenario: el efecto
   se repite pero el objeto es del sitio, que es lo que hace que correr en el
   Volcán no se sienta igual que correr en la Luna. */
export interface Potenciador {
  id: string; icon: string; nombre: string;
  efecto: "turbo" | "escudo" | "fantasma" | "cascara" | "rayo";
}

export const POTENCIADORES: Potenciador[] = [
  { id:"turbo",    icon:"🥤", nombre:"Refresco",  efecto:"turbo" },
  { id:"escudo",   icon:"☂️", nombre:"Paraguas",  efecto:"escudo" },
  { id:"fantasma", icon:"👻", nombre:"Capa",      efecto:"fantasma" },
  { id:"cascara",  icon:"🍌", nombre:"Cáscara",   efecto:"cascara" },
];

/** El objeto propio de cada nivel. Sale menos que los otros: es el bueno. */
export const ESPECIAL_NIVEL: Record<string, Potenciador> = {
  barrio:      { id:"chancletazo", icon:"🩴", nombre:"Chancletazo de mamá", efecto:"rayo" },
  colegio:     { id:"timbre",      icon:"🔔", nombre:"Timbre del recreo",   efecto:"rayo" },
  playa:       { id:"ola",         icon:"🌊", nombre:"Ola",                 efecto:"rayo" },
  desierto:    { id:"espejismo",   icon:"🌵", nombre:"Espejismo",           efecto:"fantasma" },
  machupicchu: { id:"neblina",     icon:"🌫️", nombre:"Neblina de la ceja",  efecto:"fantasma" },
  nuevayork:   { id:"taxi",        icon:"🚕", nombre:"Taxi amarillo",       efecto:"turbo" },
  egipto:      { id:"momia",       icon:"🧟", nombre:"Maldición de la momia", efecto:"rayo" },
  amazonas:    { id:"caiman",      icon:"🐊", nombre:"Caimán",              efecto:"rayo" },
  pista:       { id:"acelerador",  icon:"⚡", nombre:"Acelerador naranja",   efecto:"turbo" },
  tablero:     { id:"dado",        icon:"🎲", nombre:"Dado de la suerte",   efecto:"turbo" },
  mirador:     { id:"vapor",       icon:"💨", nombre:"Chorro de vapor",     efecto:"turbo" },
  circuito:    { id:"seta",        icon:"🍄", nombre:"Súper seta",          efecto:"turbo" },
  costaverde:  { id:"parapente",   icon:"🪂", nombre:"Parapente",           efecto:"fantasma" },
  prehistoria: { id:"meteorito",   icon:"☄️", nombre:"Meteorito",           efecto:"rayo" },
  volcan:      { id:"erupcion",    icon:"🌋", nombre:"Erupción",            efecto:"rayo" },
  luna:        { id:"gravedad",    icon:"🌕", nombre:"Gravedad cero",       efecto:"fantasma" },
};

/** Todo lo que puede tocarte en este escenario. */
export const potenciadoresDe = (escId: string): Potenciador[] => {
  const propio = ESPECIAL_NIVEL[escId];
  return propio ? [...POTENCIADORES, propio] : POTENCIADORES;
};
export const potenciadorPorId = (id: string): Potenciador | undefined =>
  POTENCIADORES.find(p => p.id === id) ||
  Object.values(ESPECIAL_NIVEL).find(p => p.id === id);

/* ---- el vocabulario de una pista ----
   Inspirado en los circuitos del Top Gear de Super Nintendo, que es lo que
   hace que una vuelta se recuerde: rectas largas donde te lanzas, horquillas
   donde hay que frenar de verdad, y chicanas que te descolocan. Un óvalo se
   corre igual con los ojos cerrados.

   Cada trazado se dibuja una sola vez en un cuadrado de -1 a 1 y luego se
   estira al escenario. Así los seis trazados sirven para los dieciséis sitios
   sin repetir sensación, y cambiar uno los cambia a todos los que lo usan. */
type P = [number, number];

const recta = (a: P, b: P, n: number): P[] =>
  Array.from({ length: n }, (_, i) =>
    [a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)] as P);

const arco = (cx: number, cy: number, rx: number, ry: number,
              a0: number, a1: number, n: number): P[] =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + (a1 - a0) * (i / n);
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P;
  });

const TAU = Math.PI * 2;

/** Una recta que serpentea. Es la forma honesta de alargar una vuelta: mete
    curvas sin acercar tramos lejanos del circuito, que es la trampa de las
    pistas largas — si dos partes se rozan, sus corredores se funden y se puede
    saltar de una a otra. */
function onda(a: P, b: P, prof: number, ciclos: number, n: number): P[] {
  const [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  /* Termina EXACTAMENTE en `b` (por eso `n - 1` y `ciclos` entero: seno cero
     en los dos extremos). Con `i / n` el último punto quedaba desviado a un
     lado y al empalmar con la curva siguiente salía un pico: la pista se
     doblaba sobre sí misma y los bots se clavaban ahí para siempre. */
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1), s = Math.sin(f * Math.PI * ciclos) * prof;
    return [ax + dx * f + nx * s, ay + dy * f + ny * s] as P;
  });
}

/** Clip: dos rectas larguísimas —serpenteadas— y una horquilla en cada punta.
    La vuelta más rápida y la que más castiga frenar tarde. */
const HORQUILLA: P[] = [
  ...onda([-0.52, -0.58], [0.52, -0.58], 0.36, 5, 19),
  ...arco(0.52, 0, 0.44, 0.90, -Math.PI / 2, Math.PI / 2, 12),
  ...onda([0.52, 0.58], [-0.52, 0.58], 0.36, 5, 19),
  ...arco(-0.52, 0, 0.44, 0.90, Math.PI / 2, Math.PI * 1.5, 12),
];

/** Riñón: un anillo con siete panzas hundidas. Se entra largo y se sale corto
    siete veces por vuelta, que es donde se adelanta. */
const RINON: P[] = Array.from({ length: 112 }, (_, i) => {
  const a = (i / 112) * TAU, hueco = 0.5 + 0.5 * Math.cos(a * 7);
  return [Math.cos(a) * (1 - 0.50 * hueco) * 0.97,
          Math.sin(a) * (1 - 0.46 * hueco) * 0.94] as P;
});

/** Chicana: las dos rectas hechas eses, y curvones anchos a los lados. */
const CHICANA: P[] = [
  ...onda([-0.56, -0.56], [0.50, -0.56], 0.34, 5, 19),
  ...arco(0.50, 0, 0.46, 0.90, -Math.PI / 2, Math.PI / 2, 12),
  ...onda([0.50, 0.56], [-0.56, 0.56], 0.34, 5, 19),
  ...arco(-0.56, 0, 0.40, 0.90, Math.PI / 2, Math.PI * 1.5, 12),
];

/** Herradura: un curvón enorme y la vuelta serpenteando. */
/* Las ondas empiezan y acaban justo donde acaba y empieza cada arco: si no,
   el empalme deja un vértice y la pista se muerde la cola. */
const HERRADURA: P[] = [
  ...arco(0.10, 0, 0.88, 0.90, -Math.PI * 0.42, Math.PI * 0.42, 16),
  ...onda([0.456, 0.823], [-0.70, 0.44], 0.20, 6, 15),
  ...arco(-0.62, 0.02, 0.30, 0.44, Math.PI * 0.62, Math.PI * 1.38, 7),
  ...onda([-0.70, -0.44], [0.3185, -0.8718], 0.20, 6, 15),
];

/** Trébol: se cruza consigo mismo en el medio. El cruce es donde se arma.

    Que las dos ramas se toquen ahí no deja colar atajos: los puntos de paso se
    cuentan EN ORDEN y los de la otra rama caen lejísimos en la cuenta, así que
    para tocarlos hay que ir y recorrerla. */
const TREBOL: P[] = Array.from({ length: 16 }, (_, i) => {
  const t = ((i + 0.5) / 16) * TAU;
  return [Math.sin(t) * 0.96, Math.sin(t * 2) * 0.86] as P;
});

/** Zigzag: manzanas de ciudad. Seis dientes y esquinas de noventa grados. */
const ZIGZAG: P[] = [
  [-0.88, -0.88],
  ...[-0.60, -0.10, 0.40].flatMap(x =>
    [[x, -0.88], [x, -0.36], [x + 0.20, -0.36], [x + 0.20, -0.88]] as P[]),
  [0.88, -0.88], [0.88, 0.88],
  ...[0.60, 0.10, -0.40].flatMap(x =>
    [[x, 0.88], [x, 0.36], [x - 0.20, 0.36], [x - 0.20, 0.88]] as P[]),
  [-0.88, 0.88],
];

/** Cada cuántos px de pista va un punto de paso.

    320 y no menos: por debajo, en las curvas cerradas dos puntos SEGUIDOS
    quedan a menos de HITO_R en línea recta y se pueden picar los dos desde el
    mismo sitio, saltándose un trozo de pista. Medido en los seis trazados. */
const PASO_HITO = 320;
/** Y nunca más cerca que esto en línea recta, pase lo que pase con la curva. */
const MIN_ENTRE_HITOS = 185;

/** Reparte los puntos de paso a distancia constante a lo largo del recorrido.

    Con paso exacto (`largo / cuantos`) para que el tramo que cierra la vuelta
    mida lo mismo que los demás; repartiendo "cada 320 px a ojo", el último
    salía corto y era justo el que se quedaba por debajo del radio de paso. */
function repartir(pts: [number, number][]): [number, number][] {
  const entre = (a: [number, number], b: [number, number]) =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = pts.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += entre(pts[i], pts[(i + 1) % n]);
  const cuantos = Math.max(8, Math.round(total / PASO_HITO));
  const paso = total / cuantos;
  const out: [number, number][] = [];
  let t = 0, acum = 0;
  for (let i = 0; i < n && out.length < cuantos; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const d = entre(a, b);
    while (t < acum + d && out.length < cuantos) {
      const f = (t - acum) / d;
      out.push([Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f)]);
      t += paso;
    }
    acum += d;
  }

  /* Y una pasada quitando los que quedaron demasiado juntos EN LÍNEA RECTA.
     Repartir por distancia recorrida no basta: en una curva cerrada, dos
     puntos separados 320 px de asfalto pueden quedar a 130 en línea recta, y
     entonces se pican los dos desde el mismo sitio y te saltas la curva.
     Quitar uno solo alarga ese hueco; no rompe nada. */
  const limpio: [number, number][] = [];
  for (const q of out) {
    const ult = limpio[limpio.length - 1];
    if (ult && entre(ult, q) < MIN_ENTRE_HITOS) continue;
    limpio.push(q);
  }
  while (limpio.length > 8 && entre(limpio[limpio.length - 1], limpio[0]) < MIN_ENTRE_HITOS)
    limpio.pop();
  return limpio;
}

/** Estira un trazado al sitio. `alReves` le da media vuelta, para que la meta
    y las curvas no caigan siempre en el mismo lado del mapa.

    Media vuelta y no un cuarto: el mundo es mucho más ancho que alto (2600 ×
    1700), así que girar 90° aplastaría la pista contra el lado corto — una
    recta de 330 px se quedaba en 124, más cerca que el radio de paso, y la
    vuelta se daba sin correrla. */
function trazar(base: P[], cx: number, cy: number, w: number, h: number, alReves = false):
    [number, number][] {
  const k = alReves ? -1 : 1;
  return repartir(base.map(([nx, ny]) =>
    [Math.round(cx + nx * k * w / 2), Math.round(cy + ny * k * h / 2)] as [number, number]));
}

/* ---- dónde va cada cosa, en fracciones del mundo ----

   Antes esto eran ~70 números absolutos calibrados a mano para un mundo de
   2600 × 1700: las casas, los patios, la caja de cada circuito, el mar y el
   puente. Cambiar el tamaño del mapa obligaba a recalcularlos todos, y por eso
   no se cambiaba nunca.

   Ahora se guarda la FRACCIÓN y el número sale de `WORLD_W`/`WORLD_H`. Agrandar
   el mundo vuelve a ser lo que parecía: cambiar dos números.

   `sitio(fx, fy)` coloca una base de 380 × 330: 0 la pega al borde de arriba o
   de la izquierda y 1 al de abajo o de la derecha, dejando siempre el margen.
   `ancho`/`alto` son fracciones sueltas del mapa, para el mar y las cajas de
   circuito. Los decimales salen de convertir las coordenadas viejas, así que
   con el mundo de siempre el reparto es el de siempre (hay prueba). */
const BASE_W = 380, BASE_H = 330;

/* La pasarela crece con el mapa, pero a la mitad de su ritmo: proporcional se
   comía el centro entero, y fija se quedaba en una pista de baile perdida en un
   descampado. Con esto ocupa el 41 % del ancho (antes el 48 %), y el sitio que
   sobra alrededor es justo donde caben las casas nuevas. */
export const OCHO_A = Math.round(WORLD_W * 0.206), OCHO_B = Math.round(WORLD_H * 0.32);
const MARGEN = 70, MARGEN_ARRIBA = 80;

export const ancho = (f: number) => Math.round(WORLD_W * f);
export const alto  = (f: number) => Math.round(WORLD_H * f);
export const medioX = () => Math.round(WORLD_W / 2);

function sitio(fx: number, fy: number): [number, number] {
  return [
    Math.round(MARGEN + fx * (WORLD_W - 2 * MARGEN - BASE_W)),
    Math.round(MARGEN_ARRIBA + fy * (WORLD_H - MARGEN_ARRIBA - MARGEN - BASE_H)),
  ];
}

/** Cuántas casas de vecino y cuántos patios hay en cada mapa. */
export const CASAS_POR_MAPA = 6, PATIOS_POR_MAPA = 5;

/* Los sitios escritos a mano en cada escenario son su carácter: en Nueva York
   las casas van arriba en fila, en el colegio pegadas a la izquierda. Con el
   mapa grande caben más de los que hay escritos, así que los que faltan se
   acomodan solos en los huecos del borde, que es donde no estorban.

   Determinista: recorre los mismos candidatos en el mismo orden siempre. */
function acomodar(puestos: [number, number][], cuantos: number): [number, number][] {
  const { cx, cy } = { cx: WORLD_W / 2, cy: WORLD_H / 2 };
  const HOLGURA = 60;
  const cabe = (p: [number, number]) => {
    for (const q of puestos)
      if (Math.abs(p[0] - q[0]) < BASE_W + HOLGURA && Math.abs(p[1] - q[1]) < BASE_H + HOLGURA)
        return false;
    /* Ni encima de la pasarela: se mira la caja del ocho con holgura, que aquí
       sí vale — no hace falta hilar fino, sobra sitio en los bordes. */
    if (p[0] < cx + OCHO_A + HOLGURA && p[0] + BASE_W > cx - OCHO_A - HOLGURA &&
        p[1] < cy + OCHO_B / 2 + HOLGURA && p[1] + BASE_H > cy - OCHO_B / 2 - HOLGURA)
      return false;
    /* Ni en la columna del centro, que es por donde el desfile baja del portal
       de arriba y sale por el de abajo. La caja del ocho no la cubre: son dos
       rectas verticales que van de borde a borde. */
    return !(p[0] < cx + 90 && p[0] + BASE_W > cx - 90);
  };
  /* Por los cuatro bordes, de fuera hacia dentro. */
  const candidatos: [number, number][] = [];
  for (const fy of [0, 0.5, 0.25, 0.75, 1]) for (const fx of [0, 1])
    candidatos.push(sitio(fx, fy));
  for (const fx of [0.5, 0.25, 0.75]) for (const fy of [0, 1])
    candidatos.push(sitio(fx, fy));
  const nuevos: [number, number][] = [];
  for (const c of candidatos) {
    if (nuevos.length >= cuantos) break;
    if (!cabe(c)) continue;
    puestos.push(c); nuevos.push(c);
  }
  return nuevos;
}

/** Rellena un escenario hasta el cupo de casas y patios del mapa. */
function completar(e: Escenario): Escenario {
  const puestos: [number, number][] = [...e.casas, ...e.patios];
  e.casas = [...e.casas, ...acomodar(puestos, CASAS_POR_MAPA - e.casas.length)];
  e.patios = [...e.patios, ...acomodar(puestos, PATIOS_POR_MAPA - e.patios.length)];
  return e;
}

export const ESCENARIOS: Escenario[] = ([
  { id:"barrio",   nombre:"El Barrio",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(1,0.508),sitio(1,0.992)],
    patios:[sitio(0,0.992),sitio(0.216,0.992),sitio(0,0.672)],
    circuito: trazar(CHICANA, medioX(), alto(0.5), ancho(0.885), alto(0.8)) },
  { id:"colegio",  nombre:"Sta. Teresita",
    casas:[sitio(0,0.008),sitio(0.236,0.008),sitio(0,0.475),sitio(0,0.992)],
    patios:[sitio(1,0.992),sitio(0.784,0.992),sitio(1,0.639)],
    // en el colegio se corre alrededor de la cancha, en rectángulo
    circuito: trazar(ZIGZAG, medioX(), alto(0.5), ancho(0.885), alto(0.8)) },
  { id:"playa",    nombre:"La Playa",
    casas:[sitio(1,0.008),sitio(1,0.443),sitio(1,0.836),sitio(0.236,0.836)],
    patios:[sitio(0,0.008),sitio(0,0.303),sitio(0,0.598)],
    mar: alto(0.876),
    // pegado a la orilla pero sin meterse: en la arena mojada se corre mejor
    // la herradura, con la caja recortada por el mar, se quedaba corta
    circuito: trazar(HORQUILLA, medioX(), alto(0.438), ancho(0.885), alto(0.729)) },
  { id:"desierto", nombre:"El Desierto",
    // la cuarta rozaba el lóbulo derecho de la pasarela: apartada a la derecha
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(1,0.992),sitio(0.87,0.508)],
    patios:[sitio(0,0.992),sitio(0,0.672),sitio(0,0.352)],
    circuito: trazar(RINON, medioX(), alto(0.5), ancho(0.885), alto(0.8)) },

  /* Los cuatro de viaje. Mismo reparto de siempre —un patio, cuatro casas y
     los dos comprables al lado— porque las reglas no cambian con el sitio. */
  { id:"machupicchu", nombre:"Machu Picchu",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(1,0.508),sitio(1,0.992)],
    patios:[sitio(0,0.992),sitio(0.216,0.992),sitio(0,0.672)],
    // el circuito sigue los andenes, que ya son bandas horizontales
    circuito: trazar(HORQUILLA, medioX(), alto(0.5), ancho(0.885), alto(0.8)) },
  /* Nueva York se reparte a propósito: las casas arriba, los patios a la
     izquierda, Central Park ocupando toda la derecha y el puerto abajo. El
     puente de Brooklyn es el único paso a pie sobre el agua. */
  { id:"nuevayork",   nombre:"Nueva York",
    casas:[sitio(0,0),sitio(0.236,0),sitio(0.745,0),sitio(0.99,0)],
    patios:[sitio(0,0.377),sitio(0,0.68),sitio(0.197,0.803)],
    mar: alto(0.841),
    puente: { x: ancho(0.723), w: ancho(0.131) },
    // por las cuadras, y sin bajar al puerto: el puente es de a pie
    circuito: trazar(ZIGZAG, medioX(), alto(0.421), ancho(0.885), alto(0.694)) },
  { id:"egipto",      nombre:"Egipto",
    casas:[sitio(1,0.008),sitio(1,0.508),sitio(1,0.992),sitio(0,0.008)],
    patios:[sitio(0,0.992),sitio(0.216,0.992),sitio(0,0.656)],
    circuito: trazar(HERRADURA, medioX(), alto(0.5), ancho(0.885), alto(0.8), true) },
  { id:"amazonas",    nombre:"El Amazonas",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(0.236,0.008),sitio(1,0.443)],
    patios:[sitio(0,0.852),sitio(0.216,0.852),sitio(0,0.557)],
    // el río corre por el sur: sin balsa te frena en la ribera
    mar: alto(0.859),
    // la pista se queda en tierra firme, al norte del río
    // el riñón en una caja baja se queda corto: la chicana cunde más
    circuito: trazar(CHICANA, medioX(), alto(0.421), ancho(0.885), alto(0.694), true) },

  /* Los cuatro de juguete: el suelo del cuarto convertido en cuadra. El
     reparto es el de siempre —cuatro casas, un patio y los dos comprables al
     lado— porque el sitio cambia el decorado, no las reglas. */
  { id:"pista",    nombre:"Hot Wheels",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(1,0.508),sitio(1,0.992)],
    patios:[sitio(0,0.992),sitio(0.216,0.992),sitio(0,0.672)],
    // la pista de plástico ya era un circuito: solo faltaba decirlo
    circuito: trazar(HORQUILLA, medioX(), alto(0.5), ancho(0.885), alto(0.8), true) },
  { id:"tablero",  nombre:"Monopoly",
    casas:[sitio(0,0.008),sitio(0.236,0.008),sitio(0.745,0.008),sitio(0.99,0.008)],
    patios:[sitio(0,0.992),sitio(0.216,0.992),sitio(0,0.672)],
    // por el anillo de casillas: el tablero ya era una pista, con sus esquinas
    circuito: trazar(ZIGZAG, medioX(), alto(0.5), ancho(0.885), alto(0.8), true) },
  /* En el Mirador las casas van todas a la derecha y arriba: la esquina
     noroeste se deja libre a propósito para que quepa la montaña. */
  { id:"mirador",  nombre:"Thomas y el Mirador",
    casas:[sitio(1,0.008),sitio(1,0.508),sitio(1,0.992),sitio(0.745,0.008)],
    patios:[sitio(0,0.992),sitio(0.216,0.992),sitio(0,0.656)],
    circuito: trazar(TREBOL, medioX(), alto(0.5), ancho(0.885), alto(0.8), true) },
  { id:"circuito", nombre:"Mario Kart",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(0.236,0.008),sitio(1,0.443)],
    patios:[sitio(0,0.852),sitio(0.216,0.852),sitio(0,0.557)],
    circuito: trazar(CHICANA, medioX(), alto(0.5), ancho(0.885), alto(0.8), true) },

  /* ---- los cuatro de correr ----
     Nacieron como circuitos: el reparto de casas es el de siempre porque en
     aventura también se juegan, pero la forma del sitio la manda la pista. */
  { id:"costaverde", nombre:"La Costa Verde",
    casas:[sitio(0,0),sitio(0.236,0),sitio(0.745,0),sitio(0.99,0)],
    patios:[sitio(0,0.361),sitio(0.15,0.361),sitio(0,0.656)],
    // el mar al sur; el acantilado y la pista van pegados a la orilla
    mar: alto(0.871),
    circuito: trazar(HORQUILLA, medioX(), alto(0.426), ancho(0.885), alto(0.718)) },
  { id:"prehistoria", nombre:"La Prehistoria",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(1,0.992),sitio(0,0.992)],
    // el de en medio arriba estaba justo donde baja el desfile del portal
    patios:[sitio(0.236,0.008),sitio(0,0.5),sitio(0.236,0.992)],
    // las líneas son la pista: por eso se corre en ocho, cruzando por el medio
    circuito: trazar(TREBOL, medioX(), alto(0.5), ancho(0.885), alto(0.8)) },
  { id:"volcan",     nombre:"El Volcán",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(1,0.992),sitio(0.236,0.992)],
    patios:[sitio(0,0.992),sitio(0,0.656),sitio(0,0.328)],
    circuito: trazar(RINON, medioX(), alto(0.5), ancho(0.885), alto(0.8), true) },
  { id:"luna",       nombre:"La Luna",
    casas:[sitio(0,0.008),sitio(1,0.008),sitio(1,0.508),sitio(1,0.992)],
    patios:[sitio(0,0.992),sitio(0.216,0.992),sitio(0,0.672)],
    circuito: trazar(HERRADURA, medioX(), alto(0.5), ancho(0.885), alto(0.8)) },
]).map(completar);

/** Los escenarios donde se puede correr, para el selector del lobby. */
export const CIRCUITOS = ESCENARIOS.filter(e => e.circuito);

export const varMult = (v: string | null) =>
  (v && (VARIANTES as any)[v] ? (VARIANTES as any)[v].mult : 1) as number;
export const varLabel = (v: string | null) =>
  (v && (VARIANTES as any)[v] ? (VARIANTES as any)[v].icon + " " + (VARIANTES as any)[v].label : "");
export const florNombre = (f: { flor: number }) => FLORES[(f.flor | 0) % FLORES.length].nombre;
