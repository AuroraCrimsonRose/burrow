defmodule Burrow.Repo.Migrations.CreateChannels do
  use Ecto.Migration

  def change do
    create table(:channels, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
      add :category_id, references(:categories, type: :bigint, on_delete: :nilify_all)
      add :name, :string, null: false
      add :type, :string, null: false, default: "text"
      add :topic, :text
      add :position, :integer, null: false, default: 0
      add :nsfw, :boolean, null: false, default: false
      add :slow_mode_interval, :integer, default: 0
      add :bitrate, :integer
      add :user_limit, :integer
      add :last_seq, :bigint, null: false, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create index(:channels, [:server_id])
    create index(:channels, [:server_id, :position])
    create index(:channels, [:category_id])
  end
end
