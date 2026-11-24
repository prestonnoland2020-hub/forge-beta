/* GUIDED: REST TALK. During rest "heavier"/"lighter" move the NEXT set (and
   after a move's last set, the next move) and the coach keeps listening for
   rest words. A long phrase that matched no command reaches the coach only
   when it is about the workout; chatter, songs and mishearings stay quiet
   (Nov 19 the real iPhone heard "Or pick the speed go"). Barbell never drops
   under the empty bar. */
import { talkingToCoach, matchCommand } from './src/lib/guided/voice.ts';
import { nextWeight } from './src/lib/guided/builder.ts';
import { readFileSync } from 'node:fs';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const REST = ['ask', 'ready', 'more', 'heavier', 'lighter', 'skip', 'repeat', 'pause', 'resume', 'end'];

console.log('\nWho the talk is for');
for (const t of ['That one felt way too easy, what do I do', 'should I go heavier on the next set', 'my lower back hurts a little on this', 'how long should I rest here', 'I think that was too heavy for me'])
  check(`to the coach: "${t}"`, talkingToCoach(t));
for (const t of ['Or pick the speed go', 'I was going to go to the store', 'can you pass me the water', 'turn the music up a bit', 'what time is it now', 'hello', 'too easy'])
  check(`stays quiet: "${t}"`, !talkingToCoach(t));

console.log('\nRest words');
check('"heavier" is heard during rest', matchCommand('heavier', REST)?.command === 'heavier');
check('"go up" is heard during rest', matchCommand('go up', REST)?.command === 'heavier');
check('"lighter" is heard during rest', matchCommand('lighter please', REST)?.command === 'lighter');
check('"ready" still wins during rest', matchCommand("I'm ready", REST)?.command === 'ready');

console.log('\nWeights');
check('barbell Too hard at 45 lb stays 45', nextWeight(45, 'hard', 'barbell', false) === 45);
check('barbell Too hard at 20 kg stays 20', nextWeight(20, 'hard', 'barbell', true) === 20);
check('barbell Too hard at 65 lb goes to 55', nextWeight(65, 'hard', 'barbell', false) === 55);
check('dumbbell Too hard at 10 lb goes to 5', nextWeight(10, 'hard', 'dumbbell', false) === 5);
check('dumbbell Too easy at 10 lb goes to 15', nextWeight(10, 'easy', 'dumbbell', false) === 15);

console.log('\nPage wiring');
const page = readFileSync('src/pages/GuidedPage.tsx', 'utf8');
const rest = page.slice(page.indexOf("if (phase === 'rest') {\n      if (command === 'ready'"));
check('rest heavier/lighter go to the next set, not the finished move', /command === 'heavier'\) \{ bumpNext\(1\)/.test(rest) && /command === 'lighter'\) \{ bumpNext\(-1\)/.test(rest));
check('bumpNext targets the next move after the last set', /setIndex \+ 1 < step\.sets \? stepIndex : stepIndex \+ 1/.test(page));
check('bumpNext keeps rest words listening', /say\(`Okay, \$\{w\} \$\{unitWord\} for[^;]*REST_CMDS\)/.test(page));
check('long unknown talk is filtered before asking the coach', /if \(talkingToCoach\(text\)\)/.test(page));
check('up-next card reads the bumped weight for the next move', /weights\[stepIndex \+ 1\] !== undefined \? weights\[stepIndex \+ 1\]/.test(page));

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
process.exit(fails ? 1 : 0);
