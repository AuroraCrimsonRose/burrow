defmodule Burrow.PermissionsTest do
  use Burrow.DataCase, async: false

  alias Burrow.Communities
  alias Burrow.Permissions
  alias Burrow.Snowflake
  alias Burrow.Repo
  alias Burrow.Auth.User

  import Bitwise

  setup do
    owner = create_user("owner")
    admin = create_user("admin")
    mod = create_user("mod")
    member = create_user("member")

    {:ok, server} = Communities.create_server(owner.id, %{"name" => "test-server"})
    {:ok, _} = Communities.add_member(server.id, admin.id)
    {:ok, _} = Communities.add_member(server.id, mod.id)
    {:ok, _} = Communities.add_member(server.id, member.id)

    channels = Communities.list_channels(server.id)
    channel = hd(channels)

    # Create admin role with administrator bit
    {:ok, admin_role} =
      Communities.create_role(server.id, %{
        "name" => "Admin",
        "permissions" => Permissions.administrator()
      })

    # Create mod role with manage_messages + kick_members
    {:ok, mod_role} =
      Communities.create_role(server.id, %{
        "name" => "Moderator",
        "permissions" => Permissions.manage_messages() ||| Permissions.kick_members()
      })

    # Assign roles
    {:ok, _} = Communities.assign_role(server.id, admin.id, admin_role.id)
    {:ok, _} = Communities.assign_role(server.id, mod.id, mod_role.id)

    %{
      owner: owner,
      admin: admin,
      mod: mod,
      member: member,
      server: server,
      channel: channel,
      admin_role: admin_role,
      mod_role: mod_role
    }
  end

  # ---------------------------------------------------------------------------
  # Bitfield operations
  # ---------------------------------------------------------------------------

  describe "bitfield operations" do
    test "has?/2 detects set bits" do
      perms = Permissions.send_messages() ||| Permissions.view_channel()
      assert Permissions.has?(perms, Permissions.send_messages())
      assert Permissions.has?(perms, Permissions.view_channel())
      refute Permissions.has?(perms, Permissions.manage_channels())
    end

    test "grant/2 adds permission bit" do
      perms = Permissions.view_channel()
      perms = Permissions.grant(perms, Permissions.send_messages())
      assert Permissions.has?(perms, Permissions.view_channel())
      assert Permissions.has?(perms, Permissions.send_messages())
    end

    test "revoke/2 removes permission bit" do
      perms = Permissions.view_channel() ||| Permissions.send_messages()
      perms = Permissions.revoke(perms, Permissions.send_messages())
      assert Permissions.has?(perms, Permissions.view_channel())
      refute Permissions.has?(perms, Permissions.send_messages())
    end

    test "admin?/1 checks administrator bit" do
      assert Permissions.admin?(Permissions.administrator())
      refute Permissions.admin?(Permissions.manage_channels())
    end

    test "compute_base_permissions/1 unions role permissions" do
      roles = [
        %{permissions: Permissions.view_channel() ||| Permissions.send_messages()},
        %{permissions: Permissions.manage_channels() ||| Permissions.view_channel()}
      ]

      base = Permissions.compute_base_permissions(roles)
      assert Permissions.has?(base, Permissions.view_channel())
      assert Permissions.has?(base, Permissions.send_messages())
      assert Permissions.has?(base, Permissions.manage_channels())
    end

    test "to_map/1 returns named permission map" do
      perms = Permissions.view_channel() ||| Permissions.send_messages()
      map = Permissions.to_map(perms)
      assert map.view_channel == true
      assert map.send_messages == true
      assert map.manage_channels == false
    end
  end

  # ---------------------------------------------------------------------------
  # Server permission resolution
  # ---------------------------------------------------------------------------

  describe "server permission resolution" do
    test "owner gets all permissions", %{server: s, owner: o} do
      perms = Communities.get_server_permissions(s.id, o.id)
      assert perms == 0xFFFFFFFFFFFF
    end

    test "administrator gets all permissions", %{server: s, admin: a} do
      perms = Communities.get_server_permissions(s.id, a.id)
      assert perms == 0xFFFFFFFFFFFF
    end

    test "moderator gets union of @everyone + mod role", %{server: s, mod: m} do
      perms = Communities.get_server_permissions(s.id, m.id)
      assert Permissions.has?(perms, Permissions.manage_messages())
      assert Permissions.has?(perms, Permissions.kick_members())
      # From @everyone defaults
      assert Permissions.has?(perms, Permissions.view_channel())
      assert Permissions.has?(perms, Permissions.send_messages())
      # Should not have admin-level perms
      refute Permissions.has?(perms, Permissions.administrator())
      refute Permissions.has?(perms, Permissions.manage_server())
    end

    test "regular member gets only @everyone permissions", %{server: s, member: m} do
      perms = Communities.get_server_permissions(s.id, m.id)
      assert Permissions.has?(perms, Permissions.view_channel())
      assert Permissions.has?(perms, Permissions.send_messages())
      refute Permissions.has?(perms, Permissions.manage_channels())
      refute Permissions.has?(perms, Permissions.manage_messages())
    end

    test "has_permission?/3 convenience function", %{server: s, mod: m, member: mem} do
      assert Communities.has_permission?(s.id, m.id, Permissions.kick_members())
      refute Communities.has_permission?(s.id, mem.id, Permissions.kick_members())
    end
  end

  # ---------------------------------------------------------------------------
  # Channel permission resolution
  # ---------------------------------------------------------------------------

  describe "channel permission resolution" do
    test "owner bypasses channel overrides", %{server: s, channel: ch, owner: o} do
      # Even with a deny override, owner still has all permissions
      everyone_role = Enum.find(Communities.list_roles(s.id), &(&1.name == "@everyone"))
      Communities.set_channel_override(ch.id, "role", everyone_role.id, 0, Permissions.send_messages())

      perms = Communities.get_channel_permissions(s.id, ch.id, o.id)
      assert perms == 0xFFFFFFFFFFFF
    end

    test "admin bypasses channel overrides", %{server: s, channel: ch, admin: a} do
      everyone_role = Enum.find(Communities.list_roles(s.id), &(&1.name == "@everyone"))
      Communities.set_channel_override(ch.id, "role", everyone_role.id, 0, Permissions.send_messages())

      perms = Communities.get_channel_permissions(s.id, ch.id, a.id)
      assert perms == 0xFFFFFFFFFFFF
    end

    test "@everyone deny removes permission for regular members", %{server: s, channel: ch, member: m} do
      everyone_role = Enum.find(Communities.list_roles(s.id), &(&1.name == "@everyone"))
      Communities.set_channel_override(ch.id, "role", everyone_role.id, 0, Permissions.send_messages())

      refute Communities.has_channel_permission?(s.id, m.id, ch.id, Permissions.send_messages())
      # Other permissions should remain
      assert Communities.has_channel_permission?(s.id, m.id, ch.id, Permissions.view_channel())
    end

    test "role override can grant permission denied by @everyone", %{server: s, channel: ch, mod: m, mod_role: mr} do
      everyone_role = Enum.find(Communities.list_roles(s.id), &(&1.name == "@everyone"))
      # Deny send_messages for @everyone
      Communities.set_channel_override(ch.id, "role", everyone_role.id, 0, Permissions.send_messages())
      # Allow send_messages for mod role
      Communities.set_channel_override(ch.id, "role", mr.id, Permissions.send_messages(), 0)

      assert Communities.has_channel_permission?(s.id, m.id, ch.id, Permissions.send_messages())
    end

    test "user-specific override takes highest priority", %{server: s, channel: ch, member: m} do
      # Deny send_messages for the specific user
      Communities.set_channel_override(ch.id, "user", m.id, 0, Permissions.send_messages())

      refute Communities.has_channel_permission?(s.id, m.id, ch.id, Permissions.send_messages())
    end

    test "user-specific allow overrides role deny", %{server: s, channel: ch, member: m, mod_role: mr} do
      # Deny via role
      Communities.set_channel_override(ch.id, "role", mr.id, 0, Permissions.view_channel())
      # Allow via user
      Communities.set_channel_override(ch.id, "user", m.id, Permissions.view_channel(), 0)

      assert Communities.has_channel_permission?(s.id, m.id, ch.id, Permissions.view_channel())
    end
  end

  # ---------------------------------------------------------------------------
  # Role CRUD
  # ---------------------------------------------------------------------------

  describe "role management" do
    test "list_roles returns roles ordered by position desc", %{server: s} do
      roles = Communities.list_roles(s.id)
      positions = Enum.map(roles, & &1.position)
      assert positions == Enum.sort(positions, :desc)
    end

    test "create_role auto-assigns incrementing position", %{server: s} do
      {:ok, r1} = Communities.create_role(s.id, %{"name" => "Role1"})
      {:ok, r2} = Communities.create_role(s.id, %{"name" => "Role2"})
      assert r2.position > r1.position
    end

    test "update_role changes name and permissions", %{mod_role: mr} do
      {:ok, updated} = Communities.update_role(mr, %{"name" => "SuperMod", "permissions" => 0})
      assert updated.name == "SuperMod"
      assert updated.permissions == 0
    end

    test "cannot rename @everyone role", %{server: s} do
      everyone = Enum.find(Communities.list_roles(s.id), &(&1.name == "@everyone"))
      {:ok, updated} = Communities.update_role(everyone, %{"name" => "renamed", "permissions" => 999})
      assert updated.name == "@everyone"
      assert updated.permissions == 999
    end

    test "cannot delete @everyone role", %{server: s} do
      everyone = Enum.find(Communities.list_roles(s.id), &(&1.name == "@everyone"))
      assert {:error, :forbidden} = Communities.delete_role(everyone)
    end

    test "delete_role removes role", %{mod_role: mr} do
      assert {:ok, _} = Communities.delete_role(mr)
      assert {:error, :not_found} = Communities.get_role(mr.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Role assignment
  # ---------------------------------------------------------------------------

  describe "role assignment" do
    test "assign_role adds role to member", %{server: s, member: m, mod_role: mr} do
      {:ok, _} = Communities.assign_role(s.id, m.id, mr.id)
      roles = Communities.get_member_roles(s.id, m.id)
      role_ids = Enum.map(roles, & &1.id)
      assert mr.id in role_ids
    end

    test "assigning same role twice is idempotent", %{server: s, mod: m, mod_role: mr} do
      # mod already has mod_role from setup
      assert {:ok, _} = Communities.assign_role(s.id, m.id, mr.id)
    end

    test "remove_role removes role from member", %{server: s, mod: m, mod_role: mr} do
      {:ok, _} = Communities.remove_role(s.id, m.id, mr.id)
      roles = Communities.get_member_roles(s.id, m.id)
      role_ids = Enum.map(roles, & &1.id)
      refute mr.id in role_ids
    end

    test "get_member_roles always includes @everyone", %{server: s, member: m} do
      roles = Communities.get_member_roles(s.id, m.id)
      assert Enum.any?(roles, &(&1.name == "@everyone"))
    end
  end

  # ---------------------------------------------------------------------------
  # Role hierarchy
  # ---------------------------------------------------------------------------

  describe "role hierarchy" do
    test "highest_role_position returns max position", %{server: s, mod: m, mod_role: mr} do
      pos = Communities.highest_role_position(s.id, m.id)
      assert pos == mr.position
    end

    test "member with no extra roles has @everyone position", %{server: s, member: m} do
      pos = Communities.highest_role_position(s.id, m.id)
      assert pos == 0
    end
  end

  # ---------------------------------------------------------------------------
  # Channel overrides
  # ---------------------------------------------------------------------------

  describe "channel overrides" do
    test "set_channel_override creates override", %{channel: ch, member: m} do
      {:ok, override} = Communities.set_channel_override(
        ch.id, "user", m.id, Permissions.send_messages(), Permissions.attach_files()
      )
      assert override.allow == Permissions.send_messages()
      assert override.deny == Permissions.attach_files()
    end

    test "set_channel_override upserts on conflict", %{channel: ch, member: m} do
      {:ok, _} = Communities.set_channel_override(ch.id, "user", m.id, 0, 0)
      {:ok, updated} = Communities.set_channel_override(
        ch.id, "user", m.id, Permissions.send_messages(), 0
      )
      assert updated.allow == Permissions.send_messages()

      # Should only be one override for this target
      overrides = Communities.list_channel_overrides(ch.id)
      user_overrides = Enum.filter(overrides, &(&1.target_type == "user" && &1.target_id == m.id))
      assert length(user_overrides) == 1
    end

    test "delete_channel_override removes override", %{channel: ch, member: m} do
      {:ok, _} = Communities.set_channel_override(ch.id, "user", m.id, 0, 0)
      {:ok, _} = Communities.delete_channel_override(ch.id, "user", m.id)
      overrides = Communities.list_channel_overrides(ch.id)
      assert Enum.empty?(Enum.filter(overrides, &(&1.target_type == "user" && &1.target_id == m.id)))
    end

    test "delete_channel_override returns not_found for missing", %{channel: ch} do
      assert {:error, :not_found} = Communities.delete_channel_override(ch.id, "user", 999)
    end
  end

  # ---------------------------------------------------------------------------
  # Controller wiring (integration)
  # ---------------------------------------------------------------------------

  describe "permission-based controller checks" do
    test "has_permission? checks server-level permissions", %{server: s, mod: m, member: mem} do
      assert Communities.has_permission?(s.id, m.id, Permissions.manage_messages())
      refute Communities.has_permission?(s.id, mem.id, Permissions.manage_messages())
    end

    test "has_channel_permission? checks channel-level permissions", %{server: s, channel: ch, member: m} do
      # member has @everyone defaults (view_channel, send_messages, etc.)
      assert Communities.has_channel_permission?(s.id, m.id, ch.id, Permissions.send_messages())
      refute Communities.has_channel_permission?(s.id, m.id, ch.id, Permissions.manage_channels())
    end
  end

  defp create_user(username) do
    id = Snowflake.next_id()
    %User{id: id, username: username, trust_score: 50, trust_tier: 2}
    |> Repo.insert!()
  end
end
