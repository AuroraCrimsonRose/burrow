defmodule Burrow.Chat.ReadState do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "read_states" do
    field :user_id, :integer, primary_key: true
    field :channel_id, :integer, primary_key: true
    field :last_read_message_id, :integer
    field :last_read_seq, :integer, default: 0
    field :mention_count, :integer, default: 0

    timestamps(type: :utc_datetime_usec, updated_at: :updated_at)
  end

  def changeset(read_state, attrs) do
    read_state
    |> cast(attrs, [:user_id, :channel_id, :last_read_message_id, :last_read_seq, :mention_count])
    |> validate_required([:user_id, :channel_id])
    |> unique_constraint([:user_id, :channel_id])
  end
end
