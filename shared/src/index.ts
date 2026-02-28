// Burrow shared types and utilities
// Add shared interfaces, constants, and helpers here.

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: "online" | "idle" | "dnd" | "offline";
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  serverId: string;
}

export interface Server {
  id: string;
  name: string;
  iconUrl?: string;
  ownerId: string;
  channels: Channel[];
}

export const API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.burrow.app"
    : "http://localhost:4000";

export const WS_URL =
  process.env.NODE_ENV === "production"
    ? "wss://api.burrow.app/socket"
    : "ws://localhost:4000/socket";
