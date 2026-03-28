defmodule Burrow.Uploads.ScanWorker do
  @moduledoc """
  Async worker that scans newly uploaded files. Picks up uploads with
  scan_status = "pending" and runs them through the full scan pipeline.

  Uses a simple polling approach — checks for pending uploads every few seconds.
  For production at scale, replace with an Oban job or Broadway pipeline.
  """

  use GenServer
  require Logger

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Uploads.Upload
  alias Burrow.Uploads.Scanner
  alias Burrow.Storage

  @poll_interval 5_000  # 5 seconds
  @batch_size 5

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok) do
    schedule_poll()
    {:ok, %{}}
  end

  @impl true
  def handle_info(:poll, state) do
    process_pending()
    schedule_poll()
    {:noreply, state}
  end

  defp schedule_poll do
    Process.send_after(self(), :poll, @poll_interval)
  end

  defp process_pending do
    uploads =
      Upload
      |> where([u], u.scan_status == "pending")
      |> order_by([u], asc: u.inserted_at)
      |> limit(^@batch_size)
      |> Repo.all()

    for upload <- uploads do
      # Mark as scanning
      upload
      |> Ecto.Changeset.change(scan_status: "scanning")
      |> Repo.update()

      case Scanner.scan_upload(upload) do
        {:ok, updated} ->
          # If flagged, delete the file from S3 and block access
          if updated.scan_status == "flagged" do
            Logger.warning("ScanWorker: flagged upload #{upload.key} — removing from storage")
            Storage.delete(upload.key)

            # Broadcast to connected clients that this attachment was flagged
            Phoenix.PubSub.broadcast(
              Burrow.PubSub,
              "upload:#{upload.key}",
              {:upload_flagged, upload.key}
            )
          end

          Logger.info("ScanWorker: #{upload.key} → #{updated.scan_status}")

        {:error, reason} ->
          Logger.error("ScanWorker: failed to scan #{upload.key}: #{inspect(reason)}")
      end
    end
  end
end
