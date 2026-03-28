defmodule Burrow.Repo.Migrations.EnhanceBadges do
  use Ecto.Migration

  def change do
    alter table(:badges) do
      add :rarity, :string, null: false, default: "common", size: 16
    end

    alter table(:users) do
      add :primary_badge_id, references(:badges, type: :bigint, on_delete: :nilify_all)
    end

    # Widen icon column to fit RPG Awesome class names (e.g. "ra-forging")
    execute "ALTER TABLE badges ALTER COLUMN icon TYPE varchar(64)",
            "ALTER TABLE badges ALTER COLUMN icon TYPE varchar(8)"

    # Seed the initial platform badges
    execute """
    INSERT INTO badges (id, name, icon, description, rarity, color, inserted_at)
    VALUES
      (1, 'Developer', 'ra-forging', 'Awarded to official Burrow platform developers.', 'mythic', '#ff6ec7', NOW()),
      (2, 'Mole', 'ra-shovel', 'Identifies automated accounts, system messages, and service bots operating inside Burrow.', 'vanity', '#c47a3a', NOW()),
      (3, 'Ancient', 'ra-groundbreaker', 'Awarded to accounts created before Burrow officially launches.', 'artifact', '#ff3b3b', NOW())
    ON CONFLICT (name) DO UPDATE SET rarity = EXCLUDED.rarity, icon = EXCLUDED.icon, description = EXCLUDED.description, color = EXCLUDED.color
    """,
    "DELETE FROM badges WHERE id IN (1, 2, 3)"
  end
end
