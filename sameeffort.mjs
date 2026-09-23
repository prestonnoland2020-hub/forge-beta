/* THE SAME RUN LOGGED TWICE counts once. */
import { sameEffort, mergeSession } from './src/lib/sameEffort.ts';
import { runMilesOfRecord } from './src/lib/stats.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const strava = { id: 'strava-123', structure: 'steady', activity: 'Run', summary: 'Morning Run', prescription: { distance: '5.02', distanceUnit: 'miles', duration: '44' } };
const typed = { id: 'c-9', structure: 'custom', activity: 'Run', summary: 'Fartlek', prescription: { legacyIntervals: [{ cardioType: 'Run', distance: 1, unit: 'miles', time: 9 }, { cardioType: 'Run', distance: 3, unit: 'miles', time: 24 }, { cardioType: 'Run', distance: 1, unit: 'miles', time: 9 }] } };
const typedShort = { id: 'c-10', structure: 'steady', activity: 'Run', summary: 'Run', prescription: { distance: '3', distanceUnit: 'miles', duration: '27' } };
const bike = { id: 'strava-124', structure: 'steady', activity: 'Bike', summary: 'Ride', prescription: { distance: '5', distanceUnit: 'miles', duration: '20' } };

console.log('\nSame effort');
check('5.02 mi watch vs 5 mi typed is the same run', sameEffort(strava, typed));
check('5 mi vs 3 mi is not', !sameEffort(strava, typedShort));
check('a 5-mile ride is not a 5-mile run', !sameEffort(bike, typedShort));

console.log('\nMerging into the day');
const merged = mergeSession([strava], typed);
check('the typed run replaces the watch copy', merged.matched && merged.sessions.length === 1);
check('and keeps the watch id so the next sync still sees it', merged.sessions[0].id === 'strava-123');
check('and carries the typed detail', merged.sessions[0].summary === 'Fartlek');
const appended = mergeSession([strava], typedShort);
check('a different run is appended', !appended.matched && appended.sessions.length === 2);
const importedAfter = mergeSession([typed], strava);
check('an import never replaces a typed session (the import side handles that)', !importedAfter.matched && importedAfter.sessions.length === 2);
check('the day counts 5 miles, not 10', runMilesOfRecord({ id: 'd', date: '2026-09-22', title: 'x', muscles: [], hasCardio: true, cardioSessions: merged.sessions }) === 5);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
