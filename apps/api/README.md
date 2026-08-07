# Florin.Api — cuentas y guardado en la nube

La API que le da al juego lo que un archivo HTML no puede: cuenta propia, progreso
que sobrevive al navegador y un ranking común. .NET 9 + PostgreSQL, Clean
Architecture con CQRS (MediatR).

Es la mitad "meta" de la arquitectura acordada. La partida en sí la simula
`@florin/engine`; cuando haya salas, el servidor autoritativo será otro proceso
(Node, corriendo ese mismo motor) y hablará con esta API para lo de siempre:
quién sos, qué tenés, dónde quedaste.

## Cómo está armado

```
src/
  Florin.Domain/          entidades y reglas. No sabe de EF ni de HTTP.
  Florin.Application/     casos de uso (un archivo por rodaja), validación, DTOs.
  Florin.Infrastructure/  EF Core + Npgsql, JWT, BCrypt, seeder.
  Florin.Api/             controllers, middleware de errores, composition root.
tests/
  Florin.Domain.Tests/          reglas del dominio, sin base.
  Florin.Application.Tests/     handlers reales sobre EF InMemory.
  Florin.Api.IntegrationTests/  la API entera contra un Postgres en Docker.
```

Los handlers viven en Application y llegan a la base solo por
`IApplicationDbContext`. No hay repositorio por entidad.

## Levantarla

Hace falta .NET 9 y un Postgres. Para el de desarrollo:

```bash
docker run -d --name florin-pg -p 5433:5432 -e POSTGRES_USER=florin -e POSTGRES_PASSWORD=florin_dev -e POSTGRES_DB=florin_dev postgres:16-alpine
```

Los secretos **no van en `appsettings.json`** (ahí quedan vacíos a propósito).
En desarrollo, con user-secrets:

```bash
cd apps/api/src/Florin.Api && dotnet user-secrets set "Jwt:Secret" "$(openssl rand -base64 48)"
```

```bash
cd apps/api/src/Florin.Api && dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=florin_dev;Username=florin;Password=florin_dev"
```

Y a correr. Migra y siembra sola al arrancar:

```bash
cd apps/api/src/Florin.Api && dotnet run
```

En el VPS lo mismo pero por variables de entorno: `Jwt__Secret`,
`ConnectionStrings__Default`, `Cors__Origins__0`. Si `Jwt:Secret` falta o tiene
menos de 32 caracteres, la app no arranca — mejor eso que arrancar insegura.

Swagger queda en `/swagger` solo en Development. `/salud` responde siempre.

## Endpoints

| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/v1/auth/registro` | cualquiera (20/min por IP) |
| POST | `/api/v1/auth/login` | cualquiera (20/min por IP) |
| POST | `/api/v1/auth/refresh` | cualquiera (20/min por IP) |
| GET | `/api/v1/auth/me` | con sesión |
| GET · PUT | `/api/v1/perfil` | `perfil.leer` · `perfil.editar` |
| GET | `/api/v1/perfil/ranking` | cualquiera |
| GET · PUT | `/api/v1/partida` | `partida.leer` · `partida.guardar` |
| GET · POST | `/api/v1/album` | `album.leer` · `album.registrar` |

Todo lo del jugador sale del token: no hay endpoint que reciba un id de perfil
ajeno, así que no hay forma de leer ni tocar el de otro.

El access token dura 30 minutos; el refresh es opaco, dura 30 días y **rota**: al
usarlo se revoca y se emite otro. Reusar uno viejo da 401.

## Tests

```bash
cd apps/api && for p in tests/*/; do dotnet test "$p"; done
```

Los de integración levantan un Postgres efímero con Testcontainers, así que
necesitan Docker corriendo.

## Lo que todavía no es

`partidas.Estado` es el estado del motor tal cual lo manda el cliente. Hoy es un
**guardado, no una verdad**: quien quiera puede mandar el dinero que se le
ocurra, y el ranking hereda esa confianza. Se arregla solo cuando el servidor
simule la partida, no antes; hasta entonces el ranking es entre amigos.
