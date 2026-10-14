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
# every root module, so a new import from web/ or freenet/ cannot be left out of the image
COPY *.js ./
VOLUME /data
EXPOSE 8080
# A host directory mounted at /data (CapRover persistent directories, bind mounts) belongs to root:
# hand it to the node user, then drop root before starting the server.
CMD ["sh", "-c", "chown -R node:node /data && exec setpriv --reuid=node --regid=node --init-groups node web/server.js"]
