/* THE FIRST SCREEN THAT CAN TRAP SOMEONE.

   A new athlete (Eli) got through setup to the mapping step and stopped. Two
   faults, both invisible from the inside:

     1. His "Shoulders & Arms" day offered nothing. The starter library had four
        plain-strength movements — squat, bench, hack squat, lat pulldown — and
        the mapper filters HYROX/CrossFit entries out by category, so shoulders,
        biceps, triceps, calves, abs and forearms had no option at all. Setup
        refuses to finish with an unmapped lifting day, so the only way through
        was to map his Bench goal onto a shoulders day.

     2. The refusal itself was unreadable: `.setup-error` set color and
        background to the same token, so the message painted itself out. His
        words were "the error messages aren't loading".

   The contrast audit did not catch the second one because the error only
   exists after a failed submit — a state no screenshot pass ever reached. So
   this drives the failure deliberately and reads the pixels. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4193';
mkdirSync('/tmp/tour', { recursive: true });
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

/* Relative luminance and WCAG ratio, so "is it readable" is measured. */
const luminance = ([r, g, b]) => {
  const channel = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/* Chrome reports either `rgb(179, 38, 30)` (0-255) or, for a color-mix
   result, `color(srgb 0.7 0.15 0.12)` (0-1). Reading the second as 0-255 makes
   any mixed background look black and every ratio look wrong — which is how
   this check first "failed" on a colour that was fine. */
const rgb = value => {
  const numbers = (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  return /^color\(/.test(value.trim()) ? numbers.map(n => n * 255) : numbers;
};

/* Every muscle a Forge split day can name gets its own day, so a gap anywhere
   in the starter library shows up as an unmappable day here. */
const MUSCLE_DAYS = [
  { name: 'Chest & Back', muscles: ['Chest', 'Back'] },
  { name: 'Shoulders & Arms', muscles: ['Shoulders', 'Biceps', 'Triceps'] },
  { name: 'Lower Body', muscles: ['Quads', 'Hamstrings', 'Glutes'] },
  { name: 'Calves & Abs', muscles: ['Calves', 'Abs'] },
  { name: 'Grip', muscles: ['Forearms'] },
];

for (const theme of ['dark', 'light']) {
  console.log(`\nA new athlete's mapping step (${theme})`);
  const page = await browser.newPage({ viewport: { width: 430, height: 1600 }, deviceScaleFactor: 2 });
  await page.route('**/*', route => route.request().url().startsWith(BASE) ? route.continue() : route.abort());
  await page.addInitScript(([days, mode]) => {
    localStorage.clear();
    localStorage.setItem('forge-athlete-setup-v1:preview-user', JSON.stringify({
      displayName: 'Eli', trainingDays: days.length, experience: 'intermediate', primaryGoal: 'strength',
      completedAt: '2026-09-01T00:00:00.000Z', splitSource: 'Custom',
      splitDays: days.map(day => ({ ...day, type: 'Strength', exercises: [] })),
    }));
    localStorage.setItem('forge-goals', JSON.stringify([{ id: 1, title: 'Bench 225', type: 'Strength', exercise: 'Bench Press', target: '225', date: '2026-12-01' }]));
    localStorage.setItem('forge-workout-history-v1', JSON.stringify([]));
    localStorage.setItem('forge-appearance-v5', JSON.stringify({ theme: mode, ground: 'carbon', accent: 'signal', icon: 'match' }));
  }, [MUSCLE_DAYS, theme]);
  await page.goto(`${BASE}/#/?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  check('an unmapped split opens on the mapping step', page.url().includes('/onboarding'), page.url());

  /* Every day, opened in turn: not one of them may be a dead end. */
  for (let index = 0; index < MUSCLE_DAYS.length; index += 1) {
    const head = page.locator('.setup-day-head').nth(index);
    if (!(await page.locator('.setup-day').nth(index).getAttribute('class') || '').includes('open')) await head.click();
    await page.waitForTimeout(200);
    const options = await page.locator('.setup-day').nth(index).locator('.setup-day-options .muscle-chip').allInnerTexts();
    /* The Bench goal is offered on every day by design; it must not be the
       ONLY thing offered, or the athlete is forced to program bench on legs. */
    const real = options.filter(name => !name.includes('★'));
    check(`${MUSCLE_DAYS[index].name} offers a movement that belongs to it`, real.length > 0,
      real.map(name => name.trim()).join(', ') || 'nothing but the goal lift');
    await head.click();
    await page.waitForTimeout(150);
  }

  /* Now the refusal, and whether it can be read. */
  await page.locator('.setup-actions .button:not(.ghost)').click();
  await page.waitForTimeout(500);
  const error = page.locator('.setup-error');
  const text = await error.innerText().catch(() => '');
  check('finishing is refused while a day is unmapped', /at least one exercise/i.test(text), text.replace(/\n/g, ' '));
  const colours = await error.evaluate(node => {
    const style = getComputedStyle(node);
    return { fg: style.color, bg: style.backgroundColor };
  }).catch(() => null);
  const contrast = colours ? ratio(rgb(colours.fg), rgb(colours.bg)) : 0;
  check('and the athlete can actually read it', contrast >= 4.5, `${contrast.toFixed(2)}:1 (${colours?.fg} on ${colours?.bg})`);
  await page.screenshot({ path: `/tmp/tour/firstrun-${theme}.png`, fullPage: true });
  await page.close();
}

await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
