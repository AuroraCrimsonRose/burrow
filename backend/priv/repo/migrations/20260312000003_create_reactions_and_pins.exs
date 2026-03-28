defmodule Burrow.Repo.Migrations.CreateReactionsAndPins do
  use Ecto.Migration

  def change do
    # --- Reactions ---
    create table(:reactions, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :message_id, :bigint, null: false
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :emoji, :string, null: false

      timestamps(updated_at: false)
    end

    # Each user can only react once with the same emoji per message
    create unique_index(:reactions, [:message_id, :user_id, :emoji])
    create index(:reactions, [:message_id])

    # --- Pins ---
    create table(:pins, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :channel_id, :bigint, null: false
      add :message_id, :bigint, null: false
      add :pinned_by, references(:users, type: :bigint, on_delete: :delete_all), null: false

      timestamps(updated_at: false)
    end

    # Each message can only be pinned once per channel
    create unique_index(:pins, [:channel_id, :message_id])
    create index(:pins, [:channel_id])
  end
end
