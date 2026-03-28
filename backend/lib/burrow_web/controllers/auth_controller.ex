defmodule BurrowWeb.AuthController do
  use BurrowWeb, :controller

  alias Burrow.Auth

  action_fallback BurrowWeb.FallbackController

  @doc "POST /api/v1/auth/register"
  def register(conn, params) do
    device_info = Burrow.DeviceInfo.from_conn(conn)

    with {:ok, attrs} <- parse_register_params(params),
         attrs = Map.merge(attrs, device_info),
         {:ok, result} <- Auth.register(attrs) do
      conn
      |> put_status(:created)
      |> json(%{
        user: user_json(result.user),
        device_key_id: to_string(result.device_key.id),
        session_token: result.session_token
      })
    end
  end

  @doc "POST /api/v1/auth/challenge"
  def create_challenge(conn, %{"username" => username}) do
    case Auth.create_challenge(username) do
      {:ok, challenge} ->
        conn
        |> put_status(:ok)
        |> json(%{
          challenge_id: to_string(challenge.challenge_id),
          nonce: challenge.nonce,
          expires_at: DateTime.to_iso8601(challenge.expires_at)
        })

      {:error, :user_not_found} ->
        # Deliberately vague — don't reveal whether user exists
        conn
        |> put_status(:ok)
        |> json(%{
          challenge_id: to_string(Burrow.Snowflake.next_id()),
          nonce: Base.encode16(:crypto.strong_rand_bytes(32), case: :lower),
          expires_at: DateTime.to_iso8601(DateTime.add(DateTime.utc_now(), 60, :second))
        })
    end
  end

  @doc "POST /api/v1/auth/verify"
  def verify_challenge(conn, params) do
    device_info = Burrow.DeviceInfo.from_conn(conn)

    with {:ok, attrs} <- parse_verify_params(conn, params),
         attrs = Map.merge(attrs, device_info),
         {:ok, result} <- Auth.verify_challenge(attrs) do
      conn
      |> put_status(:ok)
      |> json(%{
        session_token: result.session_token,
        user: user_json(result.user)
      })
    end
  end

  @doc "GET /api/v1/auth/sessions"
  def list_sessions(conn, _params) do
    sessions = Auth.list_sessions(conn.assigns.current_user_id)
    current_id = conn.assigns.current_session.id

    conn
    |> put_status(:ok)
    |> json(%{
      sessions: Enum.map(sessions, fn s ->
        session_json(s) |> Map.put(:current, s.id == current_id)
      end)
    })
  end

  @doc "DELETE /api/v1/auth/sessions/:id"
  def revoke_session(conn, %{"id" => id}) do
    case Integer.parse(id) do
      {int_id, ""} ->
        with {:ok, _session} <- Auth.revoke_session(int_id, conn.assigns.current_user_id) do
          json(conn, %{status: "revoked"})
        end

      _ ->
        {:error, :bad_request}
    end
  end

  @doc "DELETE /api/v1/auth/sessions (revoke all except current)"
  def revoke_other_sessions(conn, _params) do
    current_session_id = conn.assigns.current_session.id
    {:ok, count} = Auth.revoke_other_sessions(conn.assigns.current_user_id, current_session_id)

    json(conn, %{revoked_count: count})
  end

  @doc "PATCH /api/v1/auth/username"
  def change_username(conn, %{"username" => username}) do
    case Auth.change_username(conn.assigns.current_user_id, username) do
      {:ok, user} -> json(conn, %{username: user.username})
      {:error, changeset} -> {:error, changeset}
    end
  end

  def change_username(_conn, _params), do: {:error, :bad_request}

  @doc "PATCH /api/v1/auth/profile"
  def update_profile(conn, params) do
    user_id = conn.assigns.current_user_id
    case Auth.update_profile(user_id, params) do
      {:ok, user} ->
        json(conn, %{
          bio: user.bio,
          pronouns: user.pronouns,
          banner_url: user.banner_url,
          display_name: user.display_name,
          accent_color: user.accent_color,
          friends_only_dms: user.friends_only_dms
        })
      {:error, changeset} -> {:error, changeset}
    end
  end

  @doc "GET /api/v1/auth/profile"
  def get_profile(conn, _params) do
    user_id = conn.assigns.current_user_id
    case Auth.get_user(user_id) do
      nil -> {:error, :not_found}
      user ->
        badges = Burrow.Profiles.get_user_badges(user_id)
        primary_badge = Burrow.Profiles.get_primary_badge(user_id)
        json(conn, %{
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          bio: user.bio,
          pronouns: user.pronouns,
          banner_url: user.banner_url,
          trust_tier: user.trust_tier,
          accent_color: user.accent_color,
          friends_only_dms: user.friends_only_dms,
          badges: badges,
          primary_badge: primary_badge
        })
    end
  end

  def get_me(conn, _params) do
    user_id = conn.assigns.current_user_id
    case Auth.get_user(user_id) do
      nil -> {:error, :not_found}
      user -> json(conn, %{user: user_json(user)})
    end
  end

  @doc "POST /api/v1/auth/recovery-key"
  def generate_recovery_key(conn, _params) do
    case Auth.generate_recovery_key(conn.assigns.current_user_id) do
      {:ok, result} ->
        json(conn, %{
          mnemonic: result.mnemonic,
          recovery_key_id: to_string(result.recovery_key_id),
          warning: "Save this recovery phrase securely. It will NOT be shown again."
        })

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "POST /api/v1/auth/recovery-key/confirm"
  def confirm_recovery_key(conn, %{"mnemonic" => mnemonic}) do
    case Auth.confirm_recovery_key(conn.assigns.current_user_id, mnemonic) do
      {:ok, _key} -> json(conn, %{status: "confirmed"})
      {:error, reason} -> {:error, reason}
    end
  end

  def confirm_recovery_key(_conn, _params), do: {:error, :bad_request}

  @doc "POST /api/v1/auth/recover"
  def recover(conn, params) do
    device_info = Burrow.DeviceInfo.from_conn(conn)

    with {:ok, attrs} <- parse_recover_params(conn, params),
         attrs = Map.merge(attrs, device_info),
         {:ok, result} <- Auth.recover_account(attrs) do
      conn
      |> put_status(:ok)
      |> json(%{
        user: user_json(result.user),
        device_key_id: to_string(result.device_key.id),
        session_token: result.session_token
      })
    end
  end

  # ---------------------------------------------------------------------------
  # WebAuthn / Passkey Endpoints
  # ---------------------------------------------------------------------------

  @doc "POST /api/v1/auth/webauthn/register/begin"
  def webauthn_register_begin(conn, %{"username" => username} = params) do
    age_ok = Map.get(params, "age_verified", false)
    tos_ok = Map.get(params, "tos_accepted", false)
    privacy_ok = Map.get(params, "privacy_accepted", false)

    cond do
      !age_ok -> {:error, :age_not_verified}
      !tos_ok -> {:error, :tos_not_accepted}
      !privacy_ok -> {:error, :privacy_not_accepted}
      true ->
        case Auth.webauthn_register_begin(username) do
          {:ok, result} ->
            json(conn, %{
              challenge_id: to_string(result.challenge_id),
              options: result.options,
              challenge_hex: result.challenge_hex
            })

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  def webauthn_register_begin(_conn, _params), do: {:error, :bad_request}

  @doc "POST /api/v1/auth/webauthn/register/complete"
  def webauthn_register_complete(conn, params) do
    device_info = Burrow.DeviceInfo.from_conn(conn)

    with {:ok, attrs} <- parse_webauthn_register_params(params),
         attrs = Map.merge(attrs, device_info) do
      case Auth.webauthn_register_complete(attrs) do
        {:ok, result} ->
          conn
          |> put_status(:created)
          |> json(%{
            user: user_json(result.user),
            session_token: result.session_token,
            recovery_phrase: result.recovery_phrase
          })

        {:error, %Ecto.Changeset{} = changeset} ->
          {:error, changeset}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @doc "POST /api/v1/auth/webauthn/login/begin"
  def webauthn_login_begin(conn, %{"username" => username}) do
    case Auth.webauthn_login_begin(username) do
      {:ok, result} ->
        json(conn, %{
          challenge_id: to_string(result.challenge_id),
          options: result.options
        })

      {:error, reason} ->
        {:error, reason}
    end
  end

  def webauthn_login_begin(_conn, _params), do: {:error, :bad_request}

  @doc "POST /api/v1/auth/webauthn/login/complete"
  def webauthn_login_complete(conn, params) do
    device_info = Burrow.DeviceInfo.from_conn(conn)

    with {:ok, attrs} <- parse_webauthn_login_params(params),
         attrs = Map.merge(attrs, device_info) do
      case Auth.webauthn_login_complete(attrs) do
        {:ok, result} ->
          json(conn, %{
            session_token: result.session_token,
            user: user_json(result.user)
          })

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Passkey Management (Authenticated)
  # ---------------------------------------------------------------------------

  @doc "GET /api/v1/auth/passkeys"
  def list_passkeys(conn, _params) do
    passkeys = Auth.list_passkeys(conn.assigns.current_user_id)

    json(conn, %{
      passkeys: Enum.map(passkeys, &passkey_json/1)
    })
  end

  @doc "DELETE /api/v1/auth/passkeys/:id"
  def revoke_passkey(conn, %{"id" => id}) do
    case Integer.parse(id) do
      {int_id, ""} ->
        case Auth.revoke_passkey(conn.assigns.current_user_id, int_id) do
          {:ok, _} -> json(conn, %{status: "revoked"})
          {:error, reason} -> {:error, reason}
        end

      _ ->
        {:error, :bad_request}
    end
  end

  @doc "PATCH /api/v1/auth/passkeys/:id"
  def rename_passkey(conn, %{"id" => id, "label" => label}) do
    case Integer.parse(id) do
      {int_id, ""} ->
        case Auth.rename_passkey(conn.assigns.current_user_id, int_id, label) do
          {:ok, cred} -> json(conn, passkey_json(cred))
          {:error, reason} -> {:error, reason}
        end

      _ ->
        {:error, :bad_request}
    end
  end

  def rename_passkey(_conn, _params), do: {:error, :bad_request}

  @doc "POST /api/v1/auth/passkeys/add/begin"
  def passkey_add_begin(conn, _params) do
    case Auth.webauthn_add_begin(conn.assigns.current_user_id) do
      {:ok, result} ->
        json(conn, %{
          challenge_id: to_string(result.challenge_id),
          options: result.options
        })

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "POST /api/v1/auth/passkeys/add/complete"
  def passkey_add_complete(conn, params) do
    credential = Map.fetch!(params, "credential")
    response = Map.fetch!(credential, "response")

    attrs = %{
      challenge_id: String.to_integer(Map.fetch!(params, "challenge_id")),
      client_data_json: Map.fetch!(response, "clientDataJSON"),
      attestation_object: Map.fetch!(response, "attestationObject"),
      label: Map.get(params, "label")
    }

    case Auth.webauthn_add_complete(conn.assigns.current_user_id, attrs) do
      {:ok, cred} ->
        conn
        |> put_status(:created)
        |> json(passkey_json(cred))

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    _ -> {:error, :bad_request}
  end

  @tos_version Application.compile_env(:burrow, :tos_version, "1.0")
  @privacy_version Application.compile_env(:burrow, :privacy_version, "1.0")

  # -- Param Parsing --

  defp parse_register_params(params) do
    {:ok, %{
      public_key: decode_hex!(params, "public_key"),
      nonce: Map.fetch!(params, "nonce"),
      username: Map.fetch!(params, "username"),
      device_fingerprint_hash: Map.fetch!(params, "device_fingerprint_hash"),
      device_label: Map.get(params, "device_label"),
      age_verified: Map.get(params, "age_verified", false),
      tos_accepted_version: if(Map.get(params, "tos_accepted", false), do: @tos_version),
      privacy_accepted_version: if(Map.get(params, "privacy_accepted", false), do: @privacy_version)
    }}
  rescue
    _ -> {:error, :bad_request}
  end

  defp parse_recover_params(_conn, params) do
    {:ok, %{
      username: Map.fetch!(params, "username"),
      mnemonic: String.trim(Map.fetch!(params, "mnemonic")),
      public_key: decode_hex!(params, "public_key"),
      device_fingerprint_hash: Map.fetch!(params, "device_fingerprint_hash"),
      device_label: Map.get(params, "device_label")
    }}
  rescue
    _ -> {:error, :bad_request}
  end

  defp parse_verify_params(_conn, params) do
    {:ok, %{
      challenge_id: String.to_integer(Map.fetch!(params, "challenge_id")),
      signature: decode_hex!(params, "signature"),
      public_key: decode_hex!(params, "public_key")
    }}
  rescue
    _ -> {:error, :bad_request}
  end

  defp decode_hex!(params, key) do
    params |> Map.fetch!(key) |> Base.decode16!(case: :mixed)
  end

  defp parse_webauthn_register_params(params) do
    credential = Map.fetch!(params, "credential")
    response = Map.fetch!(credential, "response")

    {:ok, %{
      challenge_id: String.to_integer(Map.fetch!(params, "challenge_id")),
      pow_nonce: Map.fetch!(params, "pow_nonce"),
      client_data_json: Map.fetch!(response, "clientDataJSON"),
      attestation_object: Map.fetch!(response, "attestationObject"),
      device_label: Map.get(params, "device_label"),
      age_verified: Map.get(params, "age_verified", false),
      tos_accepted_version: if(Map.get(params, "tos_accepted", false), do: @tos_version),
      privacy_accepted_version: if(Map.get(params, "privacy_accepted", false), do: @privacy_version)
    }}
  rescue
    _ -> {:error, :bad_request}
  end

  defp parse_webauthn_login_params(params) do
    credential = Map.fetch!(params, "credential")
    response = Map.fetch!(credential, "response")

    {:ok, %{
      challenge_id: String.to_integer(Map.fetch!(params, "challenge_id")),
      credential_id: Map.fetch!(credential, "id"),
      client_data_json: Map.fetch!(response, "clientDataJSON"),
      authenticator_data: Map.fetch!(response, "authenticatorData"),
      signature: Map.fetch!(response, "signature")
    }}
  rescue
    _ -> {:error, :bad_request}
  end

  # -- JSON Serialization --

  defp user_json(user) do
    %{
      id: to_string(user.id),
      username: user.username,
      trust_tier: user.trust_tier,
      is_dev: user.is_dev || false
    }
  end

  defp session_json(session) do
    %{
      id: to_string(session.id),
      device_type: session.device_type,
      os: session.os,
      browser: session.browser,
      ip: session.ip,
      city: session.city,
      country: session.country,
      first_active: session.first_active && DateTime.to_iso8601(session.first_active),
      last_active: session.last_active && DateTime.to_iso8601(session.last_active),
      current: false
    }
  end

  defp passkey_json(cred) do
    %{
      id: to_string(cred.id),
      label: cred.label,
      created_at: DateTime.to_iso8601(cred.inserted_at),
      last_used_at: cred.last_used_at && DateTime.to_iso8601(cred.last_used_at)
    }
  end

  @doc "GET /api/v1/auth/tos-status — Check if user needs to re-accept ToS or Privacy Policy."
  def tos_status(conn, _params) do
    user = Auth.get_user(conn.assigns.current_user_id)
    current_tos = Application.get_env(:burrow, :tos_version, "1.0")
    current_privacy = Application.get_env(:burrow, :privacy_version, "1.0")

    json(conn, %{
      tos_current_version: current_tos,
      tos_accepted_version: user.tos_accepted_version,
      tos_accepted_at: user.tos_accepted_at && DateTime.to_iso8601(user.tos_accepted_at),
      tos_up_to_date: user.tos_accepted_version == current_tos,
      privacy_current_version: current_privacy,
      privacy_accepted_version: user.privacy_accepted_version,
      privacy_accepted_at: user.privacy_accepted_at && DateTime.to_iso8601(user.privacy_accepted_at),
      privacy_up_to_date: user.privacy_accepted_version == current_privacy
    })
  end

  @doc "POST /api/v1/auth/accept-terms — Accept current ToS and/or Privacy Policy."
  def accept_terms(conn, params) do
    user_id = conn.assigns.current_user_id
    now = DateTime.utc_now()
    current_tos = Application.get_env(:burrow, :tos_version, "1.0")
    current_privacy = Application.get_env(:burrow, :privacy_version, "1.0")

    updates =
      %{}
      |> maybe_put(params["accept_tos"], :tos_accepted_version, current_tos)
      |> maybe_put(params["accept_tos"], :tos_accepted_at, now)
      |> maybe_put(params["accept_privacy"], :privacy_accepted_version, current_privacy)
      |> maybe_put(params["accept_privacy"], :privacy_accepted_at, now)

    if map_size(updates) == 0 do
      {:error, :bad_request}
    else
      case Auth.accept_terms(user_id, updates) do
        {:ok, user} ->
          json(conn, %{
            tos_accepted_version: user.tos_accepted_version,
            privacy_accepted_version: user.privacy_accepted_version
          })

        {:error, changeset} ->
          {:error, changeset}
      end
    end
  end

  defp maybe_put(map, true, key, value), do: Map.put(map, key, value)
  defp maybe_put(map, _, _key, _value), do: map

  @doc "POST /api/v1/auth/nsfw-verify — Verify 18+ age gate for NSFW content."
  def verify_nsfw_age(conn, _params) do
    case Auth.verify_nsfw_age(conn.assigns.current_user_id) do
      {:ok, user} ->
        json(conn, %{
          nsfw_age_verified: user.nsfw_age_verified,
          nsfw_age_verified_at: user.nsfw_age_verified_at && DateTime.to_iso8601(user.nsfw_age_verified_at)
        })

      {:error, changeset} ->
        {:error, changeset}
    end
  end

  # ---------------------------------------------------------------------------
  # Device Pairing
  # ---------------------------------------------------------------------------

  @doc "POST /api/v1/auth/pairing — Generate a pairing code (authenticated)."
  def create_pairing(conn, _params) do
    case Auth.create_pairing_code(conn.assigns.current_user_id) do
      {:ok, result} ->
        json(conn, %{
          code: result.code,
          token: result.token,
          pairing_id: to_string(result.pairing_id),
          expires_at: DateTime.to_iso8601(result.expires_at)
        })

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "GET /api/v1/auth/pairing/:id — Poll pairing status (authenticated)."
  def pairing_status(conn, %{"id" => id}) do
    case Integer.parse(id) do
      {int_id, ""} ->
        case Auth.get_pairing_status(int_id, conn.assigns.current_user_id) do
          {:ok, status} ->
            json(conn, %{status: to_string(status)})

          {:error, reason} ->
            {:error, reason}
        end

      _ ->
        {:error, :bad_request}
    end
  end

  @doc "POST /api/v1/auth/pairing/claim — Claim a pairing code (unauthenticated)."
  def claim_pairing(conn, params) do
    device_info = Burrow.DeviceInfo.from_conn(conn)

    with {:ok, attrs} <- parse_claim_pairing_params(params),
         attrs = Map.merge(attrs, device_info),
         {:ok, result} <- Auth.claim_pairing_code(attrs) do
      conn
      |> put_status(:ok)
      |> json(%{
        user: user_json(result.user),
        session_token: result.session_token
      })
    end
  end

  defp parse_claim_pairing_params(params) do
    base = %{
      code: Map.fetch!(params, "code"),
      device_label: Map.get(params, "device_label")
    }

    base =
      case params do
        %{"public_key" => pk} when is_binary(pk) and pk != "" ->
          Map.merge(base, %{
            public_key: Base.decode16!(pk, case: :mixed),
            device_fingerprint_hash: Map.get(params, "device_fingerprint_hash", "none")
          })
        _ ->
          base
      end

    {:ok, base}
  rescue
    _ -> {:error, :bad_request}
  end
end
