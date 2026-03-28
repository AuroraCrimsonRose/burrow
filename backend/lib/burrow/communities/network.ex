defmodule Burrow.Communities.Network do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "networks" do
    field :name, :string

    belongs_to :owner, Burrow.Auth.User, type: :integer

    many_to_many :servers, Burrow.Communities.Server,
      join_through: "network_servers",
      join_keys: [network_id: :id, server_id: :id]

    timestamps(type: :utc_datetime_usec)
  end

  def create_changeset(network, attrs) do
    network
    |> cast(attrs, [:id, :name, :owner_id])
    |> validate_required([:id, :name, :owner_id])
    |> validate_length(:name, min: 1, max: 100)
    |> foreign_key_constraint(:owner_id)
  end

  def update_changeset(network, attrs) do
    network
    |> cast(attrs, [:name])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 100)
  end
end
