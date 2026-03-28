defmodule Burrow.Repo.Migrations.CreateAccountCooldowns do
  use Ecto.Migration

  def change do
    create table(:account_cooldowns, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :action_type, :string, null: false
      add :cooldown_until, :utc_datetime_usec, null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:account_cooldowns, [:user_id, :action_type])
    create index(:account_cooldowns, [:cooldown_until])
  end
end
