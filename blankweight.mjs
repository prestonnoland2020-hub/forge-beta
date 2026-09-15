/* "DON'T WANT THE APP AUTO FILLING WEIGHT ON DAILY LOGGED."

   A prescribed row used to open with the plan's load already in the weight
   dial. Two things go wrong with that. The small one is that the quickest way
   through the row is to confirm a number nobody lifted. The big one arrived
   the week the wave asked Preston for 265 x 6 off a 235 best: the wrong number
   was not a suggestion he could ignore, it was sitting in the box with his
   name on it, one tap from the record and from the next block built on it.

   So the ask is printed as an ask and the dial starts empty. The rep target
   stays — 8/6/4/2/1 IS the prescription, the shape of the block, not a guess
   at a result — and prescribedWeight still carries what was asked, because
   that is what progression reads back.

   Read off the source: the alternative is driving the whole logger in a
   browser to assert that one field is blank. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

const page = readFileSync('./src/pages/ProductPages.tsx', 'utf8');
const cards = readFileSync('./src/components/TopSetCards.tsx', 'utf8');

/* Both prescription builders — the split-day picker and today's
   recommendation — run through the same mapping shape. */
const maps = page.match(/\.map\(set=>\(\{recommendationTopSetId:set\.id[^\n]*?\}\)\)/g) || [];

console.log('\nA prescribed row carries the ask, not a pre-typed result');
check('both prescription builders are present', maps.length === 2, `found ${maps.length}`);
check('neither seeds the weight field', maps.every(map => /weight:0,/.test(map)),
  maps.find(map => !/weight:0,/.test(map))?.slice(0, 120) || '');
check('neither seeds a calculated max off a lift that has not happened',
  maps.every(map => /calculatedMax:undefined/.test(map)));
check('the asked weight is still recorded as the ask',
  maps.every(map => /prescribedWeight:set\.weight\|\|undefined/.test(map)));
check('the rep target is still prescribed',
  maps.every(map => /reps:set\.reps,/.test(map) && /prescribedReps:set\.reps\|\|undefined/.test(map)));
check('the no-history fallback is blank too',
  /lift:exercise\.name,weight:0,reps:0/.test(page));

console.log('\nThe ask is printed where the athlete can read it');
check('an unlogged row derives the ask from the prescription',
  /const askReps = logged \? 0 : displayedSet\.prescribedReps \|\| 0;/.test(cards));
check('a logged row prints its result, never an ask',
  /const askWeight = logged \? 0 : displayedSet\.prescribedWeight \|\| 0;/.test(cards));
check('the closed row says what was asked', /asks \$\{askText\}/.test(cards));
check('the open row labels it PLAN ASKS', /PLAN ASKS<\/span><strong>\{askText\}/.test(cards));
check('and says whose number goes in the dial', /Log what you actually lifted\./.test(cards));

console.log('\nThe dial itself stays empty until it is filled');
const weightDial = (cards.match(/<DialField label="Weight"[^\n]*?\/>/) || [''])[0];
check('the weight dial shows nothing for a zero weight',
  /value=\{displayedSet\.weight \? String\(displayedSet\.weight\) : ''\}/.test(weightDial), weightDial.slice(0, 120));
check('saving is refused until a weight is entered',
  /disabled=\{!displayedSet\.lift \|\| !displayedSet\.weight/.test(cards));

console.log('\nFinish Day still refuses to invent a result');
check('an unlogged prescription cannot reach the record',
  /&&Boolean\(editingRecord\)\)\.map/.test(page));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
