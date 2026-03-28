/**
 * Burrow dark theme — aligned with COLOR.md design language.
 * "Underground warm lantern light" palette.
 */
export const colors = {
  // Surfaces (depth layers)
  bgPrimary: '#121212',     // surface-bedrock
  bgSecondary: '#1a1a1a',   // surface-cavern
  bgTertiary: '#222222',    // surface-tunnel
  bgInput: '#222222',       // surface-tunnel (inputs)
  bgHover: '#363636',       // surface-alcove
  bgAccent: '#2c2c2c',      // surface-burrow (cards)

  // Text
  textPrimary: '#ececec',    // text-primary
  textHeading: '#f5f5f5',   // text-heading
  textSecondary: '#a3a3a3', // text-secondary
  textMuted: '#666666',     // text-disabled
  textInverse: '#1a1a1a',   // text-inverse (on accent bg)

  // Amber (Primary Action)
  brandPrimary: '#ffc85c',   // amber
  brandLight: '#ffd97f',     // amber-hover
  brandDark: '#e6b34e',      // amber-active
  brandMuted: '#33281a',     // amber-muted

  // Violet (Ephemeral / Notification)
  violet: '#9c7dd8',
  violetHover: '#b196e2',
  violetActive: '#8568c0',
  violetMuted: '#1e1a2e',

  // Moss (Success / Secondary)
  moss: '#7ed1a3',
  mossHover: '#96dbb5',
  mossActive: '#69b88e',
  mossMuted: '#162e22',

  // Teal (Links / Interactive)
  teal: '#4dc7d2',
  tealHover: '#6dd4dd',
  tealActive: '#3fb0ba',
  tealMuted: '#132a2c',

  // Flame (Warning / Ephemeral)
  flame: '#ff9e5c',
  flameHover: '#ffb37d',
  flameMuted: '#332014',

  // Crimson (Error / Destructive)
  crimson: '#e06a6a',
  crimsonHover: '#e88585',
  crimsonActive: '#cc5555',
  crimsonMuted: '#2e1616',

  // Beige (Informational)
  beige: '#d6c3a1',
  beigeMuted: '#252118',

  // Status (presence dots)
  statusOnline: '#7ed1a3',   // moss
  statusIdle: '#ffc85c',     // amber
  statusDnd: '#e06a6a',      // crimson
  statusOffline: '#666666',  // text-disabled

  // Semantic aliases
  danger: '#e06a6a',         // crimson
  success: '#7ed1a3',        // moss
  warning: '#ff9e5c',        // flame

  // Earth (Borders & Structure)
  border: '#3d3532',         // earth-border
  borderLight: '#7b5e57',    // earth-strong
} as const;

export type ColorKey = keyof typeof colors;
