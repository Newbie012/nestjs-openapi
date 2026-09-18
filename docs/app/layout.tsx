import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { siteUrl } from '@/lib/site-url';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'nestjs-openapi',
    template: '%s | nestjs-openapi',
  },
  description:
    'Static analysis tool that generates OpenAPI specifications from NestJS applications. No runtime required - just your TypeScript types.',
  openGraph: {
    type: 'website',
    siteName: 'nestjs-openapi',
    images: '/og',
  },
  twitter: {
    card: 'summary_large_image',
    images: '/og',
  },
  verification: {
    google: 'pWFmw4yXOsEC5_GbQfmHBCXVI4acmB6Bbt_TmdkAu2A',
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
          {children}
        </RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
