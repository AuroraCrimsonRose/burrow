defmodule Burrow.Analytics.ActivitySnapshot do
  use Ecto.Schema

  @primary_key {:id, :integer, autogenerate: false}

  schema "activity_snapshots" do
    field :server_id, :integer
    field :message_count, :integer, default: 0
    field :voice_user_count, :integer, default: 0
    field :active_user_count, :integer, default: 0
    field :reaction_count, :integer, default: 0
    field :new_member_count, :integer, default: 0

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
