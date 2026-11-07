/* THE RUNNING ESTIMATE MOVES THE WAY FITNESS DOES.

   VO2 max and heart rate at pace lead it; hard runs keep a full third for six
   weeks; easy runs and workouts can raise it; mileage decides how far it
   carries; stopping running makes old hard runs fade. */
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; }, removeItem(k) { delete this.s[k]; } };
globalThis.window = globalThis.window || { dispatchEvent() {} };
const { predictRaceFromLegacyMethod, detrainingFactor } = await import('./src/lib/cardioPrediction.ts');
const { rememberVo2 } = await import('./src/lib/vo2.ts');

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const run = (n, miles, minutes, hr) => ({ id: `r${n}`, date: day(n), title: 'Run', muscles: ['Cardio'], hasCardio: true,
  cardioSessions: [{ id: `s${n}`, activity: 'Run', structure: 'custom', summary: 'Run', ...(hr ? { recorded: { averageHr: hr, maxHr: 192 } } : {}),
    prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: minutes, cardioType: 'Run' }] } }] });
const FIVE_K = 3.10686, HALF = 13.1094;
const easy = (n, pace, hr) => run(n, 5, 5 * pace, hr);
const base = [run(3, 3.1, 20, 180), easy(5, 9, 145), easy(8, 8.5, 150), easy(10, 8.75, 148), easy(12, 8.3, 158), easy(15, 8.8, 146)];
const at = (records, miles = FIVE_K) => predictRaceFromLegacyMethod(records, miles);

console.log('\nThe sources');
rememberVo2(null);
const hrOnly = at(base);
check('heart rate at pace takes part', Boolean(hrOnly?.heartRate), JSON.stringify(hrOnly?.heartRate));
rememberVo2({ value: 52, date: day(1) });
const all = at(base);
check('VO2 max and heart rate count the same', all.vo2?.share === all.heartRate?.share);
check('a hard run this week is a third', Math.abs(1 - all.vo2.share - all.heartRate.share - 1 / 3) < 0.02, JSON.stringify(all.vo2));
const fiveWeeks = [run(35, 3.1, 20, 180), ...base.slice(1).map((r, i) => easy(5 + i * 3, 8.7, 148 + i))];
check('a hard run five weeks old still counts a full third', Math.abs(at(fiveWeeks).vo2.share - 1 / 3) < 0.02, String(at(fiveWeeks).vo2.share));
const threeMonths = [run(90, 3.1, 20, 180), ...base.slice(1)];
check('a hard run three months old counts less', at(threeMonths).vo2.share > 0.4, String(at(threeMonths).vo2.share));
rememberVo2(null);
check('with no hard run, heart rate alone still gives an estimate', Boolean(at(base.slice(1))?.seconds));

console.log('\nWhat raises it');
const fasterEasy = [...base, easy(1, 8.0, 147)];
check('an easy run faster at the same heart rate raises it', at(fasterEasy).seconds < at(base).seconds, `${at(fasterEasy).seconds} vs ${at(base).seconds}`);
rememberVo2({ value: 52, date: day(1) });
const before = at(base).seconds;
rememberVo2({ value: 54, date: day(0) });
check('a higher VO2 max raises it', at(base).seconds < before);
const moreMiles = [...base, ...[2, 4, 6, 7, 9, 11, 13, 14].map(n => easy(n, 8.8, 148))];
check('more weekly miles help the half marathon', at(moreMiles, HALF).seconds < at(base, HALF).seconds, `${at(moreMiles, HALF).seconds} vs ${at(base, HALF).seconds}`);
rememberVo2(null);

console.log('\nWhat lowers it');
const block = [run(50, 3.1, 20), ...[52, 54, 56, 58, 60, 62, 64, 66, 70, 74, 78, 82, 86].map(n => run(n, 5, 44))];
check('keep running after a race and nothing fades', detrainingFactor([...block, ...[2, 6, 10, 14, 18, 22, 26].map(n => run(n, 4, 36))], day(50)) === 1);
const stopped = detrainingFactor(block, day(50));
check('stop running and old hard runs fade', stopped > 1.08 && stopped <= 1.15, String(stopped));
check('the first ten days off cost nothing', detrainingFactor([run(8, 3.1, 20)], day(8)) === 1);
check('fading is capped', detrainingFactor([run(170, 3.1, 20)], day(170)) <= 1.15);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
