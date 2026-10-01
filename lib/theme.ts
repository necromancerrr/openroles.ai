// Light / dark theme. The choice is per reader and lives in localStorage; with
// nothing stored, the board follows the system setting through CSS alone
// (globals.css keys dark tokens off `prefers-color-scheme` unless
// `data-theme="light"` says otherwise).
//
// The attribute has to be on <html> before the first paint or a dark-mode
// reader gets a white flash, so the layout runs THEME_INIT as a blocking inline
// script in <head> — see node_modules/next/dist/docs/01-app/02-guides/
// preventing-flash-before-hydration.md. Everything else here runs only in event
// handlers, in the browser.

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'or:theme';

export const THEME_INIT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function storedTheme(): Theme | undefined {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : undefined;
  } catch {
    return undefined;
  }
}

// What the reader is looking at right now: an explicit choice, else the system.
export function resolvedTheme(): Theme {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(next: Theme | 'system') {
  const root = document.documentElement;
  try {
    if (next === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    /* no storage: the switch still holds for this page view */
  }
  if (next === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', next);
}

// Switch themes with a circular reveal that grows out of `origin` (the button
// that was pressed), where the browser has view transitions and the reader
// hasn't asked for less motion. Everywhere else it's an instant swap.
export function setTheme(next: Theme | 'system', origin?: { x: number; y: number }) {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) {
    apply(next);
    return;
  }
  const x = origin?.x ?? innerWidth - 40;
  const y = origin?.y ?? 40;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.style.setProperty('--vt-x', `${x}px`);
  root.style.setProperty('--vt-y', `${y}px`);
  root.style.setProperty('--vt-r', `${r}px`);
  root.classList.add('theme-vt');
  const t = document.startViewTransition(() => apply(next));
  t.finished.finally(() => root.classList.remove('theme-vt'));
}
