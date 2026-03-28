defmodule Burrow.Analytics do
  @moduledoc """
  Activity analytics for topology heat map.
  Provides per-server activity metrics aggregated from recent snapshots.
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Analytics.ActivitySnapshot
  alias Burrow.Snowflake

  @snapshot_window_minutes 30

  @doc """
  Record an activity snapshot for a server.
  """
  def record_snapshot(server_id, attrs) do
    %ActivitySnapshot{
      id: Snowflake.next_id(),
      server_id: server_id,
      message_count: Map.get(attrs, :message_count, 0),
      voice_user_count: Map.get(attrs, :voice_user_count, 0),
      active_user_count: Map.get(attrs, :active_user_count, 0),
      reaction_count: Map.get(attrs, :reaction_count, 0),
      new_member_count: Map.get(attrs, :new_member_count, 0)
    }
    |> Repo.insert()
  end

  @doc """
  Get aggregated activity for multiple servers within the recent window.
  Returns a map of server_id => %{overall, voice, reactions, new_members}.
  """
  def get_bulk_activity(server_ids) when is_list(server_ids) do
    if server_ids == [] do
      %{}
    else
      cutoff = DateTime.add(DateTime.utc_now(), -@snapshot_window_minutes * 60, :second)

      query =
        from s in ActivitySnapshot,
          where: s.server_id in ^server_ids and s.inserted_at >= ^cutoff,
          group_by: s.server_id,
          select: {
            s.server_id,
            %{
              message_count: sum(s.message_count),
              voice_user_count: max(s.voice_user_count),
              active_user_count: max(s.active_user_count),
              reaction_count: sum(s.reaction_count),
              new_member_count: sum(s.new_member_count)
            }
          }

      query
      |> Repo.all()
      |> Map.new(fn {server_id, metrics} ->
        {server_id, %{
          overall: (metrics.message_count || 0) + (metrics.active_user_count || 0),
          voice: metrics.voice_user_count || 0,
          reactions: metrics.reaction_count || 0,
          new_members: metrics.new_member_count || 0
        }}
      end)
    end
  end

  @doc """
  Get topology activity for a user: all their servers' activity,
  plus friend-aware metrics (friend_activity, friend_voice).
  Returns map of server_id_string => metrics.
  """
  def get_topology_activity(user_id) do
    # Get user's server IDs
    server_ids =
      from(m in Burrow.Communities.ServerMember,
        where: m.user_id == ^user_id,
        select: m.server_id
      )
      |> Repo.all()

    base_activity = get_bulk_activity(server_ids)

    # Get friend IDs
    friend_ids = get_friend_ids(user_id)

    # Get friend activity per server (friends who are also members)
    friend_activity = get_friend_server_activity(friend_ids, server_ids)

    # Merge base + friend metrics
    Map.new(server_ids, fn sid ->
      base = Map.get(base_activity, sid, %{overall: 0, voice: 0, reactions: 0, new_members: 0})
      friend = Map.get(friend_activity, sid, %{friend_activity: 0, friend_voice: 0})

      {to_string(sid), %{
        overall: base.overall,
        voice: base.voice,
        friendActivity: friend.friend_activity,
        friendVoice: friend.friend_voice,
        newMembers: base.new_members,
        reactions: base.reactions
      }}
    end)
  end

  defp get_friend_ids(user_id) do
    from(f in Burrow.Social.Friendship,
      where: (f.user_id == ^user_id or f.friend_id == ^user_id) and f.status == :accepted,
      select: fragment("CASE WHEN ? = ? THEN ? ELSE ? END", f.user_id, ^user_id, f.friend_id, f.user_id)
    )
    |> Repo.all()
  end

  defp get_friend_server_activity(friend_ids, server_ids) do
    if friend_ids == [] or server_ids == [] do
      %{}
    else
      # Count friends who are members of each server (as a proxy for friend activity)
      from(m in Burrow.Communities.ServerMember,
        where: m.user_id in ^friend_ids and m.server_id in ^server_ids,
        group_by: m.server_id,
        select: {m.server_id, count(m.user_id)}
      )
      |> Repo.all()
      |> Map.new(fn {server_id, friend_count} ->
        {server_id, %{friend_activity: friend_count, friend_voice: 0}}
      end)
    end
  end

  @doc """
  Clean up old snapshots beyond the retention window.
  """
  def cleanup_old_snapshots(minutes_to_keep \\ 60) do
    cutoff = DateTime.add(DateTime.utc_now(), -minutes_to_keep * 60, :second)

    from(s in ActivitySnapshot, where: s.inserted_at < ^cutoff)
    |> Repo.delete_all()
  end
end
