/* THE CARD SAID "BEST LOGGED EVIDENCE 5:18" OVER A PROJECTION OF 5:49.

   Preston answered "yes, that 5:19 was real" and the answer reached his
   account: excludedEfforts on the server carries ok:2026-07-29|1.00|319. On
   his phone the 5:19 was still an unanswered standout, so the fit set it aside
   and the mile came back 5:49 — a projection that did not believe a mile he
   had actually run, printed next to it.

   The cause was one expression in the setup loader: `scoped || remoteSetup`.
   The local cache won, always, for the life of the install. Fine while one
   device does all the writing; wrong the moment anything else does.

   Reproduced exactly before this was written: with ok:2026-07-29 present the
   predictor says 5:19 (5:12–5:26); with it missing and the other two answers
   intact it says 5:49 (5:34–6:03), which is the number on his screen to the
   second. */
import { freshestSetup } from './src/features/profile/setupFreshness.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const EARLY = '2026-09-01T10:00:00.000Z';
const LATE = '2026-09-13T22:24:56.943Z';

console.log('\nThe newer copy wins, whichever one that is');
check('a cache older than the account takes the account',
  freshestSetup({ hasLocal: true, localSavedAt: EARLY, hasRemote: true, remoteUpdatedAt: LATE }) === 'remote');
check('and a cache newer than the account keeps the cache',
  freshestSetup({ hasLocal: true, localSavedAt: LATE, hasRemote: true, remoteUpdatedAt: EARLY }) === 'local');
/* A save writes both, so equal stamps are the same setup — and the local one
   is the object the athlete is currently looking at. */
check('an even race goes to the device in the athlete\'s hand',
  freshestSetup({ hasLocal: true, localSavedAt: LATE, hasRemote: true, remoteUpdatedAt: LATE }) === 'local');

console.log('\nA cache of unknown age is not evidence of anything');
/* THE CASE THAT WAS BROKEN. Every install predating this stamp has a cache
   with no date on it, which is exactly the population the bug affects — so an
   unstamped cache must lose to the server rather than win by default. */
check('an unstamped cache loses to the account',
  freshestSetup({ hasLocal: true, hasRemote: true, remoteUpdatedAt: LATE }) === 'remote');
check('even when the account row has no date either',
  freshestSetup({ hasLocal: true, hasRemote: true }) === 'remote');

console.log('\nAnd one copy on its own is the answer, not a comparison');
check('no account row yet: the cache stands', freshestSetup({ hasLocal: true, localSavedAt: EARLY, hasRemote: false }) === 'local');
check('an unstamped cache alone still stands', freshestSetup({ hasLocal: true, hasRemote: false }) === 'local');
check('a fresh device takes the account', freshestSetup({ hasLocal: false, hasRemote: true, remoteUpdatedAt: LATE }) === 'remote');
check('with neither, the legacy unscoped cache is the last resort',
  freshestSetup({ hasLocal: false, hasRemote: false, hasLegacy: true }) === 'legacy');
check('and with nothing at all it says so rather than guessing',
  freshestSetup({ hasLocal: false, hasRemote: false }) === 'none');

console.log('\nIt never merges the two, and that is deliberate');
/* Two half-merged setups are a third setup neither device agreed to, and the
   failures that produces are far harder to see than a stale one. The answer is
   always exactly one of the copies. */
const answers = new Set();
for (const hasLocal of [true, false]) for (const hasRemote of [true, false]) for (const hasLegacy of [true, false])
  for (const localSavedAt of [EARLY, LATE, null]) for (const remoteUpdatedAt of [EARLY, LATE, null])
    answers.add(freshestSetup({ hasLocal, hasRemote, hasLegacy, localSavedAt, remoteUpdatedAt }));
check('every combination returns one named copy', [...answers].every(a => ['local', 'remote', 'legacy', 'none'].includes(a)),
  [...answers].join(', '));
check('and it never names a copy that is not there',
  freshestSetup({ hasLocal: false, hasRemote: false, hasLegacy: false }) === 'none'
  && freshestSetup({ hasLocal: false, hasRemote: true, hasLegacy: true, remoteUpdatedAt: EARLY }) === 'remote');

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
