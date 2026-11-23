/* A FASTER, FRESHER MILE CAN NEVER MAKE THE GOAL CARD SLOWER (feedback #36).
   After a 5:36 mile was edited in (no Garmin `recorded` block), the estimate
   lagged at ~7:15, its 90% floor threw out the 5:36 and the Jul 5:19, and the
   Mile card showed 7:15. */
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; }, removeItem(k) { delete this.s[k]; } };
globalThis.window = globalThis.window || { dispatchEvent() {} };
const { testedRaceSeconds } = await import('./src/lib/cardioPrediction.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const TODAY = '2026-11-22';
const on = iso => ({ iso });
const run = (id, date, miles, minutes) => ({ id, date, title: 'Run', muscles: ['Cardio'], hasCardio: true,
  cardioSessions: [{ id: `s${id}`, activity: 'Run', structure: 'custom', summary: 'Run', prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: minutes, cardioType: 'Run' }] } }] });
const records = [run('jul', '2026-07-05', 1, 5 + 19 / 60), run('old', '2026-09-20', 1, 7 + 15 / 60), run('new', '2026-11-21', 1, 5.6)];
const lagging = 435; // the estimate still said 7:15
const mile = testedRaceSeconds(records, 1, [], lagging, TODAY);
check('the mile card is not slower than the fresh 5:36', mile !== null && mile <= 336, String(mile));
check('and it keeps the faster 5:19 from July', mile === 319, String(mile));
const without = testedRaceSeconds([records[1], records[2]], 1, [], lagging, TODAY);
check('with only the 7:15 and the 5:36, the 5:36 shows', without === 336, String(without));
const ride = testedRaceSeconds([run('old', '2026-09-20', 1, 7.25), run('fast', '2026-08-01', 1, 4.8)], 1, [], 435, TODAY);
check('an old, far-too-fast time still cannot beat a lagging estimate', ride === 435, String(ride));
if (fails) process.exit(1);
