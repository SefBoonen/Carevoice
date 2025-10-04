FROM node:22-alpine AS base

WORKDIR /app
COPY backend/package*.json ./

RUN npm install
COPY ./backend ./backend
COPY ./frontend ./frontend
EXPOSE 3000
CMD ["node", "./backend/index.mjs"]