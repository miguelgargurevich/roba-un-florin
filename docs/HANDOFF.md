# Handoff — Roba un Florín

> Actualizado: 2026-08-07 por claude-code

## Estado actual

Monorepo con workspaces npm:

| Paquete | Qué es |
|---|---|
| `packages/engine` | el juego sin navegador: determinista, JSON serializable, 93 pruebas |
| `apps/web` | el cliente (Vite + canvas 2D). Solo dibuja y escucha teclas |
| `apps/api` | cuentas, álbum y guardado (.NET 9, Clean Arch + CQRS), 32 pruebas |
| `apps/salas` | servidor de salas autoritativo (Node + `ws`), 27 pruebas |

Funciona: un jugador, salas online hasta 5 (modo aventura y versus) con bots
en los asientos libres, 12 escenarios, cuentas con guardado en la nube, álbum
y ranking. Se publica en
GitHub Pages y en el VPS (ver `/opt/florin-api/LEEME.md` en el servidor: es el
runbook de despliegue, con los cuatro contenedores y el rollback).

A medias / sin hacer: el modo cooperativo (aplazado a propósito — una sala en
aventura ya es cooperativa mientras no tenga objetivo y amenaza compartidos).

## Última sesión

- 2026-08-07 (claude-code): bots en los asientos libres de una sala; la Ruleta
  no rodaba (nadie repintaba el panel), ni la Ruleta ni la Armería llegaban al
  servidor en una sala, y soltar el Florín no hacía nada (se recogía solo en el
  acto). Además: `girarRuleta`/`comprarArma` ahora exigen estar dentro en el
  MOTOR y no solo en la interfaz; botón 🏠 para volver al inicio o al lobby; y
  fuera los iconos repetidos de Armería y Ruleta de la barra de arriba.

- 2026-08-07 (claude-code): primera prueba de multijugador con dos clientes
  independientes contra producción (ver decisiones y gotchas). Salieron dos
  fallos: el ritmo de ticks y el despliegue de salas que nunca desplegaba.

- 2026-08-07 (claude-code): cuatro escenarios de juguete (Hot Wheels, Monopoly,
  Thomas y el Mirador, Mario Kart) con cuatro trastos nuevos, y el arreglo del
  reloj de la fauna (ver decisiones).

- 2026-08-07 (claude-code): botón para soltar el Florín que llevas, el jinete
  se ve montado de verdad (sube, se sienta atrás, el animal mueve las patas),
  el paraguas dura 3 minutos, botón flotante sobre el personaje para entrar a
  la Armería y la Ruleta, y una X para cerrar en todos los paneles.

## Próximos pasos

- [ ] **Promover a producción.** Todo lo de esta última tanda —bots, Ruleta,
      soltar, botón de inicio— está en staging (`nuevo.florin.gargurevich.dev`),
      no en `florin.gargurevich.dev`.
- [ ] **¿Los bots son demasiado buenos?** 13 robos en 75 s medidos contra
      producción. Se frenan con `REPENSAR` y con el `PEGADO` de `bot.ts`.
- [ ] **Dos personas de verdad, cada una en su aparato.** Ya hay una prueba con
      dos clientes independientes contra producción (navegador + proceso
      aparte, 220 ms de ida y vuelta): la sala, la lista de gente, el
      movimiento y la caída funcionan. Lo que sigue sin probarse es dos
      personas de carne y hueso, cada una con su teléfono y su red.
- [ ] **Bots también fuera de las salas.** `pensarBot` vive en el motor y lo usa
      la sala; jugando solo en el navegador sigues sin vecinos que jueguen.
      Se pidió "el mínimo si quiero jugar solo con bots".
- [ ] Resolver la pregunta de derechos sobre Invictor / Florín **antes** de
      monetizar nada. Incluye las cuatro marcas de juguete, que ahora salen con
      su nombre en el selector de escenario.
- [ ] Modo cooperativo, si se le encuentra un objetivo compartido que lo haga
      distinto de la aventura.

## Decisiones recientes

- 2026-08-07: el ritmo de ticks se mide, no se supone. `desdeTick` resta el
  intervalo en vez de ponerse a cero; con el reloj a 30 Hz y ticks a 20, poner
  a cero tiraba el sobrante y salían 15. Medido contra producción: 14,2 antes,
  18,8 después.
- 2026-08-07: en la fauna, `ritmo` (reloj de la animación) y `vel`
  (desplazamiento) son dos números distintos. Estaban mezclados y un delfín que
  avanza a 35 px/s agitaba el cuerpo 35 veces por segundo.
- 2026-08-07: los escenarios de juguete llevan los nombres de las marcas —Hot
  Wheels, Monopoly, Thomas y el Mirador, Mario Kart— por decisión explícita del
  dueño del repo, tras plantearle la duda de derechos. Los **ids** siguen siendo
  genéricos (`pista`, `tablero`, `mirador`, `circuito`) porque viajan en las
  partidas guardadas y en las salas: cambiar un nombre no rompe nada, cambiar un
  id sí.
- 2026-08-07: el azar del cliente (`azar2`) es solo para adornos. Gastar el del
  motor desde el navegador desincronizaría una sala.
- 2026-08-05: `escudo` pasó de sí/no a segundos (el paraguas dura 3 minutos).
- 2026-08-04: los hitos se miden por la **vitrina**, no por dinero: entre la
  vitrina más pobre y la más rica hay 174 000× de ingresos y ninguna cifra es
  interesante en los dos extremos.
- 2026-08-03: WebSocket pelado en vez de Colyseus. Lo que aporta Colyseus es su
  sincronización por esquema, y usarla obligaría a mantener el estado dos veces.
- 2026-08-02: la lógica vive en `packages/engine` sin `Math.random` ni `Date`,
  para que el servidor pueda mandar y el guardado en la nube sea el estado tal cual.

## Gotchas

- `window.prueba` (colocar al jugador, darle dinero, cargarle un Florín) existe
  **solo en desarrollo**: va dentro de `if (import.meta.env.DEV)` y Vite lo
  borra del build. Úsalo en vez de andamios de usar y tirar.
- **`docker restart` NO despliega el servidor de salas.** Reinicia el contenedor
  con la imagen con la que se creó: puedes reconstruir la imagen y seguir
  sirviendo el código viejo. Hay que recrear el contenedor —
  `/opt/florin-api/arrancar-salas.sh` en el VPS. El runbook llevaba el comando
  mal y por eso un arreglo se "desplegó" sin cambiar nada (2026-08-08).
- Para probar el multijugador hay que crear cuentas `%@florin.test`: no se puede
  entrar como un usuario de verdad (las contraseñas están hasheadas, y tampoco
  toca). **Bórralas de la base al terminar.**
- **Nunca borres los assets viejos al desplegar.** Llevan hash y se acumulan sin
  pisarse; un navegador con el index anterior en caché necesita su bundle. Sin
  eso, pantalla en blanco cargando para siempre (pasó el 2026-08-08).
- La API y las salas **comparten `Jwt__Secret`**. Si cambia en una, cambia en la
  otra o ningún token sirve para entrar a una sala.
- Los contenedores del VPS están fuera de `/opt/stack/docker-compose.yml` **a
  propósito**: el deploy del stack hace `git reset --hard`.
- `docker builder prune -f` tras cada build no es opcional: el disco ronda el 80 %.
- En `apps/salas`, `tsx` va en `dependencies` (no en `devDependencies`): con
  `NODE_ENV=production` npm se salta las de desarrollo, y `tsx` es lo que
  *arranca* el servidor.
- La imagen de la API necesita `icu-libs`: alpine arranca en modo globalización
  invariante y `new CultureInfo("es")` revienta el contenedor en bucle.
- Postgres local en el **5433**: el 5432 lo tiene `dashboardia-pg-local`.
- Borra las cuentas de prueba `%@florin.test` de la base de producción después
  de probar.
