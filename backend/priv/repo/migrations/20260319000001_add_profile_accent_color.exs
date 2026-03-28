defmodule Burrow.Repo.Migrations.AddProfileAccentColor do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :accent_color, :string, size: 7
    end
  end
end
