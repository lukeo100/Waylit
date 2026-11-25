import type { ReactNode } from "react";

interface DockProps {
  /** Left half: the media player. */
  readonly media: ReactNode;
  /** Right half: the vehicle dashboard. */
  readonly vehicle: ReactNode;
}

/**
 * The one joined glass dock along the bottom: media player on the left, vehicle dashboard on
 * the right, split by a hairline divider. It is inset from the screen edges, has rounded
 * corners, and is flat and translucent (no blur). Nothing else sits in the bottom corners.
 */
export function Dock({ media, vehicle }: DockProps) {
  return (
    <div
      data-testid="dock"
      className="wl-glass relative grid min-h-[clamp(3.75rem,17dvh,5.75rem)] grid-cols-[minmax(0,1fr)_1px_auto] overflow-hidden"
    >
      {media}
      <div
        role="separator"
        aria-orientation="vertical"
        data-testid="dock-divider"
        className="my-[clamp(0.5rem,2.2dvh,0.9rem)] bg-glass-border"
      />
      {vehicle}
    </div>
  );
}
