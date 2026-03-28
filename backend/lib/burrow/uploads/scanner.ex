defmodule Burrow.Uploads.Scanner do
  @moduledoc """
  Unified upload scanning pipeline. Orchestrates:
  1. MIME verification (magic bytes — local)
  2. Virus scan (ClamAV — local)
  3. CSAM detection (perceptual hashing — local)

  ALL processing is local. No file data, hashes, or user information
  is ever transmitted to any external service.
  """

  require Logger

  alias Burrow.Uploads.{ClamAV, CSAMScanner, Mime}
  alias Burrow.Uploads.Upload
  alias Burrow.Repo
  alias Burrow.Storage

  @doc """
  Run the full scan pipeline on an uploaded file stored in S3.
  Updates the upload record with scan results.

  Returns {:ok, updated_upload} | {:error, reason}.
  """
  def scan_upload(%Upload{} = upload) do
    Logger.info("Scanner: starting scan for #{upload.key}")

    with {:ok, data} <- fetch_from_s3(upload.key),
         {:ok, result} <- run_pipeline(data, upload.filename, upload.content_type) do
      update_scan_result(upload, result)
    else
      {:error, reason} ->
        Logger.error("Scanner: failed for #{upload.key}: #{inspect(reason)}")
        update_scan_result(upload, %{
          scan_status: "error",
          scan_error: inspect(reason)
        })
    end
  end

  @doc """
  Run the scan pipeline on raw binary data (for inline/direct upload scanning).
  Returns {:ok, result_map} | {:error, reason}.
  """
  def run_pipeline(data, filename, declared_mime) do
    with {:mime, {:ok, detected_mime}} <- {:mime, Mime.verify(data, filename, declared_mime)},
         {:virus, virus_result} <- {:virus, scan_virus(data)},
         {:csam, csam_result} <- {:csam, scan_csam(data, detected_mime)} do

      {status, details} = consolidate_results(virus_result, csam_result)

      {:ok, %{
        scan_status: status,
        detected_mime: detected_mime,
        virus_scan: format_virus_result(virus_result),
        csam_scan: format_csam_result(csam_result),
        sha256: CSAMScanner.sha256(data),
        scan_details: details
      }}
    else
      {:mime, {:error, :blocked_file_type}} ->
        {:ok, %{
          scan_status: "rejected",
          detected_mime: nil,
          virus_scan: "skipped",
          csam_scan: "skipped",
          sha256: CSAMScanner.sha256(data),
          scan_details: "Blocked file type (executable)"
        }}

      {:mime, {:error, :mime_mismatch}} ->
        {:ok, %{
          scan_status: "rejected",
          detected_mime: nil,
          virus_scan: "skipped",
          csam_scan: "skipped",
          sha256: CSAMScanner.sha256(data),
          scan_details: "MIME type mismatch — declared type does not match file content"
        }}

      {:virus, {:error, reason}} ->
        {:error, {:virus_scan_failed, reason}}

      {:csam, {:error, reason}} ->
        {:error, {:csam_scan_failed, reason}}
    end
  end

  # --- Private ---

  defp fetch_from_s3(key) do
    bucket = Storage.bucket()

    ExAws.S3.get_object(bucket, key)
    |> ExAws.request(Storage.ex_aws_config())
    |> case do
      {:ok, %{body: data}} -> {:ok, data}
      {:error, reason} -> {:error, {:s3_fetch, reason}}
    end
  end

  defp scan_virus(data) do
    case ClamAV.scan(data) do
      {:ok, result} -> {:ok, result}
      {:error, :scanner_unavailable} ->
        Logger.warning("Scanner: ClamAV unavailable, marking as pending")
        {:ok, :pending}
      {:error, reason} -> {:error, reason}
    end
  end

  defp scan_csam(data, content_type) do
    CSAMScanner.scan(data, content_type)
  end

  defp consolidate_results(virus_result, csam_result) do
    cond do
      match?({:ok, {:infected, _}}, virus_result) ->
        {:ok, {:infected, sig}} = virus_result
        {"flagged", "Virus detected: #{sig}"}

      csam_result == {:ok, :flagged} ->
        {"flagged", "Content policy violation detected"}

      match?({:ok, :pending}, virus_result) ->
        {"pending", "Virus scan pending — scanner temporarily unavailable"}

      true ->
        {"clean", nil}
    end
  end

  defp format_virus_result({:ok, :clean}), do: "clean"
  defp format_virus_result({:ok, :pending}), do: "pending"
  defp format_virus_result({:ok, {:infected, sig}}), do: "infected:#{sig}"
  defp format_virus_result(_), do: "error"

  defp format_csam_result({:ok, :clean}), do: "clean"
  defp format_csam_result({:ok, :flagged}), do: "flagged"
  defp format_csam_result(_), do: "error"

  defp update_scan_result(upload, result) do
    changes =
      %{
        scan_status: result[:scan_status] || result.scan_status,
        mime_verified: result[:detected_mime],
        virus_result: result[:virus_scan],
        csam_result: result[:csam_scan],
        sha256: result[:sha256],
        scanned_at: DateTime.utc_now()
      }
      |> Map.reject(fn {_k, v} -> is_nil(v) end)

    # Also update content_type to the detected MIME if available
    changes =
      if result[:detected_mime] do
        Map.put(changes, :content_type, result[:detected_mime])
      else
        changes
      end

    upload
    |> Ecto.Changeset.change(changes)
    |> Repo.update()
  end
end
