// Pay — a measurement, so it's set in --font-data and never colored (§4.2).
//
// Two feeds carry compensation, written however the employer wrote it:
//   "25–33 USD/hr", "$35/hr", "$25–$27/hr", "$85,000 Annually",
//   "$76,700 - $152,200 annually", "$124,000 - $162,000 USD", "$175,000"
// and some that aren't a rate at all: "$12K • 10 week internship in NYC".
//
// The card shows one compact form — "$25–33/hr", "$77k–152k/yr" — or nothing.
// A number is only shown with a unit we can stand behind: an explicit one, or
// one the magnitude makes unambiguous (nobody is paid $85,000 an hour, or $40 a
// year). Everything in between — "$12K" for a 10-week internship is a total, not
// an annual salary — is dropped rather than printed as something it isn't.

type Unit = 'hr' | 'wk' | 'mo' | 'yr';

const UNIT_PATTERNS: [RegExp, Unit][] = [
  [/(\/|\bper\s+|\ban?\s+)(hr|hour)\b|\bhourly\b/i, 'hr'],
  [/(\/|\bper\s+|\ban?\s+)(wk|week)\b|\bweekly\b/i, 'wk'],
  [/(\/|\bper\s+|\ban?\s+)(mo|month)\b|\bmonthly\b/i, 'mo'],
  [/(\/|\bper\s+|\ban?\s+)(yr|year|annum)\b|\bannual(ly)?\b|\byearly\b|\bsalary\b/i, 'yr'],
];

function amounts(raw: string): number[] {
  const out: number[] = [];
  for (const m of raw.matchAll(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)\s*([kK])?/g)) {
    const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

function fmt(n: number, unit: Unit): string {
  if (unit === 'yr' || n >= 10_000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatPay(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  // Only US dollars: every other currency would need its own formatting rules,
  // and a "$" in front of a euro amount is worse than no number.
  if (!/\$|\busd\b/i.test(text) || /\b(eur|gbp|cad|inr|aud)\b|€|£/i.test(text)) return undefined;

  const nums = amounts(text).filter((n) => n >= 7); // "10 week" is a duration, not pay
  if (nums.length === 0) return undefined;
  const lo = Math.min(nums[0], nums[1] ?? nums[0]);
  const hi = Math.max(nums[0], nums[1] ?? nums[0]);

  let unit = UNIT_PATTERNS.find(([re]) => re.test(text))?.[1];
  if (!unit) {
    if (lo >= 20_000) unit = 'yr';
    else if (hi <= 300) unit = 'hr';
    else return undefined; // "$12K" with no unit: a total, a stipend, a guess
  }
  // A unit that contradicts the magnitude is a parse we got wrong.
  if (unit === 'hr' && hi > 500) return undefined;
  if (unit === 'yr' && lo < 1_000) return undefined;

  const a = fmt(lo, unit);
  const b = fmt(hi, unit);
  return `$${a === b ? a : `${a}–${b}`}/${unit}`;
}
