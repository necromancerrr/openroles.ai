'use client';

// Type-ahead for the location tail — §2.4 / §5.4. Top locations get chips; the
// long tail (795 distinct values across both feeds, measured) is reachable
// here. A datalist keeps it a thin client island: pick a value, we navigate to
// the same URL-param filter the chips use, so state stays in the query string.
//
// Props are deliberately two scalars. Passing label→slug and slug→href maps for
// every tail location put ~40KB of duplicated strings in the RSC payload; the
// slug is a pure function of the label, and every href is the same string with
// the slug substituted, so we send the function's input and one template.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { locSlug } from '@/lib/taxonomy';
import { SLUG_PLACEHOLDER } from '@/lib/url';

export function LocationTypeahead({
  options,
  hrefTemplate,
}: {
  options: string[];
  // A toggle href for this facet with SLUG_PLACEHOLDER where the slug goes.
  hrefTemplate: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');

  function go(v: string) {
    const label = options.find((o) => o.toLowerCase() === v.trim().toLowerCase());
    if (!label) return;
    router.push(hrefTemplate.replace(SLUG_PLACEHOLDER, locSlug(label)), {
      scroll: false,
    });
    setValue('');
  }

  return (
    <>
      <input
        list="loc-tail"
        className="chip"
        style={{ minWidth: 160 }}
        placeholder="Search locations…"
        aria-label="Search all locations"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go((e.target as HTMLInputElement).value);
        }}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          // Fires when a datalist option is chosen outright.
          if (options.includes(v)) go(v);
        }}
      />
      <datalist id="loc-tail">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
