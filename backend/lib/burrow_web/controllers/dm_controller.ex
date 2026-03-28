defmodule BurrowWeb.DmController do
  use BurrowWeb, :controller

  alias Burrow.DM
  alias Burrow.Chat
  alias Burrow.Social
  alias Burrow.Trust
  alias Burrow.Auth
  alias Burrow.RateLimiter

  action_fallback BurrowWeb.FallbackController

  # POST /api/v1/dms — create or retrieve a DM channel with another user
  def create(conn, %{"user_id" => other_user_id_str}) do
    user_id = conn.assigns.current_user_id

    with :ok <- Trust.can_send_dm?(user_id),
         {other_user_id, ""} <- Integer.parse(other_user_id_str),
         false <- Social.either_blocked?(user_id, other_user_id),
         :ok <- check_friends_only(user_id, other_user_id),
         {:ok, dm} <- DM.get_or_create_dm(user_id, other_user_id) do
      conn
      |> put_status(:ok)
      |> json(dm_channel_json(dm, user_id))
    else
      {:error, :insufficient_trust} ->
        conn |> put_status(403) |> json(%{error: "insufficient_trust", detail: "DMs require Trust Tier 1 (trust score 16+). Keep chatting in servers to build trust."})
      {:error, :friends_only} ->
        conn |> put_status(403) |> json(%{error: "friends_only", detail: "This user only accepts DMs from friends."})
      true ->
        conn |> put_status(403) |> json(%{error: "blocked", detail: "Cannot DM this user."})
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  defp check_friends_only(user_id, other_user_id) do
    case Auth.get_user(other_user_id) do
      nil -> :ok
      other_user ->
        if other_user.friends_only_dms && !Social.friends?(user_id, other_user_id) do
          {:error, :friends_only}
        else
          :ok
        end
    end
  end

  # GET /api/v1/dms — list DM channels
  def index(conn, _params) do
    user_id = conn.assigns.current_user_id
    dms = DM.list_dms(user_id)
    json(conn, %{dm_channels: Enum.map(dms, &dm_channel_json(&1, user_id))})
  end

  # GET /api/v1/dms/:id/messages — list messages in a DM
  def messages(conn, %{"id" => dm_id_str} = params) do
    user_id = conn.assigns.current_user_id

    with {dm_id, ""} <- Integer.parse(dm_id_str),
         true <- DM.participant?(dm_id, user_id) || {:error, :forbidden} do
      opts =
        []
        |> maybe_add(:before, params["before"])
        |> maybe_add(:after, params["after"])
        |> maybe_add(:limit, params["limit"])

      messages = DM.list_messages(dm_id, opts)
      json(conn, %{messages: Enum.map(messages, &message_json/1)})
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # POST /api/v1/dms/:id/messages — send a message in a DM
  def send_message(conn, %{"id" => dm_id_str} = params) do
    user_id = conn.assigns.current_user_id
    tier = conn.assigns[:current_trust_tier] || 0

    with :ok <- Trust.can_send_dm?(user_id),
         {dm_id, ""} <- Integer.parse(dm_id_str),
         true <- DM.participant?(dm_id, user_id) || {:error, :forbidden},
         other_id = DM.other_participant(dm_id, user_id),
         false <- Social.either_blocked?(user_id, other_id),
         :ok <- check_dm_rate(user_id, tier),
         {:ok, content} when is_binary(content) <- Map.fetch(params, "content"),
         {:ok, message} <- DM.send_message(dm_id, user_id, params) do
      conn
      |> put_status(:created)
      |> json(message_json(message))
    else
      {:error, :insufficient_trust} ->
        conn |> put_status(403) |> json(%{error: "insufficient_trust", detail: "DMs require Trust Tier 1 (trust score 16+)."})
      true ->
        conn |> put_status(403) |> json(%{error: "blocked", detail: "Cannot DM this user."})
      {:error, {:rate_limited, retry_after}} ->
        conn |> put_status(429) |> json(%{error: "rate_limited", detail: "Slow down. Try again in #{retry_after}s.", retry_after: retry_after})
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # PATCH /api/v1/dms/:id/messages/:message_id — edit a DM message
  def edit_message(conn, %{"id" => dm_id_str, "message_id" => msg_id_str} = params) do
    user_id = conn.assigns.current_user_id

    with {dm_id, ""} <- Integer.parse(dm_id_str),
         {msg_id, ""} <- Integer.parse(msg_id_str),
         true <- DM.participant?(dm_id, user_id) || {:error, :forbidden},
         {:ok, content} when is_binary(content) <- Map.fetch(params, "content"),
         {:ok, message} <- Chat.edit_message(msg_id, user_id, content) do
      json(conn, message_json(message))
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # DELETE /api/v1/dms/:id/messages/:message_id — delete a DM message
  def delete_message(conn, %{"id" => dm_id_str, "message_id" => msg_id_str}) do
    user_id = conn.assigns.current_user_id

    with {dm_id, ""} <- Integer.parse(dm_id_str),
         {msg_id, ""} <- Integer.parse(msg_id_str),
         true <- DM.participant?(dm_id, user_id) || {:error, :forbidden},
         :ok <- Chat.delete_message(msg_id, user_id) do
      json(conn, %{status: "deleted"})
    else
      :error -> {:error, :bad_request}
      {_, _} -> {:error, :bad_request}
      error -> error
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp check_dm_rate(user_id, tier) do
    case RateLimiter.check_user_message(user_id, tier) do
      {:ok, _, _} -> :ok
      {:error, retry_after, _} -> {:error, {:rate_limited, retry_after}}
    end
  end

  defp dm_channel_json(%{} = dm, current_user_id) do
    recipients =
      dm.members
      |> Enum.reject(fn m -> m.user_id == current_user_id end)
      |> Enum.map(fn m ->
        %{
          id: to_string(m.user.id),
          username: m.user.username
        }
      end)

    %{
      id: to_string(dm.id),
      type: dm.type,
      recipients: recipients,
      last_seq: dm.last_seq
    }
  end

  defp message_json(%{} = msg) do
    %{
      id: to_string(msg.id),
      channel_id: to_string(msg.channel_id),
      author: %{
        id: to_string(msg.author.id),
        username: msg.author.username
      },
      content: msg.content,
      type: msg.type,
      reply_to_id: if(msg.reply_to_id, do: to_string(msg.reply_to_id)),
      edited_at: msg.edited_at,
      channel_seq: msg.channel_seq,
      timestamp: msg.inserted_at
    }
  end

  defp maybe_add(opts, _key, nil), do: opts
  defp maybe_add(opts, key, val) when is_binary(val) do
    case Integer.parse(val) do
      {n, ""} -> [{key, n} | opts]
      _ -> opts
    end
  end
end
