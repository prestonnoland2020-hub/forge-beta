import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { waveLabel } from '../components/PlanView';
import { useAuth } from '../features/auth/AuthProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { isDemoMode } from '../lib/env';
import {
  loadPartners, loadPartnerWeek, lastTrainedLabel,
  type Partner, type PartnerWeek,
} from '../features/friends/partnerService';
import { share } from '../lib/partnerStats';

/* WHAT DID THEY DO TODAY, AND ARE WE LEVEL THIS WEEK.

   Two questions, and this screen answers exactly those two. It used to answer
   a third — "what are our numbers over six months" — with four KPI tiles, a
   two-row measure picker and an indexed progress chart. All of it was true and
   none of it was what anyone opens a partner for. You tap a training partner
   to see whether they trained and what they did; the long view was a research
   tool wearing a friend's name.

   So: their session today at the top, the week head to head underneath, and
   nothing after it. The comparison chart and everything that fed it came out
   whole — it is in the history if it is ever wanted back. */
/* The four things worth comparing in a week. Streak is last because it is the
   one that rewards not breaking, rather than doing more on any given day. */
const HEAD_TO_HEAD: Array<{ key: string; label: string; value: (week: PartnerWeek) => number; format: (value: number) => string }> = [
  { key: 'days', label: 'Days trained', value: week => week.daysTrained, format: value => String(value) },
  { key: 'miles', label: 'Miles run', value: week => week.miles, format: value => value ? `${Math.round(value * 10) / 10}` : '0' },
  { key: 'sets', label: 'Top sets', value: week => week.topSets, format: value => String(value) },
  { key: 'streak', label: 'Day streak', value: week => week.streak, format: value => String(value) },
];

export function PartnerDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { setup } = useProfileSetup();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [week, setWeek] = useState<{ mine: PartnerWeek; theirs: PartnerWeek } | null>(null);
  const [loading, setLoading] = useState(true);
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';

  useEffect(() => {
    if (isDemoMode || !user || !id) { setLoading(false); return; }
    let active = true;
    void Promise.all([loadPartners(), loadPartnerWeek(id)])
      .then(([partners, thisWeek]) => {
        if (!active) return;
        setPartner(partners.find(item => item.friendId === id) || null);
        setWeek(thisWeek);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, id]);

  const theirName = (partner?.displayName || 'Partner').split(' ')[0];
  /* WHAT THEY ACTUALLY DID, AS TWO LINES. The feed already carries their top
     set and their cardio; the header was compressing both into one sentence
     with a middot, which reads as a status line rather than a session. */
  const topSet = partner?.topLift && partner.topWeight
    ? `${partner.topLift} ${partner.topWeight} ${weightUnit} × ${partner.topReps}`
    : '';
  /* The feed sends "Run · 2.27 mi · 21:04"; the activity is the label and the
     rest is the session. */
  const cardio = (partner?.cardioSummary || '').split(' · ').filter(Boolean);

  if (loading) return <div className="stack-xl"><section className="card"><p>Loading…</p></section></div>;
  if (!partner) return <div className="stack-xl"><section className="card"><p>This partner is no longer on your list.</p></section></div>;

  return <div className="stack-xl partner-detail">
    <section className="card partner-detail-head">
      <span className="partner-mark" aria-hidden="true">{partner.displayName.slice(0, 2).toUpperCase()}</span>
      <div>
        <strong>{partner.displayName}</strong>
        <small>{partner.blockWeek && partner.blockWeeks
          ? `Week ${partner.blockWeek} of ${partner.blockWeeks} · ${waveLabel(partner.waveSlot ?? 0)}`
          : 'No block yet'}</small>
        {/* Said once. The card below carries the whole session when there is
            one, so the header only speaks up when there is not. */}
        {!partner.trainedToday && <span className="partner-quiet">{lastTrainedLabel(partner.lastTrained)}</span>}
      </div>
    </section>

    {/* TODAY, FIRST. The reason anyone taps a partner's name is to see whether
        they trained and what they did. It was a compressed middot line inside
        the header; it is the headline now. */}
    <section className="card partner-today">
      <header><h3>Today</h3></header>
      {partner.trainedToday && (topSet || cardio.length)
        ? <div className="pv-lines">
            {topSet && <div className="pv-line"><span className="pv-line-name">{partner.topLift}</span><span className="pv-line-value">{partner.topWeight} <small>{weightUnit}</small> × {partner.topReps}</span></div>}
            {cardio.length > 0 && <div className="pv-line"><span className="pv-line-name">{cardio[0]}</span><span className="pv-line-value">{cardio.slice(1).join(' · ') || '—'}</span></div>}
          </div>
        : <p className="partner-empty">{partner.trainedToday
            ? `${theirName} logged a session today without a top set or a run in it.`
            : `Nothing from ${theirName} yet today.`}</p>}
    </section>

    {/* THIS WEEK, AND NOTHING TO CHOOSE. Four rows, both athletes on each,
        the bar showing the split rather than a number needing arithmetic. The
        leader is named in text as well as position, so the row does not depend
        on reading a bar. */}
    {week && <section className="card partner-week">
      <header><h3>This week</h3><small>Since Monday</small></header>
      {HEAD_TO_HEAD.map(row => {
        const mine = row.value(week.mine); const theirs = row.value(week.theirs);
        const split = share(mine, theirs);
        const leader = mine === theirs ? 'level' : mine > theirs ? 'mine' : 'theirs';
        return <div className={`h2h h2h-lead-${leader}`} key={row.key}>
          <span className="h2h-mine"><b>{row.format(mine)}</b><small>You</small></span>
          <div className="h2h-track" role="img"
            aria-label={`${row.label}: you ${row.format(mine)}, ${theirName} ${row.format(theirs)}`}>
            <span className="h2h-label">{row.label}</span>
            <div className="h2h-bar">
              <i className={mine > 0 ? 'h2h-fill-mine' : 'h2h-fill-mine none'} style={{ flexGrow: split.mine }} />
              <i className={theirs > 0 ? 'h2h-fill-theirs' : 'h2h-fill-theirs none'} style={{ flexGrow: split.theirs }} />
            </div>
          </div>
          <span className="h2h-theirs"><b>{row.format(theirs)}</b><small>{theirName}</small></span>
        </div>;
      })}
      <footer className="partner-week-note">
        {week.mine.daysTrained === week.theirs.daysTrained
          ? `Level with ${theirName} on days trained this week.`
          : week.mine.daysTrained > week.theirs.daysTrained
            ? `You are ${week.mine.daysTrained - week.theirs.daysTrained} day${week.mine.daysTrained - week.theirs.daysTrained === 1 ? '' : 's'} up on ${theirName} this week.`
            : `${theirName} is ${week.theirs.daysTrained - week.mine.daysTrained} day${week.theirs.daysTrained - week.mine.daysTrained === 1 ? '' : 's'} up on you this week.`}
      </footer>
    </section>}

  </div>;
}
