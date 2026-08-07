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

## Qué falta para la red

Ahora mismo el estado usa **referencias entre objetos** (`ladron.victim` apunta a
una base, `p.patios` contiene bases). Va perfecto en memoria, pero no se
serializa tal cual. Antes de mandar estado por la red hay que pasar esas
referencias a **ids**. Es el siguiente paso natural, y está acotado a `tipos.ts`
y a los pocos sitios que comparan con `===`.

## Comandos

```bash
npm test --workspace @florin/engine        # 26 pruebas
npm run typecheck --workspace @florin/engine
```
