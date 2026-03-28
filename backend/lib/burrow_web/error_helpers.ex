defmodule BurrowWeb.ErrorHelpers do
  @moduledoc """
  Centralized error formatting for consistent API error responses.

  All API errors follow this shape:

      %{
        "error" => "error_code",         # machine-readable snake_case code
        "detail" => "Human explanation",  # human-readable message
        "fields" => %{...}               # optional, only for validation errors
      }
  """

  @doc "Format an Ecto changeset into field-level error details."
  def format_changeset_errors(%Ecto.Changeset{} = changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end

  @doc """
  Map a domain error atom to {http_status, error_code, detail}.

  This is the single source of truth for error → HTTP response mapping.
  Add new error atoms here as the API grows.
  """
  def error_info(error)

  # General
  def error_info(:bad_request),
    do: {400, "bad_request", "The request was malformed or missing required fields"}

  # Auth — registration
  def error_info(:invalid_pow),
    do: {422, "invalid_pow", "Proof-of-work verification failed"}

  def error_info(:key_already_registered),
    do: {409, "key_already_registered", "This public key is already registered"}

  # Auth — challenge/verify
  def error_info(:user_not_found),
    do: {404, "not_found", "Resource not found"}

  def error_info(:challenge_not_found),
    do: {401, "auth_failed", "Challenge verification failed"}

  def error_info(:challenge_expired),
    do: {401, "auth_failed", "Challenge verification failed"}

  def error_info(:challenge_already_used),
    do: {401, "auth_failed", "Challenge verification failed"}

  def error_info(:invalid_signature),
    do: {401, "auth_failed", "Challenge verification failed"}

  def error_info(:device_not_found),
    do: {401, "auth_failed", "Challenge verification failed"}

  def error_info(:device_revoked),
    do: {401, "auth_failed", "Challenge verification failed"}

  # Session management
  def error_info(:not_found),
    do: {404, "not_found", "Resource not found"}

  def error_info(:unauthorized),
    do: {401, "unauthorized", "Authentication required"}

  def error_info(:forbidden),
    do: {403, "forbidden", "You do not have permission to perform this action"}

  # Invites
  def error_info(:invite_revoked),
    do: {410, "invite_revoked", "This invite has been revoked"}

  def error_info(:invite_expired),
    do: {410, "invite_expired", "This invite has expired"}

  def error_info(:invite_exhausted),
    do: {410, "invite_exhausted", "This invite has reached its maximum uses"}

  def error_info(:already_member),
    do: {409, "already_member", "You are already a member of this server"}

  def error_info(:server_full),
    do: {403, "server_full", "This server has reached its maximum member limit"}

  # Friends
  def error_info(:already_friends),
    do: {409, "already_friends", "You are already friends with this user"}

  def error_info(:already_pending),
    do: {409, "already_pending", "A friend request is already pending"}

  def error_info(:blocked),
    do: {403, "blocked", "This action is not available for this user"}

  # Trust system
  def error_info(:insufficient_trust),
    do: {403, "insufficient_trust", "Your account does not meet the trust tier required for this action"}

  def error_info(:server_limit_reached),
    do: {403, "server_limit_reached", "You have reached the maximum number of servers for your trust tier"}

  def error_info(:cooldown_active),
    do: {429, "cooldown_active", "This action is on cooldown. Please wait before trying again"}

  # Reactions & Pins
  def error_info(:already_reacted),
    do: {409, "already_reacted", "You have already reacted with this emoji"}

  def error_info(:already_pinned),
    do: {409, "already_pinned", "This message is already pinned"}

  def error_info(:pin_limit_reached),
    do: {400, "pin_limit_reached", "This channel has reached the maximum number of pinned messages (50)"}

  # Bans & Timeouts
  def error_info(:banned),
    do: {403, "banned", "You are banned from this server"}

  def error_info(:timed_out),
    do: {403, "timed_out", "You are timed out and cannot perform this action"}

  def error_info(:links_not_allowed),
    do: {403, "links_not_allowed", "New accounts cannot post links. Build trust by participating first"}

  def error_info(:no_recovery_key),
    do: {404, "no_recovery_key", "No active recovery key found. Generate one first"}

  def error_info(:already_confirmed),
    do: {409, "already_confirmed", "Recovery key has already been confirmed"}

  def error_info(:invalid_mnemonic),
    do: {422, "invalid_mnemonic", "Recovery phrase does not match"}

  # Uploads
  def error_info(:file_too_large),
    do: {413, "file_too_large", "File exceeds the maximum allowed size (2 MB)"}

  def error_info(:invalid_file_type),
    do: {422, "invalid_file_type", "File type not allowed. Use PNG, JPEG, WebP, or GIF"}

  def error_info(:already_banned),
    do: {409, "already_banned", "This user is already banned from the server"}

  # WebAuthn
  def error_info(:username_taken),
    do: {409, "username_taken", "This username is already registered"}

  def error_info(:credential_not_found),
    do: {401, "auth_failed", "Passkey verification failed"}

  def error_info(:credential_revoked),
    do: {401, "auth_failed", "Passkey verification failed"}

  def error_info(:invalid_attestation),
    do: {422, "invalid_attestation", "Passkey registration response was invalid"}

  def error_info(:invalid_assertion),
    do: {422, "invalid_assertion", "Passkey authentication response was invalid"}

  def error_info(:challenge_mismatch),
    do: {401, "auth_failed", "Passkey verification failed"}

  def error_info(:invalid_origin),
    do: {401, "auth_failed", "Passkey verification failed"}

  def error_info(:age_not_verified),
    do: {422, "age_not_verified", "You must confirm you are at least 13 years old"}

  def error_info(:tos_not_accepted),
    do: {422, "tos_not_accepted", "You must accept the Terms of Service"}

  # Catch-all
  def error_info(reason) when is_atom(reason),
    do: {422, to_string(reason), "Request could not be processed"}

  def error_info(_),
    do: {500, "internal_error", "An unexpected error occurred"}
end
