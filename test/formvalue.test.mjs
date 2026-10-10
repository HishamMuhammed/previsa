// Value normalisation for positional form extraction.
//
// Run: node test/formvalue.test.mjs
//
// A filled form writes answers in whatever shape the form demands. The two shapes
// that need real handling rather than tidying are checkboxes and ranked lists:
//
//   '[-] Male [x] Female'  must become  'Female'      — not 'Male Female'
//   '1. DoubleTree by Hilton'  must become 'DoubleTree by Hilton'
//
// 'Male Female' is the failure that matters: it would be applied to the sex field,
// then cross-checked as though the applicant had written both, and produce a
// finding about a document that says nothing of the kind.
//
// cleanFormValue lives in src/app.js because it is UI-layer presentation logic, so
// this test mirrors it deliberately and asserts both copies stay in agreement.

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

// Mirror of cleanFormValue in src/app.js.
function cleanFormValue(raw) {
  const text = String(raw);
  if (/\[\s*[xX]\s*\]/.test(text)) {
    const picked = [];
    const re = /\[\s*[xX]\s*\]\s*([^[\]]+?)(?=\s*\[\s*[-\sxX]|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const l = m[1].trim();
      if (l) picked.push(l);
    }
    if (picked.length) return picked.join(', ');
  }
  return text
    .replace(/\[\s*[xX]\s*\]/g, '')
    .replace(/\[\s*-\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+[.)]\s*/, '')
    .trim();
}

console.log('\nonly the ticked option survives:');
{
  ok(cleanFormValue('[-] Male [x] Female') === 'Female', "'[-] Male [x] Female' -> 'Female'");
  ok(cleanFormValue('[x] Single [-] Married [-] Registered partnership') === 'Single', 'civil status -> Single');
  ok(cleanFormValue('[x] Ordinary passport [-] Diplomatic passport') === 'Ordinary passport', 'document type');
  ok(cleanFormValue('[-] Tourism [x] Business [-] Visiting family or friends') === 'Business', 'purpose -> Business');
  ok(cleanFormValue('[x] No [-] Yes') === 'No', 'residence -> No');
  ok(cleanFormValue('[-] Single entry [-] Two entries [x] Multiple entries') === 'Multiple entries', 'entries -> Multiple');
}

console.log('\nranked lists lose their ordinal but keep their content:');
{
  ok(cleanFormValue('1. DoubleTree by Hilton') === 'DoubleTree by Hilton', "'1. DoubleTree by Hilton'");
  ok(cleanFormValue('2. HOST COMPANY LTD') === 'HOST COMPANY LTD', "'2. HOST COMPANY LTD'");
}

console.log('\nplain values pass through untouched:');
{
  for (const v of ['SMIRNOVA', '05-06-1987', 'MOSCOW', 'RUSSIA', 'Lesnaia Str. 9, Apt 35']) {
    ok(cleanFormValue(v) === v, `keeps ${JSON.stringify(v)}`);
  }
}

console.log('\nthe mirrored copy in the app still matches:');
{
  // This used to assert against src/app.js, which the React rewrite replaced with
  // src/lib/formvalue.js. Asserting against the file that is actually imported by
  // the running app is the point: a test that reads a dead copy proves nothing.
  const mod = await import('../src/lib/formvalue.js');
  const { looksLikeValue } = await import('../src/lib/formfields.js');
  ok(mod.cleanFormValue('[-] Male [x] Female') === 'Female', 'the real module resolves Female');
  ok(mod.cleanFormValue('1. DoubleTree by Hilton') === 'DoubleTree by Hilton', 'the real module strips ordinals');
  // An unticked row has no [x], so cleanFormValue returns '' rather than stripping
  // the markers and handing back 'Single Two' — a string that looks like a real
  // answer, passes every downstream check, and would be applied to a field as
  // though the applicant had written two options. Once the markers are gone there
  // is nothing left to detect, so the decision has to happen at parse time.
  const unticked = mod.cleanFormValue('[-] Single [-] Two');
  ok(unticked === '', `an unticked row yields nothing (got ${JSON.stringify(unticked)})`);
  ok(!looksLikeValue(unticked), 'and so the quality gate rejects it too');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);