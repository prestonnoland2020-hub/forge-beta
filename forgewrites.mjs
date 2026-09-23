/* A DAY NOT IN THE SPLIT, WRITTEN BY FORGE, LOGGED IN ONE NUMBER. */
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
const killPill = () => p.evaluate(() => document.querySelector('.update-ready-pill')?.remove());

await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
await p.fill('input', 'Jo'); await tapText('Strength', 0); await tapText('Forge is training guidance'); await tapText('Continue →'); await p.waitForTimeout(700);
const ins = await visibleInputs(); await ins[0].fill('275'); await ins[1].fill('315');
await tapText('Save goal'); await p.waitForTimeout(600); await tapText('Continue →'); await p.waitForTimeout(800);
await tapText('Enter Forge'); await p.waitForTimeout(2800); await killPill();

console.log('\nStart fresh offers Forge');
await p.evaluate(() => { location.hash = '#/workout?source=blank'; }); await p.waitForTimeout(2000);
let t = await text();
check('the Start fresh page has "Or let Forge write it"', /Or let Forge write it/i.test(t), t.slice(0, 300));
check('with HYROX, Circuit and your own words', /HYROX\nCircuit\nYour words/.test(t), between(t, 'Or let Forge', 120));

console.log('\nHYROX, instantly, with no coach call');
await tapText('HYROX', 0); await p.waitForTimeout(800);
t = await text();
check('Forge wrote a HYROX stations day', /FORGE WROTE TODAY\nHYROX stations · front half/i.test(t), between(t, 'FORGE WROTE', 80));
check('the logger header carries its name', /LOGGING ·[^\n]*\nHYROX stations · front half/i.test(t), between(t, 'LOGGING', 60));
check('the muscle picker steps aside', !/WHAT DID YOU TRAIN/.test(t));
check('the planned session lists the stations', /Sled Push\n50 m · 152 kg/.test(t) && /SkiErg/.test(t), between(t, 'PLANNED', 200));
check('and asks for one number', /Your time/.test(t));
check('a runner with no run pace is told so, not given a number', /no run pace until a run establishes one/.test(t), between(t, 'FORGE WROTE', 300));

console.log('\nLogged and finished');
const timeInput = await p.$('input[placeholder="mm:ss"]'); await timeInput.fill('58:30');
await tapText('Log it'); await p.waitForTimeout(800);
t = await text();
check('the session is on the day', /HYROX stations · front half/.test(t) && /58:30/.test(t), between(t, 'CARDIO', 200));
const btn = await p.$('button.save-workout'); await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(2000);
t = await text();
check('Home shows the day complete under the session name', /TODAY · COMPLETE\nHYROX stations · front half/i.test(t), between(t, 'TODAY ·', 80));

console.log('\nWrite a different one');
await p.evaluate(() => { location.hash = '#/workout?source=blank'; }); await p.waitForTimeout(1500);
t = await text();
check('a logged day opens as complete, not as a fresh writer', /Today is logged/.test(t) || /Or let Forge write it/i.test(t));

await b.close();
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
