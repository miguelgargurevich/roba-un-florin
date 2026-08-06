# Expansión "Roba un Florín" — patios, rarezas, pasarela, ruleta, láseres y armas

Fecha: 2026-08-05
Estado: aprobado por el usuario

## Objetivo

Ampliar el juego con siete features pedidas: más patios propios, ladrones menos
frecuentes, rarezas visibles con variantes especiales, pasarela de Florines
(álbum + desfile), seguridad láser en el patio, más armas y una ruleta gacha.

## Restricciones

- **Un solo archivo.** Todo sigue en `index.html`, sin dependencias ni build.
  El README promete que se abre con doble clic (`file://`), así que no se usan
  módulos ES ni archivos `.js` externos.
- Sigue funcionando en GitHub Pages sin configuración extra.
- Se respetan los patrones existentes: `TIERS`/`WEAPONS`/`LADRONES` como tablas
  de datos, compra por proximidad, `pop()`/`puff()` para feedback, `Snd` para
  audio, `localStorage` con prefijo `florin_`.
- Táctil sigue siendo ciudadano de primera: todo lo nuevo tiene su control en
  pantalla, y respeta el modo zurdo.

## Sección 1 — Mundo, patios propios y presión de ladrones

### Mundo

`WORLD_W`/`WORLD_H` pasan de 1800×1200 a **2600×1700**. La cámara, el suelo y
el minimapa ya derivan de esas constantes.

### Reparto

Bases de 380×330:

| Zona | Posición | Notas |
|---|---|---|
| Tu patio | (70, 1290) | 6 pedestales |
| Patio 2 | (520, 1290) | comprable $4 000, +6 pedestales |
| Patio 3 | (70, 900) | comprable $12 000, +6 pedestales |
| Casa de Mayo | (70, 90) | existente |
| Torre de Vicnix | (1110, 90) | existente |
| Doña Chancla | (2150, 90) | existente (El Sobri) |
| Casa de la Prima Yuli | (2150, 700) | nueva |
| Nave de los Marcianos | (2150, 1290) | nueva |
| Vivero | centro (1135, 750) | como hoy |
| Pasarela | (520, 900), 380×230 | sección 3 |
| Armería | (960, 1350), 300×130 | reubicada |
| Ruleta | (1450, 1350), 300×130 | sección 3 |

Los tres patios propios quedan juntos en la esquina suroeste: defenderlos con
láseres tiene sentido geográfico.

### Comprar patios

Un patio bloqueado se dibuja con reja gris y cartel de precio. La compra es por
proximidad, igual que el Vivero: si el dinero alcanza se descuenta y el patio
queda tuyo; si no, sale "Falta $X". Sin teclas nuevas.

### Refactor `p.base` → `p.patios`

Es el cambio más invasivo. Hoy `p.base` es un único patio y de ahí dependen la
entrega, `freePed`, `occupied`, `playerIncome` y la elección de víctima del
ladrón. Pasa a:

- `p.patios`: array de bases propias (empieza con una).
- `p.base`: se mantiene como alias del patio principal (punto de aparición),
  con el mismo truco de `Object.defineProperty` que ya usa `G.money`.
- `freePed(player)` busca hueco en cualquier patio del jugador; entregar
  funciona en cualquiera; "¡Vitrina llena!" solo si están todos llenos.
- `occupied(player)` y `playerIncome(player)` suman todos sus patios.

### Vecinos nuevos

- **La Prima Yuli** (fucsia `#FF5C86`): `spd: 1.40`, la más rápida, pero solo
  roba tiers 0–2 (Común, Fiestero, Raro).
- **Los Marcianos** (morado `#8B6BEE`): `greedy: true` (van por el más caro) y
  cada 5 s dan un salto de teletransporte de ~90 px con puff morado, lo que
  hace más difícil acertarles la chancla.

Más casas no implica más ladrones: `spawnThief` elige una sola casa por tic.

### Frecuencia de ladrones

De `clamp(peor, 5.5, 16)` a **`clamp(peor, 10, 26)`**, con la fórmula
recalibrada a `26 - min(nFlorines, 8) * 2.0 - masCaro * 0.7`. El tope de 8 en
el conteo evita que con 18 pedestales la presión quede clavada en el mínimo.

Resultado: un Florín común → ~23 s entre visitas (hoy 14 s); vitrina llena y
cara → 10 s (hoy 5.5 s).

### Dos jugadores

Patios extra y ruleta deshabilitados; la Nave de los Marcianos vuelve a ser el
Patio del J2. Mismo criterio que hoy usa la Armería para que la pelea sea pareja.
La pasarela sí queda disponible: es neutral y los dos pueden usarla (y robarse
de ahí). Los láseres también, uno por patio.

## Sección 2 — Rarezas visibles y variantes especiales

### Rarezas

Las siete rarezas ya existen en `TIERS` (`rar:`) con su color en `RAR_COLOR`,
pero nunca se muestran. Se hacen visibles en cuatro sitios:

1. Etiqueta de rareza (píldora con el color de `RAR_COLOR`) sobre el bloque en
   las vitrinas, debajo del nombre si lo tiene.
2. En las macetas del Vivero, junto al precio.
3. En el álbum.
4. En los avisos de robo: "Mayo se llevó a Pepito (Legendario)".

### Variantes

Campo nuevo `variant` en el objeto florín: `null | "brillante" | "arcoiris"`.

| Variante | Multiplicador | Aspecto |
|---|---|---|
| — | ×1 | normal |
| ✨ Brillante | ×2 ingresos | contorno blanco con destellos que orbitan |
| 🌈 Arcoíris | ×3 ingresos | contorno con matiz rotativo y estela de color |

Las variantes **solo salen de la ruleta**. Viajan con el Florín: si te lo roban,
llega con su variante a la vitrina del ladrón y la conserva al recuperarlo
(igual que ya hace el nombre). `playerIncome` multiplica por la variante.

### Álbum (dex)

Botón 📖 en la barra superior. Pausa el juego (como el bautizo). Rejilla de 7
Florines × 3 variantes con estado "nunca visto / visto / lo tuviste", cada celda
con rareza, precio e ingresos. Persiste en `localStorage` bajo `florin_album`.

## Sección 3 — Pasarela y ruleta

### Pasarela (desfile)

Zona de 380×230 en (520, 900), con alfombra y tres puestos de salida. Llegas
cargando un Florín y lo sueltas ahí: empieza a desfilar en bucle, caminando de
ida y vuelta por la alfombra.

- Mientras desfila rinde **×2.5 ingresos**.
- **Está expuesto**: los ladrones lo pueden robar, y los láseres no lo cubren
  porque está fuera de tus patios. Ahí está la decisión: rendimiento contra
  seguridad.
- Lo recoges cuando quieras para llevarlo de vuelta a la vitrina.

### Ruleta

Puesto en (1450, 1350). Te paras dentro y se abre el panel; cada tirada cuesta
**$1 200**. Doce casillas:

| Premio | Probabilidad |
|---|---|
| Florín Común | 20 % |
| Florín Bailarín (Fiestero) | 16 % |
| Girasolón Turbo (Raro) | 14 % |
| ??? incógnita | 12 % |
| Florín Ninja (Épico) | 10 % |
| $500 | 8 % |
| Chancletín Florido (Legendario) | 6 % |
| Arma aleatoria (2 usos) | 6 % |
| $2 500 | 4 % |
| Florín Rey Sol (Mítico) | 3 % |
| Florín Cósmico | 1 % |

La casilla **??? incógnita** tira de una tabla secreta:

| Resultado | Probabilidad |
|---|---|
| ✨ Brillante de tier 0–4 | 45 % |
| 🌈 Arcoíris de tier 0–3 | 25 % |
| Cósmico normal | 20 % |
| 🌈 Cósmico Arcoíris (premio gordo) | 10 % |

Animación: tira horizontal en DOM que rueda y frena con easing. El Florín
premiado llega como `p.carry` si tienes las manos libres; si no, cae al suelo
junto a la ruleta y lo recoges.

## Sección 4 — Láseres y armas nuevas

### Seguridad láser

Cada patio propio tiene una **placa de activación** (círculo de r=34 en una
esquina del patio). Te paras encima 1 s y se activan **60 s**.

- **Muro total**: mientras están activos, ningún ladrón entra (se dan la vuelta
  en la reja). En 2 jugadores, el rival tampoco.
- Los ladrones que estuvieran dentro al activarse salen despedidos y sueltan lo
  que cargaban, para que nadie quede atrapado.
- Cada activación cuesta **$800**, y tras apagarse la placa tarda **30 s** en
  recargar (barra de recarga visible). Sin eso, pisar la placa cada minuto sería
  invulnerabilidad permanente.
- Visual: postes en las esquinas y rayos rojos animados en el perímetro, más un
  contador mm:ss en el HUD. Respeta `prefers-reduced-motion` (rayos fijos en vez
  de pulsantes).

### Armas nuevas

`WEAPONS` pasa de 6 a 11 entradas:

| Arma | Precio | Usos | Efecto |
|---|---|---|---|
| 🍌 Cáscaras | $500 | 3 | Coloca una cáscara en el piso; el primero que la pisa resbala 4 s y suelta lo que carga |
| 🐕 Chihuahua | $1 400 | 2 | 20 s persiguiendo ladrones dentro de tus patios; muerde y noquea 3 s |
| ⏱️ Reloj de abuela | $1 800 | 2 | Ladrones y abuelas al 40 % de velocidad por 6 s |
| 🧲 Imán ladrón | $2 000 | 3 | Apuntas a una vitrina vecina en 320 px y jala un Florín hacia ti |
| 🛸 Rayo abductor | $3 400 | 2 | Baja un platillo, se lleva al objetivo 10 s y lo devuelve mareado en su casa; suelta lo que cargaba |

Selección: teclas `1`–`9` para las nueve primeras, y `Q`/`E` para rotar por
todas (ya existe). En táctil, la barra de chips ya hace scroll horizontal.

### Meta

`GOAL` sube de $20 000 a **$60 000**. Con 18 pedestales, el ×2.5 de la pasarela
y variantes de hasta ×3, la meta vieja se alcanzaría en un par de minutos.

## Fases de implementación

1. **Mundo y patios**: mundo 2600×1700, reparto, refactor `p.patios`, compra de
   patios, vecinos nuevos, frecuencia de ladrones, `GOAL`.
2. **Rarezas y variantes**: etiquetas de rareza, campo `variant` con su render y
   su efecto en ingresos, álbum con persistencia.
3. **Pasarela y ruleta**: zona de desfile con su bonus y su riesgo, puesto de
   ruleta con tabla de premios, incógnita y animación.
4. **Defensa y armas**: láseres con placa, costo y recarga; las cinco armas
   nuevas.

Cada fase se prueba en el navegador antes de pasar a la siguiente.

5. **Documentación**: actualizar `README.md` — la meta pasa a $60 000, la tabla
   de armas crece a once, y se documentan patios comprables, variantes, álbum,
   pasarela, ruleta, láseres y los dos vecinos nuevos.

## Verificación

No hay suite de tests en el repo; la verificación es manual en el navegador,
por fase:

- Consola sin errores y sin caídas de framerate al ampliar el mundo.
- Comprar los dos patios, entregar Florines en cada uno y ver los ingresos
  sumados en el HUD.
- Que un ladrón de cada casa nueva complete su ciclo (llegar, robar, volver).
- Cronometrar que las visitas caen en la ventana 10–26 s.
- Girar la ruleta varias veces y comprobar que cada tipo de premio se entrega
  bien, incluida la incógnita.
- Activar los láseres y verificar que ningún ladrón entra durante los 60 s, que
  cobran los $800 y que la recarga de 30 s se respeta.
- Probar las cinco armas nuevas, en teclado y en táctil.
- Revisar el layout en móvil, iPad y escritorio, y en modo zurdo.
