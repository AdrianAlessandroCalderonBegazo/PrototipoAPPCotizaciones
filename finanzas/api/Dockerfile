# API de Finanzas (ingreso, permisos, proyectos e historial de la caja anterior). Se construye con la carpeta finanzas/ como contexto
# (docker compose lo hace solo):  docker compose build finanzas-api
#
# Hoy la usa la app de Finanzas para ingresar (la sesión es la de la API principal), los permisos y los proyectos; sus rutas de
# caja diaria y caja chica quedan para el historial anterior. La Caja ICR la responde la API principal.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 UPLOAD_DIR=/data/fotos
WORKDIR /srv/api

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY api/tsconfig.json ./
COPY api/src ./src
COPY api/scripts ./scripts
COPY db /srv/db

RUN mkdir -p /data/fotos && chown -R node:node /data /srv
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["npx", "tsx", "src/main.ts"]
