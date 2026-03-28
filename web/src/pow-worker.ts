// Web Worker for Proof-of-Work computation (runs off main thread)

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

const POW_DIFFICULTY = '0000';

self.onmessage = async (e: MessageEvent<{ inputHex: string }>) => {
  const inputBytes = hexToBytes(e.data.inputHex);
  let nonce = 0;

  while (true) {
    const nonceStr = nonce.toString();
    const nonceBytes = new TextEncoder().encode(nonceStr);
    const input = concatBytes(inputBytes, nonceBytes);
    const hash = await crypto.subtle.digest('SHA-256', input as BufferSource);
    const hashHex = bytesToHex(new Uint8Array(hash));

    if (hashHex.startsWith(POW_DIFFICULTY)) {
      self.postMessage({ nonce: nonceStr });
      return;
    }
    nonce++;
  }
};
