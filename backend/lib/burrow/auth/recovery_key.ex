defmodule Burrow.Auth.RecoveryKey do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "account_recovery_keys" do
    belongs_to :user, Burrow.Auth.User
    field :recovery_key_hash, :binary
    field :confirmation_completed, :boolean, default: false
    field :last_used_at, :utc_datetime_usec
    field :invalidated_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(recovery_key, attrs) do
    recovery_key
    |> cast(attrs, [:id, :user_id, :recovery_key_hash, :confirmation_completed, :last_used_at, :invalidated_at])
    |> validate_required([:id, :user_id, :recovery_key_hash])
  end
end
