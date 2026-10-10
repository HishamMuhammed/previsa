# Preflight

Cross-checks every document in a visa application against every other one, and
explains each failure in terms of the two fields that disagree.

It runs entirely in the browser. There is no backend, no build step required to
understand it, and no document, photograph or extracted character ever leaves the
page. Upload a PDF and it is parsed in the tab; nothing is transmitted.

**It does not predict whether a visa will be approved, and must never be described
that way.** It finds inconsistencies, missing information and arithmetic that does
not add up. Whether an officer approves an application is not something a
spreadsheet of dates can know.

## Running it

    npm install
    npm run dev

    npm test          # 235 assertions across 11 suites
    npm run fuzz      # property-based fuzzer over the rules engine

## Architecture

    src/lib/          the entire engine, pure functions with no React or DOM
      dates.js        strict ISO/slash date parsing and arithmetic
      rules.js        20 deterministic cross-document checks
      extract.js      PDF text extraction
      formfields.js   positional extraction from filled application forms
      formvalue.js    checkbox and label normalisation
    src/derive.js     findings -> report, fix list, mismatch graph
    src/store.js      state, localStorage persistence
    src/components/   presentation only

The split matters: `src/lib/` is ~1,700 lines that can be tested, fuzzed and
audited without a browser, and every rule is a pure function from an application
object to a finding. Nothing in the engine knows the UI exists.

## The rules

Deterministic on purpose. Compliance errors are expensive and probabilistic advice
is not actionable, so each check names the two fields it compares and says which
one to change. A check that cannot decide answers `na` rather than guessing, and
`na` findings are counted separately in the UI so a silently-unrun check cannot be
mistaken for a clean pass.

Rules are routed by destination: a Schengen application gets the 90/180 rolling
window, a UK application gets longer-stay rules, a US application gets the
six-month club rule. The destination is resolved from
`trip.destinationCountry`, then free-text `meta.destination`, defaulting to
Schengen.

## OCR and extraction

Extraction is always a *suggestion*. Nothing extracted ever auto-fills a field:
every suggestion is shown with its confidence and the source line it came from,
and the applicant edits it and clicks Apply. A confident-looking wrong value that
the user did not inspect is the worst possible outcome, so the UI refuses to make
it possible.

pdf.js is vendored and lazy-loaded, so the main bundle stays small and the parser
is only fetched when a PDF is actually imported.

## Deployment

A static directory behind an nginx container, routed by Traefik labels on the
Coolify network:

    ./deploy/deploy.sh

No CDN dependency at runtime. Two things about the nginx config are worth knowing
before changing it: the pdf.js worker must be served as `text/javascript` (matched
by `.mjs` extension, because Vite rewrites its path into the hashed assets
directory at build time), and asset caching is immutable-by-hash while
`index.html` is `no-cache`.

## Honest limitations

- Reads text-layer PDFs well. Image-only scans are detected and reported as
  unreadable rather than guessed at.
- Positional form extraction is tuned to the Schengen family of application forms.
  It degrades to nothing on unfamiliar layouts rather than producing confident
  nonsense.
- The 20 rules cover the common failure modes, not the full rulebook of any
  single country.
- No legal advice. It is a consistency checker.
