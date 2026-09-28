# HOT SPOT S.L.: portada, cuentas del crew y tablón de tareas — solo Node, sin dependencias.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY servidor ./servidor
COPY publico ./publico
COPY portada ./portada

ENV NODE_ENV=production \
    TAREAS_PUERTO=3000 \
    TAREAS_DATOS=/datos \
    TAREAS_BASE=/tareas

# Los datos viven fuera del contenedor (carpeta montada en /datos). Se ejecuta con el usuario «node» (1000).
RUN mkdir -p /datos && chown node:node /datos
USER node
VOLUME ["/datos"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -qO- http://127.0.0.1:3000/tareas/salud >/dev/null || exit 1

CMD ["node", "servidor/principal.js"]
