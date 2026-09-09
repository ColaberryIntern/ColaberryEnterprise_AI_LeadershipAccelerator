FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY frontend/ ./frontend/
ENV REACT_APP_API_URL=
RUN npm run build:frontend

# Build the brand apps AFTER the frontend, deliberately. Copying apps/ or packages/
# earlier would invalidate the cached `npm ci` and `build:frontend` layers on every change
# to a brand page, turning a file-copy build into a full React rebuild. The app builds have
# no dependencies of their own: they copy src/ to dist/ and substitute brand tokens.
COPY packages/ ./packages/
COPY apps/refactored-public/ ./apps/refactored-public/
COPY apps/ai-flotation-public/ ./apps/ai-flotation-public/
COPY apps/cpn-public/ ./apps/cpn-public/
RUN node apps/refactored-public/build.js  && node apps/ai-flotation-public/build.js  && node apps/cpn-public/build.js

FROM nginx:alpine
COPY --from=builder /app/frontend/build /usr/share/nginx/html
COPY --from=builder /app/apps/refactored-public/dist   /usr/share/nginx/refactored
COPY --from=builder /app/apps/ai-flotation-public/dist /usr/share/nginx/aiflotation
COPY --from=builder /app/apps/cpn-public/dist          /usr/share/nginx/opportunitylift
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
# Two server blocks on their own hostnames; nginx loads every *.conf in conf.d.
#
# refactored.ai itself is deliberately absent, and its PREVIEW hostname is not.
#
# This image terminates no TLS: every hostname here listens on 80 because Cloudflare
# handles HTTPS in front of it. refactored.ai is the one Colaberry domain NOT behind
# Cloudflare, so a server block for it could only ever answer over plain HTTP. The built
# site reaches that domain through S3 and CloudFront instead.
#
# refactored-preview.colaberry.ai IS behind Cloudflare, so it serves the same built files
# with working TLS and no certificate work. It is where the site is reviewed.
COPY nginx/refactored-preview.conf /etc/nginx/conf.d/refactored-preview.conf
COPY nginx/aiflotation.conf        /etc/nginx/conf.d/aiflotation.conf
COPY nginx/opportunitylift.conf    /etc/nginx/conf.d/opportunitylift.conf
# Included by nginx.conf at server level and re-included in every location that
# declares its own add_header (nginx does not inherit add_header into those).
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
