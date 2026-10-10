// R00 — document completeness.
//
// Run: node test/completeness.test.mjs
//
// This suite exists because of a measured failure of the whole engine. Given an
// application containing only a passport, every rule that needed another document
// answered 'na' and the report said "3 pass, 12 not checked" — without ever
// stating that the bank statement, insurance or itinerary were absent. The
// applicant had to infer the problem from the shape of the silence.
//
// A consulate rejects that file on sight. The tool must say so out loud.

import { readFileSync } from 'node:fs';
import { runRules } from '../src/lib/rules.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const base = JSON.parse(readFileSync(new URL('../src/lib/sample.json', import.meta.url), 'utf8'));
const find = (app, id) => runRules(app).findings.find((f) => f.id === id);
const schengen = (over = {}) => {
  const a = structuredClone(base);
  a.meta.destination = 'France (Schengen short-stay)';
  if (a.trip) delete a.trip.destinationCountry;
  return { ...a, ...over };
};

console.log('\nR00 fires when a document is absent');

// Strip the application form, which is required for every destination.
{
  const a = schengen();
  delete a.docs.application;
  const r = find(a, 'R00');
  ok(r?.status === 'fail', 'absent required document is a fail');
  ok(/application form/i.test(r.title), `names the document: "${r.title}"`);
  ok(r.fix && r.fix.length > 10, 'gives an actionable fix');
}

console.log('\nR00 names EVERY absent document, not just the first');

{
  const a = schengen();
  delete a.docs.application;
  delete a.docs.bankStatement;
  delete a.docs.insurance;
  const r = find(a, 'R00');
  ok(/bank statement/i.test(r.title), 'bank statement named');
  ok(/insurance/i.test(r.title), 'insurance named');
  ok(/application/i.test(r.title), 'application named');
}

console.log('\nA blank document is treated as missing');

// The realistic case: a scanned PDF imports and yields nothing, so every field is
// empty. From the outside that looks identical to a half-finished form.
{
  const a = schengen();
  a.docs.insurance = { label: 'Travel insurance', fields: { insurer: '', policyNo: '', coverFrom: '' } };
  const r = find(a, 'R00');
  ok(r?.status === 'fail', 'all-blank document fails');
  ok(/insurance/i.test(r.title), 'the blank document is named');
}

console.log('\nOne blank field does not condemn a document');

{
  const a = schengen();
  const fields = { ...a.docs.insurance.fields };
  fields.insurer = '';
  a.docs.insurance = { label: 'Travel insurance', fields };
  const r = find(a, 'R00');
  ok(!/insurance/i.test(r.title ?? ''), 'a document with other real fields is not called blank');
}

console.log('\nDestination-specific requirements');

{
  // Insurance is required for Schengen. UK must not demand it, so removing it
  // from an otherwise-complete UK file must still PASS. (An earlier version of
  // this test asserted a UK failure here, which was wrong: the sample already has
  // every document the UK list asks for, so deleting insurance correctly changes
  // nothing. The assertion tested the sample, not the rule.)
  const uk = structuredClone(base);
  uk.meta.destination = 'United Kingdom';
  delete uk.trip.destinationCountry;
  delete uk.docs.insurance;
  const r = find(uk, 'R00');
  ok(r?.status === 'pass', 'UK passes without Schengen-only insurance');
  ok(!/insurance/i.test(r.title), 'UK does NOT demand Schengen insurance');

  // And the same file as a Schengen application must now fail.
  const asSchengen = structuredClone(uk);
  asSchengen.meta.destination = 'France (Schengen short-stay)';
  const s = find(asSchengen, 'R00');
  ok(s?.status === 'fail', 'the identical file fails as a Schengen application');
  ok(/insurance/i.test(s.title), 'because Schengen requires insurance');
}

{
  // A US application needs an itinerary; Schengen conditional list differs.
  const us = structuredClone(base);
  us.meta.destination = 'United States';
  delete us.trip.destinationCountry;
  delete us.docs.itinerary;
  const r = find(us, 'R00');
  ok(r?.status === 'fail', 'US fails when the itinerary is absent');
  ok(/itinerary/i.test(r.title), 'US demands an itinerary');
}

{
  // trip.destinationCountry takes priority over the free-text meta string.
  const a = schengen();
  a.trip = { ...(a.trip ?? {}), destinationCountry: 'uk' };
  delete a.docs.insurance;
  const r = find(a, 'R00');
  ok(!/insurance/i.test(r.title ?? ''), 'explicit destinationCountry overrides meta text');
}

console.log('\nR00 passes on a complete application');

{
  const r = find(schengen(), 'R00');
  ok(r?.status === 'pass', 'the seeded Schengen sample is complete');
  ok(/present/i.test(r.title), `pass title reads sensibly: "${r.title}"`);
}

console.log('\nR00 is reported FIRST');

// The applicant should be told what is missing before being told two documents
// disagree about a name.
{
  const a = schengen();
  delete a.docs.application;
  const ids = runRules(a).findings.map((f) => f.id);
  ok(ids[0] === 'R00', `R00 is the first finding (got ${ids[0]})`);
}

console.log('\nR00 does not disturb the existing rules');

{
  const before = runRules(schengen()).findings.map((f) => `${f.id}:${f.status}`);
  const withR00 = before;
  // The seeded sample is complete, so every other finding must be unchanged.
  const ids = new Set(withR00.map((s) => s.split(':')[0]));
  ok(ids.has('R01') && ids.has('R02') && ids.has('R05c'), 'R01, R02 and R05c still run');
  ok(!before.some((s) => s.startsWith('R01:na')), 'R01 is not knocked into na by R00');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
