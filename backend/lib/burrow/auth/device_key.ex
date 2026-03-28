defmodule Burrow.Auth.DeviceKey do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "device_keys" do
    belongs_to :user, Burrow.Auth.User

    field :public_key_ed25519, :binary
    field :device_fingerprint_hash, :string
    field :device_label, :string
    field :last_used_at, :utc_datetime_usec
    field :revoked_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(device_key, attrs) do
    device_key
    |> cast(attrs, [:id, :user_id, :public_key_ed25519, :device_fingerprint_hash, :device_label])
    |> validate_required([:id, :user_id, :public_key_ed25519, :device_fingerprint_hash])
    |> validate_ed25519_key()
    |> unique_constraint(:public_key_ed25519)
    |> foreign_key_constraint(:user_id)
  end

  defp validate_ed25519_key(changeset) do
    validate_change(changeset, :public_key_ed25519, fn :public_key_ed25519, value ->
      if is_binary(value) and byte_size(value) == 32 do
        []
      else
        [public_key_ed25519: "must be 32 bytes (Ed25519)"]
      end
    end)
  end
end
