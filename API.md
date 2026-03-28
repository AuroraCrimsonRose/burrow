# Burrow — API Reference

_Device-bound identity, servers, channels, and invites_

---

## Base URL

```
http://localhost:4000/api/v1
```

All endpoints accept and return JSON. IDs are string-encoded 64-bit snowflakes. Binary fields (keys, signatures) are hex-encoded.

---

## Authentication

Authenticated endpoints require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <session_token>
```

Session tokens are returned by `/auth/register` and `/auth/verify`. They are 32-byte random values, hex-encoded (64 characters).

---

## Endpoints

### POST `/auth/register`

Create a new account with a device-bound Ed25519 key pair.

**Request Body:**

| Field                    | Type   | Required | Description |
|--------------------------|--------|----------|-------------|
| `public_key`             | string | ✓        | Ed25519 public key (32 bytes, hex-encoded, 64 chars) |
| `nonce`                  | string | ✓        | PoW nonce — `SHA-256(public_key_bytes + nonce)` must start with the server's difficulty prefix |
| `username`               | string | ✓        | Unique username (2–32 chars, `[a-zA-Z0-9_]`) |
| `device_fingerprint_hash`| string | ✓        | SHA-256 hash of device fingerprint components (hex-encoded) |
| `device_label`           | string |          | Human-readable device name (e.g. "MacBook Pro") |

**Response `201 Created`:**

```json
{
  "user": {
    "id": "157322993321070592",
    "username": "tunnelcat",
    "trust_tier": 0
  },
  "device_key_id": "157322993325264896",
  "session_token": "69b16172bc492ad8cfaf551bf8df181a02f32e94f7224a3e490d84df0fc329c1"
}
```

**Errors:**

| Status | Error Code              | Meaning |
|--------|-------------------------|---------|
| 400    | `bad_request`           | Missing or malformed required fields |
| 422    | `invalid_pow`           | PoW hash doesn't start with required difficulty prefix |
| 409    | `key_already_registered`| This Ed25519 public key is already registered |
| 422    | `validation_error`      | Username taken, too short/long, or invalid characters |

**Notes:**
- The client must complete Proof-of-Work before calling this endpoint
- PoW difficulty is `0000` in development, `000000` in production
- The session token returned is immediately usable for authenticated endpoints
- Recovery key generation should happen client-side immediately after registration

---

### POST `/auth/challenge`

Request an authentication challenge (nonce) for signing.

**Request Body:**

| Field      | Type   | Required | Description |
|------------|--------|----------|-------------|
| `username` | string | ✓        | Account username |

**Response `200 OK`:**

```json
{
  "challenge_id": "157322842347098112",
  "nonce": "77848751c4a67a3bb606eb76344f0c21398d99945867aaf437eff39e41dc2501",
  "expires_at": "2026-03-11T03:05:51.398544Z"
}
```

**Notes:**
- Nonce is 32 bytes, hex-encoded (64 characters)
- Challenge expires in 60 seconds
- Challenges are single-use — once verified, they cannot be reused
- **Username enumeration protection:** If the username doesn't exist, the server returns a fake challenge (same shape, same timing) to prevent probing. The client will simply fail at the verify step.

---

### POST `/auth/verify`

Verify a signed challenge and create a session.

**Request Body:**

| Field          | Type   | Required | Description |
|----------------|--------|----------|-------------|
| `challenge_id` | string | ✓        | Challenge ID from `/auth/challenge` |
| `signature`    | string | ✓        | Ed25519 signature of the nonce bytes (64 bytes, hex-encoded, 128 chars) |
| `public_key`   | string | ✓        | Device's Ed25519 public key (32 bytes, hex-encoded) |
| `device_type`  | string |          | `"desktop"`, `"mobile"`, or `"web"` |
| `os`           | string |          | Operating system name |
| `browser`      | string |          | Browser or client app name |

**Response `200 OK`:**

```json
{
  "session_token": "45cf4d0d32af994c2408718a39ad4543338e34216570d5f80876d223ae363d88",
  "user": {
    "id": "157322993321070592",
    "username": "tunnelcat",
    "trust_tier": 0
  }
}
```

**Errors:**

| Status | Error Code    | Meaning |
|--------|---------------|---------|
| 400    | `bad_request` | Missing or malformed required fields |
| 401    | `auth_failed` | Challenge not found, expired, already used, signature invalid, or device key not registered/revoked |

**Notes:**
- The client signs the **raw nonce bytes** (decoded from hex), not the hex string
- The signature is verified against the stored public key for the user
- A deliberately generic `auth_failed` error is returned for all failure cases to prevent information leakage
- The client IP is captured from the connection for session metadata

---

### GET `/auth/sessions` 🔒

List all active sessions for the authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response `200 OK`:**

```json
{
  "sessions": [
    {
      "id": "157323183625031680",
      "device_type": "desktop",
      "os": "macOS",
      "browser": "Firefox",
      "ip": "192.168.1.100",
      "city": null,
      "country": null,
      "first_active": "2026-03-11T03:06:12.617743Z",
      "last_active": "2026-03-11T03:06:30.921066Z",
      "current": false
    }
  ]
}
```

**Notes:**
- Only non-revoked sessions are returned
- Sorted by `last_active` descending (most recent first)
- `current` is currently always `false` — will be updated to flag the requesting session

---

### DELETE `/auth/sessions/:id` 🔒

Revoke a specific session.

**Headers:** `Authorization: Bearer <token>`

**URL Params:** `id` — Session ID (snowflake string)

**Response `200 OK`:**

```json
{
  "status": "revoked"
}
```

**Errors:**

| Status | Error Code          | Meaning |
|--------|---------------------|---------|
| 404    | `not_found`         | Session doesn't exist or doesn't belong to this user |

---

### DELETE `/auth/sessions` 🔒

Revoke all sessions except the current one.

**Headers:** `Authorization: Bearer <token>`

**Response `200 OK`:**

```json
{
  "revoked_count": 3
}
```

---

## Authentication Flow

### Registration (New Account)

```
Client                                     Server
  │                                          │
  │  1. Generate Ed25519 keypair             │
  │  2. Compute PoW: find nonce where        │
  │     SHA-256(public_key + nonce)           │
  │     starts with difficulty prefix         │
  │                                          │
  ├── POST /auth/register ──────────────────>│
  │   { public_key, nonce, username,         │
  │     device_fingerprint_hash }            │
  │                                          │  Verify PoW, create user,
  │                                          │  store device key, create session
  │<──────────── 201 Created ────────────────┤
  │   { user, device_key_id, session_token } │
  │                                          │
  │  3. Store private key in secure storage  │
  │  4. Generate recovery key (client-side)  │
  │  5. Use session_token for all requests   │
```

### Login (Existing Account)

```
Client                                     Server
  │                                          │
  ├── POST /auth/challenge ─────────────────>│
  │   { username }                           │
  │                                          │  Generate 32-byte random nonce
  │<──────────── 200 OK ─────────────────────┤  Store with 60s expiry
  │   { challenge_id, nonce, expires_at }    │
  │                                          │
  │  1. Decode nonce from hex to bytes       │
  │  2. Sign nonce bytes with private key    │
  │                                          │
  ├── POST /auth/verify ────────────────────>│
  │   { challenge_id, signature,             │
  │     public_key, device_type, os }        │
  │                                          │  Verify signature against
  │                                          │  stored public key
  │<──────────── 200 OK ─────────────────────┤
  │   { session_token, user }                │  Create new session
  │                                          │
  │  3. Use session_token for all requests   │
```

---

## Data Types

| Type       | Format | Example |
|------------|--------|---------|
| ID         | String (snowflake, 64-bit) | `"157322993321070592"` |
| Hex binary | String (lowercase hex) | `"c7b39a978b059b33..."` |
| Timestamp  | ISO 8601 UTC | `"2026-03-11T03:05:51.398544Z"` |

---

## Error Format

All errors follow this shape:

```json
{
  "error": "error_code",
  "detail": "Human-readable explanation"
}
```

Validation errors include field-level details:

```json
{
  "error": "validation_error",
  "detail": "One or more fields are invalid",
  "fields": {
    "username": ["has already been taken"]
  }
}
```

All authenticated endpoints return `401 unauthorized` if the token is missing or invalid.

---

## Servers

### POST `/servers` 🔒

Create a new server. The authenticated user becomes the owner.

**Request Body:**

| Field         | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `name`        | string | ✓        | Server name (1–100 chars) |
| `description` | string |          | Server description (max 1024 chars) |
| `icon_url`    | string |          | URL to server icon |

**Response `201 Created`:**

```json
{
  "id": "157335594167914496",
  "name": "My Burrow",
  "description": null,
  "icon_url": null,
  "banner_url": null,
  "owner_id": "157335589881335808"
}
```

**Notes:**
- Automatically creates an `@everyone` role with default permissions
- Automatically creates a `#general` text channel
- The owner is added as the first member

---

### GET `/servers` 🔒

List all servers the authenticated user is a member of.

**Response `200 OK`:**

```json
{
  "servers": [
    {
      "id": "157335594167914496",
      "name": "My Burrow",
      "description": "A cozy place",
      "icon_url": null,
      "banner_url": null,
      "owner_id": "157335589881335808"
    }
  ]
}
```

---

### GET `/servers/:id` 🔒

Get a server's details. Requires membership.

**Errors:**

| Status | Error Code  | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Not a member of this server |
| 404    | `not_found` | Server does not exist |

---

### PATCH `/servers/:id` 🔒

Update server settings. Requires `manage_server` permission.

**Request Body:**

| Field         | Type   | Description |
|---------------|--------|-------------|
| `name`        | string | Server name |
| `description` | string | Server description |
| `icon_url`    | string | Server icon URL |
| `banner_url`  | string | Server banner URL |

**Errors:**

| Status | Error Code  | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Missing `manage_server` permission |

---

### DELETE `/servers/:id` 🔒

Permanently delete a server. Requires ownership.

**Response `200 OK`:**

```json
{ "status": "deleted" }
```

**Errors:**

| Status | Error Code  | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Not the server owner |

---

## Channels

### GET `/servers/:server_id/channels` 🔒

List all channels in a server. Requires membership.

**Response `200 OK`:**

```json
{
  "channels": [
    {
      "id": "157335594172108800",
      "server_id": "157335594167914496",
      "category_id": null,
      "name": "general",
      "type": "text",
      "topic": null,
      "position": 0,
      "nsfw": false,
      "slow_mode_interval": 0
    }
  ]
}
```

---

### POST `/servers/:server_id/channels` 🔒

Create a channel. Requires `manage_channels` permission.

**Request Body:**

| Field               | Type    | Required | Description |
|---------------------|---------|----------|-------------|
| `name`              | string  | ✓        | Channel name (1–100 chars) |
| `type`              | string  |          | `text`, `voice`, `announcement`, `stage`, `forum`, `media` (default: `text`) |
| `topic`             | string  |          | Channel topic |
| `nsfw`              | boolean |          | Whether the channel is age-gated |
| `slow_mode_interval`| integer |          | Seconds between messages per user (0 = off) |
| `category_id`       | string  |          | Category to place the channel in |

**Response `201 Created`:** Channel object (same shape as in list response)

---

### PATCH `/servers/:server_id/channels/:id` 🔒

Update a channel. Requires `manage_channels` permission.

---

### DELETE `/servers/:server_id/channels/:id` 🔒

Delete a channel. Requires `manage_channels` permission.

**Response `200 OK`:**

```json
{ "status": "deleted" }
```

---

## Members

### GET `/servers/:server_id/members` 🔒

List all members of a server. Requires membership.

**Response `200 OK`:**

```json
{
  "members": [
    {
      "id": "157335594176303104",
      "user_id": "157335589881335808",
      "username": "tunnelcat",
      "nickname": null,
      "server_avatar_url": null,
      "joined_at": "2026-03-11T03:30:00.000000Z"
    }
  ]
}
```

---

### DELETE `/servers/:server_id/members/:user_id` 🔒

Remove a member from a server.

- If `:user_id` is the authenticated user → **leave** the server
- If the authenticated user has `kick_members` permission and outranks the target → **kick** the target user

**Response `200 OK`:**

```json
{ "status": "left" }
```
or
```json
{ "status": "kicked" }
```

**Errors:**

| Status | Error Code  | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Missing `kick_members` permission, or target outranks you |
| 404    | `not_found` | Target user is not a member |

---

## Invites

### POST `/servers/:server_id/invites` 🔒

Create an invite link. Requires `create_invite` permission.

**Request Body:**

| Field       | Type    | Required | Description |
|-------------|---------|----------|-------------|
| `max_uses`  | integer |          | Maximum uses (null = unlimited) |
| `expires_at`| string  |          | ISO 8601 expiration timestamp |

**Response `201 Created`:**

```json
{
  "code": "1mSdzVU7",
  "server_id": "157335594167914496",
  "inviter_id": "157335589881335808",
  "max_uses": 5,
  "uses_count": 0,
  "expires_at": null
}
```

---

### GET `/servers/:server_id/invites` 🔒

List active invites. Requires `manage_server` permission.

---

### POST `/invites/:code/accept` 🔒

Join a server via invite code.

**Response `200 OK`:**

```json
{
  "status": "joined",
  "server": {
    "id": "157335594167914496",
    "name": "My Burrow"
  }
}
```

**Errors:**

| Status | Error Code        | Meaning |
|--------|-------------------|---------|
| 409    | `already_member`  | Already a member of this server |
| 410    | `invite_revoked`  | Invite has been revoked |
| 410    | `invite_expired`  | Invite has expired |
| 410    | `invite_exhausted`| Invite has reached its max uses |
| 404    | `not_found`       | Invite code does not exist |

---

### DELETE `/servers/:server_id/invites/:code` 🔒

Revoke an invite. Requires `manage_server` permission.

**Response `200 OK`:**

```json
{ "status": "revoked" }
```

---

## Messages

All message endpoints are scoped under `/servers/:server_id/channels/:channel_id/messages` and require authentication + server membership. Channel-level permissions are enforced.

### GET `/servers/:server_id/channels/:channel_id/messages` 🔒

List messages in a channel with cursor-based pagination. Requires `read_message_history` channel permission.

**Query Parameters:**

| Param    | Type   | Required | Description |
|----------|--------|----------|-------------|
| `before` | string |          | Return messages with ID less than this snowflake (newer-first) |
| `after`  | string |          | Return messages with ID greater than this snowflake |
| `limit`  | int    |          | Max messages to return (1–100, default 50) |

**Response `200 OK`:**

```json
{
  "messages": [
    {
      "id": "157353000000000000",
      "channel_id": "157335594172108800",
      "author": {
        "id": "157322993321070592",
        "username": "alice"
      },
      "content": "Hello world!",
      "type": "normal",
      "reply_to_id": null,
      "edited_at": null,
      "channel_seq": 1,
      "timestamp": "2026-03-11T05:00:00.000000Z"
    }
  ]
}
```

Messages are ordered newest-first (descending `channel_seq`).

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Not a member of this server |
| 404    | `not_found` | Channel does not exist or doesn't belong to this server |

---

### POST `/servers/:server_id/channels/:channel_id/messages` 🔒

Send a message to a channel. Requires `send_messages` channel permission.

**Request Body:**

| Field        | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `content`    | string | ✓        | Message text (1–4000 characters) |
| `reply_to_id`| string |          | Snowflake ID of the message being replied to |

**Response `201 Created`:**

```json
{
  "id": "157353000000000000",
  "channel_id": "157335594172108800",
  "author": {
    "id": "157322993321070592",
    "username": "alice"
  },
  "content": "Hello world!",
  "type": "normal",
  "reply_to_id": null,
  "edited_at": null,
  "channel_seq": 42,
  "timestamp": "2026-03-11T05:00:00.000000Z"
}
```

The `channel_seq` is a server-assigned, gapless, monotonically increasing sequence number per channel. Clients use this for ordering and reconnect reconciliation.

**Errors:**

| Status | Error Code    | Meaning |
|--------|--------------|---------|
| 400    | `bad_request`| Missing or invalid `content` |
| 403    | `forbidden`  | Not a member of this server |
| 404    | `not_found`  | Channel does not exist or doesn't belong to this server |

---

### PATCH `/servers/:server_id/channels/:channel_id/messages/:id` 🔒

Edit a message. Only the original author can edit.

**Request Body:**

| Field    | Type   | Required | Description |
|---------|--------|----------|-------------|
| `content`| string | ✓        | New message text (1–4000 characters) |

**Response `200 OK`:**

Returns the updated message object (same shape as POST response). `edited_at` will be set.

**Errors:**

| Status | Error Code    | Meaning |
|--------|--------------|---------|
| 400    | `bad_request`| Missing or invalid `content` |
| 403    | `forbidden`  | Not the message author |
| 404    | `not_found`  | Message not found or already deleted |

---

### DELETE `/servers/:server_id/channels/:channel_id/messages/:id` 🔒

Delete a message (soft-delete). Authors can delete their own messages. Users with `manage_messages` channel permission can delete anyone's messages.

**Response `200 OK`:**

```json
{ "status": "deleted" }
```

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Not the message author |
| 404    | `not_found` | Message not found or already deleted |

---

## WebSocket Gateway

Real-time events are delivered via Phoenix Channels over WebSocket.

### Connection

```
ws://localhost:4000/gateway/websocket?token=<session_token>&vsn=2.0.0
```

The `token` parameter is the same hex-encoded session token used for REST authentication. Invalid or expired tokens will be rejected at connection time.

### Topics

Clients join topics to subscribe to events for specific channels:

```
channel:{channel_id}
```

The server verifies membership on join — clients can only join channels in servers they belong to.

### Join Payload

Clients can (optionally) include `last_seq` in the join payload to replay missed events since they were last connected:

```json
{ "last_seq": 41 }
```

**Join Response:**

```json
{
  "channel_id": "157335594172108800",
  "replay": [
    {
      "event_type": "message_create",
      "channel_seq": 42,
      "payload": { ... },
      "timestamp": "2026-03-11T05:00:00.000000Z"
    }
  ]
}
```

The `replay` array contains all events with `channel_seq > last_seq` (up to 500), allowing clients to fill gaps from a disconnection without re-fetching via REST.

### Client → Server Events

#### `new_message`

Send a message through the WebSocket instead of REST.

```json
{
  "event": "new_message",
  "payload": {
    "content": "Hello from WebSocket!",
    "reply_to_id": null
  }
}
```

Reply: `"ok"` on success, `{"error": {"reason": "..."}}` on failure.

#### `typing`

Broadcast a typing indicator to other channel members.

```json
{
  "event": "typing",
  "payload": {}
}
```

No reply. Other clients in the channel receive:

```json
{
  "event": "typing",
  "payload": { "user_id": "157322993321070592" }
}
```

### Server → Client Events

All events are pushed to clients subscribed to the relevant channel topic.

#### `message_create`

```json
{
  "event": "message_create",
  "payload": {
    "id": "157353000000000000",
    "channel_id": "157335594172108800",
    "author": { "id": "157322993321070592", "username": "alice" },
    "content": "Hello world!",
    "type": "normal",
    "reply_to_id": null,
    "edited_at": null,
    "channel_seq": 42,
    "timestamp": "2026-03-11T05:00:00.000000Z"
  }
}
```

#### `message_edit`

Same payload shape as `message_create`, with `edited_at` set and updated `content`.

#### `message_delete`

```json
{
  "event": "message_delete",
  "payload": {
    "id": "157353000000000000",
    "channel_id": "157335594172108800",
    "channel_seq": 43
  }
}
```

---

## Progressive Trust System

All authenticated users have a trust score (0–100) and trust tier (0–4). Trust tiers gate what actions a user can perform across the platform. The system prevents spam, abuse, and bot farming by requiring sustained positive engagement before unlocking capabilities.

### Trust Tiers

| Tier | Name        | Score  | Key Unlocks |
|------|-------------|--------|-------------|
| 0    | New         | 0–15   | Read + send (5/min), react, join ≤3 servers |
| 1    | Verified    | 16–40  | DMs (text, 10/hr), join ≤10 servers |
| 2    | Trusted     | 41–70  | Unrestricted DMs, files (10MB), create invites |
| 3    | Established | 71–90  | Create servers, discovery, files (25MB) |
| 4    | Veteran     | 91–100 | Max rate limits, vouching, files (100MB) |

### Trust-Gated Actions

| Action | Required Tier | Error if blocked |
|--------|---------------|------------------|
| Send DMs | 1+ | `403 insufficient_trust` |
| Upload files | 2+ | `403 insufficient_trust` |
| Create invite links | 2+ | `403 insufficient_trust` |
| Create servers | 3+ | `403 insufficient_trust` |
| Use server discovery | 3+ | `403 insufficient_trust` |
| Join servers (over tier limit) | — | `403 server_limit_reached` |

### New Account Cooldowns

| Action | Cooldown | Error |
|--------|----------|-------|
| First message | 5 minutes after account creation | `429 cooldown_active` |
| Join additional servers (Tier 0) | 10 minutes between joins | `429 cooldown_active` |

---

### GET `/trust` 🔒

Get your current trust score, tier, and tier-specific limits.

**Response `200 OK`:**

```json
{
  "trust_score": 75,
  "trust_tier": 3,
  "tier_name": "Established",
  "limits": {
    "max_servers": 100,
    "max_upload_bytes": 26214400,
    "msg_per_minute": 60,
    "can_send_dm": true,
    "can_upload_files": true,
    "can_create_invites": true,
    "can_create_servers": true,
    "can_use_discovery": true
  }
}
```

---

### POST `/trust/recalculate` 🔒

Trigger a recalculation of your trust score from all factors (account age, message activity, reactions received, moderation penalties).

**Response `200 OK`:**

```json
{
  "trust_score": 42,
  "trust_tier": 2,
  "tier_name": "Trusted"
}
```

### Trust Score Factors

| Factor | Weight | Direction |
|--------|--------|-----------|
| Account age | High | Logarithmic increase |
| Messages sent | Medium | Diminishing returns |
| Reactions received | Medium | Positive |
| Reply patterns | High | Positive |
| Moderation actions (bans/kicks/timeouts) | High | Negative |
| Confirmed reports | High | Negative |

---

## Direct Messages

DMs are 1-on-1 private conversations that reuse the shared messages table. Trust Tier 1+ is required to send DMs. DM channels are automatically created or reused when opening a conversation with another user.

### Create / Open DM

`POST /api/v1/dms` 🔒

Opens a DM channel with another user. If a DM already exists between the two users, the existing channel is returned.

**Request Body:**
```json
{
  "user_id": "123456789"
}
```

**Response (200):**
```json
{
  "id": "987654321",
  "type": "dm",
  "recipients": [
    {
      "id": "123456789",
      "username": "alice"
    }
  ],
  "last_seq": 0
}
```

**Errors:**
- `403 insufficient_trust` — User is below Tier 1
- `400 bad_request` — Missing or invalid `user_id`, or trying to DM yourself

### List DM Channels

`GET /api/v1/dms` 🔒

Returns all DM channels the authenticated user is part of, ordered by most recent activity.

**Response (200):**
```json
{
  "dm_channels": [
    {
      "id": "987654321",
      "type": "dm",
      "recipients": [
        {
          "id": "123456789",
          "username": "alice"
        }
      ],
      "last_seq": 42
    }
  ]
}
```

### List DM Messages

`GET /api/v1/dms/:id/messages` 🔒

Retrieves messages from a DM channel. Supports cursor-based pagination.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `before` | snowflake | Get messages before this ID |
| `after` | snowflake | Get messages after this ID |
| `limit` | integer | Max messages to return (default 50, max 100) |

**Response (200):**
```json
{
  "messages": [
    {
      "id": "111222333",
      "channel_id": "987654321",
      "author": {
        "id": "123456789",
        "username": "alice"
      },
      "content": "Hello!",
      "type": "normal",
      "reply_to_id": null,
      "edited_at": null,
      "channel_seq": 1,
      "timestamp": "2026-03-12T08:00:00Z"
    }
  ]
}
```

**Errors:**
- `403 forbidden` — Not a participant in this DM

### Send DM Message

`POST /api/v1/dms/:id/messages` 🔒

Send a message in a DM channel. Requires Trust Tier 1+.

**Request Body:**
```json
{
  "content": "Hello!"
}
```

**Response (201):**
```json
{
  "id": "111222333",
  "channel_id": "987654321",
  "author": {
    "id": "456789012",
    "username": "bob"
  },
  "content": "Hello!",
  "type": "normal",
  "reply_to_id": null,
  "edited_at": null,
  "channel_seq": 1,
  "timestamp": "2026-03-12T08:00:00Z"
}
```

**Errors:**
- `403 insufficient_trust` — User is below Tier 1
- `403 forbidden` — Not a participant in this DM
- `429 rate_limited` — Message rate limit exceeded

### Edit DM Message

`PATCH /api/v1/dms/:id/messages/:message_id` 🔒

Edit a message you sent in a DM channel.

**Request Body:**
```json
{
  "content": "Updated message"
}
```

**Response (200):** Updated message object (same shape as send).

**Errors:**
- `403 forbidden` — Not a participant or not the message author
- `404 not_found` — Message not found or deleted

### Delete DM Message

`DELETE /api/v1/dms/:id/messages/:message_id` 🔒

Soft-delete a message you sent in a DM channel.

**Response (200):**
```json
{
  "status": "deleted"
}
```

**Errors:**
- `403 forbidden` — Not a participant or not the message author
- `404 not_found` — Message not found or already deleted

### DM Trust Requirements

| Trust Tier | DM Capability |
|------------|---------------|
| Tier 0 (0–15) | Cannot send DMs |
| Tier 1 (16–40) | DMs allowed, rate-limited |
| Tier 2+ (41+) | Unrestricted DMs |

### WebSocket Gateway — DM Topics

Clients subscribe to `dm:{dm_channel_id}` to receive real-time DM events:

| Event | Description |
|-------|-------------|
| `message_create` | New DM message received |
| `message_edit` | DM message was edited |
| `message_delete` | DM message was deleted |
| `typing` | Other user is typing |

**Join payload includes:**
- `channel_id` — The DM channel ID
- `type` — `"dm"`
- `replay` — Missed events if `last_seq` was provided on join

---

## Friendships

Manage friend relationships including requests, blocks, and friend lists. Blocking a user also prevents DM creation and messaging.

### List Friends

```
GET /api/friends
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": [
    {
      "id": "<friendship_id>",
      "user": {
        "id": "<user_id>",
        "username": "alice"
      },
      "since": "2026-03-12T00:00:00Z"
    }
  ]
}
```

### Get Friend Requests

```
GET /api/friends/requests
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": {
    "incoming": [
      {
        "id": "<friendship_id>",
        "user_id": "<sender_id>",
        "friend_id": "<your_id>",
        "status": "pending",
        "inserted_at": "2026-03-12T00:00:00Z"
      }
    ],
    "outgoing": [
      {
        "id": "<friendship_id>",
        "user_id": "<your_id>",
        "friend_id": "<target_id>",
        "status": "pending",
        "inserted_at": "2026-03-12T00:00:00Z"
      }
    ]
  }
}
```

### Send Friend Request

```
POST /api/friends/request
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "user_id": "<target_user_id>"
}
```

**Response** `201 Created`

```json
{
  "data": {
    "id": "<friendship_id>",
    "user_id": "<your_id>",
    "friend_id": "<target_id>",
    "status": "pending"
  }
}
```

If the target already has a pending request to you, both requests auto-accept and the response status will be `"accepted"`.

**Errors:**
- `400` — Cannot send request to yourself
- `409 already_pending` — A pending request already exists
- `409 already_friends` — You are already friends
- `403 blocked` — One of you has blocked the other

### Accept Friend Request

```
POST /api/friends/:user_id/accept
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": {
    "id": "<friendship_id>",
    "status": "accepted"
  }
}
```

Accepts an incoming friend request from `:user_id`.

**Errors:**
- `404` — No pending request from that user

### Decline Friend Request

```
POST /api/friends/:user_id/decline
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{ "data": { "status": "removed" } }
```

Declines and deletes an incoming friend request from `:user_id`.

### Remove Friend

```
DELETE /api/friends/:user_id
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{ "data": { "status": "removed" } }
```

Removes a friendship or cancels an outgoing pending request. Works from either side of the relationship.

### Block User

```
POST /api/friends/:user_id/block
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": {
    "id": "<friendship_id>",
    "status": "blocked"
  }
}
```

Blocks a user. If a friendship or pending request exists, it is replaced with a block. Blocking prevents:
- Sending or receiving friend requests
- Creating new DM channels
- Sending messages in existing DM channels

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 404    | `not_found` | User not found |

---

## Roles & Permissions

Burrow uses a 48-bit integer bitfield to represent permissions. Each role stores a `permissions` field, and channel overrides use `allow`/`deny` bitfield pairs.

### Permission Resolution Order

1. **Server owner** → all permissions (0xFFFFFFFFFFFF)
2. **Administrator bit set** → all permissions
3. **Base permissions** = OR-union of all role `permissions` fields (including `@everyone`)
4. **Channel overrides** applied in order:
   - `@everyone` role override: `(base & ~deny) | allow`
   - Role overrides (union): `(perms & ~deny) | allow`
   - User-specific override: `(perms & ~deny) | allow`

### Permission Bits

| Bit | Name | Description |
|-----|------|-------------|
| 0 | `view_channel` | View channel and read messages |
| 1 | `send_messages` | Send messages in text channels |
| 2 | `embed_links` | Links will auto-embed |
| 3 | `attach_files` | Upload files |
| 4 | `add_reactions` | Add reactions to messages |
| 5 | `mention_everyone` | Use @everyone and @here |
| 6 | `manage_messages` | Delete/pin others' messages |
| 7 | `read_message_history` | Read message history |
| 8 | `connect` | Connect to voice channels |
| 9 | `speak` | Speak in voice channels |
| 10 | `stream` | Screen share |
| 11 | `mute_members` | Mute members in voice |
| 12 | `deafen_members` | Deafen members in voice |
| 13 | `move_members` | Move members between voice channels |
| 14 | `use_voice_activity` | Use voice activity detection |
| 15 | `manage_channels` | Create, edit, delete channels |
| 16 | `manage_roles` | Create, edit, delete, assign roles |
| 17 | `manage_server` | Edit server settings, manage invites |
| 18 | `kick_members` | Kick members (hierarchy enforced) |
| 19 | `ban_members` | Ban members (hierarchy enforced) |
| 20 | `create_invite` | Create invite links |
| 21 | `change_nickname` | Change own nickname |
| 22 | `manage_nicknames` | Change others' nicknames |
| 23 | `manage_emoji` | Manage server emoji |
| 24 | `manage_webhooks` | Manage webhooks |
| 25 | `manage_threads` | Manage threads |
| 26 | `administrator` | All permissions, bypasses channel overrides |
| 27 | `use_soundboard` | Use soundboard |
| 28 | `use_external_emoji` | Use external emoji |
| 29 | `view_audit_log` | View audit log |
| 30 | `send_tts` | Send text-to-speech messages |
| 31 | `manage_events` | Manage server events |
| 32 | `priority_speaker` | Priority speaker in voice |
| 33 | `use_camera` | Use camera in voice |
| 34 | `create_public_threads` | Create public threads |
| 35 | `create_private_threads` | Create private threads |
| 36 | `send_in_threads` | Send messages in threads |
| 37 | `use_app_commands` | Use application commands |
| 38 | `timeout_members` | Timeout members |

### Default @everyone Permissions

`view_channel | send_messages | read_message_history | add_reactions | connect | speak | change_nickname`

### Role Hierarchy

Roles have a `position` field (higher = more authority). A user's "highest position" is the max position across all their assigned roles. Hierarchy is enforced for:
- Role assignment/unassignment: actor must outrank the target role
- Role editing/deletion: actor must outrank the target role
- Kicking members: actor must outrank the target member
- The server owner always bypasses hierarchy checks

---

### GET `/servers/:server_id/roles` 🔒

List all roles in a server. Requires server membership.

**Response `200 OK`:**

```json
{
  "roles": [
    {
      "id": "157335594172108801",
      "name": "Admin",
      "color": "#ff0000",
      "position": 2,
      "permissions": 67108864,
      "hoist": false,
      "mentionable": false,
      "server_id": "157335594167914496"
    },
    {
      "id": "157335594172108800",
      "name": "@everyone",
      "color": null,
      "position": 0,
      "permissions": 2097523,
      "hoist": false,
      "mentionable": false,
      "server_id": "157335594167914496"
    }
  ]
}
```

Roles are ordered by position descending (highest authority first).

---

### POST `/servers/:server_id/roles` 🔒

Create a new role. Requires `manage_roles` permission.

**Request Body:**

| Field         | Type    | Required | Description |
|---------------|---------|----------|-------------|
| `name`        | string  | ✓        | Role name |
| `color`       | string  |          | Hex color code |
| `permissions` | integer |          | Permission bitfield (default: 0) |
| `hoist`       | boolean |          | Show role members separately |
| `mentionable` | boolean |          | Allow @mentioning this role |

**Response `201 Created`:** Role object. Position is auto-assigned (highest + 1).

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Missing `manage_roles` permission |

---

### PATCH `/servers/:server_id/roles/:id` 🔒

Update a role. Requires `manage_roles` permission and higher role position than the target role.

**Request Body:** Same fields as create (all optional). The `@everyone` role cannot be renamed or repositioned.

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Missing permission or hierarchy violation |
| 404    | `not_found` | Role not found |

---

### DELETE `/servers/:server_id/roles/:id` 🔒

Delete a role. Requires `manage_roles` permission and higher role position. The `@everyone` role cannot be deleted.

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Missing permission, hierarchy violation, or trying to delete @everyone |
| 404    | `not_found` | Role not found |

---

### PUT `/servers/:server_id/members/:member_user_id/roles/:role_id` 🔒

Assign a role to a member. Requires `manage_roles` permission and higher role position than the target role.

**Response `200 OK`:** Role object.

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Missing permission or hierarchy violation |
| 404    | `not_found` | Role or member not found |

---

### DELETE `/servers/:server_id/members/:member_user_id/roles/:role_id` 🔒

Remove a role from a member. Requires `manage_roles` permission and higher role position than the target role.

**Response `200 OK`:**

```json
{ "status": "removed" }
```

**Errors:**

| Status | Error Code   | Meaning |
|--------|-------------|---------|
| 403    | `forbidden` | Missing permission or hierarchy violation |
| 404    | `not_found` | Role or member not found |

---

## Bans & Timeouts

Server moderation tools for banning users and applying temporary timeouts. All ban and timeout actions enforce **role hierarchy** — you cannot ban or timeout a user with a higher role position than yours, and the server owner can never be banned or timed out.

### POST `/servers/:server_id/bans` 🔒

Ban a user from the server. Removes them from membership immediately. Requires `ban_members` permission (bit 19).

```
POST /api/v1/servers/:server_id/bans
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string | Yes | Snowflake ID of the user to ban |
| `reason` | string | No | Reason for the ban |
| `expires_at` | string | No | ISO 8601 timestamp for timed bans (omit for permanent) |
| `message_purge_window` | string | No | Time window of messages to purge (e.g., `"24h"`, `"7d"`) |

**Response `201 Created`:**

```json
{
  "id": "123456789",
  "server_id": "987654321",
  "user_id": "111222333",
  "banned_by": "444555666",
  "reason": "spam",
  "expires_at": "2026-03-19T10:00:00Z",
  "created_at": "2026-03-12T10:00:00Z"
}
```

**Errors:**

| Status | Error Code | Meaning |
|--------|-----------|---------|
| 403 | `forbidden` | Missing permission or target has higher role / is owner |
| 409 | `already_banned` | User is already banned from this server |

**Notes:**
- Banning a current member removes them from the server immediately
- Banning a non-member (preemptive ban) is allowed
- Timed bans expire automatically — expired bans are cleaned up on next access check
- The banner must have a higher role position than the target (owner bypasses this)

---

### GET `/servers/:server_id/bans` 🔒

List all bans for a server. Requires `ban_members` permission.

```
GET /api/v1/servers/:server_id/bans
Authorization: Bearer <session_token>
```

**Response `200 OK`:**

```json
{
  "bans": [
    {
      "id": "123456789",
      "server_id": "987654321",
      "user_id": "111222333",
      "banned_by": "444555666",
      "reason": "spam",
      "expires_at": null,
      "created_at": "2026-03-12T10:00:00Z"
    }
  ]
}
```

---

### DELETE `/servers/:server_id/bans/:user_id` 🔒

Unban a user from the server. Requires `ban_members` permission.

```
DELETE /api/v1/servers/:server_id/bans/:user_id
Authorization: Bearer <session_token>
```

**Response `200 OK`:**

```json
{ "status": "unbanned" }
```

**Errors:**

| Status | Error Code | Meaning |
|--------|-----------|---------|
| 403 | `forbidden` | Missing `ban_members` permission |
| 404 | `not_found` | No ban found for this user |

---

### POST `/servers/:server_id/timeouts` 🔒

Timeout (mute) a server member. Timed-out members cannot send messages, add reactions, or pin messages. Requires `timeout_members` permission (bit 38).

```
POST /api/v1/servers/:server_id/timeouts
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request Body** (one of `duration` or `until` required):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string | Yes | Snowflake ID of the user to timeout |
| `duration` | integer | One of | Duration in seconds |
| `until` | string | One of | ISO 8601 timestamp for when the timeout ends |

**Response `200 OK`:**

```json
{
  "user_id": "111222333",
  "timed_out_until": "2026-03-12T10:10:00Z"
}
```

**Errors:**

| Status | Error Code | Meaning |
|--------|-----------|---------|
| 400 | `bad_request` | Missing or invalid duration/until |
| 403 | `forbidden` | Missing permission or target has higher role / is owner |
| 404 | `not_found` | User is not a member of this server |

---

### DELETE `/servers/:server_id/timeouts/:user_id` 🔒

Remove a timeout from a server member. Requires `timeout_members` permission.

```
DELETE /api/v1/servers/:server_id/timeouts/:user_id
Authorization: Bearer <session_token>
```

**Response `200 OK`:**

```json
{ "status": "timeout_removed" }
```

**Errors:**

| Status | Error Code | Meaning |
|--------|-----------|---------|
| 403 | `forbidden` | Missing `timeout_members` permission |
| 404 | `not_found` | User is not a member of this server |

---

### Timeout Restrictions

When a member is timed out, the following actions are blocked (return `403 timed_out`):

| Blocked Action | Endpoint |
|---------------|----------|
| Send messages | `POST /servers/:server_id/channels/:channel_id/messages` |
| Add reactions | `PUT /servers/:server_id/channels/:channel_id/messages/:message_id/reactions/:emoji` |
| Pin messages | `POST /servers/:server_id/channels/:channel_id/pins` |

Timeouts expire automatically — once `timed_out_until` is in the past, the member regains full privileges without any explicit action.

### Ban Enforcement

Banned users cannot join the server via invite. Attempting to use an invite while banned returns `403 banned`. Unbanning a user allows them to rejoin via a new invite.

---

## Typing Indicators

Real-time typing notifications via WebSocket. The server debounces typing events to at most **one per user per channel every 8 seconds** to reduce noise.

### Client → Server

Send a `typing` event on the channel topic while the user is typing. Recommended: send a typing heartbeat every 5 seconds while the user is actively typing.

```json
// Push to "channel:{channel_id}" or "dm:{dm_id}" topic
{
  "event": "typing",
  "payload": {}
}
```

### Server → Client

The server broadcasts `typing_start` to all other participants in the channel (the sender does not receive their own typing event).

```json
{
  "event": "typing_start",
  "payload": {
    "user_id": "123456789",
    "channel_id": "987654321",
    "timestamp": "2026-03-12T10:00:00Z"
  }
}
```

### Debounce Behavior

| Parameter | Value |
|-----------|-------|
| Server debounce window | 8 seconds per user per channel |
| Recommended client heartbeat | Every 5 seconds while typing |
| Client-side auto-expire | 10 seconds after last `typing_start` received |

- If a user sends multiple `typing` events within 8 seconds, only the first is broadcast to other clients
- Typing indicators are ephemeral — no database storage, no event log entry
- The indicator auto-expires client-side: if no new `typing_start` is received within 10 seconds, the UI should hide the "typing..." indicator

---

## Unread Tracking

Track read position per user per channel. Each user has independent read states. Unread counts are derived by comparing the user's last-read sequence number against the channel's current sequence.

### GET `/users/@me/read-states` 🔒

Get all read states for the authenticated user across all channels and DMs.

```
GET /api/v1/users/@me/read-states
Authorization: Bearer <session_token>
```

**Response `200 OK`:**

```json
{
  "read_states": [
    {
      "channel_id": "987654321",
      "last_read_message_id": "111222333",
      "last_read_seq": 42,
      "mention_count": 3
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `channel_id` | string | Snowflake ID of the channel or DM |
| `last_read_message_id` | string \| null | ID of the last message the user has read |
| `last_read_seq` | integer | Sequence number of the last read message |
| `mention_count` | integer | Number of unread mentions in this channel |

---

### POST `/servers/:server_id/channels/:channel_id/ack` 🔒

Mark a server channel as read up to a specific message. Resets mention count to 0.

```
POST /api/v1/servers/:server_id/channels/:channel_id/ack
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message_id` | string | Yes | Snowflake ID of the last read message |

**Response `200 OK`:**

```json
{
  "channel_id": "987654321",
  "last_read_message_id": "111222333",
  "last_read_seq": 42,
  "mention_count": 0
}
```

**Errors:**

| Status | Error Code | Meaning |
|--------|-----------|---------|
| 403 | `forbidden` | Not a member of this server |
| 404 | `not_found` | Message not found or not in this channel |

---

### POST `/dms/:id/ack` 🔒

Mark a DM channel as read up to a specific message. Resets mention count to 0.

```
POST /api/v1/dms/:id/ack
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message_id` | string | Yes | Snowflake ID of the last read message |

**Response `200 OK`:**

```json
{
  "channel_id": "555666777",
  "last_read_message_id": "111222333",
  "last_read_seq": 15,
  "mention_count": 0
}
```

**Errors:**

| Status | Error Code | Meaning |
|--------|-----------|---------|
| 403 | `forbidden` | Not a participant of this DM |
| 404 | `not_found` | Message not found or not in this DM |

### Unread Count Calculation

Unread count is derived server-side by comparing the user's `last_read_seq` with the channel's current sequence:

- Messages with `channel_seq > last_read_seq` that are not deleted are counted as unread
- If no read state exists for a channel, all messages in that channel are considered unread
- Deleted messages are excluded from unread counts
- Acknowledging a message resets `mention_count` to 0

### Mention Tracking

Mentions increment a per-user per-channel counter. When a user is mentioned (via `@user` in a message), their `mention_count` for that channel is incremented. Acknowledging (acking) any message in the channel resets the count to 0.

---

- `400` — Cannot block yourself

### Unblock User

```
DELETE /api/friends/:user_id/block
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{ "data": { "status": "unblocked" } }
```

Only the blocker can unblock. Unblocking does not restore the previous friendship.

**Errors:**
- `404` — No block found (you haven't blocked this user)

### List Blocked Users

```
GET /api/friends/blocked
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": [
    {
      "id": "<friendship_id>",
      "friend_id": "<blocked_user_id>",
      "status": "blocked"
    }
  ]
}
```

### Friendship Status Lifecycle

```
(none) --send_request--> pending --accept--> accepted
                          |                     |
                          +--decline--> (none)  +--remove--> (none)
                          +--cancel---> (none)  +--block---> blocked
                          +--block----> blocked
(none) --block--> blocked --unblock--> (none)
```

### Block Integration with DMs

When either user has blocked the other:
- `POST /api/dm` returns `403 blocked`
- `POST /api/dm/:dm_channel_id/messages` returns `403 blocked`
- Existing DM channels remain visible but new messages cannot be sent

---

## Reactions

Add and remove emoji reactions on messages. Reactions are broadcast in real-time via the WebSocket gateway.

### Add Reaction

```
PUT /api/v1/servers/:server_id/channels/:channel_id/messages/:message_id/reactions/:emoji
Authorization: Bearer <session_token>
```

**Response** `201 Created`

```json
{
  "data": {
    "id": "<reaction_id>",
    "message_id": "<message_id>",
    "user_id": "<user_id>",
    "emoji": "👍"
  }
}
```

Each user can react with the same emoji only once per message. Multiple different emoji from the same user are allowed.

**Errors:**
- `403` — Not a server member
- `409 already_reacted` — Already reacted with this emoji

### Remove Reaction

```
DELETE /api/v1/servers/:server_id/channels/:channel_id/messages/:message_id/reactions/:emoji
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{ "data": { "status": "removed" } }
```

Only the user who added a reaction can remove it.

**Errors:**
- `404` — Reaction not found

### List Reactions

```
GET /api/v1/servers/:server_id/channels/:channel_id/messages/:message_id/reactions
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": [
    {
      "emoji": "👍",
      "count": 3,
      "users": [
        { "id": "123" },
        { "id": "456" },
        { "id": "789" }
      ]
    },
    {
      "emoji": "❤️",
      "count": 1,
      "users": [
        { "id": "123" }
      ]
    }
  ]
}
```

### WebSocket Events

**`reaction_add`** — Broadcast when a reaction is added:

```json
{
  "message_id": "123",
  "user_id": "456",
  "emoji": "👍",
  "channel_id": "789"
}
```

**`reaction_remove`** — Broadcast when a reaction is removed (same payload shape).

---

## Pins

Pin important messages in a channel. Maximum 50 pins per channel.

### Pin a Message

```
POST /api/v1/servers/:server_id/channels/:channel_id/pins
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "message_id": "<message_id>"
}
```

**Response** `201 Created`

```json
{
  "data": {
    "id": "<pin_id>",
    "channel_id": "<channel_id>",
    "message_id": "<message_id>",
    "pinned_by": "<user_id>",
    "pinned_at": "2026-03-12T00:00:00Z"
  }
}
```

**Errors:**
- `403` — Not a server member
- `404` — Message not found
- `409 already_pinned` — Message is already pinned
- `400 pin_limit_reached` — Channel has reached 50 pinned messages

### Unpin a Message

```
DELETE /api/v1/servers/:server_id/channels/:channel_id/pins/:message_id
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{ "data": { "status": "unpinned" } }
```

**Errors:**
- `404` — Message is not pinned

### List Pinned Messages

```
GET /api/v1/servers/:server_id/channels/:channel_id/pins
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": [
    {
      "id": "<pin_id>",
      "channel_id": "<channel_id>",
      "message_id": "<message_id>",
      "pinned_by": "<user_id>",
      "pinned_at": "2026-03-12T00:00:00Z"
    }
  ]
}
```

Pins are returned newest first.

### WebSocket Events

**`pin_add`** — Broadcast when a message is pinned:

```json
{
  "pin_id": "123",
  "message_id": "456",
  "channel_id": "789",
  "pinned_by": "012",
  "message": { ... }
}
```

**`pin_remove`** — Broadcast when a message is unpinned:

```json
{
  "message_id": "456",
  "channel_id": "789"
}
```

---

## Presence

Real-time user status tracking. Presence is ephemeral (in-memory) and tracked per WebSocket connection. Multiple connections per user are supported — the highest-priority status wins.

### Status Types

| Status | Priority | Description |
|--------|----------|-------------|
| `online` | 3 (highest) | User is actively connected |
| `idle` | 2 | User is inactive |
| `dnd` | 1 | Do Not Disturb (manual) |
| `invisible` | 0 | Connected but appears as `offline` to others |
| `offline` | — | Not connected (or invisible) |

### WebSocket — Presence Channel

Connect to the gateway and join `presence:lobby` to track your status and receive friend presence updates.

#### Join

```json
{
  "topic": "presence:lobby",
  "event": "phx_join",
  "payload": { "status": "online" }
}
```

The `status` field is optional (defaults to `"online"`). Valid values: `online`, `idle`, `dnd`, `invisible`.

#### Events Received

**`presence_state`** — Sent immediately after join. Snapshot of all friends' current statuses.

```json
{
  "presences": [
    { "user_id": "123", "status": "online" },
    { "user_id": "456", "status": "idle" }
  ]
}
```

**`presence_update`** — Sent when a friend's status changes. Updates are **batched every 5 seconds** server-side to prevent flooding.

```json
{
  "user_id": "123",
  "status": "offline"
}
```

#### Events Sent

**`update_status`** — Change your status.

```json
{
  "event": "update_status",
  "payload": { "status": "dnd" }
}
```

Valid values: `online`, `idle`, `dnd`, `invisible`. Returns `ok` on success.

### Multi-Connection Behavior

When a user has multiple active connections (e.g., desktop + mobile), the **highest-priority** status is used:

- If any connection is `online` → user appears online
- If all are `idle` → user appears idle
- If all are `dnd` → user appears DND
- `invisible` has lowest priority — if another connection is `online`, user appears online

When the last connection disconnects, the user goes offline.

### Poll Endpoints

For large servers or clients that prefer REST over WebSocket presence.

#### Server Member Presence

```
GET /api/v1/servers/:server_id/presence
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": [
    { "user_id": "123", "status": "online" },
    { "user_id": "456", "status": "offline" }
  ]
}
```

Recommended poll interval: 30s for active server, 60s for background servers. Requires server membership.

#### Friend Presence

```
GET /api/v1/friends/presence
Authorization: Bearer <session_token>
```

**Response** `200 OK`

```json
{
  "data": [
    { "user_id": "123", "status": "online" },
    { "user_id": "456", "status": "idle" }
  ]
}
```

### Invisible Mode

Invisible users:
- Appear as `offline` to all other users (friends, server members)
- Can still use the app normally (send messages, browse channels)
- Their `get_raw_status` is `"invisible"` (only visible to themselves)

### Batching Strategy

Presence updates are **batched every 5 seconds** before broadcast. This means:
- Rapid status flaps (e.g., connect/disconnect) are deduplicated
- Only the final state within each 5-second window is broadcast
- Reduces WebSocket event volume significantly

---

## Rate Limiting

All API responses include rate limit headers. When a limit is exceeded, a `429 Too Many Requests` response is returned.

### Response Headers

Every authenticated API response includes:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |

When rate limited (429), these additional headers appear:

| Header | Description |
|--------|-------------|
| `Retry-After` | Seconds to wait before retrying |

### 429 Response Body

```json
{
  "error": "rate_limited",
  "detail": "Too many requests. Please wait before trying again.",
  "retry_after": 30
}
```

### Rate Limit Layers

#### 1. IP-Based (Public Endpoints)

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Account creation (`POST /auth/register`) | 3 req | 1 second |
| Auth endpoints (`POST /auth/challenge`, `/auth/verify`) | 10 req | 1 second |
| General (unauthenticated) | 100 req | 1 second |

#### 2. User-Based (Authenticated Endpoints)

API calls per minute, scaled by trust tier:

| Trust Tier | API Calls/min | Messages/min |
|------------|---------------|--------------|
| Tier 0 (Unverified) | 20 | 5 |
| Tier 1 (Basic) | 60 | 15 |
| Tier 2 (Established) | 120 | 30 |
| Tier 3 (Trusted) | 200 | 60 |
| Tier 4 (Veteran) | 300 | 120 |

#### 3. Server Aggregate

| Metric | Limit | Window |
|--------|-------|--------|
| Total messages per server | 500 | 1 minute |

### Graduated Penalties

Repeated rate limit violations within a 10-minute window escalate:

| Violation # | Consequence |
|-------------|-------------|
| 1st | Standard 429 response |
| 2nd | 30-second cooldown enforced |
| 3rd+ | 5-minute cooldown enforced |

Penalty counters reset after 10 minutes of no violations.
