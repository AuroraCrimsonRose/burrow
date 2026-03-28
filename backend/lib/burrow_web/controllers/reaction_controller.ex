defmodule BurrowWeb.ReactionController do
  use BurrowWeb, :controller

  alias Burrow.Chat
  alias Burrow.Communities
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  @doc "PUT /servers/:server_id/channels/:channel_id/messages/:message_id/reactions/:emoji"
  def add(conn, %{"server_id" => sid, "channel_id" => cid, "message_id" => mid, "emoji" => emoji}) do
    user_id = conn.assigns.current_user_id

    with {server_id, ""} <- Integer.parse(sid),
         {channel_id, ""} <- Integer.parse(cid),
         {message_id, ""} <- Integer.parse(mid),
         true <- Communities.member?(server_id, user_id),
         false <- Communities.timed_out?(server_id, user_id),
         true <- Communities.has_channel_permission?(server_id, user_id, channel_id, Permissions.add_reactions()),
         {:ok, reaction} <- Chat.add_reaction(message_id, user_id, emoji) do
      conn
      |> put_status(:created)
      |> json(%{
        id: to_string(reaction.id),
        message_id: to_string(reaction.message_id),
        user_id: to_string(reaction.user_id),
        emoji: reaction.emoji
      })
    else
      false -> {:error, :forbidden}
      true -> {:error, :forbidden}
      {:error, :already_reacted} -> {:error, :bad_request}
      error -> error
    end
  end

  @doc "DELETE /servers/:server_id/channels/:channel_id/messages/:message_id/reactions/:emoji"
  def remove(conn, %{"server_id" => sid, "channel_id" => cid, "message_id" => mid, "emoji" => emoji}) do
    user_id = conn.assigns.current_user_id

    with {server_id, ""} <- Integer.parse(sid),
         {_channel_id, ""} <- Integer.parse(cid),
         {message_id, ""} <- Integer.parse(mid),
         true <- Communities.member?(server_id, user_id),
         :ok <- Chat.remove_reaction(message_id, user_id, emoji) do
      json(conn, %{status: "removed"})
    else
      false -> {:error, :forbidden}
      error -> error
    end
  end

  @doc "GET /servers/:server_id/channels/:channel_id/messages/:message_id/reactions"
  def index(conn, %{"server_id" => sid, "channel_id" => cid, "message_id" => mid}) do
    user_id = conn.assigns.current_user_id

    with {server_id, ""} <- Integer.parse(sid),
         {_channel_id, ""} <- Integer.parse(cid),
         {message_id, ""} <- Integer.parse(mid),
         true <- Communities.member?(server_id, user_id) do
      reactions = Chat.list_reactions(message_id)

      # Group by emoji with counts and user lists
      grouped =
        reactions
        |> Enum.group_by(& &1.emoji)
        |> Enum.map(fn {emoji, rs} ->
          %{
            emoji: emoji,
            count: length(rs),
            users: Enum.map(rs, fn r -> %{id: to_string(r.user_id)} end)
          }
        end)

      json(conn, %{reactions: grouped})
    else
      false -> {:error, :forbidden}
      _ -> {:error, :bad_request}
    end
  end
end
