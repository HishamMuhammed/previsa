// The fix list: one actionable row per field that needs changing.
//
// This is the payoff view. It is derived from the same findings the report renders,
// so it cannot disagree with the report — an earlier hand-written version listed
// fields independently and could show a fix the rules no longer flagged.
//
// Only 'fail' and 'warn' produce a row. A passing check must never paint a field
// red: that was a real bug where R12b, which passes, highlighted an innocent field.
//
// Rows are LINKS, not inputs. An earlier version rendered a second <input> for
// every field here, which caused three real problems:
//
//   1. It measured 1368px on a 633px viewport, pushing the document panels — the
//      part worth demonstrating — to 1808px, below the fold. The app was burying
//      its own best feature behind its most boring one.
//   2. Every one of those inputs duplicated the document panel's `id`, so the page
//      had 10 invalid duplicate IDs.
//   3. The <label for="..."> resolved to the FIRST match, so a screen reader
//      announced "Flight itineraryfareEURR08" as the label for a fare input.
//
// Clicking a row now jumps to the real field, opens its panel and highlights it.
// One input per field, one place to edit it.

export default function FixList({ rows, blocking, onGoTo }) {
  if (!rows.length) {
    return (
      <div className="fx-clear">
        <span className="fx-count fx-clear-label">Nothing to fix</span>
      </div>
    );
  }

  return (
    <div className="fx">
      <div className={`fx-clear ${blocking ? 'has' : ''}`}>
        <span className="fx-count">{rows.length} edit{rows.length === 1 ? '' : 's'} to make</span>
        <p className="fx-sub">
          {blocking > 0
            ? `${blocking} blocking error${blocking === 1 ? '' : 's'} — pick one and the document opens at the field.`
            : 'No blocking errors. Worth a look before you submit.'}
        </p>
      </div>
      <ul className="fx-list">
        {rows.map((r) => (
          <li key={`${r.doc}.${r.field}`} className={`fx-row ${r.status}`}>
            {/* A button, because it performs an action. Not a label+input: the
                input already exists once, in the document panel. */}
            <button
              type="button"
              className="fx-jump"
              onClick={() => onGoTo(r.doc, r.field)}
              aria-label={`Open ${r.docLabel ?? r.doc}, field ${r.field}. ${r.hint ?? ''}`}
            >
              <span className="fx-doc">{r.docTag ?? r.doc}</span>
              <span className="fx-field">{r.field}</span>
              <span className="rid">{r.id}</span>
              <span className="fx-go" aria-hidden="true">→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}