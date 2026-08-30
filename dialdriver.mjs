/* Numbers are picked from a wheel now, not typed, so the harnesses pick too.
   One driver, shared, so a change to the dial updates every test at once
   rather than leaving each to rot in its own way. */

/* A weight is two wheels — hundreds and remainder — so 315 is 300 + 15. */
export async function setWeightDial(page, label, total) {
  await page.evaluate(text => {
    const field = [...document.querySelectorAll('.dial-field')]
      .find(el => (el.querySelector('.dial-field-label')?.textContent || '').toLowerCase().includes(text.toLowerCase()));
    field?.scrollIntoView({ block: 'center' });
    field?.querySelector('.dial-field-button')?.click();
  }, label);
  await page.waitForTimeout(450);
  const hundreds = Math.floor(Number(total) / 100) * 100;
  const remainder = Number(total) - hundreds;
  const picked = await page.evaluate(([h, r]) => {
    const wheels = document.querySelectorAll('.dial-wheel');
    const a = [...wheels[0].querySelectorAll('.dial-value')].find(el => el.textContent === String(h));
    const b = [...wheels[1].querySelectorAll('.dial-value')].find(el => el.textContent === String(r));
    a?.click(); b?.click();
    return Boolean(a && b);
  }, [hundreds, remainder]);
  if (!picked) throw new Error(`The ${label} wheels do not offer ${total}`);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.dial-ok').click());
  await page.waitForTimeout(350);
}

/* Open the dial behind a labelled field, choose an offered value, confirm. */
export async function setDial(page, label, value) {
  const opened = await page.evaluate(text => {
    const field = [...document.querySelectorAll('.dial-field')]
      .find(el => (el.querySelector('.dial-field-label')?.textContent || '').toLowerCase().includes(text.toLowerCase()));
    if (!field) return false;
    field.scrollIntoView({ block: 'center' });
    field.querySelector('.dial-field-button')?.click();
    return true;
  }, label);
  if (!opened) throw new Error(`No dial field labelled "${label}"`);
  await page.waitForTimeout(450);
  const picked = await page.evaluate(target => {
    const wheel = document.querySelectorAll('.dial-wheel')[0];
    const option = [...wheel.querySelectorAll('.dial-value')].find(el => el.textContent === String(target));
    if (!option) return false;
    option.click();
    return true;
  }, value);
  if (!picked) throw new Error(`The ${label} wheel does not offer ${value}`);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.dial-ok').click());
  await page.waitForTimeout(350);
}

/* A duration is two wheels: minutes and seconds. */
export async function setClockDial(page, label, minutes, seconds) {
  await page.evaluate(text => {
    const field = [...document.querySelectorAll('.dial-field')]
      .find(el => (el.querySelector('.dial-field-label')?.textContent || '').toLowerCase().includes(text.toLowerCase()));
    field?.scrollIntoView({ block: 'center' });
    field?.querySelector('.dial-field-button')?.click();
  }, label);
  await page.waitForTimeout(450);
  await page.evaluate(([m, sec]) => {
    const wheels = document.querySelectorAll('.dial-wheel');
    [...wheels[0].querySelectorAll('.dial-value')].find(el => el.textContent === String(m))?.click();
    [...wheels[1].querySelectorAll('.dial-value')].find(el => el.textContent === String(sec).padStart(2, '0'))?.click();
  }, [minutes, seconds]);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.dial-ok').click());
  await page.waitForTimeout(350);
}

/* A distance is a whole part and a hundredths part. */
export async function setDistanceDial(page, label, whole, hundredths) {
  await page.evaluate(text => {
    const field = [...document.querySelectorAll('.dial-field')]
      .find(el => (el.querySelector('.dial-field-label')?.textContent || '').toLowerCase().includes(text.toLowerCase()));
    field?.scrollIntoView({ block: 'center' });
    field?.querySelector('.dial-field-button')?.click();
  }, label);
  await page.waitForTimeout(450);
  await page.evaluate(([w, h]) => {
    const wheels = document.querySelectorAll('.dial-wheel');
    [...wheels[0].querySelectorAll('.dial-value')].find(el => el.textContent === String(w))?.click();
    [...wheels[1].querySelectorAll('.dial-value')].find(el => el.textContent === String(h).padStart(2, '0'))?.click();
  }, [whole, hundredths]);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.dial-ok').click());
  await page.waitForTimeout(350);
}
