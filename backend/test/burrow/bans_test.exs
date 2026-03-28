defmodule Burrow.BansTest do
  use Burrow.DataCase, async: false

  alias Burrow.Communities
  alias Burrow.Permissions
  alias Burrow.Snowflake
  alias Burrow.Repo
  alias Burrow.Auth.User

  import Bitwise

  setup do
    owner = create_user("owner")
    moderator = create_user("moderator")
    member = create_user("member")
    outsider = create_user("outsider")

    {:ok, server} = Communities.create_server(owner.id, %{"name" => "test-server"})
    {:ok, _} = Communities.add_member(server.id, moderator.id)
    {:ok, _} = Communities.add_member(server.id, member.id)

    # Create moderator role with ban_members + timeout_members
    {:ok, mod_role} =
      Communities.create_role(server.id, %{
        "name" => "Moderator",
        "permissions" => Permissions.ban_members() ||| Permissions.timeout_members()
      })

    {:ok, _} = Communities.assign_role(server.id, moderator.id, mod_role.id)

    %{
      owner: owner,
      moderator: moderator,
      member: member,
      outsider: outsider,
      server: server,
      mod_role: mod_role
    }
  end

  # ---------------------------------------------------------------------------
  # Ban CRUD
  # ---------------------------------------------------------------------------

  describe "ban_member/4" do
    test "creates a ban record and removes membership", %{server: s, moderator: mod, member: m} do
      assert Communities.member?(s.id, m.id)

      {:ok, ban} = Communities.ban_member(s.id, m.id, mod.id)
      assert ban.server_id == s.id
      assert ban.user_id == m.id
      assert ban.banned_by == mod.id

      refute Communities.member?(s.id, m.id)
    end

    test "stores reason and purge window", %{server: s, moderator: mod, member: m} do
      opts = %{"reason" => "spam", "message_purge_window" => "24h"}
      {:ok, ban} = Communities.ban_member(s.id, m.id, mod.id, opts)
      assert ban.reason == "spam"
      assert ban.message_purge_window == "24h"
    end

    test "stores expires_at for timed bans", %{server: s, moderator: mod, member: m} do
      future = DateTime.utc_now() |> DateTime.add(3600) |> DateTime.truncate(:second)
      iso = DateTime.to_iso8601(future)
      {:ok, ban} = Communities.ban_member(s.id, m.id, mod.id, %{"expires_at" => iso})
      assert ban.expires_at == future
    end

    test "returns :already_banned for duplicate ban", %{server: s, moderator: mod, member: m} do
      {:ok, _} = Communities.ban_member(s.id, m.id, mod.id)
      assert {:error, :already_banned} = Communities.ban_member(s.id, m.id, mod.id)
    end

    test "can ban an outsider (not currently member)", %{server: s, moderator: mod, outsider: o} do
      {:ok, ban} = Communities.ban_member(s.id, o.id, mod.id, %{"reason" => "preemptive"})
      assert ban.user_id == o.id
    end
  end

  # ---------------------------------------------------------------------------
  # Unban
  # ---------------------------------------------------------------------------

  describe "unban_member/2" do
    test "removes the ban record", %{server: s, moderator: mod, member: m} do
      {:ok, _} = Communities.ban_member(s.id, m.id, mod.id)
      assert Communities.banned?(s.id, m.id)

      {:ok, _} = Communities.unban_member(s.id, m.id)
      refute Communities.banned?(s.id, m.id)
    end

    test "returns :not_found when user is not banned", %{server: s, member: m} do
      assert {:error, :not_found} = Communities.unban_member(s.id, m.id)
    end
  end

  # ---------------------------------------------------------------------------
  # List bans
  # ---------------------------------------------------------------------------

  describe "list_bans/1" do
    test "returns all bans for a server", %{server: s, moderator: mod, member: m, outsider: o} do
      {:ok, _} = Communities.ban_member(s.id, m.id, mod.id)
      {:ok, _} = Communities.ban_member(s.id, o.id, mod.id)

      bans = Communities.list_bans(s.id)
      assert length(bans) == 2
      banned_ids = Enum.map(bans, & &1.user_id) |> Enum.sort()
      assert banned_ids == Enum.sort([m.id, o.id])
    end

    test "returns empty list when no bans", %{server: s} do
      assert Communities.list_bans(s.id) == []
    end
  end

  # ---------------------------------------------------------------------------
  # Active ban / expiry
  # ---------------------------------------------------------------------------

  describe "get_active_ban/2" do
    test "returns active permanent ban", %{server: s, moderator: mod, member: m} do
      {:ok, _} = Communities.ban_member(s.id, m.id, mod.id)
      assert {:ok, ban} = Communities.get_active_ban(s.id, m.id)
      assert ban.user_id == m.id
    end

    test "returns active timed ban that hasn't expired", %{server: s, moderator: mod, member: m} do
      future = DateTime.utc_now() |> DateTime.add(3600) |> DateTime.to_iso8601()
      {:ok, _} = Communities.ban_member(s.id, m.id, mod.id, %{"expires_at" => future})
      assert {:ok, _} = Communities.get_active_ban(s.id, m.id)
    end

    test "auto-cleans expired ban and returns :not_found", %{server: s, moderator: mod, member: m} do
      # Create ban with past expiry by inserting directly
      ban_id = Snowflake.next_id()
      past = DateTime.utc_now() |> DateTime.add(-3600)

      %Burrow.Communities.ServerBan{}
      |> Burrow.Communities.ServerBan.changeset(%{
        id: ban_id,
        server_id: s.id,
        user_id: m.id,
        banned_by: mod.id,
        expires_at: past
      })
      |> Repo.insert!()

      assert {:error, :not_found} = Communities.get_active_ban(s.id, m.id)
      # Ban record should have been deleted
      assert Communities.list_bans(s.id) == []
    end

    test "returns :not_found when no ban exists", %{server: s, member: m} do
      assert {:error, :not_found} = Communities.get_active_ban(s.id, m.id)
    end
  end

  describe "banned?/2" do
    test "returns true for actively banned user", %{server: s, moderator: mod, member: m} do
      {:ok, _} = Communities.ban_member(s.id, m.id, mod.id)
      assert Communities.banned?(s.id, m.id)
    end

    test "returns false for non-banned user", %{server: s, member: m} do
      refute Communities.banned?(s.id, m.id)
    end

    test "returns false for expired ban", %{server: s, moderator: mod, member: m} do
      ban_id = Snowflake.next_id()
      past = DateTime.utc_now() |> DateTime.add(-60)

      %Burrow.Communities.ServerBan{}
      |> Burrow.Communities.ServerBan.changeset(%{
        id: ban_id,
        server_id: s.id,
        user_id: m.id,
        banned_by: mod.id,
        expires_at: past
      })
      |> Repo.insert!()

      refute Communities.banned?(s.id, m.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Ban enforcement: join rejection
  # ---------------------------------------------------------------------------

  describe "ban enforcement on join" do
    test "banned user cannot join via invite", %{server: s, owner: o, moderator: mod, outsider: out} do
      {:ok, _} = Communities.ban_member(s.id, out.id, mod.id)

      {:ok, invite} = Communities.create_invite(s.id, o.id, %{})
      assert {:error, :banned} = Communities.use_invite(invite.code, out.id)
    end

    test "unbanned user can rejoin via invite", %{server: s, owner: o, moderator: mod, member: m} do
      {:ok, _} = Communities.ban_member(s.id, m.id, mod.id)
      {:ok, _} = Communities.unban_member(s.id, m.id)

      {:ok, invite} = Communities.create_invite(s.id, o.id, %{})
      assert {:ok, _server} = Communities.use_invite(invite.code, m.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Timeouts
  # ---------------------------------------------------------------------------

  describe "timeout_member/3" do
    test "sets timed_out_until on member", %{server: s, member: m} do
      future = DateTime.utc_now() |> DateTime.add(600) |> DateTime.truncate(:second)
      {:ok, member} = Communities.timeout_member(s.id, m.id, future)
      assert member.timed_out_until == future
    end

    test "returns :not_found for non-member", %{server: s, outsider: o} do
      future = DateTime.utc_now() |> DateTime.add(600) |> DateTime.truncate(:second)
      assert {:error, :not_found} = Communities.timeout_member(s.id, o.id, future)
    end
  end

  describe "remove_timeout/2" do
    test "clears timed_out_until", %{server: s, member: m} do
      future = DateTime.utc_now() |> DateTime.add(600) |> DateTime.truncate(:second)
      {:ok, _} = Communities.timeout_member(s.id, m.id, future)
      assert Communities.timed_out?(s.id, m.id)

      {:ok, member} = Communities.remove_timeout(s.id, m.id)
      assert member.timed_out_until == nil
      refute Communities.timed_out?(s.id, m.id)
    end
  end

  describe "timed_out?/2" do
    test "returns true when timeout is active", %{server: s, member: m} do
      future = DateTime.utc_now() |> DateTime.add(600) |> DateTime.truncate(:second)
      {:ok, _} = Communities.timeout_member(s.id, m.id, future)
      assert Communities.timed_out?(s.id, m.id)
    end

    test "returns false when timeout has expired", %{server: s, member: m} do
      past = DateTime.utc_now() |> DateTime.add(-60) |> DateTime.truncate(:second)
      {:ok, _} = Communities.timeout_member(s.id, m.id, past)
      refute Communities.timed_out?(s.id, m.id)
    end

    test "returns false when no timeout set", %{server: s, member: m} do
      refute Communities.timed_out?(s.id, m.id)
    end

    test "returns false for non-member", %{server: s, outsider: o} do
      refute Communities.timed_out?(s.id, o.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Hierarchy checks (context level)
  # ---------------------------------------------------------------------------

  describe "hierarchy" do
    test "owner can ban moderator", %{server: s, owner: o, moderator: mod} do
      {:ok, ban} = Communities.ban_member(s.id, mod.id, o.id)
      assert ban.user_id == mod.id
    end

    test "moderator can ban regular member", %{server: s, moderator: mod, member: m} do
      {:ok, ban} = Communities.ban_member(s.id, m.id, mod.id)
      assert ban.user_id == m.id
    end

    test "owner can timeout moderator", %{server: s, owner: _o, moderator: mod} do
      future = DateTime.utc_now() |> DateTime.add(600) |> DateTime.truncate(:second)
      {:ok, member} = Communities.timeout_member(s.id, mod.id, future)
      assert member.timed_out_until != nil
    end
  end

  # ---------------------------------------------------------------------------
  # Permission checks
  # ---------------------------------------------------------------------------

  describe "permission checks" do
    test "moderator has ban_members permission", %{server: s, moderator: mod} do
      assert Communities.has_permission?(s.id, mod.id, Permissions.ban_members())
    end

    test "moderator has timeout_members permission", %{server: s, moderator: mod} do
      assert Communities.has_permission?(s.id, mod.id, Permissions.timeout_members())
    end

    test "regular member does not have ban_members", %{server: s, member: m} do
      refute Communities.has_permission?(s.id, m.id, Permissions.ban_members())
    end

    test "regular member does not have timeout_members", %{server: s, member: m} do
      refute Communities.has_permission?(s.id, m.id, Permissions.timeout_members())
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
