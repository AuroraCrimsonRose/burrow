# Burrow Mobile — Catch-Up Roadmap

> What exists vs. what the web app has. Each section shows current state and what needs built.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Scaffolded / stub in place |
| 🔲 | Not started — needs implementation |
| ⚠️ | Partially exists (e.g. API function defined, no UI) |

---

## 1. Authentication & Onboarding

**Current state:** `LoginScreen.tsx` placeholder with username input. `auth/store.ts` has SecureStore token persistence.

| Task | Status | Notes |
|------|--------|-------|
| Ed25519 keypair generation (register) | 🔲 | Need `react-native-ed25519` or WASM-based tweetnacl |
| Challenge-response login flow | 🔲 | Sign challenge with device private key |
| WebAuthn / Passkey support | 🔲 | Research `react-native-passkeys` or platform biometric API |
| BIP39 recovery key generation | 🔲 | `bip39` package works in RN with crypto polyfill |
| BIP39 account recovery screen | 🔲 | New `RecoverScreen.tsx` |
| Device fingerprinting | 🔲 | Expo `Device` + `Application` APIs |
| Request signing (X-Request-Timestamp, Nonce, Signature) | 🔲 | Middleware in `api/client.ts` |
| PoW challenge integration | 🔲 | Port web PoW solver to RN |
| Terms of Service acceptance screen | 🔲 | New screen + `POST /auth/accept-terms` |
| NSFW age verification | 🔲 | New screen + `POST /auth/nsfw-verify` |
| Session token refresh / re-auth | 🔲 | Handle 401s, redirect to login |

---

## 2. Servers

**Current state:** `ServersScreen.tsx` stub (empty list), `ServerDetailScreen.tsx` placeholder, navigation wired.

| Task | Status | Notes |
|------|--------|-------|
| Fetch & display server list | ⚠️ | API function exists, UI needs data fetching |
| Server icon / avatar display | 🔲 | First-letter fallback exists |
| Server detail — channel list (categorized) | 🔲 | Need category collapsible groups |
| Create server | 🔲 | New modal/screen |
| Join server via invite code | 🔲 | `POST /invites/{code}/accept` |
| Server settings (overview, channels, roles, members, invites) | 🔲 | Multi-tab settings screen |
| Server-specific profile (nickname, bio, pronouns) | 🔲 | `PATCH /servers/{id}/members/@me` |
| Member list sidebar | 🔲 | With role sections + presence dots |
| Mark server as read | 🔲 | `POST /servers/{id}/ack` |
| Leave / delete server | 🔲 | Confirmation dialog |
| Transfer ownership | 🔲 | `POST /servers/{id}/transfer` |

---

## 3. Text Channels & Messaging

**Current state:** `ChannelScreen.tsx` placeholder. No message list or compose UI.

| Task | Status | Notes |
|------|--------|-------|
| Message list (FlatList, infinite scroll) | 🔲 | Paginated via `before` cursor |
| Send message (text input + send button) | 🔲 | `POST .../messages` |
| Reply to message | 🔲 | Swipe-to-reply or long-press menu |
| Edit own messages | 🔲 | Long-press → edit |
| Delete messages | 🔲 | Long-press → delete |
| Reactions (add / remove emoji) | 🔲 | Emoji picker + `PUT .../reactions/{emoji}` |
| Emoji picker component | 🔲 | Use `emoji-mart` RN port or custom |
| Message attachments display | 🔲 | Image preview, file download link |
| File upload from device | 🔲 | `expo-image-picker` + `expo-document-picker` |
| Chunked upload for large files | 🔲 | Port web chunked upload logic |
| Message pins | 🔲 | `GET/POST/DELETE .../pins` |
| Message search (server-wide) | 🔲 | `GET /servers/{id}/messages/search` |
| Message edit history | 🔲 | `GET .../messages/{id}/edits` |
| Mark channel as read | 🔲 | `POST .../ack` |
| Unread indicators on channel list | 🔲 | Track `channel_seq` vs `last_read_seq` |
| Typing indicators | 🔲 | If web has them |

---

## 4. Voice & Video (WebRTC)

**Current state:** Nothing scaffolded.

| Task | Status | Notes |
|------|--------|-------|
| WebRTC peer connection setup | 🔲 | `react-native-webrtc` |
| Join/leave voice channel | 🔲 | Voice signaling via Phoenix channel |
| Audio track with DSP (noise suppression, echo cancel, AGC) | 🔲 | RN WebRTC supports constraints |
| Mute / deafen / camera toggle | 🔲 | Control bar UI |
| Speaking detection (RMS analysis) | 🔲 | Port web voice engine logic |
| Video tiles grid | 🔲 | RTCView components |
| Screen share | 🔲 | `react-native-webrtc` screen capture (Android only, limited iOS) |
| DM voice calls | 🔲 | `dm_voice_channel.ex` signaling |
| Incoming call notification (overlay + ringtone) | 🔲 | Push notification + in-app overlay |
| Connection quality stats | 🔲 | `RTCStatsReport` |
| Audio device selection (speaker, earpiece, bluetooth) | 🔲 | `InCallManager` or `expo-av` routing |

---

## 5. Direct Messages

**Current state:** `DMListScreen.tsx` (empty list stub), `DMChatScreen.tsx` (placeholder with input). API functions defined.

| Task | Status | Notes |
|------|--------|-------|
| Fetch DM conversation list | ⚠️ | API exists, UI needs wiring |
| DM list with avatar, last message preview, unread badge | 🔲 | Layout exists, needs data |
| DM message feed (FlatList) | 🔲 | Reuse channel message list component |
| Send DM message | ⚠️ | Input exists, needs API call wiring |
| Edit / delete DM messages | 🔲 | Long-press context menu |
| DM attachments (images, files) | 🔲 | Same as channel attachments |
| Mark DM as read | 🔲 | `POST /dms/{id}/ack` |
| Create new DM from friend list | 🔲 | `POST /dms` with user_id |
| DM unread badge on tab icon | 🔲 | Track in global state |

---

## 6. Friends & Social

**Current state:** `FriendsScreen.tsx` placeholder (empty state text). API functions for friends/requests defined.

| Task | Status | Notes |
|------|--------|-------|
| Friends list with online/offline sections | 🔲 | Port web `FriendsPanel` friends tab logic |
| Custom status display per friend | 🔲 | Presence polling endpoint |
| Send friend request | ⚠️ | API function exists |
| Incoming requests (accept / decline) | 🔲 | New section or tab |
| Outgoing requests (withdraw) | 🔲 | New section or tab |
| Block / unblock users | 🔲 | `POST/DELETE /friends/{id}/block` |
| Blocked users list | 🔲 | `GET /friends/blocked` |
| Tap friend → open DM | 🔲 | Navigate to DMChat |
| Friend presence polling | 🔲 | `GET /friends/presence` on interval |

---

## 7. User Profiles

**Current state:** No profile UI.

| Task | Status | Notes |
|------|--------|-------|
| View user profile (tap on username anywhere) | 🔲 | Bottom sheet or modal |
| Profile card: avatar, name, bio, pronouns, badges, trust tier | 🔲 | Port ProfileCard design |
| Edit own profile (display name, bio, pronouns, banner) | 🔲 | `PATCH /auth/profile` |
| Avatar upload | 🔲 | `POST /auth/avatar` + image picker |
| Server-specific profile view | 🔲 | nickname, server bio, server pronouns |
| Personal notes on users | 🔲 | `GET/PUT/DELETE /users/{id}/note` |
| "Send Message" button on profile | 🔲 | Opens DM |

---

## 8. Presence & Status

**Current state:** No presence UI.

| Task | Status | Notes |
|------|--------|-------|
| Set own status (online, idle, dnd, invisible) | 🔲 | Status picker UI |
| Custom status text + duration | 🔲 | Input with duration selector |
| Status dot indicators (member list, friend list, DM list) | 🔲 | Colored circle component |
| Automatic idle detection (app backgrounded) | 🔲 | `AppState` listener |

---

## 9. Badges

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| Display badges on profile cards | 🔲 | `GET /badges` for definitions |
| Set primary badge | 🔲 | `PUT /badges/primary` |

---

## 10. Notifications & Unreads

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| Push notifications (Expo Push) | 🔲 | `expo-notifications` + backend push token registration |
| Unread channel badges | 🔲 | `GET /users/@me/read-states` |
| Unread DM badges | 🔲 | Track via `channel_seq` |
| Red dot on server icon for unread channels | 🔲 | Aggregate unread state |
| Tab bar badge count | 🔲 | DMs + mentions total |
| Notification tap → deep link to conversation | 🔲 | `expo-linking` + navigation |

---

## 11. Real-Time Infrastructure (WebSocket)

**Current state:** Nothing — no socket connection.

| Task | Status | Notes |
|------|--------|-------|
| Phoenix WebSocket connection (`phoenix` JS client) | 🔲 | `phoenix` npm package works in RN |
| `gateway_channel` subscription | 🔲 | Messages, reactions, presence, server events |
| `voice_channel` subscription | 🔲 | Voice signaling |
| `dm_voice_channel` subscription | 🔲 | DM call signaling |
| Event replay on reconnect (channel_seq) | 🔲 | Port web socket.ts logic |
| Offline message queue | 🔲 | Port web offlineQueue.ts |
| Auto-reconnect with backoff | 🔲 | 1s → 2s → 5s → 10s |

---

## 12. Settings

**Current state:** `SettingsScreen.tsx` stub with section cards + logout button.

| Task | Status | Notes |
|------|--------|-------|
| Profile editing screen | 🔲 | Avatar, display name, bio, pronouns |
| Privacy settings (friends_only_dms toggle) | 🔲 | `PATCH /auth/profile` |
| Active sessions list | 🔲 | `GET /auth/sessions` |
| Revoke sessions | 🔲 | `DELETE /auth/sessions/{id}` |
| Passkey management | 🔲 | `GET/POST/DELETE /auth/passkeys` |
| Notification preferences | 🔲 | Device-local settings |
| Appearance (theme selection) | 🔲 | Dark mode only initially |
| Blocked users management | 🔲 | `GET /friends/blocked` |

---

## 13. Roles & Permissions

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| View roles in server settings | 🔲 | `GET /servers/{id}/roles` |
| Create / edit / delete roles | 🔲 | Permission bitfield editor |
| Assign / unassign roles to members | 🔲 | Member management |
| Reorder roles | 🔲 | Drag handle or move up/down |
| Permission-gated UI (hide actions user can't perform) | 🔲 | `GET /servers/{id}/permissions` |

---

## 14. Moderation

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| Kick member | 🔲 | `DELETE /servers/{id}/members/{user_id}` |
| Ban / unban | 🔲 | `POST/DELETE /servers/{id}/bans` |
| Timeout user | 🔲 | `POST /servers/{id}/timeouts/{user_id}` |
| Ban list management | 🔲 | `GET /servers/{id}/bans` |

---

## 15. Networks

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| View networks | 🔲 | `GET /networks` |
| Create / edit / delete networks | 🔲 | Group servers together |
| Add/remove servers from network | 🔲 | `PUT/DELETE /networks/{id}/servers/{server_id}` |

---

## 16. Invites

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| Generate invite link | 🔲 | `POST /servers/{id}/invites` |
| Share invite (native share sheet) | 🔲 | `expo-sharing` |
| Accept invite via deep link | 🔲 | `burrow://invite/{code}` scheme |
| View / revoke invites in server settings | 🔲 | `GET/DELETE /servers/{id}/invites` |

---

## 17. Platform-Specific

| Task | Status | Notes |
|------|--------|-------|
| Secure key storage (Keychain / Keystore) | ⚠️ | `expo-secure-store` in deps |
| Biometric unlock | 🔲 | `expo-local-authentication` |
| Deep linking (`burrow://`) | 🔲 | `scheme: "burrow"` in app.json |
| Background audio (voice calls) | 🔲 | Requires native audio session config |
| App badge count | 🔲 | `expo-notifications` badge API |
| Haptic feedback | 🔲 | `expo-haptics` |
| Splash screen | 🔲 | `expo-splash-screen` with Burrow branding |

---

## Priority Order (Suggested)

1. **Auth flow** — Can't use the app without it
2. **WebSocket connection** — Real-time is the backbone
3. **Servers + Channel list** — Core navigation
4. **Message feed + compose** — Core interaction
5. **DMs** — Already partially wired
6. **Friends + Presence** — Social layer
7. **Voice/Video** — Major feature, complex
8. **Notifications + Unreads** — Polish
9. **Settings + Profile editing** — Account management
10. **Everything else** — Roles, moderation, networks, invites, search
