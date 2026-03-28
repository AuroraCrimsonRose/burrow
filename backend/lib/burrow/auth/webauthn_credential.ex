defmodule Burrow.Auth.WebAuthnCredential do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "webauthn_credentials" do
    belongs_to :user, Burrow.Auth.User

    field :credential_id, :binary
    field :public_key, :binary
    field :algorithm, :integer
    field :sign_count, :integer, default: 0
    field :label, :string
    field :last_used_at, :utc_datetime_usec
    field :revoked_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(cred, attrs) do
    cred
    |> cast(attrs, [:id, :user_id, :credential_id, :public_key, :algorithm, :sign_count, :label])
    |> validate_required([:id, :user_id, :credential_id, :public_key, :algorithm])
    |> unique_constraint(:credential_id)
    |> foreign_key_constraint(:user_id)
  end
end
