defmodule Burrow.Repo.Migrations.CreateReadStates do
  use Ecto.Migration

  def change do
    create table(:read_states, primary_key: false) do
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :channel_id, :bigint, null: false
      add :last_read_message_id, :bigint
      add :last_read_seq, :integer, default: 0, null: false
      add :mention_count, :integer, default: 0, null: false

      timestamps(type: :utc_datetime_usec, updated_at: :updated_at)
    end

    create unique_index(:read_states, [:user_id, :channel_id])
    create index(:read_states, [:user_id])
    create index(:read_states, [:channel_id])
  end
end
