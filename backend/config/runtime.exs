import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/burrow start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :burrow, BurrowWeb.Endpoint, server: true
end

config :burrow, BurrowWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))]

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  # PostgreSQL connection — enable SSL/mTLS when configured
  repo_opts = [
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: maybe_ipv6
  ]

  repo_opts =
    if System.get_env("DB_SSL") == "true" do
      ssl_opts =
        [
          verify: :verify_peer,
          cacertfile: System.get_env("DB_CA_CERTFILE"),
          certfile: System.get_env("DB_CLIENT_CERTFILE"),
          keyfile: System.get_env("DB_CLIENT_KEYFILE"),
          versions: [:"tlsv1.3"]
        ]
        |> Enum.reject(fn {_k, v} -> is_nil(v) end)

      Keyword.merge(repo_opts, ssl: true, ssl_opts: ssl_opts)
    else
      repo_opts
    end

  config :burrow, Burrow.Repo, repo_opts

  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :burrow, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  # mTLS config from environment
  if System.get_env("MTLS_ENABLED") == "true" do
    config :burrow,
      mtls_enabled: true,
      mtls: [
        ca_certfile: System.get_env("MTLS_CA_CERTFILE"),
        client_certfile: System.get_env("MTLS_CLIENT_CERTFILE"),
        client_keyfile: System.get_env("MTLS_CLIENT_KEYFILE")
      ]
  end

  # ToS/Privacy versions can be overridden at runtime
  if tos = System.get_env("TOS_VERSION") do
    config :burrow, tos_version: tos
  end

  if privacy = System.get_env("PRIVACY_VERSION") do
    config :burrow, privacy_version: privacy
  end

  # WebAuthn / Passkey — MUST be set to your real domain for production
  webauthn_rp_id = System.get_env("WEBAUTHN_RP_ID") || host
  webauthn_origin = System.get_env("WEBAUTHN_ORIGIN") || "https://#{host}"
  config :burrow, webauthn_rp_id: webauthn_rp_id, webauthn_origin: webauthn_origin

  config :burrow, BurrowWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  # TLS 1.3 termination at the app (when not behind a reverse proxy)
  if System.get_env("SSL_KEY_PATH") do
    config :burrow, BurrowWeb.Endpoint,
      https: [
        port: 443,
        versions: [:"tlsv1.3"],
        cipher_suite: :strong,
        keyfile: System.get_env("SSL_KEY_PATH"),
        certfile: System.get_env("SSL_CERT_PATH"),
        cacertfile: System.get_env("SSL_CA_PATH")
      ]
  end
  # Check `Plug.SSL` for all available options in `force_ssl`.

  # ## Configuring the mailer
  #
  # In production you need to configure the mailer to use a different adapter.
  # Here is an example configuration for Mailgun:
  #
  #     config :burrow, Burrow.Mailer,
  #       adapter: Swoosh.Adapters.Mailgun,
  #       api_key: System.get_env("MAILGUN_API_KEY"),
  #       domain: System.get_env("MAILGUN_DOMAIN")
  #
  # Most non-SMTP adapters require an API client. Swoosh supports Req, Hackney,
  # and Finch out-of-the-box. This configuration is typically done at
  # compile-time in your config/prod.exs:
  #
  #     config :swoosh, :api_client, Swoosh.ApiClient.Req
  #
  # See https://hexdocs.pm/swoosh/Swoosh.html#module-installation for details.
end
