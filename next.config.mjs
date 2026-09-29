/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The build writes the board to .snapshot/feed.json (scripts/build-snapshot.ts)
  // and lib/ingest.ts reads it at runtime with fs, which the file tracer can't
  // see — so it's named here, for every server route, or Vercel would ship the
  // functions without it and every fresh instance would fetch ~45MB first.
  outputFileTracingIncludes: {
    '/': ['./.snapshot/**'],
    '/**': ['./.snapshot/**'],
  },
};

export default nextConfig;
