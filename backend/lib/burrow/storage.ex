defmodule Burrow.Storage do
  @moduledoc """
  S3-compatible file storage with signed URLs.
  Uses MinIO in development and any S3-compatible service in production.
  """

  @doc """
  Upload a file to S3 and return the object key.
  """
  def upload(local_path, key, content_type \\ "application/octet-stream") do
    bucket = bucket()

    local_path
    |> ExAws.S3.Upload.stream_file()
    |> ExAws.S3.upload(bucket, key, content_type: content_type)
    |> ExAws.request(ex_aws_config())
    |> case do
      {:ok, _} -> {:ok, key}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Upload raw binary data to S3.
  """
  def put_object(key, data, content_type \\ "application/octet-stream") do
    bucket = bucket()

    ExAws.S3.put_object(bucket, key, data, content_type: content_type)
    |> ExAws.request(ex_aws_config())
    |> case do
      {:ok, _} -> {:ok, key}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Generate a pre-signed URL for downloading a file. Expires in `ttl` seconds (default 900 = 15 min).
  """
  def signed_url(key, ttl \\ 900) do
    config = ExAws.Config.new(:s3, public_config())

    case ExAws.S3.presigned_url(config, :get, bucket(), key, expires_in: ttl) do
      {:ok, url} -> {:ok, inject_public_path_prefix(url)}
      error -> error
    end
  end

  @doc """
  Generate a pre-signed URL for uploading a file. Expires in `ttl` seconds (default 300 = 5 min).
  """
  def presigned_upload_url(key, content_type, ttl \\ 300) do
    config = ExAws.Config.new(:s3, public_config())

    case ExAws.S3.presigned_url(config, :put, bucket(), key,
      expires_in: ttl,
      headers: [{"Content-Type", content_type}]
    ) do
      {:ok, url} -> {:ok, inject_public_path_prefix(url)}
      error -> error
    end
  end

  @doc """
  Delete a file from S3.
  """
  def delete(key) do
    ExAws.S3.delete_object(bucket(), key)
    |> ExAws.request(ex_aws_config())
  end

  # --- S3 Multipart Upload ---

  @doc "Initiate a multipart upload. Returns {:ok, upload_id}."
  def initiate_multipart(key, content_type) do
    ExAws.S3.initiate_multipart_upload(bucket(), key, content_type: content_type)
    |> ExAws.request(ex_aws_config())
    |> case do
      {:ok, %{body: %{upload_id: upload_id}}} -> {:ok, upload_id}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Upload a single part. Returns {:ok, etag}."
  def upload_part(key, upload_id, part_number, data) do
    ExAws.S3.upload_part(bucket(), key, upload_id, part_number, data)
    |> ExAws.request(ex_aws_config())
    |> case do
      {:ok, %{headers: headers}} ->
        etag = headers |> Enum.find_value(fn {k, v} -> if String.downcase(k) == "etag", do: v end)
        {:ok, etag}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Complete a multipart upload. `parts` is a list of {part_number, etag}."
  def complete_multipart(key, upload_id, parts) do
    ExAws.S3.complete_multipart_upload(bucket(), key, upload_id, parts)
    |> ExAws.request(ex_aws_config())
    |> case do
      {:ok, _} -> {:ok, key}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Abort a multipart upload."
  def abort_multipart(key, upload_id) do
    ExAws.S3.abort_multipart_upload(bucket(), key, upload_id)
    |> ExAws.request(ex_aws_config())
  end

  @doc """
  Get the public/internal URL for a key (for server-side access).
  """
  def object_url(key) do
    endpoint = endpoint()
    "#{endpoint}/#{bucket()}/#{key}"
  end

  def bucket do
    System.get_env("AWS_S3_BUCKET") || "burrow-uploads"
  end

  defp endpoint do
    System.get_env("AWS_S3_ENDPOINT") || "http://minio:9000"
  end

  defp public_endpoint do
    System.get_env("AWS_S3_PUBLIC_ENDPOINT") || "http://localhost:9000"
  end

  defp public_path_prefix do
    case URI.parse(public_endpoint()).path do
      nil -> ""
      "/" -> ""
      path -> String.trim_trailing(path, "/")
    end
  end

  defp inject_public_path_prefix(url) do
    case public_path_prefix() do
      "" -> url
      prefix ->
        uri = URI.parse(url)
        URI.to_string(%{uri | path: prefix <> (uri.path || "/")})
    end
  end

  def ex_aws_config do
    [
      access_key_id: System.get_env("AWS_ACCESS_KEY_ID") || raise("AWS_ACCESS_KEY_ID not set"),
      secret_access_key: System.get_env("AWS_SECRET_ACCESS_KEY") || raise("AWS_SECRET_ACCESS_KEY not set"),
      region: System.get_env("AWS_REGION") || "us-east-1",
      host: endpoint() |> URI.parse() |> Map.get(:host),
      port: endpoint() |> URI.parse() |> Map.get(:port),
      scheme: (endpoint() |> URI.parse() |> Map.get(:scheme)) <> "://",
      s3: [
        scheme: (endpoint() |> URI.parse() |> Map.get(:scheme)) <> "://",
        host: endpoint() |> URI.parse() |> Map.get(:host),
        port: endpoint() |> URI.parse() |> Map.get(:port)
      ]
    ]
  end

  defp public_config do
    uri = URI.parse(public_endpoint())
    [
      access_key_id: System.get_env("AWS_ACCESS_KEY_ID") || raise("AWS_ACCESS_KEY_ID not set"),
      secret_access_key: System.get_env("AWS_SECRET_ACCESS_KEY") || raise("AWS_SECRET_ACCESS_KEY not set"),
      region: System.get_env("AWS_REGION") || "us-east-1",
      host: uri.host,
      port: uri.port,
      scheme: uri.scheme <> "://",
      s3: [
        scheme: uri.scheme <> "://",
        host: uri.host,
        port: uri.port
      ]
    ]
  end
end
