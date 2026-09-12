/* "IF I HAVE A GOAL AND NOT ENOUGH MILES TO FIX IT, HAVE AN ALERT AND ACCEPT
   MILEAGE INCREASE TO RESOLVE."

   Preston's own case: a sub-19 5K — 6:06/mi, which the volume table puts at
   about 22 miles a week — against roughly 13 miles a week of actual running.
   Forge wrote him fourteen miles in week one and said nothing.

   Two ways to be short and they are not the same fix. A ceiling below what
   the pace needs is a contradiction the athlete cannot train their way out
   of; a ceiling that allows it while the ramp starts too low is a starting
   point. This pins which alert fires, what it offers, and that accepting it
   never writes an unsafe number. */
import { mileageGap, applyMileageGap, applyMileageRamp, CEILING_HEADROOM } from './src/lib/mileageGap.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const iso = back => { const d = new Date(); d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10); };
const ahead = weeks => { const d = new Date(); d.setDate(d.getDate() + weeks * 7); return d.toISOString().slice(0, 10); };

/* A run week after week, so recentWeeklyMiles has something to read. */
const running = milesPerWeek => Array.from({ length: 8 }, (_, week) => ({
  id: `r${week}`, date: iso(week * 7 + 1),
  cardioSessions: [{ id: `c${week}`, activity: 'Run', structure: 'steady',
    prescription: { distanceUnit: 'miles', legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: milesPerWeek, time: milesPerWeek * 9 }] } }],
}));
/* One honest hard effort, so the model has a pace to predict from. */
const timeTrial = { id: 'tt', date: iso(10),
  cardioSessions: [{ id: 'ctt', activity: 'Run', structure: 'steady',
    prescription: { distanceUnit: 'miles', legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: 3.107, time: 22 }] } }] };

const fiveK = { id: 'g1', title: 'Sub-19 5K', type: 'Endurance', target: '18:59', metric: '5K time', date: ahead(20) };
const records = [timeTrial, ...running(13)];

console.log('\nA ceiling below what the pace needs is the alert');
const capped = mileageGap([fiveK], records, { minWeeklyMileage: 10, maxWeeklyMileage: 18 });
check('an alert is raised at all', Boolean(capped), capped ? `${capped.kind}` : 'none');
check('and it is about the ceiling', capped?.kind === 'ceiling', `${capped?.kind}`);
check('it names the volume the pace is built on', capped?.needed >= 22, `${capped?.needed}`);
check('it offers headroom above that, not exactly it',
  capped?.target === Math.ceil(capped.needed * CEILING_HEADROOM), `${capped?.target}`);
check('and the offer is above the ceiling it replaces', capped?.target > capped?.ceiling, `${capped?.target} > ${capped?.ceiling}`);

console.log('\nAccepting it raises the ceiling and leaves nothing stranded');
const after = applyMileageGap({ minWeeklyMileage: 10, maxWeeklyMileage: 18 }, capped);
check('the ceiling is the offered number', after.maxWeeklyMileage === capped.target, `${after.maxWeeklyMileage}`);
check('the floor is untouched when it already fits', after.minWeeklyMileage === 10, `${after.minWeeklyMileage}`);
const stranded = applyMileageGap({ minWeeklyMileage: 999, maxWeeklyMileage: 18 }, capped);
check('a floor above the new ceiling is pulled down to it', stranded.minWeeklyMileage === capped.target, `${stranded.minWeeklyMileage}`);

console.log('\nWith permission already given, the floor is what moves');
const permitted = mileageGap([fiveK], records, { minWeeklyMileage: 0, maxWeeklyMileage: 40 });
check('an alert is still raised', Boolean(permitted), permitted ? permitted.kind : 'none');
check('and it is about the starting point', permitted?.kind === 'floor', `${permitted?.kind}`);
check('it offers one safe step, not the whole gap',
  permitted && permitted.target > permitted.running && permitted.target <= Math.ceil(permitted.running * 1.15),
  `${permitted?.running} -> ${permitted?.target} (needs ${permitted?.needed})`);
check('and never past the ceiling', permitted.target <= 40, `${permitted?.target}`);

console.log('\nNothing to say when there is nothing to fix');
const enough = mileageGap([fiveK], [timeTrial, ...running(30)], { minWeeklyMileage: 0, maxWeeklyMileage: 40 });
check('an athlete already running the volume gets no alert', enough === null, `${enough?.kind || 'none'}`);
const noGoals = mileageGap([], records, { minWeeklyMileage: 0, maxWeeklyMileage: 25 });
check('no goals, no alert', noGoals === null);
const noSetup = mileageGap([fiveK], records, null);
check('no settings, no alert', noSetup === null);

console.log('\nA lift goal is not a mileage problem');
const bench = { id: 'g2', title: 'Bench 365', type: 'Strength', exercise: 'Bench', target: '365 lb', metric: 'Real 1RM', date: ahead(20) };
check('a strength goal never raises the running alert',
  mileageGap([bench], [], { minWeeklyMileage: 0, maxWeeklyMileage: 25 }) === null);

console.log('\nThe hungriest goal is the one that speaks');
const mile = { id: 'g3', title: 'Sub-5 mile', type: 'Endurance', target: '4:59', metric: 'Mile time', date: ahead(20) };
const both = mileageGap([fiveK, mile], records, { minWeeklyMileage: 0, maxWeeklyMileage: 18 });
check('one alert, for the goal that needs the most', Boolean(both) && both.needed >= capped.needed, `${both?.goal} needs ${both?.needed}`);

console.log('\nThe alert carries the climb, not just the number');
check('a ramp comes with it', Boolean(capped.ramp?.weeks?.length), `${capped.ramp?.weeks?.length} weeks`);
check('it starts from what they run', capped.ramp.from === capped.running || capped.ramp.from === Math.max(1, capped.floor), `${capped.ramp.from}`);
check('and climbs to what the goal needs', capped.ramp.to === capped.needed, `${capped.ramp.to}`);
check('it knows how many weeks are left', capped.weeksAvailable > 0, `${capped.weeksAvailable}`);
check('and says plainly whether that is enough', typeof capped.arrives === 'boolean', `${capped.arrives}`);

console.log('\nAccepting the whole ramp opens the ceiling AND sets the floor');
const built = applyMileageRamp({ minWeeklyMileage: 0, maxWeeklyMileage: 18 }, capped);
check('the ceiling clears what the goal needs', built.maxWeeklyMileage >= capped.needed, `${built.maxWeeklyMileage}`);
check('the floor is the ramp\'s first week, not its target',
  built.minWeeklyMileage === Math.round(capped.ramp.weeks[0].miles), `${built.minWeeklyMileage}`);
check('so the planner may climb and must start', built.minWeeklyMileage < built.maxWeeklyMileage,
  `${built.minWeeklyMileage} → ${built.maxWeeklyMileage}`);

console.log('\nThe step is measured from what the plan will actually start from');
/* Preston's live numbers, the day the gate stayed silent: 17 stated, 14 floor,
   40 ceiling, and about 8 miles a week of running Forge can see. The step used
   to be taken from the 8 — 8 → 9 — which fell under his own 14-mile floor and
   was discarded, so goalFeasibility said "6:07/mi is normally built on about
   22" and the gate said nothing at all. The plan never starts at 8; it starts
   at the highest of logged running, stated mileage and the floor. */
const run = (id, back, miles) => ({ id, date: iso(back),
  cardioSessions: [{ id: `c${id}`, activity: 'Run', structure: 'steady',
    prescription: { distanceUnit: 'miles', legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: miles, time: miles * 9 }] } }] });
const real = [...Array.from({ length: 8 }, (_, week) => run(`a${week}`, week * 7 + 2, 4)),
  ...Array.from({ length: 8 }, (_, week) => run(`b${week}`, week * 7 + 5, 4)), timeTrial];
const live = mileageGap([fiveK], real, { minWeeklyMileage: 14, maxWeeklyMileage: 40, weeklyMileage: 17 });
check('the gate speaks instead of staying silent', Boolean(live), live ? `${live.kind} → ${live.target}` : 'null');
check('it is a starting-point problem, not a ceiling one', live?.kind === 'floor', `${live?.kind}`);
check('the block is built around the stated mileage, not the logged 8',
  live?.base === 17, `${live?.base}`);
check('so the step is a real increase on what is already guaranteed',
  live?.target > live?.floor && live?.target > live?.base, `${live?.floor} floor, ${live?.base} base → ${live?.target}`);
check('and it is a humane one', live?.target <= Math.ceil(live.base * 1.1), `${live?.target}`);
check('it still reports what they are actually running', live?.running < live?.base, `${live?.running} logged`);
check('and it arrives in the weeks that are left', live?.arrives === true, `${live?.weeksAvailable} weeks`);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
