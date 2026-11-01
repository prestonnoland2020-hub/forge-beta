/* PERIODS, PREGNANCY, POSTPARTUM: THE COACH HEARS THEM AND THE PLAN CHANGES.

   "I'm pregnant" used to be just words to the plan: Today could still hand
   out a max attempt. Pregnancy and postpartum are now whole-body notes the
   plan reads (lib/bodyLog), the offline coach recognises them, and a rough
   period is a couple of lighter days when she says it is. */
import { readFileSync } from 'node:fs';
import { bodyLogState, PREGNANCY_AREA, POSTPARTUM_AREA } from './src/lib/bodyLog.ts';
import { localActions, moderateRecommendation } from './src/lib/coachActions.ts';
import { needsFollowUp } from './src/features/training/athleteNotesService.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const today = '2026-11-01';
const note = (area, extra = {}) => ({ kind: 'other', area, status: 'active', bufferUntil: '2027-06-01', note: '', ...extra });
const ctx = (areas = []) => ({ splitDays: [], goals: [], activeNoteAreas: areas, exercises: [], weeklyMileage: 15, runningDays: 3, loadBiasPercent: 0 });

console.log('\nPregnancy');
const pregnant = bodyLogState([note(PREGNANCY_AREA, { note: "I'm pregnant, no heavy lifting" })], today);
check('the plan knows', pregnant.pregnant && !pregnant.postpartum);
check('loads come down', pregnant.easing);
check('her words are not read as a list of movements to block', pregnant.blockedMovements.length === 0, JSON.stringify(pregnant.blockedMovements));
check('the card can say what is being worked around', pregnant.restrictions.some(item => /pregnancy/.test(item)));
const told = localActions("I'm pregnant!", ctx());
check('"I\'m pregnant" logs a pregnancy note', told[0]?.type === 'log_note' && told[0].area === PREGNANCY_AREA, JSON.stringify(told));
check('for the length of a pregnancy, not a week', told[0]?.bufferDays === 280);
check('saying it again does not log it twice', localActions("I'm pregnant", ctx([PREGNANCY_AREA])).every(action => action.area !== PREGNANCY_AREA || action.type !== 'log_note'));

console.log('\nNo max attempts while pregnant');
const rec = { topSets: [{ id: 'a', exercise: 'Squat', weight: 300, reps: 1, calculatedMax: 300 }, { id: 'b', exercise: 'Bench', weight: 135, reps: 8, calculatedMax: 170 }], cardio: null };
const moderated = moderateRecommendation(rec);
check('a single becomes a five', moderated.topSets[0].reps === 5, JSON.stringify(moderated.topSets[0]));
check('at a moderate load', moderated.topSets[0].weight < 300 * 0.85, String(moderated.topSets[0].weight));
check('an eight is left as it is', moderated.topSets[1].reps === 8 && moderated.topSets[1].weight === 135);

console.log('\nPostpartum');
const born = localActions('I had my baby last week', ctx([PREGNANCY_AREA]));
check('the pregnancy note clears', born.some(action => action.type === 'clear_note' && action.area === PREGNANCY_AREA), JSON.stringify(born));
check('a postpartum note starts', born.some(action => action.type === 'log_note' && action.area === POSTPARTUM_AREA));
const after = bodyLogState([note(POSTPARTUM_AREA)], today);
check('no running yet', after.postpartum && after.blocksRunning);
check('and no jumping', after.blockedMovements.some(pattern => /jump/.test(pattern)));
const cleared = localActions("My doctor cleared me, I'm cleared to run", ctx([POSTPARTUM_AREA]));
check('"cleared" ends it', cleared.length === 1 && cleared[0].type === 'clear_note' && cleared[0].area === POSTPARTUM_AREA, JSON.stringify(cleared));

console.log('\nA rough period');
const period = localActions('Bad cramps, my period is wiping me out', ctx());
check('is a short lighter stretch', period[0]?.type === 'log_note' && period[0].noteKind === 'fatigue' && period[0].bufferDays === 2, JSON.stringify(period));
const oneDay = localActions('Rough period today, so tired', ctx());
check('"today" means just today', oneDay[0]?.bufferDays === 1 && /for 1 day\b/.test(oneDay[0].label), oneDay[0]?.label);
check('a passing mention changes nothing', localActions('My period started today', ctx()).length === 0);

console.log('\nNo daily "how is the pregnancy today?"');
check('pregnancy is never a daily check-in', !needsFollowUp({ kind: 'other', area: 'Pregnancy', status: 'active', bufferUntil: '2027-06-01', reportedAt: '2026-10-01', followUps: [] }));
check('an injury still is', needsFollowUp({ kind: 'injury', area: 'knee', status: 'active', bufferUntil: '2027-06-01', reportedAt: '2026-10-01', followUps: [] }));

console.log('\nThe AI coach is told');
const coach = readFileSync('./supabase/functions/forge-coach/index.ts', 'utf8');
check('it may log pregnancy and postpartum', /'pregnancy', 'postpartum'/.test(coach));
check('it has women\'s-health rules', /WOMEN'S HEALTH/.test(coach) && /clinician's guidance always overrides Forge/.test(coach));
check('and the app sends the athlete\'s sex', /athleteSex:setup\?\.sex/.test(readFileSync('./src/pages/CoachPage.tsx', 'utf8')));

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
