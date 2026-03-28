defmodule Burrow.Repo.Migrations.AddIsDevToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :is_dev, :boolean, default: false, null: false
    end
  end
end
