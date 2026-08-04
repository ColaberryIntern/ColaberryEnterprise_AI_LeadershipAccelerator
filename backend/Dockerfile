FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY backend/ ./backend/
COPY frontend/src/pages/ ./frontend/src/pages/
# Bump V8 heap for tsc — Phase 16-32 added enough TS surface that the default
# (~1.7GB on slim) crashes with SIGABRT in V8 young-generation allocation.
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build:backend

FROM node:20-bookworm-slim
WORKDIR /app

# --- Layers below have no dependency on app source, only on OS packages or
# on node_modules (which itself only changes when package.json/lock change —
# npm ci runs before COPY backend/ in the builder stage). Keeping them ahead
# of the COPY --from=builder /app/backend/dist step below means an ordinary
# code-only change no longer invalidates them: Docker's cache is linear, so
# once one layer misses, every later layer in the stage rebuilds regardless
# of whether its own inputs changed. Before this reorder, dist (which changes
# on every commit) was copied first, so xvfb/git/curl/gnupg, the Docker CLI +
# compose plugin, and the Playwright Chromium download were all re-fetched on
# every single build — multiple minutes of unrelated work per rebuild.
RUN apt-get update && apt-get install -y --no-install-recommends xvfb x11vnc git ca-certificates curl gnupg poppler-utils && rm -rf /var/lib/apt/lists/*
# Install docker CLI + compose plugin so the backend can provision preview stacks
# via the mounted /var/run/docker.sock. Only the CLI — the daemon lives on the host.
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Playwright's browser binary version is pinned to the installed npm package
# version, so this needs node_modules present — but node_modules is cached
# independently of source-only changes (see comment above).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

# --- Only these layers depend on app source, so they're last: an ordinary
# commit invalidates from here down, not the installs above.
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/frontend/src/pages ./frontend/src/pages
# Static data the running backend reads directly off disk (not compiled/bundled) —
# trustInpactGoalsService.ts reads this at runtime. Copied straight from the build
# context (not --from=builder) since it needs no build step.
COPY docs/ai-governance/ai-systems-registry.csv ./docs/ai-governance/ai-systems-registry.csv
RUN mkdir -p /app/uploads/strategy-prep /data/screenshots /data/browser-profiles

ENV NODE_ENV=production
ENV DISPLAY=:99
EXPOSE 3001
CMD ["bash", "-c", "Xvfb :99 -screen 0 1920x1080x24 &>/dev/null & exec node dist/server.js"]
