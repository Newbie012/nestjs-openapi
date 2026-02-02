'use client';

import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { Check } from 'lucide-react';

const exampleInput = `export class OrderDto {
  status: 'pending' | 'shipped' | 'delivered';
}`;

const swaggerOutput = `{ "status": { "type": "object" } }`;

const staticOutput = `{
  "status": {
    "type": "string",
    "enum": ["pending", "shipped", "delivered"]
  }
}`;

const codeBlockStyles =
  '[&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!border-none [&_pre]:text-xs [&_figure]:!m-0 [&_figure]:!border-none [&_figure]:!rounded-none [&>div]:!border-none [&>div]:!rounded-none [&_button]:!hidden';

export function CodeComparison() {
  return (
    <div className="relative h-[20rem]">
      {/* Input - top */}
      <div className="absolute left-4 right-4 top-0 rotate-[-1deg] shadow-xl rounded-lg overflow-hidden border border-fd-border bg-fd-background z-10">
        <div className="h-8 px-3 bg-fd-muted border-b border-fd-border flex items-center">
          <span className="text-xs text-fd-muted-foreground font-mono">
            input.ts
          </span>
        </div>
        <div className={codeBlockStyles}>
          <DynamicCodeBlock lang="typescript" code={exampleInput} />
        </div>
      </div>

      {/* Static output - our library (positioned first, below input) */}
      <div className="absolute left-0 top-28 rotate-[1deg] w-[80%] shadow-2xl rounded-lg overflow-hidden border border-emerald-500/30 bg-fd-background z-20">
        <div className="h-8 px-3 bg-emerald-500/10 border-b border-emerald-500/30 flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-xs text-emerald-500 font-mono">
            nestjs-openapi-static
          </span>
        </div>
        <div className={codeBlockStyles}>
          <DynamicCodeBlock lang="json" code={staticOutput} />
        </div>
      </div>

      {/* Swagger output - official (on top, overlapping) */}
      <div className="absolute right-0 top-56 rotate-[-2deg] w-[80%] shadow-lg rounded-lg overflow-hidden border border-fd-border bg-fd-background z-30">
        <div className="h-8 px-3 bg-fd-muted border-b border-fd-border flex items-center">
          <span className="text-xs text-fd-muted-foreground font-mono">
            @nestjs/swagger
          </span>
        </div>
        <div className={codeBlockStyles}>
          <DynamicCodeBlock lang="json" code={swaggerOutput} />
        </div>
      </div>
    </div>
  );
}
