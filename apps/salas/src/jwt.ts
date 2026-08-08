/* Quién eres, según el token que ya emite la API.

   La sala no tiene usuarios propios ni base de datos: solo comprueba la firma
   del mismo JWT que usa el juego para el álbum. Comparte el secreto con la API
   por variable de entorno; si no, no arranca — una sala que acepta a cualquiera
   que diga llamarse Pepito no sirve de nada cuando lo que está en juego es el
   álbum de alguien. */

import { jwtVerify } from "jose";

export interface Quien { userId: string; apodo: string }

export interface AjustesJwt { secret: string; issuer: string; audience: string }

export function ajustesDelEntorno(): AjustesJwt {
  const secret = process.env.Jwt__Secret || process.env.JWT_SECRET || "";
  if (secret.length < 32) {
    throw new Error(
      "Falta Jwt__Secret o es demasiado corto (mínimo 32). Es el MISMO secreto " +
      "que usa la API: si no coinciden, ningún token de un jugador valdrá aquí.",
    );
  }
  return {
    secret,
    issuer: process.env.Jwt__Issuer || "florin",
    audience: process.env.Jwt__Audience || "florin",
  };
}

/** Devuelve quién es, o null si el token no vale. Nunca lanza. */
export async function quienEs(token: string | undefined, aj: AjustesJwt): Promise<Quien | null> {
  if (!token) return null;
  try {
    const clave = new TextEncoder().encode(aj.secret);
    const { payload } = await jwtVerify(token, clave, {
      issuer: aj.issuer,
      audience: aj.audience,
      algorithms: ["HS256"],
    });
    const userId = String(payload.sub || "");
    if (!userId) return null;
    return { userId, apodo: String(payload.name || "Jugador") };
  } catch {
    return null;
  }
}
