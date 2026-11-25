# Waylit

Open source 3D navigation for electric scooters and bicycles.

> **Status: pre-alpha.** The project structure, design system, installable PWA shell and a placeholder home page are in place. The riding screen and 3D view arrive phase by phase, see the [roadmap](docs/ROADMAP.md).

## What it is

Waylit aims to feel like a dedicated navigation cockpit rather than a flat map on a phone. The main screen is an immersive third-person 3D view of the road ahead, with a glowing route corridor, floating turn indicators and a heads-up display for speed, next turn, arrival time and vehicle status.

- **PWA first.** An installable, landscape-oriented progressive web app, runnable from a normal browser or installed to the home screen. A native Expo app follows later and is meant to look and behave the same.
- **Vehicle agnostic.** Telemetry comes through a vehicle interface, so any scooter or bicycle can get an adapter. The first development vehicle is the Segway Ninebot MAX G3, starting with simulated telemetry. GPS is always the fallback.
- **Provider agnostic.** Map and 3D tile providers sit behind an interface and can be swapped. The app must run with no API keys, using a fallback map and mock data.
- **Speed zones, later.** A community-maintained layer for road speed limits and custom path zones, kept separate from personal preferences and never presented as legal advice.

Read the [vision](docs/VISION.md) for the full picture.

## Safety

Waylit is a navigation aid, not a safety system. Follow your local road and path rules, stay alert, and do not interact with the screen while riding. The software is provided without warranty, see the licence. Nothing in this project should ever write to a vehicle's firmware, braking or other critical systems.

## Getting started

You need Node.js 22 (see `.nvmrc`) and Git. pnpm is pinned in `package.json` and provided by Corepack, which ships with Node.js. No accounts or API keys are needed.

```sh
git clone https://github.com/lukeo100/Waylit.git waylit
cd waylit
corepack enable
pnpm install
pnpm dev
```

Then open http://localhost:3000. The service worker only runs in production builds. To try install and offline behaviour, see [docs/PWA.md](docs/PWA.md).

| Command | What it does |
|---|---|
| `pnpm dev` | Start the web app in development mode |
| `pnpm build` | Production build of the web app |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Lint every workspace |
| `pnpm typecheck` | Type check every workspace |
| `pnpm test` | Run the unit tests once |
| `pnpm format` | Format code with Prettier (`pnpm format:check` to check only) |

The code is split into a Next.js app and small shared packages, described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The riding screen shows a 3D environment. Without any key it uses MapLibre with OpenFreeMap. With your own Cesium ion token (`NEXT_PUBLIC_CESIUM_ION_TOKEN`), production builds show Google Photorealistic 3D Tiles through CesiumJS and fall back to MapLibre if that fails. Development builds always use the fallback unless you add `?map=cesium` to the address, to save the Cesium ion allowance. `?map=fallback` forces the fallback anywhere, and `?dev=1` shows a frame rate overlay. The scene light follows your phone clock by default (so it is dark when it is night where you are), and `?sun=real` uses the real sun at the demo route instead; there is also a switch on the start screen. `?fx=off`, `?fx=low` and `?fx=high` set the futuristic look (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). The map button beside the minimap switches between Google 3D tiles and the fallback map and sets the hologram screen effect; it remembers the choice on the device, and the address still wins. Each switch to Google uses a Cesium ion request. See [docs/DEPLOYING.md](docs/DEPLOYING.md).

Anyone should be able to deploy their own copy. The plan for that is in [docs/DEPLOYING.md](docs/DEPLOYING.md). Waylit does not run a shared hosted instance, so there are no shared API keys: you bring your own for any optional provider.

## Contributing

Contributions of all kinds are welcome, including bug reports, device testing, documentation, design and code. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](SECURITY.md). Questions go to [SUPPORT.md](SUPPORT.md).

## Documentation

| Document | What it covers |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Goals, principles and design direction |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases and current status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Package layout, dependency rules and the 3D scene |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Design tokens and visual principles |
| [docs/PWA.md](docs/PWA.md) | Installing, offline caching, wake lock, testing on Android and PWA limits |
| [docs/DEPLOYING.md](docs/DEPLOYING.md) | Running your own copy |
| [docs/MAINTAINING.md](docs/MAINTAINING.md) | Repository settings and release process |
| [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) | Third party licences and required attributions |
| [docs/AGENT_BRIEF.md](docs/AGENT_BRIEF.md) | Project brief used by AI coding agents |

## Licence

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Disclaimer

Waylit is an independent project. It is not affiliated with or endorsed by Segway-Ninebot, Tesla, Google, Cesium or OpenStreetMap. Product and company names appear only to describe compatibility or to credit data sources.
