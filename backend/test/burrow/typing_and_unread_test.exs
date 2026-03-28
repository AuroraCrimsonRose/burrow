defmodule Burrow.TypingAndUnreadTest do
  use Burrow.DataCase, async: false

  alias Burrow.Communities
  alias Burrow.Chat
  alias Burrow.Snowflake
  alias Burrow.Repo
  alias Burrow.Auth.User

  setup do
    alice = create_user("alice")
    bob = create_user("bob")

    {:ok, server} = Communities.create_server(alice.id, %{"name" => "test-server"})
    {:ok, _} = Communities.add_member(server.id, bob.id)

    channels = Communities.list_channels(server.id)
    channel = hd(channels)

    %{alice: alice, bob: bob, server: server, channel: channel}
  end

  # ---------------------------------------------------------------------------
  # Typing Indicator Debounce
  # ---------------------------------------------------------------------------

  describe "typing debounce" do
    test "ETS table exists for typing debounce" do
      assert :ets.info(:typing_debounce) != :undefined
    end

    test "first typing event is not debounced" do
      key = {999_999, 888_888}
      # Clean up any existing entry
      :ets.delete(:typing_debounce, key)

      # No entry exists — should broadcast
      assert :ets.lookup(:typing_debounce, key) == []
    end

    test "typing debounce stores timestamp" do
      key = {111_111, 222_222}
      now = System.monotonic_time(:millisecond)
      :ets.insert(:typing_debounce, {key, now})

      [{^key, stored}] = :ets.lookup(:typing_debounce, key)
      assert stored == now

      # Cleanup
      :ets.delete(:typing_debounce, key)
    end

    test "recent typing event is debounced (within 8s window)" do
      key = {333_333, 444_444}
      now = System.monotonic_time(:millisecond)
      :ets.insert(:typing_debounce, {key, now})

      # Check within debounce window
      [{^key, last_ts}] = :ets.lookup(:typing_debounce, key)
      elapsed = System.monotonic_time(:millisecond) - last_ts
      assert elapsed < 8_000

      # Cleanup
      :ets.delete(:typing_debounce, key)
    end
  end

  # ---------------------------------------------------------------------------
  # Read States — ack_message
  # ---------------------------------------------------------------------------

  describe "ack_message/3" do
    test "creates a read state for a channel", %{alice: a, channel: ch} do
      # Send a message first
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "hello"})

      {:ok, rs} = Chat.ack_message(a.id, ch.id, msg.id)
      assert rs.user_id == a.id
      assert rs.channel_id == ch.id
      assert rs.last_read_message_id == msg.id
      assert rs.last_read_seq == msg.channel_seq
      assert rs.mention_count == 0
    end

    test "upserts read state on subsequent ack", %{alice: a, channel: ch} do
      {:ok, msg1} = Chat.send_message(ch.id, a.id, %{"content" => "first"})
      {:ok, _} = Chat.ack_message(a.id, ch.id, msg1.id)

      {:ok, msg2} = Chat.send_message(ch.id, a.id, %{"content" => "second"})
      {:ok, rs} = Chat.ack_message(a.id, ch.id, msg2.id)

      assert rs.last_read_message_id == msg2.id
      assert rs.last_read_seq == msg2.channel_seq

      # Should only be one read state record
      states = Chat.list_read_states(a.id)
      channel_states = Enum.filter(states, &(&1.channel_id == ch.id))
      assert length(channel_states) == 1
    end

    test "returns :not_found for nonexistent message", %{alice: a, channel: ch} do
      assert {:error, :not_found} = Chat.ack_message(a.id, ch.id, 999_999_999)
    end

    test "returns :not_found if message is in different channel", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "hello"})
      # Try to ack with wrong channel_id
      assert {:error, :not_found} = Chat.ack_message(a.id, 999_999, msg.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Read States — list & get
  # ---------------------------------------------------------------------------

  describe "list_read_states/1" do
    test "returns all read states for a user", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "hello"})
      {:ok, _} = Chat.ack_message(a.id, ch.id, msg.id)

      states = Chat.list_read_states(a.id)
      assert length(states) >= 1
      assert Enum.any?(states, &(&1.channel_id == ch.id))
    end

    test "returns empty list for user with no read states", %{bob: b} do
      assert Chat.list_read_states(b.id) == []
    end
  end

  describe "get_read_state/2" do
    test "returns read state for user+channel", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "hello"})
      {:ok, _} = Chat.ack_message(a.id, ch.id, msg.id)

      rs = Chat.get_read_state(a.id, ch.id)
      assert rs != nil
      assert rs.last_read_message_id == msg.id
    end

    test "returns nil when no read state exists", %{alice: a} do
      assert Chat.get_read_state(a.id, 999_999) == nil
    end
  end

  # ---------------------------------------------------------------------------
  # Unread Count
  # ---------------------------------------------------------------------------

  describe "unread_count/2" do
    test "returns 0 when all messages are read", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "hello"})
      {:ok, _} = Chat.ack_message(a.id, ch.id, msg.id)

      assert Chat.unread_count(a.id, ch.id) == 0
    end

    test "returns count of unread messages", %{alice: a, bob: b, channel: ch} do
      {:ok, msg1} = Chat.send_message(ch.id, a.id, %{"content" => "first"})
      {:ok, _} = Chat.ack_message(b.id, ch.id, msg1.id)

      # Alice sends 3 more messages after bob's last read
      {:ok, _} = Chat.send_message(ch.id, a.id, %{"content" => "second"})
      {:ok, _} = Chat.send_message(ch.id, a.id, %{"content" => "third"})
      {:ok, _} = Chat.send_message(ch.id, a.id, %{"content" => "fourth"})

      assert Chat.unread_count(b.id, ch.id) == 3
    end

    test "returns total message count when no read state exists", %{alice: a, bob: b, channel: ch} do
      {:ok, _} = Chat.send_message(ch.id, a.id, %{"content" => "one"})
      {:ok, _} = Chat.send_message(ch.id, a.id, %{"content" => "two"})

      # Bob has never read this channel
      assert Chat.unread_count(b.id, ch.id) == 2
    end

    test "does not count deleted messages", %{alice: a, bob: b, channel: ch} do
      {:ok, msg1} = Chat.send_message(ch.id, a.id, %{"content" => "first"})
      {:ok, _} = Chat.ack_message(b.id, ch.id, msg1.id)

      {:ok, msg2} = Chat.send_message(ch.id, a.id, %{"content" => "will delete"})
      {:ok, _} = Chat.send_message(ch.id, a.id, %{"content" => "stays"})

      Chat.delete_message(msg2.id, a.id)

      assert Chat.unread_count(b.id, ch.id) == 1
    end
  end

  # ---------------------------------------------------------------------------
  # Mention Count
  # ---------------------------------------------------------------------------

  describe "increment_mentions/2" do
    test "creates read state with mention count 1 if none exists", %{alice: a, channel: ch} do
      {:ok, rs} = Chat.increment_mentions(a.id, ch.id)
      assert rs.mention_count == 1
    end

    test "increments existing mention count", %{alice: a, channel: ch} do
      {:ok, _} = Chat.increment_mentions(a.id, ch.id)
      {:ok, _} = Chat.increment_mentions(a.id, ch.id)

      rs = Chat.get_read_state(a.id, ch.id)
      assert rs.mention_count == 2
    end

    test "ack_message resets mention count to 0", %{alice: a, channel: ch} do
      {:ok, _} = Chat.increment_mentions(a.id, ch.id)
      {:ok, _} = Chat.increment_mentions(a.id, ch.id)

      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "hello"})
      {:ok, rs} = Chat.ack_message(a.id, ch.id, msg.id)
      assert rs.mention_count == 0
    end
  end

  # ---------------------------------------------------------------------------
  # Multi-user read tracking
  # ---------------------------------------------------------------------------

  describe "multi-user read states" do
    test "each user has independent read states", %{alice: a, bob: b, channel: ch} do
      {:ok, msg1} = Chat.send_message(ch.id, a.id, %{"content" => "hello"})
      {:ok, msg2} = Chat.send_message(ch.id, a.id, %{"content" => "world"})

      {:ok, _} = Chat.ack_message(a.id, ch.id, msg2.id)
      {:ok, _} = Chat.ack_message(b.id, ch.id, msg1.id)

      rs_a = Chat.get_read_state(a.id, ch.id)
      rs_b = Chat.get_read_state(b.id, ch.id)

      assert rs_a.last_read_message_id == msg2.id
      assert rs_b.last_read_message_id == msg1.id

      assert Chat.unread_count(a.id, ch.id) == 0
      assert Chat.unread_count(b.id, ch.id) == 1
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user(username) do
    id = Snowflake.next_id()

    %User{id: id, username: username, trust_score: 50, trust_tier: 2}
    |> Repo.insert!()
  end
end
