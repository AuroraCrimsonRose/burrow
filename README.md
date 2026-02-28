# Burrow

A Discord-adjacent community platform.

## Project Structure

```
burrow/
├── backend/          # Elixir + Phoenix API (runs in Docker)
├── web/              # React web client (Vite + TypeScript)
├── desktop/          # Electron + React desktop client
├── mobile/           # React Native + Expo mobile client
├── shared/           # Shared TypeScript types & utilities
├── docker-compose.yml
├── package.json      # npm workspaces root
└── MASTER.md         # Architecture reference
```

## Prerequisites

- **Node.js** >= 20
- **npm** >= 10
- **Docker** & **Docker Compose**
- **Git**

Elixir is NOT required locally — the backend runs entirely in Docker.

## Quick Start

```bash
# 1. Install all JS dependencies (web, desktop, mobile, shared)
npm install

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your own secrets

# 3. Generate the Phoenix backend (first time only)
docker compose up -d db redis
docker run --rm -v "${PWD}/backend:/app" -w /app elixir:1.17 bash -c "
  mix local.hex --force &&
  mix local.rebar --force &&
  mix archive.install hex phx_new --force &&
  mix phx.new . --app burrow --no-html --no-assets
"

# 4. Start all services
docker compose up -d

# 5. Run database migrations
docker compose exec backend mix ecto.create
docker compose exec backend mix ecto.migrate
```

## Development

```bash
# Web client (http://localhost:5173)
npm run dev:web

# Desktop client
npm run dev:desktop

# Mobile client (Expo)
npm run dev:mobile

# Backend logs
npm run docker:logs
```

## Tech Stack

| Layer     | Technology              |
|-----------|------------------------|
| Backend   | Elixir, Phoenix, Docker |
| Database  | PostgreSQL 16           |
| Cache     | Redis 7                 |
| Web       | React, Vite, TypeScript |
| Desktop   | Electron, React         |
| Mobile    | React Native, Expo      |
