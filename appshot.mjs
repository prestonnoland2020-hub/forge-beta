import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ACCENT=process.env.ACCENT||'signal';
const GROUND=process.env.GROUND||'carbon';
const b=await chromium.launch({executablePath:CHROME});
for (const theme of ['light','dark']) {
  const p=await b.newPage({viewport:{width:430,height:1400},deviceScaleFactor:2});
  await p.addInitScript(([s,gl,d,t,a,g])=>{localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user',JSON.stringify(s));
    localStorage.setItem('forge-goals',JSON.stringify(gl));
    localStorage.setItem('forge-workout-history-v1',JSON.stringify(d));
    localStorage.setItem('forge-appearance-v5',JSON.stringify({theme:t,ground:g,accent:a,icon:'match'}));},[setup,goals,days,theme,ACCENT,GROUND]);
  await p.goto('http://localhost:4193/#/profile?view=appearance&t=1',{waitUntil:'networkidle'});
  await p.waitForTimeout(2200);
  const el=await p.$('.appearance');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`/tmp/themes/app-${GROUND}-${ACCENT}-${theme}.png`, await el.screenshot());
  await p.close();
}
await b.close();
