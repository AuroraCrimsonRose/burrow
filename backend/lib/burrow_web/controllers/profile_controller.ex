defmodule BurrowWeb.ProfileController do
  use BurrowWeb, :controller

  alias Burrow.Profiles
  alias Burrow.Auth

  @doc "GET /api/v1/users/:id/profile - Get another user's public profile"
  def show(conn, %{"id" => target_id_str}) do
    target_id = String.to_integer(target_id_str)

    case Auth.get_user(target_id) do
      nil ->
        {:error, :not_found}

      target ->
        badges = Profiles.get_user_badges(target_id)
        primary_badge = Profiles.get_primary_badge(target_id)

        json(conn, %{
          user_id: to_string(target.id),
          username: target.username,
          display_name: target.display_name,
          avatar_url: target.avatar_url,
          bio: target.bio,
          pronouns: target.pronouns,
          banner_url: target.banner_url,
          trust_tier: target.trust_tier,
          accent_color: target.accent_color,
          badges: badges,
          primary_badge: primary_badge
        })
    end
  end

  @doc "GET /api/v1/users/:id/note"
  def get_note(conn, %{"id" => target_id_str}) do
    author_id = conn.assigns.current_user_id
    target_id = String.to_integer(target_id_str)

    case Profiles.get_note(author_id, target_id) do
      nil -> json(conn, %{content: nil})
      note -> json(conn, %{content: note.content})
    end
  end

  @doc "PUT /api/v1/users/:id/note"
  def set_note(conn, %{"id" => target_id_str, "content" => content}) do
    author_id = conn.assigns.current_user_id
    target_id = String.to_integer(target_id_str)

    if author_id == target_id do
      conn |> put_status(400) |> json(%{error: "Cannot add a note to yourself"})
    else
      case Profiles.set_note(author_id, target_id, content) do
        {:ok, note} -> json(conn, %{content: note.content})
        {:error, changeset} -> {:error, changeset}
      end
    end
  end

  @doc "DELETE /api/v1/users/:id/note"
  def delete_note(conn, %{"id" => target_id_str}) do
    author_id = conn.assigns.current_user_id
    target_id = String.to_integer(target_id_str)

    Profiles.delete_note(author_id, target_id)
    json(conn, %{ok: true})
  end
end
