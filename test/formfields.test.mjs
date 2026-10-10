// Positional extraction, tested against REAL captured geometry.
//
// The items below are verbatim pdf.js output from a genuinely filled Schengen
// application (provisy.ru Netherlands business sample), captured via
// tools/geometry-probe.html into test/fixtures/geometry-filled-nl.json.
// No synthetic "Label: value" lines here — this is the layout that broke the
// plain-text extractor.
//
// Run: node test/formfields.test.mjs

import { readFileSync } from 'node:fs';
import { extractFormFields, SCHENGEN_FIELD_MAP } from '../src/lib/formfields.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const geoPath = new URL('../test/fixtures/geometry-filled-nl.json', import.meta.url);
let items = [];
try {
  items = JSON.parse(readFileSync(geoPath, 'utf8')).items;
} catch {
  console.log('  (capture missing — run tools/capture-geometry.html first)');
}

const { fields } = extractFormFields(items);
const byNum = new Map(fields.map((f) => [f.number, f]));
const val = (n) => (byNum.get(n) ? byNum.get(n).value : '');

console.log(`\nfilled form page 1: ${fields.length} numbered fields detected\n`);
for (const f of fields) {
  const tag = f.filled ? '' : '   (blank)';
  console.log(`  ${String(f.number).padStart(2)}. ${f.label.slice(0, 40).padEnd(40)} = ${f.value.slice(0, 34)}${tag}`);
}

console.log('\nthe values that were sitting in boxes are now recovered:');
{
  ok(val(1) === 'SMIRNOVA', `field 1 surname = SMIRNOVA (got ${JSON.stringify(val(1))})`);
  ok(val(2) === 'EPIFANOVA', `field 2 surname at birth = EPIFANOVA (got ${JSON.stringify(val(2))})`);
  ok(val(3) === 'ELENA', `field 3 first names = ELENA (got ${JSON.stringify(val(3))})`);
  ok(val(4) === '05-06-1987', `field 4 date of birth (wrapped label) = 05-06-1987 (got ${JSON.stringify(val(4))})`);
  ok(/MOSCOW/i.test(val(5)), `field 5 place of birth = MOSCOW (got ${JSON.stringify(val(5))})`);
  ok(/Russian Federation/i.test(val(6)), `field 6 country of birth (wrapped label) = Russian Federation (got ${JSON.stringify(val(6))})`);
}

console.log('\nmulti-column rows are read across, not truncated:');
{
  // Fields 4, 5 and 7 share the baseline y=471 across three columns.
  ok(Boolean(val(4)) && Boolean(val(5)), 'two labels on the same row both yield values');
  ok(/Female/i.test(val(8)), `field 8 sex reads the ticked box = Female (got ${JSON.stringify(val(8))})`);
  ok(/Ordinary passport/i.test(val(12)), `field 12 document type = Ordinary passport (got ${JSON.stringify(val(12))})`);
}

console.log('\nblank fields stay blank — it does not invent values:');
{
  const blanks = fields.filter((f) => !f.filled).map((f) => f.number);
  ok(blanks.length > 0, `some fields are reported blank (${blanks.length} of ${fields.length})`);
  ok(!fields.some((f) => /Jose|Menon|Smurnova/.test(f.value)), 'no value is invented for empty boxes');
}

console.log('\nfields map onto Previsa names:');
{
  ok(SCHENGEN_FIELD_MAP[13] === 'passportNumber', 'field 13 maps to passportNumber');
  ok(SCHENGEN_FIELD_MAP[31] === 'arrivalDate', 'field 31 maps to arrivalDate');
  ok(SCHENGEN_FIELD_MAP[32] === 'departureDate', 'field 32 maps to departureDate');
}

console.log('\nand it still refuses rather than guessing:');
{
  ok(extractFormFields([]).fields.length === 0, 'an empty page yields no fields');
  const prose = [
    { s: 'Application for Schengen Visa', x: 233, y: 775 },
    { s: 'This application form is free of charge', x: 238, y: 751 },
  ];
  ok(extractFormFields(prose).fields.length === 0, 'a prose page with no field numbers yields no fields');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);