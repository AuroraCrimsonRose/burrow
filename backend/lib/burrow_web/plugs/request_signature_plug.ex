defmodule BurrowWeb.RequestSignaturePlug do
  @moduledoc """
  Verifies device key signatures on authenticated requests to prevent impersonation.

  Requires the X-Device-Signature header containing an Ed25519 signature over:
    METHOD\\nPATH\\nTIMESTAMP\\nNONCE

  This proves the request was made by the device that holds the private key
  associated with the session's device key.

  Sessions without a device key (e.g. WebAuthn-only passkey sessions) are
  exempt from signature verification since the passkey already authenticates
  the device.

  Disable in dev via: `config :burrow, request_signatures_enabled: false`
  """

  import Plug.Conn
  require Logger
  alias Burrow.Repo
  alias Burrow.Auth.DeviceKey

  def init(opts), do: opts

  def call(conn, _opts) do
    if Application.get_env(:burrow, :request_signatures_enabled, true) do
      do_verify(conn)
    else
      conn
    end
  end

  defp do_verify(conn) do
    session = conn.assigns[:current_session]

    cond do
      # Not authenticated yet — skip (AuthPlug runs first)
      is_nil(session) ->
        conn

      # WebAuthn-only session — no device key to verify against
      is_nil(session.device_key_id) ->
        conn

      # Ed25519 session — require signature
      true ->
        verify_device_signature(conn, session)
    end
  end

  defp verify_device_signature(conn, session) do
    case get_req_header(conn, "x-device-signature") do
      [signature_hex] ->
        do_verify_signature(conn, session.device_key_id, signature_hex)

      _ ->
        Logger.warning("RequestSignature: missing X-Device-Signature header for user #{session.user_id}, path=#{conn.request_path}")
        reject(conn, "signature_required", "Device signature required for authenticated requests")
    end
  end

  defp do_verify_signature(conn, device_key_id, signature_hex) do
    with {:decode_sig, {:ok, signature}} <- {:decode_sig, Base.decode16(signature_hex, case: :mixed)},
         {:load_key, {:ok, %DeviceKey{} = device_key}} <- {:load_key, load_device_key(device_key_id)},
         message = build_canonical_message(conn),
         {:verify, true} <- {:verify, verify_ed25519(message, signature, device_key.public_key_ed25519)} do
      conn
    else
      {:decode_sig, _} ->
        Logger.warning("RequestSignature: failed to decode signature hex for device_key #{device_key_id}")
        reject(conn, "invalid_signature", "Device signature is not valid hex")

      {:load_key, _} ->
        Logger.warning("RequestSignature: device_key #{device_key_id} not found in DB")
        reject(conn, "invalid_signature", "Device key not found")

      {:verify, false} ->
        message = build_canonical_message(conn)
        Logger.warning("RequestSignature: ed25519 verify failed for device_key #{device_key_id}, path=#{conn.request_path}, message=#{inspect(message)}")
        reject(conn, "invalid_signature", "Device signature verification failed")

      other ->
        Logger.warning("RequestSignature: unexpected failure: #{inspect(other)}")
        reject(conn, "invalid_signature", "Device signature verification failed")
    end
  end

  defp load_device_key(id) do
    case Repo.get(DeviceKey, id) do
      nil -> {:error, :not_found}
      key -> {:ok, key}
    end
  end

  defp reject(conn, code, detail) do
    conn
    |> put_status(403)
    |> Phoenix.Controller.json(%{error: code, detail: detail})
    |> halt()
  end

  defp build_canonical_message(conn) do
    timestamp =
      get_req_header(conn, "x-request-timestamp") |> List.first() || ""

    nonce =
      get_req_header(conn, "x-request-nonce") |> List.first() || ""

    "#{conn.method}\n#{conn.request_path}\n#{timestamp}\n#{nonce}"
  end

  defp verify_ed25519(message, signature, public_key) do
    :crypto.verify(:eddsa, :none, message, signature, [public_key, :ed25519])
  rescue
    _ -> false
  end
end
