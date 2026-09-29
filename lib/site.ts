// The production origin, for absolute URLs in link previews and the sitemap.
// Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deployment of a project;
// the fallback is the project's current production domain.
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://openroles-ai.vercel.app';
