// Extraction against REAL visa forms — the honesty guard.
//
// Run: node test/real-docs.test.mjs
//
// These lines are the ACTUAL text of real visa PDFs (EU harmonised, German,
// Danish VFS, and a filled US DS-160 exemplar). They are here to stop the unit
// tests' clean synthetic "Label: value" fixtures from implying a capability that
// does not exist in the wild.
//
// The finding, stated plainly: this extractor works on booking confirmations and
// bank statements, and does NOT work on official application forms. Those are
// laid out as a grid with boxed cells, not as "label: value" text, so the labels
// and the filled-in values land on different baselines and never pair up.
//
// That is a real limitation, and the honest response is to state it in the UI
// rather than paper over it with a lower-confidence guess that fills the wrong
// cell.

import { readFileSync } from 'node:fs';
import { labelledPairs, suggestFields, bestPerField, guessDocumentType } from '../src/lib/extract.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

// Verbatim lines from the real documents.
const EU_FORM = [
  'Harmonised application form',
  'A pplication for Schengen Visa',
  '1. Surname (Family name): For official use',
  'only D ate of',
  'application:',
  '2. Surname at birth (Former family name(s)):',
  '3. First name(s) (Given name(s)):',
  'Fields 1 – 3 shall be filled in in accordance with the data in the travel document.',
];
const DK_FORM = [
  '1 Surname (Family name) (x) Write your last name as mentioned on your passport',
  '2 Surname at birth (Former family name(s)) (x) N/A',
  '4 Date of birth (day-month-year) 5 Place of birth 7 Current nationality',
  'Write your date of birth in day-month-year order. Example: 25-01-1900',
  '6 Country of birth Write Your passport Nationality',
];
const DE_FORM = [
  '1.',
  '2.',
  '3.',
  'Geburtsdatum (Tag/Monat/Jahr) / Date',
  'Geschlecht / Sex',
  '□ männlich / Male □ weiblich / Female',
];
const DS160 = [
  'The U.S. Department of State',
  'Bureau of Consular Affairs',
  'Online Nonimmigrant Visa Applicat i on',
  'DS-160',
  'EXEMPLAR',
];

console.log('\nreal application forms yield no field suggestions:');
{
  for (const [name, pages] of [['EU harmonised', [EU_FORM]], ['Danish VFS', [DK_FORM]],
    ['German Schengen', [DE_FORM]], ['DS-160 exemplar', [DS160]]]) {
    const s = suggestFields([pages], 'accommodation').suggestions;
    ok(s.length === 0, `${name}: no accommodation fields extracted (got ${s.length})`);
  }
}

console.log('\nand the document-type guess refuses rather than guessing:');
{
  for (const [name, pages] of [['EU harmonised', [EU_FORM]], ['Danish VFS', [DK_FORM]],
    ['German Schengen', [DE_FORM]], ['DS-160 exemplar', [DS160]]]) {
    ok(guessDocumentType([pages]) === null, `${name}: refuses to guess a document type`);
  }
}

console.log('\nthe reason: labels and values do not share a line:');
{
  // The EU form pairs a label with the NEXT field's label, never with a value.
  const pairs = labelledPairs(EU_FORM);
  const bad = pairs.find((p) => p.label.includes('Surname'));
  ok(!bad || !/Jose|Menon/.test(bad.value), 'no applicant name leaks out of a mispaired label');
  // Grid layouts put the value in a different box, so lines are mostly furniture.
  ok(labelledPairs(DE_FORM).length <= 3, `a checkbox-grid form yields almost no pairs (got ${labelledPairs(DE_FORM).length})`);
}

console.log('\nthe capability that DOES work is preserved:');
{
  // A booking confirmation — the case the feature is actually scoped to. It needs
  // enough distinct terms to clear the decisive-margin bar; a 3-line snippet with
  // only "guest" and "check-in" correctly refuses to claim a type.
  const BOOKING = ['HOTEL BOOKING CONFIRMATION', 'Guest name: Jose Menon', 'Check-in date: 2027-02-16',
    'Check-out date: 2027-02-27', 'Address: 9 Rue des Petites Ecuries, 75010 Paris', 'Country: France'];
  const g = bestPerField(suggestFields([BOOKING], 'accommodation').suggestions).find((b) => b.field === 'guestName');
  ok(g?.value === 'Jose Menon', 'a booking confirmation still extracts the guest name');
  ok(guessDocumentType([BOOKING]) === 'accommodation', 'a full booking confirmation is still recognised');
  ok(guessDocumentType([['Guest name: Jose Menon', 'Check-in date: 2027-02-16']]) === null,
    'a thin snippet with weak signals still refuses rather than guessing');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
console.log('KNOWN LIMITATION: PDF import reads booking confirmations, itineraries and');
console.log('bank statements. It does not read official application forms (EU/DK/DE/DS-160),');
console.log('whose fields sit in boxed grid cells rather than "label: value" text.');
process.exit(fail ? 1 : 0);