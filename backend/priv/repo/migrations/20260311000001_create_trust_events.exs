defmodule Burrow.Repo.Migrations.CreateTrustEvents do
  use Ecto.Migration

  def change do
    create table(:trust_events, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :event_type, :string, null: false
      add :delta, :integer, null: false
      add :score_before, :integer, null: false
      add :score_after, :integer, null: false
      add :metadata, :map, default: %{}

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:trust_events, [:user_id, :inserted_at])
    create index(:trust_events, [:event_type])
  end
end
