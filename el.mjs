import { chromium } from 'playwright';
import { days, setup, goals } from './seed.mjs';
const [route, sel, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: Number(process.env.W)||390, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript(([d,s,g])=>{localStorage.setItem('forge-workout-history-v1',JSON.stringify(d));localStorage.setItem('forge-athlete-setup-v1:preview-user',JSON.stringify(s));localStorage.setItem('forge-goals',JSON.stringify(g));},[days,setup,goals]);
await page.goto('http://localhost:4191/#/' + route, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
const el = await page.$(sel);
if (!el) { console.log('NOT FOUND', sel); } else { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await el.screenshot({ path: out }); console.log('captured', out); }
await b.close();
