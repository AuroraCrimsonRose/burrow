defmodule Burrow.Repo.Migrations.AddAttachmentsToMessages do
  use Ecto.Migration

  def change do
    alter table(:messages) do
      add :attachments, :jsonb, default: "[]"
    end
  end
end
