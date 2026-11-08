/* A HYROX WORKOUT IS A FEW STATIONS, NOT THE WHOLE COURSE.

   Asked for "a good HYROX workout in the coming weeks", the coach wrote one
   session with all eight stations — a full simulation offered as a routine
   workout to an athlete whose base was the limiter. Forge's own sessions
   rotate: four stations one day, the other four the next, a full run-through
   only once in a while. The coach is now handed that rotation, and these
   checks pin what it says. */
import { readFileSync } from 'node:fs';
import { upcomingHyroxSessions, hyroxSession, HYROX_STATIONS, HYROX_CYCLE } from './src/lib/hyroxSession.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const stationsIn = index => hyroxSession({ sessionIndex: index, thresholdSecondsPerMile: 420 }).plan.stationEntries.filter(entry => entry.name !== 'Run').map(entry => entry.name);

console.log('\nThe next sessions the coach is told about');
const next = upcomingHyroxSessions({ sessionsDone: 0, thresholdSecondsPerMile: 420, weeksToRace: 12 }, 4);
check('four sessions ahead', next.length === 4, String(next.length));
check('each says what it is', next.every(item => item.title && item.summary));
check('none of them is the whole course', next.every(item => !/full simulation|full course/i.test(`${item.title} ${item.summary}`)), next.map(item => item.title).join(' | '));

console.log('\nAcross a cycle, a session is a few stations');
const cycle = Array.from({ length: HYROX_CYCLE * 2 }, (_, index) => ({ index, shape: hyroxSession({ sessionIndex: index, thresholdSecondsPerMile: 420 }).shape, stations: stationsIn(index) }));
const routine = cycle.filter(item => item.shape !== 'simulation');
check('every routine session trains at most four stations', routine.every(item => item.stations.length <= 4), routine.map(item => item.stations.length).join(','));
const full = cycle.filter(item => item.stations.length === HYROX_STATIONS.length);
check('the full course comes up at most once in two cycles', full.length <= 1, String(full.length));
/* A stations day and the compromised day after it take opposite halves, so
   the pair covers the course without either one being all of it. */
check('a stations day and the next session split the course between them', new Set([...stationsIn(0), ...stationsIn(1)]).size === HYROX_STATIONS.length,
  `${stationsIn(0).join(',')} / ${stationsIn(1).join(',')}`);

console.log('\nThe coach is told the rule');
const prompt = readFileSync('supabase/functions/forge-coach/index.ts', 'utf8');
check('a HYROX session is two to four stations', /picks two to four of the eight stations/.test(prompt));
check('the full simulation is not a routine workout', /never offer it as a routine workout/.test(prompt));
check('and it answers from Forge\'s own rotation', /hyroxUpcoming is supplied/.test(prompt));
check('the coach screen sends that rotation', /hyroxUpcoming:/.test(readFileSync('src/pages/CoachPage.tsx', 'utf8')));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
