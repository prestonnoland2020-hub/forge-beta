/* A REPEAT DAY IS ITS OWN DAY (Nov 19). "Chest & Back" and "Chest & Back 2"
   share a splitDayKey; anything that picks a day's lifts or position by that
   key alone must try the exact name first, or the Plan and Today disagree. */
import { readFileSync } from 'node:fs';
let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails += 1; };
const plan = readFileSync('src/components/PlanView.tsx', 'utf8');
check('Plan reads a day\'s lifts by its exact name first', /exactLifts\.get\(/.test(plan) && !/new Map\(\(splitDays \|\| setup\?\.splitDays \|\| \[\]\)\.map\(day => \[splitDayKey/.test(plan));
const rec = readFileSync('src/features/training/DailyRecommendationProvider.tsx', 'utf8');
check('Today/logger pick a day by exact name before the shared key', /byName=name\?\(days\.find\(item=>exact\(item\.name,name\)\)/.test(rec));
const strava = readFileSync('src/components/StravaReviewModal.tsx', 'utf8');
check('Strava review matches the plan day by exact name first', /exactIndex/.test(strava));
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
