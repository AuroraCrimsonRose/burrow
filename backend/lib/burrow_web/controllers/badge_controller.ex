defmodule BurrowWeb.BadgeController do
  use BurrowWeb, :controller

  alias Burrow.Profiles
  alias Burrow.Auth

  action_fallback BurrowWeb.FallbackController

  @doc "GET /api/v1/badges — list all platform badges"
  def index(conn, _params) do
    badges = Profiles.list_badges()
    json(conn, %{badges: Enum.map(badges, &badge_json/1)})
  end

  @doc "PUT /api/v1/badges/primary — set primary badge"
  def set_primary(conn, %{"badge_id" => badge_id_str}) do
    user_id = conn.assigns.current_user_id
    badge_id = String.to_integer(badge_id_str)

    case Profiles.set_primary_badge(user_id, badge_id) do
      {:ok, _user} -> json(conn, %{ok: true})
      {:error, reason} -> {:error, reason}
    end
  rescue
    _ -> conn |> put_status(400) |> json(%{error: "You don't own that badge"})
  end

  @doc "DELETE /api/v1/badges/primary — clear primary badge"
  def clear_primary(conn, _params) do
    user_id = conn.assigns.current_user_id

    case Profiles.set_primary_badge(user_id, nil) do
      {:ok, _user} -> json(conn, %{ok: true})
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "POST /api/v1/badges/grant — dev-only: grant badge to user"
  def grant(conn, %{"user_id" => uid_str, "badge_id" => bid_str}) do
    granter_id = conn.assigns.current_user_id
    granter = Auth.get_user(granter_id)

    unless granter && granter.is_dev do
      conn |> put_status(403) |> json(%{error: "Forbidden"})
    else
      user_id = String.to_integer(uid_str)
      badge_id = String.to_integer(bid_str)

      case Profiles.grant_badge(user_id, badge_id, granter_id) do
        {:ok, _ub} -> json(conn, %{ok: true})
        {:error, reason} -> {:error, reason}
      end
    end
  end

  @doc "POST /api/v1/badges/revoke — dev-only: revoke badge from user"
  def revoke(conn, %{"user_id" => uid_str, "badge_id" => bid_str}) do
    granter = Auth.get_user(conn.assigns.current_user_id)

    unless granter && granter.is_dev do
      conn |> put_status(403) |> json(%{error: "Forbidden"})
    else
      user_id = String.to_integer(uid_str)
      badge_id = String.to_integer(bid_str)
      Profiles.revoke_badge(user_id, badge_id)
      json(conn, %{ok: true})
    end
  end

  @doc "POST /api/v1/badges/release-ancient — dev-only: grant Ancient badge to all existing users"
  def release_ancient(conn, _params) do
    granter = Auth.get_user(conn.assigns.current_user_id)

    unless granter && granter.is_dev do
      conn |> put_status(403) |> json(%{error: "Forbidden"})
    else
      case Profiles.release_ancient_badges(granter.id) do
        {:ok, count} -> json(conn, %{ok: true, count: count})
        {:error, reason} -> {:error, reason}
      end
    end
  end

  @doc "POST /api/v1/admin/set-dev — dev-only: set or unset is_dev on a user"
  def set_dev(conn, %{"user_id" => uid_str, "is_dev" => is_dev}) when is_boolean(is_dev) do
    granter = Auth.get_user(conn.assigns.current_user_id)

    unless granter && granter.is_dev do
      conn |> put_status(403) |> json(%{error: "Forbidden"})
    else
      user_id = String.to_integer(uid_str)

      case Auth.set_dev(user_id, is_dev) do
        {:ok, _user} -> json(conn, %{ok: true})
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp badge_json(badge) do
    %{
      id: badge.id,
      name: badge.name,
      icon: badge.icon,
      description: badge.description,
      rarity: badge.rarity,
      color: badge.color
    }
  end
end
