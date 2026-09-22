import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb';
import { source } from '@/lib/source';
import { siteUrl } from '@/lib/site-url';

export function BreadcrumbJsonLd({ url }: { url: string }) {
  const items = getBreadcrumbItems(url, source.getPageTree(), {
    includeRoot: { url: '/docs' },
    includePage: true,
  }).filter(
    (item, i, all) =>
      typeof item.name === 'string' && (item.url || i === all.length - 1),
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: new URL(item.url, siteUrl).toString() } : {}),
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
      }}
    />
  );
}
