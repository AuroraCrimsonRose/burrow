defmodule Burrow.Chat.Reaction do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: false}
  schema "reactions" do
    field :message_id, :integer
    field :emoji, :string
    belongs_to :user, Burrow.Auth.User

    timestamps(updated_at: false)
  end

  def changeset(reaction, attrs) do
    reaction
    |> cast(attrs, [:id, :message_id, :user_id, :emoji])
    |> validate_required([:id, :message_id, :user_id, :emoji])
    |> validate_length(:emoji, min: 1, max: 64)
    |> validate_format(:emoji, ~r/^[\p{So}\p{Sk}\p{Sm}\p{Sc}\x{200D}\x{FE0E}\x{FE0F}\x{20E3}\x{1F000}-\x{1FFFF}\x{E0020}-\x{E007F}\x{00A9}\x{00AE}\x{2000}-\x{3300}\d#*]+$|^:[a-zA-Z0-9_]+:$/u, message: "must be a Unicode emoji or :custom_name: format")
    |> unique_constraint([:message_id, :user_id, :emoji])
  end
end
