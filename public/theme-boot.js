// Applies the stored theme before first paint.
// Must be a classic (non-module) script in <head> BEFORE the stylesheet: an ES
// module is deferred and would run after the first paint, giving dark-mode users
// a white flash. Kept inline and tiny for that reason — a separate file would add
// a render-blocking round trip.
//
// Default is DARK (the departures board is a backlit display, dark is its native
// state). :root in the stylesheet IS the dark palette; [data-theme="light"] is the
// explicit override. So this script sets data-theme="light" only when the resolved
// theme is light, and otherwise leaves the attribute unset so :root's dark shows.
// That inverts the old logic, which only ever set "dark".
(function () {
  try {
    var stored = localStorage.getItem('previsa-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    // auto/unset -> follow the OS; 'light'/'dark' -> that explicit choice
    var resolved =
      stored === 'light' ? 'light' :
      stored === 'dark'  ? 'dark'  :
      (prefersDark ? 'dark' : 'light');
    // Only stamp the attribute when the answer is light; unset = dark (:root).
    if (resolved === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    if (stored) document.documentElement.setAttribute('data-theme-choice', stored);
  } catch (e) {
    /* private mode / storage disabled: fall through to the dark default on :root */
  }
})();
