# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/) once it reaches a first release.

## [Unreleased]

### Added

- Project foundations: Apache 2.0 licence, README, contribution guide, code of conduct, security policy, issue and pull request templates, CI, Dependabot configuration and project documentation.
- Project structure: pnpm workspace with a Next.js App Router web app (`apps/web`) and shared packages `core`, `vehicle`, `map-provider` and `ui-tokens`, with strict TypeScript, ESLint, Prettier and Vitest. Pinned Node.js 22 and pnpm with a committed lockfile.
- Design system: dark glass tokens with electric blue and cyan accents, exposed as TypeScript values, CSS variables and a Tailwind theme. Documented in `docs/DESIGN_SYSTEM.md`.
- Placeholder home page with the app name, a safety notice and a link to the source code. Runs with no keys and makes no network calls.
- Read-only vehicle interface and map provider interface types, with no implementations yet.
- Docs: `docs/ARCHITECTURE.md`, run-locally steps in the README and `docs/DEPLOYING.md`, a proposed self-host path (static export), and dependency licences in `docs/THIRD_PARTY.md`.
- Optional `NEXT_PUBLIC_WAYLIT_SOURCE_URL` so forks can point the source link at their own repository.

### Changed

- CI uses the Node.js version from `.nvmrc` and also checks formatting. Dependabot now watches npm dependencies.
