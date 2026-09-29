// Location normalization — §2.4: Simplify's strings are the canonical location
// vocabulary, and every other source is mapped INTO it rather than stored raw.
//
// This matters more than it looks. The location facet, the campus view and the
// cross-source dedup all compare location strings, and the secondary feeds spell
// one place a dozen ways — measured on 2026-09-29:
//
//   "San Jose, California, United States of America"   → San Jose, CA
//   "Seattle, Washington, United States of America"    → Seattle, WA
//   "New York, New York, United States" / "New York"   → NYC
//   "USA LA Bossier City"                              → Bossier City, LA
//   "United States - California - Foster City"        → Foster City, CA
//   "US-IA-CEDAR RAPIDS-131 ~ 5450 C Ave NE ~ BLDG 131" → Cedar Rapids, IA
//   "Calgary, AB, CA, T2C 5N1"                          → Calgary, AB, Canada
//   "Remote (US)" / "United States - Remote"          → Remote in USA
//
// Left raw, each of those is its own chip, a Seattle posting from one feed
// never matches the campus view, and the same job from two feeds never dedups.
//
// Anything the rules don't recognize is returned trimmed rather than guessed at:
// a strange string in the long tail of the type-ahead is better than a job filed
// under the wrong city.

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC', 'puerto rico': 'PR',
};
const STATE_CODES = new Set(Object.values(STATES));

const PROVINCES: Record<string, string> = {
  ontario: 'ON', quebec: 'QC', québec: 'QC', 'british columbia': 'BC',
  alberta: 'AB', manitoba: 'MB', saskatchewan: 'SK', 'nova scotia': 'NS',
  'new brunswick': 'NB', 'newfoundland and labrador': 'NL',
  'prince edward island': 'PE',
};
const PROVINCE_CODES = new Set(Object.values(PROVINCES));

const US_RE = /^(us|usa|u\.s\.?|u\.s\.a\.?|united states( of america)?|america)$/i;
const CANADA_RE = /^(canada|can)$/i;
const UK_RE = /^(uk|u\.k\.|united kingdom|great britain|gb|england|scotland|wales|northern ireland)$/i;

// The feed's own abbreviations, and the long forms that should collapse into
// them. Applied to every source, Simplify included: it spells New York three
// ways itself ("NYC" 533 times, "New York, NY" 8, "New York City, NY" once),
// which splits one city across three chips.
const ALIASES: Record<string, string> = {
  'new york, ny': 'NYC',
  'new york city, ny': 'NYC',
  'new york city': 'NYC',
  'new york': 'NYC',
  'nyc, ny': 'NYC',
  'manhattan, ny': 'NYC',
  'san francisco, ca': 'SF',
  'south san francisco, ca': 'South SF',
  'los angeles, ca': 'LA',
  'washington, dc, dc': 'Washington, DC',
  'washington dc': 'Washington, DC',
  'united states': 'United States',
};

export function aliasLocation(loc: string): string {
  return ALIASES[loc.trim().toLowerCase()] ?? loc.trim();
}

// "cedar rapids" and "CEDAR RAPIDS" become "Cedar Rapids"; a name that already
// mixes case ("McLean", "DeKalb") is left exactly as written.
function titleCase(s: string): string {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  // Short all-caps tokens are abbreviations, not shouting: LA, SF, NYC.
  if (/^[A-Z]{2,3}$/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-'.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

function stateCode(token: string): string | undefined {
  const bare = token
    .trim()
    // A country or ZIP rides along on the state token: "MA USA", "NH 03060".
    .replace(/\s+(usa?|united states( of america)?)$/i, '')
    .replace(/\s+([0-9]{5}(-[0-9]{4})?|[A-Z][0-9][A-Z]( ?[0-9][A-Z][0-9])?)$/i, '')
    // "D.C." → "DC"
    .replace(/\./g, '');
  if (/^[A-Za-z]{2}$/.test(bare) && STATE_CODES.has(bare.toUpperCase())) return bare.toUpperCase();
  return STATES[bare.toLowerCase()];
}

// Metros big and unambiguous enough to be written without a state — "Chicago,
// United States", "Seattle". Deliberately short: Portland, Columbus, Cambridge
// and Bellevue each name more than one real place and are not here.
const METRO_STATE: Record<string, string> = {
  chicago: 'IL', seattle: 'WA', boston: 'MA', austin: 'TX', atlanta: 'GA',
  denver: 'CO', dallas: 'TX', houston: 'TX', phoenix: 'AZ', philadelphia: 'PA',
  pittsburgh: 'PA', 'san diego': 'CA', 'san jose': 'CA', miami: 'FL',
  detroit: 'MI', minneapolis: 'MN', nashville: 'TN', raleigh: 'NC',
  charlotte: 'NC', baltimore: 'MD', 'salt lake city': 'UT', sunnyvale: 'CA',
  'mountain view': 'CA', 'palo alto': 'CA', 'menlo park': 'CA', cupertino: 'CA',
  'santa clara': 'CA', 'redwood city': 'CA', 'san francisco': 'CA',
  'los angeles': 'CA', 'new york city': 'NY',
};

// Qualifiers that ride along with a place without being part of it:
// "Hybrid - San Francisco, CA", "Dallas, TX - Headquarters",
// "Bala Cynwyd (Philadelphia Area), Pennsylvania".
const LEADING_QUALIFIER =
  /^(hybrid|on-?site|in[- ]office|in[- ]person|office|hq|headquarters|us|usa|united states)\s*[-–:]\s+/i;
const TRAILING_QUALIFIER =
  /\s*[-–]\s*(hybrid|on-?site|in[- ]office|office|hq|headquarters|corporate (office|headquarters)|main (campus|site))$/i;
// "Cambridge, MA +1" — the source's own "and N more", which we count ourselves.
const PLUS_N = /\s*\+\s*[0-9]+$/;
// "Wilmington NC USA" — a trailing country with no comma in front of it.
const BARE_TRAILING_COUNTRY = /\s+(usa|us|united states( of america)?)$/i;

function stripQualifiers(s: string): string {
  let out = s.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(LEADING_QUALIFIER, '')
      .replace(TRAILING_QUALIFIER, '')
      .replace(PLUS_N, '')
      .replace(BARE_TRAILING_COUNTRY, '')
      .trim();
    if (next === out) break;
    out = next;
  }
  // "Greater Seattle Area" names a metro, and the metro has a canonical city.
  const greater = /^greater\s+(.+?)\s+area$/i.exec(out);
  if (greater && METRO_STATE[greater[1].toLowerCase()]) {
    out = `${greater[1]}, ${METRO_STATE[greater[1].toLowerCase()]}`;
  }
  return out;
}

function provinceCode(token: string): string | undefined {
  const bare = token.trim().replace(/\s+[A-Z][0-9][A-Z]( ?[0-9][A-Z][0-9])?$/i, '');
  if (/^[A-Za-z]{2}$/.test(bare) && PROVINCE_CODES.has(bare.toUpperCase())) return bare.toUpperCase();
  return PROVINCES[bare.toLowerCase()];
}

const isPostal = (t: string) =>
  /^[0-9]{5}(-[0-9]{4})?$/.test(t) || /^[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]$/i.test(t);
// "420 National Business Parkway" — a street address in front of the city.
const isStreet = (t: string) => /^[0-9]+\s+\S/.test(t);

type Country = 'US' | 'CA' | 'UK' | 'other';

// One place, no remote marker. Returns the canonical string and which country
// it resolved to (the remote label needs the latter).
function place(raw: string): { loc: string; country: Country } | null {
  const s = raw.replace(/\s+/g, ' ').replace(/^[\s,;.-]+|[\s,;.-]+$/g, '');
  if (!s) return null;

  if (US_RE.test(s)) return { loc: 'United States', country: 'US' };
  if (CANADA_RE.test(s)) return { loc: 'Canada', country: 'CA' };
  if (UK_RE.test(s)) return { loc: 'United Kingdom', country: 'UK' };

  // "US-IA-CEDAR RAPIDS-131 ~ 5450 C Ave NE ~ BLDG 131" — a site code, so the
  // city ends at the next separator. Checked before the looser form below,
  // which would otherwise swallow the building number into the city.
  let m = /^us-([a-z]{2})-([^-~]+)/i.exec(s);
  if (m && stateCode(m[1])) return usCity(m[2], stateCode(m[1])!);

  // "United States - California - Foster City", "USA - New York - Malta"
  m = /^(?:united states|usa|us)\s*[-–]\s*([^-–]+?)\s*[-–]\s*(.+)$/i.exec(s);
  if (m && stateCode(m[1])) return usCity(m[2], stateCode(m[1])!);

  // "USA LA Bossier City" — country, state code, city. The code is read as a
  // state here, never as Los Angeles, because of where it sits.
  m = /^[Uu][Ss][Aa]?\s+([A-Z]{2})\s+(.+)$/.exec(s);
  if (m && stateCode(m[1])) return usCity(m[2], stateCode(m[1])!);

  const cleaned = stripQualifiers(s);
  if (!cleaned) return null;
  const tokens = cleaned.split(',').map((t) => t.trim()).filter((t) => t && !isPostal(t));
  if (tokens.length === 0) return null;

  // "US, CA, Santa Clara" — the country leads instead of trailing.
  let country: Country | undefined;
  if (tokens.length >= 2 && US_RE.test(tokens[0])) {
    country = 'US';
    tokens.shift();
    if (tokens.length === 2 && stateCode(tokens[0]) && !stateCode(tokens[1])) {
      return usCity(tokens[1], stateCode(tokens[0])!);
    }
  }

  if (tokens.length === 1) {
    const only = tokens[0];
    if (US_RE.test(only)) return { loc: 'United States', country: 'US' };
    // "Rosemont IL", "Atlanta GA" — no comma, trailing state code.
    const tail = /^(.+?)\s+([A-Z]{2})$/.exec(only);
    if (tail && STATE_CODES.has(tail[2])) return usCity(tail[1], tail[2]);
    const metro = METRO_STATE[only.toLowerCase()];
    if (metro) return usCity(only, metro);
    // A bare state is written out, as the feed writes it ("California",
    // "Virginia") — except LA, which the feed uses for Los Angeles, and DC.
    if (/^[A-Z]{2}$/.test(only) && STATE_CODES.has(only) && only !== 'LA') {
      if (only === 'DC') return { loc: 'Washington, DC', country: 'US' };
      const name = Object.keys(STATES).find((k) => STATES[k] === only)!;
      return { loc: titleCase(name), country: 'US' };
    }
    const st = STATES[only.toLowerCase()];
    if (st && only.toLowerCase() !== 'new york' && only.toLowerCase() !== 'washington') {
      return { loc: titleCase(only), country: 'US' };
    }
    return { loc: aliasLocation(titleCase(only)), country: country ?? 'other' };
  }

  // Peel a street address off the front when there's still a city behind it.
  while (tokens.length > 2 && isStreet(tokens[0])) tokens.shift();

  // Country off the end. "CA" only means Canada when a province sits before
  // it ("Calgary, AB, CA"); anywhere else it's California.
  const last = tokens[tokens.length - 1];
  let trailing: Country | undefined;
  if (US_RE.test(last)) trailing = 'US';
  else if (CANADA_RE.test(last) || (/^ca$/i.test(last) && tokens.length >= 3 && provinceCode(tokens[tokens.length - 2]))) trailing = 'CA';
  else if (UK_RE.test(last)) trailing = 'UK';
  if (trailing) {
    tokens.pop();
    country = trailing;
  }

  // "Chicago, United States" — a metro with the country but no state.
  if (country === 'US' && tokens.length === 1) {
    const metro = METRO_STATE[tokens[0].toLowerCase()];
    if (metro) return usCity(tokens[0], metro);
  }

  if (country === 'UK' || (!country && tokens.length === 2 && UK_RE.test(tokens[1]))) {
    // "London, England" → "London, UK"
    return { loc: `${titleCase(tokens[0])}, UK`, country: 'UK' };
  }

  if (country === 'CA' || (tokens.length >= 2 && !stateCode(tokens[tokens.length - 1]) && provinceCode(tokens[tokens.length - 1]))) {
    const pr = provinceCode(tokens[tokens.length - 1]);
    if (pr && tokens.length >= 2) return { loc: `${titleCase(tokens[0])}, ${pr}, Canada`, country: 'CA' };
    return { loc: `${tokens.map(titleCase).join(', ')}, Canada`, country: 'CA' };
  }

  if (tokens.length >= 2) {
    const st = stateCode(tokens[tokens.length - 1]);
    if (st) return usCity(tokens[tokens.length - 2], st);
  }

  if (country === 'US') return { loc: aliasLocation(tokens.map(titleCase).join(', ')), country: 'US' };
  return { loc: aliasLocation(tokens.join(', ')), country: 'other' };
}

function usCity(city: string, code: string): { loc: string; country: Country } {
  return { loc: aliasLocation(`${titleCase(city.trim())}, ${code}`), country: 'US' };
}

const REMOTE_RE = /\b(remote|virtual|anywhere|work from home|wfh)\b/i;

function remoteLabel(country: Country | undefined): string {
  if (country === 'US') return 'Remote in USA';
  if (country === 'CA') return 'Remote in Canada';
  if (country === 'UK') return 'Remote in UK';
  return 'Remote';
}

// A raw location field from a non-Simplify source → canonical location strings.
// One field can name several places ("Addison, TX; Montpelier, VT") and can
// carry a remote marker alongside a place ("Seattle, WA (Remote)").
export function normalizeLocation(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(/\s*[;|•·]\s*|\s+\/\s+/)) {
    if (!part.trim()) continue;
    if (REMOTE_RE.test(part)) {
      const rest = part
        .replace(/\(?\b(fully\s+)?(remote|virtual|anywhere|work from home|wfh)\b\)?/gi, ' ')
        .replace(/\b(in|within|from|the)\b/gi, ' ')
        .replace(/[()]/g, ' ');
      const p = place(rest);
      // "United States - Remote" is one fact (remote, US), not two locations.
      const isCountryOnly = p && ['United States', 'Canada', 'United Kingdom'].includes(p.loc);
      out.push(remoteLabel(p?.country));
      if (p && !isCountryOnly) out.push(p.loc);
      continue;
    }
    const p = place(part);
    if (p) out.push(p.loc);
  }
  return [...new Set(out)];
}
