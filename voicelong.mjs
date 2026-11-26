/* Guided: a long sentence that merely contains a command word is not a command
   (#42). Run: npx vite-node voicelong.mjs */
const { matchCommand } = await import('./src/lib/guided/voice.ts');
const CARD = ['ask','done','ready','start','how','easier','harder','heavier','lighter','repeat','skip','pause','resume','end'];
const FEEL = ['easy','right','hard','repeat','how','ask'];
const REST = ['ready','more','skip','repeat','pause','resume','end','ask'];
let fails = 0;
const cases = [
  ['way too easy',FEEL,'easy'],['that one felt way too easy',FEEL,'easy'],['that was way too hard',FEEL,'hard'],['too heavy',FEEL,'hard'],['too light',FEEL,'easy'],
  ['perfect',FEEL,'right'],['skip this one',CARD,'skip'],['next exercise',CARD,'ready'],['hold on',REST,'pause'],['wait',CARD,'pause'],['give me thirty more seconds',REST,'more'],
  ['finished',CARD,'done'],['all done',CARD,'done'],['done done',CARD,'done'],['say done when you finish',CARD,null],['say ready when you want to go',REST,null],
  ['he was done with it',CARD,null],['the song is too easy to sing',FEEL,null],["let's go",REST,'ready'],['how do I do this',CARD,'how'],
  ["I'm done with that set",CARD,'done'],['okay I think that was done',CARD,'done'],['coach why is it fifteen pounds and is that too hard',CARD,'ask'],
];
for (const [t, a, want] of cases) {
  const got = matchCommand(t, a)?.command ?? null;
  const ok = got === want; if (!ok) fails += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(t)} -> ${got} (want ${want})`);
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
