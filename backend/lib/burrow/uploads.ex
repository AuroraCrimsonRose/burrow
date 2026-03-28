defmodule Burrow.Uploads do
  @moduledoc """
  Manages file uploads with expiration. Uploads are ephemeral by default
  (7-day TTL) and cleaned up periodically.
  """

  import Ecto.Query
  alias Burrow.Repo
  alias Burrow.Uploads.Upload
  alias Burrow.Storage
  alias Burrow.Snowflake

  @default_ttl_days 7

  @doc "Record a completed upload with default 7-day TTL."
  def record_upload(user_id, key, filename, content_type, size) do
    expires_at = DateTime.add(DateTime.utc_now(), @default_ttl_days * 86_400, :second)

    %Upload{}
    |> Upload.changeset(%{
      id: Snowflake.next_id(),
      user_id: user_id,
      key: key,
      filename: filename,
      content_type: content_type,
      size: size,
      expires_at: expires_at
    })
    |> Repo.insert()
  end

  @doc "Get an upload by its S3 key."
  def get_by_key(key) do
    Repo.get_by(Upload, key: key)
  end

  @doc "Mark an upload as permanent (exempt from TTL cleanup)."
  def mark_permanent(key) do
    case Repo.get_by(Upload, key: key) do
      nil -> {:error, :not_found}
      upload -> upload |> Ecto.Changeset.change(permanent: true) |> Repo.update()
    end
  end

  @doc "Delete all expired, non-permanent uploads from S3 and the database."
  def cleanup_expired do
    now = DateTime.utc_now()

    expired =
      Upload
      |> where([u], u.expires_at <= ^now and u.permanent == false)
      |> Repo.all()

    for upload <- expired do
      Storage.delete(upload.key)
      Repo.delete(upload)
    end

    {:ok, length(expired)}
  end
end
