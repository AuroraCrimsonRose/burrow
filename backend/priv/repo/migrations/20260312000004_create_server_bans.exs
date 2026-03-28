defmodule Burrow.Repo.Migrations.CreateServerBans do
  use Ecto.Migration

  def change do
    create table(:server_bans, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :banned_by, references(:users, type: :bigint, on_delete: :nilify_all)
      add :reason, :text
      add :expires_at, :utc_datetime, null: true
      add :message_purge_window, :string, null: true

      timestamps()
    end

    create unique_index(:server_bans, [:server_id, :user_id])
    create index(:server_bans, [:server_id])
    create index(:server_bans, [:user_id])

    # Timeout field on server_members — null means not timed out
    alter table(:server_members) do
      add :timed_out_until, :utc_datetime, null: true
    end
  end
end
