defmodule Burrow.Communities.ServerMember do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "server_members" do
    field :nickname, :string
    field :server_avatar_url, :string
    field :joined_at, :utc_datetime_usec
    field :timed_out_until, :utc_datetime
    field :bio, :string
    field :pronouns, :string

    belongs_to :server, Burrow.Communities.Server, type: :integer
    belongs_to :user, Burrow.Auth.User, type: :integer

    many_to_many :roles, Burrow.Communities.Role,
      join_through: "member_roles",
      join_keys: [server_member_id: :id, role_id: :id]
  end

  def changeset(member, attrs) do
    member
    |> cast(attrs, [:id, :server_id, :user_id, :nickname, :server_avatar_url, :joined_at, :timed_out_until, :bio, :pronouns])
    |> validate_required([:id, :server_id, :user_id, :joined_at])
    |> validate_length(:nickname, max: 32)
    |> validate_length(:bio, max: 256)
    |> validate_length(:pronouns, max: 32)
    |> unique_constraint([:server_id, :user_id])
    |> foreign_key_constraint(:server_id)
    |> foreign_key_constraint(:user_id)
  end
end
