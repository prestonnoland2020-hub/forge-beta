#!/usr/bin/env node
/* ONE RUNNER, SO A STALE TEST CANNOT HIDE.

   Seventy-odd .mjs suites, run by hand, one at a time. Four of them needed a
   preview server nobody had started and errored out with a stack trace instead
   of a failure — so "no FAIL lines" read as passing. Seven more were asserting
   numbers the app had left behind months ago: Epley maxes from before the
   shared curve, a three-step setup that has four steps, button labels that were
   renamed. Nothing was watching, so they accumulated.

   This starts the servers each suite needs, runs everything, and prints one
   table: passed, failed, or ERRORED — which is its own category, because a
   suite that cannot run is not a suite that passed.

     node runtests.mjs              every suite
     node runtests.mjs plan goal    only suites whose name matches
     node runtests.mjs --logic      skip anything needing a browser
*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const logicOnly = args.includes('--logic');
const filters = args.filter(arg => !arg.startsWith('--'));

const SELF = ['runtests.mjs', 'seed.mjs', 'el.mjs', 'dialdriver.mjs', 'inspect.mjs'];
const suites = readdirSync('.').filter(name => name.endsWith('.mjs') && !SELF.includes(name))
  .filter(name => !filters.length || filters.some(filter => name.includes(filter)))
  .sort();

/* Which ports a suite talks to, read out of the suite itself — so adding a
   suite on a new port does not mean remembering to update a list here. */
const portsOf = source => [...new Set([...source.matchAll(/localhost:(\d{4})/g)].map(match => match[1]))];
/* 4194 is the signed-in build; everything else is the preview build. */
const BUILDS = { '4194': { outDir: 'dist-auth', env: { VITE_DEMO_MODE: 'false', VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testtesttesttesttest' } } };
const defaultBuild = { outDir: 'dist', env: { VITE_DEMO_MODE: 'true' } };

const run = (command, commandArgs, env = {}) => new Promise(resolve => {
  const child = spawn(command, commandArgs, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.stderr.on('data', chunk => { out += chunk; });
  child.on('close', code => resolve({ code, out }));
});

const wanted = [...new Set(suites.flatMap(name => portsOf(readFileSync(name, 'utf8'))))].sort();
const needBrowser = wanted.length > 0;
const servers = [];

if (needBrowser && !logicOnly) {
  /* Build once per outDir, not once per port. */
  for (const outDir of [...new Set(wanted.map(port => (BUILDS[port] || defaultBuild).outDir))]) {
    const build = Object.values(BUILDS).find(item => item.outDir === outDir) || defaultBuild;
    process.stdout.write(`building ${outDir}… `);
    const result = await run('npm', ['run', 'build', '--', '--outDir', outDir], build.env);
    if (result.code !== 0) { console.log('FAILED\n' + result.out.slice(-1200)); process.exit(1); }
    console.log('ok');
  }
  for (const port of wanted) {
    const build = BUILDS[port] || defaultBuild;
    const child = spawn('npx', ['vite', 'preview', '--outDir', build.outDir, '--port', port, '--host', '127.0.0.1'],
      { stdio: 'ignore', detached: true });
    servers.push(child);
  }
  await new Promise(resolve => setTimeout(resolve, 6000));
  for (const port of wanted) {
    const probe = await run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${port}/`]);
    if (probe.out.trim() !== '200') console.log(`  warning: port ${port} answered ${probe.out.trim() || 'nothing'}`);
  }
}

const stop = () => servers.forEach(child => { try { process.kill(-child.pid); } catch { /* already gone */ } });

const results = [];
for (const name of suites) {
  const source = readFileSync(name, 'utf8');
  const ports = portsOf(source);
  if (logicOnly && ports.length) { results.push({ name, state: 'skipped', detail: 'needs a browser' }); continue; }
  /* rlscheck reads the live policy list from its first argument. */
  const extra = name === 'rlscheck.mjs' && existsSync('.forge-policies.json') ? [readFileSync('.forge-policies.json', 'utf8')] : [];
  if (name === 'rlscheck.mjs' && !extra.length) { results.push({ name, state: 'skipped', detail: 'needs the live policy list in .forge-policies.json' }); continue; }
  const started = Date.now();
  const result = await run('npx', ['vite-node', name, ...extra]);
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  /* A SUITE THAT THREW IS NOT A SUITE THAT PASSED. A thrown page.goto or a
     missing selector exits non-zero with no check lines at all, and reading
     only the last line called that "no failures". */
  const checks = (source.match(/check\(/g) || []).length;
  const reported = (result.out.match(/^\s*(PASS|FAIL)/gm) || []).length;
  const failed = (result.out.match(/^\s*FAIL/gm) || []).length;
  const state = result.code === 0 && !failed ? 'passed'
    : checks > 0 && reported === 0 ? 'errored'
    : failed ? 'failed' : 'errored';
  results.push({ name, state, detail: state === 'passed' ? `${reported} checks · ${seconds}s`
    : state === 'failed' ? `${failed} of ${reported} failing`
    : (result.out.trim().split('\n').find(line => /Error|error:/.test(line)) || `exit ${result.code}`).slice(0, 90), out: result.out });
}

stop();

const width = Math.max(...results.map(item => item.name.length));
const order = { failed: 0, errored: 1, skipped: 2, passed: 3 };
console.log('');
for (const item of [...results].sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name))) {
  const badge = { passed: 'PASS ', failed: 'FAIL ', errored: 'ERROR', skipped: 'skip ' }[item.state];
  console.log(`  ${badge}  ${item.name.padEnd(width)}  ${item.detail}`);
}
const count = state => results.filter(item => item.state === state).length;
console.log(`\n  ${count('passed')} passed · ${count('failed')} failed · ${count('errored')} errored · ${count('skipped')} skipped`);
for (const item of results.filter(entry => entry.state === 'failed')) {
  console.log(`\n--- ${item.name} ---`);
  (item.out.match(/^\s*FAIL.*$/gm) || []).forEach(line => console.log(line));
}
process.exit(count('failed') + count('errored') ? 1 : 0);
