defmodule Burrow.Auth.Mnemonic do
  @moduledoc """
  BIP39-compatible 24-word mnemonic generation for recovery keys.

  Generates 256 bits of entropy, derives 24 words from the BIP39 English wordlist.
  The mnemonic is hashed with SHA-256 for storage — the plaintext is shown once and
  must be stored by the user.
  """

  @wordlist_url "https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt"

  # Embedded BIP39 English wordlist (2048 words) — loaded at compile time.
  # For space, we generate from entropy bytes instead of embedding.

  @doc """
  Generate a 24-word recovery mnemonic.

  Returns `{mnemonic_string, hash}` where:
  - `mnemonic_string` is a space-separated 24-word phrase
  - `hash` is the SHA-256 hash of the mnemonic for storage
  """
  def generate do
    # 256 bits of entropy = 24 words in BIP39
    entropy = :crypto.strong_rand_bytes(32)
    words = entropy_to_words(entropy)
    mnemonic = Enum.join(words, " ")
    hash = :crypto.hash(:sha256, mnemonic)
    {mnemonic, hash}
  end

  @doc "Hash a mnemonic string for comparison."
  def hash_mnemonic(mnemonic) when is_binary(mnemonic) do
    :crypto.hash(:sha256, String.trim(mnemonic))
  end

  @doc "Verify a mnemonic against a stored hash."
  def verify(mnemonic, stored_hash) do
    hash_mnemonic(mnemonic) == stored_hash
  end

  # Convert 256 bits of entropy into 24 words.
  # Each word index is 11 bits (2^11 = 2048 words).
  # 256 bits / 11 bits = 23.27 words, so we add an 8-bit checksum
  # to get 264 bits / 11 = 24 words (BIP39 standard).
  defp entropy_to_words(entropy) do
    checksum = :binary.part(:crypto.hash(:sha256, entropy), 0, 1)
    bits = <<entropy::binary, checksum::binary>>

    bits
    |> bits_to_indices()
    |> Enum.map(&word_at/1)
  end

  defp bits_to_indices(<<>>, acc), do: Enum.reverse(acc)

  defp bits_to_indices(bits, acc \\ []) do
    case bits do
      <<index::11, rest::bitstring>> ->
        bits_to_indices(rest, [index | acc])

      # Discard trailing bits (less than 11)
      _ ->
        Enum.reverse(acc)
    end
  end

  defp word_at(index) do
    wordlist() |> Enum.at(index)
  end

  # Compile-time embedded wordlist
  @external_resource wordlist_path = Path.join(:code.priv_dir(:burrow), "bip39_english.txt")

  if File.exists?(wordlist_path) do
    @wordlist wordlist_path
             |> File.read!()
             |> String.split("\n", trim: true)
             |> Enum.map(&String.trim/1)

    defp wordlist, do: @wordlist
  else
    # Fallback: generate a deterministic 2048-word list from a seed.
    # This is only used if the BIP39 file is missing.
    defp wordlist do
      raise "BIP39 wordlist not found at priv/bip39_english.txt. Please add it."
    end
  end
end
