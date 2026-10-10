// Destination routing: the right rule set for the right country.
//
// Run: node test/destination.test.mjs
//
// Every rule read `app.trip.destinationCountry || 'schengen'`, but the seed stores
// the destination as free text on meta.destination ('France (Schengen short-stay)')
// and has no trip.destinationCountry at all. So the guard ALWAYS fell through to
// Schengen: a UK application was checked for Schengen passport validity, UK bank
// statement age rules never applied, and R05c — the 90/180 rolling allowance, which
// only exists inside Schengen — either fired on a non-Schengen trip or was decided
// by a default rather than by the data.
//
// Found by fuzzing: R05c reported 'na' on all 1500 generated applications.

import { readFileSync } from 'node:fs';
import { runRules } from '../src/lib/rules.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const base = JSON.parse(readFileSync(new URL('../src/lib/sample.json', import.meta.url), 'utf8'));
const withDest = (dest) => {
  const a = structuredClone(base);
  a.meta.destination = dest;
  // Deliberately do NOT set trip.destinationCountry: the free-text path is the one
  // the seeded application actually takes.
  if (a.trip) delete a.trip.destinationCountry;
  return a;
};
const find = (app, id) => runRules(app).findings.find((f) => f.id === id);

console.log('\nR05c, the Schengen 90/180 allowance, runs for Schengen:');
{
  const f = find(withDest('France (Schengen short-stay)'), 'R05c');
  ok(f.status !== 'na', `Schengen: R05c decides (${f.status}) — ${(f.detail || '').slice(0, 50)}`);
  ok(/90/.test(f.detail || ''), 'the 90-day allowance appears in the detail');
}

console.log('\nand does NOT apply outside Schengen:');
{
  for (const [dest, why] of [
    ['United Kingdom (UK visitor)', 'UK'],
    ['United States (B1/B2)', 'US'],
    ['Canada (visitor)', 'Canada'],
    ['Australia (subclass 600)', 'Australia'],
  ]) {
    const f = find(withDest(dest), 'R05c');
    ok(f.status === 'na', `${why}: R05c is not applicable`);
    ok(/does not apply/i.test(f.detail || ''), `${why}: says why, rather than looking like a bug`);
  }
}

console.log('\neach destination gets its own passport-validity rule:');
{
  const rules = {
    'France (Schengen short-stay)': /three months|Schengen/,
    'United Kingdom (UK visitor)': /UK/i,
    'United States (B1/B2)': /six-month|United States/,
    'Canada (visitor)': /valid on the day you land|Canada/,
    'Australia (subclass 600)': /stay valid for the stay|Australia|must stay valid/i,
  };
  for (const [dest, pattern] of Object.entries(rules)) {
    const f = find(withDest(dest), 'R01');
    ok(pattern.test(f.detail || ''),
      `${dest.split(' ')[0]}: ${(f.detail || '').slice(0, 62)}`);
  }
}

console.log('\nan explicit trip.destinationCountry still wins:');
{
  const a = structuredClone(base);
  a.meta.destination = 'France (Schengen short-stay)';
  a.trip.destinationCountry = 'uk';
  ok(find(a, 'R05c').status === 'na', 'explicit uk overrides the free-text Schengen');
  const b = structuredClone(base);
  b.meta.destination = 'United Kingdom (UK visitor)';
  b.trip.destinationCountry = 'schengen';
  ok(find(b, 'R05c').status !== 'na', 'explicit schengen overrides free-text UK');
}

console.log('\nunknown destinations fall back safely rather than throwing:');
{
  for (const dest of ['', 'Atlantis', null, undefined, 'Schengen', 'schengen']) {
    let f;
    try { f = find(withDest(dest ?? ''), 'R05c'); }
    catch (e) { ok(false, `"${dest}" threw: ${e.message}`); continue; }
    ok(Boolean(f), `"${dest}" produced an R05c finding (${f?.status})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);