# Lokales Test-Setup, analog zum Konzert-Guide-Ansatz (Dockerfile.frontend):
# Stage 1 baut die Vite-App, Stage 2 served sie über nginx inkl. Reverse-Proxy
# für die Shop-APIs (siehe nginx.conf) — das Äquivalent zu Vites Dev-Proxy
# (vite.config.ts), der außerhalb von `npm run dev` nicht existiert.

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve mit nginx
FROM nginx:alpine
RUN apk update && apk upgrade --no-cache
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
