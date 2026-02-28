# Backend

The Elixir/Phoenix backend for Burrow.

## Local Development (via Docker)

Since Elixir is not installed locally, the backend runs entirely inside Docker.

```bash
# From project root
docker compose up -d

# View logs
docker compose logs -f backend

# Run migrations
docker compose exec backend mix ecto.migrate

# Open an IEx shell
docker compose exec backend iex -S mix

# Stop everything
docker compose down
```

## Generating the Phoenix project

The Phoenix project needs to be generated inside the Docker container on first setup:

```bash
# Start just the DB first
docker compose up -d db redis

# Generate Phoenix app in the backend folder
docker run --rm -v "${PWD}/backend:/app" -w /app elixir:1.17 bash -c "
  mix local.hex --force &&
  mix local.rebar --force &&
  mix archive.install hex phx_new --force &&
  mix phx.new . --app burrow --no-html --no-assets
"

# Then start everything
docker compose up -d
```

## API

The backend exposes:
- **REST API** on `http://localhost:4000/api`
- **WebSocket (Phoenix Channels)** on `ws://localhost:4000/socket`
