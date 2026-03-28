defmodule Burrow.Chat.Pin do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: false}
  schema "pins" do
    field :channel_id, :integer
    field :message_id, :integer
    belongs_to :pinned_by_user, Burrow.Auth.User, foreign_key: :pinned_by

    timestamps(updated_at: false)
  end

  def changeset(pin, attrs) do
    pin
    |> cast(attrs, [:id, :channel_id, :message_id, :pinned_by])
    |> validate_required([:id, :channel_id, :message_id, :pinned_by])
    |> unique_constraint([:channel_id, :message_id])
  end
end
