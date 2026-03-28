defmodule Burrow.SocialTest do
  use Burrow.DataCase, async: false

  alias Burrow.Social
  alias Burrow.Snowflake
  alias Burrow.Repo
  alias Burrow.Auth.User

  setup do
    alice = create_user("alice")
    bob = create_user("bob")
    carol = create_user("carol")
    %{alice: alice, bob: bob, carol: carol}
  end

  describe "send_request/2" do
    test "sends a pending friend request", %{alice: a, bob: b} do
      assert {:ok, f} = Social.send_request(a.id, b.id)
      assert f.status == "pending"
      assert f.user_id == a.id
      assert f.friend_id == b.id
    end

    test "rejects sending request to yourself", %{alice: a} do
      assert {:error, :bad_request} = Social.send_request(a.id, a.id)
    end

    test "rejects duplicate pending request", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      assert {:error, :already_pending} = Social.send_request(a.id, b.id)
    end

    test "auto-accepts if target already sent a request", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, f} = Social.send_request(b.id, a.id)
      assert f.status == "accepted"
    end

    test "rejects if already friends", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, _} = Social.accept_request(b.id, a.id)
      assert {:error, :already_friends} = Social.send_request(a.id, b.id)
    end

    test "rejects if blocked", %{alice: a, bob: b} do
      {:ok, _} = Social.block_user(b.id, a.id)
      assert {:error, :blocked} = Social.send_request(a.id, b.id)
    end
  end

  describe "accept_request/2" do
    test "accepts an incoming request", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      assert {:ok, f} = Social.accept_request(b.id, a.id)
      assert f.status == "accepted"
    end

    test "returns not_found if no pending request", %{alice: a, bob: b} do
      assert {:error, :not_found} = Social.accept_request(b.id, a.id)
    end
  end

  describe "decline_request/2" do
    test "declines and removes the request", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      assert {:ok, _} = Social.decline_request(b.id, a.id)
      assert Social.list_incoming_requests(b.id) == []
    end
  end

  describe "cancel_request/2" do
    test "cancels an outgoing request", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      assert {:ok, _} = Social.cancel_request(a.id, b.id)
      assert Social.list_outgoing_requests(a.id) == []
    end
  end

  describe "remove_friend/2" do
    test "unfriends an accepted friendship", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, _} = Social.accept_request(b.id, a.id)

      assert {:ok, _} = Social.remove_friend(a.id, b.id)
      refute Social.friends?(a.id, b.id)
    end

    test "either side can remove", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, _} = Social.accept_request(b.id, a.id)

      assert {:ok, _} = Social.remove_friend(b.id, a.id)
      refute Social.friends?(a.id, b.id)
    end
  end

  describe "block_user/2" do
    test "blocks a user", %{alice: a, bob: b} do
      {:ok, block} = Social.block_user(a.id, b.id)
      assert block.status == "blocked"
      assert Social.blocked?(a.id, b.id)
    end

    test "blocking removes existing friendship", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, _} = Social.accept_request(b.id, a.id)
      assert Social.friends?(a.id, b.id)

      {:ok, _} = Social.block_user(a.id, b.id)
      refute Social.friends?(a.id, b.id)
      assert Social.blocked?(a.id, b.id)
    end

    test "either_blocked? detects blocks in both directions", %{alice: a, bob: b} do
      {:ok, _} = Social.block_user(a.id, b.id)
      assert Social.either_blocked?(a.id, b.id)
      assert Social.either_blocked?(b.id, a.id)
    end

    test "rejects self-block", %{alice: a} do
      assert {:error, :bad_request} = Social.block_user(a.id, a.id)
    end
  end

  describe "unblock_user/2" do
    test "unblocks a user", %{alice: a, bob: b} do
      {:ok, _} = Social.block_user(a.id, b.id)
      {:ok, _} = Social.unblock_user(a.id, b.id)
      refute Social.blocked?(a.id, b.id)
    end

    test "only the blocker can unblock", %{alice: a, bob: b} do
      {:ok, _} = Social.block_user(a.id, b.id)
      assert {:error, :not_found} = Social.unblock_user(b.id, a.id)
    end
  end

  describe "list_friends/1" do
    test "lists accepted friends", %{alice: a, bob: b, carol: c} do
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, _} = Social.accept_request(b.id, a.id)
      {:ok, _} = Social.send_request(c.id, a.id)
      {:ok, _} = Social.accept_request(a.id, c.id)

      friends = Social.list_friends(a.id)
      friend_ids = Enum.map(friends, fn %{user: u} -> u.id end) |> Enum.sort()
      assert friend_ids == Enum.sort([b.id, c.id])
    end

    test "does not include pending or blocked", %{alice: a, bob: b, carol: c} do
      {:ok, _} = Social.send_request(a.id, b.id)  # pending
      {:ok, _} = Social.block_user(a.id, c.id)    # blocked

      assert Social.list_friends(a.id) == []
    end
  end

  describe "list_incoming_requests/1" do
    test "lists pending requests sent to me", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(b.id, a.id)
      incoming = Social.list_incoming_requests(a.id)
      assert length(incoming) == 1
      assert hd(incoming).user_id == b.id
    end
  end

  describe "list_outgoing_requests/1" do
    test "lists pending requests I sent", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      outgoing = Social.list_outgoing_requests(a.id)
      assert length(outgoing) == 1
      assert hd(outgoing).friend_id == b.id
    end
  end

  describe "list_blocked/1" do
    test "lists users I blocked", %{alice: a, bob: b} do
      {:ok, _} = Social.block_user(a.id, b.id)
      blocked = Social.list_blocked(a.id)
      assert length(blocked) == 1
      assert hd(blocked).friend_id == b.id
    end
  end

  describe "friends?/2" do
    test "returns true for accepted friends (either direction)", %{alice: a, bob: b} do
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, _} = Social.accept_request(b.id, a.id)
      assert Social.friends?(a.id, b.id)
      assert Social.friends?(b.id, a.id)
    end

    test "returns false for non-friends", %{alice: a, bob: b} do
      refute Social.friends?(a.id, b.id)
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
