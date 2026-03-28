defmodule Burrow.DM.DmChannel do
  use Ecto.Schema
  import Ecto.Changeset

  @dm_types ~w(dm group_dm)

  @primary_key {:id, :integer, autogenerate: false}
  schema "dm_channels" do
    field :type, :string, default: "dm"
    field :last_seq, :integer, default: 0

    has_many :members, Burrow.DM.DmMember, foreign_key: :dm_channel_id

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(dm_channel, attrs) do
    dm_channel
    |> cast(attrs, [:id, :type])
    |> validate_required([:id])
    |> validate_inclusion(:type, @dm_types)
  end
end
