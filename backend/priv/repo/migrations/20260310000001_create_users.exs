defmodule Burrow.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    execute "CREATE EXTENSION IF NOT EXISTS citext", "SELECT 1"

    create table(:users, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :username, :citext, null: false
      add :display_name, :string
      add :avatar_url, :string
      add :account_type, :string, null: false, default: "personal"
      add :email, :string
      add :phone, :string
      add :totp_secret_enc, :binary
      add :totp_enabled, :boolean, null: false, default: false
      add :mfa_enabled, :boolean, null: false, default: false
      add :trust_score, :integer, null: false, default: 0
      add :trust_tier, :integer, null: false, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:users, [:username])
    create index(:users, [:email], where: "email IS NOT NULL", unique: true)
    create index(:users, [:trust_tier])
  end
end
