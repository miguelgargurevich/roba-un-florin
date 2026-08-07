# @florin/web

El cliente. **No tiene reglas de juego**: dibuja, escucha al jugador y traduce lo
que el motor cuenta.

```
apps/web/src/
  puente.js   El único sitio que habla con @florin/engine
  main.js     Dibujo, HUD, entrada — heredado del prototipo, casi sin tocar
```

## Cómo encaja con el motor

- **Entrada**: `entradas()` arma `{ mover, apunta }` por jugador y se lo pasa a
  `avanzar(G, entradas, dt)`. El motor no sabe qué es un teclado.
- **Salida**: `consumirEventos()` convierte `G.eventos` en partículas, sonido y
  progreso del álbum. Las partículas viven aquí, no en el estado del juego.
- **Escenarios**: el motor pone el reparto de casas; `VISUALES` en `puente.js`
  pone el suelo, los colores y el decorado.

## Deuda conocida

`puente.js` repone `G.money`, `G.ammo`, etc. como atajos al jugador 1, porque el
dibujo heredado los usa. Es un puente de compatibilidad y desaparece cuando el
cliente se reescriba por módulos.

`main.js` sigue siendo JavaScript sin tipos. Se movió tal cual a propósito: la
prioridad de esta fase era que el juego se viera y jugara idéntico mientras se
separaba la lógica. El tipado tiene sentido cuando se parta en módulos.

## Comandos

```bash
npm run dev --workspace @florin/web     # http://localhost:5180
npm run build --workspace @florin/web
```
