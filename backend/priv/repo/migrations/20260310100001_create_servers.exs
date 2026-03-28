defmodule Burrow.Repo.Migrations.CreateServers do
  use Ecto.Migration

  def change do
    create table(:servers, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :name, :string, null: false
      add :description, :text
      add :icon_url, :string
      add :banner_url, :string
      add :owner_id, references(:users, type: :bigint, on_delete: :restrict), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:servers, [:owner_id])
  end
end
