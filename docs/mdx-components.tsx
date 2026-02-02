import defaultMdxComponents from 'fumadocs-ui/mdx';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import * as Twoslash from 'fumadocs-twoslash/ui';
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/components/mermaid';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    ...Twoslash,
    Mermaid,
    ...components,
  };
}
