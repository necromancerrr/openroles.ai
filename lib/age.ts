// The decay rail — §4.1 / §5.1. Age is the primary visual variable and the
// ONLY thing in the interface that gets color. This maps `firstSeenAt` to a
// rail token AND to redundant text (§5.1: the rail is never the sole carrier).

export type AgeBucket = 0 | 1 | 2 | 3 | 4;

const HOUR = 3600;
const DAY = 86400;

export function ageBucket(firstSeenAt: number, now: number): AgeBucket {
  const s = now - firstSeenAt;
  if (s < 6 * HOUR) return 0;
  if (s < 24 * HOUR) return 1;
  if (s < 3 * DAY) return 2;
  if (s < 7 * DAY) return 3;
  return 4;
}

export const RAIL_TOKEN: Record<AgeBucket, string> = {
  0: 'var(--age-0)',
  1: 'var(--age-1)',
  2: 'var(--age-2)',
  3: 'var(--age-3)',
  4: 'var(--age-4)',
};

// `NEW` micro-label only for buckets 0 and 1 (< 24h).
export function isNew(bucket: AgeBucket): boolean {
  return bucket <= 1;
}

// Redundant text encoding (§5.1). Relative under a week, absolute past it —
// relative time stops being useful past 7d.
export function ageText(firstSeenAt: number, now: number): string {
  const s = Math.max(0, now - firstSeenAt);
  if (s < HOUR) {
    const m = Math.floor(s / 60);
    return `${m}m ago`;
  }
  if (s < DAY) return `${Math.floor(s / HOUR)}h ago`;
  if (s < 7 * DAY) return `${Math.floor(s / DAY)}d ago`;
  const d = new Date(firstSeenAt * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Machine-readable datetime for the <time> element.
export function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}
