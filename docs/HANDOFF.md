# Handoff — Roba un Florín

> Actualizado: 2026-08-08 por claude-code

## Estado actual

Monorepo con workspaces npm:

| Paquete | Qué es |
|---|---|
| `packages/engine` | el juego sin navegador: determinista, JSON serializable, 111 pruebas |
| `apps/web` | el cliente (Vite + canvas 2D). Solo dibuja y escucha teclas |
| `apps/api` | cuentas, álbum y guardado (.NET 9, Clean Arch + CQRS), 32 pruebas |
| `apps/salas` | servidor de salas autoritativo (Node + `ws`), 32 pruebas |

Funciona: un jugador, salas online hasta 5 (aventura, versus y carrera) con
bots en los asientos libres, 16 escenarios —todos con circuito—, cuentas con
guardado en la nube, álbum y ranking. Se publica en
GitHub Pages y en el VPS (ver `/opt/florin-api/LEEME.md` en el servidor: es el
runbook de despliegue, con los cuatro contenedores y el rollback).

A medias / sin hacer: el modo cooperativo (aplazado a propósito — una sala en
aventura ya es cooperativa mientras no tenga objetivo y amenaza compartidos).

## Última sesión

- 2026-08-08 (claude-code): **promovido a producción** el mapa grande completo
  (3600x2100, seis vecinos, cuatro patios, dos puestos de cada, dinosaurio, La
  Prehistoria y el desfile por la pasarela). Verificado: bundle sin `localhost`,
  API y salas respondiendo, assets viejos intactos y consola limpia.

- 2026-08-08 (claude-code): **el mapa pasa de 2600x1700 a 3600x2100** (área
  x1,71) y, sobre todo, su tamaño vuelve a ser dos números: el reparto entero
  —casas, patios, caja de circuito, mar, puente, calles y óvalos del cliente—
  pasó de ~70 coordenadas absolutas a fracciones del mundo. Y se llenó: seis
  vecinos en vez de cuatro (Doña Meche y El Chato), cuatro patios comprables en
  vez de dos, trastos y desfile a la misma densidad de antes, y un segundo par
  de Armería y Ruleta lejos del centro. Las carreras crecen con él: 48-87 s.

- 2026-08-08 (claude-code): promovido a producción el dinosaurio, La Prehistoria
  y el desfile por la pasarela. Ojo con el gotcha del build: el primer bundle
  subido apuntaba a `localhost` (ver Gotchas).

- 2026-08-08 (claude-code): el desfile **vuelve a la pasarela**. Lo aleatorio
  ahora es el camino, no el rumbo: bajan del portal de arriba, y al llegar al
  cruce del ocho tiran por uno de cuatro caminos (qué lóbulo primero y en qué
  sentido). Los cuatro dan la vuelta entera al ∞ y salen por el portal de abajo.

- 2026-08-08 (claude-code): **el dinosaurio** (montable, el más rápido de los
  que se encuentran tirados) y **La Prehistoria en lugar de Nazca**: volcanes
  humeando, helechos y cícadas, pozos de brea, esqueletos a medio enterrar,
  huellas de tres dedos, nidos con huevos, fogatas y una cueva con pinturas
  rupestres. Topes de hueso en su circuito, y pterodáctilos y raptores de fauna.

- 2026-08-08 (claude-code): pistas de carrera **entre 10 % y 62 % más largas**
  (6 000–9 000 px por vuelta; las tres vueltas pasan de 32–51 s a 42–63 s), sin
  agrandar el mundo: rectas serpenteadas, más panzas en el anillo, seis dientes
  en el zigzag y un poco más de mapa aprovechado.

- 2026-08-08 (claude-code): promovido todo a producción. Arreglos de iPad
  —el potenciador al lado del botón de tirar para no soltar el joystick, y
  `touch-action`/`gesturestart` para que deje de hacer zoom con dos pulgares— y
  la tecla del objeto pasó a X, que la E ya cambiaba de arma.

- 2026-08-08 (claude-code): cajas de ítem en las carreras con ruleta de
  potenciadores (cuatro comunes y uno propio de cada uno de los 16 escenarios),
  y el patio en venta redibujado: era una reja de barrotes que parecía cárcel y
  ahora es un terreno baldío con cerco de estacas y cartel de SE VENDE.

- 2026-08-08 (claude-code): elegir vehículo antes de correr (todos los del
  juego, no solo los del escenario) y cuatro especiales de Garaje —chancla
  voladora, cóndor, ovni, Amaru— que se compran con dinero de aventura o salen
  en la Ruleta. Topes en la pista según el escenario (de la ruta no se sale),
  los Florines del desfile pasaron a rumbo libre (revertido el 2026-08-08: se
  perdía la pasarela) y las líneas de Nazca redibujadas con las figuras de
  verdad (el escenario se sustituyó por la Prehistoria el 2026-08-08).

- 2026-08-08 (claude-code): probada una **carrera en sala con dos clientes**
  contra producción. Salieron dos fallos, los dos arreglados: la carrera
  arrancaba al crear la sala (ahora espera en parrilla hasta que alguien da la
  salida, con cuenta atrás de 3), y el cartel del final se calculaba con `G` en
  vez del mundo del servidor — el último leía "¡Primero!" y un tiempo de 0:00.

- 2026-08-07 (claude-code): **modo carrera** (tres vueltas, montado, gana el
  primero) y cuatro escenarios más: La Costa Verde, Nazca, El Volcán y La Luna.
  Los dieciséis escenarios tienen circuito, con seis trazados al estilo Top
  Gear: horquilla, riñón, chicana, herradura, trébol y zigzag.

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

- [ ] **Probarlo en un iPad de verdad.** No hay Xcode completo en este Mac, así
      que el simulador de iOS no arranca (`sudo xcode-select -s
      /Applications/Xcode.app/Contents/Developer` tras instalar Xcode). Lo
      comprobado como sustituto: WebKit (Safari del Mac) crea lienzos de hasta
      48 Mpx sin despeinarse, y el del suelo (7,6 Mpx) tarda 2 ms; y la interfaz
      táctil a proporción de iPad tiene el joystick, el botón de tirar y la
      casilla del potenciador donde toca. Lo que sigue sin probarse es el
      RENDIMIENTO en el aparato, que es lo que no se puede simular.
- [ ] **Los bots corren mucho más que un jugador en red.** Medido: 3 vueltas
      contra 1 en el mismo tiempo. Parte es la latencia (220 ms) y parte que el
      bot traza perfecto. Si va a jugarse en serio, hay que frenarlos en
      carrera.
- [ ] **Dos personas de carne y hueso.** Sigue sin probarse: el segundo cliente
      siempre ha sido un script mío (`scratchpad/carrera.mjs`).
- [ ] Los trazados de carrera son seis para dieciséis mapas. Se repiten (con
      media vuelta de diferencia). Si cansan, tocar `HORQUILLA`, `RINON`,
      `CHICANA`, `HERRADURA`, `TREBOL` y `ZIGZAG` en `datos.ts`: al cambiar uno
      cambian todos los mapas que lo usan. Ojo con dos cosas al retocarlos: que
      las `onda` empiecen y acaben EXACTAMENTE donde acaba y empieza cada arco
      (si no, queda un vértice y los bots se clavan ahí), y que ningún punto se
      pase de ±1 (los escenarios con mar tienen la caja recortada). Hay pruebas
      de las dos cosas.
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
- [ ] **Nazca ya no existe como escenario.** Una partida guardada con
      `escenario: "nazca"` cae al escenario por defecto (El Barrio). El guardado
      en la nube trae el estado entero, así que esas partidas siguen abriendo:
      lo único que pierden es el decorado propio. Si alguna vez molesta, la
      solución es un alias `nazca → prehistoria` en `crearPartida`.
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
- 2026-08-08: el desfile va por la pasarela y lo que se echa a suertes es el
  CAMINO, no el rumbo. Sueltos por el mapa se perdía la pasarela entera; todos
  por la misma vuelta y te aprendías el recorrido. Con cuatro caminos por el
  ocho hay las dos cosas. Se sortea al salir del portal, no en el cruce: así el
  recorrido entero sigue siendo una función de `k` y dos clientes con la misma
  semilla ven lo mismo.
- 2026-08-08: el suelo se vuelca por trozos, no entero. `drawFloor` dibuja solo
  el rectángulo visible del lienzo cacheado; volcándolo completo, lo que cuesta
  pintar el suelo crecía con el mundo aunque en pantalla quepa lo mismo. Medido
  en escritorio: 0,105 ms contra 0,153 por volcado — irrelevante aquí, pero es
  el tipo de coste que se nota en una tableta.
- 2026-08-08: el reparto del mapa va en FRACCIONES del mundo, no en píxeles.
  Para mover una casa se toca su `sitio(fx, fy)`: 0 la pega al borde de arriba o
  de la izquierda y 1 al de abajo o de la derecha. Los decimales feos salen de
  convertir las coordenadas viejas; a igual tamaño el reparto no se movió más de
  1 px. Hay pruebas de que nada se sale del mundo, nada se solapa, el desfile no
  cruza casas y los circuitos caben.
- 2026-08-08: los sitios de más (las dos casas y los dos patios que trajo el
  mapa grande, y el par de puestos de fuera) se acomodan SOLOS buscando hueco.
  Escribir 64 coordenadas nuevas a mano para 16 escenarios era pedir errores, y
  cada escenario conserva su carácter porque los suyos siguen escritos.
  Al buscar, estar LIBRE manda sobre estar lejos: un puesto dentro de una casa
  tapa el botón de entrar, que es la única forma de usarlo.
- 2026-08-08: el dinosaurio es un trasto **normal**, no un especial de Garaje.
  Los especiales cuestan cientos de miles y vuelan; el dino se encuentra tirado
  en la Prehistoria como la llama en Machu Picchu. Hay prueba de que sigue por
  debajo de todos los del Garaje en velocidad.
- 2026-08-08: al cambiar Nazca por la Prehistoria se cambió también el **id**
  (`nazca` → `prehistoria`), en contra de la regla del 2026-08-07 de no tocar
  ids. Aquí no es un renombrado: es otro escenario. Dejar el id viejo apuntando
  a un sitio que ya no se le parece engaña a quien lea el código después.
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

- **`npm run build` a secas deja el cliente apuntando a `localhost`.** Las URLs
  de la API y de las salas entran por `VITE_API` y `VITE_SALAS` en tiempo de
  build; sin ellas el bundle sale con los valores de desarrollo y en producción
  el ranking y las cuentas mueren por CORS y el multijugador no conecta. Está
  en el paso 1 del runbook y aun así se saltó (2026-08-08). El comando bueno:
  `VITE_API=https://api.florin.gargurevich.dev VITE_SALAS=wss://salas.florin.gargurevich.dev npm run build --prefix apps/web`
  Comprobación de un vistazo antes de subir:
  `grep -c localhost:5181 apps/web/dist/assets/*.js` tiene que dar **0**.

- **El panel del navegador congela `requestAnimationFrame` cuando no está
  componiendo**, así que el HUD se queda con lo último pintado. Leer
  `textContent` tras un `setTimeout` da valores VIEJOS y parece un bug del
  juego: costó un buen rato de caza creer que "Correr" arrancaba una aventura,
  y era esto. Para leer el HUD, fuerza antes un frame de verdad
  (`requestAnimationFrame` anidado) o toma una captura.

- El **Garaje vive en el navegador** (`florin_garaje`), como el álbum. El
  servidor de salas no comprueba que de verdad tengas el vehículo que traes:
  traerlo a la base querría decir guardarlo y confiar igual.
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
