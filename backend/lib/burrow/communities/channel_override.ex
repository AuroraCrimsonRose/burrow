defmodule Burrow.Communities.ChannelOverride do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: false}
  schema "channel_overrides" do
    field :target_type, :string
    field :target_id, :integer
    field :allow, Burrow.Ecto.BigBitfield, default: 0
    field :deny, Burrow.Ecto.BigBitfield, default: 0

    belongs_to :channel, Burrow.Communities.Channel, type: :integer
  end

  def changeset(override, attrs) do
    override
    |> cast(attrs, [:id, :channel_id, :target_type, :target_id, :allow, :deny])
    |> validate_required([:id, :channel_id, :target_type, :target_id])
    |> validate_inclusion(:target_type, ~w(role user everyone))
    |> unique_constraint([:channel_id, :target_type, :target_id])
  end
end
