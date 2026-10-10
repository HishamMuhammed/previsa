// What each destination actually asks for.
//
// This lives in its own module because two things need the same list and they
// must not be allowed to disagree: R00 (the completeness rule, which decides
// pass/fail) and the destination checklist panel (which tells the applicant what
// to go and get, before anything has failed yet).
//
// When the lists were separate they would drift — a document added to the checklist
// but not to the rule would show as satisfied while still failing, and one added to
// the rule but not the checklist would fail with no advance warning. Both failures
// are silent and both look like the tool is wrong.
//
// Extracted from rules.js, where it was private to R00. The rule imports it from
// here rather than the reverse, so the data has no dependency on the engine.

/** Documents every application needs, whatever the destination. */
export const ALWAYS_REQUIRED = [
  ['passport', 'Passport bio page'],
  ['application', 'Signed application form'],
];

/** Documents required only for particular destinations. */
export const CONDITIONAL_DOCS = [
  ['schengen', [
    ['insurance', 'Travel medical insurance'],
    ['accommodation', 'Proof of accommodation'],
    ['bankStatement', 'Bank statement'],
    ['itinerary', 'Flight itinerary'],
  ]],
  ['uk', [
    ['bankStatement', 'Bank statement'],
    ['employment', 'Employment or study letter'],
    ['accommodation', 'Proof of accommodation'],
  ]],
  ['us', [
    ['itinerary', 'Flight itinerary'],
    ['employment', 'Employment letter'],
    ['bankStatement', 'Bank statement'],
  ]],
  // Canada and Australia are recognised by destinationKey() in rules.js. They were
  // missing here, which meant they silently received only the always-required list
  // — a quiet under-check, since a Canada file with no bank statement passed R00.
  // Lists follow the official checklists (IRCC Guide 5256 / IMM 5484, and the
  // Home Affairs subclass 600 pages), reduced to the documents this app can
  // actually read.
  ['canada', [
    ['bankStatement', 'Bank statement'],
    ['employment', 'Employment letter'],
    ['itinerary', 'Travel plans'],
  ]],
  ['australia', [
    ['bankStatement', 'Bank statement'],
    ['employment', 'Employment or enrolment letter'],
    ['itinerary', 'Travel plans'],
  ]],
];

/**
 * Human name for a destination key, for the checklist heading.
 *
 * Unknown keys fall through to a title-cased version of the key rather than to
 * Schengen. Defaulting an unrecognised destination to Schengen requirements is
 * exactly the silent-wrong-answer behaviour the destination routing fix removed
 * from the rule engine; the checklist must not reintroduce it.
 */
const DEST_NAME = {
  schengen: 'Schengen short-stay',
  uk: 'United Kingdom visitor',
  us: 'United States visitor',
  canada: 'Canada visitor',
  australia: 'Australia visitor',
};

export function destinationName(key) {
  return DEST_NAME[key] ?? String(key || 'unknown').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * The full requirement list for a destination: always-required plus that
 * destination's own, in a stable order.
 *
 * @param {string} destKey  normalised destination key
 * @returns {Array<{key:string,label:string,always:boolean}>}
 */
export function requirementsFor(destKey) {
  const conditional = CONDITIONAL_DOCS.find(([k]) => k === destKey)?.[1] ?? [];
  return [
    ...ALWAYS_REQUIRED.map(([key, label]) => ({ key, label, always: true })),
    ...conditional.map(([key, label]) => ({ key, label, always: false })),
  ];
}
