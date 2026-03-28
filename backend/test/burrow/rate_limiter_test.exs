defmodule Burrow.RateLimiterTest do
  use ExUnit.Case, async: false

  alias Burrow.RateLimiter

  setup do
    # Clean all rate limit keys before each test
    {:ok, keys} = Redix.command(:redix, ["KEYS", "rl:*"])
    if keys != [] do
      Redix.command(:redix, ["DEL" | keys])
    end
    :ok
  end

  describe "check_user_message/2" do
    test "allows requests under the limit" do
      assert {:ok, _remaining, _reset} = RateLimiter.check_user_message(1, 0)
    end

    test "tier 0 allows 5 messages per minute" do
      for _ <- 1..5 do
        assert {:ok, _, _} = RateLimiter.check_user_message(100, 0)
      end

      assert {:error, retry_after, 5} = RateLimiter.check_user_message(100, 0)
      assert retry_after > 0
    end

    test "tier 4 allows 120 messages per minute" do
      for _ <- 1..120 do
        assert {:ok, _, _} = RateLimiter.check_user_message(200, 4)
      end

      assert {:error, _, 120} = RateLimiter.check_user_message(200, 4)
    end

    test "different users have independent limits" do
      for _ <- 1..5 do
        assert {:ok, _, _} = RateLimiter.check_user_message(300, 0)
      end

      assert {:error, _, _} = RateLimiter.check_user_message(300, 0)
      assert {:ok, _, _} = RateLimiter.check_user_message(301, 0)
    end
  end

  describe "check_user_api/2" do
    test "tier 0 allows 20 API calls per minute" do
      for _ <- 1..20 do
        assert {:ok, _, _} = RateLimiter.check_user_api(400, 0)
      end

      assert {:error, _, 20} = RateLimiter.check_user_api(400, 0)
    end
  end

  describe "check_server_message/1" do
    test "allows up to 500 messages per minute per server" do
      # Just test a few to confirm it works, not all 500
      for _ <- 1..10 do
        assert {:ok, _, _} = RateLimiter.check_server_message(500)
      end
    end
  end

  describe "check_ip_auth/1" do
    test "allows 10 req/s for auth endpoints" do
      for _ <- 1..10 do
        assert {:ok, _, _} = RateLimiter.check_ip_auth("10.0.0.1")
      end

      assert {:error, _, 10} = RateLimiter.check_ip_auth("10.0.0.1")
    end
  end

  describe "check_ip_creation/1" do
    test "allows 3 req/s for account creation" do
      for _ <- 1..3 do
        assert {:ok, _, _} = RateLimiter.check_ip_creation("10.0.0.2")
      end

      assert {:error, _, 3} = RateLimiter.check_ip_creation("10.0.0.2")
    end
  end

  describe "graduated penalties" do
    test "starts at 0 penalty" do
      assert RateLimiter.penalty_tier(900) == 0
    end

    test "increments penalty counter" do
      RateLimiter.increment_penalty(901)
      assert RateLimiter.penalty_tier(901) == 1

      RateLimiter.increment_penalty(901)
      assert RateLimiter.penalty_tier(901) == 2
    end

    test "penalty_cooldown returns escalating values" do
      assert RateLimiter.penalty_cooldown(0) == 0
      assert RateLimiter.penalty_cooldown(1) == 0
      assert RateLimiter.penalty_cooldown(2) == 30
      assert RateLimiter.penalty_cooldown(3) == 300
      assert RateLimiter.penalty_cooldown(10) == 300
    end
  end
end
