import { OGImage } from '@/lib/og-image';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const revalidate = false;

// Default values for homepage
const DEFAULTS = {
  title: 'NestJS to OpenAPI. Types in, types out.',
  description:
    'Generate OpenAPI specs from NestJS using static analysis. No runtime required - your TypeScript types become accurate schemas.',
};

// Load Inter font (WOFF format - Satori doesn't support WOFF2)
async function loadInterFont() {
  const [interRegular, interSemiBold, interBold] = await Promise.all([
    fetch(
      'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff',
    ).then((res) => res.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff',
    ).then((res) => res.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hjp-Ek-_EeA.woff',
    ).then((res) => res.arrayBuffer()),
  ]);

  return [
    {
      name: 'Inter',
      data: interRegular,
      weight: 400 as const,
      style: 'normal' as const,
    },
    {
      name: 'Inter',
      data: interSemiBold,
      weight: 600 as const,
      style: 'normal' as const,
    },
    {
      name: 'Inter',
      data: interBold,
      weight: 700 as const,
      style: 'normal' as const,
    },
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Get title and description from query params, with defaults
  const title = searchParams.get('title') || DEFAULTS.title;
  const description = searchParams.get('description') || DEFAULTS.description;
  const section = searchParams.get('section') || undefined;

  // Load assets in parallel
  const [fonts, logoData] = await Promise.all([
    loadInterFont(),
    readFile(join(process.cwd(), 'public', 'logo-og.png')),
  ]);

  const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`;

  return new ImageResponse(
    <OGImage
      title={title}
      description={description}
      logoSrc={logoBase64}
      section={section}
    />,
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );
}
