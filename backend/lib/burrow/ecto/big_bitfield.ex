defmodule Burrow.Ecto.BigBitfield do
  @moduledoc """
  Custom Ecto type that stores arbitrary-precision integers in a Postgres `numeric` column.
  Postgrex returns `Decimal` structs for numeric columns; this type converts
  between Elixir integers (arbitrary precision, needed for bitwise ops) and `Decimal`.
  """
  use Ecto.Type

  def type, do: :numeric

  # From DB (Decimal) → Elixir integer
  def load(%Decimal{} = d) do
    {:ok, Decimal.to_integer(d)}
  end
  def load(val) when is_integer(val), do: {:ok, val}
  def load(_), do: :error

  # From Elixir → DB (Decimal)
  def dump(val) when is_integer(val) do
    {:ok, Decimal.new(val)}
  end
  def dump(%Decimal{} = d), do: {:ok, d}
  def dump(_), do: :error

  # From user input (changesets)
  def cast(val) when is_integer(val), do: {:ok, val}
  def cast(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, ""} -> {:ok, n}
      _ -> :error
    end
  end
  def cast(%Decimal{} = d), do: {:ok, Decimal.to_integer(d)}
  def cast(_), do: :error
end
