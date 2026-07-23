'use client';

// Type-ahead for the location tail — §2.4 / §5.4. Top locations get chips; the
// long tail (383 distinct values) is reachable here. A datalist keeps it a thin
// client island: pick a value, we navigate to the same URL-param filter the
// chips use, so state stays in the query string.

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LocationTypeahead({
  options,
  slugFor,
  hrefFor,
}: {
  options: string[];
  // map display string -> slug
  slugFor: Record<string, string>;
  // map slug -> toggle href
  hrefFor: Record<string, string>;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');

  function go(v: string) {
    const slug = slugFor[v];
    if (slug && hrefFor[slug]) {
      router.push(hrefFor[slug], { scroll: false });
      setValue('');
    }
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
          if (slugFor[v]) go(v); // fires when a datalist option is chosen
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
