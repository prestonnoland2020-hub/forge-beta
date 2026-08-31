import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { loadAthleteSettings, saveAthleteSettings } from '../profile/settingsSync';

/* APPEARANCE IS THREE SMALL CHOICES, NOT ONE BIG ONE.

   This used to offer five complete "UI packages" — Forge, Trail, Monitor,
   Rings, Club — each re-tokening the whole app to imitate a different
   product's visual language. Five palettes, four display faces, four corner
   scales, maintained in parallel. The cost was never the code; it was that no
   single look was ever finished, because every fix had to be made five times
   and never was.

   What replaced it is three independent axes that compose:

     tone     light · system · dark      how bright the app is
     ground   what the neutrals are made of — cool charcoal, navy, near-black,
              or warm brown
     accent   the one colour that is not neutral
     icon     which app icon sits on the home screen

   Independent is the point. Five packages was 5 looks; four axes is
   3 x 4 x 6 x 7 = 504, from far less code, and every one of them is finished
   because there is only one set of components underneath.

   TONE AND GROUND ARE NOT THE SAME QUESTION, which is why they are not the
   same control. Tone is how much light is in the room. Ground is what the app
   is built out of — and because every ground reuses the same rung lightnesses
   and moves only hue, choosing one can never make anything harder to read. */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type GroundChoice = 'carbon' | 'midnight' | 'ink' | 'espresso';
export type AccentChoice = 'signal' | 'flare' | 'coral' | 'amber' | 'tide' | 'harbor';
/* The icon defaults to matching the accent. `match` is stored rather than
   resolved so that changing the accent later moves the icon with it, which is
   what someone who never opened this section expects. */
export type IconChoice = AccentChoice | 'match';

export type AppearanceSettings = {
  theme: ThemeChoice;
  ground: GroundChoice;
  accent: AccentChoice;
  icon: IconChoice;
};

export const themeChoices: Array<{ id: ThemeChoice; name: string; description: string }> = [
  { id: 'light', name: 'Light', description: 'Bright surfaces, dark text.' },
  { id: 'system', name: 'System', description: 'Follows your device, and changes with it.' },
  { id: 'dark', name: 'Dark', description: 'The default Forge.' },
];

export const groundChoices: Array<{ id: GroundChoice; name: string; description: string }> = [
  { id: 'carbon', name: 'Carbon', description: 'Cool charcoal. The Forge tile.' },
  { id: 'midnight', name: 'Midnight', description: 'Deep navy.' },
  { id: 'ink', name: 'Ink', description: 'Neutral black. Nothing in the way.' },
  { id: 'espresso', name: 'Espresso', description: 'Warm brown.' },
];

export const accentChoices: Array<{ id: AccentChoice; name: string; description: string }> = [
  { id: 'signal', name: 'Signal', description: 'The Forge blue.' },
  { id: 'flare', name: 'Flare', description: 'Hot red.' },
  { id: 'coral', name: 'Coral', description: 'The same red, cooled down.' },
  { id: 'amber', name: 'Amber', description: 'Burnt gold.' },
  { id: 'tide', name: 'Tide', description: 'Cool water.' },
  { id: 'harbor', name: 'Harbor', description: 'Barely an accent at all.' },
];

/* The first accent set was mine, invented before Preston sent his secondary
   palettes. Nobody who chose one of those should open the app to a colour they
   did not pick, so each retires to its nearest survivor rather than to the
   default — an Ember athlete gets Coral, not blue. */
const retiredAccents: Record<string, AccentChoice> = {
  ember: 'coral', volt: 'amber', sand: 'harbor', slate: 'harbor',
};

type AppearanceContextValue = {
  settings: AppearanceSettings;
  setTheme: (theme: ThemeChoice) => void;
  setGround: (ground: GroundChoice) => void;
  setAccent: (accent: AccentChoice) => void;
  setIcon: (icon: IconChoice) => void;
  /* What the athlete is actually looking at right now. `system` resolves to
     one or the other, which the settings screen needs so it can say which one
     System is currently giving them. */
  resolved: 'light' | 'dark';
  /* `match` resolved to a real icon set, for previews and for the swap. */
  resolvedIcon: AccentChoice;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const storageKey = 'forge-appearance-v5';
const legacyKeys = ['forge-appearance-v4', 'forge-appearance-v3', 'forge-appearance-v2'];
const accents = accentChoices.map(choice => choice.id);
const grounds = groundChoices.map(choice => choice.id);

const isTheme = (value: unknown): value is ThemeChoice =>
  value === 'light' || value === 'dark' || value === 'system';
const isGround = (value: unknown): value is GroundChoice =>
  grounds.includes(value as GroundChoice);
const isAccent = (value: unknown): value is AccentChoice =>
  accents.includes(value as AccentChoice);
const isIcon = (value: unknown): value is IconChoice =>
  value === 'match' || isAccent(value);

/* Retired names resolve to their replacement; anything else falls through. */
const toAccent = (value: unknown): AccentChoice | null =>
  isAccent(value) ? value : (typeof value === 'string' && retiredAccents[value]) || null;

const fallback: AppearanceSettings = { theme: 'system', ground: 'carbon', accent: 'signal', icon: 'match' };

function readSettings(): AppearanceSettings {
  try {
    /* Read the current key, then fall back through the older ones. Each bump
       added an axis rather than changing the meaning of an existing one, so an
       old record is a valid partial and merging forward loses nothing. */
    const raw = [storageKey, ...legacyKeys]
      .map(key => localStorage.getItem(key))
      .find(Boolean);
    const stored = JSON.parse(raw || '{}') as Partial<Record<string, unknown>>;
    return {
      /* Anyone carrying a choice from the five-package era lands on dark —
         which is what four of those five packages were, and what the app has
         always looked like. */
      theme: isTheme(stored.theme)
        ? stored.theme
        : (localStorage.getItem('forge-appearance-v2') ? 'dark' : 'system'),
      ground: isGround(stored.ground) ? stored.ground : 'carbon',
      accent: toAccent(stored.accent) ?? 'signal',
      icon: isIcon(stored.icon) ? stored.icon : (toAccent(stored.icon) ?? 'match'),
    };
  } catch { return fallback; }
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
  root.dataset.ground = settings.ground;
  root.dataset.accent = settings.accent;
  /* Every attribute the old packages set — data-package, data-surface,
     data-mode, data-type, data-atmosphere — is removed along with the
     stylesheets that read them, so a stale one cannot linger on <html> in a
     browser that still has the old value. */
  for (const key of ['package', 'surface', 'mode', 'type', 'atmosphere', 'compact', 'motion']) {
    delete root.dataset[key];
  }
}

/* THE BROWSER TAB AND THE HOME SCREEN.

   On the web the icon is whatever <link rel="icon"> points at, and browsers
   re-read it when the href changes — so switching sets is a matter of
   rewriting the marked links. index.html ships the default accent's files so
   the favicon is already right before any of this runs.

   In the native wrapper this is a different mechanism entirely: iOS exposes
   setAlternateIconName, which needs the variants declared in Info.plist and
   only accepts a name iOS already knows. The call is made through whatever the
   Capacitor layer exposes and is deliberately best-effort — on the web, and on
   a build where the plist has not been filled in yet, nothing here should
   throw or block the setting from saving. */
type AlternateIcons = { setIcon?: (options: { name: string | null }) => Promise<unknown> };
type CapacitorGlobal = { Plugins?: { AlternateIcons?: AlternateIcons } };

function applyIcon(icon: AccentChoice) {
  const links = document.querySelectorAll<HTMLLinkElement>('link[data-forge-icon]');
  for (const link of links) {
    const file = link.dataset.forgeIcon;
    if (file) link.href = `./icons/${icon}/${file}`;
  }

  const plugin = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.Plugins?.AlternateIcons;
  if (!plugin?.setIcon) return;
  /* iOS wants null for "the one in the app bundle", not the default's name. */
  void plugin.setIcon({ name: icon === 'signal' ? null : icon }).catch(() => null);
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

  const resolvedIcon: AccentChoice = settings.icon === 'match' ? settings.accent : settings.icon;
  useEffect(() => { applyIcon(resolvedIcon); }, [resolvedIcon]);

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
      const remote = stored?.appearance as Partial<Record<keyof AppearanceSettings, unknown>> | undefined;
      if (!active || !remote) return;
      setSettings(current => ({
        theme: isTheme(remote.theme) ? remote.theme : current.theme,
        ground: isGround(remote.ground) ? remote.ground : current.ground,
        accent: toAccent(remote.accent) ?? current.accent,
        icon: isIcon(remote.icon) ? remote.icon : (toAccent(remote.icon) ?? current.icon),
      }));
    });
    return () => { active = false; };
  }, [user]);

  const value = useMemo<AppearanceContextValue>(() => {
    const commit = (next: AppearanceSettings) => {
      hadLocalChoice.current = true;
      setSettings(next);
      if (user) saveAthleteSettings({ appearance: next });
    };
    return {
      settings,
      setTheme: (theme: ThemeChoice) => commit({ ...settings, theme }),
      setGround: (ground: GroundChoice) => commit({ ...settings, ground }),
      setAccent: (accent: AccentChoice) => commit({ ...settings, accent }),
      setIcon: (icon: IconChoice) => commit({ ...settings, icon }),
      resolved: settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme,
      resolvedIcon: settings.icon === 'match' ? settings.accent : settings.icon,
    };
  }, [settings, systemDark, user]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
