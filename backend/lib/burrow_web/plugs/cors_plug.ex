defmodule BurrowWeb.CorsPlug do
  @moduledoc "CORS plug. Reads allowed origins from config; falls back to dev defaults."
  import Plug.Conn

  @dev_origins ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5175", "http://127.0.0.1:5175"]

  defp allowed_origins do
    case System.get_env("CORS_ORIGINS") do
      nil -> @dev_origins
      origins -> String.split(origins, ",", trim: true) |> Enum.map(&String.trim/1)
    end
  end

  def init(opts), do: opts

  def call(conn, _opts) do
    origin = get_req_header(conn, "origin") |> List.first()

    if origin in allowed_origins() do
      conn
      |> put_resp_header("access-control-allow-origin", origin)
      |> put_resp_header("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
      |> put_resp_header("access-control-allow-headers", "authorization, content-type, x-request-timestamp, x-request-nonce, x-device-signature")
      |> put_resp_header("access-control-max-age", "86400")
      |> handle_preflight()
    else
      conn
    end
  end

  defp handle_preflight(%{method: "OPTIONS"} = conn) do
    conn |> send_resp(204, "") |> halt()
  end

  defp handle_preflight(conn), do: conn
end
