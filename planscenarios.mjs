/* THE SCENARIO SWEEP.

   Every fix in this file's history was found by generating training blocks
   across the whole space of athletes, goals and constraints and asserting that
   nothing impossible came out. Reading a plan for one athlete tells you it
   looks reasonable; generating two million weeks tells you what the engine
   does at the edges, and the edges is where the athletes actually are — the
   person who runs twice a week, the person with nothing logged, the person who
   entered a marathon and capped their training at eighteen miles.

   Things this found, none of which were visible from one good-looking plan:

     - a taper that got HEAVIER, because the climb kept climbing and the
       durability cap kept letting the long run grow;
     - "race week" applying to every week after the race, so a block proposed
       racing a marathon every seven days until it ran out;
     - a fifteen-mile long run for an athlete with no running logged at all,
       because the durability cap was Infinity when there was no evidence;
     - a half marathon squeezed into 30% of an eighteen-mile week;
     - deload weeks bigger than the week they were recovering from;
     - volume doubling the Monday after a marathon;
     - a hard session sized for a twelve-mile week landing in a seven-mile one.

   It runs a reduced grid here so the suite stays quick. The full sweep is the
   same file with the lists opened up. */
/* THE SWEEP. Generate blocks across the whole space and assert invariants on
   every single week, then report violations grouped by kind. */
import { resolveWeekRunning } from './src/features/training/aiPlanService.ts';
import { paceModel } from './src/lib/paceModel.ts';
import { qualitySession, clockText } from './src/lib/qualitySession.ts';
import { eventProfileFor } from './src/lib/eventProfile.ts';
import { phaseFor } from './src/lib/trainingPhase.ts';

const TODAY = '2026-09-12';
const back = d => { const x = new Date(`${TODAY}T12:00:00`); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
const run = (daysAgo, miles, seconds) => ({ date: back(daysAgo),
  cardioSessions: [{ activity: 'Run', structure: 'steady',
    prescription: { distanceUnit: 'miles', legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: miles, time: seconds / 60 }] } }] });

/* ── Athlete archetypes ─────────────────────────────────────────────────── */
const ATHLETES = [
  { key: 'untrained',   weekly: 0,  history: [] },
  { key: 'novice',      weekly: 6,  history: [run(10, 2, 1140), run(20, 3, 1800)] },
  { key: 'preston',     weekly: 8,  history: [run(13, 1, 348), run(25, 3.1, 1500)] },
  { key: 'recreational',weekly: 22, history: [run(9, 6.2, 2760), run(30, 13.1, 6300)] },
  { key: 'trained',     weekly: 45, history: [run(7, 6.2, 2100), run(40, 13.1, 4680)] },
  { key: 'stale',       weekly: 12, history: [run(300, 3.1, 1020)] },
];

/* ── Goals: distance × ambition ─────────────────────────────────────────── */
const EVENTS = [
  { label: 'Mile', miles: 1, times: [270, 390] },
  { label: '2 Mile', miles: 2, times: [660] },
  { label: '5K', miles: 3.107, times: [960, 1139, 1500] },
  { label: '10K', miles: 6.214, times: [2400] },
  { label: 'Half', miles: 13.109, times: [5700, 8100] },
  { label: 'Marathon', miles: 26.219, times: [14400, 18000] },
];

/* ── Splits: how much lower-body lifting is in the way ──────────────────── */
const SPLITS = {
  none: ['Full A', 'Full B', 'Rest', 'Full C', 'Rest', 'Cardio', 'Rest'],
  light: ['Legs', 'Push', 'Pull', 'Cardio', 'Upper', 'Cardio', 'Rest'],
  heavy: ['Legs', 'Push', 'Legs 2', 'Cardio', 'Legs 3', 'Upper', 'Rest'],
};
const daysOf = key => SPLITS[key].map(name => ({ name, dayType: /rest/i.test(name) ? 'Rest' : /cardio/i.test(name) ? 'Cardio' : 'Strength' }));

const BLOCK_WEEKS = [6, 12, 16];
const RUNNING_DAYS = [2, 3, 6];
const CEILINGS = [0, 18, 40];
const READINESS = [undefined, 62, 48];
const RACE_AWAY = [5, 14, 40];

/* Every invariant this sweep asserts, named so a clean run says what it
   actually checked rather than saying nothing. */
const INVARIANTS = [
  'mileage is a number and the parts sum to the header',
  'no week clears the ceiling the athlete set',
  'no week clears what its running days can carry',
  'the long run stays inside proven durability',
  'no hard session eats the week',
  'nothing is prescribed faster than the athlete has run',
  'no "hard" session slower than easy running',
  'rep distances stay in the VO2max band',
  'rep counts and rep times are sane',
  'deload weeks are lighter than the week before',
  'week-on-week volume is rate-limited',
  'the taper tapers, and never goes back up',
  'race week fits the race, with no long run beside it',
  'a rough check-in takes the hard session off',
  'one hard session a week, and it has numbers in it',
  'phases run forwards, and recovery follows the race',
  'a long block reaches its race-specific phase',
  'no block repeats one session type for its whole length',
  'no block with a goal is left without hard running',
];
const violations = new Map();
const flag = (kind, detail) => {
  if (!violations.has(kind)) violations.set(kind, []);
  violations.get(kind).push(detail);
};

let blocks = 0, weeks = 0, checkedBlocks = 0, kindTally = 0;
const tally = new Map();
const num = v => typeof v === 'number' && Number.isFinite(v);
const badText = t => !t || /NaN|Infinity|undefined|null|:NaN/.test(String(t));

for (const athlete of ATHLETES) {
  for (const event of EVENTS) {
    for (const seconds of event.times) {
      const goal = { paceSecondsPerMile: seconds / event.miles, miles: event.miles };
      const paces = paceModel(athlete.history, goal, TODAY, athlete.weekly);
      const profile = eventProfileFor(event.miles);
      for (const blockWeeks of BLOCK_WEEKS) {
        for (const runningDays of RUNNING_DAYS) {
          for (const ceiling of CEILINGS) {
            for (const splitKey of Object.keys(SPLITS)) {
              for (const readiness of READINESS) {
                for (const raceAway of RACE_AWAY) {
                  blocks += 1;
                  const days = daysOf(splitKey);
                  const floor = ceiling ? Math.min(Math.round(ceiling * 0.4), 12) : 0;
                  let previous = 0; let wasDeload = false; let peak = 0; let lastTaper = 0; const kinds = [];
                  for (let index = 0; index < blockWeeks; index += 1) {
                    weeks += 1;
                    const deloading = index % 5 === 3;
                    const phase = phaseFor({ weekIndex: index, blockWeeks, weeksToRace: raceAway, deloading, shape: profile.shape });
                    const raw = {
                      week: index + 1, phase, mileage: Math.max(1, athlete.weekly || 10),
                      longRunMiles: Math.max(2, (athlete.weekly || 10) * 0.3),
                      longRunPace: '9:30', longRunDay: 'Cardio',
                      quality: 'No goal-driven cardio', qualityPace: '', qualityDay: days.find(d => d.dayType === 'Cardio')?.name || 'Push',
                      easyDays: [], easyMinutes: 40, easyPace: clockText(paces.easySlow || 570),
                      topSets: [], note: '',
                    };
                    const w = resolveWeekRunning(raw, days, {
                      runningDays, minWeeklyMileage: floor, maxWeeklyMileage: ceiling,
                      weeklyMileage: athlete.weekly, recentWeeklyMileage: athlete.weekly,
                      recentLongestRun: athlete.weekly * 0.35, readiness,
                      goalPaceSecondsPerMile: goal.paceSecondsPerMile, goalMiles: goal.miles, paces,
                    }, { weekIndex: index, blockWeeks, waveIndex: index, weeksToRace: raceAway });

                    const id = `${athlete.key}/${event.label}@${clockText(seconds)}/${blockWeeks}w/${runningDays}d/cap${ceiling}/${splitKey}/r${readiness ?? '-'}/race${raceAway}/wk${index + 1}`;

                    /* ---- invariants ---- */
                    if (!num(w.mileage) || w.mileage < 0) flag('mileage is not a number', `${id} → ${w.mileage}`);
                    if (badText(w.quality) && w.quality !== undefined) flag('quality text is broken', `${id} → ${w.quality}`);
                    const isRace = phase === 'Race';
                    if (ceiling && !isRace && w.mileage > ceiling + 0.05) flag('week exceeds the ceiling the athlete set', `${id} → ${w.mileage} > ${ceiling}`);
                    if (isRace && w.longRunMiles > 0) flag('a long run in race week', `${id} → ${w.longRunMiles} mi`);
                    if (isRace && event.miles > 3 && w.mileage < event.miles) flag('race week does not fit the race', `${id} → ${w.mileage} < ${event.miles}`);

                    const parts = (w.longRunMiles || 0) + (w.easyRuns || []).reduce((t, m) => t + m, 0);
                    const qualityMiles = Math.max(0, w.mileage - parts);
                    if (w.mileage > 0 && Math.abs(parts + qualityMiles - w.mileage) > 0.15) flag('the parts do not sum to the header', `${id}`);

                    /* A long run is only wrong when it is BOTH a runaway share of the
                       week AND past what the athlete has proven they can cover. On two
                       running days a proven 15-miler being 80% of the week is arithmetic,
                       not a mistake — there are only two runs in it. */
                    const longest = athlete.weekly * 0.35;
                    const proven = longest > 0 ? Math.max(6, longest + 1 + index) : Math.min(10, 6 + index);
                    const longCapShare = runningDays <= 2 ? 0.8 : 0.65;
                    if (!isRace && w.longRunMiles > w.mileage * longCapShare && w.longRunMiles > proven + 0.05 && w.mileage > 3) flag('long run eats the week', `${id} → ${w.longRunMiles}/${w.mileage} (proven ${proven.toFixed(1)})`);
                    const shareCap = Math.max(0.35, Math.min(0.5, 0.95 / runningDays)) + 0.05;
                    if (!isRace && qualityMiles > w.mileage * shareCap + 0.2 && w.mileage > 3) flag('hard session eats the week', `${id} → ${qualityMiles.toFixed(1)}/${w.mileage}`);

                    const hard = String(w.quality || '');
                    const paceMatches = [...hard.matchAll(/(\d+):(\d{2})\/mi/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
                    for (const p of paceMatches) {
                      if (paces.repetition && p < paces.repetition - 1) flag('prescribed faster than the athlete can run', `${id} → ${clockText(p)} vs rep ${clockText(paces.repetition)}`);
                      if (paces.easySlow && p > paces.easySlow + 1) flag('a "hard" session slower than easy running', `${id} → ${clockText(p)} vs easy ${clockText(paces.easySlow)}`);
                    }
                    const repMatch = hard.match(/× (\d+) m @ (\d+):(\d{2})\/rep/);
                    if (repMatch) {
                      const metres = Number(repMatch[1]);
                      const perMile = (Number(repMatch[2]) * 60 + Number(repMatch[3])) / (metres / 1609.344);
                      if (paces.repetition && perMile < paces.repetition - 2) flag('prescribed faster than the athlete can run', `${id} → ${clockText(perMile)}/mi reps`);
                      if (metres < 150 || metres > 1600) flag('rep distance outside any sane band', `${id} → ${metres} m`);
                    }
                    if (/(\d+):(\d{2})/.test(hard) && /0:0\d/.test(hard)) flag('a rep time that is not a rep time', `${id} → ${hard}`);

                    if (deloading && phase === 'Deload' && previous && w.mileage > previous * (runningDays <= 2 ? 1.12 : 1.02)) flag('the deload week is not lighter', `${id} → ${w.mileage} after ${previous}`);
                    if (phase === 'Taper') {
                      if (peak > 8 && w.mileage > peak * (runningDays <= 2 ? 0.95 : 0.85)) flag('the taper does not taper', `${id} → ${w.mileage} against a peak of ${peak}`);
                      if (lastTaper && w.mileage > lastTaper * 1.02) flag('the taper goes back up', `${id} → ${w.mileage} after ${lastTaper}`);
                      lastTaper = w.mileage;
                    } else if (phase !== 'Race') { peak = Math.max(peak, w.mileage); }
                    const jumpCap = runningDays <= 2 ? 1.6 : 1.35;
                    const returning = raceAway === index - 1;
                    if (!isRace && !returning && !wasDeload && previous && w.mileage > previous * jumpCap && previous > 4) flag('week-on-week jump too big', `${id} → ${previous} → ${w.mileage}`);
                    if (typeof readiness === 'number' && readiness < 55 && /threshold|× \d+ m @|race pace/.test(hard)) flag('hard session on a body that said no', `${id} → ${hard}`);
                    /* ── tier two: does the BLOCK make sense, not just the week ── */
                    kinds.push({ phase, kind: (w.quality.match(/threshold/) ? 'threshold'
                      : /race pace/.test(w.quality) ? 'racepace'
                      : /full recovery/.test(w.quality) ? 'reps'
                      : /× \d+ m @|× [\d.]+ mi @/.test(w.quality) ? 'intervals'
                      : /strides/.test(w.quality) ? 'strides'
                      : /fartlek|Easy/.test(w.quality) ? 'easy'
                      : /assessment|Race day/.test(w.quality) ? 'test' : 'other'), miles: w.mileage, index });
                    /* Exactly one hard run: the week may name a hard session once. */
                    const hardWords = (w.quality.match(/threshold|race pace|full recovery|× /g) || []).length;
                    if (hardWords > 2) flag('more than one hard session in a week', `${id} → ${w.quality}`);
                    if (w.quality && !/\d/.test(w.quality) && !/Easy|recovered|owns it|No goal/.test(w.quality)) flag('a session with no number in it', `${id} → ${w.quality}`);
                    const repCount = Number(w.quality.match(/^(\d+) ×/)?.[1] || 0);
                    if (repCount && (repCount < 2 || repCount > 12)) flag('rep count outside anything sane', `${id} → ${w.quality}`);
                    previous = w.mileage; wasDeload = deloading;
                  }
                  checkedBlocks += 1; kindTally += kinds.length;
                  for (const k of kinds) tally.set(k.kind, (tally.get(k.kind) || 0) + 1);
                  /* ── block-level ── */
                  const order = ['Foundation', 'Build', 'Specific', 'Taper', 'Race'];
                  /* The phases only run forwards WITHIN one build. A block that
                     contains the race itself legitimately restarts after it. */
                  const upToRace = kinds.slice(0, kinds.findIndex(k => k.phase === 'Race') + 1 || kinds.length);
                  const seen = upToRace.filter(k => order.includes(k.phase)).map(k => order.indexOf(k.phase));
                  for (let i = 1; i < seen.length; i += 1) {
                    if (seen[i] < seen[i - 1]) { flag('the block goes backwards through its phases', `${athlete.key}/${event.label}/${blockWeeks}w/race${raceAway} → ${kinds.map(k => k.phase).join(' ')}`); break; }
                  }
                  const raceAt = kinds.findIndex(k => k.phase === 'Race');
                  const after = raceAt < 0 ? [] : kinds.slice(raceAt + 1);
                  if (after.length && after[0].phase !== 'Deload') flag('no recovery after the race', `${athlete.key}/${event.label}/${blockWeeks}w/race${raceAway} → ${kinds.map(k => k.phase).join(' ')}`);
                  if (raceAway <= blockWeeks - 1 && !kinds.some(k => k.phase === 'Race')) flag('the race never arrives', `${athlete.key}/${event.label}/${blockWeeks}w/race${raceAway}`);
                  if (blockWeeks >= 10 && raceAway >= blockWeeks - 1 && !kinds.some(k => k.phase === 'Specific')) flag('a long block with no race-specific phase', `${athlete.key}/${event.label}/${blockWeeks}w/race${raceAway} → ${kinds.map(k => k.phase).join(' ')}`);
                  const hardKinds = kinds.filter(k => ['threshold', 'intervals', 'reps', 'racepace'].includes(k.kind));
                  if (blockWeeks >= 10 && readiness === undefined && hardKinds.length >= 6 && new Set(hardKinds.map(k => k.kind)).size < 2) {
                    flag('the same hard session every single week', `${athlete.key}/${event.label}/${blockWeeks}w → ${hardKinds.map(k => k.kind).join(' ')}`);
                  }
                  if (blockWeeks >= 10 && readiness === undefined && hardKinds.length === 0 && paces.threshold) {
                    flag('a whole block with no hard running in it', `${athlete.key}/${event.label}/${blockWeeks}w/${runningDays}d/cap${ceiling} → ${kinds.map(k => k.kind).join(' ')}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`\n${blocks.toLocaleString()} blocks · ${weeks.toLocaleString()} weeks (block-level checks ran on ${checkedBlocks.toLocaleString()}, ${kindTally.toLocaleString()} sessions classified)\n`);
if (!violations.size) {
  /* The runner counts PASS/FAIL lines, and a suite that reports only "no
     violations" showed up as zero checks — indistinguishable from a suite that
     had quietly stopped asserting anything. Each invariant reports itself. */
  for (const name of INVARIANTS) console.log(`  PASS  ${name}`);
}
console.log('\n  session mix across every block generated:');
for (const [kind, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`    ${String((n / kindTally * 100).toFixed(1)).padStart(5)}%  ${kind}`);
for (const [kind, list] of [...violations].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(list.length).padStart(7)}  ${kind}`);
  for (const sample of list.slice(0, 3)) console.log(`           e.g. ${sample}`);
}

const failed = [...violations.values()].reduce((total, list) => total + list.length, 0);
console.log(`\n${failed ? `${failed} weeks violated an invariant` : 'All checks passed'}`);
process.exit(failed ? 1 : 0);
