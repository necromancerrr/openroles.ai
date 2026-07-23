// Type classification — §1 finding 5. The one classifier that works: the
// INTERNSHIP title classifier (80.1% correct on ground truth). Do NOT attempt
// a new-grad classifier — it's 29.5% and not solvable from the title.
//
// In this build the two listings.json files ARE the aggregator, so every row
// carries a trustworthy type from its repo of origin (typeConf 'source'). The
// classifier exists for the freshness layer: ATS rows with no known type get
// run through it, a hit gives type 'internship'/'inferred', a miss gives
// 'unknown' → surfaced in the Unclassified tab, never hidden.

const INTERN_PATTERNS: RegExp[] = [
  /\bintern(ship)?\b/i,
  /\bco-?op\b/i,
  /\bsummer\s+(analyst|associate)\b/i,
  /\bindustrial\s+placement\b/i,
  /\bplacement\s+year\b/i,
  /\bworking\s+student\b/i,
  /\bwerkstudent\b/i,
  /\bapprentice(ship)?\b/i,
];

export function looksLikeInternship(title: string): boolean {
  return INTERN_PATTERNS.some((re) => re.test(title));
}
