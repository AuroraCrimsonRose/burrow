defmodule BurrowWeb.GatewayChannel do
  @moduledoc """
  Real-time gateway channel for message events.

  Clients join `channel:{channel_id}` topics to receive:
  - message_create
  - message_edit
  - message_delete

  On join, clients can send `last_seq` to replay missed events.
  """

  use Phoenix.Channel

  alias Burrow.Communities
  alias Burrow.Chat
  alias Burrow.DM
  alias Burrow.Permissions

  # Typing indicator debounce: one event per user per channel every 8 seconds
  @typing_debounce_ms 8_000

  @impl true
  def join("channel:" <> channel_id_str, params, socket) do
    user_id = socket.assigns.user_id

    case Integer.parse(channel_id_str) do
      {channel_id, ""} ->
        with {:ok, channel} <- Communities.get_channel(channel_id),
             true <- Communities.member?(channel.server_id, user_id),
             true <- Communities.has_channel_permission?(channel.server_id, user_id, channel_id, Permissions.view_channel()) do
          # Subscribe to PubSub for this channel
          Chat.subscribe(channel_id)

          # Replay missed events if client sends last_seq
          missed_events =
            case params["last_seq"] do
              seq when is_integer(seq) and seq >= 0 ->
                Chat.get_events_since(channel_id, seq)

              _ ->
                []
            end

          socket = assign(socket, :channel_id, channel_id)
          socket = assign(socket, :server_id, channel.server_id)

          {:ok,
           %{
             channel_id: to_string(channel_id),
             replay: Enum.map(missed_events, &event_json/1)
           }, socket}
        else
          _ -> {:error, %{reason: "forbidden"}}
        end

      _ ->
        {:error, %{reason: "invalid_channel"}}
    end
  end

  # Join a DM channel topic
  @impl true
  def join("dm:" <> dm_id_str, params, socket) do
    user_id = socket.assigns.user_id

    case Integer.parse(dm_id_str) do
      {dm_id, ""} ->
        if DM.participant?(dm_id, user_id) do
          DM.subscribe(dm_id)

          missed_events =
            case params["last_seq"] do
              seq when is_integer(seq) and seq >= 0 ->
                Chat.get_events_since(dm_id, seq)
              _ ->
                []
            end

          socket = assign(socket, :channel_id, dm_id)

          {:ok,
           %{
             channel_id: to_string(dm_id),
             type: "dm",
             replay: Enum.map(missed_events, &event_json/1)
           }, socket}
        else
          {:error, %{reason: "forbidden"}}
        end

      _ ->
        {:error, %{reason: "invalid_channel"}}
    end
  end

  # Handle new_message from client (send via WebSocket instead of REST)
  @impl true
  def handle_in("new_message", %{"content" => _content} = params, socket) do
    user_id = socket.assigns.user_id
    channel_id = socket.assigns.channel_id

    result =
      if String.starts_with?(socket.topic, "dm:") do
        DM.send_message(channel_id, user_id, params)
      else
        server_id = socket.assigns.server_id

        cond do
          Communities.timed_out?(server_id, user_id) ->
            {:error, :timed_out}

          !Communities.has_channel_permission?(server_id, user_id, channel_id, Permissions.send_messages()) ->
            {:error, :forbidden}

          true ->
            Chat.send_message(channel_id, user_id, params)
        end
      end

    case result do
      {:ok, _message} ->
        {:reply, :ok, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: to_string(reason)}}, socket}
    end
  end

  def handle_in("typing", _params, socket) do
    user_id = socket.assigns.user_id
    channel_id = socket.assigns.channel_id
    key = {channel_id, user_id}
    now = System.monotonic_time(:millisecond)

    # Debounce: only broadcast if last typing event was > 8s ago
    should_broadcast =
      case :ets.lookup(:typing_debounce, key) do
        [{^key, last_ts}] -> now - last_ts >= @typing_debounce_ms
        [] -> true
      end

    if should_broadcast do
      :ets.insert(:typing_debounce, {key, now})

      broadcast_from(socket, "typing_start", %{
        user_id: to_string(user_id),
        channel_id: to_string(channel_id),
        timestamp: DateTime.utc_now()
      })
    end

    {:noreply, socket}
  end

  # Forward PubSub broadcasts to the WebSocket client
  @impl true
  def handle_info({"message_create", payload}, socket) do
    push(socket, "message_create", payload)
    {:noreply, socket}
  end

  def handle_info({"message_edit", payload}, socket) do
    push(socket, "message_edit", payload)
    {:noreply, socket}
  end

  def handle_info({"message_delete", payload}, socket) do
    push(socket, "message_delete", payload)
    {:noreply, socket}
  end

  def handle_info({"reaction_add", payload}, socket) do
    push(socket, "reaction_add", payload)
    {:noreply, socket}
  end

  def handle_info({"reaction_remove", payload}, socket) do
    push(socket, "reaction_remove", payload)
    {:noreply, socket}
  end

  def handle_info({"pin_add", payload}, socket) do
    push(socket, "pin_add", payload)
    {:noreply, socket}
  end

  def handle_info({"pin_remove", payload}, socket) do
    push(socket, "pin_remove", payload)
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  @impl true
  def terminate(_reason, socket) do
    channel_id = socket.assigns[:channel_id]

    if channel_id do
      if String.starts_with?(socket.topic, "dm:") do
        DM.unsubscribe(channel_id)
      else
        Chat.unsubscribe(channel_id)
      end
    end

    :ok
  end

  defp event_json(%Chat.Event{} = event) do
    %{
      event_type: event.event_type,
      channel_seq: event.channel_seq,
      payload: event.payload,
      timestamp: event.timestamp
    }
  end
end
