# Chat Channel View — Spec

_The `text` channel type. One of 9 channel types: text, voice, announcement, stage, forum, gallery, status, events, file_repo. This spec covers only the chat view — other channel types will have their own specs but share the same content area within the [Burrow View](burrow_view.md) shell._

---

## Overview

The Chat Channel view is the primary message display for text channels. It occupies the main content area inside the [Burrow View](burrow_view.md) shell. Messages flow vertically with the most recent at the bottom. The entire scrollable area uses the **data backbone** — a central vertical line — as the structural spine, with messages attached on alternating sides.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CHAT AREA                                   │
│                                                                     │
│     ┌─────┐       │                                                 │
│     │ msg │───────┤  ← backbone (center vertical amber line)        │
│     └─────┘       │                                                 │
│                   ├───────┌─────┐                                   │
│                   │       │ msg │                                    │
│                   │       └─────┘                                   │
│   ┌─────┐         │                                                 │
│   │ msg │─────────┤                                                 │
│   │     │──┐      │                                                 │
│   └─────┘  │      │                                                 │
│         ┌──┤      │  ← reply branch (outward sub-rail)              │
│         │reply│   │                                                 │
│         └──┤      │                                                 │
│         ┌──┤      │                                                 │
│         │reply│   │                                                 │
│         └─────┘   │                                                 │
│                   │                                                 │
│                                                                     │
│  ┌★ general┐┌★ dev┐┌★ art┐  ← favorite channel tabs (filing cabinet)
│  ├──────────────────────────────────────────────────────────┤
│  │  [Aurora is typing...]                                   │
│  │  > type a message...                              [send] │
│  └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────┘
```

---

## Scrollbar — Depth Gate

The scrollbar represents depth underground. Visual metaphor:

- **Bottom** (most recent) = **deepest point** — darker, warmer, alive
- **Top** (oldest) = **surface** — lighter, cooler, faded

Implementation:
- Custom scrollbar track with a subtle gradient: `surface-tunnel` at top → `surface-bedrock` at bottom
- Scrollbar thumb styled as a "depth marker" — amber-tinted, small, rounded
- Glow intensifies near the bottom (you're deep underground, the light is closer)
- Optional: faint particle effect on the track as you scroll (data flowing up)

---

## Message Display

### Backbone Alternation

Messages alternate left/right on the center backbone:
- **Same user within 2 minutes** → stays on the same side (grouped)
- **Different user** OR **same user after 2min gap** → flips to opposite side
- First message always starts on right

### Message Grouping

When the same user sends consecutive messages within the 2-minute window (staying on the same side):
- **First message**: shows full meta — avatar, username, timestamp
- **Subsequent messages**: suppress avatar, username, and timestamp — just show content
- The grouped messages share a single connection point on the backbone (one node dot for the group)
- Grouped bubbles stack tightly (reduced vertical gap: 1px instead of 3px)
- On hover over any grouped message, the timestamp appears inline as a subtle tooltip
- A new message from a different user, or a 2min+ gap, breaks the group and starts fresh

### Message Bubbles

- Flush against the backbone with a flat edge on the spine-facing side
- Node dot on the backbone at each message's connection point
- Rounded corners on the outer edges
- `surface-tunnel` background, `earth-border` border

### Role Edge Highlighting

Messages get a subtle edge glow/highlight based on the author's highest role color:
- Roles have default colors but **can be overridden per server** by the server owner
- The role color applies as a left or right border accent (2px, the side facing outward — away from backbone)
- Faint glow using the role color at low opacity: `box-shadow: 0 0 8px <role-color>25`
- If user has no role or role has no color → no highlight, just the default `earth-border`

### Message Hover Expansion

On hover:
- Subtle glow on the bubble: `box-shadow: 0 0 12px rgba(255, 200, 92, 0.08)`
- Bubble border shifts to `amber` at low opacity
- **Action bar slides out** from the outer edge (away from backbone):
  - Reply button
  - React button (opens reaction picker)
  - More (edit, delete, pin, copy, etc.)
- Action bar uses `surface-alcove` background, appears via translateX animation

### Reaction Badge

- Each message with **≥ 3 total reactions** shows a small **badge** in the outer-bottom corner with the **most-used reaction emoji**
- Messages with < 3 reactions: no badge (avoids visual clutter on casual single-thumbs-ups)
- Badge is a mini floating pill (like a notification bubble): emoji + count
- On hover over the badge or message, the full reaction bar expands showing all reactions with counts
- Clicking the badge toggles your vote on the top reaction (quick-react shortcut)
- Badge glows faintly on hover (`box-shadow` with the reaction's glow)
- **Reactions slide out** from the badge position with a smooth max-width + opacity animation
- Each reaction button shows: emoji + count, highlighted if the current user has reacted

---

## Reply Threads — Git Commit Graph Style

Replies use the **data cable** to draw connections, similar to a git commit graph:

```
     │
  ┌──┤  parent message (attached to backbone)
  │  │
  ├──│  reply 1 (hangs off sub-rail, same side, outward)
  │  │
  ├──│  reply 2
  │  │
  └──┘
     │
     │──┌──┐  next root message (other side)
        └──┘
     │
```

### Layout Rules
- Parent message connects to backbone normally
- A **sub-rail** (solid amber vertical line, opacity 0.7) forks **outward** on the **same side** as the parent
- Horizontal connector (amber) bridges backbone → sub-rail at the fork point
- Reply messages hang off the sub-rail, further from the backbone than the parent
- Reply node dots sit on the sub-rail
- Reply bubbles flush against the sub-rail (flat edge facing inward toward sub-rail)
- Replies are slightly smaller (0.84em font, tighter padding)

### Nested Replies
- If a reply itself has replies, another sub-rail forks further outward — each nesting level pushes ~40px further out
- **Cap at 3 levels** of visible nesting
- Beyond 3 levels: show a "continue thread →" link that opens a focused thread view (overlay or panel)

---

## Typing Indicator

Just above the input box:

- **Single user**: `Aurora is typing...` — with `violet` pulsing dots (3 dots, staggered animation)
- **Multiple users**: `Aurora, Kai, and 2 others are typing...`
- Uses `violet` color (ephemeral/transient per COLOR.md)
- Subtle fade-in/out animation
- Text in `text-secondary`, dots in `violet`

---

## Input Area

### Presence Orbs

Floating orbs around the input box showing who's present in the channel:

**States:**
- **Watching** (active, not typing): `moss` color, soft pulse (2-4s cycle), gentle float drift
- **Typing**: `violet` color, hard/fast pulse (0.8s cycle), more energetic movement

**Count behavior:**
- **≤ 6 users in a state**: show individual orbs (one per user), positioned around the input box edges
- **> 6 users in a state**: collapse to a **number** with **always 6 orbs** orbiting it
  - The number shows the count, 6 orbs orbit it in the appropriate state style (always 6 regardless of actual count)
  - Example: 9 watching, 0 typing → just `9` with 6 moss soft-pulse orbiting orbs
  - Example: 3 watching, 4 typing → `3` with 3 individual soft-pulse orbs + `4` with 4 individual violet hard-pulse orbs
  - Example: 7 watching, 2 typing → `7` with 6 soft-pulse orbiting orbs + 2 individual violet hard-pulse orbs
  - Example: 12 watching, 8 typing → `12` with 6 soft-pulse orbiting orbs + `8` with 6 hard-pulse orbiting orbs
- **If one state is 0**: only show the other (no "0" displayed)

**Orb visuals:**
- Size: ~8-10px, semi-transparent with glow
- Drift animation: subtle random position shift (CSS keyframes), never fully static
- Positioned along the top edge and sides of the input container

### Input Box

- `>` prompt (monospace, `text-secondary`, lights up `amber` on focus)
- Single-line expanding input
- Send button (arrow) on the right
- `surface-burrow` background, `earth-border` border
- On focus: border shifts to `amber` at low opacity, faint amber glow

### Favorite Channel Tabs

Per-server bookmarks that sit **above** the input bar, styled like **filing cabinet tabs** — the physical divider tabs that stick up from folders in a filing cabinet.

```
┌─ ★ general ─┐┌─ ★ dev ─┐┌─ ★ art ─┐
├─────────────────────────────────────┤
│  > type a message...         [send] │
└─────────────────────────────────────┘
```

**Tab shape:**
- Flat bottom edge (flush with the input bar top edge, no gap)
- Rounded top corners — the tab "sticks up" from the input area
- Tabs slightly overlap horizontally (like real filing dividers)
- Active tab: pulled forward (higher z-index), `amber` top edge, `surface-burrow` background seamlessly blending into the input bar below
- Inactive tabs: recessed, `surface-tunnel` background, `text-secondary` color
- ★ icon in `amber` on each tab

**Behavior:**
- **Adding favorites**: right-click a channel tab in the top channel bar → "Favorite" → tab appears here
- **Removing**: right-click the favorite tab → "Unfavorite"
- Click a favorite tab → switches to that channel (stays in the burrow view)
- Per-server: each server has its own set of favorite tabs
- **Maximum 3 favorites per server** — keeps the tab row compact and visually clean
- If 3 already favorited, must unfavorite one before adding another
- Order is draggable
- In compact mode: tabs collapse to a single `★` icon with a dropdown list

---

## Split Channel View

Available in full-screen burrow mode. Allows viewing two channels side-by-side for cross-referencing.

### Activation
- **Shift+click** a favorite tab → opens that channel as a second pane alongside the current one
- Maximum 2 panes

### Active Window System
- **Single shared input bar** at the bottom
- Click a pane to make it **active** — indicated by a subtle `amber` border on the active pane
- Inactive pane gets a slight desaturation/dimming overlay (opacity 0.85)
- Typing in the input bar sends to the **active pane's channel**
- A small channel name indicator on the input bar shows which channel you're typing into

### Layout
```
┌────────────────────────┬────────────────────────┐
│                        │                        │
│   Channel A            │   Channel B            │
│   (active — amber      │   (inactive — dimmed)  │
│    border)             │                        │
│                        │                        │
│                        │                        │
├────────────────────────┴────────────────────────┤
│  ┌★ general┐┌★ dev┐┌★ art┐                     │
│  ├──────────────────────────────────────────────┤
│  [Aurora is typing...]                          │
│  > type in #general...                   [send] │
└─────────────────────────────────────────────────┘
```

- Divider between panes: thicker `earth-border` (2px), draggable to resize
- Each pane has its own backbone, scroll position, and scrollbar
- Favorite tabs shared at the bottom
- **Compact mode**: split view disabled, only one channel visible

### Closing Split
- Click the `×` on the inactive pane's header to close it
- Or Shift+click the same favorite tab again to toggle off

---

## Animations & Transitions

| Element              | Animation                                    | Duration  |
|-----------------------|----------------------------------------------|-----------|
| Message arrive        | Slide in from backbone + fade                | 140ms     |
| Hover glow            | Border color + box-shadow transition         | 120ms     |
| Action bar slide      | Transform translateX from edge               | 100ms     |
| Reaction badge expand | Max-width + opacity from badge position      | 150ms     |
| Typing dots           | Violet pulsing (3 dots, staggered)           | 1.2s loop |
| Presence orbs (watch) | Float drift + soft pulse (moss)              | 2-4s loop |
| Presence orbs (type)  | Float drift + hard pulse (violet)            | 0.8s loop |
| Orb count collapse    | Individual orbs merge into orbiting number   | 300ms     |
| Scroll depth glow     | Track gradient shift                         | Passive   |
| Split pane active     | Border color transition (amber)              | 120ms     |
| Split pane inactive   | Opacity transition (→ 0.85)                  | 120ms     |

---

## Accessibility

- All interactive elements keyboard-navigable
- Reply/react actions accessible via keyboard shortcuts
- Scroll position announced to screen readers
- Typing indicators use `aria-live="polite"`
- Color-based role highlights always paired with border (not color-only)
- Reaction badge accessible via keyboard (Enter to toggle, arrow keys to navigate reactions)
- Split view: active pane announced on switch
- Presence orb counts have `aria-label` (e.g., "7 users watching, 2 users typing")
