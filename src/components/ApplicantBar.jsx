// The multi-applicant bar: a family or group travelling together, each with their
// own documents, sharing one trip.
//
// The design rule is that the trip and meta are SHARED but docs are PER-APPLICANT.
// A family applying for Schengen together has one set of dates, one destination,
// one insurance policy — but each person has their own passport, bank statement
// and employment letter. Modelling it the other way (shared docs, per-applicant
// trips) would mean the same insurance policy appears four times and the date
// rules compare a passport against someone else's travel window.
//
// The bar sits at the top of the docs column, above the fix list. It is hidden
// entirely when there is only one applicant, so a solo user never sees it.
//
// Adding an applicant copies the current docs as a starting point, which is the
// behaviour someone preparing a family application wants: the passport and
// application form are similar enough to be a template, and the bank statement
// and insurance are different enough that they will be replaced.

import { useState } from 'react';

let nextId = 1;
const uid = () => `ap-${Date.now()}-${nextId++}`;

export default function ApplicantBar({ multi, actions, app }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const applicants = multi?.applicants ?? [];
  const selectedId = multi?.selectedId;

  if (applicants.length < 2) return null;

  const addApplicant = () => {
    const newName = name.trim() || `Applicant ${applicants.length + 1}`;
    // Copy the current applicant's docs as a starting point. The shared trip is
    // stamped on load by switchApplicant, so it is inherited automatically.
    const applicant = {
      id: uid(),
      name: newName,
      app: structuredClone(app),
    };
    actions.setApplicants([...applicants, applicant]);
    actions.switchApplicant(applicant.id);
    setNaming(false);
    setName('');
  };

  const removeApplicant = (id) => {
    const remaining = applicants.filter((a) => a.id !== id);
    if (!remaining.length) return;   // never let the list go empty
    actions.setApplicants(remaining);
    if (id === selectedId) actions.switchApplicant(remaining[0].id);
  };

  return (
    <div className="apbar">
      <div className="apbar-row" role="tablist" aria-label="Applicants">
      {applicants.map((a) => (
        <div key={a.id} className="apbar-item">
          <button
            type="button"
            role="tab"
            aria-selected={a.id === selectedId}
            className={`apbar-btn ${a.id === selectedId ? 'is-on' : ''}`}
            onClick={() => actions.switchApplicant(a.id)}
          >
            {a.name}
          </button>
          {applicants.length > 1 && (
            <button
              type="button"
              className="apbar-x"
              aria-label={`Remove ${a.name}`}
              onClick={() => removeApplicant(a.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {naming ? (
        <span className="apbar-form">
          <input
            className="apbar-input"
            value={name}
            autoFocus
            placeholder={`Applicant ${applicants.length + 1}`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addApplicant();
              if (e.key === 'Escape') { setNaming(false); setName(''); }
            }}
          />
          <button type="button" className="apbar-ok" onClick={addApplicant}>add</button>
        </span>
      ) : (
        <button type="button" className="apbar-add" onClick={() => setNaming(true)}>
          + Add applicant
        </button>
      )}

      </div>

      <p className="apbar-note">
        One trip, separate documents. Editing the dates or destination updates every applicant.
      </p>
    </div>
  );
}
