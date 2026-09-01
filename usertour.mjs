/* Walk the app as a user after the restructure: every main surface, plus the
   two flows Preston reported broken (top-set save, AI cardio pace). */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4193';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const splitDays = [
  { name:'Chest & Back', weekday:'MON', dayType:'strength', muscles:['Chest','Back'], exercises:['Bench Press'], cardioPolicy:'none', cardio:[], recoveryStyle:'Full rest', strengthDuration:'60', maxDuration:'60' },
  { name:'Quality Cardio', weekday:'TUE', dayType:'cardio', muscles:[], exercises:[], cardioPolicy:'forge', cardio:[], recoveryStyle:'Full rest', strengthDuration:'45', maxDuration:'45' },
];
mkdirSync('/tmp/tour', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 430, height: 950 }, deviceScaleFactor: 2 });
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.addInitScript(([s, g, d, sd]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name:'Split', rhythm:'rolling', minWeeklyMileage:0, maxWeeklyMileage:0, days: sd }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme:'dark', ground:'carbon', accent:'signal', icon:'match' }));
  }, [setup, goals, days, splitDays]);
  return page;
}

const shot = async (page, name) => writeFileSync(`/tmp/tour/${name}.png`, await page.screenshot({ fullPage: true }));

// 1. Static route sweep
for (const [route, name] of [['/', 'today'], ['/plan', 'plan'], ['/goals', 'goals'], ['/history', 'activities'], ['/insights', 'insights'], ['/split', 'split'], ['/profile', 'profile']]) {
  const page = await newPage();
  await page.goto(`${BASE}/#${route}?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await shot(page, name);
  await page.close();
}

// 2. Workout flow: add top set via sheet, then AI cardio with pace
{
  const page = await newPage();
  await page.goto(`${BASE}/#/workout`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await shot(page, 'workout-open');
  const dial = async (fieldIndex, vals) => {
    await page.locator('.top-set-sheet .dial-field-button').nth(fieldIndex).click();
    await page.waitForTimeout(250);
    await page.locator('.dial-sheet .dial-wheel').first().locator(`button:text-is("${vals[0]}")`).first().click({ force: true });
    if (vals[1] !== undefined) await page.locator('.dial-sheet .dial-wheel').nth(1).locator(`button:text-is("${vals[1]}")`).first().click({ force: true });
    await page.waitForTimeout(150);
    await page.locator('.dial-ok').click();
    await page.waitForTimeout(150);
  };
  await page.locator('button:has-text("Add top set"), button:has-text("Log a top set")').first().click();
  await page.waitForTimeout(400);
  await page.fill('.top-set-sheet-search input', 'Bench Press');
  await page.waitForTimeout(300);
  await page.locator('.top-set-sheet-result').first().click();
  await page.waitForTimeout(250);
  await dial(0, ['200', '25']);
  await dial(1, ['5']);
  await page.locator('.top-set-sheet footer button:has-text("Save top set")').click();
  await page.waitForTimeout(1200);
  await shot(page, 'workout-after-topset');
  console.log('editor still open (Finish Day present):', await page.locator('text=Finish Day').count());
  console.log('hijacked to completed screen:', await page.locator('text=Today is logged').count());

  // AI cardio: pace phrase
  await page.locator('button:has-text("Add cardio")').first().click();
  await page.waitForTimeout(300);
  await page.fill('.cardio-ai-box textarea', '25 minutes at 10 minute pace');
  await page.locator('.cardio-ai-actions button:has-text("Log it")').click();
  await page.waitForTimeout(1500);
  await shot(page, 'workout-after-cardio');
  const savedEntry = await page.locator('.cardio-log-saved strong').allInnerTexts();
  console.log('cardio saved entries:', savedEntry);
  await page.close();
}

// 3. Profile subviews: devices + faq + back arrow
{
  const page = await newPage();
  await page.goto(`${BASE}/#/profile?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.locator('button:has-text("Recovery & smartwatch")').click();
  await page.waitForTimeout(400);
  await shot(page, 'profile-devices');
  console.log('back arrow present:', await page.locator('.profile-back').count());
  await page.locator('.profile-back').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("FAQ")').click();
  await page.waitForTimeout(300);
  await shot(page, 'profile-faq');
  await page.close();
}
await browser.close();
console.log('tour complete');
