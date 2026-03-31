FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY backend ./backend
COPY frontend ./frontend

RUN npm ci \
  && npm ci --prefix shared \
  && npm ci --prefix backend \
  && npm ci --prefix frontend \
  && npm --prefix shared run build \
  && npm --prefix backend run build \
  && npm --prefix frontend run build \
  && npm cache clean --force

ENV NODE_ENV=production \
    BACKEND_PORT=3500

WORKDIR /app/backend

EXPOSE 3500

CMD ["node", "dist/index.js"]