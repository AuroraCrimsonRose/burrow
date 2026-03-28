defmodule BurrowWeb.FriendController do
  use BurrowWeb, :controller

  alias Burrow.Social

  action_fallback BurrowWeb.FallbackController

  # GET /api/v1/friends — list accepted friends
  def index(conn, _params) do
    user_id = conn.assigns.current_user_id
    friends = Social.list_friends(user_id)

    json(conn, %{
      friends:
        Enum.map(friends, fn %{user: u} ->
          %{id: to_string(u.id), username: u.username}
        end)
    })
  end

  # GET /api/v1/friends/requests — list incoming + outgoing requests
  def requests(conn, _params) do
    user_id = conn.assigns.current_user_id
    incoming = Social.list_incoming_requests(user_id)
    outgoing = Social.list_outgoing_requests(user_id)

    json(conn, %{
      incoming:
        Enum.map(incoming, fn f ->
          %{id: to_string(f.id), user: %{id: to_string(f.user_id), username: f.user.username}}
        end),
      outgoing:
        Enum.map(outgoing, fn f ->
          %{id: to_string(f.id), user: %{id: to_string(f.friend_id), username: f.friend.username}}
        end)
    })
  end

  # POST /api/v1/friends/request — send a friend request
  def send_request(conn, %{"user_id" => target_id_str}) do
    user_id = conn.assigns.current_user_id

    with {target_id, ""} <- Integer.parse(target_id_str),
         {:ok, friendship} <- Social.send_request(user_id, target_id) do
      conn
      |> put_status(:created)
      |> json(%{
        id: to_string(friendship.id),
        user_id: to_string(friendship.user_id),
        friend_id: to_string(friendship.friend_id),
        status: friendship.status
      })
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # POST /api/v1/friends/:user_id/accept — accept incoming request
  def accept(conn, %{"user_id" => requester_id_str}) do
    user_id = conn.assigns.current_user_id

    with {requester_id, ""} <- Integer.parse(requester_id_str),
         {:ok, friendship} <- Social.accept_request(user_id, requester_id) do
      json(conn, %{
        id: to_string(friendship.id),
        user_id: to_string(friendship.user_id),
        friend_id: to_string(friendship.friend_id),
        status: friendship.status
      })
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # POST /api/v1/friends/:user_id/decline — decline incoming request
  def decline(conn, %{"user_id" => requester_id_str}) do
    user_id = conn.assigns.current_user_id

    with {requester_id, ""} <- Integer.parse(requester_id_str),
         {:ok, _} <- Social.decline_request(user_id, requester_id) do
      json(conn, %{status: "declined"})
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # DELETE /api/v1/friends/:user_id — remove friend or cancel outgoing request
  def delete(conn, %{"user_id" => target_id_str}) do
    user_id = conn.assigns.current_user_id

    with {target_id, ""} <- Integer.parse(target_id_str) do
      case Social.remove_friend(user_id, target_id) do
        {:ok, _} ->
          json(conn, %{status: "removed"})

        {:error, :not_found} ->
          # Try cancelling an outgoing request
          case Social.cancel_request(user_id, target_id) do
            {:ok, _} -> json(conn, %{status: "cancelled"})
            error -> error
          end
      end
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
    end
  end

  # POST /api/v1/friends/:user_id/block — block a user
  def block(conn, %{"user_id" => target_id_str}) do
    user_id = conn.assigns.current_user_id

    with {target_id, ""} <- Integer.parse(target_id_str),
         {:ok, friendship} <- Social.block_user(user_id, target_id) do
      json(conn, %{
        id: to_string(friendship.id),
        status: "blocked"
      })
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # DELETE /api/v1/friends/:user_id/block — unblock a user
  def unblock(conn, %{"user_id" => target_id_str}) do
    user_id = conn.assigns.current_user_id

    with {target_id, ""} <- Integer.parse(target_id_str),
         {:ok, _} <- Social.unblock_user(user_id, target_id) do
      json(conn, %{status: "unblocked"})
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # GET /api/v1/friends/blocked — list blocked users
  def blocked(conn, _params) do
    user_id = conn.assigns.current_user_id
    blocked = Social.list_blocked(user_id)

    json(conn, %{
      blocked:
        Enum.map(blocked, fn f ->
          %{id: to_string(f.friend_id), username: f.friend.username}
        end)
    })
  end
end
