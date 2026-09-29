import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// The entry points worth indexing. Filter combinations aren't listed: they're
// all reachable from these, and a sitemap of every chip permutation is spam.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/?type=new_grad`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/?campus=1`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${SITE_URL}/status`, changeFrequency: 'hourly', priority: 0.3 },
  ];
}
