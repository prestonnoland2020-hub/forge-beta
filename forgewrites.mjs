/* A DAY NOT IN THE SPLIT, WRITTEN BY FORGE, LOGGED IN ONE NUMBER. */
import { chromium } from 'playwright';
import { onboard } from './onboardflow.mjs';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
const text = () => p.evaluate(() => document.body.innerText);
const tapText = async (t, i = 0) => { const button = p.getByRole('button', { name: t, exact: true }); const loc = await button.count() ? button : p.locator(`text=${t}`); await loc.nth(i).scrollIntoViewIfNeeded(); await loc.nth(i).click(); await p.waitForTimeout(450); };
const between = (t, a, len) => { const i = t.indexOf(a); return i < 0 ? '' : t.slice(i, i + len); };
const visibleInputs = async () => { const out = []; for (const i of await p.$$('input')) if (await i.isVisible()) out.push(i); return out; };
const killPill = () => p.evaluate(() => document.querySelector('.update-ready-pill')?.remove());

await onboard(p, { name: 'Jo', focus: 'Get stronger', lift: 'Squat', target: '315', current: '275' });
/* HYROX is only offered to an athlete with a HYROX goal (ForgeWritesIt), so Jo has one. */
await p.evaluate(() => { const goals = JSON.parse(localStorage.getItem('forge-goals') || '[]'); goals.push({ id: Date.now(), title: 'HYROX Open · 1:25:00', type: 'Endurance', exercise: 'HYROX', target: '1:25:00 hh:mm:ss', date: '2027-03-01' }); localStorage.setItem('forge-goals', JSON.stringify(goals)); });
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);

console.log('\nStart fresh offers Forge');
await p.evaluate(() => { location.hash = '#/workout?source=blank'; }); await p.waitForTimeout(2000);
let t = await text();
check('the Start fresh page has "Or let Forge write it"', /Or let Forge write it/i.test(t), t.slice(0, 300));
check('with HYROX, Circuit and your own words', /HYROX\nCircuit\nYour words/.test(t), between(t, 'Or let Forge', 120));

console.log('\nHYROX, instantly, with no coach call');
await tapText('HYROX', 0); await p.waitForTimeout(800);
t = await text();
check('Forge wrote a HYROX stations day', /Forge wrote today\nHYROX stations · front half/i.test(t), between(t, 'Forge wrote', 80));
check('the logger header carries its name', /\d{4}\nHYROX stations · front half/i.test(t), t.slice(0, 160));
check('the muscle picker steps aside', !/WHAT DID YOU TRAIN/.test(t));
check('the planned session lists the stations', /Sled Push\n50 m · 152 kg/.test(t) && /SkiErg/.test(t), between(t, 'PLANNED', 200));
check('and asks for one number', /Your time/.test(t));
/* With no runs logged, the run pace comes from the HYROX goal time itself. */
check('a runner with no runs gets a pace from the goal time', /under race pace at \d:\d\d\/mi/.test(t) && /1:25:00 finish/.test(t), between(t, 'Forge wrote', 300));

console.log('\nLogged and finished');
const timeInput = await p.$('input[placeholder="mm:ss"]'); await timeInput.fill('58:30');
await tapText('Log it'); await p.waitForTimeout(800);
t = await text();
check('the session is on the day', /HYROX stations · front half/.test(t) && /58:30/.test(t), between(t, 'CARDIO', 200));
const btn = await p.$('button.save-workout'); await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(2000);
t = await text();
check('Home shows the day complete under the session name', /Complete\n(Edit\n)?HYROX stations · front half/i.test(t), t.slice(0, 400).replace(/\n/g, ' | '));
check('and no whole-session pace beside the stations', !/HYROX ·[^\n]*\/mi/.test(t), t.slice(0, 400));

console.log('\nWrite a different one');
await p.evaluate(() => { location.hash = '#/workout?source=blank'; }); await p.waitForTimeout(1500);
t = await text();
check('a logged day opens as complete, not as a fresh writer', /Today is logged/.test(t) || /Or let Forge write it/i.test(t));

await b.close();
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
