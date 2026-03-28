defmodule Burrow.Repo.Migrations.CreateFriendships do
  use Ecto.Migration

  def change do
    create table(:friendships, primary_key: false) do
      add :id, :bigint, primary_key: true
      add :user_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :friend_id, references(:users, type: :bigint, on_delete: :delete_all), null: false
      add :status, :string, null: false, default: "pending"

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:friendships, [:user_id, :friend_id])
    create index(:friendships, [:friend_id])
    create index(:friendships, [:user_id, :status])
  end
end
