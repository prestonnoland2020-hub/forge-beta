/* Guided: a workout saved during a rest resumes on the NEXT set, not the one just logged.
   Run: npx vite-node guidedresume.mjs */
const { resumePoint } = await import('./src/lib/guided/builder.ts');
let fails = 0;
const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — got ${JSON.stringify(got)}`}`); if (!ok) fails += 1; };
check('rest after set 2 of 3 → set 3', resumePoint(3, 1, 3, 'rest'), { stepIndex: 3, setIndex: 2 });
check('rest after the last set of a move → next move, set 1', resumePoint(3, 2, 3, 'rest'), { stepIndex: 4, setIndex: 0 });
check('rest after a 1-set top set → next move', resumePoint(1, 0, 1, 'rest'), { stepIndex: 2, setIndex: 0 });
check('on the card: stays (not logged yet)', resumePoint(3, 1, 3, 'card'), { stepIndex: 3, setIndex: 1 });
check('on the feel question: stays (not logged yet)', resumePoint(3, 1, 3, 'feel'), { stepIndex: 3, setIndex: 1 });
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
