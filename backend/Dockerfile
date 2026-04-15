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
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium
RUN mkdir -p /app/uploads/strategy-prep /data/screenshots /data/browser-profiles
RUN apt-get update && apt-get install -y --no-install-recommends xvfb x11vnc git ca-certificates curl gnupg && rm -rf /var/lib/apt/lists/*
# Install docker CLI + compose plugin so the backend can provision preview stacks
# via the mounted /var/run/docker.sock. Only the CLI — the daemon lives on the host.
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV DISPLAY=:99
EXPOSE 3001
CMD ["bash", "-c", "Xvfb :99 -screen 0 1920x1080x24 &>/dev/null & exec node dist/server.js"]
