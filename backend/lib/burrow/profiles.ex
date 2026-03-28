defmodule Burrow.Profiles do
  @moduledoc "Context for profile customization: badges, user notes, accent colors."

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Snowflake
  alias Burrow.Auth.User
  alias Burrow.Profiles.{Badge, UserBadge, UserNote}

  # ── Accent Color ──

  def update_accent_color(user_id, color) do
    user = Repo.get!(User, user_id)

    user
    |> Ecto.Changeset.change(%{accent_color: color})
    |> Ecto.Changeset.validate_format(:accent_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a hex color like #7c3aed")
    |> Repo.update()
  end

  # ── Badges ──

  def list_badges do
    Repo.all(Badge)
  end

  def get_user_badges(user_id) do
    from(ub in UserBadge,
      where: ub.user_id == ^user_id,
      join: b in Badge, on: b.id == ub.badge_id,
      select: %{id: b.id, name: b.name, icon: b.icon, description: b.description,
                rarity: b.rarity, color: b.color, granted_at: ub.granted_at}
    )
    |> Repo.all()
  end

  def grant_badge(user_id, badge_id, granted_by \\ nil) do
    %UserBadge{}
    |> Ecto.Changeset.change(%{
      id: Snowflake.next_id(),
      user_id: user_id,
      badge_id: badge_id,
      granted_at: DateTime.utc_now(),
      granted_by: granted_by
    })
    |> Repo.insert(on_conflict: :nothing)
  end

  def revoke_badge(user_id, badge_id) do
    from(ub in UserBadge, where: ub.user_id == ^user_id and ub.badge_id == ^badge_id)
    |> Repo.delete_all()
  end

  def set_primary_badge(user_id, badge_id) do
    user = Repo.get!(User, user_id)
    # Verify the user actually owns this badge (or allow nil to clear)
    if badge_id do
      owns? = Repo.exists?(from ub in UserBadge, where: ub.user_id == ^user_id and ub.badge_id == ^badge_id)
      unless owns?, do: raise("User does not own this badge")
    end

    user
    |> Ecto.Changeset.change(%{primary_badge_id: badge_id})
    |> Repo.update()
  end

  def get_primary_badge(user_id) do
    user = Repo.get(User, user_id)
    case user && user.primary_badge_id do
      nil -> nil
      badge_id ->
        from(b in Badge, where: b.id == ^badge_id,
          select: %{id: b.id, name: b.name, icon: b.icon, rarity: b.rarity, color: b.color})
        |> Repo.one()
    end
  end

  def release_ancient_badges(granted_by_id) do
    ancient = Repo.get_by(Badge, name: "Ancient")
    unless ancient, do: raise("Ancient badge not found")

    # All users created before now get the badge
    users = from(u in User, select: u.id) |> Repo.all()

    results =
      Enum.map(users, fn user_id ->
        grant_badge(user_id, ancient.id, granted_by_id)
      end)

    {:ok, Enum.count(results, fn {status, _} -> status == :ok end)}
  end

  # ── User Notes ──

  def get_note(author_id, target_user_id) do
    Repo.get_by(UserNote, author_id: author_id, target_user_id: target_user_id)
  end

  def set_note(author_id, target_user_id, content) do
    case get_note(author_id, target_user_id) do
      nil ->
        %UserNote{}
        |> UserNote.changeset(%{
          id: Snowflake.next_id(),
          author_id: author_id,
          target_user_id: target_user_id,
          content: content
        })
        |> Repo.insert()

      note ->
        note
        |> Ecto.Changeset.change(%{content: content})
        |> Ecto.Changeset.validate_length(:content, max: 1024)
        |> Repo.update()
    end
  end

  def delete_note(author_id, target_user_id) do
    case get_note(author_id, target_user_id) do
      nil -> {:ok, nil}
      note -> Repo.delete(note)
    end
  end
end
