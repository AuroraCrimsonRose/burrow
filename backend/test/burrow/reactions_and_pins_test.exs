defmodule Burrow.Chat.ReactionsAndPinsTest do
  use Burrow.DataCase, async: false

  alias Burrow.Chat
  alias Burrow.Communities
  alias Burrow.Snowflake
  alias Burrow.Repo
  alias Burrow.Auth.User

  setup do
    owner = create_user("alice")
    member = create_user("bob")

    {:ok, server} = Communities.create_server(owner.id, %{"name" => "test-server"})
    {:ok, _} = Communities.add_member(server.id, member.id)

    channels = Communities.list_channels(server.id)
    channel = hd(channels)

    {:ok, msg} = Chat.send_message(channel.id, owner.id, %{"content" => "hello world"})

    %{owner: owner, member: member, server: server, channel: channel, message: msg}
  end

  # ---------------------------------------------------------------------------
  # Reactions
  # ---------------------------------------------------------------------------

  describe "add_reaction/3" do
    test "adds a reaction to a message", %{message: msg, member: m} do
      assert {:ok, reaction} = Chat.add_reaction(msg.id, m.id, "👍")
      assert reaction.emoji == "👍"
      assert reaction.user_id == m.id
      assert reaction.message_id == msg.id
    end

    test "same user can react with different emoji", %{message: msg, member: m} do
      {:ok, _} = Chat.add_reaction(msg.id, m.id, "👍")
      assert {:ok, _} = Chat.add_reaction(msg.id, m.id, "❤️")
    end

    test "different users can react with same emoji", %{message: msg, owner: o, member: m} do
      {:ok, _} = Chat.add_reaction(msg.id, o.id, "👍")
      assert {:ok, _} = Chat.add_reaction(msg.id, m.id, "👍")
    end

    test "cannot react with same emoji twice", %{message: msg, member: m} do
      {:ok, _} = Chat.add_reaction(msg.id, m.id, "👍")
      assert {:error, :already_reacted} = Chat.add_reaction(msg.id, m.id, "👍")
    end

    test "returns not_found for deleted message", %{channel: ch, owner: o} do
      {:ok, msg2} = Chat.send_message(ch.id, o.id, %{"content" => "temp"})
      :ok = Chat.delete_message(msg2.id, o.id)
      assert {:error, :not_found} = Chat.add_reaction(msg2.id, o.id, "👍")
    end

    test "broadcasts reaction_add event", %{message: msg, channel: ch, member: m} do
      Chat.subscribe(ch.id)
      {:ok, _} = Chat.add_reaction(msg.id, m.id, "🎉")
      assert_receive {"reaction_add", payload}
      assert payload["emoji"] == "🎉"
      assert payload["user_id"] == to_string(m.id)
    end
  end

  describe "remove_reaction/3" do
    test "removes a reaction", %{message: msg, member: m} do
      {:ok, _} = Chat.add_reaction(msg.id, m.id, "👍")
      assert :ok = Chat.remove_reaction(msg.id, m.id, "👍")
      assert Chat.list_reactions(msg.id) == []
    end

    test "returns not_found if reaction doesn't exist", %{message: msg, member: m} do
      assert {:error, :not_found} = Chat.remove_reaction(msg.id, m.id, "👍")
    end

    test "broadcasts reaction_remove event", %{message: msg, channel: ch, member: m} do
      {:ok, _} = Chat.add_reaction(msg.id, m.id, "🎉")
      Chat.subscribe(ch.id)
      :ok = Chat.remove_reaction(msg.id, m.id, "🎉")
      assert_receive {"reaction_remove", payload}
      assert payload["emoji"] == "🎉"
    end
  end

  describe "list_reactions/1" do
    test "lists all reactions for a message", %{message: msg, owner: o, member: m} do
      {:ok, _} = Chat.add_reaction(msg.id, o.id, "👍")
      {:ok, _} = Chat.add_reaction(msg.id, m.id, "👍")
      {:ok, _} = Chat.add_reaction(msg.id, o.id, "❤️")

      reactions = Chat.list_reactions(msg.id)
      assert length(reactions) == 3
    end
  end

  # ---------------------------------------------------------------------------
  # Pins
  # ---------------------------------------------------------------------------

  describe "pin_message/2" do
    test "pins a message", %{message: msg, owner: o} do
      assert {:ok, pin} = Chat.pin_message(msg.id, o.id)
      assert pin.message_id == msg.id
      assert pin.pinned_by == o.id
    end

    test "cannot pin the same message twice", %{message: msg, owner: o, member: m} do
      {:ok, _} = Chat.pin_message(msg.id, o.id)
      assert {:error, :already_pinned} = Chat.pin_message(msg.id, m.id)
    end

    test "returns not_found for deleted message", %{channel: ch, owner: o} do
      {:ok, msg2} = Chat.send_message(ch.id, o.id, %{"content" => "temp"})
      :ok = Chat.delete_message(msg2.id, o.id)
      assert {:error, :not_found} = Chat.pin_message(msg2.id, o.id)
    end

    test "broadcasts pin_add event", %{message: msg, channel: ch, owner: o} do
      Chat.subscribe(ch.id)
      {:ok, _} = Chat.pin_message(msg.id, o.id)
      assert_receive {"pin_add", payload}
      assert payload["message_id"] == to_string(msg.id)
      assert payload["pinned_by"] == to_string(o.id)
    end

    test "respects pin limit", %{channel: ch, owner: o} do
      # Pin 50 messages (the limit)
      for i <- 1..50 do
        {:ok, m} = Chat.send_message(ch.id, o.id, %{"content" => "msg #{i}"})
        {:ok, _} = Chat.pin_message(m.id, o.id)
      end

      # 51st pin should fail
      {:ok, m51} = Chat.send_message(ch.id, o.id, %{"content" => "msg 51"})
      assert {:error, :pin_limit_reached} = Chat.pin_message(m51.id, o.id)
    end
  end

  describe "unpin_message/2" do
    test "unpins a message", %{message: msg, channel: ch, owner: o} do
      {:ok, _} = Chat.pin_message(msg.id, o.id)
      assert :ok = Chat.unpin_message(msg.id, ch.id)
      assert Chat.list_pins(ch.id) == []
    end

    test "returns not_found if not pinned", %{message: msg, channel: ch} do
      assert {:error, :not_found} = Chat.unpin_message(msg.id, ch.id)
    end

    test "broadcasts pin_remove event", %{message: msg, channel: ch, owner: o} do
      {:ok, _} = Chat.pin_message(msg.id, o.id)
      Chat.subscribe(ch.id)
      :ok = Chat.unpin_message(msg.id, ch.id)
      assert_receive {"pin_remove", payload}
      assert payload["message_id"] == to_string(msg.id)
    end
  end

  describe "list_pins/1" do
    test "lists pinned messages newest first", %{channel: ch, owner: o} do
      {:ok, m1} = Chat.send_message(ch.id, o.id, %{"content" => "first"})
      {:ok, m2} = Chat.send_message(ch.id, o.id, %{"content" => "second"})
      {:ok, _} = Chat.pin_message(m1.id, o.id)
      {:ok, _} = Chat.pin_message(m2.id, o.id)

      pins = Chat.list_pins(ch.id)
      assert length(pins) == 2
      assert hd(pins).message_id == m2.id
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
