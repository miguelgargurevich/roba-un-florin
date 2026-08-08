# El servidor de salas. tsx corre el TypeScript directamente: el motor se
# importa como fuente y no hay paso de compilación que mantener.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=America/Lima

COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/salas/package.json apps/salas/
# tsx va en dependencies, no en devDependencies: es lo que ARRANCA el servidor.
# Con NODE_ENV=production npm se salta las de desarrollo, así que ponerlo ahí
# daba un contenedor que compilaba bien y moría al arrancar con "tsx: not found".
RUN npm ci --omit=dev --workspace @florin/salas --include-workspace-root

COPY packages/engine packages/engine
COPY apps/salas apps/salas

EXPOSE 5182
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5182/salud || exit 1
CMD ["npm", "start", "--workspace", "@florin/salas"]
