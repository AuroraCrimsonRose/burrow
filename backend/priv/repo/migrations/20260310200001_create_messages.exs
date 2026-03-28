defmodule Burrow.Repo.Migrations.CreateMessages do
  use Ecto.Migration

  def change do
    create table(:messages, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :channel_id, references(:channels, type: :bigint, on_delete: :delete_all), null: false
      add :author_id, references(:users, type: :bigint, on_delete: :nilify_all), null: false
      add :content, :text, null: false
      add :type, :string, null: false, default: "normal"
      add :reply_to_id, :bigint
      add :edited_at, :utc_datetime_usec
      add :deleted, :boolean, null: false, default: false
      add :channel_seq, :bigint, null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:messages, [:channel_id, :channel_seq])
    create index(:messages, [:channel_id, :inserted_at])
    create index(:messages, [:author_id])
  end
end
