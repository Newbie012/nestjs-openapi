import Link from 'next/link';
import Image from 'next/image';
import {
  Zap,
  FileCode2,
  GitBranch,
  ArrowRight,
  Check,
  Terminal,
  Shield,
  Code2,
  Search,
} from 'lucide-react';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { CopyButton } from '@/components/copy-button';
import { CodeComparison } from '@/components/code-comparison';

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative px-6 pt-20 pb-16 md:pt-28 md:pb-24 overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage: `linear-gradient(to right, #ea2845 1px, transparent 1px),
                              linear-gradient(to bottom, #ea2845 1px, transparent 1px)`,
            backgroundSize: '2.5rem 2.5rem',
            maskImage: 'linear-gradient(to bottom, white 0%, transparent 40%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, white 0%, transparent 40%)',
          }}
        />
        <div className="mx-auto max-w-3xl">
          <Image
            src="/logo.png"
            alt="nestjs-openapi logo"
            width={180}
            height={180}
            className="mb-8"
          />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-fd-foreground">
            NestJS to OpenAPI. Types in, types out.
          </h1>
          <p className="mt-6 text-lg text-fd-muted-foreground leading-relaxed max-w-2xl">
            Generates OpenAPI specs from your NestJS code. Better output, less
            decorators, and your types actually make it through.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/docs/quick-start" className="btn-primary">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/docs" className="btn-secondary">
              Documentation
            </Link>
          </div>

          {/* Install command */}
          <div className="mt-10 inline-flex items-center gap-3 rounded-lg bg-fd-muted px-4 py-2.5 font-mono text-sm">
            <span className="text-fd-muted-foreground">$</span>
            <code className="text-fd-foreground">{installCommand}</code>
            <CopyButton text={installCommand} />
          </div>
        </div>
      </section>

      {/* Why section */}
      <section className="px-6 py-20 border-t border-fd-border overflow-hidden">
        <div className="mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-fd-foreground">
                Why bother with this?
              </h2>
              <p className="mt-4 text-fd-muted-foreground leading-relaxed">
                The official swagger module uses runtime reflection, which loses
                type info. Unions become <code>object</code>, generics
                disappear, you know the drill.
              </p>
              <p className="mt-3 text-fd-muted-foreground leading-relaxed">
                This tool reads your TypeScript directly, so your types actually
                show up in the spec. Less decorators to maintain, fewer
                surprises.
              </p>
            </div>

            <CodeComparison />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 py-16 border-t border-fd-border">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold tracking-tight text-fd-foreground mb-10">
            What you get
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="feature-card">
                <feature.icon className="h-5 w-5 text-fd-primary mb-3" />
                <h3 className="font-medium text-fd-foreground mb-1.5">
                  {feature.title}
                </h3>
                <p className="text-sm text-fd-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="px-6 py-16 border-t border-fd-border">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-fd-foreground mb-8">
            How they compare
          </h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-fd-muted-foreground uppercase tracking-wide mb-4">
                @nestjs/swagger
              </h3>
              <ul className="space-y-2.5 text-sm">
                {traditionalItems.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-fd-muted-foreground"
                  >
                    <span className="text-fd-muted-foreground mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-medium text-fd-primary uppercase tracking-wide mb-4">
                nestjs-openapi
              </h3>
              <ul className="space-y-2.5 text-sm">
                {staticItems.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-fd-foreground"
                  >
                    <Check className="h-4 w-4 text-fd-primary mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Example */}
      <section className="px-6 py-16 border-t border-fd-border">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-fd-foreground mb-2">
            A quick example
          </h2>
          <p className="text-fd-muted-foreground mb-6">
            Create a config file, run the CLI, done.
          </p>

          <DynamicCodeBlock lang="typescript" code={configExample} />

          <div className="mt-4">
            <DynamicCodeBlock lang="bash" code="npx nestjs-openapi generate" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 border-t border-fd-border">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-fd-foreground">
            Give it a try
          </h2>
          <p className="mt-3 text-fd-muted-foreground">
            One config file, one CLI command. See what your spec actually looks
            like.
          </p>
          <div className="mt-6">
            <Link href="/docs/installation" className="btn-primary">
              Read the docs
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-fd-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between text-sm text-fd-muted-foreground">
          <span>nestjs-openapi</span>
          <span>MIT License</span>
        </div>
      </footer>
    </main>
  );
}

const features = [
  {
    icon: Zap,
    title: 'No runtime required',
    description:
      'Generate specs without compiling TypeScript or bootstrapping your application.',
  },
  {
    icon: GitBranch,
    title: 'CI/CD friendly',
    description: 'Run in pipelines without spinning up your app or services.',
  },
  {
    icon: Code2,
    title: 'Full type fidelity',
    description:
      'Preserves unions, generics, and import aliases that reflect-metadata loses.',
  },
  {
    icon: Shield,
    title: 'Security schemes',
    description:
      'Full support for Bearer, API Key, OAuth2, and custom security schemes.',
  },
  {
    icon: FileCode2,
    title: 'class-validator support',
    description:
      'Extracts validation rules and converts them to JSON Schema constraints.',
  },
  {
    icon: Search,
    title: 'Spec validation warnings',
    description:
      'Detects broken $refs and highlights missing schemas before you ship.',
  },
  {
    icon: Terminal,
    title: 'Flexible filtering',
    description:
      'Filter endpoints by decorator or path pattern for subset specs.',
  },
];

const traditionalItems = [
  'Runtime reflection loses types',
  'Unions become object',
  'Requires app bootstrap',
  'Environment setup needed',
  'Decorators fill the gaps',
];

const staticItems = [
  'Reads source directly',
  'Unions stay intact',
  'No bootstrap needed',
  'Runs anywhere, no setup',
  'Types are the source of truth',
];

const installCommand = 'npm install -D nestjs-openapi';

const configExample = `import { defineConfig } from 'nestjs-openapi';

export default defineConfig({
  output: 'openapi.json',
  files: {
    entry: 'src/app.module.ts',
  },
  openapi: {
    info: {
      title: 'My API',
      version: '1.0.0',
    },
  },
});`;
