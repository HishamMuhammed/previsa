// Preflight rule engine.
//
// Every rule is a pure function (app, check) -> one or more findings. No model, no
// network, no randomness: the same application always produces the same report, and
// every finding names the rule that produced it so an applicant can argue with it.
//
// Status vocabulary:
//   fail  - will very likely cause a refusal or a request for corrected documents
//   warn  - a real inconsistency or a rule that trips on edge cases
//   pass  - checked, consistent, no action needed
//   na    - could not be evaluated because a field it needs is missing or malformed

import {
  DAY, iso, fromSlash, daysBetween, addMonths, human, eachDay,
  isSlash, isGenuinelyAmbiguous, normNameKey, normKey, normAddr, money,
} from './dates.js';

const blank = (v) => v == null || String(v).trim() === '';
const num = (v) => {
  if (blank(v)) return null;
  const s = String(v).replace(/[^0-9.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const f = (id, status, title, detail, fix, source) => ({ id, status, title, detail, fix, source });
const nf = (id, status, title, detail, source) => ({ id, status, title, detail, source });

/** Canonical read of a slash-form date using the declared order. */
/**
 * Canonical read of any date field.
 *
 * Always returns an ISO "yyyy-mm-dd" STRING, never epoch ms. It previously
 * returned ms for ISO input and a string for slash input, so two dates written
 * the same day in different formats could never compare equal — R05 failed
 * forever on a file that was actually correct. One type out of one function.
 */
const readDate = (app, v) => {
  const order = app.meta?.dateOrder === 'mdy' ? 'mdy' : 'dmy';
  if (blank(v)) return { value: null, blank: true };
  if (isSlash(v)) {
    const s = fromSlash(v, order);
    return { value: s, ambiguous: isGenuinelyAmbiguous(v) };
  }
  const t = iso(v);
  return { value: t == null ? null : new Date(t).toISOString().slice(0, 10) };
};

// ---------------------------------------------------------------- 01
function passportExpiry(app) {
  const out = [];
  const rules = {
    schengen: { months: 3, label: 'Schengen short-stay (EU 810/2008 Art. 12)' },
    'uk': { months: 6, label: 'UK (long-stay rules differ; this is the 6-month guidance)' },
    'us': { months: 6, label: 'United States (six-month club rule)' },
    'canada': { months: 0, label: 'Canada (must be valid at entry)' },
    'australia': { months: 6, label: 'Australia (must stay valid for the stay)' },
  };
  const dest = destinationKey(app);
  const rule = rules[dest] || rules.schengen;
  const exp = iso(app.docs.passport.fields.expiryDate);
  if (!exp) {
    return [nf('R01', 'na', 'Passport validity vs your travel dates',
      `Passport expiry is "${app.docs.passport.fields.expiryDate ?? 'missing'}" — cannot be compared.`, rule.label)];
  }
  const arrival = iso(app.trip.arrivalDate);
  if (!arrival) {
    return [nf('R01', 'na', 'Passport validity vs your travel dates', 'Arrival date is missing or malformed.', rule.label)];
  }
  const need = addMonths(app.trip.arrivalDate, rule.months);
  // daysBetween(need, expiry) > 0 means the passport outlives the requirement.
  const margin = daysBetween(need, app.passport.fields.expiryDate);
  const ok = margin >= 0;
  out.push(f('R01', ok ? 'pass' : 'fail',
    `Passport valid ${rule.months} months beyond arrival`,
    `Arrival ${human(app.trip.arrivalDate)}. Passport expires ${human(app.passport.fields.expiryDate)}. ` +
    (rule.months
      ? `${rule.label} requires expiry on or after ${human(need)}. `
        + (ok ? `Yours clears that by ${margin} day(s).` : `Yours falls ${Math.abs(margin)} day(s) short.`)
      : 'Must still be valid on the day you land.'),
    ok
      ? `Expires ${human(app.passport.fields.expiryDate)}. Margin over the requirement: ${margin} day(s).`
      : 'This is a refusal risk in almost every consulate. Renew the passport first; do not submit an application on a short-validity passport.',
    rule.label));
  return out;
}

// ---------------------------------------------------------------- 02
function nameConsistency(app) {
  const out = [];
  const passport = app.passport.fields;
  const canon = normNameKey(passport.fullName);
  const pfam = normNameKey(passport.surname);
  const rows = [];
  // hostName is the HOST's name, not the applicant's — excluding it here stops
  // the host letter being "corrected" to the applicant's surname, which would be
  // both a false positive and the more serious error: a visa file that names the
  // wrong host.
  const APPLICANT_NAME_FIELDS = ['fullName', 'passengerName', 'guestName', 'employeeName', 'accountHolder', 'policyHolder'];
  for (const [key, fields] of Object.entries(app.docs)) {
    if (key === 'passport' || key === 'hostLetter') continue;
    const nk = APPLICANT_NAME_FIELDS.map((k) => fields[k]).find((v) => !blank(v));
    if (blank(nk)) continue;
    rows.push({ doc: key, label: app.docs[key].label, raw: String(nk).trim(), key: normNameKey(nk) });
  }
  const bad = rows.filter((r) => r.key !== canon);
  if (bad.length) {
    const detail = `Passport reads "${passport.fullName}". ` + bad.map((r) =>
      `${r.label} reads "${r.raw}" — the initials and given names do not reconcile with the passport (${canon}).`).join(' ');
    out.push(f('R02', 'fail', 'Name spelled inconsistently across your documents', detail,
      `Make every document read exactly as the passport bio page: "${passport.fullName}". Do not add or drop middle names, and do not invent initials that the passport does not carry. Consular officers match on surnames first.`,
      'Biographic data must be identical across the application and all supporting documents'));
  } else {
    out.push(f('R02', 'pass', 'Name spelled consistently across all documents',
      `${rows.length} document(s) reconciled with the passport bio page.`, `Key: ${canon}`, 'Biographic consistency'));
  }
  // Surname check: only documents that assert the APPLICANT's name. The host
  // letter states the host's name, which is legitimately a different person.
  const HOST_ONLY = ['hostLetter'];
  const fam = rows.filter((r) => {
    if (HOST_ONLY.includes(r.doc)) return false;
    const parts = normNameKey(r.raw).split(' ').filter(Boolean);
    return pfam && !parts.includes(pfam);
  });
  for (const r of fam) {
    out.push(f('R02b', 'fail', 'Surname missing or altered',
      `${r.label} shows "${r.raw}" but the passport surname is "${passport.surname}".`,
      `Add the surname exactly as printed: ${passport.surname}.`, 'Surname must match the passport'));
  }
  return out;
}

// ---------------------------------------------------------------- 03
function passportNumber(app) {
  const p = normKey(app.passport.fields.passportNo);
  if (!p) return [nf('R03', 'na', 'Passport number cross-check', 'Passport number is missing.', 'Application form reference')];
  const rows = [];
  for (const [key, fields] of Object.entries(app.docs)) {
    if (key === 'passport') continue;
    const v = fields.passportNo;
    if (blank(v)) continue;
    rows.push({ label: app.docs[key].label, raw: String(v).trim(), ok: normKey(v) === p });
  }
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    return [f('R03', 'fail', 'Passport number does not match the application',
      `Passport bio page reads ${app.passport.fields.passportNo}; ` +
      bad.map((r) => `${r.label} reads ${r.raw}`).join('; ') +
      `. The application form is the one that must be corrected.`,
      `Re-type the passport number on the form as ${app.passport.fields.passportNo}. A transposed digit here reads as a fraudulent application rather than a typo.`,
      'Passport number on the form must match the machine-readable bio page')];
  }
  return [f('R03', 'pass', 'Passport number matches across documents',
    `${rows.length} place(s) checked against ${app.passport.fields.passportNo}.`, '', 'Application form reference')];
}

// ---------------------------------------------------------------- 04
function dateAmbiguity(app) {
  const out = [];
  const hits = [];
  for (const [key, fields] of Object.entries(app.docs)) {
    for (const [fk, fv] of Object.entries(fields)) {
      if (isSlash(fv) && isGenuinelyAmbiguous(fv)) {
        hits.push({ doc: app.docs[key].label, field: fk, raw: String(fv).trim() });
      }
    }
  }
  if (hits.length) {
    out.push(f('R04', 'fail', 'Ambiguous numeric dates',
      hits.map((h) => `${h.doc} · ${h.field}: "${h.raw}"`).join('; ') +
      `. Preflight is reading these as ${app.meta?.dateOrder === 'mdy' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'}, but both readings are valid and they are not the same day. An officer who reads it the other way sees a different travel date, which then contradicts the rest of your file.`,
      'Rewrite every numeric date as 14 Feb 2027 or 2027-02-14. Never leave a bare slash date in a visa file.',
      'ISO 8601 or spelled-out months remove all ambiguity'));
  } else {
    out.push(f('R04', 'pass', 'No ambiguous numeric dates',
      'Every date in the file is either ISO-formatted or unambiguous.', '', 'Date disambiguation'));
  }
  return out;
}

// ---------------------------------------------------------------- 05
function tripDateConsistency(app) {
  const out = [];
  // The trip dates may be slash-form, so they are validated with readDate (which
  // honours the declared order) rather than iso(), which only accepts ISO. A
  // perfectly good "14/02/2027" was degrading this rule to `na`.
  const arrN0 = readDate(app, app.trip.arrivalDate).value;
  const depN0 = readDate(app, app.trip.departureDate).value;
  const arr = arrN0 == null ? null : arrN0;
  const dep = depN0 == null ? null : depN0;
  if (!arr || !dep) return [nf('R05', 'na', 'Itinerary dates vs the application', 'Trip dates are missing or malformed.', 'Internal consistency')];
  // Compare in ISO-string space, not epoch: readDate returns strings.
  // Compare NORMALISED dates, not raw strings. The declared trip can be written
  // "14/02/2027" while a booking says "2027-02-14" — the same day, but never
  // equal as strings, so the rule failed forever on a file that was actually
  // correct. Both sides now go through readDate.
  const arrN = readDate(app, app.trip.arrivalDate).value;
  const depN = readDate(app, app.trip.departureDate).value;
  const arrS = app.trip.arrivalDate, depS = app.trip.departureDate;
  const rows = [];
  for (const [key, pair] of Object.entries({
    itinerary: ['outboundArr', 'returnArr'],
    accommodation: ['checkIn', 'checkOut'],
    hostLetter: ['arrivalDate', 'departureDate'],
    application: ['arrivalDate', 'departureDate'],
  })) {
    const ci = readDate(app, app.docs[key].fields[pair[0]]).value;
    const co = readDate(app, app.docs[key].fields[pair[1]]).value;
    if (!ci || !co) continue;
    rows.push({ label: app.docs[key].label, ci, co });
  }
  const bad = rows.filter((r) => r.ci !== arrN || r.co !== depN);
  if (bad.length) {
    out.push(f('R05', 'fail', 'Booking dates disagree with your declared travel dates',
      `You declared ${human(arrS)} to ${human(depS)}. ` + bad.map((r) =>
        `${r.label} says ${human(r.ci)} to ${human(r.co)}.`).join(' '),
      'Every booking in the file must cover exactly the same window you declared. Fix the bookings, not the declaration.', 'Internal consistency'));
  } else {
    out.push(f('R05', 'pass', 'All bookings match your declared travel dates',
      `${rows.length} document(s) cover ${human(arrS)} to ${human(depS)} exactly.`, '', 'Internal consistency'));
  }
  const len = daysBetween(arrS, depS);
  if (Number.isFinite(len) && len < 0) out.push(f('R05b', 'fail', 'Departure precedes arrival', 'Your departure date is before your arrival date.', 'Fix the trip dates.', 'Internal consistency'));
  // The 90-in-180 allowance is computed in schengenRollingWindow(), not here:
  // it needs the prior-stay history, not just this trip's length.
  return out;
}

/**
 * Schengen 90-in-180.
 *
 * The previous version checked only the length of the declared trip and quoted
 * the rolling-window rule in passing. That asserts a rule the tool then fails to
 * honour: someone who spent 60 days in the Schengen area this year can be
 * refused for a 40-day trip, and this said nothing. The rule now computes the
 * actual rolling window over every day of every prior stay plus the new one.
 */
function schengenRollingWindow(app) {
  const out = [];
  if (destinationKey(app) !== 'schengen') {
    return [nf('R05c', 'na', 'Schengen 90/180 allowance',
      'Not a Schengen short-stay application, so the 90/180 allowance does not apply.',
      'EU 810/2008 Art. 15')];
  }
  const arrS = app.trip.arrivalDate, depS = app.trip.departureDate;
  const arrival = iso(arrS), departure = iso(depS);
  if (!arrival || !departure || departure < arrival) {
    return [nf('R05c', 'na', 'Schengen 90/180 allowance',
      'Travel dates are missing or malformed.', 'EU 810/2008 Art. 15')];
  }

  // Prior stays: [{from, to}] as ISO strings. iso() returns epoch ms, but
  // eachDay() takes ISO strings — passing the parsed value on made every stay
  // look malformed and silently counted as zero days spent, which is precisely
  // the error this rule exists to prevent.
  const prior = Array.isArray(app.meta.priorTrips) ? app.meta.priorTrips : [];
  const priorDays = new Set();
  const skipped = [];
  for (const t of prior) {
    const fromS = t?.from, toS = t?.to ?? t?.from;
    if (iso(fromS) == null || iso(toS) == null || iso(toS) < iso(fromS)) {
      skipped.push(t?.label ?? 'an unnamed stay');
      continue;
    }
    for (const d of eachDay(fromS, toS)) priorDays.add(d);
  }

  const newDays = eachDay(arrS, depS);
  const newCount = newDays.size;
  const stayDays = daysBetween(arrS, depS);

  // The rolling window: the 180-day period ending on the last day of the stay.
  // Checking only forward from arrival misses days already burned earlier in the
  // window, which is exactly where a refusal comes from.
  const windowStart = departure - (180 - 1) * DAY;
  let inWindowPrior = 0;
  for (const d of priorDays) {
    const t = Date.parse(d);
    if (t >= windowStart && t <= departure) inWindowPrior++;
  }
  const priorInWindow = inWindowPrior;
  const totalInWindow = priorInWindow + newCount;

  if (totalInWindow > 90) {
    const detail = `This trip adds ${newCount} day(s) to ${priorInWindow} already spent in the Schengen area `
      + `inside the 180 days ending ${human(depS)}: ${totalInWindow} of 90 used.`
      + (skipped.length ? ` ${skipped.length} prior stay(s) could not be read and were ignored.` : '');
    out.push(f('R05c', 'fail', 'Exceeds the 90-day Schengen allowance',
      detail,
      'Shorten this trip, drop a prior stay from the same window, or apply for a long-stay visa instead. A second short-stay visa cannot reset the allowance.', 'EU 810/2008 Art. 15'));
  } else if (stayDays > 90) {
    out.push(f('R05c', 'warn', 'Stay exceeds 90 days in the Schengen area',
      `Your declared stay is ${stayDays} days, which exceeds a short-stay visa regardless of history.`,
      'If this is genuinely a long stay, you need a different visa type, not a short-stay application.', 'EU 810/2008 Art. 15'));
  } else if (totalInWindow > 75) {
    out.push(f('R05c', 'warn', `Only ${90 - totalInWindow} day(s) of Schengen allowance left after this trip`,
      `${totalInWindow} of 90 days used in the 180 days ending ${human(depS)}.`,
      'A further trip inside that window could be refused. Plan accordingly.', 'EU 810/2008 Art. 15'));
  } else {
    out.push(f('R05c', 'pass', 'Within the 90-day Schengen allowance',
      `${totalInWindow} of 90 days used in the 180 days ending ${human(depS)} `
      + `(${newCount} this trip, ${priorInWindow} earlier).`
      + (skipped.length ? ` ${skipped.length} prior stay(s) could not be read.` : ''),
      '', 'EU 810/2008 Art. 15'));
  }
  return out;
}

// ---------------------------------------------------------------- 06
function applicationWindow(app) {
  const arr = iso(app.trip.arrivalDate);
  const sub = iso(app.docs.application.fields.submissionDate) || iso(app.meta.submissionDate);
  if (!arr) return [nf('R06', 'na', 'Application timing', 'Arrival date is missing.', 'Consular appointment rules')];
  if (!sub) return [nf('R06', 'na', 'Application timing',
    'No submission date on the application. Preflight cannot check how early you applied.', 'Many consulates accept applications up to six months before travel')];
  const d = daysBetween(sub, arr);
  if (!Number.isFinite(d)) return [nf('R06', 'na', 'Application timing',
    'Submission or arrival date could not be compared as a date.', 'Many consulates accept applications up to six months before travel')];
  if (d < 0) return [f('R06', 'fail', 'Arrival date is in the past', `You declared arrival on ${human(arr)} but the application is dated ${human(sub)}.`, 'Correct the dates.', 'Internal consistency')];
  if (d > 180) return [f('R06', 'fail', 'Applied too far in advance',
    `Your application is ${d} days before arrival. Most consulates accept applications at most six months (180 days) before travel and will refuse an earlier filing as premature.`,
    'File within 180 days of travel. Earlier does not mean faster.', 'Many consulates accept applications up to six months before travel')];
  if (d > 150) return [f('R06', 'warn', 'Close to the early-filing limit', `You filed ${d} days before arrival; the practical limit is 180.`, 'Expect to wait — this is the long end of the window.', 'Many consulates accept applications up to six months before travel')];
  return [f('R06', 'pass', 'Application filed inside the acceptable window', `${d} days before arrival, within the 180-day limit.`, '', 'Many consulates accept applications up to six months before travel')];
}

// ---------------------------------------------------------------- 07
function bankStatementAge(app) {
  const out = [];
  const dest = destinationKey(app);
  const limit = { schengen: 3, uk: 1, us: 2, canada: 0, australia: 1 }[dest] ?? 3;
  const label = { schengen: 'Schengen consulates commonly require statements covering the last three months',
    uk: 'UK requires statements within one month of submission', us: 'US requires statements covering the previous two months',
    canada: 'no fixed age, but stale statements are questioned', australia: 'Australia expects statements within one month' }[dest] ?? 'Consulate-specific statement age rules';
  const sub = iso(app.meta.submissionDate);
  const rows = [];
  for (const [key, fields] of Object.entries(app.docs)) {
    if (fields.statementDate == null) continue;
    const d = iso(fields.statementDate);
    if (!d || !sub) continue;
    const age = daysBetween(fields.statementDate, app.meta.submissionDate);
    if (!Number.isFinite(age)) continue;
    rows.push({ label: app.docs[key].label, date: fields.statementDate, age });
  }
  for (const r of rows) {
    const maxDays = limit * 31;
    if (r.age > maxDays) {
      out.push(f('R07', 'fail', 'Bank statement too old',
        `${r.label} is dated ${human(r.date)}, ${r.age} days before submission. ${label}.`,
        `Request a fresh statement. A statement older than the required window is one of the most common reasons a consulate asks for resubmission, and it costs you another fortnight.`, label));
    } else if (r.age < 0) {
      out.push(f('R07', 'fail', 'Bank statement dated in the future', `${r.label} is dated ${human(r.date)}, after the submission date.`, 'Reissue the statement.', label));
    }
  }
  if (!rows.length) out.push(nf('R07', 'na', 'Bank statement age', 'No statement date found.', label));
  else if (!out.length) out.push(f('R07', 'pass', 'Bank statement is inside the required window',
    `Checked ${rows.map((r) => `${r.label} (${r.age}d old)`).join(', ')}.`, '', label));
  return out;
}

// ---------------------------------------------------------------- 08
function fundsCoverage(app) {
  const costs = [];
  for (const [key, fields] of Object.entries(app.docs)) {
    for (const [fk, fv] of Object.entries(fields)) {
      if (/fare|total|support|salary/i.test(fk) && num(fv) != null) costs.push({ label: app.docs[key].label, field: fk, v: num(fv) });
    }
  }
  const bal = pickNum(app.docs.bankStatement?.fields, ['closingBalanceEUR', 'closingBalance', 'balanceEUR', 'balance']);
  if (bal == null) return [nf('R08', 'na', 'Funds vs declared trip cost', 'No closing balance found.', 'Consulates want funds on top of the trip cost')];
  const declared = num(app.trip.declaredCostEUR) ?? costs.reduce((s, c) => s + c.v, 0);
  if (!declared) return [nf('R08', 'na', 'Funds vs declared trip cost', 'No declared or itemised trip cost to compare against.', 'Consulates want funds on top of the trip cost')];
  const ratio = bal / declared;
  const detail = `Closing balance ${money(bal)} against a declared trip cost of ${money(declared)}. ` +
    `Costs found in the file: ${costs.map((c) => `${c.label}·${c.field} ${money(c.v)}`).join(', ') || 'none'}.`;
  if (bal < declared) return [f('R08', 'fail', 'Balance does not cover the trip', detail + ' You are short.',
    'Either reduce the declared cost to match reality, or top up the account before applying and reissue the statement.', 'Means-tested applications')];
  if (ratio < 1.5) return [f('R08', 'warn', 'Balance barely covers the declared cost', detail + ` That is only ${ratio.toFixed(2)}x cover.`,
    'Aim for roughly 1.5-2x the declared cost, or reduce the declared cost. Consulates read a thin balance as a plan to overstay.', 'Means-tested applications')];
  return [f('R08', 'pass', 'Balance covers the declared trip cost', detail + ` That is ${ratio.toFixed(2)}x cover.`, '', 'Means-tested applications')];
}

// ---------------------------------------------------------------- 09
function insuranceCoverage(app) {
  const ins = app.docs.insurance?.fields ?? {};
  const cov = num(ins.coverageEUR);
  const med = num(ins.medicalCoverEUR);
  if (cov == null && med == null) return [nf('R09', 'na', 'Travel insurance', 'No policy found.', 'Schengen requires EUR 30,000 medical cover')];
  const out = [];
  const need = 30000;
  const eff = num(med ?? cov);
  if (eff < need) out.push(f('R09', 'fail', 'Medical cover below EUR 30,000',
    `Policy covers ${money(eff)}. The Schengen requirement is ${money(need)}.`, 'Buy a policy meeting the requirement or your application will be refused on the spot.', 'Schengen visa code: minimum EUR 30,000'));
  const arr = iso(app.trip.arrivalDate), dep = iso(app.trip.departureDate);
  const s = iso(ins.startDate), e = iso(ins.endDate);
  if (s && e && arr && dep) {
    if (daysBetween(s, arr) >= 0 && daysBetween(dep, e) >= 0) {
      out.push(f('R09b', 'pass', 'Insurance covers the whole stay', `${human(ins.startDate)} to ${human(ins.endDate)} brackets ${human(arr)} to ${human(dep)}.`, '', 'Cover must span arrival to departure'));
    } else {
      out.push(f('R09b', 'fail', 'Insurance does not cover the whole stay',
        `Policy runs ${human(s)} to ${human(e)}; travel is ${human(arr)} to ${human(dep)}. ` +
        (daysBetween(s, arr) >= 0 ? `Arrival is ${daysBetween(arr, s)} day(s) before cover starts. ` : '') +
        (daysBetween(dep, e) >= 0 ? '' : `Departure is ${daysBetween(e, dep)} day(s) after cover ends.`),
        'Extend the policy. An uncovered day in the middle of a trip is a refusal risk, not a technicality.', 'Cover must span arrival to departure'));
    }
  }
  if (!out.some((o) => o.id === 'R09b')) out.push(f('R09b', 'na', 'Insurance dates', 'Policy dates missing or malformed.', 'Cover must span arrival to departure'));
  return out;
}

// ---------------------------------------------------------------- 10
function employmentGaps(app) {
  const out = [];
  const emp = app.docs.employment?.fields ?? {};
  const joined = iso(emp.dateOfJoining);
  if (!joined) return [nf('R10', 'na', 'Employment history', 'No joining date found.', 'Unexplained gaps in the travel window are questioned')];
  const arr = iso(app.trip.arrivalDate);
  if (!arr) return [nf('R10', 'na', 'Employment history', 'Arrival date missing.', 'Unexplained gaps in the travel window are questioned')];
  // daysBetween(joined, arrival) is positive when you joined BEFORE travelling.
  const tenure = daysBetween(emp.dateOfJoining, app.trip.arrivalDate);
  if (!Number.isFinite(tenure)) return [nf('R10', 'na', 'Employment history', 'Joining and arrival dates could not be compared.', 'Unexplained gaps in the travel window are questioned')];
  if (tenure < 0) {
    out.push(f('R10', 'fail', 'Employment begins after your arrival date',
      `Joined ${human(emp.dateOfJoining)} but arriving ${human(app.trip.arrivalDate)} — you cannot take leave from a job you have not started.`,
      'Correct one of the two dates.', 'Internal consistency'));
  } else if (tenure / 365 < 0.5) {
    out.push(f('R10', 'warn', 'Short employment history',
      `Joined ${human(emp.dateOfJoining)}, ${Math.round(tenure)} day(s) before travel — under six months of service.`,
      'Expect questions. Attach your previous employment or a detailed explanation.', 'Unstable employment invites scrutiny'));
  } else {
    out.push(f('R10', 'pass', 'Employment covers the travel window',
      `Joined ${human(emp.dateOfJoining)}, ${Math.round(tenure)} days before travel.`, '', 'Ties you to a reason to return'));
  }
  if (String(emp.approvedLeave).toLowerCase() === 'yes' && arr) {
    const l = iso(emp.leavePeriod);
    if (l && daysBetween(l, arr) >= 0) out.push(f('R10b', 'warn', 'Approved leave does not cover your arrival',
      `Leave runs from ${human(l)}, which is ${daysBetween(arr, l)} day(s) after you land.`, 'Reconcile the leave letter with the itinerary.', 'Internal consistency'));
  }
  return out;
}

// ---------------------------------------------------------------- 11
function requiredFields(app) {
  const out = [];
  const req = {
    application: ['surname', 'givenNames', 'nationality', 'dob', 'passportNo', 'arrivalDate', 'departureDate', 'addressLine', 'usPurpose'],
    passport: ['fullName', 'dob', 'passportNo', 'nationality', 'issueDate', 'expiryDate'],
    accommodation: ['addressLine', 'addressCountry'],
  };
  for (const [key, fields] of Object.entries(req)) {
    const missing = fields.filter((k) => blank(app.docs[key]?.fields?.[k]));
    if (!missing.length) continue;
    out.push(f('R11', 'fail', `Required field${missing.length > 1 ? 's' : ''} missing on the ${app.docs[key].label}`,
      `Missing: ${missing.join(', ')}.`, 'Fill these in — an incomplete form is returned unprocessed and you lose the fee.',
      'Form completeness'));
  }
  if (!out.length) out.push(f('R11', 'pass', 'All required fields present', 'Checked application, passport and accommodation records.', '', 'Form completeness'));
  return out;
}

// ---------------------------------------------------------------- 12
// Addresses play two distinct roles in an application and must NOT be compared
// across roles: your home address is in India, your Paris hotel is in France, and
// that difference is correct. Only documents asserting the SAME role must agree.
const HOME_DOCS = ['application', 'employment', 'bankStatement'];
const DEST_DOCS = ['accommodation', 'hostLetter'];

function addressConsistency(app) {
  const out = [];
  const addrOf = (fields) => fields?.addressLine ?? fields?.hostAddress;
  const groups = [
    { name: 'home address', docs: HOME_DOCS, hint: 'Your home address must appear identically wherever it is restated.' },
    { name: 'destination address', docs: DEST_DOCS, hint: 'Your address in the destination country must appear identically wherever it is restated.' },
  ];
  let compared = 0;
  for (const grp of groups) {
    const vals = [];
    for (const key of grp.docs) {
      const a = addrOf(app.docs[key]?.fields);
      if (!blank(a)) vals.push({ label: app.docs[key].label, raw: String(a).trim(), k: normAddr(a) });
    }
    if (vals.length < 2) continue;
    compared++;
    const byFormat = new Map();
    for (const v of vals) { if (!byFormat.has(v.k)) byFormat.set(v.k, []); byFormat.get(v.k).push(v.label); }
    if (byFormat.size > 1) {
      out.push(f('R12', 'fail', `${grp.name[0].toUpperCase()}${grp.name.slice(1)} written in different formats`,
        [...byFormat.entries()].map(([, ls]) => ls.join(' and ')).join('; ') +
        ` state the same ${grp.name} differently. Consular officers compare addresses by eye, and a mismatch here reads as sloppiness across the whole file.`,
        `${grp.hint} Pick one canonical form and use it everywhere, punctuation included.`, 'Address must be consistent'));
    } else {
      out.push(f('R12', 'pass', `${grp.name[0].toUpperCase()}${grp.name.slice(1)} is consistent`,
        `${vals.length} documents agree on one format.`, '', 'Address must be consistent'));
    }
  }
  if (!compared) out.push(nf('R12', 'na', 'Address format across documents', 'Not enough addresses within the same role to compare.', 'Addresses must match within their role'));

  const home = app.docs.application?.fields?.addressCountry;
  const acc = app.docs.accommodation?.fields?.addressCountry;
  if (!blank(home) && !blank(acc) && normKey(home) === normKey(acc)) {
    out.push(f('R12b', 'fail', 'Accommodation address looks like your home address',
      `Both the application home address and the booking are in ${home}. A booking in your country of residence is not accommodation for a foreign trip.`,
      'The booking must be in your destination country. A same-country booking is one of the most cited reasons for a Schengen refusal.', 'Accommodation must be in the destination country'));
  } else if (!blank(home) && !blank(acc)) {
    out.push(f('R12b', 'pass', 'Accommodation is in the destination country', `Booking in ${acc}, home in ${home}.`, '', 'Accommodation must be in the destination country'));
  } else {
    out.push(nf('R12b', 'na', 'Accommodation country', 'Home or accommodation country missing.', 'Accommodation must be in the destination country'));
  }
  return out;
}

// ---------------------------------------------------------------- 13
function hostLetterSupport(app) {
  const hl = app.docs.hostLetter?.fields ?? {};
  const need = {
    hostName: 'host\'s name', hostPassportNo: 'host\'s passport or ID number',
    hostAddress: 'host\'s address', arrivalDate: 'your arrival date',
    departureDate: 'your departure date', signedDate: 'date the letter was signed',
  };
  const missing = Object.entries(need).filter(([k]) => blank(hl[k])).map(([k, v]) => v);
  if (!app.docs.hostLetter) return [];
  if (missing.length) return [f('R13', 'fail', 'Host invitation letter is missing required details',
    `The letter omits: ${missing.join(', ')}.`, 'Add them. An incomplete host letter is treated as no host letter at all.', 'Invitation letters must identify host, dates and address')];
  const out = [f('R13', 'pass', 'Host letter carries the required details', `Host ${hl.hostName}, ${hl.hostAddress}.`, '', 'Invitation letters must identify host, dates and address')];
  const sig = iso(hl.signedDate), sub = iso(app.meta.submissionDate);
  if (sig && sub && daysBetween(sig, sub) > 90) out.push(f('R13b', 'warn', 'Host letter is stale',
    `Signed ${human(hl.signedDate)}, ${daysBetween(hl.signedDate, app.meta.submissionDate)} days before submission.`,
    'Have the host sign a fresh one.', 'Recent invitation letters are expected'));
  return out;
}

// ---------------------------------------------------------------- 14
function priorVisaHistory(app) {
  const prev = String(app.docs.application.fields.previousStay ?? '');
  const schengen = /schengen|schengen-area/i.test(app.docs.application.fields.destination || '')
    || /schengen/i.test(app.trip.destination || '');
  if (!schengen) return [];
  if (blank(prev)) return [f('R14', 'fail', 'No prior Schengen history recorded',
    'You are applying for a first Schengen visa. That is allowed, but the field must be completed explicitly.',
    'Leave prior visits blank only if truly none — write "None" so the blank is a statement rather than an oversight.', 'Entry history is a mandatory field')];
  const years = (prev.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  const age = Math.max(...years.map((y) => 2026 - y));
  if (age >= 4) return [f('R14b', 'warn', 'Last Schengen visit was over four years ago',
    `Your last recorded entry: ${prev}. An expired history means no visa-run advantage and no residual permissions.`,
    'A clean record still helps. Nothing to fix.', 'Long-dormant applicants attract closer scrutiny')];
  return [f('R14b', 'pass', 'Prior Schengen history recorded', prev, '', 'Entry history is a mandatory field')];
}

// ---------------------------------------------------------------- R00
// Document completeness.
//
// This rule exists because of a measured failure of every other rule. Given an
// application containing only a passport, the engine produced 3 passes and 12
// 'na' findings — and NOT ONE of them said "you have not provided a bank
// statement". The missing documents were invisible: each rule that needed one
// quietly answered 'na', and the applicant was left to infer from a wall of
// "not checked" that they had forgotten something. A consulate rejects that
// application on receipt.
//
// So completeness is checked first and explicitly. Two distinct cases:
//
//   absent  - the document is not in the application at all. Always a fail.
//   present - the document exists but has no usable fields. A fail too, because
//             an imported PDF that yielded nothing looks identical to a
//             half-finished form from the outside, and both need the same
//             response: go and get the document.
//
// Required vs conditional matters. Insurance and accommodation are not required
// for every destination, so demanding them unconditionally would be the same
// class of error as the one this rule fixes — a confident wrong answer.

/** Documents every application needs, whatever the destination. */
const ALWAYS_REQUIRED = [
  ['passport', 'Passport bio page'],
  ['application', 'Signed application form'],
];

/** Documents required only for particular destinations. */
const CONDITIONAL_DOCS = [
  ['schengen', [['insurance', 'Travel medical insurance'],
                ['accommodation', 'Proof of accommodation'],
                ['bankStatement', 'Bank statement'],
                ['itinerary', 'Flight itinerary']]],
  ['uk',       [['bankStatement', 'Bank statement'],
                ['employment', 'Employment or study letter'],
                ['accommodation', 'Proof of accommodation']]],
  ['us',       [['itinerary', 'Flight itinerary'],
                ['employment', 'Employment letter'],
                ['bankStatement', 'Bank statement']]],
];

function documentCompleteness(app) {
  const dest = destinationKey(app);
  const wanted = [
    ...ALWAYS_REQUIRED,
    ...(CONDITIONAL_DOCS.find(([k]) => k === dest)?.[1] ?? []),
  ];

  const missing = [];
  const empty = [];
  for (const [key, label] of wanted) {
    // flattenApp synthesises an empty stub for every known document, so presence
    // cannot be tested with `!app.docs[key]`. A stub is identified by having no
    // field with a value; a document the applicant actually supplied has at least
    // one. Checking `key in srcDocs` instead would be clearer, but the rule only
    // receives the flattened app.
    const doc = app.docs[key];
    const hasValue = doc && Object.values(doc.fields ?? {}).some((v) => !blank(v));
    if (!hasValue) missing.push(label);
  }

  const out = [];
  if (missing.length) {
    out.push(f('R00', 'fail',
      `Missing document${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      `A ${dest === 'schengen' ? 'Schengen' : dest.toUpperCase()} short-stay application needs ${missing.length > 1 ? 'these documents' : 'this document'} and ${missing.length > 1 ? 'they are' : 'it is'} not in the file.`,
      'Attach the document. An incomplete file is usually returned unprocessed, and the fee is not refunded.',
      'Document completeness'));
  } else {
    out.push(f('R00', 'pass', 'All required documents present',
      `Checked ${wanted.length} document${wanted.length === 1 ? '' : 's'} required for a ${dest} application.`,
      '', 'Document completeness'));
  }
  return out;
}

const RULES = [
  // First in the list deliberately: an applicant should be told what is missing
  // before being told that two documents disagree.
  ['R00', 'Document completeness', documentCompleteness],
  ['R01', 'Passport validity', passportExpiry],
  ['R02', 'Name consistency', nameConsistency],
  ['R03', 'Passport number', passportNumber],
  ['R04', 'Date ambiguity', dateAmbiguity],
  ['R05', 'Trip date consistency', tripDateConsistency],
  ['R05c', 'Schengen 90/180', schengenRollingWindow],
  ['R06', 'Application timing', applicationWindow],
  ['R07', 'Statement age', bankStatementAge],
  ['R08', 'Funds coverage', fundsCoverage],
  ['R09', 'Insurance', insuranceCoverage],
  ['R10', 'Employment', employmentGaps],
  ['R11', 'Required fields', requiredFields],
  ['R12', 'Address consistency', addressConsistency],
  ['R13', 'Host letter', hostLetterSupport],
  ['R14', 'Prior visa history', priorVisaHistory],
];

/**
 * Normalise the raw application into the shape the rules read.
 *
 * Docs keep their {label, tag, source, fields} envelope AND get their fields
 * spread onto the envelope, so a rule can write either `doc.fields.x` or
 * `doc.x`. The spread is deliberate: with 14 rules it removes a whole class of
 * silent `na` returns where one rule forgets the `.fields` hop. Doc metadata
 * (label/tag/source) always wins over a same-named field; fields never use
 * those three names.
 */
/**
 * Every document key any rule or the completeness list refers to, so a file with
 * documents deleted cannot crash the engine.
 *
 * Before this existed, deleting a document from an application made R05 and R11
 * throw "Cannot read properties of undefined (reading 'fields')" — caught by the
 * runner and reported as a bland 'na', which is indistinguishable from "this rule
 * does not apply". The fuzzer only found it because it was taught to drop
 * documents at all; until then every generated file had all eight, so the crash
 * path was never entered.
 */
const KNOWN_DOCS = [
  'passport', 'application', 'itinerary', 'accommodation', 'hostLetter',
  'bankStatement', 'insurance', 'employment',
];

function flattenApp(src) {
  const app = { meta: { ...(src.meta || {}) }, trip: { ...(src.trip || {}) }, docs: {} };
  for (const [k, d] of Object.entries(src.docs || {})) {
    const fields = { ...(d.fields || {}) };
    app.docs[k] = { ...fields, ...d, fields };
  }
  // Synthesise empty stubs for documents the application does not contain. Rules
  // then read `fields.x` as undefined and answer 'na' honestly, instead of
  // throwing and being flattened into the same 'na' by the error handler — two
  // very different situations that looked identical in the report.
  for (const k of KNOWN_DOCS) {
    if (!app.docs[k]) app.docs[k] = { label: k, fields: {} };
  }
  app.passport = app.docs.passport ?? {};
  app.meta.submissionDate =
    app.meta.submissionDate
    ?? app.docs.application?.fields?.submissionDate
    ?? '2026-11-30';
  return app;
}

/** First present numeric value among several accepted field names. */
function pickNum(fields, names) {
  for (const n of names) {
    const v = num(fields?.[n]);
    if (v != null) return v;
  }
  return null;
}

/**
 * Which destination's rules apply.
 *
 * The seed stores the destination as a human string — 'France (Schengen short-stay)'
 * — on meta.destination, with NO trip.destinationCountry at all. Every rule used to
 * read `app.trip.destinationCountry || 'schengen'`, so a UK or US application — or
 * any application whose destination string was set — silently fell through to the
 * SCHENGEN rules: the wrong passport-validity period, the wrong bank-statement age,
 * and R05c (the 90/180 rolling allowance, which does not apply outside Schengen)
 * either skipped or misfired.
 *
 * Resolution order, most specific first:
 *   trip.destinationCountry  — an explicit normalised key ('schengen', 'uk', 'us')
 *   meta.destination         — free text, matched for 'schengen' and the others
 *   'schengen'               — the seeded default, so existing behaviour is kept
 */
function destinationKey(app) {
  const explicit = String(app.trip?.destinationCountry ?? '').trim().toLowerCase();
  if (explicit) return explicit;
  const text = String(app.meta?.destination ?? '').toLowerCase();
  if (/\bschengen\b/.test(text)) return 'schengen';
  if (/\b(uk|united kingdom|britain|england|scotland|wales|northern ireland)\b/.test(text)) return 'uk';
  if (/\b(us|usa|u\.s\.|united states|america)\b/.test(text)) return 'us';
  if (/\bcanada\b/.test(text)) return 'canada';
  if (/\baustralia\b|\bnew zealand\b/.test(text)) return 'australia';
  return 'schengen';
}

export function runRules(src) {
  const app = flattenApp(src);
  const findings = [];
  for (const [id, category, fn] of RULES) {
    try { findings.push(...(fn(app) ?? [])); }
    catch (err) { findings.push(nf(id, 'na', `${category} check could not run`, String(err && err.message || err), 'Preflight internal error')); }
  }
  const tally = { fail: 0, warn: 0, pass: 0, na: 0 };
  for (const x of findings) tally[x.status] = (tally[x.status] || 0) + 1;
  const decided = tally.pass + tally.fail + tally.warn;
  const score = decided ? Math.round(((tally.pass + 0.5 * tally.warn) / decided) * 100) : 0;
  return { findings, tally, score, rules: RULES.map(([id, category]) => ({ id, category })) };
}