declare module 'phoenix' {
  export class Socket {
    constructor(endPoint: string, opts?: Record<string, unknown>);
    connect(): void;
    disconnect(): void;
    isConnected(): boolean;
    channel(topic: string, params?: Record<string, unknown>): Channel;
  }

  export class Channel {
    join(): Push;
    leave(): Push;
    push(event: string, payload: Record<string, unknown>): Push;
    on(event: string, callback: (payload: Record<string, unknown>) => void): void;
    onMessage: (event: string, payload: Record<string, unknown>) => Record<string, unknown>;
  }

  export class Push {
    receive(status: string, callback: (response: Record<string, unknown>) => void): Push;
  }
}
