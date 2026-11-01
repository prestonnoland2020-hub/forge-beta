import { useEffect, useMemo, useRef, useState } from 'react';
import { DialField } from './NumberDial';
import { useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import { syncedProvider, type CardioLogDraft } from '../lib/cardioSession';
import { parseCardioDescription, parseCircuitDescription, circuitSummary, statedTotals, fillToTotals, fillToWatch, type ParsedCardioRow, type ParsedCircuit } from '../lib/cardioParse';
import { cardioClass } from '../features/training/stravaImportService';
import { requestCardioParse } from '../features/training/coachService';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { cardioPlanSummary, type PlannedCardio } from './CardioPlanBuilder';

/* ONE BOX, THEN THE RESULT. The athlete says what they did in their own words
   and Forge reads it into the fields — activity, distance, time, pace, the
   intervals, a circuit's rounds and stations — and shows them on the entry so
   anything misread is one Edit away. Typing rows by hand is still there, a
   link under the box, for anyone who would rather.

   A session the watch already synced sits above the box as its own card. It is
   on the day already; the athlete confirms it or describes it, and whatever
   they describe is written ONTO that session, never beside it, so the run is
   never counted twice.

   Everything is still stored as `prescription.legacyIntervals`, the same shape
   the legacy Sheets import writes, so miles, pace, and the endurance insights
   read new entries and imported history through one code path. */

export type CardioLine = { id: number; cardioType: string; unit: string; distance: string; time: string };

const DISTANCE_UNITS = ['miles', 'km', 'meters', 'yards'];
const OTHER_UNITS = ['minutes', 'calories', 'reps', 'floors'];
const ALL_UNITS = [...DISTANCE_UNITS, ...OTHER_UNITS];
const STAPLE_TYPES = ['Run', 'Walk', 'Bike', 'Rowing', 'Swimming', 'Elliptical', 'Stair Climber', 'Jump Rope'];

const isDistanceUnit = (unit: string) => DISTANCE_UNITS.includes(String(unit || '').trim().toLowerCase());
/* A COUNT IS NOT A MISPLACED DISTANCE. "15 calories" and "20 reps" are a
   number on a count unit; repairing them like "2 minutes" turned a 15-calorie
   bike into 15 miles. Only a time unit is impossible for a distance. */
const isCountUnit = (unit: string) => ['calories', 'reps', 'floors'].includes(String(unit || '').trim().toLowerCase());
/* A distance measured in "minutes" converts to ZERO miles — it counts for
   nothing in weekly mileage, pace, or an endurance goal, while still looking
   logged. The pairing is impossible, so it is never stored: entering a
   distance against a time or count unit moves the unit to that activity's
   distance unit. */
/* A DEFAULT UNIT IS NOT A REPAIR UNIT. This returned 'minutes' for an
   elliptical or a stair climber, and it is also the function called to FIX a
   distance sitting on a time unit — so "3" on an elliptical was "repaired"
   from minutes to minutes, the distance silently became zero miles, and the
   select still displayed "miles" because the options list filters to distance
   units once a distance is typed. The athlete read three miles and the app
   stored none. `distanceUnitFor` never returns a time unit; `unitFor` keeps
   the sensible empty-line default. */
/* THE ATHLETE'S UNIT. A metric runner typing "5" logged five MILES unless
   they noticed the unit select, and every pace read /mi. The builder reads
   the profile's unit system once per render and defaults from it. */
let preferMetric = false;
const distanceUnitFor = (type: string) => {
  const value = type.trim().toLowerCase();
  if (/row|ski|erg/.test(value)) return 'meters';
  if (/swim/.test(value)) return preferMetric ? 'meters' : 'yards';
  return preferMetric ? 'km' : 'miles';
};
const paceText = (miles: number, minutes: number) => {
  if (!(miles > 0 && minutes > 0)) return '';
  return preferMetric ? `${minutesToClock(minutes / (miles * 1.609344))}\u00a0/km` : `${minutesToClock(minutes / miles)}\u00a0/mi`;
};
const unitFor = (type: string) => {
  const value = type.trim().toLowerCase();
  if (/elliptical|jump rope|stair/.test(value)) return 'minutes';
  return distanceUnitFor(type);
};

const toMiles = (distance: number, unit: string) => {
  const value = unit.trim().toLowerCase();
  if (value.startsWith('km') || value.includes('kilometer')) return distance / 1.609344;
  if (value.startsWith('meter')) return distance / 1609.344;
  if (value.startsWith('yard')) return distance / 1760;
  return value.startsWith('mile') ? distance : 0;
};

/* Accepts 28, 28:30, or 1:05:00 and returns decimal minutes — the unit the
   legacy rows and every downstream total already use. */
export const clockToMinutes = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(':').map(part => Number(part.trim()));
  if (parts.some(part => !Number.isFinite(part))) return 0;
  if (parts.length === 1) return Math.max(0, parts[0]);
  if (parts.length === 2) return Math.max(0, parts[0] + parts[1] / 60);
  return Math.max(0, parts[0] * 60 + parts[1] + parts[2] / 60);
};

const minutesToClock = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const total = Math.round(minutes * 60);
  const hours = Math.floor(total / 3600);
  const rest = total % 3600;
  const body = `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${body.padStart(5, '0')}` : body;
};

/* A PACE IN THE SPORT'S OWN TERMS. A rower reads a split per 500 m and a
   swimmer per 100; a 2,000 m row at "6:14 /mi" is a number nobody on an erg
   uses. Running, walking and riding keep per mile or per km. */
const sportPace = (activity: string, miles: number, minutes: number) => {
  if (!(miles > 0 && minutes > 0)) return '';
  if (/row|erg|ski/i.test(activity)) return `${minutesToClock(minutes / (miles * 1609.344 / 500))}\u00a0/500m`;
  if (/swim/i.test(activity)) return preferMetric ? `${minutesToClock(minutes / (miles * 1609.344 / 100))}\u00a0/100m` : `${minutesToClock(minutes / (miles * 1760 / 100))}\u00a0/100yd`;
  return paceText(miles, minutes);
};
const linePace = (line: CardioLine) => {
  const miles = toMiles(Number(line.distance) || 0, line.unit);
  const minutes = clockToMinutes(line.time);
  return sportPace(line.cardioType, miles, minutes);
};

const blankLine = (id: number, type = 'Run'): CardioLine => ({ id, cardioType: type, unit: unitFor(type), distance: '', time: '' });

const linesFromDraft = (draft: CardioLogDraft): CardioLine[] => {
  const rows = Array.isArray(draft.prescription.legacyIntervals) ? draft.prescription.legacyIntervals as Array<Record<string, unknown>> : [];
  if (!rows.length) return [blankLine(1, draft.activity || 'Run')];
  return rows.map((row, index) => ({
    id: index + 1,
    cardioType: String(row.cardioType || row.activity || draft.activity || 'Run'),
    unit: (() => { const stored = String(row.unit || row.distanceUnit || 'miles'); return Number(row.distance) > 0 && !isCountUnit(stored) && !isDistanceUnit(stored) ? distanceUnitFor(String(row.cardioType || row.activity || draft.activity || 'Run')) : stored; })(),
    distance: row.distance ? String(row.distance) : '',
    time: minutesToClock(Number(row.time) || 0),
  }));
};

const summarize = (lines: CardioLine[]) => {
  const filled = lines.filter(line => Number(line.distance) > 0 || clockToMinutes(line.time) > 0);
  if (!filled.length) return '';
  const minutes = filled.reduce((total, line) => total + clockToMinutes(line.time), 0);
  const distances = new Map<string, number>();
  filled.forEach(line => {
    const distance = Number(line.distance) || 0;
    if (distance) distances.set(line.unit, (distances.get(line.unit) || 0) + distance);
  });
  const types = Array.from(new Set(filled.map(line => line.cardioType.trim()).filter(Boolean)));
  const distanceText = [...distances].map(([unit, distance]) => `${Number(distance.toFixed(2))}\u00a0${Math.abs(distance) === 1 ? unit.replace(/s$/, '') : unit}`).join(' + ');
  const totalMiles = filled.reduce((total, line) => total + toMiles(Number(line.distance) || 0, line.unit), 0);
  const pace = paceText(totalMiles, minutes);
  const count = filled.length > 1 ? `${filled.length} lines` : '';
  return [types.join(' + '), distanceText, minutes ? minutesToClock(minutes) : '', pace, count].filter(Boolean).join(' · ');
};


/* What an entry holds, read back as the fields the box mapped it to. */
type EntryFacts = { lines: CardioLine[]; miles: number; minutes: number; distanceText: string; pace: string };
const factsOf = (entry: CardioLogDraft): EntryFacts => {
  const rows = Array.isArray(entry.prescription.legacyIntervals) ? linesFromDraft(entry).filter(line => Number(line.distance) > 0 || clockToMinutes(line.time) > 0) : [];
  const minutes = rows.reduce((total, line) => total + clockToMinutes(line.time), 0);
  const miles = rows.reduce((total, line) => total + toMiles(Number(line.distance) || 0, line.unit), 0);
  const byUnit = new Map<string, number>();
  rows.forEach(line => { const distance = Number(line.distance) || 0; if (distance) byUnit.set(line.unit, (byUnit.get(line.unit) || 0) + distance); });
  /* Mixed distance units add up to one number — a warmup in miles and repeats
     in meters is still one distance run — and counts stay beside it. */
  const distances = [...byUnit].filter(([unit]) => isDistanceUnit(unit));
  const counts = [...byUnit].filter(([unit]) => !distances.some(([distanceUnit]) => distanceUnit === unit)).map(([unit, value]) => `${Number(value.toFixed(2))} ${unitShort(unit)}`);
  const total = preferMetric ? miles * 1.609344 : miles;
  const distanceText = [distances.length > 1 ? `${Number(total.toFixed(2))} ${preferMetric ? 'km' : 'mi'}` : distances.map(([unit, distance]) => `${Number(distance.toFixed(2))} ${unitShort(unit)}`)[0] || '', ...counts].filter(Boolean).join(' + ');
  const sports = new Set(rows.map(line => cardioClass(line.cardioType)));
  return { lines: rows, miles, minutes, distanceText, pace: sports.size === 1 ? sportPace(rows[0].cardioType, miles, minutes) : paceText(miles, minutes) };
};
const unitShort = (unit: string) => ({ miles: 'mi', km: 'km', meters: 'm', yards: 'yd', minutes: 'min', calories: 'cal', reps: 'reps', floors: 'floors', seconds: 's' } as Record<string, string>)[unit] || unit;

type CircuitStation = { name: string; value: string; unit: string };
type CircuitDraft = { rounds: string; time: string; format: string; stations: CircuitStation[]; note: string };
const STATION_UNITS = ['reps', 'calories', 'meters', 'km', 'miles', 'yards', 'seconds', 'minutes'];

/* A circuit entry, from its rounds, stations and clock. The clock and the
   running distance ride in one legacy line so totals read it like any other
   session; the stations keep the shape a planned circuit logs with. */
const circuitEntry = (base: { id: string; activity: string; prescription?: Record<string, unknown> }, circuit: ParsedCircuit, note: string, keepMiles = 0): CardioLogDraft => {
  const runMiles = Number(((circuit.stations.filter(station => /^run/i.test(station.name)).reduce((total, station) => total + toMiles(station.value, station.unit), 0) * Math.max(1, circuit.rounds)) || keepMiles).toFixed(2));
  const minutes = Number((circuit.minutes || 0).toFixed(2));
  const summary = `${circuitSummary(circuit)}${minutes ? ` · ${minutesToClock(minutes)}` : ''}`;
  return {
    id: base.id,
    structure: 'circuit',
    activity: base.activity,
    summary,
    prescription: {
      ...(base.prescription || {}),
      rounds: circuit.rounds,
      format: circuit.format || 'For time',
      legacyIntervals: minutes || runMiles ? [{ cardioType: base.activity, distance: runMiles, unit: 'miles', time: minutes }] : undefined,
      distanceUnit: 'miles',
      note: note.trim() || undefined,
    },
    circuitStations: circuit.stations.map(station => ({ name: station.name, value: String(station.value), unit: station.unit })),
  };
};

const linesFromRows = (rows: ParsedCardioRow[]): CardioLine[] => rows.map((row, index) => ({
  id: Date.now() + index,
  cardioType: row.cardioType,
  unit: Number(row.distance) > 0 && !isCountUnit(row.unit) && !isDistanceUnit(row.unit) ? distanceUnitFor(row.cardioType) : row.unit,
  distance: row.distance ? String(row.distance) : '',
  time: minutesToClock(row.timeMinutes),
}));

/* A steady or interval entry from rows. `base` is the entry being replaced —
   a synced session keeps its id, which is what stops the importer writing it
   again, and keeps what it knew about itself. */
const linesEntry = (lines: CardioLine[], note: string, base?: CardioLogDraft, extra: Record<string, unknown> = {}): CardioLogDraft | null => {
  const filled = lines.filter(line => Number(line.distance) > 0 || clockToMinutes(line.time) > 0);
  if (!filled.length) return null;
  const legacyIntervals = filled.map(line => ({ cardioType: line.cardioType.trim() || 'Cardio', unit: line.unit, distance: Number(line.distance) || 0, time: clockToMinutes(line.time) }));
  const { rounds: _rounds, format: _format, ...kept } = (base?.prescription || {}) as Record<string, unknown>;
  return {
    id: base?.id || crypto.randomUUID(),
    structure: 'steady',
    activity: legacyIntervals[0].cardioType,
    summary: summarize(filled),
    prescription: { ...kept, ...extra, legacyIntervals, distanceUnit: legacyIntervals[0].unit, note: note.trim() || undefined },
  };
};

const WatchIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6V3h6v3M9 18v3h6v-3M12 9.5V12l1.5 1.5" /></svg>;
const SparkIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /><circle cx="12" cy="12" r="4" /></svg>;

/* THE FIELDS, NOT JUST A SENTENCE. An entry used to read back as one line of
   summary text, so a misread — 6 × 400 logged as 6 miles — was a number buried
   in a string. Each entry now shows what Forge mapped it to: the totals, every
   interval line, a circuit's rounds and stations. */
function EntryBreakdown({ entry }: { entry: CardioLogDraft }) {
  const facts = factsOf(entry);
  const stations = entry.circuitStations || [];
  const isCircuit = entry.structure === 'circuit' || stations.length > 0;
  const rounds = Number(entry.prescription.rounds) || 0;
  const format = String(entry.prescription.format || '');
  const tiles = (isCircuit
    ? [[format === 'EMOM' || format === 'AMRAP' ? format : 'Rounds', format === 'EMOM' || format === 'AMRAP' ? (rounds ? `${rounds} rds` : '—') : rounds ? String(rounds) : '—'], ['Time', facts.minutes ? minutesToClock(facts.minutes) : '—'], ['Run', facts.miles >= 0.01 ? `${Number((preferMetric ? facts.miles * 1.609344 : facts.miles).toFixed(2))} ${preferMetric ? 'km' : 'mi'}` : '—']]
    : [['Distance', facts.distanceText || '—'], ['Time', facts.minutes ? minutesToClock(facts.minutes) : '—'], ['Pace', facts.pace || '—']]) as Array<[string, string]>;
  return <div className="cardio-entry-breakdown">
    <dl className="cardio-entry-facts">{tiles.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {isCircuit && stations.length > 0 && <ol className="cardio-entry-lines">{stations.map((station, index) => <li key={`${station.name}-${index}`}><span>{station.name}</span><b>{station.value} {unitShort(station.unit)}</b></li>)}</ol>}
    {!isCircuit && facts.lines.length > 1 && <ol className="cardio-entry-lines">{facts.lines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')} · {line.cardioType}</span><b>{[line.distance ? `${line.distance} ${unitShort(line.unit)}` : '', line.time, linePace(line)].filter(Boolean).join(' · ')}</b></li>)}</ol>}
    {isCircuit && !facts.minutes && <small className="cardio-entry-ask">Add your time with Edit — a circuit with no clock counts as 0 minutes.</small>}
  </div>;
}

export function CardioBuilder({ onEntriesChange, initialOpen = false, initialEntries = [], plannedSummary, plannedCircuit }: {
  onEntriesChange?: (hasEntries: boolean, entries: CardioLogDraft[]) => void;
  initialOpen?: boolean;
  initialEntries?: CardioLogDraft[];
  plannedSummary?: string;
  /* A circuit Forge prescribed for today (a HYROX day): its segments are
     listed with their paces and loads, and one tap logs it as done. */
  plannedCircuit?: { name: string; plan: PlannedCardio };
} = {}) {
  const { setup: athleteSetup } = useProfileSetup();
  preferMetric = athleteSetup?.units === 'Metric';
  const { exercises, workouts } = useTrainingLibrary();
  const [savedEntries, setSavedEntries] = useState<CardioLogDraft[]>(initialEntries);
  /* Circuits and saved cardio workouts log in one tap: the library template
     becomes a completed entry (stations preserved), editable like any other. */
  const savedTemplates = useMemo(() => workouts.filter(workout => workout.kind === 'Circuit' || (workout.kind === 'Cardio' && workout.plan)), [workouts]);
  const [showTemplates, setShowTemplates] = useState(false);
  const logTemplate = (workout: typeof workouts[number]) => {
    const plan = workout.plan as { stationEntries?: Array<{ name: string; target: string; unit: string }> } | undefined;
    const id = crypto.randomUUID();
    setSavedEntries(items => [...items, {
      id,
      structure: workout.kind === 'Circuit' ? 'circuit' : 'steady',
      activity: workout.name,
      summary: workout.summary || workout.name,
      prescription: {},
      circuitStations: plan?.stationEntries?.map(station => ({ name: station.name, value: station.target, unit: station.unit })),
    }]);
    setShowTemplates(false);
    setJustLogged(id);
  };
  /* The time is the result. A simulation's clock is what the HYROX goal
     card reads as evidence, and a circuit draft with no time is worth zero
     minutes to it — so the time is asked for here, before the tap, not
     hidden behind Edit. Stored as one legacy line so the totals helpers read
     it the way they read every other session. */
  const [plannedTime, setPlannedTime] = useState('');
  const plannedMinutes = clockToMinutes(plannedTime);
  const logPlannedCircuit = () => {
    if (!plannedCircuit) return;
    const { name, plan } = plannedCircuit;
    const runMiles = Number(((plan.stationEntries || []).filter(station => station.name === 'Run').reduce((total, station) => total + toMiles(Number(station.target) || 0, station.unit), 0)).toFixed(2));
    const minutes = Number(plannedMinutes.toFixed(2));
    setSavedEntries(items => [...items, {
      id: crypto.randomUUID(),
      structure: 'circuit',
      activity: plan.activity === 'HYROX' ? 'HYROX' : name,
      summary: `${name} · ${plan.customTarget || cardioPlanSummary(plan)}${minutes ? ` · ${minutesToClock(minutes)}` : ''}`,
      prescription: { plannedMinutes: plan.duration || '', format: plan.circuitFormat || 'For time', ...(minutes ? { legacyIntervals: [{ cardioType: plan.activity === 'HYROX' ? 'HYROX' : name, distance: runMiles, unit: 'miles', time: minutes }] } : {}) },
      circuitStations: (plan.stationEntries || []).map(station => ({ name: station.name, value: station.target, unit: station.unit })),
    }]);
    setPlannedTime('');
  };

  /* One editor at a time: rows typed by hand (a new entry, or correcting a
     steady or interval one), or a circuit's rounds and stations. */
  const [editor, setEditor] = useState<null | { kind: 'lines' | 'circuit'; id: string | null }>(null);
  const [lines, setLines] = useState<CardioLine[]>([blankLine(1)]);
  const [note, setNote] = useState('');
  const [circuitDraft, setCircuitDraft] = useState<CircuitDraft>({ rounds: '', time: '', format: 'For time', stations: [], note: '' });
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReflection, setAiReflection] = useState('');
  const [aiSource, setAiSource] = useState<'ai' | 'local' | ''>('');
  /* The synced session the box is describing, when it is. */
  const [describing, setDescribing] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const aiInput = useRef<HTMLTextAreaElement>(null);
  /* "＋ Add a session" from the finished-day card lands here: the box is the
     way in, so it takes the focus. */
  useEffect(() => { if (initialOpen) aiInput.current?.focus({ preventScroll: true }); }, [initialOpen]);

  /* History loads asynchronously, so the day's saved sessions can arrive after
     this mounts. Adopt them once rather than sitting empty over a day that
     already has cardio on it. */
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !initialEntries.length) return;
    adopted.current = true;
    setSavedEntries(current => current.length ? current : initialEntries);
  }, [initialEntries]);
  useEffect(() => onEntriesChange?.(savedEntries.length > 0, savedEntries), [savedEntries, onEntriesChange]);

  const typeOptions = useMemo(() => {
    const fromLibrary = exercises.filter(exercise => exercise.enabled && exercise.kind === 'Cardio').map(exercise => exercise.name);
    return Array.from(new Set([...STAPLE_TYPES, ...fromLibrary]));
  }, [exercises]);

  const synced = savedEntries.filter(entry => syncedProvider(entry));
  const manual = savedEntries.filter(entry => !syncedProvider(entry));
  const describedEntry = describing ? savedEntries.find(entry => entry.id === describing) : undefined;

  const updateLine = (id: number, change: Partial<CardioLine>) => setLines(current => current.map(line => line.id === id ? { ...line, ...change } : line));
  /* Correcting the activity on a line that already has a distance keeps that
     distance measurable: it moves to the new activity's DISTANCE unit, never
     to a time unit. Retyping "Run" as "Stair Climber" used to turn 3 miles
     into nothing, with no warning. */
  const changeType = (id: number, cardioType: string) => setLines(current => current.map(line => line.id === id
    ? { ...line, cardioType, unit: Number(line.distance) > 0 ? distanceUnitFor(cardioType) : unitFor(cardioType) }
    : line));
  const addLine = () => setLines(current => {
    const last = current[current.length - 1];
    return [...current, { id: Date.now(), cardioType: last?.cardioType || 'Run', unit: last?.unit || 'miles', distance: last?.distance || '', time: '' }];
  });
  const removeLine = (id: number) => setLines(current => current.length > 1 ? current.filter(line => line.id !== id) : current);

  const closeEditor = () => { setLines([blankLine(1)]); setNote(''); setEditor(null); };
  const startManual = () => { setLines([blankLine(1)]); setNote(''); setEditor({ kind: 'lines', id: null }); setDescribing(null); };
  const replaceEntry = (draft: CardioLogDraft) => setSavedEntries(items => items.some(item => item.id === draft.id) ? items.map(item => item.id === draft.id ? draft : item) : [...items, draft]);

  const editEntry = (entry: CardioLogDraft) => {
    setDescribing(null);
    if (entry.structure === 'circuit' || entry.circuitStations?.length) {
      const facts = factsOf(entry);
      setCircuitDraft({ rounds: entry.prescription.rounds ? String(entry.prescription.rounds) : '', time: facts.minutes ? minutesToClock(facts.minutes) : '', format: String(entry.prescription.format || 'For time'), stations: (entry.circuitStations || []).map(station => ({ ...station })), note: String(entry.prescription.note || '') });
      setEditor({ kind: 'circuit', id: entry.id });
      return;
    }
    setLines(linesFromDraft(entry));
    setNote(String(entry.prescription.note || ''));
    setEditor({ kind: 'lines', id: entry.id });
  };
  const removeEntry = (id: string) => { setSavedEntries(items => items.filter(item => item.id !== id)); if (describing === id) setDescribing(null); if (editor?.id === id) closeEditor(); };
  const confirmSynced = (entry: CardioLogDraft) => replaceEntry({ ...entry, prescription: { ...entry.prescription, confirmed: true } });
  const describeSynced = (entry: CardioLogDraft) => { setEditor(null); setDescribing(entry.id); setAiReflection(''); aiInput.current?.focus(); };

  /* A typed session that is the watch's session over again. Same sport, same
     day, and either the distance or the time agree — the same test the
     importer uses to decide a hand log and a watch record are one run. */
  const matchingSynced = (rows: ParsedCardioRow[]) => {
    const kind = cardioClass(rows[0]?.cardioType || '');
    const miles = rows.reduce((total, row) => total + toMiles(Number(row.distance) || 0, row.unit), 0);
    const minutes = rows.reduce((total, row) => total + (Number(row.timeMinutes) || 0), 0);
    return synced.find(entry => {
      if (cardioClass(entry.activity) !== kind) return false;
      const facts = factsOf(entry);
      return (miles > 0 && facts.miles > 0 && Math.abs(miles - facts.miles) <= 0.5) || (minutes > 0 && facts.minutes > 0 && Math.abs(minutes - facts.minutes) <= 2);
    });
  };

  /* The AI box: describe the workout, Forge maps it to fields and logs it. */
  const logWithAi = async () => {
    const description = aiText.trim();
    if (!description || aiBusy) return;
    setAiBusy(true); setAiReflection('');
    let target = describedEntry;
    const watch = target ? factsOf(target) : null;
    const finish = (draft: CardioLogDraft, reflection: string, source: 'ai' | 'local') => {
      replaceEntry(draft);
      setAiText(''); setDescribing(null); setJustLogged(draft.id);
      setAiReflection(reflection); setAiSource(source); setAiBusy(false);
    };
    /* What the watch knew about itself survives the description: where it came
       from, the totals it measured, and that the athlete has now spoken for it. */
    const syncedExtra = (entry: CardioLogDraft | undefined) => entry ? { confirmed: true, description, syncedFrom: entry.prescription.syncedFrom || { summary: entry.summary, activity: entry.activity, note: entry.prescription.note } } : {};
    /* ROUNDS ARE A CIRCUIT. "3 rounds of 500m row, 20 WB, 15 cal bike in 11
       mins" is logged the way a planned circuit is: its stations, its rounds,
       and one clock for the whole thing. Read deterministically first, so it
       never depends on the model squeezing calories and reps into distance
       rows; the model's own circuit is used when the reader cannot. */
    let circuit = parseCircuitDescription(description);
    let rows: ParsedCardioRow[] = [];
    let parsedNote = '';
    let reflection = '';
    let source: 'ai' | 'local' = 'local';
    if (!circuit) {
      const local = parseCardioDescription(description);
      const parsed = await requestCardioParse(description, { savedCardioTypes: typeOptions, plannedToday: plannedSummary || null, syncedActivity: target && watch ? { activity: target.activity, miles: Number(watch.miles.toFixed(2)), minutes: Number(watch.minutes.toFixed(1)) } : null }, local);
      source = parsed.source; parsedNote = parsed.note; reflection = parsed.reflection;
      circuit = parsed.circuit || null;
      if (!circuit) {
        const parsedRows = parsed.rows.filter(row => Number(row.distance) > 0 || Number(row.timeMinutes) > 0);
        /* THE MODEL MAY NOT DELETE A DISTANCE THE ATHLETE TYPED. It returned
           "Run · 20:00" with distance 0 for a run that was 2.1 miles — a run
           worth zero miles to mileage, pace and every race goal. The local
           reader reads the same sentence deterministically, so when it finds
           distance and the model returned none, the model is overruled. */
        const aiDistance = parsedRows.reduce((total, row) => total + (Number(row.distance) || 0), 0);
        const localDistance = local.rows.reduce((total, row) => total + (Number(row.distance) || 0), 0);
        const recoveredDistance = aiDistance === 0 && localDistance > 0;
        const sourceRows = recoveredDistance && local.rows.length === parsedRows.length
          ? parsedRows.map((row, index) => ({ ...row, distance: local.rows[index].distance, unit: local.rows[index].unit }))
          : recoveredDistance ? local.rows : parsedRows;
        if (recoveredDistance) reflection = `${reflection} (Distance read from your words — the logger had left it blank.)`.trim();
        /* A stated total ('1.65 miles 11:00 total') fills in what the rows left out. */
        rows = fillToTotals(sourceRows, statedTotals(description));
      }
    }
    if (circuit) {
      if (target && watch && !circuit.minutes && watch.minutes) circuit = { ...circuit, minutes: watch.minutes };
      const draft = circuitEntry({ id: target?.id || crypto.randomUUID(), activity: target ? target.activity : 'Circuit', prescription: target ? { ...target.prescription, ...syncedExtra(target) } : undefined }, circuit, parsedNote || note, watch?.miles || 0);
      finish(draft, `Logged as ${draft.summary}.${circuit.minutes ? '' : ' Add the time with Edit if you have it.'}`, source);
      return;
    }
    /* NO NUMBERS, NOTHING TO LOG — unless there is a watch session to say it
       about. "Felt flat, treadmill" is a note on the run the watch recorded. */
    if (!rows.length) {
      if (target) { finish({ ...target, prescription: { ...target.prescription, ...syncedExtra(target), note: description } }, `Added to your ${syncedProvider(target)} session as a note.`, source); return; }
      setAiReflection(reflection || 'Could not read a distance or time from that — add numbers like “4 miles in 32:10” or “6x400m”.'); setAiSource(source); setAiBusy(false);
      return;
    }
    /* THE SAME RUN TWICE IS ONE RUN. A Strava run already on the day and the
       athlete typing "3 mile run in 26 min" are the same session; the typing
       becomes detail on the synced one instead of a second entry. */
    let matched = false;
    if (!target) { const match = matchingSynced(rows); if (match) { target = match; matched = true; } }
    if (target) {
      const watchFacts = factsOf(target);
      const provider = syncedProvider(target);
      /* A RESTATEMENT IS NOT A CORRECTION. "Ran 3 miles in 26:30" over a watch
         run of 3.12 in 26:40 is the athlete rounding the same run; the watch
         measured it, so its numbers stand and the words become the note. */
      const rowMiles = rows.reduce((total, row) => total + toMiles(Number(row.distance) || 0, row.unit), 0);
      const rowMinutes = rows.reduce((total, row) => total + (Number(row.timeMinutes) || 0), 0);
      const restated = rows.length === 1 && (!rowMiles || Math.abs(rowMiles - watchFacts.miles) <= 0.5) && (!rowMinutes || Math.abs(rowMinutes - watchFacts.minutes) <= 2) && cardioClass(rows[0].cardioType) === cardioClass(target.activity);
      if (restated) {
        finish({ ...target, prescription: { ...target.prescription, ...syncedExtra(target), note: parsedNote || description } }, `That’s your ${provider} ${target.activity.toLowerCase()} — its measured ${[watchFacts.distanceText, watchFacts.minutes ? minutesToClock(watchFacts.minutes) : ''].filter(Boolean).join(' in ')} stands, and your words are saved as its note. Use Edit to change a number.`, source);
        return;
      }
      const filled = fillToWatch(rows, { miles: watchFacts.miles, minutes: watchFacts.minutes });
      const draft = linesEntry(linesFromRows(filled.rows), parsedNote || description, target, syncedExtra(target));
      if (!draft) { setAiBusy(false); return; }
      const remainder = filled.added ? ` The rest of what ${provider} recorded — ${[filled.added.distance ? `${filled.added.distance} mi` : '', filled.added.timeMinutes ? minutesToClock(filled.added.timeMinutes) : ''].filter(Boolean).join(' in ')} — stays on as one more line (warmup, recoveries, cooldown).` : '';
      finish(draft, `${matched ? `That matches your ${provider} ${target.activity.toLowerCase()}, so the detail went onto it instead of logging it twice. ` : ''}${draft.summary}.${remainder}`, source);
      return;
    }
    const draft = linesEntry(linesFromRows(rows), parsedNote || note);
    if (!draft) { setAiBusy(false); return; }
    finish(draft, reflection || `Logged ${draft.summary}.`, source);
  };

  const editingEntry = editor?.id ? savedEntries.find(entry => entry.id === editor.id) : undefined;
  const summary = summarize(lines);
  /* A run with a time but no distance is worth zero miles to weekly mileage,
     pace, and every endurance goal — and it looks logged. The AI logger did
     exactly this ("Run · 20:00"), so the gap is named rather than left to be
     discovered in a mileage total that quietly stops moving. */
  const milelessRuns = lines.filter(line => /run|jog|walk/i.test(line.cardioType) && clockToMinutes(line.time) > 0 && !(Number(line.distance) > 0)).length;
  const saveLines = () => {
    const draft = linesEntry(lines, note, editingEntry);
    if (!draft) return;
    replaceEntry(draft); setJustLogged(draft.id); closeEditor();
  };
  const saveCircuit = () => {
    if (!editingEntry) return;
    const stations = circuitDraft.stations.filter(station => station.name.trim() && Number(station.value) > 0).map(station => ({ name: station.name.trim(), value: Number(station.value), unit: station.unit }));
    if (!stations.length) return;
    const circuit: ParsedCircuit = { rounds: Number(circuitDraft.rounds) || 0, stations, minutes: clockToMinutes(circuitDraft.time), format: (['EMOM', 'AMRAP'].includes(circuitDraft.format) ? circuitDraft.format : 'For time') as ParsedCircuit['format'] };
    const draft = circuitEntry(editingEntry, circuit, circuitDraft.note, factsOf(editingEntry).miles);
    replaceEntry(draft); setJustLogged(draft.id); setEditor(null);
  };
  const updateStation = (index: number, change: Partial<CircuitStation>) => setCircuitDraft(current => ({ ...current, stations: current.stations.map((station, at) => at === index ? { ...station, ...change } : station) }));

  const entryActions = (entry: CardioLogDraft) => <div className="cardio-entry-actions">
    <button type="button" onClick={() => editEntry(entry)}>Edit</button>
    <button type="button" onClick={() => removeEntry(entry.id)}>Remove</button>
  </div>;

  const linesEditor = <div className="cardio-log-composer">
    <datalist id="cardio-type-options">{typeOptions.map(option => <option value={option} key={option} />)}</datalist>
    <div className="cardio-log-lines">
      {lines.map((line, index) => <div className="cardio-log-line" key={line.id}>
        <label className="cardio-log-type"><span className="cardio-log-label">Type</span>
          <input list="cardio-type-options" value={line.cardioType} onChange={event => changeType(line.id, event.target.value)} placeholder="Run" />
        </label>
        <div className="cardio-log-distance">
          <DialField label="Distance" kind="distance" unit={line.unit} value={line.distance}
            onChange={next => updateLine(line.id, Number(next) > 0 && !isCountUnit(line.unit) && !isDistanceUnit(line.unit) ? { distance: next, unit: distanceUnitFor(line.cardioType) } : { distance: next })} />
        </div>
        <label className="cardio-log-unit"><span className="cardio-log-label">Unit</span>
          <select value={line.unit} onChange={event => updateLine(line.id, { unit: event.target.value })}>
            {(Number(line.distance) > 0 ? DISTANCE_UNITS : ALL_UNITS).map(unit => <option value={unit} key={unit}>{unit}</option>)}
          </select>
        </label>
        <div className="cardio-log-time">
          <DialField label="Time" kind="clock" value={line.time} onChange={next => updateLine(line.id, { time: next })} placeholder="0:00" />
        </div>
        {(linePace(line) || lines.length > 1) && <div className="cardio-log-line-end">
          {linePace(line) && <em>{linePace(line)}</em>}
          {lines.length > 1 && <button type="button" onClick={() => removeLine(line.id)} aria-label={`Remove line ${index + 1}`}>×</button>}
        </div>}
      </div>)}
    </div>
    <button type="button" className="cardio-log-add-line" onClick={addLine}>＋ Add line</button>
    <label className="cardio-log-note"><span className="field-caption">NOTE</span>
      <input value={note} onChange={event => setNote(event.target.value)} placeholder="Optional — how it felt, route, treadmill, weather" />
    </label>
    {summary && <p className="cardio-log-summary">{summary}</p>}
    {milelessRuns > 0 && <p className="cardio-log-warning" role="status">Add a distance — without one {milelessRuns > 1 ? 'these runs count' : 'this run counts'} as 0 miles toward your weekly mileage, pace, and race goals.</p>}
    <div className="cardio-log-actions">
      <button type="button" className="button" disabled={!summary} onClick={saveLines}>{editor?.id ? 'Save changes' : 'Save cardio'}</button>
      <button type="button" className="button ghost" onClick={closeEditor}>Cancel</button>
    </div>
  </div>;

  const circuitEditor = <div className="cardio-log-composer cardio-circuit-editor">
    <div className="cardio-circuit-head">
      <label>Format<select value={circuitDraft.format} onChange={event => setCircuitDraft(current => ({ ...current, format: event.target.value }))}>{['For time', 'EMOM', 'AMRAP'].map(option => <option key={option}>{option}</option>)}</select></label>
      <label>Rounds<input inputMode="numeric" value={circuitDraft.rounds} onChange={event => setCircuitDraft(current => ({ ...current, rounds: event.target.value.replace(/[^\d]/g, '') }))} placeholder="3" /></label>
      <label>Time<input inputMode="numeric" value={circuitDraft.time} onChange={event => setCircuitDraft(current => ({ ...current, time: event.target.value }))} placeholder="mm:ss" /></label>
    </div>
    <div className="cardio-circuit-stations">
      <span className="field-caption">STATIONS · EACH ROUND</span>
      {circuitDraft.stations.map((station, index) => <div className="cardio-circuit-station" key={index}>
        <input aria-label={`Station ${index + 1}`} value={station.name} onChange={event => updateStation(index, { name: event.target.value })} placeholder="Wall Balls" />
        <input aria-label={`Station ${index + 1} amount`} inputMode="decimal" value={station.value} onChange={event => updateStation(index, { value: event.target.value })} placeholder="20" />
        <select aria-label={`Station ${index + 1} unit`} value={station.unit} onChange={event => updateStation(index, { unit: event.target.value })}>{STATION_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select>
        <button type="button" onClick={() => setCircuitDraft(current => ({ ...current, stations: current.stations.filter((_, at) => at !== index) }))} aria-label={`Remove station ${index + 1}`}>×</button>
      </div>)}
      <button type="button" className="cardio-log-add-line" onClick={() => setCircuitDraft(current => ({ ...current, stations: [...current.stations, { name: '', value: '', unit: 'reps' }] }))}>＋ Add station</button>
    </div>
    <label className="cardio-log-note"><span className="field-caption">NOTE</span>
      <input value={circuitDraft.note} onChange={event => setCircuitDraft(current => ({ ...current, note: event.target.value }))} placeholder="Optional — loads, how it felt" />
    </label>
    <div className="cardio-log-actions">
      <button type="button" className="button" disabled={!circuitDraft.stations.some(station => station.name.trim() && Number(station.value) > 0)} onClick={saveCircuit}>Save changes</button>
      <button type="button" className="button ghost" onClick={() => setEditor(null)}>Cancel</button>
    </div>
  </div>;

  const editorFor = (entry: CardioLogDraft) => editor?.id === entry.id ? (editor.kind === 'circuit' ? circuitEditor : linesEditor) : null;

  return <section className="card form-card cardio-log">
    <div className="section-title compact-title">
      <div><h3>Cardio</h3></div>
    </div>

    {/* THE WATCH GOES FIRST. What Strava or Garmin recorded is already on the
        day; the card says so, and the athlete either confirms it or describes
        it — the description lands on this session, not next to it. */}
    {synced.map(entry => {
      const provider = syncedProvider(entry) || 'Your watch';
      const confirmed = Boolean(entry.prescription.confirmed);
      const syncedFrom = entry.prescription.syncedFrom as { note?: unknown; summary?: unknown } | undefined;
      const watchName = String(syncedFrom?.note ?? entry.prescription.note ?? '').replace(/^(Strava|Garmin):\s*/, '').replace(/^Imported from \w+$/, '');
      const ownNote = syncedFrom && entry.prescription.note !== syncedFrom.note ? String(entry.prescription.note || '') : '';
      return <article className={`cardio-synced${confirmed ? ' confirmed' : ''}${describing === entry.id ? ' describing' : ''}${justLogged === entry.id ? ' just-logged' : ''}`} key={entry.id}>
        <header>
          <span className="cardio-synced-badge"><WatchIcon />FROM {provider.toUpperCase()}</span>
          {confirmed ? <span className="cardio-synced-state">✓ On today</span> : <span className="cardio-synced-state pending">Synced · check it</span>}
        </header>
        <div className="cardio-synced-title"><strong>{entry.activity}</strong>{watchName && <small>{watchName}</small>}</div>
        {editor?.id !== entry.id && <EntryBreakdown entry={entry} />}
        {ownNote && editor?.id !== entry.id && <p className="cardio-entry-note">{ownNote}</p>}
        {editorFor(entry) || <footer>
          {!confirmed && <button type="button" className="button small-button" onClick={() => confirmSynced(entry)}>Looks right</button>}
          <button type="button" className={`button small-button${confirmed ? '' : ' ghost'}`} onClick={() => describeSynced(entry)}>{entry.prescription.description ? 'Describe again' : 'Describe it'}</button>
          {entryActions(entry)}
        </footer>}
      </article>;
    })}

    {manual.length > 0 && <div className="cardio-log-saved">
      {manual.map(entry => <article className={`cardio-entry${justLogged === entry.id ? ' just-logged' : ''}`} key={entry.id}>
        {/* The fields below say what the summary line used to; the head names
            the session, and a template with no numbers yet keeps its summary. */}
        <div className="cardio-entry-head"><strong>{entry.activity || 'Cardio'}</strong>{!factsOf(entry).lines.length && !entry.circuitStations?.length && <small>{entry.summary}</small>}{editor?.id !== entry.id && entryActions(entry)}</div>
        {editorFor(entry) || <>
          <EntryBreakdown entry={entry} />
          {entry.prescription.note ? <small className="cardio-entry-note">{String(entry.prescription.note)}</small> : null}
        </>}
      </article>)}
    </div>}

    {!editingEntry && (plannedCircuit && plannedCircuit.plan.stationEntries?.length ? <div className="cardio-log-planned-circuit">
      <p className="cardio-log-planned"><span>PLANNED</span>{plannedCircuit.name}</p>
      <ol>{plannedCircuit.plan.stationEntries.map(station => <li key={station.id}><strong>{station.name}</strong><span>{station.target} {station.unit === 'meters' ? 'm' : station.unit}{station.pace ? ` @ ${station.pace}` : ''}{station.load ? ` · ${station.load}` : ''}</span></li>)}</ol>
      <div className="cardio-planned-log-row"><label>Your time{plannedCircuit.plan.duration ? ` · about ${plannedCircuit.plan.duration} min` : ''}<input inputMode="numeric" placeholder="mm:ss" value={plannedTime} onChange={event => setPlannedTime(event.target.value)} /></label><button type="button" className="button secondary" onClick={logPlannedCircuit}>{plannedMinutes ? 'Log it' : 'Log without a time'}</button></div>
    </div> : plannedSummary && !savedEntries.length && <p className="cardio-log-planned"><span>PLANNED</span>{plannedSummary}</p>)}

    {!editingEntry && <div className={`cardio-ai-box${describedEntry ? ' describing' : ''}`}>
      <label className="cardio-ai-label" htmlFor="cardio-ai-text"><SparkIcon />{describedEntry ? `Describe your ${syncedProvider(describedEntry)} ${describedEntry.activity.toLowerCase()}` : synced.length || manual.length ? 'Anything else? Describe it' : 'Describe your cardio'}</label>
      {describedEntry && <p className="cardio-ai-target">Adding to <b>{describedEntry.summary}</b><button type="button" className="text-button" onClick={() => setDescribing(null)}>Cancel</button></p>}
      <textarea id="cardio-ai-text" ref={aiInput} rows={2} value={aiText} onChange={event => setAiText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); logWithAi(); } }}
        placeholder={describedEntry ? '“1 mi warmup, 6×400 at 90s with 2 min jog” — Forge keeps the watch’s totals' : '“4 mile run in 32:10”, “6x400m at 90s, 2 min jog” or “3 rounds: 500m row, 20 wall balls — 11:00”'} />
      <div className="cardio-ai-actions">
        <button type="button" className="button small-button" disabled={aiBusy || !aiText.trim()} onClick={logWithAi}>{aiBusy ? 'Reading…' : describedEntry ? 'Add detail' : 'Log it'}</button>
        <small>{describedEntry ? 'Updates that session — nothing is logged twice.' : 'Forge fills in the fields — check them on the entry.'}</small>
      </div>
      {aiReflection && <p className={`cardio-ai-reflection${aiSource === 'local' ? ' local' : ''}`} role="status"><b>{aiSource === 'ai' ? 'FORGE' : 'QUICK PARSE'}</b>{aiReflection}</p>}
    </div>}

    {editor?.kind === 'lines' && !editor.id && linesEditor}
    {!editor && <div className="cardio-log-links">
      <button type="button" className="text-button" onClick={startManual}>Add cardio by hand</button>
      {savedTemplates.length > 0 && <button type="button" className="text-button" aria-expanded={showTemplates} onClick={() => setShowTemplates(open => !open)}>Saved workouts</button>}
    </div>}
    {!editor && showTemplates && savedTemplates.length > 0 && <div className="cardio-template-row"><div>{savedTemplates.slice(0, 8).map(workout => <button type="button" key={workout.id} onClick={() => logTemplate(workout)}>{workout.name}</button>)}</div></div>}
  </section>;
}
