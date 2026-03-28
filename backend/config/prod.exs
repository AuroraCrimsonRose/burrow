import Config

config :burrow, env: :prod

# Force using SSL in production. This also sets the "strict-security-transport" header,
# known as HSTS. If you have a health check endpoint, you may want to exclude it below.
# Note `:force_ssl` is required to be set at compile-time.
config :burrow, BurrowWeb.Endpoint,
  force_ssl: [rewrite_on: [:x_forwarded_proto]],
  exclude: [
    # paths: ["/health"],
    hosts: ["localhost", "127.0.0.1"]
  ]

# Production security: enforce replay guard, request signatures, and strong PoW
config :burrow,
  replay_guard_enabled: true,
  request_signatures_enabled: true,
  pow_difficulty: "0000"

# mTLS for internal services (enable when certs are provisioned)
# config :burrow,
#   mtls_enabled: true,
#   mtls: [
#     ca_certfile: "/etc/ssl/burrow/ca.pem",
#     client_certfile: "/etc/ssl/burrow/client-cert.pem",
#     client_keyfile: "/etc/ssl/burrow/client-key.pem"
#   ]

# TLS 1.3 endpoint configuration (when terminating TLS at the app)
# config :burrow, BurrowWeb.Endpoint,
#   https: Burrow.TLS.endpoint_ssl_opts(
#     port: 443,
#     keyfile: System.get_env("SSL_KEY_PATH"),
#     certfile: System.get_env("SSL_CERT_PATH"),
#     cacertfile: System.get_env("SSL_CA_PATH")
#   )

# Configure Swoosh API Client
config :swoosh, api_client: Swoosh.ApiClient.Req

# Disable Swoosh Local Memory Storage
config :swoosh, local: false

# Do not print debug messages in production
config :logger, level: :info

# Runtime production configuration, including reading
# of environment variables, is done on config/runtime.exs.
