/* La cuenta en la nube: lo único del cliente que habla con la API.

   Regla de esta capa: el juego funciona igual sin ella. Si no hay servidor, si
   se cayó o si nadie inició sesión, todo sigue en localStorage como siempre y
   nadie se entera. Por eso acá casi nada tira excepción hacia afuera: se
   devuelve null y el juego sigue. Lo único que sí avisa de sus errores es lo
   que el jugador pidió a mano (entrar, registrarse), porque ahí sí espera una
   respuesta. */

const BASE = (import.meta.env?.VITE_API || "http://localhost:5181").replace(/\/$/, "");
const LLAVE = "florin_sesion";

let sesion = null;      // { accessToken, refreshToken, apodo, email }
try { sesion = JSON.parse(localStorage.getItem(LLAVE) || "null"); } catch (_){}

const oyentes = new Set();
const avisar = () => { for (const fn of oyentes) { try { fn(sesion); } catch (_){} } };

function guardarSesion(s){
  sesion = s;
  try {
    if (s) localStorage.setItem(LLAVE, JSON.stringify(s));
    else localStorage.removeItem(LLAVE);
  } catch (_){}
  avisar();
}

/** Lo que devuelve la API al entrar, aplanado a lo que nos importa. */
const desdeAuth = r => ({
  accessToken: r.accessToken, refreshToken: r.refreshToken,
  apodo: r.user?.apodo || "", email: r.user?.email || "",
});

class ErrorApi extends Error {
  constructor(mensaje, status){ super(mensaje); this.status = status; }
}

/** Saca el mensaje legible de un error de la API (los de validación traen detalle). */
async function mensajeDe(res){
  try {
    const j = await res.json();
    if (j.errors) return Object.values(j.errors).flat().join(" ");
    if (j.title) return j.title;
  } catch (_){}
  return res.status === 401 ? "Correo o contraseña que no son."
       : "No se pudo conectar con el servidor.";
}

/* ---- tregua cuando no hay servidor ----
   Si el servidor no está, no tiene sentido intentarlo cada 15 segundos: cada
   intento es un error rojo en la consola y una espera. Tras un fallo de red se
   deja de molestar por un rato; lo que el jugador pide a mano (entrar) siempre
   reintenta, porque ahí sí quiere saber. */
const TREGUA = 60_000;
let calladoHasta = 0;
export const hayServidor = () => Date.now() >= calladoHasta;

async function crudo(ruta, { metodo = "GET", cuerpo, token } = {}){
  let res;
  try {
    res = await fetch(BASE + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (_){
    calladoHasta = Date.now() + TREGUA;
    avisar();
    throw new ErrorApi("No se pudo conectar con el servidor.", 0);
  }
  calladoHasta = 0;                        // contestó: volvemos a confiar
  if (!res.ok) throw new ErrorApi(await mensajeDe(res), res.status);
  return res.status === 204 ? null : res.json();
}

/* ---- renovar el token ----
   Una sola renovación a la vez: si tres llamadas se topan con un 401 al mismo
   tiempo, las tres esperan la misma promesa en vez de gastar tres refresh (y el
   refresh rota, así que dos en paralelo se pisarían y perderíamos la sesión). */
let renovando = null;

function renovar(){
  if (renovando) return renovando;
  renovando = (async () => {
    try {
      const r = await crudo("/api/v1/auth/refresh", {
        metodo: "POST", cuerpo: { refreshToken: sesion.refreshToken },
      });
      guardarSesion({ ...desdeAuth(r), apodo: r.user?.apodo || sesion.apodo });
      return true;
    } catch (_){
      guardarSesion(null);          // el refresh venció: a entrar de nuevo
      return false;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

/** Llamada con sesión. Devuelve null si no hay cuenta o si el servidor no está. */
async function conSesion(ruta, opciones = {}){
  if (!sesion || !hayServidor()) return null;
  try {
    return await crudo(ruta, { ...opciones, token: sesion.accessToken });
  } catch (e){
    if (e.status !== 401) return null;                    // servidor caído: ni modo
    if (!(await renovar())) return null;
    try { return await crudo(ruta, { ...opciones, token: sesion.accessToken }); }
    catch (_){ return null; }
  }
}

/* ============================================================
   Lo que usa el juego
   ============================================================ */
export const nube = {
  get jugador(){ return sesion ? { apodo: sesion.apodo, email: sesion.email } : null; },
  get hayCuenta(){ return !!sesion; },
  /** El servidor no contestó hace poco: lo que juegues ahora solo queda aquí. */
  get desconectado(){ return !hayServidor(); },

  /** Para que la portada y el HUD se enteren de que alguien entró o salió. */
  alCambiar(fn){ oyentes.add(fn); fn(sesion); return () => oyentes.delete(fn); },

  async registro(email, password, apodo){
    guardarSesion(desdeAuth(await crudo("/api/v1/auth/registro", {
      metodo: "POST", cuerpo: { email, password, apodo },
    })));
  },

  async entrar(email, password){
    guardarSesion(desdeAuth(await crudo("/api/v1/auth/login", {
      metodo: "POST", cuerpo: { email, password },
    })));
  },

  salir(){ guardarSesion(null); },

  /** Las láminas que este jugador tiene en la nube: ["3:base", "6:arcoiris"…]. */
  async traerAlbum(){
    const filas = await conSesion("/api/v1/album");
    return filas ? filas.map(f => f.tier + ":" + f.variante) : null;
  },

  registrarEnAlbum(tier, variante){
    return conSesion("/api/v1/album", {
      metodo: "POST", cuerpo: { tier, variante: variante || "base" },
    });
  },

  guardarPartida(datos){
    return conSesion("/api/v1/partida", { metodo: "PUT", cuerpo: datos });
  },

  cargarPartida(){ return conSesion("/api/v1/partida"); },

  guardarPreferencias(apodo, escenarioPreferido, zurdo){
    return conSesion("/api/v1/perfil", {
      metodo: "PUT", cuerpo: { apodo, escenarioPreferido, zurdo },
    });
  },

  perfil(){ return conSesion("/api/v1/perfil"); },

  /** El ranking se ve sin cuenta: es el gancho para que alguien se haga una. */
  async ranking(){
    try { return (await crudo("/api/v1/perfil/ranking?pageSize=10")).items; }
    catch (_){ return null; }
  },
};
