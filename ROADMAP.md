# Burrow — Development Roadmap

> Extracted from MASTER.md. Each phase is scoped to a coherent theme with ~15–25 items. Phases are sequential but items within a phase can be parallelized.

---

      ## Phase 1 — Identity & Security Foundation
> Goal: Device-bound auth, account creation, and the security baseline. No chat yet — just the identity layer that everything else sits on.

- [x] Device-bound identity (Ed25519 key pair generation, server stores public key only)
- [x] Signed challenge authentication (no passwords, no email required)
- [x] Proof-of-Work account creation (SHA-256 prefix difficulty, anti-bot)
- [x] Recovery key generation (24-word mnemonic, mandatory word confirmation — cannot be skipped)
- [x] Username, display name, avatar upload
- [x] Immutable user_id, mutable username (72h cooldown), optional display_name
- [x] Session management (view all sessions, revoke single, revoke all others)
- [x] Session details (device, OS, browser, IP, GeoIP location)
- [x] Age self-declaration gate (13+ checkbox on account creation, logged; separate 18+ gate for NSFW content)
- [x] Terms of Service and Privacy Policy acceptance (version-tracked)
- [x] TLS everywhere, encrypted at rest, rate limiting, CSP headers
- [x] mTLS between internal services, TLS 1.3 for external traffic
- [x] Signed URLs for all file uploads/downloads (pre-signed S3, short expiry)
- [x] Replay attack prevention (timestamp + nonce on authenticated requests)
- [x] Impersonation prevention (device key signature on all events)
- [x] Secrets management (Vault / SOPS — no plaintext secrets in config)
- [x] Three-layer rate limiting (IP / user / server) with graduated penalties
- [x] Progressive trust system — Tier 0–2 (rate-limited messaging, DM restrictions, no links/uploads at Tier 0)
- [x] New account cooldowns (first message delay, join throttle, action gating by tier)
- [x] Database migration framework (Ecto migrations, versioned, rollback-capable, CI-validated)
- [x] Prometheus metrics endpoint + Grafana dashboards (WS connections, msg/sec, error rates, upload bandwidth)

---

      ## Phase 2 — Core Chat & Servers
> Goal: Basic usable chat platform. Create servers, send messages, manage channels.

- [x] Create/join/leave servers (invite links only — no open discovery at launch)
- [x] Invite link management (configurable uses, expiration, revocation)
- [x] Server invite links
- [x] Text channels with categories (name, topic, reordering)
- [x] Send/edit/delete messages with markdown
- [x] @mentions and replies
- [x] Basic roles and permissions (@everyone + admin)
- [x] 1-on-1 direct messages (Tier 1+ only, rate-limited)
- [x] Online/offline presence
- [x] Unread indicators
- [x] Typing indicators
- [x] Event-driven architecture (append-only event log, event processors, state table derivation)
- [x] Channel sequence numbers (server-side monotonic per-channel seq for client sync)
- [x] Stateless WebSocket gateway (client → gateway → message bus → services)
- [x] Client event subscriptions (message_create, message_edit, user_join, presence_update, etc.)
- [x] Presence & typing debounce/batching (8s typing debounce, 5s presence batches, poll fallback for large servers)
- [x] Reconnect reconciliation (client sends last channel_seq, server replays missed events)
- [x] Client-side caching (recent messages, attachments, server/channel lists, role IDs, avatars in IndexedDB/SQLite)
- [x] Optimistic message send with offline queue (queue locally, send on reconnect)
- [x] Dark/light theme
- [x] Keyboard navigation (Tab, Enter, Escape, arrow keys) + focus indicators
- [x] Web client functional

---

      ## Phase 3 — Media, Safety & File Handling
> Goal: File uploads, media safety pipeline, content moderation foundations.

- [x] File uploads (images, documents) with signed URLs (Tier 2+ only)
- [x] Media safety pipeline (MIME verification, ClamAV virus scan, dimension checks, metadata stripping)
- [ ] File deduplication (SHA-256 content hashing, shared S3 objects, reference counting)
- [ ] Automated file moderation (executable detection, archive bombs, polyglot files)
- [ ] Ephemeral file monitoring (TTL files go through full safety pipeline)
- [ ] Embed sanitization (allowlisted HTML tags, no JS, enforce HTTPS, size limits)
- [ ] Content/media reporting pipeline (report files directly, quarantine, legal hooks)
- [ ] Legal reporting hooks (NCMEC CyberTipline integration via Cloudflare for CSAM)
- [ ] Server-level takedown capability (suspend server, preserve evidence, notify owner)
- [ ] Content preservation for reported/flagged files (forensic snapshots)
- [ ] Compliance audit log (account lifecycle, moderation actions, auth events, legal reports)
- [ ] Platform backup strategy (daily DB snapshots, WAL archiving, S3 versioning, event log archival)
- [ ] Abnormal behavior monitoring and alerting
- [ ] Configurable server rules (versioned, re-acceptance on changes)
- [ ] Message partitioning by channel_id + month (horizontal sharding for scale)
- [ ] Event log partitioning by channel_id + month
- [ ] State table sharding by channel_id for large channels
- [x] UX safety: ephemeral file expiry indicators, upload progress/failure feedback, mass deletion guards
- [ ] UX safety: server rules display on join, verification gate feedback, scanning placeholder
- [ ] UX safety: offline indicator with queued message display, rate limit countdown feedback

---

      ## Phase 4 — Voice, Auth Hardening & Social Features
> Goal: Voice chat, device pairing, friends, and the text experience polish.

      ###Voice
- [x] Voice channels (join/leave/mute/deafen)
- [ ] WebRTC audio with SRTP encryption and VAD
- [x] P2P WebRTC mesh for small calls (≤4 users), auto-escalate to SFU for larger
- [x] Ultra-low latency voice (Opus 10–20ms frames, adaptive jitter buffer, FEC)
- [x] Echo cancellation + automatic gain control
- [x] Voice channel settings (bitrate, user limit, AFK timeout)
- [ ] Push-to-talk option

      ###Auth Hardening
- [ ] QR code device pairing (existing device → new device)
- [ ] Pair code device pairing (short-lived alphanumeric code)
- [ ] Recovery key pairing (with push notification to all devices)
- [ ] Multi-device onboarding push (persistent banner for 7 days until second device paired)
- [ ] Optional TOTP 2FA as additional auth layer
- [x] Optional hardware security keys (WebAuthn/FIDO2 — YubiKey, Titan, etc.)
- [ ] WebAuthn-based device pairing
- [ ] Multi-method auth management (add/remove/rename methods)
- [ ] Auth challenge on sensitive actions (server deletion, key rotation, account deletion)
- [ ] Token rotation (short-lived access + refresh tokens)
- [ ] Session expiry policy + trusted devices
- [ ] Login notifications (push to all paired devices on new login)
- [ ] Device fingerprint trust scoring (flag anomalous logins)

      ###Social & Text Polish
- [x] Friends system (add/remove/list)
- [ ] Group DMs
- [x] Emoji picker + reactions
- [x] Message pinning
- [x] Message search
- [ ] Text channel settings (slow mode, NSFW flag, read-only/locked)
- [ ] Notification system (in-app + push)
- [ ] Per-channel notification settings
- [ ] Announcement channels
- [ ] Desktop client functional

---

      ## Phase 5 — Moderation, Roles & Profiles
> Goal: Full moderation toolkit, granular permissions, user identity features.

      ###Moderation
- [x] Kick, ban, timeout
- [x] Timed bans and timed mutes (auto-expire, countdown visible to target)
- [ ] Bulk message delete
- [ ] AutoMod (spam, word filter, link filter)
- [ ] Report system
- [ ] Raid protection (join-rate anomaly detection, auto-lockdown, quarantine role)
- [ ] Platform-level user & server reports (trust & safety queue, evidence, resolution log)
- [ ] Passive bot detection risk scoring (rapid joins, mass DMs, identical messages, no replies)
- [ ] Bot risk-based rate limiting (suspicious accounts get throttled before manual review)
- [ ] Human interaction challenges (emoji reaction, drag UI, select matching message)
- [ ] Server-level verification gates (verification channel, minimum trust tier, rules acceptance)
- [ ] Progressive trust Tier 3–4 unlock (server creation, discovery access, full rate limits)

      ###Roles & Permissions
- [x] Channel permission overrides
- [ ] Audit log (full admin view — git-style history with diffs, blame, compound filters)
- [ ] Public transparency audit log (anonymized actor role, target, action, public notes)
- [ ] Audit log filters (action type, actor, target, role, date range, keyword search)
- [ ] Audit log export (CSV, JSON, PDF) with permission-scoped visibility
- [ ] Server deletion with auth challenge re-authentication + 72-hour grace period

      ###Profiles & Identity
- [ ] Profile customization (banner, bio, pronouns)
- [ ] Per-server persona (server-specific nickname, avatar, bio, pronouns)
- [ ] Social recovery guardian system (designate 3–5 guardians, M-of-N approval, 72h window)
- [ ] Community vouching for identity continuity (new account claims old community position)
- [ ] Connected accounts (GitHub, Steam, Spotify, Twitch)
- [ ] Game activity detection (desktop client)
- [ ] Custom activity status (Playing, Watching, Listening, Competing)

---

      ## Phase 6 — Video, Streaming & Rich Content
> Goal: Full multimedia, advanced channel types, and content features.

      ###Video & Streaming
- [x] Webcam video in voice channels
- [x] Screen share / application streaming
- [x] Go Live (one-to-many in voice channel)
- [ ] Stream quality settings (resolution, framerate, bitrate caps)
- [x] Adaptive bitrate streaming (simulcast layers, per-viewer quality, viewer quality selector)
- [x] Camera/streaming toggles per voice channel
- [x] Multi-stream viewing (grid view toggle for multiple simultaneous streams)
- [ ] IP privacy (proxy WebRTC through TURN/SFU)
- [ ] Voice recording permissions (per-channel consent, notification indicator)

      ###Advanced Channel Types
- [ ] Thread support
- [ ] Forum channels
- [ ] Gallery channels
- [ ] Events channels (RSVP, calendar view, reminders)
- [ ] File repository channels (versioned downloads)
- [ ] Status channels (game server status cards)
- [ ] Temporary squad voice rooms (auto-create, auto-delete)
- [ ] Server dashboards (widget-based community homepage)

      ###Content & Communication
- [ ] Rich Presence (game state, party size, artwork)
- [ ] End-to-end encrypted DMs (opt-in, Signal Protocol)
- [ ] Message expiry / self-destruct for DMs
- [ ] Message scheduling (author picks future send time, editable until dispatch)
- [ ] Structured embeds (author-defined fields, thumbnail, footer)
- [ ] BBCode message formatting alongside Markdown
- [ ] Code block syntax highlighting (server-side language detection)
- [ ] Message bookmarking (tags, notes, cross-server search)
- [ ] Server folders in sidebar
- [ ] File previews (JSON tree viewer, log viewer, code syntax, CSV table, PDF, Markdown)
- [ ] Mobile client functional

---

      ## Phase 7 — Ecosystem & Integrations
> Goal: Bot platform, third-party integrations, discovery, and polish.

      ###Bot Platform
- [ ] Bot accounts + API tokens
- [ ] Webhook support
- [ ] Slash commands + context menu commands
- [ ] Rich embeds + interactive components (buttons, modals)
- [ ] Bot dashboard + developer portal
- [ ] Native music bot support (audio sink API, queue API, in-channel playback widget)
- [ ] External REST API & WebSocket Gateway (versioned, scoped tokens, rate limits)

      ###Integrations
- [ ] GitHub / GitLab integration (repo events → channel)
- [ ] Twitch / YouTube integration (live notifications)
- [ ] RSS feed subscriptions
- [ ] Game Server Connect (RCON/API integration for Minecraft, Rust, Valheim, ARK, etc.)
- [ ] Spotify "Listen Along" integration
- [ ] OAuth login (Google, GitHub, Apple, Microsoft) — optional account linking, not primary auth

      ###Social & UX
- [ ] Custom emoji per server
- [ ] GIF picker (Tenor/Giphy)
- [ ] Link previews (OpenGraph embeds)
- [ ] Server discovery / public listing
- [ ] Vanity invite URLs
- [ ] Search indexing (Elasticsearch / Meilisearch)
- [ ] Profile badges, avatar decorations
- [ ] Server boost system
- [ ] Quiet hours & notification scheduling (per-user, per-server overrides)
- [ ] Keyword notification alerts (custom trigger words across all servers)

      ###Voice & Quality
- [ ] Noise suppression toggle (RNNoise / Web Audio)
- [ ] Priority speaker / audio ducking
- [ ] Per-user volume control in voice channels
- [x] Picture-in-picture for streams

---

## Phase 8 — Enterprise, Extensibility & Long-tail
> Goal: Self-hosted deployment, plugin system, compliance, and remaining features.

      ###Self-Hosted & Enterprise
- [ ] Self-hosted instance deployment (Docker, own DB, own S3)
- [ ] LDAP / Active Directory sync
- [ ] SSO integration (SAML / OIDC)
- [ ] SCIM 2.0 provisioning
- [ ] Message retention policies
- [ ] Legal hold
- [ ] Compliance audit export
- [ ] Data residency controls
- [ ] Compliance dashboard
- [ ] Organization accounts (create, invite members, org-owned servers)
- [ ] Account switching (personal ↔ org)
- [ ] 2FA enforcement for org members
- [ ] Org SSO (SAML/OIDC)
- [ ] Org billing & plans

      ###Plugin System & Extensibility
- [ ] Official Plugin API (manifest, permission scopes, lifecycle hooks, UI extensions)
- [ ] Plugin marketplace (browse, install, rate, review)
- [ ] Server sandboxing & plugin isolation (V8 isolate / WASM, memory/CPU limits, network ACL)
- [x] Custom CSS injection + CSS theme sharing/marketplace
- [ ] Client Extension API (UI injection points, theme engine, settings panels)

      ###Remaining Features
- [ ] Developer / Admin Panel (system health, service status, active connections, inspector, API tester, feature flags, audit log viewer, error logs)
- [ ] Server analytics dashboard (messages/day, upload volume, active members, peak hours)
- [ ] Per-channel analytics (message count, unique posters, media ratio)
- [ ] User reputation system (global + per-server scores, badges, reputation-gated features)
- [ ] Invite-creator accountability (inviter trust affected by invitee behavior)
- [ ] Veteran vouching system (Tier 4 users can vouch for others)
- [ ] Advanced bot detection (typing cadence analysis, conversation response challenges)
- [ ] Message history export (JSON, CSV, HTML — per-channel or full account)
- [ ] Server export & backup (structure/roles snapshot, optional encrypted message archive)
- [ ] Scheduled audit log exports (webhook/email)
- [ ] Passkey / passwordless login (WebAuthn resident keys)
- [ ] Ownership transfer (auth challenge, pending acceptance, cooldown)
- [ ] Account data export (GDPR)
- [ ] Accessibility & i18n
- [ ] Screen reader ARIA announcements + accessibility audit
- [ ] Rolling upgrades for gateways (graceful drain, RECONNECT event, zero-downtime)
- [ ] Rolling upgrades for event processors (partition rebalancing, checkpoint offsets)
- [ ] Blue-green / canary deployments for backend services
- [ ] API versioning with deprecation policy (/api/v1/, 6-month support window)
- [ ] Event log schema forward-compatibility (additive changes only, unknown types ignored)
- [ ] Privacy controls (activity/status/voice/server list visibility toggles)
