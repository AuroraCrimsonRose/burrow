defmodule Burrow.Uploads.Mime do
  @moduledoc """
  MIME type detection via magic bytes. Runs entirely locally — no network calls.
  Falls back to extension-based detection if magic bytes don't match.
  """

  @magic_bytes [
    # Images
    {<<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A>>, "image/png"},
    {<<0xFF, 0xD8, 0xFF>>, "image/jpeg"},
    {<<"GIF87a">>, "image/gif"},
    {<<"GIF89a">>, "image/gif"},
    {<<"RIFF">>, :check_riff},         # WEBP is RIFF-based
    {<<0x42, 0x4D>>, "image/bmp"},

    # Video
    {<<0x00, 0x00, 0x00>>, :check_mp4},  # ftyp box (MP4/MOV)
    {<<0x1A, 0x45, 0xDF, 0xA3>>, "video/webm"},  # EBML header (WebM/MKV)

    # Audio
    {<<"ID3">>, "audio/mpeg"},          # MP3 with ID3 tag
    {<<0xFF, 0xFB>>, "audio/mpeg"},     # MP3 frame sync
    {<<0xFF, 0xF3>>, "audio/mpeg"},     # MP3 frame sync
    {<<0xFF, 0xF2>>, "audio/mpeg"},     # MP3 frame sync
    {<<"OggS">>, "audio/ogg"},
    {<<"fLaC">>, "audio/flac"},

    # Documents
    {<<0x25, 0x50, 0x44, 0x46>>, "application/pdf"},

    # Archives
    {<<0x50, 0x4B, 0x03, 0x04>>, "application/zip"},
    {<<0x50, 0x4B, 0x05, 0x06>>, "application/zip"},
    {<<0x1F, 0x8B>>, "application/gzip"},
    {<<0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C>>, "application/x-7z-compressed"},
    {<<0x52, 0x61, 0x72, 0x21, 0x1A, 0x07>>, "application/x-rar-compressed"},

    # Executables (for rejection)
    {<<"MZ">>, "application/x-executable"},           # PE (Windows)
    {<<0x7F, 0x45, 0x4C, 0x46>>, "application/x-executable"},  # ELF (Linux)
    {<<0xCF, 0xFA, 0xED, 0xFE>>, "application/x-executable"},  # Mach-O (macOS)
    {<<0xFE, 0xED, 0xFA, 0xCE>>, "application/x-executable"},  # Mach-O (macOS)
  ]

  # Dangerous types that should be blocked regardless
  @blocked_types MapSet.new([
    "application/x-executable",
    "application/x-dosexec",
    "application/x-msdos-program",
    "application/x-msdownload",
  ])

  @extension_map %{
    ".txt" => "text/plain",
    ".log" => "text/plain",
    ".csv" => "text/csv",
    ".json" => "application/json",
    ".xml" => "text/xml",
    ".html" => "text/html",
    ".css" => "text/css",
    ".js" => "text/javascript",
    ".md" => "text/markdown",
    ".yaml" => "text/yaml",
    ".yml" => "text/yaml",
    ".toml" => "application/toml",
    ".svg" => "image/svg+xml",
    ".mp3" => "audio/mpeg",
    ".ogg" => "audio/ogg",
    ".flac" => "audio/flac",
    ".wav" => "audio/wav",
    ".mp4" => "video/mp4",
    ".webm" => "video/webm",
    ".mkv" => "video/x-matroska",
    ".mov" => "video/quicktime",
    ".avi" => "video/x-msvideo",
    ".png" => "image/png",
    ".jpg" => "image/jpeg",
    ".jpeg" => "image/jpeg",
    ".gif" => "image/gif",
    ".webp" => "image/webp",
    ".bmp" => "image/bmp",
    ".ico" => "image/x-icon",
    ".pdf" => "application/pdf",
    ".zip" => "application/zip",
    ".gz" => "application/gzip",
    ".tar" => "application/x-tar",
    ".7z" => "application/x-7z-compressed",
    ".rar" => "application/x-rar-compressed",
    ".doc" => "application/msword",
    ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls" => "application/vnd.ms-excel",
    ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt" => "application/vnd.ms-powerpoint",
    ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  }

  @doc """
  Detect MIME type from file binary data. Returns {:ok, mime} or {:error, reason}.
  Checks magic bytes first, falls back to filename extension.
  """
  def detect(data, filename) when is_binary(data) do
    case detect_from_magic(data) do
      {:ok, mime} -> {:ok, mime}
      :unknown -> {:ok, detect_from_extension(filename)}
    end
  end

  @doc """
  Detect MIME from a file on disk.
  """
  def detect_file(path, filename) do
    case File.read(path) do
      {:ok, data} ->
        # Only need first 32 bytes for magic detection
        header = binary_part(data, 0, min(byte_size(data), 32))
        detect(header, filename)
      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Validate that the detected MIME type is safe (not an executable or blocked type).
  """
  def validate(detected_mime) do
    if MapSet.member?(@blocked_types, detected_mime) do
      {:error, :blocked_file_type}
    else
      :ok
    end
  end

  @doc """
  Full verification: detect real MIME, validate it's not blocked,
  check if declared type matches detected type.
  Returns {:ok, detected_mime} or {:error, reason}.
  """
  def verify(data, filename, declared_mime) do
    with {:ok, detected} <- detect(data, filename),
         :ok <- validate(detected) do
      # Allow the detected type through — the declared type might be generic
      # (e.g., "application/octet-stream") but the real type is fine
      if declared_mime == detected or declared_mime == "application/octet-stream" do
        {:ok, detected}
      else
        # Declared type differs from detected type. Allow if they're in the
        # same category (e.g., both image/*), reject if truly mismatched
        # (e.g., declared image/png but is actually application/x-executable)
        if same_category?(declared_mime, detected) do
          {:ok, detected}
        else
          {:error, :mime_mismatch}
        end
      end
    end
  end

  # --- Private ---

  defp detect_from_magic(data) do
    Enum.find_value(@magic_bytes, :unknown, fn {magic, type_or_check} ->
      if binary_starts_with?(data, magic) do
        case type_or_check do
          :check_riff -> check_riff(data)
          :check_mp4 -> check_mp4(data)
          mime when is_binary(mime) -> {:ok, mime}
        end
      end
    end)
  end

  defp check_riff(data) when byte_size(data) >= 12 do
    <<_riff::binary-size(8), subtype::binary-size(4), _rest::binary>> = data
    case subtype do
      "WEBP" -> {:ok, "image/webp"}
      "AVI " -> {:ok, "video/x-msvideo"}
      "WAVE" -> {:ok, "audio/wav"}
      _ -> :unknown
    end
  end
  defp check_riff(_), do: :unknown

  defp check_mp4(data) when byte_size(data) >= 12 do
    <<_size::binary-size(4), ftyp::binary-size(4), _rest::binary>> = data
    if ftyp == "ftyp" do
      {:ok, "video/mp4"}
    else
      :unknown
    end
  end
  defp check_mp4(_), do: :unknown

  defp detect_from_extension(filename) do
    ext = filename |> Path.extname() |> String.downcase()
    Map.get(@extension_map, ext, "application/octet-stream")
  end

  defp binary_starts_with?(data, prefix) when byte_size(data) >= byte_size(prefix) do
    prefix_size = byte_size(prefix)
    <<head::binary-size(prefix_size), _::binary>> = data
    head == prefix
  end
  defp binary_starts_with?(_, _), do: false

  defp same_category?(type_a, type_b) do
    cat_a = type_a |> String.split("/") |> List.first()
    cat_b = type_b |> String.split("/") |> List.first()
    cat_a == cat_b
  end
end
