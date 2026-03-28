defmodule Burrow.Snowflake do
  @moduledoc """
  Generates Twitter-style snowflake IDs.

  Layout (64-bit signed integer):
    - Bit  63:      unused (sign bit, always 0)
    - Bits 22–62:   milliseconds since custom epoch (41 bits → ~69 years)
    - Bits 12–21:   worker ID (10 bits → 1024 workers)
    - Bits  0–11:   sequence within same millisecond (12 bits → 4096/ms)

  Custom epoch: 2026-01-01 00:00:00 UTC
  """

  use GenServer
  import Bitwise

  @epoch 1_735_689_600_000  # 2026-01-01 00:00:00 UTC in ms
  @worker_bits 10
  @sequence_bits 12
  @max_sequence bsl(1, @sequence_bits) - 1

  # --- Public API ---

  def start_link(opts \\ []) do
    worker_id = Keyword.get(opts, :worker_id, default_worker_id())
    GenServer.start_link(__MODULE__, worker_id, name: __MODULE__)
  end

  @doc "Generate the next snowflake ID."
  def next_id do
    GenServer.call(__MODULE__, :next_id)
  end

  # --- GenServer callbacks ---

  @impl true
  def init(worker_id) when worker_id >= 0 and worker_id < bsl(1, @worker_bits) do
    {:ok, %{worker_id: worker_id, sequence: 0, last_timestamp: 0}}
  end

  @impl true
  def handle_call(:next_id, _from, state) do
    timestamp = current_timestamp()

    {sequence, timestamp} =
      cond do
        timestamp == state.last_timestamp ->
          seq = state.sequence + 1

          if seq > @max_sequence do
            # Sequence exhausted for this ms — wait for next ms
            ts = wait_next_ms(timestamp)
            {0, ts}
          else
            {seq, timestamp}
          end

        timestamp > state.last_timestamp ->
          {0, timestamp}

        true ->
          # Clock moved backwards — wait it out
          ts = wait_next_ms(state.last_timestamp)
          {0, ts}
      end

    id =
      bsl(timestamp, @worker_bits + @sequence_bits)
      |> bor(bsl(state.worker_id, @sequence_bits))
      |> bor(sequence)

    {:reply, id, %{state | sequence: sequence, last_timestamp: timestamp}}
  end

  # --- Helpers ---

  defp current_timestamp do
    System.system_time(:millisecond) - @epoch
  end

  defp wait_next_ms(last_ts) do
    ts = current_timestamp()

    if ts <= last_ts do
      Process.sleep(1)
      wait_next_ms(last_ts)
    else
      ts
    end
  end

  defp default_worker_id do
    # Derive from hostname hash — good enough for dev, configurable in prod
    {:ok, hostname} = :inet.gethostname()

    hostname
    |> to_string()
    |> :erlang.phash2(1 <<< @worker_bits)
  end
end
