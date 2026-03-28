defmodule Burrow.Communities.ServerBan do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: false}

  schema "server_bans" do
    field :server_id, :integer
    field :user_id, :integer
    field :banned_by, :integer
    field :reason, :string
    field :expires_at, :utc_datetime
    field :message_purge_window, :string

    timestamps()
  end

  def changeset(ban, attrs) do
    ban
    |> cast(attrs, [:id, :server_id, :user_id, :banned_by, :reason, :expires_at, :message_purge_window])
    |> validate_required([:id, :server_id, :user_id, :banned_by])
    |> unique_constraint([:server_id, :user_id])
  end
end
