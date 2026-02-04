// Shared OG image component for consistent branding across all pages
// Uses Tailwind CSS via Satori's tw prop

export interface OGImageProps {
  title: string;
  description?: string;
  logoSrc: string;
  /** Label shown in footer (e.g., "Documentation", "Home") */
  section?: string;
}

// Grid pattern - manually create fading lines since maskImage isn't supported in Satori
function GridPattern() {
  const gridSize = 60; // Larger squares
  const fadeEndY = 300; // ~48% of 630px
  const baseOpacity = 0.25; // More visible grid
  const lines: React.ReactNode[] = [];

  // Horizontal lines with fade
  for (let row = 0; row <= 6; row++) {
    const y = row * gridSize;
    const fade = Math.max(0, 1 - y / fadeEndY);
    if (fade < 0.05) continue;
    const opacity = baseOpacity * fade;

    lines.push(
      <div
        key={`h-${row}`}
        tw="absolute left-0 right-0"
        style={{
          top: y,
          height: 1,
          backgroundColor: `rgba(234, 40, 69, ${opacity})`,
        }}
      />,
    );
  }

  // Vertical lines with fade (as segments)
  for (let col = 0; col <= 20; col++) {
    for (let segment = 0; segment < 6; segment++) {
      const y = segment * gridSize;
      const segmentHeight = Math.min(gridSize, fadeEndY - y);
      if (segmentHeight <= 0) continue;

      const midY = y + segmentHeight / 2;
      const fade = Math.max(0, 1 - midY / fadeEndY);
      if (fade < 0.05) continue;
      const opacity = baseOpacity * fade;

      lines.push(
        <div
          key={`v-${col}-${segment}`}
          tw="absolute"
          style={{
            left: col * gridSize,
            top: y,
            width: 1,
            height: segmentHeight,
            backgroundColor: `rgba(234, 40, 69, ${opacity})`,
          }}
        />,
      );
    }
  }

  return <div tw="absolute inset-0 flex">{lines}</div>;
}

export function OGImage({
  title,
  description,
  logoSrc,
  section,
}: OGImageProps) {
  return (
    <div
      tw="flex flex-col w-full h-full bg-[#0f0f12] relative"
      style={{ fontFamily: 'Inter' }}
    >
      {/* Grid background */}
      <GridPattern />

      {/* Content - left-aligned like homepage */}
      <div tw="flex flex-col justify-center flex-1 pl-16 pr-20 py-16 relative">
        {/* Logo */}
        <img src={logoSrc} alt="" width={140} height={140} tw="mb-6" />

        {/* Title - semibold (600) like homepage */}
        <div
          tw="flex text-6xl text-[#ececee] tracking-tight leading-tight"
          style={{ fontWeight: 600 }}
        >
          {title}
        </div>

        {/* Description - larger (text-4xl) */}
        {description ? (
          <div tw="flex text-4xl text-[#9898a0] mt-6 leading-snug max-w-4xl">
            {description}
          </div>
        ) : null}

        {/* Section badge - self-sizing */}
        {section ? (
          <div tw="flex mt-8">
            <div
              tw="flex px-4 py-2 rounded-md"
              style={{
                backgroundColor: 'rgba(234, 40, 69, 0.1)',
                border: '1px solid rgba(234, 40, 69, 0.2)',
              }}
            >
              <span tw="flex text-xl text-[#ea2845] font-medium">
                {section}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
