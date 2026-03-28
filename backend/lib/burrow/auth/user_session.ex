defmodule Burrow.Auth.UserSession do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "user_sessions" do
    belongs_to :user, Burrow.Auth.User
    belongs_to :device_key, Burrow.Auth.DeviceKey

    field :token_hash, :binary
    field :device_type, :string
    field :os, :string
    field :browser, :string
    field :ip, :string
    field :city, :string
    field :country, :string
    field :first_active, :utc_datetime_usec
    field :last_active, :utc_datetime_usec
    field :trusted, :boolean, default: false
    field :revoked_at, :utc_datetime_usec
  end

  def changeset(session, attrs) do
    session
    |> cast(attrs, [
      :id, :user_id, :device_key_id, :token_hash,
      :device_type, :os, :browser, :ip, :city, :country,
      :first_active, :last_active, :trusted
    ])
    |> validate_required([:id, :user_id, :token_hash, :first_active, :last_active])
    |> unique_constraint(:token_hash)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:device_key_id)
  end
end
