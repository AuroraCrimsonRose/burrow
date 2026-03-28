defmodule Burrow.Chat do
  @moduledoc """
  Context for messages and the event log.

  Every message write atomically:
  1. Increments the channel's `last_seq` counter
  2. Inserts the message with that sequence number
  3. Appends an event to the event log
  4. Broadcasts the event via PubSub for real-time delivery
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Snowflake
  alias Burrow.Chat.{Message, Event, Reaction, Pin, ReadState, MessageEdit}
  alias Burrow.Communities
  alias Burrow.Communities.Channel
  alias Burrow.DM.DmChannel

  @max_pins_per_channel 50

  @pubsub Burrow.PubSub

  # ---------------------------------------------------------------------------
  # Send message
  # ---------------------------------------------------------------------------

  def send_message(channel_id, author_id, attrs) do
    message_id = Snowflake.next_id()
    event_id = Snowflake.next_id()

    Repo.transaction(fn ->
      # Atomically increment channel sequence
      {1, [%{last_seq: seq}]} =
        Channel
        |> where([c], c.id == ^channel_id)
        |> select([c], %{last_seq: c.last_seq})
        |> Repo.update_all(inc: [last_seq: 1])

      now = DateTime.utc_now()

      # Insert the message
      message =
        %Message{}
        |> Message.create_changeset(
          Map.merge(attrs, %{
            "id" => message_id,
            "channel_id" => channel_id,
            "author_id" => author_id,
            "channel_seq" => seq
          })
        )
        |> Repo.insert!()

      # Load the author for the broadcast payload
      message = Repo.preload(message, :author)

      # Look up server-specific nickname
      channel = Repo.get!(Channel, channel_id)
      nickname =
        case Communities.get_member(channel.server_id, author_id) do
          %{nickname: n} when is_binary(n) and n != "" -> n
          _ -> nil
        end

      Repo.insert!(%Event{
        event_id: event_id,
        channel_id: channel_id,
        server_id: channel.server_id,
        channel_seq: seq,
        event_type: "message_create",
        actor_id: author_id,
        payload: message_payload(message, nickname),
        timestamp: now
      })

      # Broadcast to subscribers
      broadcast_event(channel_id, "message_create", message_payload(message, nickname))

      message
    end)
  end

  # ---------------------------------------------------------------------------
  # Edit message
  # ---------------------------------------------------------------------------

  def edit_message(message_id, user_id, content) do
    case Repo.get(Message, message_id) do
      nil ->
        {:error, :not_found}

      %Message{author_id: author_id} when author_id != user_id ->
        {:error, :forbidden}

      %Message{deleted: true} ->
        {:error, :not_found}

      message ->
        edit_id = Snowflake.next_id()
        event_id = Snowflake.next_id()
        now = DateTime.utc_now()

        Repo.transaction(fn ->
          # Snapshot the old content before overwriting
          %MessageEdit{}
          |> MessageEdit.changeset(%{
            id: edit_id,
            message_id: message_id,
            content_before: message.content,
            edited_by: user_id,
            edited_at: now
          })
          |> Repo.insert!()

          # Update the message with new content
          {:ok, updated} =
            message
            |> Message.edit_changeset(%{content: content, edited_at: now})
            |> Repo.update()

          updated = Repo.preload(updated, :author)
          {schema, server_id} = resolve_channel(updated.channel_id)

          # Increment seq for the edit event
          {1, [%{last_seq: seq}]} =
            schema
            |> where([c], c.id == ^updated.channel_id)
            |> select([c], %{last_seq: c.last_seq})
            |> Repo.update_all(inc: [last_seq: 1])

          Repo.insert!(%Event{
            event_id: event_id,
            channel_id: updated.channel_id,
            server_id: server_id,
            channel_seq: seq,
            event_type: "message_edit",
            actor_id: user_id,
            payload: message_payload(updated),
            timestamp: now
          })

          broadcast_event(updated.channel_id, "message_edit", message_payload(updated))

          updated
        end)
    end
  end

  # ---------------------------------------------------------------------------
  # Delete message (soft-delete)
  # ---------------------------------------------------------------------------

  def delete_message(message_id, user_id, opts \\ []) do
    manage_permission = Keyword.get(opts, :can_manage, false)

    case Repo.get(Message, message_id) do
      nil ->
        {:error, :not_found}

      %Message{deleted: true} ->
        {:error, :not_found}

      %Message{author_id: author_id} = message when author_id == user_id or manage_permission ->
        event_id = Snowflake.next_id()
        now = DateTime.utc_now()

        {:ok, _} =
          message
          |> Ecto.Changeset.change(deleted: true)
          |> Repo.update()

        {schema, server_id} = resolve_channel(message.channel_id)

        {1, [%{last_seq: seq}]} =
          schema
          |> where([c], c.id == ^message.channel_id)
          |> select([c], %{last_seq: c.last_seq})
          |> Repo.update_all(inc: [last_seq: 1])

        Repo.insert!(%Event{
          event_id: event_id,
          channel_id: message.channel_id,
          server_id: server_id,
          channel_seq: seq,
          event_type: "message_delete",
          actor_id: user_id,
          payload: %{
            "id" => to_string(message.id),
            "channel_id" => to_string(message.channel_id)
          },
          timestamp: now
        })

        broadcast_event(message.channel_id, "message_delete", %{
          "id" => to_string(message.id),
          "channel_id" => to_string(message.channel_id),
          "channel_seq" => seq
        })

        :ok

      _message ->
        {:error, :forbidden}
    end
  end

  # ---------------------------------------------------------------------------
  # List messages (cursor-paginated)
  # ---------------------------------------------------------------------------

  @default_limit 50
  @max_limit 100

  def list_messages(channel_id, opts \\ []) do
    limit = min(Keyword.get(opts, :limit, @default_limit), @max_limit)
    before_id = Keyword.get(opts, :before)
    after_id = Keyword.get(opts, :after)

    query =
      Message
      |> where([m], m.channel_id == ^channel_id and m.deleted == false)
      |> preload([:author, :reactions])

    query =
      case {before_id, after_id} do
        {nil, nil} ->
          query |> order_by([m], desc: m.channel_seq)

        {before, nil} ->
          query
          |> where([m], m.id < ^before)
          |> order_by([m], desc: m.channel_seq)

        {nil, aft} ->
          query
          |> where([m], m.id > ^aft)
          |> order_by([m], asc: m.channel_seq)

        {before, aft} ->
          query
          |> where([m], m.id > ^aft and m.id < ^before)
          |> order_by([m], asc: m.channel_seq)
      end

    messages = query |> limit(^limit) |> Repo.all()

    # If we sorted ascending for after-based pagination, reverse so newest is first
    if after_id && is_nil(before_id) do
      Enum.reverse(messages)
    else
      messages
    end
  end

  def get_message(message_id) do
    case Repo.get(Message, message_id) do
      nil -> {:error, :not_found}
      %Message{deleted: true} -> {:error, :not_found}
      message -> {:ok, Repo.preload(message, [:author, :reactions])}
    end
  end

  @doc "List edit history for a message, newest first."
  def list_message_edits(message_id) do
    MessageEdit
    |> where([e], e.message_id == ^message_id)
    |> order_by([e], desc: e.edited_at)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Search messages
  # ---------------------------------------------------------------------------

  @search_limit 25

  @doc "Search messages across channels in a server by content."
  def search_messages(channel_ids, query_string, opts \\ []) do
    limit = min(Keyword.get(opts, :limit, @search_limit), 50)
    offset = Keyword.get(opts, :offset, 0)
    author_id = Keyword.get(opts, :author_id)
    content_type = Keyword.get(opts, :content_type)
    after_date = Keyword.get(opts, :after_date)
    before_date = Keyword.get(opts, :before_date)
    pattern = "%" <> String.replace(query_string, "%", "\\%") <> "%"

    query =
      Message
      |> where([m], m.channel_id in ^channel_ids and m.deleted == false)
      |> where([m], ilike(m.content, ^pattern))

    query = if author_id, do: where(query, [m], m.author_id == ^author_id), else: query

    query =
      case content_type do
        "message" ->
          where(query, [m],
            not ilike(m.content, ^"%.png%") and not ilike(m.content, ^"%.jpg%") and
            not ilike(m.content, ^"%.jpeg%") and not ilike(m.content, ^"%.webp%") and
            not ilike(m.content, ^"%.gif%") and not ilike(m.content, ^"%.mp4%") and
            not ilike(m.content, ^"%.webm%") and not ilike(m.content, ^"%.mov%") and
            not ilike(m.content, ^"%.pdf%") and not ilike(m.content, ^"%.zip%") and
            not ilike(m.content, ^"%.svg%")
          )
        "image" ->
          where(query, [m], ilike(m.content, ^"%.png%") or ilike(m.content, ^"%.jpg%") or ilike(m.content, ^"%.jpeg%") or ilike(m.content, ^"%.webp%") or ilike(m.content, ^"%.svg%"))
        "video" ->
          where(query, [m], ilike(m.content, ^"%.mp4%") or ilike(m.content, ^"%.webm%") or ilike(m.content, ^"%.mov%"))
        "gif" ->
          where(query, [m], ilike(m.content, ^"%.gif%"))
        "file" ->
          where(query, [m], ilike(m.content, ^"%.pdf%") or ilike(m.content, ^"%.zip%") or ilike(m.content, ^"%.txt%") or ilike(m.content, ^"%.doc%") or ilike(m.content, ^"%.docx%") or ilike(m.content, ^"%.csv%") or ilike(m.content, ^"%.xls%") or ilike(m.content, ^"%.xlsx%"))
        _ -> query
      end

    query =
      case after_date do
        %DateTime{} = dt -> where(query, [m], m.inserted_at >= ^dt)
        _ -> query
      end

    query =
      case before_date do
        %DateTime{} = dt -> where(query, [m], m.inserted_at <= ^dt)
        _ -> query
      end

    total =
      query
      |> exclude(:order_by)
      |> exclude(:preload)
      |> select([m], count(m.id))
      |> Repo.one()

    messages =
      query
      |> order_by([m], desc: m.inserted_at)
      |> limit(^limit)
      |> offset(^offset)
      |> preload(:author)
      |> Repo.all()

    {messages, total}
  end

  # ---------------------------------------------------------------------------
  # Reactions
  # ---------------------------------------------------------------------------

  @doc "Add a reaction. Returns {:ok, reaction} or {:error, changeset}."
  def add_reaction(message_id, user_id, emoji) do
    case get_message(message_id) do
      {:error, _} = err ->
        err

      {:ok, message} ->
        id = Snowflake.next_id()

        result =
          %Reaction{}
          |> Reaction.changeset(%{
            id: id,
            message_id: message_id,
            user_id: user_id,
            emoji: emoji
          })
          |> Repo.insert()

        case result do
          {:ok, reaction} ->
            payload = reaction_payload(reaction, message.channel_id)
            broadcast_event(message.channel_id, "reaction_add", payload)
            {:ok, reaction}

          {:error, %Ecto.Changeset{} = cs} ->
            if Keyword.has_key?(cs.errors, :message_id) or
                 cs.errors |> Enum.any?(fn {_, {_, opts}} -> opts[:constraint] == :unique end) do
              {:error, :already_reacted}
            else
              {:error, cs}
            end
        end
    end
  end

  @doc "Remove a reaction. Only the user who reacted can remove it."
  def remove_reaction(message_id, user_id, emoji) do
    case Repo.one(
           from r in Reaction,
             where:
               r.message_id == ^message_id and r.user_id == ^user_id and
                 r.emoji == ^emoji
         ) do
      nil ->
        {:error, :not_found}

      reaction ->
        {:ok, _} = Repo.delete(reaction)

        case get_message(message_id) do
          {:ok, message} ->
            payload = reaction_payload(reaction, message.channel_id)
            broadcast_event(message.channel_id, "reaction_remove", payload)

          _ ->
            :ok
        end

        :ok
    end
  end

  @doc "List reactions for a message, grouped by emoji."
  def list_reactions(message_id) do
    Reaction
    |> where([r], r.message_id == ^message_id)
    |> preload(:user)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Pins
  # ---------------------------------------------------------------------------

  @doc "Pin a message in its channel. Returns {:ok, pin} or {:error, reason}."
  def pin_message(message_id, user_id) do
    case get_message(message_id) do
      {:error, _} = err ->
        err

      {:ok, message} ->
        channel_id = message.channel_id

        # Check pin limit
        pin_count =
          Pin
          |> where([p], p.channel_id == ^channel_id)
          |> Repo.aggregate(:count)

        if pin_count >= @max_pins_per_channel do
          {:error, :pin_limit_reached}
        else
          id = Snowflake.next_id()

          result =
            %Pin{}
            |> Pin.changeset(%{
              id: id,
              channel_id: channel_id,
              message_id: message_id,
              pinned_by: user_id
            })
            |> Repo.insert()

          case result do
            {:ok, pin} ->
              payload = pin_payload(pin, message)
              broadcast_event(channel_id, "pin_add", payload)
              {:ok, pin}

            {:error, %Ecto.Changeset{}} ->
              {:error, :already_pinned}
          end
        end
    end
  end

  @doc "Unpin a message."
  def unpin_message(message_id, channel_id) do
    case Repo.one(
           from p in Pin,
             where: p.channel_id == ^channel_id and p.message_id == ^message_id
         ) do
      nil ->
        {:error, :not_found}

      pin ->
        {:ok, _} = Repo.delete(pin)
        broadcast_event(channel_id, "pin_remove", %{"message_id" => to_string(message_id), "channel_id" => to_string(channel_id)})
        :ok
    end
  end

  @doc "List pinned messages for a channel, newest first."
  def list_pins(channel_id) do
    Pin
    |> where([p], p.channel_id == ^channel_id)
    |> order_by([p], desc: p.id)
    |> preload(:pinned_by_user)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Events — replay for reconnect
  # ---------------------------------------------------------------------------

  def get_events_since(channel_id, since_seq, limit \\ 500) do
    Event
    |> where([e], e.channel_id == ^channel_id and e.channel_seq > ^since_seq)
    |> order_by([e], asc: e.channel_seq)
    |> limit(^limit)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # PubSub
  # ---------------------------------------------------------------------------

  def subscribe(channel_id) do
    Phoenix.PubSub.subscribe(@pubsub, "channel:#{channel_id}")
  end

  def unsubscribe(channel_id) do
    Phoenix.PubSub.unsubscribe(@pubsub, "channel:#{channel_id}")
  end

  defp broadcast_event(channel_id, event_type, payload) do
    Phoenix.PubSub.broadcast(@pubsub, "channel:#{channel_id}", {event_type, payload})
  end

  # ---------------------------------------------------------------------------
  # Payload helpers
  # ---------------------------------------------------------------------------

  defp message_payload(%Message{} = msg, nickname \\ nil) do
    display = nickname || msg.author.display_name || msg.author.username

    %{
      "id" => to_string(msg.id),
      "channel_id" => to_string(msg.channel_id),
      "author" => %{
        "id" => to_string(msg.author.id),
        "username" => msg.author.username,
        "display_name" => display
      },
      "content" => msg.content,
      "type" => msg.type,
      "reply_to_id" => if(msg.reply_to_id, do: to_string(msg.reply_to_id)),
      "edited_at" => msg.edited_at,
      "channel_seq" => msg.channel_seq,
      "timestamp" => msg.inserted_at,
      "attachments" => enrich_attachments(msg.attachments || [])
    }
  end

  defp enrich_attachments(attachments) when is_list(attachments) do
    Enum.map(attachments, fn att ->
      key = att["key"] || att[:key]

      if is_binary(key) and key != "" do
        att =
          try do
            case Burrow.Storage.signed_url(key) do
              {:ok, url} -> Map.put(att, "url", url)
              _ -> att
            end
          rescue
            _ -> att
          end

        case Burrow.Uploads.get_by_key(key) do
          %{scan_status: ss, virus_result: vr, mime_verified: mv, expires_at: ea} ->
            att
            |> Map.put("scan_status", ss)
            |> Map.put("virus_result", vr)
            |> Map.put("mime_verified", mv)
            |> Map.put("expires_at", ea && DateTime.to_iso8601(ea))

          _ ->
            att
        end
      else
        att
      end
    end)
  end
  defp enrich_attachments(_), do: []

  defp reaction_payload(%Reaction{} = r, channel_id) do
    %{
      "message_id" => to_string(r.message_id),
      "user_id" => to_string(r.user_id),
      "emoji" => r.emoji,
      "channel_id" => to_string(channel_id)
    }
  end

  defp pin_payload(%Pin{} = pin, %Message{} = msg) do
    %{
      "pin_id" => to_string(pin.id),
      "message_id" => to_string(pin.message_id),
      "channel_id" => to_string(pin.channel_id),
      "pinned_by" => to_string(pin.pinned_by),
      "message" => message_payload(msg)
    }
  end

  # ---------------------------------------------------------------------------
  # Read States (unread tracking)
  # ---------------------------------------------------------------------------

  @doc "Mark a channel as read up to a given message. Upserts the read state."
  def ack_message(user_id, channel_id, message_id) do
    # Look up the message to get its channel_seq
    case Repo.get(Message, message_id) do
      nil ->
        {:error, :not_found}

      %Message{channel_id: ^channel_id, channel_seq: seq} ->
        # Use the channel's current last_seq if higher (covers edits/deletes)
        {schema, _sid} = resolve_channel(channel_id)
        ch_last_seq =
          schema
          |> where([c], c.id == ^channel_id)
          |> select([c], c.last_seq)
          |> Repo.one() || 0

        final_seq = max(seq, ch_last_seq)
        now = DateTime.utc_now()

        %ReadState{}
        |> ReadState.changeset(%{
          user_id: user_id,
          channel_id: channel_id,
          last_read_message_id: message_id,
          last_read_seq: final_seq,
          mention_count: 0
        })
        |> Repo.insert(
          on_conflict: [
            set: [
              last_read_message_id: message_id,
              last_read_seq: final_seq,
              mention_count: 0,
              updated_at: now
            ]
          ],
          conflict_target: [:user_id, :channel_id]
        )

      _message ->
        {:error, :not_found}
    end
  end

  @doc "Mark all channels in a server as read for a user."
  def mark_server_read(user_id, server_id) do
    channels = Communities.list_channels(server_id)
    now = DateTime.utc_now()

    for ch <- channels do
      %ReadState{}
      |> ReadState.changeset(%{
        user_id: user_id,
        channel_id: ch.id,
        last_read_seq: ch.last_seq || 0,
        mention_count: 0
      })
      |> Repo.insert(
        on_conflict: [
          set: [
            last_read_seq: ch.last_seq || 0,
            mention_count: 0,
            updated_at: now
          ]
        ],
        conflict_target: [:user_id, :channel_id]
      )
    end

    :ok
  end

  @doc "Get all read states for a user."
  def list_read_states(user_id) do
    ReadState
    |> where([r], r.user_id == ^user_id)
    |> Repo.all()
  end

  @doc "Get the read state for a specific user+channel."
  def get_read_state(user_id, channel_id) do
    Repo.get_by(ReadState, user_id: user_id, channel_id: channel_id)
  end

  @doc "Get unread count for a user in a channel by comparing read seq with channel's last_seq."
  def unread_count(user_id, channel_id) do
    read_seq =
      case get_read_state(user_id, channel_id) do
        nil -> 0
        %ReadState{last_read_seq: seq} -> seq
      end

    # Count messages after read_seq
    Message
    |> where([m], m.channel_id == ^channel_id and m.channel_seq > ^read_seq and m.deleted == false)
    |> Repo.aggregate(:count)
  end

  @doc "Increment mention count for a user in a channel."
  def increment_mentions(user_id, channel_id) do
    now = DateTime.utc_now()

    %ReadState{}
    |> ReadState.changeset(%{
      user_id: user_id,
      channel_id: channel_id,
      mention_count: 1
    })
    |> Repo.insert(
      on_conflict: [inc: [mention_count: 1], set: [updated_at: now]],
      conflict_target: [:user_id, :channel_id]
    )
  end

  # Resolve whether a channel_id belongs to a server channel or DM channel.
  # Returns {schema_module, server_id} where server_id is nil for DMs.
  defp resolve_channel(channel_id) do
    case Repo.get(Channel, channel_id) do
      %Channel{server_id: sid} -> {Channel, sid}
      nil -> {DmChannel, nil}
    end
  end

  def count_messages do
    Repo.aggregate(Message, :count)
  end
end
