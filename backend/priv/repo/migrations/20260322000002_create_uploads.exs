defmodule Burrow.Repo.Migrations.CreateUploads do
  use Ecto.Migration

  def change do
    create table(:uploads, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :key, :string, null: false
      add :filename, :string, null: false
      add :content_type, :string, null: false
      add :size, :bigint, null: false, default: 0
      add :permanent, :boolean, null: false, default: false
      add :expires_at, :utc_datetime_usec, null: false

      # Scan pipeline fields
      add :scan_status, :string, null: false, default: "pending"
      add :mime_verified, :string
      add :virus_result, :string
      add :csam_result, :string
      add :sha256, :string
      add :scanned_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:uploads, [:user_id])
    create index(:uploads, [:expires_at])
    create index(:uploads, [:scan_status])
    create unique_index(:uploads, [:key])
    create index(:uploads, [:sha256])
  end
end
