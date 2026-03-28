defmodule BurrowWeb.AuthControllerTest do
  use BurrowWeb.ConnCase

  alias Burrow.Repo
  alias Burrow.Snowflake
  alias Burrow.Auth.{User, AuthChallenge}

  # PoW difficulty is "0000" in config — we mine a valid nonce for tests
  @pow_difficulty Application.compile_env(:burrow, :pow_difficulty, "000000")

  setup %{conn: conn} do
    # Flush rate-limit keys so tests don't interfere with each other
    Redix.command!(:redix, ["KEYS", "rl:*"]) |> Enum.each(fn k -> Redix.command!(:redix, ["DEL", k]) end)
    {:ok, conn: put_req_header(conn, "content-type", "application/json")}
  end

  # ---------------------------------------------------------------------------
  # POST /api/v1/auth/register
  # ---------------------------------------------------------------------------

  describe "POST /api/v1/auth/register" do
    test "registers a new user with valid PoW", %{conn: conn} do
      {pub_hex, _priv} = generate_ed25519_keypair()
      nonce = mine_pow(pub_hex)

      conn =
        post(conn, "/api/v1/auth/register", %{
          "public_key" => pub_hex,
          "nonce" => nonce,
          "username" => "alice",
          "device_fingerprint_hash" => "abc123",
          "age_verified" => true,
          "tos_accepted" => true
        })

      assert %{
               "user" => %{"id" => _, "username" => "alice", "trust_tier" => _},
               "device_key_id" => _,
               "session_token" => token
             } = json_response(conn, 201)

      assert is_binary(token)
      assert String.length(token) == 64
    end

    test "rejects invalid PoW nonce", %{conn: conn} do
      {pub_hex, _priv} = generate_ed25519_keypair()

      conn =
        post(conn, "/api/v1/auth/register", %{
          "public_key" => pub_hex,
          "nonce" => "definitely_wrong",
          "username" => "alice",
          "device_fingerprint_hash" => "abc123",
          "age_verified" => true,
          "tos_accepted" => true
        })

      assert %{"error" => "invalid_pow"} = json_response(conn, 422)
    end

    test "rejects duplicate public key", %{conn: conn} do
      {pub_hex, _priv} = generate_ed25519_keypair()
      nonce = mine_pow(pub_hex)

      # Register once
      post(conn, "/api/v1/auth/register", %{
        "public_key" => pub_hex,
        "nonce" => nonce,
        "username" => "alice",
        "device_fingerprint_hash" => "abc123",
        "age_verified" => true,
        "tos_accepted" => true
      })

      # Flush rate limits before second attempt
      flush_rate_limits()

      # Attempt duplicate
      conn2 =
        post(fresh_conn(),
          "/api/v1/auth/register",
          %{
            "public_key" => pub_hex,
            "nonce" => nonce,
            "username" => "alice2",
            "device_fingerprint_hash" => "abc123",
            "age_verified" => true,
            "tos_accepted" => true
          }
        )

      assert %{"error" => "key_already_registered"} = json_response(conn2, 409)
    end

    test "rejects duplicate username", %{conn: conn} do
      {pub1, _} = generate_ed25519_keypair()
      nonce1 = mine_pow(pub1)

      post(conn, "/api/v1/auth/register", %{
        "public_key" => pub1,
        "nonce" => nonce1,
        "username" => "alice",
        "device_fingerprint_hash" => "abc123",
        "age_verified" => true,
        "tos_accepted" => true
      })

      {pub2, _} = generate_ed25519_keypair()
      nonce2 = mine_pow(pub2)

      # Flush rate limits before second registration
      flush_rate_limits()

      conn2 =
        post(fresh_conn(),
          "/api/v1/auth/register",
          %{
            "public_key" => pub2,
            "nonce" => nonce2,
            "username" => "alice",
            "device_fingerprint_hash" => "def456",
            "age_verified" => true,
            "tos_accepted" => true
          }
        )

      assert json_response(conn2, 422)
    end

    test "rejects missing fields", %{conn: conn} do
      conn = post(conn, "/api/v1/auth/register", %{})
      assert json_response(conn, 400)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/v1/auth/challenge
  # ---------------------------------------------------------------------------

  describe "POST /api/v1/auth/challenge" do
    test "returns a challenge for existing user", %{conn: conn} do
      {pub_hex, _priv} = generate_ed25519_keypair()
      register_user(conn, pub_hex, "alice")

      conn2 =
        post(fresh_conn(),
          "/api/v1/auth/challenge",
          %{"username" => "alice"}
        )

      assert %{
               "challenge_id" => _,
               "nonce" => nonce,
               "expires_at" => _
             } = json_response(conn2, 200)

      assert is_binary(nonce)
      assert String.length(nonce) == 64
    end

    test "returns a fake challenge for non-existent user (timing-safe)", %{conn: conn} do
      conn =
        post(conn, "/api/v1/auth/challenge", %{"username" => "nobody"})

      # Should still return 200 with same shape
      assert %{
               "challenge_id" => _,
               "nonce" => nonce,
               "expires_at" => _
             } = json_response(conn, 200)

      assert is_binary(nonce)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/v1/auth/verify
  # ---------------------------------------------------------------------------

  describe "POST /api/v1/auth/verify" do
    test "completes login with valid signature", %{conn: conn} do
      {pub_hex, priv} = generate_ed25519_keypair()
      register_user(conn, pub_hex, "alice")

      # Create challenge
      challenge_conn =
        post(fresh_conn(),
          "/api/v1/auth/challenge",
          %{"username" => "alice"}
        )

      %{"challenge_id" => challenge_id, "nonce" => nonce_hex} = json_response(challenge_conn, 200)

      # Sign the nonce
      nonce_bytes = Base.decode16!(nonce_hex, case: :mixed)
      signature = :crypto.sign(:eddsa, :none, nonce_bytes, [priv, :ed25519])
      sig_hex = Base.encode16(signature, case: :lower)

      verify_conn =
        post(fresh_conn(),
          "/api/v1/auth/verify",
          %{
            "challenge_id" => challenge_id,
            "signature" => sig_hex,
            "public_key" => pub_hex
          }
        )

      assert %{
               "session_token" => token,
               "user" => %{"id" => _, "username" => "alice"}
             } = json_response(verify_conn, 200)

      assert is_binary(token)
    end

    test "rejects invalid signature", %{conn: conn} do
      {pub_hex, _priv} = generate_ed25519_keypair()
      register_user(conn, pub_hex, "alice")

      challenge_conn =
        post(fresh_conn(),
          "/api/v1/auth/challenge",
          %{"username" => "alice"}
        )

      %{"challenge_id" => challenge_id} = json_response(challenge_conn, 200)

      # Use garbage signature
      bad_sig = String.duplicate("ab", 64)

      verify_conn =
        post(fresh_conn(),
          "/api/v1/auth/verify",
          %{
            "challenge_id" => challenge_id,
            "signature" => bad_sig,
            "public_key" => pub_hex
          }
        )

      assert %{"error" => "auth_failed"} = json_response(verify_conn, 401)
    end

    test "rejects expired challenge", %{conn: conn} do
      {pub_hex, priv} = generate_ed25519_keypair()
      register_user(conn, pub_hex, "alice")

      # Manually create an expired challenge
      user = Repo.get_by!(User, username: "alice")
      nonce = :crypto.strong_rand_bytes(32)

      {:ok, challenge} =
        %AuthChallenge{}
        |> AuthChallenge.changeset(%{
          id: Snowflake.next_id(),
          user_id: user.id,
          nonce: nonce,
          expires_at: DateTime.add(DateTime.utc_now(), -120, :second)
        })
        |> Repo.insert()

      signature = :crypto.sign(:eddsa, :none, nonce, [priv, :ed25519])

      verify_conn =
        post(fresh_conn(),
          "/api/v1/auth/verify",
          %{
            "challenge_id" => to_string(challenge.id),
            "signature" => Base.encode16(signature, case: :lower),
            "public_key" => pub_hex
          }
        )

      assert %{"error" => "auth_failed"} = json_response(verify_conn, 401)
    end

    test "rejects already-used challenge", %{conn: conn} do
      {pub_hex, priv} = generate_ed25519_keypair()
      register_user(conn, pub_hex, "alice")

      # Create and use a challenge
      challenge_conn =
        post(fresh_conn(),
          "/api/v1/auth/challenge",
          %{"username" => "alice"}
        )

      %{"challenge_id" => challenge_id, "nonce" => nonce_hex} = json_response(challenge_conn, 200)
      nonce_bytes = Base.decode16!(nonce_hex, case: :mixed)
      signature = :crypto.sign(:eddsa, :none, nonce_bytes, [priv, :ed25519])
      sig_hex = Base.encode16(signature, case: :lower)

      # First verify succeeds
      post(fresh_conn(),
        "/api/v1/auth/verify",
        %{
          "challenge_id" => challenge_id,
          "signature" => sig_hex,
          "public_key" => pub_hex
        }
      )

      # Second verify with same challenge fails
      verify_conn2 =
        post(fresh_conn(),
          "/api/v1/auth/verify",
          %{
            "challenge_id" => challenge_id,
            "signature" => sig_hex,
            "public_key" => pub_hex
          }
        )

      assert %{"error" => "auth_failed"} = json_response(verify_conn2, 401)
    end

    test "rejects wrong public key for user", %{conn: conn} do
      {pub_hex, _priv} = generate_ed25519_keypair()
      register_user(conn, pub_hex, "alice")

      # Create a challenge for alice
      challenge_conn =
        post(fresh_conn(),
          "/api/v1/auth/challenge",
          %{"username" => "alice"}
        )

      %{"challenge_id" => challenge_id, "nonce" => nonce_hex} = json_response(challenge_conn, 200)
      nonce_bytes = Base.decode16!(nonce_hex, case: :mixed)

      # Sign with a different key
      {other_pub_hex, other_priv} = generate_ed25519_keypair()
      signature = :crypto.sign(:eddsa, :none, nonce_bytes, [other_priv, :ed25519])

      verify_conn =
        post(fresh_conn(),
          "/api/v1/auth/verify",
          %{
            "challenge_id" => challenge_id,
            "signature" => Base.encode16(signature, case: :lower),
            "public_key" => other_pub_hex
          }
        )

      assert %{"error" => "auth_failed"} = json_response(verify_conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/v1/auth/sessions (authenticated)
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/auth/sessions" do
    test "lists active sessions for authenticated user", %{conn: conn} do
      {token, _user} = register_and_get_token(conn, "alice")

      sessions_conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer #{token}")
        |> get("/api/v1/auth/sessions")

      assert %{"sessions" => sessions} = json_response(sessions_conn, 200)
      assert is_list(sessions)
      assert length(sessions) >= 1
    end

    test "returns 401 without auth token", %{conn: conn} do
      conn = get(conn, "/api/v1/auth/sessions")
      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /api/v1/auth/sessions/:id (authenticated)
  # ---------------------------------------------------------------------------

  describe "DELETE /api/v1/auth/sessions/:id" do
    test "revokes a specific session", %{conn: conn} do
      {token, _user} = register_and_get_token(conn, "alice")

      # List sessions to get the session id
      sessions_conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer #{token}")
        |> get("/api/v1/auth/sessions")

      %{"sessions" => [session | _]} = json_response(sessions_conn, 200)

      # Revoke it
      revoke_conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer #{token}")
        |> delete("/api/v1/auth/sessions/#{session["id"]}")

      assert %{"status" => "revoked"} = json_response(revoke_conn, 200)
    end

    test "returns error for non-existent session", %{conn: conn} do
      {token, _user} = register_and_get_token(conn, "alice")

      revoke_conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer #{token}")
        |> delete("/api/v1/auth/sessions/999999999999999")

      assert json_response(revoke_conn, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /api/v1/auth/sessions (revoke all others, authenticated)
  # ---------------------------------------------------------------------------

  describe "DELETE /api/v1/auth/sessions (revoke others)" do
    test "revokes all other sessions, keeps current", %{conn: conn} do
      {pub_hex, priv} = generate_ed25519_keypair()
      register_user(conn, pub_hex, "alice")

      # Login twice to create two sessions
      _token1 = login_user(pub_hex, priv, "alice")
      token2 = login_user(pub_hex, priv, "alice")

      # Revoke others using token2
      revoke_conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer #{token2}")
        |> delete("/api/v1/auth/sessions")

      assert %{"revoked_count" => count} = json_response(revoke_conn, 200)
      # At least the registration session + token1 session should be revoked
      assert count >= 1

      # token2 should still work
      check_conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer #{token2}")
        |> get("/api/v1/auth/sessions")

      assert json_response(check_conn, 200)
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp flush_rate_limits do
    Redix.command!(:redix, ["KEYS", "rl:*"]) |> Enum.each(fn k -> Redix.command!(:redix, ["DEL", k]) end)
  end

  defp fresh_conn do
    flush_rate_limits()
    build_conn() |> put_req_header("content-type", "application/json")
  end

  defp generate_ed25519_keypair do
    {pub, priv} = :crypto.generate_key(:eddsa, :ed25519)
    pub_hex = Base.encode16(pub, case: :lower)
    {pub_hex, priv}
  end

  defp mine_pow(pub_hex) do
    pub_bytes = Base.decode16!(pub_hex, case: :mixed)
    do_mine(pub_bytes, 0)
  end

  defp do_mine(pub_bytes, nonce) do
    nonce_str = Integer.to_string(nonce)
    hash = :crypto.hash(:sha256, pub_bytes <> nonce_str) |> Base.encode16(case: :lower)

    if String.starts_with?(hash, @pow_difficulty) do
      nonce_str
    else
      do_mine(pub_bytes, nonce + 1)
    end
  end

  defp register_user(conn, pub_hex, username) do
    nonce = mine_pow(pub_hex)

    post(conn, "/api/v1/auth/register", %{
      "public_key" => pub_hex,
      "nonce" => nonce,
      "username" => username,
      "device_fingerprint_hash" => "test_fp_#{username}",
      "age_verified" => true,
      "tos_accepted" => true
    })
  end

  defp register_and_get_token(conn, username) do
    {pub_hex, _priv} = generate_ed25519_keypair()
    register_conn = register_user(conn, pub_hex, username)
    %{"session_token" => token, "user" => user} = json_response(register_conn, 201)
    {token, user}
  end

  defp login_user(pub_hex, priv, username) do
    Redix.command!(:redix, ["KEYS", "rl:*"]) |> Enum.each(fn k -> Redix.command!(:redix, ["DEL", k]) end)

    challenge_conn =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post("/api/v1/auth/challenge", %{"username" => username})

    %{"challenge_id" => challenge_id, "nonce" => nonce_hex} = json_response(challenge_conn, 200)

    nonce_bytes = Base.decode16!(nonce_hex, case: :mixed)
    signature = :crypto.sign(:eddsa, :none, nonce_bytes, [priv, :ed25519])

    verify_conn =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post("/api/v1/auth/verify", %{
        "challenge_id" => challenge_id,
        "signature" => Base.encode16(signature, case: :lower),
        "public_key" => pub_hex
      })

    %{"session_token" => token} = json_response(verify_conn, 200)
    token
  end
end
