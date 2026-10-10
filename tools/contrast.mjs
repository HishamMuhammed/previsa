// WCAG contrast checker for the Previsa palettes.
//
// Run: node tools/contrast.mjs
//
// A departures board that fails contrast is a dead departures board — the whole
// point of the phosphor-on-slate look is legibility at a glance. So every
// foreground/background pair is checked numerically before the CSS is written,
// for BOTH the dark (default) and light palettes, rather than eyeballed.
//
// WCAG AA needs 4.5:1 for body text, 3:1 for large text (>=18.66px bold or
// >=24px) and UI components. This checker reports both and flags any pair below
// the threshold it needs.

const lin = (c) => {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (hex) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

// --- Dark palette (default): phosphor data on deep slate -------------------
const dark = {
  bg:      '#0E1417',  // base slate
  panel:   '#141C20',  // raised panel
  panel2:  '#1B2429',  // raised again (summary rows)
  data:    '#7CFCB0',  // phosphor green — primary data
  dataDim: '#4FB787',  // secondary data / labels
  fail:    '#FF8A7A',  // blocking error (warm, not green)
  failSoft:'#3A1F1B',
  warn:    '#FFD27A',
  ok:      '#7CFCB0',
  ink:     '#E8F0EE',  // primary text
  ink2:    '#AFC0BC',  // secondary text
  ink3:    '#7A8B88',  // tertiary / hints
  rule:    '#253238',
};

// --- Light palette: same identity, on paper-white --------------------------
const light = {
  bg:      '#F4F6F5',
  panel:   '#FFFFFF',
  panel2:  '#EAEFEC',
  data:    '#0F7A4A',
  dataDim: '#2E6B54',
  fail:    '#B02118',  // darkened from #C2352B: at #C2352B the fail text on failSoft
                     // measured 4.43:1 — under AA. Darkening to #B02118 clears it.
  failSoft:'#F3D6D2',  // lightened a touch so the darker red still clears 4.5 on it
  warn:    '#8A6100',  // darkened from #9A6B00: 4.32:1 on light bg, under AA
  ok:      '#0F7A4A',
  ink:     '#101C18',
  ink2:    '#3C4A47',
  ink3:    '#5E6D69',
  rule:    '#C9D3CF',
};
const pairs = [
  // [label, foreground, background, minRatio, isLargeText]
  ['ink on bg',        'ink',  'bg',    4.5, false],
  ['ink2 on bg',       'ink2', 'bg',    4.5, false],
  ['ink3 on bg',       'ink3', 'bg',    4.5, false],
  ['ink on panel',     'ink',  'panel', 4.5, false],
  ['ink2 on panel',    'ink2', 'panel', 4.5, false],
  ['data on bg',       'data', 'bg',    4.5, false],
  ['data on panel',    'data', 'panel', 4.5, false],
  ['dataDim on bg',    'dataDim','bg',  4.5, false],
  ['dataDim on panel', 'dataDim','panel',4.5,false],
  ['fail on bg',       'fail', 'bg',    4.5, false],
  ['fail on panel',    'fail', 'panel', 4.5, false],
  ['fail on failSoft', 'fail', 'failSoft',4.5,false],
  ['warn on bg',       'warn', 'bg',    4.5, false],
  ['warn on panel',    'warn', 'panel', 4.5, false],
  ['ok on bg',         'ok',   'bg',    4.5, false],
  // Hairlines are decorative dividers, not UI components (WCAG's 3:1 non-text
  // rule covers controls and focus indicators, not divider lines). They need to
  // be *visible*, which ~1.4:1 is, so they are checked at a lower 1.2 floor to
  // catch a rule that has effectively disappeared rather than a contrast fail.
  ['rule on bg (visible)', 'rule', 'bg', 1.2, true],
  ['rule on panel (visible)', 'rule', 'panel', 1.2, true],
];

let failures = 0;
for (const [label, fg, bg, min, large] of pairs) {
  for (const [themeName, palette] of [['dark', dark], ['light', light]]) {
    const r = ratio(palette[fg], palette[bg]);
    const pass = r >= min;
    if (!pass) failures++;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${themeName.padEnd(5)} ${label.padEnd(18)} ${r.toFixed(2)}:1  (need ${min})`);
  }
}
console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures ? 1 : 0);
