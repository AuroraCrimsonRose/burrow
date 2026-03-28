defmodule Burrow.Communities.Channel do
  use Ecto.Schema
  import Ecto.Changeset

  @channel_types ~w(text voice announcement stage forum gallery status events file_repo)

  @primary_key {:id, :integer, autogenerate: false}
  schema "channels" do
    field :name, :string
    field :type, :string, default: "text"
    field :topic, :string
    field :position, :integer
    field :nsfw, :boolean, default: false
    field :slow_mode_interval, :integer, default: 0
    field :bitrate, :integer
    field :user_limit, :integer
    field :last_seq, :integer, default: 0

    belongs_to :server, Burrow.Communities.Server, type: :integer
    belongs_to :category, Burrow.Communities.Category, type: :integer

    timestamps(type: :utc_datetime_usec)
  end

  def create_changeset(channel, attrs) do
    channel
    |> cast(attrs, [:id, :name, :type, :topic, :position, :nsfw, :slow_mode_interval,
                     :bitrate, :user_limit, :server_id, :category_id])
    |> validate_required([:id, :name, :server_id])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_inclusion(:type, @channel_types)
    |> foreign_key_constraint(:server_id)
    |> foreign_key_constraint(:category_id)
  end

  def update_changeset(channel, attrs) do
    channel
    |> cast(attrs, [:name, :topic, :position, :nsfw, :slow_mode_interval,
                     :bitrate, :user_limit, :category_id])
    |> validate_length(:name, min: 1, max: 100)
    |> foreign_key_constraint(:category_id)
  end
end
