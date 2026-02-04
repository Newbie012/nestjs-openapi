import { RootProvider } from 'fumadocs-ui/provider/next';
import { Banner } from 'fumadocs-ui/components/banner';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    (() => {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ??
        process.env.VERCEL_URL ??
        'http://localhost:3000';
      return siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
    })(),
  ),
  title: {
    default: 'nestjs-openapi-static',
    template: '%s | nestjs-openapi-static',
  },
  description:
    'Static analysis tool that generates OpenAPI specifications from NestJS applications. No runtime required - just your TypeScript types.',
  openGraph: {
    type: 'website',
    siteName: 'nestjs-openapi-static',
    images: '/og',
  },
  twitter: {
    card: 'summary_large_image',
    images: '/og',
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen antialiased">
        <RootProvider
          theme={{
            defaultTheme: 'dark',
            attribute: 'class',
            enableSystem: true,
          }}
        >
          <Banner id="wip-docs-notice">
            Docs are a work in progress - contributions welcome
          </Banner>
          {children}
        </RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
