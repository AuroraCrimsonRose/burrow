defmodule BurrowWeb.ReadStateController do
  use BurrowWeb, :controller

  alias Burrow.Chat
  alias Burrow.Communities

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/users/@me/read-states
  def index(conn, _params) do
    user_id = conn.assigns.current_user_id
    read_states = Chat.list_read_states(user_id)

    json(conn, %{
      read_states: Enum.map(read_states, &read_state_json/1)
    })
  end

  # POST /api/v1/servers/:server_id/channels/:channel_id/ack
  def ack(conn, %{"server_id" => server_id, "channel_id" => channel_id, "message_id" => message_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    cid = parse_id(channel_id)
    mid = parse_id(message_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         {:ok, read_state} <- Chat.ack_message(user_id, cid, mid) do
      json(conn, read_state_json(read_state))
    end
  end

  # POST /api/v1/dms/:id/ack
  def ack_dm(conn, %{"id" => dm_id, "message_id" => message_id}) do
    user_id = conn.assigns.current_user_id
    did = parse_id(dm_id)
    mid = parse_id(message_id)

    with true <- Burrow.DM.participant?(did, user_id) || {:error, :forbidden},
         {:ok, read_state} <- Chat.ack_message(user_id, did, mid) do
      json(conn, read_state_json(read_state))
    end
  end

  # POST /api/v1/servers/:server_id/ack  (mark entire server as read)
  def ack_server(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         :ok <- Chat.mark_server_read(user_id, sid) do
      json(conn, %{ok: true})
    end
  end

  defp read_state_json(%Chat.ReadState{} = rs) do
    %{
      channel_id: to_string(rs.channel_id),
      last_read_message_id: if(rs.last_read_message_id, do: to_string(rs.last_read_message_id)),
      last_read_seq: rs.last_read_seq,
      mention_count: rs.mention_count
    }
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end
end
