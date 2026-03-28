defmodule BurrowWeb.ErrorJSON do
  @moduledoc """
  Renders error responses for unhandled exceptions and Phoenix error pages.

  All errors follow the standard Burrow error shape:

      %{"error" => "error_code", "detail" => "Human-readable message"}
  """

  def render("400.json", _assigns) do
    %{error: "bad_request", detail: "The request was malformed or missing required fields"}
  end

  def render("401.json", _assigns) do
    %{error: "unauthorized", detail: "Authentication required"}
  end

  def render("403.json", _assigns) do
    %{error: "forbidden", detail: "You do not have permission to perform this action"}
  end

  def render("404.json", _assigns) do
    %{error: "not_found", detail: "The requested resource was not found"}
  end

  def render("422.json", _assigns) do
    %{error: "unprocessable_entity", detail: "The request could not be processed"}
  end

  def render("500.json", _assigns) do
    %{error: "internal_error", detail: "An unexpected error occurred"}
  end

  def render(template, _assigns) do
    %{error: "error", detail: Phoenix.Controller.status_message_from_template(template)}
  end
end
