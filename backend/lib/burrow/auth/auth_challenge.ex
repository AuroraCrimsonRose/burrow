defmodule Burrow.Auth.AuthChallenge do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "auth_challenges" do
    belongs_to :user, Burrow.Auth.User

    field :nonce, :binary
    field :expires_at, :utc_datetime_usec
    field :used, :boolean, default: false

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(challenge, attrs) do
    challenge
    |> cast(attrs, [:id, :user_id, :nonce, :expires_at])
    |> validate_required([:id, :user_id, :nonce, :expires_at])
    |> foreign_key_constraint(:user_id)
  end
end
