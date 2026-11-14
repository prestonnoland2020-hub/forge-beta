/* COACH ME PICKS FROM THE DATA: the most rested muscles, nothing the body log
   flags, a pull toward the goals' muscles, stretching when everything is
   tired — and always a reason. */
import { pickFocus, daysSinceTrained } from './src/lib/guided/pickFocus.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const today = '2026-11-14';
const ago = n => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const prefs = { styles: ['Strength'], vibe: [], place: 'Gym', gear: [], level: 'Comfortable' };
const legs = d => ({ date: ago(d), topSets: [{ lift: 'Back Squat', muscle: 'Quads', completed: true }, { lift: 'Romanian Deadlift', muscle: 'Hamstrings', completed: true }], muscles: ['Glutes', 'Abs', 'Calves'] });
const upper = d => ({ date: ago(d), topSets: [{ lift: 'Bench Press', muscle: 'Chest' }, { lift: 'Lat Pulldown', muscle: 'Back' }, { lift: 'Overhead Press', muscle: 'Shoulders' }, { lift: 'Barbell Curl', muscle: 'Biceps' }, { lift: 'Triceps Pushdown', muscle: 'Triceps' }] });

const since = daysSinceTrained([legs(1), upper(5)], today);
check('reads days since each muscle', since.get('Quads') === 1 && since.get('Chest') === 5, JSON.stringify([...since]));

const a = pickFocus({ records: [legs(1), upper(5)], todayIso: today, prefs });
check('legs yesterday: upper body', a.focus === 'Upper body', JSON.stringify(a));
check('says why, with the days', /5 days ago/.test(a.why), a.why);

const b = pickFocus({ records: [legs(6), upper(1)], todayIso: today, prefs });
check('upper yesterday: a legs or glutes day', b.focus === 'Lower body' || b.focus === 'Glutes & core', JSON.stringify(b));

const c = pickFocus({ records: [legs(1), upper(0)], todayIso: today, prefs });
check('everything trained in two days: stretch', c.focus === 'Stretch it out' && /two days/.test(c.why), JSON.stringify(c));

const d = pickFocus({ records: [legs(6), upper(6)], todayIso: today, prefs, avoid: ['Chest', 'Shoulders', 'Triceps'] });
check('flagged muscles pushed down the list', d.focus !== 'Upper body', JSON.stringify(d));

const e = pickFocus({ records: [], todayIso: today, prefs: { ...prefs, styles: ['Stretch & mobility'] } });
check('stretch-only setup stays stretch', e.focus === 'Stretch it out');

const f = pickFocus({ records: [legs(4), upper(4)], todayIso: today, prefs, goalMuscles: ['Chest'] });
check('equal rest: the goals pull', f.focus === 'Upper body' || f.focus === 'Full body', JSON.stringify(f));

const g = pickFocus({ records: [], todayIso: today, prefs });
check('no history: still picks, still says why', g.focus !== 'Stretch it out' && g.why.length > 10, JSON.stringify(g));

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
