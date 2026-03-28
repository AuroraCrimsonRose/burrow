defmodule BurrowWeb.PinController do
  use BurrowWeb, :controller

  alias Burrow.Chat
  alias Burrow.Communities
  alias Burrow.Permissions

  action_fallback BurrowWeb.FallbackController

  @doc "POST /servers/:server_id/channels/:channel_id/pins"
  def create(conn, %{"server_id" => sid, "channel_id" => cid, "message_id" => mid}) do
    user_id = conn.assigns.current_user_id

    with {server_id, ""} <- Integer.parse(sid),
         {channel_id, ""} <- Integer.parse(cid),
         {message_id, ""} <- Integer.parse(mid),
         true <- Communities.member?(server_id, user_id),
         false <- Communities.timed_out?(server_id, user_id),
         true <- Communities.has_channel_permission?(server_id, user_id, channel_id, Permissions.manage_messages()),
         {:ok, pin} <- Chat.pin_message(message_id, user_id) do
      conn
      |> put_status(:created)
      |> json(%{
        id: to_string(pin.id),
        channel_id: to_string(pin.channel_id),
        message_id: to_string(pin.message_id),
        pinned_by: to_string(pin.pinned_by),
        timestamp: pin.inserted_at
      })
    else
      false -> {:error, :forbidden}
      {:error, :pin_limit_reached} -> {:error, :pin_limit_reached}
      error -> error
    end
  end

  @doc "DELETE /servers/:server_id/channels/:channel_id/pins/:message_id"
  def delete(conn, %{"server_id" => sid, "channel_id" => cid, "message_id" => mid}) do
    user_id = conn.assigns.current_user_id

    with {server_id, ""} <- Integer.parse(sid),
         {channel_id, ""} <- Integer.parse(cid),
         {message_id, ""} <- Integer.parse(mid),
         true <- Communities.member?(server_id, user_id),
         true <- Communities.has_channel_permission?(server_id, user_id, channel_id, Permissions.manage_messages()),
         :ok <- Chat.unpin_message(message_id, channel_id) do
      json(conn, %{status: "unpinned"})
    else
      false -> {:error, :forbidden}
      error -> error
    end
  end

  @doc "GET /servers/:server_id/channels/:channel_id/pins"
  def index(conn, %{"server_id" => sid, "channel_id" => cid}) do
    user_id = conn.assigns.current_user_id

    with {server_id, ""} <- Integer.parse(sid),
         {channel_id, ""} <- Integer.parse(cid),
         true <- Communities.member?(server_id, user_id) do
      pins = Chat.list_pins(channel_id)

      pins_json =
        Enum.map(pins, fn pin ->
          %{
            id: to_string(pin.id),
            channel_id: to_string(pin.channel_id),
            message_id: to_string(pin.message_id),
            pinned_by: to_string(pin.pinned_by),
            timestamp: pin.inserted_at
          }
        end)

      json(conn, %{pins: pins_json})
    else
      false -> {:error, :forbidden}
      _ -> {:error, :bad_request}
    end
  end
end
