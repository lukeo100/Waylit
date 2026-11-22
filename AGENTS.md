# Instructions for AI coding agents

This file applies to any AI coding agent working in this repository. Humans should read [CONTRIBUTING.md](CONTRIBUTING.md).

## Read first

1. [docs/AGENT_BRIEF.md](docs/AGENT_BRIEF.md) for the goal, scope, constraints and task list.
2. [docs/VISION.md](docs/VISION.md) and [docs/ROADMAP.md](docs/ROADMAP.md) for context.
3. The latest entries in [CHANGELOG.md](CHANGELOG.md).

Work only within the brief. If a request falls outside it, stop and propose an amendment in an issue instead of widening the work.

## Rules

- **Public repository.** Everything committed is visible forever. Never commit secrets, tokens, `.env` files, private URLs, real location data, GPS traces or personal information. Use `.env.example` for variable names only.
- **Runs without keys.** The app must work with no API keys, using the fallback map and mock data. Keys come from each deployer's environment variables.
- **Architecture.** Keep navigation logic separate from rendering. Keep map providers behind the provider interface. Reach vehicles only through the vehicle interface, and fall back to GPS when telemetry is missing.
- **Vehicle safety.** Never write code that sends commands to vehicle firmware, braking or other critical systems. Telemetry is read-only unless a maintainer has agreed otherwise in an issue.
- **Third party content.** Do not add copyrighted third party assets, logos or artwork. Models, icons and sample media must be original or under a compatible licence. Record new dependencies in `docs/THIRD_PARTY.md`.
- **Cost.** Use free tiers only. Do not add anything that needs a paid plan.
- **Writing style.** Plain language. No emojis in docs or UI copy unless needed. Avoid em dashes.
- **Docs.** Update the docs and add a line under Unreleased in `CHANGELOG.md` for every user-visible change.

## Commits and pull requests

- Commits belong to the human who owns the contribution. Do not set an AI agent as author or committer, and do not add AI co-author or session trailers to commit messages. Check `git log --format='%an <%ae> | %cn <%ce>'` before pushing.
- Use [Conventional Commits](https://www.conventionalcommits.org/) such as `feat(hud): show next turn distance`.
- Contributors open pull requests against `dev`. Maintainer-approved agents may commit to `dev` and open `dev` to `main` pull requests. Never push to `main`.
- Run lint, typecheck, test and build before proposing a change, once those scripts exist.

## Commands

Use Node.js 22 (`.nvmrc`) and the pnpm version pinned in `package.json` (`corepack enable`).

```sh
pnpm install         # install the workspace
pnpm dev             # web app dev server on http://localhost:3000
pnpm lint            # ESLint in every workspace
pnpm typecheck       # tsc in every workspace
pnpm test            # Vitest, all packages
pnpm build           # production build of apps/web
pnpm format          # Prettier (format:check to check only)
```

Package layout and dependency rules are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Design tokens are in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Keep `packages/*` free of DOM and React.
