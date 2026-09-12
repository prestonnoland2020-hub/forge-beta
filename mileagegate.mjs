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
import { mileageGap, applyMileageGap, CEILING_HEADROOM } from './src/lib/mileageGap.ts';

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

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
