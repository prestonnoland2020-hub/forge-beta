/* GUIDED: EARS CALIBRATE FIRST (#33) and the first-timer hint (#34). Steady
   noise from the moment the mic opens must send 0 clips; then "done" sends 1.
   The coach's "just tell me" hint is said once, on the first weighted card. */
import { buildSync } from 'esbuild';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const out = join(mkdtempSync(join(tmpdir(), 'ears-')), 'bundle.mjs');
buildSync({ stdin: { contents: "export { CloudEars } from './src/lib/guided/cloudEars.ts'; export { FIRST_TIMER_HINT, wantsFirstTimerHint } from './src/lib/guided/firstTimer.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { CloudEars, FIRST_TIMER_HINT, wantsFirstTimerHint } = await import(pathToFileURL(out).href);
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };

const frameOf = amp => Float32Array.from({ length: 2048 }, (_, i) => amp * Math.sin(i / 3)); // rms ≈ amp*0.707
const make = () => {
  const sent = [];
  const ears = new CloudEars(async wav => { sent.push(wav); return 'done'; });
  ears.ctx = { sampleRate: 16000 };
  ears.paused = false;
  return { ears, sent };
};
const MS = 128; // 2048 samples at 16 kHz

console.log('\nSteady noise at open');
let { ears, sent } = make();
let t = 1000;
for (let i = 0; i < 80; i += 1, t += MS) ears.frame(frameOf(0.12), t); // ~10 s of loud steady hum
await new Promise(r => setTimeout(r, 20));
check('steady gym noise: 0 clips sent', sent.length === 0, `sent ${sent.length}`);

console.log('\nThen "done"');
for (let i = 0; i < 6; i += 1, t += MS) ears.frame(frameOf(0.6), t);   // speech well above the floor
for (let i = 0; i < 10; i += 1, t += MS) ears.frame(frameOf(0.12), t); // back to hum: utterance ends
await new Promise(r => setTimeout(r, 20));
check('speech over the noise: exactly 1 clip', sent.length === 1, `sent ${sent.length}`);

console.log('\nNo clip can start in the first 0.5 s');
({ ears, sent } = make());
t = 5000;
for (let i = 0; i < 3; i += 1, t += MS) ears.frame(frameOf(0.6), t);
for (let i = 0; i < 10; i += 1, t += MS) ears.frame(frameOf(0.001), t);
await new Promise(r => setTimeout(r, 20));
check('loud frames during calibration are not speech', sent.length === 0, `sent ${sent.length}`);

console.log('\nCap and gate untouched');
const src = readFileSync('src/lib/guided/cloudEars.ts', 'utf8');
check('SESSION_CAP still 400', /SESSION_CAP = 400/.test(src));
check('loudness gate still checked', /gate\.allow\(db/.test(src));

console.log('\nFirst-timer hint');
check('first weighted main card, first set: hint', wantsFirstTimerHint('main', 225, 0, false));
check('already said: no hint', !wantsFirstTimerHint('main', 225, 0, true));
check('warm-up or no weight or later set: no hint', !wantsFirstTimerHint('warmup', 45, 0, false) && !wantsFirstTimerHint('main', null, 0, false) && !wantsFirstTimerHint('main', 225, 1, false));
check('hint mentions the example', /I did 225 for 5/.test(FIRST_TIMER_HINT));
const page = readFileSync('src/pages/GuidedPage.tsx', 'utf8');
check('GuidedPage uses it once (remembered)', /FIRST_TIMER_KEY, true/.test(page) && /wantsFirstTimerHint\(/.test(page));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
