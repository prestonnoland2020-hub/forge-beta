/* Split is the sole source of truth for muscles on plan days; exercises'
   PRIMARY movers drive custom days; Session Details has no muscle picker. */
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const seedPlan = ([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d.filter(x => x.date < '2026-08-23')));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 15, maxWeeklyMileage: 30, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest','Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    { name: 'Lower Body', weekday: 'TUE', dayType: 'strength', muscles: ['Quads','Hamstrings','Glutes'], exercises: ['Back Squat'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ]}));
};
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; };
import { logTopSet } from './dialdriver.mjs';
const fillLift = (p, lift, w, r) => logTopSet(p, lift, w, r);

/* A FRESH DAY ASKS WHAT YOU TRAINED BEFORE IT WILL SAVE A SET — a set with no
   day behind it has nothing to count toward, and the sheet says so rather than
   saving into the void. So the cases below name one muscle first, and the
   assertion is unchanged in spirit: the LIFT contributes its primaries and
   nothing else. Naming Back and logging a pulldown must still not credit
   biceps and forearms. */
const nameDayMuscle = async (p, muscle) => {
  await p.evaluate(name => {
    [...document.querySelectorAll('.muscle-chip')]
      .find(el => (el.textContent || '').trim() === name && !el.classList.contains('active'))?.click();
  }, muscle);
  await p.waitForTimeout(400);
};

let fails = 0;
const check = (label, cond, detail) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + detail}`); if (!cond) fails++; };

// ---- Case 1: plan day, log Bench Press → muscles = exactly the split day's list
{
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  await p.addInitScript(seedPlan, [days, setup, goals]);
  await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1900);
  const pickerGone = await p.evaluate(() => !document.querySelector('.derived-muscles') && !/MUSCLE GROUPS/.test(document.querySelector('.session-details')?.innerText || ''));
  check('Session Details has no muscle picker', pickerGone);
  await fillLift(p, 'Bench Press', '245', '5');
  await p.waitForTimeout(400);
  await (await p.$('button.save-workout')).click();
  await p.waitForTimeout(1200);
  const day = await p.evaluate((iso) => JSON.parse(localStorage.getItem('forge-workout-history-v1')||'[]').find(x => x.date === iso), todayIso());
  check('plan day muscles = split day list exactly', JSON.stringify([...day.muscles].sort()) === JSON.stringify(['Back','Chest']), JSON.stringify(day.muscles));
  check('plan day title kept', day.title === 'Chest & Back', day.title);
  await p.close();
}
// ---- Case 2: blank/custom, log Pull Ups → Back ONLY (no Biceps/Forearms)
{
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  await p.addInitScript(seedPlan, [days, setup, goals]);
  await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1900);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /FRESH|Start fresh/i.test(x.textContent) && x.textContent.length < 24)?.click(); });
  await p.waitForTimeout(600);
  await nameDayMuscle(p, 'Back');
  await fillLift(p, 'Lat Pulldown', '160', '8');
  await p.waitForTimeout(400);
  await (await p.$('button.save-workout')).click();
  await p.waitForTimeout(1200);
  const day = await p.evaluate((iso) => JSON.parse(localStorage.getItem('forge-workout-history-v1')||'[]').find(x => x.date === iso), todayIso());
  check('custom Lat Pulldown → Back only', JSON.stringify(day?.muscles) === JSON.stringify(['Back']), JSON.stringify(day?.muscles));
  await p.close();
}
// ---- Case 3: blank/custom, log Back Squat → Quads+Glutes+Hamstrings
{
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  await p.addInitScript(seedPlan, [days, setup, goals]);
  await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1900);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /FRESH|Start fresh/i.test(x.textContent) && x.textContent.length < 24)?.click(); });
  await p.waitForTimeout(600);
  await nameDayMuscle(p, 'Quads');
  await fillLift(p, 'Back Squat', '315', '3');
  await p.waitForTimeout(400);
  await (await p.$('button.save-workout')).click();
  await p.waitForTimeout(1200);
  const day = await p.evaluate((iso) => JSON.parse(localStorage.getItem('forge-workout-history-v1')||'[]').find(x => x.date === iso), todayIso());
  check('custom Back Squat → 3 primaries', JSON.stringify([...(day?.muscles||[])].sort()) === JSON.stringify(['Glutes','Hamstrings','Quads']), JSON.stringify(day?.muscles));
  await p.close();
}
await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
