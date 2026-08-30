/* A distance can never be stored against a time unit, and a run with no
   distance says so instead of silently counting zero miles. */
import { chromium } from 'playwright';
import { setDistanceDial, setClockDial } from './dialdriver.mjs';
import { days, setup, goals } from './seed.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 1100 } });
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
}, [days, setup, goals]);
await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };
// open the cardio composer
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Add cardio/i.test(x.textContent || ''))?.click());
await p.waitForTimeout(700);
const setField = (sel, value) => p.evaluate(([s, v]) => { const el = document.querySelector(s); if (!el) return false; const proto = el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement; const d = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set; d.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }, [sel, value]);
const unitValue = () => p.evaluate(() => document.querySelector('.cardio-log-unit select')?.value);
const unitOptions = () => p.evaluate(() => [...(document.querySelector('.cardio-log-unit select')?.options || [])].map(o => o.value));
// force the broken pairing: pick minutes, then type a distance
await setField('.cardio-log-unit select', 'minutes');
await p.waitForTimeout(200);
check('minutes is selectable while there is no distance', await unitValue() === 'minutes');
await setDistanceDial(p, 'Distance', 2, 10);
await p.waitForTimeout(300);
const after = await unitValue();
console.log('   unit after typing a distance:', after);
check('typing a distance repairs the unit', ['miles','km','meters','yards'].includes(after), String(after));
check('time units disappear once a distance exists', !(await unitOptions()).includes('minutes'), JSON.stringify(await unitOptions()));
// a run with time but no distance is flagged
await setDistanceDial(p, 'Distance', 0, 0);
await setField('input[placeholder="Run"]', 'Run');
await p.waitForTimeout(200);
await setClockDial(p, 'Time', 20, 0);
await p.waitForTimeout(400);
const warned = await p.evaluate(() => document.querySelector('.cardio-log-warning')?.textContent || '');
console.log('   warning:', warned.slice(0, 110));
check('a run with no distance is called out', /counts as 0 miles/i.test(warned), warned || '(none)');
// and the warning clears once a distance is present
await setDistanceDial(p, 'Distance', 2, 10);
await p.waitForTimeout(300);
check('warning clears when the distance is added', !(await p.evaluate(() => !!document.querySelector('.cardio-log-warning'))));
check('the repaired row reads in miles', /2\.1\s*miles/.test(await p.evaluate(() => document.querySelector('.cardio-log-summary')?.textContent || '')), await p.evaluate(() => document.querySelector('.cardio-log-summary')?.textContent || ''));
await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
