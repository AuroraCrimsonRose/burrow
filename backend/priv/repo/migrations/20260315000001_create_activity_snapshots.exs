defmodule Burrow.Repo.Migrations.CreateActivitySnapshots do
  use Ecto.Migration

  def change do
    create table(:activity_snapshots, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
      add :message_count, :integer, default: 0, null: false
      add :voice_user_count, :integer, default: 0, null: false
      add :active_user_count, :integer, default: 0, null: false
      add :reaction_count, :integer, default: 0, null: false
      add :new_member_count, :integer, default: 0, null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:activity_snapshots, [:server_id])
    create index(:activity_snapshots, [:inserted_at])
    create index(:activity_snapshots, [:server_id, :inserted_at])
  end
end
