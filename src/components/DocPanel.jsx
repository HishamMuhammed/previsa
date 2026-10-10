// The document list: one collapsible panel per document, each field editable
// in place.
//
// In the vanilla app every keystroke re-rendered this list from innerHTML, which
// destroyed the focused input. The fix was to capture and restore focus and caret
// around the re-render — twenty-odd lines of DOM-measuring code that existed only
// because React was not doing it. Here the inputs are stable DOM nodes that React
// updates in place, so focus and caret survive for free and that code is gone.

import { memo } from 'react';

/**
 * @param {string} docKey    document key, e.g. 'passport'
 * @param {object} doc       the document envelope from state.app.docs
 * @param {boolean} isOpen   whether the panel is expanded
 * @param {Set<string>} badFields  fields this document must fix (drives the red border)
 * @param {number} failCount how many fields need fixing
 */
const DocPanel = memo(function DocPanel({ docKey, doc, isOpen, badFields, failCount, highlight, onToggle, onEdit }) {
  return (
    <div className={`doc ${isOpen ? 'is-open' : ''}`} data-doc={docKey}>
      <div
        className="doc-h"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => onToggle(docKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(docKey);
          }
        }}
      >
        <span className="caret" aria-hidden="true">▶</span>
        <span className="doc-name">{doc.label}</span>
        <span className="doc-tag">{doc.tag || 'doc'}</span>
        {/* The count is derived from findings, so it is rendered as a child rather
            than interpolated into an HTML string. */}
        {failCount > 0 && (
          <span className="doc-badge db-fail">
            {failCount} {failCount === 1 ? 'field' : 'fields'} to fix
          </span>
        )}
      </div>
      {/* grid-template-rows 0fr -> 1fr collapses ONE track, so the fields are
          wrapped in .fields-inner > .fields-pad. The padding must live on
          .fields-pad, inside the clipped box, or 18px of it survives collapse. */}
      <div className="fields">
        <div className="fields-inner">
          <div className="fields-pad">
            {Object.entries(doc.fields).map(([field, value]) => {
              // The field the fix list pointed at gets a visible ring until the
              // user edits something, so the jump is not just a scroll.
              const isHot = highlight && highlight.doc === docKey && highlight.field === field;
              return (
                <div key={field} className={`field ${badFields.has(field) ? 'is-bad' : ''} ${isHot ? 'is-hot' : ''}`}>
                  <label htmlFor={`i-${docKey}-${field}`}>{field}</label>
                  <input
                    id={`i-${docKey}-${field}`}
                    value={value ?? ''}
                    onChange={(e) => onEdit(docKey, field, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default DocPanel;