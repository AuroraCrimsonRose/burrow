defmodule Burrow.MessageEditHistoryTest do
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
  # Edit creates history snapshot
  # ---------------------------------------------------------------------------

  describe "edit_message creates edit history" do
    test "first edit creates one history entry", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "original"})

      {:ok, updated} = Chat.edit_message(msg.id, a.id, "edited v1")

      assert updated.content == "edited v1"
      assert updated.edited_at != nil

      edits = Chat.list_message_edits(msg.id)
      assert length(edits) == 1

      [edit] = edits
      assert edit.content_before == "original"
      assert edit.edited_by == a.id
      assert edit.message_id == msg.id
    end

    test "multiple edits accumulate history", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "v0"})

      {:ok, _} = Chat.edit_message(msg.id, a.id, "v1")
      {:ok, _} = Chat.edit_message(msg.id, a.id, "v2")
      {:ok, updated} = Chat.edit_message(msg.id, a.id, "v3")

      assert updated.content == "v3"

      edits = Chat.list_message_edits(msg.id)
      assert length(edits) == 3

      # Newest first
      [e3, e2, e1] = edits
      assert e1.content_before == "v0"
      assert e2.content_before == "v1"
      assert e3.content_before == "v2"
    end

    test "edit history preserves the pre-edit content, not the new", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "before"})

      {:ok, _} = Chat.edit_message(msg.id, a.id, "after")

      [edit] = Chat.list_message_edits(msg.id)
      assert edit.content_before == "before"
    end
  end

  # ---------------------------------------------------------------------------
  # Edit permission checks still work
  # ---------------------------------------------------------------------------

  describe "edit_message permissions" do
    test "only author can edit", %{alice: a, bob: b, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "alice's msg"})

      assert {:error, :forbidden} = Chat.edit_message(msg.id, b.id, "hacked")

      # No edit history created on failed edit
      assert Chat.list_message_edits(msg.id) == []
    end

    test "cannot edit deleted message", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "will delete"})
      :ok = Chat.delete_message(msg.id, a.id)

      assert {:error, :not_found} = Chat.edit_message(msg.id, a.id, "too late")
    end

    test "cannot edit nonexistent message", %{alice: a} do
      assert {:error, :not_found} = Chat.edit_message(999_999_999, a.id, "nope")
    end
  end

  # ---------------------------------------------------------------------------
  # list_message_edits
  # ---------------------------------------------------------------------------

  describe "list_message_edits/1" do
    test "returns empty list for unedited message", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "never edited"})

      assert Chat.list_message_edits(msg.id) == []
    end

    test "returns edits in newest-first order", %{alice: a, channel: ch} do
      {:ok, msg} = Chat.send_message(ch.id, a.id, %{"content" => "start"})

      {:ok, _} = Chat.edit_message(msg.id, a.id, "middle")
      {:ok, _} = Chat.edit_message(msg.id, a.id, "end")

      edits = Chat.list_message_edits(msg.id)
      assert length(edits) == 2

      timestamps = Enum.map(edits, & &1.edited_at)
      assert timestamps == Enum.sort(timestamps, {:desc, DateTime})
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user(username) do
    id = Snowflake.next_id()

    %User{}
    |> User.registration_changeset(%{
      id: id,
      username: username,
      display_name: username,
      age_verified: true,
      age_verified_at: DateTime.utc_now(),
      tos_accepted_version: "1.0",
      tos_accepted_at: DateTime.utc_now()
    })
    |> Repo.insert!()
  end
end
