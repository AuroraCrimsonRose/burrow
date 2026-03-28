defmodule BurrowWeb.PresenceController do
  use BurrowWeb, :controller

  alias Burrow.Presence
  alias Burrow.Communities
  alias Burrow.Social

  @doc "GET /api/v1/servers/:server_id/presence — poll server member presence."
  def server_presence(conn, %{"server_id" => server_id_str}) do
    user_id = conn.assigns.current_user_id

    with {server_id, ""} <- Integer.parse(server_id_str),
         true <- Communities.member?(server_id, user_id) do
      members = Communities.list_members(server_id)
      member_ids = Enum.map(members, fn m -> m.user_id end)
      statuses = Presence.get_statuses(member_ids)

      presences =
        Enum.map(statuses, fn {uid, status} ->
          %{user_id: to_string(uid), status: status}
        end)

      json(conn, %{data: presences})
    else
      _ ->
        conn
        |> put_status(403)
        |> json(%{error: %{code: "forbidden", detail: "Not a server member"}})
    end
  end

  @doc "GET /api/v1/friends/presence — poll friend presence."
  def friend_presence(conn, _params) do
    user_id = conn.assigns.current_user_id
    friends = Social.list_friends(user_id)
    friend_ids = Enum.map(friends, fn %{user: u} -> u.id end)
    statuses = Presence.get_statuses(friend_ids)

    presences =
      Enum.map(statuses, fn {uid, status} ->
        %{user_id: to_string(uid), status: status}
      end)

    json(conn, %{data: presences})
  end
end
