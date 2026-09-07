/* The notifications card, in both themes, with the new registration line. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = 'http://localhost:4193';
mkdirSync('/tmp/tour', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 430, height: 1200 }, deviceScaleFactor: 2 });
  await page.addInitScript(([s, g, d, t]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1', JSON.stringify(s));
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', days: [
      { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest','Back'], exercises: ['Bench Press'],
        cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
    ] }));
    localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-notification-prefs-v1', JSON.stringify({ morningWorkout: true, injuryFollowUp: false, partnerTrained: true }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: 'carbon', accent: 'signal', icon: 'match' }));
  }, [setup, goals, days, theme]);
  await page.goto(`${BASE}/#/profile?view=coach&t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  if (theme === 'dark') console.log('URL:', page.url(), '\nBODY:', (await page.evaluate(() => document.body.innerText)).slice(0, 400));
  const card = await page.$('.notification-settings');
  if (card) writeFileSync(`/tmp/tour/notifications-${theme}.png`, await card.screenshot());
  else console.log('card not found on', theme);
  if (theme === 'dark') console.log(await page.evaluate(() => document.querySelector('.notification-settings')?.innerText || 'missing'));
  await page.close();
}
await browser.close();
