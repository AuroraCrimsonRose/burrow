# ── Stage 1: Build ──
FROM elixir:1.17 AS builder

RUN mix local.hex --force && mix local.rebar --force

ENV MIX_ENV=prod

WORKDIR /app

COPY mix.exs mix.lock ./
COPY config ./config
RUN mix deps.get --only prod
RUN mix deps.compile

COPY lib ./lib
COPY priv ./priv

RUN mix compile
RUN mix release

# ── Stage 2: Runtime ──
FROM debian:bookworm-slim AS runtime

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 locales ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8

WORKDIR /app

COPY --from=builder /app/_build/prod/rel/burrow ./

EXPOSE 4000

# Entrypoint: run migrations then start server
CMD /app/bin/burrow eval "Burrow.Release.migrate" && /app/bin/burrow start
