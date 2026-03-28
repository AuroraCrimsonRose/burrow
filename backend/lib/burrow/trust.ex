defmodule Burrow.Trust do
  @moduledoc """
  Progressive trust & reputation system.

  Trust tiers control what actions a user can perform:

  | Tier | Score  | Key unlocks                                     |
  |------|--------|-------------------------------------------------|
  |  0   |  0–15  | Read + send (5/min), react, join ≤3 servers      |
  |  1   | 16–40  | DMs (text, 10/hr), join ≤10 servers              |
  |  2   | 41–70  | Unrestricted DMs, files (10MB), create invites   |
  |  3   | 71–90  | Create servers, discovery, files (25MB)           |
  |  4   | 91–100 | Max rate limits, vouching, files (100MB)          |
  |  5   |  dev   | All permissions, no limits (platform developers)  |

  Trust score is computed from account age, message activity, reactions
  received, and moderation history. It is recalculated on key events and
  stored denormalized on the users table for fast lookup.
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Auth.User
  alias Burrow.Trust.TrustEvent
  alias Burrow.Snowflake

  # ---------------------------------------------------------------------------
  # Tier thresholds
  # ---------------------------------------------------------------------------

  @tier_thresholds [
    {0, 0},
    {1, 16},
    {2, 41},
    {3, 71},
    {4, 91}
  ]

  # ---------------------------------------------------------------------------
  # Server join limits per tier
  # ---------------------------------------------------------------------------

  @max_servers %{0 => 3, 1 => 10, 2 => 50, 3 => 100, 4 => 200, 5 => 10_000}

  # ---------------------------------------------------------------------------
  # Message rate limits per tier (per minute)
  # ---------------------------------------------------------------------------

  @msg_rate_limits %{0 => 5, 1 => 15, 2 => 30, 3 => 60, 4 => 120, 5 => 1000}

  # ---------------------------------------------------------------------------
  # Cooldown durations
  # ---------------------------------------------------------------------------

  # Minutes after account creation before first message
  @first_message_cooldown_minutes 5
  # Minutes between server joins at Tier 0
  @join_cooldown_minutes 10

  # ---------------------------------------------------------------------------
  # Trust tier from score
  # ---------------------------------------------------------------------------

  @doc "Compute trust tier (0-4) from a raw trust score."
  def tier_for_score(score) when is_integer(score) do
    @tier_thresholds
    |> Enum.reverse()
    |> Enum.find_value(0, fn {tier, threshold} ->
      if score >= threshold, do: tier
    end)
  end

  # ---------------------------------------------------------------------------
  # Trust gates — check if a user can perform an action
  # ---------------------------------------------------------------------------

  @doc """
  Check if a user can create a server. Requires Tier 3+.
  Returns :ok or {:error, :insufficient_trust}.
  """
  def can_create_server?(user_id) do
    gate(user_id, 3)
  end

  @doc "Check if a user can send DMs. Requires Tier 0+ (available to all users)."
  def can_send_dm?(user_id) do
    gate(user_id, 0)
  end

  @doc "Check if a user can upload files. Requires Tier 2+."
  def can_upload_files?(user_id) do
    gate(user_id, 2)
  end

  @doc "Check if a user can create invite links. Requires Tier 2+."
  def can_create_invite?(user_id) do
    gate(user_id, 2)
  end

  @doc "Check if a user can use server discovery. Requires Tier 3+."
  def can_use_discovery?(user_id) do
    gate(user_id, 3)
  end

  @doc """
  Check if a user can join another server, considering both tier-based
  max server count and Tier 0 join cooldown.
  """
  def can_join_server?(user_id) do
    with :ok <- check_server_limit(user_id),
         :ok <- check_join_cooldown(user_id) do
      :ok
    end
  end

  @doc """
  Check if a user can send a message, considering the first-message
  cooldown for brand-new accounts.
  """
  def can_send_message?(user_id) do
    check_first_message_cooldown(user_id)
  end

  @doc "Get the message rate limit (per minute) for a user."
  def message_rate_limit(user_id) do
    tier = get_tier(user_id)
    Map.get(@msg_rate_limits, tier, 5)
  end

  @doc "Get the max file upload size in bytes for a user."
  def max_upload_bytes(user_id) do
    case get_tier(user_id) do
      t when t <= 1 -> 0
      2 -> 10 * 1_048_576
      3 -> 25 * 1_048_576
      _ -> 100 * 1_048_576
    end
  end

  # ---------------------------------------------------------------------------
  # Score computation — recalculate from factors
  # ---------------------------------------------------------------------------

  @doc """
  Recalculate a user's trust score from all factors and update the
  users table. Returns {:ok, user} with updated score and tier.
  """
  def recalculate(user_id) do
    user = Repo.get!(User, user_id)

    if user.is_dev do
      user
      |> Ecto.Changeset.change(%{trust_score: 100, trust_tier: 5})
      |> Repo.update()
    else
      score = compute_score(user)
      tier = tier_for_score(score)

      user
      |> Ecto.Changeset.change(%{trust_score: score, trust_tier: tier})
      |> Repo.update()
    end
  end

  @doc """
  Record a trust event (positive or negative) and update the user's
  score and tier. Used for moderation actions.
  """
  def record_event(user_id, event_type, delta, metadata \\ %{}) do
    user = Repo.get!(User, user_id)
    old_score = user.trust_score
    new_score = clamp(old_score + delta, 0, 100)
    new_tier = tier_for_score(new_score)

    Repo.transaction(fn ->
      Repo.insert!(%TrustEvent{
        id: Snowflake.next_id(),
        user_id: user_id,
        event_type: event_type,
        delta: delta,
        score_before: old_score,
        score_after: new_score,
        metadata: metadata
      })

      {:ok, updated} =
        user
        |> Ecto.Changeset.change(%{trust_score: new_score, trust_tier: new_tier})
        |> Repo.update()

      updated
    end)
  end

  @doc "Get a user's trust event history."
  def list_events(user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 50)

    TrustEvent
    |> where([e], e.user_id == ^user_id)
    |> order_by([e], desc: e.inserted_at)
    |> limit(^limit)
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Cooldown management
  # ---------------------------------------------------------------------------

  @doc "Record a server join for Tier 0 cooldown tracking."
  def record_join_cooldown(user_id) do
    if get_tier(user_id) == 0 do
      cooldown_until = DateTime.add(DateTime.utc_now(), @join_cooldown_minutes * 60, :second)

      Repo.insert!(%Burrow.Trust.Cooldown{
        id: Snowflake.next_id(),
        user_id: user_id,
        action_type: "join_server",
        cooldown_until: cooldown_until
      })
    end

    :ok
  end

  # ---------------------------------------------------------------------------
  # Internal helpers
  # ---------------------------------------------------------------------------

  defp get_tier(user_id) do
    case User
         |> where([u], u.id == ^user_id)
         |> select([u], {u.trust_tier, u.is_dev})
         |> Repo.one() do
      {_tier, true} -> 5
      {tier, _} when is_integer(tier) -> tier
      _ -> 0
    end
  end

  defp gate(user_id, required_tier) do
    if get_tier(user_id) >= required_tier do
      :ok
    else
      {:error, :insufficient_trust}
    end
  end

  defp check_server_limit(user_id) do
    tier = get_tier(user_id)
    max = Map.get(@max_servers, tier, 3)

    count =
      Burrow.Communities.ServerMember
      |> where([m], m.user_id == ^user_id)
      |> Repo.aggregate(:count)

    if count < max do
      :ok
    else
      {:error, :server_limit_reached}
    end
  end

  defp check_join_cooldown(user_id) do
    if get_tier(user_id) > 0 do
      :ok
    else
      now = DateTime.utc_now()

      active_cooldown =
        Burrow.Trust.Cooldown
        |> where([c], c.user_id == ^user_id and c.action_type == "join_server" and c.cooldown_until > ^now)
        |> Repo.one()

      if active_cooldown do
        {:error, :cooldown_active}
      else
        :ok
      end
    end
  end

  defp check_first_message_cooldown(user_id) do
    user = Repo.get!(User, user_id)
    min_time = DateTime.add(user.inserted_at, @first_message_cooldown_minutes * 60, :second)

    if DateTime.compare(DateTime.utc_now(), min_time) == :lt do
      {:error, :cooldown_active}
    else
      :ok
    end
  end

  defp compute_score(%User{} = user) do
    age_score = account_age_score(user.inserted_at)
    message_score = message_activity_score(user.id)
    reaction_score = reaction_score(user.id)
    mod_penalty = moderation_penalty(user.id)

    raw = age_score + message_score + reaction_score - mod_penalty
    clamp(round(raw), 0, 100)
  end

  # Logarithmic account age: ~10pts at 1 day, ~25pts at 1 week, ~40pts at 1 month, ~55pts at 6 months
  defp account_age_score(created_at) do
    hours = DateTime.diff(DateTime.utc_now(), created_at, :hour) |> max(0)

    if hours == 0 do
      0.0
    else
      10.0 * :math.log2(hours / 24 + 1)
    end
  end

  # Message activity: up to 30 points, diminishing returns
  defp message_activity_score(user_id) do
    count =
      Burrow.Chat.Message
      |> where([m], m.author_id == ^user_id and m.deleted == false)
      |> Repo.aggregate(:count)

    # log2(count+1) * 5, capped at 30
    min(5.0 * :math.log2(count + 1), 30.0)
  end

  # Reactions received: future placeholder — returns 0 until reactions are built
  defp reaction_score(_user_id), do: 0.0

  # Moderation penalties: each ban = -15, kick = -10, timeout = -5
  defp moderation_penalty(user_id) do
    events =
      TrustEvent
      |> where([e], e.user_id == ^user_id and e.delta < 0)
      |> select([e], sum(e.delta))
      |> Repo.one()

    abs(events || 0)
  end

  defp clamp(val, min_val, max_val) do
    val |> max(min_val) |> min(max_val)
  end
end
