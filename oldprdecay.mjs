/* AN OLD PR IS NOT TODAY'S FITNESS.

   Preston: if a run PR was a long time ago and no other numbers are even
   close, the projection has to count the time since. The curve used to blend
   its level only from the best efforts, so an athlete whose one hard run was
   five months back and who had only jogged since was predicted as if that
   race were yesterday. */
import { fitnessCurve, predictFromCurve, detrainFraction } from './src/lib/fitnessCurve.ts';
import { paceModel } from './src/lib/paceModel.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const TODAY = '2026-11-15';
const ago = n => { const d = new Date(`${TODAY}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const e = (days, miles, mmss) => { const [m, s] = mmss.split(':').map(Number); return { date: ago(days), miles, seconds: Math.round((m * 60 + s) * miles) }; };
const at = (c, miles) => predictFromCurve(c, miles).seconds;

console.log('\nA fresh best is not slowed');
const fresh = fitnessCurve([e(5, 3.11, '6:00'), e(12, 1, '5:30')], TODAY);
check('detrained is 0 inside four weeks', fresh.detrained === 0, String(fresh.detrained));

console.log('\nAn old best with nothing close since is slowed by its age');
const OLD = e(150, 3.11, '6:00');
const lonely = fitnessCurve([OLD], TODAY);
const same = fitnessCurve([{ ...OLD, date: ago(3) }], TODAY);
const slower = at(lonely, 3.107) / at(same, 3.107);
check('a 5-month-old 5K predicts slower than the same run this week', slower > 1.04 && slower < 1.08, slower.toFixed(3));
check('and the slowdown matches the fade schedule', Math.abs(lonely.detrained - detrainFraction(150)) < 0.001);

console.log('\nRecent jogs do not prove the old fitness is still there');
const jogs = fitnessCurve([OLD, e(4, 4, '9:30'), e(9, 5, '9:40')], TODAY);
check('still slowed by the age of the best', at(jogs, 3.107) > at(same, 3.107) * 1.04, `${at(jogs, 3.107)} vs ${at(same, 3.107)}`);

console.log('\nA recent run close to the old best keeps it');
const backed = fitnessCurve([OLD, e(6, 3.11, '6:06')], TODAY);
check('the fade is cancelled down to the recent run', at(backed, 3.107) <= at(fitnessCurve([e(6, 3.11, '6:06')], TODAY), 3.107) + 2,
  `${at(backed, 3.107)}`);

console.log('\nThe fade is capped');
check('never more than 10%', detrainFraction(5000) === 0.1);

console.log('\nTraining paces from a run older than the curve window fade too');
const run = (days, miles, seconds) => ({ date: ago(days), cardioSessions: [{ id: `c${days}`, activity: 'Run', structure: 'steady',
  prescription: { distanceUnit: 'miles', legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: miles, time: seconds / 60 }] } }] });
const ancient = run(300, 3.11, 1120), fresh5k = run(3, 3.11, 1120);
const mOld = paceModel([ancient], null, TODAY), mNew = paceModel([fresh5k], null, TODAY);
check('threshold from a 10-month-old 5K is slower', mOld.threshold > mNew.threshold * 1.05, `${mOld.threshold} vs ${mNew.threshold}`);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
