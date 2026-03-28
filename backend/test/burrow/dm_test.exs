defmodule Burrow.DMTest do
  use Burrow.DataCase, async: false

  alias Burrow.DM
  alias Burrow.Snowflake
  alias Burrow.Repo
  alias Burrow.Auth.User

  setup do
    # Create two test users with Tier 1 trust (can DM)
    user1 = create_user("alice", 1)
    user2 = create_user("bob", 1)
    user3 = create_user("carol", 0)

    %{user1: user1, user2: user2, user3: user3}
  end

  describe "get_or_create_dm/2" do
    test "creates a new DM channel between two users", %{user1: u1, user2: u2} do
      assert {:ok, dm} = DM.get_or_create_dm(u1.id, u2.id)
      assert dm.type == "dm"
      assert length(dm.members) == 2

      member_ids = Enum.map(dm.members, & &1.user_id) |> Enum.sort()
      assert member_ids == Enum.sort([u1.id, u2.id])
    end

    test "reuses existing DM channel on second call", %{user1: u1, user2: u2} do
      {:ok, dm1} = DM.get_or_create_dm(u1.id, u2.id)
      {:ok, dm2} = DM.get_or_create_dm(u1.id, u2.id)
      assert dm1.id == dm2.id
    end

    test "reuses DM regardless of argument order", %{user1: u1, user2: u2} do
      {:ok, dm1} = DM.get_or_create_dm(u1.id, u2.id)
      {:ok, dm2} = DM.get_or_create_dm(u2.id, u1.id)
      assert dm1.id == dm2.id
    end

    test "rejects DM with yourself", %{user1: u1} do
      assert {:error, :bad_request} = DM.get_or_create_dm(u1.id, u1.id)
    end
  end

  describe "list_dms/1" do
    test "lists DM channels for a user", %{user1: u1, user2: u2, user3: u3} do
      {:ok, _} = DM.get_or_create_dm(u1.id, u2.id)
      {:ok, _} = DM.get_or_create_dm(u1.id, u3.id)

      dms = DM.list_dms(u1.id)
      assert length(dms) == 2
    end

    test "returns empty for user with no DMs", %{user1: u1} do
      assert DM.list_dms(u1.id) == []
    end
  end

  describe "participant?/2" do
    test "returns true for DM members", %{user1: u1, user2: u2} do
      {:ok, dm} = DM.get_or_create_dm(u1.id, u2.id)
      assert DM.participant?(dm.id, u1.id)
      assert DM.participant?(dm.id, u2.id)
    end

    test "returns false for non-members", %{user1: u1, user2: u2, user3: u3} do
      {:ok, dm} = DM.get_or_create_dm(u1.id, u2.id)
      refute DM.participant?(dm.id, u3.id)
    end
  end

  describe "send_message/3" do
    test "sends a message in a DM channel", %{user1: u1, user2: u2} do
      {:ok, dm} = DM.get_or_create_dm(u1.id, u2.id)
      {:ok, msg} = DM.send_message(dm.id, u1.id, %{"content" => "hello!"})

      assert msg.content == "hello!"
      assert msg.channel_id == dm.id
      assert msg.author_id == u1.id
      assert msg.channel_seq == 1
    end

    test "increments channel_seq correctly", %{user1: u1, user2: u2} do
      {:ok, dm} = DM.get_or_create_dm(u1.id, u2.id)
      {:ok, msg1} = DM.send_message(dm.id, u1.id, %{"content" => "one"})
      {:ok, msg2} = DM.send_message(dm.id, u2.id, %{"content" => "two"})

      assert msg1.channel_seq == 1
      assert msg2.channel_seq == 2
    end
  end

  describe "list_messages/2" do
    test "returns messages in a DM channel", %{user1: u1, user2: u2} do
      {:ok, dm} = DM.get_or_create_dm(u1.id, u2.id)
      {:ok, _} = DM.send_message(dm.id, u1.id, %{"content" => "hi"})
      {:ok, _} = DM.send_message(dm.id, u2.id, %{"content" => "hey"})

      messages = DM.list_messages(dm.id)
      assert length(messages) == 2
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user(username, trust_tier) do
    id = Snowflake.next_id()

    %User{
      id: id,
      username: username,
      trust_score: trust_tier * 20,
      trust_tier: trust_tier
    }
    |> Repo.insert!()
  end
end
