defmodule BurrowWeb.StatsController do
  use BurrowWeb, :controller

  alias Burrow.Auth
  alias Burrow.Communities
  alias Burrow.Chat

  action_fallback BurrowWeb.FallbackController

  def platform(conn, _params) do
    json(conn, %{
      users: Auth.count_users(),
      servers: Communities.count_servers(),
      members: Communities.count_members(),
      messages: Chat.count_messages()
    })
  end
end
