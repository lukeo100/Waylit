interface StartPromptProps {
  readonly onStart: () => void;
}

/**
 * Shown before a trip, low in the clear middle of the screen so it stays off the speed and the
 * turn and above the dock. The page places it. It is the only thing over the scene area.
 */
export function StartPrompt({ onStart }: StartPromptProps) {
  return (
    <div
      data-testid="start-prompt"
      className="pointer-events-auto flex flex-col items-center gap-[0.8dvh] text-center"
    >
      <button
        type="button"
        onClick={onStart}
        data-testid="start-trip"
        className="inline-flex min-h-[clamp(2.75rem,12dvh,3.5rem)] min-w-[clamp(9rem,22vw,12rem)] items-center justify-center rounded-md bg-cyan px-6 text-hud-lg font-semibold text-night-950 transition-colors duration-200 ease-out hover:bg-cyan-soft"
      >
        Start trip
      </button>
      <p className="text-hud-sm leading-snug text-text-secondary">
        Simulated ride on a demo route. Nothing here controls your scooter.
      </p>
    </div>
  );
}
