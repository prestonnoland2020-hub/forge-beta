/* THE APP WAKES UP ON TODAY.

   Left open overnight on a phone, the app came back the next morning still
   on yesterday: History read Oct 31 on Nov 1. "Today" is now one value that
   is re-read when the app returns to the front, and pages re-open on it. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* A clock we can move, and the browser events the app listens for. */
const RealDate = Date;
let fakeNow = new RealDate(2026, 9, 31, 23, 50).getTime();
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [fakeNow])); } static now() { return fakeNow; } };
const handlers = {};
globalThis.window = { addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); }, setInterval: () => 0 };
globalThis.document = { visibilityState: 'visible', addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); } };
const fire = type => (handlers[type] || []).forEach(fn => fn());

const { currentDay, subscribeToDay } = await import('./src/lib/dayClock.ts');

console.log('\nThe day turns over while the app is in the background');
let heard = 0;
subscribeToDay(() => { heard += 1; });
check('it starts on Oct 31', currentDay() === '2026-10-31', currentDay());
fakeNow = new RealDate(2026, 10, 1, 7, 30).getTime();
check('nothing changes until the app is looked at again', currentDay() === '2026-10-31');
fire('visibilitychange');
check('coming back to the app reads Nov 1', currentDay() === '2026-11-01', currentDay());
check('and tells the screens', heard === 1, String(heard));
fire('focus');
check('the same day again is not news', heard === 1);

console.log('\nThe screens use it');
const shell = readFileSync('./src/components/AppShell.tsx', 'utf8');
check('a new day re-opens the page', /key=\{location\.pathname === '\/workout' \? screenKey : `\$\{screenKey\}#\$\{today\}`\}/.test(shell));
check('but never mid-workout', /location\.pathname === '\/workout' \? screenKey/.test(shell));
check('Today\'s plan re-reads the day', /useToday\(\);\s*const date=isoToday\(\);/.test(readFileSync('./src/features/training/DailyRecommendationProvider.tsx', 'utf8')));
const history = readFileSync('./src/pages/HistoryPage.tsx', 'utf8');
check('History opens on today, not the last training day', /useState\(openOn\)/.test(history) && !/useState\(trainingRecords\[0\]\?\.date/.test(history));

globalThis.Date = RealDate;
console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
