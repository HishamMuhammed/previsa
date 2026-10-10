// Which document types may receive values extracted from a numbered visa form,
// and what those values are called once they land in a document.
//
// This is data, not UI, and both the app and the tests need it — so it lives here
// rather than inline in app.js. Extracting it also stops src/app.js's tables
// drifting from the tests that guard them.
//
// The rule this encodes: a Schengen application form is personal data. Offering
// its fields against a hotel booking writes an applicant's surname into a
// reservation, which then fails the name cross-check for a reason that has nothing
// to do with the reservation. So only the two documents that genuinely hold this
// data may receive it, and every other document type receives nothing at all.

/** Positional field names each document type legitimately owns. */
export const FORM_FIELD_OWNERS = {
  application: new Set(['surname', 'surnameAtBirth', 'firstNames', 'dateOfBirth',
    'placeOfBirth', 'countryOfBirth', 'nationality', 'sex', 'civilStatus',
    'documentType', 'passportNumber', 'issueDate', 'passportExpiry', 'issuedBy',
    'nationalId', 'homeAddress', 'occupation', 'employerName', 'employerAddress',
    'purposeOfJourney', 'mainDestination', 'firstEntry', 'entriesRequested',
    'durationDays', 'arrivalDate', 'departureDate', 'hostName', 'hostAddress',
    'costCoveredBy', 'priorVisas']),
  passport: new Set(['surname', 'surnameAtBirth', 'firstNames', 'dateOfBirth',
    'placeOfBirth', 'countryOfBirth', 'nationality', 'sex', 'passportNumber',
    'issueDate', 'passportExpiry', 'issuedBy', 'nationalId']),
};

/**
 * Positional field name -> the field name the document actually uses.
 * Only entries whose name differs between the form and Previsa's schema.
 */
export const FIELD_ALIASES = {
  firstNames: 'givenNames',
  dateOfBirth: 'dob',
  placeOfBirth: 'birthPlace',
  issuedBy: 'issuingAuthority',
  passportExpiry: 'expiryDate',
  passportNumber: 'passportNo',
};

/**
 * Positional field -> the field it means, when several schema fields are close
 * enough that guessing between them would be a coin flip. Anything not listed here
 * maps to its own name, and is then filtered out if the document does not have it.
 */
const AMBIGUOUS = {
  // The form asks for occupation AND employer; Previsa's application document
  // records the applicant's employer name in a single field.
  occupation: 'employerName',
  employerAddress: 'addressLine',
  homeAddress: 'addressLine',
  hostName: 'hostName',
  hostAddress: 'hostAddress',
  arrivalDate: 'arrivalDate',
  departureDate: 'departureDate',
};

/**
 * Filter positional suggestions down to the fields `doc` owns, rename them onto the
 * document's own field names, and drop any that the document does not actually
 * have.
 *
 * An unknown document type returns nothing: offering a surname to a document type
 * nobody has described is how a visa applicant's name ends up in a hotel booking.
 *
 * `available` is the document's real field list. Filtering against it is not
 * optional: the form carries thirty numbered fields and Previsa's application
 * document models sixteen. Without this, Apply would write nine phantom keys
 * (`surnameAtBirth`, `civilStatus`, `priorVisas`, ...) into the saved state — values
 * nothing reads, silently corrupting the export and lying about what was filled.
 *
 * @param {Array<{field:string,value:string}>} suggestions
 * @param {string} doc  document type key
 * @param {Iterable<string>|null} available  that document's real field names
 */
export function scopeToDocument(suggestions, doc, available = null) {
  const owned = FORM_FIELD_OWNERS[doc];
  if (!owned) return [];
  const real = available ? new Set(available) : null;

  const out = [];
  const seen = new Set();
  for (const s of suggestions) {
    if (!owned.has(s.field)) continue;
    const name = FIELD_ALIASES[s.field] ?? AMBIGUOUS[s.field] ?? s.field;
    if (real && !real.has(name)) continue;
    // Two form fields can map onto one schema field (occupation and employer both
    // becoming employerName). Keep the first and let the user correct it.
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ ...s, field: name });
  }
  return out;
}