defmodule Burrow.Auth.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "users" do
    field :username, :string
    field :display_name, :string
    field :avatar_url, :string
    field :account_type, :string, default: "personal"
    field :email, :string
    field :phone, :string
    field :totp_secret_enc, :binary
    field :totp_enabled, :boolean, default: false
    field :mfa_enabled, :boolean, default: false
    field :trust_score, :integer, default: 16
    field :trust_tier, :integer, default: 1
    field :username_changed_at, :utc_datetime_usec
    field :age_verified, :boolean, default: false
    field :age_verified_at, :utc_datetime_usec
    field :tos_accepted_version, :string
    field :tos_accepted_at, :utc_datetime_usec
    field :nsfw_age_verified, :boolean, default: false
    field :nsfw_age_verified_at, :utc_datetime_usec
    field :privacy_accepted_version, :string
    field :privacy_accepted_at, :utc_datetime_usec
    field :bio, :string
    field :pronouns, :string
    field :banner_url, :string
    field :accent_color, :string
    field :is_dev, :boolean, default: false
    field :primary_badge_id, :integer
    field :friends_only_dms, :boolean, default: false

    has_many :device_keys, Burrow.Auth.DeviceKey
    has_many :sessions, Burrow.Auth.UserSession

    timestamps(type: :utc_datetime_usec)
  end

  @doc "Changeset for new account registration."
  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [
      :id, :username, :display_name,
      :age_verified, :age_verified_at,
      :tos_accepted_version, :tos_accepted_at,
      :privacy_accepted_version, :privacy_accepted_at
    ])
    |> validate_required([:id, :username, :age_verified])
    |> validate_acceptance(:age_verified, message: "you must confirm you are 13 or older")
    |> validate_required([:tos_accepted_version, :tos_accepted_at], message: "you must accept the Terms of Service")
    |> validate_required([:privacy_accepted_version, :privacy_accepted_at], message: "you must accept the Privacy Policy")
    |> validate_length(:username, min: 2, max: 32)
    |> validate_format(:username, ~r/^[a-zA-Z0-9_]+$/, message: "only letters, numbers, and underscores")
    |> unique_constraint(:username)
  end

  @doc "Changeset for avatar URL updates."
  def avatar_changeset(user, attrs) do
    user
    |> cast(attrs, [:avatar_url])
    |> validate_required([:avatar_url])
    |> validate_length(:avatar_url, max: 512)
  end

  @doc "Changeset for profile customization (bio, pronouns, banner)."
  def profile_changeset(user, attrs) do
    user
    |> cast(attrs, [:bio, :pronouns, :banner_url, :display_name, :accent_color, :friends_only_dms])
    |> validate_length(:bio, max: 2000)
    |> validate_length(:pronouns, max: 50)
    |> validate_length(:banner_url, max: 512)
    |> validate_length(:display_name, max: 64)
    |> validate_format(:accent_color, ~r/^#[0-9a-fA-F]{6}$/, message: "must be a hex color like #7c3aed")
  end

  @username_cooldown_hours 72

  @doc "Changeset for username changes with 72h cooldown."
  def username_changeset(user, attrs) do
    user
    |> cast(attrs, [:username])
    |> validate_required([:username])
    |> validate_length(:username, min: 2, max: 32)
    |> validate_format(:username, ~r/^[a-zA-Z0-9_]+$/, message: "only letters, numbers, and underscores")
    |> validate_username_cooldown()
    |> unique_constraint(:username)
    |> put_change(:username_changed_at, DateTime.utc_now())
  end

  defp validate_username_cooldown(changeset) do
    case get_field(changeset, :username_changed_at) do
      nil ->
        changeset

      last_changed ->
        cooldown_until = DateTime.add(last_changed, @username_cooldown_hours * 3600, :second)

        if DateTime.compare(DateTime.utc_now(), cooldown_until) == :lt do
          add_error(changeset, :username, "can only be changed every #{@username_cooldown_hours} hours")
        else
          changeset
        end
    end
  end

  @doc "Changeset for accepting updated ToS/Privacy Policy versions."
  def terms_changeset(user, attrs) do
    user
    |> cast(attrs, [
      :tos_accepted_version, :tos_accepted_at,
      :privacy_accepted_version, :privacy_accepted_at
    ])
  end

  @doc "Changeset for NSFW age verification (18+)."
  def nsfw_age_changeset(user, attrs) do
    user
    |> cast(attrs, [:nsfw_age_verified, :nsfw_age_verified_at])
  end
end
