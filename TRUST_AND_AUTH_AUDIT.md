# Burrow — Trust & Authentication System Audit

> Generated: March 25, 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication — Passwordless Device-Bound Cryptography](#2-authentication)
3. [Registration Flow](#3-registration-flow)
4. [Login Flow (Challenge-Response)](#4-login-flow)
5. [WebAuthn / Passkey Flow](#5-webauthn--passkey-flow)
6. [Session Management](#6-session-management)
7. [Account Recovery (BIP39 Mnemonic)](#7-account-recovery)
8. [Request Pipeline — Middleware Stack](#8-request-pipeline)
9. [Trust Tier System](#9-trust-tier-system)
10. [Server Permission System (Bitfield)](#10-server-permission-system)
11. [Channel Permission Overrides](#11-channel-permission-overrides)
12. [DM Authorization](#12-dm-authorization)
13. [WebSocket & Channel Authorization](#13-websocket--channel-authorization)
14. [Rate Limiting (Multi-Layer)](#14-rate-limiting)
15. [Ban & Timeout System](#15-ban--timeout-system)
16. [Security Findings & Recommendations](#16-security-findings--recommendations)

---

## 1. Architecture Overview

Burrow uses a **passwordless, device-bound authentication** model. There are no passwords, no emails required, and no traditional "forgot password" flow. Instead, identity is anchored to cryptographic keys on the user's device.

### Core Principles

| Principle | Implementation |
|-----------|---------------|
| **No passwords** | Ed25519 keypair per device, or WebAuthn/Passkey |
| **No email required** | Account creation uses only username + device key + PoW |
| **Anti-bot** | SHA256 Proof of Work required at registration |
| **Replay protection** | Timestamp + nonce on every authenticated request |
| **Request signing** | Ed25519 signature on METHOD\nPATH\nTIMESTAMP\nNONCE |
| **Trust progression** | New accounts start restricted (Tier 1), earn access over time |
| **Graduated rate limiting** | Per-IP, per-user, and per-server limits scaled by trust tier |

### Key Files

| File | Purpose |
|------|---------|
| `lib/burrow/auth.ex` | Core auth logic (register, challenge, verify, recover, WebAuthn) |
| `lib/burrow/auth/user.ex` | User schema |
| `lib/burrow/auth/user_session.ex` | Session schema |
| `lib/burrow/auth/device_key.ex` | Ed25519 device key schema |
| `lib/burrow/auth/auth_challenge.ex` | Challenge-response nonce schema |
| `lib/burrow/auth/recovery_key.ex` | BIP39 recovery key schema |
| `lib/burrow/auth/webauthn_credential.ex` | WebAuthn/FIDO2 credential schema |
| `lib/burrow/auth/mnemonic.ex` | BIP39 mnemonic generation/verification |
| `lib/burrow/auth/pow_record.ex` | Proof of Work record schema |
| `lib/burrow/trust.ex` | Trust tier definitions, gates, and limits |
| `lib/burrow/permissions.ex` | 66-bit permission bitfield system |
| `lib/burrow/rate_limiter.ex` | Redis-backed sliding window rate limiter |
| `lib/burrow_web/plugs/auth_plug.ex` | Bearer token authentication plug |
| `lib/burrow_web/plugs/replay_guard_plug.ex` | Replay attack prevention plug |
| `lib/burrow_web/plugs/request_signature_plug.ex` | Device key signature verification plug |
| `lib/burrow_web/plugs/rate_limit_plug.ex` | Per-user rate limiting plug |
| `lib/burrow_web/plugs/ip_rate_limit_plug.ex` | IP-based rate limiting plug |
| `lib/burrow_web/plugs/cors_plug.ex` | CORS configuration plug |
| `lib/burrow_web/plugs/security_headers_plug.ex` | Security header plug |
| `lib/burrow_web/channels/user_socket.ex` | WebSocket authentication |
| `lib/burrow_web/controllers/fallback_controller.ex` | Error response handling |

---

## 2. Authentication

### 2.1 Passwordless Model

Burrow **never stores or transmits passwords**. Authentication is based on:

1. **Ed25519 Device Keys** — Each device generates a keypair. The public key is registered with the server. Login is a challenge-response: the server sends a nonce, the client signs it with the private key, and the server verifies.

2. **WebAuthn / Passkeys** — FIDO2-compliant passkey registration and login. Supports both platform authenticators (Face ID, Windows Hello) and roaming authenticators (YubiKey).

3. **BIP39 Recovery Mnemonic** — A 24-word recovery phrase (256-bit entropy) as the "escape hatch" when all devices are lost.

### 2.2 Cryptographic Primitives

| Primitive | Usage | Implementation |
|-----------|-------|----------------|
| **Ed25519** | Device key signing/verification | `:crypto.verify(:eddsa, :none, msg, sig, [pubkey, :ed25519])` |
| **SHA256** | Token hashing, PoW, recovery key hashing | `:crypto.hash(:sha256, data)` |
| **CSPRNG** | Token generation, nonces, challenges | `:crypto.strong_rand_bytes(32)` |
| **BIP39** | Recovery phrase (24 words, 2048 dictionary) | Custom `Mnemonic` module with `priv/bip39_english.txt` |
| **WebAuthn** | Passkey attestation & assertion | ES256 (COSE -7) and EdDSA (COSE -8) |

### 2.3 Data at Rest

| Secret | Storage | Format |
|--------|---------|--------|
| Session token | `user_sessions.token_hash` | SHA256 hash (one-way, 32 bytes binary) |
| Device public key | `device_keys.public_key_ed25519` | Raw 32-byte Ed25519 public key |
| Recovery key | `account_recovery_keys.recovery_key_hash` | SHA256 hash of mnemonic string |
| WebAuthn credential | `webauthn_credentials.public_key` | COSE-encoded public key |
| PoW result | `pow_records.hash_result` | Hex-encoded SHA256 |

**The server never stores**: private keys, plaintext recovery phrases, passwords, or session tokens in cleartext.

---

## 3. Registration Flow

```
Client                                          Server
  │                                                │
  │  1. Generate Ed25519 keypair (client-side)     │
  │  2. Compute PoW: SHA256(pubkey || nonce)        │
  │     until hash starts with "0000"              │
  │                                                │
  │  POST /api/v1/auth/register                    │
  │  {public_key, nonce, username,                 │
  │   device_fingerprint_hash, age_verified,       │
  │   tos_accepted, privacy_accepted}              │
  ├───────────────────────────────────────────────►│
  │                                                │
  │                        3. Verify PoW (SHA256)  │
  │                        4. Check key not reused │
  │                        5. Validate username    │
  │                        6. Create user (Tier 1) │
  │                        7. Create device_key    │
  │                        8. Create session       │
  │                        9. Record PoW           │
  │                                                │
  │  201 {user, device_key_id, session_token}      │
  │◄───────────────────────────────────────────────┤
```

**Rate Limit**: 3 requests/second per IP (`:creation` pipeline)

### Registration Validation

- **Username**: 2–32 chars, alphanumeric + underscore, unique (case-insensitive via CITEXT)
- **Age**: Must accept 13+ age gate (`age_verified: true`)
- **Terms**: Must accept ToS and Privacy Policy versions
- **PoW**: SHA256(public_key ‖ nonce) must start with difficulty prefix (default: `"0000"`)
- **Key uniqueness**: Ed25519 public key must not be registered by any user globally

### Initial Trust State

- `trust_score`: 16
- `trust_tier`: 1
- Access: Can read/send messages (rate-limited), react, join ≤10 servers, send DMs

---

## 4. Login Flow

### 4.1 Challenge-Response (Ed25519)

```
Client                                          Server
  │                                                │
  │  POST /api/v1/auth/challenge                   │
  │  {username}                                    │
  ├───────────────────────────────────────────────►│
  │                                                │
  │                     1. Lookup user by username  │
  │                     2. Generate 32-byte nonce   │
  │                     3. Store challenge (60s TTL)│
  │                     OR: Return fake challenge   │
  │                         if user doesn't exist   │
  │                         (timing-attack resist.) │
  │                                                │
  │  200 {challenge_id, nonce (hex), expires_at}   │
  │◄───────────────────────────────────────────────┤
  │                                                │
  │  4. Sign nonce with Ed25519 private key        │
  │                                                │
  │  POST /api/v1/auth/verify                      │
  │  {challenge_id, signature (hex), public_key}   │
  ├───────────────────────────────────────────────►│
  │                                                │
  │                     5. Lookup challenge by ID   │
  │                     6. Check not expired/used   │
  │                     7. Find device_key by pubkey│
  │                     8. Verify Ed25519 signature │
  │                     9. Mark challenge used=true │
  │                    10. Update device last_used  │
  │                    11. Create session           │
  │                                                │
  │  200 {session_token, user}                     │
  │◄───────────────────────────────────────────────┤
```

**Rate Limit**: 10 requests/second per IP (`:auth` pipeline)

**Anti-Enumeration**: If username doesn't exist, the challenge endpoint returns a fake challenge (same response shape, 200 status) so attackers cannot enumerate valid usernames via timing.

### 4.2 Challenge Properties

| Property | Value |
|----------|-------|
| Nonce size | 32 bytes (`:crypto.strong_rand_bytes/1`) |
| TTL | 60 seconds |
| One-time use | `used` flag set to `true` after verification |
| Binding | Tied to specific user_id |

---

## 5. WebAuthn / Passkey Flow

### 5.1 Registration with Passkey

```
Client                                          Server
  │                                                │
  │  POST /auth/webauthn/register/begin            │
  │  {username, age_verified, tos_accepted, ...}   │
  ├───────────────────────────────────────────────►│
  │                                                │
  │         1. Generate challenge                  │
  │         2. Store in Redis (120s TTL)           │
  │         3. Build PublicKeyCredentialOptions     │
  │                                                │
  │  200 {challenge_id, options, challenge_hex}    │
  │◄───────────────────────────────────────────────┤
  │                                                │
  │  4. User creates credential (biometric/PIN)    │
  │  5. Compute PoW on challenge bytes             │
  │                                                │
  │  POST /auth/webauthn/register/complete         │
  │  {credential, challenge_id, pow_nonce, ...}    │
  ├───────────────────────────────────────────────►│
  │                                                │
  │         6. Verify PoW                          │
  │         7. Verify WebAuthn attestation         │
  │         8. Create user (Tier 1)                │
  │         9. Create webauthn_credential          │
  │        10. Auto-generate recovery key          │
  │        11. Create session                      │
  │                                                │
  │  201 {user, session_token, recovery_phrase}    │
  │◄───────────────────────────────────────────────┤
```

### 5.2 Login with Passkey

```
Client                                          Server
  │                                                │
  │  POST /auth/webauthn/login/begin               │
  │  {username}                                    │
  ├───────────────────────────────────────────────►│
  │                                                │
  │  200 {challenge_id, options}                   │
  │◄───────────────────────────────────────────────┤
  │                                                │
  │  User authenticates (biometric/PIN)            │
  │                                                │
  │  POST /auth/webauthn/login/complete            │
  │  {challenge_id, credential: {id, response}}    │
  ├───────────────────────────────────────────────►│
  │                                                │
  │         1. Verify WebAuthn assertion           │
  │         2. Check sign_count (anti-cloning)     │
  │         3. Create session                      │
  │                                                │
  │  200 {session_token, user}                     │
  │◄───────────────────────────────────────────────┤
```

### 5.3 WebAuthn Credential Properties

| Property | Value |
|----------|-------|
| Algorithms | ES256 (COSE -7), EdDSA (COSE -8) |
| Challenge storage | Redis, 120-second TTL |
| Anti-cloning | `sign_count` incremented and verified on each use |
| Management | List, revoke, rename via authenticated endpoints |

### 5.4 Adding Passkeys to Existing Account

Authenticated users can add additional passkeys via `POST /auth/passkeys/add/begin` and `/complete`. This allows multi-device access without sharing private keys.

---

## 6. Session Management

### 6.1 Token Lifecycle

```
Generation:  :crypto.strong_rand_bytes(32)  →  32 bytes
Encoding:    Base.encode16(token, case: :lower)  →  64 hex chars
Transport:   Authorization: Bearer <hex_token>
Storage:     SHA256(token)  →  user_sessions.token_hash
Lookup:      Decode hex → SHA256 → query by token_hash WHERE revoked_at IS NULL
```

### 6.2 Session Schema

| Field | Type | Purpose |
|-------|------|---------|
| `token_hash` | binary (32 bytes) | One-way SHA256 hash — primary lookup |
| `user_id` | integer | FK to users |
| `device_key_id` | integer | FK to device_keys (NULL for WebAuthn sessions) |
| `device_type` | string | "web", "mobile", "desktop" |
| `os` | string | Operating system |
| `browser` | string | Browser name |
| `ip` | string | IP address at creation |
| `city` | string | GeoIP city |
| `country` | string | GeoIP country |
| `first_active` | datetime | Session creation time |
| `last_active` | datetime | Last activity (throttled 5-min updates) |
| `trusted` | boolean | Reserved for future use |
| `revoked_at` | datetime | Soft-delete timestamp (NULL = active) |

### 6.3 Session Operations

| Operation | Endpoint | Behavior |
|-----------|----------|----------|
| List sessions | `GET /auth/sessions` | Returns all active sessions, marks current |
| Revoke one | `DELETE /auth/sessions/:id` | Sets `revoked_at` (soft delete) |
| Revoke all others | `DELETE /auth/sessions` | Revokes all except current token |
| Touch (activity) | Automatic via AuthPlug | Updates `last_active` with 5-min ETS throttle |

### 6.4 Session Touch Throttling

To prevent DB spam, `touch_session/1` uses an ETS table (`:session_touch_cache`) to throttle `last_active` updates to at most once per 5 minutes per session.

---

## 7. Account Recovery

### 7.1 BIP39 Mnemonic

Recovery uses the **BIP39 standard** (Bitcoin Improvement Proposal 39):

- **Entropy**: 256 bits from `:crypto.strong_rand_bytes(32)`
- **Checksum**: 8-bit SHA256 truncation appended
- **Word count**: 24 words (264 bits ÷ 11 bits per word)
- **Dictionary**: 2048 English words loaded from `priv/bip39_english.txt` at compile time
- **Storage**: SHA256 hash only — **the plaintext mnemonic is shown once and never stored**

### 7.2 Recovery Flow

```
1. Authenticated user:
   POST /auth/recovery-key  →  {mnemonic: "word1 word2 ... word24", warning: "..."}
   
2. User saves the 24-word phrase offline

3. POST /auth/recovery-key/confirm  {mnemonic: "..."}
   Server verifies hash match, sets confirmation_completed=true

4. On device loss:
   POST /auth/recover  {username, mnemonic, public_key, device_fingerprint_hash}
   Server verifies mnemonic hash → registers new device key → creates session
```

### 7.3 Safety Properties

- Previous recovery key is **invalidated** when a new one is generated
- Only **one active** (non-invalidated) recovery key per user (enforced by partial unique index)
- Must be **confirmed** before it can be used for recovery
- `last_used_at` tracked for audit trail

---

## 8. Request Pipeline

### 8.1 Middleware Stack (Authenticated Routes)

Every authenticated request passes through this plug pipeline in order:

```
Request
  │
  ▼
┌────────────────────────────────────────┐
│ 1. CorsPlug                            │  Origin validation, CORS headers
├────────────────────────────────────────┤
│ 2. SecurityHeadersPlug                 │  X-Frame-Options, X-Content-Type-Options, etc.
├────────────────────────────────────────┤
│ 3. AuthPlug                            │  Bearer token → session lookup → user assignment
│    Assigns: current_user_id,           │
│             current_session,           │
│             current_trust_tier         │
├────────────────────────────────────────┤
│ 4. ReplayGuardPlug                     │  X-Request-Timestamp (±30s) + X-Request-Nonce (Redis)
├────────────────────────────────────────┤
│ 5. RequestSignaturePlug                │  Ed25519 signature of METHOD\nPATH\nTS\nNONCE
│    (Skipped for WebAuthn sessions)     │
├────────────────────────────────────────┤
│ 6. RateLimitPlug                       │  Per-user sliding window (tier-scaled)
│    Headers: X-RateLimit-Limit,         │
│             X-RateLimit-Remaining,     │
│             X-RateLimit-Reset          │
├────────────────────────────────────────┤
│ 7. Controller                          │  Business logic
└────────────────────────────────────────┘
```

### 8.2 Public Auth Routes

```
Request
  │
  ▼
┌────────────────────────────────────────┐
│ 1. CorsPlug                            │
├────────────────────────────────────────┤
│ 2. SecurityHeadersPlug                 │
├────────────────────────────────────────┤
│ 3. IpRateLimitPlug                     │  :creation (3/s) or :auth (10/s)
├────────────────────────────────────────┤
│ 4. Controller                          │
└────────────────────────────────────────┘
```

### 8.3 Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer disclosure |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables browser features |
| `X-XSS-Protection` | `1; mode=block` | Enables browser XSS filter |

### 8.4 CORS Configuration

- **Production**: Set via `CORS_ORIGINS` environment variable (comma-separated)
- **Development defaults**: `http://localhost:5173`, `http://localhost:5175`, `http://127.0.0.1:5173`, `http://127.0.0.1:5175`
- **Allowed headers**: `authorization`, `content-type`, `x-request-timestamp`, `x-request-nonce`, `x-device-signature`
- **Preflight**: OPTIONS requests return 204 with 24h max-age cache

### 8.5 Replay Guard

| Property | Value |
|----------|-------|
| Required headers | `X-Request-Timestamp`, `X-Request-Nonce` |
| Timestamp window | ±30 seconds from server time |
| Nonce minimum length | 16 characters |
| Nonce uniqueness | Redis `SET NX` with 60-second TTL |
| Configurable | `config :burrow, replay_guard_enabled: false` for dev |

### 8.6 Request Signature

| Property | Value |
|----------|-------|
| Algorithm | Ed25519 |
| Signed message | `METHOD\nPATH\nTIMESTAMP\nNONCE` |
| Header | `X-Device-Signature` (hex-encoded) |
| WebAuthn exemption | Sessions without `device_key_id` skip verification |
| Configurable | `config :burrow, request_signatures_enabled: false` for dev |
| Failure response | 403 Forbidden |

---

## 9. Trust Tier System

### 9.1 Tier Definitions

| Tier | Score Range | Description | Key Unlocks |
|------|-------------|-------------|-------------|
| **0** | 0–15 | Restricted | Read + send (5/min), react, join ≤3 servers |
| **1** | 16–40 | Default (new accounts) | DMs (text, 10/hr), join ≤10 servers |
| **2** | 41–70 | Established | Unrestricted DMs, file uploads (10MB), create invites |
| **3** | 71–90 | Trusted | Create servers, server discovery, file uploads (25MB) |
| **4** | 91–100 | Veteran | Max rate limits, vouching, file uploads (100MB) |
| **5** | Dev only | Platform Developer | All permissions, no limits, set via `Auth.set_dev/2` |

### 9.2 Trust Score Thresholds

```elixir
{0, 0}, {1, 16}, {2, 41}, {3, 71}, {4, 91}
```

New accounts start at **score 16, tier 1**.

### 9.3 Trust-Gated Features

| Feature | Required Tier | Gate Function | Code Location |
|---------|---------------|---------------|---------------|
| Send DMs | 1+ | `Trust.can_send_dm?/1` | trust.ex L108 |
| Upload files | 2+ | `Trust.can_upload_files?/1` | trust.ex L113 |
| Create invites | 2+ | `Trust.can_create_invite?/1` | trust.ex L118 |
| Create servers | 3+ | `Trust.can_create_server?/1` | trust.ex L90 |
| Server discovery | 3+ | `Trust.can_use_discovery?/1` | trust.ex L123 |
| Join server | Any (but cooldown for Tier 0) | `Trust.can_join_server?/1` | trust.ex L134 |
| Send message | Any (but first-message cooldown) | `Trust.can_send_message?/1` | trust.ex L147 |

### 9.4 Server Join Limits

| Tier | Max Servers |
|------|-------------|
| 0 | 3 |
| 1 | 10 |
| 2 | 50 |
| 3 | 100 |
| 4 | 200 |
| 5 | 10,000 |

### 9.5 File Upload Limits

| Tier | Max File Size |
|------|---------------|
| 0–1 | No uploads |
| 2 | 10 MB |
| 3 | 25 MB |
| 4+ | 100 MB |

### 9.6 Trust Status Endpoint

`GET /api/v1/trust/status` returns the user's current tier, score, and all feature gates as booleans.

---

## 10. Server Permission System

### 10.1 Bitfield Architecture

Permissions are stored as a 66-bit integer using a custom Ecto type (`Burrow.Ecto.BigBitfield`). Each permission is a single bit.

### 10.2 Permission Bits

| Bit | Permission | Description |
|-----|-----------|-------------|
| 0 | `view_channel` | See channel content |
| 1 | `send_messages` | Post messages |
| 2 | `embed_links` | Auto-embed URLs |
| 3 | `attach_files` | Upload files |
| 4 | `add_reactions` | Add emoji reactions |
| 5 | `mention_everyone` | Use @everyone / @here |
| 6 | `manage_messages` | Delete/pin others' messages |
| 7 | `read_message_history` | See past messages |
| 8 | `connect` | Join voice channels |
| 9 | `speak` | Talk in voice channels |
| 10 | `stream` | Screen share / stream |
| 11 | `mute_members` | Server mute others |
| 12 | `deafen_members` | Server deafen others |
| 13 | `move_members` | Move users between voice channels |
| 14 | `use_voice_activity` | Use VAD (vs push-to-talk) |
| 15 | `manage_channels` | Create/edit/delete channels |
| 16 | `manage_roles` | Create/edit/delete roles |
| 17 | `manage_server` | Edit server settings |
| 18 | `kick_members` | Remove members |
| 19 | `ban_members` | Ban members |
| 26 | `administrator` | **Master override — grants ALL permissions** |
| 38 | `timeout_members` | Temporarily timeout members |

### 10.3 Permission Computation

```
1. Collect all roles assigned to member
2. Compute base = OR(all_role.permissions)
3. If base has administrator bit → return ALL_PERMISSIONS
4. Apply channel overrides (see §11)
5. Return effective permissions
```

### 10.4 Hierarchical Implications

The `effective?/2` function implements permission hierarchy:

- `administrator` → implies all permissions
- `manage_channels` → implies create/edit/delete channels
- `manage_categories` → implies create/edit/delete categories
- `manage_members` → implies kick/ban/timeout
- `manage_roles` → implies create/edit/delete roles

### 10.5 Role Properties

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Role display name (1–100 chars) |
| `color` | string | Hex color code (#RRGGBB) |
| `position` | integer | Hierarchy rank (higher = more powerful) |
| `permissions` | bigint (bitfield) | Permission bits |
| `hoist` | boolean | Display separately in member list |
| `mentionable` | boolean | Can be @mentioned |

### 10.6 Role Hierarchy

Role `position` determines who can act on whom:

- **Owner** can act on anyone (checked first, always bypasses)
- **Higher position** can act on lower position
- **Equal position** cannot act on each other
- You cannot ban/kick/timeout someone with equal or higher role position

---

## 11. Channel Permission Overrides

### 11.1 Override Schema

```elixir
%ChannelOverride{
  channel_id: integer,
  target_type: "role" | "user" | "everyone",
  target_id: integer,      # Role ID or User ID
  allow: bigint,           # Permission bits to ALLOW
  deny: bigint             # Permission bits to DENY
}
```

### 11.2 Resolution Order

```
1. Start with base permissions (from roles)
2. Apply @everyone override:
     base = (base & ~everyone.deny) | everyone.allow
3. Compute union of ALL role overrides:
     role_allow = OR(all matching role overrides .allow)
     role_deny  = OR(all matching role overrides .deny)
4. Apply role overrides:
     base = (base | role_allow) & ~role_deny
5. Apply user-specific override (if exists):
     base = (base | user.allow) & ~user.deny
6. Administrator bypasses everything (returns ALL)
```

User-specific overrides have the **highest priority** and can override any role-based setting.

### 11.3 Category-Level Sync

`POST /servers/:id/categories/:cat_id/sync_permissions` copies permissions from a category to all its channels.

---

## 12. DM Authorization

### 12.1 DM Creation

```elixir
# POST /api/v1/dms
def create(conn, %{"user_id" => other_user_id}) do
  with :ok <- Trust.can_send_dm?(user_id),                    # Tier 1+ required
       false <- Social.either_blocked?(user_id, other_id),    # Neither has blocked the other
       {:ok, dm} <- DM.get_or_create_dm(user_id, other_id) do
    ...
  end
end
```

**Requirements**:
- Trust Tier 1+ (new accounts default to Tier 1 ✓)
- Neither user has blocked the other (bidirectional check)
- **Friendship is NOT required** to create a DM

### 12.2 DM Message Sending

```elixir
# POST /api/v1/dms/:id/messages
def send_message(conn, params) do
  with :ok <- Trust.can_send_dm?(user_id),                    # Tier check
       true <- DM.participant?(dm_id, user_id),                # Must be participant
       false <- Social.either_blocked?(user_id, other_id),     # Block check
       :ok <- check_dm_rate(user_id, tier) do                  # DM rate limit
    ...
  end
end
```

### 12.3 Block System

| Function | Behavior |
|----------|----------|
| `block_user(blocker, target)` | Creates block, **removes any existing friendship** |
| `unblock_user(blocker, target)` | Removes block |
| `blocked?(user_id, target_id)` | One-directional: did A block B? |
| `either_blocked?(a, b)` | Bidirectional: has A blocked B OR B blocked A? |

Blocking is **one-directional** — A blocking B doesn't mean B blocked A. But both directions are checked for DM access.

---

## 13. WebSocket & Channel Authorization

### 13.1 Socket Connection

```elixir
# user_socket.ex
def connect(%{"token" => token}, socket, _connect_info) do
  case Auth.get_session_by_token(token) do
    %UserSession{} = session ->
      Auth.touch_session(session)
      socket = assign(socket, :user_id, session.user_id)
      {:ok, socket}
    _ ->
      :error
  end
end
```

- Token passed as WebSocket connection parameter
- Same session lookup as HTTP (SHA256 hash → DB query)
- Socket identified as `user_socket:{user_id}` for targeting

### 13.2 Channel Topics & Authorization

| Topic Pattern | Channel Module | Authorization |
|---------------|----------------|---------------|
| `channel:{id}` | GatewayChannel | Server member + `view_channel` permission |
| `dm:{id}` | GatewayChannel | DM participant check |
| `presence:lobby` | PresenceChannel | Any authenticated user |
| `voice:{serverId}` | VoiceChannel | Server member (join) + `connect` permission (voice_join) |
| `dm_voice:{dmId}` | DmVoiceChannel | DM participant check |

### 13.3 Server Channel Join

```elixir
def join("channel:" <> channel_id_str, params, socket) do
  with {:ok, channel} <- Communities.get_channel(channel_id),
       true <- Communities.member?(channel.server_id, user_id),
       true <- Communities.has_channel_permission?(server_id, user_id, channel_id, Permissions.view_channel()) do
    # Subscribe to PubSub + replay missed events
    {:ok, %{channel_id, replay: missed_events}, socket}
  end
end
```

### 13.4 Voice Channel Join

Two-step authorization:

1. **Socket join** (`voice:{serverId}`): Must be server member
2. **Voice join** (`voice_join` message): Must have `connect` permission for the specific voice channel + channel must be type `"voice"` + user limit check

### 13.5 DM Voice Channel

```elixir
def join("dm_voice:" <> dm_id_str, _params, socket) do
  if DM.participant?(dm_id, user_id) do
    # Subscribe + notify other participant (incoming call ring)
    {:ok, ...}
  else
    {:error, %{reason: "not_a_participant"}}
  end
end
```

On join, broadcasts `dm_call_ring` to the other participant via `user_notify:{other_id}` PubSub topic. On terminate, broadcasts `dm_call_ended`.

### 13.6 Event Replay

When joining a channel, clients can pass `last_seq` to receive missed events. The server replays events from the event log since that sequence number. This is safe because the join already verified authorization.

---

## 14. Rate Limiting

### 14.1 Multi-Layer Architecture

```
Layer 1: IP-Based (public endpoints)
  └─ :creation → 3 req/s
  └─ :auth → 10 req/s
  └─ :general → 100 req/s

Layer 2: Per-User API (authenticated endpoints)
  └─ Tier 0: 20 req/min
  └─ Tier 1: 60 req/min
  └─ Tier 2: 120 req/min
  └─ Tier 3: 200 req/min
  └─ Tier 4: 300 req/min
  └─ Tier 5: 500 req/min

Layer 3: Per-User Messages (message sending)
  └─ Tier 0: 5 msg/min
  └─ Tier 1: 15 msg/min
  └─ Tier 2: 30 msg/min
  └─ Tier 3: 60 msg/min
  └─ Tier 4: 120 msg/min
  └─ Tier 5: 240 msg/min (1000 in trust.ex config, 240 in rate_limiter)

Layer 4: Per-Server Aggregate
  └─ 500 messages/min per server
```

### 14.2 Implementation

- **Backend**: Redis sliding window counters via `Burrow.RateLimiter`
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Response on limit**: HTTP 429 with `Retry-After` header

### 14.3 Penalty Escalation

Repeated rate limit violations trigger graduated penalties:

| Violation # | Cooldown |
|-------------|----------|
| 1st | No cooldown |
| 2nd | 30 seconds |
| 3rd+ | 5 minutes |

---

## 15. Ban & Timeout System

### 15.1 Server Bans

| Property | Details |
|----------|---------|
| **Schema** | `server_bans` table |
| **Fields** | server_id, user_id, banned_by, reason, expires_at, message_purge_window |
| **Permanent** | `expires_at = NULL` |
| **Temporary** | `expires_at = DateTime` (auto-checked, expired bans cleaned up on access) |
| **Permission** | Requires `ban_members` effective permission |
| **Behavior** | Removes from membership, prevents rejoining |

### 15.2 Server Timeouts

| Property | Details |
|----------|---------|
| **Field** | `server_members.timed_out_until` |
| **Permanent** | Not applicable (timeouts are always temporary) |
| **Permission** | Requires `timeout_members` effective permission |
| **Behavior** | Member can read but cannot send messages/react |
| **Check** | `DateTime.compare(until, now) == :gt` |

### 15.3 Hierarchy Enforcement

All ban/kick/timeout operations enforce role hierarchy:

```elixir
cond do
  target_id == server.owner_id -> {:error, :forbidden}    # Cannot act on owner
  server.owner_id == actor_id -> :ok                      # Owner can act on anyone
  actor_pos > target_pos -> :ok                           # Higher role wins
  true -> {:error, :forbidden}                            # Cannot act on equal/higher
end
```

---

## 16. Security Findings & Recommendations

### 16.1 Strengths

1. **No password attack surface**: Ed25519 + WebAuthn eliminates password stuffing, credential reuse, and phishing of passwords.

2. **Strong replay protection**: Every authenticated request requires a fresh timestamp + nonce, verified via Redis. Combined with device signatures, this makes request forgery very difficult.

3. **Request signing**: Ed25519 signatures on `METHOD\nPATH\nTS\nNONCE` prove the request came from the device holding the private key. This is a defense-in-depth layer beyond bearer tokens.

4. **Timing-attack resistant auth**: Challenge endpoint returns fake challenges for non-existent users, preventing username enumeration.

5. **One-way token storage**: Session tokens are SHA256-hashed before storage. Database compromise doesn't expose usable tokens.

6. **Graduated trust system**: New accounts are meaningfully restricted, reducing spam and abuse surface.

7. **Multi-layer rate limiting**: IP + user + server layers provide defense in depth against various abuse patterns.

8. **PoW anti-automation**: SHA256 proof of work makes mass registration computationally expensive.

9. **Proper error handling**: FallbackController returns generic messages, avoiding information leakage.

10. **Security headers**: Frame protection, MIME sniffing prevention, and referrer policy are all set.

### 16.2 Observations & Potential Improvements

1. **Trust score progression**: The audit did not find an active mechanism for incrementing `trust_score` over time (only `set_dev` which jumps to tier 5). Consider implementing organic trust growth (message count, account age, verification steps).

2. **WebAuthn session exemption**: WebAuthn sessions skip `RequestSignaturePlug` because there's no Ed25519 device key. This means passkey-only accounts have one fewer authentication layer on API requests. The session token + replay guard still protect, but it's a different security posture.

3. **DM open by default**: DMs only require Tier 1+ and no blocking — no friendship needed. This is a design choice but could enable unsolicited messages. A "DMs from friends only" privacy setting could be valuable.

4. **Permissions-Policy header**: Currently blocks `camera`, `microphone`, `geolocation` — but the app uses WebRTC voice which needs microphone access. This header might interfere with voice functionality (though it applies to the API domain, not the frontend domain, so may be fine if they're separate origins).

5. **Session expiration**: No explicit session TTL was found. Sessions live until explicitly revoked. Consider adding automatic expiry (e.g., 30 days inactive) and/or absolute expiry.

6. **PoW difficulty is static**: The `"0000"` prefix is configurable but doesn't adapt to load. An adaptive difficulty that increases during registration spikes could improve spam resistance.

7. **Recovery key single point of failure**: If a user loses their device AND their recovery phrase, the account is permanently inaccessible. This is by design (privacy-first), but clear user communication is critical.

---

## Appendix: Error Responses

| Status | Error Code | Trigger |
|--------|-----------|---------|
| 401 | `unauthorized` | Missing/invalid Bearer token |
| 403 | `signature_required` | Missing X-Device-Signature |
| 403 | `invalid_signature` | Signature verification failed |
| 400 | `replay_rejected` | Expired timestamp, reused nonce, or missing headers |
| 429 | `rate_limited` | Any rate limit exceeded (includes `Retry-After` header) |
| 422 | `validation_error` | Ecto changeset validation failure |
| 403 | `forbidden` | Insufficient permissions |
| 404 | `not_found` | Resource doesn't exist |
