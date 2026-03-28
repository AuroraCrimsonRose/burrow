/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Offline message queue — queues failed sends and flushes on reconnect.
 */
import * as api from './api';

interface QueuedMessage {
  serverId: string;
  channelId: string;
  content: string;
  tempId: string;
  replyTo?: string;
  attachments?: { key: string; filename: string; content_type: string; size: number }[];
}

const queue: QueuedMessage[] = [];
let onResolve: ((tempId: string, real: any) => void) | null = null;
let onReject: ((tempId: string) => void) | null = null;

export function setQueueCallbacks(
  resolve: (tempId: string, real: any) => void,
  reject: (tempId: string) => void,
) {
  onResolve = resolve;
  onReject = reject;
}

export function enqueue(msg: QueuedMessage) {
  queue.push(msg);
}

export function getQueueLength(): number {
  return queue.length;
}

export async function flushQueue() {
  while (queue.length > 0) {
    const msg = queue[0];
    try {
      const res = await api.sendMessage(msg.serverId, msg.channelId, msg.content, msg.replyTo, msg.attachments);
      queue.shift();
      onResolve?.(msg.tempId, res.message || res);
    } catch {
      // If still failing, stop flushing — will retry on next reconnect
      onReject?.(msg.tempId);
      break;
    }
  }
}
