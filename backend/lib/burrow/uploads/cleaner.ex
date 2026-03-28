defmodule Burrow.Uploads.Cleaner do
  @moduledoc """
  Periodically deletes expired, non-permanent uploads from S3 and the database.
  Runs every hour.
  """

  use GenServer
  require Logger

  @interval :timer.hours(1)

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok) do
    schedule()
    {:ok, %{}}
  end

  @impl true
  def handle_info(:cleanup, state) do
    case Burrow.Uploads.cleanup_expired() do
      {:ok, 0} -> :ok
      {:ok, count} -> Logger.info("Uploads.Cleaner: deleted #{count} expired uploads")
      _ -> :ok
    end

    schedule()
    {:noreply, state}
  end

  defp schedule do
    Process.send_after(self(), :cleanup, @interval)
  end
end
