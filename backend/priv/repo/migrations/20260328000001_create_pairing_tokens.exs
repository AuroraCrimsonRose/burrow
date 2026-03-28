defmodule Burrow.Repo.Migrations.CreatePairingTokens do
  use Ecto.Migration

  def change do
    create table(:pairing_tokens, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :new_device_key_id, references(:device_keys, type: :bigint, on_delete: :nilify_all)
      add :token_hash, :binary, null: false
      add :code, :string, null: false, size: 20
      add :method, :string, null: false, size: 10
      add :expires_at, :utc_datetime_usec, null: false
      add :used_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:pairing_tokens, [:token_hash])
    create unique_index(:pairing_tokens, [:code])
    create index(:pairing_tokens, [:user_id])
    create index(:pairing_tokens, [:expires_at])
  end
end
