defmodule Burrow.Profiles.UserBadge do
  use Ecto.Schema

  @primary_key {:id, :integer, autogenerate: false}
  schema "user_badges" do
    belongs_to :user, Burrow.Auth.User
    belongs_to :badge, Burrow.Profiles.Badge
    field :granted_at, :utc_datetime_usec
    field :granted_by, :integer
  end
end
