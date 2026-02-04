import { getPageImage, source } from '@/lib/source';
import { OGImage } from '@/lib/og-image';
import { loadInterFont } from '@/lib/og-fonts.js';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<'/og/docs/[...slug]'>,
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  // Load assets in parallel
  const [fonts, logoData] = await Promise.all([
    loadInterFont(),
    readFile(join(process.cwd(), 'public', 'logo-og.png')),
  ]);

  const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`;

  return new ImageResponse(
    <OGImage
      title={page.data.title}
      description={page.data.description}
      logoSrc={logoBase64}
      section="Documentation"
    />,
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
}
