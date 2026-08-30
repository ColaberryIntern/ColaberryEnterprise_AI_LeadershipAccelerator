FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY frontend/ ./frontend/
ENV REACT_APP_API_URL=
RUN npm run build:frontend

# Build the refactored.ai preview AFTER the frontend, deliberately. Copying apps/ or
# packages/ earlier would invalidate the cached `npm ci` and `build:frontend` layers on
# every change to a brand page, turning a file-copy build into a full React rebuild. The
# app build has no dependencies of its own: it copies src/ to dist/ and substitutes brand
# tokens.
COPY packages/ ./packages/
COPY apps/refactored-public/ ./apps/refactored-public/
RUN node apps/refactored-public/build.js

FROM nginx:alpine
COPY --from=builder /app/frontend/build /usr/share/nginx/html
COPY --from=builder /app/apps/refactored-public/dist /usr/share/nginx/refactored
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
# Two server blocks on their own hostnames; nginx loads every *.conf in conf.d.
#
# The cutover config is now shipped as well. That is safe because a server block only ever
# responds to its own `server_name`, and nothing sends refactored.ai here until its DNS
# moves — which is a separate, deliberate act. Shipping it now means the path can be
# verified by Host header BEFORE any traffic depends on it, rather than discovering a
# mistake at cutover.
COPY nginx/refactored-preview.conf /etc/nginx/conf.d/refactored-preview.conf
COPY nginx/refactored.conf         /etc/nginx/conf.d/refactored.conf
# Included by nginx.conf at server level and re-included in every location that
# declares its own add_header (nginx does not inherit add_header into those).
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
