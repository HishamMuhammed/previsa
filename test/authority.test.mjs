// Citations: every rule declares an authority, and the authority is graded.
//
// Run: node test/authority.test.mjs
//
// Writing this table found two errors that were live in the app and would have
// been quoted to a judge:
//
//   1. The Schengen instrument is Regulation (EC) No 810/2009. Four findings cited
//      'EU 810/2008' — the year of the Commission proposal, not the regulation.
//   2. 'Art. 15' was cited for the 90/180 rolling window. Article 15 is travel
//      medical insurance. The 90-in-180 limit is in the scope of the Regulation
//      and the Art. 2(2)(a) definition of 'short stay'.
//
// Both verified against EUR-Lex rather than corrected from memory, because a
// citation that is confidently wrong is worse than no citation at all.

import { readFileSync } from 'node:fs';
import { runRules } from '../src/lib/rules.js';
import { authorityFor, AUTHORITY } from '../src/lib/authority.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ok   ${m}`)) : (fail++, console.log(`  FAIL ${m}`)); };

const base = JSON.parse(readFileSync(new URL('../src/lib/sample.json', import.meta.url), 'utf8'));
const findings = runRules(base).findings;
const byId = (id) => findings.find((f) => f.id === id);

console.log('\nEvery rule has an authority');

{
  const ids = [...new Set(findings.map((f) => f.id))];
  ok(ids.length >= 16, `${ids.length} distinct rules reported`);
  for (const id of ids) {
    const a = authorityFor(id);
    if (a.cite === 'No authority recorded') { ok(false, `${id} has no recorded source`); }
  }
  ok(!ids.some((id) => authorityFor(id).cite === 'No authority recorded'),
    'no rule falls back to the unverified placeholder');
}

console.log('\nThe Schengen citations are correct');

{
  const r01 = authorityFor('R01');
  ok(/810\/2009/.test(r01.cite), `R01 cites 810/2009, not 810/2008: "${r01.cite}"`);
  ok(/Art\. 12/.test(r01.cite), 'R01 cites Art. 12 (travel document)');
  ok(/three months/.test(r01.note), 'R01 note states the three-month rule');

  const r05c = authorityFor('R05c');
  ok(/810\/2009/.test(r05c.cite), `R05c cites 810/2009: "${r05c.cite}"`);
  ok(!/Art\. 15/.test(r05c.cite), 'R05c does NOT cite Art. 15 — that is insurance');
  ok(/90 days in any 180-day period/.test(r05c.note), 'R05c note states 90 in 180');

  const r09 = authorityFor('R09b');
  ok(/Art\. 15/.test(r09.cite), 'insurance IS Art. 15');
  ok(/30 ?000/.test(r09.note), 'insurance note states the EUR 30 000 minimum');
}

console.log('\nNo finding anywhere still cites the wrong year');

{
  const all = findings.map((f) => f.source).join(' | ');
  ok(!/810\/2008/.test(all), 'no citation says 810/2008');

  // Check the rule bodies, not the whole file: rules.js legitimately mentions the
  // old wrong year in the comment explaining what was corrected. An earlier
  // version of this assertion read the raw file and failed on that comment.
  const src = readFileSync(new URL('../src/lib/rules.js', import.meta.url), 'utf8');
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/^\s*\/\/.*$/gm, '');      // line comments
  ok(!/810\/2008/.test(codeOnly), 'no stale 810/2008 left in the rule code');
}

console.log('\nAuthority is graded, not flattened');

{
  const kinds = new Set(['R00', 'R01', 'R02'].map((id) => authorityFor(id).kind));
  ok(kinds.has(AUTHORITY.regulation), 'at least one regulation-grade rule');
  ok(kinds.has(AUTHORITY.guidance), 'at least one guidance-grade rule');
  ok(kinds.has(AUTHORITY.consistency), 'at least one consistency-grade rule');

  // A consistency finding must not pretend to have a link.
  const r02 = authorityFor('R02');
  ok(r02.kind === AUTHORITY.consistency && !r02.link, 'consistency findings carry no link');
}

console.log('\nOnly regulations link to official text');

{
  for (const f of findings) {
    const a = f.authority;
    if (!a) continue;
    if (a.link) {
      ok(a.kind === AUTHORITY.regulation, `${f.id} has a link, so it must be regulation-grade`);
      ok(/^https:\/\//.test(a.link), `${f.id} link is https`);
    }
  }
}

console.log('\nEvery rule has a one-line note');

{
  const missing = findings.filter((f) => f.authority && !f.authority.note).map((f) => f.id);
  ok(missing.length === 0, `all notes present${missing.length ? ` (missing on ${missing})` : ''}`);
  const r01 = authorityFor('R01');
  ok(r01.note.length > 40, 'notes say what the authority actually says, not just restate the rule');
}

console.log('\nFindings carry their authority');

{
  const f = byId('R01');
  ok(f?.authority?.kind === AUTHORITY.regulation, 'R01 finding carries its authority object');
  ok(f?.source === authorityFor('R01').cite, 'finding.source is the canonical citation');
  ok(f?.sourceLocal !== undefined, 'the rule-local string is preserved as sourceLocal');
}

console.log('\nThe report object exposes rules with authorities');

{
  const r = runRules(base);
  ok(Array.isArray(r.rules), 'report.rules is present');
  ok(r.rules.every((x) => x.cite && x.kind), 'every rule entry has a citation and a grade');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
