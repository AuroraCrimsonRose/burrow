defmodule Burrow.Uploads.Upload do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "uploads" do
    field :key, :string
    field :filename, :string
    field :content_type, :string
    field :size, :integer, default: 0
    field :permanent, :boolean, default: false
    field :expires_at, :utc_datetime_usec

    # Scan pipeline
    field :scan_status, :string, default: "pending"
    field :mime_verified, :string
    field :virus_result, :string
    field :csam_result, :string
    field :sha256, :string
    field :scanned_at, :utc_datetime_usec

    belongs_to :user, Burrow.Auth.User, type: :integer

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(upload, attrs) do
    upload
    |> cast(attrs, [
      :id, :user_id, :key, :filename, :content_type, :size, :permanent, :expires_at,
      :scan_status, :mime_verified, :virus_result, :csam_result, :sha256, :scanned_at
    ])
    |> validate_required([:id, :user_id, :key, :filename, :content_type, :expires_at])
    |> validate_inclusion(:scan_status, ["pending", "scanning", "clean", "flagged", "rejected", "error"])
    |> unique_constraint(:key)
    |> foreign_key_constraint(:user_id)
  end
end
