// "What's new since I was last here" — the question the board exists to answer
// (§4.1: "the only question the user asks in the first two seconds is 'what's
// new since yesterday'"). The decay rail answers it for everyone at once; this
// answers it for the one person reading.
//
// One first-party cookie, `or_visit=<last>~<since>`, two unix timestamps:
//   last   — the last moment this browser was looking at the board
//   since  — where "new" begins for the current visit
//
// A visit is a run of activity with no gap longer than VISIT_GAP_S. When a new
// visit starts, "new" means posted after the previous visit's `last`; for the
// rest of the visit that line stays put, so clicking filters doesn't move it.
//
// The server reads the cookie to render the line and the counts across the
// whole result set; a tiny client island (components/BoardMemory.tsx) writes it.
// Both apply the same rule from this file, so they can't disagree.

export const VISIT_COOKIE = 'or_visit';
export const VISIT_GAP_S = 30 * 60;

export interface Visit {
  last?: number;
  since?: number;
}

const ts = (s: string | undefined): number | undefined => {
  const n = Number(s);
  return Number.isFinite(n) && n > 1_000_000_000 ? Math.floor(n) : undefined;
};

export function parseVisit(raw: string | undefined): Visit {
  if (!raw) return {};
  const [last, since] = raw.split('~');
  return { last: ts(last), since: ts(since) };
}

// Where "new" begins for a page view at `now`. Undefined on a first visit —
// there is no line to draw yet.
export function sinceFor(v: Visit, now: number): number | undefined {
  if (v.last === undefined) return undefined;
  if (now - v.last > VISIT_GAP_S) return v.last; // a new visit
  return v.since; // the same visit: the line doesn't move
}

export function visitCookieValue(v: Visit, now: number): string {
  return `${now}~${sinceFor(v, now) ?? 0}`;
}
