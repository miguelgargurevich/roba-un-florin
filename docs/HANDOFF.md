# Handoff — Roba un Florín

> Actualizado: 2026-08-21 por claude-code

## Estado actual

Monorepo con workspaces npm:

| Paquete | Qué es |
|---|---|
| `packages/engine` | el juego sin navegador: determinista, JSON serializable, 249 pruebas |
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

- 2026-08-21 (claude-code): **el nivel 100 de prueba, una semana** (pedido).
  Tarjeta nueva en el menú («🧙 El Nivel 100 · EVENTO») que entra DIRECTO al
  Multiverso: mismo motor, mismas reglas, solo se salta la cola — es el
  laberinto de siempre montado en la fase 99. La fecha (hasta el 28/8/2026,
  `NIVEL100_HASTA` en main.js) la vigila el CLIENTE a propósito: el motor no
  puede mirar el reloj de pared sin romper el determinismo de las salas, y el
  menú sí. Pasada la fecha, la tarjeta desaparece sola y el nivel 100 vuelve a
  ser el final para quien llegue. Para extender el evento: cambiar esa fecha y
  redesplegar la web.

- 2026-08-21 (claude-code): **el Brujo, suelto por la aventura** (pedido, en dos
  vueltas). La historia del nivel 100 ahora se ANUNCIA: el Brujo aparece cada
  ~130 s (60 s en el Multiverso, su casa) haciendo de las suyas, con un globo
  de PISTA que enseña una regla del duelo (dónde está, que la chancla sola no
  basta, que rescatar a todos le rompe la magia, que hay portales). El robo a
  vecinos es real (el pedestal queda vacío) — es la explicación de la lluvia
  del duelo: el botín que suelta es lo robado. La chancla rebota en su risa.
  - **Y te afecta a ti** (pedido): 1) montado → te DESAPARECE el vehículo (se
    va volando a la otra punta); 2) Florín en brazos → te lo manotea (regla de
    los ladrones: el botín sin asegurar está en juego); 3) tu vitrina con
    Florines y tú lejos → EL ASALTO: canaliza 3,5 s con la ALARMA de siempre y
    el aro de cuenta atrás — si llegas a 240 px huye sin nada, si no, se lo
    lleva (cuenta en TE ROBARON). Es la única travesura que quita progreso, y
    por eso la única que se puede parar.
  - El globo esquiva el borde del mundo (va debajo si no cabe arriba).
  - 286 pruebas de motor.

- 2026-08-21 (claude-code): **cuatro Florines nuevos y el patio gratis** (pedido).
  - **La banda del Multiverso**: Sirena (Marino), Dragón (Volcánico), Brujito
    (Encantado) y Florín Multiverso (Dimensional) — 20 rarezas, 160 láminas.
    Solo salen de la Fusionadora: dos Wiracocha dan la Sirena y la escalera
    sigue hasta el Multiverso, que es el nuevo final. APPENDIDOS, nunca
    intercalados (el tier se guarda como número en las partidas y el álbum).
    `TIER_SUPREMO` ahora se busca por estilo (length-1 apuntaría al nuevo).
    De paso se cerró una gotera: `rollTier` topaba en length-1, o sea que una
    vitrina de vecino podía rellenarse con un Wiracocha — ahora el mundo topa
    en el Amaru.
  - **Patio 2 GRATIS en aventura** (PATIOS_PRECIO[0]=0): cartel «GRATIS ·
    métete y es tuyo», reclamable sin un centavo. Los otros tres siguen
    costando. 278 pruebas de motor.

- 2026-08-21 (claude-code): **la lluvia de Florines al vencer al Brujo** (pedido).
  El tercer chanclazo ya no acaba la partida: el Brujo revienta en 28
  florincitos que salen disparados, caen con la gravedad de siempre, botan
  perdiendo la mitad y se quedan desparramados. El festejo dura 3,2 s y LUEGO
  llega la pantalla final — sin esa pausa, `over` tapa el mundo en el mismo
  tick y la lluvia no la vería nadie. Va en el estado (no es adorno del
  cliente): en una sala online la ven todos igual. Cada gota se dibuja como un
  florín de verdad —bloquecito, pasto del tono de la gota, carita y flor— con
  sombra en el suelo y el cuerpo levantado según su `z`, que es lo que la hace
  leerse como cosas cayendo y no como confeti pegado a la pantalla.

- 2026-08-21 (claude-code): **al Brujo se le vence** (pedido: «cómo vencemos al
  brujo» — la respuesta era «no se puede», y un jefe invencible es un jefe a
  medias). Los rescates le rompen la magia y la chancla lo remata:
  - mientras quede una jaula, el Brujo es INVENCIBLE y lo enseña con un escudo
    de magia pulsando (chanclearlo solo lo frena 2 s);
  - al liberar al último preso NO acaba el nivel: empieza **EL DUELO** — el
    séquito se esfuma, los hechizos se apagan, él entra en furia (1,28×, más
    rápido que tú) y ya no hay retiradas;
  - **tres chanclazos** lo vencen. Cada golpe vale un punto, y él huye a otra
    dimensión: hay que cazarlo por los portales. Corazones encima y en el HUD;
  - el bot también pelea el duelo: el Brujo pasa a ser «la jaula» de su BFS,
    sin miedo y SIN compromiso de meta (un blanco móvil no admite el
    compromiso que las jaulas quietas necesitaban);
  - se puede perder: si el reloj se agota en el duelo, el Brujo escapa y gana
    quien más puntos tenga. Pantalla final propia: «¡Venciste al Brujo
    Supremo!». 275 pruebas (una nueva recorre el duelo entero).

- 2026-08-21 (claude-code): **el nivel 100: EL MULTIVERSO** (pedido). El final de
  los 100 niveles del laberinto, y es UN nivel especial, no una curva más:
  - el laberinto más grande (61×35), partido en **ocho bandas verticales** —una
    por tema, con sus colores— y el neón de las paredes en degradado con los
    ocho; costuras punteadas entre dimensiones;
  - se rescata a **todos**: un preso de cada mundo EN SU BANDA (el Faraón en
    Egipto, el León en el zoo…) más **tres Florines nuevos** que solo existen
    aquí: Prisma (aura arcoíris), Eclipse (corona dorada) e Infinito;
  - **cuatro pares de portales** que cruzan el Multiverso (dimensión i ↔ 7−i),
    con respiro anti-rebote; se ven en el mapita por color de par;
  - **EL BRUJO SUPREMO**: jefe solo del final (no está en el bestiario). Corre
    más, la chancla/linterna le compran 2 s en vez de 5, el mochilazo no lo
    mueve, y cada 15 s **altera la realidad**: abre muros (nunca cierra — cerrar
    podría dejar una jaula sin camino) o te lanza a otra dimensión (con tregua,
    y tu fila contigo: no deshace rescates).
  - Bicho arreglado de paso: el vuelo de la chancla usaba los topes del MUNDO y
    el nivel 100 se sale del mapa (coordenadas negativas) — volvía en el mismo
    tick de salir. Ahora dentro del laberinto los topes son los del laberinto.
  - 274 pruebas de motor (4 nuevas del final).

- 2026-08-21 (claude-code): **el laberinto pasa a 99 niveles** (pedido, en varias
  vueltas). Ya no son tres fases a mano: son curvas y tablas, con **un escalón
  cada tres niveles**.
  - **Rectangular** (1,7:1, la proporción del mundo) y encuadrado POR ANCHO, que
    era el pedido de llenar la pantalla: cuadrado dejaba dos franjas de patio
    vacío a los lados. Crece de 27×15 a 57×33 celdas.
  - **No tiene que caber**: por debajo de zoom 0,42 la cámara te sigue y hay
    **mapita** en la esquina — sin él, un laberinto de 57×33 es andar a ciegas.
    Y dentro del laberinto los topes del jugador y de la cámara son los del
    LABERINTO, no los del mundo (2 100 px de alto recortaban los pasillos).
  - **Bestiario de ocho monstruos** con silueta, color y velocidad propias (La
    Mano corre un 12 % más, El Muñeco arrastra un 12 % menos). El color es la
    señal que se lee a cualquier tamaño; la silueta, para cuando lo tienes
    encima. Son bichos NUESTROS, del género pero no de otro juego.
  - **Una pareja de especiales por bloque**: una comida (mango, chicha,
    granadilla, helado, maracuyá) y un arma (tiza, silbato, linterna,
    mochilazo). Cinco por cuatro sin divisor común = veinte parejas.
  - **Variantes de forma**: sin vueltas / con atajos / todo bucles (trenzado).
    Un laberinto con bucles se juega distinto — se le puede dar la vuelta a un
    monstruo — y el cartel lo avisa.
  - **La chancla por fin sirve aquí**: un chanclazo congela al bicho, y ahora
    choca con las paredes (si las atravesara, se mataría desde otro pasillo).
  - Reloj POR NIVEL, no por partida. 265 pruebas de motor.
  - **Temas por escenario** (pedido): cada bloque se ambienta en uno de los
    escenarios del juego y cambia a quién rescatas — amigos en el colegio,
    animales en el zoológico (el MISMO dibujo del recinto, `dibujarAnimal`
    extraído de `decoZoo`), marcianitos en la nave, dinos en la Prehistoria,
    momias en Egipto. Con su color de paredes y de suelo, que es lo que más se
    nota al cambiar de bloque.
  - **El bot pelea y recoge** (pedido). `esJuego` apagaba el botón entero en el
    laberinto, así que el bot ni tiraba la chancla ni usaba lo que recogía.
    Ahora se desvía por los especiales que le quedan DE PASO (a dos celdas, o a
    menos de la mitad de lo que le falta para su jaula) y usa cada arma en su
    momento: la tiza cuando le vienen por detrás, la linterna solo de frente, el
    mochilazo guardado hasta que hay dos encima. Y el arreglo que de verdad
    valió: **no huye de un monstruo congelado o huyendo** — desperdiciaba la
    ventana que él mismo abría. Medido a 8 semillas por nivel:
    nivel 7 pasó de 6,5 rescates y 12,8 capturas a **16,0 y 4,5**.
  - **Ocho temas** ya: colegio, zoológico, nave, Prehistoria, Egipto, Amazonas
    (bichos de selva), Volcán (dragoncitos) y Luna (astronautas). Un tema es una
    fila en `LAB_TEMAS` más su pintor en `PRESOS`; los tres últimos salieron del
    decorado que ya tenía cada escenario (el Amazonas tiene río y caimanes, el
    Volcán cráter y lava, la Luna módulo y bandera).

- 2026-08-21 (claude-code): **los dardos con péndulo, y cada puerta con su
  pinta** (dos pedidos).
  - **Dardos**: antes apuntabas al centro y aguantabas — un dado con el radio
    más chico. Ahora la mano va sola de lado a lado y el dardo cae donde esté
    el péndulo al soltar; el arco (176) es más ancho que la diana (150) para
    que soltar a destiempo FALLE el tablero. El error residual baja de 84→38 a
    36→9. La guía (carril, topes, muesca, marca, círculo) sale de
    `puntoDelPendulo` y `errorDelDardo`, las mismas funciones del motor, y hay
    una prueba que impide que se separen. Medido: ±30 ms ganas 88 %, ±70 ms
    60 %, ±140 ms 28 %.
  - **Las puertas**: `dibujarSitio` tenía tres casos y un `else` con césped,
    círculo central y arcos, así que 7 de 11 minijuegos eran canchas de fútbol
    con otro rótulo (y icono ⚽). Ahora hay una tabla `PUERTAS` con un pintor
    por juego — pista de bolos con canaletas y palos, mesa de billar con seis
    hoyas, hielo con ranuras, ring con cuerdas, óvalo con conos, laberinto con
    jaula, diana. Un juego nuevo sin pintor se nota; no hereda el fútbol.
  - **La diana, de verdad**: los cinco aros de arcoíris parecían la Ruleta.
    Ahora gajos negro/crema, doble y triple en rojo y verde, bull verde y
    centro rojo — en la puerta con proporciones reales y dentro del juego con
    las bandas del marcador (quintos exactos), porque ahí las bandas SON el
    puntaje.
  - **`window.dev`** solo en desarrollo (`import.meta.env.DEV`, verificado que
    no llega al bundle): el panel del navegador congela `requestAnimationFrame`
    cuando no compone, así que sin esto no hay forma de mirar una puerta al
    otro lado del mapa.

- 2026-08-21 (claude-code): **los patios del Multiverso, repartidos** (pedido: «es
  muy grande para estar regresando al mismo punto»). Los cinco estaban en la
  primera zona (la catarata) —eso era el problema, no cuántos había—. Ahora el
  tuyo, el gratis, se queda en casa con la pasarela y el portal, y los cuatro
  comprables van cada cinco zonas: **Nueva York, el Mirador, la Construcción y
  el Zoo**. Medido: volver desde la Luna eran **313 s** andando y ahora son
  **41 s** en el peor caso de todo el mapa. A media altura a propósito (las
  casas de los vecinos van a 0,02 y 0,9; el mar de las cinco zonas que lo tienen
  empieza a 1 766 de 2 100). Tres pruebas nuevas lo fijan: repartidos en zonas
  distintas, nadie a más de un minuto, y ningún patio en el mar ni encima de
  otra base o de una Armería. 252 pruebas de motor.

- 2026-08-11 (claude-code): **memoria y criterio para el bot del laberinto**
  (pedido). Era el más flojo de los once: entre huir y buscar se le iba media
  partida. Tres cambios, y el del medio es el que de verdad importaba:
  - **memoria** (`Jugador.bot.huyendo`): la huida dura 0,8 s y mientras corre no
    se replantea el objetivo. Al agotarse retoma **la misma jaula** — eso ya lo
    guardaba `meta`, pero sin la huida acotada volvía a elegir desde cero;
  - **criterio**: no se huye porque haya un fantasma cerca, se huye **si te
    corta el camino** — o sea, si está en la dirección en la que quieres ir, o
    literalmente encima (menos de media celda). Uno que viene por detrás
    mientras te alejas no es una amenaza, y tratarlo como tal era lo que le
    hacía ir y venir;
  - **usa la ventana de retirada**: con los fantasmas retirados no huye. Sin
    esto, una jaula que quedaba detrás de un fantasma lo dejaba huyendo la
    partida entera —cero capturas y un solo rescate, medido—, porque «me corta
    el camino» era verdad para siempre.
  Medido, cuatro semillas: **dos llegan a la fase 3** (antes ninguna) y otra a la
  2, con 9-2, 3-2, 2-1 y 5-4. Las capturas siguen en 10-20, así que el fantasma
  no ha dejado de dar miedo.
  Y una cosa **probada y descartada**: al huir, elegir la salida que aleja del
  fantasma *sin dar la espalda a las jaulas*. Sonaba mejor y medía peor (una
  semilla bajaba de la fase 3 a la 2), así que fuera. La versión simple gana.

- 2026-08-11 (claude-code): **los amigos te siguen y el fantasma te devuelve a
  la entrada** (pedido).
  **La fila** va por tu **RASTRO**, no hacia tu posición: una miga cada 10 px y
  cada amigo a 46 px por puesto a lo largo de él. Hacia la posición cortarían las
  esquinas y saldrían por los muros — así pisan exactamente donde pisaste tú.
  Medido: **0 de 20 017 muestras** con un amigo dentro de una pared, y la cola a
  150 px como máximo (46 por puesto). Al liberarlo, el amigo entra en la fila
  **donde estás tú**, no donde estaba su jaula: si no, cruza medio laberinto en
  línea recta para colocarse.
  **Te atrapan → a la entrada**, con tu fila entera y sin deshacer ningún
  rescate. Dos cosas que hubo que añadir para que eso no fuera un bucle:
  - **los fantasmas vuelven a su esquina** (como en el Pac-Man). Sin eso te
    cazan otra vez en cuanto sales: **169 vueltas a la entrada** en una partida,
    medido. Con la vuelta a casa, 14-23;
  - **la ronda**: persiguen 9 s y se retiran 5 s. Sin ventanas de descanso el
    juego es «huir o que te cacen» y no queda rato para rescatar a nadie —
    probado con el radio de alerta del bot a 240: cero capturas y cero rescates,
    la partida entera huyendo. En pantalla, retirados se pintan apagados: es la
    señal de que puedes trabajar.
  El fantasma va ahora a 132 (tú a 268) porque el castigo pasó de 1,4 s de
  aturdimiento a la caminata de vuelta entera.
  Medido: 3 de 4 semillas llegan a la fase 2 (a los 45-91 s), con 5-1, 3-2, 4-1
  y 1-2. **El bot del laberinto sigue siendo el más flojo de los once**: entre
  huir y buscar se le va media partida, y ninguna semilla completa las tres
  fases dentro del reloj. Un humano ve el laberinto entero y esquiva mucho mejor.

- 2026-08-11 (claude-code): **el laberinto, con fases y rescate de amigos**
  (pedido). Ya no son gemas: son **los amigos del colegio metidos en jaulas** —
  Mayo, el Sobri, la Prima Yuli, el Marciano…, la misma gente de los vecinos, con
  su cara y su nombre bajo la jaula. Y un amigo liberado NO desaparece: se queda
  ahí dando saltos con los barrotes en el suelo, que es la mitad del premio.
  **Tres fases**, cada una más grande y con un fantasma más: 15x15 con 4 jaulas y
  1 fantasma, 19x19 con 5 y 2, 23x23 con 6 y 3. Reloj de 240 s para las tres.
  Dos cosas que hubo que medir para que funcionara:
  - **las jaulas van repartidas, no al fondo.** Puestas en las celdas más
    lejanas (que era la idea bonita), el laberinto se convertía en una
    excursión: 4 rescates en tres minutos. Ahora se toma uno de cada N
    callejones a lo largo de la rejilla;
  - **el fantasma ya NO vuelve a encerrar a nadie.** Esa era mi idea y era
    mala: deshacía rescates más rápido de lo que se hacían, el marcador volvía a
    cero y la fase no se cerraba jamás (2-0 al minuto, 0-0 a los cuatro). Ahora
    solo te clava en el sitio, y lo que cuesta un rescate es TIEMPO — que ya
    aprieta, porque hay reloj y hay tres fases. **Un juego de avanzar necesita
    que lo avanzado se quede.**
  Y el bot huye **hasta el final del pasillo**, no una celda: huyendo una celda
  llegaba, replanteaba, el fantasma seguía pegado y volvía a huir sin moverse
  del sitio.
  Medido en cuatro semillas: todas avanzan de fase (la 2 entre 44 y 83 s, la 3
  entre 139 y 194 s), con 6-4, 4-1, 7-5 y un 3-3, y los dos bots aportan.

- 2026-08-11 (claude-code): **el laberinto. Los once minijuegos están enteros**
  (`JUEGOS_LISTOS`: fútbol, tenis, vóley, básquet, hockey, lucha, carreraObs,
  bolos, dardos, billar, laberinto).
  Era el único que pedía algo que el motor NO tenía: **paredes que paran**
  (`empujarFueraDeParedes`, eje a eje y por el lado de menos penetración, para
  que en una esquina se resbale en vez de clavarse). Sin eso un laberinto es un
  dibujo y las gemas se cogen en línea recta.
  Es una **carrera**: cada gema cuenta para quien la coge, y el fantasma no te
  mata — **te quita una gema**, que vuelve al tablero. Eso es lo que convierte un
  callejón sin salida en una decisión.
  **Cuatro fallos, y el cuarto costó de verdad.** Los tres primeros: el dibujo
  sacaba el origen de la rejilla de la primera gema (el laberinto se desplazaba
  al coger una); el radio de recogida eran 30 px sobre celdas de 92 (el bot
  orbitaba la gema que tenía debajo); y los trastos del colegio seguían dentro —
  una patineta en un pasillo se monta al pisarla y te lleva donde ella quiera.
  El cuarto: **los dos bots y el fantasma se quedaban clavados en la misma celda
  desde el segundo 20 hasta el final**, en todas las semillas. Cinco cambios de
  fondo dieron salida byte a byte IDÉNTICA, que es la pista de que se estaba
  mirando el sitio equivocado. Era el bot alternando entre **huir del fantasma**
  (radio 200 px, dos celdas) e **ir a por su gema**: las dos decisiones
  correctas por separado, y juntas un ciclo de dos que lo dejaba subiendo y
  bajando en el sitio. Con el radio a 110 px —una celda, o sea una emergencia de
  verdad— se arregló solo. Lección: cuando cinco arreglos no cambian NADA, el
  problema no está donde se busca; hay que trazar la decisión, no el efecto.
  De paso quedó el compromiso del bot con su gema (`Jugador.bot.meta`) y
  `celdaLibreDe`, que resuelve que `floor()` te sitúe en la pared de al lado
  cuando rozas el borde de un pasillo.
  Medido: partidas de 53 a 83 s por gemas, con 13 a 36 capturas del fantasma; y
  **reloj de 120 s** como garantía de que siempre hay resultado.
  **Lo flojo, dicho claro**: el bot del laberinto es el peor de los once. Uno de
  los dos acaba haciendo de comparsa (27-1 en la peor semilla), y un «humano» de
  prueba que va en línea recta no navega el laberinto — un jugador de verdad sí,
  pero eso no lo he podido medir.

- 2026-08-11 (claude-code): **el billar**. Décimo minijuego entero — quedan
  **solo el laberinto** (`JUEGOS_LISTOS`: fútbol, tenis, vóley, básquet, hockey,
  lucha, carreraObs, bolos, dardos, billar).
  La física ya estaba escrita y era correcta: choque elástico a lo largo de la
  normal con separación, bandas y hoyas. **Lo que no había era quién tira,
  cuándo y qué pasa después** — sin eso, siete bolas quietas en un paño verde.
  Ahora: siete de color, seis hoyas (cuatro esquinas y dos en medio; con solo
  cuatro, media mesa no tiene salida), y la regla que hace que un turno importe:
  **si metes, sigues tirando**; si cuelas la blanca, vuelve a la mesa y el turno
  se va. La blanca reaparece **en un hueco libre**, probando posiciones desde el
  punto de saque — si no, puede materializarse dentro de otra bola.
  Un arreglo de fondo: el rozamiento iba **por fotograma** (`0.985`), o sea que
  el billar corría distinto en cada máquina. Ahora `Math.pow(roce, dt)`.
  El bot no apunta a la bola más cercana: elige la que mejor esté **alineada con
  una hoya** (coseno del ángulo blanca→bola→hoya) y se pone detrás de la blanca
  en esa línea. Apuntar a la más cercana sin mirar a qué hoya va es tirar por
  tirar.
  Medido: partidas de 45 s, 16 tacadas para las siete bolas (44 % de acierto),
  2-5 con ganador y la mesa vacía.
  En pantalla: la **línea de la tacada** desde la blanca hacia donde apuntas —
  en un billar sin verla se tira a ciegas, y aquí la puntería es el juego.

- 2026-08-11 (claude-code): **los dardos**. Noveno minijuego entero
  (`JUEGOS_LISTOS`: fútbol, tenis, vóley, básquet, hockey, lucha, carreraObs,
  bolos, dardos). Seis dardos cada uno, por turnos, gana quien sume más.
  Lo interesante es qué hace la carga: **aquí no es fuerza, es PULSO**. Un dardo
  no llega más al centro por tirarlo fuerte, así que aguantar el botón **cierra
  el error** (de 84 px a 38) en vez de empujar más. Medido apuntando al centro:
  29 de media a pulso 0, 38 a medio, 47 a pulso lleno, sobre un máximo de 50.
  Y el precio de tomarse el tiempo **no es un medidor que castigue por pasarse**
  —eso ya se probó en el vóley y es una lotería— sino **el otro jugador: te
  puede chanclear mientras apuntas**, y un dardo aturdido no sale. Para eso hubo
  que sacar los dardos (y la lucha) de la lista `esJuego` que apagaba la chancla
  del bot, y **acercar al que espera de 320 a 200 px**: fuera del alcance de la
  chancla, aguantar el pulso al máximo no costaba nada. Medido después: 4
  chanclazos por cabeza en una partida, y aun así se tiran los doce dardos.
  Con `DARDO_ERROR_MIN` a 26 el centro estaba **garantizado** (el error entero
  caía dentro del anillo de 30, que mide `r/5`); a 38 es probable pero no
  seguro, y eso es lo que lo convierte en una decisión.
  Medido: partidas de 11 s, 215-190 / 165-140 / 190-200 (con empate incluido) y
  ganadores distintos.
  La diana se dibuja con **el valor escrito en cada anillo**: el juego entero es
  decidir a qué aro apuntas, y sin los números hay que adivinarlo.

- 2026-08-11 (claude-code): **los bolos**, más **el zurdazo del hockey** y **el
  antiatasco del fútbol**. Octavo minijuego entero (`JUEGOS_LISTOS`: fútbol,
  tenis, vóley, básquet, hockey, lucha, carreraObs, bolos).
  **Bolos**: cinco manos, dos bolas por mano, por turnos. Se lanza con el mismo
  botón de cargar — la carga es la fuerza y la puntería el ángulo, **topado a
  ±22°** (sin tope, la bola salía de lado y no llegaba nunca).
  Los pinos NO son trastos: son diez círculos con sitio de nacimiento, y
  **tumbado significa que se ha MOVIDO de él**, no que algo lo haya tocado. Eso
  es lo que permite la cadena, y la cadena es la mitad del juego.
  Tres fallos que hubo que cazar, todos medidos:
  - **durante la espera los pinos no se movían.** El bloque de mover pinos vivía
    dentro de "la bola rueda", así que los que la bola tocaba al final se
    quedaban con la velocidad congelada. Ahora `moverLosPinos` va aparte y se
    llama también en la espera;
  - **cero plenos en veinte bolas** con el roce de pino a 0,10/s: los pinos se
    paraban en el sitio y la cadena no se propagaba. A 0,75 y con transferencia
    0,9: **3 plenos en 17 bolas**;
  - **la bola salía siempre recta** (35-35 exacto en todas las semillas) porque
    el bot calculaba la puntería solo al tirar, y el motor lee `p.apunta` del
    tick ANTERIOR. Es el mismo bicho del tenis. Ahora apunta siempre que sea su
    turno.
  Medido tras eso: 44-46 en 63 s, y por puntería: 0 pinos en la canaleta, 6 por
  el centro, 9 en el bolsillo. Gradiente simétrico.
  Y **la puerta no es la pista**: `MED_BOLOS` y `MED_CARRERA_OBS` llevaban la
  medida del juego de verdad (460x1500 y 800x600) y no cabían en el patio del
  colegio — la prueba de que están los ocho sitios lo cazó. La pista se monta
  aparte, en el centro del mapa.
  **Zurdazo del hockey** (pedido): el botón de cargar, con la puntería como
  dirección, y **cadencia de 1,1 s** — sin ella el bot lo disparaba cada
  fotograma (17 968 en un partido, medido) y nadie marcaba nunca. El choque con
  la paleta sigue siendo automático; el botón es el disparo que decides tú.
  Calibrado a **750-1 150** tras «muy fuerte el disparo» (empezó en 1 900, que
  cruzaba la mesa en medio segundo). Un choque empuja ~660, así que el botón va
  de un pelo más a casi el doble.
  Dos cosas que hubo que arreglar para que el zurdazo existiera de verdad:
  - **el choque automático lo pisaba el mismo fotograma.** El jugador avanza
    4,5 px, el disco todavía no, y la distancia bajaba de los 42 del contacto: un
    zurdazo de 1 250 salía convertido en un toque de 606 (medido en partido, con
    un banco aislado que sí daba 1 250). Ahora se separa 30 px más y **no se le
    pega a un disco que ya se va** más rápido de lo que corres;
  - **el bot dejó de embestir** y solo zurdaba, desde cualquier ángulo: 0-0 al
    reloj, porque el que defiende cubre la línea al palo. Ahora solo zurda
    **estando detrás del disco**, empujándolo hacia adelante — el mismo
    principio de siempre.
  Medido al final: bots **2-2 y 3-3** al reloj (antes, palizas de 0-5 en 17 s), y
  con un humano en **cualquiera de los dos asientos** gana 5-1 y 5-3. Que se
  pueda ganar desde los dos lados es lo que había que comprobar: con dos bots
  idénticos y sin azar, el resultado no depende de la semilla.
  **Antiatasco del fútbol** (pedido): a los 4 s sin que la pelota vaya a ninguna
  parte, al centro. El hockey ya lo tenía y el fútbol no, que es donde más pasa
  —diez jugadores y cuatro esquinas—. Hay prueba con la pelota clavada en una
  esquina.
  De paso, `enMinijuego()` en un solo sitio: la clase `partido` del CSS, el
  minimapa y los rótulos de las tarjetas preguntaban lo mismo y se les había
  ido contestando de una en una. El minimapa tapaba al jugador en la bolera.

- 2026-08-11 (claude-code): **el despliegue limpia solo**. El runbook decía "el
  `builder prune` tras cada build no es opcional" y aun así había que acordarse
  de teclearlo: en tres despliegues el disco pasaba del 77 % al 86 %, justo
  donde entra `vps-autoclean` a lo bruto. Ahora hay scripts y la limpieza no se
  puede olvidar.
  En el VPS, `/opt/florin-api/desplegar-salas.sh` y `desplegar-api.sh`: git,
  build, recrear el contenedor, y `builder prune` + `image prune` **en un
  `trap`**, así que limpian también si el build falla — que es exactamente
  cuando el disco está más justo. Imprimen disco antes/después, el commit
  desplegado y el estado del contenedor. `LEEME.md` ya documenta el script en
  lugar del comando a mano.
  En el repo, **`scripts/desplegar-web.sh`** para el cliente: build con
  `VITE_API`/`VITE_SALAS`, y la comprobación de `localhost` como **corte, no
  aviso** — si el bundle la trae, no sube nada y sale con 1. Verificado a mano:
  con las variables mal, aborta y producción se queda como estaba. También
  avisa si hay cambios sin commitear y comprueba que el `index.html` servido
  apunta al bundle nuevo.
  Gotcha que el propio script pisó al escribirlo: **`grep` sale con 1 cuando NO
  encuentra nada**, y con `set -o pipefail` eso mata el script justo en el caso
  bueno. De ahí el `|| true` dentro de las llaves.
  Limpieza de esta sesión: 86 % → 77 % (5,66 GB de caché de build y 5,2 GB de
  dos imágenes de rollback viejas de Coolify, dejando una por app).

- 2026-08-11 (claude-code): **la carrera de obstáculos, terminada**. Séptimo
  minijuego entero (`JUEGOS_LISTOS`: fútbol, tenis, vóley, básquet, hockey,
  lucha, carreraObs). **Cinco corredores**, tres vueltas, a pie.
  Es la hermana chica del modo carrera —mismas balizas en bucle y mismo "gana
  el primero"— con una regla propia: **los conos están EN la línea y tocarlos
  te tumba** (0,85 s). La curva corta pasa rozándolos, así que cada tramo es
  una decisión: por dentro y rápido, o por fuera y seguro.
  Óvalo de **ocho** balizas, no cuatro esquinas: con cuatro, la recta entre dos
  se saltaba media pista y el circuito era un rombo que nadie recorría.
  Tres cosas que costaron, todas medidas:
  - **el cono se re-disparaba** en cuanto se te pasaba el aturdimiento estando
    encima: 682 tropiezos en cinco minutos y ni una vuelta completa. Ahora te
    escupe fuera del cono y te da 1,2 s de inmunidad — un cono se lleva por
    delante UNA vez;
  - **ningún cono puede caer encima de una baliza.** Con un reparto propio de
    catorce conos sobre ocho balizas alguno caía en una, y el bot que lo
    esquivaba se quedaba clavado a 175 px, sin poder tocar el punto de paso:
    cuatro de cinco corredores atascados. Los conos se derivan ahora de los
    TRAMOS (dos por tramo, a un tercio y a dos tercios), y hay prueba de que
    ninguno cae sobre una baliza;
  - **el esquive del bot se topa al 55 % de lo que falta**: sin tope, con la
    baliza cerca el empujón lateral giraba el rumbo más de 90°, cancelaba el
    avance y el bot oscilaba justo fuera del radio.
  Medido: carreras de 38-42 s, ganadores distintos por semilla, todos con 2-3
  vueltas y ninguno atascado. Un humano que trace bien y no esquive gana por
  2-4 s — o sea, está reñido.
  De paso: los rótulos de la puerta tenían **tres ramas para la lucha, dos para
  el básquet y dos para el vóley** (de ampliar la cadena a trozos); las de
  abajo eran inalcanzables y el cartel mentía sobre cuánta gente juega.
  **Sin ver en movimiento**: el panel del navegador tenía `requestAnimationFrame`
  congelado, así que la pista, los conos, la meta y el marcador están
  verificados en el primer frame, y la carrera en sí por medición del motor.

- 2026-08-11 (claude-code): **el menú vuelve a hacer caso** («presiono la casa,
  selecciono otro escenario y no funciona bien»). El botón del minijuego se
  quedaba seleccionado de la partida anterior: elegías La Playa, dabas a Jugar
  y salía el minijuego en el colegio otra vez. Tres arreglos y un principio:
  - **tocar un escenario significa "quiero jugar AHÍ"**: si el modo elegido lo
    ignora (cualquier minijuego), `elegirEscenario` vuelve solo a la aventura;
  - los escenarios **ya no se deshabilitan** con un minijuego elegido — la
    lista que los bloqueaba estaba copiada a mano y se había quedado corta
    (sin tenis ni vóley), así que unos minijuegos bloqueaban y otros no;
  - **el tenis no tenía botón en el menú** (estaba terminado y solo se podía
    jugar desde la canchita del mundo) y a vóley/tenis les faltaba el rótulo
    del botón grande.
  De paso: `startGame` descarta `aventuraEnEspera` — empezar desde el menú
  enterraba mal una pichanga a medias y el cartel final ofrecía "Volver al
  barrio" hacia un estado de hace dos partidas (esa aventura ya está guardada
  desde que pulsaste la casa).
  **Pasada de humo en navegador**: los 8 modos del menú (aventura, carrera y
  los seis minijuegos listos) arrancan sin errores de consola, y el flujo
  minijuego → 🏠 → otro escenario → Jugar cae en la aventura del escenario
  elegido (verificado en La Playa).

- 2026-08-11 (claude-code): **la lucha del patio, terminada**. Sexto minijuego
  entero (`JUEGOS_LISTOS`: fútbol, tenis, vóley, básquet, hockey, lucha). Uno
  contra uno, primero a 5, dos minutos.
  Es sumo con chancla: el ring es un **círculo** y el punto es **sacar al otro**
  — no hay vidas ni golpes que contar, o estás dentro o no estás, y eso se ve
  sin mirar el marcador. Dos herramientas y las dos ya existían: **embestir**
  (corriendo, y cuanto más rápido vas más lo mueves) y **ablandarlo con la
  chancla**, porque a uno aturdido se le empuja el doble.
  Calibrado sobre lo que un empujón MUEVE (`v0/6,6` px, porque la velocidad
  impuesta se gasta al 11 % por fotograma): una embestida limpia mueve ~70 px y
  una sobre alguien aturdido ~140, en un ring de 250 de radio. Con los números
  de la primera versión (340 y ×2,4) un solo chanclazo te sacaba del centro de
  un golpe —218 px— y las peleas duraban nueve segundos.
  **Gotcha del motor, importante y general**: `knock()` NO mueve a un jugador.
  `applyKnock` solo se llama sobre ladrones y abuelas, así que un `knock` sobre
  una persona no la mueve ni un píxel — hay que empujarle la VELOCIDAD, que es
  lo que ya hacía el chanclazo. Se descubrió porque la prueba del empujón daba
  exactamente el mismo número con y sin aturdir.
  Y una del bot: en la lucha **la chancla es media pelea** y el bot solo la
  tiraba a 60 px (o sea, casi nunca) mientras un humano la tira desde lejos:
  3-0 en siete segundos a favor del humano. Ahora la tira desde 260.

- 2026-08-11 (claude-code): **el air hockey, terminado**. Quinto minijuego
  entero (`JUEGOS_LISTOS`: fútbol, tenis, vóley, básquet, hockey). Uno contra
  uno, primero a 5, dos minutos y medio de reloj.
  Es **el único que no usa la altura**: todo pasa a ras de mesa, y esa es su
  gracia — es de reflejos, no de parábolas. Y **no tiene botón**: la paleta
  eres tú y el disco sale al chocar, con lo que llevabas encima sumado. Por eso
  un disco esperado parado sale flojo y uno que sales a buscar corriendo sale
  fuerte: hay prueba de las dos cosas.
  Nadie cruza la línea del medio, como en tenis y vóley.
  Tres cosas que costaron y quedaron medidas:
  - **el bot se plantaba a 46 px del disco y el contacto son 42.** Cuatro
    píxeles de menos: 0-0 para siempre, con las dos paletas mirándolo. Es
    literalmente el mismo bicho del bot futbolista, y el mismo arreglo — al
    llegar detrás, apuntar AL ARCO y atravesarlo;
  - **apunta a un palo, no al centro**: al centro las para todas el que
    defiende, porque cubre justo esa línea;
  - **el disco no se queda muerto.** A los 3 s quieto vuelve al centro, y hay
    reloj. Sin lo primero, dos de cada tres partidos entre máquinas no acababan
    (3-0 eterno); sin lo segundo, un humano plantado en su arco tampoco los
    acaba — el disco se mueve, pero nadie marca.
  Medido con eso: 5-0 y 5-2 en 65-126 s entre máquinas, y todos acaban.
  Gotcha del HUD, el mismo del fútbol y ya van dos: el hockey **no** es partido
  para `elPartido()` —no tiene botón que enseñar— pero sí para las tarjetas.
  Sin eso el marcador salía bien debajo de un cartel que decía "DINERO 2:30".

- 2026-08-11 (claude-code): **el básquet, terminado**. Cuarto minijuego que se
  juega entero (`JUEGOS_LISTOS`: fútbol, tenis, vóley, básquet). **Tres contra
  tres**, primero a 11, tres minutos de reloj.
  Lo que lo separa del fútbol —que también es dos equipos y una pelota— es que
  aquí la pelota **se lleva**: se recoge sola al llegar (62 px), va botando
  delante de ti, y **de un chanclazo se le cae al que la lleva**, que es toda
  la defensa que este juego necesita. Los aros son círculos de verdad en el
  suelo: visto desde arriba, la canasta es la pelota entrando **cayendo**
  (`vz < 0` y a la altura del aro), que es justo lo que se ve desde arriba.
  **La decisión del tiro no es apretar en el momento justo** —eso ya se probó
  en el vóley y era una lotería—, sino **desde dónde tiras**. El error es un
  radio que crece con la distancia y con el defensor que tengas encima, y la
  canasta mide 44: aciertas `44/err`. Calibrado y medido: la bandeja (90 px)
  entra siempre, de media (200) entra el 65 %, de 300 el 43 %, y el triple
  ronda un tercio — que por eso vale tres. Aguantar el botón afina hasta un
  45 %, pero no arregla la distancia.
  Medido con bots: 40-50 % de acierto, partidos de 47 a 65 s, y en 3v3 salen
  11-10 (en 1v1 y 2v2 gana casi siempre el equipo 1, por eso se arma 3v3).
  Y medido como humano —uno que va a por la pelota y tira cerca del aro—:
  **la agarra 4-6 veces por partido y gana 12-8 en 3v3**.
  Gotcha, el tercero de la misma familia: la pelota del básquet también tenía
  que entrar en `balonEnElAire`. Con el rozamiento de rodar aplicándose en
  vuelo, 131 tiros acabaron en 0 canastas — la parábola se calcula al tirar y
  el roce la dejaba corta. Es el mismo fallo que ya se pagó en el saque de
  vóley: **cualquier pelota cuya trayectoria se resuelva al golpearla tiene que
  estar en esa lista**.

- 2026-08-11 (claude-code): **en el vóley la pelota se toca sola** («parece que
  nunca toco el balón»). La sesión anterior arregló *llegar* (del 36 % al 97 %
  de pelotas alcanzables) y eso no bastaba, porque llegar y TOCAR no son lo
  mismo: el toque tiene 178 px y unas tres décimas buenas, y desde la pantalla
  no hay forma de saber cuándo estás dentro. Medido con un "humano" que corre
  bien pero no acierta botones: **tocaba 0 pelotas** —y en dobles el compañero
  de la máquina jugaba el punto entero (24 toques) mientras tú mirabas—.
  Con el toque automático: **18 a 23 toques por partido**. Descartado de paso
  que el compañero robara la bola: el 75 % de los toques del equipo ya eran del
  asiento 0.
  Ahora en vóley **basta con llegar**: si la tienes al alcance, la tocas. El
  botón deja de ser "tocar" y pasa a ser "rematar" — aguantándolo, el toque
  sale de remate en cuanto la alcanzas. En el tenis NO se hizo: allí el bote te
  da tiempo y acertar el golpe es el juego; aquí el juego es colocarse.
  Además: el aro de la caída se cierra y se rellena cuando ya la tienes al
  alcance; el tercer toque (que cruza obligado) sale con media fuerza aunque no
  hayas cargado, o caía detrás de la red y era un regalo; y el brío del bot
  baja a 0,38 — con eso los partidos entre máquinas siguen saliendo 4-5, 5-4,
  5-3 y acabando solos.

- 2026-08-11 (claude-code): **el vóley, jugable de verdad** («no chapo ni una
  bola»). Estaba calibrado contra bots que resuelven la parábola; un humano no.
  Se midió lo que un humano puede hacer —correr a 268 px/s con 0,25 s de
  reacción— contra dónde va a caer cada pelota que cruza la red: **llegaba al
  36 %**. Ahora, al 81 % en individual y al **97-100 % en dobles**.
  Tres cambios, y el orden importa:
  1. **La pelota, mucho más generosa**: vuelo de 1,25-1,45 s (era 0,92-1,45),
     saque de 1,55 s, alcance 178 y techo 230, y cancha más chica (1180×620).
  2. **Dos palancas separadas, no una.** Con la pelota así de generosa el bot
     tampoco falla nunca: 0-0 en cinco minutos, el mismo precipicio del tenis.
     La pelota decide si llegas TÚ; el brío del bot decide si llega ÉL.
     `VOLEY_BRIO = 0.44` (el tenista corre a 0,68) abre la banda en la que tú
     llegas y él no. Medido: 5-3, 3-5, 5-2 en 60-90 s, con 5-6,5 toques por punto.
  3. **Se arma DOS CONTRA DOS.** Individual tapas media cancha entera tú solo;
     con compañero, casi todas. Y el vóley es de equipo: pasarle al otro es
     medio juego.
  Y lo que un humano no puede sacar de la pantalla: **dónde va a caer**. La
  sombra del trasto va debajo de la PELOTA, no de donde acabará. Ahora hay un
  aro punteado en la arena, verde si cae de tu lado y rojo si del otro.

- 2026-08-11 (claude-code): **el vóley, terminado**. Es el tercer minijuego que
  se juega entero, y salió barato porque es el esqueleto del tenis con **una
  regla menos y una más**:
  - **el suelo no es legal**. En tenis un bote te da tiempo; aquí tocar el suelo
    ES el punto. Eso es lo que obliga a jugarla siempre en el aire.
  - **tres toques por lado**. Con uno solo esto sería tenis sin botes. Los tres
    son lo que convierte el punto en levantar–colocar–rematar, y por eso la
    carga del botón elige entre PASAR (se queda de tu lado, bien alto, cayendo
    encima de ti) y REMATAR (cruza). **El tercer toque cruza sí o sí**: si no,
    un lado podría quedarse la pelota para siempre.
  Estaba escrito como un juego **de perfil** —gravedad hacia abajo en `y`, red
  horizontal, la pelota cayendo al borde de abajo— dentro de un juego que se ve
  desde arriba, y con los equipos partidos izquierda/derecha contra una red
  horizontal. Ahora la altura va donde va la de todos: en la `z` del trasto, la
  misma que trajo el fútbol y usa el tenis.
  Lo que hubo que medir para que fuera un partido y no una tanda de saques:
  - **el rozamiento**. La excepción de "mientras vuela no la frena el roce"
    estaba escrita solo para el tenis; en vóley el saque se quedaba corto y caía
    en su propio campo: partidos enteros de saques fallados, 4-5 con CERO toques.
  - **"si la mandas, ya no es tuya"** (`enviada`). Sin eso, el que sacaba volvía
    a darle a su propio saque mientras le sobrevolaba su campo, la reapuntaba
    tarde y el de enfrente no llegaba nunca: 5-0 en todas las semillas.
  - **el pase cae encima de ti**, no en un punto fijo del campo. Apuntado a un
    sitio fijo, la levantada salía a medio campo de quien la daba —hasta 700 px,
    con 1,3 s de vuelo— y los bots veían caer su propia pelota.
  Medido con eso: **4-5 en 70 s con 4,67 toques por punto** en individual, y
  5-4 / 4-5 en metro y medio de minuto con 7,8 toques por punto en dobles.
  El bot es el del tenis con otra cabeza: se pone donde va a caer, levanta la
  primera y remata la segunda, y corre al 0,68 como el tenista.
  `JUEGOS_LISTOS` ya son tres (fútbol, tenis, vóley): la cancha aparece sola en
  el patio del colegio, en su zona del Multiverso y en el menú.
  De los que siguen a medias —básquet, bolos, lucha, dardos, carrera,
  laberinto, billar, hockey— no ha cambiado nada: siguen con `listo: false`.

- 2026-08-11 (claude-code): **arreglado el cruce entre el patio y los
  minijuegos**. Los nueve minijuegos nuevos (básquet, bolos, lucha, dardos,
  vóley, carrera, laberinto, billar, hockey) se armaban desde el CLIENTE
  rellenando el estado (`aLaCanchaDeBasquet(G)`) sobre una partida de
  **aventura**, y el modo se quedaba en `"aventura"`. Consecuencia: el partido
  se dibujaba encima del patio y debajo seguían corriendo los ladrones, el
  desfile y los puestos —te robaban a media pichanga— y el cartel de "Jugar
  básquet" volvía a salir DENTRO del básquet, porque el sitio seguía puesto.
  El arreglo, de raíz: **el modo ES el juego**. `Reglas.modo` incluye ahora
  todos los `JuegoDeSitio`; una sola tabla `ARMAR` en `estado.ts` dice quién
  monta cada cancha y otra `PASOS` en `simular.ts` quién la avanza; `avanzar`
  despacha por MODO y no por «qué campo hay lleno»; y `crearPartida` **apaga el
  barrio ahí dentro** (`vecinos`, `puestos`, `patiosExtra` a false) aunque quien
  llame pida lo contrario — olvidarlo no daba un error, daba un partido con
  ladrones. El cliente ya no importa ni llama ninguna función de armado del
  motor (que es lo que había provocado dos commits seguidos de "fix: importar…").
  **Y solo se cuelgan los que se juegan.** Cada entrada de `SITIOS` lleva
  `listo`, y `JUEGOS_LISTOS` es lo que ve el mundo y también el menú del
  cliente. Hoy: fútbol y tenis. Medido con dos bots a cinco minutos, de los
  otros nueve **ninguno se termina jugando**: básquet y lucha acaban 0-0 por
  reloj; bolos, vóley, billar y hockey no acaban nunca; el laberinto se queda a
  medias; la carrera se "gana" en 21 s porque los puntos de paso son las cuatro
  esquinas y no hay nada que recorrer; y `pasoDardos` está **vacío**. A los
  nueve les falta además su rama en `pensarBot`, así que el rival no juega.
  Su código queda entero: para estrenar uno, se le termina y se le pone
  `listo: true` — aparece solo en el mundo y en el menú.
  Prueba nueva que fija el invariante ("un minijuego apaga el barrio"): los once
  modos se arman, ninguno deja vecinos/puestos/patios encendidos, ninguno cuelga
  sitios dentro de sí mismo y ninguno saca ladrones ni desfile en 40 s.
  Gotcha aparte: `drawBolos` leía `b.pinos`/`pin.levantado`, que no existen en
  el estado (`pinLugar` + `pins`) — con la bolera colgada, entrar reventaba el
  dibujado entero.

- 2026-08-11 (claude-code): **el tenis**, el segundo minijuego, por la puerta
  que se generalizó ayer. Cancha de tierra con red, pasillos y cuadros de saque
  en el patio del colegio y en su zona del Multiverso: te metes, sale «🎾 Jugar
  tenis · uno contra uno», y al acabar vuelves a tu aventura como la dejaste.
  El motor da para dobles (`TENIS_MAX = 4`); desde la puerta se arma individual.
  **Tres reglas y ninguna más** (`e.tenis`, `pasoTenis`): la pelota tiene que
  caer del otro lado, hay que devolverla antes del segundo bote, y a la red no
  se le pega. Todo sale de dos números —quién le dio el último y cuántas veces
  botó desde entonces—. Nadie cruza la red. Primero a 7 puntos, saca el que
  ganó el punto.
  **Un solo botón** (el mismo de patear, con 🎾): la carga manda el FONDO y la
  puntería el LADO. El vuelo se resuelve al revés que en el fútbol —se elige
  dónde cae y se despeja la fuerza—, y eso es lo que garantiza que pase por
  encima de la red y que apuntar mal no signifique mandártela a tu propio campo.
  Detalles que costaron medir:
  - la pelota del tenis **no se empuja al pisarla** ni aturde a nadie en el aire,
    y mientras vuela **no la frena el rozamiento de rodar** (0,12/s se comía tres
    cuartos de la velocidad en 0,7 s y la parábola calculada no se cumplía);
  - la **red se mira por el CRUCE**, no por la cercanía: a 1 300 px/s se saltaba
    la franja entera entre dos fotogramas;
  - **fuera solo cuenta antes del primer bote**. Con el "fuera" a secas, cada
    pelotazo bien puesto era punto en contra del que lo dio: 7-0 en 28 s, medido;
  - el bot **no persigue la pelota: se pone donde va a picar**, y su puntería se
    calcula SIEMPRE (no solo al golpear), porque el motor lee `p.apunta` del tick
    anterior — calculándola al golpear, devolvía todo a las manos del rival y el
    punto no moría nunca (99 px de carrera por golpe, con un brazo de 100).
  **Calibración, después de que el balón saliera muy veloz**: vuelo de 0,92 a
  1,30 s (era 0,62–0,88), saque de 1,15 s, alcance 124. Y como con la pelota
  lenta los bots lo devolvían TODO (273 golpes, 0 puntos en 5 min), se les puso
  reacción (`REACCION`, no arrancan hasta que la pelota se acerca a la red) y
  **brío 0,68** — la reacción sola no sirve de palanca: o no devuelven ni el
  saque o lo devuelven todo, porque llegar o no llegar es un salto y no una
  cuesta. Medido con eso: partidos de 7-3, 7-6, 7-1, 4-7, 6-7, 7-3, entre 49 s y
  2:20, y todos terminan.
  De paso: el cantero del colegio se comía la esquina de la cancha (el decorado
  fijo se escribió cuando no había minijuegos; el que se cruce ya no se pinta), y
  el cartel del sitio pasó a ir DENTRO del borde de arriba — fuera se montaba
  con el de la Ruleta y no se leía ninguno.
  Próximo, por costo: el vóley es casi el mismo esqueleto (red, bote, dos lados)
  y sale barato; el surf de la Costa Verde no reusa nada y merece ser su propio
  proyecto. Y sigue pendiente lo de siempre: **el 5v5 online nunca se probó con
  dos personas de verdad**.

- 2026-08-10 (claude-code): **la puerta de los minijuegos, generalizada** (paso
  previo al tenis). `e.cancha` —que era literalmente *la cancha de fútbol del
  colegio*— pasa a ser `e.sitios: SitioDeJuego[]`, y `p.enLaCancha` (booleano) a
  `p.enSitio: JuegoDeSitio | null`, que dice A QUÉ has entrado. Buscar hueco,
  el cartel, el botón de acción y el guardar-y-volver son ahora comunes: el
  siguiente minijuego trae SUS REGLAS y nada más.
  **El tenis NO está hecho.** Su entrada en `SITIOS` (en `estado.ts`) está
  escrita y comentada: descomentarla cuelga la cancha con su cartel y su botón,
  pero antes hay que escribir las reglas —red, bote, punto, marcador— y una
  rama en `pensarBot`. Lo que ya juega a favor: el balón tiene altura (`z`,
  `vz`, gravedad y botes), que es justo lo que el tenis necesita y lo que no
  existía antes del fútbol.
  Próximo, por costo: tenis y vóley son casi el mismo esqueleto (red, bote, dos
  lados) y salen baratos; el surf de la Costa Verde no reusa nada y merece ser
  su propio proyecto.

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
