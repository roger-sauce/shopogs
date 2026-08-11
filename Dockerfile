# Local test setup, analogous to the konzert-guide approach
# (Dockerfile.frontend): stage 1 builds the Vite app, stage 2 serves it via
# nginx including the reverse proxy for the shop APIs (see nginx.conf) — the
# equivalent of Vite's dev proxy (vite.config.ts), which does not exist
# outside of `npm run dev`.

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
RUN apk update && apk upgrade --no-cache
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
