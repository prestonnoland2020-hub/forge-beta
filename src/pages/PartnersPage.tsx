import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { supabase } from '../lib/supabase';
import { isDemoMode } from '../lib/env';
import {
  loadPartners, loadPartnerRequests, addPartner, declinePartner, removePartner,
  inviteLink, lastTrainedLabel, pendingInvite, clearPendingInvite, didToday,
  searchAthletes, suggestAthletes, addPartnerById, loadDiscoverable, setDiscoverable, loadPartnerRecent, type AthleteResult, type SuggestedAthlete, type PartnerDay,
  type Partner, type PartnerRequest, type AddResult,
} from '../features/friends/partnerService';
import { localDayIso } from '../lib/time';
import '../partners-slim.css';
import { SearchField } from '../components/SearchField';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { sameLift } from '../lib/liftAliases';

const MESSAGES: Record<AddResult, string> = {
  requested: 'Request sent. They will see it next time they open Forge.',
  accepted: 'You are training partners.',
  already: 'You are already partners.',
  full: 'Five partners is the limit — remove one first.',
  self: 'That is your own username.',
  not_found: 'No athlete with that username.',
  blocked: 'That request cannot be sent.',
};

const DEMO_PARTNERS: Partner[] = [
  { friendId: 'demo-a', username: 'jordan', displayName: 'Jordan Reyes', blockWeek: 2, blockWeeks: 10, waveSlot: 2, trainedToday: true, lastTrained: localDayIso(), topLift: 'Bench', topWeight: 225, topReps: 5, cardioSummary: null },
  { friendId: 'demo-b', username: 'sam', displayName: 'Sam Patel', blockWeek: 2, blockWeeks: 10, waveSlot: 1, trainedToday: false, lastTrained: localDayIso(new Date(Date.now() - 3 * 86400000)), topLift: null, topWeight: null, topReps: null, cardioSummary: null },
];
const DEMO_DAYS = (): Record<string, PartnerDay[]> => ({
  'demo-a': [{ date: localDayIso(), lifts: [{ name: 'Bench', weight: 225, reps: 5 }, { name: 'Barbell Row', weight: 185, reps: 8 }, { name: 'Incline DB Press', weight: 70, reps: 10 }], cardio: [{ name: 'Run', summary: 'Run · 3.1 mi · 26:40' }] }],
  'demo-b': [{ date: localDayIso(new Date(Date.now() - 3 * 86400000)), lifts: [{ name: 'Squat', weight: 315, reps: 4 }, { name: 'Leg Press', weight: 450, reps: 10 }], cardio: [] }],
});

export function PartnersPage() {
  const { user } = useAuth();
  /* Opened from Today: a partner opened from here should still find its way
     back to Today, through this list. */
  const origin = (useLocation().state as { origin?: string } | null)?.origin;
  const { setup } = useProfileSetup();
  const [params, setParams] = useSearchParams();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [username, setUsername] = useState(params.get('add') || pendingInvite());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [myUsername, setMyUsername] = useState('');
  const [results, setResults] = useState<AthleteResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState<SuggestedAthlete[]>([]);
  const [discoverable, setDiscoverableState] = useState(true);
  const unit = setup?.units === 'Metric' ? 'kg' : 'lb';

  const refresh = useCallback(async () => {
    /* The preview build shows two made-up partners so the screen can be seen. */
    if (isDemoMode) { setPartners(DEMO_PARTNERS); return; }
    if (!user) return;
    const [rows, waiting] = await Promise.all([loadPartners(), loadPartnerRequests()]);
    setPartners(rows); setRequests(waiting);
  }, [user]);

  useEffect(() => { void refresh().catch(() => setMessage('Your partners could not be loaded.')); }, [refresh]);
  useEffect(() => {
    if (isDemoMode || !user) return;
    void supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
      .then(({ data }) => setMyUsername(String(data?.username || '')));
    void loadDiscoverable().then(setDiscoverableState).catch(() => undefined);
  }, [user]);

  /* SUGGESTED BEFORE ANYTHING IS TYPED. An empty search used to be a blank
     box asking for a name the athlete might not know; now it opens on
     partners of partners and people with the same goal. Reloaded after an
     add, so someone just asked does not stay on the list. */
  const loadSuggested = useCallback(() => { void suggestAthletes().then(setSuggested).catch(() => setSuggested([])); }, []);
  useEffect(() => { if (user) loadSuggested(); }, [user, loadSuggested]);

  /* Search as they type, a beat behind the keyboard so a name is not eight
     round trips. */
  useEffect(() => {
    const value = username.trim();
    if (value.length < 2) { setResults([]); return; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchAthletes(value)
        .then(setResults).catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => { window.clearTimeout(timer); setSearching(false); };
  }, [username]);

  const pick = async (result: AthleteResult) => {
    setBusy(true); setMessage('');
    try {
      const outcome = await addPartnerById(result.id);
      setMessage(MESSAGES[outcome] || 'That did not work.');
      if (outcome === 'accepted' || outcome === 'requested') { setUsername(''); setResults([]); clearPendingInvite(); setSuggested(current => current.filter(item => item.id !== result.id)); loadSuggested(); }
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'That did not work.');
    } finally { setBusy(false); }
  };

  const submit = async (name: string) => {
    const value = name.trim();
    if (!value) return;
    setBusy(true); setMessage('');
    try {
      const result = await addPartner(value);
      setMessage(MESSAGES[result] || 'That did not work.');
      if (result === 'accepted' || result === 'requested' || result === 'already') { setUsername(''); clearPendingInvite(); params.delete('add'); setParams(params, { replace: true }); }
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'That did not work.');
    } finally { setBusy(false); }
  };

  const share = async () => {
    const link = inviteLink(myUsername);
    const text = `Train with me on Forge — add me as a training partner: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Forge', text });
      else { await navigator.clipboard.writeText(link); setMessage('Invite link copied.'); }
    } catch { /* the athlete cancelled the share sheet */ }
  };

  /* THEIR DAY, NOT A DASHBOARD. Each partner's last four weeks, read once,
     so a row can show the workout they did today — every lift, and the run —
     or, if not today, their last session. */
  const [days, setDays] = useState<Record<string, PartnerDay[]>>({});
  useEffect(() => {
    if (isDemoMode) { setDays(DEMO_DAYS()); return; }
    if (!partners.length) return;
    let live = true;
    void Promise.all(partners.map(partner => loadPartnerRecent(partner.friendId).then(list => [partner.friendId, list] as const).catch(() => [partner.friendId, [] as PartnerDay[]] as const)))
      .then(entries => { if (live) setDays(Object.fromEntries(entries)); });
    return () => { live = false; };
  }, [partners]);
  const today = localDayIso();
  /* WHO TRAINED LAST, AND WHAT IT MEANS FOR THE TWO OF YOU. The page is the
     partnership, not a search form: partners in the order they last trained,
     the session each one did, and a line or two read against your own log. */
  const { records } = useWorkoutHistory();
  const ago = (iso: string) => {
    const gap = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${iso}T12:00:00`).getTime()) / 86400000);
    return gap <= 0 ? 'today' : gap === 1 ? 'yesterday' : gap < 7 ? `${gap} days ago` : new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const lastDayOf = (partner: Partner) => days[partner.friendId]?.[0]?.date || (partner.trainedToday ? today : partner.lastTrained) || '';
  const ordered = [...partners].sort((a, b) => lastDayOf(b).localeCompare(lastDayOf(a)));
  const myLast = records.reduce((latest, record) => record.date > latest && record.date <= today ? record.date : latest, '');
  const weekAgo = localDayIso(new Date(Date.now() - 6 * 86400000));
  const myWeek = new Set(records.filter(record => record.date >= weekAgo && record.date <= today).map(record => record.date)).size;
  const first = (partner: Partner) => (partner.displayName || partner.username).split(' ')[0];
  const leader = ordered.find(partner => lastDayOf(partner));
  const headline = !leader ? ''
    : myLast && myLast >= lastDayOf(leader) ? `You trained last, ${ago(myLast)}. ${first(leader)} ${myLast === lastDayOf(leader) ? 'did too' : `last trained ${ago(lastDayOf(leader))}`}.`
    : `${first(leader)} trained last, ${ago(lastDayOf(leader))}. ${myLast ? `You last trained ${ago(myLast)}.` : 'Your turn.'}`;
  const insights = (partner: Partner, recent: PartnerDay[]) => {
    const lines: string[] = [];
    const theirWeek = recent.filter(day => day.date >= weekAgo).length;
    if (theirWeek || myWeek) lines.push(`Last 7 days: ${first(partner)} ${theirWeek} ${theirWeek === 1 ? 'session' : 'sessions'}, you ${myWeek}`);
    /* A lift you both do: their latest set beside yours. */
    for (const day of recent) {
      const match = day.lifts.map(lift => {
        const mine = records.filter(record => record.date <= today).sort((a, b) => b.date.localeCompare(a.date))
          .flatMap(record => record.topSets || []).find(set => sameLift(set.lift, lift.name) && set.weight && set.reps);
        return mine ? `${lift.name}: ${first(partner)} ${lift.weight}×${lift.reps}, you ${mine.weight}×${mine.reps}` : '';
      }).find(Boolean);
      if (match) { lines.push(match); break; }
    }
    return lines;
  };
  const [removing, setRemoving] = useState<Partner | null>(null);
  const searchingNow = username.trim().length >= 2;

  return <div className="stack-xl partners-page partners-slim">
    {/* ONE LINE: search, and invite beside it. */}
    <form role="search" className="ps-search" onSubmit={event => { event.preventDefault(); if (results[0]?.relation === 'none') void pick(results[0]); }}>
      <SearchField id="partner-username" value={username} onChange={setUsername} autoCapitalize="none"
        placeholder="Find a partner" aria-label="Find a partner by name or username" />
      {myUsername && <button type="button" className="ps-invite" onClick={() => void share()}>Invite</button>}
    </form>
    {message && <p className="partner-message">{message}</p>}

    {searchingNow && <section className="card ps-results">
      {results.map(result => <button type="button" className="partner-result" key={result.id}
        disabled={busy || result.relation !== 'none'} onClick={() => void pick(result)}>
        <span className="partner-mark" aria-hidden="true">{result.displayName.slice(0, 2).toUpperCase()}</span>
        <span><strong>{result.displayName}</strong><small>@{result.username}</small></span>
        <b>{result.relation === 'partner' ? 'Partner' : result.relation === 'requested' ? 'Requested' : result.relation === 'waiting' ? 'Asked you' : 'Add'}</b>
      </button>)}
      {!results.length && <p className="partner-message">{searching ? 'Searching…' : 'Nobody by that name. Their exact username always works.'}</p>}
    </section>}

    {requests.length > 0 && <section className="card partner-requests">
      <h3>Waiting on you</h3>
      {requests.map(request => <div className="partner-request" key={request.friendshipId}>
        <div><strong>{request.displayName}</strong><small>@{request.username}</small></div>
        <div className="partner-request-actions">
          <button type="button" className="button small-button" disabled={busy} onClick={() => void submit(request.username)}>Accept</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => void declinePartner(request.friendshipId).then(refresh)}>Decline</button>
        </div>
      </div>)}
    </section>}

    {!searchingNow && <section className="ps-list" aria-label="Your training partners">
      {partners.length === 0 && <div className="card ps-empty">
        <p>No partners yet. Training alongside one person is the difference between a plan and a habit.</p>
        {suggested.length > 0 && <div className="partner-results">
          <small className="partner-results-label">Suggested</small>
          {suggested.map(person => <button type="button" className="partner-result" key={person.id} disabled={busy} onClick={() => void pick(person)}>
            <span className="partner-mark" aria-hidden="true">{person.displayName.slice(0, 2).toUpperCase()}</span>
            <span><strong>{person.displayName}</strong><small>{person.mutuals ? `${person.mutuals} shared ${person.mutuals === 1 ? 'partner' : 'partners'}` : `@${person.username}`}</small></span>
            <b>Add</b>
          </button>)}
        </div>}
      </div>}
      {headline && <p className="ps-headline">{headline}</p>}
      {ordered.map(partner => {
        const recent = days[partner.friendId] || [];
        const todays = recent.find(day => day.date === today);
        const last = todays || recent[0];
        const status = partner.trainedToday || todays ? 'Trained today' : lastTrainedLabel(last?.date || partner.lastTrained);
        const fallback = !last && partner.trainedToday ? didToday(partner, unit) : '';
        const notes = insights(partner, recent);
        return <article className={`card ps-card${partner.trainedToday || todays ? ' done' : ''}`} key={partner.friendId}>
          <Link className="ps-main" to={`/partners/${partner.friendId}`} state={origin ? { origin, viaList: true } : undefined}>
            <span className="partner-mark" aria-hidden="true">{(partner.displayName || partner.username).slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{partner.displayName}</strong>
              <span className="ps-status">{(partner.trainedToday || todays) && <i aria-hidden="true" />}{status}</span>
              {fallback && <span className="ps-workout">{fallback}</span>}
            </div>
          </Link>
          {last && <ul className="ps-session" aria-label={`${first(partner)}’s ${todays ? 'workout today' : 'last workout'}`}>
            {last.lifts.slice(0, 5).map((lift, index) => <li key={`${lift.name}-${index}`}><span>{lift.name}</span><b>{lift.weight} {unit} × {lift.reps}</b></li>)}
            {last.lifts.length > 5 && <li><span>+{last.lifts.length - 5} more</span></li>}
            {last.cardio.map((session, index) => { const parts = session.summary.split(' · ').filter(Boolean); return <li key={`c-${index}`}><span>{session.name}</span><b>{parts.slice(1).join(' · ')}</b></li>; })}
          </ul>}
          {notes.length > 0 && <div className="ps-insights">{notes.map(note => <span key={note}>{note}</span>)}</div>}
          <button type="button" className="ps-x" aria-label={`Remove ${partner.displayName}`} onClick={() => setRemoving(partner)}>×</button>
        </article>;
      })}
    </section>}

    {/* Being findable is its own choice; a username always works. */}
    <div className="partner-discoverable ps-foot">
      <div><strong>Find me by name</strong><small>{myUsername ? `@${myUsername} always works.` : 'Off: only your exact username can add you.'}</small></div>
      <input type="checkbox" aria-label="Let people find me by name" checked={discoverable} onChange={event => {
        const next = event.target.checked; setDiscoverableState(next);
        void setDiscoverable(next).catch(() => setDiscoverableState(!next));
      }} />
    </div>

    {removing && <div className="ps-confirm-backdrop" role="dialog" aria-modal="true" aria-label="Remove partner" onClick={() => setRemoving(null)}>
      <div className="ps-confirm" onClick={event => event.stopPropagation()}>
        <h3>Remove {removing.displayName}?</h3>
        <p>You’ll stop seeing each other’s training. You can add them again any time.</p>
        <div>
          <button type="button" className="button ghost" onClick={() => setRemoving(null)}>Cancel</button>
          <button type="button" className="button ps-danger" onClick={() => { const who = removing; setRemoving(null); void removePartner(who.friendId).then(refresh); }}>Remove</button>
        </div>
      </div>
    </div>}
  </div>;
}
