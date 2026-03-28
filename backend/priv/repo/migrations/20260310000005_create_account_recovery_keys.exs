defmodule Burrow.Repo.Migrations.CreateAccountRecoveryKeys do
  use Ecto.Migration

  def change do
    create table(:account_recovery_keys, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :recovery_key_hash, :binary, null: false
      add :confirmation_completed, :boolean, null: false, default: false
      add :last_used_at, :utc_datetime_usec
      add :invalidated_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    # Only one active recovery key per user
    create unique_index(:account_recovery_keys, [:user_id],
      where: "invalidated_at IS NULL",
      name: :account_recovery_keys_active_user_idx
    )
  end
end
