defmodule BurrowWeb.UserSocket do
  use Phoenix.Socket

  channel "channel:*", BurrowWeb.GatewayChannel
  channel "dm:*", BurrowWeb.GatewayChannel
  channel "presence:*", BurrowWeb.PresenceChannel
  channel "voice:*", BurrowWeb.VoiceChannel
  channel "dm_voice:*", BurrowWeb.DmVoiceChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    case Burrow.Auth.get_session_by_token(token) do
      %Burrow.Auth.UserSession{} = session ->
        Burrow.Auth.touch_session(session)

        socket =
          socket
          |> assign(:user_id, session.user_id)
          |> assign(:session_id, session.id)

        {:ok, socket}

      _ ->
        :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.user_id}"
end
