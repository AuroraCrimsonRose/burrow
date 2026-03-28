defmodule Burrow.Repo.Migrations.AddProfileFields do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :bio, :text
      add :pronouns, :string, size: 50
      add :banner_url, :string, size: 512
    end
  end
end
