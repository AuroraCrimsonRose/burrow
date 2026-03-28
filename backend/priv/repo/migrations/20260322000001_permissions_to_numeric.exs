defmodule Burrow.Repo.Migrations.PermissionsToNumeric do
  use Ecto.Migration

  def up do
    # Roles: permissions column needs arbitrary precision for bits 63-65
    # Store as text to avoid Postgres bigint overflow
    execute "ALTER TABLE roles ALTER COLUMN permissions TYPE numeric USING permissions::numeric"

    # Channel overrides: allow/deny also need arbitrary precision
    execute "ALTER TABLE channel_overrides ALTER COLUMN allow TYPE numeric USING allow::numeric"
    execute "ALTER TABLE channel_overrides ALTER COLUMN deny TYPE numeric USING deny::numeric"
  end

  def down do
    execute "ALTER TABLE roles ALTER COLUMN permissions TYPE bigint USING permissions::bigint"
    execute "ALTER TABLE channel_overrides ALTER COLUMN allow TYPE bigint USING allow::bigint"
    execute "ALTER TABLE channel_overrides ALTER COLUMN deny TYPE bigint USING deny::bigint"
  end
end
