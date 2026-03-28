defmodule Burrow.Voice.VoiceState do
  @moduledoc """
  In-memory voice state manager using ETS.

  Tracks which users are in which voice channels, along with
  their mute/deafen state. Broadcasts voice_state_update events
  via PubSub when state changes.
  """

  use GenServer

  @table :voice_state

  # ── Public API ──

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @doc "Join a voice channel. Returns {:ok, state} or {:error, reason}."
  def join(channel_id, user_id, server_id) do
    GenServer.call(__MODULE__, {:join, channel_id, user_id, server_id})
  end

  @doc "Leave the current voice channel."
  def leave(user_id) do
    GenServer.call(__MODULE__, {:leave, user_id})
  end

  @doc "Update mute/deafen state."
  def update(user_id, attrs) do
    GenServer.call(__MODULE__, {:update, user_id, attrs})
  end

  @doc "List all users in a voice channel."
  def list_channel(channel_id) do
    :ets.match_object(@table, {:_, channel_id, :_, :_, :_, :_})
    |> Enum.map(fn {user_id, _ch, server_id, muted, deafened, video_map} ->
      %{user_id: to_string(user_id), channel_id: to_string(channel_id), server_id: to_string(server_id),
        self_mute: muted, self_deaf: deafened, self_video: video_map}
    end)
  end

  @doc "Get a user's current voice state, or nil."
  def get(user_id) do
    case :ets.lookup(@table, user_id) do
      [{^user_id, channel_id, server_id, muted, deafened, video_map}] ->
        %{user_id: to_string(user_id), channel_id: to_string(channel_id), server_id: to_string(server_id),
          self_mute: muted, self_deaf: deafened, self_video: video_map}
      [] ->
        nil
    end
  end

  @doc "Get all voice states for a server."
  def list_server(server_id) do
    :ets.match_object(@table, {:_, :_, server_id, :_, :_, :_})
    |> Enum.map(fn {user_id, channel_id, sid, muted, deafened, video_map} ->
      %{user_id: to_string(user_id), channel_id: to_string(channel_id), server_id: to_string(sid),
        self_mute: muted, self_deaf: deafened, self_video: video_map}
    end)
  end

  # ── GenServer Callbacks ──

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{}}
  end

  @impl true
  def handle_call({:join, channel_id, user_id, server_id}, _from, state) do
    # Leave existing channel first
    leave_internal(user_id)

    # Check user limit
    case Burrow.Communities.get_channel(channel_id) do
      {:ok, channel} ->
        current_count = length(list_channel(channel_id))
        if channel.user_limit && channel.user_limit > 0 && current_count >= channel.user_limit do
          {:reply, {:error, :channel_full}, state}
        else
          initial_video = %{camera: false, screens: []}
          :ets.insert(@table, {user_id, channel_id, server_id, false, false, initial_video})
          broadcast_voice_state(user_id, channel_id, server_id, false, false, initial_video)
          {:reply, {:ok, get(user_id)}, state}
        end

      _ ->
        {:reply, {:error, :channel_not_found}, state}
    end
  end

  def handle_call({:leave, user_id}, _from, state) do
    leave_internal(user_id)
    {:reply, :ok, state}
  end

  def handle_call({:update, user_id, attrs}, _from, state) do
    case :ets.lookup(@table, user_id) do
      [{^user_id, channel_id, server_id, muted, deafened, video_map}] ->
        new_muted = Map.get(attrs, :self_mute, muted)
        new_deafened = Map.get(attrs, :self_deaf, deafened)
        new_video = Map.get(attrs, :self_video, video_map)
        :ets.insert(@table, {user_id, channel_id, server_id, new_muted, new_deafened, new_video})
        broadcast_voice_state(user_id, channel_id, server_id, new_muted, new_deafened, new_video)
        {:reply, {:ok, get(user_id)}, state}

      [] ->
        {:reply, {:error, :not_in_voice}, state}
    end
  end

  # ── Internal ──

  defp leave_internal(user_id) do
    case :ets.lookup(@table, user_id) do
      [{^user_id, channel_id, server_id, _, _, _}] ->
        :ets.delete(@table, user_id)
        broadcast_voice_leave(user_id, channel_id, server_id)

      [] ->
        :ok
    end
  end

  defp broadcast_voice_state(user_id, channel_id, server_id, muted, deafened, video_map) do
    Phoenix.PubSub.broadcast(Burrow.PubSub, "voice:#{server_id}", %{
      event: "voice_state_update",
      payload: %{
        user_id: to_string(user_id),
        channel_id: to_string(channel_id),
        server_id: to_string(server_id),
        self_mute: muted,
        self_deaf: deafened,
        self_video: video_map
      }
    })
  end

  defp broadcast_voice_leave(user_id, _channel_id, server_id) do
    Phoenix.PubSub.broadcast(Burrow.PubSub, "voice:#{server_id}", %{
      event: "voice_state_update",
      payload: %{
        user_id: to_string(user_id),
        channel_id: nil,
        server_id: to_string(server_id),
        self_mute: false,
        self_deaf: false,
        self_video: %{camera: false, screens: []}
      }
    })
  end
end
