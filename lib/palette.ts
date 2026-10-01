// The ⌘K command palette (components/CommandPalette.tsx) is mounted once, in
// the layout. Anything else that wants to open it — the search pill in the nav —
// fires this event instead of sharing state with it.
export const PALETTE_EVENT = 'or:palette';

export function openPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}
