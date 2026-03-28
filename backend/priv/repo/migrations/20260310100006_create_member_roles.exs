defmodule Burrow.Repo.Migrations.CreateMemberRoles do
  use Ecto.Migration

  def change do
    create table(:member_roles, primary_key: false) do
      add :server_member_id, references(:server_members, type: :bigint, on_delete: :delete_all), null: false
      add :role_id, references(:roles, type: :bigint, on_delete: :delete_all), null: false
    end

    create unique_index(:member_roles, [:server_member_id, :role_id])
    create index(:member_roles, [:role_id])
  end
end
