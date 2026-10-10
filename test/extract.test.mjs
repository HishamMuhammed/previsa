// Field extraction from PDF text — suggestions, confidence, and honest refusals.
// Run: node test/extract.test.mjs
//
// The fixture lines below are the ACTUAL text pdf.js returns for
// test/fixtures/hotel-booking.pdf and the bank statement page, so these tests
// run against what the real pipeline produces rather than a convenient fantasy.

import { labelledPairs, suggestFields, bestPerField, guessDocumentType, DOC_LABELS } from '../src/lib/extract.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const HOTEL_PAGE = [
  'HOTEL BOOKING CONFIRMATION',
  'Booking reference: HB-7741902',
  'Guest name: Jose Menon',
  'Check-in date: 2027-02-16',
  'Check-out date: 2027-02-27',
  'Address: 9 Rue des Petites Ecuries, 75010 Paris',
  'Country: France',
  'Total: EUR 980',
];
const BANK_PAGE = [
  'BANK STATEMENT',
  'Account holder: Jose Thomas Menon',
  'Account number: 5010029345678',
  'Closing balance: EUR 980',
  'Statement date: 02 Oct 2026',
];

console.log('\nlabelledPairs:');
{
  const p = labelledPairs(HOTEL_PAGE);
  ok(p.length === 7, `found 7 labelled lines (got ${p.length})`);
  ok(p.some((x) => x.label === 'Guest name' && x.value === 'Jose Menon'), 'label/value split on a colon');
  ok(!p.some((x) => x.label === 'HOTEL BOOKING CONFIRMATION'), 'a line with no colon is not a pair');
  ok(labelledPairs(['Page 2 of 3']).length === 0, 'page furniture is ignored');
  ok(labelledPairs(['', '   ']).length === 0, 'blank lines ignored');
  ok(labelledPairs(['Total: 1,234.50']).some((x) => x.value === '1,234.50'), 'commas preserved in value');
}

console.log('\nhotel booking — extraction:');
{
  const { suggestions } = suggestFields([HOTEL_PAGE], 'accommodation');
  const best = bestPerField(suggestions);
  const by = Object.fromEntries(best.map((b) => [b.field, b]));

  ok(!!by.guestName, 'guest name found');
  ok(by.guestName?.value === 'Jose Menon', `guest name value is "Jose Menon" (got "${by.guestName?.value}")`);
  ok(by.guestName?.confidence === 'high', 'guest name is high confidence');

  ok(by.checkIn?.value === '2027-02-16', 'check-in date extracted');
  ok(by.checkOut?.value === '2027-02-27', 'check-out date extracted');
  ok(by.confirmationNo?.value === 'HB-7741902', 'booking reference extracted');
  ok(by.totalEUR?.value === '980', `total normalised to a number (got "${by.totalEUR?.value}")`);
  ok(by.addressCountry?.value === 'France', 'country extracted');
  ok(by.addressLine?.value.includes('Petites Ecuries'), 'address extracted');
}

console.log('\nconfidence is earned, not assumed:');
{
  // A recognised date is high; a non-date under a date label is only medium.
  const good = suggestFields([['Check-in date: 2027-02-16']], 'accommodation').suggestions;
  ok(good.some((s) => s.confidence === 'high'), 'recognised ISO date scores high');

  const odd = suggestFields([['Check-in date: upon arrival']], 'accommodation').suggestions;
  ok(odd.some((s) => s.confidence === 'medium'), 'unrecognised date format scores medium, not high');
  ok(!odd.some((s) => s.value === ''), 'an empty value is never suggested');

  const junk = suggestFields([['Total: 1']], 'accommodation').suggestions;
  ok(junk.some((s) => s.confidence === 'high'), 'a bare number still counts as money');
}

console.log('\nvalues that are not field values are refused:');
{
  // "Date: 5" is a column heading, not a date.
  const colHeading = suggestFields([['Date: 5']], 'accommodation').suggestions;
  ok(!colHeading.some((s) => s.value === '5'), 'a lone number is not offered as a date');

  // A 200-character paragraph is not an address.
  const long = suggestFields([[`Address: ${'x '.repeat(100)}`]], 'accommodation').suggestions;
  ok(!long.some((s) => s.field === 'addressLine'), 'an absurdly long value is refused');

  const shortCountry = suggestFields([['Country: Belgium and Luxembourg and France and more']], 'accommodation').suggestions;
  ok(!shortCountry.some((s) => s.field === 'addressCountry'), 'an over-long country is refused');
}

console.log('\nlabel matching is tolerant of formatting:');
{
  const variants = suggestFields([['CHECK-IN DATE: 2027-02-16']], 'accommodation').suggestions;
  ok(variants.some((s) => s.field === 'checkIn'), 'uppercase label matches');
  const suffixed = suggestFields([['Check-in date (optional): 2027-02-16']], 'accommodation').suggestions;
  ok(suffixed.some((s) => s.field === 'checkIn'), 'label with a suffix matches');
}

console.log('\nbank statement — extraction:');
{
  const { suggestions } = suggestFields([BANK_PAGE], 'bankStatement');
  const by = Object.fromEntries(bestPerField(suggestions).map((b) => [b.field, b]));
  ok(by.accountHolder?.value === 'Jose Thomas Menon', 'account holder extracted');
  ok(by.accountNo?.value === '5010029345678', 'account number extracted');
  // "Account holder" must NOT be offered as the account number: a prefix match
  // on "account" used to put a person's name in the account-number field.
  const holderAsNo = bestPerField(suggestions).filter((b) => b.field === 'accountNo');
  ok(holderAsNo.every((b) => b.value === '5010029345678'), 'no wrong account-number candidate offered');
  ok(by.closingBalanceEUR?.value === '980', 'closing balance extracted as a number');
  ok(!!by.statementDate, 'statement date found');
  ok(by.statementDate?.confidence === 'high', 'a spelled date in a recognised format is high confidence');
}

console.log('\nmultiple candidates are surfaced, not silently resolved:');
{
  // Two different labels that both legitimately mean "the check-in date".
  const two = suggestFields([
    ['Arrival date: 2027-02-16'],
    ['Check-in date: 2027-02-17'],
  ], 'accommodation').suggestions.filter((s) => s.field === 'checkIn');
  ok(two.length === 2, `two labels for the same field yield two candidates (got ${two.length})`);
  const best = bestPerField(two)[0];
  ok(Array.isArray(best.alternatives) && best.alternatives.length === 1,
    'the runner-up is kept as an alternative rather than discarded');
}

console.log('\nguessDocumentType:');
{
  ok(guessDocumentType([HOTEL_PAGE]) === 'accommodation', 'hotel text routes to the booking');
  ok(guessDocumentType([BANK_PAGE]) === 'bankStatement', 'bank text routes to the statement');
  ok(guessDocumentType([['INTERNATIONAL FLIGHT ITINERARY', 'Passenger name: MENON/JOSE', 'Departure date: 2027-02-14']]) === 'itinerary',
    'flight text routes to the itinerary');
  // No signal must mean no guess — the user picks, per the plan.
  ok(guessDocumentType([['Lorem ipsum dolor sit amet', 'consectetur adipiscing elit']]) === null,
    'unrecognisable text refuses to guess a document type');
  // Repetition must not outweigh: "balance" on four lines is not four times
  // more bank-like, and a bank second page once outvoted a hotel first page.
  const mixed = [['HOTEL BOOKING', 'Guest name: Jose Menon', 'Check-in date: 2027-02-16', 'Country: France'],
    ['BANK STATEMENT', 'Account holder: Jose', 'Account number: 5010029345678',
      'Closing balance: EUR 980', 'Balance: EUR 100', 'Balance: EUR 200', 'Balance: EUR 300']];
  ok(guessDocumentType(mixed) === null, 'a genuinely ambiguous two-document file refuses to guess');
  ok(guessDocumentType([['BALANCE: EUR 10']]) === null, 'a single keyword is not enough to claim a type');
  ok(!!DOC_LABELS.accommodation, 'documents have human labels for the UI');
}

console.log('\nwiring:');
{
  const { doc, suggestions } = suggestFields([HOTEL_PAGE], 'accommodation');
  ok(doc === 'accommodation', 'result names the target document');
  ok(suggestions.every((s) => s.sourceLine && s.why), 'every suggestion cites its source line and reason');
  ok(suggestFields([HOTEL_PAGE], 'passport').suggestions.length === 0,
    'an out-of-scope document yields nothing rather than a guess');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);