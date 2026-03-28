defmodule BurrowWeb.MemberController do
  use BurrowWeb, :controller

  alias Burrow.Communities
  alias Burrow.Permissions
  alias Burrow.Profiles

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/servers/:server_id/members
  def index(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden} do
      members = Communities.list_members(sid)
      json(conn, %{members: Enum.map(members, &member_json/1)})
    end
  end

  # DELETE /api/v1/servers/:server_id/members/:user_id  (kick or leave)
  def delete(conn, %{"server_id" => server_id, "user_id" => target_user_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    target = parse_id(target_user_id)

    with {:ok, server} <- Communities.get_server(sid) do
      cond do
        # Leaving the server yourself
        target == user_id ->
          with {:ok, _} <- Communities.remove_member(sid, user_id) do
            json(conn, %{status: "left"})
          end

        # Has kick permission and target is lower in hierarchy
        Communities.has_effective_permission?(sid, user_id, Permissions.kick_members()) ->
          if target == server.owner_id do
            {:error, :forbidden}
          else
            actor_pos = Communities.highest_role_position(sid, user_id)
            target_pos = Communities.highest_role_position(sid, target)

            if actor_pos > target_pos do
              with {:ok, _} <- Communities.remove_member(sid, target) do
                json(conn, %{status: "kicked"})
              end
            else
              {:error, :forbidden}
            end
          end

        true ->
          {:error, :forbidden}
      end
    end
  end

  defp parse_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, ""} -> n
      _ -> 0
    end
  end

  defp member_json(%{} = m) do
    user = m.user
    primary_badge = if user.primary_badge_id, do: Profiles.get_primary_badge(user.id), else: nil

    roles = case m.roles do
      %Ecto.Association.NotLoaded{} -> []
      loaded -> loaded
    end

    %{
      id: to_string(m.id),
      user_id: to_string(m.user_id),
      username: user.username,
      display_name: user.display_name,
      nickname: m.nickname,
      bio: m.bio,
      pronouns: m.pronouns,
      server_avatar_url: m.server_avatar_url,
      joined_at: m.joined_at,
      trust_score: user.trust_score,
      trust_tier: user.trust_tier,
      primary_badge: primary_badge,
      role_ids: Enum.map(roles, &to_string(&1.id))
    }
  end

  # PATCH /api/v1/servers/:server_id/members/@me
  def update_profile(conn, %{"server_id" => server_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden},
         {:ok, member} <- Communities.update_member_profile(sid, user_id, params) do
      member = Burrow.Repo.preload(member, :user)
      json(conn, member_json(member))
    end
  end

  # PATCH /api/v1/servers/:server_id/members/:user_id/nickname
  def update_nickname(conn, %{"server_id" => server_id, "user_id" => target_user_id} = params) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)
    target = parse_id(target_user_id)

    with true <- Communities.has_effective_permission?(sid, user_id, Permissions.manage_nicknames()) || {:error, :forbidden},
         {:ok, member} <- Communities.update_member_profile(sid, target, %{"nickname" => params["nickname"] || ""}) do
      member = Burrow.Repo.preload(member, :user)
      json(conn, member_json(member))
    end
  end

  # GET /api/v1/servers/:server_id/permissions
  def my_permissions(conn, %{"server_id" => server_id}) do
    user_id = conn.assigns.current_user_id
    sid = parse_id(server_id)

    with true <- Communities.member?(sid, user_id) || {:error, :forbidden} do
      perms = Communities.get_server_permissions(sid, user_id)
      json(conn, %{permissions: to_string(perms)})
    end
  end
end
