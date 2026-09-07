import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageIntro } from '../components/AppShell';
import { waveLabel } from '../components/PlanView';
import { useAuth } from '../features/auth/AuthProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { supabase } from '../lib/supabase';
import { isDemoMode } from '../lib/env';
import {
  loadPartners, loadPartnerRequests, addPartner, declinePartner, removePartner,
  inviteLink, lastTrainedLabel, pendingInvite, clearPendingInvite, didToday,
  searchAthletes, addPartnerById, loadDiscoverable, setDiscoverable, type AthleteResult,
  type Partner, type PartnerRequest, type AddResult,
} from '../features/friends/partnerService';

const MESSAGES: Record<AddResult, string> = {
  requested: 'Request sent. They will see it next time they open Forge.',
  accepted: 'You are training partners.',
  already: 'You are already partners.',
  full: 'Five partners is the limit — remove one first.',
  self: 'That is your own username.',
  not_found: 'No athlete with that username.',
  blocked: 'That request cannot be sent.',
};

export function PartnersPage() {
  const { user } = useAuth();
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
  const [discoverable, setDiscoverableState] = useState(true);
  const unit = setup?.units === 'Metric' ? 'kg' : 'lb';

  const refresh = useCallback(async () => {
    if (isDemoMode || !user) return;
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
      if (outcome === 'accepted' || outcome === 'requested') { setUsername(''); setResults([]); clearPendingInvite(); }
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

  return <div className="stack-xl partners-page">
    <PageIntro copy="Up to five people. You see where they are in their block and whether they have trained today — nothing else, and nothing they write." />

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

    <section className="card partner-add">
      <h3>Add a partner</h3>
      <form onSubmit={event => { event.preventDefault(); if (results[0]?.relation === 'none') void pick(results[0]); }}>
        <label htmlFor="partner-username">Search by name or username</label>
        <div className="partner-add-row">
          <input id="partner-username" value={username} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="Adam, or adamgomez" onChange={event => setUsername(event.target.value)} />
        </div>
      </form>
      {/* Results, or the honest reason there are none. */}
      {username.trim().length >= 2 && <div className="partner-results">
        {results.map(result => <button type="button" className="partner-result" key={result.id}
          disabled={busy || result.relation !== 'none'} onClick={() => void pick(result)}>
          <span className="partner-mark" aria-hidden="true">{result.displayName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{result.displayName}</strong><small>@{result.username}</small></span>
          <b>{result.relation === 'partner' ? 'Partner'
            : result.relation === 'requested' ? 'Requested'
            : result.relation === 'waiting' ? 'Asked you'
            : 'Add'}</b>
        </button>)}
        {!results.length && <p className="partner-message">{searching ? 'Searching…' : 'Nobody by that name. Their exact username always works.'}</p>}
      </div>}
      {message && <p className="partner-message">{message}</p>}
      {myUsername && <div className="partner-invite">
        <div><strong>Your username is @{myUsername}</strong><small>Send someone the link and they arrive already connected to you.</small></div>
        <button type="button" className="button ghost small-button" onClick={() => void share()}>Invite a friend</button>
      </div>}
      {/* Being findable is its own choice, and it is not the same as being
          invitable — a username always works. */}
      <div className="partner-discoverable">
        <div><strong>Let people find me by name</strong><small>Off, and only someone with your exact username can add you.</small></div>
        <input type="checkbox" aria-label="Let people find me by name" checked={discoverable} onChange={event => {
          const next = event.target.checked; setDiscoverableState(next);
          void setDiscoverable(next).catch(() => setDiscoverableState(!next));
        }} />
      </div>
    </section>

    <section className="card pv-week partners-list">
      <header><h3>Your partners</h3></header>
      {partners.length === 0
        ? <p className="partner-empty">No partners yet. Training alongside one person is the difference between a plan and a habit.</p>
        : <div className="pv-week-rows">
            {partners.map(partner => {
              const block = partner.blockWeek && partner.blockWeeks
                ? `Week ${partner.blockWeek} of ${partner.blockWeeks} · ${waveLabel(partner.waveSlot ?? 0)}`
                : 'No block yet';
              return <div className={`pv-row partner-full${partner.trainedToday ? ' done' : ''}`} key={partner.friendId}>
                <div className="partner-full-main">
                  <span className="partner-mark" aria-hidden="true">{(partner.displayName || partner.username).slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{partner.displayName}</strong>
                    <small>{block}</small>
                    <span className={partner.trainedToday ? 'partner-did' : 'partner-quiet'}>
                      {partner.trainedToday ? didToday(partner, unit) : lastTrainedLabel(partner.lastTrained)}
                    </span>
                  </div>
                  {partner.trainedToday && <b aria-label="Trained today">✓</b>}
                </div>
                <button type="button" className="text-button partner-remove"
                  onClick={() => { if (window.confirm(`Remove ${partner.displayName} as a training partner?`)) void removePartner(partner.friendId).then(refresh); }}>Remove</button>
              </div>;
            })}
          </div>}
    </section>
  </div>;
}
