defmodule Burrow.Communities do
  @moduledoc """
  Context for servers, channels, roles, members, and invites.
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Snowflake
  alias Burrow.Communities.{Server, Role, Category, Channel, ServerMember, Invite, ChannelOverride, MemberRole, ServerBan, Network}
  alias Burrow.Permissions

  @pubsub Burrow.PubSub

  # --- Default permissions ---

  # @everyone: view channels, send messages, read history, add reactions, connect, speak, change nickname
  @default_everyone_permissions Bitwise.bor(1, Bitwise.bor(2, Bitwise.bor(128, Bitwise.bor(16, Bitwise.bor(256, Bitwise.bor(512, Bitwise.bsl(1, 21)))))))

  # ---------------------------------------------------------------------------
  # Servers
  # ---------------------------------------------------------------------------

  def create_server(owner_id, attrs) do
    server_id = Snowflake.next_id()
    everyone_role_id = Snowflake.next_id()
    general_category_id = Snowflake.next_id()
    main_channel_id = Snowflake.next_id()
    member_id = Snowflake.next_id()

    Repo.transaction(fn ->
      # Create the server
      server =
        %Server{}
        |> Server.create_changeset(Map.merge(attrs, %{"id" => server_id, "owner_id" => owner_id}))
        |> Repo.insert!()

      # Create @everyone role (position 0, always exists)
      _everyone =
        %Role{}
        |> Role.changeset(%{
          "id" => everyone_role_id,
          "server_id" => server_id,
          "name" => "@everyone",
          "position" => 0,
          "permissions" => @default_everyone_permissions
        })
        |> Repo.insert!()

      # Create default "General" category
      _general_category =
        %Category{}
        |> Category.changeset(%{
          "id" => general_category_id,
          "server_id" => server_id,
          "name" => "General",
          "position" => 0
        })
        |> Repo.insert!()

      # Create default #main channel inside General category
      _main =
        %Channel{}
        |> Channel.create_changeset(%{
          "id" => main_channel_id,
          "server_id" => server_id,
          "category_id" => general_category_id,
          "name" => "main",
          "type" => "text",
          "position" => 0
        })
        |> Repo.insert!()

      # Add owner as first member
      _member =
        %ServerMember{}
        |> ServerMember.changeset(%{
          "id" => member_id,
          "server_id" => server_id,
          "user_id" => owner_id,
          "joined_at" => DateTime.utc_now()
        })
        |> Repo.insert!()

      server
    end)
  end

  def get_server(server_id) do
    case Repo.get(Server, server_id) do
      nil -> {:error, :not_found}
      server -> {:ok, server}
    end
  end

  def update_server(%Server{} = server, attrs) do
    server
    |> Server.update_changeset(attrs)
    |> Repo.update()
  end

  def delete_server(%Server{} = server) do
    Repo.delete(server)
  end

  def list_user_servers(user_id) do
    ServerMember
    |> where([m], m.user_id == ^user_id)
    |> join(:inner, [m], s in Server, on: s.id == m.server_id)
    |> select([m, s], s)
    |> Repo.all()
    |> Repo.preload(channels: from(c in Channel, order_by: [asc: c.position]))
  end

  @max_servers_per_user 100
  @max_members_per_server 1000

  def count_user_servers(user_id) do
    ServerMember
    |> where([m], m.user_id == ^user_id)
    |> Repo.aggregate(:count)
  end

  def can_create_server?(user_id) do
    if count_user_servers(user_id) < @max_servers_per_user do
      :ok
    else
      {:error, :server_limit_reached}
    end
  end

  # ---------------------------------------------------------------------------
  # Server ownership check
  # ---------------------------------------------------------------------------

  def owner?(%Server{owner_id: owner_id}, user_id), do: owner_id == user_id

  def transfer_ownership(%Server{} = server, new_owner_id) do
    if member?(server.id, new_owner_id) do
      server
      |> Ecto.Changeset.change(%{owner_id: new_owner_id})
      |> Repo.update()
    else
      {:error, :not_a_member}
    end
  end

  # ---------------------------------------------------------------------------
  # Members
  # ---------------------------------------------------------------------------

  def get_member(server_id, user_id) do
    ServerMember
    |> where([m], m.server_id == ^server_id and m.user_id == ^user_id)
    |> Repo.one()
  end

  def update_member_profile(server_id, user_id, attrs) do
    case get_member(server_id, user_id) do
      nil -> {:error, :not_found}
      member ->
        member
        |> ServerMember.changeset(Map.take(attrs, ["nickname", "bio", "pronouns"]))
        |> Repo.update()
    end
  end

  def get_member_nicknames(server_id, user_ids) when is_list(user_ids) do
    ServerMember
    |> where([m], m.server_id == ^server_id and m.user_id in ^user_ids)
    |> select([m], {m.user_id, m.nickname})
    |> Repo.all()
    |> Map.new()
  end

  def member?(server_id, user_id) do
    get_member(server_id, user_id) != nil
  end

  def add_member(server_id, user_id) do
    # Enforce max members per server
    current_count =
      ServerMember
      |> where([m], m.server_id == ^server_id)
      |> Repo.aggregate(:count)

    if current_count >= @max_members_per_server do
      {:error, :server_full}
    else
      member_id = Snowflake.next_id()

      result =
        %ServerMember{}
        |> ServerMember.changeset(%{
          "id" => member_id,
          "server_id" => server_id,
          "user_id" => user_id,
          "joined_at" => DateTime.utc_now()
        })
        |> Repo.insert()

      case result do
        {:ok, member} ->
          broadcast_server(server_id, :member_add, %{user_id: user_id, member_id: member.id})
          {:ok, member}

        error ->
          error
      end
    end
  end

  def remove_member(server_id, user_id) do
    case get_member(server_id, user_id) do
      nil ->
        {:error, :not_found}

      member ->
        case Repo.delete(member) do
          {:ok, _} = result ->
            broadcast_server(server_id, :member_remove, %{user_id: user_id})
            result

          error ->
            error
        end
    end
  end

  def list_members(server_id) do
    ServerMember
    |> where([m], m.server_id == ^server_id)
    |> preload([:user, :roles])
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Channels
  # ---------------------------------------------------------------------------

  def create_channel(server_id, attrs) do
    channel_id = Snowflake.next_id()

    # Auto-assign position: next available in this server
    max_pos =
      Channel
      |> where([c], c.server_id == ^server_id)
      |> select([c], max(c.position))
      |> Repo.one() || -1

    %Channel{}
    |> Channel.create_changeset(
      Map.merge(attrs, %{
        "id" => channel_id,
        "server_id" => server_id,
        "position" => max_pos + 1
      })
    )
    |> Repo.insert()
  end

  def get_channel(channel_id) do
    case Repo.get(Channel, channel_id) do
      nil -> {:error, :not_found}
      channel -> {:ok, channel}
    end
  end

  def update_channel(%Channel{} = channel, attrs) do
    channel
    |> Channel.update_changeset(attrs)
    |> Repo.update()
  end

  def delete_channel(%Channel{} = channel) do
    Repo.delete(channel)
  end

  def list_channels(server_id) do
    Channel
    |> where([c], c.server_id == ^server_id)
    |> order_by([c], asc: c.position)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Categories
  # ---------------------------------------------------------------------------

  def create_category(server_id, attrs) do
    cat_id = Snowflake.next_id()

    max_pos =
      Category
      |> where([c], c.server_id == ^server_id)
      |> select([c], max(c.position))
      |> Repo.one() || -1

    %Category{}
    |> Category.changeset(
      Map.merge(attrs, %{
        "id" => cat_id,
        "server_id" => server_id,
        "position" => max_pos + 1
      })
    )
    |> Repo.insert()
  end

  def get_category(category_id) do
    case Repo.get(Category, category_id) do
      nil -> {:error, :not_found}
      category -> {:ok, category}
    end
  end

  def delete_category(%Category{} = category) do
    Repo.delete(category)
  end

  def update_category(%Category{} = category, attrs) do
    category
    |> Category.changeset(attrs)
    |> Repo.update()
  end

  def list_categories(server_id) do
    Category
    |> where([c], c.server_id == ^server_id)
    |> order_by([c], asc: c.position)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Invites
  # ---------------------------------------------------------------------------

  @invite_code_length 8

  def create_invite(server_id, inviter_id, attrs \\ %{}) do
    code = generate_invite_code()

    %Invite{}
    |> Invite.changeset(
      Map.merge(attrs, %{
        "code" => code,
        "server_id" => server_id,
        "inviter_id" => inviter_id
      })
    )
    |> Repo.insert()
  end

  def get_invite(code) do
    case Repo.get(Invite, code) do
      nil ->
        {:error, :not_found}

      %Invite{revoked_at: revoked} when not is_nil(revoked) ->
        {:error, :invite_revoked}

      %Invite{expires_at: exp} = invite when not is_nil(exp) ->
        if DateTime.compare(DateTime.utc_now(), exp) == :gt do
          {:error, :invite_expired}
        else
          {:ok, invite}
        end

      invite ->
        {:ok, invite}
    end
  end

  def use_invite(code, user_id) do
    Repo.transaction(fn ->
      case get_invite(code) do
        {:error, reason} ->
          Repo.rollback(reason)

        {:ok, %Invite{max_uses: max, uses_count: count}} when not is_nil(max) and count >= max ->
          Repo.rollback(:invite_exhausted)

        {:ok, invite} ->
          cond do
            member?(invite.server_id, user_id) ->
              Repo.rollback(:already_member)

            banned?(invite.server_id, user_id) ->
              Repo.rollback(:banned)

            true ->
              case add_member(invite.server_id, user_id) do
                {:ok, _member} ->
                  invite
                  |> Ecto.Changeset.change(uses_count: invite.uses_count + 1)
                  |> Repo.update!()

                  Repo.get!(Server, invite.server_id)

                {:error, :server_full} ->
                  Repo.rollback(:server_full)

                {:error, reason} ->
                  Repo.rollback(reason)
              end
          end
      end
    end)
  end

  def revoke_invite(code) do
    case Repo.get(Invite, code) do
      nil -> {:error, :not_found}
      invite ->
        invite
        |> Ecto.Changeset.change(revoked_at: DateTime.utc_now())
        |> Repo.update()
    end
  end

  def list_invites(server_id) do
    Invite
    |> where([i], i.server_id == ^server_id and is_nil(i.revoked_at))
    |> order_by([i], desc: i.inserted_at)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp generate_invite_code do
    @invite_code_length
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
    |> binary_part(0, @invite_code_length)
  end

  # ---------------------------------------------------------------------------
  # Bans
  # ---------------------------------------------------------------------------

  @doc "Ban a user from a server. Removes them from membership."
  def ban_member(server_id, user_id, banned_by, opts \\ %{}) do
    ban_id = Snowflake.next_id()
    reason = Map.get(opts, "reason")
    expires_at = parse_expires_at(Map.get(opts, "expires_at"))
    purge_window = Map.get(opts, "message_purge_window")

    Repo.transaction(fn ->
      # Check if already banned
      case get_active_ban(server_id, user_id) do
        {:ok, _} ->
          Repo.rollback(:already_banned)

        {:error, :not_found} ->
          # Create the ban record
          {:ok, ban} =
            %ServerBan{}
            |> ServerBan.changeset(%{
              id: ban_id,
              server_id: server_id,
              user_id: user_id,
              banned_by: banned_by,
              reason: reason,
              expires_at: expires_at,
              message_purge_window: purge_window
            })
            |> Repo.insert()

          # Remove from membership if they are a member
          if member?(server_id, user_id) do
            remove_member(server_id, user_id)
          end

          ban
      end
    end)
    |> tap(fn
      {:ok, ban} -> broadcast_server(server_id, :member_ban, %{user_id: user_id, ban_id: ban.id})
      _ -> :ok
    end)
  end

  @doc "Unban a user from a server."
  def unban_member(server_id, user_id) do
    case Repo.one(
           from b in ServerBan,
             where: b.server_id == ^server_id and b.user_id == ^user_id
         ) do
      nil ->
        {:error, :not_found}

      ban ->
        case Repo.delete(ban) do
          {:ok, _} = result ->
            broadcast_server(server_id, :member_unban, %{user_id: user_id})
            result

          error ->
            error
        end
    end
  end

  @doc "List all bans for a server."
  def list_bans(server_id) do
    ServerBan
    |> where([b], b.server_id == ^server_id)
    |> order_by([b], desc: b.inserted_at)
    |> Repo.all()
  end

  @doc "Get the active ban for a user in a server (checks expiry)."
  def get_active_ban(server_id, user_id) do
    now = DateTime.utc_now()

    case Repo.one(
           from b in ServerBan,
             where: b.server_id == ^server_id and b.user_id == ^user_id
         ) do
      nil ->
        {:error, :not_found}

      %ServerBan{expires_at: nil} = ban ->
        {:ok, ban}

      %ServerBan{expires_at: exp} = ban ->
        if DateTime.compare(exp, now) == :gt do
          {:ok, ban}
        else
          # Ban has expired — remove it
          Repo.delete(ban)
          {:error, :not_found}
        end
    end
  end

  @doc "Check if a user is banned from a server."
  def banned?(server_id, user_id) do
    case get_active_ban(server_id, user_id) do
      {:ok, _} -> true
      _ -> false
    end
  end

  # ---------------------------------------------------------------------------
  # Timeouts
  # ---------------------------------------------------------------------------

  @doc "Timeout a server member (restricts sending, reacting, joining voice)."
  def timeout_member(server_id, user_id, until) do
    case get_member(server_id, user_id) do
      nil ->
        {:error, :not_found}

      %ServerMember{} = member ->
        result =
          member
          |> Ecto.Changeset.change(timed_out_until: until)
          |> Repo.update()

        case result do
          {:ok, updated} ->
            event = if until, do: :member_timeout, else: :member_timeout_remove
            broadcast_server(server_id, event, %{user_id: user_id, until: until})
            {:ok, updated}

          error ->
            error
        end
    end
  end

  @doc "Remove a timeout from a server member."
  def remove_timeout(server_id, user_id) do
    timeout_member(server_id, user_id, nil)
  end

  @doc "Check if a member is currently timed out."
  def timed_out?(server_id, user_id) do
    case get_member(server_id, user_id) do
      nil -> false
      %ServerMember{timed_out_until: nil} -> false
      %ServerMember{timed_out_until: until} ->
        DateTime.compare(until, DateTime.utc_now()) == :gt
    end
  end

  defp parse_expires_at(nil), do: nil
  defp parse_expires_at(str) when is_binary(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _offset} -> dt
      _ -> nil
    end
  end
  defp parse_expires_at(%DateTime{} = dt), do: dt
  defp parse_expires_at(_), do: nil

  # ---------------------------------------------------------------------------
  # PubSub
  # ---------------------------------------------------------------------------

  defp broadcast_server(server_id, event, payload) do
    Phoenix.PubSub.broadcast(@pubsub, "server:#{server_id}", {event, payload})
  end

  # ---------------------------------------------------------------------------
  # Roles
  # ---------------------------------------------------------------------------

  @doc "List all roles for a server, ordered by position descending."
  def list_roles(server_id) do
    Role
    |> where([r], r.server_id == ^server_id)
    |> order_by([r], desc: r.position)
    |> Repo.all()
  end

  @doc "Get a role by ID."
  def get_role(role_id) do
    case Repo.get(Role, role_id) do
      nil -> {:error, :not_found}
      role -> {:ok, role}
    end
  end

  @doc "Create a new role in a server."
  def create_role(server_id, attrs) do
    role_id = Snowflake.next_id()

    # Position: max + 1
    max_pos =
      Role
      |> where([r], r.server_id == ^server_id)
      |> select([r], max(r.position))
      |> Repo.one() || 0

    %Role{}
    |> Role.changeset(
      Map.merge(attrs, %{
        "id" => role_id,
        "server_id" => server_id,
        "position" => max_pos + 1,
        "permissions" => Map.get(attrs, "permissions", 0)
      })
    )
    |> Repo.insert()
  end

  @doc "Update a role. Cannot rename @everyone."
  def update_role(%Role{name: "@everyone"} = role, attrs) do
    # @everyone can only have permissions updated, not name
    role
    |> Role.changeset(Map.drop(attrs, ["name", "position"]))
    |> Repo.update()
  end

  def update_role(%Role{} = role, attrs) do
    role
    |> Role.changeset(attrs)
    |> Repo.update()
  end

  @doc "Reorder roles by setting new positions. Expects a list of %{id, position} maps."
  def reorder_roles(server_id, role_positions) when is_list(role_positions) do
    Repo.transaction(fn ->
      Enum.each(role_positions, fn %{"id" => id, "position" => pos} ->
        Role
        |> where([r], r.id == ^id and r.server_id == ^server_id and r.name != "@everyone")
        |> Repo.update_all(set: [position: pos])
      end)
    end)
  end

  @doc "Delete a non-@everyone role."
  def delete_role(%Role{name: "@everyone"}), do: {:error, :forbidden}

  def delete_role(%Role{} = role) do
    Repo.delete(role)
  end

  # ---------------------------------------------------------------------------
  # Role assignment
  # ---------------------------------------------------------------------------

  @doc "Assign a role to a server member."
  def assign_role(server_id, user_id, role_id) do
    with %ServerMember{} = member <- get_member(server_id, user_id) || {:error, :not_found},
         {:ok, role} <- get_role(role_id),
         true <- role.server_id == server_id || {:error, :not_found} do
      result =
        %MemberRole{}
        |> MemberRole.changeset(%{server_member_id: member.id, role_id: role_id})
        |> Repo.insert(on_conflict: :nothing)

      case result do
        {:ok, _} ->
          broadcast_server(server_id, :member_role_update, %{user_id: user_id, role_id: role_id, action: :add})
          result

        error ->
          error
      end
    end
  end

  @doc "Remove a role from a server member."
  def remove_role(server_id, user_id, role_id) do
    with %ServerMember{} = member <- get_member(server_id, user_id) || {:error, :not_found} do
      {count, _} =
        from(mr in MemberRole,
          where: mr.server_member_id == ^member.id and mr.role_id == ^role_id
        )
        |> Repo.delete_all()

      if count > 0 do
        broadcast_server(server_id, :member_role_update, %{user_id: user_id, role_id: role_id, action: :remove})
        {:ok, %{}}
      else
        {:error, :not_found}
      end
    end
  end

  @doc "Get all roles assigned to a member (including @everyone)."
  def get_member_roles(server_id, user_id) do
    member = get_member(server_id, user_id)

    if member do
      # Explicitly assigned roles
      assigned =
        MemberRole
        |> join(:inner, [mr], r in Role, on: mr.role_id == r.id)
        |> where([mr], mr.server_member_id == ^member.id)
        |> select([mr, r], r)
        |> Repo.all()

      # Always include @everyone
      everyone =
        Role
        |> where([r], r.server_id == ^server_id and r.name == "@everyone")
        |> Repo.one()

      assigned_ids = MapSet.new(assigned, & &1.id)

      if everyone && !MapSet.member?(assigned_ids, everyone.id) do
        [everyone | assigned]
      else
        assigned
      end
    else
      []
    end
  end

  # ---------------------------------------------------------------------------
  # Permission resolution
  # ---------------------------------------------------------------------------

  @doc """
  Compute effective permissions for a user in a server.
  Owner gets all permissions. Admin bit grants all.
  Otherwise it's the union of all role permissions.
  """
  def get_server_permissions(server_id, user_id) do
    case get_server(server_id) do
      {:ok, %Server{owner_id: ^user_id}} ->
        # Owner has all permissions
        Permissions.all_permissions()

      {:ok, _server} ->
        roles = get_member_roles(server_id, user_id)
        base = Permissions.compute_base_permissions(roles)

        # Admin flag grants everything
        if Permissions.admin?(base), do: Permissions.all_permissions(), else: base

      {:error, _} ->
        0
    end
  end

  @doc """
  Compute effective permissions for a user in a specific channel.
  Applies channel overrides on top of base server permissions.
  """
  def get_channel_permissions(server_id, channel_id, user_id) do
    case get_server(server_id) do
      {:ok, %Server{owner_id: ^user_id}} ->
        Permissions.all_permissions()

      {:ok, _server} ->
        roles = get_member_roles(server_id, user_id)
        base = Permissions.compute_base_permissions(roles)

        if Permissions.admin?(base) do
          Permissions.all_permissions()
        else
          role_ids = Enum.map(roles, & &1.id)
          everyone_role = Enum.find(roles, &(&1.name == "@everyone"))

          overrides = list_channel_overrides(channel_id)

          # Remap @everyone overrides
          overrides =
            Enum.map(overrides, fn override ->
              if everyone_role && override.target_type == "role" &&
                   override.target_id == everyone_role.id do
                %{override | target_type: "everyone"}
              else
                override
              end
            end)

          # Add user-specific overrides
          user_overrides =
            Enum.filter(overrides, fn o ->
              o.target_type == "user" && o.target_id == user_id
            end)

          overrides =
            if Enum.empty?(user_overrides) do
              overrides
            else
              overrides
            end

          Permissions.compute_channel_permissions(base, role_ids, overrides)
        end

      {:error, _} ->
        0
    end
  end

  @doc "Check if a user has a specific permission in a server."
  def has_permission?(server_id, user_id, perm) do
    perms = get_server_permissions(server_id, user_id)
    Permissions.has?(perms, perm)
  end

  @doc "Check if a user has an effective permission (accounting for parent perms like manage_channels/manage_categories)."
  def has_effective_permission?(server_id, user_id, perm) do
    perms = get_server_permissions(server_id, user_id)
    Permissions.effective?(perms, perm)
  end

  @doc "Check if a user has a specific permission in a channel."
  def has_channel_permission?(server_id, user_id, channel_id, perm) do
    perms = get_channel_permissions(server_id, channel_id, user_id)
    Permissions.has?(perms, perm)
  end

  @doc "Check if a user has an effective permission in a channel (accounting for parent perms)."
  def has_effective_channel_permission?(server_id, user_id, channel_id, perm) do
    perms = get_channel_permissions(server_id, channel_id, user_id)
    Permissions.effective?(perms, perm)
  end

  @doc """
  Get the highest role position for a user.
  Used for hierarchy checks — users can only act on members with lower positions.
  """
  def highest_role_position(server_id, user_id) do
    roles = get_member_roles(server_id, user_id)

    case roles do
      [] -> 0
      _ -> Enum.max_by(roles, & &1.position) |> Map.get(:position)
    end
  end

  # ---------------------------------------------------------------------------
  # Channel overrides
  # ---------------------------------------------------------------------------

  def list_channel_overrides(channel_id) do
    ChannelOverride
    |> where([o], o.channel_id == ^channel_id)
    |> Repo.all()
  end

  def set_channel_override(channel_id, target_type, target_id, allow, deny) do
    id = Snowflake.next_id()

    %ChannelOverride{}
    |> ChannelOverride.changeset(%{
      id: id,
      channel_id: channel_id,
      target_type: target_type,
      target_id: target_id,
      allow: allow,
      deny: deny
    })
    |> Repo.insert(
      on_conflict: [set: [allow: allow, deny: deny]],
      conflict_target: [:channel_id, :target_type, :target_id]
    )
  end

  def delete_channel_override(channel_id, target_type, target_id) do
    case Repo.one(
           from o in ChannelOverride,
             where:
               o.channel_id == ^channel_id and o.target_type == ^target_type and
                 o.target_id == ^target_id
         ) do
      nil -> {:error, :not_found}
      override -> Repo.delete(override)
    end
  end

  @doc """
  Sync channel overrides from a source channel to all other channels in the same category.
  Deletes existing overrides on target channels and copies overrides from the source.
  """
  def sync_category_permissions(category_id, source_channel_id) do
    source_overrides = list_channel_overrides(source_channel_id)

    channels =
      Channel
      |> where([c], c.category_id == ^category_id and c.id != ^source_channel_id)
      |> Repo.all()

    for channel <- channels do
      # Clear existing overrides
      Repo.delete_all(from o in ChannelOverride, where: o.channel_id == ^channel.id)

      # Copy from source
      for override <- source_overrides do
        set_channel_override(channel.id, override.target_type, override.target_id, override.allow, override.deny)
      end
    end

    :ok
  end

  # ---------------------------------------------------------------------------
  # Networks (user-owned groupings of servers)
  # ---------------------------------------------------------------------------

  def list_user_networks(user_id) do
    Network
    |> where([n], n.owner_id == ^user_id)
    |> Repo.all()
    |> Repo.preload(:servers)
  end

  def get_network(network_id) do
    case Repo.get(Network, network_id) do
      nil -> {:error, :not_found}
      network -> {:ok, Repo.preload(network, :servers)}
    end
  end

  def create_network(owner_id, attrs, server_ids) do
    network_id = Snowflake.next_id()

    Repo.transaction(fn ->
      network =
        %Network{}
        |> Network.create_changeset(Map.merge(attrs, %{"id" => network_id, "owner_id" => owner_id}))
        |> Repo.insert!()

      Enum.each(server_ids, fn sid ->
        Repo.insert_all("network_servers", [%{network_id: network_id, server_id: sid}])
      end)

      Repo.preload(network, :servers)
    end)
  end

  def update_network(%Network{} = network, attrs) do
    network
    |> Network.update_changeset(attrs)
    |> Repo.update()
  end

  def delete_network(%Network{} = network) do
    Repo.delete(network)
  end

  def add_server_to_network(network_id, server_id) do
    Repo.insert_all("network_servers", [%{network_id: network_id, server_id: server_id}],
      on_conflict: :nothing)
    :ok
  end

  def remove_server_from_network(network_id, server_id) do
    from(ns in "network_servers",
      where: ns.network_id == ^network_id and ns.server_id == ^server_id)
    |> Repo.delete_all()
    :ok
  end

  def count_servers do
    Repo.aggregate(Server, :count)
  end

  def count_members do
    from(sm in ServerMember, select: count(sm.user_id, :distinct))
    |> Repo.one()
  end
end
