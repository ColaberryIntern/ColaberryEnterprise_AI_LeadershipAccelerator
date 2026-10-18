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
# `ffmpeg` is here for demo thumbnails, and it is the only reason it is here.
# The feed card used the frame at one second, which is black whenever a learner
# had their camera off and a bare desktop whenever a screen share had not started
# yet. Choosing a frame worth showing means decoding a few frames, and nothing
# already in this image can do that. Approved as an infrastructure change by the
# DRI on 2026-10-18 rather than slipped in: see `frameScore.ts` for the rule and
# `recordingThumbnail.ts` for the extraction.
RUN apt-get update && apt-get install -y --no-install-recommends xvfb x11vnc git ca-certificates curl gnupg poppler-utils ffmpeg && rm -rf /var/lib/apt/lists/*
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
# The ten agent-domain capability matrices plus the undomained-legacy bucket, read off disk at
# runtime by capabilityRecord.ts the same way the CSV above is. `tsc` compiles .ts and does not
# copy .json, so without this the files are simply absent from the image -- which is how the first
# production provisioning run failed, with "Capability matrix missing for 'learner_success' at
# /app/dist/services/agentDomain/capabilities/learner_success.json".
#
# Copied --from=builder rather than from the build context, because the loader resolves them
# relative to its own __dirname inside dist.
COPY --from=builder /app/backend/src/services/agentDomain/capabilities ./dist/services/agentDomain/capabilities
RUN mkdir -p /app/uploads/strategy-prep /data/screenshots /data/browser-profiles

ENV NODE_ENV=production
ENV DISPLAY=:99
EXPOSE 3001
CMD ["bash", "-c", "Xvfb :99 -screen 0 1920x1080x24 &>/dev/null & exec node dist/server.js"]
