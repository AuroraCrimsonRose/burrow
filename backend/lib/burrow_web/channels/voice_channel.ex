defmodule BurrowWeb.VoiceChannel do
  @moduledoc """
  Phoenix Channel for voice signaling and voice state updates.

  Clients join `voice:{server_id}` to:
  - Receive voice_state_update events for the server
  - Join/leave voice channels
  - Exchange WebRTC signaling (offer/answer/ice_candidate)
  """

  use Phoenix.Channel

  alias Burrow.Communities
  alias Burrow.Voice.VoiceState
  alias Burrow.Permissions

  @impl true
  def join("voice:" <> server_id_str, _params, socket) do
    user_id = socket.assigns.user_id

    case Integer.parse(server_id_str) do
      {server_id, ""} ->
        if Communities.member?(server_id, user_id) do
          # Subscribe to voice state events for this server
          Phoenix.PubSub.subscribe(Burrow.PubSub, "voice:#{server_id}")

          socket = assign(socket, :server_id, server_id)

          # Return current voice states for this server
          states = VoiceState.list_server(server_id)
          {:ok, %{voice_states: states, self_user_id: to_string(user_id)}, socket}
        else
          {:error, %{reason: "not_a_member"}}
        end

      _ ->
        {:error, %{reason: "invalid_server"}}
    end
  end

  # ── Client Events ──

  # Join a voice channel
  @impl true
  def handle_in("voice_join", %{"channel_id" => channel_id_str}, socket) do
    user_id = socket.assigns.user_id
    server_id = socket.assigns.server_id

    with {channel_id, ""} <- Integer.parse(channel_id_str),
         {:ok, channel} <- Communities.get_channel(channel_id),
         true <- channel.server_id == server_id,
         true <- channel.type == "voice",
         true <- Communities.has_channel_permission?(server_id, user_id, channel_id, Permissions.connect()) do
      case VoiceState.join(channel_id, user_id, server_id) do
        {:ok, state} ->
          {:reply, {:ok, %{voice_state: state, peers: VoiceState.list_channel(channel_id)}}, socket}

        {:error, :channel_full} ->
          {:reply, {:error, %{reason: "channel_full"}}, socket}
      end
    else
      _ ->
        {:reply, {:error, %{reason: "forbidden"}}, socket}
    end
  end

  # Leave voice channel
  def handle_in("voice_leave", _payload, socket) do
    VoiceState.leave(socket.assigns.user_id)
    {:reply, :ok, socket}
  end

  # Update self mute/deafen/video state
  def handle_in("voice_state", payload, socket) do
    attrs = %{}
    attrs = if Map.has_key?(payload, "self_mute"), do: Map.put(attrs, :self_mute, !!payload["self_mute"]), else: attrs
    attrs = if Map.has_key?(payload, "self_deaf"), do: Map.put(attrs, :self_deaf, !!payload["self_deaf"]), else: attrs
    attrs = if Map.has_key?(payload, "self_video") do
      raw = payload["self_video"]
      video_map = cond do
        is_map(raw) ->
          camera = !!Map.get(raw, "camera", false)
          screens = case Map.get(raw, "screens", []) do
            s when is_list(s) -> Enum.map(s, &to_string/1) |> Enum.take(3)
            _ -> []
          end
          %{camera: camera, screens: screens}
        is_boolean(raw) ->
          %{camera: raw, screens: []}
        true ->
          %{camera: false, screens: []}
      end
      Map.put(attrs, :self_video, video_map)
    else
      attrs
    end

    case VoiceState.update(socket.assigns.user_id, attrs) do
      {:ok, _state} -> {:reply, :ok, socket}
      {:error, _} -> {:reply, {:error, %{reason: "not_in_voice"}}, socket}
    end
  end

  # Forward WebRTC offer to a specific peer
  def handle_in("rtc_offer", %{"to" => to_user_id, "sdp" => sdp}, socket) do
    from = to_string(socket.assigns.user_id)
    broadcast_to_user(socket, to_user_id, "rtc_offer", %{from: from, sdp: sdp})
    {:noreply, socket}
  end

  # Forward WebRTC answer to a specific peer
  def handle_in("rtc_answer", %{"to" => to_user_id, "sdp" => sdp}, socket) do
    from = to_string(socket.assigns.user_id)
    broadcast_to_user(socket, to_user_id, "rtc_answer", %{from: from, sdp: sdp})
    {:noreply, socket}
  end

  # Forward ICE candidate to a specific peer
  def handle_in("rtc_ice", %{"to" => to_user_id, "candidate" => candidate}, socket) do
    from = to_string(socket.assigns.user_id)
    broadcast_to_user(socket, to_user_id, "rtc_ice", %{from: from, candidate: candidate})
    {:noreply, socket}
  end

  # Request TURN credentials
  def handle_in("turn_credentials", _payload, socket) do
    user_id = to_string(socket.assigns.user_id)
    creds = generate_turn_credentials(user_id)
    {:reply, {:ok, creds}, socket}
  end

  # ── PubSub → Client push ──

  @impl true
  def handle_info(%{event: event, payload: payload}, socket) do
    # For targeted signaling messages (rtc_offer/answer/ice), only deliver
    # to the intended recipient. This prevents duplicates when a user has
    # multiple channel processes from reconnects.
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

  # ── Cleanup on disconnect ──

  @impl true
  def terminate(_reason, socket) do
    VoiceState.leave(socket.assigns.user_id)
    :ok
  end

  # ── Helpers ──

  defp broadcast_to_user(socket, to_user_id, event, payload) do
    server_id = socket.assigns.server_id
    Phoenix.PubSub.broadcast(Burrow.PubSub, "voice:#{server_id}", %{
      event: event,
      payload: Map.put(payload, :to, to_user_id)
    })
  end

  defp generate_turn_credentials(user_id) do
    secret = System.get_env("TURN_SECRET") || Application.get_env(:burrow, :turn_secret, "")
    # Credential valid for 24 hours
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
