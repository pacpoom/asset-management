
FROM node:20 AS build
WORKDIR /app

ENV DB_HOST=192.168.111.57
ENV DB_PORT=3306
ENV DB_USER=root
ENV DB_PASSWORD=Anji@12345
ENV DB_DATABASE=bizcore

COPY . .
RUN npm install
RUN mkdir -p static/uploads
RUN rm -rf .svelte-kit
RUN npm run build

FROM node:20-slim AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/static ./static
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000

CMD [ "node", "build/index.js" ]