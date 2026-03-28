defmodule Burrow.Profiles.Badge do
  use Ecto.Schema

  @primary_key {:id, :integer, autogenerate: false}
  schema "badges" do
    field :name, :string
    field :icon, :string
    field :description, :string
    field :rarity, :string, default: "common"
    field :color, :string
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
