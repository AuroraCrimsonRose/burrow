defmodule Burrow.Communities.Category do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "categories" do
    field :name, :string
    field :position, :integer

    belongs_to :server, Burrow.Communities.Server, type: :integer

    has_many :channels, Burrow.Communities.Channel

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(category, attrs) do
    category
    |> cast(attrs, [:id, :name, :position, :server_id])
    |> validate_required([:id, :name, :server_id])
    |> validate_length(:name, min: 1, max: 100)
    |> foreign_key_constraint(:server_id)
  end
end
