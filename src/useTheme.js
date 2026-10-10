// Theme: Auto / Light / Dark, tri-state, persisted.
//
// The interesting requirement is not the toggle, it is the first paint. A dark-mode
// user must not get a white flash while React boots, so theme-boot.js runs before
// the bundle and sets the attribute on <html>. This hook then adopts whatever is
// already there rather than deciding again.

import { useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'preflight-theme';

const mq = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : { matches: false, addEventListener() {} };

const resolved = (choice) => {
  if (choice === 'light') return 'light';
  if (choice === 'dark') return 'dark';
  return mq.matches ? 'dark' : 'light';
};

export function useTheme() {
  const [choice, setChoice] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'auto';
    } catch { return 'auto'; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = resolved(choice);
    try {
      if (choice === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch { /* private mode */ }
  }, [choice]);

  // Follow the OS live while on Auto — a user who flips their system to dark at
  // sunset should not have to reload.
  useEffect(() => {
    const onChange = () => { if (choice === 'auto') document.documentElement.dataset.theme = resolved('auto'); };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((c) => (c === 'auto' ? 'light' : c === 'light' ? 'dark' : 'auto'));
  }, []);

  return { choice, cycle };
}

export default useTheme;