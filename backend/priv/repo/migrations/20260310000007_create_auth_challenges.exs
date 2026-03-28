defmodule Burrow.Repo.Migrations.CreateAuthChallenges do
  use Ecto.Migration

  def change do
    create table(:auth_challenges, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :nonce, :binary, null: false
      add :expires_at, :utc_datetime_usec, null: false
      add :used, :boolean, null: false, default: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:auth_challenges, [:user_id])
    create index(:auth_challenges, [:expires_at])
  end
end
