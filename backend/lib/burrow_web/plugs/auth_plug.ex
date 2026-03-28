defmodule BurrowWeb.AuthPlug do
  @moduledoc """
  Plug that authenticates requests via Bearer token.

  Looks up the session by token hash and assigns `:current_user_id`
  and `:current_session` to the connection. Returns 401 if the token
  is missing or invalid.
  """

  import Plug.Conn
  alias Burrow.Auth

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         %Auth.UserSession{user: user} = session <- Auth.get_session_by_token(token) do
      Auth.touch_session(session)

      conn
      |> assign(:current_user_id, session.user_id)
      |> assign(:current_session, session)
      |> assign(:current_trust_tier, user.trust_tier)
    else
      _ ->
        conn
        |> put_status(:unauthorized)
        |> Phoenix.Controller.json(%{error: "unauthorized", detail: "Authentication required"})
        |> halt()
    end
  end
end
