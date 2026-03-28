defmodule Burrow.Auth.CBOR do
  @moduledoc """
  Minimal CBOR decoder for WebAuthn attestation objects and COSE keys.
  Only supports the subset of CBOR needed for WebAuthn processing.
  """

  def decode(data) when is_binary(data) do
    {value, rest} = decode_item(data)
    {value, rest}
  end

  defp decode_item(<<major::3, info::5, rest::binary>>) do
    case major do
      0 -> decode_unsigned(info, rest)
      1 -> decode_negative(info, rest)
      2 -> decode_bytestring(info, rest)
      3 -> decode_textstring(info, rest)
      4 -> decode_array(info, rest)
      5 -> decode_map(info, rest)
      7 -> decode_simple(info, rest)
    end
  end

  # Unsigned integer (major type 0)
  defp decode_unsigned(info, rest) when info < 24, do: {info, rest}
  defp decode_unsigned(24, <<val, rest::binary>>), do: {val, rest}
  defp decode_unsigned(25, <<val::unsigned-big-16, rest::binary>>), do: {val, rest}
  defp decode_unsigned(26, <<val::unsigned-big-32, rest::binary>>), do: {val, rest}
  defp decode_unsigned(27, <<val::unsigned-big-64, rest::binary>>), do: {val, rest}

  # Negative integer (major type 1): value = -1 - n
  defp decode_negative(info, rest) do
    {n, rest} = decode_unsigned(info, rest)
    {-1 - n, rest}
  end

  # Byte string (major type 2)
  defp decode_bytestring(info, rest) do
    {len, rest} = get_length(info, rest)
    <<bytes::binary-size(len), rest::binary>> = rest
    {bytes, rest}
  end

  # Text string (major type 3)
  defp decode_textstring(info, rest) do
    {len, rest} = get_length(info, rest)
    <<text::binary-size(len), rest::binary>> = rest
    {text, rest}
  end

  # Array (major type 4)
  defp decode_array(info, rest) do
    {count, rest} = get_length(info, rest)
    decode_n(count, rest, [])
  end

  # Map (major type 5)
  defp decode_map(info, rest) do
    {count, rest} = get_length(info, rest)
    decode_map_pairs(count, rest, %{})
  end

  # Simple values (major type 7)
  defp decode_simple(20, rest), do: {false, rest}
  defp decode_simple(21, rest), do: {true, rest}
  defp decode_simple(22, rest), do: {nil, rest}
  # Float16 not needed for WebAuthn
  defp decode_simple(25, <<_val::binary-2, rest::binary>>), do: {0.0, rest}
  # Float32
  defp decode_simple(26, <<val::float-big-32, rest::binary>>), do: {val, rest}
  # Float64
  defp decode_simple(27, <<val::float-big-64, rest::binary>>), do: {val, rest}

  defp get_length(info, rest) when info < 24, do: {info, rest}
  defp get_length(24, <<len, rest::binary>>), do: {len, rest}
  defp get_length(25, <<len::unsigned-big-16, rest::binary>>), do: {len, rest}
  defp get_length(26, <<len::unsigned-big-32, rest::binary>>), do: {len, rest}
  defp get_length(27, <<len::unsigned-big-64, rest::binary>>), do: {len, rest}

  defp decode_n(0, rest, acc), do: {Enum.reverse(acc), rest}

  defp decode_n(n, data, acc) do
    {item, rest} = decode_item(data)
    decode_n(n - 1, rest, [item | acc])
  end

  defp decode_map_pairs(0, rest, acc), do: {acc, rest}

  defp decode_map_pairs(n, data, acc) do
    {key, rest} = decode_item(data)
    {val, rest} = decode_item(rest)
    decode_map_pairs(n - 1, rest, Map.put(acc, key, val))
  end
end
