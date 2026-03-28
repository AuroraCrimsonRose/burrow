defmodule BurrowWeb.ErrorJSONTest do
  use BurrowWeb.ConnCase, async: true

  test "renders 404" do
    assert BurrowWeb.ErrorJSON.render("404.json", %{}) == %{
             error: "not_found",
             detail: "The requested resource was not found"
           }
  end

  test "renders 500" do
    assert BurrowWeb.ErrorJSON.render("500.json", %{}) == %{
             error: "internal_error",
             detail: "An unexpected error occurred"
           }
  end
end
