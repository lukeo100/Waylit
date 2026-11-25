import type { ReactNode } from "react";

interface DockProps {
  /** Left half: the media player. */
  readonly media: ReactNode;
  /** Right half: the vehicle dashboard. */
  readonly vehicle: ReactNode;
}

/**
 * The one joined glass dock along the bottom: media player on the left, vehicle dashboard on
 * the right, split by a hairline divider. It is sized to its content and centred by the page,
 * never wider than 80 percent of the screen (or 42rem on small phones, where the content needs
 * it), so it floats with a margin on both sides. It has rounded corners, and is flat and
 * translucent (no blur). Its fill covers only the dock itself, never a band across the screen.
 * Nothing else sits in the bottom corners.
 */
export function Dock({ media, vehicle }: DockProps) {
  return (
    <div
      data-testid="dock"
      className="wl-glass wl-enter wl-enter-late relative grid min-h-[clamp(3.5rem,15dvh,5rem)] w-fit max-w-[min(100%,max(80vw,42rem))] min-w-0 grid-cols-[minmax(0,auto)_1px_auto] overflow-hidden"
    >
      {media}
      <div
        role="separator"
        aria-orientation="vertical"
        data-testid="dock-divider"
        className="my-[clamp(0.55rem,2.6dvh,1rem)] bg-glass-border"
      />
      {vehicle}
    </div>
  );
}
