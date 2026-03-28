defmodule Burrow.Repo.Migrations.AddAgeGateAndTosAcceptance do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :age_verified, :boolean, default: false
      add :age_verified_at, :utc_datetime_usec
      add :tos_accepted_version, :string
      add :tos_accepted_at, :utc_datetime_usec
    end
  end
end
