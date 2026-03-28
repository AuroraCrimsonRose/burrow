defmodule BurrowWeb.Telemetry do
  use Supervisor
  import Telemetry.Metrics

  def start_link(arg) do
    Supervisor.start_link(__MODULE__, arg, name: __MODULE__)
  end

  @impl true
  def init(_arg) do
    children = [
      {:telemetry_poller, measurements: periodic_measurements(), period: 10_000},
      {TelemetryMetricsPrometheus.Core, metrics: metrics()}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  def metrics do
    [
      # Phoenix Metrics
      distribution("phoenix.endpoint.stop.duration",
        unit: {:native, :millisecond},
        reporter_options: [buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]]
      ),
      distribution("phoenix.router_dispatch.stop.duration",
        tags: [:route],
        unit: {:native, :millisecond},
        reporter_options: [buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]]
      ),
      sum("phoenix.socket_drain.count"),
      distribution("phoenix.channel_handled_in.duration",
        tags: [:event],
        unit: {:native, :millisecond},
        reporter_options: [buckets: [1, 5, 10, 25, 50, 100, 250, 500]]
      ),

      # Database Metrics
      distribution("burrow.repo.query.total_time",
        unit: {:native, :millisecond},
        description: "The sum of the other measurements",
        reporter_options: [buckets: [0.5, 1, 5, 10, 25, 50, 100, 250]]
      ),
      distribution("burrow.repo.query.query_time",
        unit: {:native, :millisecond},
        description: "The time spent executing the query",
        reporter_options: [buckets: [0.5, 1, 5, 10, 25, 50, 100, 250]]
      ),
      distribution("burrow.repo.query.queue_time",
        unit: {:native, :millisecond},
        description: "The time spent waiting for a database connection",
        reporter_options: [buckets: [0.5, 1, 5, 10, 25, 50, 100, 250]]
      ),

      # Burrow custom metrics
      counter("burrow.ws.connections.total",
        description: "Total WebSocket connections"
      ),
      counter("burrow.messages.sent.total",
        description: "Total messages sent"
      ),
      counter("burrow.auth.registrations.total",
        description: "Total user registrations"
      ),
      counter("burrow.auth.logins.total",
        description: "Total successful logins"
      ),
      counter("burrow.errors.total",
        tags: [:kind],
        description: "Total errors by kind"
      ),
      last_value("burrow.ws.active_connections.count",
        description: "Current active WebSocket connections"
      )
    ]
  end

  defp periodic_measurements do
    [
      {__MODULE__, :ws_connection_count, []}
    ]
  end

  @doc false
  def ws_connection_count do
    count =
      try do
        :ets.info(:presence_users, :size) || 0
      rescue
        _ -> 0
      end

    :telemetry.execute([:burrow, :ws, :active_connections], %{count: count}, %{})
  end
end
