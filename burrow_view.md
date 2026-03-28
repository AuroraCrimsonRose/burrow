# Burrow View — Spec

_The shell that wraps all channel views when inside a server (burrow). Contains the category rail, channel tab bar, voice call panel, and server header. Everything opens from the right — the topology view anchors to the left, so navigation flows naturally rightward._

---

## Overview

The Burrow View is the container layout when a user has entered a specific server. It provides navigation between categories and channels — while the central content area displays the active channel view (e.g., [Chat Channel](chat_channel.md) for text channels). Voice channels appear alongside text channels in the top tab bar; the left panel only appears when you're in an active voice call.

---

## Layout Structure

### Default (no voice call active)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────┐ ┌───────────────┐  │
│  │  # general  # dev  🔊 voice-1  # art  🔊 gaming     │ │  Server Name  │  │
│  ├───────────────────────────────────────────────────────┤ │  ──────────── │  │
│  │                                                       │ │               │  │
│  │                                                       │ │  [Category 1] │  │
│  │                                                       │ │  [Category 2] │  │
│  │              CHANNEL CONTENT AREA                     │ │  [Category 3] │  │
│  │              (Chat / Forum / etc.)                    │ │  [Category 4] │  │
│  │                                                       │ │               │  │
│  │                                                       │ │               │  │
│  │                                                       │ │               │  │
│  │                                                       │ │               │  │
│  └───────────────────────────────────────────────────────┘ └───────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### With active voice call

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ┌──────────┐ ┌──────────────────────────────────────────┐ ┌───────────────┐ │
│  │  VOICE   │ │  # general  # dev  🔊 voice-1  # art    │ │  Server Name  │ │
│  │  CALL    │ ├──────────────────────────────────────────┤ │  ──────────── │ │
│  │          │ │                                          │ │               │ │
│  │ 🔊 gaming│ │                                          │ │  [Category 1] │ │
│  │  ● Kai   │ │                                          │ │  [Category 2] │ │
│  │  ● Luna  │ │       CHANNEL CONTENT AREA               │ │  [Category 3] │ │
│  │  ◉ Ash ▶ │ │                                          │ │  [Category 4] │ │
│  │          │ │                                          │ │               │ │
│  │ ──────── │ │                                          │ │               │ │
│  │ [🔇][🔈]│ │                                          │ │               │ │
│  │ [Leave]  │ │                                          │ │               │ │
│  └──────────┘ └──────────────────────────────────────────┘ └───────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Zones

1. **Voice Call Panel** (left, conditional) — only visible when in an active voice call
2. **Channel Content** (center) — the active channel view, fills remaining space
3. **Category Rail** (right) — server name + category navigation

---

## Category Rail (Right Side)

Vertical rail on the right edge. All server navigation lives here — nothing on the left (topology owns the left).

### Server Name
- Top of the rail
- Server name in `text-heading`, truncated with ellipsis if too long
- Subtle `earth-border` divider below

### Category List
- Vertical list of category buttons
- Each category is a pill/block with the category name
- Click to select → **repopulates** the channel tab bar at the top with that category's channels (text + voice)
- First category auto-selected on server entry

### Activity Glow — 3 Levels

Categories glow based on **unread message count since the user's last visit**, relative to the server's total unreads. Each category's share of total server unreads determines its tier.

| Tier   | Condition                          | Glow Color       | Glow Intensity              |
|--------|------------------------------------|------------------|-----------------------------|
| Low    | < 15% of server unreads            | `earth-border`   | 1px border, no glow         |
| Medium | 15–50% of server unreads           | `amber`          | Faint amber edge glow       |
| High   | > 50% of server unreads            | `amber`          | Strong amber pulse glow     |

- Glow is a `box-shadow` on the category pill
- Active/selected category: solid `amber` border (distinct from activity glow)
- Unread dot (`violet`) if category has any unread @mentions

### Hover Preview

_Removed — too much visual noise. Category selection instantly opens the first accessible channel instead._

---

## Channel Tab Bar (Top)

Horizontal bar across the top of the content area. Repopulates when the user selects a different category. Shows **all channel types** for that category — text and voice channels together.

```
┌──────────────────────────────────────────────────────────────────┐
│  # general  │  # dev  │  🔊 voice-1  │  # art  │  🔊 gaming    │
└──────────────────────────────────────────────────────────────────┘
```

### Tab Styling
- Each tab: channel name prefixed with type icon
  - `#` for text
  - `🔊` for voice
  - `📢` for announcement
  - `🎭` for stage
  - `💬` for forum
  - `🖼` for gallery
  - `📌` for status
  - `📅` for events
  - `📁` for file_repo
- Active tab: `amber` underline indicator, `text-heading` color
- Inactive tab: `text-secondary` color
- Hover: `text-primary` color, subtle `surface-alcove` background

### Voice Channel Tab Indicators
- Voice tabs show a **user count badge** next to the channel name: `🔊 gaming (3)`
- Badge uses `moss` color if users are present, `text-disabled` if empty
- **Hover** over a voice tab → tooltip listing connected usernames (e.g., "Kai, Luna, Ash")
- If no users: hover shows "Empty"

### Clicking a Voice Channel Tab
- Opens the **voice call panel on the left** showing that channel's connected users, streaming status, etc.
- Does **NOT** auto-join the call — the panel has a prominent **[Join]** button
- Clicking [Join] connects you to the voice channel
- If already in that call → panel is already open, [Join] replaced with [Leave]
- If in a different call → panel shows the new channel with [Join], clicking it prompts "Switch voice channel?"
- Does NOT change the content area — voice channels don't have a content view (text channel stays active)

### Channel Activity Glow

Channels glow by activity (unread since last visit), using `teal` to distinguish from category `amber` glow:

| Tier   | Condition                           | Glow Color       | Effect                    |
|--------|-------------------------------------|------------------|---------------------------|
| Low    | < 15% of category unreads           | None             | Default styling           |
| Medium | 15–50% of category unreads          | `teal`           | Faint teal underline glow |
| High   | > 50% of category unreads           | `teal`           | Strong teal pulse glow    |

- Unread count badge: `violet` pill with count (per COLOR.md notification rules)
- Mention badge: `crimson` pill with `@` count

### Hover Preview

_Removed — keeps the UI clean. Click the tab to switch channels._

---

## Voice Call Panel (Left Side, Conditional)

Only appears when the user is **in an active voice call**. When not in a call, this panel doesn't exist — content area gets the full width.

### Layout

```
┌───────────┐
│  🔊 gaming│  ← channel name
│  ─────────│
│  ● Kai    │  ← connected user (speaking: moss ring)
│  ● Luna   │  ← connected user (silent: no ring)
│  ◉ Ash ▶  │  ← streaming indicator
│           │
│  ─────────│
│  [🔇 Mute]│  ← self controls
│  [🔈 Deaf]│
│  [Leave]  │
└───────────┘
```

### Features
- Shows the **selected/active voice channel** — users, streaming, call status
- If not yet joined: prominent **[Join Call]** button at the top
- If joined: button changes to **[Leave Call]**, self-controls appear at bottom
- Connected users list with real-time status:
  - `moss` border ring = currently speaking
  - No ring = silent/listening
  - `crimson` icon = muted
  - `▶` streaming indicator with stream preview on hover
- Self-controls at bottom: Mute, Deafen, Video, Screen Share, Leave
- Panel width: ~160px
- `surface-tunnel` background, `earth-border` right border
- **Dismiss/collapse**: small `×` or `◂` button to collapse the panel to a minimal floating call indicator (mic icon + duration + leave button) so it doesn't eat space

### Minimal Call Indicator (Collapsed)
When voice panel is collapsed:
```
┌──────────────────┐
│ 🔊 gaming  02:34 │  ← floating bar at top-left
│ [🔇] [Leave]     │
└──────────────────┘
```
- Small floating bar at top-left of content area
- Shows channel name + call duration
- Quick mute + leave buttons
- Click to re-expand the full voice panel

---

## Compact Mode — Accordion Layout

An alternative layout switchable in **Settings**. Replaces the horizontal channel tab bar with an **accordion-style right sidebar**.

In compact mode:
- The **category rail expands** to show channels inline under each category
- Click a category → it expands (accordion) revealing its channels as a sub-list
- Other categories collapse
- No horizontal tab bar at the top — the right rail handles both category + channel selection
- Content area gets more vertical space (no top bar)
- Voice channels appear inline with 🔊 icon + user count
- **Same glow rules apply**: category headers use amber activity glow (3 tiers), channel items use teal activity glow (3 tiers), unread/mention badges carry over identically
- Visually equivalent to the default layout — same information, same interactions, vertical axis instead of horizontal

```
┌───────────────────────────────────────────┐ ┌──────────────┐
│                                           │ │ Server Name  │
│                                           │ │ ──────────── │
│                                           │ │ ▸ General    │
│         CHANNEL CONTENT AREA              │ │ ▾ Dev        │
│                                           │ │   # backend  │
│                                           │ │   # frontend │
│                                           │ │   🔊 voice(2)│
│                                           │ │ ▸ Social     │
│                                           │ │ ▸ Admin      │
└───────────────────────────────────────────┘ └──────────────┘
```

This mode is better for narrow viewports or users who prefer single-column navigation.

---

## Compact / Shrunk Burrow Mode

When the burrow view is in compact/narrow mode (topology panel is expanded, eating horizontal space):

- **Category rail**: collapses to icons only (first letter of category name)
- **Channel tab bar**: shows only the active channel + a `···` overflow dropdown
- **Voice call panel**: auto-collapses to minimal call indicator
- **Split view**: disabled — only one channel visible
- **Favorite tabs**: collapsed to a single `★` icon with dropdown

---

## Responsive Behavior

| Viewport / Mode       | Voice Panel     | Content Area | Category Rail | Channel Tabs   |
|------------------------|----------------|--------------|---------------|----------------|
| Full width             | Full (if call) | Full         | Expanded      | Full           |
| Medium (topology open) | Minimal bar    | Full         | Icons only    | Active + `···` |
| Narrow (mobile-ish)    | Minimal bar    | Full         | Hidden        | Drawer         |

---

## Navigation Flow

1. User enters a burrow (server)
2. Category rail loads with all categories; first category auto-selected
3. Channel tab bar populates with that category's channels (text + voice); first text channel auto-selected
4. Content area shows the channel view (Chat Channel for text)
5. User clicks a different category → tab bar repopulates with new category's channels, first text channel selected
6. User clicks a text/non-voice channel tab → content area switches to that channel
7. User clicks a voice channel tab → joins voice call, voice call panel appears on the left (content area unchanged)
8. No voice call active → no left panel, content area gets full width

---

## Channel Type → View Mapping

The content area renders a different view component depending on the channel type:

| Channel Type    | View Component     | Status      |
|-----------------|--------------------|-------------|
| `text`          | Chat Channel View  | Spec'd ✓    |
| `voice`         | _(no content view — voice-only)_ | N/A |
| `announcement`  | Announcement View  | TODO        |
| `stage`         | Stage View         | TODO        |
| `forum`         | Forum View         | TODO        |
| `gallery`       | Gallery View       | TODO        |
| `status`        | Status View        | TODO        |
| `events`        | Events View        | TODO        |
| `file_repo`     | File Repo View     | TODO        |

---

## Animations & Transitions

| Element                   | Animation                                  | Duration  |
|---------------------------|--------------------------------------------|-----------|
| Category glow pulse       | box-shadow pulse (amber)                   | 2s loop   |
| Channel glow pulse        | underline glow pulse (teal)                | 2s loop   |
| Tab switch                | Content crossfade                          | 100ms     |
| Category select           | Tab bar slide-repopulate                   | 120ms     |
| Hover preview appear      | Fade in + slight translateY                | 150ms     |
| Voice panel appear/hide   | Width transition (0 ↔ 160px)               | 200ms     |
| Voice panel collapse      | Shrink to minimal bar                      | 200ms     |
| Category rail collapse    | Width transition                           | 200ms     |

---

## Accessibility

- Category rail and channel tabs keyboard-navigable (arrow keys + enter)
- Voice panel controls accessible via keyboard
- Active channel announced to screen readers on switch
- Hover previews also accessible via focus (keyboard users)
- Glow effects are decorative — information always also conveyed via text (unread counts, badges)
