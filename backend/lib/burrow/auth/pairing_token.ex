defmodule Burrow.Auth.PairingToken do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "pairing_tokens" do
    belongs_to :user, Burrow.Auth.User
    belongs_to :new_device_key, Burrow.Auth.DeviceKey

    field :token_hash, :binary
    field :code, :string
    field :method, :string
    field :expires_at, :utc_datetime_usec
    field :used_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(token, attrs) do
    token
    |> cast(attrs, [:id, :user_id, :token_hash, :code, :method, :expires_at])
    |> validate_required([:id, :user_id, :token_hash, :code, :method, :expires_at])
    |> validate_inclusion(:method, ~w(qr code))
    |> unique_constraint(:token_hash)
    |> unique_constraint(:code)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:new_device_key_id)
  end
end
