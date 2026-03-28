/**
 * Burrow crypto utilities — Ed25519 key management, signing, PoW, fingerprinting.
 * Mirrors web/src/crypto.ts for compatibility with the backend.
 */
import * as ed from '@noble/ed25519';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform, Dimensions } from 'react-native';

// ---------- Polyfill crypto.getRandomValues for React Native ----------
// noble/ed25519 uses crypto.getRandomValues internally which doesn't exist in RN
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {};
}
if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  globalThis.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const bytes = Crypto.getRandomBytes(array.byteLength);
    const target = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    target.set(bytes);
    return array;
  };
}

// ---------- noble/ed25519 SHA-512 backend ----------
// noble/ed25519 v2 needs an async SHA-512 — wire it to expo-crypto
ed.etc.sha512Async = async (message: Uint8Array): Promise<Uint8Array> => {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA512,
    uint8ToHex(message),
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return hexToBytes(hex);
};

// ---------- Hex helpers ----------

export function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

// ---------- Key generation ----------

export interface DeviceKeys {
  privateKey: string; // hex
  publicKey: string;  // hex
}

export async function generateKeyPair(): Promise<DeviceKeys> {
  const privBytes = ed.utils.randomPrivateKey();
  const pubBytes = await ed.getPublicKeyAsync(privBytes);
  return {
    privateKey: uint8ToHex(privBytes),
    publicKey: uint8ToHex(pubBytes),
  };
}

// ---------- Signing ----------

export async function sign(message: Uint8Array, privateKeyHex: string): Promise<string> {
  const sig = await ed.signAsync(message, privateKeyHex);
  return uint8ToHex(sig);
}

export async function signString(message: string, privateKeyHex: string): Promise<string> {
  const encoded = new TextEncoder().encode(message);
  return sign(encoded, privateKeyHex);
}

// ---------- Proof of Work ----------

export async function solvePoW(publicKeyHex: string, difficulty = '0000'): Promise<string> {
  let nonce = 0;
  while (true) {
    const input = publicKeyHex + nonce.toString();
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
    if (hash.startsWith(difficulty)) {
      return nonce.toString();
    }
    nonce++;
    // Yield to UI thread every 1000 iterations
    if (nonce % 1000 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

// ---------- Device fingerprint ----------

export async function getDeviceFingerprint(): Promise<string> {
  const { width, height } = Dimensions.get('screen');
  const parts = [
    Device.modelName ?? 'unknown',
    Device.osName ?? Platform.OS,
    Device.osVersion ?? 'unknown',
    Application.applicationId ?? 'chat.burrow.app',
    `${width}x${height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  ];
  const raw = parts.join('|');
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return hash;
}

// ---------- Random nonce ----------

export function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return uint8ToHex(bytes);
}

// ---------- Request signing ----------

export async function signRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  privateKeyHex: string,
): Promise<string> {
  const message = `${method}\n${path}\n${timestamp}\n${nonce}`;
  return signString(message, privateKeyHex);
}
