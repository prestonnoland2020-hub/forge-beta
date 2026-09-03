/* The setup gate: a lifting day with no exercises must not be able to finish,
   and an athlete whose split has none is sent to the step that fixes it. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4193';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync('/tmp/tour', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

async function page(seed) {
  const p = await browser.newPage({ viewport: { width: 430, height: 950 } });
  await p.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await p.addInitScript(seed, [setup, goals, days]);
  return p;
}

/* 1. A completed athlete whose lifting days name nothing is sent to setup. */
{
  const p = await page(([s, g, d]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({
      ...s, completedAt: '2026-08-01T00:00:00.000Z',
      splitDays: [{ name: 'Chest & Back', type: 'Strength', muscles: ['Chest', 'Back'], exercises: [] }],
    }));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  });
  await p.goto(`${BASE}/#/?t=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  check('unmapped split is sent to the mapping step', p.url().includes('/onboarding'), p.url());
  const heading = await p.locator('.setup-heading h2').innerText().catch(() => '');
  check('it opens ON the mapping step', /movements Forge programs/i.test(heading), heading);
  await p.screenshot({ path: '/tmp/tour/setup-map.png', fullPage: true });
  /* Finish is refused while a day names nothing. */
  await p.locator('.setup-actions .button:not(.ghost)').click();
  await p.waitForTimeout(500);
  const err = await p.locator('.setup-error').innerText().catch(() => '');
  check('finishing is refused with an empty day', /at least one exercise/i.test(err), err);
  /* Pick one and the error clears. */
  await p.locator('.setup-day-options .muscle-chip').first().click();
  await p.waitForTimeout(300);
  const count = await p.locator('.setup-day-chosen button').count();
  check('choosing a movement records it on the day', count > 0, `${count} chosen`);
  await p.screenshot({ path: '/tmp/tour/setup-map-filled.png', fullPage: true });
  await p.close();
}

/* 2. A mapped athlete passes straight through. */
{
  const p = await page(([s, g, d]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({
      ...s, completedAt: '2026-08-01T00:00:00.000Z',
      splitDays: [{ name: 'Chest & Back', type: 'Strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press'] }],
    }));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
  });
  await p.goto(`${BASE}/#/?t=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  check('a mapped split is not interrupted', !p.url().includes('/onboarding'), p.url());
  await p.close();
}

await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll setup checks passed');
process.exit(fails ? 1 : 0);
