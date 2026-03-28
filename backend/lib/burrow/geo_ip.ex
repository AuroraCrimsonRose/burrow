defmodule Burrow.GeoIP do
  @moduledoc """
  GeoIP lookup for IP-to-location resolution using MaxMind GeoLite2.

  Configure via:
    config :geolix,
      databases: [
        %{id: :city, adapter: Geolix.Adapter.MMDB2, source: "/path/to/GeoLite2-City.mmdb"}
      ]
  """

  @doc """
  Look up geographic info for an IP address.
  Returns %{city: string | nil, country: string | nil}.
  """
  def lookup(ip) when is_binary(ip) do
    case parse_ip(ip) do
      {:ok, addr} -> do_lookup(addr)
      _ -> %{city: nil, country: nil}
    end
  end

  def lookup(_), do: %{city: nil, country: nil}

  defp parse_ip(ip_string) do
    ip_string
    |> String.to_charlist()
    |> :inet.parse_address()
  end

  defp do_lookup(addr) do
    case Geolix.lookup(addr, where: :city) do
      %{city: %{name: city}, country: %{name: country}} ->
        %{city: city, country: country}

      %{country: %{name: country}} ->
        %{city: nil, country: country}

      _ ->
        %{city: nil, country: nil}
    end
  rescue
    _ -> %{city: nil, country: nil}
  end
end
