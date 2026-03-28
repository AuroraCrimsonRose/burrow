import * as SecureStore from 'expo-secure-store';
import type { DeviceKeys } from '../crypto';

const TOKEN_KEY = 'burrow_session_token';
const USER_KEY = 'burrow_current_user';
const KEYS_KEY = 'burrow_device_keys';

// ---------- Session Token ----------

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ---------- Cached User ----------

export async function getCachedUser(): Promise<Record<string, unknown> | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedUser(user: Record<string, unknown>): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

// ---------- Device Keys (Ed25519) ----------

export async function getDeviceKeys(): Promise<DeviceKeys | null> {
  const raw = await SecureStore.getItemAsync(KEYS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceKeys;
  } catch {
    return null;
  }
}

export async function setDeviceKeys(keys: DeviceKeys): Promise<void> {
  await SecureStore.setItemAsync(KEYS_KEY, JSON.stringify(keys));
}

// ---------- Clear all ----------

export async function clearAll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
    SecureStore.deleteItemAsync(KEYS_KEY),
  ]);
}
