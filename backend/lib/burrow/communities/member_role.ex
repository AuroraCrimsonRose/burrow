defmodule Burrow.Communities.MemberRole do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "member_roles" do
    belongs_to :server_member, Burrow.Communities.ServerMember, type: :integer
    belongs_to :role, Burrow.Communities.Role, type: :integer
  end

  def changeset(mr, attrs) do
    mr
    |> cast(attrs, [:server_member_id, :role_id])
    |> validate_required([:server_member_id, :role_id])
    |> unique_constraint([:server_member_id, :role_id])
    |> foreign_key_constraint(:server_member_id)
    |> foreign_key_constraint(:role_id)
  end
end
