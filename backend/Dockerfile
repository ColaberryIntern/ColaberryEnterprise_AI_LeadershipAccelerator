FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY backend/ ./backend/
COPY frontend/src/pages/ ./frontend/src/pages/
RUN npm run build:backend

FROM node:20-bookworm-slim
WORKDIR /app
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/frontend/src/pages ./frontend/src/pages
RUN npx playwright install --with-deps chromium
RUN mkdir -p /app/uploads/strategy-prep /data/screenshots /data/browser-profiles
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/server.js"]
