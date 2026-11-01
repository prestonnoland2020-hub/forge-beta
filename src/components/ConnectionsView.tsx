import type { ReactElement } from 'react';
import { BrandMark, hasLogo, hasWordmark } from '../features/training/brandLogos';
import { connectionCatalog } from '../features/training/connectionCatalog';
import type { GarminConnectionStatus } from '../features/training/garminConnectionService';
import type { ActivityConnectionStatus } from '../features/training/activityConnectionService';
import { GarminHistoryUpload } from './GarminHistoryUpload';

/* CONNECTIONS, LAID OUT BY WHAT THE ATHLETE CAN DO.

   It was one long list of rows — a logo, a paragraph, and a button or a
   "Coming soon" pill — and on a phone the logo and the buttons left the
   paragraph a column one word wide, with Sync now drawn on top of it. The
   list is now in three parts, in the order an athlete needs them:

     Connected     a card per live connection: what has arrived, how fresh it
                   is, and its two actions on their own row;
     Available     what can be connected right now, one line on what it
                   brings, and Connect;
     Coming soon   a quiet grid of logos — nothing to do there yet, so it
                   takes the least space.

   A brand's wordmark stands in for its name; only brands without published
   artwork spell theirs out. */

type Action = 'connect' | 'sync' | 'disconnect';
type Props = {
  garmin: GarminConnectionStatus | null; garminBusy: boolean; garminMessage: string; onGarmin: (action: Action) => void;
  strava: ActivityConnectionStatus | null; stravaBusy: boolean; stravaMessage: string; onStrava: (action: Action) => void;
};

/* "just now", "5 min ago", "3 hr ago", "yesterday", then the date. */
const ago = (iso?: string) => {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hr ago`;
  if (minutes < 48 * 60) return 'yesterday';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/* A wordmark alone; a symbol with its name; a name alone where Forge has no
   artwork (Apple's rules bar its logo, and the others' official marks come
   from their brand kits). Never a tile or a box around any of them. */
function Name({ id, name }: { id: string; name: string }) {
  if (hasWordmark(id)) return <span className="cx-brand" title={name}><BrandMark id={id} name={name} /><span className="cx-sr">{name}</span></span>;
  if (hasLogo(id)) return <span className="cx-brand"><BrandMark id={id} name={name} /><strong>{name}</strong></span>;
  return <span className="cx-brand cx-brand-text"><strong>{name}</strong></span>;
}

export function ConnectionsView({ garmin, garminBusy, garminMessage, onGarmin, strava, stravaBusy, stravaMessage, onStrava }: Props) {
  const garminLive = Boolean(garmin?.configured);
  const stravaLive = strava?.configured !== false && Boolean(strava);

  const connected: ReactElement[] = [];
  const available: ReactElement[] = [];

  if (garminLive && garmin?.connected) {
    const activities = garmin.importedActivities || 0;
    const nights = garmin.healthDays || 0;
    const status = activities || nights
      ? [activities ? count(activities, 'activity', 'activities') : '', nights ? count(nights, 'night') + ' of sleep' : ''].filter(Boolean).join(' · ')
      : 'Waiting for Garmin’s first delivery';
    connected.push(<article key="garmin" className="cx-card">
      <header><Name id="garmin" name="Garmin" /><span className="cx-status"><i aria-hidden="true" />Connected</span></header>
      <p className="cx-line">{status}{garmin.lastSyncedAt ? <span> · updated {ago(garmin.lastSyncedAt)}</span> : null}</p>
      {garmin.historyBlocked
        ? <p className="cx-note">New workouts arrive each time your watch syncs. Garmin hasn’t opened your past activities to Forge yet.</p>
        : garmin.historyComplete === false && <p className="cx-note">Importing your Garmin history. Older activities arrive over the next few app opens.</p>}
      {garminMessage && <p className="cx-note" role="status">{garminMessage}</p>}
      <footer>
        <button type="button" className="cx-secondary" disabled={garminBusy} onClick={() => onGarmin('sync')}>{garminBusy ? 'Syncing…' : 'Sync now'}</button>
        <button type="button" className="cx-quiet" disabled={garminBusy} onClick={() => onGarmin('disconnect')}>Disconnect</button>
      </footer>
      {/* Past activities: only Garmin's export can bring them until the
          program has Garmin's historical data. */}
      {!garmin.historyComplete && <GarminHistoryUpload />}
    </article>);
  } else if (garminLive) {
    available.push(<article key="garmin" className="cx-row">
      <div><Name id="garmin" name="Garmin" /><p>Runs, rides and workouts from your watch, with heart rate.</p></div>
      <button type="button" className="cx-primary" disabled={garminBusy} onClick={() => onGarmin('connect')}>Connect</button>
      {garminMessage && <p className="cx-note" role="status">{garminMessage}</p>}
    </article>);
  }

  if (stravaLive && strava?.connected) {
    const activities = strava.importedActivities || 0;
    connected.push(<article key="strava" className="cx-card">
      <header><Name id="strava" name="Strava" /><span className="cx-status"><i aria-hidden="true" />Connected</span></header>
      <p className="cx-line">{strava.athleteName ? <>{strava.athleteName} · </> : null}{count(activities, 'activity', 'activities')}{strava.lastSyncedAt ? <span> · updated {ago(strava.lastSyncedAt)}</span> : null}</p>
      {stravaMessage && <p className="cx-note" role="status">{stravaMessage}</p>}
      <footer>
        <button type="button" className="cx-secondary" disabled={stravaBusy} onClick={() => onStrava('sync')}>{stravaBusy ? 'Syncing…' : 'Sync now'}</button>
        <button type="button" className="cx-quiet" disabled={stravaBusy} onClick={() => onStrava('disconnect')}>Disconnect</button>
      </footer>
    </article>);
  }
  /* STRAVA IS FOR THOSE ALREADY ON IT. Forge reads watches directly now;
     new athletes are not offered Strava, and an athlete who connected it
     earlier keeps the card above to sync or disconnect. */

  /* Everything not live yet, watches first. Garmin leaves this list the
     moment its connection is switched on. */
  const soon = connectionCatalog.filter(item => !(item.id === 'garmin' && garminLive));

  return <div className="cx">
    {connected.length > 0 && <section className="cx-section" aria-labelledby="cx-connected"><h3 id="cx-connected">Connected</h3>{connected}</section>}
    {available.length > 0 && <section className="cx-section" aria-labelledby="cx-available"><h3 id="cx-available">Available</h3><div className="cx-list">{available}</div></section>}
    <section className="cx-section" aria-labelledby="cx-soon">
      <h3 id="cx-soon">Coming soon</h3>
      <ul className="cx-grid">
        {soon.map(item => <li key={item.id} title={`${item.name} — ${item.data.join(', ')}`}><Name id={item.id} name={item.name} /></li>)}
      </ul>
      <p className="cx-foot">Forge reads your data and never writes to these services.</p>
    </section>
  </div>;
}
