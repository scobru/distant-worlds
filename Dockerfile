# Web version (web/server.js): the built app plus the SQLite galaxy, kept in the /data volume.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DB=/data/distant-worlds.sqlite DIST=/app/dist NODE_NO_WARNINGS=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /data && chown node /data
COPY --from=build /app/dist dist
COPY web web
COPY freenet/*.js freenet/
COPY world.js ./
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "web/server.js"]
