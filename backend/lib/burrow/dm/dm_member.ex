defmodule Burrow.DM.DmMember do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "dm_members" do
    belongs_to :dm_channel, Burrow.DM.DmChannel, type: :integer
    belongs_to :user, Burrow.Auth.User, type: :integer

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(member, attrs) do
    member
    |> cast(attrs, [:dm_channel_id, :user_id])
    |> validate_required([:dm_channel_id, :user_id])
    |> unique_constraint([:dm_channel_id, :user_id])
    |> foreign_key_constraint(:dm_channel_id)
    |> foreign_key_constraint(:user_id)
  end
end
