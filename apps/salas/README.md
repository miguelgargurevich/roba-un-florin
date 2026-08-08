# @florin/salas — el servidor de salas

Un proceso que corre `@florin/engine` y dice la verdad. Los clientes solo mandan
teclas y dibujan lo que reciben.

## Por qué WebSocket pelado y no Colyseus

Lo que Colyseus aporta de verdad es su sincronización por esquema, y para usarla
habría que traducir todo el estado del motor a `@colyseus/schema` y mantener las
dos formas en paralelo. El estado ya es JSON serializable —para eso se pasó a
ids— así que el resto de Colyseus (salas, reconexión, códigos) son las
doscientas líneas de `salas.ts`. Menos maquinaria y control del formato, que es
lo que importa cuando lo que se manda es el mundo entero.

## Cómo habla

Dos canales, porque no todo cambia al mismo ritmo:

| Mensaje | Cada cuánto | Qué lleva |
|---|---|---|
| `mundo` | al entrar y cada 3 s | el estado completo (~8 KB) |
| `tick` | 20 veces por segundo | solo lo que se mueve (<3 KB) |
| `eventos` | cuando los hay | lo que el motor cuenta: textos, polvo, sonidos |
| `gente` | al entrar o salir alguien | quién está y quién se cayó |

La sala simula a 30 Hz y trocea en pasos fijos, con un tope de 5 por llamada:
si el proceso se atasca un momento no entra en espiral.

## Las salas

Código de **4 letras sin vocales** (`BCDFGHJKLMNPQRSTVWXYZ`): así el azar no
escribe palabrotas y no hay que deletrear si es I o E por teléfono.

El mundo se monta **una vez, con los cinco sitios**. Sentar a alguien no rehace
la partida: solo le asigna un patio que ya existe. Los sitios sin nadie se
quedan quietos — no hay bots que los jueguen.

Si te caes, **tu patio y tu dinero te esperan**: al volver con la misma cuenta
recuperas tu sitio. La sala aguanta un minuto vacía antes de recogerse, por si
se cae la conexión de todos a la vez.

## Identidad

No hay usuarios aquí. Se valida el **mismo JWT** que emite la API, con el
**mismo secreto** por variable de entorno. Si falta, el servidor no arranca: una
sala que acepta a cualquiera que diga llamarse Pepito no sirve de nada cuando lo
que está en juego es el álbum de alguien.

## Correrlo

```bash
Jwt__Secret="$(openssl rand -base64 48)" npm run dev --workspace @florin/salas
```

`PORT` por defecto 5182. `/salud` responde `{ok:true, salas:N}`.

```bash
npm test --workspace @florin/salas
```

## Lo que falta

Cliente (pantalla de lobby y modo en red) y despliegue. La sala ya funciona: se
puede comprobar con dos WebSocket y un token firmado a mano.
