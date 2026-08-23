import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript(([d,s,g])=>{localStorage.setItem('forge-workout-history-v1',JSON.stringify(d));localStorage.setItem('forge-athlete-setup-v1:preview-user',JSON.stringify(s));localStorage.setItem('forge-goals',JSON.stringify(g));},[days,setup,goals]);
await page.goto('http://localhost:4191/#/insights', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
const ticks = await page.evaluate(() => [...document.querySelectorAll('.chart-grid-line text')].map(t => t.textContent));
console.log('y ticks:', JSON.stringify(ticks));
const el = await page.$('.overview-progress-plot');
if (el) { await el.screenshot({ path: '/tmp/shots/chart.png' }); console.log('chart captured'); }
await b.close();
