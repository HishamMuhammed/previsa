import { readFileSync } from 'node:fs';
import { runRules } from '../src/lib/rules.js';
const s = JSON.parse(readFileSync(new URL('../src/lib/sample.json', import.meta.url),'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const r05c = (src) => runRules(clone(src)).findings.find(x=>x.id==='R05c');

let pass=0, fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};

// baseline: sample passes with 15 earlier days counted
const b = r05c(s);
ok(b.status==='pass' && /15 earlier/.test(b.detail), 'sample counts 15 earlier days in window');

// EXACTLY 90 -> still allowed (rule is "> 90 fails")
const exact = clone(s);
exact.meta.priorTrips=[{from:'2026-09-01',to:'2026-11-15'}]; // 76 in-window days + 14 = 90
const e = r05c(exact);
// EXACTLY 90 is legal (the rule fails only above 90), but it warns because no
// allowance remains. That is the correct behaviour, not a clean pass.
ok(/90 of 90 days/.test(e.detail) && e.status === 'warn',
  `exactly 90 warns with nothing left, does not fail (got ${e.status})`);

// 91 -> must fail
const over = clone(s);
over.meta.priorTrips=[{from:'2026-11-15',to:'2027-02-04'}]; // 82 days + 14 = 96
const o = r05c(over);
ok(o.status==='fail' && /Exceeds the 90-day/.test(o.title), `over 90 FAILS (got ${o.status})`);

// outside window -> excluded
const stale = clone(s);
stale.meta.priorTrips=[{from:'2025-01-01',to:'2025-01-20'}];
ok(/\b0 earlier\b/.test(r05c(stale).detail), 'a year-old stay is outside the 180-day window');

// >75 used -> warn
const warn = clone(s);
warn.meta.priorTrips=[{from:'2026-12-15',to:'2027-01-25'}]; // 42 + 14 = 56
warn.meta.priorTrips=[{from:'2026-11-28',to:'2027-02-04'}]; // 69 + 14 = 83
const w = r05c(warn);
ok(w.status==='warn' && /allowance left/.test(w.title), `76/90 warns (got ${w.status}: ${w.title})`);

// single long trip > 90 still warns even with no history
const long = clone(s);
long.meta.priorTrips=[];
long.trip.arrivalDate='2027-01-05'; long.trip.departureDate='2027-05-05';
const l = r05c(long);
ok(l.status!=='pass', `a 120-day single trip is not clean (got ${l.status})`);

// non-schengen -> na
const uk = clone(s); uk.trip.destinationCountry='uk';
ok(r05c(uk).status==='na', 'non-Schengen returns na');

// malformed prior trips are reported, not silently zero
const bad = clone(s);
bad.meta.priorTrips=[{from:'nonsense',to:'also-bad'}];
const bd = r05c(bad);
ok(/could not be read/.test(bd.detail), 'malformed prior stay is disclosed, not silently ignored');

// no priorTrips key at all -> still works
const none = clone(s); delete none.meta.priorTrips;
ok(r05c(none).status==='pass', 'missing priorTrips is handled');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
