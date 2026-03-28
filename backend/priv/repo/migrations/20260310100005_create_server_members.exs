defmodule Burrow.Repo.Migrations.CreateServerMembers do
  use Ecto.Migration

  def change do
    create table(:server_members, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :nickname, :string
      add :server_avatar_url, :string
      add :joined_at, :utc_datetime_usec, null: false
    end

    create unique_index(:server_members, [:server_id, :user_id])
    create index(:server_members, [:user_id])
  end
end
