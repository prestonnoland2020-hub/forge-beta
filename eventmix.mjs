/* A RACE IS NOT A SCALED VERSION OF ANOTHER RACE, and one phase vocabulary.

   Forge ran the same threshold/interval alternation whatever the athlete was
   training for — a 5K plan wearing six different names — and named its weeks
   in two vocabularies at once: the roadmap said Foundation/Build/Specific and
   the stored block said Base/Build/Peak, on the same screen. Worse, the
   roadmap's "Test" was the LIFTING max week, so a squat max was labelled a
   running test in a week the block called a build. */
import { eventProfileFor, sessionKindFor, EVENT_PROFILES } from './src/lib/eventProfile.ts';
import { phaseFor, normalizePhase, TAPER_WEEKS } from './src/lib/trainingPhase.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

console.log('\nThe event picks the profile, and an unlisted one lands on its nearest neighbour');
check('a 5K is a 5K', eventProfileFor(3.107).key === '5k');
check('a marathon is a marathon', eventProfileFor(26.219).key === 'marathon');
check('a mile is a mile', eventProfileFor(1).key === 'mile');
check('a 4-mile nobody thought of trains like a 5K, not like a marathon',
  ['5k', '10k'].includes(eventProfileFor(4).key), eventProfileFor(4).key);
check('a 50K trains like a marathon', eventProfileFor(31).key === 'marathon', eventProfileFor(31).key);
check('no distance at all falls back rather than crashing', eventProfileFor(0).key === '5k');
check('every profile has an emphasis worth showing',
  EVENT_PROFILES.every(profile => profile.emphasis.length > 20));

console.log('\nShort events sharpen sooner; long ones need the base for longer');
const mile = eventProfileFor(1), marathon = eventProfileFor(26.219);
check('the marathon spends more of the block on base',
  marathon.shape.foundationShare > mile.shape.foundationShare,
  `${marathon.shape.foundationShare} vs ${mile.shape.foundationShare}`);
check('and gives the long run a bigger share of the week',
  marathon.longRunShare > mile.longRunShare, `${marathon.longRunShare} vs ${mile.longRunShare}`);
check('the long-run share climbs with the distance, every step',
  [...EVENT_PROFILES].reverse().every((profile, index, list) => index === 0 || profile.longRunShare >= list[index - 1].longRunShare));

console.log('\nDeload, taper and race week are the same for everyone');
for (const profile of EVENT_PROFILES) {
  const shared = sessionKindFor(profile, 'Deload', 0) === 'fartlek'
    && sessionKindFor(profile, 'Taper', 0) === 'strides'
    && sessionKindFor(profile, 'Race', 0) === 'test';
  check(`${profile.label.padEnd(14)} recovers and sharpens like everyone else`, shared);
}

console.log('\nOne phase vocabulary, and the lifting wave is no longer part of it');
check('the block\'s old words still read', normalizePhase('Base') === 'Foundation' && normalizePhase('Peak') === 'Specific');
check('including the one that meant two things', normalizePhase('Test') === 'Race');
check('an unknown word does not blank the week', normalizePhase('???') === 'Build');

const shape = eventProfileFor(3.107).shape;
const block = weeks => Array.from({ length: weeks }, (_, index) =>
  phaseFor({ weekIndex: index, blockWeeks: weeks, weeksToRace: weeks - 1, deloading: index % 5 === 3, shape }));
const twelve = block(12);
check('a block starts in Foundation', twelve[0] === 'Foundation', twelve[0]);
check('and ends on the race', twelve[11] === 'Race', twelve[11]);
check(`the ${TAPER_WEEKS} weeks before it are the taper`,
  twelve.slice(9, 11).every(phase => phase === 'Taper'), twelve.slice(9, 11).join(', '));
check('it passes through Build and Specific on the way',
  twelve.includes('Build') && twelve.includes('Specific'), twelve.join(' '));
check('a cut week is a deload', twelve[3] === 'Deload');
check('but never at the cost of the taper',
  phaseFor({ weekIndex: 8, blockWeeks: 12, weeksToRace: 9, deloading: true, shape }) === 'Taper');
check('nor of race week',
  phaseFor({ weekIndex: 9, blockWeeks: 12, weeksToRace: 9, deloading: true, shape }) === 'Race');

console.log('\nThe taper is measured from the RACE, not from the end of the block');
check('a block that runs past the race tapers inside itself',
  phaseFor({ weekIndex: 4, blockWeeks: 20, weeksToRace: 5, shape }) === 'Taper');
check('and a block that ends long before it does not taper early',
  phaseFor({ weekIndex: 9, blockWeeks: 10, weeksToRace: 40, shape }) === 'Specific');
check('with no race at all the block still ends by freshening',
  phaseFor({ weekIndex: 9, blockWeeks: 10, shape }) === 'Taper');

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
