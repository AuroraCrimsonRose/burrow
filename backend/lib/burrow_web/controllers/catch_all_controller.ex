defmodule BurrowWeb.CatchAllController do
  use BurrowWeb, :controller

  def not_found(conn, _params) do
    conn
    |> put_status(:not_found)
    |> json(%{error: "not_found", detail: "Resource not found"})
  end
end
