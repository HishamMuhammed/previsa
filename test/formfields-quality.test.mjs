// Quality gate for positional form extraction.
//
// Run: node test/formfields-quality.test.mjs
//
// Positional extraction recovers fields the plain-text reader cannot see, but a
// value contaminated with a neighbouring label is worse than no value at all: it
// would be cross-checked against a passport or a booking and produce a confident,
// wrong finding. So every extracted value must survive looksLikeValue() before it
// is offered. The gate lives in src/formfields.js — this file tests it, and does
// not define a second copy.

import { readFileSync } from 'node:fs';
import { extractFormFields, looksLikeValue } from '../src/lib/formfields.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const geo = JSON.parse(readFileSync(new URL('../test/fixtures/geometry-filled-nl.json', import.meta.url), 'utf8'));
const p1 = extractFormFields(geo.items).fields;
const p2 = extractFormFields(geo.page2_items || []).fields;
const all = [...p1, ...p2];
const v = (n) => (all.find((f) => f.number === n) || {}).value || '';

console.log('\nthe clean fields survive the gate:');
{
  ok(looksLikeValue(v(1)), `field 1 surname = ${JSON.stringify(v(1))}`);
  ok(looksLikeValue(v(4)), `field 4 date of birth = ${JSON.stringify(v(4))}`);
  ok(looksLikeValue(v(5)), `field 5 place of birth = ${JSON.stringify(v(5))}`);
  ok(v(16) === 'RUSSIA' && looksLikeValue(v(16)), `field 16 issued by = ${JSON.stringify(v(16))}`);
}

console.log('\nthe contaminated ones are rejected:');
{
  // Field 6 absorbed field 7's wrapped label ('Nationality at birth, if').
  ok(!looksLikeValue(v(6)), `field 6 rejected (${JSON.stringify(v(6).slice(0, 44))})`);
  // Field 13 picked up the tail of field 12's wrapped label ('Type of travel
  // document:'), so it is label text, not a passport number.
  ok(!looksLikeValue(v(13)), `field 13 rejected (${JSON.stringify(v(13))})`);
}

console.log('\nand obvious non-values never pass:');
{
  ok(!looksLikeValue(''), 'empty string');
  ok(!looksLikeValue('....................'), 'a dotted fill-in rule');
  ok(!looksLikeValue('Other (please specify):'), 'an unselected option row');
  ok(!looksLikeValue('[-] Single entry [-] Two entries'), 'a wholly unticked checkbox row');
  ok(!looksLikeValue('Purpose(s) of the journey:'), 'label vocabulary');
  ok(!looksLikeValue('Name of host: Hotel address:'), 'two labels merged (two colons)');
}

console.log('\nreal answers that must NOT be caught by the gate:');
{
  ok(looksLikeValue('SMIRNOVA'), 'an all-caps surname');
  ok(looksLikeValue('05-06-1987'), 'a date');
  ok(looksLikeValue('MOSCOW'), 'a place name');
  ok(looksLikeValue('[-] Male [x] Female'), 'a checkbox row with one ticked');
  ok(looksLikeValue('Russian (Former USSR)'), 'a value with parentheses');
  ok(looksLikeValue('DoubleTree by Hilton Amsterdam'), 'a hotel name');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);