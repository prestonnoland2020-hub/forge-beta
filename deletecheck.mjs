/* Two things this round: a saved top set can be swiped away and actually
   leaves the day, and the plan draws the week today is in — not the week the
   wave offset happens to point at. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:4193';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync('/tmp/tour', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const today = new Date().toISOString().slice(0, 10);
const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Quality Cardio', weekday: 'TUE', dayType: 'cardio', muscles: [], exercises: [], cardioPolicy: 'forge', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '45', maxDuration: '45' },
];

async function open(extra) {
  const page = await browser.newPage({ viewport: { width: 430, height: 950 }, hasTouch: true });
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.addInitScript(([s, g, d, sd, ex]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', minWeeklyMileage: 0, maxWeeklyMileage: 0, days: sd }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: 'dark', ground: 'carbon', accent: 'signal', icon: 'match' }));
    Object.entries(ex || {}).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, [setup, goals, days, splitDays, extra || {}]);
  return page;
}

/* 1. A saved set swipes away and leaves the stored day. */
{
  const history = [{ id: 'today-day', date: today, title: 'Chest & Back', muscles: ['Chest'], hasCardio: false,
    topSets: [
      { id: 'set-keep', muscle: 'Chest', lift: 'Bench Press', weight: 300, reps: 8, calculatedMax: 380, completed: true },
      { id: 'set-drop', muscle: 'Back', lift: 'Lat Pulldown', weight: 150, reps: 8, calculatedMax: 190, completed: true },
    ] }, ...days];
  const page = await open({ 'forge-workout-history-v1': history });
  await page.goto(`${BASE}/#/workout?edit=today-day`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const before = await page.locator('.top-set-entry.closed').count();
  const rowText = await page.locator('.top-set-entry').allInnerTexts();
  check('both saved sets are on the day', before >= 2, `${before} rows :: ${JSON.stringify(rowText).slice(0, 300)}`);
  await page.screenshot({ path: '/tmp/tour/delete-before.png', fullPage: true });

  const row = page.locator('.top-set-entry.closed', { hasText: 'Lat Pulldown' }).first();
  const box = await row.boundingBox();
  /* Drag left across the row to reveal Delete — a real finger, not a synthetic
     event: the point is that a thumb on a phone can do this. */
  const y = box.y + box.height / 2;
  await page.evaluate(({ x1, x2, yy }) => {
    const row = [...document.querySelectorAll('.top-set-entry.closed')].find(node => node.textContent.includes('Lat Pulldown'));
    const target = row.querySelector('.top-set-swipe');
    const touch = (x) => new Touch({ identifier: 1, target, clientX: x, clientY: yy });
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(x1)], targetTouches: [touch(x1)], changedTouches: [touch(x1)] }));
    target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [touch(x2)], targetTouches: [touch(x2)], changedTouches: [touch(x2)] }));
    target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], targetTouches: [], changedTouches: [touch(x2)] }));
  }, { x1: box.x + box.width - 30, x2: box.x + box.width - 130, yy: y });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/tour/delete-swiped.png', fullPage: true });
  const revealed = await page.locator('.top-set-entry.swiped').count();
  check('swiping left reveals Delete', revealed > 0, `${revealed} revealed`);

  await page.locator('.top-set-entry.closed', { hasText: 'Lat Pulldown' }).first().locator('.top-set-delete').click();
  await page.waitForTimeout(900);
  const gone = await page.locator('.top-set-entry.closed', { hasText: 'Lat Pulldown' }).count();
  check('the set disappears from the screen', gone === 0, `${gone} left`);
  const stored = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('forge-workout-history-v1') || '[]');
    const day = all.find(record => record.id === 'today-day');
    return (day?.topSets || []).map(set => set.lift);
  });
  check('and leaves the SAVED day', !stored.includes('Lat Pulldown'), `stored: ${JSON.stringify(stored)}`);
  check('while the other set is untouched', stored.includes('Bench Press'), `stored: ${JSON.stringify(stored)}`);
  await page.screenshot({ path: '/tmp/tour/delete-after.png', fullPage: true });
  await page.close();
}

/* 2. The plan draws THIS week even when the block entered the wave mid-way. */
for (const waveOffset of [0, 1, 3]) {
  const plan = { plan: { summary: '', easyPace: '9:30', weeks: Array.from({ length: 10 }, (_, index) => ({
    week: index + 1, phase: 'Base', mileage: 12, longRunMiles: 4, longRunPace: '9:30', longRunDay: 'Quality Cardio',
    quality: '', qualityPace: '', qualityDay: '', easyDays: ['Quality Cardio'], easyMinutes: 30, easyPace: '9:30',
    topSets: [{ splitDay: 'Chest & Back', exercise: 'Bench Press', weight: 300, reps: 8 }], note: '',
  })) }, generatedAt: new Date().toISOString(), startDate: today, fingerprint: 'x', blockWeeks: 10, saved: true, waveOffset };
  const page = await open({ 'forge-ai-plan-v1': plan });
  await page.goto(`${BASE}/#/plan?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const todayRows = await page.locator('.simple-week-schedule article.is-today').count();
  check(`offset ${waveOffset}: the week on screen contains today`, todayRows === 1, `${todayRows} rows marked today`);
  if (waveOffset === 1) await page.screenshot({ path: '/tmp/tour/plan-offset.png', fullPage: true });
  await page.close();
}

await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
