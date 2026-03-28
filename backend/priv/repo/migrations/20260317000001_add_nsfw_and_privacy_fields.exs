defmodule Burrow.Repo.Migrations.AddNsfwAndPrivacyFields do
  use Ecto.Migration

  def change do
    alter table(:users) do
      # 18+ NSFW age gate (separate from the 13+ age gate)
      add :nsfw_age_verified, :boolean, default: false, null: false
      add :nsfw_age_verified_at, :utc_datetime_usec

      # Privacy policy acceptance (version-tracked, separate from ToS)
      add :privacy_accepted_version, :string, size: 20
      add :privacy_accepted_at, :utc_datetime_usec
    end
  end
end
