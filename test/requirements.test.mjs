// The destination checklist shares its requirement data with the R00 rule.
//
// Run: node test/requirements.test.mjs
//
// The point of these assertions is drift. R00 decides pass/fail from
// requirementsFor(); the checklist panel tells the applicant what to go and get
// from the same function. When the lists lived separately they could disagree in
// two silent ways:
//
//   - a document on the checklist but not in R00 shows as satisfied while the rule
//     is failing it, or
//   - a document in R00 but not on the checklist fails with no advance warning.
//
// Both look like the tool is wrong, and neither is visible without a test that
// compares the two sides.

import { readFileSync } from 'node:fs';
import { runRules } from '../src/lib/rules.js';
import { requirementsFor, destinationName, ALWAYS_REQUIRED, CONDITIONAL_DOCS } from '../src/lib/requirements.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const base = JSON.parse(readFileSync(new URL('../src/lib/sample.json', import.meta.url), 'utf8'));
const withDest = (dest) => {
  const a = structuredClone(base);
  a.trip = { ...(a.trip ?? {}), destinationCountry: dest };
  a.meta.destination = '';
  return a;
};

console.log('\nRequirements are destination-specific');

{
  const s = requirementsFor('schengen').map((r) => r.key);
  const u = requirementsFor('uk').map((r) => r.key);
  const us = requirementsFor('us').map((r) => r.key);
  ok(s.includes('insurance'), 'Schengen requires insurance');
  ok(!u.includes('insurance'), 'UK does not require insurance');
  ok(!us.includes('insurance'), 'US does not require insurance');
  ok(s.includes('hostLetter') === false, 'Schengen list does not include the host letter');
  ok(new Set(s).size === s.length, 'no duplicate keys in the Schengen list');
}

console.log('\nAlways-required documents are on every list');

{
  for (const dest of ['schengen', 'uk', 'us', 'canada', 'australia', 'something-unknown']) {
    const keys = requirementsFor(dest).map((r) => r.key);
    for (const [k] of ALWAYS_REQUIRED) {
      ok(keys.includes(k), `${dest}: always-required ${k} is present`);
    }
  }
}

console.log('\nR00 and the checklist cannot disagree');

// The core assertion. For each destination and each document on that list, the
// document's presence in the file must produce the same verdict either way: if
// R00 fails naming it, the checklist must count it missing.
{
  for (const dest of ['schengen', 'uk', 'us']) {
    const app = withDest(dest);
    // Strip every document the destination asks for, one at a time.
    for (const { key, label } of requirementsFor(dest)) {
      const stripped = structuredClone(app);
      delete stripped.docs[key];
      const r00 = runRules(stripped).findings.find((f) => f.id === 'R00');
      const missing = requirementsFor(dest).filter((r) => {
        const d = stripped.docs[r.key];
        const has = d && Object.values(d.fields ?? {}).some((v) => v != null && String(v).trim() !== '');
        return !has;
      });
      ok(r00.status === 'fail', `${dest}: removing ${key} fails R00`);
      ok(missing.some((m) => m.key === key), `${dest}: checklist counts ${key} missing`);
      ok(r00.title.includes(label), `${dest}: R00 names it as "${label}"`);
    }
  }
}

console.log('\nAn unknown destination does not silently become Schengen');

{
  const keys = requirementsFor('mordor').map((r) => r.key);
  const schengen = requirementsFor('schengen').map((r) => r.key);
  ok(keys.length === ALWAYS_REQUIRED.length, 'unknown destination gets only the always-required list');
  ok(!keys.includes('insurance'), 'unknown destination does NOT inherit Schengen insurance');
  ok(keys.length !== schengen.length, 'the unknown list is not a copy of the Schengen one');
  ok(/Mordor/.test(destinationName('mordor')), `name falls back to the key: "${destinationName('mordor')}"`);
}

console.log('\nDestination names are readable');

{
  ok(destinationName('schengen') === 'Schengen short-stay', `schengen -> "${destinationName('schengen')}"`);
  ok(destinationName('uk') === 'United Kingdom visitor', `uk -> "${destinationName('uk')}"`);
  ok(destinationName('us') === 'United States visitor', `us -> "${destinationName('us')}"`);
}

console.log('\nEvery conditional destination in the engine has a requirements entry');

{
  // destinationKey() in rules.js recognises these five. If a new one is added
  // there without a requirements entry, it silently gets the always-required list
  // only — which is a quiet under-check rather than a crash.
  const src = readFileSync(new URL('../src/lib/rules.js', import.meta.url), 'utf8');
  const recognised = [...src.matchAll(/return '([a-z]+)';/g)].map((m) => m[1]);
  const covered = CONDITIONAL_DOCS.map(([k]) => k);
  for (const k of new Set(recognised)) {
    ok(covered.includes(k) || k === 'schengen', `destination '${k}' has a requirements entry`);
  }
}

console.log('\nA complete file passes R00 and counts as fully present');

{
  for (const dest of ['schengen', 'uk', 'us']) {
    const app = withDest(dest);
    const r00 = runRules(app).findings.find((f) => f.id === 'R00');
    const missing = requirementsFor(dest).filter((r) => {
      const d = app.docs[r.key];
      const has = d && Object.values(d.fields ?? {}).some((v) => v != null && String(v).trim() !== '');
      return !has;
    });
    ok(r00.status === 'pass', `${dest}: the seeded file is complete for R00`);
    ok(missing.length === 0, `${dest}: checklist finds nothing missing`);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
