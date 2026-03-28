defmodule Burrow.Secrets do
  @moduledoc """
  Centralized secrets management.

  All secrets must flow through this module rather than being read directly
  from environment variables or config files. This provides:

  1. Single point of audit for secret access
  2. Runtime validation that required secrets are set
  3. Future integration with SOPS, Vault, or other secrets managers
  4. No plaintext secrets in config files — all sourced from environment

  ## Usage

      Burrow.Secrets.get!(:secret_key_base)
      Burrow.Secrets.get(:database_url)  # returns nil if not set

  ## SOPS Integration (Future)

  When SOPS is configured, secrets can be decrypted from an encrypted
  file at startup:

      config :burrow, Burrow.Secrets,
        sops_file: "config/secrets.enc.yaml",
        sops_binary: "/usr/local/bin/sops"
  """

  @secret_definitions %{
    secret_key_base: %{
      env: "SECRET_KEY_BASE",
      required_in: [:prod],
      description: "Phoenix session signing key"
    },
    database_url: %{
      env: "DATABASE_URL",
      required_in: [:prod],
      description: "PostgreSQL connection URL"
    },
    redis_url: %{
      env: "REDIS_URL",
      required_in: [],
      description: "Redis connection URL"
    },
    phx_host: %{
      env: "PHX_HOST",
      required_in: [:prod],
      description: "Public hostname for the application"
    },
    postgres_user: %{
      env: "POSTGRES_USER",
      required_in: [],
      description: "PostgreSQL username"
    },
    postgres_password: %{
      env: "POSTGRES_PASSWORD",
      required_in: [],
      description: "PostgreSQL password"
    }
  }

  @doc "Get a secret by name. Returns nil if not set."
  def get(name) when is_atom(name) do
    case Map.get(@secret_definitions, name) do
      nil -> raise ArgumentError, "Unknown secret: #{name}"
      %{env: env_var} -> System.get_env(env_var)
    end
  end

  @doc "Get a secret by name. Raises if not set."
  def get!(name) when is_atom(name) do
    case get(name) do
      nil ->
        defn = Map.fetch!(@secret_definitions, name)

        raise """
        Required secret #{name} is missing.
        Set the #{defn.env} environment variable.
        Description: #{defn.description}
        """

      value ->
        value
    end
  end

  @doc """
  Validate all secrets required for the current environment are set.
  Call at application startup.
  """
  def validate!(env \\ Mix.env()) do
    missing =
      @secret_definitions
      |> Enum.filter(fn {_name, defn} -> env in defn.required_in end)
      |> Enum.filter(fn {_name, defn} -> is_nil(System.get_env(defn.env)) end)
      |> Enum.map(fn {name, defn} -> "  #{defn.env} (#{name}): #{defn.description}" end)

    unless Enum.empty?(missing) do
      raise """
      Missing required secrets for #{env} environment:
      #{Enum.join(missing, "\n")}
      """
    end

    :ok
  end

  @doc "List all known secret names."
  def list_names, do: Map.keys(@secret_definitions)
end
