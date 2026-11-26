/* SETUP, WALKED AS THE PEOPLE IT IS FOR.

   Sarah wanted guided workouts, a body-weight goal and to get stronger, and
   setup could not hear it: "Coach me" ended on the spot with no goal, and the
   goal path took one focus. Each block below is one new athlete going through
   the whole flow at phone width, and what they must find on the other side. */
import { chromium } from 'playwright';
import { onboard } from './onboardflow.mjs';
const BASE = 'http://localhost:4191';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const fresh = async () => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await c.newPage(); const errors = []; p.on('pageerror', e => errors.push(String(e))); return { c, p, errors }; };
const text = p => p.evaluate(() => document.body.innerText);
const tap = async (p, label) => { const ok = await p.evaluate(l => { const el = [...document.querySelectorAll('button,a,label')].filter(x => x.offsetParent && !x.disabled && x.innerText.trim().startsWith(l)).pop(); el?.click(); return Boolean(el); }, label); await p.waitForTimeout(800); if (!ok) throw new Error(`no "${label}" on: ${(await text(p)).slice(0, 160)}`); };
const store = p => p.evaluate(() => {
  const all = {}; for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); all[k] = localStorage.getItem(k); }
  const setupKey = Object.keys(all).find(k => k.startsWith('forge-athlete-setup-v1')); const goalsKey = Object.keys(all).find(k => /goals/i.test(k) && /^\[/.test(all[k] || ''));
  return { setup: JSON.parse(all[setupKey] || 'null'), goals: goalsKey ? JSON.parse(all[goalsKey]) : [], prefs: JSON.parse(all['forge-guided-prefs-v1'] || 'null'), plan: JSON.parse(all['forge-training-plan-v1'] || 'null') };
});
const flat = t => t.replace(/\n+/g, ' | ');

console.log('\nSarah: stronger and a body weight, coach builds it, at the gym');
{
  const { c, p, errors } = await fresh();
  const inputs = async () => { const out = []; for (const i of await p.$$('input.ob-input:not([type=date])')) if (await i.isVisible()) out.push(i); return out; };
  await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2300);
  for (const box of await p.locator('input[type=checkbox]').all()) if (await box.isVisible()) await box.check();
  await tap(p, 'Continue'); await p.fill('input[aria-label="Your name"]', 'Sarah'); await tap(p, 'Continue');
  let t = await text(p);
  check('asks what she wants, pick-any', /What do you want\?/.test(t) && /Pick all that apply/.test(t), flat(t).slice(0, 120));
  check('Continue waits for a pick', await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Continue')?.disabled) === true);
  await tap(p, 'Get stronger'); await tap(p, 'Change my weight');
  check('two are ticked at once', await p.evaluate(() => document.querySelectorAll('.ob-card[aria-checked="true"]').length) === 2);
  await tap(p, 'Continue');
  await tap(p, 'I know what'); t = await text(p);
  check('"I know what I’m doing" explains top sets', /one top set per lift/i.test(t) && /no filler/i.test(t));
  await tap(p, 'Build it for me'); t = await text(p);
  check('"Build it for me" explains the coach', /talks you through every set/i.test(t) && !/no filler/i.test(t));
  await tap(p, 'Continue'); t = await text(p);
  check('asks what kind of training', /What kind of training\?/.test(t) && /Pilates/.test(t) && /Hybrid/.test(t) && /Home/.test(t), flat(t).slice(0, 160));
  await tap(p, 'Gym'); await tap(p, '3'); t = await text(p);
  check('a lift goal is asked, and a coached athlete may skip it', /Which lift do you want to improve\?/.test(t) && /Not sure yet\? Skip/.test(t), flat(t).slice(0, 160));
  await tap(p, 'Squat');
  let f = await inputs(); await f[0].fill('135'); await f[1].fill('95'); await tap(p, '12 weeks'); await tap(p, 'Continue'); t = await text(p);
  check('then the body-weight goal — both, not one', /What weight are you aiming for\?/.test(t), flat(t).slice(0, 120));
  f = await inputs(); await f[0].fill('140'); await f[1].fill('152'); await tap(p, '12 weeks'); await tap(p, 'Continue'); t = await text(p);
  check('the last screen says it back', /You’re set, Sarah/.test(t) && /3 days · gym workouts/.test(t) && /135 lb Squat/.test(t) && /Reach 140 lb/.test(t), flat(t).slice(0, 400));
  check('with no lift-mapping screen for her', !/Tap a day to swap lifts/.test(t));
  await tap(p, 'Start with my coach'); await p.waitForTimeout(3200);
  t = await text(p); const s = await store(p);
  check('she lands on Today with her plan, guided', /TODAY, GUIDED/i.test(t) && !/Set up my coach/.test(t), flat(t).slice(0, 300));
  check('Coach me is the first tab for her', await p.evaluate(() => document.querySelector('.ct-switch button')?.innerText.trim()) === 'Coach me');
  /* A look at My plan does not move her there: next open is guided again. */
  await tap(p, 'My plan'); let look = await text(p);
  check('My plan is still one tap away', /What are you training today/i.test(look), flat(look).slice(0, 200));
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2300); look = await text(p);
  check('and the next open is the guided workout again, not the top-set card', /TODAY, GUIDED/i.test(look) && !/What are you training today/i.test(look), flat(look).slice(0, 240));
  /* Even on a phone that had My plan saved from before. */
  await p.evaluate(() => localStorage.setItem('forge-today-mode', 'plan')); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2300); look = await text(p);
  check('a saved My plan from before does not win either', /TODAY, GUIDED/i.test(look), flat(look).slice(0, 240));
  check('both goals were saved', s.goals.length === 2 && s.goals.some(g => g.type === 'Strength' && /Squat/.test(g.exercise)) && s.goals.some(g => g.type === 'Body Composition'), JSON.stringify(s.goals.map(g => g.title)));
  check('her wants, mode and style are on her profile', JSON.stringify(s.setup?.wants) === '["strength","weight"]' && s.setup?.trainingMode === 'coach' && s.setup?.guidedStyle === 'Gym');
  check('a 3-day lifting week with her goal lift in it, and no run', (s.plan?.days || []).filter(d => d.dayType === 'strength').length === 3 && !(s.plan?.days || []).some(d => d.dayType === 'cardio') && (s.plan?.days || []).some(d => (d.exercises || []).some(e => /Squat/.test(e))), (s.plan?.days || []).map(d => `${d.name}:${(d.exercises || []).join('/')}`).join(', '));
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  await c.close();
}

console.log('\nPilates, coach builds it, just get fit');
{
  const { c, p, errors } = await fresh();
  await onboard(p, { base: BASE, name: 'Mia', wants: ['Just get fit'], coach: true, style: 'Pilates', days: '3' });
  const t = await text(p); const s = await store(p);
  check('Today is the coach’s pick, Pilates at home', /YOUR COACH PICKED/i.test(t) && /Pilates at home/i.test(t), flat(t).slice(0, 400));
  check('no barbell day was written for her', (s.plan?.days || []).every(d => !(d.exercises || []).length), (s.plan?.days || []).map(d => `${d.name}:${(d.exercises || []).join('/')}`).join(', '));
  check('3 Pilates days and 4 rest days', (s.plan?.days || []).filter(d => /^Pilates/.test(d.name)).length === 3 && (s.plan?.days || []).filter(d => d.dayType === 'rest').length === 4);
  check('no goal was forced on her', s.goals.length === 0 && s.setup?.trainingMode === 'coach');
  check('the coach is set up for Pilates on a mat', s.prefs?.styles?.[0] === 'Pilates' && s.prefs?.gear?.includes('Mat'));
  await tap(p, 'Start with my coach'); await p.waitForTimeout(2500);
  const g = await text(p);
  check('Start opens a guided workout, not a setup form', !/What do you enjoy\?/.test(g) && /min|Start|Begin|Let.s go/i.test(g), flat(g).slice(0, 300));
  /* The other tabs survive a week with no lifts in it. */
  for (const path of ['plan', 'goals', 'profile']) { await p.goto(`${BASE}/#/${path}`); await p.waitForTimeout(1800); const body = await text(p); check(`/${path} opens`, body.length > 80 && !/Something went wrong/i.test(body), flat(body).slice(0, 160)); }
  await p.goto(`${BASE}/#/plan`); await p.waitForTimeout(1800);
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  await c.close();
}

console.log('\nHome with dumbbells, a body weight and a 5K');
{
  const { c, p, errors } = await fresh();
  await onboard(p, { base: BASE, name: 'Jo', wants: ['Change my weight', 'Run faster'], coach: true, style: 'Home', gear: ['Dumbbells'], days: '4', race: '5K', raceTarget: '28:00', weightTarget: '160', weightCurrent: '172', weeklyRun: 'Under 10 miles' });
  const t = await text(p); const s = await store(p);
  check('both goals saved: the race and the body weight', s.goals.length === 2 && s.goals.some(g => g.type === 'Endurance' && /5K/.test(g.exercise)) && s.goals.some(g => g.type === 'Body Composition'), JSON.stringify(s.goals.map(g => g.title)));
  check('the week alternates home workouts and runs', (s.plan?.days || []).filter(d => d.dayType === 'cardio').length === 2 && (s.plan?.days || []).filter(d => /^Home workout/.test(d.name)).length === 2, (s.plan?.days || []).map(d => d.name).join(', '));
  check('the coach knows she has dumbbells at home', s.prefs?.place === 'Home' && s.prefs?.gear?.includes('Dumbbells'));
  check('Today is the coach’s pick', /YOUR COACH PICKED/i.test(t), flat(t).slice(0, 300));
  /* A run day, with the coach in charge, is the run. */
  await tap(p, 'My plan'); await tap(p, 'Day 2'); await p.waitForTimeout(600);
  const planSide = await text(p);
  await tap(p, 'Coach me'); await p.waitForTimeout(600);
  const r = await text(p);
  check('on the run day the coach shows the run', /TODAY’S RUN/i.test(r) && /Open today’s run/.test(r), `plan side: ${flat(planSide).slice(0, 260)} || coach side: ${flat(r).slice(0, 300)}`);
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  await c.close();
}

console.log('\nRunning her own workouts: stronger, faster and a body weight');
{
  const { c, p, errors } = await fresh();
  await onboard(p, { base: BASE, name: 'Kim', wants: ['Get stronger', 'Change my weight', 'Run faster'], days: '4', lift: 'Bench', target: '185', current: '155', race: '10K', raceTarget: '55:00', weightTarget: '150', weightCurrent: '158' });
  const t = await text(p); const s = await store(p);
  check('three goals saved', s.goals.length === 3, JSON.stringify(s.goals.map(g => g.title)));
  check('she is on My plan, logging top sets', s.setup?.trainingMode === 'goals' && /What are you training today/i.test(t), flat(t).slice(0, 260));
  check('her goal lift leads its day', (s.plan?.days || []).some(d => /Bench/.test((d.exercises || [])[0] || '')), (s.plan?.days || []).map(d => `${d.name}:${(d.exercises || []).join('/')}`).join(', '));
  check('a hybrid week', (s.plan?.days || []).some(d => d.dayType === 'cardio') && (s.plan?.days || []).some(d => d.dayType === 'strength'));
  /* Editing the profile later: the wants are remembered, nothing is re-asked. */
  await p.goto(`${BASE}/#/onboarding`); await p.waitForTimeout(1800);
  await tap(p, 'Continue');
  const w = await text(p);
  const ticked = await p.evaluate(() => [...document.querySelectorAll('.ob-card[aria-checked="true"] strong')].map(x => x.innerText));
  check('editing shows what she picked', /What do you want\?/.test(w) && ticked.length === 3, JSON.stringify(ticked));
  await tap(p, 'Continue'); const d = await text(p);
  check('and goes straight on to days — no mode or goal screens again', /How many days a week/.test(d), flat(d).slice(0, 120));
  await tap(p, '4'); await p.waitForTimeout(400);
  let e = await text(p);
  if (/How much do you run/.test(e)) { await tap(p, '10–20 miles'); e = await text(p); }
  check('then her week, to save', /Your week/.test(e) && /Save/.test(e), flat(e).slice(0, 200));
  await tap(p, 'Save'); await p.waitForTimeout(2500);
  const after = await store(p);
  check('saving keeps her three goals and her lifts', after.goals.length === 3 && (after.plan?.days || []).some(d2 => /Bench/.test((d2.exercises || []).join())), JSON.stringify(after.goals.map(g => g.title)));
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  await c.close();
}

console.log('\nRunning his own workouts, just wants to get fit');
{
  const { c, p, errors } = await fresh();
  await onboard(p, { base: BASE, name: 'Lee', wants: ['Just get fit'], days: '3', lift: 'Deadlift', target: '315', current: '225' });
  const s = await store(p);
  check('one goal, his pick', s.goals.length === 1 && /Deadlift/.test(s.goals[0].exercise || ''), JSON.stringify(s.goals.map(g => g.title)));
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  await c.close();
}

console.log('\nHybrid with the coach, skipping the lift goal');
{
  const { c, p, errors } = await fresh();
  await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2300);
  for (const box of await p.locator('input[type=checkbox]').all()) if (await box.isVisible()) await box.check();
  await tap(p, 'Continue'); await p.fill('input[aria-label="Your name"]', 'Ana'); await tap(p, 'Continue');
  await tap(p, 'Get stronger'); await tap(p, 'Continue'); await tap(p, 'Build it for me'); await tap(p, 'Continue'); await tap(p, 'Hybrid'); await tap(p, '4');
  await tap(p, 'Not sure yet');
  let t = await text(p);
  check('skipping the lift goal moves on to running', /How much do you run/.test(t), flat(t).slice(0, 160));
  await tap(p, 'Not running yet');
  t = await text(p);
  check('"you’re set" says gym and running, and names no made-up target', /4 days · gym and running/.test(t) && /Get stronger, set by set/.test(t), flat(t).slice(0, 300));
  await tap(p, 'Start with my coach'); await p.waitForTimeout(3200);
  const s = await store(p); t = await text(p);
  check('no goal saved, and she is in', s.goals.length === 0 && /TODAY, GUIDED/i.test(t), flat(t).slice(0, 200));
  check('her week has a run in it', (s.plan?.days || []).some(d => d.dayType === 'cardio'));
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  await c.close();
}

console.log('\nSent back through setup with a lift goal, now wanting a body weight too');
{
  const { c, p, errors } = await fresh();
  await onboard(p, { base: BASE, name: 'Sarah', focus: 'Get stronger', days: '3', lift: 'Squat', target: '135', current: '95' });
  /* Her account is reset: setup is no longer complete, her goal is still there. */
  await p.evaluate(() => { for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (k.startsWith('forge-athlete-setup-v1')) { const v = JSON.parse(localStorage.getItem(k)); v.completedAt = ''; localStorage.setItem(k, JSON.stringify(v)); } } });
  await p.goto(`${BASE}/#/`); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2300);
  let t = await text(p);
  check('she starts setup from the top', /Before we start/.test(t), flat(t).slice(0, 120));
  for (const box of await p.locator('input[type=checkbox]').all()) if (await box.isVisible()) await box.check();
  await tap(p, 'Continue'); await p.fill('input[aria-label="Your name"]', 'Sarah'); await tap(p, 'Continue');
  await tap(p, 'Get stronger'); await tap(p, 'Change my weight'); await tap(p, 'Continue');
  await tap(p, 'Build it for me'); await tap(p, 'Continue'); await tap(p, 'Gym'); await tap(p, '3');
  t = await text(p);
  check('the lift goal she has is not asked again; the weight goal is', /What weight are you aiming for\?/.test(t), flat(t).slice(0, 160));
  const f = []; for (const i of await p.$$('input.ob-input:not([type=date])')) if (await i.isVisible()) f.push(i);
  await f[0].fill('140'); await f[1].fill('152'); await tap(p, 'Continue');
  await tap(p, 'Start with my coach'); await p.waitForTimeout(3200);
  const s = await store(p); t = await text(p);
  check('she ends with both goals, one of each', s.goals.length === 2 && s.goals.filter(g => g.type === 'Strength').length === 1 && s.goals.filter(g => g.type === 'Body Composition').length === 1, JSON.stringify(s.goals.map(g => g.title)));
  check('and is coached, on Today', s.setup?.trainingMode === 'coach' && /TODAY, GUIDED/i.test(t), flat(t).slice(0, 200));
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  await c.close();
}
await b.close();
if (fails) process.exit(1);
