defmodule BurrowWeb.RoleController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Communities.Role
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/servers/:server_id/roles
  def index(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden} do
      roles = Communities.list_roles(sid)
      json(conn, %{data: Enum.map(roles, &role_json/1)})
    end
  end

  # POST /api/v1/servers/:server_id/roles
  def create(conn, %{"server_id" => server_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.create_roles()) || {:error, :forbidden},
         {:ok, role} <- Communities.create_role(sid, params) do
      conn
      |> put_status(:created)
      |> json(%{data: role_json(role)})
    end
  end

  # PATCH /api/v1/servers/:server_id/roles/:id
  def update(conn, %{"server_id" => server_id, "id" => id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.edit_roles()) || {:error, :forbidden},
         {:ok, role} <- Communities.get_role(parse_id(id)),
         true <- role.server_id == sid || {:error, :not_found},
         true <- check_hierarchy(sid, user_id, role) || {:error, :forbidden},
         {:ok, updated} <- Communities.update_role(role, params) do
      json(conn, %{data: role_json(updated)})
    end
  end

  # PATCH /api/v1/servers/:server_id/roles/reorder
  def reorder(conn, %{"server_id" => server_id, "positions" => positions}) when is_list(positions) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.edit_roles()) || {:error, :forbidden},
         safe_positions = Enum.map(positions, fn p -> %{"id" => parse_id(Map.get(p, "id", "0")), "position" => Map.get(p, "position", 0)} end),
         {:ok, _} <- Communities.reorder_roles(sid, safe_positions) do
      roles = Communities.list_roles(sid)
      json(conn, %{data: Enum.map(roles, &role_json/1)})
    end
  end

  # DELETE /api/v1/servers/:server_id/roles/:id
  def delete(conn, %{"server_id" => server_id, "id" => id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.delete_roles()) || {:error, :forbidden},
         {:ok, role} <- Communities.get_role(parse_id(id)),
         true <- role.server_id == sid || {:error, :not_found},
         true <- check_hierarchy(sid, user_id, role) || {:error, :forbidden},
         {:ok, _} <- Communities.delete_role(role) do
      json(conn, %{data: %{status: "deleted"}})
    end
  end

  # PUT /api/v1/servers/:server_id/members/:member_user_id/roles/:role_id
  def assign(conn, %{"server_id" => server_id, "member_user_id" => target, "role_id" => role_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.edit_roles()) || {:error, :forbidden},
         {:ok, role} <- Communities.get_role(parse_id(role_id)),
         true <- role.server_id == sid || {:error, :not_found},
         true <- check_hierarchy(sid, user_id, role) || {:error, :forbidden},
         {:ok, _} <- Communities.assign_role(sid, parse_id(target), role.id) do
      json(conn, %{data: %{status: "assigned"}})
    end
  end

  # DELETE /api/v1/servers/:server_id/members/:member_user_id/roles/:role_id
  def unassign(conn, %{"server_id" => server_id, "member_user_id" => target, "role_id" => role_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.edit_roles()) || {:error, :forbidden},
         {:ok, role} <- Communities.get_role(parse_id(role_id)),
         true <- role.server_id == sid || {:error, :not_found},
         true <- check_hierarchy(sid, user_id, role) || {:error, :forbidden},
         {:ok, _} <- Communities.remove_role(sid, parse_id(target), role.id) do
      json(conn, %{data: %{status: "removed"}})
    end
  end

  # Hierarchy check: user's highest role must be above the target role
  defp check_hierarchy(server_id, user_id, role) do
    case Communities.get_server(server_id) do
      {:ok, %{owner_id: ^user_id}} -> true
      _ -> Communities.highest_role_position(server_id, user_id) > role.position
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp role_json(%Role{} = r) do
    %{
      id: to_string(r.id),
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: to_string(r.permissions),
      hoist: r.hoist,
      mentionable: r.mentionable,
      server_id: to_string(r.server_id)
    }
  end
end
