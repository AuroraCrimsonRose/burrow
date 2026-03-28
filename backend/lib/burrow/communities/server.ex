defmodule Burrow.Communities.Server do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "servers" do
    field :name, :string
    field :description, :string
    field :icon_url, :string
    field :banner_url, :string

    belongs_to :owner, Burrow.Auth.User, type: :integer

    has_many :roles, Burrow.Communities.Role
    has_many :categories, Burrow.Communities.Category
    has_many :channels, Burrow.Communities.Channel
    has_many :members, Burrow.Communities.ServerMember
    has_many :invites, Burrow.Communities.Invite

    timestamps(type: :utc_datetime_usec)
  end

  def create_changeset(server, attrs) do
    server
    |> cast(attrs, [:id, :name, :description, :icon_url, :owner_id])
    |> validate_required([:id, :name, :owner_id])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:description, max: 1024)
    |> foreign_key_constraint(:owner_id)
  end

  def update_changeset(server, attrs) do
    server
    |> cast(attrs, [:name, :description, :icon_url, :banner_url])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:description, max: 1024)
  end
end
