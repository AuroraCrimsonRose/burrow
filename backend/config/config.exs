# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :burrow,
  env: :dev,
  ecto_repos: [Burrow.Repo],
  generators: [timestamp_type: :utc_datetime],
  # Proof-of-Work difficulty: SHA-256(input + nonce) must start with this prefix.
  # "0000" for dev (fast), "000000" for production (~16.7M hashes avg)
  pow_difficulty: "0000",
  tos_version: "1.0",
  privacy_version: "1.0",
  # Security features (can be disabled per environment)
  replay_guard_enabled: true,
  request_signatures_enabled: true,
  mtls_enabled: false,
  # WebAuthn / Passkey configuration
  # NOTE: These are dev defaults only. Production values come from runtime.exs
  webauthn_rp_id: "localhost",
  webauthn_origin: "http://localhost:5173"

# ExAws configuration for S3 (MinIO in dev)
config :ex_aws,
  access_key_id: [{:system, "AWS_ACCESS_KEY_ID"}, :instance_role],
  secret_access_key: [{:system, "AWS_SECRET_ACCESS_KEY"}, :instance_role],
  region: "us-east-1",
  json_codec: Jason

config :ex_aws, :s3,
  scheme: "http://",
  host: "minio",
  port: 9000

# GeoIP — MaxMind GeoLite2 (configure database path in env-specific configs)
# Download from: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
# In dev, mount the .mmdb file into the backend container via docker-compose

# Configure the endpoint
config :burrow, BurrowWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: BurrowWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Burrow.PubSub,
  live_view: [signing_salt: "7kMik9JS"]

# Configure the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :burrow, Burrow.Mailer, adapter: Swoosh.Adapters.Local

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
