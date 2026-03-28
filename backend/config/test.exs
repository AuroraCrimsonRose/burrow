import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :burrow, Burrow.Repo,
  username: System.get_env("POSTGRES_USER", "burrow"),
  password: System.get_env("POSTGRES_PASSWORD", "changeme"),
  hostname: System.get_env("DB_HOST", "localhost"),
  database: "burrow_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :burrow, BurrowWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "VGK7IKjgSVMi9GF/hhGBKsDSA6wj4NoJ/0rGaYE7IVUbmxH1/05N7u58Gx4aNgt3",
  server: false

# In test we don't send emails
config :burrow, Burrow.Mailer, adapter: Swoosh.Adapters.Test

# Disable swoosh api client as it is only required for production adapters
config :swoosh, :api_client, false

# Print only warnings and errors during test
config :logger, level: :warning

# Disable security features in test for simpler test setup
config :burrow,
  replay_guard_enabled: false,
  request_signatures_enabled: false

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
