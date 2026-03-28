defmodule Burrow.Uploads.ClamAV do
  @moduledoc """
  ClamAV virus scanner client. Connects via TCP to the local ClamAV daemon.
  All scanning happens locally — no file data ever leaves the server.
  """

  require Logger

  @default_host "clamav"
  @default_port 3310
  @timeout 30_000
  @max_chunk 2_048

  @doc """
  Scan binary data with ClamAV via INSTREAM protocol.
  Returns {:ok, :clean} | {:ok, {:infected, signature}} | {:error, reason}.
  """
  def scan(data) when is_binary(data) do
    host = System.get_env("CLAMAV_HOST") || @default_host
    port = String.to_integer(System.get_env("CLAMAV_PORT") || to_string(@default_port))

    with {:ok, socket} <- :gen_tcp.connect(to_charlist(host), port, [:binary, active: false], @timeout),
         :ok <- :gen_tcp.send(socket, "zINSTREAM\0"),
         :ok <- send_chunks(socket, data),
         :ok <- :gen_tcp.send(socket, <<0::32>>),
         {:ok, response} <- :gen_tcp.recv(socket, 0, @timeout) do
      :gen_tcp.close(socket)
      parse_response(response)
    else
      {:error, :econnrefused} ->
        Logger.warning("ClamAV: connection refused — daemon may not be running")
        {:error, :scanner_unavailable}

      {:error, reason} ->
        Logger.error("ClamAV scan error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Scan a file on disk (reads into memory then scans).
  """
  def scan_file(path) do
    case File.read(path) do
      {:ok, data} -> scan(data)
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Check if ClamAV daemon is reachable."
  def ping do
    host = System.get_env("CLAMAV_HOST") || @default_host
    port = String.to_integer(System.get_env("CLAMAV_PORT") || to_string(@default_port))

    case :gen_tcp.connect(to_charlist(host), port, [:binary, active: false], 5_000) do
      {:ok, socket} ->
        :gen_tcp.send(socket, "zPING\0")
        result = :gen_tcp.recv(socket, 0, 5_000)
        :gen_tcp.close(socket)
        case result do
          {:ok, "PONG\0"} -> :ok
          _ -> {:error, :unexpected_response}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  # Send data in chunks to ClamAV (INSTREAM protocol)
  defp send_chunks(socket, data) do
    send_chunks_loop(socket, data)
  end

  defp send_chunks_loop(_socket, <<>>), do: :ok
  defp send_chunks_loop(socket, data) do
    {chunk, rest} =
      if byte_size(data) > @max_chunk do
        <<c::binary-size(@max_chunk), r::binary>> = data
        {c, r}
      else
        {data, <<>>}
      end

    size = byte_size(chunk)
    case :gen_tcp.send(socket, <<size::32>> <> chunk) do
      :ok -> send_chunks_loop(socket, rest)
      error -> error
    end
  end

  defp parse_response(response) do
    # ClamAV response: "stream: OK\0" or "stream: <signature> FOUND\0"
    clean = String.trim_trailing(response, "\0")
    cond do
      String.ends_with?(clean, "OK") ->
        {:ok, :clean}

      String.contains?(clean, "FOUND") ->
        # Extract signature name
        sig = clean
              |> String.replace(~r/^stream:\s*/, "")
              |> String.replace(~r/\s*FOUND$/, "")
              |> String.trim()
        {:ok, {:infected, sig}}

      String.contains?(clean, "ERROR") ->
        {:error, {:scan_error, clean}}

      true ->
        {:error, {:unknown_response, clean}}
    end
  end
end
