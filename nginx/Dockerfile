FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY frontend/ ./frontend/
ENV REACT_APP_API_URL=
RUN npm run build:frontend

FROM nginx:alpine
COPY --from=builder /app/frontend/build /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
# Included by nginx.conf at server level and re-included in every location that
# declares its own add_header (nginx does not inherit add_header into those).
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
