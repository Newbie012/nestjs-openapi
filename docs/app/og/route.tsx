import { OGImage } from '@/lib/og-image';
import { loadInterFont } from '@/lib/og-fonts.js';
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
