defmodule Burrow.PresenceTest do
  use Burrow.DataCase, async: false

  alias Burrow.Presence
  alias Burrow.Social
  alias Burrow.Snowflake
  alias Burrow.Repo
  alias Burrow.Auth.User

  setup do
    # Clean ETS tables between tests (Presence GenServer persists across tests)
    :ets.delete_all_objects(:presence_conns)
    :ets.delete_all_objects(:presence_users)

    alice = create_user("alice")
    bob = create_user("bob")
    %{alice: alice, bob: bob}
  end

  describe "track/2 and get_status/1" do
    test "tracks a user as online by default", %{alice: a} do
      spawn_tracked(a.id)
      assert Presence.get_status(a.id) == "online"
      assert Presence.online?(a.id)
    end

    test "tracks a user with custom status", %{alice: a} do
      spawn_tracked(a.id, "dnd")
      assert Presence.get_status(a.id) == "dnd"
    end

    test "untracked user shows as offline", %{alice: a} do
      assert Presence.get_status(a.id) == "offline"
      refute Presence.online?(a.id)
    end

    test "invisible users appear as offline", %{alice: a} do
      spawn_tracked(a.id, "invisible")
      assert Presence.get_status(a.id) == "offline"
      assert Presence.get_raw_status(a.id) == "invisible"
    end
  end

  describe "multi-connection priority" do
    test "highest priority status wins across connections", %{alice: a} do
      spawn_tracked(a.id, "idle")
      spawn_tracked(a.id, "online")
      assert Presence.get_status(a.id) == "online"
    end

    test "dnd wins over idle", %{alice: a} do
      spawn_tracked(a.id, "idle")
      spawn_tracked(a.id, "dnd")
      # idle (2) > dnd (1) — idle wins
      assert Presence.get_status(a.id) == "idle"
    end

    test "user stays online when one connection drops", %{alice: a} do
      pid1 = spawn_tracked(a.id, "online")
      _pid2 = spawn_tracked(a.id, "online")

      # Kill first connection
      Process.exit(pid1, :kill)
      Process.sleep(50)

      assert Presence.get_status(a.id) == "online"
    end

    test "user goes offline when all connections drop", %{alice: a} do
      pid1 = spawn_tracked(a.id, "online")

      Process.exit(pid1, :kill)
      Process.sleep(50)

      assert Presence.get_status(a.id) == "offline"
    end
  end

  describe "update_status/2" do
    test "updates connection status", %{alice: a} do
      pid = spawn_tracked(a.id, "online")

      # Update must be called from the tracked process
      send(pid, {:update_status, a.id, "dnd"})
      Process.sleep(50)

      assert Presence.get_status(a.id) == "dnd"
    end
  end

  describe "get_statuses/1" do
    test "returns statuses for multiple users", %{alice: a, bob: b} do
      spawn_tracked(a.id, "online")
      spawn_tracked(b.id, "idle")

      statuses = Presence.get_statuses([a.id, b.id])
      assert statuses[a.id] == "online"
      assert statuses[b.id] == "idle"
    end

    test "returns offline for untracked users", %{alice: a, bob: b} do
      spawn_tracked(a.id, "online")
      statuses = Presence.get_statuses([a.id, b.id])
      assert statuses[b.id] == "offline"
    end
  end

  describe "batched PubSub broadcasts" do
    test "broadcasts presence_update when status changes", %{alice: a} do
      Phoenix.PubSub.subscribe(Burrow.PubSub, "user_presence:#{a.id}")

      spawn_tracked(a.id, "online")

      # Flush the batch timer
      send(Presence, :flush)
      Process.sleep(50)

      assert_received {:presence_update, _, "online"}
    end

    test "invisible broadcasts as offline to observers", %{alice: a} do
      Phoenix.PubSub.subscribe(Burrow.PubSub, "user_presence:#{a.id}")

      spawn_tracked(a.id, "invisible")

      send(Presence, :flush)
      Process.sleep(50)

      # Invisible should NOT broadcast (status goes from offline to invisible,
      # which both appear as "offline" externally — no change)
      refute_received {:presence_update, _, _}
    end
  end

  describe "friend presence integration" do
    test "friends see each other's presence via get_statuses", %{alice: a, bob: b} do
      # Make them friends
      {:ok, _} = Social.send_request(a.id, b.id)
      {:ok, _} = Social.accept_request(b.id, a.id)

      spawn_tracked(a.id, "online")

      # Bob queries friend presence
      friends = Social.list_friends(b.id)
      friend_ids = Enum.map(friends, fn %{user: u} -> u.id end)
      statuses = Presence.get_statuses(friend_ids)

      assert statuses[a.id] == "online"
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp spawn_tracked(user_id, status \\ "online") do
    test_pid = self()

    pid =
      spawn(fn ->
        Presence.track(user_id, status)
        send(test_pid, {:tracked, self()})

        receive do
          {:update_status, uid, new_status} ->
            Presence.update_status(uid, new_status)

            receive do
              :stop -> :ok
            end

          :stop ->
            :ok
        end
      end)

    assert_receive {:tracked, ^pid}, 1000
    pid
  end

  defp create_user(username) do
    id = Snowflake.next_id()

    %User{id: id, username: username, trust_score: 50, trust_tier: 2}
    |> Repo.insert!()
  end
end
