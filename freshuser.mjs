/* A BRAND-NEW ATHLETE'S FIRST TEN MINUTES, driven for real at phone width.

   The audit of 2026-09-21 found five things a new user hit before their
   first workout was done: Today and Plan naming different days, the logger
   flipping to tomorrow's day the moment a set was saved, goal fields taking
   "315 lbs!!", one run earning "out of reach — try next year", and a HYROX
   day chosen from the split arriving empty. Each is pinned here. */
import { chromium } from 'playwright';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const fresh = async () => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await c.newPage(); return { c, p }; };
const text = p => p.evaluate(() => document.body.innerText);
const tapText = async (p, t, i = 0) => { const loc = p.locator(`text=${t}`); await loc.nth(i).scrollIntoViewIfNeeded(); await loc.nth(i).click(); await p.waitForTimeout(450); };
const visibleInputs = async p => { const out = []; for (const i of await p.$$('input')) if (await i.isVisible()) out.push(i); return out; };
const setDial = async (p, btnIndex, values) => { const btns = await p.$$('.dial-field-button'); await btns[btnIndex].scrollIntoViewIfNeeded(); await btns[btnIndex].click(); await p.waitForTimeout(500); const wheels = await p.$$('.dial-wheel'); for (let k = 0; k < values.length; k++) { await wheels[k].evaluate((e, v) => { const it = [...e.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === String(v)); it?.scrollIntoView({ block: 'center' }); }, values[k]); await p.waitForTimeout(400); } await tapText(p, 'OK'); };
const killPill = p => p.evaluate(() => document.querySelector('.update-ready-pill')?.remove());
const start = async (p, name, focus) => {
  await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
  await tapText(p, 'I understand and accept this.'); await tapText(p, 'Continue to setup'); await p.waitForTimeout(900);
  await p.fill('input', name); await tapText(p, focus); await tapText(p, 'Continue →'); await p.waitForTimeout(600);
  await tapText(p, 'I’ll report pain'); await tapText(p, 'Continue →'); await p.waitForTimeout(600);
  await tapText(p, 'Set your first goal'); await p.waitForTimeout(400);
};
const finishSetup = async (p, mapLifts) => {
  await tapText(p, 'Create Goal'); await p.waitForTimeout(500); await tapText(p, 'Continue →'); await p.waitForTimeout(800);
  if (mapLifts) await mapLifts();
  await tapText(p, 'Continue →'); await p.waitForTimeout(700); await tapText(p, 'Continue →'); await p.waitForTimeout(900);
  await tapText(p, 'Enter Forge'); await p.waitForTimeout(2800); await killPill(p);
};
const between = (t, a, len) => { const i = t.indexOf(a); return i < 0 ? '' : t.slice(i, i + len); };

/* ---------- Strength-only ---------- */
{
  const { c, p } = await fresh();
  await start(p, 'Sam', 'Strength');
  await tapText(p, 'Set a real one-rep max target'); await tapText(p, 'Continue →'); await p.waitForTimeout(600);
  console.log('\nGoal fields refuse junk');
  let ins = await visibleInputs(p);
  await ins[0].fill('two seventy five'); await ins[1].fill('315 lbs!!'); await ins[2].fill('2026-12-15');
  await p.locator('button:has-text("Continue →")').first().click(); await p.waitForTimeout(400);
  let t = await text(p);
  check('"315 lbs!!" is refused with a message under the field', (t.match(/Numbers only/g) || []).length >= 1, t.slice(0, 200));
  check('and the builder stays on step 2', /STEP 2 OF 3/.test(t));
  ins = await visibleInputs(p); await ins[0].fill('275'); await ins[1].fill('315');
  await p.locator('button:has-text("Continue →")').first().click(); await p.waitForTimeout(600);
  t = await text(p);
  check('a clean number goes through as "315 LB SQUAT"', /315 LB SQUAT/.test(t), between(t, 'GOAL SUMMARY', 60));

  await finishSetup(p, async () => {
    const t4 = await text(p);
    check('the 4-day strength starter has four different day names', /Chest & Back 2/.test(t4), between(t4, 'Chest & Back', 40));
    await tapText(p, 'Bench Press'); await tapText(p, 'Shoulders & Arms'); await p.waitForTimeout(250); await tapText(p, 'Overhead Press');
    await tapText(p, 'Lower Body'); await p.waitForTimeout(250); const chips = p.locator('button:has-text("Back Squat")'); await chips.nth((await chips.count()) - 1).click(); await p.waitForTimeout(250);
    await tapText(p, 'Chest & Back 2'); await p.waitForTimeout(250); await tapText(p, 'Barbell Row');
  });

  console.log('\nToday and Plan name the same day');
  const home = await text(p);
  const todayDay = between(home, 'NEXT IN YOUR SPLIT\n', 60).split('\n')[1];
  await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForTimeout(2200);
  const plan = await text(p);
  const planDay = between(plan, 'TODAY ·', 80).split('\n')[1];
  check(`Today says ${todayDay}`, todayDay === 'Chest & Back', todayDay);
  check('and the Plan tab says the same', planDay === todayDay, planDay);
  check('the goal lift sits on Lower Body, not the first strength day', !/TODAY[^]*?Back Squat[^]*?THIS WEEK/.test(plan) && /Lower Body\nTop set · Back Squat/.test(plan), between(plan, 'TODAY ·', 120));

  console.log('\nThe logger keeps its day until it is finished');
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1200);
  await tapText(p, 'Start workout'); await p.waitForTimeout(1800);
  await tapText(p, 'Bench Press'); await p.waitForTimeout(600);
  await setDial(p, 0, [100, 85]); await setDial(p, 1, [5]);
  await tapText(p, 'Save top set'); await p.waitForTimeout(1000);
  t = await text(p);
  check('after saving a set the header still says Chest & Back', /LOGGING ·[^\n]*\nCHEST & BACK/.test(t), between(t, 'LOGGING ·', 45));
  check('and split position 1', /SPLIT POSITION 1/.test(t));
  const btn = await p.$('button.save-workout'); await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(2000);
  check('Finish Day leaves the logger', /#\/$/.test(p.url()), p.url());
  t = await text(p);
  check('and Home shows the day complete with the set on it', /TODAY · COMPLETE\nChest & Back/.test(t) && /185 lb ×5/.test(t), between(t, 'TODAY ·', 80));
  check('no check-in interrupts a day already trained', !/how are you holding up/.test(t));
  await c.close();
}

/* ---------- Endurance-only ---------- */
{
  const { c, p } = await fresh();
  await start(p, 'Riley', 'Endurance');
  await tapText(p, 'Improve race time'); await tapText(p, 'Continue →'); await p.waitForTimeout(600);
  const ins = await visibleInputs(p); await ins[0].fill('25:30'); await ins[1].fill('22'); await ins[2].fill('2026-11-20');
  await p.locator('button:has-text("Continue →")').first().click(); await p.waitForTimeout(600);
  console.log('\nA bare "22" is twenty-two minutes');
  let t = await text(p);
  check('the summary reads 22:00', /5K RUN · 22:00/.test(t), between(t, 'GOAL SUMMARY', 40));
  await finishSetup(p);
  t = await text(p);
  check('and the first quality session is paced off 22:00, not 22 seconds', /1:4\d per rep/.test(t), between(t, 'CARDIO', 100));

  console.log('\nOne run is not a verdict');
  await tapText(p, 'Start workout'); await p.waitForTimeout(1800);
  await tapText(p, 'Add cardio'); await p.waitForTimeout(600);
  await (await p.$('textarea')).fill('ran 3.1 miles in 26 mins'); await tapText(p, 'Log it'); await p.waitForTimeout(3000);
  t = await text(p);
  check('no "Forge checked your goals" modal after the first run', !/FORGE CHECKED YOUR GOALS/.test(t));
  const btn = await p.$('button.save-workout'); await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(1800);
  await p.evaluate(() => { location.hash = '#/goals'; }); await p.waitForTimeout(1800);
  t = await text(p);
  check('the goal list says "Too early", not "Out of reach"', /Too early/.test(t) && !/Out of reach/.test(t), between(t, 'FINISH TIME', 40));
  const card = await p.$('.goal-card, [class*=goal-card]'); await card.click(); await p.waitForTimeout(900);
  t = await text(p);
  check('the card says so in words, with the count', /TOO EARLY TO CALL[^]*1 run on file/.test(t), between(t, 'TOO EARLY', 120));
  await c.close();
}

/* ---------- Hybrid with a HYROX day ---------- */
{
  const { c, p } = await fresh();
  await start(p, 'Marcus', 'Hybrid');
  await tapText(p, 'Improve race time'); await tapText(p, 'Continue →'); await p.waitForTimeout(600);
  for (const s of await p.$$('select')) { const opts = await s.evaluate(e => [...e.options].map(o => o.text)); if (opts.includes('HYROX')) { await s.selectOption({ label: 'HYROX' }); break; } }
  await p.waitForTimeout(500);
  const ins = await visibleInputs(p); await ins[1].fill('80'); await ins[2].fill('2026-12-12');
  await p.locator('button:has-text("Continue →")').first().click(); await p.waitForTimeout(600);
  console.log('\nHYROX from the split picker');
  let t = await text(p);
  check('"80" with hh:mm:ss is 1:20:00', /HYROX · 1:20:00/.test(t), between(t, 'GOAL SUMMARY', 40));
  await finishSetup(p, async () => {
    await tapText(p, 'Bench Press'); await tapText(p, 'Shoulders & Arms'); await p.waitForTimeout(250); await tapText(p, 'Overhead Press');
    await tapText(p, 'Lower Body'); await p.waitForTimeout(250); const chips = p.locator('button:has-text("Back Squat")'); await chips.nth((await chips.count()) - 1).click(); await p.waitForTimeout(250);
  });
  await p.evaluate(() => { location.hash = '#/split'; }); await p.waitForTimeout(1800);
  await tapText(p, 'Quality Cardio'); await p.waitForTimeout(500); await tapText(p, 'Forge writes the race session'); await p.waitForTimeout(700);
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1200);
  await tapText(p, 'Change day'); await p.waitForTimeout(1800);
  for (const s of await p.$$('select')) { if (!(await s.isVisible())) continue; const opts = await s.evaluate(e => [...e.options].map(o => o.text)); const o = opts.find(x => /Quality Cardio/.test(x)); if (o) { await s.selectOption({ label: o }); break; } }
  await p.waitForTimeout(1800);
  t = await text(p);
  check('the day card says HYROX, capitalised', /HYROX — Forge wrote the session/.test(t), between(t, 'SPLIT POSITION', 60));
  check('the planned session is on the page with its stations', /HYROX stations · front half/.test(t) && /Sled Push\n50 m · 152 kg/.test(t), between(t, 'PLANNED', 200));
  check('and a time field to log it', /Your time/.test(t));
  await c.close();
}

await b.close();
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
