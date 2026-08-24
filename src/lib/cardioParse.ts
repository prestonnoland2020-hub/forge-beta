/* Deterministic fallback for the AI cardio box: turns a plain-language
   description into structured rows without a network call. The AI path is
   primary in live mode; this keeps demo mode and offline logging honest.
   It only extracts numbers the athlete actually typed — nothing is invented. */

export type ParsedCardioRow = { cardioType: string; distance: number; unit: string; timeMinutes: number };
export type ParsedCardio = { reflection: string; note: string; rows: ParsedCardioRow[] };

const ACTIVITY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(ran|run|running|jog|jogged|tempo|track|treadmill)\b/i, 'Run'],
  [/\b(walk|walked|walking|hike|hiked|ruck)\b/i, 'Walk'],
  [/\b(bike|biked|cycling|cycled|ride|rode|spin)\b/i, 'Bike'],
  [/\b(row|rowed|rowing|erg)\b/i, 'Rowing'],
  [/\b(swim|swam|swimming|laps)\b/i, 'Swimming'],
  [/\b(elliptical)\b/i, 'Elliptical'],
  [/\b(stair|stairs|stairmaster|step ?mill)\b/i, 'Stair Climber'],
  [/\b(jump ?rope|skipping)\b/i, 'Jump Rope'],
];

const detectActivity = (text: string, fallback = 'Run') => {
  for (const [pattern, activity] of ACTIVITY_PATTERNS) if (pattern.test(text)) return activity;
  return fallback;
};

const clockToMinutes = (clock: string) => {
  const parts = clock.split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parts[0] || 0;
};

const minutesToClock = (minutes: number) => {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

const normalizeUnit = (raw: string) => {
  const value = raw.toLowerCase();
  if (/^(mi|mile|miles)$/.test(value)) return 'miles';
  if (/^(k|km|kms|kilometer|kilometers)$/.test(value)) return 'km';
  if (/^(m|meter|meters)$/.test(value)) return 'meters';
  if (/^(yd|yds|yard|yards)$/.test(value)) return 'yards';
  return 'miles';
};

/* One time expression: 32:10, 1:05:00, "30 min", "45 minutes", "1 hour". */
const TIME = /(\d{1,2}:\d{2}(?::\d{2})?)|(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\b|(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b|(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/i;
const DISTANCE = /(\d+(?:\.\d+)?)\s*(miles?|mi\b|kms?\b|k\b|kilometers?|meters?|m\b|yards?|yds?\b)/i;
const INTERVAL = /(\d{1,2})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(miles?|mi|kms?|k|meters?|m|yards?|yds?)?\b/i;
const FIVE_K = /\b(5|10)k\b/i;

const extractTime = (text: string) => {
  const match = text.match(TIME);
  if (!match) return 0;
  if (match[1]) return clockToMinutes(match[1]);
  if (match[2]) return Number(match[2]);
  if (match[3]) return Number(match[3]) * 60;
  if (match[4]) return Number(match[4]) / 60;
  return 0;
};

const stripMatched = (text: string, ...patterns: RegExp[]) => patterns.reduce((current, pattern) => current.replace(pattern, ' '), text);

export function parseCardioDescription(text: string): ParsedCardio {
  const trimmed = text.trim().replace(/\b(a|one)\s+(mile|km|kilometer)\b/gi, '1 $2');
  if (!trimmed) return { reflection: 'Describe the workout first.', note: '', rows: [] };
  const activity = detectActivity(trimmed);
  const rows: ParsedCardioRow[] = [];
  let note = '';

  /* Segment the description so a warmup / interval block / cooldown each get
     their own reading. Segments split on commas, "then", "plus", and "with". */
  const segments = trimmed.split(/,|\bthen\b|\bplus\b|\band then\b|\bfollowed by\b|;/i).map(part => part.trim()).filter(Boolean);

  for (const segment of segments) {
    const interval = segment.match(INTERVAL);
    if (interval) {
      const repeats = Math.min(16, Number(interval[1]) || 0);
      const each = Number(interval[2]) || 0;
      const unit = interval[3] ? normalizeUnit(interval[3]) : (each >= 100 ? 'meters' : 'miles');
      const perRepTime = extractTime(stripMatched(segment, INTERVAL)) / (repeats || 1);
      const eachTime = /each|@|at\b/.test(segment) ? extractTime(segment.slice(segment.search(/each|@|at\b/))) : perRepTime;
      for (let index = 0; index < repeats; index += 1) rows.push({ cardioType: detectActivity(segment, activity), distance: each, unit, timeMinutes: Number((eachTime || 0).toFixed(2)) });
      const rest = segment.match(/(\d+(?:\.\d+)?)\s*(s|sec|seconds|min|minutes)\s*(rest|recovery|jog)/i);
      if (rest) note = `${rest[1]} ${rest[2]} ${rest[3]} between repeats`;
      continue;
    }
    const distanceMatch = segment.match(DISTANCE) || segment.match(FIVE_K);
    const minutes = extractTime(segment);
    if (!distanceMatch && !minutes) continue;
    let distance = 0, unit = 'miles';
    if (distanceMatch) {
      if (distanceMatch[0].match(FIVE_K) && !segment.match(DISTANCE)) { distance = Number(distanceMatch[1]); unit = 'km'; }
      else { distance = Number(distanceMatch[1]); unit = normalizeUnit(distanceMatch[2] || 'miles'); }
    }
    rows.push({ cardioType: detectActivity(segment, activity), distance, unit, timeMinutes: Number(minutes.toFixed(2)) });
  }

  if (!rows.length) {
    const minutes = extractTime(trimmed);
    const distanceMatch = trimmed.match(DISTANCE);
    if (minutes || distanceMatch) rows.push({ cardioType: activity, distance: distanceMatch ? Number(distanceMatch[1]) : 0, unit: distanceMatch ? normalizeUnit(distanceMatch[2] || 'miles') : 'miles', timeMinutes: Number(minutes.toFixed(2)) });
  }

  /* "5k, 28 minutes" reads as one effort, not two. */
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const a = rows[index - 1], b = rows[index];
    if (a.cardioType === b.cardioType && ((a.distance > 0 && !a.timeMinutes && !b.distance && b.timeMinutes > 0) || (b.distance > 0 && !b.timeMinutes && !a.distance && a.timeMinutes > 0))) {
      rows[index - 1] = { cardioType: a.cardioType, distance: a.distance || b.distance, unit: a.distance ? a.unit : b.unit, timeMinutes: a.timeMinutes || b.timeMinutes };
      rows.splice(index, 1);
    }
  }

  if (!rows.length) return { reflection: 'Could not read a distance or time from that — add numbers like “4 miles in 32:10” or “6x400m”.', note: '', rows: [] };

  const totalMinutes = rows.reduce((sum, row) => sum + row.timeMinutes, 0);
  const milesTotal = rows.reduce((sum, row) => {
    if (row.unit === 'miles') return sum + row.distance;
    if (row.unit === 'km') return sum + row.distance / 1.609344;
    if (row.unit === 'meters') return sum + row.distance / 1609.344;
    if (row.unit === 'yards') return sum + row.distance / 1760;
    return sum;
  }, 0);
  const parts = [
    rows.length > 1 ? `${rows.length} lines` : rows[0].cardioType,
    milesTotal > 0 ? `${Number(milesTotal.toFixed(2))} mi total` : '',
    totalMinutes > 0 ? minutesToClock(totalMinutes) : '',
    milesTotal > 0 && totalMinutes > 0 ? `${minutesToClock(totalMinutes / milesTotal)} /mi` : '',
  ].filter(Boolean).join(' · ');
  return { reflection: `Logged from your description: ${parts}. Adjust any line below before saving.`, note, rows };
}
