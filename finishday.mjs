/* FINISH DAY SAVES WHAT WAS DONE, NOT WHAT WAS PRESCRIBED. An untouched plan
   day used to write the recommendation's set as a performed lift; a day with
   a set saved earlier keeps exactly that set and shows it as logged. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';
const BASE='http://localhost:4193';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails=0; const check=(label,ok,detail='')=>{console.log(`  ${ok?'PASS':'FAIL'}  ${label}${detail?` — ${detail}`:''}`);if(!ok)fails++};
const today=new Date(); const iso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const splitDays=[{ name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest', 'Back'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' }];
async function open(history){
  const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.addInitScript(([s, g, d, sd]) => { localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify(s)); localStorage.setItem('forge-goals', JSON.stringify(g));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify(d));
    localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'rolling', days: sd }));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: 'dark', ground: 'carbon', accent: 'signal', icon: 'match' }));
  }, [setup, goals, history, splitDays]);
  await page.goto(`${BASE}/#/workout?t=1`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
  return page;
}
const stored=(page)=>page.evaluate(iso => { const all=JSON.parse(localStorage.getItem('forge-workout-history-v1')||'[]'); const d=all.find(r=>r.date===iso); return d?(d.topSets||[]).map(s=>`${s.lift} ${s.weight}x${s.reps}`):null }, iso);
{
  const page=await open(days);
  await page.locator('button:has-text("Finish Day")').click(); await page.waitForTimeout(1200);
  check('an untouched plan day is refused', page.url().includes('/workout'), page.url());
  check('and nothing is written for it', (await stored(page))===null, JSON.stringify(await stored(page)));
  await page.close();
}
{
  const page=await open([{ id:'t', date: iso, title:'Chest & Back', muscles:['Chest'], hasCardio:false, topSets:[{ id:'s1', muscle:'Chest', lift:'Bench Press', weight:305, reps:5, calculatedMax:356, completed:true }], ...{} }, ...days]);
  const rows=await page.locator('.top-set-entry').allInnerTexts();
  check('a set saved earlier today shows as logged', rows.some(r=>/305 lb ×5/.test(r)), JSON.stringify(rows));
  await page.locator('button:has-text("Finish Day")').click(); await page.waitForTimeout(1200);
  check('Finish Day completes', page.url().endsWith('#/'), page.url());
  const sets=await stored(page);
  check('and the day keeps exactly what was done', JSON.stringify(sets)==='["Bench Press 305x5"]', JSON.stringify(sets));
  await page.close();
}
await browser.close();
console.log(fails?`\n${fails} check(s) failed`:'\nAll checks passed'); process.exit(fails?1:0);
