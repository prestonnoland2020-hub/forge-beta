/* THE BUTTON YOU CANNOT REACH IS THE SAME AS NO BUTTON.

   On a phone, step 2 of the goal builder is taller than the screen. The sheet
   was centred in a fixed backdrop with max-height:92vh and the footer at the
   end of the scrolling content, so Continue sat below the fold — and on iOS
   92vh is measured against the LARGE viewport, the one you only get after the
   address bar collapses, so the real overflow was worse than the number said.
   Preston could fill the form in and not submit it.

   The footer is pinned to the bottom of the sheet now and the header to the
   top. This walks all three steps at iPhone height and asserts both are on
   screen — and that nothing is floating on top of them, which the AI bubble
   was doing at the same z-index, square on the Continue button. */
import { chromium } from 'playwright';
import { setup, goals, days } from './seed.mjs';

const BASE = 'http://localhost:4193';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

const splitDays = [
  { name: 'Chest & Back', weekday: 'MON', dayType: 'strength', muscles: ['Chest'], exercises: ['Bench Press'], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' },
  { name: 'Easy Run', weekday: 'TUE', dayType: 'cardio', muscles: [], exercises: [], cardioPolicy: 'forge', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '45', maxDuration: '45' },
];

const browser = await chromium.launch({ executablePath: CHROME });
/* iPhone 15 Pro with Safari's chrome showing — the smallest real case. */
const page = await browser.newPage({ viewport: { width: 393, height: 659 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.route('**/*', route => route.request().url().startsWith(BASE) ? route.continue() : route.abort());
await page.addInitScript(([athlete, goalList, history, days_]) => {
  localStorage.clear();
  localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'Split', rhythm: 'weekly', minWeeklyMileage: 12, maxWeeklyMileage: 30, days: days_ }));
  localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({ ...athlete, splitDays: days_, completedAt: new Date().toISOString(), acceptedSafety: true }));
  localStorage.setItem('forge-goals', JSON.stringify(goalList));
  localStorage.setItem('forge-workout-history-v1', JSON.stringify(history));
  localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: 'dark', ground: 'carbon', accent: 'signal', icon: 'match' }));
}, [setup, goals, days, splitDays]);
await page.goto(`${BASE}/#/goals?t=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2400);
await page.locator('button').filter({ hasText: /New|Create your first goal/ }).first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(700);

check('the goal sheet opens', Boolean(await page.$('.goal-builder')));

/* Where a control actually is, and whether anything is sitting on top of it. */
const probe = selector => page.evaluate(sel => {
  const element = document.querySelector(sel);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  const x = Math.round(box.left + box.width / 2);
  const y = Math.round(box.top + box.height / 2);
  const onTop = document.elementFromPoint(x, y);
  return {
    top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height),
    viewport: window.innerHeight,
    covered: !(element === onTop || element.contains(onTop)),
    coveredBy: onTop ? `${onTop.tagName.toLowerCase()}.${onTop.className}`.slice(0, 60) : '',
    text: (element.innerText || '').replace(/\n/g, ' | ').slice(0, 60),
  };
}, selector);

for (const step of [1, 2, 3]) {
  console.log(`\nStep ${step} of 3`);
  const footer = await probe('.goal-builder > footer');
  check('the footer is on screen', footer && footer.bottom <= footer.viewport + 1,
    footer ? `bottom ${footer.bottom} of ${footer.viewport}` : 'no footer');
  check('and fully on screen, not half of it', footer && footer.top >= 0 && footer.height > 30,
    footer ? `top ${footer.top}, ${footer.height}px tall` : '');
  check('the primary button is reachable', footer && !footer.covered, footer?.coveredBy || '');
  const header = await probe('.goal-builder > header');
  check('the title and the close button stay at the top', header && header.top >= -1 && header.top < footer.top,
    header ? `top ${header.top}` : 'no header');
  check('the step is named so nobody is lost', /STEP \d OF 3/i.test(header?.text || ''), header?.text || '');

  if (step < 3) {
    /* Step 2 will not advance until it has a target and a date — which is the
       point, and also why the form is filled before the button is pressed. */
    if (step === 2) {
      await page.evaluate(() => {
        for (const select of document.querySelectorAll('.goal-builder select')) {
          const option = [...select.options].find(item => item.value && !/^choose|^select/i.test(item.text));
          if (!option || select.value) continue;
          const setter = Object.getOwnPropertyDescriptor(select.constructor.prototype, 'value').set;
          setter.call(select, option.value);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        for (const input of document.querySelectorAll('.goal-builder input')) {
          if (input.value) continue;
          const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set;
          setter.call(input, input.type === 'date' ? '2027-06-01' : '225');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(400);
    }
    const before = await page.evaluate(() => document.querySelector('.goal-builder > header')?.innerText || '');
    await page.locator('.goal-builder > footer button').last().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.querySelector('.goal-builder > header')?.innerText || '');
    check('Continue moves on', after !== before, `${before.replace(/\n/g, ' ')} → ${after.replace(/\n/g, ' ')}`);
  }
}

await browser.close();
console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
