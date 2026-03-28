defmodule Burrow.Repo.Migrations.AddFriendsOnlyDmsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :friends_only_dms, :boolean, default: false, null: false
    end
  end
end
