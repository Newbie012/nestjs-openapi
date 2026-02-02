import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2.5 font-semibold">
          <Image src="/logo.png" alt="Logo" width={28} height={28} />
          <span className="text-fd-foreground">nestjs-openapi-static</span>
        </div>
      ),
      transparentMode: 'top',
    },
    githubUrl: 'https://github.com/your-repo/nestjs-openapi-static',
    links: [],
  };
}
