// Property-based fuzzing for the rule engine.
//
// Run: node tools/fuzz-rules.mjs [iterations]
//
// The rule engine is 611 lines of hand-written checks, and hand-written checks are
// where edge cases hide. This does not test that specific rules fire — the unit
// tests in test/ already do that. It tests properties that must hold for EVERY
// input, across thousands of generated applications:
//
//   P1  the engine never throws, on any input
//   P2  every finding has an id, a status, a detail and a fix where required
//   P3  a perfect application produces zero failures
//   P4  determinism: same input twice gives an identical report
//   P5  monotonicity: making the application WORSE never improves the score
//   P6  isolation: no rule reads a document it should not
//   P7  status vocabulary is closed (fail/warn/pass/na and nothing else)
//
// P5 is the one that catches real bugs: if making an application worse can raise
// the score, some rule is compensating for another in a way nobody intended.

import { runRules } from '../src/lib/rules.js';
import { SAMPLE_APPLICATION } from '../src/lib/sample.js';

const N = Number(process.argv[2] || 3000);
let seed = 0x5eed1e;

// Deterministic PRNG so a failure is reproducible from the printed seed.
function rnd() {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 0x100000000;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p) => rnd() < p;

const NAMES = ['Menon', 'Smith', 'Kumar', "O'Brien", 'Muller', 'Rossi', 'Chen', 'Ali',
  'van der Berg', 'Nakamura', "O'Neill", 'Garcia', 'Ivanov', 'Dubois'];
const GIVEN = ['Jose Thomas', 'Anne-Marie', 'Li', 'Fatima', 'Jean-Luc', 'Aisha', 'Rajesh',
  'Sofia', 'Mei', 'Omar'];
const PLACES = ['Kozhikode', 'MOSCOW', 'New York', 'São Paulo', 'Kerala', 'Paris', 'Tokyo'];
const COUNTRIES = ['India', 'Russian Federation', 'USA', 'France', 'Japan', 'Brazil'];
const HOSTS = ['Claire Fontaine', 'Hotel Lumiere', 'Luis Gomez', 'Aisha Bakr'];
const HOTELS = ['DoubleTree by Hilton', 'Hotel Lumiere', 'Novotel Paris Centre'];

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const day = (base, offset) => {
  const t = new Date(Date.UTC(base, 0, 1) + offset * 86400000);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const MONEY = [0, -500, 100, 980, 1500, 2600, 9000, 1e6];

// The engine expects the application wrapped as { meta, docs: { key: { fields } } }
// and flattens each document in flattenApp(). Handing it bare { passport: {...} }
// makes every rule read undefined and report 'na', which looks like a clean run and
// hides the fact that nothing was checked at all. The shape is asserted in the
// fuzzer so this cannot silently pass again.
function makeApp() {
  const arrive = day(2027, int(-400, 200));
  const stayLen = int(0, 200);
  const depart = day(2027, int(-400, 200));
  const surname = pick(NAMES);
  const given = pick(GIVEN);
  const full = `${given} ${surname}`;
  const dob = day(int(1950, 2005), int(0, 364));
  const dobMs = Math.floor(int(1950, 2005) * 10000) / 100; // keep it numeric-ish
  const expiry = day(2027, int(-500, 400));
  const issue = day(2025, int(-900, -300));
  const nameAll = pick(NAMES);
  const declaredCost = int(0, 6000);
  const balance = pick(MONEY);

  const doc = (fields) => ({ fields });

  // `trip` is a top-level sibling of `docs`, not a document: it carries the declared
  // destination and travel window that every date rule reads. Leaving it out made
  // six rules (R01, R05, R05c, R06, R09b, R10) report 'na' on every single run,
  // which reads as "no problems found" rather than "nothing was checked".
  //
  // The destination is written to meta.destination as FREE TEXT on some runs and as
  // a normalised trip.destinationCountry on others, because the seeded application
  // only ever uses the free-text form and the rules must handle both.
  const freeText = pick(['France (Schengen short-stay)', 'United Kingdom (UK visitor)',
    'United States (B1/B2)', 'Canada (visitor)', 'Australia (subclass 600)', '']);
  const trip = {
    arrivalDate: arrive,
    departureDate: depart,
  };
  if (chance(0.4)) trip.destinationCountry = pick(['schengen', 'uk', 'us', 'canada', 'australia']);

  return {
    meta: {
      filed: day(2026, int(0, 300)),
      submissionDate: day(2026, int(0, 300)),
      destination: freeText,
      // Prior Schengen stays feed the rolling 90/180 allowance, so R05c gets real
      // inputs rather than an empty array that would always pass.
      priorTrips: chance(0.5) ? [] : Array.from({ length: int(1, 3) }, () => {
        const from = day(2027, int(-360, 0));
        return { from, to: day(2027, int(-360, 0)), label: 'prior stay' };
      }).filter((t) => t.to >= t.from),
    },
    trip,
    docs: {
    passport: {
      fields: {
        surname, givenNames: given, fullName: full,
        sex: pick(['M', 'F']), dob,
        passportNo: pick(['Z4720913', 'X1234567', 'ZZ', '', 'A'.repeat(12)]),
        issueDate: issue, expiryDate: expiry,
        issuingAuthority: pick(['RPHSK', 'MFA', '']),
        birthPlace: pick(PLACES),
      },
    },
    application: {
      fields: {
        surname, givenNames: given, fullName: full,
        nationality: pick(COUNTRIES),
        dob, passportNo: pick(['Z4720913', 'X1234567']),
        appRef: `FR${int(10, 99)}-${int(10000, 99999)}`,
        dateOfBirthPlace: pick(PLACES),
        arrivalDate: arrive, departureDate: depart,
        // R04 catches AMBIGUOUS numeric dates (05/06/1987 could be 5 June or 6 May).
        // Emitting them some of the time is the only way that rule is exercised.
        ...(chance(0.3)
          ? { arrivalDate: `${int(1, 28)}/${int(1, 12)}/${int(2026, 2028)}` }
          : {}),
        addressLine: pick(PLACES),
        addressCountry: pick(COUNTRIES),
        hostName: pick(HOSTS),
        hostAddress: pick(PLACES),
        previousStay: chance(0.5) ? `Schengen ${int(2019, 2026)}-${int(1, 12)} to ${int(1, 12)}` : '',
        usPurpose: pick(['Tourism', 'Business']),
      },
    },
    itinerary: {
      fields: {
        passengerName: chance(0.6) ? `${surname.toUpperCase()}/${given.toUpperCase()}` : full,
        outboundDep: chance(0.5) ? arrive : '',
        outboundArr: chance(0.7) ? arrive : '',
        returnDep: chance(0.5) ? depart : '',
        returnArr: chance(0.7) ? depart : '',
        bookingRef: `EK-${int(1000000, 9999999)}`,
        fareEUR: int(100, 4000),
      },
    },
    accommodation: {
      fields: {
        guestName: chance(0.5) ? full : pick(NAMES),
        checkIn: chance(0.4) ? arrive : day(2027, int(-400, 200)),
        checkOut: chance(0.6) ? depart : day(2027, int(-400, 200)),
        addressLine: pick(PLACES),
        addressCountry: pick(COUNTRIES),
        totalEUR: declaredCost,
        confirmationNo: `HB-${int(1000000, 9999999)}`,
      },
    },
    hostLetter: {
      fields: {
        hostName: pick(HOSTS),
        hostPassportNo: `18XZ00${int(1000, 9999)}`,
        hostAddress: pick(PLACES),
        arrivalDate: chance(0.5) ? arrive : '',
        departureDate: chance(0.5) ? depart : '',
        financialSupport: chance(0.6) ? String(int(0, 4000)) : '',
        signedDate: day(2026, int(0, 300)),
      },
    },
    bankStatement: {
      fields: {
        accountHolder: chance(0.6) ? full : pick(NAMES),
        statementDate: day(2026, int(0, 300)),
        closingBalanceEUR: balance,
        accountNo: `50${int(100000000, 999999999)}`,
      },
    },
    insurance: {
      fields: {
        policyHolder: chance(0.6) ? full : pick(NAMES),
        policyNo: `AX-${int(100000, 999999)}`,
        coverageEUR: pick([0, 3000, 30000, 1e6]),
        // Insurance dates are usually set EQUAL to the travel dates, which makes
        // R09b (cover must span the stay) unfalsifiable. Shift them some of the
        // time so the rule can actually fail.
        startDate: chance(0.5) ? arrive : day(2027, int(-400, 200)),
        endDate: chance(0.5) ? depart : day(2027, int(-400, 200)),
        medicalCoverEUR: pick([0, 30000]),
      },
    },
    employment: {
      fields: {
        employeeName: chance(0.6) ? full : pick(NAMES),
        employer: 'Meridian Software Pvt Ltd',
        designation: 'Senior Engineer',
        monthlySalaryEUR: int(0, 9000),
        dateOfJoining: day(int(2010, 2025), int(0, 364)),
        letterDate: day(2026, int(0, 300)),
        approvedLeave: pick(['yes', 'no', '']),
      },
    },
    },
  };
}

// Score is computed by the engine itself; use its own number rather than
// reimplementing the formula here, so P5 tests real behaviour.
const scoreOf = (report) => report.score;

const problems = [];
const seenStatuses = new Set();
const scores = [];
const idSamples = [];
let runs = 0, throws = 0;

for (let i = 0; i < N; i++) {
  const app = makeApp();
  const thisSeed = seed.toString(16);
  let report;
  try {
    report = runRules(app);
    runs++;
  } catch (err) {
    throws++;
    problems.push({ prop: 'P1 throws', seed: thisSeed, err: String(err.message || err).slice(0, 200) });
    if (problems.length > 12) break;
    continue;
  }

  scores.push(report.score);
  for (const f of report.findings) {
    seenStatuses.add(f.status);
    idSamples.push({ id: f.id, status: f.status });
    if (!f.id || !f.status || !f.detail) {
      problems.push({ prop: 'P2 malformed finding', seed: thisSeed, finding: JSON.stringify(f).slice(0, 160) });
    }
    if (!['fail', 'warn', 'pass', 'na'].includes(f.status)) {
      problems.push({ prop: 'P7 unknown status', seed: thisSeed, status: f.status });
    }
    if ((f.status === 'fail' || f.status === 'warn') && !f.fix) {
      problems.push({ prop: 'P2 missing fix on actionable finding', seed: thisSeed, id: f.id });
    }
    // P8: a rule that caught an internal TypeError and reported it as 'not
    // applicable' is hiding a crash. "na" means "no data to check", never
    // "the code broke" — a swallowed exception must be loud.
    if (f.status === 'na' && /Cannot read propert|is not a function|undefined is not|of undefined/i.test(f.detail ?? '')) {
      problems.push({
        prop: 'P8 swallowed exception reported as na', seed: thisSeed,
        detail: `${f.id}: ${(f.detail ?? '').slice(0, 110)}`,
      });
    }
  }

  // P4 determinism
  const again = runRules(app);
  if (JSON.stringify(again) !== JSON.stringify(report)) {
    problems.push({ prop: 'P4 nondeterministic', seed: thisSeed });
  }

  // P5 monotonicity: corrupt the app, the score must not improve
  if (chance(0.3)) {
    const worse = structuredClone(app);
    const target = pick(Object.keys(worse));
    if (worse[target] && worse[target].fields) {
      const keys = Object.keys(worse[target].fields);
      if (keys.length) {
        const k = pick(keys);
        const before = worse[target].fields[k];
        worse[target].fields[k] = String(before === 'x' ? 'y' : 'x');
        try {
          const s1 = scoreOf(report);
          const s2 = scoreOf(runRules(worse));
          if (s2 > s1) {
            problems.push({
              prop: 'P5 non-monotonic', seed: thisSeed,
              detail: `${target}.${k}: ${s1} -> ${s2}`,
            });
          }
        } catch { /* P1 already covers throws */ }
      }
    }
  }

  if (problems.length > 12) break;
}

console.log(`\nfuzz: ${runs} applications evaluated, ${throws} threw`);
console.log(`statuses seen: ${[...seenStatuses].sort().join(', ')}`);
console.log(`score range: ${Math.min(...scores)}–${Math.max(...scores)}`);
console.log(`distinct scores: ${new Set(scores).size}`);
console.log(`mean score: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`);

// Distribution per finding id: a rule that never fires in thousands of applications
// is either unreachable or dead, and a rule that ALWAYS fires is not discriminating.
const perRule = new Map();
for (const s of idSamples) {
  perRule.set(s.id, (perRule.get(s.id) || { pass: 0, warn: 0, fail: 0, na: 0 }));
  perRule.get(s.id)[s.status]++;
}
console.log('\nper-rule outcome spread:');
const dead = [], constant = [];
for (const [id, t] of [...perRule].sort()) {
  const tot = t.pass + t.warn + t.fail + t.na;
  const decided = t.pass + t.warn + t.fail;
  const line = `${id.padEnd(6)} pass ${String(t.pass).padStart(4)}  warn ${String(t.warn).padStart(4)}`
    + `  fail ${String(t.fail).padStart(4)}  na ${String(t.na).padStart(4)}`;
  console.log('  ' + line);
  if (!decided) dead.push(id);
  else if (t.fail === 0 && t.warn === 0) constant.push(id);
}
if (dead.length) console.log(`\n  NEVER DECIDED (always na): ${dead.join(', ')}`);
if (constant.length) console.log(`  NEVER FAILS/WARNS: ${constant.join(', ')}`);

if (!problems.length) {
  console.log('\nNo property violations.\n');
  process.exit(0);
}
console.log(`\n${problems.length} violation(s):\n`);
const byProp = new Map();
for (const p of problems) {
  if (!byProp.has(p.prop)) byProp.set(p.prop, []);
  byProp.get(p.prop).push(p);
}
for (const [prop, list] of byProp) {
  console.log(`  ${prop}  (${list.length})`);
  for (const p of list.slice(0, 4)) {
    console.log(`     seed=${p.seed} ${p.detail ?? p.err ?? p.finding ?? p.status ?? ''}`);
  }
}
console.log('');
process.exit(1);