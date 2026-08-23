import { chromium } from 'playwright';
/* Production mode: no demo short-circuits, real Supabase client. Signed out,
   so the app should land on login without throwing. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + String(e).split('\n')[0].slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|favicon|ERR_NAME|ERR_INTERNET|net::ERR_(CONNECTION|TUNNEL|NAME)/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
for (const r of ['', 'workout', 'insights', 'history', 'goals', 'plan', 'profile']) {
  await page.goto('http://localhost:4191/#/' + r, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const txt = (await page.innerText('body')).trim();
  console.log(`${(r || 'home').padEnd(9)} rendered=${txt.length > 20 ? 'yes' : 'NO'}  first="${txt.slice(0, 45).replace(/\n/g, ' ')}"`);
}
console.log(errs.length ? '\nERRORS:\n' + [...new Set(errs)].slice(0, 8).join('\n') : '\nno runtime errors in production mode');
await b.close();
