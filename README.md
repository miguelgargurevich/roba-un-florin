# 🩴 Roba un Florín — Chancla Edition

Juego de navegador en un solo archivo HTML. Roba **Florines** (bloquecitos de tierra con su flor y su carita) de las vitrinas de tus vecinos, llévalos a tu patio para que te generen dinero, y defiéndelos a puro **chancletazo**.

Inspirado en el género "roba un brainrot" y en Florín, la mascota del youtuber Invictor.

**Jugar:** abre `index.html` en cualquier navegador. No necesita servidor, ni instalación, ni conexión.

---

## Cómo se juega

| Paso | Qué hacer |
|---|---|
| 💰 Ganar dinero | Cada Florín en **tu** vitrina paga por segundo. Solo cuenta si está en uno de tus patios. |
| 💃 Cazar | Del **portal** del centro sale un Florín cada 6 s que rodea la Armería: atrápalo al pasar. |
| 🏃 Robar | Métete a una base vecina y quédate junto a un Florín hasta llenar el aro rosa. |
| 🏡 Crecer | Compra el **Patio 2** ($4 000) y el **Patio 3** ($12 000) metiéndote en su reja. |
| 👵 Esquivar | Cada base tiene su abuela. Si te alcanza, sueltas el Florín y quedas mareado. |
| 🩴 Defender | Lanza la chancla a ladrones y abuelas: los noquea y les hace soltar lo que cargan. Vuelve como bumerán. |
| 🛡️ Blindar | Párate en la **placa de láseres** de tu patio: $800 y nadie entra por un minuto. |
| 🎰 Apostar | La **Ruleta** ($1 200) es la única forma de sacar las cuatro variantes ✨ 🌈 👻 👑. |
| 🎯 Hitos | Cada **$60 000** celebras un hito y la partida **sigue**: no se acaba nunca. |

## Escenarios

Antes de jugar eliges dónde, y la elección se recuerda:

| Escenario | Qué hay |
|---|---|
| 🏘️ **El Barrio** | **casas** de fachada de colores, techo de calamina y su tanque de agua, alineadas a las dos veredas · postes de luz, tendederos con ropa, bolsas de basura y **rayuelas** con tiza de colores · y **bicis, patinetas y pelotas** con las que se juega (ver *Los trastos*) |
| 🏫 **Sta. Teresita** | el patio del colegio: cancha pintada, canteros con césped y bordillo de ladrillo, palmeras, arbustos recortados, bancas, la **bandera del Perú**, el emblema **ST** en el suelo y las **rayuelas del recreo** |
| 🏖️ **La Playa** | **mar con orilla y espuma** (solo se entra con tabla), **castillos de arena** con banderitas y palita, sombrillas, toallas, conchas y estrellas de mar · y **tablas de surf, flotadores y pelotas** |
| 🌵 **El Desierto** | tierra rajada, saguaros (algunos con flor), rocas, calaveras de vaca, letreros de "NI AGUA" · y **tablas de arena y matas rodadoras** que se patean |
| 🏔️ **Machu Picchu** | andenes escalonados con su muro de sillares, ruinas de piedra con puertas trapezoidales, **llamas** con su borla de lana, matas de ichu y jirones de neblina · patinetas y pelotas |
| 🗽 **Nueva York** | asfalto, dos avenidas con línea amarilla y pasos de cebra, azoteas de rascacielos con tanque de agua y aire acondicionado, **taxis amarillos**, hidrantes y alcantarillas echando vapor · patinetas y bicis |
| 🐫 **Egipto** | dunas, **pirámides** escalonadas con su remate dorado, la **esfinge** con el nemes rayado, obeliscos con jeroglíficos, palmeras datileras y cráneos resecos · tablas de arena y matas |
| 🐊 **El Amazonas** | la espesura, **el río al sur** (solo se cruza con tabla o flotador), árboles enormes con lianas, nenúfares gigantes en flor, **caimanes**, guacamayos, monos, ranitas y helechos |

Las **reglas son las mismas** en los cuatro, y la columna del centro (portal,
Armería y Ruleta) no se mueve nunca: lo que cambia es el sitio y por dónde te
vienen.

El suelo y todo su decorado se pintan **una sola vez** por partida en un canvas
del tamaño del mundo y luego solo se estampa, así que el decorado puede ser todo
lo rico que quiera sin costar nada por frame.

### La rayuela

Está dibujada como se juega de verdad, cada casilla con su tiza de color: **1**,
**2** y **3** sueltos, **4 y 5** en la misma línea, **6** suelto, **7 y 8** en la
misma línea, **9** suelto y el **10** grande arriba, con el techo redondeado. Hay
rayuelas en el Barrio y en el colegio.

## Cuando te roban

Si un vecino se pone a robarte salta una **alarma**: banda roja con quién es y de
qué patio, sonido de sirena, el patio parpadeando en el minimapa y —lo más útil
con un mapa tan grande— una **flecha en el borde de la pantalla** apuntando al
robo, con la distancia en píxeles, cuando te pilla lejos.

Un Florín tirado en el suelo lo puede recoger cualquiera: si le pegas a un ladrón que huye, se te cae ahí y puedes recuperarlo.

## Controles

**Teclado y ratón** — `WASD` / flechas para moverte · `espacio` o **clic** para usar el arma · `1`–`0` o `Q`/`E` cambiar de arma · `N` bautizar (o **bajarte** si vas montado) · `B` álbum · `T` Armería · `R` Ruleta · `P` pausa · `M` sonido

**Táctil (celular y iPad)** — arrastra en una mitad de la pantalla para el joystick · toca el botón rosa para usar el arma · toca el **botón del arma** abajo para abrir la lista y cambiarla

Funciona **en vertical y en horizontal**. Al tumbar el móvil el HUD se compacta
para que quepa en los ~390 px de alto y se respetan los recortes del notch.

### La partida no se acaba

Llegar a $60 000 ya no corta el juego: se celebra el hito, la barra se vuelve a
llenar hacia el siguiente ($120 000, $180 000…) y sigues jugando. La idea es
coleccionar, así que juega hasta que te aburras. En **2 jugadores** sí es un
duelo: gana el primero que llega a $60 000.

### Los paneles se abren tú

La **Armería** y la **Ruleta** ya no se abren solas al pasar por encima. Estar en
el puesto **enciende** su botón de la barra superior (🧰 y 🎰, o teclas `T` y `R`)
y tú decides cuándo abrirlo. Si te alejas, se cierra solo.

### Apuntar

El arma no sale solo hacia donde caminas: puedes elegir la dirección.

- **Con ratón:** va hacia el cursor. Una línea punteada te muestra el rumbo y la mirilla marca el **alcance real** del arma, así ves si llegas o no.
- **En táctil:** mantén el botón rosa y **arrastra** en la dirección que quieras; suelta para lanzar. Un toque simple (sin arrastrar) lanza hacia donde caminas, como antes.
- La guía se adapta al arma: línea y mirilla para la chancla y la congeladora, el cono para la secadora, y el radio de la descarga para la chicharra.

### Ponerle nombre a tus Florines

Acércate a un Florín de tu vitrina y pulsa `N` (o el botón verde ✏️ en táctil) para bautizarlo. El nombre aparece en una etiqueta sobre el bloque, y **viaja con él**: si te lo roban verás *"¡Mayo se llevó a Pepito!"*, llega con su nombre a la vitrina del ladrón, y lo conserva cuando se lo quitas de vuelta. El juego se pausa mientras escribes.

### Dos jugadores en la misma pantalla

Desde la portada, botón **2 jugadores**. Cada uno tiene su patio: J1 abajo a la izquierda (verde), J2 abajo a la derecha (naranja).

| | Jugador 1 | Jugador 2 |
|---|---|---|
| Moverse | `WASD` | flechas |
| Chancla | `espacio` | `.` (punto) |

Los dos compran en el Vivero con su propio dinero, roban en las casas vecinas **y también se roban entre ellos**. Un chancletazo al rival lo deja mareado y le hace soltar el Florín que llevaba. Gana el primero que llegue a $60 000.

La cámara se abre sola para que los dos quepan en pantalla. En este modo solo se usa la chancla: la armería, la ruleta y los patios extra quedan cerrados para que la pelea sea pareja. El desfile del portal y los láseres sí funcionan, así que los dos pueden salir corriendo a por el mismo Florín.

### Salas de amigos (en construcción)

El motor ya reparte los sitios para **hasta 5 jugadores**, que es el paso previo
a las salas online. El mapa no cambia: hay un patio y cuatro casas de vecinos, y
**cada jugador de más ocupa una casa y el bot que vivía ahí deja de existir**.

| En la partida | Humanos | Bots robando |
|---|---|---|
| Solo | 1 | 4 |
| Con un amigo | 2 | 3 |
| Con dos | 3 | 2 |
| Con tres | 4 | 1 |
| Llena | 5 | 0 |

Así el juego es literalmente lo que promete: los vecinos que te roban son tus
amigos. Con compañía los dos patios comprables quedan cerrados — están pegados
al del primer jugador y le darían una ventaja de salida que nadie puede igualar.

Los **hitos son de cada jugador**: antes eran del estado y solo los contaba el
jugador 1, lo que en una sala habría dejado a los demás sin celebrar nunca nada.

Lo que gobierna una partida ya no es un "modo 1 o 2" sino cuatro reglas sueltas
(`patiosExtra`, `todasLasArmas`, `puestos`, `duelo`), porque una sala quiere
todas las armas y los puestos abiertos —como el modo solo— pero sin patios
comprables —como el duelo—, y con un número esa combinación no se podía decir.

Falta el servidor de salas, el lobby y el modo en red. El duelo de sofá se
retira cuando eso funcione, no antes.

### Modo zurdo

El botón **✋** de la barra superior voltea todos los controles: el botón de arma pasa a la izquierda, y las armas, el minimapa y el joystick al lado contrario. Queda guardado para la próxima vez que entres.

## Tus patios

Empiezas con un patio de 6 pedestales, y en el modo de un jugador puedes comprar
dos más metiéndote en su reja: el **Patio 2** por $4 000 y el **Patio 3** por
$12 000. Cada uno son 6 pedestales extra, y los ingresos de los tres se suman.
Entregas en el patio donde estés parado; si está lleno, va a otro tuyo.

Los tres están juntos en la esquina suroeste del mapa, para que defenderlos no
te obligue a cruzar el barrio en diagonal.

### Seguridad láser

Cada patio tuyo tiene una **placa de activación** en una esquina. Te paras encima
un segundo, se cobran **$800** y el patio queda cerrado **60 segundos**: ningún
ladrón entra, y el que estuviera dentro sale despedido y suelta lo que cargaba.
Cuando se apaga, la placa tarda **30 segundos** en recargar — ese hueco es el
precio de la tranquilidad. Si sigues encima cuando recarga, se vuelve a encender
y te vuelve a cobrar.

Los láseres protegen el patio, **no la pasarela**.

## Las 15 rarezas

Cada rareza cambia el material del bloque y su flor. La rareza se ve en la
píldora de color sobre cada bloque:

| Florín | Rareza | Bloque | Precio | Ingresos |
|---|---|---|---|---|
| Común | Común | tierra con pasto, amapola roja | $100 | 3/s |
| Bailarín | Fiestero | flor amarilla, se contonea con notas ♪ | $340 | 9/s |
| Girasolón Turbo | Raro | girasol que gira, con llamas de cohete | $950 | 24/s |
| Ninja | Épico | podzol oscuro, allium morado y banda roja | $2 400 | 58/s |
| Chancletín Florido | Legendario | flor rosa y su chanclita de la suerte | $5 600 | 135/s |
| Rey Sol | Mítico | bloque de oro con corona | $13 000 | 310/s |
| Cósmico | Cósmico | obsidiana morada, anillo orbital y chispas | $31 000 | 720/s |
| Cebichero | Sabrosón | bloque de leche de tigre, con su limón y su ají bailando | $42 000 | 950/s |
| Futbolero | Hincha | césped con las líneas de la cancha, banda blanquirroja y pelotita botando | $55 000 | 1 250/s |
| Chasqui | Mensajero | piedra, vincha roja con oro y un quipu de hilos colgando | $72 000 | 1 600/s |
| Robot | Cibernético | metal con tornillos, antena y su ojo rojo parpadeando | $94 000 | 2 100/s |
| Momia | Milenario | arena con vendas cruzadas y los ojos brillando en la rendija | $122 000 | 2 700/s |
| Astronauta | Orbital | traje blanco con visor y un satélite dándole vueltas | $158 000 | 3 500/s |
| Inca de Oro | Imperial | oro macizo con rayos de sol y su tumi | $205 000 | 4 500/s |
| Amaru | Ancestral | escamas verdes oscuras y la serpiente enroscándose detrás | $265 000 | 5 800/s |

Las ocho últimas suben suave a propósito (×1.3 por escalón, no ×2.4 como las de
arriba): lo que las hace especiales es que salen poco y se ven distintas, no que
paguen una fortuna. Y van **después** del Cósmico y nunca intercaladas, porque el
número de rareza se guarda en tu partida y en cada lámina del álbum: meter una en
medio convertiría tu Cósmico en otra cosa.

### Dieciocho especies de flor

La rareza pone los **colores** (para que se siga leyendo de un vistazo lo que vale
cada Florín), pero la **forma** la pone la especie, sorteada al nacer: amapola,
margarita, tulipán, campanilla, girasol, orquídea, cactus, estrella, pompón,
trébol, **cantuta** (la flor nacional), rosa, loto, ave del paraíso, hongo, diente
de león, hibisco y bambú. Cada una tiene sus pétalos y sus hojas — el cactus
cambia el tallo por una pala con espinas, el hongo es un sombrerito con lunares y
el diente de león lleva su pelusa en cada punta.

Así dos Comunes ya no son el mismo dibujo. La especie **viaja con el Florín** igual
que el nombre: si te lo roban, llega así a la vitrina del ladrón. Puedes ver de
qué especie es acercándote y mirando el panel de bautizo.

### Variantes especiales

Solo salen de la **Ruleta**, y **viajan con el Florín** igual que el nombre: si te
lo roban, llega así a la vitrina del ladrón y lo conserva cuando lo recuperas.

| Variante | Ingresos | Aspecto |
|---|---|---|
| ✨ Brillante | ×2 | aura blanca con destellos girando |
| 🌈 Arcoíris | ×3 | aura que cambia de color |
| 👻 Fantasma | ×4 | el bloque se transparenta y se le ve el pedestal detrás |
| 👑 Dorado | ×5 | aura dorada que late, con ocho destellos de oro |

### El álbum

Botón **📖** de la barra superior (o tecla `B`): las 75 láminas (15 rarezas × 5
variantes), con precio e ingresos, y cuáles has llegado a tener. Se guarda entre
partidas. Un Florín entra al álbum cuando lo dejas en tu vitrina.

## La pasarela

Arriba, en el centro exacto del mapa, hay un **portal**. Cada **6 segundos** sale
de ahí un Florín que baja en línea recta, le da **una vuelta completa a la
Armería** y se vuelve a meter por donde salió.

El portal, la Armería y la Ruleta comparten la columna del centro
(`x = WORLD_W/2`), así que el eje del mapa es esa vertical.

Esos Florines **no son de nadie**: si quieres uno, tienes que **atraparlo al pasar**
igual que robas de una vitrina — te pegas a él y aguantas hasta llenar el aro,
solo que este se te está moviendo. Si nadie lo atrapa, el portal se lo traga y
sale otro.

Cuál sale es un sorteo por rareza, así que la mayoría son Comunes y el Cósmico
aparece muy de vez en cuando. Cada Florín lleva su píldora de rareza y se ve en
el minimapa con el color de su rareza: de un vistazo sabes si vale la pena
cruzar el barrio corriendo.

El recorrido tarda unos 26 s, así que con uno saliendo cada 6 s suele haber
cuatro o cinco desfilando a la vez. Los vecinos los ignoran (no son suyos), y en
dos jugadores ambos pueden competir por el mismo.

Como el Vivero ya no existe, el desfile es tu fuente principal de Florines: el
dinero se guarda para patios, armas, láseres y la Ruleta.

## La ruleta

Abajo en la columna del centro, $1 200 por tirada. Once casillas: Florines de todas las
rarezas, dinero ($500 o $2 500), un arma al azar con 2 usos, y la casilla **???**.

La **???** es la interesante: de ahí salen las cuatro variantes, con el
**Cósmico Arcoíris** (2 160/s) como premio gordo. El Florín premiado te llega a
las manos, o al suelo si ya vas cargado.

## Las armas

Se compran en la **Armería de la cuadra**, el puesto con toldo de rayas que ahora
está en el centro del mapa, rodeado por el desfile:

| Arma | Precio | Efecto |
|---|---|---|
| 🩴 Chancla | gratis, ∞ | Bumerán, noquea 3.6 s |
| 🍌 Cáscaras | $500 · 3 usos | La sueltas al piso: quien la pise resbala 4 s y suelta |
| 🥤 Refresco Turbo | $700 · 2 usos | +75 % de velocidad por 9 s |
| 🧊 Congeladora | $900 · 3 usos | Congela 7 s |
| ☂️ Paraguas | $1 100 · 2 usos | Aguanta el próximo golpe sin que sueltes nada, y te da 0.9 s de margen |
| 🐕 Chihuahua | $1 400 · 2 usos | 20 s persiguiendo ladrones dentro de tus patios |
| 💨 Secadora Turbo | $1 500 · 4 usos | Ráfaga en cono, los manda a volar |
| 🕸️ Red | $1 600 · 3 usos | Caza al instante un Florín del desfile desde 380 px, sin esperar el aro |
| ⏱️ Reloj de abuela | $1 800 · 2 usos | Ladrones y abuelas al 40 % durante 6 s |
| 👻 Capa Invisible | $1 900 · 2 usos | Las abuelas no te ven por 8 s |
| 🧲 Imán ladrón | $2 000 · 3 usos | Jala un Florín vecino desde 320 px, sin acercarte |
| ⚡ Chicharra | $2 600 · 3 usos | Descarga alrededor, noquea 5 s |
| 🛸 Rayo alien | $3 400 · 2 usos | El platillo se lo lleva 10 s y lo devuelve en su casa |

La **red** es la que cambia cómo se juega el desfile: sin ella tienes que
alcanzar al Florín y aguantar el aro mientras se mueve, y con ella cazas de lejos
al que pase — muy útil para el Cósmico que sale una vez cada mucho.

## Los vecinos que te roban

Cada base manda su propio ladrón, con su maña:

- **Mayo** (base amarilla) — el más lento, pero siempre va por tu Florín más caro
- **El Sobri** (base rosa) — velocidad normal, agarra al azar
- **La Prima Yuli** (base fucsia) — la más rápida del barrio, pero conformista: solo carga Común, Fiestero o Raro
- **Los Marcianos** (base morada) — van por el más caro y cada 5 s dan un salto de teletransporte, así que cuesta acertarles

Más casas no significa más ladrones: solo viene uno por visita, así que lo que
suma es la variedad.

El ritmo de los robos depende de **tu vitrina, no del reloj**: con un solo Florín
pasan ~23 s entre visitas; con la vitrina llena de Florines caros, cada 10 s. Si
te desvalijan, aflojan y te dan tregua para recuperarte.

## Los trastos del escenario

Cada escenario tiene cosas con las que se juega, y no son decorado: viven en el
motor, así que en dos jugadores los dos ven la misma pelota rodar.

| Escenario | Qué hay |
|---|---|
| 🏘️ **El Barrio** | 4 bicicletas, 3 patinetas y 8 pelotas |
| 🏫 **Sta. Teresita** | 4 patinetas y 7 pelotas por el patio del recreo |
| 🏖️ **La Playa** | 3 tablas de surf y 2 flotadores en la orilla, y 6 pelotas |
| 🌵 **El Desierto** | 3 tablas de arena y 7 matas rodadoras |

**Montarse** es automático: pisas la bici y ya vas encima. Te bajas al **agarrar
un Florín**, al recibir **cualquier golpe** (queda tirada donde caíste, y la
recoge quien pase) o pulsando `N`.

| Vehículo | Velocidad |
|---|---|
| 🚲 Bicicleta | ×1.6 |
| 🏂 Tabla de arena | ×1.5 |
| 🛹 Patineta | ×1.45 |
| 🏄 Tabla de surf | ×1.7, **solo en el agua** |
| 🛟 Flotador | ×1.15, **solo en el agua** |

Como agarrar un Florín te baja, el vehículo es **puro transporte**: sirve para
llegar, no para escapar con el botín. Por eso no hay nada que reequilibrar.

**Patear**: pasa por encima de una pelota o una mata rodadora y sale disparada
en la dirección en la que ibas, con la fuerza de lo rápido que corrías. Rebota
en los bordes y se frena sola. **No hace daño a nadie**: es un juguete.

### El mar

En la playa el agua **no se pisa**: a pie te frena en la orilla. Con una tabla o
un flotador sí se entra, y el mar pasa a ser un carril rápido por el sur del
mapa. Las tablas nacen en la arena, no mar adentro — si nacieran dentro serían
inalcanzables, porque el tope de la orilla te para antes de llegar. Fuera de su
elemento el trasto no acelera: la tabla en la arena la llevas a cuestas (×0.9).

Los ladrones y las abuelas tampoco entran al agua, ni siquiera de un chancletazo.

## Cuenta en la nube (opcional)

En la portada hay un bloque de **cuenta**. No hace falta para jugar: sirve para
que tu **álbum** y tu **partida** te sigan a otro navegador o a otro aparato, y
para salir en el ranking.

Con cuenta aparece un botón verde **Seguir donde quedaste**, con el dinero y el
tiempo de la partida guardada. La partida se guarda sola cada 15 s de juego y en
cada hito. Solo se guarda una por jugador, así que empezar otra pisa la vieja —
por eso el botón de al lado dice *Empezar de cero* cuando tienes una guardada.

El álbum **se une, no se pisa**: al entrar, lo que tenías en este navegador y lo
que tenías en la nube se juntan en los dos sentidos.

Si el servidor no está, el bloque de la cuenta **ni aparece** y todo funciona
como siempre, guardado en el navegador. Si se cae a mitad de partida, el juego te
lo dice y sigue andando; deja de insistir por un minuto para no llenar la consola
de errores.

La API vive en [`apps/api`](apps/api) (.NET 9 + PostgreSQL) y tiene su propio
README. El cliente la busca en `VITE_API` (ver `apps/web/.env.example`).

## Detalles técnicos

- Un solo archivo, sin dependencias: `<canvas>` 2D, CSS y JavaScript puro
- Cámara que sigue al jugador en un mundo de 2600 × 1700
- Se adapta a celular, iPad y escritorio (`meta viewport`, controles táctiles, armas en un desplegable)
- Sonido generado con WebAudio (sin archivos de audio)
- Respeta `prefers-reduced-motion`
- Guarda en `localStorage` el modo zurdo (`florin_zurdo`) y el álbum (`florin_album`)

## Nota sobre los personajes

Proyecto de fan, sin relación oficial con Invictor ni con nadie más. **Florín** es un personaje creado por él; los sprites de este juego son dibujos originales hechos para este proyecto, no reproducciones de su arte. Mayo aparece como vecino con un diseño propio inventado aquí, y El Sobri, la Prima Yuli y los Marcianos son personajes inventados para este juego.

Si eres el autor de los personajes y prefieres que no se usen así, se quitan sin problema.
