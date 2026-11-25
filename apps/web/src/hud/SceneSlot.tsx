/**
 * The scene belongs to the 3D view (task 8). Until it lands this is a dark gradient that fills
 * the whole screen, and the HUD floats on it. Nothing is drawn over the centre.
 */
export function ScenePlaceholder() {
  return (
    <div
      data-testid="scene"
      data-slot="scene"
      role="img"
      aria-label="Placeholder for the 3D scene"
      className="wl-scene absolute inset-0"
    />
  );
}

interface AttributionSlotProps {
  /**
   * Show a faint label in the strip. Only for development builds and `?dev=1`, so a layout
   * check can see where the strip is. Riders never see it: in production the strip is empty
   * until real credits are mounted into it.
   */
  readonly showPlaceholder?: boolean;
}

/**
 * The reserved credits strip, a darker band along the bottom edge. It is its own row in the
 * screen grid, so no HUD panel can overlap it, and it is sized to fit the real credits later
 * (Google, Cesium ion and OpenStreetMap contributors), which the 3D scene's attribution
 * control mounts into. The scene must not draw over it.
 */
export function AttributionSlot({ showPlaceholder = false }: AttributionSlotProps) {
  return (
    <footer
      id="attribution-slot"
      data-testid="attribution-slot"
      data-slot="attribution"
      aria-label="Map and data credits"
      className="row-start-3 flex min-h-[clamp(1.25rem,5.2dvh,1.75rem)] items-center bg-credits px-[max(0.75rem,var(--wl-safe-left))] text-hud-sm text-text-muted"
    >
      {showPlaceholder ? <span className="opacity-60">Credits area (dev only)</span> : null}
    </footer>
  );
}
