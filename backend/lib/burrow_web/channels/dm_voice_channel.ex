defmodule BurrowWeb.DmVoiceChannel do
  @moduledoc """
  Phoenix Channel for DM voice call signaling.

  Clients join `dm_voice:{dm_id}` to start/join a 1-on-1 call.
  Only DM participants can join. Relays WebRTC offer/answer/ice.
  """

  use Phoenix.Channel

  alias Burrow.DM
  alias Burrow.Auth

  @impl true
  def join("dm_voice:" <> dm_id_str, _params, socket) do
    user_id = socket.assigns.user_id

    case Integer.parse(dm_id_str) do
      {dm_id, ""} ->
        if DM.participant?(dm_id, user_id) do
          Phoenix.PubSub.subscribe(Burrow.PubSub, "dm_voice:#{dm_id}")

          socket =
            socket
            |> assign(:dm_id, dm_id)

          # Notify the other participant about the incoming call
          case DM.other_participant(dm_id, user_id) do
            nil -> :ok
            other_id ->
              caller = Auth.get_user(user_id)
              caller_name = if caller, do: caller.username, else: "Someone"
              Phoenix.PubSub.broadcast(Burrow.PubSub, "user_notify:#{other_id}", {
                :dm_call_ring,
                %{
                  dm_id: to_string(dm_id),
                  caller_id: to_string(user_id),
                  caller_name: caller_name
                }
              })
          end

          # Return who's already in the call
          {:ok, %{self_user_id: to_string(user_id)}, socket}
        else
          {:error, %{reason: "not_a_participant"}}
        end

      _ ->
        {:error, %{reason: "invalid_dm"}}
    end
  end

  # Forward WebRTC offer
  @impl true
  def handle_in("rtc_offer", %{"to" => to_user_id, "sdp" => sdp}, socket) do
    from = to_string(socket.assigns.user_id)
    broadcast_to_user(socket, to_user_id, "rtc_offer", %{from: from, sdp: sdp})
    {:noreply, socket}
  end

  # Forward WebRTC answer
  def handle_in("rtc_answer", %{"to" => to_user_id, "sdp" => sdp}, socket) do
    from = to_string(socket.assigns.user_id)
    broadcast_to_user(socket, to_user_id, "rtc_answer", %{from: from, sdp: sdp})
    {:noreply, socket}
  end

  # Forward ICE candidate
  def handle_in("rtc_ice", %{"to" => to_user_id, "candidate" => candidate}, socket) do
    from = to_string(socket.assigns.user_id)
    broadcast_to_user(socket, to_user_id, "rtc_ice", %{from: from, candidate: candidate})
    {:noreply, socket}
  end

  # Notify peer that caller joined
  def handle_in("dm_call_join", _payload, socket) do
    user_id = to_string(socket.assigns.user_id)
    dm_id = socket.assigns.dm_id

    Phoenix.PubSub.broadcast(Burrow.PubSub, "dm_voice:#{dm_id}", %{
      event: "dm_call_peer_joined",
      payload: %{user_id: user_id}
    })

    {:reply, :ok, socket}
  end

  # Notify peer that caller left
  def handle_in("dm_call_leave", _payload, socket) do
    user_id = to_string(socket.assigns.user_id)
    dm_id = socket.assigns.dm_id

    Phoenix.PubSub.broadcast(Burrow.PubSub, "dm_voice:#{dm_id}", %{
      event: "dm_call_peer_left",
      payload: %{user_id: user_id}
    })

    {:reply, :ok, socket}
  end

  # TURN credentials
  def handle_in("turn_credentials", _payload, socket) do
    user_id = to_string(socket.assigns.user_id)
    creds = generate_turn_credentials(user_id)
    {:reply, {:ok, creds}, socket}
  end

  # ── PubSub → Client push ──

  @impl true
  def handle_info(%{event: event, payload: payload}, socket) do
    case Map.get(payload, :to) do
      nil ->
        push(socket, event, payload)

      to_id ->
        if to_string(to_id) == to_string(socket.assigns.user_id) do
          push(socket, event, payload)
        end
    end

    {:noreply, socket}
  end

  @impl true
  def terminate(_reason, socket) do
    user_id = socket.assigns.user_id
    dm_id = socket.assigns.dm_id

    Phoenix.PubSub.broadcast(Burrow.PubSub, "dm_voice:#{dm_id}", %{
      event: "dm_call_peer_left",
      payload: %{user_id: to_string(user_id)}
    })

    # Notify the other participant that the call ended
    case DM.other_participant(dm_id, user_id) do
      nil -> :ok
      other_id ->
        Phoenix.PubSub.broadcast(Burrow.PubSub, "user_notify:#{other_id}", {
          :dm_call_ended,
          %{dm_id: to_string(dm_id), caller_id: to_string(user_id)}
        })
    end

    :ok
  end

  # ── Helpers ──

  defp broadcast_to_user(socket, to_user_id, event, payload) do
    dm_id = socket.assigns.dm_id

    Phoenix.PubSub.broadcast(Burrow.PubSub, "dm_voice:#{dm_id}", %{
      event: event,
      payload: Map.put(payload, :to, to_user_id)
    })
  end

  defp generate_turn_credentials(user_id) do
    secret = System.get_env("TURN_SECRET") || Application.get_env(:burrow, :turn_secret, "")
    ttl = 86_400
    expiry = System.system_time(:second) + ttl
    username = "#{expiry}:#{user_id}"
    credential = :crypto.mac(:hmac, :sha, secret, username) |> Base.encode64()

    %{
      username: username,
      credential: credential,
      ttl: ttl,
      urls: [
        "stun:#{turn_host()}:#{turn_port()}",
        "turn:#{turn_host()}:#{turn_port()}?transport=udp",
        "turn:#{turn_host()}:#{turn_port()}?transport=tcp"
      ]
    }
  end

  defp turn_host, do: System.get_env("TURN_HOST") || "localhost"
  defp turn_port, do: System.get_env("TURN_PORT") || "3478"
end
