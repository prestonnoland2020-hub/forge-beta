/* EVERY TOKEN A RULE ASKS FOR MUST EXIST IN EVERY TONE.

   An undefined custom property does NOT fall back to the earlier cascade
   value. `background: var(--surface-0)` with no --surface-0 anywhere is
   invalid at computed-value time, and the property is unset — so the app's
   header shipped with no background at all: measured on a phone it was
   rgba(0,0,0,0), a title and a blur with whatever scrolled under it showing
   through. Three rules asked for --surface-0 and nothing declared it.

   Reading the CSS is the only way to catch this: the page renders, nothing
   throws, and the contrast audit sees the ground BEHIND the chrome and calls
   it legible. So: collect every var(--token) a rule consumes, collect every
   token each tone block declares, and require the first set inside the
   second. A token declared in light and missing in dark is the same bug
   wearing a coat, which is what the theme file's own header warns about. */
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

const theme = readFileSync('./src/forge-theme.css', 'utf8');

/* The three tone blocks, in the order the file declares them: bare :root is
   light, then dark twice — once for the un-attributed System case and once for
   an explicit choice. */
const toneBody = (start) => {
  let depth = 0, out = '';
  for (let i = start; i < theme.length; i += 1) {
    const ch = theme[i];
    if (ch === '{') depth += 1;
    if (ch === '}') { depth -= 1; if (depth <= 0) break; }
    out += ch;
  }
  return out;
};
const blockAt = (needle) => {
  const at = theme.indexOf(needle);
  return at < 0 ? '' : toneBody(theme.indexOf('{', at));
};
const declared = (body) => new Set([...body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));

const light = declared(blockAt('\n:root {'));
const darkSystem = declared(blockAt('@media (prefers-color-scheme: dark)'));
const darkChosen = declared(blockAt('[data-theme="dark"] {'));

console.log('\nThe three tone blocks were found');
check('light declares a full palette', light.size > 30, `${light.size} tokens`);
check('dark (System) declares one too', darkSystem.size > 30, `${darkSystem.size} tokens`);
check('dark (chosen) declares one too', darkChosen.size > 30, `${darkChosen.size} tokens`);

/* What the components actually consume, across every stylesheet. */
const files = readFileSync('./src/main.tsx', 'utf8')
  .split('\n').map(line => line.match(/^import '\.\/([^']+\.css)'/)).filter(Boolean).map(m => m[1]);
check('the stylesheet list came from main.tsx', files.length > 20, `${files.length} files`);

const consumed = new Map();
/* Declared ANYWHERE counts: the older stylesheets carry their own compatibility
   aliases (--line, --muted, --panel), and a rule consuming one of those is not
   the bug this test is about. */
const declaredSomewhere = new Set(light);
for (const file of files) {
  const css = readFileSync(`./src/${file}`, 'utf8');
  /* var(--x, fallback) already says what to do when --x is missing; only a
     bare var(--x) is a promise the theme has to keep. */
  for (const [, token] of css.matchAll(/var\((--[a-z0-9-]+)\s*\)/gi)) {
    if (!consumed.has(token)) consumed.set(token, file);
  }
  for (const [, token] of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) declaredSomewhere.add(token);
}

/* Raw accent material (--a-*) is declared per accent, not per tone, and the
   chrome-pin/tap variables are set from JS at runtime. */
const RUNTIME = new Set(['--chrome-pin-bottom', '--chrome-pin-top', '--topbar-h', '--chrome-clear', '--tap', '--vh']);
const isTone = (token) => !token.startsWith('--a-') && !RUNTIME.has(token);

const missing = [...consumed].filter(([token]) => isTone(token) && !declaredSomewhere.has(token));
console.log('\nEvery token a rule consumes is declared somewhere');
check('nothing is consumed undefined', missing.length === 0,
  missing.slice(0, 6).map(([t, f]) => `${t} (${f})`).join(', '));

/* Radii, spacing, easing and the type stack do not vary by tone and are
   rightly declared once. A COLOUR that exists in one tone and not the other is
   exactly the bug the theme file's own header was written to end. */
const lightBody = blockAt('\n:root {');
const colourValue = (token) => {
  const at = lightBody.indexOf(`${token}:`);
  const value = lightBody.slice(at, lightBody.indexOf(';', at));
  return /#[0-9a-f]{3,8}|rgba?\(|color-mix\(|oklch\(/i.test(value);
};
console.log('\nAnd every colour is declared in both tones');
/* A value built from another token (--accent-wash is a color-mix of --tint)
   follows whichever tone --tint is on, so it is declared once on purpose. */
const literal = (token) => {
  const at = lightBody.indexOf(`${token}:`);
  return !/var\(/.test(lightBody.slice(at, lightBody.indexOf(';', at)));
};
const colours = [...light].filter(t => isTone(t) && colourValue(t) && literal(t));
check('the light block has a real palette to compare', colours.length > 20, `${colours.length} colours`);
const onlyLight = colours.filter(t => !darkSystem.has(t));
const onlyDark = [...darkSystem].filter(t => !light.has(t));
check('no colour exists in light but not dark', onlyLight.length === 0, onlyLight.join(', '));
check('no token exists in dark but not light', onlyDark.length === 0, onlyDark.join(', '));
check('the chosen-dark block matches the System one',
  [...darkSystem].every(t => darkChosen.has(t)),
  [...darkSystem].filter(t => !darkChosen.has(t)).join(', '));

console.log('\nAnd the token this test was written for is one of them');
check('--surface-0 is declared in light', light.has('--surface-0'));
check('--surface-0 is declared in dark (System)', darkSystem.has('--surface-0'));
check('--surface-0 is declared in dark (chosen)', darkChosen.has('--surface-0'));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
