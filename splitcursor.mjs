/* "IT SHOULDN'T BE SUGGESTING SHOULDERS AND ARMS TOMORROW I DID IT TODAY."

   Preston logged Sharms 2 on Monday and the Plan tab offered Sharms 2 again on
   Tuesday, with the rest day pushed to Wednesday and every day after it a day
   late. His split is eight positions long: Chest & Back, Legs, Sharms, Long
   Run, Chest & Back 2, Legs 2, Sharms 2, Rest.

   NOTHING WAS WRONG WITH THE CURSOR. training_cycle_state said next_position 8
   — Rest — and said it correctly, within a minute of him finishing. The bug
   was in what the calendar was anchored to: the POSITION came off the stored
   recommendation, which after today's session is logged is the day just
   FINISHED (that is the point of keeping it on screen), while the DATE had
   already moved on to tomorrow. The pair disagreed by one position, so the
   rotation painted the finished day onto tomorrow.

   This pins the relationship between the two, which is the thing that broke:
   whatever position is handed in belongs to the date handed in with it. */
import { weekCycleDays } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
/* His split, exactly. */
const SPLIT = [
  { name: 'Chest & Back', dayType: 'strength' }, { name: 'Legs', dayType: 'strength' },
  { name: 'Sharms', dayType: 'strength' }, { name: 'Long Run', dayType: 'cardio' },
  { name: 'Chest & Back 2', dayType: 'strength' }, { name: 'Legs 2', dayType: 'strength' },
  { name: 'Sharms 2', dayType: 'strength' }, { name: 'Rest', dayType: 'rest' },
];
/* The week he was looking at: Sunday 13 September through Saturday 19. */
const WEEK_START = '2026-09-13';
const names = anchor => weekCycleDays(WEEK_START, 0, SPLIT, 'rolling', anchor).map(day => day.name);
const on = (list, iso) => list[Math.round((new Date(`${iso}T12:00:00`) - new Date(`${WEEK_START}T12:00:00`)) / 86400000)];

console.log('\nThe position handed in is the position drawn on the date handed in');
/* He trained on Monday the 14th, so the cursor moved to Rest (8) and the date
   it is owed moved to Tuesday the 15th. That pair is what the Plan tab passes
   now — and it is the whole fix. */
const fixed = names({ position: 8, dateIso: '2026-09-15' });
check('the anchor date gets the anchor position', on(fixed, '2026-09-15') === 'Rest', on(fixed, '2026-09-15'));
check('and the day he actually trained is behind it', on(fixed, '2026-09-14') === 'Sharms 2', on(fixed, '2026-09-14'));
check('so tomorrow is not a repeat of today',
  on(fixed, '2026-09-15') !== on(fixed, '2026-09-14'), `${on(fixed, '2026-09-14')} then ${on(fixed, '2026-09-15')}`);
check('and the cycle carries on in order after it',
  on(fixed, '2026-09-16') === 'Chest & Back' && on(fixed, '2026-09-17') === 'Legs',
  `${on(fixed, '2026-09-16')} / ${on(fixed, '2026-09-17')}`);

console.log('\nThe bug, stated as what the old pairing produced');
/* The position off the completed recommendation (7) with the date already
   moved to tomorrow. Kept as a check rather than a comment: this is the exact
   pair that produced his screenshot, and it must never be what is drawn. */
const broken = names({ position: 7, dateIso: '2026-09-15' });
/* The whole rotation slides back a day, so the session he finished on Monday
   is what Tuesday is offered — which is the screenshot — and Monday is
   labelled as the day BEFORE the one he did. */
check('the day he finished lands on tomorrow',
  on(broken, '2026-09-15') === 'Sharms 2' && on(fixed, '2026-09-14') === 'Sharms 2',
  `broken Tue ${on(broken, '2026-09-15')}, he trained Sharms 2 on Mon`);
check('and the day he trained is labelled as the one before it',
  on(broken, '2026-09-14') === 'Legs 2', on(broken, '2026-09-14'));
check('and pushes the rest day a day late',
  on(broken, '2026-09-16') === 'Rest' && on(fixed, '2026-09-15') === 'Rest',
  `broken Wed ${on(broken, '2026-09-16')}, fixed Tue ${on(fixed, '2026-09-15')}`);
check('which is a whole week off by one', on(broken, '2026-09-17') !== on(fixed, '2026-09-17'));

console.log('\nBefore anything is trained, the position belongs to today');
const untrained = names({ position: 7, dateIso: '2026-09-14' });
check('today gets what today is owed', on(untrained, '2026-09-14') === 'Sharms 2', on(untrained, '2026-09-14'));
check('and tomorrow is the next one along', on(untrained, '2026-09-15') === 'Rest', on(untrained, '2026-09-15'));

console.log('\nAnd the rotation itself is sound in both directions');
const week = names({ position: 1, dateIso: '2026-09-13' });
check('seven days are drawn', week.length === 7, String(week.length));
check('each is the next position along',
  week.join('|') === ['Chest & Back', 'Legs', 'Sharms', 'Long Run', 'Chest & Back 2', 'Legs 2', 'Sharms 2'].join('|'), week.join(' / '));
/* A cycle shorter than a week repeats inside it, which is correct and is why
   the rotation is computed from an absolute day number rather than an index. */
const short = weekCycleDays(WEEK_START, 0, SPLIT.slice(0, 3), 'rolling', { position: 1, dateIso: WEEK_START }).map(day => day.name);
check('a three-day cycle comes round twice in a week',
  short[0] === short[3] && short[3] === short[6], short.join(' / '));
check('nothing is undefined at either end', week.every(Boolean) && short.every(Boolean));
/* Wrapping backwards past position one must land on the last day, not on
   nothing — the week behind today is drawn by winding the rotation back. */
const wrapped = names({ position: 1, dateIso: '2026-09-15' });
check('winding back past the first position reaches the last',
  on(wrapped, '2026-09-14') === 'Rest' && on(wrapped, '2026-09-13') === 'Sharms 2',
  `${on(wrapped, '2026-09-13')} / ${on(wrapped, '2026-09-14')}`);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
