import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { loadAthleteSettings, saveAthleteSettings } from '../profile/settingsSync';

/* APPEARANCE IS ONE CHOICE: LIGHT OR DARK.

   This was four axes — tone, ground, accent and app icon — which added up to
   hundreds of combinations of one app. Forge has one brand now: carbon greys
   and signal blue, from the brand guide. What is left to the athlete is the
   one thing that is genuinely about them rather than the brand: how much
   light is in the room.

   Until they choose, the app follows the device (`system`). Choosing Light or
   Dark pins it. Anyone who picked a ground, an accent or an icon under the old
   settings is moved back to the brand's on their next open: the attributes
   are cleared from <html> and the home-screen icon is reset. */

export type ThemeChoice = 'light' | 'dark' | 'system';

export type AppearanceSettings = { theme: ThemeChoice };

type AppearanceContextValue = {
  settings: AppearanceSettings;
  setTheme: (theme: ThemeChoice) => void;
  /* What the athlete is actually looking at right now; `system` resolves to
     one or the other. The settings switch shows this. */
  resolved: 'light' | 'dark';
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const storageKey = 'forge-appearance-v5';
const legacyKeys = ['forge-appearance-v4', 'forge-appearance-v3', 'forge-appearance-v2'];

const isTheme = (value: unknown): value is ThemeChoice =>
  value === 'light' || value === 'dark' || value === 'system';

function readSettings(): AppearanceSettings {
  try {
    const raw = [storageKey, ...legacyKeys].map(key => localStorage.getItem(key)).find(Boolean);
    const stored = JSON.parse(raw || '{}') as Partial<Record<string, unknown>>;
    /* Anyone carrying a choice from the five-package era lands on dark, which
       is what four of those five packages were. */
    return { theme: isTheme(stored.theme) ? stored.theme : (localStorage.getItem('forge-appearance-v2') ? 'dark' : 'system') };
  } catch { return { theme: 'system' }; }
}

const prefersDark = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyToRoot(settings: AppearanceSettings) {
  const root = document.documentElement;
  /* System stamps NOTHING, deliberately: with no attribute, the
     prefers-color-scheme block in forge-theme.css decides, so the app follows
     the OS live without JavaScript re-rendering anything. */
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  /* Bare :root is carbon and signal. Every other attribute an older build
     might have left on <html> goes. */
  for (const key of ['ground', 'accent', 'package', 'surface', 'mode', 'type', 'atmosphere', 'compact', 'motion']) {
    delete root.dataset[key];
  }
}

/* THE HOME-SCREEN ICON GOES BACK TO THE BRAND'S. index.html ships the signal
   files, so on the web this only matters to someone whose links were
   rewritten by the old icon setting in this session. In the native wrapper,
   iOS wants null for "the one in the app bundle". Best-effort: nothing here
   may throw or block the app opening. */
type AlternateIcons = { setIcon?: (options: { name: string | null }) => Promise<unknown> };
type CapacitorGlobal = { Plugins?: { AlternateIcons?: AlternateIcons } };

function resetIcon() {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[data-forge-icon]')) {
    const file = link.dataset.forgeIcon;
    if (file) link.href = `./icons/signal/${file}`;
  }
  const plugin = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.Plugins?.AlternateIcons;
  if (plugin?.setIcon) void plugin.setIcon({ name: null }).catch(() => null);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  /* Captured BEFORE the persist effect writes a default — "fresh device" means
     no stored choice existed at mount, not at effect time. */
  const hadLocalChoice = useRef(Boolean(localStorage.getItem(storageKey)));
  const [settings, setSettings] = useState<AppearanceSettings>(readSettings);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    applyToRoot(settings);
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => { resetIcon(); }, []);

  /* System means system: if the device flips at sunset, so does the app,
     without a reload. */
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  /* The choice follows the account, so a new phone looks like the old one. A
     local choice always wins — the athlete just made it. */
  useEffect(() => {
    if (!user || hadLocalChoice.current) return;
    let active = true;
    void loadAthleteSettings().then(stored => {
      const remote = stored?.appearance as Partial<Record<string, unknown>> | undefined;
      if (!active || !remote || !isTheme(remote.theme)) return;
      setSettings({ theme: remote.theme });
    });
    return () => { active = false; };
  }, [user]);

  const value = useMemo<AppearanceContextValue>(() => ({
    settings,
    setTheme: (theme: ThemeChoice) => {
      hadLocalChoice.current = true;
      setSettings({ theme });
      if (user) saveAthleteSettings({ appearance: { theme } });
    },
    resolved: settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme,
  }), [settings, systemDark, user]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
