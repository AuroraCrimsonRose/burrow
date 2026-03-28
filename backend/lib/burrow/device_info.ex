defmodule Burrow.DeviceInfo do
  @moduledoc """
  Extracts device information from HTTP request headers.

  Parses User-Agent server-side (never trusts client-sent device info)
  and extracts the real client IP, handling X-Forwarded-For for proxied setups.
  """

  import Plug.Conn

  @doc """
  Extract device info from a Plug.Conn.

  Returns a map with :device_type, :os, :browser, :ip, :city, :country.
  City and country are populated via GeoIP lookup when configured.
  """
  def from_conn(conn) do
    ua = get_req_header(conn, "user-agent") |> List.first() || ""
    ip = extract_ip(conn)
    geo = Burrow.GeoIP.lookup(ip)

    %{
      device_type: detect_device_type(ua),
      os: detect_os(ua),
      browser: detect_browser(ua),
      ip: ip,
      city: geo[:city],
      country: geo[:country]
    }
  end

  @doc "Extract real client IP, respecting X-Forwarded-For behind proxies."
  def extract_ip(conn) do
    case get_req_header(conn, "x-forwarded-for") do
      [forwarded | _] ->
        forwarded |> String.split(",") |> List.first() |> String.trim()

      [] ->
        to_string(:inet.ntoa(conn.remote_ip))
    end
  end

  defp detect_device_type(ua) do
    cond do
      Regex.match?(~r/Mobile|Android.*Mobile|iPhone|iPod/i, ua) -> "mobile"
      Regex.match?(~r/iPad|Android(?!.*Mobile)|Tablet/i, ua) -> "tablet"
      true -> "desktop"
    end
  end

  defp detect_os(ua) do
    cond do
      Regex.match?(~r/Windows NT/i, ua) -> "Windows"
      Regex.match?(~r/Mac OS X|macOS/i, ua) -> "macOS"
      Regex.match?(~r/CrOS/i, ua) -> "ChromeOS"
      Regex.match?(~r/Android/i, ua) -> "Android"
      Regex.match?(~r/iPhone|iPad|iPod/i, ua) -> "iOS"
      Regex.match?(~r/Linux/i, ua) -> "Linux"
      true -> "Unknown"
    end
  end

  defp detect_browser(ua) do
    cond do
      Regex.match?(~r/Edg\//i, ua) -> "Edge"
      Regex.match?(~r/OPR\//i, ua) -> "Opera"
      Regex.match?(~r/Vivaldi\//i, ua) -> "Vivaldi"
      Regex.match?(~r/Firefox\//i, ua) -> "Firefox"
      Regex.match?(~r/Chrome\//i, ua) && !Regex.match?(~r/Chromium/i, ua) -> "Chrome"
      Regex.match?(~r/Safari\//i, ua) && Regex.match?(~r/Version\//i, ua) -> "Safari"
      true -> "Unknown"
    end
  end
end
