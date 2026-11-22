/* THE COACH'S MILEAGE TREND READS FORWARDS, AND A FAST MILE HOLDS THE ESTIMATE. */
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; }, removeItem(k) { delete this.s[k]; } };
globalThis.window = globalThis.window || { dispatchEvent() {} };
const { runningTrend } = await import('./src/lib/goalTrajectory.ts');
const { predictRaceFromLegacyMethod } = await import('./src/lib/cardioPrediction.ts');
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const t = runningTrend([{ weekOf: '2026-10-26', miles: 2, partial: false }, { weekOf: '2026-11-02', miles: 4, partial: false }, { weekOf: '2026-11-09', miles: 10.1, partial: false }, { weekOf: '2026-11-16', miles: 3, partial: true }]);
check('2, 4, 10.1 reads as going up', t.includes('Going UP') && t.indexOf('2 (') < t.indexOf('10.1 ('), t);
check('the unfinished week is not called the last week', t.includes('last finished week 10.1'), t);
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const run = (n, miles, minutes, hr) => ({ id: `r${n}`, date: day(n), title: 'Run', muscles: ['Cardio'], hasCardio: true,
  cardioSessions: [{ id: `s${n}`, activity: 'Run', structure: 'custom', summary: 'Run', ...(hr ? { recorded: { averageHr: hr, maxHr: 199 } } : {}),
    prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: minutes, cardioType: 'Run' }] } }] });
const easy = [2, 4, 6, 9, 11, 13].map(n => run(n, 1.1, 10, 140));
const records = [...easy, run(1, 1, 5.6, 184)];
const mile = predictRaceFromLegacyMethod(records, 1), fiveK = predictRaceFromLegacyMethod(records, 3.10686);
check('a 5:36 mile yesterday keeps the mile under 5:50', mile.seconds <= 350, String(mile.seconds));
check('and keeps the 5K near 20, not 24', fiveK.seconds <= 1240, String(fiveK.seconds));
if (fails) process.exit(1);
