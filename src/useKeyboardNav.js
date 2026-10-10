// Keyboard navigation over the actionable rows.
//
// The fix list is a list of things to do, and someone working through it one at a
// time should not have to reach for the mouse between each one. `j` / `k` move a
// cursor down and up the list, `Enter` jumps to the highlighted row's field.
//
// This is deliberately NOT a global shortcut system. Only the keys that act on the
// list are handled, and they are ignored while the user is typing in a field —
// otherwise editing a surname containing 'j' would move the cursor. That guard is
// the reason this is a hook with a target check rather than a window listener that
// swallows keys.
//
// `j`/`k` (rather than arrows) because they are already the muscle memory of anyone
// who has used a pager, and they do not collide with arrow-key caret movement
// inside text inputs.

import { useEffect } from 'react';

/**
 * @param {object} opts
 * @param {Array} opts.rows      the actionable rows, in display order
 * @param {number|null} opts.cursor  current row index, or null when nothing is selected
 * @param {(i:number)=>void} opts.setCursor
 * @param {(row:object)=>void} opts.onActivate  called with the row when Enter is pressed
 * @param {boolean} opts.enabled  false while a modal or the file dialog is open
 */
export function useKeyboardNav({ rows, cursor, setCursor, onActivate, enabled = true }) {
  useEffect(() => {
    if (!enabled || !rows.length) return;

    const handler = (e) => {
      // Never steal keys from a text field, a textarea, or a contenteditable.
      // Without this, typing 'j' in a surname moves the list instead of typing.
      const t = e.target;
      const typing =
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable;
      if (typing) return;

      // A modifier makes it a different gesture (browser refresh, search, etc.)
      // and must not be intercepted.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const n = rows.length;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        // First press selects the first row rather than the second, so the
        // cursor does not appear to skip past the top of the list.
        setCursor(cursor == null ? 0 : Math.min(cursor + 1, n - 1));
        return;
      }

      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor(cursor == null ? n - 1 : Math.max(cursor - 1, 0));
        return;
      }

      if (e.key === 'Enter' && cursor != null && rows[cursor]) {
        e.preventDefault();
        onActivate(rows[cursor]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rows, cursor, setCursor, onActivate, enabled]);
}