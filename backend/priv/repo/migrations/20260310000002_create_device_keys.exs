defmodule Burrow.Repo.Migrations.CreateDeviceKeys do
  use Ecto.Migration

  def change do
    create table(:device_keys, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :public_key_ed25519, :binary, null: false
      add :device_fingerprint_hash, :string, null: false
      add :device_label, :string
      add :last_used_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    # A given public key can only be registered once globally
    create unique_index(:device_keys, [:public_key_ed25519])
    create index(:device_keys, [:user_id])

    # Soft-delete: revoked keys stay in the table for audit trail
    add_revoked_at()
  end

  defp add_revoked_at do
    alter table(:device_keys) do
      add :revoked_at, :utc_datetime_usec
    end
  end
end
