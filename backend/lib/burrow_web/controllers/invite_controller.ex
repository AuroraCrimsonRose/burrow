defmodule BurrowWeb.InviteController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Trust
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  # POST /api/v1/servers/:server_id/invites
  def create(conn, %{"server_id" => server_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    # Convert expires_in (seconds) to expires_at datetime
    attrs =
      case params["expires_in"] do
        seconds when is_integer(seconds) and seconds > 0 ->
          Map.put(params, "expires_at", DateTime.add(DateTime.utc_now(), seconds, :second))
        _ ->
          params
      end

    with :ok <- Trust.can_create_invite?(user_id),
         true <- Communities.has_permission?(sid, user_id, Permissions.create_invite()) || {:error, :forbidden},
         {:ok, invite} <- Communities.create_invite(sid, user_id, attrs) do
      conn
      |> put_status(:created)
      |> json(invite_json(invite))
    end
  end

  # GET /api/v1/servers/:server_id/invites
  def index(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_permission?(sid, user_id, Permissions.manage_server()) || {:error, :forbidden} do
      invites = Communities.list_invites(sid)
      json(conn, %{invites: Enum.map(invites, &invite_json/1)})
    end
  end

  # POST /api/v1/invites/:code/accept
  def accept(conn, %{"code" => code}) do
    user_id = conn.assigns.current_user_id

    with :ok <- Trust.can_join_server?(user_id),
         {:ok, server} <- Communities.use_invite(code, user_id) do
      Trust.record_join_cooldown(user_id)

      json(conn, %{
        status: "joined",
        server: %{
          id: to_string(server.id),
          name: server.name
        }
      })
    end
  end

  # DELETE /api/v1/servers/:server_id/invites/:code
  def delete(conn, %{"server_id" => server_id, "code" => code}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_permission?(sid, user_id, Permissions.manage_server()) || {:error, :forbidden},
         {:ok, _} <- Communities.revoke_invite(code) do
      json(conn, %{status: "revoked"})
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp invite_json(%{} = inv) do
    %{
      code: inv.code,
      server_id: to_string(inv.server_id),
      inviter_id: if(inv.inviter_id, do: to_string(inv.inviter_id)),
      max_uses: inv.max_uses,
      uses_count: inv.uses_count,
      expires_at: inv.expires_at
    }
  end
end
