# Imagen de la API. Se construye en el VPS, así que la etapa de build se tira
# después y en disco solo queda el runtime (~110 MB con alpine).
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /src

# Primero solo los csproj: así el restore se cachea y no se repite en cada
# cambio de código.
COPY Florin.sln .
COPY src/Florin.Domain/Florin.Domain.csproj                 src/Florin.Domain/
COPY src/Florin.Application/Florin.Application.csproj       src/Florin.Application/
COPY src/Florin.Infrastructure/Florin.Infrastructure.csproj src/Florin.Infrastructure/
COPY src/Florin.Api/Florin.Api.csproj                       src/Florin.Api/
RUN dotnet restore src/Florin.Api/Florin.Api.csproj

COPY src/ src/
RUN dotnet publish src/Florin.Api/Florin.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \
    TZ=America/Lima
RUN apk add --no-cache tzdata curl && \
    adduser -D -u 1001 florin && chown -R florin /app
USER florin
COPY --from=build --chown=florin /app .

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:8080/salud || exit 1
ENTRYPOINT ["dotnet", "Florin.Api.dll"]
