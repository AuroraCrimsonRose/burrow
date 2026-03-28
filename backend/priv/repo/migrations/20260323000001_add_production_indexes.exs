defmodule Burrow.Repo.Migrations.AddProductionIndexes do
  use Ecto.Migration

  def change do
    create_if_not_exists index(:invites, [:channel_id])
    create_if_not_exists index(:channel_overrides, [:target_id])
  end
end
