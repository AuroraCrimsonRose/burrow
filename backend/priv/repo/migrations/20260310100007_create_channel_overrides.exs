defmodule Burrow.Repo.Migrations.CreateChannelOverrides do
  use Ecto.Migration

  def change do
    create table(:channel_overrides, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :channel_id, references(:channels, type: :bigint, on_delete: :delete_all), null: false
      add :target_type, :string, null: false  # "role" or "user"
      add :target_id, :bigint, null: false
      add :allow, :bigint, null: false, default: 0
      add :deny, :bigint, null: false, default: 0
    end

    create unique_index(:channel_overrides, [:channel_id, :target_type, :target_id])
  end
end
