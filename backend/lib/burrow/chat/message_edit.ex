defmodule Burrow.Chat.MessageEdit do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "message_edits" do
    field :content_before, :string
    field :edited_at, :utc_datetime_usec

    belongs_to :message, Burrow.Chat.Message, type: :integer
    belongs_to :edited_by_user, Burrow.Auth.User,
      type: :integer,
      foreign_key: :edited_by
  end

  def changeset(edit, attrs) do
    edit
    |> cast(attrs, [:id, :message_id, :content_before, :edited_by, :edited_at])
    |> validate_required([:id, :message_id, :content_before, :edited_by, :edited_at])
    |> foreign_key_constraint(:message_id)
    |> foreign_key_constraint(:edited_by)
  end
end
