// Rule engine tests. Run: node test/rules.test.mjs
import { readFile } from 'node:fs/promises';
import { runRules } from '../src/lib/rules.js';

const sample = JSON.parse(await readFile(new URL('../src/lib/sample.json', import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? (pass++, console.log(`  ok   ${msg}`)) : (fail++, console.log(`  FAIL ${msg}`)); };

function ids(src, status) {
  const r = runRules(clone(src));
  return r.findings.filter((f) => f.status === status).map((f) => f.id);
}
const finding = (src, id) => runRules(clone(src)).findings.find((f) => f.id === id);

console.log('\nsample application (intentionally broken):');
const base = runRules(sample);
console.log(`  score ${base.score}%  fail=${base.tally.fail} warn=${base.tally.warn} pass=${base.tally.pass}`);
console.log(`  failing rules: ${base.findings.filter((f) => f.status === 'fail').map((f) => f.id).join(', ')}`);
ok(base.tally.fail >= 3, `sample has ${base.tally.fail} failing checks (expect >= 3)`);
ok(base.tally.pass >= 4, `sample has ${base.tally.pass} passing checks (expect >= 4)`);
ok(base.score > 5 && base.score < 95, 'score is neither 0 nor 100');

console.log('\nR01 passport expiry:');
{
  const s = clone(sample);
  s.trip.arrivalDate = '2027-02-14';
  s.docs.passport.fields.expiryDate = '2028-08-30';
  ok(!ids(s, 'fail').includes('R01'), 'passport 18 months after arrival passes');
  const s2 = clone(sample);
  s2.docs.passport.fields.expiryDate = '2027-04-30';
  ok(ids(s2, 'fail').includes('R01'), 'passport 2 months after arrival fails (Schengen needs 3)');
  const s3 = clone(sample);
  s3.trip.destinationCountry = 'canada';
  s3.docs.passport.fields.expiryDate = '2027-03-01';
  ok(!ids(s3, 'fail').includes('R01'), 'same passport passes for Canada (validity only)');
}

console.log('\nR02 name consistency:');
{
  const s = clone(sample);
  s.docs.hostLetter.fields.hostName = 'Claire Fontaine';
  const hostFinding = finding(s, 'R02');
  ok(!hostFinding || hostFinding.status !== 'fail' || !/Fontaine/.test(hostFinding.detail),
    'host name is not treated as the applicant name');
  const s2 = clone(sample);
  s2.docs.bankStatement.fields.accountHolder = 'Jose Menon';
  ok(ids(s2, 'fail').includes('R02'), 'dropping the middle name is a mismatch');
  const s3 = clone(sample);
  s3.docs.hostLetter.fields.hostName = 'Claude Fontaine';
  const bad = finding(s3, 'R02');
  ok(!bad || bad.status !== 'fail' || !/Claude/.test(bad.detail),
    'a misspelled host name is not reported as an applicant-name mismatch');
}

console.log('\nR03 passport number:');
{
  const s = clone(sample);
  s.docs.application.fields.passportNo = 'Z4720918';
  ok(ids(s, 'fail').includes('R03'), 'transposed digit fails');
  s.docs.application.fields.passportNo = 'z4720913';
  ok(!ids(s, 'fail').includes('R03'), 'case difference alone passes');
}

console.log('\nR04 date ambiguity:');
{
  const s = clone(sample);
  s.docs.hostLetter.fields.arrivalDate = '14/02/2027';
  s.docs.hostLetter.fields.departureDate = '27/02/2027';
  ok(!ids(s, 'fail').includes('R04'), 'unambiguous slash dates pass');
  const s2 = clone(sample);
  s2.docs.hostLetter.fields.arrivalDate = '03/04/2027';
  ok(ids(s2, 'fail').includes('R04'), '03/04/2027 is flagged as ambiguous');
  const s3 = clone(sample);
  s3.docs.hostLetter.fields.arrivalDate = '2027-02-14';
  s3.docs.hostLetter.fields.departureDate = '2027-02-27';
  ok(!ids(s3, 'fail').includes('R04'), 'ISO dates pass');
}

console.log('\nR05 trip date consistency:');
{
  const s = clone(sample);
  s.docs.accommodation.fields.checkIn = '2027-02-16';
  ok(ids(s, 'fail').includes('R05'), 'hotel check-in 2 days late fails');
  const s2 = clone(sample);
  s2.trip.arrivalDate = '2027-02-14';
  s2.trip.departureDate = '2027-06-30';
  s2.docs.itinerary.fields.outboundArr = '2027-02-14';
  s2.docs.itinerary.fields.returnArr = '2027-06-30';
  s2.docs.accommodation.fields.checkIn = '2027-02-14';
  s2.docs.accommodation.fields.checkOut = '2027-06-30';
  s2.docs.hostLetter.fields.arrivalDate = '2027-02-14';
  s2.docs.hostLetter.fields.departureDate = '2027-06-30';
  s2.docs.application.fields.arrivalDate = '2027-02-14';
  s2.docs.application.fields.departureDate = '2027-06-30';
  ok(ids(s2, 'fail').includes('R05c'), '135-day stay fails the 90/180 allowance');
}

console.log('\nR06 application timing:');
{
  const s = clone(sample);
  s.meta.submissionDate = '2026-11-30';
  s.docs.application.fields.submissionDate = '2026-11-30';
  ok(!ids(s, 'fail').includes('R06'), '85 days before arrival passes');
  const s2 = clone(sample);
  s2.meta.submissionDate = '2026-01-01';
  s2.docs.application.fields.submissionDate = '2026-01-01';
  ok(ids(s2, 'fail').includes('R06'), '408 days before arrival fails as premature');
}

console.log('\nR07 statement age:');
{
  const s = clone(sample);
  s.meta.submissionDate = '2026-11-30';
  s.docs.bankStatement.fields.statementDate = '2026-10-02';
  ok(!ids(s, 'fail').includes('R07'), '61-day-old statement passes (Schengen 3 months)');
  const s2 = clone(sample);
  s2.docs.bankStatement.fields.statementDate = '2026-03-02';
  ok(ids(s2, 'fail').includes('R07'), '272-day-old statement fails');
}

console.log('\nR08 funds:');
{
  const s = clone(sample);
  s.docs.bankStatement.fields.closingBalanceEUR = 1500;
  s.trip.declaredCostEUR = 1800;
  ok(ids(s, 'fail').includes('R08'), 'balance below declared cost fails');
  const s2 = clone(sample);
  s2.docs.bankStatement.fields.closingBalanceEUR = 6200;
  ok(!ids(s2, 'fail').includes('R08'), '3.4x cover passes');
}

console.log('\nR09 insurance:');
{
  const s = clone(sample);
  s.docs.insurance.fields.medicalCoverEUR = 20000;
  s.docs.insurance.fields.coverageEUR = 20000;
  ok(ids(s, 'fail').includes('R09'), 'EUR 20k medical cover fails the EUR 30k rule');
  const s2 = clone(sample);
  s2.docs.insurance.fields.endDate = '2027-02-20';
  ok(ids(s2, 'fail').includes('R09b'), 'policy expiring mid-trip fails');
  const s3 = clone(sample);
  s3.docs.insurance.fields.startDate = '2027-02-14';
  s3.docs.insurance.fields.endDate = '2027-02-27';
  ok(!ids(s3, 'fail').includes('R09b'), 'policy starting on arrival and ending on departure passes');
}

console.log('\nR10 employment:');
{
  const s = clone(sample);
  s.docs.employment.fields.dateOfJoining = '2027-03-01';
  ok(ids(s, 'fail').includes('R10'), 'joining date after arrival fails');
  const s2 = clone(sample);
  s2.docs.employment.fields.dateOfJoining = '2026-09-01';
  ok(ids(s2, 'warn').includes('R10'), 'under six months employed warns');
}

console.log('\nR11 required fields:');
{
  const s = clone(sample);
  delete s.docs.application.fields.usPurpose;
  ok(ids(s, 'fail').includes('R11'), 'missing purpose of travel fails');
}

console.log('\nR12 addresses:');
{
  const s = clone(sample);
  s.docs.accommodation.fields.addressCountry = 'India';
  ok(ids(s, 'fail').includes('R12b'), 'hotel in home country fails');
  const s2 = clone(sample);
  s2.docs.hostLetter.fields.hostAddress = '12 Rue de Rivoli, 75004 Paris';
  ok(ids(s2, 'fail').includes('R12'), 'a genuinely different destination address fails');
  const s3 = clone(sample);
  s3.docs.hostLetter.fields.hostAddress = '9 RUE DES PETITES ECURIES, 75010 PARIS';
  ok(!ids(s3, 'fail').includes('R12'), 'case-only difference in an address still passes');
  const s4 = clone(sample);
  s4.docs.hostLetter.fields.hostAddress = '9 Rue des Petites Ecuries 75010 Paris';
  ok(!ids(s4, 'fail').includes('R12'),
    'punctuation/case differences in the same address normalise away rather than flagging');
}

console.log('\nR13 host letter:');
{
  const s = clone(sample);
  delete s.docs.hostLetter.fields.hostPassportNo;
  ok(ids(s, 'fail').includes('R13'), 'host letter without ID number fails');
}

console.log('\nR05 cross-format date equivalence (regression):');
{
  // readDate used to return epoch ms for ISO input and a string for slash input,
  // so "14/02/2027" and "2027-02-14" — the same day — never compared equal and
  // R05 failed on a file that was actually correct.
  const s = clone(sample);
  s.trip.arrivalDate = '14/02/2027';
  s.trip.departureDate = '27/02/2027';
  s.docs.itinerary.fields.outboundArr = '2027-02-14';
  s.docs.itinerary.fields.returnArr = '2027-02-27';
  s.docs.accommodation.fields.checkIn = '2027-02-14';
  s.docs.accommodation.fields.checkOut = '2027-02-27';
  s.docs.hostLetter.fields.arrivalDate = '2027-02-14';
  s.docs.hostLetter.fields.departureDate = '2027-02-27';
  s.docs.application.fields.arrivalDate = '2027-02-14';
  s.docs.application.fields.departureDate = '2027-02-27';
  ok(!ids(s, 'fail').includes('R05'), 'slash-form trip dates match ISO bookings');
  const s2 = clone(sample);
  s2.docs.accommodation.fields.checkIn = '2027-02-16';
  ok(ids(s2, 'fail').includes('R05'), 'a genuinely different booking date still fails');
}

console.log('\nedge cases:');
{
  const s = clone(sample);
  const r = runRules(s);
  ok(r.findings.length > 0, 'empty-ish app still produces findings, no crash');
  const s2 = clone(sample);
  s2.docs.passport.fields.expiryDate = 'not-a-date';
  s2.docs.accommodation.fields.checkIn = '31/02/2027';
  const r2 = runRules(s2);
  ok(r2.findings.some((f) => f.status === 'na'), 'malformed input degrades to na rather than throwing');
  const r3 = runRules(clone(sample));
  const r4 = runRules(clone(sample));
  ok(JSON.stringify(r3) === JSON.stringify(r4), 'engine is deterministic');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);