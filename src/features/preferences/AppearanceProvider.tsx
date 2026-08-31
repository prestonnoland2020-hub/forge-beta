import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { loadAthleteSettings, saveAthleteSettings } from '../profile/settingsSync';

/* APPEARANCE IS A TONE, NOT A COSTUME.

   This used to offer five complete "UI packages" — Forge, Trail, Monitor,
   Rings, Club — each re-tokening the whole app to imitate a different
   product's visual language. Five palettes, four display faces, four corner
   scales, maintained in parallel. The cost was never the code; it was that no
   single look was ever finished, because every fix had to be made five times
   and never was. Light mode existed only as scattered patches.

   Three choices now — the ones an operating system offers, because that is the
   choice people actually want to make:

     light    always light
     dark     always dark
     system   follow the device, and change with it during the day

   Brand colour returns later as a separate, smaller choice layered on top of
   this: an accent, not a whole costume.

   HOW THE CHOICE REACHES CSS. `light` and `dark` stamp data-theme on <html>.
   `system` stamps NOTHING, deliberately: with no attribute, the
   prefers-color-scheme block in forge-theme.css decides, so the app follows
   the OS live without JavaScript re-rendering anything. */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type AppearanceSettings = { theme: ThemeChoice };

export const themeChoices: Array<{ id: ThemeChoice; name: string; description: string }> = [
  { id: 'light', name: 'Light', description: 'Bright surfaces, dark text.' },
  { id: 'system', name: 'System', description: 'Follows your device, and changes with it.' },
  { id: 'dark', name: 'Dark', description: 'The original Forge. Volt on carbon.' },
];

type AppearanceContextValue = {
  settings: AppearanceSettings;
  setTheme: (theme: ThemeChoice) => void;
  /* What the athlete is actually looking at right now. `system` resolves to
     one or the other, which the settings screen needs so it can say which one
     System is currently giving them. */
  resolved: 'light' | 'dark';
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const storageKey = 'forge-appearance-v3';
const isTheme = (value: unknown): value is ThemeChoice =>
  value === 'light' || value === 'dark' || value === 'system';

function readSettings(): AppearanceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}') as { theme?: unknown };
    if (isTheme(stored.theme)) return { theme: stored.theme };
    /* Anyone carrying a choice from the five-package era lands on dark — which
       is what four of those five packages were, and what the app has always
       looked like. */
    return { theme: localStorage.getItem('forge-appearance-v2') ? 'dark' : 'system' };
  } catch { return { theme: 'system' }; }
}

const prefersDark = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyToRoot(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  /* Every attribute the old packages set — data-package, data-accent,
     data-surface, data-mode, data-type, data-atmosphere — is removed along
     with the stylesheets that read them, so a stale one cannot linger in a
     browser that has the old value on <html>. */
  for (const key of ['package', 'accent', 'surface', 'mode', 'type', 'atmosphere', 'compact', 'motion']) {
    delete root.dataset[key];
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  /* Captured BEFORE the persist effect writes a default — "fresh device" means
     no stored choice existed at mount, not at effect time. */
  const hadLocalChoice = useRef(Boolean(localStorage.getItem(storageKey)));
  const [settings, setSettings] = useState<AppearanceSettings>(readSettings);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    applyToRoot(settings.theme);
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

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
      const remote = (stored?.appearance as { theme?: unknown } | undefined)?.theme;
      if (active && isTheme(remote)) setSettings({ theme: remote });
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
