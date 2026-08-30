/* A WHEEL TURNS ONE WAY. The wheel scrolls vertically, but nothing stopped a
   finger that drifted sideways from panning the sheet, the backdrop, or the
   page behind it — so a thumb flick a few degrees off its axis slid the whole
   dial across the screen mid-spin and lost the value being aimed at.

   Measured, not asserted from the stylesheet: the browser's own computed
   touch-action and overflow are what a phone actually obeys. */
import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';

let fails = 0;
const check = (l, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '   → ' + d}`); if (!c) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 950 }, hasTouch: true });
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 160)));
await p.addInitScript(([d, s, g]) => {
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
  localStorage.setItem('forge-goals', JSON.stringify(g));
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: [
    { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  ] }));
}, [days, setup, goals]);
await p.goto('http://localhost:4191/#/workout', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);

await p.evaluate(() => {
  const field = [...document.querySelectorAll('.dial-field')].find(el => /weight/i.test(el.querySelector('.dial-field-label')?.textContent || ''));
  field?.querySelector('.dial-field-button')?.click();
});
await p.waitForTimeout(700);
check('the weight dial is open', Boolean(await p.$('.dial-backdrop')));

const style = sel => p.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el); return { touch: c.touchAction, x: c.overflowX, y: c.overflowY }; }, sel);

const wheel = await style('.dial-wheel');
check('a wheel takes vertical drags only', wheel?.touch === 'pan-y', JSON.stringify(wheel));
check('and cannot scroll sideways itself', wheel?.x === 'hidden', JSON.stringify(wheel));
const columns = await style('.dial-columns');
check('the row of wheels cannot slide sideways', columns?.x === 'hidden' && columns?.touch === 'pan-y', JSON.stringify(columns));
const sheet = await style('.dial-sheet');
check('the sheet under them cannot either', sheet?.x === 'hidden' && sheet?.touch === 'pan-y', JSON.stringify(sheet));
const backdrop = await style('.dial-backdrop');
check('the backdrop takes no gesture at all', backdrop?.touch === 'none', JSON.stringify(backdrop));

/* A drag that is mostly vertical but drifts sideways still turns the wheel,
   and moves nothing else. */
const box = await p.evaluate(() => { const r = document.querySelector('.dial-wheel').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
const before = await p.evaluate(() => ({ top: document.querySelector('.dial-wheel').scrollTop, left: document.querySelector('.dial-wheel').scrollLeft, sheet: document.querySelector('.dial-sheet').scrollLeft, page: window.scrollX }));
await p.touchscreen.tap(box.x, box.y);
await p.evaluate(([x, y]) => {
  const wheelEl = document.querySelector('.dial-wheel');
  /* A diagonal flick: mostly down, drifting right. */
  const touch = (cx, cy) => new Touch({ identifier: 1, target: wheelEl, clientX: cx, clientY: cy });
  wheelEl.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch(x, y)], targetTouches: [touch(x, y)], changedTouches: [touch(x, y)] }));
  for (let step = 1; step <= 6; step++) {
    const point = touch(x + step * 9, y - step * 18);
    wheelEl.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [point], targetTouches: [point], changedTouches: [point] }));
  }
  wheelEl.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch(x + 54, y - 108)] }));
}, [box.x, box.y]);
await p.waitForTimeout(500);
const after = await p.evaluate(() => ({ top: document.querySelector('.dial-wheel').scrollTop, left: document.querySelector('.dial-wheel').scrollLeft, sheet: document.querySelector('.dial-sheet').scrollLeft, page: window.scrollX }));
check('a sideways drift moves the wheel sideways not at all', after.left === before.left && after.left === 0, `${before.left} → ${after.left}`);
check('the sheet stays put', after.sheet === before.sheet, `${before.sheet} → ${after.sheet}`);
check('and the page behind it does not pan', after.page === before.page && after.page === 0, `${before.page} → ${after.page}`);

/* Picking still works — locking the axis must not break the dial. */
await p.evaluate(() => {
  const wheels = document.querySelectorAll('.dial-wheel');
  [...wheels[0].querySelectorAll('.dial-value')].find(v => v.textContent === '300')?.click();
  [...wheels[1].querySelectorAll('.dial-value')].find(v => v.textContent === '15')?.click();
});
await p.waitForTimeout(400);
check('the wheels still pick a value', /315/.test(await p.evaluate(() => document.querySelector('.dial-preview')?.textContent || '')));
await p.evaluate(() => document.querySelector('.dial-ok').click());
await p.waitForTimeout(400);
check('and OK still commits it', !(await p.$('.dial-backdrop')));

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
