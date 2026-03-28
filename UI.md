# Burrow — UI Design Language

_Navigation through topology, surfaces that breathe, and motion with purpose._

This document describes the visual and interaction design of Burrow's interface. It references [COLOR.md](COLOR.md) for all color tokens and semantics.

---

## Naming Glossary

| Term | What it means | Analogy |
|------|--------------|---------|
| **Topology** | The main navigation map — a visual graph of all your nodes | Discord's server list + home |
| **Network** | A grouping node that clusters multiple burrows under one parent | A server folder |
| **Burrow** | A single community / server — where channels, messages, and members live | A Discord server |
| **Mole** | A bot or automated agent operating inside a burrow | A Discord bot |

---

## Core Concept: The Topology

Burrow's navigation breaks from traditional sidebar/tab models. Instead, users navigate through a **topology map** — a visual graph of connected nodes representing the user's identity (home), their burrows, and their networks.

The topology is the **default view** after login. It fills the viewport as a dark underground map on `surface-bedrock`, with nodes floating at calculated positions connected by faint lines — like a system of tunnels branching from a central hub.

### The Home Node

- Centered at 50%/50% of the topology panel
- **64×64px** circle, larger than other nodes to anchor the view
- Border: `amber-muted` (2px) — a warm glow ring
- Background: `surface-tunnel`
- Text: user's first initial in `amber`, 1.4rem bold
- Pulsing outer ring: a `topology-node-ring` element at `inset: -6px`, border `1.5px solid amber-muted`, animates with `pulse-ring` (scale 1 → 1.15, opacity 0.4 → 0.15, 3s loop)
- **Active state**: fills `amber` background, text becomes `amber-text`
- The home node is always the gravitational center — all other nodes orbit around it

### Burrow Nodes

- **48×48px** circles orbiting the home node at a radius of 32% of the container
- Evenly distributed using trigonometric positioning (angle offset from -90° / top)
- Border: `earth-border` (2px)
- Background: `surface-burrow`
- Text: burrow's first initial in `text-secondary`, 1rem bold
- **Hover**: border shifts to `amber`, background lifts to `surface-tunnel`, text to `text-heading`, subtle scale(1.12) with `box-shadow: 0 0 16px rgba(255, 200, 92, 0.15)`
- **Active state**: fills `amber` background/border, text becomes `amber-text`, glow shadow

### Add Burrow Node

- **36×36px**, positioned below center at `cy + radius + 12%`
- Dashed border: `2px dashed earth-border`
- Background: transparent
- Text: "+" in `moss`
- **Hover**: border becomes `moss`, background fills `moss-muted`, scale(1.1)

### Connection Lines (SVG)

- Rendered as SVG `<line>` elements in a `viewBox="0 0 100 100"` overlay
- **Center-to-burrow lines**: `stroke: earth-border`, `stroke-width: 0.3`, opacity 0.4
  - Active: `stroke: amber`, `stroke-width: 0.5`, opacity 0.8
- **Adjacent burrow lines**: `stroke: earth-border`, `stroke-width: 0.15`, opacity 0.2 — subtle inter-node web (only when ≥3 burrows)

---

## Networks: Grouped Topology

Users can **drag burrows together** to create a **network** — a logical grouping that collapses multiple burrows into a single parent node on the main topology.

### Network Parent Node

- **40×40px** circle — slightly smaller than individual burrow nodes (48px) to signal "container, not destination"
- Border: `violet` (2px) — distinguishes networks from standalone burrows
- Background: `surface-burrow`
- Text: network name's first initial in `violet`, 0.9rem bold
- Small cluster indicator: 3 tiny overlapping circles (6px) at bottom-right, `earth-border` fill — hints at grouped contents
- **Hover**: border brightens to `violet`, scale(1.12), glow `box-shadow: 0 0 16px rgba(167, 139, 250, 0.15)`
- **Active state**: fills `violet` background, text becomes `surface-bedrock`

### Creating a Network

- Drag one burrow node onto another → both collapse into a new network parent
- A naming prompt appears (inline text input, `surface-burrow` background, `amber` focus ring)
- Additional burrows can be dragged onto an existing network parent to join
- Networks can be dissolved by dragging all children back out (or via context menu)

### Connection Lines for Networks

- Center-to-network lines use the same style as center-to-burrow, but with `stroke: violet` when active
- Child burrows have no visible lines on the main topology — they're hidden inside the network

---

## Sub-Topology View (Network Zoom)

Clicking a **network parent node** doesn't open a side panel — it **zooms into** a sub-topology view where the network's children are displayed as their own topology.

### Layout

```
┌──────────────────────────────────────────┐
│          ◯ Home (back)                   │
│          │                               │
│          │  (line connects to center)    │
│          │                               │
│        ┌─┴─┐                             │
│        │ N │  ← Network node (center)    │
│        └─┬─┘                             │
│       ╱  │  ╲                            │
│      S₁  S₂  S₃  ← Child burrows orbit  │
│                                          │
└──────────────────────────────────────────┘
```

- **Network node** takes the center position (50%/50%) — same role as home node in main topology
- **Child burrow nodes** orbit around it at the standard 32% radius, trigonometric distribution
- **Home button** at top-center, connected to the network center via an SVG line
  - **36×36px** circle
  - Border: `amber-muted` (2px)
  - Background: `surface-tunnel`
  - Text: "↩" or user's initial in `amber`, 0.85rem
  - **Hover**: border brightens to `amber`, scale(1.1)
  - **Click**: zooms back out to the main topology view

### Zoom Animation

The transition between main topology and sub-topology uses a coordinated zoom:

**Zooming in** (click network parent):
1. All non-network nodes fade out (opacity → 0, scale → 0.8, duration 0.3s)
2. Connection lines fade out
3. Clicked network node **stays in place** and slides to center (transform to 50%/50%)
4. Network node scales up to center-node size (40px → 64px) over 0.4s
5. Child burrows fade in from behind the network node (opacity 0 → 1, scale 0.6 → 1, staggered 50ms each)
6. Home button fades in from above (opacity 0 → 1, translateY(-20px → 0))
7. Connection lines from network center to children draw in

**Zooming out** (click home button):
1. Child burrows collapse back toward center (scale → 0.6, opacity → 0, staggered)
2. Home button fades up and out
3. Network node shrinks back to 40px and slides to its original position
4. Main topology nodes fade back in (scale 0.8 → 1, opacity → 1)
5. Connection lines restore

All zoom transitions use `cubic-bezier(0.4, 0, 0.2, 1)` to match the rest of the system.

### Interaction Within Sub-Topology

- Clicking a child burrow node follows the same **closed → peek → full** cycle as the main topology
- The side panel behavior is identical — channels + compact chat in peek, fullscreen in full
- In full mode, the user orb still appears at bottom-left and returns to peek (sub-topology still visible)
- The home button remains accessible in peek mode (visible in the topology panel alongside child nodes)

---

## Moles: Bots in Burrows

A **mole** is an automated agent (bot) that operates inside a burrow. Moles can respond to commands, moderate content, play music, or integrate external services.

### Mole Presence

- Moles appear in the burrow's member list with a `micro` badge: **"MOLE"** in `violet`, uppercase, `letter-spacing: 0.05em`
- Avatar: a **28×28px** circle with a `violet` border (1.5px) instead of the standard `earth-border` — visually distinguishes them from human members
- Status dot: `violet` instead of the usual `moss` (online) — always "online" when the mole is active, `earth-strong` when offline
- Username rendered in `text-secondary` (dimmer than human users in `text-primary`)

### Mole Messages

- Messages from moles render identically to human messages, but with:
  - A small **"MOLE"** badge next to the username (same `micro` style as member list)
  - Author name in `violet` instead of `text-heading`
- Mole messages participate in all the same systems: reactions, pins, edit history

### Mole Node (Future — Topology Integration)

- When viewing a burrow's channel sidebar, moles could appear as tiny **20×20px** nodes below the channel list
- `violet` border, `surface-burrow` background
- Clicking a mole node opens its profile/config panel

---

## Layered Typography

Burrow's type system creates hierarchy through weight and scale, using a single font stack. All sizes use `rem` for accessibility scaling.

### Type Scale

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `display` | 1.75rem | 700 | Empty states, onboarding headlines |
| `title` | 1.25rem | 600 | Panel headers, burrow names at top of channels |
| `heading` | 1rem | 600 | Section labels, channel group headers, settings categories |
| `body` | 0.9rem | 400 | Messages, descriptions, general content |
| `body-compact` | 0.85rem | 400 | Compact chat messages, metadata |
| `caption` | 0.75rem | 400 | Timestamps, secondary labels, counters |
| `micro` | 0.65rem | 500 | Badges, status dots, node cluster indicators |

### Color Pairing

- `display`, `title`, `heading` → `text-heading` (brightest)
- `body` → `text-primary`
- `body-compact`, `caption` → `text-secondary`
- `micro` → `text-muted`

### Principles

1. **Two weights maximum** per view — 400 for body text, 600 for emphasis. 700 only for display.
2. **No underlines** — links and interactive text use color (`amber`) and hover state, never underline.
3. **Uppercase sparingly** — only for `micro` labels where character count is ≤ 5 (e.g., "NEW", "LIVE"). Letter-spacing `0.05em` when uppercase.
4. **Line height** — body text: 1.5, headings: 1.2, micro/caption: 1.3.
5. **Truncation** — single-line labels use `text-overflow: ellipsis`. Multi-line content never truncates.

---

## Layout Model: Grid with Animated Side Panel

The layout uses a CSS Grid with two columns:

```
┌───────────────────────────────────────────┐
│  Topology Panel       │   Side Panel      │
│  (100% / remaining)   │   (0% → dynamic)  │
│                       │                   │
│  surface-bedrock      │   surface-cavern  │
│  border-right:        │                   │
│  earth-border         │                   │
└───────────────────────────────────────────┘
```

### Panel States

The side panel has three states controlled by clicking topology nodes:

| State | Grid Columns | What's Visible |
|-------|-------------|----------------|
| **Closed** | `100% 0%` | Topology only — full viewport |
| **Peek** (burrow) | `calc(100% - clamp(380px, 40vw, 600px)) clamp(380px, 40vw, 600px)` | Channels + compact chat |
| **Peek** (home) | `calc(100% - clamp(180px, 18vw, 260px)) clamp(180px, 18vw, 260px)` | Home menu |
| **Full** (burrow) | `0% 100%` | Fullscreen burrow — topology hidden |
| **Full** (home) | Same as peek | Home menu (always compact) |

**Why percentages?** CSS `grid-template-columns` can only smoothly interpolate between values of the same type. Using `1fr` mixed with `clamp()` or `0px` causes snapping — no transition. Pure `%` and `calc()` values interpolate beautifully.

### Click Cycle

```
Click burrow node → Peek (channels + compact chat)
Click same node  → Full (fullscreen burrow view)
Click same node  → Closed (back to topology)

Click home node  → Peek (home menu)
Click home node  → Closed
```

Clicking a **different** node always opens that node in Peek, regardless of current state.

### Transition Timing

All grid column transitions use:
```css
transition: grid-template-columns 0.45s cubic-bezier(0.4, 0, 0.2, 1);
```

This is a Material-style ease — fast start, gentle deceleration. The 0.45s duration is long enough to feel smooth but short enough to not feel sluggish.

---

## Side Panel Content

### Home Menu

A compact vertical list appearing when the home node is clicked. Always stays the same width (never goes "full").

- **Header**: username in `text-heading`, 0.95rem
- **Action cards** — stacked vertical buttons:
  1. **Friends** — users + group icon
  2. **Friend Requests** — user + plus icon
  3. **Settings** — gear icon
- Card styling: horizontal flex row, `surface-burrow` background, `earth-border`, `radius-md`
- Hover: slides right 3px (`translateX(3px)`), lifts to `surface-tunnel`, text brightens to `text-heading`
- Icons: 16×16 SVG stroke icons, opacity 0.6 → 1.0 on hover

### Burrow View — Peek Mode

Two side-by-side panels within the side panel:

```
┌──────────────────────────────────────────┐
│ Channel Sidebar  │  Compact Chat Area    │
│ clamp(160-240px) │  flex: 1              │
│ surface-tunnel   │  surface-cavern       │
└──────────────────────────────────────────┘
```

- **Channel sidebar**: burrow name header, scrollable text channel list with `#` hash icons
- **Compact chat**: same message area but with tighter spacing:
  - Message padding: `3px 6px`
  - Font size: 0.85rem
  - Input padding: `8px 12px`
  - Message header padding: `8px 12px`

### Burrow View — Full Mode

Same structure, but now fills the entire viewport width. The compact class is removed — message area gets full padding and font sizes.

All inner elements (channel sidebar width, message padding, input size) transition smoothly as the grid expands because they use `transition` on their relevant properties.

---

## The User Orb

When a burrow enters **Full** mode, the topology disappears. To maintain navigation, a **user orb** appears in the bottom-left corner — a miniature version of the home node.

### Animation

The orb is **always in the DOM** (not conditionally rendered) to enable CSS transitions:

```
Default state (hidden):
  opacity: 0
  transform: scale(0.5) translateY(-40vh)    ← positioned "up" as if in topology
  pointer-events: none

Full mode (visible):
  opacity: 1
  transform: scale(1) translateY(0)           ← settled in bottom-left
  pointer-events: auto
```

This creates the illusion of the home node **sliding down** from the topology center to its resting position at `bottom: 16px; left: 16px`.

### Appearance

- **44×44px** circle (smaller than the topology home node)
- Border: `amber-muted` (2px)
- Background: `surface-burrow`
- Text: user's first initial in `amber`, 1.1rem bold
- Shadow: `0 4px 16px rgba(0, 0, 0, 0.4)`
- **Hover**: border brightens to `amber`, background lifts to `surface-tunnel`, scale(1.1), enhanced glow shadow
- **Click**: returns to Peek mode (topology slides back in)

### Transition Timing

```css
transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
            transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
```

Matches the grid transition duration so the orb arrives as the topology finishes fading.

---

## Topology Panel Exit Animation

When entering burrow Full mode, the topology doesn't just disappear — it fades and shrinks:

```css
.panel-full.burrow-active .topology-panel {
  opacity: 0;
  transform: scale(0.9);        /* slight shrink toward center */
  pointer-events: none;
}
```

With `transform-origin: center center`, this creates a "pulling into a point" effect. The transition duration (0.4s) is synchronized with the grid column collapse and the user orb's slide-in.

---

## Animation Philosophy

### Principles

1. **Everything transitions** — No property change should snap. If a value changes, it should animate.
2. **Synchronized timing** — Grid, panel, orb, and topology animations all use the same duration (~0.4–0.45s) and easing curve so they feel like one coordinated motion.
3. **Easing matters** — `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard) for most transitions. Fast attack, smooth deceleration. Never `linear`. Never `ease-in` alone.
4. **Purpose over flash** — Animations communicate spatial relationships (the orb came from the topology; the panel slid in from the side). They're not decorative.
5. **Respect the user** — An "Animations" toggle in Settings → Appearance disables all motion via:

```css
.no-animate,
.no-animate *,
.no-animate *::before,
.no-animate *::after {
  transition-duration: 0s !important;
  animation-duration: 0s !important;
}
```

### Transition Map

| Element | Property | Duration | Easing | Trigger |
|---------|----------|----------|--------|---------|
| Grid columns | `grid-template-columns` | 0.45s | cubic-bezier(0.4, 0, 0.2, 1) | Panel state change |
| Side panel | `opacity`, `transform` | 0.35s | cubic-bezier(0.4, 0, 0.2, 1) | Panel open/close |
| Topology panel | `opacity`, `transform` | 0.4s | cubic-bezier(0.4, 0, 0.2, 1) | Full mode enter/exit |
| User orb | `opacity`, `transform` | 0.4s | cubic-bezier(0.4, 0, 0.2, 1) | Full mode enter/exit |
| Channel sidebar | `width` | 0.4s | cubic-bezier(0.4, 0, 0.2, 1) | Panel resize |
| Message input | `padding`, `font-size` | 0.35s | cubic-bezier(0.4, 0, 0.2, 1) | Compact ↔ full |
| Topology nodes | `transform`, `border-color`, `background` | 0.25s | ease | Hover/active |
| Home action cards | `transform`, `background`, `color` | 0.15s | ease | Hover |
| Pulse ring | `transform`, `opacity` | 3s | ease-in-out | Continuous loop |
| Network zoom (in) | `transform`, `opacity` | 0.4s | cubic-bezier(0.4, 0, 0.2, 1) | Click network parent |
| Network zoom (out) | `transform`, `opacity` | 0.35s | cubic-bezier(0.4, 0, 0.2, 1) | Click sub-topology home |
| Child node stagger | `transform`, `opacity` | 0.25s | cubic-bezier(0.4, 0, 0.2, 1) | 50ms stagger per child |

### Keyframe Animations

- **`pulse-ring`** — Home node outer ring breathes: scale 1→1.15, opacity 0.4→0.15 over 3s
- **`fadeIn`** — Simple 0→1 opacity for overlays
- **`slideUp`** — Opacity 0→1 + translateY(12px→0) for modals/settings panel
- **`zoom-in`** — Network zoom: child nodes stagger in (scale 0.6→1, opacity 0→1, 50ms stagger)
- **`zoom-out`** — Network zoom: child nodes collapse back (scale 1→0.6, opacity 1→0)

---

## Settings Overlay

The settings panel uses a fixed overlay outside the grid layout (z-index 100) so it's unaffected by topology/panel state.

- **Overlay**: `rgba(18, 18, 18, 0.85)` backdrop with `fadeIn` animation
- **Panel**: `surface-cavern` card, `earth-border`, `radius-xl`, `shadow-lg`
- **Size**: 820px × 560px (max 92vw × 85vh), `slideUp` entrance
- **Layout**: 200px sidebar (`surface-tunnel`) + flex content area
- **Tabs**: 7 categories (Account, Appearance, Voice, Video, Notifications, Keybinds, Sessions), each with inline SVG icons
- **Appearance tab** includes the **Animations** toggle — a custom toggle switch (`moss` when active, `earth-strong` when off) with a sliding knob

---

## Responsive Approach

No fixed pixel widths for layout columns. All panel sizing uses `clamp()` with `vw` units:

| Element | Width | Rationale |
|---------|-------|-----------|
| Peek panel (burrow) | `clamp(380px, 40vw, 600px)` | Enough for channels + compact chat, caps at 600px |
| Peek panel (home) | `clamp(180px, 18vw, 260px)` | Just a menu list |
| Channel sidebar | `clamp(160px, 15vw, 240px)` | Channel names readable at any size |
| Full panel (burrow) | `100%` | Takes entire viewport |

This ensures the layout works from 1024px to ultrawide without media queries.

---

## Color Usage in Layout (ref: COLOR.md)

| Surface | Token | Where |
|---------|-------|-------|
| Topology background | `surface-bedrock` | Deepest layer — the underground expanse |
| Side panel / chat background | `surface-cavern` | Primary content surface |
| Channel sidebar | `surface-tunnel` | Secondary panel, one step up |
| Cards / input backgrounds | `surface-burrow` | Interactive containers |
| Borders | `earth-border` | All panel dividers, card edges |
| Active items | `amber` / `amber-muted` | Selected channel, active node |
| Node connections | `earth-border` | SVG lines at low opacity |
| Active connections | `amber` | Line to selected node |
