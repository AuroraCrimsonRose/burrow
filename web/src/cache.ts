/**
 * IndexedDB cache for Burrow — stores recent messages, channels, roles, and server lists
 * for instant UI hydration on load, then refreshes from the network.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const DB_NAME = 'burrow_cache';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('messages')) {
        const ms = db.createObjectStore('messages', { keyPath: ['channelId', 'id'] });
        ms.createIndex('by_channel', 'channelId');
      }
      if (!db.objectStoreNames.contains('channels')) {
        db.createObjectStore('channels', { keyPath: ['serverId', 'id'] });
      }
      if (!db.objectStoreNames.contains('roles')) {
        db.createObjectStore('roles', { keyPath: ['serverId', 'id'] });
      }
      if (!db.objectStoreNames.contains('servers')) {
        db.createObjectStore('servers', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ── Generic helpers ──

async function putAll(storeName: string, items: any[]): Promise<void> {
  if (!items.length) return;
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const item of items) store.put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAll(storeName: string): Promise<any[]> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllByIndex(storeName: string, indexName: string, key: IDBValidKey): Promise<any[]> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  return new Promise((resolve, reject) => {
    const req = index.getAll(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearByIndex(storeName: string, indexName: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  const req = index.openCursor(key);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
      else resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Messages ──

const MAX_MESSAGES_PER_CHANNEL = 100;

export async function cacheMessages(channelId: string, messages: any[]): Promise<void> {
  // Tag each message with channelId for compound key
  const tagged = messages.map((m) => ({ ...m, channelId }));
  await clearByIndex('messages', 'by_channel', channelId);
  // Keep only the most recent MAX messages
  const sorted = tagged.sort((a, b) => a.id.localeCompare(b.id));
  const trimmed = sorted.slice(-MAX_MESSAGES_PER_CHANNEL);
  await putAll('messages', trimmed);
}

export async function getCachedMessages(channelId: string): Promise<any[]> {
  const rows = await getAllByIndex('messages', 'by_channel', channelId);
  return rows.sort((a: any, b: any) => a.id.localeCompare(b.id));
}

export async function cacheSingleMessage(channelId: string, message: any): Promise<void> {
  await putAll('messages', [{ ...message, channelId }]);
}

export async function removeCachedMessage(channelId: string, messageId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('messages', 'readwrite');
  tx.objectStore('messages').delete([channelId, messageId]);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Servers ──

export async function cacheServers(servers: any[]): Promise<void> {
  await clearStore('servers');
  await putAll('servers', servers);
}

export async function getCachedServers(): Promise<any[]> {
  return getAll('servers');
}

// ── Channels (with categories) ──

export async function cacheChannels(serverId: string, channels: any[]): Promise<void> {
  // Clear old channels for this server
  const db = await openDB();
  const tx = db.transaction('channels', 'readwrite');
  const store = tx.objectStore('channels');
  const all = await new Promise<any[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const ch of all) {
    if (ch.serverId === serverId) store.delete([serverId, ch.id]);
  }
  const tagged = channels.map((c) => ({ ...c, serverId }));
  for (const item of tagged) store.put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedChannels(serverId: string): Promise<any[]> {
  const all = await getAll('channels');
  return all.filter((c: any) => c.serverId === serverId);
}

// ── Roles ──

export async function cacheRoles(serverId: string, roles: any[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('roles', 'readwrite');
  const store = tx.objectStore('roles');
  const all = await new Promise<any[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const r of all) {
    if (r.serverId === serverId) store.delete([serverId, r.id]);
  }
  const tagged = roles.map((r) => ({ ...r, serverId }));
  for (const item of tagged) store.put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedRoles(serverId: string): Promise<any[]> {
  const all = await getAll('roles');
  return all.filter((r: any) => r.serverId === serverId);
}

// ── Full clear (on logout) ──

export async function clearAllCaches(): Promise<void> {
  await Promise.all([
    clearStore('messages'),
    clearStore('channels'),
    clearStore('roles'),
    clearStore('servers'),
  ]);
}
