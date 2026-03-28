defmodule Burrow.Repo.Migrations.CreateWebauthnCredentials do
  use Ecto.Migration

  def change do
    create table(:webauthn_credentials, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :credential_id, :binary, null: false
      add :public_key, :binary, null: false
      add :algorithm, :integer, null: false
      add :sign_count, :integer, null: false, default: 0
      add :label, :string
      add :last_used_at, :utc_datetime_usec
      add :revoked_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:webauthn_credentials, [:credential_id])
    create index(:webauthn_credentials, [:user_id])
  end
end
