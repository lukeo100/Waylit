import { Corridor } from "@/components/Corridor";
import { InstallPrompt } from "@/components/InstallPrompt";
import { RideLink } from "@/components/RideLink";
import { sourceUrl } from "@/config";

export default function HomePage() {
  return (
    <main className="relative isolate grid flex-1 overflow-hidden landscape:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] short:landscape:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="relative order-2 min-h-[38dvh] landscape:order-none landscape:col-start-2 landscape:row-start-1 landscape:min-h-0">
        <Corridor />
      </div>

      <section className="relative z-10 flex flex-col justify-center gap-5 px-6 py-6 short:gap-3 short:py-4 landscape:col-start-1 landscape:row-start-1 sm:px-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-display leading-tight font-bold short:text-3xl tracking-display text-text">
            Waylit
          </h1>
          <p className="max-w-[38ch] text-lg leading-snug short:text-base text-text-secondary">
            Open source 3D navigation for electric scooters and bicycles.
          </p>
        </header>

        <p className="max-w-[52ch] text-sm leading-normal text-text-muted short:hidden">
          This is an early preview build. The riding screen, 3D view and simulated ride are on the
          way. Nothing here needs an account or an API key.
        </p>

        <aside
          aria-labelledby="safety-heading"
          className="wl-glass max-w-[52ch] border-l-4 border-l-caution px-4 py-3 short:py-2"
        >
          <h2 id="safety-heading" className="text-base font-semibold text-caution">
            Navigation aid, not a safety system
          </h2>
          <p className="mt-1 text-sm leading-normal text-text-secondary">
            Follow your local road and path rules, stay alert, and do not interact with the screen
            while riding. Waylit never controls your vehicle.
          </p>
        </aside>

        <div className="flex flex-wrap items-center gap-4">
          <a
            href={sourceUrl}
            className="inline-flex min-h-12 items-center rounded-md bg-volt px-5 text-base font-semibold text-night-950 shadow-glow-volt transition-colors duration-200 ease-out hover:bg-volt-soft"
          >
            View the source code
          </a>
          <RideLink>Open ride screen preview</RideLink>
          <InstallPrompt />
          <span className="text-sm text-text-muted">Apache License 2.0</span>
        </div>
      </section>
    </main>
  );
}
