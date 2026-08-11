# Handoff — Roba un Florín

> Actualizado: 2026-08-10 por claude-code

## Estado actual

Monorepo con workspaces npm:

| Paquete | Qué es |
|---|---|
| `packages/engine` | el juego sin navegador: determinista, JSON serializable, 181 pruebas |
| `apps/web` | el cliente (Vite + canvas 2D). Solo dibuja y escucha teclas |
| `apps/api` | cuentas, álbum, guardado, fiestas y avisos (.NET 9, Clean Arch + CQRS), 47 pruebas |
| `apps/salas` | servidor de salas autoritativo (Node + `ws`), 36 pruebas |

Funciona: un jugador, salas online hasta 5 (aventura, versus y carrera) con
bots en los asientos libres, 24 escenarios —todos con circuito—, cuentas con
guardado en la nube, álbum y ranking. Se publica en
GitHub Pages y en el VPS (ver `/opt/florin-api/LEEME.md` en el servidor: es el
runbook de despliegue, con los cuatro contenedores y el rollback).

A medias / sin hacer: el modo cooperativo (aplazado a propósito — una sala en
aventura ya es cooperativa mientras no tenga objetivo y amenaza compartidos).

## Última sesión

- 2026-08-10 (claude-code): **fútbol online, pateo con carga y cabezazos**.
  *Online*: una sala de fútbol tiene **diez asientos** (`cupo` por modo, 5v5),
  los equipos salen del reparto que ya hacía el motor y los libres los llevan
  bots. El modo y la cancha viajan en el "entrar" de siempre, y el selector de
  salas ya ofrece Fútbol (sin eso el servidor aceptaba partidos pero no había
  forma de crear uno).
  *Patear*: botón propio — un toque empuja, aguantando se carga hasta el
  pelotazo, con barra en el botón; en teclado, la **B** (que en un partido deja
  de abrir el álbum). La fuerza la manda el cliente y **el motor la recorta**:
  hay prueba de que mandar 99 no llega más lejos que mandar 1.
  *El aire*: pasado cierto punto de carga el balón se eleva (`z`, `vz`,
  gravedad, botes). Un balón volando ya no se lo lleva por delante el primero
  que pase por debajo — por eso los centros cruzan.
  *Cabezazo*: si te viene volando y le das, sale más plano y menos fuerte pero
  remata sin esperar el bote.
  **Sin verificar**: el 5v5 online de punta a punta. Las salas piden cuenta y
  desde aquí no se puede iniciar sesión como nadie, así que está probado en el
  servidor (36 pruebas, incluida una sala de fútbol de diez con sus equipos y
  el recorte de la fuerza) pero **nunca con dos personas de verdad** — que es
  el mismo pendiente que arrastra todo lo online del proyecto.

- 2026-08-10 (claude-code): **5v5 y canchas propias**. El fútbol deja de estar
  atado a `SLOTS` —que existe para repartir CASAS, y en un partido no se roba a
  nadie—, así que ya no lo topa `JUGADORES_MAX`: `FUTBOL_MAX = 10`, o sea 5
  contra 5. Y hay dónde elegir: **El colegio**, **El Estadio** (tribunas,
  hinchada que hace la ola y salta en los goles, focos y túnel de vestuarios) y
  **La Calle** (asfalto con las rayas medio borradas, paredes con los arcos
  pintados, carros estacionados y vecinos mirando). Los dos nuevos son
  escenarios con `soloFutbol: true`: no ensucian el selector de la aventura.
  Detalles: en la calle la superficie es asfalto y no césped; y el encuadre se
  abre más en estadio y calle, que si no el entorno —que es medio chiste del
  sitio— queda fuera de cámara.

- 2026-08-10 (claude-code): **la canchita del colegio** (fase 2 del fútbol). En
  el patio del colegio —y en su zona del Multiverso— hay una cancha de verdad:
  te metes, sale "Armar la pichanga", juegas y al acabar **vuelves a tu
  aventura con todo donde estaba**. El estado se guarda en memoria al armar el
  partido y se revive al terminar; el botón "Volver al barrio" solo sale si hay
  aventura esperando. La canchita busca sitio como los puestos y de grande a
  chica (en el colegio el patio va lleno). Gotcha: el cartel del final tiene
  cuatro versiones y cada una repone sus rótulos, o una carrera después de un
  partido decía "Del otro equipo".

- 2026-08-10 (claude-code): **la pichanga**. Modo `futbol`: dos equipos, una
  pelota y una cancha en el patio del colegio. 3v3 o 4v4 contra bots, primero a
  3 goles o cuatro minutos, **con chancla** — un fútbol donde puedes chanclear
  al que va a rematar es el fútbol de este juego.
  La pelota no es nueva: es el trasto `pelota` de siempre, pateado con el mismo
  código. El fútbol solo añade a dónde vuelve, quién gana y cuándo se acaba
  (`e.futbol`, `pasoFutbol`, `sacarDelCentro`).
  Gotcha del bot futbolista: al llegar detrás de la pelota tiene que apuntar
  **AL ARCO**, no a la pelota — apuntando a la pelota, `PEGADO` lo frena a un
  palmo y los partidos acababan 0-0 con seis mirándola. Medido tras el arreglo:
  3-1 en 1,8 min.
  En el cliente: modo en el menú, fila de 3v3/4v4, cancha dibujada encima del
  patio (césped opaco: los canteros del colegio se transparentaban y parecían
  obstáculos), camisetas por equipo, marcador+reloj en el HUD, zoom que abre la
  cancha entera y minimapa escondido.
  **Pendiente del fútbol**: online (equipos por el protocolo de salas) y la
  fase 2 acordada — una canchita dentro del colegio y del Multiverso que
  arranque el partido sin salir del mundo.

  El Multiverso y la pichanga están **en producción** (`index-3XflCpSh.js`).

- 2026-08-10 (claude-code): **El Multiverso** en lugar de El Valle: los
  veinticuatro escenarios cosidos en fila, 86 400 x 2 100, cinco minutos y medio
  de punta a punta a pie. Cada zona con su decorado, sus trastos y su mar.
  Lo que hubo que arreglar para que fuera jugable y no un pasillo (todo medido):
  - **lo que crecía con el mundo, con tope** (`TOPE_ANCHO` en `fijarMundo`): sin
    él salían 246 Florines a la vez por un ∞ de 17 800 px que tardaba catorce
    minutos en dar la vuelta;
  - **`CENTRO_X`**: la pasarela, el portal y los puestos de casa viven en el
    centro de la PRIMERA zona, no del mundo. Una pasarela en el kilómetro 43 la
    vería cada jugador una vez y de casualidad;
  - **una casa de vecino por zona** (24) y **tus cinco patios en la primera**:
    una vitrina repartida por veinticuatro mundos no se defiende;
  - **un par de Armería+Ruleta cada tres zonas**: con dos para todo el mapa, la
    más cercana quedaba a 158 s ANDANDO. Ahora a 3 s;
  - **trastos por zona** (`sembrarTrastos` recorre `zonas`): dinosaurios en La
    Prehistoria y grúas en la obra, y de paso la densidad no se multiplica por 41;
  - **mar por zona** (`marEn(e, x)`, `enElMar(e, x, y)`): agua en cinco zonas y
    tierra seca en diecinueve;
  - **ladrones de tu barrio**: `spawnThief` elige vecino a menos de 3 600 px, y el
    ritmo cuenta las casas CERCANAS. Contando las 24 salía uno cada 6 s (28 en 3
    min, medido); ahora 14, como un barrio normal;
  - **caché de mosaicos con tope** (`MOSAICOS_MAX = 12`, 48 MB): recorrer el
    mundo guardaba 255 lienzos de 1024² — más de un giga, y una tableta se cae
    mucho antes. Se sueltan los más viejos encogiéndolos a 1x1 primero;
  - **minimapa con ventana**: el mundo entero salía de 300x7 px. Ahora enseña
    5 760 px alrededor de ti y rotula en qué zona estás.
  Gotcha: para un especial, `VEHICULOS[x].agua` significa "también sobre el
  agua" (vuela), no "solo en el agua" — un guardia nuevo se cargó los dragones
  de la Edad Media hasta que se separaron los dos sentidos.

  **Próximos pasos del Multiverso** (nada de esto bloquea jugarlo):
  - probarlo en un **iPad de verdad**: los 12 mosaicos son 48 MB y cada trozo
    cuesta 10,6 ms de pintar (medido en Mac), así que cruzar zonas puede dar un
    tirón en tableta. Es lo único que no se puede simular desde aquí;
  - una partida guardada con `escenario: "valle"` sigue abriéndose (el estado
    trae su propio mundo), pero empezar una nueva con ese id cae al escenario por
    defecto. Si molesta: alias `valle → multiverso` en `crearPartida`;
  - los patios comprables del Multiverso están los cinco en la primera zona;
    queda por ver si tiene más gracia poder comprar patio en otras zonas;
  - sigue abierto lo de antes: bots contra un humano en red, dos personas de
    verdad en dos aparatos, dificultad en las salas y el modo cooperativo.

- 2026-08-09 (claude-code): **consola de avisos**. El admin escribe un mensaje
  y cuántos minutos se ve, y lo lee todo el que tenga el juego abierto —menú o
  partida— en un cartel propio (baja unos píxeles si además hay cartel de
  fiesta). Entidad `Anuncio` aparte de `Evento` —un aviso no reparte Florines
  ni toca la pasarela— pero **viaja en la misma respuesta** de
  `GET /api/v1/eventos/vivo`: los clientes ya sondean eso cada minuto y no
  hacía falta un sondeo más. Si mandas dos seguidos manda el último.
  Endpoints: `POST/GET /api/v1/eventos/anuncios`, `DELETE .../{id}`, todos con
  `eventos.gestionar`. 47 pruebas de API.

- 2026-08-09 (claude-code): **el cartel de la fiesta avisa ANTES y también en
  el menú**. Antes solo salía con la fiesta empezada, así que como aviso no
  servía: cuando aparecía ya llegabas tarde. Ahora anuncia la que viene con su
  cuenta atrás (apagado, dorado) y la que está en marcha con las luces. El
  reloj es `Date.now()` contra la hora del servidor, no `G.t`: en el menú no
  hay partida y una pausada tampoco avanza. Al llegar a cero pregunta al
  servidor en vez de esperar al sondeo del minuto.
  La cuenta `miguel.gargurevich@outlook.com` (apodo "admin") ya tiene el rol:
  se registró y se recreó el contenedor. **Los permisos viajan en el token**,
  así que hay que cerrar sesión y volver a entrar para que aparezca el botón.
  Primera fiesta programada ("Estreno de las fiestas", 15 min, Wiracocha
  Galaxia/Lava, Amaru Dorado e Inca Cristal, regalo Wiracocha Galaxia) —
  **insertada por SQL**, no por el panel: no se puede iniciar sesión como el
  admin desde aquí (las contraseñas están hasheadas y tampoco toca).

- 2026-08-09 (claude-code): **el correo no cabía en su campo** de la portada.
  Compartía fila con la contraseña y en pantalla estrecha quedaba en 150 px: se
  escribía a ciegas. Ahora el correo y el apodo se llevan la línea entera
  (`#cuentaEmail, #cuentaApodo{flex:1 1 100%}`) y el texto sube de 13 a 16 px —
  por debajo de 16, Safari hace zoom al enfocar. Todo el CSS del juego es
  inline en `index.html`, así que este arreglo viaja con el index y **no cambia
  el hash del bundle**.

  Próximo inmediato: `Admin__Email=miguel.gargurevich@outlook.com` ya está en
  `/opt/florin-api/.env`, pero **esa cuenta todavía no existe** (hay 2 cuentas
  en la base y ninguna es esa). En cuanto se registre, hay que **recrear el
  contenedor** (`bash /opt/florin-api/arrancar-api.sh`) para que el seeder le
  cuelgue el rol de admin, y con eso le sale el botón de programar fiestas.

- 2026-08-09 (claude-code): **las fiestas**. Un admin las programa (hora,
  duración, qué Florines) y a esa hora, a todo el que esté jugando —con cuenta
  o sin ella— le baja por la pasarela lo que eligió, con focos y papelitos. A
  cada cuenta conectada le toca además uno de regalo, **una sola vez**.
  Cómo está montado: el servidor NO simula; solo contesta `GET
  /api/v1/eventos/vivo` con "qué baja y cuántos segundos quedan", y cada
  cliente lo mete en su partida (`ponerFiesta` en el motor, `e.fiesta`, caduca
  sola). Se sondea **cada minuto**. El regalo sí es del servidor, con una fila
  por (fiesta, jugador) — si lo diera el cliente, recargar sería una máquina de
  Florines.
  **Quién es admin lo dice `Admin__Email` en `/opt/florin-api/.env`**, no un
  endpoint. El seeder le pone el rol a esa cuenta en cada arranque.
  El panel para programarlas está en la portada y solo sale si tu token trae
  `eventos.gestionar`; el servidor lo revalida igual.
  Gotchas: `OCHO_A`/`OCHO_B` NO están exportados al cliente —para dibujar sobre
  la pasarela se usa `orbitaDelCentro(G)`, que sí—; y las pruebas de la API
  comparten IP, así que el rate limit de auth (20/min) tumba la suite si cada
  test abre sesión: en `EventosTests` hay UNA sesión de admin para toda la clase.

- 2026-08-09 (claude-code): **ocho vecinos** en vez de seis (la Bodega de don
  Wílber y la Casa de la Tía Charo), y la fila de "vecinos que juegan" llega a
  cinco. Para que quepan: `acomodar` reparte por una rejilla fina de fuera
  hacia dentro, las bases ya no nacen dentro del mar —pasaba desde antes— y
  `crearPartida` topa los jugadores por las casas que ese mapa consiguió
  colocar. `JUGADORES_MAX` pasa a 9 (lo que cabe en el mapa) y las salas se
  quedan en 5 con **`SALA_MAX`**: cada asiento vacío lo mueve un bot en el
  servidor. Las carreras siguen siendo de cinco.
  Y los ladrones ahora salen más seguido cuantas más casas de vecino queden
  (19 en 3 min con ocho, frente a 14). Solo acelera, nunca frena.

- 2026-08-09 (claude-code): **La Tienda en la portada** — vehículos, patios y
  vender Florines sin entrar a jugar. Gasta la plata de tu partida (la pausada
  o la guardada), y comprar desde el menú reescribe la guardada. Con ella salió
  el botón **"◂ Seguir jugando"**: al volver al inicio con el 🏠 la partida
  quedaba viva pero sin forma de retomarla sin cuenta.

- 2026-08-09 (claude-code): **los vecinos juegan solos**. En el menú de Aventura
  se elige cuántos salen (0 a 3, guardado en `florin_rivales`) y los mueve
  `pensarBot`, el mismo de las salas — el cliente ya llevaba los asientos
  `idx > 0`, así que no hizo falta bucle nuevo. Un bot **no es "el J3"**: es el
  que vive en esa casa, conserva el nombre de la casa y lleva su apodo (el
  Marciano, Mayo, la Sobri), que se pinta sobre su cabeza. `crearPartida` toma
  `bots` para saber cuáles son de máquina; con solo bots tu patio se sigue
  llamando "Tu patio" y los patios comprables se quedan.
  Tope de 3 a propósito: cada vecino que juega se queda con SU casa y deja de
  tener Florines, y con cuatro quedan dos casas en todo el mapa.
  De paso, un agujero que ya existía en versus: cuando **un jugador** te robaba
  de la vitrina no contaba como robo ni sonaba la alarma —era todo para los
  ladrones NPC—, así que te vaciaban el patio y el marcador seguía en cero.
  Ahora suma a `stats.lost` del dueño y la alarma avisa mientras forcejea.
  Próximo: sigue abierto lo de siempre (bots contra un humano en red, dos
  personas de verdad, dificultad en las salas, cooperativo, El Valle en iPad).

- 2026-08-09 (claude-code): **la fila de armas al dejar pulsado el botón de
  lanzar** (320 ms; soltar entonces NO lanza) y **la cochera junto a tu patio**
  con los especiales comprados, que ya se montan en aventura y no solo se
  eligen en carrera. De paso: fuera el selector de arma en táctil —lo sustituye
  la fila— y el minimapa centrado abajo y mucho más traslúcido.
  Gotchas nuevos:
  - la selección de arma tiene que pasar por `elegirArma(i)`, no por
    `seleccionarArma`: en una sala la decide el servidor;
  - la cochera busca sitio en dos vueltas (formas decentes por los lados y por
    la manzana, y solo entonces la torre de una columna). Con los nueve
    especiales comprados hay patios donde no hay hueco pegado: se aparta hasta
    96 px, que sigue siendo "al lado";
  - `sembrarTrastos` esquiva la cochera entera, o en la Edad Media aparece un
    dragón salvaje en la plaza de al lado y parece un regalo del juego.

  Con esto no queda nada pendiente de la tanda anterior.
  **Todo desplegado** en el dominio principal (bundle `index-BgR8tHvG.js`) y
  empujado a GitHub, con Pages en verde.

- 2026-08-09 (claude-code): **el botón de bajarse no salía nunca** en una
  partida normal. Se le quitaba el `hidden` solo en la rama del duelo de sofá
  —donde encima estaba la línea duplicada— y el camino principal no lo tocaba,
  así que seguía escondido desde la carga: en tableta, subirse a algo era para
  siempre. La condición vive ahora en `montado()` y la preguntan las dos ramas
  del HUD. Gotcha: `hud()` tiene tres salidas (duelo, carrera y la normal); lo
  que se muestre u oculte hay que ponerlo en las tres o no está en ninguna.

  Próximo: sigue abierto lo de siempre —los bots corren mucho más que un humano
  en red, dos personas en dos aparatos sin probar, bots fuera de las salas, el
  modo cooperativo, y verificar El Valle y los mosaicos en un iPad de verdad.

- 2026-08-08 (claude-code): trineo de Santa y alfombra voladora en el Garaje;
  **Florín Wiracocha (Supremo)**, que SOLO sale de fundir dos Amaru; botón para
  bajarse de lo que montas; los cuatro mapas de marca renombrados; y el arreglo
  de que en Aventura se veían las filas de carrera (una clase con `display`
  ganaba al atributo `hidden`).

- 2026-08-08 (claude-code): **La Fusionadora**: se meten dos Florines de la
  vitrina y sale uno, el promedio de los dos subido un escalón, con la mejor
  variante de las dos. Trabaja sobre la VITRINA y no sobre lo que llevas en
  brazos porque solo se carga uno a la vez. Está en el centro, con la Armería y
  la Ruleta, y busca sitio como ellas.

- 2026-08-08 (claude-code): **tres variantes nuevas de Florín** —Cristal (x6),
  Lava (x8) y Galaxia (x12)— con su dibujo propio, y cuatro flores más. El álbum
  pasa de 75 a 120 casillas y su lista de variantes sale del catálogo, no de una
  lista a mano que se quedaba vieja.

- 2026-08-08 (claude-code): promovido TODO a producción, incluido El Valle. Antes
  de subirlo salió un fallo del refactor: revivir una partida guardada no volvía
  a fijar el tamaño del mundo, así que retomarla después de jugar en El Valle la
  dejaba con un mapa de 10 800 px. Hay prueba de que el tamaño no se contagia
  entre escenarios.

- 2026-08-08 (claude-code): el **álbum enseña los Florines dibujados** y con su
  rebote —los que no tienes, en silueta—, en vez de una lista de nombres. Y el
  botón 🏠 **pregunta antes de salir**: está pegado al libro y al sonido y en
  tableta se roza sin querer.

- 2026-08-08 (claude-code): **El Valle**, la prueba de mundo abierto: tres sitios
  que ya existían —La Catarata, La Construcción, El Zoológico— cosidos en un
  mapa de 10 800 x 2 100 que se cruza andando, sin menú. Para que fuera posible:
  el tamaño del mundo lo pide cada escenario (antes era una constante global) y
  el suelo va por MOSAICOS de 1024 px, así que el tamaño del mapa dejó de tener
  techo. En staging, no en producción.

- 2026-08-08 (claude-code): en tableta **no se podían comprar armas**: el
  guardián del doble toque cancelaba el `touchend`, y con él el `click` que iOS
  genera después. Ahora no se cancela nunca sobre un control (ver gotchas).

- 2026-08-08 (claude-code): **La Catarata sustituye a El Barrio** (paseo al
  cerro, camino inca, la caída sobre la poza con gente sentada alrededor) y
  cuatro sitios más: Farellones, El Zoológico, El Parque de Diversiones y La
  Nave Espacial. Con moto de nieve, elefante, auto chocón y patineta flotante.
  Son **24 escenarios**.

- 2026-08-08 (claude-code): **dificultad en las carreras** (fácil, normal,
  difícil). En fácil no hay topes —de la pista se sale y se vuelve— y lo que
  sustituye al muro es el césped, que te deja al 70 %. Cambian también lo rápido
  que van los rivales y cuántas cajas de ? hay. Se elige en el menú, junto a
  Aventura y Carrera.

- 2026-08-08 (claude-code): **del final de una partida se puede volver al
  inicio**. El cartel del final es una capa a pantalla completa y su único botón
  era "Otra ronda", que repite el MISMO modo: para pasar de carrera a aventura
  había que recargar la página, porque el panel tapa la barra con el 🏠.

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
      bot traza perfecto. Ya hay palanca —`DIFICULTADES[…].rivales`— y en normal
      va a 0,94; falta volver a medirlo CONTRA UN CLIENTE EN RED para saber si
      ese punto basta. Ojo: la palanca solo sabe frenar (ver decisiones).
- [ ] La dificultad **no llega a las salas**: quien crea una sala online no la
      elige y se juega siempre en normal. Habría que pasarla por el protocolo.
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
- 2026-08-08: la dificultad de los rivales solo sabe FRENAR. Se aplica
  escalando lo que el bot pide moverse, y el motor normaliza todo vector de
  módulo mayor que 1: pedir 1,06 se queda en 1,00 —medido, difícil no corría más
  que normal—. Por eso la escala es 0,80 / 0,94 / 1,00 y el que baja es normal.
- 2026-08-08: mirar más allá del punto de paso siguiente NO hace mejor al bot.
  Barriendo el parámetro en cuatro mapas, el óptimo está en 0,20 y de ahí para
  arriba empeora: apunta fuera de la curva y acaba rozando el tope, que le quita
  la velocidad. Difícil corre en el óptimo y a fácil se le desvía.
- 2026-08-08: el suelo se vuelca por trozos, no entero. `drawFloor` dibuja solo
  el rectángulo visible del lienzo cacheado; volcándolo completo, lo que cuesta
  pintar el suelo crecía con el mundo aunque en pantalla quepa lo mismo. Medido
  en escritorio: 0,105 ms contra 0,153 por volcado — irrelevante aquí, pero es
  el tipo de coste que se nota en una tableta.
- 2026-08-08: el tamaño del mundo lo pide cada escenario y ya no es constante.
  `WORLD_W`/`WORLD_H` son `let` exportados: en ESM los imports son enlaces
  vivos, así que los ~160 sitios que ya los leían siguen funcionando sin tocar
  nada. Lo que hubo que mover son las DERIVADAS —`OCHO_A`, `ESCALA_MAPA`, los
  `PORTAL_*` y cuatro constantes del cliente—, que se congelaban al cargar el
  módulo: ahora se recalculan en `fijarMundo`.
- 2026-08-08: los escenarios se ESCRIBEN en fracciones y se MONTAN en píxeles
  (`montarEscenario`), al empezar la partida. Antes se resolvían al cargar el
  módulo con el mundo de 3600 x 2100, y un mapa de otro tamaño habría salido con
  las casas apiñadas en una esquina.
- 2026-08-08: el suelo va por mosaicos de 1024 px, pintados cuando se ven. Un
  lienzo del tamaño del mundo tiene techo (iOS no pasa de 16,7 Mpx) y El Valle
  son 22,7. Cada mosaico usa el MISMO código de decorado recortado a su
  rectángulo, y encaja con el vecino porque el decorado es determinista.
- 2026-08-08: los decorados dibujan sobre `DECO_W`/`DECO_H` (la caja que toque),
  no sobre el mundo. Eso es lo que deja pintar tres zonas distintas en un mismo
  mapa sin tocar ni una de las 25 funciones de decorado.
- 2026-08-08: los adornos GRANDES (volcanes, castillo, Coliseo, recintos del
  zoo, rueda de la fortuna) van con `huecoGrande`, no con `sembrar`. `sembrar`
  reparte en bandas y se rinde a los 26 intentos: con algo más grande que una
  casa, casi ninguno encuentra sitio y el escenario sale sin su seña de
  identidad. Pasó con los volcanes y volvió a pasar con los recintos del zoo.
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

- **`preventDefault()` en `touchend` mata el `click` de iOS.** El guardián
  contra el zoom por doble toque cancelaba cualquier par de toques a menos de
  320 ms, incluido el de una card de la Armería viniendo del joystick o del
  botón de entrar: la compra no llegaba nunca. El comentario ya decía "cuando
  cae fuera de un botón" y el código no lo comprobaba. Si hay que cancelar un
  `touchend`, comprobar antes `e.target.closest(CONTROLES)`.

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
