defmodule Burrow.TLS do
  @moduledoc """
  TLS configuration helpers for Burrow.

  Provides TLS 1.3-only cipher suite configuration for external traffic
  and mTLS configuration for internal service-to-service communication.

  ## External TLS (HTTPS)

  Enforces TLS 1.3 minimum with strong cipher suites:

      config :burrow, BurrowWeb.Endpoint,
        https: Burrow.TLS.endpoint_ssl_opts(
          certfile: "/path/to/cert.pem",
          keyfile: "/path/to/key.pem"
        )

  ## Internal mTLS

  For service-to-service (backend ↔ PostgreSQL, backend ↔ Redis):

      config :burrow, Burrow.Repo,
        ssl: true,
        ssl_opts: Burrow.TLS.client_ssl_opts(
          certfile: "/path/to/client-cert.pem",
          keyfile: "/path/to/client-key.pem",
          cacertfile: "/path/to/ca.pem"
        )

  ## Dev Mode

  mTLS is disabled in dev by default. Set `config :burrow, mtls_enabled: true`
  to enable. Use `mix phx.gen.cert` to generate self-signed certs for local dev.
  """

  @tls_13_versions [:"tlsv1.3"]

  @tls_13_ciphers [
    {:aes_256_gcm, :aead, :sha384},
    {:aes_128_gcm, :aead, :sha256},
    {:chacha20_poly1305, :aead, :sha256}
  ]

  @doc """
  SSL options for the Phoenix endpoint (server-side TLS).
  Enforces TLS 1.3 only with strong cipher suites.
  """
  def endpoint_ssl_opts(overrides \\ []) do
    base = [
      port: 443,
      versions: @tls_13_versions,
      ciphers: @tls_13_ciphers,
      honor_cipher_order: true,
      secure_renegotiate: true,
      reuse_sessions: true
    ]

    Keyword.merge(base, overrides)
  end

  @doc """
  SSL options for mTLS client connections (e.g. to PostgreSQL, Redis).
  Includes client certificate for mutual authentication.
  """
  def client_ssl_opts(overrides \\ []) do
    base = [
      versions: @tls_13_versions,
      verify: :verify_peer,
      depth: 3
    ]

    Keyword.merge(base, overrides)
  end

  @doc """
  SSL options for the PostgreSQL connection when mTLS is enabled.
  """
  def postgres_ssl_opts do
    if mtls_enabled?() do
      config = Application.get_env(:burrow, :mtls, [])

      [
        verify: :verify_peer,
        cacertfile: Keyword.get(config, :ca_certfile),
        certfile: Keyword.get(config, :client_certfile),
        keyfile: Keyword.get(config, :client_keyfile),
        versions: @tls_13_versions
      ]
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    else
      []
    end
  end

  @doc "Whether mTLS is enabled for internal service communication."
  def mtls_enabled? do
    Application.get_env(:burrow, :mtls_enabled, false)
  end
end
