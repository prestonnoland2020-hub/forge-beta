/* EVERY TABLE THE APP WRITES NEEDS A POLICY FOR THE VERB IT USES.

   profiles had SELECT and UPDATE and no INSERT, while the client wrote with
   upsert — which PostgREST sends as INSERT ... ON CONFLICT. Postgres checks
   the INSERT policy whether or not the row conflicts, so onboarding's final
   write was refused for every new account for ten days, and the only symptom
   was a new athlete bouncing off the setup screen.

   This reads the client for the write verbs it actually uses against each
   table, and fails when a table is written with a verb RLS has no policy for.
   It needs the schema, so it takes the policy list as a JSON argument rather
   than reaching for the network:

     node rlscheck.mjs '<policies json>'
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const policies = JSON.parse(process.argv[2] || '[]');
const files = [];
const walk = dir => readdirSync(dir).forEach(entry => {
  const path = join(dir, entry);
  if (statSync(path).isDirectory()) walk(path);
  else if (/\.(ts|tsx)$/.test(path)) files.push(path);
});
walk('src');

/* supabase.from('x').insert / .upsert / .update / .delete */
const writes = new Map();
const record = (table, verb) => {
  if (!writes.has(table)) writes.set(table, new Set());
  writes.get(table).add(verb);
};
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\.from\('([a-z_]+)'\)\s*\n?\s*\.(insert|upsert|update|delete)\b/g)) {
    record(match[1], match[2]);
  }
}

/* upsert needs INSERT *and* UPDATE — it may take either path. */
const needed = verb => verb === 'upsert' ? ['INSERT', 'UPDATE'] : [verb.toUpperCase()];
let fails = 0;
console.log('Tables the client writes, and whether RLS allows the verb:\n');
for (const [table, verbs] of [...writes].sort()) {
  const allowed = new Set(policies.filter(p => p.tablename === table).map(p => p.cmd));
  const missing = [...verbs].flatMap(needed).filter(cmd => !allowed.has(cmd) && !allowed.has('ALL'));
  const unique = [...new Set(missing)];
  if (unique.length) fails += 1;
  console.log(`  ${unique.length ? 'FAIL' : 'PASS'}  ${table.padEnd(26)} writes: ${[...verbs].join(', ').padEnd(22)}${unique.length ? `no policy for ${unique.join(', ')}` : `policies: ${[...allowed].sort().join(', ') || 'none needed'}`}`);
}
console.log(fails ? `\n${fails} table(s) are written with a verb RLS will refuse` : '\nEvery write verb the client uses has a policy');
process.exit(fails ? 1 : 0);
