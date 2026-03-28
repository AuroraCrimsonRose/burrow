/**
 * Burrow API client — all REST endpoints.
 * Mobile uses Bearer token auth only (no Ed25519 signing — that's web-only).
 */
import { getToken } from '../auth/store';

const PROD_URL = 'https://app.catxhosting.com';
const DEV_URL = 'https://app.catxhosting.com'; // Use prod API during dev (no local backend)
const BASE_URL = __DEV__ ? DEV_URL : PROD_URL;

export { BASE_URL };

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

// ---------- Request infrastructure ----------

function randomNonce(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = await getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomNonce();
  headers['X-Request-Timestamp'] = timestamp;
  headers['X-Request-Nonce'] = nonce;

  return headers;
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const headers = await buildHeaders();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    method,
    headers: { ...headers, ...(opts.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ---------- Auth (unauthenticated) ----------

async function authRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

export interface AuthResponse {
  session_token: string;
  user: {
    id: string;
    username: string;
    trust_tier: number;
    is_dev?: boolean;
  };
  recovery_phrase?: string;
}

export interface ChallengeResponse {
  challenge_id: string;
  nonce: string;
}

export function registerAccount(data: {
  public_key: string;
  nonce: string;
  username: string;
  device_fingerprint_hash: string;
  device_label: string;
}) {
  return authRequest<AuthResponse>('/api/v1/auth/register', data);
}

export function createChallenge(username: string) {
  return authRequest<ChallengeResponse>('/api/v1/auth/challenge', { username });
}

export function verifyChallenge(data: {
  challenge_id: string;
  signature: string;
  public_key: string;
}) {
  return authRequest<AuthResponse>('/api/v1/auth/verify', data);
}

export function recoverAccount(data: {
  username: string;
  mnemonic: string;
  public_key: string;
  device_fingerprint_hash: string;
  device_label: string;
}) {
  return authRequest<AuthResponse>('/api/v1/auth/recover', data);
}

// ---------- Device Pairing ----------

export function claimPairingCode(data: {
  code: string;
}) {
  return authRequest<AuthResponse>('/api/v1/auth/pairing/claim', data);
}

export function createPairingCode() {
  return request<{ id: string; code: string; token: string; expires_at: string }>('/api/v1/auth/pairing', {
    method: 'POST',
  });
}

export function getPairingStatus(pairingId: string) {
  return request<{ status: string }>(`/api/v1/auth/pairing/${enc(pairingId)}`);
}

// ---------- Profile ----------

export function getMe() {
  return request<Record<string, unknown>>('/api/v1/auth/me');
}

export function getProfile() {
  return request<Record<string, unknown>>('/api/v1/auth/profile');
}

export function updateProfile(data: Record<string, unknown>) {
  return request<Record<string, unknown>>('/api/v1/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ---------- Sessions ----------

export async function getSessions() {
  const res = await request<{ sessions: unknown[] }>('/api/v1/auth/sessions');
  return res.sessions;
}

export function deleteSession(id: string) {
  return request<void>(`/api/v1/auth/sessions/${enc(id)}`, { method: 'DELETE' });
}

// ---------- Servers ----------

export async function getServers() {
  const res = await request<{ servers: unknown[] }>('/api/v1/servers');
  return res.servers;
}

export function getServer(id: string) {
  return request<Record<string, unknown>>(`/api/v1/servers/${enc(id)}`);
}

export function createServer(name: string) {
  return request<Record<string, unknown>>('/api/v1/servers', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function deleteServer(id: string) {
  return request<void>(`/api/v1/servers/${enc(id)}`, { method: 'DELETE' });
}

export function leaveServer(id: string) {
  return request<void>(`/api/v1/servers/${enc(id)}/leave`, { method: 'POST' });
}

export function ackServer(id: string) {
  return request<void>(`/api/v1/servers/${enc(id)}/ack`, { method: 'POST' });
}

// ---------- Channels ----------

export async function getChannels(serverId: string) {
  const res = await request<{ channels: unknown[] }>(`/api/v1/servers/${enc(serverId)}/channels`);
  return res.channels;
}

export function createChannel(serverId: string, data: { name: string; type: string; category_id?: string }) {
  return request<Record<string, unknown>>(`/api/v1/servers/${enc(serverId)}/channels`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---------- Messages ----------

export async function getMessages(serverId: string, channelId: string, before?: string, limit = 50) {
  let q = `?limit=${limit}`;
  if (before) q += `&before=${enc(before)}`;
  const res = await request<{ messages: unknown[] }>(
    `/api/v1/servers/${enc(serverId)}/channels/${enc(channelId)}/messages${q}`,
  );
  return res.messages;
}

export function sendMessage(
  serverId: string,
  channelId: string,
  data: { content: string; reply_to_id?: string; attachments?: unknown[] },
) {
  return request<Record<string, unknown>>(
    `/api/v1/servers/${enc(serverId)}/channels/${enc(channelId)}/messages`,
    { method: 'POST', body: JSON.stringify(data) },
  );
}

export function editMessage(serverId: string, channelId: string, msgId: string, content: string) {
  return request<Record<string, unknown>>(
    `/api/v1/servers/${enc(serverId)}/channels/${enc(channelId)}/messages/${enc(msgId)}`,
    { method: 'PATCH', body: JSON.stringify({ content }) },
  );
}

export function deleteMessage(serverId: string, channelId: string, msgId: string) {
  return request<void>(
    `/api/v1/servers/${enc(serverId)}/channels/${enc(channelId)}/messages/${enc(msgId)}`,
    { method: 'DELETE' },
  );
}

export function ackChannel(serverId: string, channelId: string, messageId: string) {
  return request<void>(
    `/api/v1/servers/${enc(serverId)}/channels/${enc(channelId)}/ack`,
    { method: 'POST', body: JSON.stringify({ message_id: messageId }) },
  );
}

// ---------- Reactions ----------

export function addReaction(serverId: string, channelId: string, msgId: string, emoji: string) {
  return request<void>(
    `/api/v1/servers/${enc(serverId)}/channels/${enc(channelId)}/messages/${enc(msgId)}/reactions/${enc(emoji)}`,
    { method: 'PUT' },
  );
}

export function removeReaction(serverId: string, channelId: string, msgId: string, emoji: string) {
  return request<void>(
    `/api/v1/servers/${enc(serverId)}/channels/${enc(channelId)}/messages/${enc(msgId)}/reactions/${enc(emoji)}`,
    { method: 'DELETE' },
  );
}

// ---------- Search ----------

export async function searchMessages(serverId: string, query: string, opts?: { author_id?: string; offset?: number; limit?: number }) {
  const params = new URLSearchParams({ q: query });
  if (opts?.author_id) params.set('author_id', opts.author_id);
  if (opts?.offset) params.set('offset', opts.offset.toString());
  if (opts?.limit) params.set('limit', opts.limit.toString());
  const res = await request<{ messages: unknown[] }>(`/api/v1/servers/${enc(serverId)}/messages/search?${params}`);
  return res.messages;
}

// ---------- DMs ----------

export async function getDMs() {
  const res = await request<{ dm_channels: unknown[] }>('/api/v1/dms');
  return res.dm_channels;
}

export function createDM(userId: string) {
  return request<Record<string, unknown>>('/api/v1/dms', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function getDMMessages(dmId: string, before?: string, limit = 50) {
  let q = `?limit=${limit}`;
  if (before) q += `&before=${enc(before)}`;
  const res = await request<{ messages: unknown[] }>(`/api/v1/dms/${enc(dmId)}/messages${q}`);
  return res.messages;
}

export function sendDMMessage(dmId: string, content: string) {
  return request<Record<string, unknown>>(`/api/v1/dms/${enc(dmId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function editDMMessage(dmId: string, msgId: string, content: string) {
  return request<Record<string, unknown>>(
    `/api/v1/dms/${enc(dmId)}/messages/${enc(msgId)}`,
    { method: 'PATCH', body: JSON.stringify({ content }) },
  );
}

export function deleteDMMessage(dmId: string, msgId: string) {
  return request<void>(`/api/v1/dms/${enc(dmId)}/messages/${enc(msgId)}`, { method: 'DELETE' });
}

export function ackDM(dmId: string, messageId: string) {
  return request<void>(`/api/v1/dms/${enc(dmId)}/ack`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId }),
  });
}

// ---------- Friends ----------

export async function getFriends() {
  const res = await request<{ friends: unknown[] }>('/api/v1/friends');
  return res.friends;
}

export async function getFriendRequests() {
  const res = await request<{ incoming: unknown[]; outgoing: unknown[] }>('/api/v1/friends/requests');
  return { incoming: res.incoming, outgoing: res.outgoing };
}

export async function getBlockedUsers() {
  const res = await request<{ blocked: unknown[] }>('/api/v1/friends/blocked');
  return res.blocked;
}

export function sendFriendRequest(userId: string) {
  return request<Record<string, unknown>>('/api/v1/friends/request', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export function acceptFriend(userId: string) {
  return request<void>(`/api/v1/friends/${enc(userId)}/accept`, { method: 'POST' });
}

export function declineFriend(userId: string) {
  return request<void>(`/api/v1/friends/${enc(userId)}/decline`, { method: 'POST' });
}

export function removeFriend(userId: string) {
  return request<void>(`/api/v1/friends/${enc(userId)}`, { method: 'DELETE' });
}

export function blockUser(userId: string) {
  return request<void>(`/api/v1/friends/${enc(userId)}/block`, { method: 'POST' });
}

export function unblockUser(userId: string) {
  return request<void>(`/api/v1/friends/${enc(userId)}/block`, { method: 'DELETE' });
}

export function getFriendPresence() {
  return request<Record<string, unknown>>('/api/v1/friends/presence');
}

// ---------- Users ----------

export function getUserProfile(userId: string) {
  return request<Record<string, unknown>>(`/api/v1/users/${enc(userId)}/profile`);
}

export function getUserNote(userId: string) {
  return request<{ content: string }>(`/api/v1/users/${enc(userId)}/note`);
}

export function setUserNote(userId: string, content: string) {
  return request<void>(`/api/v1/users/${enc(userId)}/note`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// ---------- Invites ----------

export function acceptInvite(code: string) {
  return request<Record<string, unknown>>(`/api/v1/invites/${enc(code)}/accept`, { method: 'POST' });
}

export async function getServerInvites(serverId: string) {
  const res = await request<{ invites: unknown[] }>(`/api/v1/servers/${enc(serverId)}/invites`);
  return res.invites;
}

export function createInvite(serverId: string, maxUses?: number) {
  return request<Record<string, unknown>>(`/api/v1/servers/${enc(serverId)}/invites`, {
    method: 'POST',
    body: JSON.stringify(maxUses != null ? { max_uses: maxUses } : {}),
  });
}

// ---------- Roles / Permissions ----------

export async function getRoles(serverId: string) {
  const res = await request<{ data: unknown[] }>(`/api/v1/servers/${enc(serverId)}/roles`);
  return res.data;
}

export function getMyPermissions(serverId: string) {
  return request<{ permissions: number }>(`/api/v1/servers/${enc(serverId)}/permissions`);
}

// ---------- Members ----------

export async function getMembers(serverId: string) {
  const res = await request<{ members: unknown[] }>(`/api/v1/servers/${enc(serverId)}/members`);
  return res.members;
}

export function kickMember(serverId: string, userId: string) {
  return request<void>(`/api/v1/servers/${enc(serverId)}/members/${enc(userId)}`, { method: 'DELETE' });
}

// ---------- Read States ----------

export async function getReadStates() {
  const res = await request<{ read_states: unknown[] }>('/api/v1/users/@me/read-states');
  return res.read_states;
}

// ---------- Uploads ----------

export function getSignedUrl(key: string) {
  return request<{ url: string }>(`/api/v1/uploads/signed-url?key=${enc(key)}`);
}

// ---------- Badges ----------

export async function getBadges() {
  const res = await request<{ badges: unknown[] }>('/api/v1/badges');
  return res.badges;
}

export function setPrimaryBadge(badgeId: number) {
  return request<void>('/api/v1/badges/primary', {
    method: 'PUT',
    body: JSON.stringify({ badge_id: badgeId }),
  });
}

export function clearPrimaryBadge() {
  return request<void>('/api/v1/badges/primary', { method: 'DELETE' });
}

// ---------- Networks ----------

export async function getNetworks() {
  const res = await request<{ networks: unknown[] }>('/api/v1/networks');
  return res.networks;
}

// ---------- Categories ----------

export async function getCategories(serverId: string) {
  const res = await request<{ categories: unknown[]; uncategorized: unknown[] }>(`/api/v1/servers/${enc(serverId)}/categories`);
  return { categories: res.categories, uncategorized: res.uncategorized };
}

// ---------- Stats ----------

export function getPlatformStats() {
  return request<Record<string, unknown>>('/api/v1/stats/platform');
}

// ---------- Utilities ----------

function enc(s: string) {
  return encodeURIComponent(s);
}
