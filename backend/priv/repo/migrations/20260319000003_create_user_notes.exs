defmodule Burrow.Repo.Migrations.CreateUserNotes do
  use Ecto.Migration

  def change do
    create table(:user_notes, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :author_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :target_user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :content, :text, null: false
      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:user_notes, [:author_id, :target_user_id])
    create index(:user_notes, [:author_id])
  end
end
