defmodule Burrow.Repo.Migrations.CreateDmChannels do
  use Ecto.Migration

  def change do
    create table(:dm_channels, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :type, :string, null: false, default: "dm"
      add :last_seq, :bigint, null: false, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create table(:dm_members, primary_key: false) do
      add :dm_channel_id, references(:dm_channels, type: :bigint, on_delete: :delete_all),
        null: false

      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:dm_members, [:dm_channel_id, :user_id])
    create index(:dm_members, [:user_id])

    # Drop FK constraint on messages.channel_id so messages can reference
    # either channels (server) or dm_channels (DM). Snowflake IDs are
    # globally unique so there's no collision risk.
    drop constraint(:messages, "messages_channel_id_fkey")
  end
end
