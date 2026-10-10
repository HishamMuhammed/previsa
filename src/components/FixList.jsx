// The fix list: one actionable row per field that needs changing.
//
// This is the payoff view. It is derived from the same findings the report renders,
// so it cannot disagree with the report — an earlier hand-written version listed
// fields independently and could show a fix the rules no longer flagged.
//
// Only 'fail' and 'warn' produce a row. A passing check must never paint a field
// red: that was a real bug where R12b, which passes, highlighted an innocent field.

export default function FixList({ rows, blocking }) {
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
            ? `${blocking} blocking error${blocking === 1 ? '' : 's'} — work down the list and the count drops as you type.`
            : 'No blocking errors. Worth a look before you submit.'}
        </p>
      </div>
      <ul className="fx-list">
        {rows.map((r) => (
          <li key={`${r.doc}.${r.field}`} className={`fx-row ${r.status}`}>
            <label htmlFor={`i-${r.doc}-${r.field}`}>
              <span className="fx-doc">{r.docLabel ?? r.doc}</span>
              <span className="fx-field">{r.field}</span>
              <span className="rid">{r.id}</span>
            </label>
            <input
              id={`i-${r.doc}-${r.field}`}
              value={r.value ?? ''}
              onChange={(e) => r.onEdit(r.doc, r.field, e.target.value)}
            />
            {r.hint ? <p className="fx-hint">{r.hint}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}