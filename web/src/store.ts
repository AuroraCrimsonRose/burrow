import { useCallback, useSyncExternalStore } from 'react';

// ── Theme system ──

export interface BurrowTheme {
  id: string;
  name: string;
  author: string;
  variables: Record<string, string>;
  customCSS?: string;
  builtIn?: boolean;
}

export const DEFAULT_VARIABLES: Record<string, string> = {
  '--surface-bedrock': '#121212',
  '--surface-cavern':  '#1a1a1a',
  '--surface-tunnel':  '#222222',
  '--surface-burrow':  '#2c2c2c',
  '--surface-alcove':  '#363636',
  '--surface-ledge':   '#424242',
  '--amber':           '#ffc85c',
  '--amber-hover':     '#ffd97f',
  '--amber-active':    '#e6b34e',
  '--amber-muted':     '#33281a',
  '--amber-text':      '#1a1a1a',
  '--violet':          '#9c7dd8',
  '--violet-hover':    '#b196e2',
  '--violet-active':   '#8568c0',
  '--violet-muted':    '#1e1a2e',
  '--moss':            '#7ed1a3',
  '--moss-hover':      '#96dbb5',
  '--moss-active':     '#69b88e',
  '--moss-muted':      '#162e22',
  '--teal':            '#4dc7d2',
  '--teal-hover':      '#6dd4dd',
  '--teal-active':     '#3fb0ba',
  '--teal-muted':      '#132a2c',
  '--flame':           '#ff9e5c',
  '--flame-hover':     '#ffb37d',
  '--flame-muted':     '#332014',
  '--crimson':         '#e06a6a',
  '--crimson-hover':   '#e88585',
  '--crimson-active':  '#cc5555',
  '--crimson-muted':   '#2e1616',
  '--beige':           '#d6c3a1',
  '--beige-muted':     '#252118',
  '--earth-border':    '#3d3532',
  '--earth-strong':    '#7b5e57',
  '--text-primary':    '#ececec',
  '--text-heading':    '#f5f5f5',
  '--text-secondary':  '#a3a3a3',
  '--text-disabled':   '#666666',
  '--text-inverse':    '#1a1a1a',
};

export const DEFAULT_THEME: BurrowTheme = {
  id: 'burrow-dark',
  name: 'Burrow Dark',
  author: 'Burrow',
  variables: { ...DEFAULT_VARIABLES },
  builtIn: true,
};

// Variable grouping for the editor UI
export const VARIABLE_GROUPS: { label: string; vars: { key: string; label: string }[] }[] = [
  { label: 'Surfaces', vars: [
    { key: '--surface-bedrock', label: 'Bedrock' },
    { key: '--surface-cavern', label: 'Cavern' },
    { key: '--surface-tunnel', label: 'Tunnel' },
    { key: '--surface-burrow', label: 'Burrow' },
    { key: '--surface-alcove', label: 'Alcove' },
    { key: '--surface-ledge', label: 'Ledge' },
  ]},
  { label: 'Primary (Amber)', vars: [
    { key: '--amber', label: 'Amber' },
    { key: '--amber-hover', label: 'Amber Hover' },
    { key: '--amber-active', label: 'Amber Active' },
    { key: '--amber-muted', label: 'Amber Muted' },
    { key: '--amber-text', label: 'Amber Text' },
  ]},
  { label: 'Violet', vars: [
    { key: '--violet', label: 'Violet' },
    { key: '--violet-hover', label: 'Violet Hover' },
    { key: '--violet-active', label: 'Violet Active' },
    { key: '--violet-muted', label: 'Violet Muted' },
  ]},
  { label: 'Moss (Success)', vars: [
    { key: '--moss', label: 'Moss' },
    { key: '--moss-hover', label: 'Moss Hover' },
    { key: '--moss-active', label: 'Moss Active' },
    { key: '--moss-muted', label: 'Moss Muted' },
  ]},
  { label: 'Teal (Interactive)', vars: [
    { key: '--teal', label: 'Teal' },
    { key: '--teal-hover', label: 'Teal Hover' },
    { key: '--teal-active', label: 'Teal Active' },
    { key: '--teal-muted', label: 'Teal Muted' },
  ]},
  { label: 'Flame / Crimson', vars: [
    { key: '--flame', label: 'Flame' },
    { key: '--flame-hover', label: 'Flame Hover' },
    { key: '--flame-muted', label: 'Flame Muted' },
    { key: '--crimson', label: 'Crimson' },
    { key: '--crimson-hover', label: 'Crimson Hover' },
    { key: '--crimson-active', label: 'Crimson Active' },
    { key: '--crimson-muted', label: 'Crimson Muted' },
  ]},
  { label: 'Extras', vars: [
    { key: '--beige', label: 'Beige' },
    { key: '--beige-muted', label: 'Beige Muted' },
    { key: '--earth-border', label: 'Earth Border' },
    { key: '--earth-strong', label: 'Earth Strong' },
  ]},
  { label: 'Text', vars: [
    { key: '--text-primary', label: 'Primary' },
    { key: '--text-heading', label: 'Heading' },
    { key: '--text-secondary', label: 'Secondary' },
    { key: '--text-disabled', label: 'Disabled' },
    { key: '--text-inverse', label: 'Inverse' },
  ]},
];

function loadThemes(): BurrowTheme[] {
  try {
    const raw = localStorage.getItem('burrow_themes');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function loadActiveThemeId(): string {
  return localStorage.getItem('burrow_active_theme') || 'burrow-dark';
}

function saveThemes(themes: BurrowTheme[]) {
  localStorage.setItem('burrow_themes', JSON.stringify(themes));
}

function saveActiveThemeId(id: string) {
  localStorage.setItem('burrow_active_theme', id);
}

// ── App state ──

export interface AppState {
  sessionToken: string | null;
  user: { id: string; username: string; trust_tier: number; is_dev?: boolean } | null;
  keys: { privateKey: string; publicKey: string } | null;
  animationsEnabled: boolean;
  animatedEmojis: boolean;
  customCSS: string;
  themes: BurrowTheme[];
  activeThemeId: string;
}

const STORAGE_KEYS = {
  sessionToken: 'session_token',
  user: 'user',
  keys: 'device_keys',
  animations: 'animations_enabled',
  animatedEmojis: 'animated_emojis',
  customCSS: 'custom_css',
} as const;

function getStoredState(): AppState {
  return {
    sessionToken: localStorage.getItem(STORAGE_KEYS.sessionToken),
    user: JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || 'null'),
    keys: JSON.parse(localStorage.getItem(STORAGE_KEYS.keys) || 'null'),
    animationsEnabled: localStorage.getItem(STORAGE_KEYS.animations) !== 'false',
    animatedEmojis: localStorage.getItem(STORAGE_KEYS.animatedEmojis) !== 'false',
    customCSS: sanitizeCSS(localStorage.getItem(STORAGE_KEYS.customCSS) || ''),
    themes: loadThemes(),
    activeThemeId: loadActiveThemeId(),
  };
}

let state = getStoredState();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function setSession(token: string, user: AppState['user']) {
  localStorage.setItem(STORAGE_KEYS.sessionToken, token);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  state = { ...state, sessionToken: token, user };
  notify();
}

export function updateUser(user: AppState['user']) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  state = { ...state, user };
  notify();
}

export function setKeys(keys: AppState['keys']) {
  if (keys) {
    localStorage.setItem(STORAGE_KEYS.keys, JSON.stringify(keys));
  } else {
    localStorage.removeItem(STORAGE_KEYS.keys);
  }
  state = { ...state, keys };
  notify();
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.sessionToken);
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.keys);
  state = { ...state, sessionToken: null, user: null, keys: null };
  notify();
  // Clear IndexedDB cache
  import('./cache').then(({ clearAllCaches }) => clearAllCaches()).catch(() => {});
}

export function setAnimationsEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEYS.animations, String(enabled));
  state = { ...state, animationsEnabled: enabled };
  notify();
}

export function setAnimatedEmojis(enabled: boolean) {
  localStorage.setItem(STORAGE_KEYS.animatedEmojis, String(enabled));
  state = { ...state, animatedEmojis: enabled };
  notify();
}

function sanitizeCSS(css: string): string {
  // Strip closing </style> tags to prevent HTML injection
  let sanitized = css.replace(/<\/?style[^>]*>/gi, '');
  // Strip @import to prevent external resource loading
  sanitized = sanitized.replace(/@import\b[^;]*;?/gi, '');
  // Strip javascript: and expression() patterns
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  sanitized = sanitized.replace(/expression\s*\(/gi, '');
  // Strip -moz-binding
  sanitized = sanitized.replace(/-moz-binding\s*:/gi, '');
  // Strip behavior property (IE)
  sanitized = sanitized.replace(/behavior\s*:/gi, '');
  // Limit size to 50KB
  return sanitized.slice(0, 50_000);
}

export function setCustomCSS(css: string) {
  const safe = sanitizeCSS(css);
  localStorage.setItem(STORAGE_KEYS.customCSS, safe);
  state = { ...state, customCSS: safe };
  notify();
}

export function useStore(): AppState {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => state,
  );
}

export function useAnimations(): boolean {
  const { animationsEnabled } = useStore();
  return animationsEnabled;
}

export function useAnimatedEmojis(): boolean {
  const { animatedEmojis } = useStore();
  return animatedEmojis;
}

export function useCustomCSS(): string {
  const { customCSS } = useStore();
  return customCSS;
}

// ── Theme management ──

export function getActiveTheme(): BurrowTheme {
  const s = getState();
  if (s.activeThemeId === DEFAULT_THEME.id) return DEFAULT_THEME;
  return s.themes.find((t) => t.id === s.activeThemeId) || DEFAULT_THEME;
}

export function useActiveTheme(): BurrowTheme {
  const { themes, activeThemeId } = useStore();
  if (activeThemeId === DEFAULT_THEME.id) return DEFAULT_THEME;
  return themes.find((t) => t.id === activeThemeId) || DEFAULT_THEME;
}

export function useThemes(): BurrowTheme[] {
  const { themes } = useStore();
  return themes;
}

export function setActiveTheme(id: string) {
  saveActiveThemeId(id);
  state = { ...state, activeThemeId: id };
  notify();
}

export function addTheme(theme: BurrowTheme) {
  const themes = [...state.themes.filter((t) => t.id !== theme.id), theme];
  saveThemes(themes);
  state = { ...state, themes };
  notify();
}

export function removeTheme(id: string) {
  const themes = state.themes.filter((t) => t.id !== id);
  saveThemes(themes);
  const updates: Partial<AppState> = { themes };
  if (state.activeThemeId === id) {
    updates.activeThemeId = DEFAULT_THEME.id;
    saveActiveThemeId(DEFAULT_THEME.id);
  }
  state = { ...state, ...updates };
  notify();
}

export function exportTheme(theme: BurrowTheme): string {
  const { builtIn, ...exportable } = theme;
  return JSON.stringify(exportable, null, 2);
}

export function importTheme(json: string): BurrowTheme {
  const obj = JSON.parse(json);
  if (!obj.name || typeof obj.name !== 'string') throw new Error('Missing theme name');
  if (!obj.variables || typeof obj.variables !== 'object') throw new Error('Missing theme variables');
  // Validate variable keys — only allow known CSS variable names
  for (const key of Object.keys(obj.variables)) {
    if (!key.startsWith('--') || !/^--[a-z][a-z0-9-]*$/.test(key)) {
      throw new Error(`Invalid variable key: ${key}`);
    }
    // Validate values are valid CSS color-like strings (no script injection)
    const val = obj.variables[key];
    if (typeof val !== 'string' || val.length > 100 || /[{}<>]/.test(val)) {
      throw new Error(`Invalid variable value for ${key}`);
    }
  }
  // Sanitize customCSS if present
  if (obj.customCSS && typeof obj.customCSS === 'string') {
    if (obj.customCSS.length > 50000) throw new Error('Custom CSS too large');
  }
  return {
    id: obj.id || `theme-${Date.now()}`,
    name: obj.name.slice(0, 64),
    author: (obj.author || 'Unknown').slice(0, 64),
    variables: obj.variables,
    customCSS: typeof obj.customCSS === 'string' ? obj.customCSS : undefined,
  };
}

export function themeToCSS(theme: BurrowTheme): string {
  const vars = Object.entries(theme.variables)
    .filter(([k]) => k.startsWith('--'))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  let css = vars ? `:root {\n${vars}\n}` : '';
  if (theme.customCSS) css += '\n' + theme.customCSS;
  return css;
}

export function getState(): AppState {
  return state;
}
