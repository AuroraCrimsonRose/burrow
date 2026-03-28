import * as ed from '@noble/ed25519';

// Use Web Crypto for SHA-512 (required by noble-ed25519 v2)
ed.etc.sha512Sync = undefined; // ensure async mode
ed.etc.sha512Async = async (...messages: Uint8Array[]) => {
  const merged = concatBytes(...messages);
  const hash = await crypto.subtle.digest('SHA-512', merged as BufferSource);
  return new Uint8Array(hash);
};

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// ---- Key Management ----

export interface KeyPair {
  privateKey: string; // hex
  publicKey: string;  // hex
}

export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

export async function sign(message: Uint8Array, privateKeyHex: string): Promise<string> {
  const privateKey = hexToBytes(privateKeyHex);
  const signature = await ed.signAsync(message, privateKey);
  return bytesToHex(signature);
}

// ---- Proof of Work ----

export function solvePoW(inputHex: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pow-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ nonce: string }>) => {
      resolve(e.data.nonce);
      worker.terminate();
    };
    worker.onerror = (err) => {
      reject(new Error(err.message || 'PoW worker failed'));
      worker.terminate();
    };
    worker.postMessage({ inputHex });
  });
}

// ---- Device Fingerprint ----

export async function getDeviceFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');

  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(components));
  return bytesToHex(new Uint8Array(hash));
}

// ---- Hex Utilities ----

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---- Base64url Utilities ----

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
