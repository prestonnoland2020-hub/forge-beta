/* THE COACH ACTS, ON A PHONE, END TO END. A new athlete tells the coach
   what happened; the confirm card shows what would change; one tap changes
   Today. In the preview build the coach cannot be reached, so the offline
   stand-in supplies the actions — the card, Apply, the override and the
   Today card are the same code either way. */
import { chromium } from 'playwright';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
const text = () => p.evaluate(() => document.body.innerText);
const tapText = async (t, i = 0) => { const loc = p.locator(`text=${t}`); await loc.nth(i).scrollIntoViewIfNeeded(); await loc.nth(i).click(); await p.waitForTimeout(450); };
const between = (t, a, len) => { const i = t.indexOf(a); return i < 0 ? '' : t.slice(i, i + len); };
const killPill = () => p.evaluate(() => document.querySelector('.update-ready-pill')?.remove());
const visibleInputs = async () => { const out = []; for (const i of await p.$$('input')) if (await i.isVisible()) out.push(i); return out; };

await p.goto('http://localhost:4191/#/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
await p.fill('input', 'Dana'); await tapText('Strength', 0); await tapText('Forge is training guidance'); await tapText('Continue →'); await p.waitForTimeout(700);
const ins = await visibleInputs(); await ins[0].fill('275'); await ins[1].fill('315');
await tapText('Save goal'); await p.waitForTimeout(600); await tapText('Continue →'); await p.waitForTimeout(800);
await tapText('Enter Forge'); await p.waitForTimeout(2800); await killPill();
let t = await text();
const todayBefore = between(t, 'NEXT IN YOUR SPLIT\n', 60).split('\n')[1];
check(`Today starts as ${todayBefore}`, todayBefore === 'Chest & Back', todayBefore);

console.log('\n"My knee hurts and I only have 30 minutes"');
await p.evaluate(() => { location.hash = '#/coach'; }); await p.waitForTimeout(1500);
await p.fill('textarea', 'my knee hurts and I only have 30 minutes today'); await tapText('Send'); await p.waitForTimeout(1500);
t = await text();
check('the card says what Forge would change', /FORGE WOULD CHANGE/.test(t), between(t, 'FORGE', 200));
check('knee goes to the body log', /Body log: knee — train around it/.test(t), between(t, 'FORGE WOULD CHANGE', 200));
check('and today is trimmed to 30 minutes', /Today fits in 30 minutes/.test(t));
check('nothing has changed yet — Apply and Not now are offered', /Apply/.test(t) && /Not now/.test(t));
await tapText('Apply'); await p.waitForTimeout(900);
t = await text();
check('the coach confirms in one message', /Done:/.test(t) && /Body log: knee/.test(t), between(t, 'Done', 160));
check('the card is gone', !/FORGE WOULD CHANGE/.test(t));
check('the knee shows in TRAINING AROUND', /TRAINING AROUND\nKnee/i.test(t), between(t, 'TRAINING AROUND', 40));

console.log('\nToday changed');
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1800);
t = await text();
check('the Today card says it was trimmed', /Trimmed to fit 30 minutes/.test(t), between(t, 'NEXT IN YOUR SPLIT', 300));
check('a chest day is untouched by a knee — no body-log line', !/in your body log/i.test(t) && /Bench Press/.test(t), between(t, 'NEXT IN YOUR SPLIT', 300));

console.log('\n"I need a rest day"');
await p.evaluate(() => { location.hash = '#/coach'; }); await p.waitForTimeout(1500);
await p.fill('textarea', 'I need a rest day'); await tapText('Send'); await p.waitForTimeout(1500);
t = await text();
check('rest is proposed', /Today → Rest day/.test(t), between(t, 'FORGE WOULD CHANGE', 120));
await tapText('Apply'); await p.waitForTimeout(900);
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1800);
t = await text();
const todayAfter = between(t, 'NEXT IN YOUR SPLIT\n', 60).split('\n')[1];
check('Today is now a rest day', todayAfter === 'Rest day' || /Recovery is next/.test(t), todayAfter);
check('with the coach note on it', /Rest day — you asked the coach for it/.test(t), between(t, 'NEXT IN YOUR SPLIT', 200));

console.log('\nA question changes nothing');
await p.evaluate(() => { location.hash = '#/coach'; }); await p.waitForTimeout(1500);
await p.fill('textarea', 'should I run tomorrow?'); await tapText('Send'); await p.waitForTimeout(1500);
t = await text();
check('no card for a question', !/FORGE WOULD CHANGE/.test(t));

await b.close();
console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
