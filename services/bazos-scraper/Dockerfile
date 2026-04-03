FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY src/ ./src/
COPY proxies.json ./

CMD ["node", "src/index.js"]
