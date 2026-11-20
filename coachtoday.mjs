/* THE COACH SEES TODAY (Nov 19). "How was today?" got "I can't see the sets
   you completed" an hour after they were logged: today's sets sat at the end
   of a context that gets cut. Today's log now leads the context and survives
   the cut. */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
let fails = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails += 1; };
const page = readFileSync('src/pages/CoachPage.tsx', 'utf8');
check('the coach request leads with todayLogged', /context:\{todayLogged:todayLoggedFor\(records,todayIso\)/.test(page));
const fn = readFileSync('supabase/functions/forge-coach/index.ts', 'utf8');
const start = fn.indexOf('function fitContext'); const body = fn.slice(start, fn.indexOf('\n}\n', start) + 3);
const js = transformSync(body, { loader: 'ts' }).code;
const fitContext = new Function('CONTEXT_LIMIT', 'BULKY_KEYS', `${js}; return fitContext;`)(30000, ['availableLibrary', 'aiProgram', 'careerSummary', 'weeklyRunning', 'bodyWeight', 'goalSuggestions', 'trainingSummary']);
const huge = { conversationHistory: [{ role: 'user', text: 'How was today' }], availableLibrary: 'x'.repeat(40000), recentTrainingHistory: Array.from({ length: 60 }, (_, i) => ({ date: `d${i}`, pad: 'y'.repeat(300) })), todayLogged: { date: '2026-11-19', workouts: [{ topSets: [{ lift: 'Pull Ups', weight: 135, reps: 3 }] }] } };
const out = fitContext(huge);
check('a context far over the limit still carries today\'s sets whole', out.length <= 30000 && JSON.parse(out).todayLogged.workouts[0].topSets[0].lift === 'Pull Ups');
check('today goes first, before anything that could be cut', out.startsWith('{"todayLogged"'));
check('the prompt tells the coach to judge today from todayLogged', /WHAT THEY LOGGED TODAY/.test(fn) && /Never say you can't see today's sets/.test(fn));
if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
