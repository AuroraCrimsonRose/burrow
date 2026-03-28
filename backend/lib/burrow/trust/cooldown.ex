defmodule Burrow.Trust.Cooldown do
  use Ecto.Schema

  @primary_key {:id, :integer, autogenerate: false}
  schema "account_cooldowns" do
    field :user_id, :integer
    field :action_type, :string
    field :cooldown_until, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
