import { Socket, Channel } from 'phoenix';
import { clearSession } from './store';

let socket: Socket | null = null;
const channels = new Map<string, Channel>();
let authFailures = 0;

// Track last known channel_seq per topic for reconnect replay
const lastSeqs = new Map<string, number>();

// Store onMessage handlers for reconnect re-subscribe
const messageHandlers = new Map<string, (event: string, payload: any) => void>();

export function connectSocket(token: string) {
  if (socket?.isConnected()) return;

  socket = new Socket('/gateway', {
    params: { token },
    reconnectAfterMs: (tries: number) => [1000, 2000, 5000, 10000][Math.min(tries - 1, 3)],
  });

  socket.onOpen(() => {
    console.log('[socket] connected');
    authFailures = 0;
    rejoinChannels();
    // Flush offline message queue on reconnect
    import('./offlineQueue').then(({ flushQueue }) => flushQueue()).catch(() => {});
  });

  socket.onError(() => {
    console.warn('[socket] error');
    authFailures++;
    if (authFailures >= 3) {
      console.warn('[socket] too many auth failures, clearing session');
      disconnectSocket();
      clearSession();
    }
  });
  socket.onClose(() => console.warn('[socket] closed'));

  socket.connect();
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  channels.clear();
  messageHandlers.clear();
  lastSeqs.clear();
}

/** Update the highest known channel_seq for a topic */
export function updateLastSeq(topic: string, seq: number) {
  const current = lastSeqs.get(topic) ?? 0;
  if (seq > current) lastSeqs.set(topic, seq);
}

/** Get the last known seq for a topic */
export function getLastSeq(topic: string): number {
  return lastSeqs.get(topic) ?? 0;
}

export function joinChannel(
  topic: string,
  onMessage: (event: string, payload: any) => void,
): Channel {
  if (!socket) throw new Error('Socket not connected');

  const existing = channels.get(topic);
  if (existing) return existing;

  // Store handler for reconnect
  messageHandlers.set(topic, onMessage);

  return doJoin(topic, onMessage);
}

function doJoin(topic: string, onMessage: (event: string, payload: any) => void): Channel {
  if (!socket) throw new Error('Socket not connected');

  // Pass last_seq for event replay on (re)join
  const seq = lastSeqs.get(topic) ?? 0;
  const channel = socket.channel(topic, seq > 0 ? { last_seq: seq } : {});

  channel.onMessage = (event: string, payload: Record<string, unknown>) => {
    if (event && !event.startsWith('phx_')) {
      onMessage(event, payload);
    }
    return payload;
  };

  channel.join()
    .receive('ok', (resp: any) => {
      console.log(`Joined ${topic}`);
      // Process replay events from server
      if (resp?.replay && Array.isArray(resp.replay)) {
        for (const evt of resp.replay) {
          onMessage(evt.event_type, evt.payload);
          if (typeof evt.channel_seq === 'number') {
            updateLastSeq(topic, evt.channel_seq);
          }
        }
      }
    })
    .receive('error', (resp: Record<string, unknown>) => console.error(`Failed to join ${topic}:`, resp));

  channels.set(topic, channel);
  return channel;
}

/** Re-join all tracked channels after socket reconnect */
function rejoinChannels() {
  for (const [topic, handler] of messageHandlers) {
    const existing = channels.get(topic);
    if (existing) {
      // Channel will rejoin automatically via Phoenix JS, but we need to update params
      // Remove and re-create with current last_seq
      try { existing.leave(); } catch { /* ignore */ }
      channels.delete(topic);
    }
    doJoin(topic, handler);
  }
}

export function leaveChannel(topic: string) {
  const channel = channels.get(topic);
  if (channel) {
    channel.leave();
    channels.delete(topic);
  }
  messageHandlers.delete(topic);
}

export function pushChannel(topic: string, event: string, payload: Record<string, unknown>) {
  const channel = channels.get(topic);
  if (channel) channel.push(event, payload);
}

/** Get the raw Phoenix Socket instance (for voice engine) */
export function getSocket(): Socket | null {
  return socket;
}
