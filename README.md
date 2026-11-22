# Waylit

Open source 3D navigation for electric scooters and bicycles.

> **Status: pre-alpha.** There is nothing to install yet. The repository currently holds the project foundations, documentation and plans. Application code arrives phase by phase, see the [roadmap](docs/ROADMAP.md).

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

Setup instructions will appear here with the first application commit. The goal is simple: clone, install, run, with no accounts or keys needed.

Anyone should be able to deploy their own copy. The plan for that is in [docs/DEPLOYING.md](docs/DEPLOYING.md). Waylit does not run a shared hosted instance, so there are no shared API keys: you bring your own for any optional provider.

## Contributing

Contributions of all kinds are welcome, including bug reports, device testing, documentation, design and code. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](SECURITY.md). Questions go to [SUPPORT.md](SUPPORT.md).

## Documentation

| Document | What it covers |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Goals, principles and design direction |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases and current status |
| [docs/DEPLOYING.md](docs/DEPLOYING.md) | Running your own copy |
| [docs/MAINTAINING.md](docs/MAINTAINING.md) | Repository settings and release process |
| [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) | Third party licences and required attributions |
| [docs/AGENT_BRIEF.md](docs/AGENT_BRIEF.md) | Project brief used by AI coding agents |

## Licence

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Disclaimer

Waylit is an independent project. It is not affiliated with or endorsed by Segway-Ninebot, Tesla, Google, Cesium or OpenStreetMap. Product and company names appear only to describe compatibility or to credit data sources.
