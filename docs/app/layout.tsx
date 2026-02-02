import { RootProvider } from 'fumadocs-ui/provider/next';
import { Banner } from 'fumadocs-ui/components/banner';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'nestjs-openapi-static',
    template: '%s | nestjs-openapi-static',
  },
  description: 'Generate OpenAPI specs from NestJS apps using static analysis',
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
      </body>
    </html>
  );
}
