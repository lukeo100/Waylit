/**
 * Decorative route corridor for the placeholder home page. Pure CSS and inline SVG,
 * no map provider and no 3D library. Hidden from assistive technology.
 */
const CHEVRON_COUNT = 9;

export function Corridor() {
  return (
    <div className="wl-corridor" aria-hidden="true">
      <div className="wl-corridor-plane">
        <div className="wl-corridor-road">
          <div className="wl-corridor-chevrons">
            {Array.from({ length: CHEVRON_COUNT }, (_, i) => (
              <svg key={i} viewBox="0 0 40 24" className="wl-chevron">
                <polyline points="4,20 20,6 36,20" />
              </svg>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
