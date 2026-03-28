defmodule Burrow.Repo.Migrations.CreateEventLog do
  use Ecto.Migration

  def change do
    create table(:event_log, primary_key: false) do
      add :event_id, :bigint, primary_key: true
      add :channel_id, :bigint
      add :server_id, :bigint
      add :channel_seq, :bigint
      add :event_type, :string, null: false
      add :actor_id, :bigint
      add :payload, :map, null: false
      add :timestamp, :utc_datetime_usec, null: false
    end

    create index(:event_log, [:channel_id, :channel_seq])
    create index(:event_log, [:server_id, :timestamp])
    create index(:event_log, [:event_type, :timestamp])
  end
end
