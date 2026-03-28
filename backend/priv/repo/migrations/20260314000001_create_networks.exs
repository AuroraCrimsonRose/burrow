defmodule Burrow.Repo.Migrations.CreateNetworks do
  use Ecto.Migration

  def change do
    create table(:networks, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :name, :string, null: false
      add :owner_id, references(:users, type: :bigint, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:networks, [:owner_id])

    create table(:network_servers, primary_key: false) do
      add :network_id, references(:networks, type: :bigint, on_delete: :delete_all), null: false
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
    end

    create unique_index(:network_servers, [:network_id, :server_id])
    create index(:network_servers, [:server_id])
  end
end
