import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/* Appearance = one complete UI package. No sliders, no mixing: a package sets
   palette, type, shape, and chrome together, so every choice ships as a
   finished look instead of a pile of knobs. Each package is modeled on the
   visual language of a real training app so they read as genuinely different
   products, not five tints of the same screen. */
export type UiPackage = 'forge' | 'trail' | 'monitor' | 'rings' | 'club';
export type AppearanceSettings = { package: UiPackage };

export const uiPackages: Array<{ id: UiPackage; name: string; tagline: string; preview: { bg: string; card: string; line: string; accent: string; text: string; radius: number; display: string; upper: boolean } }> = [
  { id: 'forge', name: 'Forge', tagline: 'The signature. Volt on carbon, condensed and loud.', preview: { bg: '#0a0e0d', card: '#131a18', line: '#222d29', accent: '#d7ff45', text: '#eef4f1', radius: 13, display: "'Barlow Condensed',sans-serif", upper: true } },
  { id: 'trail', name: 'Trail', tagline: 'Sunlit activity feed. White cards, a punch of orange.', preview: { bg: '#f5f5f7', card: '#ffffff', line: '#e3e3e9', accent: '#fc5200', text: '#17181c', radius: 12, display: 'Inter,sans-serif', upper: false } },
  { id: 'monitor', name: 'Monitor', tagline: 'Recovery lab. True black, teal data, mono labels.', preview: { bg: '#000000', card: '#0b0e0f', line: '#1e2427', accent: '#2ee6a8', text: '#e6edeb', radius: 8, display: "'IBM Plex Mono',monospace", upper: true } },
  { id: 'rings', name: 'Rings', tagline: 'Midnight and hot pink. Big numerals, soft corners.', preview: { bg: '#000000', card: '#1c1c1e', line: '#3a3a3c', accent: '#fa2d6c', text: '#f5f5f7', radius: 18, display: 'system-ui,sans-serif', upper: false } },
  { id: 'club', name: 'Club', tagline: 'Gallery white and ink black. No color, all type.', preview: { bg: '#ffffff', card: '#ffffff', line: '#e5e5e5', accent: '#111111', text: '#111111', radius: 3, display: "'Barlow Condensed',sans-serif", upper: true } },
];

/* The older stylesheets key off these attributes; each package pins them so
   every legacy rule lands on the right side of dark/light. */
const legacyAttrs: Record<UiPackage, { accent: string; surface: string; mode: 'dark' | 'light'; type: string }> = {
  forge: { accent: 'volt', surface: 'midnight', mode: 'dark', type: 'forge' },
  trail: { accent: 'ember', surface: 'midnight', mode: 'light', type: 'modern' },
  monitor: { accent: 'ice', surface: 'carbon', mode: 'dark', type: 'technical' },
  rings: { accent: 'violet', surface: 'carbon', mode: 'dark', type: 'modern' },
  club: { accent: 'gold', surface: 'midnight', mode: 'light', type: 'forge' },
};

type AppearanceContextValue = { settings: AppearanceSettings; setPackage: (pkg: UiPackage) => void; reset: () => void };
const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const storageKey = 'forge-appearance-v2';
const isPackage = (value: unknown): value is UiPackage => typeof value === 'string' && uiPackages.some(pkg => pkg.id === value);

function readSettings(): AppearanceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}') as { package?: unknown };
    return { package: isPackage(stored.package) ? stored.package : 'forge' };
  } catch { return { package: 'forge' }; }
}

function applyToRoot(settings: AppearanceSettings) {
  const root = document.documentElement;
  const legacy = legacyAttrs[settings.package];
  root.dataset.package = settings.package;
  root.dataset.accent = legacy.accent;
  root.dataset.surface = legacy.surface;
  root.dataset.mode = legacy.mode;
  root.dataset.type = legacy.type;
  root.dataset.atmosphere = 'solid';
  root.dataset.compact = 'false';
  root.dataset.motion = 'true';
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(readSettings);
  useEffect(() => { applyToRoot(settings); localStorage.setItem(storageKey, JSON.stringify(settings)); }, [settings]);
  const value = useMemo(() => ({
    settings,
    setPackage: (pkg: UiPackage) => setSettings({ package: pkg }),
    reset: () => setSettings({ package: 'forge' }),
  }), [settings]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() { const value = useContext(AppearanceContext); if (!value) throw new Error('useAppearance must be used inside AppearanceProvider'); return value; }
