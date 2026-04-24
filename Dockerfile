FROM node:20 AS build
WORKDIR /app

# Bizcore DB
ENV DB_HOST=192.168.111.57
ENV DB_PORT=3306
ENV DB_USER=root
ENV DB_PASSWORD=Anji@12345
ENV DB_DATABASE=bizcore

# CYMS DB
ENV CYMS_HOST=192.168.111.52
ENV CYMS_PORT=3307
ENV CYMS_USER=root
ENV CYMS_PASSWORD=Anji@12345
ENV CYMS_DATABASE=anji_db

# KD DB (Required for btpool)
ENV KD_HOST=192.168.111.52
ENV KD_PORT=3308
ENV KD_USER=root
ENV KD_PASSWORD=Anji@12345
ENV KD_DATABASE=bt_db

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p static/uploads
RUN npm run build

FROM node:20-slim AS production
WORKDIR /app

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ENV NODE_ENV=production
ENV PORT=3000
ENV BODY_SIZE_LIMIT=52428800

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/static ./static
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000

CMD [ "node", "build/index.js" ]