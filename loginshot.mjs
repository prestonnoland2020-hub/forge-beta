/* The sign-in screen with one provider, both themes. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('/tmp/tour', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.addInitScript(t => { localStorage.clear(); localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: t, ground: 'carbon', accent: 'signal', icon: 'match' })); }, theme);
  await page.goto('http://localhost:4194/#/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  writeFileSync(`/tmp/tour/login-${theme}.png`, await page.screenshot({ fullPage: true }));
  if (theme === 'light') console.log((await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | '));
  await page.close();
}
await browser.close();
