# 🩴 Roba un Florín — Chancla Edition

Juego de navegador en un solo archivo HTML. Roba **Florines** (bloquecitos de tierra con su flor y su carita) de las vitrinas de tus vecinos, llévalos a tu patio para que te generen dinero, y defiéndelos a puro **chancletazo**.

Inspirado en el género "roba un brainrot" y en Florín, la mascota del youtuber Invictor.

**Jugar:** abre `index.html` en cualquier navegador. No necesita servidor, ni instalación, ni conexión.

---

## Cómo se juega

| Paso | Qué hacer |
|---|---|
| 💰 Ganar dinero | Cada Florín en **tu** vitrina paga por segundo. Solo cuenta si está en tu patio. |
| 🌷 Comprar | En el **Vivero** del centro del mapa, tocando una maceta. |
| 🏃 Robar | Métete a una base vecina y quédate junto a un Florín hasta llenar el aro rosa. |
| 👵 Esquivar | Cada base tiene su abuela. Si te alcanza, sueltas el Florín y quedas mareado. |
| 🩴 Defender | Lanza la chancla a ladrones y abuelas: los noquea y les hace soltar lo que cargan. Vuelve como bumerán. |
| 🎯 Meta | Llegar a **$20 000**. |

Un Florín tirado en el suelo lo puede recoger cualquiera: si le pegas a un ladrón que huye, se te cae ahí y puedes recuperarlo.

## Controles

**Teclado** — `WASD` / flechas para moverte · `espacio` usar arma · `1`–`6` cambiar de arma · `P` pausa · `M` sonido

**Táctil (celular y iPad)** — arrastra en la mitad izquierda de la pantalla para el joystick · toca el botón rosa para usar el arma · toca los chips de abajo para cambiarla

## Los 7 Florines

Cada rareza cambia el material del bloque y su flor:

| Florín | Bloque | Precio | Ingresos |
|---|---|---|---|
| Común | tierra con pasto, amapola roja | $100 | 3/s |
| Bailarín | flor amarilla, se contonea con notas ♪ | $340 | 9/s |
| Girasolón Turbo | girasol que gira, con llamas de cohete | $950 | 24/s |
| Ninja | podzol oscuro, allium morado y banda roja | $2 400 | 58/s |
| Chancletín Florido | flor rosa y su chanclita de la suerte | $5 600 | 135/s |
| Rey Sol | bloque de oro con corona | $13 000 | 310/s |
| Cósmico | obsidiana morada, anillo orbital y chispas | $31 000 | 720/s |

## Las armas

Se compran en la **Armería de la cuadra**, el puesto con toldo de rayas:

| Arma | Precio | Efecto |
|---|---|---|
| 🩴 Chancla | gratis, ∞ | Bumerán, noquea 3.6 s |
| 🧊 Congeladora | $900 · 3 usos | Congela 7 s |
| 💨 Secadora Turbo | $1 500 · 4 usos | Ráfaga en cono, los manda a volar |
| ⚡ Chicharra | $2 600 · 3 usos | Descarga alrededor, noquea 5 s |
| 🥤 Refresco Turbo | $700 · 2 usos | +75 % de velocidad por 9 s |
| 👻 Capa Invisible | $1 900 · 2 usos | Las abuelas no te ven por 8 s |

## Los vecinos que te roban

Cada base manda su propio ladrón, con su maña:

- **Mayo** (base amarilla) — el más lento, pero siempre va por tu Florín más caro
- **Vicnix** (base cian) — corre 43 % más rápido que Mayo, agarra lo que sea
- **El Sobri** (base rosa) — velocidad normal, agarra al azar

El ritmo de los robos depende de **tu vitrina, no del reloj**: con un solo Florín pasan ~14 s entre visitas; con la vitrina llena de Florines caros, cada 5.5 s. Si te desvalijan, aflojan y te dan tregua para recuperarte.

## Detalles técnicos

- Un solo archivo, sin dependencias: `<canvas>` 2D, CSS y JavaScript puro
- Cámara que sigue al jugador en un mundo de 1800 × 1200
- Se adapta a celular, iPad y escritorio (`meta viewport`, controles táctiles, chips compactos)
- Sonido generado con WebAudio (sin archivos de audio)
- Respeta `prefers-reduced-motion`

## Nota sobre los personajes

Proyecto de fan, sin relación oficial con Invictor ni con nadie más. **Florín** es un personaje creado por él; los sprites de este juego son dibujos originales hechos para este proyecto, no reproducciones de su arte. Mayo y Vicnix aparecen como vecinos con diseños propios inventados aquí.

Si eres el autor de los personajes y prefieres que no se usen así, se quitan sin problema.
