defmodule Burrow.Repo.Migrations.CreateUserSessions do
  use Ecto.Migration

  def change do
    create table(:user_sessions, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :device_key_id, references(:device_keys, type: :bigint, on_delete: :nilify_all)
      add :token_hash, :binary, null: false
      add :device_type, :string
      add :os, :string
      add :browser, :string
      add :ip, :string
      add :city, :string
      add :country, :string
      add :first_active, :utc_datetime_usec, null: false
      add :last_active, :utc_datetime_usec, null: false
      add :trusted, :boolean, null: false, default: false
      add :revoked_at, :utc_datetime_usec
    end

    create unique_index(:user_sessions, [:token_hash])
    create index(:user_sessions, [:user_id])
    create index(:user_sessions, [:device_key_id])
  end
end
