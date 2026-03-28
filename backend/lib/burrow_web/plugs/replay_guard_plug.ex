defmodule BurrowWeb.ReplayGuardPlug do
  @moduledoc """
  Prevents replay attacks by requiring a timestamp and nonce on each request.

  Headers required:
    - X-Request-Timestamp: Unix epoch seconds
    - X-Request-Nonce: Unique hex string (min 16 chars)

  Validates:
    1. Timestamp is within ±30 seconds of server time
    2. Nonce has not been seen before (stored in Redis with 60s TTL)

  Disable in dev via: `config :burrow, replay_guard_enabled: false`
  """

  import Plug.Conn

  @max_age_seconds 30
  @nonce_ttl_seconds 60
  @min_nonce_length 16

  def init(opts), do: opts

  def call(conn, _opts) do
    if Application.get_env(:burrow, :replay_guard_enabled, true) do
      do_check(conn)
    else
      conn
    end
  end

  defp do_check(conn) do
    with [timestamp_str] <- get_req_header(conn, "x-request-timestamp"),
         [nonce] <- get_req_header(conn, "x-request-nonce"),
         :ok <- validate_nonce_format(nonce),
         {:ok, timestamp} <- parse_timestamp(timestamp_str),
         :ok <- check_age(timestamp),
         :ok <- check_nonce_unique(nonce) do
      conn
    else
      _ ->
        conn
        |> put_status(400)
        |> Phoenix.Controller.json(%{
          error: "replay_rejected",
          detail: "Request rejected: missing, expired, or replayed request credentials"
        })
        |> halt()
    end
  end

  defp validate_nonce_format(nonce) when byte_size(nonce) >= @min_nonce_length, do: :ok
  defp validate_nonce_format(_), do: :error

  defp parse_timestamp(str) do
    case Integer.parse(str) do
      {ts, ""} -> {:ok, ts}
      _ -> :error
    end
  end

  defp check_age(timestamp) do
    now = System.system_time(:second)

    if abs(now - timestamp) <= @max_age_seconds do
      :ok
    else
      :error
    end
  end

  defp check_nonce_unique(nonce) do
    key = "replay_nonce:#{nonce}"

    case Redix.command(:redix, ["SET", key, "1", "NX", "EX", to_string(@nonce_ttl_seconds)]) do
      {:ok, "OK"} -> :ok
      {:ok, nil} -> :error
      {:error, _} -> :ok
    end
  end
end
