/* ONE ATHLETE, FOUR SCREENS, ONE ANSWER.

   Almost every bug of the last month was two surfaces disagreeing: Today
   and Plan naming different days, the logger flipping to tomorrow, the
   check-in quoting a number the Home card did not. oneauthority.mjs catches
   duplicate CODE; nothing caught duplicate ANSWERS. This drives a fixture
   athlete through the real build at phone width and asserts that Home, the
   Plan tab, the workout logger and the context the coach is handed all say
   the same day, the same lifts, the same numbers — before and after a coach
   override changes today. */
import { chromium } from 'playwright';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
const text = () => p.evaluate(() => document.body.innerText);
const tapText = async (t, i = 0) => { const loc = p.locator(`text=${t}`); await loc.nth(i).scrollIntoViewIfNeeded(); await loc.nth(i).click(); await p.waitForTimeout(450); };
const between = (t, a, len) => { const i = t.indexOf(a); return i < 0 ? '' : t.slice(i, i + len); };
const visibleInputs = async () => { const out = []; for (const i of await p.$$('input')) if (await i.isVisible()) out.push(i); return out; };
const dismissModals = async () => { for (const label of ['Yes, that was real', 'Not now']) { const loc = p.locator(`text=${label}`); if (await loc.count()) { try { await loc.first().click({ timeout: 1500 }); await p.waitForTimeout(400); } catch { /* not blocking */ } } } await p.evaluate(() => document.querySelector('.update-ready-pill')?.remove()); };
const go = async (hash) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(2000); await dismissModals(); return text(); };

/* Every surface's reading of "today", from its own text. */
const readHome = t => ({ day: between(t, 'NEXT IN YOUR SPLIT\n', 80).split('\n')[1], lift: between(t, 'NEXT IN YOUR SPLIT\n', 200).split('\n')[5] });
const readPlan = t => { const block = between(t, 'TODAY ·', 200).split('\n'); const liftLine = block.find(line => /^Top set · |×/.test(line)) || ''; return { day: block[1], lift: liftLine.replace(/^Top set · /, '').split(/:| \d/)[0].trim() }; };
const readLogger = t => ({ day: between(t, 'LOGGING ·', 60).split('\n')[1], position: between(t, 'SPLIT POSITION ', 3).trim() });
const askCoach = async (question) => { await go('#/coach'); await p.fill('textarea', question); await tapText('Send'); await p.waitForTimeout(1200); return p.evaluate(() => window.__forgeCoachContext); };
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase()).replace(/&/g, '&');

/* ---------- A hybrid athlete with two weeks of history ---------- */
await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
await p.fill('input', 'Casey'); await tapText('Hybrid', 0); await tapText('Forge is training guidance'); await tapText('Continue →'); await p.waitForTimeout(700);
const ins = await visibleInputs(); await ins[0].fill('275'); await ins[1].fill('315');
await tapText('Save goal'); await p.waitForTimeout(600); await tapText('Continue →'); await p.waitForTimeout(800);
await tapText('Enter Forge'); await p.waitForTimeout(2800);
const iso = d => { const x = new Date(); x.setDate(x.getDate() - d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const steady = (id, d, miles, minutes) => ({ id, date: iso(d), title: 'Training day', muscles: ['Cardio'], hasCardio: true, cardioSessions: [{ id: `${id}c`, structure: 'steady', activity: 'Run', summary: `Run · ${miles} mi`, prescription: { distance: String(miles), distanceUnit: 'miles', duration: String(minutes) } }] });
const records = [steady('r1', 2, 5, 45), steady('r2', 4, 3, 27), steady('r3', 9, 6, 51),
  { id: 'l1', date: iso(3), title: 'Lower Body', muscles: ['Quads', 'Hamstrings', 'Glutes'], hasCardio: false, topSets: [{ lift: 'Back Squat', weight: 275, reps: 5, muscle: 'Quads', completed: true }] },
  { id: 'l2', date: iso(10), title: 'Lower Body', muscles: ['Quads', 'Hamstrings', 'Glutes'], hasCardio: false, topSets: [{ lift: 'Back Squat', weight: 265, reps: 5, muscle: 'Quads', completed: true }] }];
await p.evaluate(r => localStorage.setItem('forge-workout-history-v1', JSON.stringify(r)), records);
await p.reload(); await p.waitForTimeout(2800); await dismissModals();

console.log('\nThe week reviewed, first');
const homeText = await text();
check('Home opens on the review of last week', /YOUR WEEK\n(1 more\n)?Last week: 3 sessions, 9 mi, a PR \(Back Squat 275 × 5\)\./.test(homeText), between(homeText, 'YOUR WEEK', 120));
check('with what matters, what changes and what is next', /Nothing changes/.test(homeText) && /Next: /.test(homeText), between(homeText, 'YOUR WEEK', 300));
await dismissModals(); await tapText('Got it'); await p.waitForTimeout(500);
check('Got it puts it away for good', !/YOUR WEEK/.test(await text()));

console.log('\nThe same day everywhere');
const home = readHome(await text());
const plan = readPlan(await go('#/plan'));
const logger = readLogger(await go('#/workout?source=recommendation'));
const ctx = await askCoach('what should I train today?');
const coachDay = ctx?.savedDailyRecommendation?.splitDay?.name;
check(`Home says ${home.day}`, Boolean(home.day), JSON.stringify(home));
check('Plan says the same day', plan.day === home.day, `${plan.day} vs ${home.day}`);
check('the logger says the same day', titleCase(logger.day) === titleCase(home.day), `${logger.day} vs ${home.day}`);
check('the coach is told the same day', coachDay === home.day, `${coachDay} vs ${home.day}`);
check('and the deterministic recommendation the coach quotes is that day too', ctx?.deterministicRecommendation?.splitDay?.name === home.day, ctx?.deterministicRecommendation?.splitDay?.name);

console.log('\nThe same lift everywhere');
const coachLift = ctx?.savedDailyRecommendation?.topSets?.[0]?.exercise;
check(`Home leads with ${home.lift}`, Boolean(home.lift), JSON.stringify(home));
check('Plan names the same lift', plan.lift === home.lift, `${plan.lift} vs ${home.lift}`);
check('the coach is handed the same lift', coachLift === home.lift, `${coachLift} vs ${home.lift}`);
const loggerText = await go('#/workout?source=recommendation');
check('the logger offers the same lift', loggerText.includes(home.lift), between(loggerText, 'TOP SET', 120));

console.log('\nThe same numbers everywhere');
const planText = await go('#/plan');
const lowerLine = between(planText, 'Lower Body\n', 60).split('\n')[1];
const planSquat = lowerLine?.match(/Back Squat (\d+)×(\d+)/);
check(`Plan prescribes the squat as ${lowerLine}`, Boolean(planSquat), lowerLine);
await go('#/workout?source=split'); await p.waitForTimeout(600);
for (const s of await p.$$('select')) { if (!(await s.isVisible())) continue; const opts = await s.evaluate(e => [...e.options].map(o => o.text)); const o = opts.find(x => /Lower Body/.test(x)); if (o) { await s.selectOption({ label: o }); break; } }
await p.waitForTimeout(1500);
const loggerLower = await text();
check('the logger prescribes the same squat load and reps', planSquat && loggerLower.includes(`${planSquat[1]}`) && new RegExp(`×\\s*${planSquat[2]}|${planSquat[2]} reps`).test(loggerLower), between(loggerLower, 'Back Squat', 80));
const rf = ctx?.runningFacts;
check('the coach is told 8.0 mi in the last 7 days — the two runs that are there', rf?.last7Days?.miles === 8 && rf.last7Days.runs.length === 2, JSON.stringify(rf?.last7Days));
check('and that the longest run in 30 days is the 6-miler', rf?.longestRun30d?.miles === 6, JSON.stringify(rf?.longestRun30d));
const partial = (ctx?.weeklyRunning || []).find(w => w.partial);
check('weeklyRunning\'s partial week never exceeds the 7-day count', !partial || partial.miles <= 8.01, JSON.stringify(partial));
const history = await go('#/history');
const monthMiles = [[2, 5], [4, 3], [9, 6]].filter(([d]) => iso(d).slice(0, 7) === iso(0).slice(0, 7)).reduce((sum, [, m]) => sum + m, 0);
check(`History's month total is ${monthMiles} — the same runs`, new RegExp(`${monthMiles}(\\.0)?\\nMILES`).test(history), between(history, 'MILES', -40) || history.slice(0, 200));

console.log('\nA coach override moves every surface together');
await go('#/coach'); await p.fill('textarea', 'I need a rest day'); await tapText('Send'); await p.waitForTimeout(1200);
await tapText('Apply'); await p.waitForTimeout(800);
const homeRest = readHome(await go('#/'));
const planRest = readPlan(await go('#/plan'));
const loggerRest = readLogger(await go('#/workout?source=recommendation'));
const ctxRest = await askCoach('what should I train today?');
check('Home says Rest day', homeRest.day === 'Rest day', homeRest.day);
check('Plan says Rest day', planRest.day === 'Rest day', planRest.day);
check('the logger says Rest day', /rest day/i.test(loggerRest.day || ''), loggerRest.day);
check('the coach is told Rest day', ctxRest?.savedDailyRecommendation?.splitDay?.name === 'Rest day', ctxRest?.savedDailyRecommendation?.splitDay?.name);
check('and that no top sets are prescribed', (ctxRest?.savedDailyRecommendation?.topSets || []).length === 0);

await b.close();
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
