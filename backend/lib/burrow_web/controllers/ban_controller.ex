defmodule BurrowWeb.BanController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  # POST /api/v1/servers/:server_id/bans
  def create(conn, %{"server_id" => server_id, "user_id" => target_user_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    target = parse_id(target_user_id)

    with {:ok, server} <- Communities.get_server(sid),
         true <- Communities.has_effective_permission?(sid, user_id, Permissions.ban_members()) || {:error, :forbidden},
         :ok <- check_hierarchy(server, sid, user_id, target),
         {:ok, ban} <- Communities.ban_member(sid, target, user_id, params) do
      conn
      |> put_status(:created)
      |> json(ban_json(ban))
    end
  end

  # GET /api/v1/servers/:server_id/bans
  def index(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.ban_members()) || {:error, :forbidden} do
      bans = Communities.list_bans(sid)
      json(conn, %{bans: Enum.map(bans, &ban_json/1)})
    end
  end

  # DELETE /api/v1/servers/:server_id/bans/:user_id
  def delete(conn, %{"server_id" => server_id, "user_id" => target_user_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    target = parse_id(target_user_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.ban_members()) || {:error, :forbidden},
         {:ok, _} <- Communities.unban_member(sid, target) do
      json(conn, %{status: "unbanned"})
    end
  end

  # POST /api/v1/servers/:server_id/timeouts
  def timeout(conn, %{"server_id" => server_id, "user_id" => target_user_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    target = parse_id(target_user_id)

    with {:ok, server} <- Communities.get_server(sid),
         true <- Communities.has_effective_permission?(sid, user_id, Permissions.timeout_members()) || {:error, :forbidden},
         :ok <- check_hierarchy(server, sid, user_id, target),
         {:ok, until} <- parse_duration(params),
         {:ok, member} <- Communities.timeout_member(sid, target, until) do
      json(conn, %{
        user_id: to_string(target),
        timed_out_until: member.timed_out_until
      })
    end
  end

  # DELETE /api/v1/servers/:server_id/timeouts/:user_id
  def remove_timeout(conn, %{"server_id" => server_id, "user_id" => target_user_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    target = parse_id(target_user_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.timeout_members()) || {:error, :forbidden},
         {:ok, _} <- Communities.remove_timeout(sid, target) do
      json(conn, %{status: "timeout_removed"})
    end
  end

  defp check_hierarchy(server, sid, actor_id, target_id) do
    cond do
      target_id == server.owner_id -> {:error, :forbidden}
      server.owner_id == actor_id -> :ok
      true ->
        actor_pos = Communities.highest_role_position(sid, actor_id)
        target_pos = Communities.highest_role_position(sid, target_id)
        if actor_pos > target_pos, do: :ok, else: {:error, :forbidden}
    end
  end

  defp parse_duration(%{"duration" => seconds}) when is_integer(seconds) and seconds > 0 do
    until = DateTime.add(DateTime.utc_now(), seconds, :second)
    {:ok, until}
  end

  defp parse_duration(%{"until" => until_str}) when is_binary(until_str) do
    case DateTime.from_iso8601(until_str) do
      {:ok, dt, _offset} -> {:ok, dt}
      _ -> {:error, :bad_request}
    end
  end

  defp parse_duration(_), do: {:error, :bad_request}

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp ban_json(%{} = ban) do
    %{
      id: to_string(ban.id),
      server_id: to_string(ban.server_id),
      user_id: to_string(ban.user_id),
      banned_by: to_string(ban.banned_by),
      reason: ban.reason,
      expires_at: ban.expires_at,
      timestamp: ban.inserted_at
    }
  end
end
