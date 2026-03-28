defmodule Burrow.Permissions do
  @moduledoc """
  Permission bitfield constants and helpers.

  Each permission is a single bit in a 48-bit integer.
  Roles store a `permissions` bitfield, and channel overrides
  store `allow` / `deny` bitfields.
  """

  import Bitwise

  # --- General Server Permissions ---
  @view_channel        1 <<< 0
  @send_messages       1 <<< 1
  @embed_links         1 <<< 2
  @attach_files        1 <<< 3
  @add_reactions       1 <<< 4
  @mention_everyone    1 <<< 5
  @manage_messages     1 <<< 6
  @read_message_history 1 <<< 7
  @connect             1 <<< 8
  @speak               1 <<< 9
  @stream              1 <<< 10
  @mute_members        1 <<< 11
  @deafen_members      1 <<< 12
  @move_members        1 <<< 13
  @use_voice_activity  1 <<< 14
  @manage_channels     1 <<< 15
  @manage_roles        1 <<< 16
  @manage_server       1 <<< 17
  @kick_members        1 <<< 18
  @ban_members         1 <<< 19
  @create_invite       1 <<< 20
  @change_nickname     1 <<< 21
  @manage_nicknames    1 <<< 22
  @manage_emoji        1 <<< 23
  @manage_webhooks     1 <<< 24
  @manage_threads      1 <<< 25
  @administrator       1 <<< 26
  @use_soundboard      1 <<< 27
  @use_external_emoji  1 <<< 28
  @view_audit_log      1 <<< 29
  @send_tts            1 <<< 30
  @manage_events       1 <<< 31
  @priority_speaker    1 <<< 32
  @use_camera          1 <<< 33
  @create_public_threads 1 <<< 34
  @create_private_threads 1 <<< 35
  @send_in_threads     1 <<< 36
  @use_app_commands    1 <<< 37
  @timeout_members     1 <<< 38
  @use_external_sounds  1 <<< 39
  @manage_automod       1 <<< 40
  @view_full_audit_log  1 <<< 41
  @export_audit_log     1 <<< 42
  @manage_plugins       1 <<< 43
  @record_voice         1 <<< 44
  @manage_invites       1 <<< 45
  @manage_backups       1 <<< 46
  @schedule_messages    1 <<< 47
  @manage_events_ch     1 <<< 48
  @manage_game_servers  1 <<< 49
  @manage_dashboard     1 <<< 50
  @manage_gallery       1 <<< 51
  @manage_forum         1 <<< 52
  @manage_file_repo     1 <<< 53

  # --- Granular Channel & Category Permissions ---
  @create_channels      1 <<< 54
  @edit_channels        1 <<< 55
  @delete_channels      1 <<< 56
  @create_categories    1 <<< 57
  @edit_categories      1 <<< 58
  @delete_categories    1 <<< 59
  @manage_categories    1 <<< 60

  # --- Granular Member Permissions ---
  @manage_members       1 <<< 61

  # --- Audit Permissions ---
  @view_audit           1 <<< 62

  # --- Granular Role Permissions ---
  @create_roles         1 <<< 63
  @edit_roles           1 <<< 64
  @delete_roles         1 <<< 65

  # Bitmask granting every permission (bits 0-65)
  @all_permissions      (1 <<< 66) - 1

  # Named permission accessors
  def view_channel,         do: @view_channel
  def send_messages,        do: @send_messages
  def embed_links,          do: @embed_links
  def attach_files,         do: @attach_files
  def add_reactions,        do: @add_reactions
  def mention_everyone,     do: @mention_everyone
  def manage_messages,      do: @manage_messages
  def read_message_history, do: @read_message_history
  def connect,              do: @connect
  def speak,                do: @speak
  def stream,               do: @stream
  def mute_members,         do: @mute_members
  def deafen_members,       do: @deafen_members
  def move_members,         do: @move_members
  def use_voice_activity,   do: @use_voice_activity
  def manage_channels,      do: @manage_channels
  def manage_roles,         do: @manage_roles
  def manage_server,        do: @manage_server
  def kick_members,         do: @kick_members
  def ban_members,          do: @ban_members
  def create_invite,        do: @create_invite
  def change_nickname,      do: @change_nickname
  def manage_nicknames,     do: @manage_nicknames
  def manage_emoji,         do: @manage_emoji
  def manage_webhooks,      do: @manage_webhooks
  def manage_threads,       do: @manage_threads
  def administrator,        do: @administrator
  def use_soundboard,       do: @use_soundboard
  def use_external_emoji,   do: @use_external_emoji
  def view_audit_log,       do: @view_audit_log
  def send_tts,             do: @send_tts
  def manage_events,        do: @manage_events
  def priority_speaker,     do: @priority_speaker
  def use_camera,           do: @use_camera
  def create_public_threads, do: @create_public_threads
  def create_private_threads, do: @create_private_threads
  def send_in_threads,      do: @send_in_threads
  def use_app_commands,     do: @use_app_commands
  def timeout_members,      do: @timeout_members
  def use_external_sounds,   do: @use_external_sounds
  def manage_automod,        do: @manage_automod
  def view_full_audit_log,   do: @view_full_audit_log
  def export_audit_log,      do: @export_audit_log
  def manage_plugins,        do: @manage_plugins
  def record_voice,          do: @record_voice
  def manage_invites,        do: @manage_invites
  def manage_backups,        do: @manage_backups
  def schedule_messages,     do: @schedule_messages
  def manage_events_ch,      do: @manage_events_ch
  def manage_game_servers,   do: @manage_game_servers
  def manage_dashboard,      do: @manage_dashboard
  def manage_gallery,        do: @manage_gallery
  def manage_forum,          do: @manage_forum
  def manage_file_repo,      do: @manage_file_repo
  def create_channels,       do: @create_channels
  def edit_channels,         do: @edit_channels
  def delete_channels,       do: @delete_channels
  def create_categories,     do: @create_categories
  def edit_categories,       do: @edit_categories
  def delete_categories,     do: @delete_categories
  def manage_categories,     do: @manage_categories
  def manage_members,        do: @manage_members
  def view_audit,            do: @view_audit
  def create_roles,          do: @create_roles
  def edit_roles,            do: @edit_roles
  def delete_roles,          do: @delete_roles
  def all_permissions,       do: @all_permissions

  @doc "Check if a bitfield has a specific permission bit."
  def has?(bitfield, perm), do: (bitfield &&& perm) == perm

  @doc """
  Check if a bitfield grants a specific permission, accounting for parent permissions.
  `manage_channels` (bit 15) implies create/edit/delete channels.
  `manage_categories` (bit 60) implies create/edit/delete categories.
  `administrator` (bit 26) implies everything.
  """
  def effective?(bitfield, perm) do
    cond do
      has?(bitfield, perm) -> true
      admin?(bitfield) -> true
      perm in [@create_channels, @edit_channels, @delete_channels] -> has?(bitfield, @manage_channels)
      perm in [@create_categories, @edit_categories, @delete_categories] -> has?(bitfield, @manage_categories)
      perm in [@kick_members, @ban_members, @timeout_members] -> has?(bitfield, @manage_members)
      perm in [@view_audit_log, @view_full_audit_log, @export_audit_log] -> has?(bitfield, @view_audit)
      perm in [@create_roles, @edit_roles, @delete_roles] -> has?(bitfield, @manage_roles)
      true -> false
    end
  end

  @doc "Add permission bit(s) to a bitfield."
  def grant(bitfield, perm), do: bitfield ||| perm

  @doc "Remove permission bit(s) from a bitfield."
  def revoke(bitfield, perm), do: bitfield &&& ~~~perm

  @doc "Check if the bitfield has the Administrator bit."
  def admin?(bitfield), do: has?(bitfield, @administrator)

  @doc """
  Compute effective permissions for a set of roles in a server context.
  Returns the union (OR) of all role permission bitfields.
  """
  def compute_base_permissions(roles) do
    Enum.reduce(roles, 0, fn role, acc -> acc ||| role.permissions end)
  end

  @doc """
  Apply channel overrides to base permissions.

  Resolution:
  1. Start with base permissions
  2. Apply @everyone role override (if exists)
  3. Compute union of all role allows and denies
  4. Apply: (base | allows) & ~denies
  5. Apply user-specific override on top
  """
  def compute_channel_permissions(base_perms, role_ids, channel_overrides) do
    # Admin bypasses channel overrides
    if admin?(base_perms) do
      base_perms
    else
      {everyone_allow, everyone_deny, role_allow, role_deny, user_allow, user_deny} =
        categorize_overrides(channel_overrides, role_ids)

      # Apply @everyone override first
      perms = (base_perms &&& ~~~everyone_deny) ||| everyone_allow

      # Apply role overrides
      perms = (perms &&& ~~~role_deny) ||| role_allow

      # Apply user override (highest priority)
      (perms &&& ~~~user_deny) ||| user_allow
    end
  end

  defp categorize_overrides(overrides, role_ids) do
    Enum.reduce(overrides, {0, 0, 0, 0, 0, 0}, fn override, {ea, ed, ra, rd, ua, ud} ->
      case override.target_type do
        "everyone" ->
          {ea ||| override.allow, ed ||| override.deny, ra, rd, ua, ud}

        "role" ->
          if override.target_id in role_ids do
            {ea, ed, ra ||| override.allow, rd ||| override.deny, ua, ud}
          else
            {ea, ed, ra, rd, ua, ud}
          end

        "user" ->
          {ea, ed, ra, rd, ua ||| override.allow, ud ||| override.deny}
      end
    end)
  end

  @doc "Returns a map of permission name → boolean for a given bitfield."
  def to_map(bitfield) do
    %{
      view_channel: has?(bitfield, @view_channel),
      send_messages: has?(bitfield, @send_messages),
      embed_links: has?(bitfield, @embed_links),
      attach_files: has?(bitfield, @attach_files),
      add_reactions: has?(bitfield, @add_reactions),
      mention_everyone: has?(bitfield, @mention_everyone),
      manage_messages: has?(bitfield, @manage_messages),
      read_message_history: has?(bitfield, @read_message_history),
      connect: has?(bitfield, @connect),
      speak: has?(bitfield, @speak),
      stream: has?(bitfield, @stream),
      mute_members: has?(bitfield, @mute_members),
      deafen_members: has?(bitfield, @deafen_members),
      move_members: has?(bitfield, @move_members),
      use_voice_activity: has?(bitfield, @use_voice_activity),
      manage_channels: has?(bitfield, @manage_channels),
      manage_roles: has?(bitfield, @manage_roles),
      manage_server: has?(bitfield, @manage_server),
      kick_members: has?(bitfield, @kick_members),
      ban_members: has?(bitfield, @ban_members),
      create_invite: has?(bitfield, @create_invite),
      change_nickname: has?(bitfield, @change_nickname),
      manage_nicknames: has?(bitfield, @manage_nicknames),
      manage_emoji: has?(bitfield, @manage_emoji),
      manage_webhooks: has?(bitfield, @manage_webhooks),
      manage_threads: has?(bitfield, @manage_threads),
      administrator: has?(bitfield, @administrator),
      use_soundboard: has?(bitfield, @use_soundboard),
      use_external_emoji: has?(bitfield, @use_external_emoji),
      view_audit_log: has?(bitfield, @view_audit_log),
      send_tts: has?(bitfield, @send_tts),
      manage_events: has?(bitfield, @manage_events),
      priority_speaker: has?(bitfield, @priority_speaker),
      use_camera: has?(bitfield, @use_camera),
      create_public_threads: has?(bitfield, @create_public_threads),
      create_private_threads: has?(bitfield, @create_private_threads),
      send_in_threads: has?(bitfield, @send_in_threads),
      use_app_commands: has?(bitfield, @use_app_commands),
      timeout_members: has?(bitfield, @timeout_members),
      use_external_sounds: has?(bitfield, @use_external_sounds),
      manage_automod: has?(bitfield, @manage_automod),
      view_full_audit_log: has?(bitfield, @view_full_audit_log),
      export_audit_log: has?(bitfield, @export_audit_log),
      manage_plugins: has?(bitfield, @manage_plugins),
      record_voice: has?(bitfield, @record_voice),
      manage_invites: has?(bitfield, @manage_invites),
      manage_backups: has?(bitfield, @manage_backups),
      schedule_messages: has?(bitfield, @schedule_messages),
      manage_events_ch: has?(bitfield, @manage_events_ch),
      manage_game_servers: has?(bitfield, @manage_game_servers),
      manage_dashboard: has?(bitfield, @manage_dashboard),
      manage_gallery: has?(bitfield, @manage_gallery),
      manage_forum: has?(bitfield, @manage_forum),
      manage_file_repo: has?(bitfield, @manage_file_repo),
      create_channels: has?(bitfield, @create_channels),
      edit_channels: has?(bitfield, @edit_channels),
      delete_channels: has?(bitfield, @delete_channels),
      create_categories: has?(bitfield, @create_categories),
      edit_categories: has?(bitfield, @edit_categories),
      delete_categories: has?(bitfield, @delete_categories),
      manage_categories: has?(bitfield, @manage_categories),
      manage_members: has?(bitfield, @manage_members),
      view_audit: has?(bitfield, @view_audit),
      create_roles: has?(bitfield, @create_roles),
      edit_roles: has?(bitfield, @edit_roles),
      delete_roles: has?(bitfield, @delete_roles)
    }
  end
end
