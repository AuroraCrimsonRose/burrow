defmodule Burrow.Repo.Migrations.CreatePowRecords do
  use Ecto.Migration

  def change do
    create table(:pow_records, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :public_key, :binary, null: false
      add :nonce, :string, null: false
      add :hash_result, :string, null: false
      add :difficulty_prefix, :string, null: false
      add :verified_at, :utc_datetime_usec, null: false
    end

    create unique_index(:pow_records, [:user_id])
    # Prevent replay: same nonce+key can't be submitted twice
    create unique_index(:pow_records, [:public_key, :nonce])
  end
end
