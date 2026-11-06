import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isDemoMode } from '../lib/env';

/* WHO IS ACTUALLY USING THIS.

   Eight accounts, three with a goal, five that have never logged a day — and
   no way to see any of that from inside the app. Every launch problem this
   month was visible in the database weeks before anyone looked and invisible
   everywhere else: goals that never reached the table, push subscriptions that
   had gone stale, athletes sitting in setup. A founder cannot fix what they
   cannot see.

   The server decides who may read this, not the router: forge_account_overview
   returns nothing at all to anyone but the owner, so the page renders empty for
   everybody else rather than announcing that a page exists to be guarded. */

type Row = {
  username: string | null; display_name: string | null; joined: string;
  onboarded: boolean; goals: number; days_logged: number; last_logged: string | null;
  weekly_miles: number | null; push_installs: number; push_last_delivered: string | null;
};

const ago = (iso: string | null) => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d`;
};

export function OwnerPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (isDemoMode) { setRows([]); return; }
    void supabase.rpc('forge_account_overview').then(({ data, error: reason }) => {
      if (reason) { setError(reason.message); setRows([]); return; }
      setRows((data || []) as Row[]);
    });
  }, []);

  if (rows === null) return <main className="page"><p className="empty-history">Loading…</p></main>;
  if (!rows.length) return <main className="page"><p className="empty-history">{error || 'Nothing to show here.'}</p></main>;

  const active = rows.filter(row => row.days_logged > 0);
  const withGoals = rows.filter(row => row.goals > 0);
  const reachable = rows.filter(row => row.push_installs > 0);

  return <div className="stack-xl owner-page">
    <section className="card">
      <header><span className="eyebrow">ACCOUNTS</span><h2>{rows.length} signed up</h2></header>
      {/* THE THREE NUMBERS THAT MATTERED. Signed up is vanity; logged a day is
          the product working, a goal is the program working, and a push install
          is whether Forge can reach them at all. */}
      <div className="owner-tiles">
        <div><span>LOGGED A DAY</span><strong>{active.length}</strong><small>of {rows.length}</small></div>
        <div><span>HAVE A GOAL</span><strong>{withGoals.length}</strong><small>of {rows.length}</small></div>
        <div><span>REACHABLE</span><strong>{reachable.length}</strong><small>push registered</small></div>
      </div>
    </section>
    <section className="card">
      <div className="library-table-scroll">
        <table className="library-table owner-table">
          <thead><tr><th>Athlete</th><th>Joined</th><th>Goals</th><th>Days</th><th>Last</th><th>mi/wk</th><th>Push</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.username || row.joined} className={row.days_logged ? '' : 'disabled'}>
            <td><strong>{row.display_name || row.username || '—'}</strong><small>{row.onboarded ? '' : 'still in setup'}</small></td>
            <td>{new Date(`${row.joined}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
            <td>{row.goals || <span className="owner-zero">0</span>}</td>
            <td>{row.days_logged || <span className="owner-zero">0</span>}</td>
            <td>{ago(row.last_logged)}</td>
            <td>{row.weekly_miles ? row.weekly_miles.toFixed(1) : '—'}</td>
            {/* A subscription registered but never delivering is the failure
                that took three weeks to find last time. */}
            <td>{!row.push_installs ? <span className="owner-zero">none</span>
              : row.push_last_delivered ? ago(row.push_last_delivered)
              : <span className="owner-zero">never arrived</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
