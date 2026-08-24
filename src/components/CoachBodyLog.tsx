import { useEffect, useState } from 'react';
import { addDaysIso, createNote, defaultBufferDays, isBufferActive, needsFollowUp, type AthleteNote, type NoteFollowUp } from '../features/training/athleteNotesService';

/* The coach's body log: what the athlete has told Forge about pain, injury,
   and fatigue. Every entry carries a buffer window that recommendations and
   the AI coach train around, and daily check-ins keep it honest. */
const todayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const kindLabel: Record<AthleteNote['kind'], string> = { injury: 'Injury', fatigue: 'Fatigue', other: 'Limitation' };

export function CoachBodyLog({ notes, upsert, prefill, onPrefillConsumed }: {
  notes: AthleteNote[];
  upsert: (note: AthleteNote) => void;
  prefill?: { kind: AthleteNote['kind']; note: string } | null;
  onPrefillConsumed?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<AthleteNote['kind']>('injury');
  const [area, setArea] = useState('');
  const [text, setText] = useState('');
  const [bufferDays, setBufferDays] = useState<number>(defaultBufferDays('injury'));

  useEffect(() => {
    if (!prefill) return;
    setKind(prefill.kind); setText(prefill.note); setBufferDays(defaultBufferDays(prefill.kind));
    setAdding(true); onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  const active = notes.filter(note => note.status === 'active');
  const cleared = notes.filter(note => note.status === 'cleared').slice(0, 3);

  const save = () => {
    if (!text.trim()) return;
    upsert(createNote(kind, text, area, bufferDays));
    setAdding(false); setArea(''); setText('');
  };

  const checkIn = (note: AthleteNote, feeling: NoteFollowUp['feeling']) => {
    const followUps = [...note.followUps, { date: todayIso(), feeling }];
    /* Worse extends the buffer; two straight "better" days end it early. */
    let bufferUntil = note.bufferUntil;
    let status: AthleteNote['status'] = note.status;
    if (feeling === 'worse') bufferUntil = addDaysIso(todayIso(), defaultBufferDays(note.kind));
    const lastTwo = followUps.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every(item => item.feeling === 'better')) { status = 'cleared'; bufferUntil = todayIso(); }
    upsert({ ...note, followUps, bufferUntil, status });
  };

  return <section className="card body-log-card">
    <header className="body-log-head">
      <div><span className="eyebrow">COACH LEARNINGS</span><h3>Body log</h3></div>
      {!adding && <button type="button" className="button secondary small-button" onClick={() => { setKind('injury'); setBufferDays(defaultBufferDays('injury')); setAdding(true); }}>＋ Tell Forge</button>}
    </header>
    <p className="body-log-copy">Report an injury, unusual fatigue, or a limitation. Forge trains around it for the buffer window and checks back in.</p>

    {adding && <div className="body-log-form">
      <div className="body-log-form-row">
        <label>Type<select value={kind} onChange={event => { const next = event.target.value as AthleteNote['kind']; setKind(next); setBufferDays(defaultBufferDays(next)); }}>
          <option value="injury">Injury / pain</option><option value="fatigue">Fatigue</option><option value="other">Other limitation</option>
        </select></label>
        <label>Area <small>(optional)</small><input value={area} onChange={event => setArea(event.target.value)} placeholder="e.g. right knee" /></label>
      </div>
      <label>What happened<textarea rows={2} value={text} onChange={event => setText(event.target.value)} placeholder="e.g. Knee felt sharp on the last two squat sets" /></label>
      <label>Train around it for<div className="body-log-buffer">{[3, 7, 14, 21].map(days => <button type="button" key={days} className={bufferDays === days ? 'active' : ''} onClick={() => setBufferDays(days)}>{days} days</button>)}</div></label>
      <div className="button-row"><button type="button" className="button" disabled={!text.trim()} onClick={save}>Save to coach memory</button><button type="button" className="button ghost" onClick={() => setAdding(false)}>Cancel</button></div>
    </div>}

    {active.length > 0 && <div className="body-log-list">
      {active.map(note => <article className="body-log-note" key={note.id}>
        <header>
          <span className={`body-log-kind ${note.kind}`}>{kindLabel[note.kind]}</span>
          <strong>{note.area || kindLabel[note.kind]}</strong>
          {isBufferActive(note) && note.bufferUntil && <small>buffer through {formatDate(note.bufferUntil)}</small>}
          <button type="button" className="text-button" onClick={() => upsert({ ...note, status: 'cleared' })}>Clear</button>
        </header>
        <p>{note.note}</p>
        {needsFollowUp(note) ? <div className="body-log-followup">
          <span>How is it today?</span>
          <div>{(['better', 'same', 'worse'] as const).map(feeling => <button type="button" key={feeling} onClick={() => checkIn(note, feeling)}>{feeling === 'better' ? 'Better' : feeling === 'same' ? 'Same' : 'Worse'}</button>)}</div>
        </div> : note.followUps.length > 0 && <small className="body-log-last">Checked in {formatDate(note.followUps[note.followUps.length - 1].date)} · {note.followUps[note.followUps.length - 1].feeling}</small>}
      </article>)}
    </div>}
    {!active.length && !adding && <p className="body-log-empty">Nothing reported. Forge assumes you're training at full capacity.</p>}
    {cleared.length > 0 && <details className="body-log-history"><summary>Cleared ({cleared.length})</summary>{cleared.map(note => <p key={note.id}><b>{note.area || kindLabel[note.kind]}</b> · {note.note} · cleared</p>)}</details>}
  </section>;
}
