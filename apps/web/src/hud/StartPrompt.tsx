interface StartPromptProps {
  readonly onStart: () => void;
}

/** Shown in the middle of the screen before a trip. The only thing over the scene area. */
export function StartPrompt({ onStart }: StartPromptProps) {
  return (
    <div
      data-testid="start-prompt"
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
    >
      <div className="pointer-events-auto flex max-w-[15rem] flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={onStart}
          data-testid="start-trip"
          className="inline-flex min-h-14 min-w-44 items-center justify-center rounded-md bg-volt px-6 text-xl font-bold text-night-950 shadow-glow-volt transition-colors duration-200 ease-out hover:bg-volt-soft"
        >
          Start trip
        </button>
        <p className="text-xs leading-snug text-text-secondary">
          Simulated ride on a demo route. Nothing here controls your scooter.
        </p>
      </div>
    </div>
  );
}
