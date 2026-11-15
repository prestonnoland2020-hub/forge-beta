/* Walks the current setup flow (agree → name → mode → focus → days → goal →
   target → numbers → week) so browser suites stop hard-coding old screens.
   Every choice is tapped by its visible label, so a reworded screen fails
   loudly here rather than silently in thirty suites. */
const wait = (page, ms) => page.waitForTimeout(ms);

async function tap(page, label, { exact = true } = {}) {
  const ok = await page.evaluate(([src, exactMatch]) => {
    const pattern = exactMatch ? new RegExp(`^${src}`, 'i') : new RegExp(src, 'i');
    const el = [...document.querySelectorAll('button,a,label')].filter(x => x.offsetParent && !x.disabled && pattern.test(x.innerText.trim())).pop();
    el?.click();
    return Boolean(el);
  }, [label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), exact]);
  await wait(page, 650);
  if (!ok) throw new Error(`setup: no "${label}" on ${await page.evaluate(() => document.body.innerText.slice(0, 80))}`);
}

const visible = async page => { const out = []; for (const i of await page.$$('input.ob-input:not([type=date])')) if (await i.isVisible()) out.push(i); return out; };
const stepTitle = page => page.evaluate(() => document.body.innerText.slice(0, 160));

/* focus: 'Get stronger' | 'Run faster' | 'Both' | 'Change my weight'
   lift: 'Bench' | 'Squat' | 'Deadlift' | 'Pull Ups'
   race: '5K' etc for Run faster; target/current strings; days: '2'..'6' */
export async function onboard(page, { base = 'http://localhost:4191', name = 'Dana', focus = 'Get stronger', coach = false, days = '4', lift = 'Squat', race, target = '315', current = '275', weeks = '12 weeks', weeklyRun = '10–20 miles', numbers = {} } = {}) {
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
  await wait(page, 2200);
  for (const box of await page.locator('input[type=checkbox]').all()) if (await box.isVisible()) await box.check();
  await tap(page, 'Continue');
  await page.fill('input[aria-label="Your name"]', name);
  await tap(page, 'Continue');
  await tap(page, coach ? 'Coach me' : 'I have goals');
  await tap(page, focus);
  await tap(page, days);
  if (/Which lift|What race|Which race|Pick one goal/i.test(await stepTitle(page))) await tap(page, race || lift);
  const fields = await visible(page);
  if (fields[0]) await fields[0].fill(target);
  if (fields[1] && current) await fields[1].fill(current);
  await tap(page, weeks).catch(() => {});
  await tap(page, 'Continue');
  /* Running step, when the focus plans runs: one tap answers it. */
  if (/How much do you run/i.test(await stepTitle(page))) await tap(page, weeklyRun);
  /* Starting numbers. */
  for (const [label, value] of Object.entries(numbers)) await page.fill(`input[aria-label^="${label} weight"]`, String(value)).catch(() => {});
  await tap(page, 'Continue').catch(() => tap(page, 'Skip for now'));
  await tap(page, 'Enter Forge');
  await wait(page, 2800);
  await page.evaluate(() => document.querySelector('.update-ready-pill')?.remove());
  /* First visit asks about building a split; the suites test the starter. */
  if (/Do you want to make your split/i.test(await page.evaluate(() => document.body.innerText))) await tap(page, 'Not now — keep the starter split');
}
