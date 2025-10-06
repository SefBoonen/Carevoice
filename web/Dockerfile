FROM node:22-alpine AS base

WORKDIR /app

RUN apk add ffmpeg

COPY backend/package*.json ./
COPY ./backend ./
COPY ./frontend ./frontend

FROM base AS prod
RUN npm install
EXPOSE 3000
CMD ["node", "./index.mjs"]

FROM base AS dev
RUN npm install -D
EXPOSE 3000
CMD ["npm", "run", "dev"]