import { useEffect, useState } from 'react';
import { CATEGORY_LABELS, MEMORY_CATEGORIES, emptyFacts, guidedLine, type CoachMemoryFacts } from '../../supabase/functions/_shared/coachMemory';
import { coachMemoryChanged, deleteGuidedLift, deleteMemoryItem, editMemoryItem, loadCoachMemory, wipeCoachMemory } from '../features/training/coachMemoryService';

/* SETTINGS > WHAT THE COACH KNOWS ABOUT ME. Every remembered fact, in plain
   words, each one editable and deletable, and one button to wipe it all. */
export function CoachMemorySettings() {
  const [facts, setFacts] = useState<CoachMemoryFacts>(emptyFacts());
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const refresh = () => loadCoachMemory().then(next => { setFacts(next); setLoaded(true); }).catch(() => { setLoaded(true); setMessage('Couldn’t load what the coach knows. Try again in a moment.'); });
  useEffect(() => { void refresh(); const on = () => void refresh(); window.addEventListener(coachMemoryChanged, on); return () => window.removeEventListener(coachMemoryChanged, on); }, []);
  const run = async (job: Promise<CoachMemoryFacts>) => { setMessage(''); try { setFacts(await job); } catch (error) { setMessage(error instanceof Error ? error.message : 'Couldn’t save that.'); } };
  const lifts = Object.entries(facts.guided);
  const empty = loaded && !facts.items.length && !lifts.length;
  return <div className="stack-l coach-memory">
    <p className="coach-memory-lead">The coach remembers training facts you tell it and how your guided sets felt, so it can coach you like it knows you. Only you can see this. It never keeps medical details.</p>
    {empty && <p className="coach-memory-empty">Nothing yet. Tell the coach things like which days you train, what equipment you have, or lifts you hate, and they’ll show up here.</p>}
    {MEMORY_CATEGORIES.map(category => {
      const items = facts.items.filter(item => item.category === category);
      if (!items.length) return null;
      return <section key={category} aria-label={CATEGORY_LABELS[category]}><h3>{CATEGORY_LABELS[category]}</h3>
        <div className="simple-settings-list">
          {items.map(item => <div className="settings-row coach-memory-row" key={item.id}>
            {editing === item.id
              ? <input aria-label="Edit what the coach knows" value={draft} maxLength={140} onChange={event => setDraft(event.target.value)} autoFocus />
              : <div><strong>{item.text}</strong></div>}
            <div className="coach-memory-actions">
              {editing === item.id
                ? <><button type="button" onClick={() => { setEditing(null); void run(editMemoryItem(facts, item.id, draft)); }}>Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></>
                : <><button type="button" onClick={() => { setEditing(item.id); setDraft(item.text); }}>Edit</button><button type="button" aria-label={`Delete ${item.text}`} onClick={() => void run(deleteMemoryItem(facts, item.id))}>Delete</button></>}
            </div>
          </div>)}
        </div>
      </section>;
    })}
    {lifts.length > 0 && <section aria-label="How guided sets felt"><h3>How your guided sets felt</h3>
      <div className="simple-settings-list">
        {lifts.map(([lift, entry]) => <div className="settings-row coach-memory-row" key={lift}>
          <div><strong>{guidedLine(lift, entry)}</strong></div>
          <div className="coach-memory-actions"><button type="button" aria-label={`Delete ${lift}`} onClick={() => void run(deleteGuidedLift(facts, lift))}>Delete</button></div>
        </div>)}
      </div>
    </section>}
    {!empty && loaded && <div className="simple-settings-list"><button type="button" className="settings-sign-out" onClick={() => { if (window.confirm('Wipe everything the coach remembers about you? Your logs and plan stay.')) void run(wipeCoachMemory()); }}><div><strong>Wipe everything</strong><span>The coach starts fresh</span></div></button></div>}
    {message && <p className="connection-message" role="status">{message}</p>}
  </div>;
}
