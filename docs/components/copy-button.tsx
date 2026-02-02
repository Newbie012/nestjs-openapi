'use client';

import { Check, Copy } from 'lucide-react';
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button';

export function CopyButton({ text }: { text: string }) {
  const [checked, onClick] = useCopyButton(() => {
    navigator.clipboard.writeText(text);
  });

  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded hover:bg-fd-muted-foreground/10 text-fd-muted-foreground hover:text-fd-foreground transition-colors"
      aria-label="Copy to clipboard"
    >
      {checked ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
