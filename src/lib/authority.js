// Where each rule comes from.
//
// The `source` string on a finding was doing two jobs badly: it was sometimes a
// real citation ('EU 810/2008 Art. 15') and sometimes a restatement of the rule
// ('Internal consistency', 'Date disambiguation'). A field that is sometimes
// authority and sometimes a tautology teaches the reader to ignore it.
//
// So the split is explicit. Every rule declares its authority, and authority is
// graded:
//
//   'regulation'  - a named article of a named instrument. Verifiable, stable,
//                   quotable. Link is to the official text.
//   'guidance'    - official but discretionary: what consulates actually ask for.
//                   Correct as practice, not as law. No link, because these pages
//                   move and a dead link is worse than none.
//   'consistency' - no external authority exists. The rule catches an internal
//                   contradiction, which is a defect in the file rather than a
//                   breach of anything. Stated as such instead of dressed up.
//
// Two corrections found while writing this, both of which were live in the app:
//
//   1. The Schengen instrument is Regulation (EC) No 810/2009, not 810/2008. Four
//      findings cited the wrong year. 2008 is the year of the proposal.
//   2. 'Art. 15' was cited for the 90/180 rolling window. Article 15 is travel
//      medical insurance; the 90-in-180 limit is in the scope of the Regulation
//      and Article 2's definition of 'short stay'. Cited correctly now.

export const AUTHORITY = {
  regulation: 'regulation',
  guidance: 'guidance',
  consistency: 'consistency',
};

/**
 * kind   - see AUTHORITY above
 * cite   - the citation proper, shown verbatim to the reader
 * link   - official text, for regulations only
 * note   - what the authority actually says, in one line. This is the part that
 *          lets someone check the claim rather than take it on trust.
 */
const SOURCES = {
  R00: {
    kind: 'guidance',
    cite: 'Consular document checklists',
    note: 'Every Schengen consulate publishes a required-documents list. An incomplete file is normally returned unprocessed, which is why this is checked before anything else.',
  },
  R01: {
    kind: 'regulation',
    cite: 'Regulation (EC) No 810/2009, Art. 12(a)',
    link: 'https://eur-lex.europa.eu/eli/reg/2009/810/oj/eng',
    note: 'The travel document must be valid for at least three months beyond the intended date of departure. The same article requires it to have been issued within the previous 10 years.',
  },
  R02: {
    kind: 'consistency',
    cite: 'Biographic data must be identical across every document',
    note: 'No regulation states this, because it is not a rule — it is a defect. A name spelled two ways in one file is a contradiction an officer resolves against the applicant.',
  },
  R03: {
    kind: 'consistency',
    cite: 'Application form reference',
    note: 'The passport number on the form must match the passport it refers to. Internal to the file, so a mismatch is an error in the paperwork rather than a breach.',
  },
  R04: {
    kind: 'consistency',
    cite: 'Date disambiguation',
    note: 'A date like 05/06/2027 is either 5 June or 6 May. Where both readings are valid and different, Previsa says so rather than guessing which one was meant.',
  },
  R05: {
    kind: 'consistency',
    cite: 'Internal consistency',
    note: 'The trip dates on the application must match the dates on the bookings that support it. Two documents in one file disagreeing is a defect in the file.',
  },
  R05c: {
    kind: 'regulation',
    cite: 'Regulation (EC) No 810/2009, Art. 2(2)(a) and scope',
    link: 'https://eur-lex.europa.eu/eli/reg/2009/810/oj/eng',
    note: 'A short stay is no more than 90 days in any 180-day period. The 180 days are counted backwards from each day of the stay, so the window moves rather than being fixed.',
  },
  R06: {
    kind: 'guidance',
    cite: 'Consular appointment rules',
    note: 'Applications are commonly accepted up to six months before travel, and appointments are usually bookable no earlier than that. Practice, not statute, so it varies by post.',
  },
  R07: {
    kind: 'guidance',
    cite: 'Schengen consulate practice',
    note: 'Statements covering roughly the last three months are normally expected. No instrument fixes this period; it is what posts ask for in practice.',
  },
  R08: {
    kind: 'guidance',
    cite: 'Means-tested assessment',
    note: 'Funds are assessed against the declared cost of the trip. There is no published minimum balance for Schengen — officers judge whether the money plausibly covers the stated purpose.',
  },
  R09b: {
    kind: 'regulation',
    cite: 'Regulation (EC) No 810/2009, Art. 15(3)',
    link: 'https://eur-lex.europa.eu/eli/reg/2009/810/oj/eng',
    note: 'Insurance must cover the entire intended stay, with a minimum of EUR 30 000. Art. 15(2) requires multiple-entry applicants to cover at least their first intended visit.',
  },
  R10: {
    kind: 'guidance',
    cite: 'Ties to the country of residence',
    note: 'Employment is evidence of a reason to return. Assessed on its facts by a caseworker; nothing here is a pass or fail in itself.',
  },
  R11: {
    kind: 'guidance',
    cite: 'Form completeness',
    note: 'A form with mandatory fields blank is returned unprocessed. The field list follows the harmonised Schengen application form.',
  },
  R12: {
    kind: 'consistency',
    cite: 'Addresses must match within their role',
    note: 'Your home address must read the same wherever it is restated. Your address in the destination country is a different role and is compared separately — a hotel in Paris is not a contradiction of a home in India.',
  },
  R12b: {
    kind: 'guidance',
    cite: 'Accommodation must be in the destination country',
    note: 'Proof of accommodation is expected to be inside the territory being applied for. A booking elsewhere does not evidence where you will stay.',
  },
  R13: {
    kind: 'guidance',
    cite: 'Invitation letter content',
    note: 'A host letter is expected to identify the host, the dates and the address. Recent letters are preferred; an old one invites questions about whether the plan still holds.',
  },
  R14: {
    kind: 'guidance',
    cite: 'Travel history',
    note: 'Prior Schengen entries and a clean record help. Nothing here is determinative — it is context an officer weighs.',
  },
};

/** The authority for a rule id, or an honest 'none' for an unknown one. */
export function authorityFor(ruleId) {
  return SOURCES[ruleId] ?? {
    kind: AUTHORITY.consistency,
    cite: 'No authority recorded',
    note: 'This rule has no recorded source. Treat it as unverified.',
  };
}

/**
 * One-line source string for the compact report rows.
 *
 * Kept because findings carry a `source` field that the report renders directly,
 * and changing its shape would ripple through every component and test. The string
 * is now derived from the citation table so the two cannot drift apart.
 */
export function sourceLine(ruleId) {
  const a = authorityFor(ruleId);
  return a.cite;
}
