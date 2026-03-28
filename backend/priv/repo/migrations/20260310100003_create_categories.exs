defmodule Burrow.Repo.Migrations.CreateCategories do
  use Ecto.Migration

  def change do
    create table(:categories, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :position, :integer, null: false, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create index(:categories, [:server_id])
    create index(:categories, [:server_id, :position])
  end
end
