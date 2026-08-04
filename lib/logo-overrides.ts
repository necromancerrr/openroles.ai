// Employer domains that can't be derived from the apply URL — §7's pattern:
// work the mapping out once, check the table in, don't guess at runtime.
//
// `logoDomain()` reads the employer domain off the apply URL, which is right for
// most companies and wrong in three recognisable ways: careers subdomains that
// are their own brand (lifeattiktok.com), ATS path slugs that aren't the
// company's domain (jobs.lever.co/embed/... → "embed"), and institutions on
// .edu/.gov that the ".com from a slug" fallback can never reach.
//
// Every entry below is a company that appears in the live feed with a wrong or
// missing domain, ordered by how many postings it carries — fixing the head of
// this list is worth far more than fixing the tail. `npm run audit:logos` prints
// the current ranking so the next entries are chosen by volume, not by whoever
// happened to notice.
//
// Keys are normalized company names (see normalizeCompany below), so "Palantir"
// and "Palantir Technologies" don't need separate rows unless they genuinely
// differ.

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const LOGO_DOMAIN_OVERRIDES: Record<string, string> = {
  // Careers sites that are their own brand, not the company's domain.
  tiktok: 'tiktok.com', // lifeattiktok.com
  amazon: 'amazon.com', // amazon.jobs
  meta: 'meta.com', // metacareers.com
  'goldman sachs': 'goldmansachs.com', // higher.gs.com
  tenstorrent: 'tenstorrent.com', // tenstorrentuniversity.com
  'walleye capital': 'walleyecapital.com', // walleyecapitalexternalstudents.com

  // ATS path segments that aren't a company slug at all.
  'jump trading': 'jumptrading.com', // "embed"
  rtx: 'rtx.com', // "globalhr"
  'cirrus logic': 'cirrus.com', // eu.lever.co
  'invisible technologies ai': 'invisible.co', // "agency"

  // Abbreviated or secondary domains the derivation lands on.
  'morgan stanley': 'morganstanley.com', // ms.com
  drw: 'drw.com', // drweng.com
  teledyne: 'teledyne.com', // flir.com — a Teledyne brand, not Teledyne
  'northrop grumman': 'northropgrumman.com', // ngc.com
  'ge healthcare': 'gehealthcare.com', // gehc.com
  anduril: 'anduril.com', // andurilindustries.com
  'anduril industries': 'anduril.com',
  innodata: 'innodata.com', // innodatainc.com
  collabera: 'collabera.com', // collabera2.com
  'consultadd public services': 'consultadd.com', // consultadd4.com
  plusai: 'plus.ai', // plus2.com
  'castleton commodities international': 'castletoncommodities.com', // osvcci.com
  'rivian and volkswagen group technologies': 'rivian.com', // rivianvwtech.com
  notion: 'notion.so', // notion.com

  // Universities and national labs — the ".com from a slug" fallback can't
  // reach .edu or .gov, so these resolve to domains that aren't theirs.
  'pennsylvania state university': 'psu.edu', // psu.com
  'pennstate university': 'psu.edu',
  'university of texas at austin': 'utexas.edu', // utaustin.com
  'carnegie mellon university': 'cmu.edu', // cmu.com
  'university of arkansas': 'uark.edu', // uasys.com
  'argonne national laboratory': 'anl.gov', // argonne.com
  'lawrence livermore national laboratory llnl': 'llnl.gov', // llnl.com

  // Spotted on the live board with a monogram where a logo belonged. The slug
  // guess can't know a company's real name or TLD: NREL trades as "National
  // Laboratory of the Rockies" on its postings, and BCBS Michigan is bcbsm.com.
  'national laboratory of the rockies': 'nrel.gov',
  'blue cross blue shield of michigan': 'bcbsm.com',
  kabam: 'kabam.com',
  'espa ai': 'espa.ai',
  'mistral ai': 'mistral.ai',
  'together ai': 'together.ai',
  'scale ai': 'scale.com',
  'perplexity ai': 'perplexity.ai',
  'field ai': 'field.ai',
  'persona ai': 'personainc.ai',
  'retell ai': 'retellai.com',
  'pony ai': 'pony.ai',
  'etched ai': 'etched.com',

  // Hosts the derivation skips as generic (Workday, Oracle Cloud, iCIMS), which
  // is correct — the host names the ATS, not the employer — leaving these blank.
  'jp morgan chase': 'jpmorganchase.com',
  oracle: 'oracle.com',
  'texas instruments': 'ti.com',
  honeywell: 'honeywell.com',
  nokia: 'nokia.com',
  'john deere': 'deere.com',
  wsp: 'wsp.com',
  vertiv: 'vertiv.com',
  fanatics: 'fanatics.com',
  'berkshire hathaway energy': 'brkenergy.com',
};
