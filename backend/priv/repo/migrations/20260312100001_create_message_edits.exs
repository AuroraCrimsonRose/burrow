defmodule Burrow.Repo.Migrations.CreateMessageEdits do
  use Ecto.Migration

  def change do
    create table(:message_edits, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :message_id, references(:messages, type: :bigint, on_delete: :delete_all), null: false
      add :content_before, :text, null: false
      add :edited_by, references(:users, type: :bigint, on_delete: :nilify_all), null: false
      add :edited_at, :utc_datetime_usec, null: false
    end

    create index(:message_edits, [:message_id, :edited_at])
  end
end
