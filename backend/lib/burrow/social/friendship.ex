defmodule Burrow.Social.Friendship do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(pending accepted blocked)

  @primary_key {:id, :integer, autogenerate: false}
  schema "friendships" do
    field :status, :string, default: "pending"

    belongs_to :user, Burrow.Auth.User, type: :integer
    belongs_to :friend, Burrow.Auth.User, type: :integer

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(friendship, attrs) do
    friendship
    |> cast(attrs, [:id, :user_id, :friend_id, :status])
    |> validate_required([:id, :user_id, :friend_id, :status])
    |> validate_inclusion(:status, @statuses)
    |> unique_constraint([:user_id, :friend_id])
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:friend_id)
    |> validate_not_self()
  end

  defp validate_not_self(changeset) do
    user_id = get_field(changeset, :user_id)
    friend_id = get_field(changeset, :friend_id)

    if user_id && friend_id && user_id == friend_id do
      add_error(changeset, :friend_id, "cannot friend yourself")
    else
      changeset
    end
  end
end
