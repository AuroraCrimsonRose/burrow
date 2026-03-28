defmodule Burrow.Social do
  @moduledoc """
  Context for social features: friendships and blocking.

  Friendships are directional — one row per relationship.
  - `pending`: user_id sent a request to friend_id
  - `accepted`: friendship is active (user_id initiated)
  - `blocked`: user_id has blocked friend_id

  When checking friendship status, both directions are queried.
  Blocking replaces any existing relationship.
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Snowflake
  alias Burrow.Social.Friendship

  # ---------------------------------------------------------------------------
  # Send friend request
  # ---------------------------------------------------------------------------

  @doc """
  Send a friend request from `user_id` to `target_id`.
  Returns `{:ok, friendship}` or `{:error, reason}`.
  """
  def send_request(user_id, target_id) when user_id == target_id,
    do: {:error, :bad_request}

  def send_request(user_id, target_id) do
    case get_relationship(user_id, target_id) do
      # Already friends
      %Friendship{status: "accepted"} ->
        {:error, :already_friends}

      # Already sent a request
      %Friendship{user_id: ^user_id, status: "pending"} ->
        {:error, :already_pending}

      # They sent us a request — auto-accept
      %Friendship{friend_id: ^user_id, status: "pending"} = f ->
        accept_request_record(f)

      # One of us blocked the other
      %Friendship{status: "blocked"} ->
        {:error, :blocked}

      # No relationship — create pending request
      nil ->
        %Friendship{}
        |> Friendship.changeset(%{
          id: Snowflake.next_id(),
          user_id: user_id,
          friend_id: target_id,
          status: "pending"
        })
        |> Repo.insert()
    end
  end

  # ---------------------------------------------------------------------------
  # Accept / Decline / Cancel
  # ---------------------------------------------------------------------------

  @doc "Accept an incoming friend request."
  def accept_request(user_id, requester_id) do
    case get_incoming_request(user_id, requester_id) do
      %Friendship{} = f -> accept_request_record(f)
      nil -> {:error, :not_found}
    end
  end

  @doc "Decline an incoming friend request (deletes the row)."
  def decline_request(user_id, requester_id) do
    case get_incoming_request(user_id, requester_id) do
      %Friendship{} = f -> Repo.delete(f)
      nil -> {:error, :not_found}
    end
  end

  @doc "Cancel an outgoing friend request you sent."
  def cancel_request(user_id, target_id) do
    case get_outgoing_request(user_id, target_id) do
      %Friendship{} = f -> Repo.delete(f)
      nil -> {:error, :not_found}
    end
  end

  # ---------------------------------------------------------------------------
  # Remove friend
  # ---------------------------------------------------------------------------

  @doc "Remove a friend (unfriend). Deletes the row."
  def remove_friend(user_id, friend_id) do
    case get_accepted(user_id, friend_id) do
      %Friendship{} = f -> Repo.delete(f)
      nil -> {:error, :not_found}
    end
  end

  # ---------------------------------------------------------------------------
  # Block / Unblock
  # ---------------------------------------------------------------------------

  @doc """
  Block a user. Replaces any existing relationship with a block.
  The blocked user cannot send DMs or friend requests.
  """
  def block_user(user_id, target_id) when user_id == target_id,
    do: {:error, :bad_request}

  def block_user(user_id, target_id) do
    Repo.transaction(fn ->
      # Remove any existing relationship in either direction
      Friendship
      |> where([f],
        (f.user_id == ^user_id and f.friend_id == ^target_id) or
          (f.user_id == ^target_id and f.friend_id == ^user_id)
      )
      |> Repo.delete_all()

      # Insert block row
      %Friendship{}
      |> Friendship.changeset(%{
        id: Snowflake.next_id(),
        user_id: user_id,
        friend_id: target_id,
        status: "blocked"
      })
      |> Repo.insert!()
    end)
  end

  @doc "Unblock a user. Deletes the block row."
  def unblock_user(user_id, target_id) do
    case Repo.one(
           from f in Friendship,
             where:
               f.user_id == ^user_id and f.friend_id == ^target_id and
                 f.status == "blocked"
         ) do
      %Friendship{} = f -> Repo.delete(f)
      nil -> {:error, :not_found}
    end
  end

  # ---------------------------------------------------------------------------
  # Queries
  # ---------------------------------------------------------------------------

  @doc "List accepted friends for a user, with user preloaded."
  def list_friends(user_id) do
    # Find friendships where the user is on either side
    sent =
      Friendship
      |> where([f], f.user_id == ^user_id and f.status == "accepted")
      |> preload(:friend)
      |> Repo.all()
      |> Enum.map(fn f -> %{friendship: f, user: f.friend} end)

    received =
      Friendship
      |> where([f], f.friend_id == ^user_id and f.status == "accepted")
      |> preload(:user)
      |> Repo.all()
      |> Enum.map(fn f -> %{friendship: f, user: f.user} end)

    sent ++ received
  end

  @doc "List incoming pending friend requests."
  def list_incoming_requests(user_id) do
    Friendship
    |> where([f], f.friend_id == ^user_id and f.status == "pending")
    |> preload(:user)
    |> Repo.all()
  end

  @doc "List outgoing pending friend requests."
  def list_outgoing_requests(user_id) do
    Friendship
    |> where([f], f.user_id == ^user_id and f.status == "pending")
    |> preload(:friend)
    |> Repo.all()
  end

  @doc "List users you have blocked."
  def list_blocked(user_id) do
    Friendship
    |> where([f], f.user_id == ^user_id and f.status == "blocked")
    |> preload(:friend)
    |> Repo.all()
  end

  @doc "Check if user_id has blocked target_id."
  def blocked?(user_id, target_id) do
    Friendship
    |> where([f],
      f.user_id == ^user_id and f.friend_id == ^target_id and f.status == "blocked"
    )
    |> Repo.exists?()
  end

  @doc "Check if either user has blocked the other."
  def either_blocked?(user_id, target_id) do
    Friendship
    |> where([f],
      ((f.user_id == ^user_id and f.friend_id == ^target_id) or
         (f.user_id == ^target_id and f.friend_id == ^user_id)) and
        f.status == "blocked"
    )
    |> Repo.exists?()
  end

  @doc "Check if two users are friends."
  def friends?(user_id, other_id) do
    get_accepted(user_id, other_id) != nil
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Get any relationship between two users (either direction)
  defp get_relationship(user_id, target_id) do
    Friendship
    |> where([f],
      (f.user_id == ^user_id and f.friend_id == ^target_id) or
        (f.user_id == ^target_id and f.friend_id == ^user_id)
    )
    |> Repo.one()
  end

  # Get an incoming pending request (target sent to us)
  defp get_incoming_request(user_id, requester_id) do
    Repo.one(
      from f in Friendship,
        where:
          f.user_id == ^requester_id and f.friend_id == ^user_id and
            f.status == "pending"
    )
  end

  # Get an outgoing pending request (we sent to target)
  defp get_outgoing_request(user_id, target_id) do
    Repo.one(
      from f in Friendship,
        where:
          f.user_id == ^user_id and f.friend_id == ^target_id and
            f.status == "pending"
    )
  end

  # Get an accepted friendship in either direction
  defp get_accepted(user_id, friend_id) do
    Repo.one(
      from f in Friendship,
        where:
          ((f.user_id == ^user_id and f.friend_id == ^friend_id) or
             (f.user_id == ^friend_id and f.friend_id == ^user_id)) and
            f.status == "accepted"
    )
  end

  defp accept_request_record(%Friendship{} = f) do
    f
    |> Ecto.Changeset.change(status: "accepted")
    |> Repo.update()
  end
end
