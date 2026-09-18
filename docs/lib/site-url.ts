const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL ??
  'http://localhost:3000';

export const siteUrl = rawSiteUrl.startsWith('http')
  ? rawSiteUrl
  : `https://${rawSiteUrl}`;
