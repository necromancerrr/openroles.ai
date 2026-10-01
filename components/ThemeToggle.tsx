'use client';

// ThemeToggle — light ⇄ dark. Both icons are always rendered and CSS shows the
// one for the current theme, so the server and the first client render agree
// whatever the reader has stored (no hydration mismatch, no state to sync).

import { useLayoutEffect } from 'react';
import { resolvedTheme, setTheme, storedTheme } from '@/lib/theme';

export function ThemeToggle() {
  // In development, Strict Mode's remount resets <html> to the attributes React
  // manages, wiping what the inline script set. Put it back before paint. A
  // no-op in production.
  useLayoutEffect(() => {
    const t = storedTheme();
    if (t) document.documentElement.setAttribute('data-theme', t);
  }, []);

  return (
    <button
      type="button"
      className="iconbtn themetoggle"
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark', {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        });
      }}
    >
      <svg className="themetoggle__sun" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
      </svg>
      <svg className="themetoggle__moon" viewBox="0 0 24 24" aria-hidden>
        <path d="M20.2 14.6A8.5 8.5 0 0 1 9.4 3.8a8.5 8.5 0 1 0 10.8 10.8Z" />
      </svg>
    </button>
  );
}
