defmodule BurrowWeb.IpRateLimitPlug do
  @moduledoc """
  Plug that enforces IP-based rate limits on public (unauthenticated) endpoints.

  Accepts an `:action` option:
  - `:auth`     — 10 req/s (login, challenge, verify)
  - `:creation` — 3 req/s (registration)
  - `:general`  — 100 req/s (default)
  """

  import Plug.Conn
  alias Burrow.RateLimiter

  def init(opts), do: opts

  def call(conn, opts) do
    ip = conn.remote_ip |> :inet.ntoa() |> to_string()
    action = Keyword.get(opts, :action, :general)

    result =
      case action do
        :auth -> RateLimiter.check_ip_auth(ip)
        :creation -> RateLimiter.check_ip_creation(ip)
        _ -> RateLimiter.check_ip(ip)
      end

    case result do
      {:ok, _remaining, _reset_at} ->
        conn

      {:error, retry_after, _limit} ->
        conn
        |> put_resp_header("retry-after", Integer.to_string(retry_after))
        |> put_status(429)
        |> Phoenix.Controller.json(%{
          error: "rate_limited",
          detail: "Too many requests from this IP. Please wait before trying again.",
          retry_after: retry_after
        })
        |> halt()
    end
  end
end
