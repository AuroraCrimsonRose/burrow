defmodule Burrow.Repo.Migrations.CreateRoles do
  use Ecto.Migration

  def change do
    create table(:roles, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :color, :string
      add :position, :integer, null: false, default: 0
      add :permissions, :bigint, null: false, default: 0
      add :hoist, :boolean, null: false, default: false
      add :mentionable, :boolean, null: false, default: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:roles, [:server_id])
    create index(:roles, [:server_id, :position])
  end
end
