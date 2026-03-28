const API_BASE = '/api/v1';

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function signRequest(method: string, path: string, timestamp: string, nonce: string): Promise<string | null> {
  try {
    const { getState } = await import('./store');
    const keys = getState().keys;
    if (!keys) return null;

    const { sign: edSign } = await import('./crypto');
    const message = `${method}\n${path}\n${timestamp}\n${nonce}`;
    const msgBytes = new TextEncoder().encode(message);
    return await edSign(msgBytes, keys.privateKey);
  } catch {
    return null;
  }
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem('session_token');
  const method = ((options.method as string) || 'GET').toUpperCase();
  const fullPath = `${API_BASE}${path.split('?')[0]}`;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Timestamp': timestamp,
    'X-Request-Nonce': nonce,
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    const sig = await signRequest(method, fullPath, timestamp, nonce);
    if (sig) {
      headers['X-Device-Signature'] = sig;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const { clearSession } = await import('./store');
      clearSession();
    }
    throw new ApiError(res.status, body.detail || body.error || body.message || res.statusText);
  }

  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---- Auth ----

export async function register(params: {
  public_key: string;
  nonce: string;
  username: string;
  device_fingerprint_hash: string;
  device_label?: string;
}) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function createChallenge(username: string) {
  return request('/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function verifyChallenge(params: {
  challenge_id: string;
  signature: string;
  public_key: string;
}) {
  return request('/auth/verify', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function recoverAccount(params: {
  username: string;
  mnemonic: string;
  public_key: string;
  device_fingerprint_hash: string;
  device_label?: string;
}) {
  return request('/auth/recover', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ---- WebAuthn / Passkey Auth ----

export async function webauthnRegisterBegin(params: {
  username: string;
  age_verified: boolean;
  tos_accepted: boolean;
  privacy_accepted: boolean;
}) {
  return request('/auth/webauthn/register/begin', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function webauthnRegisterComplete(params: {
  challenge_id: string;
  pow_nonce: string;
  credential: {
    id: string;
    rawId: string;
    type: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
    };
  };
  device_label?: string;
  age_verified?: boolean;
  tos_accepted?: boolean;
  privacy_accepted?: boolean;
}) {
  return request('/auth/webauthn/register/complete', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function webauthnLoginBegin(username: string) {
  return request('/auth/webauthn/login/begin', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function webauthnLoginComplete(params: {
  challenge_id: string;
  credential: {
    id: string;
    rawId: string;
    type: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
    };
  };
}) {
  return request('/auth/webauthn/login/complete', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ---- Recovery Key ----

export async function generateRecoveryKey() {
  return request('/auth/recovery-key', { method: 'POST' });
}

export async function confirmRecoveryKey(mnemonic: string) {
  return request('/auth/recovery-key/confirm', {
    method: 'POST',
    body: JSON.stringify({ mnemonic }),
  });
}

// ---- Passkey Management ----

export async function listPasskeys(): Promise<{ passkeys: { id: string; label: string | null; created_at: string; last_used_at: string | null }[] }> {
  return request('/auth/passkeys');
}

export async function revokePasskey(id: string) {
  return request(`/auth/passkeys/${id}`, { method: 'DELETE' });
}

export async function renamePasskey(id: string, label: string) {
  return request(`/auth/passkeys/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ label }),
  });
}

export async function passkeyAddBegin() {
  return request('/auth/passkeys/add/begin', { method: 'POST' });
}

export async function passkeyAddComplete(params: {
  challenge_id: string;
  credential: {
    id: string;
    rawId: string;
    type: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
    };
  };
  label?: string;
}) {
  return request('/auth/passkeys/add/complete', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ---- Servers ----

export async function listServers() {
  return request('/servers');
}

export async function createServer(name: string) {
  return request('/servers', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getServer(serverId: string) {
  return request(`/servers/${serverId}`);
}

export async function updateServer(serverId: string, data: { name?: string }) {
  return request(`/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteServer(serverId: string) {
  return request(`/servers/${serverId}`, { method: 'DELETE' });
}

export async function transferOwnership(serverId: string, newOwnerId: string) {
  return request(`/servers/${serverId}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_owner_id: newOwnerId }),
  });
}

export async function listInvites(serverId: string) {
  return request(`/servers/${serverId}/invites`);
}

export async function createInvite(serverId: string, opts?: { max_uses?: number; expires_in?: number }) {
  return request(`/servers/${serverId}/invites`, {
    method: 'POST',
    body: JSON.stringify(opts || {}),
  });
}

export async function deleteInvite(serverId: string, code: string) {
  return request(`/servers/${serverId}/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

export async function listRoles(serverId: string) {
  return request(`/servers/${serverId}/roles`);
}

export async function createRole(serverId: string, name: string, permissions: number) {
  return request(`/servers/${serverId}/roles`, {
    method: 'POST',
    body: JSON.stringify({ name, permissions }),
  });
}

export async function updateRole(serverId: string, roleId: string, data: { name?: string; permissions?: string | number; hoist?: boolean; color?: string; mentionable?: boolean }) {
  return request(`/servers/${serverId}/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteRole(serverId: string, roleId: string) {
  return request(`/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' });
}

export async function reorderRoles(serverId: string, positions: { id: string; position: number }[]) {
  return request(`/servers/${serverId}/roles/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ positions }),
  });
}

export async function listMembers(serverId: string) {
  return request(`/servers/${serverId}/members`);
}

export async function updateServerProfile(serverId: string, data: { nickname?: string; bio?: string; pronouns?: string }) {
  return request(`/servers/${serverId}/members/@me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function listBans(serverId: string) {
  return request(`/servers/${serverId}/bans`);
}

// ---- Moderation ----

export async function getMyPermissions(serverId: string) {
  return request(`/servers/${serverId}/permissions`);
}

export async function kickMember(serverId: string, userId: string) {
  return request(`/servers/${serverId}/members/${userId}`, { method: 'DELETE' });
}

export async function banMember(serverId: string, userId: string, reason?: string) {
  return request(`/servers/${serverId}/bans`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, reason }),
  });
}

export async function unbanMember(serverId: string, userId: string) {
  return request(`/servers/${serverId}/bans/${userId}`, { method: 'DELETE' });
}

export async function timeoutMember(serverId: string, userId: string, duration: number) {
  return request(`/servers/${serverId}/timeouts`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, duration }),
  });
}

export async function removeTimeout(serverId: string, userId: string) {
  return request(`/servers/${serverId}/timeouts/${userId}`, { method: 'DELETE' });
}

export async function updateMemberNickname(serverId: string, userId: string, nickname: string) {
  return request(`/servers/${serverId}/members/${userId}/nickname`, {
    method: 'PATCH',
    body: JSON.stringify({ nickname }),
  });
}

export async function assignRole(serverId: string, userId: string, roleId: string) {
  return request(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
}

export async function unassignRole(serverId: string, userId: string, roleId: string) {
  return request(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' });
}

export async function createChannel(serverId: string, name: string, type: string, categoryId?: string, opts?: { bitrate?: number; user_limit?: number }) {
  const body: Record<string, string | number> = { name, type };
  if (categoryId) body.category_id = categoryId;
  if (opts?.bitrate) body.bitrate = opts.bitrate;
  if (opts?.user_limit) body.user_limit = opts.user_limit;
  return request(`/servers/${serverId}/channels`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteChannel(serverId: string, channelId: string) {
  return request(`/servers/${serverId}/channels/${channelId}`, { method: 'DELETE' });
}

// ---- Channels ----

export async function listChannels(serverId: string) {
  return request(`/servers/${serverId}/channels`);
}

// ---- Categories ----

export async function listCategories(serverId: string) {
  return request(`/servers/${serverId}/categories`);
}

export async function createCategory(serverId: string, name: string) {
  return request(`/servers/${serverId}/categories`, { method: 'POST', body: JSON.stringify({ name }) });
}

export async function updateCategory(serverId: string, categoryId: string, name: string) {
  return request(`/servers/${serverId}/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export async function deleteCategory(serverId: string, categoryId: string) {
  return request(`/servers/${serverId}/categories/${categoryId}`, { method: 'DELETE' });
}

// ---- Messages ----

export async function listMessages(serverId: string, channelId: string, opts?: { before?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.before) params.set('before', opts.before);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return request(`/servers/${serverId}/channels/${channelId}/messages${qs ? '?' + qs : ''}`);
}

export async function searchMessages(serverId: string, query: string, filters?: {
  author_id?: string;
  content_type?: string;
  after?: string;
  before?: string;
  offset?: number;
  limit?: number;
}) {
  const params = new URLSearchParams({ q: query });
  if (filters?.author_id) params.set('author_id', filters.author_id);
  if (filters?.content_type) params.set('content_type', filters.content_type);
  if (filters?.after) params.set('after', filters.after);
  if (filters?.before) params.set('before', filters.before);
  if (filters?.offset != null) params.set('offset', String(filters.offset));
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  return request(`/servers/${serverId}/messages/search?${params.toString()}`);
}

export async function getProfile() {
  return request('/auth/profile');
}

export async function getMe(): Promise<{ user: { id: string; username: string; trust_tier: number; is_dev?: boolean } }> {
  return request('/auth/me');
}

export async function updateProfile(data: { bio?: string; pronouns?: string; banner_url?: string; display_name?: string; accent_color?: string | null; friends_only_dms?: boolean }) {
  return request('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export interface Attachment {
  key: string;
  filename: string;
  content_type: string;
  size: number;
  url?: string;
}

export async function sendMessage(serverId: string, channelId: string, content: string, replyToId?: string, attachments?: Attachment[]) {
  const body: Record<string, unknown> = {};
  if (content) body.content = content;
  if (replyToId) body.reply_to_id = replyToId;
  if (attachments && attachments.length > 0) body.attachments = attachments;
  return request(`/servers/${serverId}/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function editMessage(serverId: string, channelId: string, messageId: string, content: string) {
  return request(`/servers/${serverId}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export async function deleteMessage(serverId: string, channelId: string, messageId: string) {
  return request(`/servers/${serverId}/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

export async function reactToMessage(serverId: string, channelId: string, messageId: string, emoji: string) {
  return request(`/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
    method: 'PUT',
  });
}

export async function removeReaction(serverId: string, channelId: string, messageId: string, emoji: string) {
  return request(`/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
  });
}

// ---- Friends ----

export async function listFriends() {
  return request('/friends');
}

export async function listFriendRequests() {
  return request('/friends/requests');
}

export async function sendFriendRequest(userId: string) {
  return request('/friends/request', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function acceptFriendRequest(userId: string) {
  return request(`/friends/${userId}/accept`, { method: 'POST' });
}

export async function declineFriendRequest(userId: string) {
  return request(`/friends/${userId}/decline`, { method: 'POST' });
}

export async function removeFriend(userId: string) {
  return request(`/friends/${userId}`, { method: 'DELETE' });
}

export async function blockUser(userId: string) {
  return request(`/friends/${userId}/block`, { method: 'POST' });
}

export async function unblockUser(userId: string) {
  return request(`/friends/${userId}/block`, { method: 'DELETE' });
}

// ---- DMs ----

export async function listDMs() {
  return request('/dms');
}

export async function createDM(userId: string) {
  return request('/dms', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function listDMMessages(dmId: string, opts?: { before?: string; after?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.before) params.set('before', opts.before);
  if (opts?.after) params.set('after', opts.after);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return request(`/dms/${dmId}/messages${qs ? `?${qs}` : ''}`);
}

export async function sendDMMessage(dmId: string, content: string) {
  return request(`/dms/${dmId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function editDMMessage(dmId: string, messageId: string, content: string) {
  return request(`/dms/${dmId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export async function deleteDMMessage(dmId: string, messageId: string) {
  return request(`/dms/${dmId}/messages/${messageId}`, { method: 'DELETE' });
}

// ---- Read States ----

export async function listReadStates(): Promise<{ read_states: { channel_id: string; last_read_message_id: string | null; last_read_seq: number; mention_count: number }[] }> {
  return request('/users/@me/read-states') as any;
}

export async function ackDm(dmId: string, messageId: string) {
  return request(`/dms/${dmId}/ack`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId }),
  });
}

export async function ackChannel(serverId: string, channelId: string, messageId: string) {
  return request(`/servers/${serverId}/channels/${channelId}/ack`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId }),
  });
}

export async function ackServer(serverId: string) {
  return request(`/servers/${serverId}/ack`, { method: 'POST' });
}

// ---- Sessions ----

export async function listSessions() {
  return request('/auth/sessions');
}

export async function revokeSession(sessionId: string) {
  return request(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function revokeOtherSessions() {
  return request('/auth/sessions', { method: 'DELETE' });
}

// ---- Device Pairing ----

export async function createPairingCode(): Promise<{ code: string; token: string; pairing_id: string; expires_at: string }> {
  return request('/auth/pairing', { method: 'POST' });
}

export async function getPairingStatus(pairingId: string): Promise<{ status: 'pending' | 'claimed' | 'expired' }> {
  return request(`/auth/pairing/${pairingId}`);
}

// ---- Uploads ----

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks (Cloudflare-safe)

export async function uploadFile(
  file: File,
  category = 'files',
  onProgress?: (loaded: number, total: number) => void,
) {
  const token = localStorage.getItem('session_token');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const authHeaders: Record<string, string> = {
    'X-Request-Timestamp': timestamp,
    'X-Request-Nonce': nonce,
  };
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
    const sig = await signRequest('POST', `${API_BASE}/uploads`, timestamp, nonce);
    if (sig) authHeaders['X-Device-Signature'] = sig;
  }

  // Small files (< 5 MB): direct upload
  if (file.size < CHUNK_SIZE) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.detail || body.error || res.statusText);
    }
    onProgress?.(file.size, file.size);
    return res.json();
  }

  // Large files: chunked multipart upload
  // 1. Init
  const initTimestamp = Math.floor(Date.now() / 1000).toString();
  const initNonce = generateNonce();
  const initHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Timestamp': initTimestamp,
    'X-Request-Nonce': initNonce,
  };
  if (token) {
    initHeaders['Authorization'] = `Bearer ${token}`;
    const sig = await signRequest('POST', `${API_BASE}/uploads/chunked/init`, initTimestamp, initNonce);
    if (sig) initHeaders['X-Device-Signature'] = sig;
  }
  const initRes = await fetch(`${API_BASE}/uploads/chunked/init`, {
    method: 'POST',
    headers: initHeaders,
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size: file.size,
    }),
  });
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new ApiError(initRes.status, body.detail || body.error || initRes.statusText);
  }
  const { upload_id, key } = await initRes.json();

  // 2. Upload chunks sequentially
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let uploaded = 0;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const partNumber = i + 1;

    const chunkPath = `${API_BASE}/uploads/chunked/${encodeURIComponent(upload_id)}/${partNumber}`;
    const chunkTimestamp = Math.floor(Date.now() / 1000).toString();
    const chunkNonce = generateNonce();
    const chunkHeaders: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Request-Timestamp': chunkTimestamp,
      'X-Request-Nonce': chunkNonce,
    };
    if (token) {
      chunkHeaders['Authorization'] = `Bearer ${token}`;
      const sig = await signRequest('PUT', chunkPath, chunkTimestamp, chunkNonce);
      if (sig) chunkHeaders['X-Device-Signature'] = sig;
    }

    const chunkRes = await fetch(chunkPath, {
        method: 'PUT',
        headers: chunkHeaders,
        body: chunk,
      },
    );
    if (!chunkRes.ok) {
      const body = await chunkRes.json().catch(() => ({}));
      throw new ApiError(chunkRes.status, body.detail || body.error || chunkRes.statusText);
    }

    uploaded += end - start;
    onProgress?.(uploaded, file.size);
  }

  // 3. Complete
  const completePath = `${API_BASE}/uploads/chunked/${encodeURIComponent(upload_id)}/complete`;
  const completeTimestamp = Math.floor(Date.now() / 1000).toString();
  const completeNonce = generateNonce();
  const completeHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Timestamp': completeTimestamp,
    'X-Request-Nonce': completeNonce,
  };
  if (token) {
    completeHeaders['Authorization'] = `Bearer ${token}`;
    const sig = await signRequest('POST', completePath, completeTimestamp, completeNonce);
    if (sig) completeHeaders['X-Device-Signature'] = sig;
  }
  const completeRes = await fetch(completePath, {
      method: 'POST',
      headers: completeHeaders,
      body: '{}',
    },
  );
  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => ({}));
    throw new ApiError(completeRes.status, body.detail || body.error || completeRes.statusText);
  }
  return completeRes.json();
}

export async function getPresignedUploadUrl(filename: string, contentType: string, category = 'files') {
  return request('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ filename, content_type: contentType, category }),
  });
}

export async function getSignedDownloadUrl(key: string) {
  return request(`/uploads/signed-url?key=${encodeURIComponent(key)}`);
}

export async function getScanStatus(key: string) {
  return request(`/uploads/scan-status?key=${encodeURIComponent(key)}`);
}

// ---- Networks ----

export async function listNetworks() {
  return request('/networks');
}

export async function createNetwork(name: string, serverIds: string[]) {
  return request('/networks', {
    method: 'POST',
    body: JSON.stringify({ name, server_ids: serverIds }),
  });
}

export async function updateNetwork(networkId: string, name: string) {
  return request(`/networks/${networkId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteNetwork(networkId: string) {
  return request(`/networks/${networkId}`, { method: 'DELETE' });
}

export async function addServerToNetwork(networkId: string, serverId: string) {
  return request(`/networks/${networkId}/servers/${serverId}`, { method: 'PUT' });
}

export async function removeServerFromNetwork(networkId: string, serverId: string) {
  return request(`/networks/${networkId}/servers/${serverId}`, { method: 'DELETE' });
}

// ── Invites ──

export async function acceptInvite(code: string) {
  return request(`/invites/${encodeURIComponent(code)}/accept`, { method: 'POST' });
}

// ── Analytics ──

export async function getTopologyActivity(): Promise<Record<string, { overall: number; voice: number; friendActivity: number; friendVoice: number; newMembers: number; reactions: number }>> {
  const res = await request('/analytics/topology');
  return res.activity || {};
}

// ---- Platform Stats ----

export async function getPlatformStats(): Promise<{ users: number; servers: number; members: number; messages: number }> {
  return request('/stats/platform');
}

// ---- Terms & Privacy ----

export async function getTosStatus() {
  return request('/auth/tos-status');
}

export async function acceptTerms(params: { accept_tos?: boolean; accept_privacy?: boolean }) {
  return request('/auth/accept-terms', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function verifyNsfwAge() {
  return request('/auth/nsfw-verify', { method: 'POST' });
}

// ---- User Profiles ----

export async function getUserProfile(userId: string) {
  return request(`/users/${userId}/profile`);
}

export async function getUserNote(userId: string) {
  return request(`/users/${userId}/note`);
}

export async function setUserNote(userId: string, content: string) {
  return request(`/users/${userId}/note`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function deleteUserNote(userId: string) {
  return request(`/users/${userId}/note`, { method: 'DELETE' });
}

// ---- Badges ----

export async function listBadges() {
  return request('/badges');
}

export async function setPrimaryBadge(badgeId: number) {
  return request('/badges/primary', {
    method: 'PUT',
    body: JSON.stringify({ badge_id: String(badgeId) }),
  });
}

export async function clearPrimaryBadge() {
  return request('/badges/primary', { method: 'DELETE' });
}

export async function grantBadge(userId: string, badgeId: number) {
  return request('/badges/grant', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, badge_id: String(badgeId) }),
  });
}

export async function revokeBadge(userId: string, badgeId: number) {
  return request('/badges/revoke', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, badge_id: String(badgeId) }),
  });
}

export async function releaseAncientBadges() {
  return request('/badges/release-ancient', { method: 'POST' });
}

// ---- Admin ----

export async function setDev(userId: string, isDev: boolean) {
  return request('/admin/set-dev', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, is_dev: isDev }),
  });
}

// ---- Channel Permission Overrides ----

export async function listChannelOverrides(serverId: string, channelId: string) {
  return request(`/servers/${serverId}/channels/${channelId}/overrides`);
}

export async function setChannelOverride(serverId: string, channelId: string, targetType: string, targetId: string, allow: string, deny: string) {
  return request(`/servers/${serverId}/channels/${channelId}/overrides`, {
    method: 'PUT',
    body: JSON.stringify({ target_type: targetType, target_id: targetId, allow, deny }),
  });
}

export async function deleteChannelOverride(serverId: string, channelId: string, targetType: string, targetId: string) {
  return request(`/servers/${serverId}/channels/${channelId}/overrides`, {
    method: 'DELETE',
    body: JSON.stringify({ target_type: targetType, target_id: targetId }),
  });
}

export async function syncCategoryPermissions(serverId: string, categoryId: string, sourceChannelId: string) {
  return request(`/servers/${serverId}/categories/${categoryId}/sync_permissions`, {
    method: 'POST',
    body: JSON.stringify({ channel_id: sourceChannelId }),
  });
}
