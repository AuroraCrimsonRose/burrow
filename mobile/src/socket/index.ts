/**
 * Phoenix WebSocket connection for real-time features.
 * Mirrors web socket.ts — handles presence, channel events, event replay.
 */
import { Socket, Channel } from 'phoenix';
import { BASE_URL } from '../api/client';
import { getToken, clearAll } from '../auth/store';

// Convert HTTP URL to WS URL
function wsUrl(): string {
  const base = BASE_URL.replace(/^http/, 'ws');
  return `${base}/gateway/websocket`;
}

type MessageHandler = (event: string, payload: any) => void;

let socket: Socket | null = null;
const channels = new Map<string, Channel>();
const messageHandlers = new Map<string, MessageHandler>();
const lastSeqs = new Map<string, number>();
let errorCount = 0;

export function updateLastSeq(topic: string, seq: number) {
  const cur = lastSeqs.get(topic) ?? 0;
  if (seq > cur) lastSeqs.set(topic, seq);
}

export function getLastSeq(topic: string): number {
  return lastSeqs.get(topic) ?? 0;
}

function rejoinChannels() {
  const entries = Array.from(messageHandlers.entries());
  for (const [topic] of entries) {
    const old = channels.get(topic);
    if (old) {
      old.leave();
      channels.delete(topic);
    }
  }
  for (const [topic, handler] of entries) {
    joinChannel(topic, handler);
  }
}

export async function connectSocket(): Promise<Socket> {
  if (socket) return socket;

  const token = await getToken();
  if (!token) throw new Error('No session token');

  const s = new Socket(wsUrl(), {
    params: { token },
    reconnectAfterMs: (tries: number) =>
      [1000, 2000, 5000, 10000][Math.min(tries - 1, 3)],
  });

  s.onOpen(() => {
    errorCount = 0;
    rejoinChannels();
    flushOfflineQueue();
  });

  s.onError(() => {
    errorCount++;
    if (errorCount >= 3) {
      disconnectSocket();
      clearAll();
    }
  });

  s.connect();
  socket = s;
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  channels.clear();
  messageHandlers.clear();
}

export function joinChannel(topic: string, onMessage: MessageHandler): Channel {
  if (channels.has(topic)) return channels.get(topic)!;
  if (!socket) throw new Error('Socket not connected');

  const seq = lastSeqs.get(topic) ?? 0;
  const params = seq > 0 ? { last_seq: seq } : {};
  const channel = socket.channel(topic, params);

  channel.onMessage = (event: string, payload: any) => {
    if (event === 'phx_reply' || event === 'phx_error' || event === 'phx_close') {
      return payload;
    }
    if (typeof payload?.channel_seq === 'number') {
      updateLastSeq(topic, payload.channel_seq);
    }
    onMessage(event, payload);
    return payload;
  };

  channel
    .join()
    .receive('ok', (resp: any) => {
      if (resp?.replay && Array.isArray(resp.replay)) {
        for (const evt of resp.replay) {
          onMessage(evt.event_type, evt.payload);
          if (typeof evt.channel_seq === 'number') {
            updateLastSeq(topic, evt.channel_seq);
          }
        }
      }
    })
    .receive('error', (_resp: any) => {
      channels.delete(topic);
      messageHandlers.delete(topic);
    });

  channels.set(topic, channel);
  messageHandlers.set(topic, onMessage);
  return channel;
}

export function leaveChannel(topic: string) {
  const ch = channels.get(topic);
  if (ch) ch.leave();
  channels.delete(topic);
  messageHandlers.delete(topic);
}

export function pushChannel(topic: string, event: string, payload: any): Promise<any> {
  const ch = channels.get(topic);
  if (!ch) return Promise.reject(new Error(`No channel: ${topic}`));
  return new Promise((resolve, reject) => {
    ch.push(event, payload)
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('Push timeout')));
  });
}

export function getSocket(): Socket | null {
  return socket;
}

// ---------- Offline queue ----------

export interface QueuedMessage {
  serverId: string;
  channelId: string;
  content: string;
  tempId: string;
  replyTo?: string;
}

const offlineQueue: QueuedMessage[] = [];
let onResolve: ((tempId: string, realMsg: any) => void) | null = null;
let onReject: ((tempId: string) => void) | null = null;

export function setQueueCallbacks(
  resolve: (tempId: string, msg: any) => void,
  reject: (tempId: string) => void,
) {
  onResolve = resolve;
  onReject = reject;
}

export function enqueueMessage(msg: QueuedMessage) {
  offlineQueue.push(msg);
}

async function flushOfflineQueue() {
  // Dynamic import to avoid circular dependency
  const { sendMessage } = await import('../api/client');
  while (offlineQueue.length > 0) {
    const msg = offlineQueue[0];
    try {
      const real = await sendMessage(msg.serverId, msg.channelId, { content: msg.content, reply_to_id: msg.replyTo });
      offlineQueue.shift();
      onResolve?.(msg.tempId, real);
    } catch {
      onReject?.(msg.tempId);
      break; // retry on next reconnect
    }
  }
}

export function getQueueLength(): number {
  return offlineQueue.length;
}
