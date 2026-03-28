# Badge System

Badges are achievement-style markers tied to user accounts. They
represent milestones, roles, or historic participation within Burrow.

Badges appear in user profiles, member lists, and server contexts.

------------------------------------------------------------------------

# Badge Rarity Colors

  --------------------------------------------------------------------------
  Rarity            Color Name        Hex               Description
  ----------------- ----------------- ----------------- --------------------
  Common            Stone Grey        #a3a3a3           Standard badges
                                                        earned through
                                                        normal participation
                                                        or baseline
                                                        membership.

  Uncommon          Moss Green        #7ed1a3           Slightly rarer
                                                        achievements showing
                                                        trusted activity or
                                                        steady involvement.

  Rare              Deep Teal         #4dc7d2           Recognition for
                                                        meaningful
                                                        contributions or
                                                        standout
                                                        participation.

  Epic              Crystal Violet    #9c7dd8           Significant
                                                        milestones, major
                                                        accomplishments, or
                                                        event victories.

  Legendary         Lantern Gold      #ffc85c           Extremely rare
                                                        honors tied to
                                                        founders, major
                                                        achievements, or
                                                        historic
                                                        recognition.

  Mythic            Arcane Rose       #ff6ec7           Ultra-rare badges
                                                        granted for
                                                        extraordinary
                                                        influence or
                                                        once-in-a-lifetime
                                                        accomplishments.

  Artifact          Relic Crimson     #ff3b3b           Unique or
                                                        near-unique badges
                                                        tied to platform
                                                        history,
                                                        development, or
                                                        special
                                                        circumstances.

  Vanity            Burrow Copper     #c47a3a           Used for system
                                                        identities such as
                                                        bots and automated
                                                        accounts.
  --------------------------------------------------------------------------

------------------------------------------------------------------------

# Badge Visual Design

All badges use:

-   Hexagonal container
-   Border colored by rarity
-   Icon from RPG Awesome

Icon library: https://github.com/nagoshiashumari/Rpg-Awesome

Visual behavior:

-   badges scale slightly on hover
-   rarity-colored glow appears on hover
-   higher rarities transition from matte → foil appearance
-   foil intensity increases with rarity

Example progression:

Common → matte metal Rare → polished metal Epic → reflective Legendary →
glowing foil Mythic / Artifact → strong foil shimmer

------------------------------------------------------------------------

# Badge Display Rules

Badges appear in:

-   public profile
-   server profile
-   member list (primary badge only)

Display limits:

-   Maximum 3 badges visible
-   Overflow becomes a button showing the remaining count

Example:

\[badge\] \[badge\] \[badge\] +3

Selecting +3 opens the full badge list on the profile.

------------------------------------------------------------------------

# Primary Badge

Users can select a primary badge from badges they have earned.

The primary badge appears:

-   next to the username in member lists
-   in compact profile displays
-   in message headers where applicable

Selection is configured in Profile Customization.

------------------------------------------------------------------------

# Badge Hover Information

Hovering a badge displays a tooltip or card containing:

-   Badge name
-   Issued date (month + year)
-   Rarity
-   Badge description

Example:

Developer

Issued: March 2026 Rarity: Mythic

Awarded to official Burrow platform developers.

------------------------------------------------------------------------

# Initial Platform Badges

## 1 --- Developer

Rarity: Mythic Icon: ra-forging

Description: Awarded to official Burrow developers.

Currently assigned only to:

-   AuraCrimsonRose

------------------------------------------------------------------------

## 2 --- Mole (Bot)

Rarity: Vanity Icon: ra-shovel

Issued: March 2026

Description:

Identifies automated accounts, system messages, and service bots
operating inside Burrow.

------------------------------------------------------------------------

## 3 --- Ancient

Rarity: Artifact Icon: ra-groundbreaker

Description:

Awarded to accounts created before Burrow officially launches.

Represents the earliest generation of Burrow users.

------------------------------------------------------------------------

# Ancient Badge Release Mechanism

The Ancient badge is not automatically issued until Burrow launches.

A developer-only control will trigger the release.

### Platform Developer Settings

Settings └ Platform Developer Settings

Available actions:

-   Push Release
-   Trigger Ancient Badge Distribution

When the developer presses Push Release:

1.  The system identifies all accounts created before launch.
2.  The Ancient badge is granted to those accounts.
3.  Issued date is recorded.
4.  The badge becomes publicly visible.

Only users with developer privileges can access this control.