defmodule Burrow.Communities.Role do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "roles" do
    field :name, :string
    field :color, :string
    field :position, :integer
    field :permissions, Burrow.Ecto.BigBitfield
    field :hoist, :boolean, default: false
    field :mentionable, :boolean, default: false

    belongs_to :server, Burrow.Communities.Server, type: :integer

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(role, attrs) do
    role
    |> cast(attrs, [:id, :name, :color, :position, :permissions, :hoist, :mentionable, :server_id])
    |> validate_required([:id, :name, :server_id, :position, :permissions])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_format(:color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a hex color like #FF5733")
    |> foreign_key_constraint(:server_id)
  end
end
