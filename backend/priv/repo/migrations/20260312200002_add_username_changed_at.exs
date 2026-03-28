defmodule Burrow.Repo.Migrations.AddUsernameChangedAt do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :username_changed_at, :utc_datetime_usec
    end
  end
end
