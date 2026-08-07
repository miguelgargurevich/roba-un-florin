# @florin/engine

La simulación de *Roba un Florín*, sin navegador.

Aquí **no entra** nada del DOM: ni canvas, ni audio, ni `localStorage`, ni
`Math.random`. Hay una prueba que lo verifica sobre el propio código fuente.

## Por qué existe

El prototipo (`index.html` en la raíz) mezcla reglas y dibujo en un solo archivo.
Eso funciona para un juego local, pero impide dos cosas que el proyecto necesita:

- **Probar el juego sin abrir una ventana.** Ahora se corre a 60 fps en Node.
- **Que el servidor sea la autoridad.** Si el cliente decide cuánto dinero
  tienes, cualquiera se pone un millón desde la consola. Con la simulación
  extraída, el servidor puede correr exactamente el mismo código.

## Uso

```ts
import { crearPartida, avanzar, idsDeArmas } from "@florin/engine";

const e = crearPartida({ modo: 1, escenario: "barrio", semilla: 7, armas: idsDeArmas() });

avanzar(e, { 0: { mover: { x: 1, y: 0 }, apunta: null } }, 1 / 60);

for (const ev of e.eventos) {
  // "texto" y "polvo" → partículas · "sonido" → audio
  // "album" → progreso guardado · "hito" / "fin" → estado de la partida
}
```

`e.eventos` se vacía en cada tick: es el único canal del motor hacia fuera.

## Determinismo

Misma semilla + mismas entradas = misma partida, en cualquier máquina. El azar
vive en `e.rngEstado` (mulberry32), no en `Math.random`. Es lo que permitirá
comparar la simulación del cliente con la del servidor.

## El estado viaja por la red

El estado guarda **ids, no referencias**: `ladron.victimId`, `jugador.patios` con
ids de base, `base.owner` con el idx del jugador. Por eso `JSON.stringify(estado)`
funciona y una partida reanudada desde JSON continúa exactamente igual — hay una
prueba de cada cosa.

Para traducir id → objeto están `baseDe`, `jugadorDe`, `pedDe`, `patiosDe` y
`objetivoDe`. Son el único sitio donde se resuelve una referencia.

## Comandos

```bash
npm test --workspace @florin/engine        # 26 pruebas
npm run typecheck --workspace @florin/engine
```
