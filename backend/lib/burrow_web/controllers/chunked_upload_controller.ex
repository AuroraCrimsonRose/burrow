defmodule BurrowWeb.ChunkedUploadController do
  use BurrowWeb, :controller

  alias Burrow.Storage
  alias Burrow.Trust
  alias Burrow.Uploads

  action_fallback BurrowWeb.FallbackController

  @chunk_max 6 * 1_048_576  # 6 MB per chunk (Cloudflare-safe)
  @upload_ttl 3600           # 1 hour to complete a chunked upload

  @doc "POST /uploads/chunked/init — start a multipart upload"
  def init_upload(conn, %{"filename" => filename, "content_type" => content_type, "size" => size}) do
    user_id = conn.assigns.current_user_id
    size = if is_binary(size), do: String.to_integer(size), else: size

    max_bytes = Trust.max_upload_bytes(user_id)

    cond do
      max_bytes == 0 ->
        {:error, :forbidden}

      size > max_bytes ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "file_too_large", detail: "Max upload size: #{div(max_bytes, 1_048_576)} MB"})

      true ->
        key = file_key(user_id, filename)

        case Storage.initiate_multipart(key, content_type) do
          {:ok, upload_id} ->
            # Store session in Redis with TTL
            meta = Jason.encode!(%{
              key: key,
              user_id: user_id,
              filename: filename,
              content_type: content_type,
              size: size,
              parts: %{}
            })
            Redix.command(:redix, ["SET", "upload:#{upload_id}", meta, "EX", @upload_ttl])

            json(conn, %{upload_id: upload_id, key: key})

          {:error, reason} ->
            conn
            |> put_status(:internal_server_error)
            |> json(%{error: "init_failed", detail: inspect(reason)})
        end
    end
  end

  def init_upload(_conn, _params), do: {:error, :bad_request}

  @doc "PUT /uploads/chunked/:upload_id/:part_number — upload one chunk"
  def upload_chunk(conn, %{"upload_id" => upload_id, "part_number" => part_str}) do
    user_id = conn.assigns.current_user_id
    part_number = String.to_integer(part_str)

    with {:ok, meta} <- get_upload_meta(upload_id),
         true <- meta["user_id"] == user_id || {:error, :forbidden} do
      # Read raw body (Plug.Parsers already consumed it for multipart,
      # but we use a custom body reader for this route)
      {:ok, body, conn} = Plug.Conn.read_body(conn, length: @chunk_max)

      if byte_size(body) > @chunk_max do
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "chunk_too_large", detail: "Max chunk size: #{div(@chunk_max, 1_048_576)} MB"})
      else
        case Storage.upload_part(meta["key"], upload_id, part_number, body) do
          {:ok, etag} ->
            # Record part etag in Redis
            parts = Map.put(meta["parts"] || %{}, to_string(part_number), etag)
            updated = Map.put(meta, "parts", parts)
            Redix.command(:redix, ["SET", "upload:#{upload_id}", Jason.encode!(updated), "EX", @upload_ttl])

            json(conn, %{part_number: part_number, etag: etag})

          {:error, reason} ->
            conn
            |> put_status(:internal_server_error)
            |> json(%{error: "chunk_failed", detail: inspect(reason)})
        end
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "upload_not_found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  @doc "POST /uploads/chunked/:upload_id/complete — finalize the multipart upload"
  def complete(conn, %{"upload_id" => upload_id}) do
    user_id = conn.assigns.current_user_id

    with {:ok, meta} <- get_upload_meta(upload_id),
         true <- meta["user_id"] == user_id || {:error, :forbidden} do
      parts =
        meta["parts"]
        |> Enum.map(fn {num_str, etag} -> {String.to_integer(num_str), etag} end)
        |> Enum.sort_by(&elem(&1, 0))

      case Storage.complete_multipart(meta["key"], upload_id, parts) do
        {:ok, _key} ->
          # Record in uploads table with 7-day TTL and pending scan
          {:ok, upload_record} = Uploads.record_upload(
            user_id,
            meta["key"],
            meta["filename"],
            meta["content_type"],
            meta["size"]
          )

          # Clean up Redis
          Redix.command(:redix, ["DEL", "upload:#{upload_id}"])

          url =
            try do
              case Storage.signed_url(meta["key"]) do
                {:ok, u} -> u
                _ -> nil
              end
            rescue
              _ -> nil
            end

          json(conn, %{
            key: meta["key"],
            url: url,
            filename: meta["filename"],
            content_type: meta["content_type"],
            size: meta["size"],
            scan_status: upload_record.scan_status
          })

        {:error, reason} ->
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "complete_failed", detail: inspect(reason)})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "upload_not_found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  # --- Private ---

  defp file_key(user_id, filename) do
    ts = System.os_time(:millisecond)
    safe_name = filename |> Path.basename() |> String.replace(~r/[^a-zA-Z0-9._\-]/, "_")
    "attachments/#{user_id}/#{ts}_#{safe_name}"
  end

  defp get_upload_meta(upload_id) do
    case Redix.command(:redix, ["GET", "upload:#{upload_id}"]) do
      {:ok, nil} -> {:error, :not_found}
      {:ok, json} -> {:ok, Jason.decode!(json)}
      {:error, _} -> {:error, :not_found}
    end
  end
end
