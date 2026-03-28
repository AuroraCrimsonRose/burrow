defmodule Burrow.Presence do
  @moduledoc """
  In-memory presence tracker using ETS.

  Tracks per-connection status with automatic cleanup via process monitoring.
  Multiple connections per user are supported — the effective (visible) status
  is the highest-priority one across all connections.

  Status priority: online (3) > idle (2) > dnd (1) > invisible (0).
  Invisible users appear as "offline" to others.

  Presence updates are batched and broadcast via PubSub every 5 seconds
  on the `user_presence:{user_id}` topic to avoid flooding on rapid flaps.
  """

  use GenServer

  @batch_interval 5_000
  @status_priority %{"online" => 3, "idle" => 2, "dnd" => 1, "invisible" => 0}

  # ---------------------------------------------------------------------------
  # Public API (reads hit ETS directly — no GenServer bottleneck)
  # ---------------------------------------------------------------------------

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @doc "Track the calling process as a connection for `user_id`."
  def track(user_id, status \\ "online") do
    GenServer.call(__MODULE__, {:track, self(), user_id, status})
  end

  @doc "Update this connection's status."
  def update_status(user_id, status) do
    GenServer.call(__MODULE__, {:update_status, self(), user_id, status})
  end

  @doc "Untrack the calling process."
  def untrack do
    GenServer.call(__MODULE__, {:untrack, self()})
  end

  @doc "Set a custom text status for the user. Pass nil to clear."
  def set_custom_status(user_id, text, expires_at \\ nil) do
    GenServer.call(__MODULE__, {:set_custom_status, user_id, text, expires_at})
  end

  @doc "Broadcast the user's current status (including custom status) to friends."
  def broadcast_status(user_id) do
    status = get_status(user_id)

    Phoenix.PubSub.broadcast(
      Burrow.PubSub,
      "user_presence:#{user_id}",
      {:presence_update, user_id, status}
    )
  end

  @doc "Get the custom text status for a user."
  def get_custom_status(user_id) do
    case :ets.lookup(:presence_custom, user_id) do
      [{^user_id, text, nil}] -> %{text: text, expires_at: nil}
      [{^user_id, text, exp}] ->
        if DateTime.compare(exp, DateTime.utc_now()) == :gt do
          %{text: text, expires_at: DateTime.to_iso8601(exp)}
        else
          :ets.delete(:presence_custom, user_id)
          nil
        end
      [] -> nil
    end
  end

  @doc "Get the visible status for a user (invisible → offline)."
  def get_status(user_id) do
    case :ets.lookup(:presence_users, user_id) do
      [{^user_id, "invisible"}] -> "offline"
      [{^user_id, status}] -> status
      [] -> "offline"
    end
  end

  @doc "Get the raw status (including invisible) for the user themselves."
  def get_raw_status(user_id) do
    case :ets.lookup(:presence_users, user_id) do
      [{^user_id, status}] -> status
      [] -> "offline"
    end
  end

  @doc "Get visible statuses for a list of user IDs."
  def get_statuses(user_ids) when is_list(user_ids) do
    Map.new(user_ids, fn uid -> {uid, get_status(uid)} end)
  end

  @doc "Returns true if the user has any active connection (not invisible)."
  def online?(user_id), do: get_status(user_id) != "offline"

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    :ets.new(:presence_conns, [:named_table, :set, :public, read_concurrency: true])
    :ets.new(:presence_users, [:named_table, :set, :public, read_concurrency: true])
    :ets.new(:presence_custom, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{pending: %{}, timer: nil}}
  end

  @impl true
  def handle_call({:track, pid, user_id, status}, _from, state) do
    Process.monitor(pid)
    :ets.insert(:presence_conns, {pid, user_id, status})
    {:reply, :ok, recompute_and_enqueue(user_id, state)}
  end

  def handle_call({:update_status, pid, user_id, status}, _from, state) do
    case :ets.lookup(:presence_conns, pid) do
      [{^pid, ^user_id, _}] ->
        :ets.insert(:presence_conns, {pid, user_id, status})
        {:reply, :ok, recompute_and_enqueue(user_id, state)}

      _ ->
        {:reply, {:error, :not_tracked}, state}
    end
  end

  def handle_call({:untrack, pid}, _from, state) do
    {:reply, :ok, remove_conn(pid, state)}
  end

  def handle_call({:set_custom_status, user_id, nil, _exp}, _from, state) do
    :ets.delete(:presence_custom, user_id)
    {:reply, :ok, state}
  end

  def handle_call({:set_custom_status, user_id, text, expires_at}, _from, state) do
    :ets.insert(:presence_custom, {user_id, text, expires_at})
    {:reply, :ok, state}
  end

  @impl true
  def handle_info({:DOWN, _ref, :process, pid, _reason}, state) do
    {:noreply, remove_conn(pid, state)}
  end

  def handle_info(:flush, state) do
    for {user_id, status} <- state.pending do
      Phoenix.PubSub.broadcast(
        Burrow.PubSub,
        "user_presence:#{user_id}",
        {:presence_update, user_id, status}
      )
    end

    {:noreply, %{state | pending: %{}, timer: nil}}
  end

  # ---------------------------------------------------------------------------
  # Private
  # ---------------------------------------------------------------------------

  defp remove_conn(pid, state) do
    case :ets.lookup(:presence_conns, pid) do
      [{^pid, user_id, _}] ->
        :ets.delete(:presence_conns, pid)
        recompute_and_enqueue(user_id, state)

      [] ->
        state
    end
  end

  defp recompute_and_enqueue(user_id, state) do
    old_visible = get_status(user_id)
    recompute_user_status(user_id)
    new_visible = get_status(user_id)

    if old_visible != new_visible do
      pending = Map.put(state.pending, user_id, new_visible)
      schedule_flush(%{state | pending: pending})
    else
      state
    end
  end

  defp recompute_user_status(user_id) do
    conns = :ets.match_object(:presence_conns, {:_, user_id, :_})

    case conns do
      [] ->
        :ets.delete(:presence_users, user_id)

      _ ->
        {_, _, status} =
          Enum.max_by(conns, fn {_, _, s} -> Map.get(@status_priority, s, 0) end)

        :ets.insert(:presence_users, {user_id, status})
    end
  end

  defp schedule_flush(%{timer: nil} = state) do
    timer = Process.send_after(self(), :flush, @batch_interval)
    %{state | timer: timer}
  end

  defp schedule_flush(state), do: state
end
