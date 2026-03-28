defmodule Burrow.Repo.Migrations.CreateBadges do
  use Ecto.Migration

  def change do
    create table(:badges, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :name, :string, null: false, size: 64
      add :icon, :string, null: false, size: 8
      add :description, :string, size: 256
      add :color, :string, size: 7
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:badges, [:name])

    create table(:user_badges, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :badge_id, references(:badges, type: :bigint, on_delete: :delete_all), null: false
      add :granted_at, :utc_datetime_usec, null: false
      add :granted_by, references(:users, type: :bigint, on_delete: :nilify_all)
    end

    create unique_index(:user_badges, [:user_id, :badge_id])
    create index(:user_badges, [:user_id])
  end
end
