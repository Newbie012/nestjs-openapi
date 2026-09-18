import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { siteUrl } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    ...source.getPages().map((page) => ({
      url: new URL(page.url, siteUrl).toString(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
