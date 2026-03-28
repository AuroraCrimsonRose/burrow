defmodule Burrow.Auth do
  @moduledoc """
  Authentication context for device-bound identity.

  Handles account registration (with PoW verification), challenge-response
  authentication, session management, and device key lifecycle.
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Snowflake
  alias Burrow.Auth.{User, DeviceKey, PowRecord, UserSession, AuthChallenge, RecoveryKey, Mnemonic, WebAuthnCredential, WebAuthn, PairingToken}

  @challenge_ttl_seconds 60
  @webauthn_challenge_ttl_seconds 120
  @session_token_bytes 32
  @pairing_ttl_seconds 300

  defp pow_difficulty, do: Application.get_env(:burrow, :pow_difficulty, "0000")

  # ---------------------------------------------------------------------------
  # Registration
  # ---------------------------------------------------------------------------

  @doc """
  Register a new user with device-bound identity.

  Expects:
    - `public_key`  — 32-byte Ed25519 public key (raw binary)
    - `nonce`       — PoW nonce (string) such that SHA-256(public_key <> nonce)
                      starts with the required difficulty prefix
    - `username`    — desired unique username
    - `device_fingerprint_hash` — SHA-256 hash of device fingerprint components
    - `device_label` — optional human-readable device name

  Returns `{:ok, %{user, device_key, session_token}}` or `{:error, reason}`.
  """
  def register(attrs) do
    public_key = Map.fetch!(attrs, :public_key)
    nonce = Map.fetch!(attrs, :nonce)
    username = Map.fetch!(attrs, :username)
    device_fp = Map.fetch!(attrs, :device_fingerprint_hash)
    device_label = Map.get(attrs, :device_label)

    with :ok <- verify_pow(public_key, nonce),
         :ok <- check_key_not_registered(public_key) do
      now = DateTime.utc_now()

      Repo.transaction(fn ->
        user_id = Snowflake.next_id()
        device_key_id = Snowflake.next_id()

        user =
          case %User{}
               |> User.registration_changeset(%{
                 id: user_id,
                 username: username,
                 age_verified: Map.get(attrs, :age_verified, false),
                 age_verified_at: if(Map.get(attrs, :age_verified), do: now),
                 tos_accepted_version: Map.get(attrs, :tos_accepted_version),
                 tos_accepted_at: if(Map.get(attrs, :tos_accepted_version), do: now)
               })
               |> Repo.insert() do
            {:ok, user} -> user
            {:error, changeset} -> Repo.rollback(changeset)
          end

        device_key =
          %DeviceKey{}
          |> DeviceKey.changeset(%{
            id: device_key_id,
            user_id: user.id,
            public_key_ed25519: public_key,
            device_fingerprint_hash: device_fp,
            device_label: device_label
          })
          |> Repo.insert!()

        pow_hash = compute_pow_hash(public_key, nonce)

        %PowRecord{}
        |> PowRecord.changeset(%{
          id: Snowflake.next_id(),
          user_id: user.id,
          public_key: public_key,
          nonce: nonce,
          hash_result: pow_hash,
          difficulty_prefix: pow_difficulty(),
          verified_at: now
        })
        |> Repo.insert!()

        {session_token, session} = create_session(user.id, device_key_id, attrs)

        %{user: user, device_key: device_key, session_token: session_token, session: session}
      end)
    end
  end

  # ---------------------------------------------------------------------------
  # Challenge-Response Authentication
  # ---------------------------------------------------------------------------

  @doc """
  Issue an authentication challenge for the given user.

  Returns `{:ok, nonce_hex}` where `nonce_hex` is a 32-byte random nonce
  encoded as hex. The client must sign this nonce with their device private key.
  Challenge expires in #{@challenge_ttl_seconds} seconds.
  """
  def create_challenge(username) do
    case Repo.get_by(User, username: username) do
      nil ->
        {:error, :user_not_found}

      user ->
        nonce = :crypto.strong_rand_bytes(32)
        expires_at = DateTime.add(DateTime.utc_now(), @challenge_ttl_seconds, :second)

        {:ok, challenge} =
          %AuthChallenge{}
          |> AuthChallenge.changeset(%{
            id: Snowflake.next_id(),
            user_id: user.id,
            nonce: nonce,
            expires_at: expires_at
          })
          |> Repo.insert()

        {:ok, %{challenge_id: challenge.id, nonce: Base.encode16(nonce, case: :lower), expires_at: expires_at}}
    end
  end

  @doc """
  Verify a signed challenge and create a session.

  Expects:
    - `challenge_id` — the challenge ID returned by `create_challenge/1`
    - `signature`    — Ed25519 signature of the nonce (64 bytes, raw binary)
    - `public_key`   — the device's Ed25519 public key (32 bytes, raw binary)
    - `device_info`  — optional map with :device_type, :os, :browser, :ip etc.

  Returns `{:ok, %{session_token, user}}` or `{:error, reason}`.
  """
  def verify_challenge(attrs) do
    challenge_id = Map.fetch!(attrs, :challenge_id)
    signature = Map.fetch!(attrs, :signature)
    public_key = Map.fetch!(attrs, :public_key)

    with {:ok, challenge} <- fetch_valid_challenge(challenge_id),
         {:ok, device_key} <- fetch_device_key(challenge.user_id, public_key),
         :ok <- verify_signature(challenge.nonce, signature, public_key) do
      now = DateTime.utc_now()

      # Mark challenge as used
      {:ok, _} =
        challenge
        |> Ecto.Changeset.change(%{used: true})
        |> Repo.update()

      # Update device key last_used_at
      {:ok, _} =
        device_key
        |> Ecto.Changeset.change(%{last_used_at: now})
        |> Repo.update()

      user = Repo.get!(User, challenge.user_id)
      {session_token, session} = create_session(user.id, device_key.id, attrs)

      {:ok, %{session_token: session_token, user: user, session: session}}
    end
  end

  # ---------------------------------------------------------------------------
  # Session Management
  # ---------------------------------------------------------------------------

  @doc "List all active (non-revoked) sessions for a user."
  def list_sessions(user_id) do
    UserSession
    |> where([s], s.user_id == ^user_id and is_nil(s.revoked_at))
    |> order_by([s], [desc: s.last_active])
    |> Repo.all()
  end

  @doc "Revoke a specific session."
  def revoke_session(session_id, user_id) do
    case Repo.get_by(UserSession, id: session_id, user_id: user_id) do
      nil ->
        {:error, :not_found}

      session ->
        session
        |> Ecto.Changeset.change(%{revoked_at: DateTime.utc_now()})
        |> Repo.update()
    end
  end

  @doc "Revoke all sessions for a user except the given session ID."
  def revoke_other_sessions(user_id, keep_session_id) do
    {count, _} =
      UserSession
      |> where([s], s.user_id == ^user_id and s.id != ^keep_session_id and is_nil(s.revoked_at))
      |> Repo.update_all(set: [revoked_at: DateTime.utc_now()])

    {:ok, count}
  end

  @doc "Change a user's username (subject to 72h cooldown)."
  def change_username(user_id, new_username) do
    user = Repo.get!(User, user_id)

    user
    |> User.username_changeset(%{username: new_username})
    |> Repo.update()
  end

  @doc "Update a user's avatar URL."
  def update_avatar(user_id, avatar_url) do
    user = Repo.get!(User, user_id)

    user
    |> User.avatar_changeset(%{avatar_url: avatar_url})
    |> Repo.update()
  end

  @doc "Update a user's profile (bio, pronouns, banner, display name)."
  def update_profile(user_id, attrs) do
    user = Repo.get!(User, user_id)

    user
    |> User.profile_changeset(attrs)
    |> Repo.update()
  end

  @doc "Get a user by ID."
  def get_user(user_id) do
    Repo.get(User, user_id)
  end

  @doc "Accept updated Terms of Service and/or Privacy Policy."
  def accept_terms(user_id, updates) when is_map(updates) do
    user = Repo.get!(User, user_id)

    user
    |> User.terms_changeset(updates)
    |> Repo.update()
  end

  @doc "Verify NSFW age gate (18+)."
  def verify_nsfw_age(user_id) do
    user = Repo.get!(User, user_id)

    user
    |> User.nsfw_age_changeset(%{
      nsfw_age_verified: true,
      nsfw_age_verified_at: DateTime.utc_now()
    })
    |> Repo.update()
  end

  @doc "Look up a session by its raw token (hex-encoded). Returns the session with preloaded user if valid."
  def get_session_by_token(token_hex) when is_binary(token_hex) do
    with {:ok, raw_token} <- Base.decode16(token_hex, case: :mixed) do
      token_hash = hash_session_token(raw_token)

      UserSession
      |> where([s], s.token_hash == ^token_hash and is_nil(s.revoked_at))
      |> preload(:user)
      |> Repo.one()
    else
      _ -> nil
    end
  end

  @doc "Touch a session's last_active timestamp (throttled to once per 5 minutes)."
  @touch_interval_ms 5 * 60 * 1000
  def touch_session(%UserSession{} = session) do
    now_ms = System.monotonic_time(:millisecond)

    should_touch =
      try do
        case :ets.lookup(:session_touch, session.id) do
          [{_, last_ts}] -> now_ms - last_ts >= @touch_interval_ms
          [] -> true
        end
      rescue
        ArgumentError -> true
      end

    if should_touch do
      try do
        :ets.insert(:session_touch, {session.id, now_ms})
      rescue
        ArgumentError -> :ok
      end

      session
      |> Ecto.Changeset.change(%{last_active: DateTime.utc_now()})
      |> Repo.update()
    else
      {:ok, session}
    end
  end

  # ---------------------------------------------------------------------------
  # Recovery Keys
  # ---------------------------------------------------------------------------

  @doc """
  Generate a recovery key for a user. Returns the mnemonic phrase (shown once)
  and creates a hashed record in the database.
  """
  def generate_recovery_key(user_id) do
    # Invalidate any existing active recovery key
    RecoveryKey
    |> where([r], r.user_id == ^user_id and is_nil(r.invalidated_at))
    |> Repo.update_all(set: [invalidated_at: DateTime.utc_now()])

    {mnemonic, hash} = Mnemonic.generate()

    {:ok, record} =
      %RecoveryKey{}
      |> RecoveryKey.changeset(%{
        id: Snowflake.next_id(),
        user_id: user_id,
        recovery_key_hash: hash
      })
      |> Repo.insert()

    {:ok, %{mnemonic: mnemonic, recovery_key_id: record.id}}
  end

  @doc """
  Confirm that the user has saved their recovery key by verifying
  specific words from the mnemonic.
  """
  def confirm_recovery_key(user_id, mnemonic) do
    case get_active_recovery_key(user_id) do
      nil ->
        {:error, :no_recovery_key}

      %RecoveryKey{confirmation_completed: true} ->
        {:error, :already_confirmed}

      %RecoveryKey{} = key ->
        if Mnemonic.verify(mnemonic, key.recovery_key_hash) do
          key
          |> Ecto.Changeset.change(%{confirmation_completed: true})
          |> Repo.update()
        else
          {:error, :invalid_mnemonic}
        end
    end
  end

  @doc "Check if user has a confirmed recovery key."
  def has_confirmed_recovery_key?(user_id) do
    RecoveryKey
    |> where([r], r.user_id == ^user_id and r.confirmation_completed == true and is_nil(r.invalidated_at))
    |> Repo.exists?()
  end

  @doc """
  Recover an account using the mnemonic phrase.

  Verifies the mnemonic, registers a new device key, and creates a session.
  Requires a confirmed recovery key.
  """
  def recover_account(attrs) do
    username = Map.fetch!(attrs, :username)
    mnemonic = Map.fetch!(attrs, :mnemonic)
    public_key = Map.fetch!(attrs, :public_key)
    device_fp = Map.fetch!(attrs, :device_fingerprint_hash)
    device_label = Map.get(attrs, :device_label)

    with {:ok, user} <- fetch_user_by_username(username),
         {:ok, key} <- fetch_confirmed_recovery_key(user.id),
         true <- Mnemonic.verify(mnemonic, key.recovery_key_hash) do
      now = DateTime.utc_now()

      Repo.transaction(fn ->
        # Register the new device key
        device_key =
          %DeviceKey{}
          |> DeviceKey.changeset(%{
            id: Snowflake.next_id(),
            user_id: user.id,
            public_key_ed25519: public_key,
            device_fingerprint_hash: device_fp,
            device_label: device_label
          })
          |> Repo.insert!()

        # Mark recovery key as used
        key
        |> Ecto.Changeset.change(%{last_used_at: now})
        |> Repo.update!()

        {session_token, session} = create_session(user.id, device_key.id, attrs)

        %{user: user, device_key: device_key, session_token: session_token, session: session}
      end)
    else
      false -> {:error, :invalid_mnemonic}
      {:error, reason} -> {:error, reason}
    end
  end

  defp fetch_user_by_username(username) do
    case Repo.get_by(User, username: username) do
      nil -> {:error, :user_not_found}
      user -> {:ok, user}
    end
  end

  defp fetch_confirmed_recovery_key(user_id) do
    case RecoveryKey
         |> where([r], r.user_id == ^user_id and r.confirmation_completed == true and is_nil(r.invalidated_at))
         |> Repo.one() do
      nil -> {:error, :no_recovery_key}
      key -> {:ok, key}
    end
  end

  defp get_active_recovery_key(user_id) do
    RecoveryKey
    |> where([r], r.user_id == ^user_id and is_nil(r.invalidated_at))
    |> Repo.one()
  end

  # ---------------------------------------------------------------------------
  # WebAuthn / Passkey Management
  # ---------------------------------------------------------------------------

  @doc "List all active (non-revoked) WebAuthn credentials for a user."
  def list_passkeys(user_id) do
    WebAuthnCredential
    |> where([c], c.user_id == ^user_id and is_nil(c.revoked_at))
    |> order_by([c], [desc: c.inserted_at])
    |> Repo.all()
  end

  @doc "Revoke a WebAuthn credential by its Snowflake ID."
  def revoke_passkey(user_id, credential_snowflake_id) do
    case Repo.get_by(WebAuthnCredential, id: credential_snowflake_id, user_id: user_id) do
      nil ->
        {:error, :not_found}

      %WebAuthnCredential{revoked_at: revoked} when not is_nil(revoked) ->
        {:error, :already_revoked}

      credential ->
        credential
        |> Ecto.Changeset.change(%{revoked_at: DateTime.utc_now()})
        |> Repo.update()
    end
  end

  @doc "Rename a WebAuthn credential."
  def rename_passkey(user_id, credential_snowflake_id, label) do
    case Repo.get_by(WebAuthnCredential, id: credential_snowflake_id, user_id: user_id) do
      nil ->
        {:error, :not_found}

      credential ->
        credential
        |> Ecto.Changeset.change(%{label: label})
        |> Repo.update()
    end
  end

  @doc """
  Begin adding a new passkey to an existing authenticated user.
  No PoW required since the user is already authenticated.
  """
  def webauthn_add_begin(user_id) do
    user = Repo.get!(User, user_id)
    user_handle = :crypto.hash(:sha256, to_string(user.id))
    {challenge, options} = WebAuthn.registration_options(user_handle, user.username)
    challenge_id = Snowflake.next_id()

    challenge_data =
      Jason.encode!(%{
        challenge: Base.encode64(challenge),
        user_id: user.id
      })

    Redix.command!(:redix, [
      "SET",
      "webauthn:add:#{challenge_id}",
      challenge_data,
      "EX",
      to_string(@webauthn_challenge_ttl_seconds)
    ])

    {:ok, %{challenge_id: challenge_id, options: options}}
  end

  @doc """
  Complete adding a new passkey to an existing authenticated user.
  """
  def webauthn_add_complete(user_id, attrs) do
    challenge_id = Map.fetch!(attrs, :challenge_id)
    client_data_json = Map.fetch!(attrs, :client_data_json)
    attestation_object = Map.fetch!(attrs, :attestation_object)

    redis_key = "webauthn:add:#{challenge_id}"

    with {:ok, challenge_data} <- fetch_redis_challenge(redis_key),
         {:ok, parsed} <- Jason.decode(challenge_data),
         ^user_id <- parsed["user_id"],
         challenge = Base.decode64!(parsed["challenge"]),
         {:ok, cred_result} <-
           WebAuthn.verify_registration(client_data_json, attestation_object, challenge) do
      # Consume the challenge
      Redix.command!(:redix, ["DEL", redis_key])

      credential =
        %WebAuthnCredential{}
        |> WebAuthnCredential.changeset(%{
          id: Snowflake.next_id(),
          user_id: user_id,
          credential_id: cred_result.credential_id,
          public_key: cred_result.public_key,
          algorithm: cred_result.algorithm,
          sign_count: cred_result.sign_count,
          label: Map.get(attrs, :label)
        })
        |> Repo.insert!()

      {:ok, credential}
    else
      _ -> {:error, :invalid_challenge}
    end
  end

  # ---------------------------------------------------------------------------
  # WebAuthn / Passkey Registration
  # ---------------------------------------------------------------------------

  @doc """
  Begin WebAuthn registration. Generates a challenge, stores it in Redis,
  and returns PublicKeyCredentialCreationOptions for the client.
  """
  def webauthn_register_begin(username) do
    # Verify username is available
    case Repo.get_by(User, username: username) do
      nil ->
        user_handle = :crypto.strong_rand_bytes(32)
        {challenge, options} = WebAuthn.registration_options(user_handle, username)
        challenge_id = Snowflake.next_id()

        challenge_data =
          Jason.encode!(%{
            challenge: Base.encode64(challenge),
            username: username,
            user_handle: Base.encode64(user_handle)
          })

        Redix.command!(:redix, [
          "SET",
          "webauthn:register:#{challenge_id}",
          challenge_data,
          "EX",
          to_string(@webauthn_challenge_ttl_seconds)
        ])

        {:ok, %{challenge_id: challenge_id, options: options, challenge_hex: Base.encode16(challenge, case: :lower)}}

      _user ->
        {:error, :username_taken}
    end
  end

  @doc """
  Complete WebAuthn registration. Verifies PoW and attestation, creates user,
  credential, session, and auto-generates a recovery key.
  """
  def webauthn_register_complete(attrs) do
    challenge_id = Map.fetch!(attrs, :challenge_id)
    pow_nonce = Map.fetch!(attrs, :pow_nonce)
    client_data_json = Map.fetch!(attrs, :client_data_json)
    attestation_object = Map.fetch!(attrs, :attestation_object)

    redis_key = "webauthn:register:#{challenge_id}"

    with {:ok, challenge_data} <- fetch_redis_challenge(redis_key),
         {:ok, parsed} <- Jason.decode(challenge_data),
         challenge = Base.decode64!(parsed["challenge"]),
         :ok <- verify_pow(challenge, pow_nonce),
         {:ok, cred_result} <-
           WebAuthn.verify_registration(client_data_json, attestation_object, challenge) do
      # Consume the challenge
      Redix.command!(:redix, ["DEL", redis_key])

      username = parsed["username"]
      now = DateTime.utc_now()

      Repo.transaction(fn ->
        user_id = Snowflake.next_id()

        user =
          case %User{}
               |> User.registration_changeset(%{
                 id: user_id,
                 username: username,
                 age_verified: Map.get(attrs, :age_verified, false),
                 age_verified_at: if(Map.get(attrs, :age_verified), do: now),
                 tos_accepted_version: Map.get(attrs, :tos_accepted_version),
                 tos_accepted_at: if(Map.get(attrs, :tos_accepted_version), do: now),
                 privacy_accepted_version: Map.get(attrs, :privacy_accepted_version),
                 privacy_accepted_at: if(Map.get(attrs, :privacy_accepted_version), do: now)
               })
               |> Repo.insert() do
            {:ok, user} -> user
            {:error, changeset} -> Repo.rollback(changeset)
          end

        # Store the WebAuthn credential
        credential =
          %WebAuthnCredential{}
          |> WebAuthnCredential.changeset(%{
            id: Snowflake.next_id(),
            user_id: user.id,
            credential_id: cred_result.credential_id,
            public_key: cred_result.public_key,
            algorithm: cred_result.algorithm,
            sign_count: cred_result.sign_count,
            label: Map.get(attrs, :device_label)
          })
          |> Repo.insert!()

        # Record PoW
        pow_hash = compute_pow_hash(challenge, pow_nonce)

        %PowRecord{}
        |> PowRecord.changeset(%{
          id: Snowflake.next_id(),
          user_id: user.id,
          public_key: challenge,
          nonce: pow_nonce,
          hash_result: pow_hash,
          difficulty_prefix: pow_difficulty(),
          verified_at: now
        })
        |> Repo.insert!()

        # Create session (no device_key_id for WebAuthn sessions)
        {session_token, session} = create_session(user.id, nil, attrs)

        # Auto-generate and confirm recovery key
        {:ok, %{mnemonic: mnemonic}} = generate_recovery_key(user.id)
        {:ok, _} = confirm_recovery_key(user.id, mnemonic)

        %{
          user: user,
          credential: credential,
          session_token: session_token,
          session: session,
          recovery_phrase: mnemonic
        }
      end)
    end
  end

  # ---------------------------------------------------------------------------
  # WebAuthn / Passkey Authentication
  # ---------------------------------------------------------------------------

  @doc """
  Begin WebAuthn login. Returns authentication options with the user's credential IDs.
  """
  def webauthn_login_begin(username) do
    case Repo.get_by(User, username: username) do
      nil ->
        # Don't reveal whether user exists — return fake challenge
        {_challenge, options} = WebAuthn.authentication_options([])
        fake_id = Snowflake.next_id()
        {:ok, %{challenge_id: fake_id, options: options}}

      user ->
        # Get all active WebAuthn credentials for this user
        credentials =
          WebAuthnCredential
          |> where([c], c.user_id == ^user.id and is_nil(c.revoked_at))
          |> Repo.all()

        credential_ids = Enum.map(credentials, & &1.credential_id)
        {challenge, options} = WebAuthn.authentication_options(credential_ids)
        challenge_id = Snowflake.next_id()

        challenge_data =
          Jason.encode!(%{
            challenge: Base.encode64(challenge),
            user_id: user.id
          })

        Redix.command!(:redix, [
          "SET",
          "webauthn:login:#{challenge_id}",
          challenge_data,
          "EX",
          to_string(@webauthn_challenge_ttl_seconds)
        ])

        {:ok, %{challenge_id: challenge_id, options: options}}
    end
  end

  @doc """
  Complete WebAuthn login. Verifies assertion and creates a session.
  """
  def webauthn_login_complete(attrs) do
    challenge_id = Map.fetch!(attrs, :challenge_id)
    credential_id_b64 = Map.fetch!(attrs, :credential_id)
    client_data_json = Map.fetch!(attrs, :client_data_json)
    authenticator_data = Map.fetch!(attrs, :authenticator_data)
    signature = Map.fetch!(attrs, :signature)

    redis_key = "webauthn:login:#{challenge_id}"

    with {:ok, challenge_data} <- fetch_redis_challenge(redis_key),
         {:ok, parsed} <- Jason.decode(challenge_data),
         challenge = Base.decode64!(parsed["challenge"]),
         {:ok, raw_cred_id} <- Base.url_decode64(credential_id_b64, padding: false),
         {:ok, credential} <- fetch_webauthn_credential(raw_cred_id, parsed["user_id"]),
         {:ok, result} <-
           WebAuthn.verify_assertion(
             client_data_json,
             authenticator_data,
             signature,
             challenge,
             credential.public_key,
             credential.algorithm
           ) do
      # Consume the challenge
      Redix.command!(:redix, ["DEL", redis_key])

      now = DateTime.utc_now()

      # Update credential sign count and last_used
      {:ok, _} =
        credential
        |> Ecto.Changeset.change(%{sign_count: result.sign_count, last_used_at: now})
        |> Repo.update()

      user = Repo.get!(User, credential.user_id)
      {session_token, session} = create_session(user.id, nil, attrs)

      {:ok, %{session_token: session_token, user: user, session: session}}
    end
  end

  # ---------------------------------------------------------------------------
  # Device Pairing
  # ---------------------------------------------------------------------------

  @doc """
  Generate a device pairing code for the authenticated user.

  Returns a short-lived alphanumeric code (format: BURROW-XXXX-XXXX) and a
  long random token. Either can be used by the new device within 5 minutes.
  Only one active pairing token per user at a time.
  """
  def create_pairing_code(user_id) do
    now = DateTime.utc_now()

    # Invalidate any existing unused pairing tokens for this user
    PairingToken
    |> where([p], p.user_id == ^user_id and is_nil(p.used_at))
    |> Repo.delete_all()

    # Generate a cryptographically random token (for QR codes)
    raw_token = :crypto.strong_rand_bytes(32)
    token_hash = :crypto.hash(:sha256, raw_token)
    token_hex = Base.encode16(raw_token, case: :lower)

    # Generate a short human-readable code (BURROW-XXXX-XXXX)
    code = generate_pair_code()

    expires_at = DateTime.add(now, @pairing_ttl_seconds, :second)

    {:ok, pairing} =
      %PairingToken{}
      |> PairingToken.changeset(%{
        id: Snowflake.next_id(),
        user_id: user_id,
        token_hash: token_hash,
        code: code,
        method: "code",
        expires_at: expires_at
      })
      |> Repo.insert()

    {:ok, %{
      code: code,
      token: token_hex,
      expires_at: expires_at,
      pairing_id: pairing.id
    }}
  end

  @doc """
  Claim a pairing code from a new device. Registers the new device's public key
  and creates a session for it. This is an unauthenticated endpoint — the
  pairing code itself serves as the authorization.
  """
  def claim_pairing_code(attrs) do
    code_or_token = Map.fetch!(attrs, :code)
    public_key = Map.get(attrs, :public_key)
    device_fp = Map.get(attrs, :device_fingerprint_hash)
    device_label = Map.get(attrs, :device_label)

    with {:ok, pairing} <- fetch_valid_pairing(code_or_token) do
      now = DateTime.utc_now()

      Repo.transaction(fn ->
        # Optionally register a device key (only if public_key provided)
        device_key_id =
          if public_key do
            device_key =
              %DeviceKey{}
              |> DeviceKey.changeset(%{
                id: Snowflake.next_id(),
                user_id: pairing.user_id,
                public_key_ed25519: public_key,
                device_fingerprint_hash: device_fp || "none",
                device_label: device_label || "Paired device"
              })
              |> Repo.insert!()

            device_key.id
          else
            nil
          end

        # Mark the pairing token as used
        {:ok, _} =
          pairing
          |> Ecto.Changeset.change(%{used_at: now, new_device_key_id: device_key_id})
          |> Repo.update()

        # Create a session for the new device (nil device_key_id is fine — same as WebAuthn)
        {session_token, session} = create_session(pairing.user_id, device_key_id, attrs)

        user = Repo.get!(User, pairing.user_id)

        %{user: user, device_key: nil, session_token: session_token, session: session}
      end)
    end
  end

  @doc "Get the status of a pairing token (for polling from the originating device)."
  def get_pairing_status(pairing_id, user_id) do
    case Repo.get_by(PairingToken, id: pairing_id, user_id: user_id) do
      nil ->
        {:error, :not_found}

      %PairingToken{used_at: nil, expires_at: expires_at} = _pairing ->
        if DateTime.compare(DateTime.utc_now(), expires_at) == :lt do
          {:ok, :pending}
        else
          {:ok, :expired}
        end

      %PairingToken{used_at: _used} ->
        {:ok, :claimed}
    end
  end

  defp fetch_valid_pairing(code_or_token) do
    now = DateTime.utc_now()

    # Try as short code first
    pairing = Repo.get_by(PairingToken, code: String.upcase(code_or_token))

    # If not found, try as hex token
    pairing =
      if pairing do
        pairing
      else
        case Base.decode16(code_or_token, case: :mixed) do
          {:ok, raw_token} ->
            token_hash = :crypto.hash(:sha256, raw_token)
            Repo.get_by(PairingToken, token_hash: token_hash)

          :error ->
            nil
        end
      end

    case pairing do
      nil ->
        {:error, :pairing_not_found}

      %PairingToken{used_at: used} when not is_nil(used) ->
        {:error, :pairing_already_used}

      %PairingToken{expires_at: expires_at} = p ->
        if DateTime.compare(now, expires_at) == :lt do
          {:ok, p}
        else
          {:error, :pairing_expired}
        end
    end
  end

  defp generate_pair_code do
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    part1 = Enum.map(1..4, fn _ -> Enum.random(alphabet) end) |> List.to_string()
    part2 = Enum.map(1..4, fn _ -> Enum.random(alphabet) end) |> List.to_string()
    "BURROW-#{part1}-#{part2}"
  end

  # ---------------------------------------------------------------------------
  # Internal Helpers
  # ---------------------------------------------------------------------------

  defp fetch_redis_challenge(key) do
    case Redix.command!(:redix, ["GET", key]) do
      nil -> {:error, :challenge_not_found}
      data -> {:ok, data}
    end
  end

  defp fetch_webauthn_credential(credential_id, user_id) do
    case Repo.get_by(WebAuthnCredential, credential_id: credential_id, user_id: user_id) do
      nil -> {:error, :credential_not_found}
      %WebAuthnCredential{revoked_at: nil} = cred -> {:ok, cred}
      %WebAuthnCredential{} -> {:error, :credential_revoked}
    end
  end

  defp verify_pow(public_key, nonce) do
    hash = compute_pow_hash(public_key, nonce)

    if String.starts_with?(hash, pow_difficulty()) do
      :ok
    else
      {:error, :invalid_pow}
    end
  end

  defp compute_pow_hash(public_key, nonce) do
    :crypto.hash(:sha256, public_key <> nonce)
    |> Base.encode16(case: :lower)
  end

  defp check_key_not_registered(public_key) do
    case Repo.get_by(DeviceKey, public_key_ed25519: public_key) do
      nil -> :ok
      _existing -> {:error, :key_already_registered}
    end
  end

  defp fetch_valid_challenge(challenge_id) do
    case Repo.get(AuthChallenge, challenge_id) do
      nil ->
        {:error, :challenge_not_found}

      %AuthChallenge{used: true} ->
        {:error, :challenge_already_used}

      %AuthChallenge{} = challenge ->
        if DateTime.compare(DateTime.utc_now(), challenge.expires_at) == :lt do
          {:ok, challenge}
        else
          {:error, :challenge_expired}
        end
    end
  end

  defp fetch_device_key(user_id, public_key) do
    case Repo.get_by(DeviceKey, user_id: user_id, public_key_ed25519: public_key) do
      nil -> {:error, :device_not_found}
      %DeviceKey{revoked_at: nil} = dk -> {:ok, dk}
      %DeviceKey{} -> {:error, :device_revoked}
    end
  end

  defp verify_signature(nonce, signature, public_key) do
    case :crypto.verify(:eddsa, :none, nonce, signature, [public_key, :ed25519]) do
      true -> :ok
      false -> {:error, :invalid_signature}
    end
  end

  defp create_session(user_id, device_key_id, attrs) do
    now = DateTime.utc_now()
    raw_token = :crypto.strong_rand_bytes(@session_token_bytes)
    token_hash = hash_session_token(raw_token)

    {:ok, session} =
      %UserSession{}
      |> UserSession.changeset(%{
        id: Snowflake.next_id(),
        user_id: user_id,
        device_key_id: device_key_id,
        token_hash: token_hash,
        device_type: Map.get(attrs, :device_type),
        os: Map.get(attrs, :os),
        browser: Map.get(attrs, :browser),
        ip: Map.get(attrs, :ip),
        first_active: now,
        last_active: now
      })
      |> Repo.insert()

    token_hex = Base.encode16(raw_token, case: :lower)
    {token_hex, session}
  end

  defp hash_session_token(raw_token) do
    :crypto.hash(:sha256, raw_token)
  end

  def count_users do
    Repo.aggregate(User, :count)
  end

  @doc "Set or unset is_dev flag on a user. Recalculates trust tier."
  def set_dev(user_id, is_dev) when is_boolean(is_dev) do
    user = Repo.get!(User, user_id)
    changes = if is_dev, do: %{is_dev: true, trust_score: 100, trust_tier: 5}, else: %{is_dev: false}

    case user |> Ecto.Changeset.change(changes) |> Repo.update() do
      {:ok, updated} ->
        unless is_dev, do: Burrow.Trust.recalculate(user_id)
        {:ok, updated}
      error -> error
    end
  end
end
