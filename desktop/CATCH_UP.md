# Burrow Desktop — Catch-Up Roadmap

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

**Current state:** `LoginPage.tsx` placeholder with username input. `api/client.ts` has localStorage token management. No crypto.

| Task | Status | Notes |
|------|--------|-------|
| Ed25519 keypair generation (register) | 🔲 | Port web `crypto.ts` — tweetnacl works in Electron |
| Register screen (username + key setup) | 🔲 | New `RegisterPage.tsx` |
| Challenge-response login flow | 🔲 | Sign challenge with device private key |
| WebAuthn / Passkey support | 🔲 | Electron supports WebAuthn via Chromium |
| BIP39 recovery key generation + display | 🔲 | `bip39` npm package |
| BIP39 account recovery screen | 🔲 | New `RecoverPage.tsx` |
| Device fingerprinting | 🔲 | Electron `machineId` or Chromium fingerprint |
| Request signing (X-Request-Timestamp, Nonce, Signature) | 🔲 | Middleware in `api/client.ts` |
| PoW challenge integration | 🔲 | Port web PoW solver (runs fine in Electron renderer) |
| Terms of Service acceptance | 🔲 | Page + `POST /auth/accept-terms` |
| NSFW age verification | 🔲 | Page + `POST /auth/nsfw-verify` |
| Session token refresh / re-auth on 401 | 🔲 | Intercept in API client |
| Secure token storage (Electron safeStorage) | 🔲 | Currently plain localStorage — migrate to `safeStorage.encryptString()` |

---

## 2. Servers

**Current state:** `ServersPage.tsx` placeholder text. API functions defined. Router wired.

| Task | Status | Notes |
|------|--------|-------|
| Fetch & display server list (sidebar) | ⚠️ | API exists, need UI |
| Server icon / initials avatar | 🔲 | |
| Server detail — channel list with categories | 🔲 | Collapsible category groups |
| Create server dialog | 🔲 | |
| Join server via invite code | 🔲 | `POST /invites/{code}/accept` |
| Server settings modal (5 tabs: overview, channels, invites, roles, members) | 🔲 | Port web SettingsModal |
| Server-specific profile (nickname, bio, pronouns) | 🔲 | |
| Member list panel (right sidebar) | 🔲 | Grouped by role, presence dots |
| Mark server as read | 🔲 | `POST /servers/{id}/ack` |
| Leave / delete server | 🔲 | Confirmation dialog |
| Transfer ownership | 🔲 | `POST /servers/{id}/transfer` |
| Drag-and-drop server reordering | 🔲 | Desktop-native UX enhancement |

---

## 3. Text Channels & Messaging

**Current state:** No message UI at all. API functions for messages defined.

| Task | Status | Notes |
|------|--------|-------|
| Message feed (virtualized list, infinite scroll) | 🔲 | Port web DataSpine concept |
| Send message (input bar + send button) | 🔲 | |
| Reply to message (click reply icon) | 🔲 | Reply-to preview above input |
| Edit own messages (double-click or context menu) | 🔲 | Inline edit UI |
| Delete messages (context menu) | 🔲 | |
| Reactions (hover → emoji picker) | 🔲 | `PUT .../reactions/{emoji}` |
| Emoji picker component | 🔲 | Port or use `emoji-mart` |
| Message attachments display (images, files) | 🔲 | Image lightbox, file download |
| File upload (drag-and-drop + file picker) | 🔲 | Electron native file dialog |
| Chunked upload for large files | 🔲 | Port web chunked upload logic |
| Message pins | 🔲 | Pinned messages panel |
| Message search (server-wide) | 🔲 | Search bar + results overlay |
| Message edit history | 🔲 | `GET .../messages/{id}/edits` |
| Mark channel as read | 🔲 | `POST .../ack` |
| Unread indicators on channel list | 🔲 | Bold text + badge count |
| Right-click context menus (native feel) | 🔲 | Electron `Menu.buildFromTemplate` or custom |
| Keyboard shortcuts (Ctrl+E edit, etc.) | 🔲 | Desktop-native UX |
| Clipboard paste images into chat | 🔲 | Paste event → upload → attach |

---

## 4. Voice & Video (WebRTC)

**Current state:** Nothing scaffolded. Electron/Chromium has full WebRTC support.

| Task | Status | Notes |
|------|--------|-------|
| WebRTC peer connection setup | 🔲 | Native Chromium WebRTC in Electron |
| Join/leave voice channel | 🔲 | Voice signaling via Phoenix channel |
| Audio track with DSP (noise suppression, echo cancel, AGC) | 🔲 | Chromium supports all constraints |
| Mute / deafen / camera toggle bar | 🔲 | Floating control bar UI |
| Speaking detection (RMS analysis) | 🔲 | Port web voiceEngine.ts |
| Video tiles grid | 🔲 | Resizable grid layout |
| Screen share (window or monitor picker) | 🔲 | `desktopCapturer.getSources()` — Electron-native |
| DM voice calls | 🔲 | `dm_voice_channel.ex` signaling |
| Incoming call notification (system notification + overlay) | 🔲 | Electron `Notification` + in-app banner |
| Connection quality stats | 🔲 | `RTCStatsReport` |
| Audio device selection (dropdown) | 🔲 | `navigator.mediaDevices.enumerateDevices()` |
| Push-to-talk with global hotkey | 🔲 | `globalShortcut.register()` — Electron-only feature |
| Voice activity overlay (mini floating window) | 🔲 | Electron `BrowserWindow` always-on-top |

---

## 5. Direct Messages

**Current state:** `DMsPage.tsx` placeholder text. API functions defined.

| Task | Status | Notes |
|------|--------|-------|
| DM conversation list (sidebar or main view) | ⚠️ | API exists |
| DM list with avatar, last message preview, unread badge | 🔲 | |
| DM message feed | 🔲 | Reuse channel message component |
| Send DM message | 🔲 | |
| Edit / delete DM messages | 🔲 | Context menu |
| DM attachments (images, files) | 🔲 | Same as channel logic |
| Mark DM as read | 🔲 | `POST /dms/{id}/ack` |
| Create new DM (user search) | 🔲 | `POST /dms` |
| DM unread badge in sidebar | 🔲 | |

---

## 6. Friends & Social

**Current state:** `FriendsPage.tsx` placeholder. API functions for friends defined.

| Task | Status | Notes |
|------|--------|-------|
| Friends list with online/offline sections | 🔲 | Port web FriendsPanel friends tab |
| Custom status display per friend | 🔲 | |
| Send friend request (username input) | ⚠️ | API function exists |
| Incoming requests (accept / decline) | 🔲 | |
| Outgoing requests (withdraw) | 🔲 | |
| Block / unblock users | 🔲 | |
| Blocked users list | 🔲 | |
| Click friend → open DM | 🔲 | Navigate to DM view |
| Friend presence polling | 🔲 | `GET /friends/presence` |

---

## 7. User Profiles

**Current state:** No profile UI.

| Task | Status | Notes |
|------|--------|-------|
| Profile popup (click username → card) | 🔲 | Floating card or modal |
| Profile card: avatar, name, bio, pronouns, badges, trust tier, banner | 🔲 | Port web ProfileCard |
| Edit own profile (modal with form) | 🔲 | `PATCH /auth/profile` |
| Avatar upload | 🔲 | `POST /auth/avatar` |
| Server-specific profile | 🔲 | nickname, server bio, pronouns |
| Personal notes on users | 🔲 | `GET/PUT/DELETE /users/{id}/note` |
| "Send Message" button on profile | 🔲 | Opens DM |

---

## 8. Presence & Status

**Current state:** No presence UI.

| Task | Status | Notes |
|------|--------|-------|
| Set own status (online, idle, dnd, invisible) | 🔲 | Status picker dropdown |
| Custom status text + duration | 🔲 | |
| Status dot indicators everywhere | 🔲 | Member list, friends, DMs |
| Automatic idle detection (no input) | 🔲 | `powerMonitor.getSystemIdleTime()` — Electron API |

---

## 9. Badges

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| Display badges on profile cards | 🔲 | `GET /badges` |
| Set primary badge | 🔲 | `PUT /badges/primary` |

---

## 10. Notifications & Unreads

**Current state:** IPC handler for native notifications exists in `main.ts`. Preload exposes `showNotification()`.

| Task | Status | Notes |
|------|--------|-------|
| Native OS notifications for messages | ⚠️ | IPC ready, needs trigger logic |
| Unread channel badges | 🔲 | `GET /users/@me/read-states` |
| Unread DM badges | 🔲 | |
| Red dot on server icon for unread channels | 🔲 | |
| Sidebar badge (total mentions) | 🔲 | |
| Taskbar badge / overlay icon | 🔲 | `mainWindow.setOverlayIcon()` (Windows) |
| Notification click → navigate to conversation | 🔲 | IPC `notification:clicked` channel exists |
| Do Not Disturb mode | 🔲 | Suppress notifications |

---

## 11. Real-Time Infrastructure (WebSocket)

**Current state:** Nothing — no socket connection.

| Task | Status | Notes |
|------|--------|-------|
| Phoenix WebSocket connection (`phoenix` JS client) | 🔲 | Works identically to web |
| `gateway_channel` subscription | 🔲 | Messages, reactions, presence, server events |
| `voice_channel` subscription | 🔲 | Voice signaling |
| `dm_voice_channel` subscription | 🔲 | DM call signaling |
| Event replay on reconnect (channel_seq) | 🔲 | Port web socket.ts |
| Offline message queue | 🔲 | Port web offlineQueue.ts |
| Auto-reconnect with backoff | 🔲 | 1s → 2s → 5s → 10s |

---

## 12. Settings

**Current state:** `SettingsPage.tsx` stub with section cards + logout button. Sidebar navigation wired.

| Task | Status | Notes |
|------|--------|-------|
| Profile editing panel | 🔲 | Avatar, display name, bio, pronouns |
| Privacy settings (friends_only_dms toggle) | 🔲 | `PATCH /auth/profile` |
| Active sessions list | 🔲 | `GET /auth/sessions` |
| Revoke sessions | 🔲 | `DELETE /auth/sessions/{id}` |
| Passkey management | 🔲 | `GET/POST/DELETE /auth/passkeys` |
| Theme editor (CSS variables + custom CSS) | 🔲 | Port web ThemeEditor |
| Keybinds configuration | 🔲 | Desktop-specific |
| Blocked users management | 🔲 | |
| Notification preferences | 🔲 | |
| About / version info | ⚠️ | `getVersion()` IPC ready |

---

## 13. Roles & Permissions

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| View roles in server settings | 🔲 | `GET /servers/{id}/roles` |
| Create / edit / delete roles | 🔲 | Permission bitfield editor |
| Assign / unassign roles to members | 🔲 | |
| Drag-and-drop role reordering | 🔲 | |
| Permission-gated UI | 🔲 | `GET /servers/{id}/permissions` |

---

## 14. Moderation

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| Kick member | 🔲 | Context menu on member |
| Ban / unban | 🔲 | |
| Timeout user | 🔲 | Duration picker |
| Ban list management | 🔲 | |

---

## 15. Networks

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| View networks | 🔲 | `GET /networks` |
| Create / edit / delete networks | 🔲 | |
| Add/remove servers from network | 🔲 | |

---

## 16. Invites

**Current state:** Nothing.

| Task | Status | Notes |
|------|--------|-------|
| Generate invite link | 🔲 | `POST /servers/{id}/invites` |
| Copy invite to clipboard | 🔲 | `navigator.clipboard` |
| Accept invite via deep link | 🔲 | `burrow://` protocol handler |
| View / revoke invites in server settings | 🔲 | |

---

## 17. Topology / Analytics View

**Current state:** Nothing. This is a unique web feature.

| Task | Status | Notes |
|------|--------|-------|
| Network topology canvas visualization | 🔲 | Port web Topology.tsx (Canvas API works in Electron) |
| Heatmap overlays (activity, voice, friends) | 🔲 | |
| Platform stats | 🔲 | `GET /stats/platform` |

---

## 18. Electron-Specific Features

**Current state:** `main.ts` has custom title bar, tray icon, minimize-to-tray, window control IPC. `preload.ts` has IPC allowlisting.

| Task | Status | Notes |
|------|--------|-------|
| System tray icon + context menu | ✅ | Implemented |
| Minimize to tray on close | ✅ | Implemented |
| Custom title bar overlay | ✅ | Implemented |
| Window control IPC (min/max/close) | ✅ | Implemented |
| Native notifications via IPC | ✅ | Handler exists |
| Deep link protocol handler (`burrow://`) | 🔲 | `app.setAsDefaultProtocolClient('burrow')` |
| Auto-updater | 🔲 | `electron-updater` |
| Global push-to-talk hotkey | 🔲 | `globalShortcut.register()` |
| Voice activity overlay window | 🔲 | Always-on-top mini window |
| Idle detection for auto-away | 🔲 | `powerMonitor.getSystemIdleTime()` |
| Startup on boot (optional) | 🔲 | `app.setLoginItemSettings()` |
| Taskbar badge (unread count) | 🔲 | `setOverlayIcon()` / `setBadgeCount()` |
| Crash reporter | 🔲 | `crashReporter.start()` |
| Native context menus | 🔲 | `Menu.buildFromTemplate()` |
| Spell check | ✅ | Chromium built-in |
| Hardware acceleration toggle | 🔲 | `app.disableHardwareAcceleration()` |
| Secure credential storage | 🔲 | `safeStorage.encryptString()` |

---

## Priority Order (Suggested)

1. **Auth flow + secure storage** — Gate to everything else
2. **WebSocket connection** — Real-time backbone
3. **Server list + channel sidebar** — Core layout
4. **Message feed + compose** — Core interaction
5. **DMs** — API partially wired
6. **Friends + Presence** — Social layer
7. **Voice/Video + screen share** — Major desktop selling point
8. **Notifications + Unreads + Tray badge** — Already partially wired
9. **Settings + Profile editing** — Account management
10. **Desktop-specific** — Auto-update, push-to-talk, idle, deep links
11. **Everything else** — Roles, moderation, networks, topology, theming
