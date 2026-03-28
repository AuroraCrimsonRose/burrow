defmodule Burrow.Auth.PowRecord do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "pow_records" do
    belongs_to :user, Burrow.Auth.User

    field :public_key, :binary
    field :nonce, :string
    field :hash_result, :string
    field :difficulty_prefix, :string
    field :verified_at, :utc_datetime_usec
  end

  def changeset(record, attrs) do
    record
    |> cast(attrs, [:id, :user_id, :public_key, :nonce, :hash_result, :difficulty_prefix, :verified_at])
    |> validate_required([:id, :user_id, :public_key, :nonce, :hash_result, :difficulty_prefix, :verified_at])
    |> unique_constraint(:user_id)
    |> unique_constraint([:public_key, :nonce])
  end
end
