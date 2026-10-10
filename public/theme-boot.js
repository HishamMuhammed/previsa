// Applies the stored theme before first paint.
// Must be a classic (non-module) script in <head> BEFORE the stylesheet: an ES
// module is deferred and would run after the first paint, giving dark-mode users
// a white flash. Kept inline and tiny for that reason — a separate file would add
// a render-blocking round trip.
(function () {
  try {
    var stored = localStorage.getItem('previsa-theme');
    var dark = stored === 'dark'
      || ((!stored || stored === 'auto') &&
          window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    if (stored) document.documentElement.setAttribute('data-theme-choice', stored);
  } catch (e) {
    /* private mode / storage disabled: fall through to the light default */
  }
})();