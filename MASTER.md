# Burrow — Master Guide  
_Discord-adjacent community platform with text, voice, and streaming_

---

## Table of Contents

1. [Overview](#overview)  
2. [Feature Map](#feature-map)  
    - Account Types (Personal & Organization)  
    - User System & Auth  
    - Account Customization  
    - Secure Communication  
    - Servers & Channels  
    - Channel Types  
    - Text Channel Settings  
    - Voice Channel Settings  
    - Text Communication  
    - Voice Communication  
    - Video & Streaming  
    - Direct Messages & Group DMs  
    - Friends System  
    - Roles & Permissions  
    - Notifications  
    - User Presence & Activity  
    - Media & File Sharing  
    - Moderation & Safety  
    - Settings & Personalization  
    - Developer / Admin Panel  
    - Integrations & Connected Apps  
    - Bot / Integration Platform  
    - Search & Discovery  
    - Plugin API & Extensibility  
    - Server Sandboxing & Isolation  
    - Progressive Trust & Reputation System  
    - Behavioral Bot Detection & Human Verification  
    - Invite-Based Growth Model  
    - Network Architecture & Self-Hosted Deployment  
    - Enterprise Features  
    - In-App Support & Ticket System  
    - Server Dashboards  
    - Privacy Controls  
    - Game Server Connect  
    - Content Blocks Architecture  
    - Temporary Squad Voice Rooms  
3. [Data Model](#data-model)  
4. [Real-time Architecture](#real-time-architecture)  
    - Event-Driven Core  
    - Gateway Architecture  
    - Client Event Subscriptions  
    - Phoenix Channels Topics  
    - PubSub Fan-out Architecture  
    - WebRTC Voice/Video Flow  
    - Rate Limiting  
    - Media Safety Pipeline  
    - Client-Side Caching & Reconnect Reconciliation  
    - Observability  
    - Database Migration Strategy  
    - Event Log & State Table Partitioning  
    - UX Safety & Feedback  
    - Backup & Disaster Recovery  
    - Compliance Audit Logs  
    - Legal & Age Compliance  
    - Rolling Upgrades & Versioning  
    - Security Hardening  
5. [Tech Stack Summary](#tech-stack-summary)

---

## 1. Overview

This document is a master guide for building **Burrow** — a modern community platform with real-time text, voice, video, and streaming:  
- **Backend**: Built for real-time, concurrent user activity using Elixir, Phoenix, and Docker.  
- **Web Client**: React-based, fast, and extensible.  
- **Desktop Client**: Electron app, built with React for unified UI/codebase.  
- **Mobile Client**: Expo + React Native for easy cross-platform iOS/Android deployment.  
- **Best Practices**: Containerization, modularity, microservices, scalability, and DX.  
- **Network Model**: Centralized by default (all data on platform S3); optional self-hosted deployment for enterprises (own storage, own moderation, isolated instance).

---

## 2. Feature Map

### 2.1 Account Types (Personal & Organization)

| Feature | Description | Priority |
|---------|-------------|----------|
| Personal Account | Standard user account for individuals | P0 |
| Organization Account | Business/team account with centralized billing and member management | P1 |
| Org Member Management | Invite/remove members, assign org-level roles (owner, admin, member) | P1 |
| Org-Owned Servers | Servers tied to an org rather than a personal account — survive owner departures | P1 |
| Org Branding | Custom org logo, name, verified badge on org-owned servers | P2 |
| Org Audit Trail | Centralized audit log across all org-owned servers | P2 |
| Org Billing & Plans | Subscription management, seat-based pricing, invoices | P2 |
| Org SSO (SAML/OIDC) | Enterprise single sign-on for org members | P3 |
| Org Domain Verification | Verify email domain to auto-claim users as org members (requires email to be linked) | P3 |
| Account Switching | Quick-switch between personal and org accounts without re-logging | P1 |
| Account Linking | Link personal account to an org for unified identity | P2 |

### 2.2 User System & Auth

> **Core principle:** Identity is device-bound. No email or phone number is required. Authentication is a signed cryptographic challenge — the device holds the private key, the server only ever sees the public key.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Device-Bound Identity** | On account creation, the client generates an Ed25519 key pair; the private key never leaves the device, the server stores only the public key + device fingerprint | P0 |
| **Signed Challenge Auth** | Login = server sends a random nonce, client signs it with the private key, server verifies against stored public key — no passwords sent over the wire | P0 |
| **Proof-of-Work Account Creation** | Client must find a nonce where `SHA-256(account_public_key + nonce)` starts with a configurable difficulty prefix (e.g. `000000`) before the server accepts registration — makes mass bot creation computationally expensive | P0 |
| **No Email / Phone Required** | Accounts are fully functional without providing email or phone; these can be optionally added later for recovery or notifications | P0 |
| Optional Email Binding | Users can optionally link an email for recovery notifications, login alerts, and account data export | P2 |
| Optional Phone Binding | Users can optionally link a phone number for SMS-based recovery or push notifications | P3 |
| Username Selection | User picks a unique username at account creation (no email-based identity) | P0 |
| Session Management | View all active signed-in sessions with device, location, and last-active time | P0 |
| Revoke Single Session | Log out a specific session from the session list | P0 |
| Revoke All Other Sessions | One-click "log out everywhere else" — keeps only the current session | P0 |
| Current Session Indicator | Clearly mark which session you're currently using in the list | P0 |
| Session Details | Show per-session: device type (desktop/mobile/web), OS, browser/app version, IP, city/country (GeoIP), first sign-in time, last active time | P1 |
| Session Expiry | Auto-expire sessions after configurable inactivity period (7d, 30d, 90d) | P1 |
| Login Notifications | Push notification to all paired devices on login from a new device | P1 |
| Device Fingerprint Trust Scores | Score each device/session based on fingerprint consistency, login history, and behavior — flag anomalies | P1 |
| Trusted Fingerprint Auto-Approve | Devices with a high trust score can skip additional verification (configurable threshold) | P2 |
| Fingerprint Anomaly Alerts | Notify user when a login attempt comes from a low-trust or unrecognized fingerprint | P1 |
| **TOTP 2FA (Optional)** | Time-based one-time password as an additional layer — not required for base auth but available for high-security users | P1 |
| **Hardware Security Keys** | WebAuthn/FIDO2 support for phishing-resistant additional auth (YubiKey, Titan, etc.) | P1 |
| Multiple Auth Methods | Users can register multiple methods simultaneously (device key + TOTP + hardware key + backup codes) | P1 |
| Auth Method Management | Add, remove, rename registered auth methods from account settings | P1 |
| Auth Challenge on Sensitive Actions | Require re-authentication (sign challenge or TOTP) for server deletion, key rotation, account deletion | P1 |
| Account Deletion | Self-service account removal with grace period and data cleanup — requires auth challenge | P2 |
| Account Data Export | Download all personal data (GDPR-style) | P3 |

#### Device-Bound Identity — How It Works

**Account Creation Flow:**

```
Client                                  Server
  │                                       │
  │  1. Generate Ed25519 key pair         │
  │     (private_key stays on device)     │
  │                                       │
  │  2. Proof-of-Work:                    │
  │     Find nonce where                  │
  │     SHA-256(public_key + nonce)        │
  │     starts with "000000"              │
  │     (may take seconds to minutes      │
  │      depending on difficulty)          │
  │                                       │
  ├── Send: public_key + nonce ──────────>│  3. Verify PoW:
  │         + device fingerprint          │     SHA-256(pub_key + nonce)
  │         + chosen username             │     starts with required prefix?
  │                                       │
  │                                       │  4. Store: public_key,
  │                                       │     device_fingerprint,
  │                                       │     username, pow_nonce
  │                                       │
  │<──────── account_id + session ────────┤  5. Account created
```

**Authentication Flow (Signed Challenge):**

```
Client                                  Server
  │                                       │
  ├── Request login (account_id) ────────>│
  │                                       │  1. Generate random nonce
  │                                       │     (32 bytes, single-use,
  │                                       │      expires in 60s)
  │<──────── challenge nonce ─────────────┤
  │                                       │
  │  2. Sign nonce with private key       │
  │     signature = Ed25519.sign(         │
  │       nonce, private_key)             │
  │                                       │
  ├── Send: signature + device_fp ───────>│  3. Verify signature against
  │                                       │     stored public key
  │                                       │  4. Verify device fingerprint
  │                                       │     matches or is new (flag)
  │                                       │
  │<──────── session token ───────────────┤  5. Authenticated
```

**Proof-of-Work Difficulty:**
- Default prefix: `000000` (6 hex zeros = ~16.7 million hashes average)
- Adjustable server-side based on abuse levels — can increase to `0000000` during attacks
- Client shows progress indicator: "Generating identity... this may take a moment"
- PoW result is validated once at creation and stored — never repeated for login
- Prevents mass bot registration: creating 1000 accounts requires ~16.7 billion hashes total

#### Device Pairing & Multi-Device Access

Since the private key lives on the device, adding a new device requires explicit pairing from an existing device. **Multi-device is treated as the primary defense against account loss** — the onboarding flow actively pushes users toward pairing a second device before they can dismiss the prompt.

**Onboarding Push:**
- After account creation, a persistent banner reads: "Pair a second device to protect your account. If you lose this device and your recovery key, your account is permanently unrecoverable."
- Banner is dismissable but reappears on every launch for the first 7 days or until a second device is paired
- The recovery key confirmation step (below) is mandatory and cannot be skipped

**Pairing Methods:**

| Method | Flow | Priority |
|--------|------|----------|
| **QR Code Pairing** | Existing device displays a QR code containing an encrypted pairing payload; new device scans it, receives and stores the account key (or generates its own key pair and registers it) | P0 |
| **Pair Code** | Existing device generates a short-lived alphanumeric code (e.g. `BURROW-K9X3-M7PL`); enter it on the new device within 5 minutes to pair | P0 |
| **WebAuthn Pairing** | If user has a hardware security key registered, they can authenticate the new device by tapping the key | P1 |
| **Recovery Key Pairing** | User enters their recovery key on the new device — **triggers a notification to ALL currently signed-in devices** warning of recovery key use | P1 |
| **Social Recovery** | User initiates a recovery request; M-of-N designated guardians approve; server generates a temporary recovery token after threshold is met (see Social Recovery below) | P1 |

**Pairing Security:**
- Pairing payload is encrypted with a one-time key derived from the pair code/QR content
- The new device generates its own Ed25519 key pair; the existing device signs the new public key and registers it server-side
- Each device has its own key pair — revoking a device only removes that device's public key
- No single "master key" that compromises all devices

**Recovery Key:**
- Generated at account creation — a 24-word mnemonic (BIP-39 style) or a 32-byte hex key
- **Mandatory confirmation step** — user is shown the 24 words, then asked to enter 3 randomly selected words (e.g. "Enter word 5, word 12, and word 21") before proceeding. Cannot be skipped or deferred.
- Derives a recovery key pair capable of authorizing new device registrations
- Must be stored offline by the user (written down, saved in a password manager, etc.)
- Using the recovery key sends a **push notification to every signed-in device**: "Recovery key was used to pair a new device — if this wasn't you, revoke it immediately"
- Recovery key can be regenerated (invalidates old one) — requires auth challenge from a currently paired device
- Recovery key confirmation is re-prompted if user has only a single paired device and no guardians

#### Social Recovery (Guardian-Based)

For users who lose all devices AND their recovery key, social recovery provides a path back through peer trust rather than central authority.

**Setup:**
- User designates 3–5 trusted contacts as "recovery guardians" from their friends list
- Guardian list is encrypted client-side — the server stores only encrypted guardian references; it does not know who the guardians are
- Each guardian receives a notification: "[User] designated you as a recovery guardian. You may be asked to verify their identity if they lose access to their account."
- Guardians can decline or remove themselves at any time
- User can view and manage their guardian list from Settings → Security → Recovery Guardians
- Minimum 3 guardians required to enable social recovery; maximum 5

**Recovery Flow:**

```
Locked-out User                    Server                    Guardians (3-5)
  │                                  │                          │
  ├── Initiate recovery ────────────>│                          │
  │   (username + PoW challenge)     │  1. Verify account       │
  │                                  │     exists, not banned   │
  │                                  │  2. Check guardian count │
  │                                  │     ≥ threshold (M)      │
  │                                  │                          │
  │                                  ├── Notify all guardians ─>│
  │                                  │   "[User] is requesting  │
  │                                  │    account recovery.     │
  │                                  │    Verify their identity │
  │                                  │    outside of Burrow     │
  │                                  │    before approving."    │
  │                                  │                          │
  │                                  │   72-hour approval window│
  │                                  │                          │
  │                                  │<── Guardian approvals ───┤
  │                                  │    (M of N required)     │
  │                                  │                          │
  │                                  │  3. If threshold met:    │
  │                                  │     generate temporary   │
  │                                  │     recovery token       │
  │                                  │     (single-use, 1hr)    │
  │                                  │                          │
  │<── Recovery token ───────────────┤  4. Revoke ALL existing  │
  │                                  │     device keys           │
  │  5. Generate new key pair        │                          │
  │  6. Register new device key ────>│  7. New session created  │
  │                                  │                          │
  │  8. New recovery key generated   │                          │
  │     (mandatory confirmation)     │                          │
```

**Thresholds:**
- Default: M=3 of N=5 (user-configurable: minimum M=2 of N=3)
- If user has fewer than 3 guardians: social recovery is unavailable (enforced at setup)

**Security Constraints:**
- Only the locked-out user can initiate — guardians cannot start a recovery on someone's behalf
- 72-hour approval window — creates time for the real account owner to notice if an impersonation attempt is underway
- All existing paired devices receive a push notification when recovery is initiated: "Someone is attempting to recover your account via social recovery. If this is not you, sign in and cancel immediately."
- If any existing device cancels during the 72h window, recovery is aborted
- PoW challenge required to initiate (prevents spam recovery requests)
- Rate-limited: one recovery attempt per 30 days per account
- On successful recovery: all previous device keys are revoked, new recovery key is generated (forced confirmation), guardian list is preserved
- Guardians see only "User X is requesting recovery" — no key material, no session tokens, no private data is shared with guardians
- Recovery event is logged in the compliance audit log

**Guardian Responsibilities:**
- Guardians should verify the requester's identity through an out-of-band channel (phone call, in-person, video chat) before approving
- The approval UI displays: "Only approve if you have personally verified [User]'s identity. Social recovery is irreversible — all their existing sessions will be terminated."
- Guardians can revoke their approval within the 72h window

#### Community Vouching (Identity Continuity)

For the absolute worst case — all devices lost, recovery key lost, no guardians set up or M-of-N threshold not met — the cryptographic identity is permanently gone. However, the user's **community position** (server memberships, friend connections, roles) can be transferred to a new account through community vouching.

**How It Works:**
- User creates a brand new account (new keypair, new user_id, new PoW)
- From the new account, they submit a "continuity claim" referencing their old username
- The claim is visible to:
  - Server admins/owners of servers the old account belonged to
  - Mutual friends of the old account
- If enough vouchers confirm (server admin for server memberships, mutual friends for friend list), the new account inherits:
  - Server memberships and assigned roles (not owner — ownership requires separate transfer)
  - Friend connections (re-sent as friend requests from the new account, auto-accepted by vouchers)
  - **Not** message history — old messages remain attributed to the old user_id
  - **Not** DM history — encrypted with old keys, unrecoverable
  - **Not** uploaded files — attribution stays with old account

**Vouching Requirements:**
- Server memberships: server owner or admin must vouch
- Friend list: each friend decides individually whether to accept the continuity claim
- Continuity claim expires after 30 days if thresholds are not met
- Old account is marked as "abandoned" (not deleted) — its messages stay, its identity stays, but it cannot be logged into

**Design Intent:**
- This is deliberately a slow, high-friction process — it's the last resort, not a convenience feature
- The new account is a genuinely new identity with a new user_id — it doesn't "become" the old account
- It preserves community relationships while respecting the cryptographic reality that the old key is gone
- It prevents impersonation: server admins and friends act as human verification, not an algorithm

| Recovery Layer | Mechanism | What's Recovered | Priority |
|----------------|-----------|------------------|----------|
| **Layer 1** | Multi-device (pushed at onboarding) | Full account — prevents loss | P0 |
| **Layer 2** | Recovery key (forced confirmation UX) | Full account — prevents loss | P0 |
| **Layer 3** | Social recovery (M-of-N guardians, 72h) | Full account — new device key, old data intact | P1 |
| **Layer 4** | Community vouching (admin/friend verification) | Community position only — new identity | P2 |
| **Layer 5** | Email/phone alerts (notification channel only) | Nothing — detects unauthorized recovery | P2 |

#### TOTP & Hardware Keys (Optional Additional Factors)

**TOTP (Authenticator App)** — Optional
- Not required for base auth, but users can enable as an additional layer
- User scans a QR code or enters a secret key into their authenticator app
- Server stores the shared secret (encrypted at rest)
- When enabled, login requires device signature + TOTP code
- Apps: Google Authenticator, Authy, 1Password, Bitwarden, Microsoft Authenticator

**Static Backup Codes** — Optional
- Generated when TOTP or hardware key is enrolled — set of 10 single-use codes
- Each code is hashed (bcrypt/argon2) before storage; plaintext shown once at generation
- User can regenerate codes at any time (invalidates previous set)
- Each code can only be used once — marked `used_at` on use
- Displayed as 8-character alphanumeric strings, grouped for readability (e.g. `A3K9-W2MX`)

**Hardware Security Keys (WebAuthn / FIDO2)** — Optional
- Supports USB keys (YubiKey 5, Titan Security Key), NFC keys, and platform authenticators (Touch ID, Windows Hello)
- Registration: browser calls `navigator.credentials.create()` → public key stored server-side
- Can serve as a pairing mechanism for new devices
- Users can register multiple keys (e.g. primary YubiKey + backup YubiKey)
- Each key gets a user-defined label ("Blue YubiKey", "Backup key in safe")
- Passkey support for passwordless login (alternative to device-bound key on supported platforms)

### 2.3 Account Customization

| Feature | Description | Priority |
|---------|-------------|----------|
| Username & Discriminator | Unique username, optional numeric tag (user#1234) | P0 |
| Display Name | Global display name, overridable per-server via nickname | P0 |
| Avatar | Upload profile picture (PNG, JPG, GIF for animated) | P0 |
| Avatar Decorations | Animated frames/borders around avatar (cosmetic) | P3 |
| Profile Banner | Upload a banner image for your user card/profile | P1 |
| Profile Bio / About Me | Rich-text section supporting markdown and links | P1 |
| Profile Accent Color | Custom color behind your profile card | P2 |
| Pronouns Field | Optional freeform pronouns displayed on profile | P1 |
| Connected Accounts | Link & display external accounts (GitHub, Twitter/X, Spotify, Steam, etc.) | P2 |
| Profile Badges | System-awarded badges (early adopter, staff, verified bot, server booster, **18+ verified**) | P2 |
| **18+ Verified Badge** | Displayed on profile when a user's age confidence score is above threshold via behavioral signals + optional attestation or appeal confirmation. Visually distinguishes verified-adult users. Badge is **not** granted by self-declaration alone — requires sustained behavioral confidence or successful attestation/appeal. Badge can be revoked if age confidence drops below threshold | P1 |
| Custom Profile Effects | Animated profile backgrounds or effects (premium cosmetic) | P3 |
| Server-Specific Nickname | Different display name per server | P0 |
| Server-Specific Avatar | Different avatar per server | P2 |
| **Server Persona** | Full per-server identity: unique nickname, avatar, bio, and pronoun overrides that only apply within that server — other servers and DMs see the global profile | P1 |
| Server Persona Privacy | Members only see your server persona in that server; mods can view the global identity via mod tools | P1 |

### 2.4 Secure Communication

| Feature | Description | Priority |
|---------|-------------|----------|
| TLS Everywhere | All client-server traffic over TLS 1.3 | P0 |
| Encrypted at Rest | Database, file storage, and backups encrypted at rest (AES-256) | P0 |
| **Zero-Knowledge Message Encryption** | Server-side messages stored encrypted so that even the server operator cannot read them | P0 |
| End-to-End Encrypted DMs | Optional E2EE for DMs using Signal Protocol / Double Ratchet | P1 |
| E2EE for Server Channels | Optional per-channel E2EE — all members hold shared channel keys, server only stores ciphertext | P2 |
| E2EE Key Management | Device-based key generation, key backup, cross-device verification | P1 |
| E2EE Verification | User-to-user safety number / QR code verification | P2 |
| Key Rotation | Automatic key rotation on member join/leave and periodic schedule | P2 |
| Encrypted Voice (SRTP) | All voice/video encrypted via SRTP with DTLS key exchange | P1 |
| Message Expiry / Self-Destruct | Optional auto-delete DMs after configurable time (1h, 24h, 7d) | P2 |
| IP Privacy | Hide user IPs from other users; proxy WebRTC through TURN/SFU | P1 |
| Rate Limiting | API and WebSocket rate limits to prevent abuse | P0 |
| Content Security Policy | Strict CSP headers on web client to prevent XSS | P0 |
| Token Rotation | Short-lived access tokens with refresh token rotation | P1 |
| Secure File Links | Signed/expiring URLs for uploaded content | P1 |
| Encrypted Attachments | Files encrypted client-side before upload; decrypted on download by recipients | P2 |

#### Zero-Knowledge Message Encryption — How It Works

The goal: **even the platform operator (you) cannot read message contents stored in the database.**

**Architecture:**

```
Sender Client                      Server                         Recipient Client
    │                                │                                │
    │  1. Generate per-channel       │                                │
    │     symmetric key (AES-256)    │                                │
    │     on channel creation        │                                │
    │                                │                                │
    │  2. Encrypt message content    │                                │
    │     with channel key           │                                │
    │     ┌────────────────────┐     │                                │
    │     │ plaintext → AES    │     │                                │
    │     │ → ciphertext + IV  │     │                                │
    │     └────────────────────┘     │                                │
    │                                │                                │
    ├── Send ciphertext + IV ───────>│  3. Store ciphertext + IV      │
    │                                │     (server NEVER sees          │
    │                                │      plaintext)                │
    │                                │                                │
    │                                ├── Deliver ciphertext + IV ────>│
    │                                │                                │
    │                                │  4. Recipient decrypts with    │
    │                                │     same channel key           │
    │                                │     ┌────────────────────┐     │
    │                                │     │ ciphertext → AES   │     │
    │                                │     │ → plaintext        │     │
    │                                │     └────────────────────┘     │
```

**Key Distribution:**
- Each channel has a **channel key** (AES-256-GCM symmetric key)
- The channel key is encrypted per-member using each member's **public key** (X25519) and stored in a `channel_key_shares` table
- When a user joins a channel, an existing member (or the server creator) encrypts the channel key with the new member's public key
- When a member leaves, the channel key is **rotated** — a new key is generated and re-distributed to all remaining members
- Messages sent before key rotation remain encrypted with the old key (forward secrecy)

**What the server stores:**
- `messages.content_ciphertext` — encrypted blob (unreadable without key)
- `messages.content_iv` — initialization vector used for encryption
- `messages.encryption_version` — which key generation was used
- `channel_key_shares` — per-user encrypted copies of the channel key
- The server **never** stores plaintext message content or decrypted keys

**Tradeoffs & Notes:**
- Server-side full-text search is not possible on encrypted content — search must happen client-side on decrypted messages or via encrypted search indexes (P3)
- Link previews, embeds, and bot processing require client-side generation or opt-in decryption proxies
- Metadata (who sent a message, when, to which channel) is still visible to the server — only content is encrypted
- Channel key backup is tied to the user's device keys; losing all devices without a key backup means losing access to old messages

### 2.5 Servers & Channels

| Feature | Description | Priority |
|---------|-------------|----------|
| Create Server | Create a new community server with name/icon | P0 |
| Server Invite Links | Generate shareable invite links (with optional expiry/max uses) | P0 |
| Vanity Invite URL | Custom invite slug (e.g. burrow.gg/cool-server) | P2 |
| Join / Leave Server | Users can join via invite or leave at will | P0 |
| Server Discovery | Public server listing with search, tags, and categories — **restricted to Tier 3+ trust** (invite-only for lower tiers) | P2 |
| Server Settings | Name, icon, banner, description, region, default notifications | P1 |
| Server Boost | Members can boost for perks (higher upload limits, more emoji slots, better audio) | P3 |
| Channel Categories | Organize channels into collapsible groups | P0 |
| Channel Reordering | Drag-and-drop channels and categories | P0 |
| Thread Support | Spawn threaded conversations from any message | P1 |
| Archived Channels | Read-only archive of inactive channels | P2 |
| Server Templates | Create/apply server templates for fast setup | P3 |
| Server Folders | Group multiple servers into collapsible sidebar folders | P1 |
| **Delete Server** | Permanently delete a server and all its data — **requires auth challenge** (signed challenge, TOTP, hardware key, or whatever method the user has enrolled) | P0 |
| Delete Server Confirmation | Multi-step confirmation: type server name + auth challenge + 72-hour grace period with undo link (push notification to all paired devices) | P0 |
| Transfer Ownership Before Delete | Prompt to transfer ownership to another member instead of deleting; block delete if org-owned and other admins exist without explicit confirmation | P1 |
| **Server Export** | Export full server structure as a portable archive (JSON): channels, categories, roles, permissions, settings, emoji, AutoMod rules — excludes messages and member data by default; opt-in message export for server owner | P2 |
| **Server Backup** | Create a restorable server snapshot: full structure + optionally messages and member roles; stored encrypted; configurable auto-backup schedule (daily/weekly/monthly); max 3 retained backups | P2 |
| Restore from Backup | Restore a server from a backup snapshot — creates a new server with the backed-up structure; messages restored if included; members must rejoin via invite | P2 |

### 2.6 Channel Types

Channels are **typed containers for content**, not just message logs. Each channel type defines what content items it holds, how they're displayed, and what interactions are available. See [Content Blocks Architecture](#235-content-blocks-architecture) for the underlying data model.

| Type | Description | Priority |
|------|-------------|----------|
| Text Channel | Standard persistent chat — holds `ChatMessage` content items. Linear timeline with replies, reactions, threads | P0 |
| Voice Channel | Real-time audio room, optionally with video/streaming | P0 |
| Announcement Channel | Broadcast-only channel — only designated roles can post; other servers can follow | P1 |
| Stage Channel | Speaker/audience model for panels, AMAs, podcasts | P2 |
| **Forum Channel** | Thread-first channel — each post creates a `ForumThread` with title, body, tags, and a comment timeline. Supports **tags** (admin-defined, filterable), **solved markers** (author or mod marks a reply as the accepted answer), **sort modes** (latest activity, creation date, most replies, unsolved first). New posts require a title. Pinned/featured threads float to the top | P1 |
| **Gallery Channel** | Grid-view channel for `GalleryPost` items — each post is an image or video (or album) with title, description, and tags. Posts display in a responsive grid; clicking opens a lightbox with a **comment thread** underneath. Supports drag-to-reorder (mods), filtering by tag, and NSFW spoiler per-post | P1 |
| **Status Channel** | Displays `GameServerStatus` items — live data from game servers or external APIs rendered as status cards with auto-refresh. Shows server name, player count, map, latency, online/offline badge. Supports **uptime dashboards** (historical uptime %, response time graphs). Read-only for members; data pushed via bot/webhook/integration | P2 |
| **Events Channel** | Displays `Event` items — upcoming raids, tournaments, meetups, streams. Each event has title, description, start/end time, timezone, max participants, RSVP list, and recurrence rules. Shows a calendar or timeline view. Reminder notifications for RSVPed users. Past events auto-archive but remain visible | P2 |
| **File Repository Channel** | Displays `FileAsset` items — versioned file downloads organized in a list/table view. Each asset has a title, description, current version, download count, and a version history with changelogs. Supports categories/tags for organization. Upload permissions gated by role | P2 |
| **Temporary Squad Voice** | User-created ephemeral voice + text channel pair. Any member with `Create Squad` permission clicks "Create Squad" → Burrow creates a voice channel (`Squad - {username}`) and paired text channel (`squad-{username}`) under a designated Squad Rooms category. **Auto-deletes both channels when the voice channel is empty for 60 seconds.** Creator can rename, set user limit, and lock. Max active squads per user: 1. Max squads per server: configurable (default 10) | P2 |
| Rules / Welcome Channel | System channel for rules acceptance and welcome messages | P1 |
| AFK Voice Channel | Designated channel for idle users to be moved to — **no voice data is transmitted or received** in AFK channels (silent parking; client disconnects from the media session but stays "in" the channel for presence purposes) | P1 |

### 2.7 Text Channel Settings

| Setting | Description | Priority |
|---------|-------------|----------|
| Channel Name | Lowercase, hyphenated name (e.g. #general-chat) | P0 |
| Channel Topic | Editable description displayed at the top of the channel | P0 |
| Slow Mode Interval | Rate-limit per user: off, 5s, 10s, 15s, 30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h, 2h, 6h | P1 |
| NSFW Flag | Age-gated content wall before viewing | P1 |
| Default Thread Auto-Archive | Threads auto-archive after: 1h, 24h, 3d, 7d | P2 |
| Message Retention | Auto-delete messages older than X days (org/premium feature) | P3 |
| Pinned Message Limit | Max pinned messages (default 50) | P2 |
| Default Sort Order | Latest message vs. creation date (for forum channels) | P2 |
| Allowed Media Types | Restrict to text-only, images-only, or all attachments | P2 |
| Channel Permissions | Per-channel role/user overrides (view, send, attach, react, manage) | P1 |
| Webhook Integrations | Attached inbound webhooks for automated posting | P2 |
| Read-Only / Locked | Lock channel so only specific roles can send | P1 |

### 2.8 Voice Channel Settings

| Setting | Description | Priority |
|---------|-------------|----------|
| Channel Name | Display name of the voice channel | P0 |
| User Limit | Max participants: unlimited or 1–99 | P1 |
| Audio Bitrate | Quality setting: 8, 16, 32, 64, 96, 128, 256, 384 kbps (higher tiers for boosted servers) | P1 |
| Video Quality Cap | Max resolution: 720p, 1080p, 1440p, 4K (tier-gated) | P2 |
| Region Override | Force a specific media server region for latency optimization | P2 |
| AFK Timeout | Move idle users to AFK channel after: 1m, 5m, 15m, 30m, 1h | P1 |
| AFK Target Channel | Which channel idle users get moved to | P1 |
| AFK Channel Behavior | AFK channels transmit **zero voice data** — no audio send/receive; client tears down the media connection but retains channel membership for presence display | P1 |
| Voice Activity vs PTT Default | Default input mode for the channel | P2 |
| Noise Suppression Default | Auto-enable noise suppression when joining this channel | P2 |
| Camera Allowed | Toggle whether webcam video is permitted in this channel | P1 |
| Streaming Allowed | Toggle whether screen share / Go Live is permitted | P1 |
| Channel Permissions | Per-channel role/user overrides (connect, speak, stream, mute others, move others) | P1 |
| Priority Speaker | Designated role whose audio auto-lowers others (ducking) | P2 |
| Soundboard Access | Allow/deny soundboard usage in this channel | P3 |

### 2.9 Text Communication

| Feature | Description | Priority |
|---------|-------------|----------|
| Send Messages | Rich-text messages in channels and DMs | P0 |
| Edit / Delete Messages | Author can edit or delete their own messages. **Edits overwrite the displayed content but preserve a full edit history** — previous versions are stored with timestamps. Users can view edit history via a "(edited)" indicator. The original message is never lost | P0 |
| Markdown Support | Bold, italic, code blocks, lists, headings | P0 |
| Emoji & Custom Emoji | Unicode emoji picker + server-uploaded custom emoji | P1 |
| Reactions | React to messages with emoji | P1 |
| Reply / Quote | Reply to a specific message with context | P0 |
| Mentions | @user, @role, @everyone, @here with notifications | P0 |
| Pin Messages | Pin important messages in a channel | P1 |
| Message History | Infinite scroll with lazy loading of older messages | P0 |
| Typing Indicators | Show "User is typing..." in real-time | P1 |
| Read Receipts / Unread | Track last-read position, unread indicators | P1 |
| Link Previews | Auto-generate URL previews (OpenGraph embeds) | P2 |
| Message Search | Full-text search across channels you have access to | P1 |
| Code Syntax Highlighting | Fenced code blocks with language-specific highlighting | P2 |
| **Offline Message Queue** | Messages composed while offline are queued locally and sent automatically when connectivity is restored; pending messages shown with a "sending..." indicator | P1 |
| **Message History Export** | Export entire channel or DM message history as JSON, CSV, or HTML archive; supports date range and per-channel/all-channel scope | P2 |
| Optimistic Send | Messages appear instantly in the UI before server acknowledgement; rollback on failure | P1 |
| **Message Bookmarking** | Users can bookmark any message to a personal saved-messages collection; organized by server/channel with search and tags | P1 |
| **Visible Message IDs** | Every message has a unique snowflake ID; visible in developer mode and copyable from context menu; used for deep-linking, API references, and search | P0 |
| **BBCode Support** | Full BBCode markup alongside markdown: `[b]`, `[i]`, `[u]`, `[s]`, `[color]`, `[size]`, `[url]`, `[img]`, `[quote]`, `[spoiler]`, `[code]` — rendered in the message display | P2 |
| **Structured Embeds (User)** | Users can compose rich embeds inline: title, description, color bar, fields, thumbnail, footer — via a compose UI or markup syntax | P2 |
| **Message Scheduling** | Compose a message and schedule it to send at a future date/time; shows in a "Scheduled" tab; editable/cancelable before send time; per-channel schedule queue | P2 |

### 2.10 Voice Communication

| Feature | Description | Priority |
|---------|-------------|----------|
| Join / Leave Voice | Connect to voice channels with one click | P0 |
| Real-time Voice (WebRTC) | Low-latency peer-to-peer or SFU-based audio | P0 |
| Mute / Deafen | Self-mute and self-deafen toggles | P0 |
| Server Mute / Deafen | Moderators can mute/deafen other users | P1 |
| Push-to-Talk | Optional PTT mode with configurable keybind | P1 |
| Voice Activity Detection | Auto-detect when user is speaking | P0 |
| Voice Channel User List | Show who's in each voice channel in the sidebar | P0 |
| Audio Input/Output Selection | Choose microphone and speaker devices | P1 |
| Noise Suppression | Background noise reduction (RNNoise or similar) | P2 |
| Volume Per User | Adjust individual user volumes in a voice channel | P2 |
| Voice Channel Limits | Set max participants per voice channel | P2 |
| Disconnect Idle Users | Auto-disconnect after configurable AFK timeout | P2 |
| **P2P Preferred for Small Calls** | Use direct WebRTC peer-to-peer mesh for ≤4 users; auto-escalate to SFU when more join | P1 |
| **Ultra-Low Latency Mode** | Opus codec tuned for real-time voice: 10–20ms frame size, minimal jitter buffer, FEC enabled | P1 |
| Adaptive Jitter Buffer | Dynamically adjust jitter buffer depth based on network conditions | P2 |
| Codec Selection | Prefer Opus; fallback negotiation for constrained clients | P2 |
| Network Quality Indicator | Show per-user connection quality (latency, packet loss, jitter) in voice overlay | P2 |
| Echo Cancellation | Automatic acoustic echo cancellation (AEC) | P1 |
| Automatic Gain Control | Normalize microphone levels across users | P2 |
| **Voice Recording Permission** | Per-channel permission bit controlling whether recording/capture of voice audio is permitted; when disabled, client blocks local recording APIs; recording indicator shown to all participants when any user is recording | P1 |
| **Recording Indicator** | Visible icon and notification to all channel members when someone is recording the voice channel | P0 |

### 2.11 Video & Streaming

| Feature | Description | Priority |
|---------|-------------|----------|
| Webcam Video | Toggle camera on/off in voice channels | P1 |
| Screen Share | Share entire screen or specific window | P1 |
| Application Streaming | Stream a specific app/game to the channel | P1 |
| Go Live (Stream to Channel) | One-to-many broadcast in a voice channel | P1 |
| Stream Viewer List | See who is watching your stream | P2 |
| Stream Quality Settings | Resolution (720p/1080p/1440p), framerate (15/30/60fps), bitrate cap | P2 |
| Picture-in-Picture | Detachable mini-player for streams/video | P2 |
| Stream Audio | Capture and transmit application audio with stream | P2 |
| Stream Latency Mode | Normal vs. low-latency mode for interactive streams | P3 |
| **Adaptive Bitrate Streaming** | SFU dynamically adjusts resolution/bitrate per viewer based on their bandwidth/CPU — simulcast with multiple quality layers | P1 |
| Simulcast Layers | Streamer encodes 2–3 quality tiers (e.g. 360p/720p/1080p); SFU forwards the best match per viewer | P2 |
| Viewer Quality Selector | Viewers can manually override auto quality: Auto, Source, 1080p, 720p, 480p, 360p | P2 |
| Stream Stats Overlay | Real-time overlay for streamer: FPS, bitrate, encoder load, viewer count, dropped frames | P3 |
| **Multi-Stream Viewing** | View multiple streams simultaneously in a grid/mosaic layout; resize/rearrange tiles; audio mixing with per-stream volume | P2 |
| **Stream Thumbnail Preview** | Hover over a stream in the channel list to see a live thumbnail preview before joining | P3 |

### 2.12 Direct Messages & Group DMs

| Feature | Description | Priority |
|---------|-------------|----------|
| 1-on-1 DMs | Private text conversations between two users | P0 |
| Group DMs | Private group conversations (up to ~10 users) | P1 |
| DM Voice / Video Calls | Start a call directly from a DM | P1 |
| DM Voice Auto-Drop | If a voice/video DM call has only one participant remaining, auto-disconnect after **5 minutes** of being alone (countdown toast shown to the remaining user) | P1 |
| Block User | Block users from DMing you | P0 |
| DM Spam Protection | Limit DMs from unknown users, server-member-only option | P2 |
| Message Requests | Pending DMs from non-friends require approval | P2 |
| E2EE DMs | Optional end-to-end encryption per conversation | P2 |
| Self-Destructing Messages | Auto-delete messages after a set time (opt-in per convo) | P2 |

### 2.13 Friends System

| Feature | Description | Priority |
|---------|-------------|----------|
| Send Friend Request | Request friendship by username | P1 |
| Accept / Decline / Cancel | Manage incoming and outgoing requests | P1 |
| Friends List | View all friends with online/offline status | P1 |
| Remove Friend | Unfriend users | P1 |
| Mutual Friends | See shared friends on profile | P2 |
| Mutual Servers | See shared servers on profile | P2 |

### 2.14 Roles & Permissions

| Feature | Description | Priority |
|---------|-------------|----------|
| Create / Edit Roles | Named roles with color, icon, and permission set | P0 |
| Delete Roles | Remove a role and strip it from all members | P0 |
| Role Hierarchy | Higher-positioned roles override lower ones; users can only manage roles below their highest role | P0 |
| Assign Roles to Users | Server admins assign/remove roles to members (single or bulk) | P0 |
| @everyone Default Role | Base permissions for all members — always exists, cannot be deleted | P0 |
| Server Owner | Irrevocable owner with all permissions, immune to all moderation actions | P0 |
| Transfer Ownership | Owner can transfer to another member (requires 2FA confirmation) | P1 |
| Role Colors | Display username in highest role color throughout the UI | P1 |
| Role Icons | Custom emoji or uploaded image displayed next to role name | P2 |
| Hoisted Roles | Separate role groups in the member sidebar with headings | P1 |
| Mentionable Roles | Toggle whether a role can be @mentioned by non-admins | P1 |
| Role Limit | Maximum roles per server (e.g. 250) | P2 |
| Channel Overrides | Per-channel allow/deny for specific roles or individual users | P1 |
| Category Overrides | Per-category overrides that cascade to child channels (unless channel has its own override) | P1 |
| Permission Calculator | UI tool showing effective permissions for a user in a specific channel (combining role + overrides) | P2 |
| Default Channel Permissions | New channels inherit the category's permission overrides automatically | P1 |
| Role Templates | Pre-built role templates (Moderator, Helper, VIP, Muted) for quick server setup | P3 |
| **Role Identity Display** | Member's username displays in their highest role's color throughout the server; role icon shown next to name in member list and message headers | P0 |
| **Invite Permission** | Granular control over which roles can create invite links, with per-role limits on max active invites and expiration constraints | P1 |
| **Join Verification Gate** | Per-server setting: new members land in a restricted state until they complete a configurable verification step (rules acceptance, minimum trust tier, account age, role-specific challenges) | P1 |
| **Quarantine Role Auto-Assign** | Automatically assign a restricted "unverified" role on join; members gain full access only after passing the verification gate | P1 |

#### Granular Permissions — Full List

**General Server Permissions:**
| Permission | Description |
|------------|-------------|
| View Channels | See channels and read messages |
| Manage Channels | Create, edit, delete, reorder channels and categories |
| Manage Roles | Create, edit, delete, assign roles below this role's position |
| Manage Emoji & Stickers | Upload, rename, delete custom server emoji |
| View Audit Log | Access the server audit log |
| Manage Webhooks | Create, edit, delete webhooks |
| Manage Server | Edit server name, icon, banner, region, and settings |
| Create Invite | Generate invite links to the server |
| Change Nickname | Change own nickname |
| Manage Nicknames | Change other members' nicknames |
| Kick Members | Remove members from the server |
| Ban Members | Permanently ban members |
| Timeout Members | Temporarily mute members for a duration |
| Administrator | Bypass all permission checks — full access to everything |

**Text Channel Permissions:**
| Permission | Description |
|------------|-------------|
| Send Messages | Post messages in text channels |
| Send Messages in Threads | Post in threads |
| Create Public Threads | Start new public threads |
| Create Private Threads | Start threads only visible to thread members |
| Embed Links | Auto-embed URLs and send rich embeds |
| Attach Files | Upload files and images |
| Add Reactions | Add emoji reactions to messages |
| Use External Emoji | Use emoji from other servers |
| Mention @everyone / @here / @roles | Use mass-mention pings |
| Manage Messages | Delete others' messages, pin/unpin, remove embeds |
| Manage Threads | Archive, unarchive, delete, rename threads |
| Read Message History | View messages sent before joining the channel |
| Send TTS Messages | Send text-to-speech messages |
| Use Application Commands | Use bot slash commands and context menus |

**Voice Channel Permissions:**
| Permission | Description |
|------------|-------------|
| Connect | Join voice channels |
| Speak | Transmit audio in voice channels |
| Stream | Share screen or Go Live in voice channels |
| Use Camera | Toggle webcam video |
| Use Voice Activity | Use voice activity detection (vs. forced push-to-talk) |
| Priority Speaker | Audio auto-ducks other speakers when you talk |
| Mute Members | Server-mute other users in voice |
| Deafen Members | Server-deafen other users in voice |
| Move Members | Drag users between voice channels |
| Use Soundboard | Play soundboard clips in voice |
| Use External Sounds | Use soundboard clips from other servers |

#### Permission Resolution Order

```
1. Server Owner    → always ALL permissions, cannot be overridden
2. Administrator   → grants all permissions, bypasses channel overrides
3. Role Permissions → union (OR) of all assigned roles' permission bitfields
4. Channel Denies  → explicit deny on any of the user's roles
5. Channel Allows  → explicit allow on any of the user's roles
6. User-Specific Channel Override → per-user allow/deny (highest priority after owner/admin)

Final = (base_role_permissions | channel_allows) & ~channel_denies | user_override_allows & ~user_override_denies
```

### 2.15 Notifications

| Feature | Description | Priority |
|---------|-------------|----------|
| Push Notifications | Mobile/desktop push for mentions and DMs | P0 |
| In-App Notification Badge | Unread counts on servers, channels, DMs | P0 |
| Notification Settings | Per-server and per-channel: all, mentions, nothing | P1 |
| Mention Notifications | Always notify on @mention even if channel is muted | P0 |
| Do Not Disturb | Suppress all notifications | P1 |
| Desktop Notification Sounds | Configurable notification sounds | P2 |
| Mobile Push Preferences | Separate push config for mobile | P2 |
| **Quiet Hours / Schedule** | Set a daily time range (e.g. 11PM–8AM) during which all notifications are silenced; configurable per day-of-week; override for urgent mentions | P1 |
| **Keyword Notifications** | Custom keyword list: get notified whenever any of your keywords appear in any server you're in, even if the channel is muted | P1 |
| **Desktop Alert Style** | Choose between system toast, in-app banner, or both; configure auto-dismiss duration | P2 |
| **Mobile Push Grouping** | Group push notifications by server/channel to reduce notification noise | P2 |
| **Notification Coalescing** | During high activity, push notifications are **coalesced** server-side before delivery. Instead of sending 50 individual pushes for 50 messages in #general, the server batches them into a single push: "50 new messages in #general". Coalescing window: **10 seconds** for mobile push, **5 seconds** for desktop toast. Mentions always break out of coalescing and are delivered immediately as individual notifications. Configurable per-user: off (instant), short (5s), normal (10s), aggressive (30s) | P1 |
| **Notification Log** | Scrollable notification history panel with mark-all-read and per-notification actions (jump to message, dismiss) | P2 |

### 2.16 User Presence & Activity

| Feature | Description | Priority |
|---------|-------------|----------|
| Online / Idle / DND / Offline | Automatic and manual status indicators | P0 |
| Custom Status | User-set status message with optional emoji and expiry | P1 |
| Idle Detection | Auto-switch to idle after configurable inactivity timeout | P1 |
| Invisible Mode | Appear offline while still using the app | P1 |
| **Game Activity Detection** | Detect running games/apps on desktop client and display "Playing X" | P1 |
| Game Activity Library | Maintain a library of recognized game executables for auto-detection | P2 |
| Custom Game Activity | Manually set a "Playing", "Watching", "Listening to", or "Competing in" status | P1 |
| Rich Presence | App-provided detail: game state, party size, elapsed time, artwork, join button | P2 |
| Spotify / Music Integration | Show currently playing track with album art, artist, progress bar | P2 |
| Streaming Status | Auto-switch to "Streaming" status when Go Live or linked Twitch stream is active | P2 |
| Activity Privacy | Per-activity toggle to hide specific games/apps from status | P2 |
| Activity Feed | Server or friends feed showing recent activity (started playing, achievements) | P3 |
| **Topology Heat Map** | Colored concentric rings around topology nodes showing server activity intensity. Six layers (bottom = most prominent): overall activity (amber), voice users non-AFK (violet), friend activity (teal), friends in voice (moss), new members (flame), reactions (beige). Each layer's alpha = metric / max across all visible servers. Networks aggregate from contained burrows | P1 |
| **Topology Filter Dropdown** | Toggle button in top-left of topology view with checklist for: favorites visibility, individual activity layers. Persisted to localStorage. Hidden in fullscreen panel mode | P1 |
| **Activity Snapshots** | Backend records periodic activity snapshots per server (message count, voice users, active users, reaction count, new members). Aggregated over 30-minute rolling window for topology heat map API | P1 |

### 2.17 Media & File Sharing

| Feature | Description | Priority |
|---------|-------------|----------|
| File Upload | Upload files in text channels and DMs | P0 |
| Image Preview | Inline image/GIF rendering with lightbox | P0 |
| Video Preview | Inline video player for uploaded video files | P1 |
| Audio Player | Inline playback for uploaded audio files | P2 |
| File Size Limits | Configurable max upload size (e.g. 25MB free, 100MB boosted) | P1 |
| **File TTL by Size** | Uploads auto-expire based on file size: **≤ 5 MB** — no TTL (permanent); **5–50 MB** — 7-day TTL; **50–500 MB** — 3-day TTL; **500 MB – 5 GB** — 1-day TTL; **5–10 GB** — 6-hour TTL. Users see a countdown badge on expiring files. Expired files are hard-deleted from storage and replaced with a tombstone placeholder in chat | P0 |
| Image / Media CDN | Serve uploaded content via CDN for fast delivery | P1 |
| Tenor / Giphy GIF Picker | Search and post GIFs inline | P2 |
| Spoiler Tags | Hide media/text behind a spoiler click-to-reveal | P2 |
| **JSON File Preview** | Inline collapsible JSON viewer with syntax highlighting and tree navigation | P2 |
| **Log File Preview** | Inline scrollable log viewer with timestamp parsing, level highlighting (INFO/WARN/ERROR), and line filtering | P2 |
| **Code File Preview** | Inline preview for source files (.py, .js, .ts, .ex, .rs, etc.) with syntax highlighting | P2 |
| **CSV / TSV Preview** | Inline table rendering for CSV/TSV files with sortable columns | P3 |
| **PDF Preview** | Inline PDF viewer with page navigation | P2 |
| **Markdown Preview** | Render uploaded .md files as formatted markdown | P2 |
| **Attachment Storage Tiers** | **S3-compatible object storage required in production** (MinIO for local dev). Central network and all federated nodes must use S3 (AWS S3, Cloudflare R2, MinIO, etc.); CDN-fronted with signed expiring URLs; per-user and per-server storage quotas. Private nodes configure their own S3 endpoint and credentials | P0 |
| **Attachment Metadata** | Store and display: filename, MIME type, file size, dimensions (images), duration (audio/video), checksum (SHA-256 for dedup), upload timestamp | P0 |

### 2.18 Moderation & Safety

| Feature | Description | Priority |
|---------|-------------|----------|
| **Kick Members** | Remove a user from the server (they can rejoin via invite) | P0 |
| **Ban Members** | Permanently ban with optional message purge (last 1h, 6h, 12h, 24h, 7d, all) | P0 |
| Unban Members | View ban list and remove bans | P0 |
| Ban with Reason | Attach a reason visible in the audit log and to the banned user | P0 |
| **Timeout / Mute** | Temporarily restrict a member from sending messages, reacting, joining voice (duration: 60s, 5m, 10m, 1h, 1d, 1w, custom) | P1 |
| Warning System | Issue formal warnings to members — tracked in their moderation history | P2 |
| Member Moderation History | View a member's full history: warns, timeouts, kicks, bans, notes | P1 |
| Mod Notes | Private notes on a member visible only to mods (not the member) | P2 |
| **Message Bulk Delete** | Purge messages by count (1–100), by user, by date range, or matching a filter | P1 |
| Delete & Redact | Delete a message and replace with "[message deleted]" tombstone vs. full removal | P2 |
| Lockdown Mode | One-click emergency: revoke send-message from @everyone across all channels | P2 |
| Slowmode Override | Mods exempt from slow mode, or can set per-user slow mode | P2 |
| **Report User** | Users report a member to server mods with reason and optional message attachment | P1 |
| **Report Message** | Users report a specific message — mods see the message content, reporter, and context | P1 |
| Report Queue | Mod-only queue of pending reports with resolve/dismiss actions | P1 |
| **AutoMod: Spam Filter** | Detect and block rapid-fire messages, duplicate content, excessive mentions/emoji | P1 |
| **AutoMod: Word Filter** | Block or flag messages containing prohibited words/regex patterns (server-configured) | P1 |
| **AutoMod: Link Filter** | Block all links, whitelist specific domains, or blacklist specific domains | P2 |
| AutoMod: Invite Filter | Block Discord/Burrow invite links from non-mods | P2 |
| AutoMod: Caps Filter | Flag or block messages that are excessively ALL-CAPS | P3 |
| AutoMod: New Account Filter | Auto-flag or restrict accounts younger than X days | P2 |
| AutoMod Actions | Configurable action per rule: delete message, timeout user, alert mods, log only | P1 |
| AutoMod Bypass Roles | Designate roles exempt from AutoMod checks | P1 |
| **Verification Levels** | Gate joining/chatting: None, Verified Email, Account Age >5m, Server Member >10m, Verified Phone | P2 |
| Quarantine / Jail Role | Auto-assign a restricted role to new joins until they pass verification | P2 |
| **Timed Bans** | Ban a member for a specific duration (1h, 6h, 12h, 1d, 3d, 7d, 30d, custom) — auto-unban after expiry; permanent ban still available | P1 |
| **Raid Protection** | Automatic detection of raid patterns (many joins in short window from new/low-trust accounts); configurable auto-response: lockdown, auto-kick new joins, raise verification level, alert mods | P1 |
| **Anti-Raid Auto-Actions** | When raid detected: pause invite links, restrict Tier 0–1 accounts to read-only, enable slow mode server-wide, send mod alert | P1 |
| **Raid Log** | Timestamped log of detected raid events: trigger (X joins in Y seconds), accounts involved, actions taken, duration | P2 |
| **Role-Based Mod Powers** | Moderation actions (kick/ban/timeout/warn) scoped by role hierarchy — mods can only act on members whose highest role is below theirs; actions on same-tier or higher members blocked | P0 |
| **Platform-Level Reports** | Users can report a server to platform admins (not just server mods) for TOS violations; separate review queue from server reports | P1 |
| **User-to-Platform Report** | Report a user directly to platform trust & safety, independent of any server context (e.g. DM abuse, cross-server harassment) | P1 |
| **Report Suspected Underage User** | Any user can report another user as suspected underage (under 13 or under 18 in NSFW contexts). Report includes reason and optional evidence. Triggers an elevated-priority T&S review of the reported account's behavioral age confidence score, attestation history, and activity patterns. Reporter identity is never disclosed to the reported user. False/malicious reports are tracked and penalize the reporter's trust score | P1 |
| **Content/Media Report** | Report an uploaded file (image, video, document) directly — triggers platform review, content quarantine, and optional legal reporting hook. Reports include file hash, uploader, channel, and timestamp | P0 |
| **Legal Reporting Hooks** | Platform can forward flagged content reports to external legal/compliance endpoints (e.g., NCMEC CyberTipline for CSAM via Cloudflare, law enforcement request pipeline). Automated hooks for content matching known illegal material hashes | P0 |
| **Server-Level Takedown** | Platform trust & safety can issue server-wide takedowns if illegal content is found — suspends the server, preserves evidence (messages + files frozen), notifies the server owner with reason, and escalates to legal if required. Takedown audit trail is immutable | P0 |
| **Content Preservation for Legal** | When content is reported or flagged, a forensic snapshot (file, metadata, context messages, reporter info, timestamps) is preserved in a tamper-evident store even if the uploader deletes the original | P1 |
| **Configurable Server Rules** | Server admins define custom rules (rich text, numbered list) shown to members on join and accessible anytime. Rules can be versioned — members re-prompted to accept on rule changes. Accepting rules is logged for moderation purposes | P1 |
| **Server Analytics** | Server admins can view analytics dashboards: messages per day, messages per channel, active members, peak hours, upload volume, new joins vs. leaves, top channels by activity. Data retained for 90 days; no individual user tracking | P2 |
| **Per-Channel Analytics** | Per-channel breakdown: message count, unique posters, average response time, media vs. text ratio, slow mode trigger rate | P3 |

#### Server Audit Log — Full Specification

A comprehensive, immutable, paginated log of every administrative and moderator action in the server. Includes a **public transparency view** for regular members and a **full admin view** for privileged roles — git-style commit history for all server governance.

**Audit Log — Dual View Model:**

| View | Audience | What's Shown |
|------|----------|--------------|
| **Public Transparency Log** | All server members | Anonymized actor (shows role, not username), target user, action taken, timestamp, and any public note |
| **Full Admin Log** | Roles with `View Audit Log` permission | Everything: actor identity, target, action, reason, before/after diff, IP, session info |

**Public Transparency Log:**

Regular members can browse the server's public moderation log to understand why actions were taken, without exposing moderator identities.

| Feature | Description | Priority |
|---------|-------------|----------|
| Anonymized Actor | Shows the actor's **role** (e.g. "Admin", "Moderator") but **never** the specific user who performed the action | P0 |
| Action + Target | What happened (e.g. "Admin banned User#1234") and who was affected | P0 |
| Public Note | Optional note the moderator can mark as public when performing the action — provides context to members (e.g. "Repeated harassment in #general") | P0 |
| Private Note (hidden) | Moderators can also write an internal-only note that is **not** shown in the public log — only visible in the admin view | P1 |
| Timestamp & Relative Time | When the action occurred, with "2 hours ago" / "Mar 10, 2026" display | P0 |
| Public Log Filtering | Members can filter the public log by: action type (ban/kick/timeout), date range, affected user | P1 |
| Public Log Pagination | Paginated, scrollable list with chronological ordering (newest first) | P0 |
| Public Log Toggle | Server setting: enable/disable the public transparency log per server (default: enabled) | P1 |
| Selective Public Actions | Server admins can configure which action types appear in the public log (e.g. show bans and kicks, hide role changes) | P2 |

**Full Admin Audit Log:**

| Feature | Description | Priority |
|---------|-------------|----------|
| Log All Mod Actions | Every kick, ban, timeout, message delete, role change, and setting change is logged | P0 |
| Immutable Records | Audit log entries cannot be edited or deleted — even by the server owner | P0 |
| Actor + Target | Each entry records the full identity of who performed the action and who/what was affected | P0 |
| Reason Field | Optional or required reason text attached to each action (always visible to admins) | P1 |
| Public Note Flag | When creating an action, moderator can toggle "Make note public" to show/hide the reason in the public transparency log | P1 |
| Before/After Diff | For setting changes: show what changed (old value → new value) — git-style diff view | P1 |
| **Git-Style History** | Chronological commit-log view: each entry is a "commit" with hash, actor, action, target, reason, timestamp — expandable for full diff | P1 |
| **Diff View for Settings** | Side-by-side or inline diff for config/permission/role changes showing exactly what was modified | P2 |
| **Blame View** | For any current server setting, see who last changed it and when — like `git blame` for server config | P2 |
| Filter by Action Type | Filter log by: member updates, role changes, channel changes, message deletes, bans, server settings, etc. | P1 |
| Filter by Actor | Show only actions performed by a specific moderator | P1 |
| Filter by Target | Show all actions taken against a specific user | P1 |
| Filter by Role | Show only actions performed by users holding a specific role | P2 |
| Date Range Filter | Filter log entries by time period (preset: today, 7d, 30d, 90d, custom range) | P1 |
| Keyword Search | Full-text search across reasons, notes, and action descriptions | P2 |
| Compound Filters | Combine multiple filters (e.g. "bans by Moderators in the last 30 days targeting users who joined < 1 week ago") | P2 |
| Saved Filter Presets | Save and name frequently used filter combinations for quick access | P3 |
| Pagination | Paginated results (50 per page) with infinite scroll | P0 |
| **Export Audit Log** | Download filtered or full log as CSV, JSON, or PDF — includes all visible fields for the exporter's permission level | P1 |
| **Scheduled Exports** | Auto-export audit logs on a schedule (daily/weekly/monthly) to a webhook or email | P3 |
| Retention Period | Configurable retention: 30d, 90d, 180d, 1y, forever (default: 90d) | P2 |
| Real-time Updates | New audit entries appear in real-time via WebSocket | P2 |
| Webhook Forwarding | Optionally forward audit events to a webhook (for external logging/SIEM) | P3 |

**Logged Action Types:**

| Category | Actions Logged |
|----------|---------------|
| Members | Join, Leave, Kick, Ban, Unban, Timeout, Timeout Removed, Role Added, Role Removed, Nickname Changed, Warning Issued |
| Messages | Delete (single), Bulk Delete (count + channel), Pin, Unpin |
| Channels | Create, Delete, Update (name, topic, permissions, slow mode, NSFW, bitrate, user limit) |
| Roles | Create, Delete, Update (name, color, permissions, position, hoist, mentionable) |
| Server | Update (name, icon, banner, description, region, verification level, default notifications) |
| Invites | Create, Delete, Update (max uses, expiry) |
| Emoji | Upload, Delete, Rename |
| Webhooks | Create, Delete, Update |
| AutoMod | Rule Created, Rule Updated, Rule Deleted, Rule Triggered (action taken) |
| Threads | Create, Delete, Archive, Unarchive |
| Integrations | Bot Added, Bot Removed, Bot Permissions Changed |
| Voice | Member Server-Muted, Server-Deafened, Moved, Disconnected |

### 2.19 Settings & Personalization

| Feature | Description | Priority |
|---------|-------------|----------|
| Theme (Dark / Light) | App-wide theme toggle | P0 |
| Custom Accent Color | Personalize UI accent color | P2 |
| Font Size / Chat Density | Compact, cozy, or full chat display | P2 |
| Notification Sounds | Toggle and customize sounds | P2 |
| Keybinds | Customizable keyboard shortcuts | P2 |
| Language / i18n | Multi-language support | P3 |
| Accessibility | Screen reader support, reduced motion, high contrast | P2 |
| **Custom CSS** | User-authored CSS injected into the client for full visual customization; sandboxed to prevent script injection | P1 |
| **CSS Theme Sharing** | Import/export CSS themes as shareable files; community theme browser | P2 |
| **Keyboard Navigation** | Full keyboard-driven navigation: Tab through channels/messages/panels, Enter to focus, Escape to back out, arrow keys for lists | P1 |
| **Keyboard Shortcut Quick Switcher** | Ctrl+K / Cmd+K to search and jump to any channel, DM, or server | P1 |
| **Focus Indicators** | Visible focus ring on all interactive elements when using keyboard navigation | P1 |
| **Screen Reader Announcements** | ARIA live regions for incoming messages, notifications, and state changes | P2 |
| Developer Mode | Show IDs, debug info, and API access in the UI | P2 |

### 2.20 Developer / Admin Panel

A hidden power-user panel accessible to platform developers and designated admins. Not exposed to regular users.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Access Control** | Gated behind a `developer` flag on the user account + 2FA re-auth to enter | P0 |
| System Health Dashboard | Live overview: API latency, WebSocket connections, error rate, uptime | P1 |
| Service Status | Per-service health checks: Phoenix backend, PostgreSQL, Redis, SFU/media server, CDN | P1 |
| Active Connections Monitor | Real-time count of connected WebSocket clients, voice users, active streams | P1 |
| Database Stats | Connection pool usage, slow query log, table sizes, migration status | P2 |
| Redis Monitor | Key count, memory usage, pub/sub channel stats, connected subscribers | P2 |
| User Lookup | Search any user by ID/username/email — view profile, sessions, servers, roles, flags | P1 |
| User Impersonation | View the app as a specific user (read-only, audit-logged) for debugging | P2 |
| Server Inspector | Browse any server's channels, roles, members, and settings for debugging | P1 |
| Channel Inspector | View channel state: message count, connected voice users, active threads, overrides | P1 |
| Message Inspector | Look up a message by ID — see full metadata, edit history, attachments, embeds | P2 |
| API Request Tester | Built-in HTTP client to fire test requests against the REST API with auth context | P1 |
| WebSocket Tester | Connect to any Phoenix Channel topic, send/receive events, inspect payloads | P1 |
| Voice/Media Diagnostics | Test WebRTC connectivity, view SFU stats, check ICE candidates, measure jitter/latency | P2 |
| Push Notification Tester | Send test push notifications to a specific user/device | P2 |
| Feature Flags | Toggle features on/off globally or per-user/per-server (canary rollouts) | P1 |
| Rate Limit Inspector | View current rate limit counters for any user/IP, manually reset if needed | P2 |
| Audit Log Viewer | Global audit log across all servers — filterable by actor, action, target, date | P1 |
| Error Log / Crash Reports | Recent backend errors, stack traces, grouped by frequency | P1 |
| Background Job Queue | View Oban/job queue status: pending, running, failed, retryable jobs | P2 |
| Email Delivery Log | Track sent emails: verification, password reset, login alerts — delivery status | P2 |
| Bot & Webhook Inspector | View registered bots, webhook endpoints, recent deliveries and failures | P2 |
| Config Editor | View/edit runtime config values (non-secret) without redeployment | P2 |
| Invite Inspector | Look up invite codes — usage count, creator, expiry, target server/channel | P2 |
| Metrics & Telemetry | Grafana-style charts: requests/sec, p95 latency, error rates, memory, CPU over time | P2 |
| Dev Console (IEx) | Browser-based IEx shell connected to the running BEAM node (heavily restricted) | P3 |

### 2.21 Integrations & Connected Apps

| Feature | Description | Priority |
|---------|-------------|----------|
| GitHub Integration | Receive repo events (push, PR, issues) as channel messages | P2 |
| GitLab Integration | Same as GitHub for GitLab-hosted projects | P3 |
| Twitch Integration | Show live stream status, notify channel when a member goes live | P2 |
| YouTube Integration | Post notifications for new uploads from linked channels | P3 |
| Spotify Connect | Display currently playing track in status, "Listen Along" with friends | P2 |
| Twitter/X Feed | Forward tweets from specific accounts into a channel | P3 |
| RSS Feed | Subscribe to any RSS/Atom feed and post new entries to a channel | P2 |
| Calendar Integration | Google Calendar / Outlook — schedule events, send reminders to channels | P3 |
| Jira / Linear Integration | Sync issue updates into project channels | P3 |
| Zapier / n8n Webhook Relay | Generic webhook endpoint for connecting to 5000+ external apps | P3 |
| Steam Integration | Display Steam profile, currently playing game, wishlist | P2 |
| Xbox / PlayStation Integration | Show gamertag and current game from console platforms | P3 |
| Custom OAuth2 Connections | Let users connect arbitrary OAuth2 services to their profile | P3 |

### 2.22 Bot / Integration Platform

| Feature | Description | Priority |
|---------|-------------|----------|
| Bot Accounts | Create bot users with API tokens | P2 |
| Webhook Support | Inbound webhooks to post messages to channels | P2 |
| Slash Commands | Register and handle `/commands` from bots | P2 |
| Context Menu Commands | Right-click user/message commands registered by bots | P3 |
| Bot Permissions | Scoped permissions per bot per server | P2 |
| OAuth2 App Authorization | Users authorize third-party apps to act on their behalf | P3 |
| Rich Embeds | Bots can send structured embed messages (title, fields, images, footer) | P2 |
| Interactive Components | Buttons, select menus, modals in bot messages | P3 |
| Bot Dashboard | Web UI for managing bot applications, tokens, and OAuth settings | P3 |
| Rate Limits for Bots | Per-bot rate limiting to prevent abuse | P2 |
| **External REST API** | Documented, versioned public REST API for all platform operations: messages, channels, servers, members, roles, invites, search; authenticated via device-signed tokens or bot API keys; rate-limited per-token | P1 |
| API Versioning | Versioned endpoints (`/api/v1/`, `/api/v2/`) with deprecation policy and migration guides | P1 |
| API Rate Limit Headers | Every response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers | P1 |
| WebSocket Gateway API | Documented real-time gateway for events: message_create, presence_update, voice_state_update, etc.; used by bots and third-party clients | P1 |
| **Native Music Bot Support** | First-class audio playback pipeline for bots: bots can stream audio into voice channels via a dedicated audio sink API (PCM/Opus); designed to integrate with external music platforms | P2 |
| Music Bot Audio Routing | Dedicated audio track in the SFU for bot playback, separate volume control for bot audio vs. user voice | P2 |
| Music Bot Queue API | Bot API endpoints for queue management: add, remove, skip, pause, resume, shuffle, loop, now-playing | P2 |
| Music Bot Controls Widget | In-voice-channel UI widget showing current track, queue, and playback controls when a music bot is active | P3 |

> **Note:** A dedicated music platform is being built separately. The native music bot support here is designed to be a first-class integration point for that platform and any other audio source.

### 2.23 Search & Discovery

| Feature | Description | Priority |
|---------|-------------|----------|
| Message Search | Full-text search with filters (user, channel, date range, has: attachment/link/embed) | P1 |
| Server Search | Search public servers by name, tags, category, member count — **Tier 3+ only** | P2 |
| User Search | Find users by username across the platform | P1 |
| Jump to Message | Click a search result to jump to that message in context | P1 |
| Recent Searches | Persist recent search queries for quick re-use | P3 |
| Search Indexing | Elasticsearch / Meilisearch for fast full-text search across millions of messages | P2 |

### 2.24 Plugin API & Extensibility

| Feature | Description | Priority |
|---------|-------------|----------|
| **Official Plugin API** | Documented, versioned REST + WebSocket API for third-party plugins to extend Burrow functionality | P1 |
| Plugin Manifest | Each plugin declares permissions, hooks, and UI injection points in a `burrow-plugin.json` manifest | P1 |
| Plugin Permission Scopes | Granular OAuth2-style scopes: read_messages, send_messages, manage_channels, manage_roles, voice_connect, etc. | P1 |
| Plugin Lifecycle Hooks | Hooks for: message_create, message_edit, message_delete, member_join, member_leave, reaction_add, voice_join, channel_create, etc. | P1 |
| Plugin UI Extensions | Plugins can inject UI components into designated slots: sidebar panels, message action buttons, settings tabs, context menus | P2 |
| Plugin Settings Page | Each plugin gets a settings panel in server settings for configuration by admins | P2 |
| Plugin Marketplace | Browse, search, and install plugins from a curated marketplace with ratings and reviews | P3 |
| Plugin Versioning | Semantic versioning for plugins; auto-update with rollback capability | P2 |
| Plugin Developer Portal | Web dashboard for plugin developers: create apps, manage versions, view install stats, handle OAuth | P3 |
| Plugin Audit Trail | All plugin actions are logged in the server audit log with plugin identity | P1 |
| Per-Server Plugin Install | Server admins install/uninstall plugins per server; plugins cannot self-install | P0 |
| Plugin Rate Limiting | Per-plugin rate limits to prevent abuse; configurable by server admins | P1 |
| **Client Extension API** | Client-side extension framework: register custom UI panels, message renderers, theme hooks, and keybind handlers; extensions run in a sandboxed iframe/WebView with controlled message-passing to the host client | P2 |
| Client Extension Permissions | Extensions declare required client permissions (read_messages_visible, modify_ui, access_clipboard, play_audio); user approves at install | P2 |
| Extension Hot Reload | Developers can reload extensions without restarting the client; dev mode enables auto-reload on file change | P3 |

### 2.25 Server Sandboxing & Isolation

| Feature | Description | Priority |
|---------|-------------|----------|
| **Process Isolation** | Each server's plugin execution runs in an isolated sandbox (V8 isolate / WASM / container) — no access to other servers' data or state | P0 |
| Memory Limits | Per-server plugin sandbox enforces memory caps (e.g. 64MB per plugin instance) | P1 |
| CPU Time Limits | Plugin execution capped per invocation (e.g. 100ms) and per minute (e.g. 5s) to prevent runaway code | P1 |
| Network Access Control | Plugins can only make outbound HTTP requests to domains whitelisted in their manifest; no raw socket access | P1 |
| File System Isolation | Plugins have no direct filesystem access; use a sandboxed key-value store for persistence | P0 |
| Data Isolation | Server data (messages, members, roles) is strictly scoped — a plugin installed in Server A cannot read Server B's data | P0 |
| Sandboxed Storage API | Plugins get a key-value storage API scoped to their server instance (quota: 10MB per plugin per server) | P2 |
| Permission Enforcement | Sandbox enforces the permissions declared in the plugin manifest — any undeclared access is blocked and logged | P0 |
| Plugin Crash Isolation | A crashing plugin cannot bring down the server or affect other plugins — auto-restart with backoff | P1 |
| Security Audit | Plugin submissions to the marketplace undergo automated static analysis and manual security review | P2 |
| Kill Switch | Server admins and platform admins can instantly disable any plugin across one or all servers | P1 |

### 2.26 Progressive Trust & Reputation System

> **Core principle:** Every new account starts in a restricted, low-trust state. Trust is earned over time through genuine human interaction — not purchased or claimed. This replaces the traditional email/phone verification gate.

#### Trust Tiers

| Tier | Trust Score | Capabilities | How to Reach |
|------|-------------|-------------|---------------|
| **Tier 0 — New** | 0–15 | Send messages in joined servers (rate-limited: 5/min), read all channels, react to messages, join up to 3 servers via invite links | Account creation (PoW completed) |
| **Tier 1 — Verified** | 16–40 | DMs (rate-limited: 10/hr, text only — no links or attachments), join up to 10 servers, basic emoji reactions | ~1–2 days of normal activity |
| **Tier 2 — Trusted** | 41–70 | Unrestricted DMs, send links and embeds, upload files (size-limited), join up to 50 servers, create invite links | ~1–2 weeks of consistent activity |
| **Tier 3 — Established** | 71–90 | Full upload limits, create servers, access server discovery (if enabled), higher rate limits, can be assigned mod roles | ~1–2 months of good standing |
| **Tier 4 — Veteran** | 91–100 | Maximum rate limits, priority in abuse review, eligible for verified badge, can vouch for other accounts | ~6+ months, sustained positive interaction |

#### New Account Cooldowns

> Fresh accounts (Tier 0) have mandatory cooldowns on sensitive actions to slow automated abuse.

| Action | Cooldown | Notes |
|--------|----------|-------|
| Account creation | 1 per IP per 10 minutes | PoW difficulty also scales with creation rate per IP |
| First message | 5 minutes after account creation | Prevents instant spam on join |
| First DM | Tier 1 required (~1–2 days) | Cannot DM at all at Tier 0 |
| Join additional servers | 10 minutes between joins at Tier 0 | Prevents mass server join sweeps |
| Create invite link | Tier 2 required (~1–2 weeks) | New accounts cannot invite others |
| Create server | Tier 3 required (~1–2 months) | Must demonstrate sustained good behavior |
| Change username | 1 change per 72 hours (all tiers) | Prevents impersonation churn |
| Upload files | Tier 2 required | No file uploads at Tier 0–1 |

#### Trust Score Factors

| Factor | Effect | Weight |
|--------|--------|--------|
| Account Age | Score increases logarithmically with account age | High |
| Messages Sent | Gradual increase for consistent (not spammy) messaging | Medium |
| Reactions Received | Others reacting to your messages indicates real engagement | Medium |
| Reply Patterns | Sending messages that receive replies (two-way conversation) | High |
| Server Membership Duration | Long-term membership in servers (not rapid join/leave) | Medium |
| Unique Conversation Partners | Number of distinct users who interact with you | Medium |
| Moderation Actions Against (negative) | Bans, kicks, timeouts, reports reduce trust | High (negative) |
| Reports Filed Against (negative) | Confirmed reports reduce trust; dismissed reports have no effect | High (negative) |
| Linked Email (optional bonus) | Small trust bonus for linking and confirming an email | Low (bonus) |
| Linked Phone (optional bonus) | Small trust bonus for linking a phone number | Low (bonus) |
| Vouched By Veteran | A Tier 4 user vouching for you gives a one-time trust boost | Medium (one-time) |

#### Trust Restrictions by Feature

| Feature | Tier 0 | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---------|--------|--------|--------|--------|--------|
| Send messages in servers | 5/min | 15/min | 30/min | 60/min | 120/min |
| Send DMs | ✘ | 10/hr, text only | Unrestricted | Unrestricted | Unrestricted |
| Send links | ✘ | ✘ | ✔ | ✔ | ✔ |
| Upload files | ✘ | ✘ | 10MB limit | 25MB limit | 100MB limit |
| Join servers (max) | 3 | 10 | 50 | 100 | 200 |
| Create servers | ✘ | ✘ | ✘ | ✔ | ✔ |
| Create invite links | ✘ | ✘ | ✔ | ✔ | ✔ |
| Use server discovery | ✘ | ✘ | ✘ | ✔ | ✔ |
| Voice channels | Listen only | Talk (muted by default) | Full | Full | Full |
| Custom emoji in other servers | ✘ | ✘ | ✔ | ✔ | ✔ |

#### Server-Level Trust Overrides

| Feature | Description | Priority |
|---------|-------------|----------|
| Minimum Trust Tier to Join | Server admins can set minimum trust tier required (default: Tier 0) | P1 |
| Per-Channel Trust Gating | Require a minimum trust tier to send messages in specific channels | P2 |
| Trust Tier Role Mapping | Auto-assign roles based on the member's current trust tier | P2 |
| Server-Scoped Reputation | Per-server reputation overlay — behavior in this server can be stricter/looser than global | P2 |

| Feature | Description | Priority |
|---------|-------------|----------|
| **Reputation Score** | Numeric score per user reflecting their platform standing | P0 |
| Reputation Factors | Score influenced by: account age, server memberships, messages, reactions, reports, bans, timeouts | P0 |
| Server-Level Reputation | Per-server reputation based on behavior in that server — visible to mods | P2 |
| Global Reputation | Platform-wide aggregate score — drives the trust tier system | P0 |
| Reputation Badges | Visual tier badges on profile: New, Verified, Trusted, Established, Veteran based on tier | P2 |
| Reputation-Gated Features | Automatically gated by trust tier table above | P0 |
| Reputation Decay | Score gradually decays for inactive accounts to prevent stale high-rep accounts being sold/compromised | P2 |
| Anti-Gaming | Rate-limited reputation gain, anomaly detection for rep farming, weighted by interaction quality not quantity | P1 |
| Reputation API | Expose reputation score via API for bots and plugins to use in custom moderation flows | P3 |
| Reputation Privacy | Users can see their own score and tier; others see only the tier badge unless the user opts to show the number | P2 |

### 2.27 Behavioral Bot Detection & Human Verification

> Anti-abuse system that detects bot-like behavior through passive analysis and optional interactive challenges. No CAPTCHAs — verification feels native to the application.

#### Passive Bot Detection (Risk Scoring)

| Signal | Description | Risk Weight |
|--------|-------------|-------------|
| Rapid Server Joins | Joining 3+ servers within minutes of account creation | High |
| Mass DM Sending | DMing many users in a short window, especially non-friends | High |
| Identical Messages | Sending the same or near-identical message across multiple channels/servers | High |
| No Replies Received | Sending many messages but never receiving replies (one-way communication) | Medium |
| No Reactions Received | Messages never get reacted to by other users | Medium |
| Linear Message Timing | Messages sent at perfectly regular intervals (non-human cadence) | Medium |
| Instant Reaction to Join | Sending first message within seconds of joining a server | Low |
| Copy-Paste Patterns | Clipboard-paste detected for every message (never typed) | Medium |
| API-Only Activity | All activity comes via API, never through a UI client | Medium |
| Failed PoW Re-attempts | Multiple accounts created from the same IP/fingerprint in short succession | High |

**Risk Score Thresholds:**
- 0–30: Normal — no action
- 31–60: Suspicious — increased rate limiting, flag for review
- 61–80: Likely bot — restrict DMs, restrict server joins, queue for human verification challenge
- 81–100: Almost certain bot — auto-quarantine account, require human verification to continue

#### Human Interaction Challenges

When a user's risk score exceeds the threshold, they're presented with a non-CAPTCHA verification challenge that feels native to the app:

| Challenge Type | Description | Priority |
|----------------|-------------|----------|
| **Emoji Reaction Challenge** | "React to this message with the 🌟 emoji" — verifies the user can parse and interact with UI elements | P1 |
| **Drag UI Interaction** | Drag a slider, reorder items, or drag-and-drop a visual element (tests real mouse/touch input) | P1 |
| **Select Matching Message** | Show 4 messages, ask "which one is a greeting?" or "which is about food?" — tests reading comprehension | P2 |
| **Typing Cadence Check** | Ask user to type a displayed sentence — analyze keystroke timing for human patterns | P2 |
| **Simple Conversation Response** | Display a message like "What color is the sky?" and accept freeform answers (validated loosely) | P3 |

**Challenge Rules:**
- Challenges are presented inline, not as a separate page — feel like part of the app
- A user gets 3 attempts before being quarantined
- Passing a challenge grants a temporary trust boost and resets the risk counter
- Challenges are rate-limited: at most once per 24 hours per user
- Never shown to Tier 3+ users unless their risk score spikes dramatically

#### Server-Level Verification Gates

Server admins can require a verification step before granting full access:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Verification on Join** | New members land in a restricted state until they complete server-level verification | P1 |
| Verification Channel | Designated channel where new members must complete a challenge before accessing the rest of the server | P1 |
| Minimum Trust Tier Gate | Require a minimum global trust tier to join (e.g. Tier 1+ to filter out brand-new accounts) | P1 |
| Minimum Account Age Gate | Require account to be at least X hours/days old before joining | P2 |
| Rules Acceptance | Require reading and accepting server rules before gaining access | P1 |
| Invite-Only Verification | Only members who joined via a specific invite (e.g. from a trusted source) bypass verification | P2 |
| Custom Verification Bots | Server can use a plugin/bot to run custom verification flows | P3 |

### 2.28 Invite-Based Growth Model

> Burrow uses an invite-based growth model. Accounts cannot freely browse or discover servers until they reach a sufficient trust tier. Growth is organic, through personal invitations.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Invite-Only Server Joining** | All server joins require an invite link — no open browsing until Tier 3 | P0 |
| Invite Link Generation | Server admins and permitted roles create invite links | P0 |
| Invite Uses Limit | Set max uses per invite: 1, 5, 10, 25, 50, 100, unlimited | P0 |
| Invite Expiration | Set invite duration: 30m, 1h, 6h, 12h, 24h, 7d, 30d, never | P0 |
| Invite Tracking | Track who created each invite, how many times it was used, and who joined through it | P1 |
| Invite Audit | Full audit trail of invite creation, usage, and revocation | P1 |
| Invite Revocation | Any admin can revoke an invite at any time | P0 |
| Invite-Creator Accountability | If users invited by someone are repeatedly banned/reported, the inviter's trust score is affected | P2 |
| Personal Invite Quota | Tier-based limits on how many invite links a user can have active simultaneously | P2 |
| **Server Discovery (Tier 3+)** | Only Tier 3+ users can browse the public server directory — prevents bot crawling | P2 |
| Server Listing Opt-In | Servers must opt-in to appear in the discovery directory | P2 |
| Direct Profile Invites | Users can invite friends directly from their profile or DM — generates a one-use invite link | P1 |

### 2.29 Network Architecture & Self-Hosted Deployment

> Burrow is **centralized**. All servers, messages, media, and user data live on platform-operated infrastructure backed by S3-compatible object storage. Enterprises can optionally deploy **self-hosted instances** — isolated Burrow installations with their own database, storage, and moderation. Self-hosted instances do **not** communicate with each other or with the central platform. There is no federation protocol.

#### Centralized Network (Default)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Centralized Hosting** | All servers, channels, messages, and media are stored on Burrow-operated infrastructure by default | P0 |
| **S3 Object Storage (Central)** | All media and file uploads on the central network are stored in S3-compatible object storage (MinIO for dev, AWS S3 / Cloudflare R2 / etc. for production) — **no local filesystem in production** | P0 |
| **CDN-Fronted Delivery** | Uploaded files served via CDN with signed, expiring URLs | P1 |
| **Central Identity Authority** | All user identities (device-bound Ed25519 keypairs) originate from and are verified by the central Burrow auth service — this is the single source of truth for identity | P0 |
| **Central Abuse Handling** | Trust scores, platform-level reports, bot detection, and account suspensions are managed centrally | P0 |
| **Central Discovery** | Server discovery, user search, and invite resolution all route through central infrastructure | P1 |

#### Self-Hosted Deployment (Enterprise)

> Self-hosted instances are **fully isolated** Burrow deployments. Same codebase, own infrastructure. Users on a self-hosted instance cannot interact with users on the central platform or other instances. This is intentional — it keeps the architecture simple and avoids the complexity of distributed identity, cross-node moderation, and federation protocols.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Self-Hosted Instance** | Organizations deploy their own Burrow instance using Docker — own PostgreSQL, own Redis, own S3-compatible storage. Identical feature set to central, running independently | P3 |
| **Own Data, Own Rules** | All messages, files, and user data stay on the organization's infrastructure. No data leaves the instance. Organization controls its own moderation policies, AutoMod rules, and retention | P3 |
| **LDAP / SSO Auth** | Self-hosted instances authenticate users via the organization's identity provider (LDAP, Active Directory, SAML, OIDC). No dependency on central Burrow auth | P3 |
| **Deployment Parity** | Self-hosted instances receive the same releases as central via container image tags. Organizations choose when to upgrade | P3 |
| **Admin Bootstrapping** | First user to configure the instance becomes the platform admin. Admin creates servers, invites, and sets instance-wide policies | P3 |

### 2.30 Enterprise Features

> These features are available on **self-hosted instances** and on the central platform for organizations on an enterprise plan.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Message Retention Policies** | Admins configure mandatory retention windows (e.g., 90 days, 1 year, 7 years) — messages outside the window are auto-purged; retention cannot be shorter than any active legal hold | P3 |
| **Legal Hold** | Place individual users, channels, or entire servers on legal hold — all messages and attachments are preserved regardless of retention policy or user deletion requests until the hold is lifted | P3 |
| **Audit Export** | Export full audit logs, message archives, and moderation history in compliance-ready formats (JSON, CSV, PDF) with chain-of-custody metadata and cryptographic signatures | P3 |
| **LDAP / Active Directory Sync** | Sync instance user roster with enterprise directory — auto-provision/deprovision accounts, map AD groups to Burrow roles, periodic delta sync | P3 |
| **SSO Integration (SAML / OIDC)** | Users authenticate via the organization's SSO provider as the primary auth method | P3 |
| **SCIM Provisioning** | Automated user lifecycle management via SCIM 2.0 — create, update, deactivate users from HR/IT systems | P4 |
| **Data Residency Controls** | Instance operators specify geographic region constraints for data storage — all messages, files, and metadata stay within the declared region | P4 |
| **Compliance Dashboard** | Admin panel showing retention policy status, active legal holds, export history, LDAP sync status, and compliance alerts | P4 |

### 2.31 In-App Support & Ticket System

> Built-in support system accessible from within the app. No need to visit an external website or send an email — users can file tickets, track status, and communicate with support directly inside Burrow.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Submit Ticket** | Users create tickets from Settings → Support with category selection (Bug Report, Account Issue, Age Flag Appeal, Trust & Safety, Feature Request, Billing, Other). Attach screenshots, logs, or screen recordings. Markdown-supported description field | P1 |
| **Ticket Categories** | Predefined categories route tickets to the appropriate team. Age Flag Appeals route to T&S with elevated priority. Bug Reports auto-attach client version, OS, and device info (with user consent) | P1 |
| **Ticket Tracking** | Each ticket gets a unique ID. Users can view all their tickets with status (Open, In Progress, Awaiting Response, Resolved, Closed). Push/in-app notifications on status changes | P1 |
| **Threaded Conversation** | Support agent and user communicate via threaded messages within the ticket. Messages support text, images, and file attachments. All communication is encrypted in transit | P1 |
| **Live Video Support** | For Age Flag Appeals and escalated issues, support agents can initiate a **one-time video call** directly within the ticket. See Age Flag Appeal Process below for details | P2 |
| **Satisfaction Rating** | After ticket resolution, user can rate the experience (1–5 stars) and leave optional feedback | P2 |
| **Knowledge Base Integration** | Before submitting, users are shown relevant help articles that might answer their question. Reduces ticket volume for common issues | P3 |
| **Admin Dashboard** | Support agents see a queue of tickets sorted by priority and age. Metrics: avg response time, resolution time, satisfaction score, ticket volume by category | P2 |

### 2.32 Server Dashboards (Community Homepage)

> A customizable landing page for each server — think Notion + Discord combined. Admins arrange **widgets** on a grid to create a community homepage that surfaces key info at a glance.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Server Home View** | Dedicated "Home" tab in the server sidebar, displayed when members first open the server. Shows an admin-configured dashboard instead of defaulting to #general | P1 |
| **Widget System** | Drag-and-drop widget grid. Admins place, resize, and reorder widgets. Each widget pulls live data from server channels or integrations | P1 |
| **Status Widget** | Pulls from a Status Channel — shows game server status (online/offline, player count, map) in a compact card | P2 |
| **Events Widget** | Pulls from an Events Channel — shows upcoming events with RSVP counts and countdowns | P2 |
| **Recent Media Widget** | Pulls from a Gallery Channel — displays a thumbnail grid of the latest images/videos | P2 |
| **Announcements Widget** | Pulls from an Announcement Channel — shows the latest 3–5 announcements with timestamps | P1 |
| **Member Count Widget** | Live online/total member count with optional trend sparkline | P2 |
| **Custom Text Widget** | Markdown-rendered text block — rules summary, welcome message, links, whatever admins want | P1 |
| **Pinned Links Widget** | Grid of quick-links with icons — external resources, social media, donation pages, guides | P2 |
| **Leaderboard Widget** | Pulls from bot/integration data — top chatters, XP rankings, game stats | P3 |
| **Channel Activity Widget** | Shows which channels are most active right now with message-per-minute sparklines | P3 |
| **Widget Permissions** | Per-widget visibility by role — some widgets visible only to members vs. mods vs. boosters | P2 |
| **Dashboard Templates** | Pre-built dashboard layouts for common server types (gaming community, art collective, study group, company) | P3 |

### 2.33 Privacy Controls

> Granular, user-facing privacy controls. Users should have full authority over who can see what about them.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Activity Visibility** | Toggle who can see your current activity / rich presence: Everyone, Friends Only, Nobody | P1 |
| **Online Status Visibility** | Toggle who can see your online/idle/DND status: Everyone, Friends Only, Server Members, Nobody (invisible to all) | P1 |
| **Voice Presence Visibility** | Toggle who can see which voice channel you're in: Everyone, Friends Only, Same Server, Nobody | P1 |
| **Server List Visibility** | Toggle who can see which servers you belong to: Everyone, Friends Only, Mutual Servers, Nobody | P1 |
| **Friend Request Filtering** | Allow friend requests from: ☑ Mutual Servers, ☑ Mutual Friends, ☐ Anyone. All three independently toggleable. Defaults to Mutual Servers + Mutual Friends | P0 |
| **Profile Visibility** | Toggle who can view your full profile (bio, banner, connected accounts): Everyone, Friends Only, Nobody (shows minimal card only) | P1 |
| **DM Filtering** | Allow DMs from: ☑ Friends, ☑ Server Members, ☐ Anyone. Per-server override available | P0 |
| **Read Receipts** | Toggle whether others can see that you've read their DMs. Default: off | P2 |
| **Typing Indicator Visibility** | Toggle whether your typing status is visible to others. Default: on | P2 |
| **Data Sharing Controls** | Opt out of anonymized usage analytics, disable crash report auto-send, control what device info is attached to support tickets | P1 |

### 2.34 Game Server Connect

> Built-in game server integration for supported titles. Members can see live server status, player lists, and one-click join directly from Burrow — no alt-tabbing to server browsers.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Add Game Server** | Server admins register game server connections by IP/domain, port, and game type. Validates connectivity on save | P2 |
| **Supported Games** | Initial support: Minecraft (Java & Bedrock), Rust, FiveM (GTA V), ARK: Survival Evolved, Valheim, Terraria, Counter-Strike 2, Palworld. Extensible via plugin API for additional games | P2 |
| **Live Status Card** | Displays in Status Channel or Dashboard widget: server name, game type, player count / max, current map, server ping (from Burrow relay), online/offline/restarting badge | P2 |
| **Player List** | Show currently connected players (where the game query protocol supports it). Optionally link game names to Burrow profiles if users have connected their game accounts | P3 |
| **One-Click Join** | "Join Server" button that launches the game client via protocol handler (e.g., `steam://connect/`, `minecraft://`). Falls back to a copyable connection string if no handler is registered | P2 |
| **Server History** | Track uptime, player count over time, peak hours. Display as graphs in the Status Channel or dashboard | P3 |
| **Query Interval** | Configurable poll rate per game server: 30s, 1m, 5m. Rate-limited per server to prevent abuse | P2 |
| **Alerts** | Optional notifications when a game server goes offline, comes back online, or reaches a player count threshold | P3 |
| **Game Server Permissions** | New permission: `Manage Game Servers` — controls who can add/edit/remove game server connections | P2 |

### 2.35 Content Blocks Architecture

> **The core design principle: channels are typed containers, not message logs.** Instead of forcing everything into a chat message format, each channel type holds **content items** with their own schema, display rules, and interactions. Messages are just one content type among many.

```
Server
 └ Channel (has a type)
     └ Content Items (polymorphic by channel type)
          ├ ChatMessage        — text channels
          ├ GalleryPost        — gallery channels
          ├ ForumThread        — forum channels
          ├ Event              — events channels
          ├ FileAsset          — file repository channels
          └ GameServerStatus   — status channels
```

#### Content Item Base

All content items share a common envelope:

| Field | Type | Description |
|-------|------|-------------|
| `id` | snowflake | Unique content item ID |
| `channel_id` | snowflake | Parent channel |
| `author_id` | snowflake | Creator (null for system/bot-generated status items) |
| `content_type` | enum | `chat_message`, `gallery_post`, `forum_thread`, `event`, `file_asset`, `game_server_status` |
| `channel_seq` | bigint | Monotonic sequence within the channel (for ordering & sync) |
| `pinned` | boolean | Whether this item is pinned |
| `deleted` | boolean | Soft-delete flag |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last modification |

Type-specific fields live in **detail tables** joined by `content_item_id`. This keeps the base table lean for ordering/pagination while allowing each type to have arbitrarily different fields.

#### Type-Specific Schemas

**ChatMessage** (existing — migrated to content block model)

| Field | Description |
|-------|-------------|
| `content_ciphertext` | Encrypted message body |
| `content_iv` | Encryption IV |
| `encryption_version` | Key generation version |
| `type` | default / system / reply |
| `reply_to_id` | Parent message for replies |
| `edited_at` | Last edit timestamp |
| `edit_count` | Number of times the message has been edited |

**MessageEditHistory**

| Field | Description |
|-------|-------------|
| `message_id` | FK to parent message |
| `content_before` | Previous message content (pre-edit snapshot) |
| `edited_by` | User who made the edit (always the author in current rules) |
| `edited_at` | When this edit occurred |

**GalleryPost**

| Field | Description |
|-------|-------------|
| `title` | Post title (optional) |
| `description` | Caption / body text |
| `media_urls` | Array of media storage keys (images/videos) |
| `tags` | Array of admin-defined tags |
| `nsfw_spoiler` | Per-post NSFW/spoiler flag |
| `comment_count` | Denormalized comment count |

**ForumThread**

| Field | Description |
|-------|-------------|
| `title` | Thread title (required) |
| `body` | Opening post body (markdown) |
| `tags` | Array of forum tags |
| `solved` | Boolean — marked solved by author or mod |
| `accepted_reply_id` | ID of the accepted answer |
| `reply_count` | Denormalized reply count |
| `last_activity_at` | Timestamp of last reply for sorting |
| `locked` | Prevent new replies |

**Event**

| Field | Description |
|-------|-------------|
| `title` | Event name |
| `description` | Event details (markdown) |
| `start_time` | Event start (with timezone) |
| `end_time` | Event end (nullable for open-ended) |
| `timezone` | IANA timezone string |
| `max_participants` | Participant cap (nullable for unlimited) |
| `recurrence_rule` | iCal RRULE for recurring events |
| `location` | Freeform location text or voice channel ID |
| `image_url` | Event cover image |

**FileAsset**

| Field | Description |
|-------|-------------|
| `title` | File display name |
| `description` | Release notes / description |
| `current_version` | Semver or freeform version string |
| `category` | Admin-defined category tag |
| `download_count` | Total downloads across all versions |

**GameServerStatus**

| Field | Description |
|-------|-------------|
| `server_name` | Display name |
| `server_address` | IP / hostname |
| `server_port` | Query port |
| `game_type` | Game identifier (minecraft, rust, fivem, etc.) |
| `status` | online / offline / restarting |
| `player_count` | Current players |
| `max_players` | Server capacity |
| `map_name` | Current map/world |
| `latency_ms` | Last measured ping |
| `last_polled_at` | When status was last refreshed |

#### Interactions on Content Items

| Interaction | Applies To | Description |
|-------------|-----------|-------------|
| **Reactions** | All types | Emoji reactions on any content item |
| **Comments** | GalleryPost, Event, FileAsset | Threaded comment list under the item (stored as child ChatMessages) |
| **Replies** | ChatMessage, ForumThread | In-line replies and threaded discussion |
| **RSVP** | Event | Join/leave/maybe with participant list |
| **Download** | FileAsset | Versioned file download with counter |
| **Pin** | All types | Pin to top of channel |
| **Bookmark** | All types | Save to personal bookmarks |

#### Why This Matters

- **No more shoe-horning**: Events aren't messages with special embeds. Gallery posts aren't messages with attachments. Each type gets purpose-built display, search, and moderation.
- **Modular extensibility**: Adding a new channel type = new content type enum + new detail table + new UI component. No changes to the core content pipeline.
- **Unified sequencing**: All content items share `channel_seq` so sync, pagination, gap detection, and real-time push work identically regardless of content type.
- **Consistent permissions**: The permission system applies uniformly — `Send Messages` generalizes to `Create Content` for non-chat channels.

### 2.36 Temporary Squad Voice Rooms

> Gamers constantly need temporary voice rooms for raids, pickup games, and small group activities. Instead of admins manually creating and cleaning up channels, Burrow automates the entire lifecycle.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Create Squad** | Any member with the `Create Squad` permission clicks a "Create Squad" button in the voice channel area. Burrow creates a **voice channel** (`Squad - {username}`) and a **paired text channel** (`squad-{username}`) under a server-designated "Squad Rooms" category | P2 |
| **Auto-Delete on Empty** | When the last user leaves a squad voice channel, a 60-second countdown begins. If no one joins within 60 seconds, both the voice and text channels are automatically deleted along with the `squad_rooms` record. The countdown resets if anyone joins | P2 |
| **Creator Controls** | The squad creator can: rename the squad, set a user limit (1–99), lock the squad (only invited users can join), and kick users from their squad. Creator permissions persist even if they temporarily leave and rejoin within the 60s window | P2 |
| **Squad Limits** | Max 1 active squad per user (prevents spam). Max active squads per server: configurable by admins (default 10). Attempting to create beyond the limit returns a clear error | P2 |
| **Squad Category** | Server admins designate which category squad rooms appear in via Server Settings → Squad Rooms. If no category is set, squads are created at the bottom of the channel list | P2 |
| **Permission Gating** | `Create Squad` is a permission bit (default: granted to @everyone). Admins can restrict it to specific roles or trust tiers | P2 |
| **Squad Visibility** | Squad channels inherit the base permissions of the server — they are visible to all members unless the creator locks them. Locked squads show in the channel list but cannot be joined without an invite from the creator | P2 |

#### Lifecycle Flow

```
User clicks "Create Squad"
    → Server checks: user has permission? under squad limit? server under max?
    → Create voice channel + text channel under Squad Rooms category
    → Insert squad_rooms record (voice_channel_id, text_channel_id, creator_id)
    → User auto-joins the voice channel

Last user leaves voice channel
    → Set empty_since = now()
    → Schedule cleanup check in 60 seconds

60 seconds later:
    → If empty_since is still set (no one joined):
        → Delete voice channel, text channel, squad_rooms record
    → If someone joined (empty_since was cleared):
        → No action
```

---

## 3. Data Model

### Core Entities

```
┌──────────┐     ┌──────────────┐     ┌───────────┐
│  User    │────<│ ServerMember │>────│  Server   │
└──────────┘     └──────────────┘     └───────────┘
     │                  │                    │
     │                  │              ┌─────┴─────┐
     │                  │              │  Category  │
     │                  │              └─────┬─────┘
     │           ┌──────┴──────┐             │
     │           │   Role      │        ┌────┴────┐
     │           └─────────────┘        │ Channel  │
     │                                  └────┬────┘
     │                                       │
     ├───────────────────────────────────────>│
     │           ┌───────────────┐            │
     ├───────────│ Content Item  │────────────┘
     │           └───────┬───────┘
     │                   │ (polymorphic by channel type)
     │           ┌───────┴───────────────────────────┐
     │           │       │       │       │            │
     │        Message  Gallery Forum   Event    FileAsset
     │                  Post   Thread
     │
     ├──── Friendship
     ├──── DirectMessage
     ├──── UserStatus
     └──── Dashboard
```

### Key Tables

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `users` | id (immutable snowflake), username (unique, mutable), display_name (nullable), avatar_url, account_type, email (nullable), phone (nullable), totp_secret_enc, totp_enabled, mfa_enabled, trust_score, trust_tier, created_at | Core identity — `id` is immutable and never changes; `username` is unique and mutable (with cooldown); `display_name` is optional freeform. No password; auth is device-bound key pair. Email/phone optional |
| `organizations` | id, name, logo_url, owner_id, billing_plan, verified, sso_provider | Org accounts |
| `org_members` | org_id, user_id, role (owner/admin/member), joined_at | Org membership |
| `servers` | id, name, icon_url, owner_id, org_id (nullable), description, verification_gate (jsonb), raid_protection_config (jsonb) | Community spaces (personal or org-owned) |
| `connected_accounts` | id, user_id, provider, provider_uid, access_token_enc, display_name | Linked external accounts |
| `user_sessions` | id, user_id, device_key_id, token_hash, device_type (desktop/mobile/web), os, browser, ip, city, country, first_active, last_active, trusted, revoked_at | Active sessions — linked to device key used for auth |
| `mfa_backup_codes` | id, user_id, code_hash, used_at, generated_at | Static single-use recovery codes (hashed, 10 per set) |
| `webauthn_credentials` | id, user_id, label, credential_id, public_key_spki, sign_count, aaguid, transports, registered_at, last_used_at | Registered hardware keys / passkeys |
| `feature_flags` | id, name, description, enabled_globally, enabled_user_ids (array), enabled_server_ids (array), updated_by, updated_at | Feature flag toggles for canary/dev rollouts |
| `server_members` | user_id, server_id, nickname, server_avatar_url, server_bio, server_pronouns, joined_at, verified | Many-to-many join with per-server persona fields |
| `roles` | id, server_id, name, color, position, permissions (bitfield) | Permission groups |
| `member_roles` | server_member_id, role_id | Role assignment join |
| `categories` | id, server_id, name, position | Channel grouping |
| `channels` | id, server_id, category_id, name, type (text/voice/stage/announcement/forum/gallery/status/events/file_repo), topic, position, bitrate, user_limit, slow_mode_interval, nsfw, default_thread_archive, region_override, last_seq (bigint) | Typed content containers — `type` determines which content items are valid; `last_seq` is the current monotonic sequence counter for this channel |
| `channel_overrides` | channel_id, target_type (role/user), target_id, allow, deny | Permission overrides (bitfields) |
| `content_items` | id (snowflake), channel_id, author_id, content_type (chat_message/gallery_post/forum_thread/event/file_asset/game_server_status), channel_seq (bigint), pinned, deleted, created_at, updated_at | **Base table for all channel content.** Polymorphic envelope — type-specific fields live in detail tables joined by content_item_id. Partitioned by (channel_id, month). Unified sequencing for sync & pagination |
| `messages` | content_item_id (FK → content_items), content_ciphertext, content_iv, encryption_version, type (default/system/reply), reply_to_id, edited_at | Chat message details — joined to content_items. Content stored as encrypted ciphertext, never plaintext |
| `gallery_posts` | content_item_id (FK → content_items), title, description, media_urls (array), tags (array), nsfw_spoiler, comment_count | Gallery post details — images/videos with metadata |
| `forum_threads` | content_item_id (FK → content_items), title, body, tags (array), solved, accepted_reply_id, reply_count, last_activity_at, locked | Forum thread details — threaded discussions with solved markers |
| `forum_tags` | id, channel_id, name, color, emoji | Admin-defined tags scoped to a forum or gallery channel |
| `forum_replies` | id, thread_id (FK → forum_threads), author_id, body, is_accepted_answer, created_at, edited_at, deleted | Replies within a forum thread |
| `events` | content_item_id (FK → content_items), title, description, start_time, end_time, timezone, max_participants, recurrence_rule, location, image_url | Event details — raids, tournaments, meetups |
| `event_participants` | event_id (FK → events), user_id, rsvp_status (going/maybe/not_going), responded_at | RSVP records for events |
| `file_assets` | content_item_id (FK → content_items), title, description, current_version, category, download_count | File repository item details |
| `file_versions` | id, file_asset_id (FK → file_assets), version, changelog, storage_key, content_hash_id (FK → file_hashes), size, uploaded_by, created_at | Version history for downloadable files |
| `game_servers` | content_item_id (FK → content_items), server_name, server_address, server_port, game_type, status (online/offline/restarting), player_count, max_players, map_name, latency_ms, query_interval_seconds, last_polled_at | Game server status items — auto-refreshed via polling |
| `content_comments` | id, content_item_id (FK → content_items), author_id, body, parent_comment_id (nullable, for nested replies), created_at, edited_at, deleted | Comments on gallery posts, events, file assets — threaded |
| `message_edits` | id (snowflake), message_id (FK → messages), content_before (text), edited_by (FK → users), edited_at (utc_datetime_usec) | Edit history snapshots — one row per edit, preserving the content before each edit was applied. Ordered by edited_at descending to reconstruct full history |
| `squad_rooms` | id, server_id, voice_channel_id (FK → channels), text_channel_id (FK → channels), creator_id (FK → users), name, user_limit, locked, created_at, empty_since (nullable utc_datetime_usec) | Temporary squad voice + text channel pairs. `empty_since` is set when voice participant count reaches 0; a background job deletes the squad (and both channels) when `empty_since` is older than 60 seconds. Cleared when someone joins. Max 1 active squad per user, max N per server (configurable) |
| `dashboard_layouts` | id, server_id, layout (jsonb), updated_by, updated_at | Server dashboard widget configuration — stores widget types, positions, sizes, and data source channel IDs |
| `dashboard_widgets` | id, layout_id (FK → dashboard_layouts), widget_type (status/events/media/announcements/members/text/links/leaderboard/activity), source_channel_id (nullable), config (jsonb), position_x, position_y, width, height, role_visibility (array) | Individual widget definitions within a dashboard |
| `attachments` | id, message_id, filename, storage_key, content_hash_id (FK → file_hashes), content_type, size, file_key_ciphertext, ttl_tier (permanent/7d/3d/1d/6h), expires_at (nullable), purged_at (nullable) | File uploads — deduplicated via content_hash_id; multiple attachments can reference the same storage object. file_key encrypted per-channel key; expires_at set on creation based on size-tier TTL rules |
| `reactions` | message_id, user_id, emoji | Message reactions |
| `pins` | channel_id, message_id, pinned_by, pinned_at | Pinned messages |
| `threads` | id, channel_id, parent_message_id, name, archived | Threaded conversations |
| `dm_channels` | id, type (dm/group_dm) | Private conversations |
| `dm_members` | dm_channel_id, user_id | DM participants |
| `friendships` | user_id, friend_id, status (pending/accepted/blocked) | Friend system |
| `invites` | code, server_id, channel_id, inviter_id, max_uses, uses_count, expires_at, revoked_at | Server invite links — primary growth mechanism; tracks usage |
| `audit_logs` | id, server_id, actor_id, actor_role_snapshot, action_type, target_type, target_id, reason, public_note, is_public, changes (jsonb), commit_hash, parent_hash, created_at | Immutable mod action log — git-style chain with before/after diffs, public note, and role snapshot for transparency view |
| `automod_rules` | id, server_id, name, type (spam/words/links/invites/caps/new_account), config (jsonb), action (delete/timeout/alert/log), bypass_role_ids (array), enabled | AutoMod rule configuration |
| `automod_events` | id, server_id, rule_id, user_id, channel_id, message_id, action_taken, triggered_at | AutoMod trigger log |
| `mod_warnings` | id, server_id, user_id, issued_by, reason, created_at | Formal member warnings |
| `mod_notes` | id, server_id, user_id, author_id, content, created_at | Private mod notes on members |
| `reports` | id, server_id, reporter_id, target_type (user/message), target_id, reason, status (pending/resolved/dismissed), resolved_by, created_at | User/message reports |
| `channel_key_shares` | id, channel_id, user_id, encrypted_channel_key, key_generation, created_at | Per-user encrypted copy of the channel's symmetric key |
| `user_settings` | user_id, theme, locale, notification_prefs (jsonb), privacy_settings (jsonb) | User preferences — `privacy_settings` stores activity_visibility, online_status_visibility, voice_presence_visibility, server_list_visibility, friend_request_filter, profile_visibility, dm_filter, read_receipts, typing_indicator_visibility |
| `server_bans` | server_id, user_id, reason, banned_by, expires_at (nullable), message_purge_window | Ban records — nullable expires_at for timed bans |
| `custom_emoji` | id, server_id, name, image_url, uploaded_by | Server emoji |
| `user_activities` | id, user_id, type (playing/streaming/listening/watching/competing), name, details, state, started_at, large_image_url | Rich presence / activity status |
| `message_encryption_keys` | id, user_id, device_id, public_key, created_at | E2EE device key store |
| `device_fingerprints` | id, user_id, session_id, fingerprint_hash, trust_score (0–100), components (jsonb), first_seen, last_seen, flagged | Device fingerprint for trust scoring — components includes canvas, WebGL, fonts, screen, timezone, etc. |
| `plugins` | id, name, description, version, author_id, manifest (jsonb), marketplace_status, install_count, created_at, updated_at | Registered plugin definitions |
| `server_plugins` | id, server_id, plugin_id, installed_by, config (jsonb), enabled, installed_at | Per-server plugin installations |
| `plugin_storage` | id, server_id, plugin_id, key, value (bytea), updated_at | Sandboxed key-value store per plugin per server |
| `user_reputation` | id, user_id, global_score, trust_tier, factors (jsonb), last_recalculated_at | Platform-wide reputation/trust score with factor breakdown |
| `server_reputation` | id, server_id, user_id, score, factors (jsonb), last_recalculated_at | Per-server reputation score |
| `offline_message_queue` | id, user_id, channel_id, content_ciphertext, content_iv, queued_at, sent_at, status (pending/sent/failed) | Client-synced offline message queue |
| `device_keys` | id, user_id, public_key_ed25519, device_fingerprint_hash, device_label, registered_at, last_used_at, revoked_at | Per-device Ed25519 public keys — private key never leaves device |
| `pow_records` | id, user_id, public_key, nonce, hash_result, difficulty_prefix, verified_at | Proof-of-work record from account creation |
| `trust_events` | id, user_id, event_type (message_sent/reaction_received/reply_received/ban/kick/report/timeout), delta, created_at | Individual trust score change events for audit trail |
| `bot_risk_scores` | id, user_id, score (0–100), signals (jsonb), last_recalculated_at | Behavioral bot detection risk score with signal breakdown |
| `pairing_tokens` | id, user_id, token_hash, method (qr/code/webauthn/recovery), expires_at, used_at, new_device_key_id (nullable) | Short-lived tokens for device pairing flows |
| `verification_challenges` | id, user_id, challenge_type (emoji_reaction/drag_ui/select_message/typing_cadence), challenge_data (jsonb), passed, attempted_at, completed_at | Human verification challenge records |
| `account_recovery_keys` | id, user_id, recovery_key_hash, generated_at, last_used_at, invalidated_at, confirmation_completed | Hashed recovery key (24-word mnemonic / 32-byte hex) — confirmation_completed tracks whether the user passed the mandatory word verification step |
| `recovery_guardians` | id, user_id, guardian_user_id_enc (encrypted), guardian_id_hash (for server-side threshold counting), designated_at, accepted, removed_at | Encrypted guardian designations — server stores hash for counting approvals but cannot identify guardians without client decryption |
| `social_recovery_requests` | id, user_id, status (pending/approved/cancelled/expired/completed), pow_nonce, initiated_at, expires_at (72h), completed_at, new_device_key_id | Social recovery attempts — one active request per account, rate-limited to 1 per 30 days |
| `social_recovery_approvals` | id, request_id, guardian_id_hash, approved, responded_at, revoked_at | Individual guardian responses to a social recovery request — matched by hash, not plaintext guardian ID |
| `continuity_claims` | id, new_user_id, old_username, old_user_id, status (pending/partial/completed/expired), created_at, expires_at (30d) | Community vouching claims — new account claiming community position of a lost old account |
| `continuity_vouches` | id, claim_id, voucher_id, vouch_type (server_admin/friend), target_server_id (nullable), created_at | Individual vouches for a continuity claim — server admins vouch for server membership, friends vouch for friend list |
| `server_backups` | id, server_id, created_by, structure_snapshot (jsonb), includes_messages, storage_url_enc, size_bytes, created_at, expires_at | Restorable server snapshots |
| `bookmarks` | id, user_id, message_id, channel_id, server_id, tags (array), note, created_at | Personal saved-messages collection |
| `scheduled_messages` | id, channel_id, author_id, content_ciphertext, content_iv, scheduled_for, status (pending/sent/cancelled), created_at | Messages queued for future delivery |
| `raid_events` | id, server_id, detected_at, trigger_reason, accounts_involved (array), actions_taken (jsonb), resolved_at | Raid detection event log |
| `platform_reports` | id, reporter_id, target_type (user/server/file), target_id, reason, evidence (jsonb), legal_hook_sent, content_preserved, status (pending/investigating/resolved/dismissed/escalated), assigned_to, created_at | Platform-level trust & safety reports — target_type includes `file` for media reports; legal_hook_sent tracks external reporting; content_preserved tracks forensic snapshots |
| `event_log` | event_id (snowflake), channel_id, channel_seq (bigint), event_type, payload (jsonb), timestamp | **Append-only, partitioned by (channel_id, month).** Source of truth for all state changes. Clients never read this directly. channel_seq is the per-channel monotonic sequence number for gap detection and replay. State tables are derived from events via event processors |
| `media_scan_queue` | id, attachment_id, status (pending/scanning/clean/flagged/rejected), mime_verified, virus_scan_result, dimensions_valid, flagged_reason, scanned_at, created_at | Upload safety pipeline — every file queued for MIME verification, virus scan, and dimension checks before delivery |
| `account_cooldowns` | id, user_id, action_type (create_server/change_username/send_dm/create_invite), cooldown_until, created_at | Per-action cooldowns for new and low-trust accounts |
| `file_hashes` | id, content_hash (SHA-256, unique), storage_key (S3 object key), size, reference_count, created_at | Content-addressable file deduplication — multiple attachments with the same hash share one S3 object. reference_count tracks active references for GC |
| `server_takedowns` | id, server_id, issued_by (platform admin), reason, evidence_snapshot_url, status (active/lifted/appealed), issued_at, lifted_at | Platform-initiated server suspensions for illegal content or TOS violations |
| `activity_snapshots` | id (snowflake), server_id (FK → servers), message_count, voice_user_count, active_user_count, reaction_count, new_member_count, inserted_at | Periodic server activity snapshots — aggregated for topology heat map. Rolling 30-minute window. Recorded by background job or event hooks |
| `content_preservations` | id, report_id, file_hash, original_uploader_id, channel_id, server_id, context_messages (jsonb), preserved_at, storage_url_enc | Forensic snapshots of reported content — tamper-evident, retained regardless of deletion or TTL |
| `compliance_audit_log` | id, event_type (account_lifecycle/moderation_action/auth_event/data_request/legal_report), actor_id (nullable), target_id, details (jsonb), ip, timestamp | Platform-level compliance audit log — immutable, separate from server audit logs, retained per legal requirements |
| `age_declarations` | id, user_id, declared_at, ip, user_agent | Record of 13+ age self-declaration on account creation |
| `tos_acceptances` | id, user_id, tos_version, accepted_at, ip | Versioned Terms of Service acceptance records |
| `support_tickets` | id (snowflake), user_id, category (bug_report/account_issue/age_flag_appeal/trust_safety/feature_request/billing/other), subject, status (open/in_progress/awaiting_response/resolved/closed), priority (normal/elevated/urgent), assigned_to (nullable), client_version, os_info, satisfaction_rating (nullable), created_at, updated_at, resolved_at | In-app support ticket system |
| `ticket_messages` | id (snowflake), ticket_id, author_id, author_type (user/agent), content, attachments (jsonb), created_at | Threaded messages within support tickets |
| `age_flag_appeals` | id, ticket_id, user_id, behavioral_score_at_flag, appeal_method (text_review/video_call/attestation), video_call_at (nullable), video_call_duration_seconds (nullable), agent_determination (confirmed/not_confirmed/pending), resolved_at | Age flag appeal records — no personal data stored, only binary determination |
| `underage_reports` | id, reporter_id, reported_user_id, reason, evidence (jsonb, nullable), context (under_13/under_18_nsfw), status (pending/investigating/confirmed/dismissed), reviewed_by (nullable), created_at, resolved_at | User-submitted reports of suspected underage accounts — triggers T&S review of behavioral age confidence |
| `server_rules` | id, server_id, content (text), version, updated_by, created_at | Versioned server rules — members re-prompted on updates |
| `server_rule_acceptances` | server_id, user_id, rules_version, accepted_at | Tracks which rules version each member has accepted |
| `federated_nodes` | id, node_name, operator_org_id, node_public_key, node_url, plan (business/community), identity_mode (central/company), federation_enabled, registered_at, certificate_expires_at, last_heartbeat_at, status (active/suspended/decommissioned) | Registry of authorized private/federated nodes — identity_mode determines auth source and external DM capability |
| `node_servers` | id, node_id, server_id, sync_status (synced/pending/error) | Maps which servers live on which node — central tracks for federation routing |
| `legal_holds` | id, node_id, target_type (user/channel/server), target_id, reason, placed_by, placed_at, lifted_at, active | Legal hold records for business nodes — blocks purge of held content |
| `retention_policies` | id, node_id, server_id (nullable), channel_id (nullable), retention_days, created_by, created_at, updated_at | Message retention rules scoped to node, server, or channel |
| `node_identity_sync` | id, node_id, user_id, ldap_dn (nullable), sso_subject (nullable), provisioned_at, last_synced_at, deprovisioned_at | Tracks enterprise directory ↔ Burrow identity mapping per node |

### Permissions Bitfield

Permissions stored as a 64-bit integer on roles and channel overrides:

```
Bit 0  — View Channel
Bit 1  — Send Messages
Bit 2  — Embed Links
Bit 3  — Attach Files
Bit 4  — Add Reactions
Bit 5  — Mention Everyone
Bit 6  — Manage Messages
Bit 7  — Read Message History
Bit 8  — Connect (voice)
Bit 9  — Speak (voice)
Bit 10 — Stream (video/screen)
Bit 11 — Mute Members
Bit 12 — Deafen Members
Bit 13 — Move Members
Bit 14 — Use Voice Activity
Bit 15 — Manage Channel
Bit 16 — Manage Roles
Bit 17 — Manage Server
Bit 18 — Kick Members
Bit 19 — Ban Members
Bit 20 — Create Invite
Bit 21 — Change Nickname
Bit 22 — Manage Nicknames
Bit 23 — Manage Emoji
Bit 24 — Manage Webhooks
Bit 25 — Manage Threads
Bit 26 — Administrator (all permissions)
Bit 27 — Use Soundboard
Bit 28 — Use External Emoji
Bit 29 — View Audit Log
Bit 30 — Send TTS Messages
Bit 31 — Manage Events
Bit 32 — Priority Speaker
Bit 33 — Use Camera
Bit 34 — Create Public Threads
Bit 35 — Create Private Threads
Bit 36 — Send Messages in Threads
Bit 37 — Use Application Commands
Bit 38 — Timeout Members
Bit 39 — Use External Sounds
Bit 40 — Manage AutoMod
Bit 41 — View Full Audit Log (see unredacted admin log; without this, users only see public transparency log)
Bit 42 — Export Audit Log
Bit 43 — Manage Plugins
Bit 44 — Record Voice (permission to record/capture voice channel audio)
Bit 45 — Manage Invites (create, edit, revoke invite links)
Bit 46 — Manage Server Backups (create, restore, delete server backups)
Bit 47 — Schedule Messages (create and manage scheduled messages)
Bit 48 — Manage Events (create, edit, delete events in events channels)
Bit 49 — Manage Game Servers (add, edit, remove game server connections)
Bit 50 — Manage Dashboard (edit server dashboard layout and widgets)
Bit 51 — Manage Gallery (moderate gallery posts — edit tags, remove posts)
Bit 52 — Manage Forum (moderate forum threads — edit tags, mark solved, lock threads)
Bit 53 — Manage File Repository (upload, version, delete files in file repo channels)
```

---

## 4. Real-time Architecture

### Event-Driven Core

> **Everything is an event.** All state changes in Burrow originate as events in an append-only event log. State tables (messages, members, channels, etc.) are **derived projections** — rebuilt from the event stream by event processors. This makes audit logs trivial, real-time push natural, and full state recovery possible.

#### Event Flow

```
┌───────────┐      ┌─────────────────┐      ┌─────────────────┐      ┌────────────┐
│  Client  │────>│  Gateway (WS)   │────>│  Message Bus     │────>│  Services  │
└───────────┘      └─────────────────┘      └─────────────────┘      └──────┬─────┘
                                                                         │
                                                                    ┌────┴───────────┐
                                                                    │  Event Log     │
                                                                    │  (append-only) │
                                                                    └────┬───────────┘
                                                                         │
                                                                    ┌────┴───────────┐
                                                                    │ Event          │
                                                                    │ Processor      │
                                                                    └────┬───────────┘
                                                                         │
                                                              ┌────────┴─────────┐
                                                              │ State Tables     │
                                                              │ (messages, etc.) │
                                                              └──────────────────┘
```

#### Event Log Schema

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | snowflake | Globally unique, time-sortable event ID |
| `channel_id` | uuid | Scope of the event (nullable for global events) |
| `channel_seq` | bigint | **Server-side monotonically increasing sequence number per channel.** Assigned by the service on write, never by the client. Clients use this to detect gaps (missed events) and request replays without complex conflict resolution |
| `event_type` | enum | `message_create`, `message_edit`, `message_delete`, `user_join`, `user_leave`, `role_update`, `channel_create`, `channel_update`, `channel_delete`, `member_update`, `typing_start`, `presence_update`, `voice_state_update`, etc. |
| `payload` | jsonb | Full event data (before/after state, actor, metadata) |
| `timestamp` | timestamptz | When the event occurred |

#### Channel Sequence Numbers

> Every channel maintains a **server-side monotonically increasing sequence counter** (`channel_seq`). Each event scoped to a channel gets the next number in the sequence. This gives clients a simple, gapless ordering mechanism.

| Property | Description |
|----------|-------------|
| **Assignment** | Sequence numbers are assigned server-side only — never by the client |
| **Gapless per channel** | Within a channel, sequence numbers are contiguous (1, 2, 3, ...). A gap means the client missed events |
| **Reconnect sync** | On reconnect, client sends its last known `channel_seq` per channel. Server replays all events with `seq > last_known_seq` — no diffing, no vector clocks |
| **Ordering** | Clients sort messages by `channel_seq` — not by timestamp. Timestamps are for display only |
| **Concurrency** | Sequence is incremented via `SELECT ... FOR UPDATE` or PostgreSQL `SEQUENCE` per channel — serialized, no duplicates |
| **Cross-channel** | Sequence numbers are scoped per channel — they do not provide cross-channel ordering (use `event_id` snowflake for global ordering) |

#### Rules

- **Append-only**: Events are never modified or deleted
- **Clients never read the event log** — they read state tables and receive real-time pushes
- **State tables are projections**: `messages`, `server_members`, `channels`, `roles`, etc. are derived from events by event processors
- **Rebuilding state**: Drop and replay the event log to reconstruct any state table from scratch
- **Uses**: Audit logs, real-time notifications, bot event delivery, analytics, debugging, disaster recovery

#### Event Processing Flow

```
1. Service receives request (e.g., send message)
2. Service writes event to event_log (append-only)
3. Event processor reads new events:
   a. Updates state table (e.g., INSERT into messages)
   b. Publishes to message bus for real-time delivery
4. Gateway receives from message bus → pushes to subscribed clients
5. Audit log, notifications, bot webhooks all consume the same event stream
```

### Gateway Architecture

> The WebSocket gateway is **stateless** — it holds no application state, only WebSocket connections and their subscriptions. This allows horizontal scaling by spinning up more gateway instances behind a load balancer.

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────────┐
│ Client A │───>│  Gateway #1  │───>│                │     │                  │
└──────────┘     └──────────────┘     │  Message Bus   │───>│  Backend         │
┌──────────┐     ┌──────────────┐     │  (Redis/NATS)  │     │  Services        │
│ Client B │───>│  Gateway #2  │───>│                │<───│  (Phoenix)       │
└──────────┘     └──────────────┘     │                │     │                  │
┌──────────┐     ┌──────────────┐     │                │     │                  │
│ Client C │───>│  Gateway #N  │───>│                │     │                  │
└──────────┘     └──────────────┘     └────────────────┘     └──────────────────┘
```

| Property | Description |
|----------|-------------|
| **Stateless** | Gateways hold WebSocket connections and subscription lists only — no user data, no message state |
| **Horizontally scalable** | Spin up more gateway instances behind a load balancer to handle more connections |
| **Connection routing** | Client connects to any gateway; gateway authenticates via token, subscribes to relevant message bus topics |
| **Heartbeat** | Gateways send periodic heartbeats to clients; missed heartbeats trigger reconnection |
| **Resumable sessions** | Clients track the last received event sequence; on reconnect, gateway replays missed events from the bus |
| **Message bus** | Redis Pub/Sub (simple) or NATS/RabbitMQ (production) as the inter-gateway communication layer |

### Client Event Subscriptions

> Clients subscribe to events via the gateway — **no polling** for high-priority data. The gateway pushes events to clients in real-time based on their subscriptions. Low-priority, high-churn data (presence, typing) uses debouncing and batching to avoid overwhelming clients.

#### High-Priority Events (Real-time Push)

| Event | Payload | When |
|-------|---------|------|
| `message_create` | message object + `channel_seq` | New message in a subscribed channel |
| `message_edit` | message object (updated) + `channel_seq` | Message edited |
| `message_delete` | message_id, channel_id, `channel_seq` | Message deleted |
| `user_join` | member object, server_id | User joins a server |
| `user_leave` | user_id, server_id | User leaves/is removed |
| `role_update` | role object, server_id | Role created/modified/deleted |
| `channel_create` | channel object | Channel created |
| `channel_update` | channel object | Channel settings changed |
| `channel_delete` | channel_id, server_id | Channel removed |
| `voice_state_update` | user_id, channel_id, mute/deafen state | Voice state change |
| `member_update` | member object, server_id | Nickname, roles, or persona changed |
| `server_update` | server object | Server name/icon/settings changed |
| `notification` | notification object | DM, mention, keyword alert |
| `reaction_add` | message_id, user_id, emoji | Reaction added |
| `reaction_remove` | message_id, user_id, emoji | Reaction removed |

#### Debounced / Batched Events (High-Churn)

> Presence and typing indicators are high-frequency, low-value events. They are **debounced server-side** and **batched** before delivery to clients to prevent WebSocket flooding.

| Event | Strategy | Details |
|-------|----------|--------|
| `typing_start` | **Debounced** — server emits at most once per 8 seconds per user per channel | Client sends typing heartbeat every 5s while typing. Server deduplicates and only forwards the first event per 8s window. Typing indicator auto-expires client-side after 10s without a new event |
| `presence_update` | **Batched** — server collects presence changes and delivers in batches every 5 seconds | Individual online/offline/idle/dnd changes are aggregated into a batch payload. For large servers (>1000 members), only presence of friends + members in the current voice/text channel is pushed; full member presence is available via **client poll** on the member list endpoint |
| `presence_update` (large servers) | **Poll fallback** — clients poll `/api/servers/{id}/members/presence` for full member list presence | Poll interval: 30s for visible member list, 60s for background servers. Reduces per-connection event volume by 10-100x for large servers |

#### Low-Priority Poll Endpoints

> For data that changes infrequently or is only needed on-demand, clients **poll** instead of subscribing.

| Endpoint | Poll Interval | Data |
|----------|---------------|------|
| `GET /api/servers/{id}/members/presence` | 30s (active), 60s (background) | Full member list with presence status for large servers |
| `GET /api/users/@me/read-states` | 60s | Unread counts and last-read markers across all channels |
| `GET /api/servers/{id}/member-count` | 120s | Total / online member counts |

### Phoenix Channels Topics

| Topic Pattern | Purpose |
|---------------|---------|
| `server:{server_id}` | Server-wide events (member join/leave, role changes, settings updates) |
| `channel:{channel_id}` | Message events (new, edit, delete), typing indicators |
| `dm:{dm_channel_id}` | Direct message events |
| `user:{user_id}` | Personal events (notifications, friend requests, presence updates) |
| `voice:{channel_id}` | Voice channel signaling (join, leave, mute state, WebRTC offer/answer/ICE) |
| `presence` | Global presence tracking (online/idle/dnd/offline status changes) |

### PubSub Fan-out Architecture

> Message delivery to large channels is the first scaling wall. A single message in a 2,000-member server generates 2,000 WebSocket pushes. At 200 msg/sec, that's **400k deliveries/sec**. This section documents how Burrow handles fan-out efficiently.

#### Fan-out Model

```
Message produced
 ↓
Phoenix.PubSub (pg2 / Redis Pub/Sub)
 ↓
Node-local subscribers only
 ↓
Push to connected WebSocket clients on this node
```

Clients are **never** iterated globally. PubSub routes events to **nodes** that have interested subscribers. Each node only pushes to its own local WebSocket connections.

| Property | Description |
|----------|-------------|
| **Topic sharding** | Events are scoped to fine-grained topics (`channel:{id}`, `dm:{id}`, `user:{id}`). A client only subscribes to topics for channels it has open — not every channel in every server |
| **Node-local delivery** | Phoenix.PubSub uses `pg2` (Erlang process groups) to route messages only to nodes with subscribers. A node with zero subscribers for a topic receives zero messages |
| **Lazy subscriptions** | Clients subscribe to a `channel:{id}` topic only when they **join** that channel in the gateway. Navigating away unsubscribes. This keeps per-connection topic count low (typically 1–5 active channels) |
| **Server-wide fan-out** | Server-level events (member join/leave, role changes) fan out on `server:{id}` — but only gateway nodes with members of that server receive the event |
| **Inter-node transport** | Development: Erlang distribution (pg2). Production: Redis Pub/Sub or NATS for cross-node message bus. Configurable via `Phoenix.PubSub` adapter |
| **Backpressure** | If a client's WebSocket send buffer exceeds 64KB, events are dropped with a `MISSED_EVENTS` signal, prompting the client to resync via `last_seq` replay |

#### Scaling Thresholds

| Threshold | Strategy |
|-----------|----------|
| **< 10k concurrent connections** | Single Phoenix node with `pg2` PubSub. No sharding needed |
| **10k – 100k connections** | Multiple Phoenix gateway nodes behind load balancer. `pg2` over Erlang distribution for inter-node PubSub |
| **100k – 1M connections** | Redis Pub/Sub or NATS adapter for PubSub. Gateway nodes are stateless — scale horizontally. Consider dedicated gateway nodes (no API traffic) |
| **> 1M connections** | Shard PubSub by `channel_id` across multiple Redis/NATS instances. Geographic gateway clusters with regional PubSub buses |

#### Topic Hierarchy

```
server:{server_id}              ← server-wide events (member changes, settings)
├── channel:{channel_id}        ← message events, typing
│   └── thread:{thread_id}      ← thread-specific events (future)
├── voice:{channel_id}          ← voice signaling
dm:{dm_channel_id}              ← DM events
user:{user_id}                  ← personal notifications, friend requests
user_presence:{user_id}         ← batched presence updates
```

### WebRTC Voice/Video Flow

```
User A                    Phoenix Server (SFU)                 User B
  │                              │                                │
  ├─── join voice:{channel} ────>│<──── join voice:{channel} ─────┤
  │                              │                                │
  ├─── WebRTC Offer ────────────>│──── Forward Offer ────────────>│
  │                              │                                │
  │<──── WebRTC Answer ──────────│<─── WebRTC Answer ─────────────┤
  │                              │                                │
  ├─── ICE Candidates ─────────>│──── ICE Candidates ────────────>│
  │<──── ICE Candidates ────────│<─── ICE Candidates ─────────────┤
  │                              │                                │
  ├══════ Media Stream (audio/video/screen) via SFU ══════════════┤
```

- **Small calls (≤4 users)**: Peer-to-peer mesh via WebRTC
- **Larger calls**: SFU (Selective Forwarding Unit) — consider [mediasoup](https://mediasoup.org/), [Janus](https://janus.conf.meetecho.com/), or [LiveKit](https://livekit.io/)
- **Streaming**: SFU forwards the streamer's feed to all viewers (one upload, many downloads)

### Rate Limiting

> Three-layer rate limiting to prevent spam, abuse, and bot flooding. Each layer operates independently — a request must pass all three.

| Layer | Scope | Mechanism | Limits |
|-------|-------|-----------|--------|
| **IP Rate Limiting** | Per IP address | Token bucket at the load balancer / reverse proxy (Nginx, Cloudflare) | 100 req/s general; 10 req/s for auth endpoints; 3 req/s for account creation. Shared across all connections from that IP |
| **User Rate Limiting** | Per authenticated user | Sliding window tracked in Redis | Varies by trust tier (see trust table). Tier 0: 5 msg/min, 20 API calls/min. Tier 4: 120 msg/min, 300 API calls/min. Covers messages, reactions, API calls, file uploads |
| **Server Rate Limiting** | Per server (aggregate) | Sliding window tracked in Redis | 500 msg/min per server (scales with member count). Prevents a single server from overwhelming the system. Burst allowance for active events |

| Feature | Description |
|---------|-------------|
| Graduated penalties | Repeated rate limit hits escalate: first = 429 response, second = 30s cooldown, third = 5m cooldown, sustained = temporary account restriction |
| Trust-adjusted limits | Higher trust tiers get higher rate limits (defined in trust restrictions table) |
| Endpoint-specific limits | Auth endpoints, file uploads, invite creation, server creation each have independent stricter limits |
| Bot accounts | Bot accounts get separate, higher rate limits with mandatory `X-RateLimit-*` response headers |
| Retry-After headers | All 429 responses include `Retry-After` and `X-RateLimit-Reset` headers |

### Media Safety Pipeline

> Every uploaded file goes through a safety pipeline **before** it is served to any user. Files are held in a quarantine state until cleared.

```
Upload → Quarantine Storage → MIME Verify → Virus Scan → Dimension/Size Check → Sanitize → CDN
                                  ↓              ↓               ↓                ↓
                               Reject         Reject          Reject          Strip metadata
                            (type mismatch) (malware found) (exceeds limits)  (EXIF, scripts)
```

| Step | Description |
|------|-------------|
| **MIME Verification** | Verify file magic bytes match the declared Content-Type — reject mismatches (e.g., `.jpg` that is actually an `.exe`). Never trust the client-provided MIME type |
| **Virus Scanning** | Queue every upload through ClamAV (or similar). Files remain in quarantine until scan completes. Flagged files are rejected and logged |
| **Image Dimension Limits** | Max 8192×8192 pixels. Reject images that would decompress to excessive memory (decompression bomb protection). Animated GIF frame limit: 1000 frames |
| **Video/Audio Limits** | Max duration, bitrate caps, codec whitelist (H.264/VP9/AV1/Opus/AAC) |
| **Metadata Stripping** | Strip all EXIF, GPS, and embedded metadata from images before storage. Strip embedded scripts from SVGs |
| **Embed Sanitization** | Aggressively sanitize OpenGraph/oEmbed previews — allowlist HTML tags, strip JavaScript, validate URLs, enforce HTTPS, limit response size (512KB max). Never render raw HTML from external sources |
| **Content-Disposition** | Force `Content-Disposition: attachment` for non-previewable file types — prevent browser execution |
| **Scan Status** | Every attachment has a scan status (pending/scanning/clean/flagged/rejected) visible in the media_scan_queue table. Clients show a "scanning..." placeholder until cleared |
| **Ephemeral File Monitoring** | Ephemeral/TTL files go through the same full safety pipeline as permanent uploads — no bypass. TTL does not exempt a file from scanning |
| **File Deduplication** | SHA-256 content hash computed on upload. If a matching hash already exists in `file_hashes`, the upload references the existing storage object instead of storing a duplicate. Saves storage and speeds up repeated uploads (e.g., same meme shared across servers). Dedup is transparent — each attachment row is distinct, but they share the same S3 object |
| **Automated File Moderation** | Files are automatically checked for: executable content (PE/ELF/Mach-O headers), archive bombs (recursive zip), polyglot files (e.g., GIFAR), oversized animated media, and known-malicious hashes. Platform is 13+ so NSFW content is restricted to age-gated channels/servers (users must self-declare 18+ to access NSFW content) — CSAM detection is handled externally by Cloudflare |
| **CDN Delivery** | All cleared files are served via CDN (S3-backed) with signed, expiring URLs. Clients never access S3 directly — all reads go through the CDN layer |

### Client-Side Caching & Reconnect Reconciliation

> Clients locally cache high-frequency data to reduce API load and improve perceived performance. On reconnect, clients reconcile with the server using channel sequence numbers — no full resync needed.

#### Cached Data

| Cached Data | Strategy | TTL / Invalidation |
|-------------|----------|--------------------|
| Recent messages | Last 100 messages per channel in IndexedDB / SQLite | Invalidated by `message_edit` / `message_delete` events |
| Attachments (thumbnails) | Thumbnail and preview images cached on disk | Evicted LRU when cache exceeds 500MB; invalidated by TTL expiry events |
| Server list | Full server list + member counts | Invalidated by `server_update` / `user_join` / `user_leave` events |
| Channel list | All channels per server with positions | Invalidated by `channel_create` / `channel_update` / `channel_delete` events |
| Avatars | Disk cache with ETag / If-Modified-Since | Revalidate on `member_update` / `presence_update` |
| Roles & permissions | Per-server role list with bitfield permissions | Invalidated by `role_update` events |
| User profiles | Display name, avatar, status | Invalidated by `presence_update` events |
| Emoji | Custom emoji list per server | Invalidated by server emoji events |
| Channel metadata | Channel IDs, names, types, positions, slow mode settings | Invalidated by `channel_update` events |
| Role IDs & hierarchy | Role IDs, positions, colors, permission bitfields | Invalidated by `role_update` events |

#### Reconnect Reconciliation

> When a client reconnects after a disconnect, it sends its **last known `channel_seq` per channel** to the gateway. The server replays only the events the client missed — no full state resync.

| Step | Description |
|------|-------------|
| 1. Client reconnects | Client opens new WebSocket to any gateway, re-authenticates with token |
| 2. Client sends resume payload | `{ last_seq: { channel_id_1: 4502, channel_id_2: 891, ... } }` |
| 3. Server replays missed events | For each channel, server sends all events where `channel_seq > client_last_seq` |
| 4. Gap detection | If the gap is too large (>500 events per channel) or the events have been pruned, server sends a `FULL_SYNC` signal and client re-fetches state from REST API |
| 5. Cache reconciliation | Client applies replayed events to its local cache — updates messages, roles, channels, members as needed |
| 6. Staleness check | Client compares cached metadata (server name, channel list, role list) against the reconciliation payload and updates any stale entries |

#### Reconnect Jitter & Backoff

> When a server restarts or a network hiccup occurs, thousands of clients may reconnect simultaneously — effectively DDoSing the infrastructure. Clients **must** implement jitter to spread reconnections over time.

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Base delay** | 1 second | Minimum wait before first reconnect attempt |
| **Max delay** | 30 seconds | Cap on backoff |
| **Backoff multiplier** | 2× | Exponential: 1s → 2s → 4s → 8s → 16s → 30s |
| **Jitter** | ±50% random | Each delay is randomized ±50% to prevent thundering herd (e.g., 4s ± 2s = 2–6s) |
| **Reset** | On successful connection | After a stable connection (heartbeat received), the backoff counter resets to 0 |
| **Server drain signal** | `RECONNECT` event with `retry_after` | When a gateway is draining for upgrade, it sends a `RECONNECT` event with a `retry_after` field. Clients add this to their jitter delay. The server staggers `retry_after` across clients (0–30s) to spread reconnections evenly across surviving gateways |

**Client pseudocode:**

```
attempt = 0
loop:
  delay = min(BASE * (2 ^ attempt), MAX_DELAY)
  jitter = delay * random(-0.5, 0.5)
  wait(delay + jitter + server_retry_after)
  try connect()
  if success:
    attempt = 0
    break
  attempt += 1
```

| Scenario | Behavior |
|----------|----------|
| Clean disconnect (user navigates away) | No reconnect |
| Network hiccup (< 5s) | Reconnect immediately (attempt 0 = ~1s) |
| Server restart | `RECONNECT` event → clients jitter over 0–30s window |
| Sustained outage | Exponential backoff to 30s cap, keeps retrying |
| Failed auth on reconnect | Stop retrying, show "Session expired" |

### Observability

> Prometheus metrics exported for Grafana dashboards. All services expose a `/metrics` endpoint.

| Metric | Type | Description |
|--------|------|-------------|
| `burrow_ws_connections_active` | Gauge | Current active WebSocket connections across all gateways |
| `burrow_ws_connections_total` | Counter | Total WebSocket connections since startup |
| `burrow_messages_per_second` | Gauge | Messages processed per second (rolling window) |
| `burrow_messages_total` | Counter | Total messages processed |
| `burrow_upload_bytes_total` | Counter | Total bytes uploaded |
| `burrow_upload_bandwidth_mbps` | Gauge | Current upload bandwidth in Mbps |
| `burrow_api_requests_total` | Counter | HTTP API requests by endpoint, method, status code |
| `burrow_api_latency_seconds` | Histogram | API response latency by endpoint |
| `burrow_error_rate` | Gauge | Errors per second by service |
| `burrow_rate_limit_hits_total` | Counter | Rate limit 429 responses by layer (IP/user/server) |
| `burrow_media_scan_queue_size` | Gauge | Files waiting in the media safety scan queue |
| `burrow_event_log_lag` | Gauge | Delay between event write and event processor consumption |
| `burrow_voice_sessions_active` | Gauge | Active voice channel participants |
| `burrow_db_pool_usage` | Gauge | Database connection pool utilization |

### Database Migration Strategy

> Schema will evolve over time. All changes go through a versioned migration system with rollback capability.

| Principle | Description |
|-----------|-------------|
| **Schema Versioning** | Every migration has a timestamp-prefixed version number (e.g., `20260310120000_add_event_log.exs`). Migrations run in order, tracked in a `schema_migrations` table |
| **Migration Scripts** | All schema changes are expressed as Ecto migrations — forward (`up`) and reverse (`down`) functions. No manual DDL outside of migrations |
| **Rollback Capability** | Every migration must have a working `down` function. Rollbacks are tested in CI before merge |
| **Non-Destructive by Default** | Prefer additive changes (add columns, add tables) over destructive ones (drop columns, rename). Destructive changes require a two-phase migration: deprecate → migrate data → remove |
| **Zero-Downtime Migrations** | Schema changes must be backward-compatible with the previous application version (no breaking column renames/drops while old code is still running) |
| **Data Migrations** | Large data migrations run as background tasks (Oban jobs), not in the migration transaction |
| **CI Validation** | Migrations are tested against a snapshot of production schema in CI — catches conflicts, validates up/down, checks for lock-heavy operations |

### Event Log & State Table Partitioning

> Both the event log and large state tables are partitioned to prevent table bloat and maintain query performance at scale.

| Table | Partition Strategy | Details |
|-------|-------------------|--------|
| `event_log` | **Range partition by (channel_id, month)** | Each channel gets monthly partitions. Old partitions can be archived to cold storage (S3) without affecting active queries. Partition pruning ensures queries only hit relevant months |
| `messages` | **Range partition by (channel_id, month)** | Already specified — primary key is (channel_id, id). Monthly partitions keep per-channel queries fast even with billions of total messages |
| `reactions` | **Hash partition by message_id** | Distribute reaction lookups across partitions |
| `audit_logs` | **Range partition by month** | Monthly partitions for compliance and archival |
| `media_scan_queue` | **Range partition by created_at (weekly)** | Rotate out processed scan records |

#### State Table Sharding (Large Channels)

> For channels with very high message volume (>100k messages/month), state tables can be **sharded** across database instances.

| Property | Description |
|----------|-------------|
| **Shard key** | `channel_id` — all data for a channel lives on the same shard |
| **Shard routing** | Application-level routing: hash `channel_id` to determine which database instance handles reads/writes |
| **Shard count** | Start with 1 (single DB), add shards as needed. Resharding uses logical replication to migrate channels |
| **Cross-shard queries** | Avoided by design — queries are always scoped to a single channel. Global queries (search, analytics) run against read replicas or the event log |
| **Event processors** | Each shard has its own event processor that consumes from the event log and updates its local state tables |

### UX Safety & Feedback

> Subtle UX details that prevent user frustration and data loss. These should be implemented from day one — they're much harder to retrofit.

| Feature | Description | Priority |
|---------|-------------|----------|
| **Ephemeral File Expiry Indicator** | Files with TTL show a visible countdown badge (e.g., "Expires in 2d 14h"). Color shifts from neutral → yellow → red as expiry approaches. Expired files show a clear "File expired" tombstone, not a broken link | P0 |
| **Upload Progress & Failure Feedback** | Upload progress bar with percentage, speed, and ETA. On failure: clear error message ("File too large", "Type not allowed", "Virus detected"), retry button, and option to save locally. Never silently fail | P0 |
| **Mass Deletion Guard** | Bulk message delete requires explicit confirmation ("Delete 47 messages? This cannot be undone."). Server/channel deletion has a 72-hour grace period with undo. File purge operations require re-authentication | P0 |
| **Server Rules Display** | New members see server rules on join (if configured). Rules must be accepted before sending first message. Rules are always accessible via a pinned "Rules" section in the sidebar | P1 |
| **Verification Gate Feedback** | If a server requires verification (trust tier, rules acceptance, waiting period), show the user exactly what's required and their progress. Never just silently block actions | P1 |
| **Scanning Placeholder** | While a file is in the safety scan queue, show a "Scanning..." placeholder with a spinner — not a broken image. If scan takes >30s, show "Still scanning, this may take a moment" | P0 |
| **Offline Indicator** | Clear visual indicator when the client is disconnected. Queued messages show a clock icon. On reconnect, briefly show "Reconnected — syncing..." toast | P0 |
| **Rate Limit Feedback** | When rate-limited, show the user a specific countdown ("You can send again in 12s") — not a generic error. Differentiate between slow mode (channel setting) and trust-tier rate limits | P1 |
| **Dangerous Permission Warnings** | When assigning roles with dangerous permissions (Administrator, Manage Server, Ban Members), show a warning: "This permission allows [X]. Are you sure?" | P1 |

### Backup & Disaster Recovery

> Platform-level backup strategy for databases, event logs, and file storage. Separate from user-facing server backups.

| Component | Strategy | Frequency | Retention |
|-----------|----------|-----------|-----------|
| **PostgreSQL Snapshots** | `pg_dump` logical backups + WAL-based continuous archiving to S3 | Logical: daily; WAL: continuous | Logical: 30 days; WAL: 14 days |
| **Event Log Backups** | Old event log partitions archived to S3 cold storage (Glacier-class). Active partitions backed up via WAL | Monthly partition archive; WAL continuous | Archived partitions: 1 year minimum (compliance). Active: 14 days WAL |
| **S3 File Storage** | S3 versioning enabled; cross-region replication for critical buckets (avatars, backups); lifecycle policies for TTL cleanup | Continuous (S3-native) | Per TTL tier; versioning retains 30 days of deleted objects |
| **Redis State** | Redis used as cache/bus only — no persistent data. Rebuilt from DB/event log on restart | N/A (ephemeral) | N/A |
| **Recovery Testing** | Automated monthly restore test: spin up a fresh environment, restore from latest backup, run validation queries, verify event replay | Monthly | N/A |
| **RPO / RTO Targets** | Recovery Point Objective: <1 hour (WAL archiving). Recovery Time Objective: <4 hours (restore + replay + warm cache) | — | — |

### Compliance Audit Logs

> Minimal, tamper-evident audit logs retained for legal and regulatory compliance. Separate from server-level audit logs.

| Log | Contents | Retention |
|-----|----------|-----------|
| **Account lifecycle** | Account creation, deletion, suspension, recovery key use, device key registration/revocation | 7 years |
| **Content moderation actions** | Reports filed, takedowns issued, content quarantined, legal holds placed/lifted | 7 years |
| **Authentication events** | Successful and failed auth attempts, session creation, token rotation, MFA events | 2 years |
| **Data access requests** | GDPR/CCPA data export requests, account deletion requests, right-to-erasure fulfillment | 7 years |
| **Legal reporting** | CSAM reports forwarded to NCMEC, law enforcement data requests received and fulfilled | Indefinite |

### Legal & Age Compliance

> Burrow is a **13+ platform**. Legal compliance requirements for operation.
>
> **Privacy-first stance:** Burrow will **never** implement mandatory government ID verification, facial recognition, credit card age gates, or any form of identity document scanning — for any user, in any context. If a jurisdiction mandates hard ID verification as the only acceptable age assurance method, Burrow will **not operate in that market** rather than compromise user privacy. The platform's age assurance relies exclusively on self-declaration, behavioral analysis, community attestation, and voluntary human review (see Age Flag Appeal Process). This is a core platform value, not a cost-saving measure.

| Requirement | Implementation | Priority |
|-------------|----------------|----------|
| **Age Self-Declaration** | On account creation, users must confirm they are 13+ via a clear affirmative checkbox (not pre-checked). Declaration timestamp and IP logged. No age verification beyond self-declaration (no ID scanning). NSFW-flagged servers/channels require a separate 18+ age declaration to access | P0 |
| **Terms of Service** | Clear, readable ToS covering: acceptable use, content ownership, account termination, dispute resolution, liability limitations. Must be accepted on account creation; re-accepted on material changes. Version-tracked with acceptance timestamps | P0 |
| **Privacy Policy** | Comprehensive privacy policy covering: what data is collected, how it's stored (encrypted at rest), ephemeral media handling (TTL deletion is permanent, not recoverable), CSAM reporting obligations, data sharing with law enforcement, data retention periods, GDPR/CCPA rights | P0 |
| **Ephemeral Media Disclosure** | Privacy policy explicitly states: ephemeral files are permanently deleted after TTL expiry; platform retains no copies after purge **unless** content is under legal hold or has been reported. Users are informed that reported content may be preserved beyond TTL | P0 |
| **CSAM Reporting Obligation** | Cloudflare handles CSAM scanning at the CDN layer. Platform maintains a legal reporting pipeline to NCMEC CyberTipline. Any confirmed CSAM triggers: immediate content removal, account suspension, evidence preservation, automated NCMEC report | P0 |
| **Law Enforcement Cooperation** | Documented process for responding to valid legal requests (subpoenas, court orders, preservation requests). Requests logged in compliance audit log. User notified unless prohibited by gag order | P1 |
| **Data Retention Transparency** | Users can see what data the platform retains about them, including: messages (encrypted), files (with TTL status), account metadata, moderation history, trust score. Export available via GDPR endpoint | P1 |
| **Cookie / Tracking Disclosure** | Web client discloses any cookies or local storage used. No third-party tracking pixels or analytics SDKs that share data externally. All analytics are first-party and anonymized | P1 |
| **Behavioral Age Signal System** | Passive, privacy-preserving age estimation using only metadata the platform already collects — no face scanning, no IDs, no external identity providers. Runs server-side on anonymized behavioral data. See **Behavioral Age Signals** below for details | P1 |

#### Behavioral Age Signals

> Privacy-first age confidence scoring using only platform metadata. No biometric data, no identity verification, no external service calls. All signals are computed from data the platform already collects during normal operation. Users are never asked for personal information beyond the initial 13+ self-declaration.

**How it works:** Each account accumulates a background **age confidence score** (0–100) based on behavioral metadata patterns. The score is not shown to the user and does not restrict access on its own — it flags accounts for Trust & Safety review when the score drops below a configurable threshold.

| Signal Category | Metadata Used | Rationale |
|----------------|---------------|-----------|
| **Session Timing Patterns** | Login/active timestamps (hour-of-day, day-of-week distribution), **normalized to the user's system clock timezone** (reported by the client at connect time). All timing analysis uses the user's local time, not UTC — eliminates false positives from timezone differences. Seasonal adjustments account for school holiday schedules (summer break, spring break patterns) | School-age users show distinct patterns: low activity during school hours (8am–3pm local), spikes after 3pm and on weekends. Adult users show more uniform distribution. System-time normalization ensures a user in Tokyo isn't flagged for being active during US school hours |
| **Message Cadence** | Messages-per-minute rate, burst patterns, avg time between messages | Younger users tend toward rapid short bursts; adults trend toward steadier, less frequent messaging |
| **Message Length Distribution** | Character count per message (metadata only — not content; compatible with E2EE) | Shorter average message length and lower variance correlate with younger users |
| **Session Duration & Frequency** | Session length, sessions per day, total daily active time | Younger users tend toward more frequent shorter sessions; adults trend toward fewer longer sessions |
| **Feature Breadth** | Which platform features are used (roles, permissions, server management, integrations vs. just chat + reactions) | More advanced feature usage correlates with older, more experienced users |
| **Account Maturation Rate** | How quickly trust score advances, server count growth, friend count growth | Unusually rapid social graph expansion can indicate younger users |
| **Verification Challenge Performance** | Response patterns on human verification challenges (already in spec) | Cognitive challenge response characteristics vary by age group |
| **Social Graph Age Propagation** | Age confidence scores of a user's friend network (weighted average) | Users cluster by age — if most of someone's friends have high age confidence, theirs rises too. If most friends are flagged low-confidence, that's a signal. No friend data is exposed; only the aggregate score propagates |
| **Client-Side Vocabulary Complexity** | Flesch-Kincaid grade level score computed **on-device before encryption** — only the numeric score (e.g., `8.2`) is sent to the server, never the text itself | Writing complexity correlates strongly with age. Fully E2EE compatible: the client computes the score locally, strips the text, and sends only the number. Server never sees message content |
| **Reaction & Emoji Usage Patterns** | Emoji frequency, diversity of unique emoji used, ratio of emoji-only messages | Younger users tend toward higher emoji density and narrower emoji vocabulary (repeated favorites). Metadata only — which emoji, not message context |
| **Server/Channel Interest Clustering** | Categories and topics of servers joined (based on server tags/categories, not message content) | Users naturally gravitate toward age-appropriate communities. A user exclusively in gaming/meme servers vs. professional/finance servers is a soft signal |
| **Device Environment Signals** | User agent string parsing — OS parental control indicators (iOS Screen Time child accounts, Android Family Link, Windows Family Safety) report themselves in device capabilities | No new data collected — user agent strings are already sent with every HTTP request. Child-managed devices self-identify at the OS level |

#### Community Age Attestation

> Social proof of age — similar to Recovery Guardians, but for age confidence. Trusted community members vouch for a user's age when requested. No personal information is exchanged; attestors simply confirm "I believe this user is the age they declared."

**How it works:**
1. When an account's behavioral age confidence drops below the review threshold, or when a user wants to access NSFW content, they can optionally request **age attestation** from established community members
2. The system selects or the user nominates **3 attestors** who must meet eligibility requirements (see below)
3. Each attestor receives a private prompt: _"User X has requested age attestation. Based on your interactions with them, do you believe they are [13+/18+]?"_ — simple yes/no, optional free-text reason (visible only to T&S)
4. Attestations are recorded with timestamp and attestor ID. The attestor's own trust score and age confidence weight the attestation
5. If 2 of 3 attestors confirm, the user's age confidence score receives a significant boost

**Attestor eligibility:**
- Account age ≥ 6 months
- Trust tier ≥ 2 (Established)
- Own age confidence score > 70
- No active moderation strikes
- Must share at least one server with the user (they actually know them)
- Cannot attest for the same user more than once per 12 months
- Cannot attest for more than 5 users per month (prevents attestation farming)

**Anti-abuse protections:**
- If an attestor is later found to have falsely attested (e.g., vouched for a user who turns out to be underage), their own trust score takes a significant penalty and they lose attestation eligibility permanently
- Attestation rings (users attesting for each other in a circle) are detected via graph analysis and flagged for T&S review
- Attestations from users with low age confidence scores carry near-zero weight
- The system never reveals *why* attestation was requested (the attestor doesn't know if it's for NSFW access, low behavioral score, or voluntary)

**Privacy guarantees:**
- Attestors never learn the user's actual age, behavioral score, or reason for the request
- The attestation prompt reveals nothing beyond "this user is requesting age attestation"
- Attestation records are visible only to T&S staff, never to other users or moderators
- Users can see that they have active attestations but not the individual responses

**Privacy guarantees:**
- No message content is ever read or analyzed (fully E2EE compatible — only metadata like character count and timestamp)
- No external services or third-party APIs involved
- Signals are computed from data already collected for rate limiting, trust scoring, and abuse prevention
- Age confidence score is internal only — never exposed to users, moderators, or API consumers
- Score cannot be used for targeted advertising or shared externally
- Users can request their behavioral metadata via GDPR export (but it contains nothing beyond what's already in their data export)

**Action thresholds:**
- Score > 70: No action (high confidence of declared age)
- Score 40–70: Account flagged for passive monitoring (no user-visible effect)
- Score < 40: Account flagged for Trust & Safety review; if accessing NSFW content, may be prompted to re-confirm 18+ declaration
- Score is never used as the sole basis for account action — always requires human T&S review

#### Age Flag Appeal Process

> If the behavioral age system flags a user incorrectly, they are **never locked out silently**. The user receives a clear, non-alarming notification explaining that their access to age-restricted content has been paused pending review, with an immediate path to appeal via the in-app support ticket system.

**Appeal flow:**

1. **User receives notification**: _"Your access to age-restricted content has been paused for review. This is an automated check — if you believe this is an error, you can appeal instantly."_ — includes a one-tap "Appeal" button
2. **Ticket auto-created**: Tapping "Appeal" opens a pre-filled support ticket under the **Age Flag Appeal** category with elevated priority routing
3. **Initial text review**: Support agent reviews the account's behavioral signals, attestation history, and account age. Many false positives can be resolved here (e.g., a night-shift worker with unusual session timing)
4. **Video verification (last resort)**: If the text review is inconclusive, the agent can offer an **optional live video call**:
   - The user joins a one-time video call with a support agent directly in the app
   - The user can show a government ID briefly on camera — the agent visually confirms age but **nothing is recorded, screenshotted, or stored**
   - Alternatively, the user can simply appear on camera and the agent makes a visual age assessment without any ID
   - The call is **not recorded** — no video, no audio, no screenshots are saved. The only record is the agent's binary determination (confirmed/not confirmed) and a timestamp in the ticket
   - The agent cannot request specific personal details (full name, address, DOB) — only a visual confirmation
5. **Resolution**: If confirmed, the age flag is cleared, NSFW access is restored, and the behavioral score receives a permanent boost. If not confirmed, the restriction remains and the user is informed of next steps

**Privacy guarantees for video verification:**
- Video calls use ephemeral WebRTC connections — no server-side recording capability exists
- The platform **architecturally cannot record** these calls — there is no recording pipeline for support calls
- Agents are contractually prohibited from using screen capture or external recording
- If a user shows ID, the agent only confirms "yes, this person appears 18+" — no ID details are logged
- The ticket audit trail records only: call timestamp, call duration, agent ID, and binary result (age confirmed / age not confirmed)
- Users can decline video verification entirely — it is always optional, never required

**Escalation path if user declines video:**
- User retains full platform access (messaging, servers, friends, etc.)
- Only NSFW content access remains restricted
- User can re-appeal after 30 days, or request community age attestation instead
- No account penalties are applied for declining

### Rolling Upgrades & Versioning

> All components support rolling upgrades with zero downtime. No big-bang deployments.

| Component | Upgrade Strategy | Details |
|-----------|-----------------|--------|
| **WebSocket Gateways** | Rolling restart behind load balancer. Drain connections gracefully (send `RECONNECT` event, wait 30s for clients to migrate, then terminate). New gateways come up with latest code before old ones drain | Zero-downtime; clients auto-reconnect to a new gateway |
| **Event Processors** | Rolling restart with partition rebalancing. Each processor owns a set of event log partitions. On restart, partitions are reassigned to remaining processors; new processor picks up its share on startup. Exactly-once processing via checkpoint offsets | Brief processing lag during rebalance; no data loss |
| **Backend Services (Phoenix)** | Blue-green or rolling deployment. New version deployed alongside old; traffic gradually shifted. Old version kept warm for instant rollback | Canary percentage configurable (1% → 10% → 50% → 100%) |
| **Database Schema** | Two-phase migration (see Migration Strategy above). Step 1: deploy new code that works with both old and new schema. Step 2: run migration. Step 3: deploy code that uses only new schema. Step 4: remove old columns/tables | Never break running code |
| **Event Log Schema** | Additive only — new event types and new payload fields are added without modifying existing events. Consumers must handle unknown event types gracefully (ignore, not crash). Payload changes are backward-compatible (new fields are optional/nullable) | Old events remain valid forever |
| **API Versioning** | Versioned endpoints (`/api/v1/`, `/api/v2/`). Old versions supported for minimum 6 months after deprecation notice. Version negotiation via `Accept` header or URL path. Breaking changes only in new major versions | Deprecation warnings in response headers |
| **Client Updates** | Clients check API version compatibility on connect. If the client is too old, gateway sends a `CLIENT_UPDATE_REQUIRED` event with minimum version and download URL | Web auto-updates; desktop/mobile prompt user |

### Security Hardening

> Defense-in-depth security measures beyond TLS and encryption at rest.

| Measure | Description | Priority |
|---------|-------------|----------|
| **TLS Verification** | All inter-service traffic is TLS-encrypted (mTLS between services). External traffic requires TLS 1.3. Certificate pinning on mobile clients. HSTS headers with long max-age | P0 |
| **Signed URLs for All Uploads** | All file uploads and downloads use pre-signed S3 URLs with short expiry (upload: 15 minutes, download: 1 hour). URLs are scoped to the specific file and authenticated user. Expired URLs return 403, not a redirect | P0 |
| **Replay Attack Prevention** | All authenticated API requests include a timestamp and nonce. Server rejects requests older than 30 seconds or with a previously-seen nonce (nonce cache in Redis with 60s TTL). Device-signed challenge responses include a server-issued nonce | P0 |
| **Impersonation Prevention** | All events include the actor's device key signature. Gateway verifies the signature matches the authenticated session's device key. Unsigned or mismatched events are rejected and logged as security incidents | P0 |
| **Abnormal Behavior Monitoring** | Automated alerts for: sudden spike in reports against a single user/server, mass file uploads from a single account, unusual geographic login patterns, rapid trust score changes, bulk invite generation, API scraping patterns. Alerts go to platform ops + trust & safety | P0 |
| **Request Signing** | Bot and API token requests are signed with the token's associated key. Prevents token replay if intercepted (signature includes timestamp + request body hash) | P1 |
| **Secrets Management** | All secrets (DB credentials, S3 keys, TOTP secrets, signing keys) stored in a secrets manager (Vault, AWS Secrets Manager, or SOPS-encrypted). Never in environment variables or config files in plain text | P0 |
| **Dependency Scanning** | Automated dependency vulnerability scanning in CI (mix audit for Elixir, npm audit for JS). Critical CVEs block deployment | P1 |

### Service Seams

> Burrow is a **monolith** — one Phoenix application, one deployment, one database. This is intentional. The BEAM VM provides process-level isolation, and Elixir contexts provide module-level isolation. But the codebase is designed with clean seams so that when a specific bottleneck emerges, extraction is surgical rather than archaeological.

| Context | Responsibility | Extraction Trigger | Extraction Path |
|---------|---------------|-------------------|----------------|
| `Burrow.Chat` | Messages, events, channels, content items | Core — stays in the monolith longest | Only splits if read/write pressure on Postgres requires dedicated connection pools |
| `Burrow.Communities` | Servers, members, roles, permissions, channels | Core — tightly coupled to Chat | Stays with Chat unless permission checks become a bottleneck |
| `Burrow.DM` | Direct messages, group DMs | Low coupling to Chat — shares message format but separate PubSub topics | Can be extracted to its own service with shared message schema |
| `Burrow.Presence` | Online/idle/dnd status, ETS-based tracking | Already isolated — GenServer with ETS, no Postgres dependency at runtime | Extract to a standalone BEAM node. Only needs Redis for cross-node state |
| `Burrow.Auth` | Device keys, sessions, challenges, trust tiers | No runtime coupling to Chat — called at connection time only | Extract when auth traffic justifies dedicated infrastructure |
| `Burrow.Trust` | Trust scoring, bot detection, rate limiting | Reads from Auth, writes scores — mostly async | Extract to a background worker service when scoring pipeline needs its own queue |
| **Media Pipeline** | Upload → MIME check → ClamAV → resize → strip metadata → S3 | CPU-bound, fully async, already a sequential pipeline | **First candidate for extraction** — a slow virus scan should never block a message send. Run as a separate job queue (Oban) or standalone service |
| **Voice / SFU** | WebRTC audio/video routing | Completely different runtime (Rust/C++ media server) | **Always separate** — this was never going to run in Phoenix |
| **Game Server Poller** | RCON/query API polling for game server status | External network I/O on timers, independent of user actions | Extract when supporting 100+ registered game servers |

**Rule of thumb:** Don't extract until you have a measured bottleneck. When you do extract, the context boundary is your cut line — the public functions of each context module become the service's API contract.

---

## 5. Tech Stack Summary

| Platform    | Stack                         | Why                                   |
|-------------|------------------------------|---------------------------------------|
| Backend     | Elixir, Phoenix, Docker      | Real-time, scalable, fault-tolerant   |
| Web         | React                        | Fast, huge ecosystem, modular         |
| Desktop     | Electron + React             | Cross-platform, UI code reuse         |
| Mobile      | React Native + Expo          | Cross-platform, easier dev/testing    |
| Shared      | PostgreSQL, Redis, S3-compatible storage | Reliable storage, fast pub/sub, scalable media |

