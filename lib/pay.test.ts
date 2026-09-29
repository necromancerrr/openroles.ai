import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPay } from './pay';
import { parseCSV } from './csv';

// Real compensation strings from the feeds, 2026-09-29.
const cases: [string, string | undefined][] = [
  ['25–33 USD/hr', '$25–33/hr'],
  ['$35/hr', '$35/hr'],
  ['$25–$27/hr', '$25–27/hr'],
  ['$85,000 Annually', '$85k/yr'],
  ['$76,700 - $152,200 annually', '$76.7k–152k/yr'],
  ['$124,000 - $162,000 USD', '$124k–162k/yr'],
  ['$175,000', '$175k/yr'],
  ['$45.50 per hour', '$45.5/hr'],
  // A total for a fixed-length internship is not an annual salary.
  ['$12K • 10 week internship in NYC', undefined],
  // Other currencies aren't converted, so they aren't shown.
  ['€45,000 - €55,000', undefined],
  ['', undefined],
  ['Competitive', undefined],
];

for (const [input, expected] of cases) {
  test(`formatPay(${JSON.stringify(input)})`, () => {
    assert.equal(formatPay(input), expected);
  });
}

test('parseCSV handles quotes, embedded commas, doubled quotes and CRLF', () => {
  const rows = parseCSV('id,company,location\r\n1,"Acme, Inc.","Austin, TX"\r\n2,"Say ""hi""",NYC\r\n');
  assert.deepEqual(rows, [
    { id: '1', company: 'Acme, Inc.', location: 'Austin, TX' },
    { id: '2', company: 'Say "hi"', location: 'NYC' },
  ]);
});
