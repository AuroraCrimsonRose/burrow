defmodule Burrow.Trust.TrustEvent do
  use Ecto.Schema

  @primary_key {:id, :integer, autogenerate: false}
  schema "trust_events" do
    field :user_id, :integer
    field :event_type, :string
    field :delta, :integer
    field :score_before, :integer
    field :score_after, :integer
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
