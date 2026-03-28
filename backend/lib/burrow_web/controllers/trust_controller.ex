defmodule BurrowWeb.TrustController do
  use BurrowWeb, :controller

  alias Burrow.Trust

  action_fallback BurrowWeb.FallbackController

  @tier_names %{
    0 => "New",
    1 => "Verified",
    2 => "Trusted",
    3 => "Established",
    4 => "Veteran"
  }

  # GET /api/v1/trust
  def show(conn, _params) do
    user_id = conn.assigns.current_user_id
    user = Burrow.Repo.get!(Burrow.Auth.User, user_id)

    json(conn, %{
      trust_score: user.trust_score,
      trust_tier: user.trust_tier,
      tier_name: Map.get(@tier_names, user.trust_tier, "Unknown"),
      limits: %{
        max_servers: tier_server_limit(user.trust_tier),
        max_upload_bytes: Trust.max_upload_bytes(user_id),
        msg_per_minute: Trust.message_rate_limit(user_id),
        can_send_dm: user.trust_tier >= 1,
        can_upload_files: user.trust_tier >= 2,
        can_create_invites: user.trust_tier >= 2,
        can_create_servers: user.trust_tier >= 3,
        can_use_discovery: user.trust_tier >= 3
      }
    })
  end

  # POST /api/v1/trust/recalculate
  def recalculate(conn, _params) do
    user_id = conn.assigns.current_user_id

    {:ok, user} = Trust.recalculate(user_id)

    json(conn, %{
      trust_score: user.trust_score,
      trust_tier: user.trust_tier,
      tier_name: Map.get(@tier_names, user.trust_tier, "Unknown")
    })
  end

  defp tier_server_limit(0), do: 3
  defp tier_server_limit(1), do: 10
  defp tier_server_limit(2), do: 50
  defp tier_server_limit(3), do: 100
  defp tier_server_limit(_), do: 200
end
