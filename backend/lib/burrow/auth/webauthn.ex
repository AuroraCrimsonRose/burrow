defmodule Burrow.Auth.WebAuthn do
  @moduledoc """
  Server-side WebAuthn (passkey) registration and authentication verification.
  Supports ES256 (P-256) and EdDSA (Ed25519) credential algorithms.
  """

  alias Burrow.Auth.CBOR

  defp rp_id, do: Application.get_env(:burrow, :webauthn_rp_id, "localhost")

  # ---------------------------------------------------------------------------
  # Registration Options
  # ---------------------------------------------------------------------------

  @doc """
  Generate WebAuthn registration (credential creation) options.
  Returns a map with the challenge and PublicKeyCredentialCreationOptions fields.
  """
  def registration_options(user_handle, username) do
    challenge = :crypto.strong_rand_bytes(32)

    options = %{
      challenge: Base.url_encode64(challenge, padding: false),
      rp: %{name: "Burrow", id: rp_id()},
      user: %{
        id: Base.url_encode64(user_handle, padding: false),
        name: username,
        displayName: username
      },
      pubKeyCredParams: [
        %{type: "public-key", alg: -7},
        %{type: "public-key", alg: -8}
      ],
      authenticatorSelection: %{
        residentKey: "preferred",
        userVerification: "preferred"
      },
      attestation: "none",
      timeout: 120_000
    }

    {challenge, options}
  end

  @doc """
  Generate WebAuthn authentication (assertion) options.
  `credential_ids` is a list of raw credential ID binaries.
  """
  def authentication_options(credential_ids) do
    challenge = :crypto.strong_rand_bytes(32)

    allow_credentials =
      Enum.map(credential_ids, fn cred_id ->
        %{
          type: "public-key",
          id: Base.url_encode64(cred_id, padding: false)
        }
      end)

    options = %{
      challenge: Base.url_encode64(challenge, padding: false),
      rpId: rp_id(),
      allowCredentials: allow_credentials,
      userVerification: "preferred",
      timeout: 120_000
    }

    {challenge, options}
  end

  # ---------------------------------------------------------------------------
  # Registration Verification
  # ---------------------------------------------------------------------------

  @doc """
  Verify a WebAuthn registration (attestation) response.

  Returns `{:ok, %{credential_id, public_key, algorithm, sign_count}}` or `{:error, reason}`.
  """
  def verify_registration(client_data_json_b64, attestation_object_b64, expected_challenge) do
    with {:ok, client_data_json} <- base64url_decode(client_data_json_b64),
         {:ok, client_data} <- Jason.decode(client_data_json),
         :ok <- verify_client_data(client_data, "webauthn.create", expected_challenge),
         {:ok, attestation_object} <- base64url_decode(attestation_object_b64),
         {:ok, att_map} <- cbor_decode(attestation_object),
         {:ok, auth_data} <- Map.fetch(att_map, "authData"),
         {:ok, parsed} <- parse_attestation_auth_data(auth_data) do
      {:ok, parsed}
    end
  end

  # ---------------------------------------------------------------------------
  # Authentication Verification
  # ---------------------------------------------------------------------------

  @doc """
  Verify a WebAuthn authentication (assertion) response.

  `stored_public_key` is the raw key material (EC point or Ed25519 key).
  `stored_algorithm` is the COSE algorithm number (-7, -8).

  Returns `{:ok, %{sign_count: integer}}` or `{:error, reason}`.
  """
  def verify_assertion(
        client_data_json_b64,
        authenticator_data_b64,
        signature_b64,
        expected_challenge,
        stored_public_key,
        stored_algorithm
      ) do
    with {:ok, client_data_json} <- base64url_decode(client_data_json_b64),
         {:ok, client_data} <- Jason.decode(client_data_json),
         :ok <- verify_client_data(client_data, "webauthn.get", expected_challenge),
         {:ok, authenticator_data} <- base64url_decode(authenticator_data_b64),
         {:ok, signature} <- base64url_decode(signature_b64),
         {:ok, sign_count} <- parse_assertion_auth_data(authenticator_data),
         :ok <-
           verify_assertion_signature(
             authenticator_data,
             client_data_json,
             signature,
             stored_public_key,
             stored_algorithm
           ) do
      {:ok, %{sign_count: sign_count}}
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp base64url_decode(data) do
    case Base.url_decode64(data, padding: false) do
      {:ok, decoded} -> {:ok, decoded}
      :error -> {:error, :invalid_base64url}
    end
  end

  defp cbor_decode(data) do
    try do
      {value, _rest} = CBOR.decode(data)
      {:ok, value}
    rescue
      _ -> {:error, :invalid_cbor}
    end
  end

  defp verify_client_data(client_data, expected_type, expected_challenge) do
    expected_challenge_b64 = Base.url_encode64(expected_challenge, padding: false)

    cond do
      client_data["type"] != expected_type ->
        {:error, :invalid_type}

      client_data["challenge"] != expected_challenge_b64 ->
        {:error, :challenge_mismatch}

      not origin_allowed?(client_data["origin"]) ->
        {:error, :invalid_origin}

      true ->
        :ok
    end
  end

  defp origin_allowed?(origin) do
    case URI.parse(origin) do
      %URI{host: host} when is_binary(host) -> host == rp_id()
      _ -> false
    end
  end

  defp parse_attestation_auth_data(auth_data) when byte_size(auth_data) < 37 do
    {:error, :auth_data_too_short}
  end

  defp parse_attestation_auth_data(auth_data) do
    <<rp_id_hash::binary-32, flags::8, sign_count::unsigned-big-32, rest::binary>> = auth_data

    expected_rp_hash = :crypto.hash(:sha256, rp_id())

    cond do
      rp_id_hash != expected_rp_hash ->
        {:error, :invalid_rp_id}

      Bitwise.band(flags, 0x40) == 0 ->
        {:error, :no_attested_credential}

      true ->
        parse_attested_credential_data(rest, sign_count)
    end
  end

  defp parse_attested_credential_data(data, _sign_count) when byte_size(data) < 18 do
    {:error, :attested_data_too_short}
  end

  defp parse_attested_credential_data(data, sign_count) do
    <<_aaguid::binary-16, cred_id_len::unsigned-big-16, rest::binary>> = data

    if byte_size(rest) < cred_id_len do
      {:error, :credential_id_truncated}
    else
      <<credential_id::binary-size(cred_id_len), cose_key_cbor::binary>> = rest

      try do
        {cose_key_map, _remaining} = CBOR.decode(cose_key_cbor)
        extract_key_material(credential_id, cose_key_map, sign_count)
      rescue
        _ -> {:error, :invalid_cose_key}
      end
    end
  end

  defp extract_key_material(credential_id, cose_key, sign_count) do
    # COSE key parameter indices:
    #   1 = kty, 3 = alg, -1 = crv, -2 = x, -3 = y
    case cose_key[1] do
      2 ->
        # EC2 (P-256): store uncompressed point (04 || x || y)
        x = cose_key[-2]
        y = cose_key[-3]

        if is_binary(x) and is_binary(y) and byte_size(x) == 32 and byte_size(y) == 32 do
          {:ok,
           %{
             credential_id: credential_id,
             public_key: <<4>> <> x <> y,
             algorithm: -7,
             sign_count: sign_count
           }}
        else
          {:error, :invalid_ec_key}
        end

      1 ->
        # OKP (Ed25519): store raw x coordinate (32 bytes)
        x = cose_key[-2]

        if is_binary(x) and byte_size(x) == 32 do
          {:ok,
           %{
             credential_id: credential_id,
             public_key: x,
             algorithm: -8,
             sign_count: sign_count
           }}
        else
          {:error, :invalid_ed_key}
        end

      _ ->
        {:error, :unsupported_key_type}
    end
  end

  defp parse_assertion_auth_data(auth_data) when byte_size(auth_data) < 37 do
    {:error, :auth_data_too_short}
  end

  defp parse_assertion_auth_data(auth_data) do
    <<rp_id_hash::binary-32, _flags::8, sign_count::unsigned-big-32, _rest::binary>> = auth_data

    expected_rp_hash = :crypto.hash(:sha256, rp_id())

    if rp_id_hash != expected_rp_hash do
      {:error, :invalid_rp_id}
    else
      {:ok, sign_count}
    end
  end

  defp verify_assertion_signature(
         authenticator_data,
         client_data_json,
         signature,
         stored_public_key,
         stored_algorithm
       ) do
    # Signed data = authenticatorData || SHA-256(clientDataJSON)
    client_data_hash = :crypto.hash(:sha256, client_data_json)
    signed_data = authenticator_data <> client_data_hash

    verified =
      case stored_algorithm do
        -7 ->
          # ES256 (P-256 ECDSA with SHA-256)
          :crypto.verify(:ecdsa, :sha256, signed_data, signature, [stored_public_key, :secp256r1])

        -8 ->
          # EdDSA (Ed25519)
          :crypto.verify(:eddsa, :none, signed_data, signature, [stored_public_key, :ed25519])

        _ ->
          false
      end

    if verified, do: :ok, else: {:error, :invalid_signature}
  end
end
