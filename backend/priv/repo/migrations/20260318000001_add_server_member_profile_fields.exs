defmodule Burrow.Repo.Migrations.AddServerMemberProfileFields do
  use Ecto.Migration

  def change do
    alter table(:server_members) do
      add :bio, :string
      add :pronouns, :string
    end
  end
end
