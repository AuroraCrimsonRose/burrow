export {};

declare global {
  interface Window {
    electronAPI: {
      send: (channel: string, data?: unknown) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      showNotification: (title: string, body: string) => void;
      getVersion: () => Promise<string>;
    };
  }
}
