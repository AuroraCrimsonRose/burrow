defmodule BurrowWeb.AvatarController do
  use BurrowWeb, :controller

  alias Burrow.Auth
  alias Burrow.Storage

  action_fallback BurrowWeb.FallbackController

  @max_size 2 * 1024 * 1024
  @allowed_types %{
    "image/png" => ".png",
    "image/jpeg" => ".jpg",
    "image/webp" => ".webp",
    "image/gif" => ".gif"
  }

  @doc "POST /api/v1/auth/avatar"
  def upload(conn, %{"avatar" => %Plug.Upload{} = upload}) do
    user_id = conn.assigns.current_user_id

    with :ok <- validate_size(upload.path),
         {:ok, ext} <- validate_type(upload.content_type) do
      filename = "#{user_id}_#{System.os_time(:millisecond)}#{ext}"
      key = "avatars/#{filename}"

      {:ok, data} = File.read(upload.path)

      case Storage.put_object(key, data, upload.content_type) do
        {:ok, _key} ->
          avatar_url =
            try do
              case Storage.signed_url(key) do
                {:ok, u} -> u
                _ -> nil
              end
            rescue
              _ -> nil
            end

          case Auth.update_avatar(user_id, key) do
            {:ok, _user} ->
              json(conn, %{avatar_url: avatar_url, key: key})

            {:error, changeset} ->
              {:error, changeset}
          end

        {:error, reason} ->
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Upload failed", detail: inspect(reason)})
      end
    end
  end

  def upload(_conn, _params), do: {:error, :bad_request}

  defp validate_size(path) do
    case File.stat(path) do
      {:ok, %{size: size}} when size <= @max_size -> :ok
      {:ok, _} -> {:error, :file_too_large}
      {:error, _} -> {:error, :bad_request}
    end
  end

  defp validate_type(content_type) do
    case Map.fetch(@allowed_types, content_type) do
      {:ok, ext} -> {:ok, ext}
      :error -> {:error, :invalid_file_type}
    end
  end
end
