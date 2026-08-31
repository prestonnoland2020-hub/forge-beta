import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ACCENT=process.env.ACCENT||'signal';
const b=await chromium.launch({executablePath:CHROME});
for (const theme of ['light','dark']) {
  const p=await b.newPage({viewport:{width:430,height:1400},deviceScaleFactor:2});
  await p.addInitScript(([s,g,d,t,a])=>{localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user',JSON.stringify(s));
    localStorage.setItem('forge-goals',JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1',JSON.stringify(d));
    localStorage.setItem('forge-appearance-v4',JSON.stringify({theme:t,accent:a,icon:'match'}));},[setup,goals,days,theme,ACCENT]);
  await p.goto('http://localhost:4192/#/profile?view=appearance&t=1',{waitUntil:'networkidle'});
  await p.waitForTimeout(2200);
  const el=await p.$('.appearance');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`/tmp/themes/app-${ACCENT}-${theme}.png`, await el.screenshot());
  await p.close();
}
await b.close();
