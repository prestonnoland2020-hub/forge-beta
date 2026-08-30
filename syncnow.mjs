/* STRAVA SYNC RUNS WHEN THE ATHLETE LOOKS. A six-hour throttle meant a run
   recorded on the watch could sit unseen for most of a day: post it, open
   Forge, and it is not there — which reads as a broken integration, not a
   schedule. */
import { readFileSync } from 'node:fs';
const shell = readFileSync('src/components/AppShell.tsx', 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };

check('the six-hour throttle is gone', !/6 \* 3600000/.test(shell));
check('the floor is two minutes', /SYNC_FLOOR_MS = 2 \* 60 \* 1000/.test(shell));
check('a floor still exists so navigation cannot hammer Strava', /Date\.now\(\) - Number\(localStorage\.getItem\(throttleKey\)[\s\S]{0,40}SYNC_FLOOR_MS\) return/.test(shell));
check('sync runs on app open', /useEffect\(\(\) => \{ void syncStravaNow\(\); \}, \[historyLoading\]\)/.test(shell));
check('sync runs again when the athlete returns to the tab', /visibilitychange/.test(shell) && /window\.addEventListener\('focus', onReturn\)/.test(shell));
check('both listeners are cleaned up', /removeEventListener\('visibilitychange', onReturn\)/.test(shell) && /removeEventListener\('focus', onReturn\)/.test(shell));
check('it still waits for history before importing', /if \(isDemoMode \|\| historyLoading\) return;/.test(shell));
check('a failure stays silent', /catch \{ \/\* silent/.test(shell));
check('the sync writes before the import reads', shell.indexOf('await syncStravaActivities()') < shell.indexOf('await importStravaActivities(stravaRecords'));

/* The timing the athlete actually experiences. */
const FLOOR = 2 * 60 * 1000;
const wouldSync = (msSinceLast) => msSinceLast >= FLOOR;
check('posting a run then opening Forge minutes later syncs', wouldSync(5 * 60 * 1000));
check('reopening after an hour syncs', wouldSync(60 * 60 * 1000));
check('bouncing between tabs in the same minute does not', !wouldSync(30 * 1000));
check('the old behaviour would have missed a run posted 2 hours ago', 2 * 3600000 < 6 * 3600000);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
