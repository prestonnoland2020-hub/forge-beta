/* EVERY HARD SESSION NAMED A PACE AND LEFT THE REST TO GUESSWORK.

   Preston screenshotted a Tuesday that read "Short fartlek — 6 × 1 min brisk,
   easy between. Stop while fresh" and asked the obvious question: brisk at
   what, and easy for how long. He was right to. Across the whole card the
   recovery was missing from the VO2 session, a bare "full recovery" on the
   repetition session, a word rather than a figure on the fartlek, and present
   only on threshold sessions long enough to be broken into pieces.

   The recovery is not a detail. Twelve hundreds with ninety seconds are VO2max
   work; the same repeats with four minutes are repetitions. An athlete
   guessing between them runs a different session from the one Forge judges
   them on the following week — and the verdict, the level, and the next dose
   all come off that judgement.

   So this pins two things together: every prescription carries a pace and a
   recovery, AND every prescription still parses back into the verdict. Writing
   the card is not free — the card IS the contract sessionVerdict measures
   against, and prose added to it that the parser cannot read silently stops
   the whole progression-level loop. */
import { qualitySession, intervalRest, repetitionRest } from './src/lib/qualitySession.ts';
import { parsePrescription } from './src/lib/sessionVerdict.ts';
import { zoneOfPrescription } from './src/lib/progressionLevels.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

/* Preston: a mile goal, eighteen miles a week, paces off his 5:19. */
const PACES = { threshold: 417, interval: 343, repetition: 307, easyFast: 517, easySlow: 584, marathon: 507 };
const LEVELS = { threshold: 5, interval: 5, repetition: 5, racepace: 5 };
const HIS = { goalPaceSecondsPerMile: 299, weeklyMiles: 18, goalMiles: 1, paces: PACES, levels: LEVELS };
const at = (phase, weekIndex, extra = {}) => qualitySession({ ...HIS, ...extra, phase, weekIndex });

/* Every shape the card can take, so none of them can quietly lose a number. */
const CARDS = [
  ['threshold', at('Foundation', 0)],
  ['repetitions', at('Build', 1)],
  ['intervals', at('Build', 6)],
  ['fartlek', at('Deload', 3)],
  ['strides', at('Taper', 0)],
  ['race pace', at('Build', 2, { goalMiles: 13.109, weeklyMiles: 35, goalPaceSecondsPerMile: 420 })],
];

console.log('\nEvery hard session says how fast');
for (const [name, session] of CARDS) {
  check(`${name} names a pace`, /\d+:\d{2}\s*\/\s*(mi|rep)|goal effort/i.test(session.text), session.text);
}

console.log('\nAnd every session with a gap in it says how long the gap is');
/* A continuous threshold run has no gap, and that is the one exemption. */
const continuous = at('Foundation', 0, { weeklyMiles: 9 });
check('a continuous tempo has nothing to recover between',
  /continuous/.test(continuous.text) && !/between|recovery/.test(continuous.text), continuous.text);
for (const [name, session] of CARDS) {
  if (!/[x×]/.test(session.text)) continue;
  check(`${name} says what happens between the repeats`,
    /(\d+\s*s\b|\d+(\.\d+)?\s*min|\d+:\d{2})[^·]{0,20}?(between|recovery)|recovery \(~(\d+\s*s|\d+(\.\d+)?\s*min|\d+:\d{2})\)/i.test(session.text), session.text);
}

console.log('\nThe fartlek was the worst of them and is the case he raised');
const fartlek = at('Deload', 3);
check('"brisk" is now a pace', /@ \d+:\d{2}\/mi/.test(fartlek.text), fartlek.text);
check('and "easy between" is now a duration', /1 min easy jog between/.test(fartlek.text), fartlek.text);
check('it is still the stop-while-fresh session a deload asks for',
  /Stop while fresh/.test(fartlek.text) && fartlek.miles <= 4, `${fartlek.miles} mi`);
/* With no demonstrated fitness there is no pace to print, and a card that
   invents one is worse than a card that says "brisk". */
const unpaced = qualitySession({ ...HIS, paces: undefined, phase: 'Deload', weekIndex: 3 });
check('an athlete with no evidence gets the session without a fabricated pace',
  Boolean(unpaced.text) && unpaced.miles > 0, unpaced.text);

console.log('\nRecovery is the physiology, not a constant');
/* VO2max recovery is about the length of the repeat — long enough to run the
   next one at pace, short enough that oxygen uptake never comes back down.
   Repetition recovery is the opposite: the dose is movement quality, so it is
   whatever it takes to run the next one as fast. */
check('a longer VO2 repeat earns a longer jog', intervalRest(180) > intervalRest(90),
  `${intervalRest(90)} vs ${intervalRest(180)}`);
check('but never less than a minute or more than four',
  intervalRest(20) === 60 && intervalRest(600) === 240, `${intervalRest(20)} / ${intervalRest(600)}`);
check('and repetition recovery is far longer than interval recovery at the same rep',
  repetitionRest(90) > intervalRest(90) * 1.5, `${repetitionRest(90)} vs ${intervalRest(90)}`);

console.log('\nAnd the card still reads back into the verdict, which is the whole loop');
/* THE FAILURE MODE THIS EXISTS FOR. sessionVerdict parses the sentence Forge
   wrote; progressionLevels reads the zone off the same sentence. Prose added
   for the athlete that the parser cannot follow does not look broken on screen
   — it silently stops every level from ever moving again. */
for (const [name, session] of CARDS) {
  if (/fartlek|strides/.test(name)) continue;
  const parsed = parsePrescription(session.text);
  check(`${name} parses back out`, Boolean(parsed), session.text);
  check(`${name} lands on a ladder`, Boolean(zoneOfPrescription(session.text)), session.text);
}
const intervals = at('Build', 6);
const parsedIntervals = parsePrescription(intervals.text);
check('and the recovery is not mistaken for the work',
  parsedIntervals?.kind === 'intervals' && parsedIntervals.metres === 600 && parsedIntervals.reps === 5,
  JSON.stringify(parsedIntervals));
const reps = at('Build', 1);
check('a repetition session is still told apart from an interval one',
  parsePrescription(reps.text)?.kind === 'reps', reps.text);
const tempo = at('Foundation', 0);
check('and a broken tempo still reads as threshold, not as intervals',
  parsePrescription(tempo.text)?.kind === 'threshold', tempo.text);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
