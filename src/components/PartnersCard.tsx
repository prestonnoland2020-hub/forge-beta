import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadPartners, lastTrainedLabel, pendingInvite, didToday, type Partner } from '../features/friends/partnerService';
import { waveLabel } from './PlanView';
import { useAuth } from '../features/auth/AuthProvider';
import { isDemoMode } from '../lib/env';

/* WHERE YOU SEE YOUR PARTNERS: on Today, under the workout, because that is
   the screen where you decide whether to train. A partner who has already
   trained is the one piece of information that changes that decision, and it
   is worth nothing on a screen nobody opens.

   One line each. No feed, no likes, nothing to scroll. */
export function PartnersCard({ unit = 'lb' }: { unit?: string }) {
  const { user } = useAuth();
  const [partners, setPartners] = useState<Partner[] | null>(null);
  useEffect(() => {
    if (isDemoMode || !user) { setPartners([]); return; }
    let active = true;
    void loadPartners().then(rows => { if (active) setPartners(rows); }).catch(() => { if (active) setPartners([]); });
    return () => { active = false; };
  }, [user]);

  /* Nothing to say until there is someone to say it about — the way in lives
     in Profile rather than as an empty card on the home screen. The exception
     is someone who arrived on an invite: they were sent here by a person, and
     the link is worth nothing if it goes unanswered. */
  const invite = pendingInvite();
  if (!partners?.length) {
    if (!invite) return null;
    return <section className="card partners-card">
      <header><h3>Training partners</h3></header>
      <Link className="partner-invite-prompt" to="/partners">
        <div><strong>@{invite} invited you</strong><small>Add them and you will each see whether the other has trained.</small></div>
        <b aria-hidden="true">›</b>
      </Link>
    </section>;
  }

  return <section className="card partners-card">
    <header><h3>Training partners</h3><Link to="/partners">Manage</Link></header>
    <div className="partner-rows">
      {partners.map(partner => {
        const block = partner.blockWeek && partner.blockWeeks
          ? `Week ${partner.blockWeek} of ${partner.blockWeeks} · ${waveLabel((partner.waveSlot ?? 0))}`
          : 'No block yet';
        return <Link className={`partner-row${partner.trainedToday ? ' trained' : ''}`} to={`/partners/${partner.friendId}`} key={partner.friendId}>
          <span className="partner-mark" aria-hidden="true">{(partner.displayName || partner.username).slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{partner.displayName}</strong>
            <small>{block}</small>
            {/* What they actually did today, when they did something. */}
            {partner.trainedToday
              ? <span className="partner-did">{didToday(partner, unit)}</span>
              : <span className="partner-quiet">{lastTrainedLabel(partner.lastTrained)}</span>}
          </div>
          {partner.trainedToday && <b aria-label="Trained today">✓</b>}
        </Link>;
      })}
    </div>
  </section>;
}
