defmodule Burrow.DM do
  @moduledoc """
  Context for direct messages.

  Manages DM channels and message sending. DM channels reuse the
  same messages table as server channels, with `channel_id` pointing
  to `dm_channels.id`. Trust Tier 1+ is required to send DMs.
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Snowflake
  alias Burrow.DM.{DmChannel, DmMember}
  alias Burrow.Chat.{Message, Event}

  @pubsub Burrow.PubSub

  # ---------------------------------------------------------------------------
  # Get or create a 1-on-1 DM channel
  # ---------------------------------------------------------------------------

  @doc """
  Find an existing DM channel between two users, or create one.
  Returns `{:ok, dm_channel}` with members preloaded.
  """
  def get_or_create_dm(user_id, other_user_id) when user_id != other_user_id do
    # Look for an existing 1-on-1 DM between these two users
    case find_dm(user_id, other_user_id) do
      %DmChannel{} = dm -> {:ok, Repo.preload(dm, members: :user)}
      nil -> create_dm(user_id, other_user_id)
    end
  end

  def get_or_create_dm(_, _), do: {:error, :bad_request}

  defp find_dm(user_id, other_user_id) do
    # Find a DM channel where both users are members and type is "dm"
    DmChannel
    |> join(:inner, [dc], m1 in DmMember, on: m1.dm_channel_id == dc.id and m1.user_id == ^user_id)
    |> join(:inner, [dc, _], m2 in DmMember, on: m2.dm_channel_id == dc.id and m2.user_id == ^other_user_id)
    |> where([dc], dc.type == "dm")
    |> Repo.one()
  end

  defp create_dm(user_id, other_user_id) do
    channel_id = Snowflake.next_id()

    Repo.transaction(fn ->
      dm =
        %DmChannel{}
        |> DmChannel.changeset(%{id: channel_id, type: "dm"})
        |> Repo.insert!()

      Repo.insert!(%DmMember{dm_channel_id: channel_id, user_id: user_id})
      Repo.insert!(%DmMember{dm_channel_id: channel_id, user_id: other_user_id})

      Repo.preload(dm, members: :user)
    end)
  end

  # ---------------------------------------------------------------------------
  # List DM channels for a user
  # ---------------------------------------------------------------------------

  @doc "List all DM channels a user is part of, with members preloaded."
  def list_dms(user_id) do
    DmChannel
    |> join(:inner, [dc], m in DmMember, on: m.dm_channel_id == dc.id and m.user_id == ^user_id)
    |> order_by([dc], desc: dc.updated_at)
    |> preload(members: :user)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Get a DM channel
  # ---------------------------------------------------------------------------

  @doc "Get a DM channel by ID."
  def get_dm_channel(dm_channel_id) do
    case Repo.get(DmChannel, dm_channel_id) do
      nil -> {:error, :not_found}
      dm -> {:ok, Repo.preload(dm, members: :user)}
    end
  end

  # ---------------------------------------------------------------------------
  # Authorization
  # ---------------------------------------------------------------------------

  @doc "Check if a user is a member of a DM channel."
  def participant?(dm_channel_id, user_id) do
    DmMember
    |> where([m], m.dm_channel_id == ^dm_channel_id and m.user_id == ^user_id)
    |> Repo.exists?()
  end

  @doc "Get the other participant in a 1-on-1 DM channel."
  def other_participant(dm_channel_id, user_id) do
    DmMember
    |> where([m], m.dm_channel_id == ^dm_channel_id and m.user_id != ^user_id)
    |> select([m], m.user_id)
    |> Repo.one()
  end

  # ---------------------------------------------------------------------------
  # Send message in DM
  # ---------------------------------------------------------------------------

  @doc "Send a message in a DM channel. Uses the shared messages table."
  def send_message(dm_channel_id, author_id, attrs) do
    message_id = Snowflake.next_id()
    event_id = Snowflake.next_id()

    Repo.transaction(fn ->
      # Atomically increment DM channel sequence
      {1, [%{last_seq: seq}]} =
        DmChannel
        |> where([dc], dc.id == ^dm_channel_id)
        |> select([dc], %{last_seq: dc.last_seq})
        |> Repo.update_all(inc: [last_seq: 1])

      now = DateTime.utc_now()

      message =
        %Message{}
        |> Message.create_changeset(
          Map.merge(attrs, %{
            "id" => message_id,
            "channel_id" => dm_channel_id,
            "author_id" => author_id,
            "channel_seq" => seq
          })
        )
        |> Repo.insert!()

      message = Repo.preload(message, :author)

      # Event log — server_id is nil for DMs
      Repo.insert!(%Event{
        event_id: event_id,
        channel_id: dm_channel_id,
        server_id: nil,
        channel_seq: seq,
        event_type: "message_create",
        actor_id: author_id,
        payload: message_payload(message),
        timestamp: now
      })

      # Update DM channel's updated_at so it sorts to the top
      DmChannel
      |> where([dc], dc.id == ^dm_channel_id)
      |> Repo.update_all(set: [updated_at: now])

      broadcast_event(dm_channel_id, "message_create", message_payload(message))
      message
    end)
  end

  # ---------------------------------------------------------------------------
  # Edit / delete — delegates to Chat context (shared messages table)
  # ---------------------------------------------------------------------------

  # Edit and delete operations use Chat.edit_message/3 and Chat.delete_message/3
  # directly from the DmController, since the shared messages table already
  # enforces author-only editing.

  # ---------------------------------------------------------------------------
  # List messages in a DM channel (cursor-paginated)
  # ---------------------------------------------------------------------------

  @doc "List messages in a DM channel with cursor-based pagination."
  def list_messages(dm_channel_id, opts \\ []) do
    # Reuses the same query logic as Chat.list_messages
    Burrow.Chat.list_messages(dm_channel_id, opts)
  end

  # ---------------------------------------------------------------------------
  # PubSub
  # ---------------------------------------------------------------------------

  def subscribe(dm_channel_id) do
    Phoenix.PubSub.subscribe(@pubsub, "dm:#{dm_channel_id}")
  end

  def unsubscribe(dm_channel_id) do
    Phoenix.PubSub.unsubscribe(@pubsub, "dm:#{dm_channel_id}")
  end

  defp broadcast_event(dm_channel_id, event_type, payload) do
    Phoenix.PubSub.broadcast(@pubsub, "dm:#{dm_channel_id}", {event_type, payload})
  end

  # ---------------------------------------------------------------------------
  # Payload helpers
  # ---------------------------------------------------------------------------

  defp message_payload(%Message{} = msg) do
    %{
      "id" => to_string(msg.id),
      "channel_id" => to_string(msg.channel_id),
      "author" => %{
        "id" => to_string(msg.author.id),
        "username" => msg.author.username
      },
      "content" => msg.content,
      "type" => msg.type,
      "reply_to_id" => if(msg.reply_to_id, do: to_string(msg.reply_to_id)),
      "edited_at" => msg.edited_at,
      "channel_seq" => msg.channel_seq,
      "timestamp" => msg.inserted_at
    }
  end
end
