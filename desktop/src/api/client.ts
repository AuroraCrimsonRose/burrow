const PROD_URL = 'https://app.catxhosting.com';
const DEV_URL = 'http://localhost:4000';

const BASE_URL = import.meta.env.DEV ? DEV_URL : PROD_URL;

export { BASE_URL };

function getToken(): string | null {
  return localStorage.getItem('burrow_token');
}

export function setToken(token: string) {
  localStorage.setItem('burrow_token', token);
}

export function clearToken() {
  localStorage.removeItem('burrow_token');
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ---- Auth ----
export const getProfile = () => request<Record<string, unknown>>('/api/auth/profile');
export const updateProfile = (data: Record<string, unknown>) =>
  request<Record<string, unknown>>('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ---- Servers ----
export const getServers = () => request<unknown[]>('/api/servers');
export const getServer = (id: string) =>
  request<Record<string, unknown>>(`/api/servers/${encodeURIComponent(id)}`);

// ---- Channels ----
export const getChannelMessages = (channelId: string, before?: string) => {
  const q = before ? `?before=${encodeURIComponent(before)}` : '';
  return request<unknown[]>(`/api/channels/${encodeURIComponent(channelId)}/messages${q}`);
};
export const sendChannelMessage = (channelId: string, content: string) =>
  request<Record<string, unknown>>(`/api/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

// ---- DMs ----
export const getDMConversations = () => request<unknown[]>('/api/dm/conversations');
export const getDMMessages = (recipientId: string, before?: string) => {
  const q = before ? `?before=${encodeURIComponent(before)}` : '';
  return request<unknown[]>(`/api/dm/${encodeURIComponent(recipientId)}/messages${q}`);
};
export const sendDM = (recipientId: string, content: string) =>
  request<Record<string, unknown>>(`/api/dm/${encodeURIComponent(recipientId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

// ---- Friends ----
export const getFriends = () => request<unknown[]>('/api/friends');
export const sendFriendRequest = (username: string) =>
  request<Record<string, unknown>>('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });

// ---- Users ----
export const getUserProfile = (userId: string) =>
  request<Record<string, unknown>>(`/api/users/${encodeURIComponent(userId)}/profile`);
