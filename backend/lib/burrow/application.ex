defmodule Burrow.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # ETS table for typing indicator debounce (ephemeral, no persistence needed)
    :ets.new(:typing_debounce, [:set, :public, :named_table])
    # ETS table for session touch throttling (only write last_active every 5 min)
    :ets.new(:session_touch, [:set, :public, :named_table])

    redis_url = System.get_env("REDIS_URL") || "redis://redis:6379"

    children = [
      BurrowWeb.Telemetry,
      Burrow.Repo,
      {DNSCluster, query: Application.get_env(:burrow, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Burrow.PubSub},
      Burrow.Snowflake,
      {Redix, {redis_url, [name: :redix]}},
      Burrow.Presence,
      Burrow.Uploads.Cleaner,
      Burrow.Uploads.ScanWorker,
      Burrow.Voice.VoiceState,
      # Start to serve requests, typically the last entry
      BurrowWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Burrow.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    BurrowWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
