/* The setup gate: a lifting day with no exercises must not be able to finish,
   and an athlete whose split has none is sent to the step that fixes it. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4191';
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
  /* Asserted on the step's NAME rather than its subtitle — the subtitle is
     copy and got shortened ("the movements Forge programs on each day" became
     "the movement Forge measures each day by"), which failed this line
     instead of the routing it is here to test. */
  const eyebrow = await p.locator('.setup-heading .eyebrow').innerText().catch(() => '');
  check('it opens ON the week step', /your week/i.test(eyebrow), `${eyebrow} / ${heading}`);
  await p.screenshot({ path: '/tmp/tour/setup-map.png', fullPage: true });
  /* FORGE FILLS THE EMPTY DAY ITSELF. Setup used to refuse to finish until
     the athlete picked a movement; now the day arrives with one chosen and
     the athlete changes it if they want to. */
  const chosen = await p.locator('.setup-day-head small').first().innerText().catch(() => '');
  check('the empty day arrives with a movement already on it', chosen && !/pick a movement/i.test(chosen), chosen);
  await p.locator('.setup-day-head').first().click();
  await p.waitForTimeout(300);
  const count = await p.locator('.setup-day-options .muscle-chip').count();
  check('and Change opens the alternatives', count > 1, `${count} options`);
  /* Clearing it is still refused at Finish. */
  await p.locator('.setup-day-options .muscle-chip[aria-pressed="true"]').first().click();
  await p.waitForTimeout(200);
  await p.locator('.setup-actions .button:not(.ghost)').click();
  await p.waitForTimeout(500);
  const err = await p.locator('.setup-error').innerText().catch(() => '');
  check('finishing is refused once a day is cleared', /pick a movement/i.test(err), err);
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
