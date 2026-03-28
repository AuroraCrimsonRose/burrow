defmodule Burrow.Profiles.UserNote do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :integer, autogenerate: false}
  schema "user_notes" do
    field :author_id, :integer
    field :target_user_id, :integer
    field :content, :string
    timestamps(type: :utc_datetime_usec)
  end

  def changeset(note, attrs) do
    note
    |> cast(attrs, [:id, :author_id, :target_user_id, :content])
    |> validate_required([:id, :author_id, :target_user_id, :content])
    |> validate_length(:content, max: 1024)
    |> unique_constraint([:author_id, :target_user_id])
  end
end
