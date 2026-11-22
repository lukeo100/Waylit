/**
 * The middle of the riding screen belongs to the 3D scene (task 8). Until it lands this is a
 * dark gradient and nothing else, and nothing is drawn over the centre.
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

/**
 * A strip along the bottom edge reserved for map and data credits (Google, Cesium ion and
 * OpenStreetMap contributors). It is its own row in the screen grid, so no HUD panel can
 * overlap it, and the 3D scene's attribution control mounts here.
 */
export function AttributionSlot() {
  return (
    <footer
      id="attribution-slot"
      data-testid="attribution-slot"
      data-slot="attribution"
      aria-label="Map and data credits"
      className="col-span-3 col-start-1 row-start-4 flex min-h-6 items-center border-t border-dashed border-glass-border px-1 text-xs text-text-muted tight:min-h-5"
    >
      Credits area: map and data attributions appear here.
    </footer>
  );
}
