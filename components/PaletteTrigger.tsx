'use client';

// The nav's search pill: opens the ⌘K palette. Shows the shortcut for this
// platform once mounted (⌘ on Apple devices, Ctrl elsewhere).

import { useEffect, useState } from 'react';
import { openPalette } from '@/lib/palette';

export function PaletteTrigger() {
  const [mod, setMod] = useState('⌘');
  useEffect(() => {
    // The server can't know the platform; correct it after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setMod('Ctrl');
  }, []);

  return (
    <button
      type="button"
      className="navsearch"
      onClick={openPalette}
      aria-label="Search roles and jump to filters"
      aria-keyshortcuts="Meta+K Control+K"
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <span className="navsearch__label">Search roles</span>
      <kbd className="navsearch__kbd">{mod} K</kbd>
    </button>
  );
}
