# Contributing to Waylit

Thanks for helping. Waylit is open source under the Apache License 2.0 and is built for everyone who rides, not just its maintainer. The project is pre-alpha, so some things below describe how it will work as code lands.

## Ways to help

- Report bugs and suggest features through the issue templates.
- Test on real devices and report what you see, including phone model, browser and operating system.
- Improve documentation, especially anything that confused you while setting up or deploying.
- Contribute code, design and accessibility fixes, or turn rough ideas into well-described issues.

## Before you start

1. Read the [README](README.md), the [vision](docs/VISION.md) and the [roadmap](docs/ROADMAP.md).
2. Read the [code of conduct](CODE_OF_CONDUCT.md). It applies everywhere in the project.
3. For anything bigger than a small fix, open an issue first so we can agree on the approach before you spend time on it. Typo fixes and small documentation improvements can go straight to a pull request.

## Development setup

Application code is still arriving, so exact commands will be documented here and in `docs/` once the app exists. The rules we are building toward:

- Cloning, installing and running the app needs no API keys or accounts. Optional providers fall back to a built-in map and mock data.
- One documented command each for dev server, lint, typecheck, test and build.
- Pinned toolchain versions and a committed lockfile.

If the setup instructions are missing or wrong for you, that is a bug. Please open an issue.

## Workflow

1. Fork the repository and create a branch from `dev`. Name it `feat/...`, `fix/...`, `docs/...` or `chore/...`.
2. Make one focused change per pull request.
3. Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/) style, for example `feat(hud): show next turn distance`. Use the imperative mood and keep the subject under 72 characters.
4. Add or update tests, update the docs, and add a line under **Unreleased** in `CHANGELOG.md`.
5. Open a pull request against `dev` and fill in the template. CI must pass.
6. A maintainer reviews it. This is a hobby project, so reviews are best effort and may take a while. The `main` branch only receives reviewed merges from `dev`.

## Design and code principles

- **Separate navigation logic from rendering.** Routing, positioning and speed-zone logic must not depend on the 3D renderer.
- **Keep providers replaceable.** Map and 3D tile providers sit behind an interface. Do not leak a provider's types into shared code.
- **Go through the vehicle interface.** All vehicle data comes through the vehicle abstraction. Handle missing telemetry gracefully and fall back to GPS.
- **Never touch vehicle control.** No code may write to firmware, braking or other critical vehicle systems. Reading telemetry is the default. Anything beyond that needs a maintainer discussion in an issue first.
- **Performance matters.** Test on mid-range Android phones. Prefer a stable frame rate over visual complexity.
- **No hardcoded keys, accounts or project identifiers.** Anything that needs a key must also work without it.
- **Readable UI.** Large touch targets, high contrast, minimal interaction while moving.
- **Writing style.** Plain language in docs and UI copy. No emojis in UI copy unless needed. Avoid em dashes.

## Secrets, privacy and data

Never commit secrets, tokens, `.env` files, private URLs, your home location, or GPS traces of real rides, yours or anyone else's. Use `.env.example` for variable names only. If you commit a secret by accident, rotate it first, then tell us through [SECURITY.md](SECURITY.md) so we can clean the history.

## Licensing and third party content

- By submitting a contribution you agree it is licensed under the Apache License 2.0. This is the standard inbound equals outbound rule in section 5 of the licence. There is no CLA and no DCO sign-off.
- Only submit work you have the right to submit.
- Do not add third party copyrighted material such as images, 3D models, music, album art, fonts without a compatible licence, or logos.
- Do not use Segway-Ninebot, Tesla or Google logos or artwork.
- New dependencies must have licences compatible with Apache 2.0. Add them to [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) with any required attribution.

## AI assisted contributions

Waylit is developed with AI assistance, and contributions made with AI tools are welcome on these terms:

- You have read, run and understood every line you submit, and you take responsibility for it.
- Pull requests of bulk, unreviewed generated output may be closed without review.
- If a change was substantially generated, tick the box in the pull request template.
- AI coding agents working in this repository should read [AGENTS.md](AGENTS.md).

## Vehicle protocol research

Work on reverse engineering or integrating vehicle Bluetooth protocols must respect local law and the manufacturer's terms, and must not interfere with firmware or safety systems. Open an issue to discuss the approach before writing code.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
