# syntax=docker/dockerfile:1.7
# Production image of the web app (Nuxt SPA, static files behind nginx). Build: docker build -t teammanix-web apps/web
# The API base URL is baked into the bundle at build time (a static SPA has no server to read it at runtime).
# Default `/api`: same domain as the API, routed by Traefik. Override with --build-arg NUXT_PUBLIC_API_BASE_URL=...

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NUXT_PUBLIC_API_BASE_URL=/api
ENV NUXT_PUBLIC_API_BASE_URL=$NUXT_PUBLIC_API_BASE_URL
ENV NODE_ENV=production
RUN npm run generate

FROM nginx:1.27-alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
