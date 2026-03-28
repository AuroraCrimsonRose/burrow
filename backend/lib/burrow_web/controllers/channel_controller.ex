defmodule BurrowWeb.ChannelController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/servers/:server_id/channels
  def index(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden} do
      channels = Communities.list_channels(sid)
      json(conn, %{channels: Enum.map(channels, &channel_json/1)})
    end
  end

  # POST /api/v1/servers/:server_id/channels
  def create(conn, %{"server_id" => server_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.create_channels()) || {:error, :forbidden},
         {:ok, channel} <- Communities.create_channel(sid, params) do
      conn
      |> put_status(:created)
      |> json(channel_json(channel))
    end
  end

  # PATCH /api/v1/servers/:server_id/channels/:id
  def update(conn, %{"server_id" => server_id, "id" => id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.edit_channels()) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(parse_id(id)),
         true <- channel.server_id == sid || {:error, :not_found},
         {:ok, updated} <- Communities.update_channel(channel, params) do
      json(conn, channel_json(updated))
    end
  end

  # DELETE /api/v1/servers/:server_id/channels/:id
  def delete(conn, %{"server_id" => server_id, "id" => id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.delete_channels()) || {:error, :forbidden},
         {:ok, channel} <- Communities.get_channel(parse_id(id)),
         true <- channel.server_id == sid || {:error, :not_found},
         {:ok, _} <- Communities.delete_channel(channel) do
      json(conn, %{status: "deleted"})
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp channel_json(%{} = ch) do
    %{
      id: to_string(ch.id),
      server_id: to_string(ch.server_id),
      category_id: if(ch.category_id, do: to_string(ch.category_id)),
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
      position: ch.position,
      nsfw: ch.nsfw,
      slow_mode_interval: ch.slow_mode_interval,
      bitrate: ch.bitrate,
      user_limit: ch.user_limit,
      last_seq: ch.last_seq || 0
    }
  end
end
