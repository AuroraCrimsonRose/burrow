defmodule BurrowWeb.AnalyticsController do
  use BurrowWeb, :controller

  alias Burrow.Analytics

  action_fallback BurrowWeb.FallbackController

  def topology(conn, _params) do
    user_id = conn.assigns.current_user_id
    activity = Analytics.get_topology_activity(user_id)
    json(conn, %{activity: activity})
  end
end
