/* GUIDED: THE LOUDNESS GATE. Clips clearly quieter than the athlete are not
   sent; with no level known nothing changes; three drops in a row within 20 s
   switch the gate off for the session so the athlete is never unheard. */
import { LoudnessGate, DROP_DB, toDb } from './src/lib/guided/voiceGate.ts';
import { readFileSync } from 'node:fs';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };

console.log('\nGate maths');
check('0.1 rms is -20 dB', Math.abs(toDb(0.1) + 20) < 1e-9);
let g = new LoudnessGate();
check('no level known: everything goes through', g.allow(-80, 0) && g.dropped === 0);
g.setLevel(-20);
check('at the athlete level: sent', g.allow(-20, 0));
check('just inside 12 dB below: sent', g.allow(-20 - DROP_DB + 0.1, 0));
check('clearly quieter (more than 12 dB): held back', !g.allow(-20 - DROP_DB - 1, 0) && g.dropped === 1);
check('louder than the athlete: sent', g.allow(-10, 0));
g.setLevel(-5);
check('a command does not overwrite a known level', g.level === -20);
g.setLevel(-5, true);
check('the voice check does', g.level === -5);
check('a non-number never gates', new LoudnessGate().allow(NaN, 0));

console.log('\nRelax rule');
g = new LoudnessGate(); g.setLevel(-20);
check('two quiet clips: still gated', !g.allow(-50, 0) && !g.allow(-50, 5000) && !g.relaxed);
check('the third within 20 s is held, then the gate relaxes', !g.allow(-50, 10000) && g.relaxed);
check('after that everything is sent', g.allow(-50, 11000) && g.allow(-80, 12000));
g = new LoudnessGate(); g.setLevel(-20);
g.allow(-50, 0); g.allow(-50, 5000); g.allow(-20, 6000);
check('a normal clip in between resets the run', !g.allow(-50, 7000) && !g.relaxed);
g = new LoudnessGate(); g.setLevel(-20);
g.allow(-50, 0); g.allow(-50, 15000);
check('drops more than 20 s apart do not count together', !g.allow(-50, 30000) && !g.relaxed);

console.log('\nWired in');
const ears = readFileSync('src/lib/guided/cloudEars.ts', 'utf8');
const voice = readFileSync('src/lib/guided/voice.ts', 'utf8');
check('cloud ears check the gate before sending', /gate\.allow\(db/.test(ears));
check('the voice check sets the level', /learnLevel\(true\)/.test(voice));
check('a real command teaches it', /learnLevel\(\); this\.onHeard/.test(voice));
check('voice_events gets a gated count', /onReport\('gated'/.test(voice));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
