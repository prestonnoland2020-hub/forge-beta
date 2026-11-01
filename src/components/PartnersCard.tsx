import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadPartners, lastTrainedLabel, pendingInvite, didToday, type Partner } from '../features/friends/partnerService';
import { useAuth } from '../features/auth/AuthProvider';
import { isDemoMode } from '../lib/env';
import { Icon } from './Icon';

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
  /* Every way in from here remembers Today, so the header's back arrow and
     the tab bar bring the athlete back to it rather than into Profile. */
  const fromToday = { origin: '/' };
  if (!partners?.length) {
    if (!invite) return null;
    return <section className="partners-card">
      <header><h3>Training partners</h3></header>
      <Link className="partner-invite-prompt" to="/partners" state={fromToday}>
        <span className="partner-mark" aria-hidden="true">{invite.slice(0, 2).toUpperCase()}</span>
        <div><strong>@{invite} invited you</strong><small>Add them and you will each see whether the other has trained.</small></div>
        <Icon name="chevron" size={16} />
      </Link>
    </section>;
  }

  /* ONE LINE EACH, LIKE THE GUIDE'S ROWS. The mark, the name, and one line of
     what happened: what they did today, or when they last trained. Someone
     who has trained wears the good chip; everyone else gets a chevron. */
  return <section className="partners-card">
    <header><h3>Training partners</h3><Link to="/partners" state={fromToday}>Manage</Link></header>
    <ul className="partner-rows">
      {partners.map(partner => <li key={partner.friendId}>
        <Link className={`partner-row${partner.trainedToday ? ' trained' : ''}`} to={`/partners/${partner.friendId}`} state={fromToday}>
          <span className="partner-mark" aria-hidden="true">{(partner.displayName || partner.username).slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{partner.displayName}</strong>
            {partner.trainedToday
              ? <span className="partner-did">{didToday(partner, unit)}</span>
              : <span className="partner-quiet">{lastTrainedLabel(partner.lastTrained)}</span>}
          </div>
          {partner.trainedToday
            ? <b className="partner-chip"><Icon name="check" size={12} stroke={3} />Trained</b>
            : <Icon name="chevron" size={16} className="partner-go" />}
        </Link>
      </li>)}
    </ul>
  </section>;
}
