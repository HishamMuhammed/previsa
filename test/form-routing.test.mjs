// Positional suggestions must never be offered against the wrong document.
//
// Run: node test/form-routing.test.mjs
//
// The Schengen application form is personal data: surname, date of birth, passport
// dates. An early version offered those against whatever document type the file
// happened to look like, and clicking Apply wrote `surname: 'SMIRNOVA'` into the
// HOTEL BOOKING — corrupting a reservation and then cross-checking it as though the
// applicant had misspelled their own name.
//
// The rule: a numbered form's values are only offered against the two documents
// that legitimately hold this data. Anything else gets none.
//
// This imports the real module (src/formscope.js), so it cannot drift from what the
// app actually does.

import { readFileSync } from 'node:fs';
import { FORM_FIELD_OWNERS, FIELD_ALIASES, scopeToDocument } from '../src/lib/formscope.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const sample = JSON.parse(readFileSync(new URL('../src/lib/sample.json', import.meta.url), 'utf8'));
const fieldsOf = (doc) => new Set(Object.keys(sample.docs[doc].fields || {}));

console.log('\nonly the application form and passport accept a form:');
{
  ok(FORM_FIELD_OWNERS.application instanceof Set, 'application owns form fields');
  ok(FORM_FIELD_OWNERS.passport instanceof Set, 'passport owns form fields');
  for (const doc of ['accommodation', 'itinerary', 'bankStatement', 'insurance',
    'employment', 'hostLetter', 'anythingElse']) {
    ok(!FORM_FIELD_OWNERS[doc], `${doc} is not an owner`);
  }
}

console.log('\nscopeToDocument refuses everything for the wrong document type:');
{
  const suggestions = [
    { field: 'surname', value: 'SMIRNOVA' },
    { field: 'firstNames', value: 'ELENA' },
    { field: 'passportExpiry', value: '06-09-2028' },
  ];
  for (const doc of ['accommodation', 'itinerary', 'bankStatement', 'unknown']) {
    ok(scopeToDocument(suggestions, doc).length === 0,
      `${doc} gets nothing (the bug that wrote a surname into a hotel booking)`);
  }
}

console.log('\nthe right document gets the right fields, correctly named:');
{
  const suggestions = [
    { field: 'surname', value: 'SMIRNOVA' },
    { field: 'firstNames', value: 'ELENA' },
    { field: 'dateOfBirth', value: '05-06-1987' },
    { field: 'placeOfBirth', value: 'MOSCOW' },
    { field: 'issuedBy', value: 'RUSSIA' },
    { field: 'passportExpiry', value: '06-09-2028' },
    { field: 'passportNumber', value: '123456' },
    { field: 'employerName', value: 'No' },
    { field: 'hostAddress', value: 'Amsterdam' },
  ];
  const app = scopeToDocument(suggestions, 'application');
  const byField = Object.fromEntries(app.map((s) => [s.field, s.value]));

  ok(byField.surname === 'SMIRNOVA', 'application: surname kept as "surname"');
  ok(byField.givenNames === 'ELENA', 'application: firstNames renamed to "givenNames"');
  ok(byField.dob === '05-06-1987', 'application: dateOfBirth renamed to "dob"');
  ok(byField.birthPlace === 'MOSCOW', 'application: placeOfBirth renamed to "birthPlace"');
  ok(byField.issuingAuthority === 'RUSSIA', 'application: issuedBy renamed to "issuingAuthority"');
  ok(byField.expiryDate === '06-09-2028', 'application: passportExpiry renamed to "expiryDate"');
  ok(byField.passportNo === '123456', 'application: passportNumber renamed to "passportNo"');
  ok(app.some((s) => s.value === 'No'), 'application: employerName kept');
  ok(app.some((s) => s.value === 'Amsterdam'), 'application: hostAddress kept');

  const pass2 = scopeToDocument(suggestions, 'passport');
  const names = pass2.map((s) => s.field);
  ok(!names.includes('employerName'), 'passport drops employerName');
  ok(!names.includes('hostAddress'), 'passport drops hostAddress');
  ok(names.includes('givenNames'), 'passport keeps the renamed givenNames');
}

console.log('\nevery field name produced actually exists on its document:');
{
  const suggestions = [
    { field: 'surname' }, { field: 'surnameAtBirth' }, { field: 'firstNames' },
    { field: 'dateOfBirth' }, { field: 'placeOfBirth' }, { field: 'countryOfBirth' },
    { field: 'nationality' }, { field: 'sex' }, { field: 'civilStatus' },
    { field: 'documentType' }, { field: 'passportNumber' }, { field: 'issueDate' },
    { field: 'passportExpiry' }, { field: 'issuedBy' }, { field: 'nationalId' },
    { field: 'homeAddress' }, { field: 'occupation' }, { field: 'employerName' },
    { field: 'employerAddress' }, { field: 'purposeOfJourney' },
    { field: 'mainDestination' }, { field: 'firstEntry' }, { field: 'entriesRequested' },
    { field: 'durationDays' }, { field: 'arrivalDate' }, { field: 'departureDate' },
    { field: 'hostName' }, { field: 'hostAddress' }, { field: 'costCoveredBy' },
    { field: 'priorVisas' },
  ];
  for (const doc of ['application', 'passport']) {
    const available = [...fieldsOf(doc)];
    const produced = scopeToDocument(suggestions, doc, available).map((s) => s.field);
    const missing = produced.filter((f) => !fieldsOf(doc).has(f));
    ok(missing.length === 0,
      `${doc}: all ${produced.length} produced fields exist${missing.length ? ' — missing ' + missing.join(', ') : ''}`);
    // And no phantom is invented: the produced set is a subset of the real schema.
    ok(produced.length > 0, `${doc}: still offers ${produced.length} fields after filtering`);
  }
}

console.log('\nfiltering against the schema removes the phantom fields:');
{
  const available = [...fieldsOf('application')];
  const withSchema = scopeToDocument(
    [{ field: 'surnameAtBirth', value: 'X' }, { field: 'civilStatus', value: 'Single' },
      { field: 'priorVisas', value: 'none' }, { field: 'nationality', value: 'Indian' }],
    'application', available).map((s) => s.field);
  const without = scopeToDocument(
    [{ field: 'surnameAtBirth', value: 'X' }, { field: 'civilStatus', value: 'Single' },
      { field: 'priorVisas', value: 'none' }, { field: 'nationality', value: 'Indian' }],
    'application', null).map((s) => s.field);
  ok(withSchema.includes('nationality'), 'a real field survives');
  ok(!withSchema.includes('surnameAtBirth') && !withSchema.includes('civilStatus')
    && !withSchema.includes('priorVisas'), 'phantom fields are dropped when the schema is known');
  ok(without.length === 4, 'without a schema list the caller opts into all of them (documented default)');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);