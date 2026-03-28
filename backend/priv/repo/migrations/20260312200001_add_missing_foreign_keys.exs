defmodule Burrow.Repo.Migrations.AddMissingForeignKeys do
  use Ecto.Migration

  def change do
    # Reactions: message_id had no FK — add cascade delete
    alter table(:reactions) do
      modify :message_id, references(:messages, type: :bigint, on_delete: :delete_all),
        from: :bigint
    end

    # Pins: message_id and channel_id had no FK — add cascade delete
    alter table(:pins) do
      modify :message_id, references(:messages, type: :bigint, on_delete: :delete_all),
        from: :bigint

      modify :channel_id, references(:channels, type: :bigint, on_delete: :delete_all),
        from: :bigint
    end

    # Friendships: bidirectional lookup index for efficient either-direction queries
    create index(:friendships, [:friend_id, :user_id])
  end
end
