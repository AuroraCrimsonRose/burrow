defmodule Burrow.Chat.Event do
  use Ecto.Schema

  @primary_key {:event_id, :integer, autogenerate: false}
  schema "event_log" do
    field :channel_id, :integer
    field :server_id, :integer
    field :channel_seq, :integer
    field :event_type, :string
    field :actor_id, :integer
    field :payload, :map
    field :timestamp, :utc_datetime_usec
  end
end
