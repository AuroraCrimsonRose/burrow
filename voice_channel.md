# Voice Channel View — Spec

_The `voice` channel type. One of 9 channel types: text, voice, announcement, stage, forum, gallery, status, events, file_repo. This spec covers only the voice channel view — other channel types have their own specs. The voice view occupies the main content area within the [Burrow View](burrow_view.md) shell._

---

## Overview

The Voice Channel view is the primary interface for voice communication. It occupies the main content area inside the [Burrow View](burrow_view.md) shell when a voice channel tab is selected. Unlike the [Chat Channel](chat_channel.md) which shows message history, the voice view shows the channel's connected users, speaking activity, and call controls. Clicking a voice tab does **not** auto-join — the view provides a **[Join Voice]** button to connect.

---

## Layout Structure

### Not Connected

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VOICE CHANNEL AREA                          │
│                                                                     │
│                          🔊 gaming                                  │
│                        ─────────────                                │
│                    "3 users connected"                               │
│                                                                     │
│               ┌─────┐    ┌─────┐    ┌─────┐                        │
│               │     │    │     │    │     │                         │
│               │ Kai │    │Luna │    │ Ash │                         │
│               │     │    │     │    │     │                         │
│               └─────┘    └─────┘    └─────┘                        │
│                                                                     │
│                    ┌──────────────────┐                              │
│                    │   Join Voice     │                              │
│                    └──────────────────┘                              │
│                                                                     │
│                  Bitrate: 64 kbps · Limit: 10                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Connected

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VOICE CHANNEL AREA                          │
│                                                                     │
│                     🔊 gaming — Connected                           │
│                        ─────────────                                │
│                                                                     │
│               ┌─────┐    ┌─────┐    ┌─────┐                        │
│               │ ◉   │    │     │    │ 🔇  │                        │
│               │ Kai │    │Luna │    │ Ash │   ← speaking ring       │
│               │ ▶   │    │     │    │     │     on Kai              │
│               └─────┘    └─────┘    └─────┘                        │
│                                                                     │
│          ┌─────┐                                                    │
│          │ You │  ← your tile, highlighted                          │
│          └─────┘                                                    │
│                                                                     │
│               ┌────┐  ┌────┐  ┌────────────┐                       │
│               │ 🔇 │  │ 🔈 │  │ Disconnect │                       │
│               └────┘  └────┘  └────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Channel Header

Top center of the voice area:

- **Channel icon** `🔊` in `moss` color + channel name in `text-heading`
- Subtitle shows connection state:
  - Not connected: `"N users connected"` in `text-secondary`
  - Connecting: `"Connecting…"` with pulsing `amber` dot
  - Connected: `"Voice Connected"` in `moss`
- Divider line below in `earth-border`
- Channel metadata: bitrate + user limit displayed subtly at bottom of view
  - Format: `"Bitrate: 64 kbps · Limit: 10"` or `"Bitrate: 64 kbps · No limit"`
  - `text-disabled` color, small font (11px)

---

## User Tiles

Connected users displayed as a **centered, wrapping grid** of tile cards.

### Tile Layout

Each user tile:
```
┌──────────────────┐
│                  │
│    ● (avatar)    │  ← avatar circle or initial
│                  │
│    Username      │  ← display name / nickname
│    🔇            │  ← status icons (muted/deafened)
│                  │
└──────────────────┘
```

### Tile Sizing
- Tile: `120px × 100px`
- Grid: centered, wrapping, `12px` gap
- Max 4 tiles per row for visual balance
- `surface-tunnel` background, `earth-border` border, rounded corners (`8px`)

### Tile States

| State | Visual |
|-------|--------|
| **Idle** (listening) | Default tile — no special styling |
| **Speaking** | `moss` border ring (2px), subtle `moss` glow (`box-shadow: 0 0 12px rgba(67, 181, 129, 0.3)`) |
| **Self (you)** | Slightly brighter background (`surface-burrow`), `amber` bottom accent border |
| **Muted** | 🔇 icon below username, tile at `opacity: 0.7` |
| **Deafened** | 🔇🔕 icons below username, tile at `opacity: 0.6` |
| **Muted + Speaking** | N/A — muted users can't trigger speaking detection |

### Avatar

- If user has avatar → circular image (48px)
- If no avatar → circle with user's initial letter, `surface-alcove` background, `text-secondary` color
- Speaking users' avatars get the `moss` ring applied to the avatar circle

---

## Join / Leave Button

Prominent action button centered below the user grid.

### Not Connected State
- **[Join Voice]** button
- Large pill shape, `moss` background, white text
- Hover: slightly brighter, subtle glow
- On click → calls `connectVoice()` with current channel

### Connected to This Channel
- **[Disconnect]** button replaces Join
- `crimson` background, white text
- On click → calls `disconnectVoice()`

### Connected to Different Channel
- **[Switch Voice]** button in `amber`
- On click → disconnects from current, connects to this channel
- No confirmation prompt — immediate switch

---

## Self Controls

Only visible when connected. Centered below the join/leave button.

```
┌────┐  ┌────┐
│ 🔇 │  │ 🔈 │   ← mute / deafen toggle buttons
└────┘  └────┘
```

### Buttons
- **Mute toggle**: microphone icon, toggles `selfMute`
  - Active (muted): `crimson` background, strike-through mic icon
  - Inactive: default `surface-alcove` background
- **Deafen toggle**: headphone icon, toggles `selfDeaf`
  - Active (deafened): `crimson` background, strike-through headphone icon
  - Inactive: default `surface-alcove` background
  - Deafening auto-mutes (per voice engine logic)
- Both are circular buttons, 40px diameter
- 8px gap between them

---

## Voice Bar (Minimal Call Indicator)

When connected to a voice channel but **viewing a different channel** (text or another voice channel), a minimal bar appears between the tab bar and the content area. This lets the user see their call status while browsing other channels.

```
┌──────────────────────────────────────────────────────────────────┐
│  ● Voice Connected — gaming    [🔇] [🔈] [Disconnect]           │
└──────────────────────────────────────────────────────────────────┘
```

- Shows: connection status dot, channel name, quick mute/deafen/disconnect buttons
- Clicking the channel name → switches back to that voice channel's tab
- `surface-cavern` background, compact height (36px)
- Only visible when in a call AND viewing a different channel — **hidden when viewing the connected voice channel** (controls are in the main view)

---

## Tab Behavior

### Clicking a Voice Channel Tab
1. Sets that voice channel as the active channel (shows the voice view in the content area)
2. Does **NOT** auto-join the call
3. The voice view shows connected users + [Join Voice] button

### Voice Tab Indicators
- User count badge: `(3)` next to channel name, `moss` if users present
- If you're connected to that channel: tab gets `voice-connected` class (green highlight)

---

## Empty State

When no users are connected and you haven't joined:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                          🔊 gaming                                  │
│                        ─────────────                                │
│                                                                     │
│                     No one is here yet                              │
│                                                                     │
│                    ┌──────────────────┐                              │
│                    │   Join Voice     │                              │
│                    └──────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- `text-disabled` message: "No one is here yet"
- Join button still prominent — invites the user to be the first

---

## Responsive Behavior

| Viewport | User Grid | Controls | Header |
|----------|-----------|----------|--------|
| Full width | 4 tiles/row, 120px each | Full buttons with labels | Full |
| Medium | 3 tiles/row | Icon-only buttons | Truncated subtitle |
| Narrow | 2 tiles/row | Icon-only, stacked | Channel name only |

---

## Interaction with Burrow View Shell

The voice channel view lives inside the [Burrow View](burrow_view.md) shell exactly like the [Chat Channel](chat_channel.md) does:

- **Members panel** (left): still visible, shows server members as usual
- **Category rail** (right): still visible, category navigation works normally
- **Channel tab bar** (top): voice + text channels shown together, clicking text switches to chat, clicking voice switches to voice view
- **Voice bar** (between tabs and content): only shown when connected to voice AND viewing a different channel. Hidden when viewing the active voice channel (since controls are in the main content).

---

## Color Tokens Used

| Token | Usage |
|-------|-------|
| `moss` (#43b581) | Speaking ring, connected status, join button, voice tab active |
| `amber` (#d4a843) | Self-tile accent, connecting animation, switch button |
| `crimson` (#f04747) | Disconnect button, muted/deafened active state |
| `surface-tunnel` (#222) | User tile background |
| `surface-cavern` (#1a1a1a) | Voice bar background |
| `surface-burrow` (#2c2c2c) | Self-tile background |
| `surface-alcove` (#363636) | Control button default background |
| `earth-border` (#333) | Tile borders, dividers |
| `text-heading` | Channel name |
| `text-secondary` | Subtitle, metadata |
| `text-disabled` | Empty state, bitrate info |
