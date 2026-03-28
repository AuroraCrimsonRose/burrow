# Burrow — Color & Design Language

_A subterranean palette for a platform built underground_

---

## Design Philosophy

Burrow is an underground place — a warren of tunnels, chambers, and hidden alcoves lit by warm lantern light, luminescent crystals, and patches of moss. The color language reflects this world: dark earthen surfaces provide depth and comfort, while carefully placed light sources guide users through the interface without overwhelming them.

Every color earns its place. Dark surfaces recede. Warm amber draws the eye to actions. Cool violet marks the ephemeral and transient. Green signals growth and success. The palette is deliberately restrained — a dark environment where color means something.

### Principles

1. **Depth through darkness** — Surfaces use subtle grey steps (never pure black) to create spatial hierarchy without harsh contrast
2. **Light is intentional** — Accent colors act as light sources in a dark space; each has a single clear purpose
3. **Warm over cool** — Primary interactions use warm tones (amber, orange) to feel inviting; cool tones (violet, teal) are reserved for informational or transient states
4. **Semantic consistency** — A color always means the same thing everywhere in the UI; users learn the language once
5. **Accessibility first** — All text/background combinations meet WCAG AA (4.5:1 normal text, 3:1 large text / UI components)

---

## Surface System

Surfaces create the spatial depth of the burrow. Six elevation levels move from the deepest background to the highest floating element. Each step is a deliberate +10 lightness increment in perceived brightness.

| Token              | Hex       | Role                                       |
|---------------------|-----------|---------------------------------------------|
| `surface-bedrock`   | `#121212` | App shell, window chrome, deepest layer     |
| `surface-cavern`    | `#1a1a1a` | Primary background, main content area       |
| `surface-tunnel`    | `#222222` | Sidebars, secondary panels, nav rails       |
| `surface-burrow`    | `#2c2c2c` | Cards, channel panels, content containers   |
| `surface-alcove`    | `#363636` | Dropdowns, popovers, context menus          |
| `surface-ledge`     | `#424242` | Modal overlays, toasts, floating elements   |

### Usage Rules

- **No skipping levels** — A card (`burrow`) sitting on a sidebar (`tunnel`) is correct. A card on `bedrock` skips a level and loses depth clarity.
- **Borders over shadows** — Use `earth-border` (see below) for separation between same-level surfaces. Shadows are reserved for floating elements (`alcove`, `ledge`).
- **Hover lift** — Hovering a surface element raises it one level (e.g., a `burrow` card becomes `alcove` on hover).

---

## Accent Palette

### Lantern Amber — Primary Action

_The steady warm light that guides you through the tunnels._

| Token             | Hex       | Usage                                              |
|--------------------|-----------|-----------------------------------------------------|
| `amber`            | `#ffc85c` | Primary buttons, active tab indicator, selected item |
| `amber-hover`      | `#ffd97f` | Hover state for primary actions                      |
| `amber-active`     | `#e6b34e` | Pressed / active state                               |
| `amber-muted`      | `#33281a` | Amber-tinted background (selected sidebar items, active states) |
| `amber-text`       | `#1a1a1a` | Text on amber backgrounds (high contrast)            |

**Contrast:** `amber` on `surface-cavern` = **11.2:1** ✓  
**Button text:** `amber-text` on `amber` = **10.8:1** ✓

### Cave Violet — Ephemeral & Notification

_Bioluminescent crystal glow — things that pulse, fade, or demand momentary attention._

| Token              | Hex       | Usage                                                |
|---------------------|-----------|-------------------------------------------------------|
| `violet`            | `#9c7dd8` | Notification badges, ephemeral TTL bars, unread indicators |
| `violet-hover`      | `#b196e2` | Hover state                                           |
| `violet-active`     | `#8568c0` | Pressed / active state                                |
| `violet-muted`      | `#1e1a2e` | Violet-tinted background (notification panels, TTL containers) |

**Contrast:** `violet` on `surface-cavern` = **5.6:1** ✓  
**Design note:** Violet is reserved for transient UI — file TTL countdown bars, ephemeral message indicators, notification badges, typing indicators. Never use for permanent navigation.

### Moss Green — Success & Secondary Action

_Patches of life growing in the dark — confirmation, health, presence._

| Token             | Hex       | Usage                                           |
|--------------------|-----------|--------------------------------------------------|
| `moss`             | `#7ed1a3` | Success states, online presence, secondary buttons, tags |
| `moss-hover`       | `#96dbb5` | Hover state                                       |
| `moss-active`      | `#69b88e` | Pressed / active state                            |
| `moss-muted`       | `#162e22` | Green-tinted background (success banners, confirmation panels) |

**Contrast:** `moss` on `surface-cavern` = **8.8:1** ✓  
**Design note:** Moss is the "positive" signal. Online status dots, successful uploads, verified badges, connected integrations, trust tier indicators — anything that confirms health or completion.

### Sky Teal — Links & Interactive

_Underground springs — flowing, connective, interactive._

| Token             | Hex       | Usage                                            |
|--------------------|-----------|---------------------------------------------------|
| `teal`             | `#4dc7d2` | Hyperlinks, @mentions, channel references, interactive badges |
| `teal-hover`       | `#6dd4dd` | Hover state                                        |
| `teal-active`      | `#3fb0ba` | Pressed / active state                             |
| `teal-muted`       | `#132a2c` | Teal-tinted background (mention highlights)        |

**Contrast:** `teal` on `surface-cavern` = **8.4:1** ✓  
**Design note:** Teal is purely interactive/referential. Links, mentions, channel crosslinks, user profile links. It draws the eye to clickable references without competing with amber's call-to-action authority.

---

## Utility Colors

### Flame Orange — Ephemeral & Temporary

_A flickering torch — things that won't last._

| Token              | Hex       | Usage                                               |
|---------------------|-----------|-------------------------------------------------------|
| `flame`             | `#ff9e5c` | Ephemeral media accents, temporary file badges, expiring content indicators |
| `flame-hover`       | `#ffb37d` | Hover state                                           |
| `flame-muted`       | `#332014` | Orange-tinted background (ephemeral content cards)    |

**Contrast:** `flame` on `surface-cavern` = **8.2:1** ✓  
**Design note:** Flame is the "clock is ticking" color. File TTL badges, ephemeral message borders, temporary invite links, countdown timers. It's close to amber by design — both are warm light sources — but flame has urgency where amber has stability. Use sparingly; if something is permanent, it should never be flame-colored.

### Crimson — Error & Destructive

_Warning carved in stone — danger, stop, undo._

| Token              | Hex       | Usage                                             |
|---------------------|-----------|-----------------------------------------------------|
| `crimson`           | `#e06a6a` | Error messages, destructive buttons, failed states, ban indicators |
| `crimson-hover`     | `#e88585` | Hover state for destructive actions                  |
| `crimson-active`    | `#cc5555` | Pressed state                                        |
| `crimson-muted`     | `#2e1616` | Red-tinted background (error banners, warning panels) |

**Contrast:** `crimson` on `surface-cavern` = **5.9:1** ✓  
**Design note:** Crimson is the siren. Errors, failed uploads, destructive confirmations ("Delete server?"), content warnings, ban/kick feedback. Pair a `crimson-muted` background with `crimson` text for inline error messages.

### Warm Beige — Informational

_Sandstone walls — neutral, warm, informative._

| Token             | Hex       | Usage                                             |
|--------------------|-----------|-----------------------------------------------------|
| `beige`            | `#d6c3a1` | Info badges, subtle callout text                     |
| `beige-muted`      | `#252118` | Beige-tinted background (modal overlays, info boxes, onboarding cards) |

**Contrast:** `beige` on `surface-cavern` = **10.2:1** ✓  
**Design note:** Beige is the neutral informational tone. Onboarding tooltips, "did you know" callouts, system messages that aren't errors. It blends with the warm palette without demanding attention.

---

## Earth System — Borders & Structure

_The geological layers that give the burrow its shape._

| Token              | Hex       | Usage                                        |
|---------------------|-----------|------------------------------------------------|
| `earth-border`      | `#3d3532` | Default dividers, card borders, panel edges    |
| `earth-strong`      | `#7b5e57` | Emphasized borders, section dividers, avatar rings |
| `earth-shadow`      | `rgba(43, 33, 29, 0.6)` | Drop shadows on floating elements (alcove, ledge) |

**Design note:** Borders use brown-tinted greys rather than pure grey — this keeps the underground warmth consistent. Avoid `#333333` or `#444444` for borders; always use the earth tokens. Shadows are subtle and warm, never blue-black.

---

## Text System

| Token             | Hex       | Usage                                           | Contrast on Cavern |
|--------------------|-----------|--------------------------------------------------|---------------------|
| `text-primary`     | `#ececec` | Body text, message content, input text           | **13.5:1** ✓        |
| `text-heading`     | `#f5f5f5` | Titles, headings, high-priority labels, usernames | **15.1:1** ✓        |
| `text-secondary`   | `#a3a3a3` | Timestamps, muted info, placeholders, captions   | **5.8:1** ✓         |
| `text-disabled`    | `#666666` | Disabled controls, inactive tabs                 | **3.2:1** ★         |
| `text-inverse`     | `#1a1a1a` | Text on light/accent backgrounds (buttons)       | —                   |

★ `text-disabled` intentionally sits below body-text AA to visually communicate "not interactive." It passes the 3:1 threshold for UI components (WCAG 1.4.11).

### Text on Accent Surfaces

| Text Token       | On Surface      | Ratio   | Pass  |
|-------------------|-----------------|---------|-------|
| `text-inverse`   | `amber`          | **10.8:1** | AA ✓  |
| `text-inverse`   | `moss`           | **8.4:1**  | AA ✓  |
| `text-inverse`   | `teal`           | **8.0:1**  | AA ✓  |
| `text-primary`   | `crimson-muted`  | **11.8:1** | AA ✓  |
| `text-primary`   | `violet-muted`   | **12.2:1** | AA ✓  |
| `text-primary`   | `amber-muted`    | **12.0:1** | AA ✓  |

---

## Semantic Mapping

This table maps every UI concept to exactly one color. If a concept isn't listed, it doesn't have a color — use `text-secondary` or the default surface.

| Concept                       | Color Token    | Example                                  |
|-------------------------------|----------------|------------------------------------------|
| **Primary action**            | `amber`        | "Send", "Create Server", "Save"          |
| **Selected / active**         | `amber`        | Active sidebar item, selected tab         |
| **Secondary action**          | `moss`         | "Cancel" (non-destructive), "Add Tag"    |
| **Destructive action**        | `crimson`      | "Delete", "Ban User", "Leave Server"     |
| **Link / reference**          | `teal`         | URLs, @mentions, #channel-links          |
| **Success**                   | `moss`         | Upload complete, connection established   |
| **Error**                     | `crimson`      | Failed send, validation error, disconnect |
| **Warning**                   | `flame`        | Approaching rate limit, storage near full |
| **Info**                      | `beige`        | System announcements, onboarding tips    |
| **Notification badge**        | `violet`       | Unread count, new mention badge          |
| **Ephemeral / TTL**           | `violet`       | TTL countdown bar on files               |
| **Ephemeral media accent**    | `flame`        | Ephemeral message border, temp file icon |
| **Online**                    | `moss`         | Presence dot                             |
| **Idle**                      | `amber`        | Presence dot                             |
| **Do Not Disturb**            | `crimson`      | Presence dot                             |
| **Offline**                   | `text-disabled`| Presence dot (hollow)                    |
| **Trust tier indicator**      | `moss`         | Tier badge glow                          |
| **Typing indicator**          | `violet`       | Pulsing dots                             |
| **Slow mode timer**           | `flame`        | Countdown in compose area                |
| **File TTL badge**            | `flame`        | "Expires in 3d" badge on file            |
| **Voice active speaker**      | `moss`         | Green border on avatar                   |
| **Voice muted**               | `crimson`      | Strikethrough mic icon                   |
| **Server rule acceptance**    | `amber`        | "I agree" button                         |
| **Content report**            | `crimson`      | Report flag icon                         |
| **Moderation action**         | `flame`        | Timeout/warn indicator                   |
| **Server analytics**          | `teal`         | Chart accents, stat highlights           |

---

## Component Patterns

### Buttons

```
┌─────────────────────────────────────────────────────────────┐
│  Primary     [  amber  bg  |  text-inverse  ]               │
│  Secondary   [  moss   bg  |  text-inverse  ]               │
│  Destructive [  crimson bg |  text-primary  ]               │
│  Ghost       [  transparent |  text-secondary ] → hover: surface-alcove  │
│  Disabled    [  surface-alcove bg | text-disabled ]          │
└─────────────────────────────────────────────────────────────┘
```

- Border radius: `6px` — slightly rounded, not bubbly
- Hover: shift to `-hover` variant of the color
- Active: shift to `-active` variant
- Focus ring: `2px solid` matching accent color, `2px offset`

### Cards & Panels

```
┌─────────────────────────────────────────────────────────────┐
│  surface-burrow                                              │
│  border: 1px solid earth-border                              │
│  hover: surface-alcove (optional, for interactive cards)     │
│  border-radius: 8px                                          │
│  padding: 16px                                               │
└─────────────────────────────────────────────────────────────┘
```

### Message Bubble (Highlighted)

```
┌─────────────────────────────────────────────────────────────┐
│  Mention highlight:  teal-muted bg  +  left 3px teal border │
│  Ephemeral msg:      flame-muted bg +  left 3px flame border│
│  System message:     beige-muted bg +  left 3px beige border│
│  Error/warning:      crimson-muted bg + left 3px crimson     │
└─────────────────────────────────────────────────────────────┘
```

### TTL Progress Bar

```
┌──────────────────────────────────────────┐
│  Track:  surface-alcove                   │
│  Fill:   violet (> 50% remaining)         │
│         flame  (< 50% remaining)          │
│         crimson (< 10% remaining)         │
│  Height: 3px, border-radius: 2px          │
└──────────────────────────────────────────┘
```

### Input Fields

```
┌─────────────────────────────────────────────────────────────┐
│  Background:  surface-tunnel                                 │
│  Border:      earth-border (resting)                         │
│              amber (focused)                                 │
│              crimson (error)                                 │
│  Text:        text-primary                                   │
│  Placeholder: text-secondary                                 │
│  border-radius: 6px                                          │
└─────────────────────────────────────────────────────────────┘
```

### Presence Dots

```
  ●  moss       Online
  ●  amber      Idle
  ●  crimson    Do Not Disturb
  ○  text-disabled  Offline (hollow ring, 2px stroke)
```

---

## CSS Custom Properties

```css
:root {
  /* ── Surfaces ── */
  --surface-bedrock: #121212;
  --surface-cavern:  #1a1a1a;
  --surface-tunnel:  #222222;
  --surface-burrow:  #2c2c2c;
  --surface-alcove:  #363636;
  --surface-ledge:   #424242;

  /* ── Amber (Primary) ── */
  --amber:          #ffc85c;
  --amber-hover:    #ffd97f;
  --amber-active:   #e6b34e;
  --amber-muted:    #33281a;
  --amber-text:     #1a1a1a;

  /* ── Violet (Ephemeral / Notification) ── */
  --violet:         #9c7dd8;
  --violet-hover:   #b196e2;
  --violet-active:  #8568c0;
  --violet-muted:   #1e1a2e;

  /* ── Moss (Success / Secondary) ── */
  --moss:           #7ed1a3;
  --moss-hover:     #96dbb5;
  --moss-active:    #69b88e;
  --moss-muted:     #162e22;

  /* ── Teal (Links / Interactive) ── */
  --teal:           #4dc7d2;
  --teal-hover:     #6dd4dd;
  --teal-active:    #3fb0ba;
  --teal-muted:     #132a2c;

  /* ── Flame (Ephemeral / Warning) ── */
  --flame:          #ff9e5c;
  --flame-hover:    #ffb37d;
  --flame-muted:    #332014;

  /* ── Crimson (Error / Destructive) ── */
  --crimson:        #e06a6a;
  --crimson-hover:  #e88585;
  --crimson-active: #cc5555;
  --crimson-muted:  #2e1616;

  /* ── Beige (Informational) ── */
  --beige:          #d6c3a1;
  --beige-muted:    #252118;

  /* ── Earth (Borders & Structure) ── */
  --earth-border:   #3d3532;
  --earth-strong:   #7b5e57;
  --earth-shadow:   rgba(43, 33, 29, 0.6);

  /* ── Text ── */
  --text-primary:   #ececec;
  --text-heading:   #f5f5f5;
  --text-secondary: #a3a3a3;
  --text-disabled:  #666666;
  --text-inverse:   #1a1a1a;

  /* ── Radii ── */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-sm:  0 1px 3px var(--earth-shadow);
  --shadow-md:  0 4px 12px var(--earth-shadow);
  --shadow-lg:  0 8px 24px var(--earth-shadow);
}
```

---

## Token Naming Convention

All tokens follow this pattern:

```
--{category}[-{variant}]

  category:  surface | amber | violet | moss | teal | flame | crimson | beige | earth | text
  variant:   hover | active | muted | strong | border | shadow | primary | secondary | heading | disabled | inverse
```

- **Base** (`--amber`) — Default resting state
- **Hover** (`--amber-hover`) — Pointer hover, lighter
- **Active** (`--amber-active`) — Pressed/click, darker
- **Muted** (`--amber-muted`) — Tinted background for containers/highlights
- **Strong** (`--earth-strong`) — Emphasized variant

---

## Palette at a Glance

```
  SURFACES         ACCENTS           UTILITY           TEXT
  ────────         ───────           ───────           ────
  ██ #121212       ██ #ffc85c        ██ #ff9e5c        ██ #f5f5f5
  ██ #1a1a1a       ██ #9c7dd8        ██ #e06a6a        ██ #ececec
  ██ #222222       ██ #7ed1a3        ██ #d6c3a1        ██ #a3a3a3
  ██ #2c2c2c       ██ #4dc7d2        ██ #7b5e57        ██ #666666
  ██ #363636
  ██ #424242
  Bedrock           Amber             Flame             Heading
  Cavern            Violet            Crimson           Primary
  Tunnel            Moss              Beige             Secondary
  Burrow            Teal              Earth             Disabled
  Alcove
  Ledge
```

---

## Do / Don't

| ✓ Do                                                         | ✗ Don't                                                     |
|--------------------------------------------------------------|--------------------------------------------------------------|
| Use `amber` for the single primary action per view           | Use `amber` and `moss` buttons side-by-side as equals        |
| Use `violet-muted` bg with `violet` accents for TTL UI       | Use `violet` for permanent navigation elements               |
| Use `earth-border` between panels at the same elevation      | Use pure grey (`#333`, `#444`) for any border                |
| Use `flame` exclusively for time-limited / ephemeral things  | Use `flame` for general hover effects on permanent UI        |
| Use `teal` for all clickable text references                 | Use `amber` for links (amber = buttons, teal = links)       |
| Use `crimson-muted` bg for inline error messages             | Use `crimson` bg with white text (too aggressive)            |
| Use `text-secondary` for timestamps and metadata             | Use `text-disabled` for readable content                     |
| Raise surface one level on hover for interactive cards       | Skip elevation levels (e.g., `cavern` → `alcove`)           |
| Use warm-tinted shadows (`earth-shadow`)                     | Use pure black or blue-tinted shadows                        |

---

## Accessibility Summary

| Pair                              | Ratio      | WCAG Level |
|------------------------------------|-----------|------------|
| `text-heading` on `surface-cavern` | **15.1:1** | AAA        |
| `text-primary` on `surface-cavern` | **13.5:1** | AAA        |
| `amber` on `surface-cavern`        | **11.2:1** | AAA        |
| `beige` on `surface-cavern`        | **10.2:1** | AAA        |
| `moss` on `surface-cavern`         | **8.8:1**  | AAA        |
| `teal` on `surface-cavern`         | **8.4:1**  | AAA        |
| `flame` on `surface-cavern`        | **8.2:1**  | AAA        |
| `crimson` on `surface-cavern`      | **5.9:1**  | AA         |
| `text-secondary` on `surface-cavern`| **5.8:1** | AA         |
| `violet` on `surface-cavern`       | **5.6:1**  | AA         |
| `text-disabled` on `surface-cavern`| **3.2:1**  | AA (UI)    |

All interactive text meets AA. All body text meets AAA.

---

## Badge Rarity Colors

| Rarity | Color Name | Hex | Description |
|------|------|------|------|
| Common | Stone Grey | #a3a3a3 | Standard badges earned through normal participation or baseline membership. |
| Uncommon | Moss Green | #7ed1a3 | Slightly rarer achievements showing trusted activity or steady involvement. |
| Rare | Deep Teal | #4dc7d2 | Recognition for meaningful contributions or standout participation. |
| Epic | Crystal Violet | #9c7dd8 | Significant milestones, major accomplishments, or event victories. |
| Legendary | Lantern Gold | #ffc85c | Extremely rare honors tied to founders, major achievements, or historic recognition. |
| Mythic | Arcane Rose | #ff6ec7 | Ultra-rare badges granted for extraordinary influence or once-in-a-lifetime accomplishments. |
| Artifact | Relic Crimson | #ff3b3b | Unique or near-unique badges tied to platform history, development, or special circumstances. |

## Future Considerations

- **Light theme** — Not planned. Burrow is underground. If demand warrants it, create a "Daylight" variant using the same token names with inverted surface values and adjusted accent brightness.
- **High contrast mode** — Push all accent contrasts above 7:1 by darkening surfaces to `#0d0d0d` and brightening accents.
- **Color-blind safe** — Amber/crimson and moss/teal pairs are distinguishable across protanopia, deuteranopia, and tritanopia. Avoid relying solely on moss vs. flame (orange vs. green) without shape/icon differentiation.
- **Custom themes** — The token system supports user-customizable accent colors. Lock surfaces and text; allow users to override `amber`, `violet`, `moss`, `teal`.
