defmodule Burrow.Repo.Migrations.CreateInvites do
  use Ecto.Migration

  def change do
    create table(:invites, primary_key: false) do
      add :code, :string, primary_key: true
      add :server_id, references(:servers, type: :bigint, on_delete: :delete_all), null: false
      add :channel_id, references(:channels, type: :bigint, on_delete: :nilify_all)
      add :inviter_id, references(:users, type: :bigint, on_delete: :nilify_all)
      add :max_uses, :integer
      add :uses_count, :integer, null: false, default: 0
      add :expires_at, :utc_datetime_usec
      add :revoked_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:invites, [:server_id])
    create index(:invites, [:inviter_id])
  end
end
