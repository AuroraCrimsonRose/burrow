FROM elixir:1.17

# Install Hex and Rebar
RUN mix local.hex --force && \
    mix local.rebar --force

# Set workdir
WORKDIR /app

# Copy dependency manifests first for caching
COPY mix.exs mix.lock ./
RUN mix deps.get
RUN mix deps.compile

# Copy remaining app files
COPY . .

# Compile the app
RUN mix compile

# Expose Phoenix port
EXPOSE 4000

# Run server on container start
CMD ["mix", "phx.server"]
