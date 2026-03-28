defmodule BurrowWeb.RateLimitPlug do
  @moduledoc """
  Plug that enforces per-user API rate limits using Redis sliding windows.

  Adds `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`
  headers to every response. Returns 429 with `Retry-After` when the limit
  is exceeded.

  This plug runs **after** AuthPlug so it has access to `current_user_id`
  and `current_trust_tier`. Unauthenticated requests are passed through
  (they should be rate limited by IP at the endpoint level instead).
  """

  import Plug.Conn
  alias Burrow.RateLimiter

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user_id] do
      nil ->
        # Not authenticated — skip user-level limiting
        conn

      user_id ->
        tier = conn.assigns[:current_trust_tier] || 0

        case RateLimiter.check_user_api(user_id, tier) do
          {:ok, remaining, reset_at} ->
            conn
            |> put_rate_limit_headers(user_api_limit(tier), remaining, reset_at)

          {:error, retry_after, limit} ->
            RateLimiter.increment_penalty(user_id)
            penalty = RateLimiter.penalty_tier(user_id)
            effective_retry = max(retry_after, RateLimiter.penalty_cooldown(penalty))

            conn
            |> put_resp_header("retry-after", Integer.to_string(effective_retry))
            |> put_rate_limit_headers(limit, 0, 0)
            |> put_status(429)
            |> Phoenix.Controller.json(%{
              error: "rate_limited",
              detail: "Too many requests. Please wait before trying again.",
              retry_after: effective_retry
            })
            |> halt()
        end
    end
  end

  defp user_api_limit(tier) do
    %{0 => 20, 1 => 60, 2 => 120, 3 => 200, 4 => 300, 5 => 500}
    |> Map.get(tier, 20)
  end

  defp put_rate_limit_headers(conn, limit, remaining, reset_at) do
    conn
    |> put_resp_header("x-ratelimit-limit", Integer.to_string(limit))
    |> put_resp_header("x-ratelimit-remaining", Integer.to_string(remaining))
    |> put_resp_header("x-ratelimit-reset", Integer.to_string(reset_at))
  end
end
