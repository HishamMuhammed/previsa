// PDF line reconstruction and import-result handling.
// Run: node test/pdf.test.mjs   (no browser needed — pdf.js is only touched by
// importPdf(), which is exercised with a stub here and with the real library in
// the browser.)

import { readFileSync } from 'node:fs';
import { buildLines, hasTextLayer, importPdf, NO_TEXT_MESSAGE } from '../src/lib/pdf.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };
const item = (str, x, y, hasEOL = false) => ({ str, x, y, transform: [1, 0, 0, 1, x, y], width: str.length * 6, hasEOL });

console.log('\nbuildLines — reading order:');
{
  // Simple descending-y stack (pdf.js emits top-down for normal documents)
  const lines = buildLines([
    item('HOTEL BOOKING', 50, 800, true),
    item('Guest name:', 50, 770, true),
    item('Jose Menon', 120, 770, true),
    item('Check-in:', 50, 750, true),
  ]);
  ok(lines[0] === 'HOTEL BOOKING', 'first line preserved');
  ok(lines[1] === 'Guest name: Jose Menon', 'label and value join into one line');
}

console.log('\nbuildLines — out-of-order fragments:');
{
  // pdf.js frequently emits value-before-label or interleaved columns. x must
  // win over emission order, otherwise the extracted field is nonsense.
  const lines = buildLines([
    item('Menon', 200, 700),
    item('Jose', 150, 700),
    item('Guest name:', 50, 700),
  ]);
  ok(lines[0] === 'Guest name: Jose Menon', 'items are re-ordered left-to-right by x');
}

console.log('\nbuildLines — column interleaving:');
{
  // Two logical columns at the same y: a naive flat join interleaves them.
  const lines = buildLines([
    item('Passport No', 50, 600),
    item('Expiry', 300, 600),
    item('Z4720913', 130, 600),
    item('2027-08-30', 360, 600),
  ]);
  ok(lines.length === 1, 'same-baseline items stay on one line');
  ok(lines[0].indexOf('Passport No') < lines[0].indexOf('Expiry'), 'left column precedes right column');
  ok(lines[0].indexOf('Z4720913') < lines[0].indexOf('2027-08-30'), 'each value follows its own label');
}

console.log('\nbuildLines — line breaks and tolerance:');
{
  const lines = buildLines([
    item('a', 50, 700),
    item('b', 50, 697.8),   // within tolerance: same line
    item('c', 50, 690),     // outside tolerance: new line
  ]);
  ok(lines.length === 2, 'sub-point y drift stays on one line');
  ok(lines[0] === 'a b', 'joined fragments are space-separated');
}

console.log('\nbuildLines — hasEOL is not authoritative:');
{
  // Real pdf.js output sets hasEOL=true on nearly every item, including ones in
  // the middle of a visual line. Splitting on it tears label from value.
  const lines = buildLines([
    item('Guest name:', 50, 700, true),
    item('Jose Menon', 120, 700, true),
  ]);
  ok(lines.length === 1, 'hasEOL alone does not split a shared baseline');
  ok(lines[0] === 'Guest name: Jose Menon', 'label and value survive hasEOL=true');

  // But a genuine baseline change still breaks the line regardless of hasEOL.
  const two = buildLines([
    item('line one', 50, 700, false),
    item('line two', 50, 680, false),
  ]);
  ok(two.length === 2, 'a y change still breaks the line with hasEOL=false');
}

console.log('\nbuildLines — junk in:');
{
  ok(buildLines([]).length === 0, 'empty input yields no lines');
  ok(buildLines([null, undefined, {}, item('ok', 10, 10)]).length === 1, 'malformed items are skipped, not fatal');
  ok(buildLines([item('   ', 10, 10)]).length === 0, 'whitespace-only lines are dropped');
}

console.log('\nhasTextLayer:');
{
  ok(hasTextLayer([['Guest: Jose']]) === true, 'a page with real text has a text layer');
  ok(hasTextLayer([[], ['']]) === false, 'pages with no text have no text layer');
  ok(hasTextLayer([[''], ['x']]) === true, 'one text page is enough');
  ok(hasTextLayer([['9']]) === true, 'a single character still counts as a text layer');
  ok(hasTextLayer([['   ']]) === false, 'whitespace is not a text layer');
}

console.log('\nimportPdf — expected outcomes are data, not exceptions:');
{
  // Stubs mirror how pdf.js actually fails: getDocument() returns a loading task
  // object and the error arrives on its `.promise`, usually wrapped by the task
  // with the real cause nested. An `async` stub that throws is NOT what pdf.js
  // does, and it escapes the catch entirely because the throw happens while
  // evaluating the argument, before `.promise` is ever read.
  const mkTask = (err) => ({ promise: Promise.reject(err) });
  const pwErr = () => { const e = new Error('No password given'); e.name = 'PasswordException'; e.code = 1; return e; };

  const r1 = await importPdf(new ArrayBuffer(4), { getDocument: () => mkTask(pwErr()) });
  ok(r1.ok === false && r1.reason === 'encrypted', 'encrypted PDF is reported as encrypted');
  ok(/password/i.test(r1.message), 'encrypted message mentions the password');

  const cause = pwErr();
  const wrapped = new Error('Loading aborted'); wrapped.name = 'LoadingTaskError'; wrapped.cause = cause;
  const r1b = await importPdf(new ArrayBuffer(4), { getDocument: () => mkTask(wrapped) });
  ok(r1b.ok === false && r1b.reason === 'encrypted', 'wrapped PasswordException is still detected');

  const badErr = new Error('bad'); badErr.name = 'InvalidPDFException';
  const r2 = await importPdf(new ArrayBuffer(4), { getDocument: () => mkTask(badErr) });
  ok(r2.ok === false && r2.reason === 'invalid', 'invalid PDF is reported as invalid');

  // A scanned PDF parses fine but yields nothing — the distinction the user needs.
  const scanned = readFileSync(new URL('./fixtures/scanned.pdf', import.meta.url));
  const r3 = await importPdf(scanned, {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
      }),
    }),
  });
  ok(r3.ok === true && r3.textLayer === false, 'a scanned PDF parses but reports no text layer');
  ok(r3.chars === 0, 'a scanned PDF yields zero characters');

  ok(/no text layer/i.test(NO_TEXT_MESSAGE), 'the no-text message explains itself');
  ok(/scan|photo/i.test(NO_TEXT_MESSAGE), 'the no-text message names the likely cause');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);