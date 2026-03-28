defmodule Burrow.Communities.Invite do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:code, :string, autogenerate: false}
  schema "invites" do
    field :max_uses, :integer
    field :uses_count, :integer, default: 0
    field :expires_at, :utc_datetime_usec
    field :revoked_at, :utc_datetime_usec

    belongs_to :server, Burrow.Communities.Server, type: :integer
    belongs_to :channel, Burrow.Communities.Channel, type: :integer
    belongs_to :inviter, Burrow.Auth.User, type: :integer, foreign_key: :inviter_id

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(invite, attrs) do
    invite
    |> cast(attrs, [:code, :server_id, :channel_id, :inviter_id, :max_uses, :expires_at])
    |> validate_required([:code, :server_id, :inviter_id])
    |> validate_length(:code, min: 6, max: 16)
    |> foreign_key_constraint(:server_id)
    |> foreign_key_constraint(:inviter_id)
  end
end
