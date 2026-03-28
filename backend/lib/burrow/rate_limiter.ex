defmodule Burrow.RateLimiter do
  @moduledoc """
  Three-layer rate limiting using Redis sliding window counters.

  ## Layers

  1. **IP** — token bucket at the proxy layer (not enforced here).
     We implement a simple counter per IP for auth/creation endpoints.
  2. **User** — sliding window per authenticated user, trust-tier-adjusted.
  3. **Server** — aggregate per server to prevent a single server from
     overwhelming the system.

  All counters use Redis sorted sets with timestamp-based sliding windows.
  """

  @redis :redix

  # ---------------------------------------------------------------------------
  # User rate limits per tier (messages per minute)
  # ---------------------------------------------------------------------------

  @user_msg_limits %{0 => 5, 1 => 15, 2 => 30, 3 => 60, 4 => 120, 5 => 240}

  # API calls per minute per tier
  @user_api_limits %{0 => 20, 1 => 60, 2 => 120, 3 => 200, 4 => 300, 5 => 500}

  # Server aggregate: messages per minute
  @server_msg_limit 500

  # IP limits
  @ip_general_limit 100       # per second
  @ip_auth_limit 10           # per second
  @ip_creation_limit 3        # per second

  # Graduated penalty escalation windows (seconds)
  # 1st hit: just 429, 2nd: 30s cooldown, 3rd+: 5m cooldown

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @doc """
  Check user message rate limit. Returns:
  - `{:ok, remaining, reset_at}` — allowed
  - `{:error, retry_after, limit}` — rate limited
  """
  def check_user_message(user_id, trust_tier) do
    limit = Map.get(@user_msg_limits, trust_tier, 5)
    key = "rl:user:msg:#{user_id}"
    check_sliding_window(key, limit, 60)
  end

  @doc "Check user API call rate limit."
  def check_user_api(user_id, trust_tier) do
    limit = Map.get(@user_api_limits, trust_tier, 20)
    key = "rl:user:api:#{user_id}"
    check_sliding_window(key, limit, 60)
  end

  @doc "Check server message rate limit (aggregate)."
  def check_server_message(server_id) do
    key = "rl:server:msg:#{server_id}"
    check_sliding_window(key, @server_msg_limit, 60)
  end

  @doc "Check IP rate limit for general requests."
  def check_ip(ip_string) do
    key = "rl:ip:gen:#{ip_string}"
    check_sliding_window(key, @ip_general_limit, 1)
  end

  @doc "Check IP rate limit for auth endpoints."
  def check_ip_auth(ip_string) do
    key = "rl:ip:auth:#{ip_string}"
    check_sliding_window(key, @ip_auth_limit, 1)
  end

  @doc "Check IP rate limit for account creation."
  def check_ip_creation(ip_string) do
    key = "rl:ip:create:#{ip_string}"
    check_sliding_window(key, @ip_creation_limit, 1)
  end

  @doc """
  Track and check graduated penalty escalation.
  Returns the penalty tier (1, 2, 3+) for the user.
  """
  def penalty_tier(user_id) do
    key = "rl:penalty:#{user_id}"
    case Redix.command(@redis, ["GET", key]) do
      {:ok, nil} -> 0
      {:ok, count} -> String.to_integer(count)
    end
  end

  @doc "Increment the penalty counter for a user (called on each 429)."
  def increment_penalty(user_id) do
    key = "rl:penalty:#{user_id}"
    Redix.pipeline(@redis, [
      ["INCR", key],
      ["EXPIRE", key, "600"]  # Reset penalties after 10 minutes of good behavior
    ])
  end

  @doc "Get the cooldown seconds for a given penalty count."
  def penalty_cooldown(count) when count <= 1, do: 0
  def penalty_cooldown(2), do: 30
  def penalty_cooldown(_), do: 300

  @doc """
  Get current rate limit info without consuming a request.
  Returns `{remaining, limit, reset_at}`.
  """
  def get_info(key, limit, window_seconds) do
    now = System.system_time(:millisecond)
    window_start = now - (window_seconds * 1000)
    reset_at = div(now, window_seconds * 1000) * window_seconds + window_seconds

    case Redix.command(@redis, ["ZCOUNT", key, window_start, "+inf"]) do
      {:ok, count} ->
        remaining = max(limit - count, 0)
        {remaining, limit, reset_at}
    end
  end

  # ---------------------------------------------------------------------------
  # Sliding window implementation
  # ---------------------------------------------------------------------------

  defp check_sliding_window(key, limit, window_seconds) do
    now = System.system_time(:millisecond)
    window_start = now - (window_seconds * 1000)
    member = "#{now}:#{:rand.uniform(1_000_000)}"
    reset_at = div(now, 1000) + window_seconds

    # Atomic pipeline: remove expired entries, count current, add new if under limit
    {:ok, [_, count, _, _]} =
      Redix.pipeline(@redis, [
        ["ZREMRANGEBYSCORE", key, "-inf", window_start],
        ["ZCARD", key],
        ["ZADD", key, now, member],
        ["EXPIRE", key, window_seconds * 2]
      ])

    if count < limit do
      {:ok, limit - count - 1, reset_at}
    else
      # Over limit — remove the entry we just added
      Redix.command(@redis, ["ZREM", key, member])
      # Calculate retry_after from the oldest entry in the window
      case Redix.command(@redis, ["ZRANGE", key, 0, 0, "WITHSCORES"]) do
        {:ok, [_, oldest_score]} ->
          oldest_ts = parse_score(oldest_score)
          retry_after = max(div(oldest_ts + window_seconds * 1000 - now, 1000), 1)
          {:error, retry_after, limit}

        _ ->
          {:error, window_seconds, limit}
      end
    end
  end

  defp parse_score(score) when is_binary(score) do
    case Integer.parse(score) do
      {n, ""} -> n
      _ -> trunc(String.to_float(score))
    end
  end
end
