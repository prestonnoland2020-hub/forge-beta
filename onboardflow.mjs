/* Walks the current setup flow (agree → name → what you want → who builds it
   → [what kind] → days → a goal per want → numbers → week, or "you're set"
   for a coached athlete) so browser suites stop hard-coding old screens.
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

/* focus: 'Get stronger' | 'Run faster' | 'Both' | 'Change my weight' | 'Just get fit'
   wants: the same labels, as a list, when more than one is wanted
   coach: true = "Build it for me" (style: 'Gym' | 'Home' | 'Pilates' | 'Hybrid', gear for Home)
   lift: 'Bench' | 'Squat' | 'Deadlift' | 'Pull Ups'; race: '5K' etc
   target/current: the lift goal (or the only goal); raceTarget, weightTarget/weightCurrent: the others
   days: '2'..'6' */
export async function onboard(page, { base = 'http://localhost:4191', name = 'Dana', focus = 'Get stronger', wants, coach = false, style = 'Gym', gear = [], days = '4', lift = 'Squat', race, target = '315', current = '275', raceTarget, weightTarget, weightCurrent = '', weeks = '12 weeks', weeklyRun = '10–20 miles', numbers = {} } = {}) {
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
  await wait(page, 2200);
  for (const box of await page.locator('input[type=checkbox]').all()) if (await box.isVisible()) await box.check();
  await tap(page, 'Continue');
  await page.fill('input[aria-label="Your name"]', name);
  await tap(page, 'Continue');
  const picks = wants || (focus === 'Both' ? ['Get stronger', 'Run faster'] : [focus]);
  for (const label of picks) await tap(page, label);
  await tap(page, 'Continue');
  await tap(page, coach ? 'Build it for me' : 'I know what');
  await tap(page, 'Continue');
  if (coach) {
    await tap(page, style);
    if (style === 'Home') { for (const item of gear) await tap(page, item); await tap(page, gear.length ? 'Continue' : 'No equipment'); }
  }
  await tap(page, days);
  /* One goal per want: answer each screen as it comes. */
  const only = picks.length === 1;
  const answer = async (value, now) => {
    const fields = await visible(page);
    if (fields[0]) await fields[0].fill(value);
    if (fields[1] && now) await fields[1].fill(now);
    await tap(page, weeks).catch(() => {});
    await tap(page, 'Continue');
  };
  for (let guard = 0; guard < 8; guard += 1) {
    const title = await stepTitle(page);
    if (/Which lift/i.test(title)) await tap(page, lift);
    else if (/Which race/i.test(title)) await tap(page, race || '5K');
    else if (/Pick one goal/i.test(title)) await tap(page, race || lift);
    else if (/What weight are you aiming for/i.test(title)) await answer(weightTarget || (only ? target : '170'), weightCurrent || (only ? current : ''));
    else if (/time are you aiming for/i.test(title)) await answer(raceTarget || (only || !picks.includes('Get stronger') ? target : '25:00'), only ? current : '');
    else if (/for one rep\?|do you want to do\?|add on pull ups\?/i.test(title)) await answer(target, current);
    else break;
  }
  /* Running step, when the week plans runs: one tap answers it. */
  if (/How much do you run/i.test(await stepTitle(page))) await tap(page, weeklyRun);
  if (coach) await tap(page, 'Start with my coach');
  else {
    /* Starting numbers. */
    for (const [label, value] of Object.entries(numbers)) await page.fill(`input[aria-label^="${label} weight"]`, String(value)).catch(() => {});
    await tap(page, 'Continue').catch(() => tap(page, 'Skip for now'));
    await tap(page, 'Enter Forge');
  }
  await wait(page, 2800);
  await page.evaluate(() => document.querySelector('.update-ready-pill')?.remove());
  /* First visit asks about building a split; the suites test the starter. */
  if (/Do you want to make your split/i.test(await page.evaluate(() => document.body.innerText))) await tap(page, 'Not now — keep the starter split');
}
