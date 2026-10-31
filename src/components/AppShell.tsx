import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MileageStartupCheck } from './MileageGate';
import { EffortCheck } from './EffortCheck';
import { CoachCheckIn } from './CoachCheckIn';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { syncKeyboardState } from '../features/shell/nativeChrome';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { isDemoMode } from '../lib/env';
import { useSyncStatus } from '../features/sync/SyncStatusProvider';
import { localDayIso } from '../lib/time';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { needsFollowUp } from '../features/training/athleteNotesService';
import { loadNotificationPrefs, maybeNotifyFollowUp, maybeNotifyPartnerTrained } from '../lib/notifications';
import { loadPartners } from '../features/friends/partnerService';
import { registerServiceWorker, syncPushSubscription } from '../lib/push';
import { getActivityConnection, syncStravaActivities } from '../features/training/activityConnectionService';
import { importStravaActivities } from '../features/training/stravaImportService';
import { tap } from '../lib/haptics';
import { Icon } from './Icon';

/* One flat nav. The old "Manage" drawer hid Goals behind two taps and held a
   standalone exercise library that duplicated what the Log screen already does;
   exercises are only ever added while logging, so the library moved to Profile. */
/* Preston's nav: the AI coach lives in the floating bubble alone (a tab AND a
   bubble was the same door twice), Progress lives behind the chart bubble
   beside the log button up top, and Goals + Activities stand on their own. */
const primaryNav = [
  ['/', 'Today', 'home'],
  ['/workout', 'Log', 'plus'],
  ['/plan', 'Plan', 'calendar'],
  ['/goals', 'Goals', 'target'],
  ['/history', 'Activities', 'history'],
] as const;

type NavGlyphName = typeof primaryNav[number][2] | 'library' | 'you' | 'chart' | 'coach' | 'gear';
function NavGlyph({ name }: { name: NavGlyphName }) {
  const paths: Record<NavGlyphName, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>,
    plus: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    history: <><path d="M4 6v5h5"/><path d="M5.5 17a8 8 0 1 0-.8-9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m15 9 6-6M17 3h4v4"/></>,
    library: <><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z"/><path d="M7 16h12M9 8h6M9 11h6"/></>,
    coach: <><path d="M12 3a7 7 0 0 1 7 7c0 2.4-1.2 4.1-2.6 5.4-.6.6-.9 1.3-.9 2.1V19a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-1.5c0-.8-.3-1.5-.9-2.1C5.2 14.1 5 12.4 5 10a7 7 0 0 1 7-7Z"/><path d="M9.5 10.5 11 12l3.5-3.5"/></>,
    you: <><circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20.2c1.1-3.4 3.9-5.2 7.2-5.2s6.1 1.8 7.2 5.2"/></>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></>,
  };
  return <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg></span>;
}

/* THE TAB BAR. Five destinations, each owning the screens that are steps into
   it, so the tab you came from stays lit while you are inside it. */
const tabs = [
  { to: '/', label: 'Today', icon: 'home', owns: (path: string) => path === '/' },
  { to: '/plan', label: 'Plan', icon: 'calendar', owns: (path: string) => path === '/plan' },
  { to: '/goals', label: 'Goals', icon: 'target', owns: (path: string) => path === '/goals' },
  { to: '/history', label: 'Activities', icon: 'history', owns: (path: string) => path === '/history' },
  { to: '/profile', label: 'Profile', icon: 'you', owns: (path: string) => path === '/profile' || path === '/split' || path.startsWith('/partners') || path === '/exercises' },
] as const;

/* How deep a screen sits under its tab, which is what decides the direction a
   screen moves: deeper slides in from the right, shallower slides back from
   the left, and a move between tabs cross-fades — the way every iOS app does
   it, so the motion says where you went. */
function screenDepth(path: string, search: string) {
  if (tabs.some(tab => tab.to === path)) return path === '/profile' && new URLSearchParams(search).get('view') ? (new URLSearchParams(search).get('view') === 'settings' ? 1 : 2) : 0;
  if (/^\/partners\/.+/.test(path)) return 2;
  return 1;
}

export function AppShell({ coach }: { coach?: ReactNode }) {
  /* Deploy freshness for installed PWAs. iOS pins a Home-Screen app to the
     shell it installed with, and GitHub Pages caches index.html — so a fix
     can be live on the site while the icon on the phone still runs last
     night's engine. version.json is fetched uncached on open and whenever the
     app returns to the foreground; a mismatch surfaces one tap to reload. */
  const [updateReady,setUpdateReady]=useState<string|false>(false);
  useEffect(()=>{
    let last=0;
    const check=async()=>{
      if(Date.now()-last<60000)return;last=Date.now();
      try{
        const response=await fetch(`version.json?t=${Date.now()}`,{cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json() as {build?:string};
        if(data.build&&data.build!==__FORGE_BUILD__)setUpdateReady(data.build);
      }catch{/* offline — try again later */}
    };
    void check();
    const onVisible=()=>{if(document.visibilityState==='visible')void check()};
    document.addEventListener('visibilitychange',onVisible);
    /* An app left open on a screen all day never returns to the foreground,
       so it also looks every five minutes while it is on screen. */
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void check()},5*60000);
    return()=>{document.removeEventListener('visibilitychange',onVisible);window.clearInterval(timer)};
  },[]);

  const location = useLocation();
  const navigate = useNavigate();
  /* A TAB ANSWERS THE FIRST TAP. On iOS a tap that lands while the page is
     still coasting from a scroll only stops the scroll — the click never
     comes, so the bar felt stuck until it was tapped again. Touch events do
     arrive, so a short, still touch on a tab switches on touchend. */
  const tabTouch = useRef<{ x: number; y: number } | null>(null);
  /* And a field that vanished while focused (a sheet closing, a screen
     changing) never sends its blur, which left the bar hidden as if the
     keyboard were up. Every screen change re-reads the real state. */
  useEffect(() => { syncKeyboardState(); }, [location.pathname, location.search]);
  /* A NEW BUILD TAKES OVER BY ITSELF, at a moment nobody loses anything to.
     The pill asked for a tap most people never made, so a deploy reached them
     only whenever they happened to reload. Now the app reloads on its own —
     on moving between screens or coming back to the app — unless it is the
     workout logger, a field has focus, or a sheet is open; then the pill is
     the fallback. The reload adds ?v=<build> so GitHub Pages' ten-minute
     cache of index.html cannot hand back the old shell, and each build is
     tried once, so a deploy still propagating cannot loop the page. */
  useEffect(()=>{
    if(!updateReady)return;
    const tryReload=()=>{
      const busy=location.pathname==='/workout'
        ||document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLTextAreaElement||document.activeElement instanceof HTMLSelectElement
        ||Boolean(document.querySelector('[role="dialog"], .coach-bubble-panel.open'));
      if(busy)return;
      try{if(sessionStorage.getItem('forge-auto-update')===updateReady)return;sessionStorage.setItem('forge-auto-update',updateReady)}catch{return}
      const url=new URL(window.location.href);
      url.searchParams.set('v',updateReady);
      window.location.replace(url.href);
    };
    tryReload();
    const onVisible=()=>{if(document.visibilityState==='visible')tryReload()};
    document.addEventListener('visibilitychange',onVisible);
    return()=>document.removeEventListener('visibilitychange',onVisible);
  },[updateReady,location.pathname,location.search]);
  const screenKey = `${location.pathname}?${new URLSearchParams(location.search).get('view') || ''}`;
  const lastScreen = useRef({ key: screenKey, depth: screenDepth(location.pathname, location.search) });
  /* Decided while rendering, not in an effect: the new screen's first frame
     has to carry the right direction, or it starts sliding the wrong way and
     corrects itself a frame later. */
  const motion = useRef<'push' | 'pop' | 'fade' | 'none'>('none');
  if (lastScreen.current.key !== screenKey) {
    const depth = screenDepth(location.pathname, location.search);
    motion.current = depth > lastScreen.current.depth ? 'push' : depth < lastScreen.current.depth ? 'pop' : 'fade';
    lastScreen.current = { key: screenKey, depth };
  }
  /* A new screen starts at its top. Without this, switching tabs kept the
     last page's scroll and opened Goals halfway down an empty page. */
  const firstScreen = useRef(true);
  useEffect(() => { if (firstScreen.current) { firstScreen.current = false; return; } window.scrollTo(0, 0); }, [screenKey]);
  const activeTab = tabs.findIndex(tab => tab.owns(location.pathname));
  /* A workout in progress and the full coach are tasks, not places: the tab
     bar steps aside for them the way a native app's does. */
  const hideTabs = location.pathname === '/workout' || location.pathname === '/coach';
  const { recovery } = useAdaptiveTraining();
  const { setup } = useProfileSetup();
  const { failures: syncFailures, retryAll } = useSyncStatus();
  const { user } = useAuth();
  const { loading: historyLoading, syncing, syncError, retrySync, records: stravaRecords, addRecord: stravaAddRecord } = useWorkoutHistory();
  /* STRAVA SYNC RUNS WHEN THE ATHLETE LOOKS. A six-hour throttle meant a run
     recorded on the watch could sit unseen for most of a day: post it, open
     Forge, and it is not there — which reads as a broken integration, not a
     schedule. The athlete opening the app IS the signal that they want to see
     it, so the sync runs on open and again whenever they come back to the tab.
     A two-minute floor is all the throttling needed: it stops a burst of
     navigation from hammering Strava's rate limit while keeping "post a run,
     open Forge, it's there" true.

     It waits for history to load — importing against an empty record set
     would defeat the dedupe and double-log everything. */
  const SYNC_FLOOR_MS = 2 * 60 * 1000;
  const syncStravaNow = useCallback(async () => {
    if (isDemoMode || historyLoading) return;
    const throttleKey = 'forge-strava-auto-sync';
    if (Date.now() - Number(localStorage.getItem(throttleKey) || 0) < SYNC_FLOOR_MS) return;
    try {
      const status = await getActivityConnection();
      if (!status.connected) return;
      localStorage.setItem(throttleKey, String(Date.now()));
      await syncStravaActivities();
      await importStravaActivities(stravaRecords, stravaAddRecord);
    } catch { /* silent — manual sync remains in Profile → Connections */ }
  }, [historyLoading, stravaRecords, stravaAddRecord]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void syncStravaNow(); }, [historyLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    /* Coming back from Strava is the most likely moment a new activity
       exists, and on a phone that is a visibility change, not a page load. */
    const onReturn = () => { if (document.visibilityState === 'visible') void syncStravaNow(); };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => { document.removeEventListener('visibilitychange', onReturn); window.removeEventListener('focus', onReturn); };
  }, [syncStravaNow]);
  const { notes } = useAthleteNotes();
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachExpanded, setCoachExpanded] = useState(false);
  const initials = (setup?.displayName || 'Forge Athlete').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  /* ONE HEADER FOR THE WHOLE APP. Five places are destinations — the tabs —
     and the header names them. Everything else is a step INTO one of those,
     and a step in gets a back arrow to the place it belongs to, so nothing
     under Profile has to draw its own breadcrumb and no screen is a dead end.
     Sub-screens inside Profile are named by the header too, which is what
     lets the page below stop repeating its own name in 26px type. */
  const chrome = ((): { title: string; back?: string } => {
    const params = new URLSearchParams(location.search);
    /* A partner's own screen is a step in from the list. */
    if (/^\/partners\/.+/.test(location.pathname)) return { title: 'Partner', back: '/partners' };
    switch (location.pathname) {
      case '/': return { title: 'Today' };
      case '/plan': return { title: 'Plan' };
      case '/goals': return { title: 'Goals' };
      case '/history': return { title: 'Activities' };
      case '/workout': return { title: params.get('edit') ? 'Edit day' : params.get('date') ? 'Add a day' : 'Log workout', back: '/' };
      case '/insights': return { title: 'Progress', back: '/' };
      case '/coach': return { title: 'Ask Forge', back: '/' };
      case '/split': return { title: 'Your split', back: '/profile' };
      case '/exercises': return { title: 'Exercise library', back: '/profile' };
      case '/partners': return { title: 'Partners', back: '/profile' };
      case '/profile': {
        const view = params.get('view');
        const names: Record<string, string> = { settings: 'Settings', appearance: 'Appearance', billing: 'Plan & billing', coach: 'Coach & notifications', connections: 'Connections', devices: 'Recovery', faq: 'FAQ' };
        if (view && names[view]) return { title: names[view], back: view === 'settings' ? '/profile' : '/profile?view=settings' };
        return { title: 'Profile' };
      }
      default: return { title: 'Forge' };
    }
  })();
  const hasRecoveryData = recovery.confidence !== 'Low';

  /* Body-log check-ins, best effort, once a day when the app opens.

     THE MORNING BRIEF IS THE SERVER'S. A page-side "Today's training" used to
     fire here too, from whatever `recommendation` was on the first render —
     before the cycle and the day's records had loaded — so it said "Rest" at
     7:40 while the Today card, a second later, said Long Run; and once sent,
     the day's tag was spent, so the correction never went out. forge-push
     sends the morning line from stored data at 6am; nothing here competes. */
  useEffect(() => {
    const prefs = loadNotificationPrefs();
    if (prefs.injuryFollowUp) notes.filter(needsFollowUp).forEach(note => maybeNotifyFollowUp(note.area || note.kind));
  }, [notes]);

  /* iOS retires push subscriptions after a quiet spell and says nothing, so
     the worker is registered and the subscription re-confirmed on every
     launch. Re-subscribing an endpoint that is still good costs nothing; it is
     the only way to notice one that is not. */
  useEffect(() => {
    if (isDemoMode || !user) return;
    void registerServiceWorker().then(() => syncPushSubscription());
  }, [user]);

  /* THE PARTNER NUDGE. Checked when the app opens and when it comes back to
     the foreground, which is when it can still change the day. It asks the
     server only for people who have trained, and only if the athlete has not
     logged yet — a nudge that arrives after you have trained is noise. */
  useEffect(() => {
    if (isDemoMode || !user || historyLoading) return;
    if (!loadNotificationPrefs().partnerTrained) return;
    const todayIso = localDayIso();
    const trainedToday = stravaRecords.some(record => record.date === todayIso
      && ((record.topSets || []).some(set => set.completed !== false) || (record.cardioSessions || []).length > 0));
    if (trainedToday) return;
    let active = true;
    void loadPartners()
      .then(partners => { if (active) maybeNotifyPartnerTrained(partners.filter(partner => partner.trainedToday).map(partner => partner.displayName)); })
      .catch(() => { /* the nudge is best effort */ });
    return () => { active = false; };
  }, [user, historyLoading, stravaRecords]);

  useEffect(() => {
    const open = () => setCoachOpen(true);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (coachExpanded) setCoachExpanded(false);
        else setCoachOpen(false);
      }
    };
    window.addEventListener('forge:open-coach', open);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('forge:open-coach', open);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [coachExpanded]);

  return <div className="app-frame">
    {updateReady&&<button type="button" className="update-ready-pill" onClick={()=>window.location.reload()}>Forge updated · tap to refresh</button>}
    <aside className="sidebar">
      <NavLink className="brand" to="/" aria-label="Forge home"><span className="brand-mark"><i /></span><span>FORGE</span></NavLink>
      <nav className="side-nav" aria-label="Primary navigation">
        {primaryNav.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'}><NavGlyph name={icon}/>{label}</NavLink>)}
      </nav>
      <NavLink className="sidebar-foot" to="/profile"><div className="avatar small">{initials}</div><div><strong>{setup?.displayName || 'Athlete'}</strong><span>Profile</span></div><b>›</b></NavLink>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div className="top-title">
          {chrome.back && <Link className="top-back" to={chrome.back} aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></Link>}
          <div><span className="eyebrow">FORGE</span><h1>{chrome.title}</h1></div>
        </div>
        <div className="top-actions">
          {!isDemoMode && (historyLoading || syncing) && <span className="data-sync-state">{historyLoading ? 'Loading data…' : 'Saving…'}</span>}
          {hasRecoveryData && <NavLink className="top-readiness" to="/profile?view=devices"><span>{recovery.readiness}</span><small>READY</small></NavLink>}
          <NavLink className="top-insights" to="/insights" aria-label="Progress"><NavGlyph name="chart"/></NavLink>
          {location.pathname !== '/workout' && <NavLink className="top-log" to="/workout" aria-label="Log a workout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></NavLink>}
          {/* Settings has one door, the first row of Profile. A gear on every
              screen was a second way into the same list. */}
        </div>
      </header>
      {/* A PREVIEW BUILD SAYS SO, ON EVERY SCREEN. `.env` carries
          VITE_DEMO_MODE=true for local work, so a build made outside the deploy
          workflow ships the fake session with nothing saving anywhere — and
          looked identical to the real app. Now it cannot be mistaken for one. */}
      {isDemoMode && <div className="demo-banner" role="status">Preview build — training is not saved to an account.</div>}
      {/* ONE STRIP FOR EVERYTHING THAT HAS NOT REACHED THE ACCOUNT. Training
          days had this banner to themselves; goals, the exercise library and
          the profile/split failed in silence. They all report to one channel
          now, and it names what is unsaved rather than saying "something". */}
      {!isDemoMode && syncFailures.length > 0 && <div className="data-sync-error">
        <span>{syncFailures.length === 1
          ? `${syncFailures[0].label}: ${syncFailures[0].message} It is safe on this phone and will retry.`
          : `${syncFailures.map(failure => failure.label).join(', ')} haven’t reached your account. They’re safe on this phone and will retry.`}</span>
        <button onClick={() => { retrySync(); retryAll(); }}>Retry</button>
      </div>}
      <main className={`page screen-${motion.current}`} key={screenKey}><Outlet /></main>
    </div>
    <nav className={hideTabs ? 'tab-bar away' : 'tab-bar'} aria-label="Tabs" style={{ '--tab-index': Math.max(0, activeTab) } as CSSProperties}>
      {activeTab >= 0 && <span className="tab-indicator" aria-hidden="true" />}
      {tabs.map((tab, index) => <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={index === activeTab ? 'tab active' : 'tab'} aria-current={index === activeTab ? 'page' : undefined}
        onClick={() => { if (index !== activeTab) tap(); }}
        onTouchStart={event => { const point = event.touches[0]; tabTouch.current = point ? { x: point.clientX, y: point.clientY } : null; }}
        onTouchEnd={event => {
          const start = tabTouch.current; tabTouch.current = null;
          const point = event.changedTouches[0];
          if (!start || !point || Math.hypot(point.clientX - start.x, point.clientY - start.y) > 10) return;
          event.preventDefault();
          if (index !== activeTab) { tap(); navigate(tab.to); }
        }}><NavGlyph name={tab.icon}/><small>{tab.label}</small></NavLink>)}
    </nav>
    {/* THE COACH SPEAKS FIRST WHEN IT HAS SOMETHING THAT MATTERS. An athlete
        whose goal cannot be reached on the running they do is told on the way
        in, once a day, with the fix attached — not left to find a card on a
        tab they may never open. */}
    {/* ONE CONVERSATION AT A TIME. The check-in asks about the body and is
        answered in seconds; the mileage question asks about the program and
        deserves a clear head. The body goes first. */}
    {/* The effort question goes first: the mileage gate and the check-in are
        both computed from the evidence it is asking about. */}
    <EffortCheck />
    <CoachCheckIn />
    <MileageStartupCheck />
    {/* Open, the coach is a sheet over a dimmed screen, and tapping the dim
        closes it — on a phone always, on a desktop when expanded. */}
    {coachOpen && <button className={coachExpanded ? 'coach-bubble-backdrop expanded' : 'coach-bubble-backdrop'} type="button" aria-label="Close Forge coach" onClick={() => { if (coachExpanded) setCoachExpanded(false); else setCoachOpen(false); }} />}
    <div className={`${coachExpanded ? 'coach-bubble-shell expanded' : 'coach-bubble-shell'}${location.pathname === '/coach' || location.pathname === '/workout' ? ' coach-bubble-hidden' : ''}`}>
      <section className={coachOpen ? 'coach-bubble-panel open' : 'coach-bubble-panel'} aria-hidden={!coachOpen} aria-label="Forge AI coach">
        <header><div><span>AI COACH</span><strong>Ask Forge</strong></div><div className="coach-window-actions"><button type="button" onClick={() => setCoachExpanded(value => !value)} aria-label={coachExpanded ? 'Restore Forge coach' : 'Expand Forge coach'} title={coachExpanded ? 'Restore' : 'Expand'}>{coachExpanded ? <Icon name="collapse"/> : <Icon name="expand"/>}</button><button type="button" onClick={() => { setCoachOpen(false); setCoachExpanded(false); }} aria-label="Close Forge coach">×</button></div></header>
        <div className="coach-bubble-content">{coach}</div>
      </section>
      <button type="button" className={coachOpen ? 'coach-bubble-toggle active' : 'coach-bubble-toggle'} onClick={() => { tap(); setCoachOpen(open => !open); if (coachOpen) setCoachExpanded(false); }} aria-expanded={coachOpen} aria-label={coachOpen ? 'Close Forge coach' : 'Open Forge coach'}>
        <span>{coachOpen ? '×' : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"/></svg>}</span><b>{coachOpen ? 'Close' : 'Ask Forge'}</b>
      </button>
    </div>
  </div>;
}

/* The header already names the screen. A page that repeated that name in
   26px type underneath it read as two titles, so `title` is now optional:
   without one the intro is a quiet lead — an eyebrow, a line of guidance, an
   action — and pages whose name is the whole story pass nothing. */
export function PageIntro({ eyebrow, title, copy, action }: { eyebrow?: string; title?: string; copy?: string; action?: ReactNode }) {
  return <div className={title ? 'page-intro' : 'page-intro lead'}><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}{title && <h2>{title}</h2>}{copy && <p>{copy}</p>}</div>{action}</div>;
}

export function Metric({ value, label, delta }: { value: string; label: string; delta?: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span>{delta && <small>{delta}</small>}</div>;
}
