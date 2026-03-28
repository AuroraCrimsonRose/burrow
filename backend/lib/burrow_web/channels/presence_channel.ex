defmodule BurrowWeb.PresenceChannel do
  @moduledoc """
  Channel for real-time presence tracking.

  Clients join `presence:lobby` to:
  - Register themselves as online (tracked via Burrow.Presence)
  - Subscribe to friends' presence changes
  - Receive batched `presence_update` events
  - Send `update_status` to change their status

  ## Join params

      %{"status" => "online"}  # optional, defaults to "online"

  Valid statuses: `online`, `idle`, `dnd`, `invisible`.

  ## Events received

  - `presence_state` — initial friend presence snapshot on join
  - `presence_update` — friend status changed (`%{user_id, status}`)

  ## Events sent

  - `update_status` — `%{"status" => "idle"}` — change your status
  """

  use Phoenix.Channel

  alias Burrow.Presence
  alias Burrow.Social

  @valid_statuses ~w(online idle dnd invisible)

  @impl true
  def join("presence:lobby", params, socket) do
    status = Map.get(params, "status", "online")

    if status in @valid_statuses do
      send(self(), {:after_join, status})
      {:ok, socket}
    else
      {:error, %{reason: "invalid_status"}}
    end
  end

  @impl true
  def handle_info({:after_join, status}, socket) do
    user_id = socket.assigns.user_id

    # Track this connection
    Presence.track(user_id, status)

    # Subscribe to user-specific notification topic (call ringing, etc.)
    Phoenix.PubSub.subscribe(Burrow.PubSub, "user_notify:#{user_id}")

    # Subscribe to friends' presence topics
    friends = Social.list_friends(user_id)

    for %{user: friend} <- friends do
      Phoenix.PubSub.subscribe(Burrow.PubSub, "user_presence:#{friend.id}")
    end

    # Send initial friend presence snapshot
    friend_ids = Enum.map(friends, fn %{user: u} -> u.id end)
    statuses = Presence.get_statuses(friend_ids)

    own_custom = Presence.get_custom_status(user_id)

    push(socket, "presence_state", %{
      presences:
        Enum.map(statuses, fn {uid, s} ->
          custom = Presence.get_custom_status(uid)
          entry = %{user_id: to_string(uid), status: s}
          if custom, do: Map.merge(entry, %{status_text: custom.text, status_expires_at: custom.expires_at}), else: entry
        end),
      own_custom_status:
        if(own_custom, do: %{text: own_custom.text, expires_at: own_custom.expires_at}, else: nil)
    })

    {:noreply, socket}
  end

  # Receive batched presence updates from PubSub
  def handle_info({:presence_update, user_id, status}, socket) do
    custom = Presence.get_custom_status(user_id)

    entry = %{user_id: to_string(user_id), status: status}

    entry =
      if custom do
        Map.merge(entry, %{status_text: custom.text, status_expires_at: custom.expires_at})
      else
        Map.put(entry, :status_text, nil)
      end

    push(socket, "presence_update", entry)
    {:noreply, socket}
  end

  # Forward DM call ringing notification to the client
  def handle_info({:dm_call_ring, payload}, socket) do
    push(socket, "dm_call_ring", payload)
    {:noreply, socket}
  end

  # Forward DM call ended notification to the client
  def handle_info({:dm_call_ended, payload}, socket) do
    push(socket, "dm_call_ended", payload)
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  @impl true
  def handle_in("update_status", %{"status" => status}, socket)
      when status in @valid_statuses do
    Presence.update_status(socket.assigns.user_id, status)
    {:reply, :ok, socket}
  end

  def handle_in("update_status", _params, socket) do
    {:reply, {:error, %{reason: "invalid_status"}}, socket}
  end

  def handle_in("set_custom_status", %{"text" => text} = params, socket)
      when is_binary(text) and byte_size(text) <= 128 do
    expires_at =
      case params["duration"] do
        d when is_integer(d) and d > 0 ->
          DateTime.utc_now() |> DateTime.add(d, :second)
        _ -> nil
      end

    uid = socket.assigns.user_id
    Presence.set_custom_status(uid, text, expires_at)
    Presence.broadcast_status(uid)
    {:reply, :ok, socket}
  end

  def handle_in("set_custom_status", %{"clear" => true}, socket) do
    uid = socket.assigns.user_id
    Presence.set_custom_status(uid, nil)
    Presence.broadcast_status(uid)
    {:reply, :ok, socket}
  end

  def handle_in("set_custom_status", _params, socket) do
    {:reply, {:error, %{reason: "invalid_params"}}, socket}
  end

  @impl true
  def terminate(_reason, socket) do
    user_id = socket.assigns[:user_id]
    if user_id, do: Phoenix.PubSub.unsubscribe(Burrow.PubSub, "user_notify:#{user_id}")
    Presence.untrack()
    {:ok, socket}
  end
end
