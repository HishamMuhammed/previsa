// Scenario snapshots: save, list, and diff.
//
// Run: node test/snapshots.test.mjs
//
// A snapshot is a saved copy of the current app — "as submitted", "corrected".
// The audit trail a visa agency actually needs is the diff between two of them:
// what did the applicant change between submissions, and did the score move in
// the right direction?

import { readFileSync } from 'node:fs';
import { runRules } from '../src/lib/rules.js';
import { diffApps } from '../src/lib/snapshots.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const base = JSON.parse(readFileSync(new URL('../src/lib/sample.json', import.meta.url), 'utf8'));

console.log('\nDiff detects a field change');

{
  const before = structuredClone(base);
  const after = structuredClone(base);
  after.docs.passport.fields.surname = 'CHANGED';
  const diff = diffApps(before, after);
  ok(diff.length === 1, `exactly one change reported (got ${diff.length})`);
  ok(diff[0].field === 'surname', 'names the field');
  ok(diff[0].from === before.docs.passport.fields.surname, 'records the old value');
  ok(diff[0].to === 'CHANGED', 'records the new value');
  ok(diff[0].action === 'changed', 'action is "changed"');
}

console.log('\nDiff detects an added and a removed document');

{
  const before = structuredClone(base);
  const after = structuredClone(base);
  delete after.docs.insurance;
  after.docs.travelPlan = { label: 'Travel plan', fields: { route: 'X' } };
  const diff = diffApps(before, after);
  const actions = diff.map((d) => d.action);
  ok(actions.includes('removed'), 'reports the removed document');
  ok(actions.includes('added'), 'reports the added document');
  const removed = diff.find((d) => d.action === 'removed');
  ok(removed.doc === 'insurance', `names the removed doc (${removed.doc})`);
}

console.log('\nDiff detects a date change inside a document');

{
  const before = structuredClone(base);
  const after = structuredClone(base);
  after.docs.accommodation.fields.checkIn = '2027-03-01';
  const diff = diffApps(before, after);
  ok(diff.some((d) => d.field === 'checkIn'), 'reports checkIn');
  ok(diff.some((d) => d.doc === 'accommodation'), 'names accommodation as the doc');
}

console.log('\nDiff reports nothing for identical apps');

{
  const a = structuredClone(base);
  const b = structuredClone(base);
  ok(diffApps(a, b).length === 0, 'no changes between identical apps');
}

console.log('\nScore moves in the right direction after a fix');

{
  const before = structuredClone(base);
  const fixed = structuredClone(base);
  fixed.docs.accommodation.fields.guestName = fixed.docs.passport.fields.fullName;
  const sBefore = runRules(before).score;
  const sAfter = runRules(fixed).score;
  ok(sAfter > sBefore, `score improved ${sBefore} -> ${sAfter}`);
}

console.log('\nDiff ignores irrelevant envelope fields');

{
  const before = structuredClone(base);
  const after = structuredClone(base);
  after.docs.passport.label = 'Passport bio page (updated)';
  after.docs.passport.source = 'scanned';
  const diff = diffApps(before, after);
  ok(diff.length === 0, 'label and source are envelope, not content');
}

console.log('\nDiff is deterministic');

{
  const a = structuredClone(base);
  const b = structuredClone(base);
  b.docs.bankStatement.fields.closingBalanceEUR = 99999;
  const d1 = diffApps(a, b);
  const d2 = diffApps(a, b);
  ok(JSON.stringify(d1) === JSON.stringify(d2), 'same input produces same output');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
