'use client';

import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#fff',
    primaryBorderColor: '#60a5fa',
    lineColor: '#94a3b8',
    secondaryColor: '#1e293b',
    tertiaryColor: '#334155',
    background: '#0f172a',
    mainBkg: '#1e293b',
    nodeBorder: '#475569',
    clusterBkg: '#1e293b',
    clusterBorder: '#475569',
    titleColor: '#f1f5f9',
    edgeLabelBackground: '#1e293b',
  },
});

export interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps): React.ReactElement {
  const id = useId();
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    const renderChart = async () => {
      try {
        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${id.replace(/:/g, '')}`,
          chart,
        );
        setSvg(renderedSvg);
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        setSvg(`<pre>Error rendering diagram</pre>`);
      }
    };

    renderChart();
  }, [chart, id]);

  return (
    <div
      className="my-4 flex justify-center overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
