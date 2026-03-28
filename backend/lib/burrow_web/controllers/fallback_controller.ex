defmodule BurrowWeb.FallbackController do
  @moduledoc """
  Handles error tuples returned by controller actions.

  When a controller uses `action_fallback BurrowWeb.FallbackController`,
  any `{:error, ...}` return value is routed here instead of crashing.
  """

  use BurrowWeb, :controller
  alias BurrowWeb.ErrorHelpers

  # Handle Ecto changeset validation errors.
  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "validation_error",
      detail: "One or more fields are invalid",
      fields: ErrorHelpers.format_changeset_errors(changeset)
    })
  end

  # Handle rate limit errors with retry_after (must be before atom clause).
  def call(conn, {:error, {:rate_limited, retry_after}}) do
    conn
    |> put_resp_header("retry-after", Integer.to_string(retry_after))
    |> put_status(429)
    |> json(%{
      error: "rate_limited",
      detail: "Too many requests. Please wait before trying again.",
      retry_after: retry_after
    })
  end

  # Handle known domain error atoms.
  def call(conn, {:error, reason}) when is_atom(reason) do
    {status, code, detail} = ErrorHelpers.error_info(reason)

    conn
    |> put_status(status)
    |> json(%{error: code, detail: detail})
  end

  # Handle string error messages.
  def call(conn, {:error, message}) when is_binary(message) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "error", detail: message})
  end

  # Catch-all for unexpected error shapes.
  def call(conn, {:error, _reason}) do
    conn
    |> put_status(:internal_server_error)
    |> json(%{error: "internal_error", detail: "An unexpected error occurred"})
  end

end
