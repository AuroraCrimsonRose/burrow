defmodule Burrow.Chat.Message do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "messages" do
    field :content, :string
    field :type, :string, default: "normal"
    field :reply_to_id, :integer
    field :edited_at, :utc_datetime_usec
    field :deleted, :boolean, default: false
    field :channel_seq, :integer
    field :attachments, {:array, :map}, default: []

    belongs_to :channel, Burrow.Communities.Channel, type: :integer
    belongs_to :author, Burrow.Auth.User, type: :integer
    has_many :reactions, Burrow.Chat.Reaction, foreign_key: :message_id

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def create_changeset(message, attrs) do
    message
    |> cast(attrs, [:id, :channel_id, :author_id, :content, :type, :reply_to_id, :channel_seq, :attachments])
    |> validate_required([:id, :channel_id, :author_id, :channel_seq])
    |> validate_content_or_attachments()
    |> validate_length(:content, max: 4000)
    |> foreign_key_constraint(:channel_id)
    |> foreign_key_constraint(:author_id)
  end

  defp validate_content_or_attachments(changeset) do
    content = get_field(changeset, :content)
    attachments = get_field(changeset, :attachments) || []

    if (is_nil(content) or content == "") and attachments == [] do
      add_error(changeset, :content, "must have content or attachments")
    else
      changeset
    end
  end

  def edit_changeset(message, attrs) do
    message
    |> cast(attrs, [:content, :edited_at])
    |> validate_required([:content, :edited_at])
    |> validate_length(:content, min: 1, max: 4000)
  end
end
