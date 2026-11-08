/* A GARMIN RUN SURVIVES EVERY SAVE THAT DID NOT KNOW ABOUT IT.

   Nov 7 and Nov 8: a 2.01 mi Garmin run synced onto a Legs day and was gone
   minutes later. The day is saved whole, and a screen holding the day from
   before the run arrived wrote it back without the run; the server replaced
   the day's cardio with that list, and the run — already marked imported —
   was never offered again. #94 patched two screens. This pins the rule where
   every save passes (WorkoutHistoryProvider → keepSyncedSessions) and checks
   the server keeps it too (tools/synced-cardio-test.sql runs the SQL side).

   And the synced-day card had two buttons, "Looks right" (saved nothing) and
   "Save this day" (greyed out until something was typed). It has one now. */
import { readFileSync } from 'node:fs';
import { keepSyncedSessions, SYNCED_SESSION } from './src/features/training/syncedCardio.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };

const run = { id: 'garmin-25014074883', activity: 'Run', summary: 'Run · 2.01 mi · 17:00', structure: 'steady', prescription: {} };
const bike = { id: 'hand-1', activity: 'Bike', summary: 'Bike · 10 min', structure: 'steady', prescription: {} };
const stored = { date: '2026-11-08', title: 'Legs', muscles: ['Quads', 'Cardio'], hasCardio: true, cardioSessions: [run, bike] };

console.log('\nA stale save keeps the synced run');
const stale = keepSyncedSessions(stored, { date: '2026-11-08', title: 'Legs', muscles: ['Quads'], topSets: [{ lift: 'Backless squat', weight: 225, reps: 5 }], cardioSessions: [] });
check('the Garmin run is put back', stale.cardioSessions?.some(session => session.id === run.id), JSON.stringify(stale.cardioSessions));
check('a hand-logged session the save dropped stays dropped (that is an edit)', !stale.cardioSessions?.some(session => session.id === bike.id));
check('the day still reads as a cardio day', stale.hasCardio === true && stale.muscles.includes('Cardio'));
check('and the lifting in the save is untouched', stale.topSets?.[0]?.weight === 225);

console.log('\nIt never duplicates or overrides');
const relisted = keepSyncedSessions(stored, { ...stored, cardioSessions: [{ ...run, summary: 'Run · 6×300 described' }] });
check('a save that lists the run keeps its own version, once', relisted.cardioSessions.filter(session => session.id === run.id).length === 1 && relisted.cardioSessions[0].summary.includes('described'));
const nothingToAdd = { ...stored, cardioSessions: [run, bike] };
check('a save that already has everything is returned unchanged', keepSyncedSessions(stored, nothingToAdd) === nothingToAdd);

console.log('\nA run deleted on purpose is deleted');
const removed = keepSyncedSessions(stored, { ...stored, cardioSessions: [bike] }, [run.id]);
check('named in removedCardioIds, it stays gone', !removed.cardioSessions.some(session => session.id === run.id));

console.log('\nWhat counts as synced');
check('Garmin, Strava and Garmin export ids', ['garmin-1', 'strava-2', 'garmin-export-3'].every(id => SYNCED_SESSION.test(id)));
check('a hand-logged id does not', !SYNCED_SESSION.test('85ccbba4-91bb-4705-bf91-e1cf1ed3dece'));

console.log('\nEvery save goes through it, and deletions are said out loud');
const provider = readFileSync('src/features/training/WorkoutHistoryProvider.tsx', 'utf8');
check('updateRecord guards every save', /const guarded=keepSyncedSessions\(stored,draft,options\?\.removedCardioIds\)/.test(provider) && /normalizeRecord\(guarded\)/.test(provider));
check('a deliberate deletion is sent to the server', /saveWorkoutDay\(record,\[\.\.\.\(removedSyncedIds\.current\.get\(record\.id\)\|\|\[\]\)\]\)/.test(provider) && /removedCardioIds\};/.test(readFileSync('src/features/training/workoutHistoryService.ts', 'utf8')));
const logger = readFileSync('src/pages/ProductPages.tsx', 'utf8');
check('the logger passes what the athlete deleted on every save', (logger.match(/,\{removedCardioIds:\[\.\.\.removedCardioIds\.current\]\}\)/g) || []).length >= 5);
const migration = readFileSync('supabase/migrations/20261108230000_keep_synced_cardio.sql', 'utf8');
check('the server no longer wipes synced sessions a save left out', /coalesce\(client_key,''\) !~ '\^\(garmin\|strava\|garmin-export\)-'/.test(migration) && /removedCardioIds/.test(migration));

console.log('\nOne button on the synced-day card');
const card = readFileSync('src/components/StravaReviewModal.tsx', 'utf8');
check('"Looks right" is gone', !/>Looks right/.test(card));
check('the one button names the day it saves to', /Save to \{saveDayLabel\}/.test(card));
check('with nothing added it saves the day as synced', /if \(!hasAnswer\) \{\n\s+const \{ id, \.\.\.asSynced \} = record;\n\s+const result = updateRecord\(id, asSynced\);/.test(card));
check('the button is never greyed out waiting for input', !/disabled=\{busy \|\| !hasAnswer\}/.test(card));
const builder = readFileSync('src/components/CardioBuilder.tsx', 'utf8');
check('the logger\'s synced run says it is saved, with no Looks right', /✓ Saved to this day/.test(builder) && !/>Looks right/.test(builder));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
