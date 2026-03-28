# ── Stage 1: Build ──
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_ENV=production
RUN npx vite build

# ── Stage 2: Serve ──
FROM nginx:alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/burrow.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
