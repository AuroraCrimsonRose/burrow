defmodule BurrowWeb.UploadController do
  use BurrowWeb, :controller

  alias Burrow.Storage
  alias Burrow.Uploads
  alias Burrow.Uploads.Mime

  action_fallback BurrowWeb.FallbackController

  @max_size 100 * 1024 * 1024

  @doc "POST /api/v1/uploads — Direct file upload to S3"
  def create(conn, %{"file" => %Plug.Upload{} = upload} = params) do
    user_id = conn.assigns.current_user_id
    category = params["category"] || "files"

    with :ok <- validate_size(upload.path, @max_size) do
      {:ok, data} = File.read(upload.path)

      # MIME verify — uses magic bytes, fully local
      detected_mime =
        case Mime.verify(data, upload.filename || "file", upload.content_type) do
          {:ok, mime} -> mime
          {:error, :blocked_file_type} ->
            throw {:blocked, "File type is blocked (executable)"}
          {:error, :mime_mismatch} ->
            throw {:blocked, "File type mismatch — content does not match declared type"}
          _ -> upload.content_type
        end

      key = file_key(category, user_id, upload.filename || "file")

      case Storage.put_object(key, data, detected_mime) do
        {:ok, _key} ->
          # Record upload with pending scan status
          {:ok, upload_record} = Uploads.record_upload(
            user_id, key, upload.filename || "file",
            detected_mime, byte_size(data)
          )

          url =
            try do
              case Storage.signed_url(key) do
                {:ok, u} -> u
                _ -> nil
              end
            rescue
              _ -> nil
            end

          json(conn, %{
            key: key,
            url: url,
            filename: upload.filename,
            content_type: detected_mime,
            size: byte_size(data),
            scan_status: upload_record.scan_status
          })

        {:error, reason} ->
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Upload failed", detail: inspect(reason)})
      end
    end
  catch
    {:blocked, msg} ->
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{error: "blocked", detail: msg})
  end

  def create(_conn, _params), do: {:error, :bad_request}

  @doc "POST /api/v1/uploads/presign — Get a pre-signed URL for client-side upload"
  def presign(conn, %{"filename" => filename, "content_type" => content_type} = params) do
    user_id = conn.assigns.current_user_id
    category = params["category"] || "files"
    key = file_key(category, user_id, filename)

    case Storage.presigned_upload_url(key, content_type) do
      {:ok, upload_url} ->
        json(conn, %{
          upload_url: upload_url,
          key: key,
          expires_in: 300
        })

      {:error, reason} ->
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Failed to generate upload URL", detail: inspect(reason)})
    end
  end

  def presign(_conn, _params), do: {:error, :bad_request}

  @doc "GET /api/v1/uploads/signed-url — Get a signed download URL for a stored file"
  def signed_url(conn, %{"key" => key}) do
    # Check scan status — don't serve flagged files
    case Uploads.get_by_key(key) do
      %{scan_status: "flagged"} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "file_blocked", detail: "This file has been flagged and is not available"})

      upload ->
        case Storage.signed_url(key) do
          {:ok, url} ->
            result = %{url: url, expires_in: 900}
            result = if upload, do: Map.put(result, :scan_status, upload.scan_status), else: result
            json(conn, result)

          {:error, reason} ->
            conn
            |> put_status(:internal_server_error)
            |> json(%{error: "Failed to generate download URL", detail: inspect(reason)})
        end
    end
  end

  def signed_url(_conn, _params), do: {:error, :bad_request}

  @doc "GET /api/v1/uploads/scan-status — Get scan status for an upload"
  def scan_status(conn, %{"key" => key}) do
    case Uploads.get_by_key(key) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "not_found"})

      upload ->
        json(conn, %{
          key: upload.key,
          scan_status: upload.scan_status,
          mime_verified: upload.mime_verified,
          virus_result: upload.virus_result,
          csam_result: upload.csam_result,
          scanned_at: upload.scanned_at,
          expires_at: upload.expires_at
        })
    end
  end

  # --- Private ---

  defp file_key(category, user_id, filename) do
    ts = System.os_time(:millisecond)
    safe_name = filename |> Path.basename() |> String.replace(~r/[^a-zA-Z0-9._\-]/, "_")
    "#{category}/#{user_id}/#{ts}_#{safe_name}"
  end

  defp validate_size(path, max) do
    case File.stat(path) do
      {:ok, %{size: size}} when size <= max -> :ok
      {:ok, _} -> {:error, :file_too_large}
      {:error, _} -> {:error, :bad_request}
    end
  end
end
