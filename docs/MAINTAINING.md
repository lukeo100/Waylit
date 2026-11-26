# Maintaining Waylit

A checklist and notes for the maintainer. Contributors do not need this file, but it is public so the process is transparent and easy to hand over.

## Repository settings checklist

Tick these in the repository settings on GitHub.

**General**
- [ ] Visibility is public and the default branch is `main`.
- [ ] Description and topics are set, for example `electric-scooter`, `navigation`, `pwa`, `3d-maps`, `typescript`.
- [ ] Issues and Discussions are on. Wikis are off.
- [ ] Squash merging is allowed, and "Automatically delete head branches" is on.

**Branch protection or rulesets**
- [ ] `main`: require a pull request, require the CI checks `Repository hygiene` and `Lint, typecheck, test, build` to pass, block force pushes and deletions.
- [ ] `dev`: block force pushes and deletions. Requiring pull requests or the CI checks on `dev` is optional, because the maintainer and approved agents fast forward to it. If you require them, expect to merge by pull request.
- [ ] Pushes to `main` only come from reviewed merges of `dev`.

**Security**
- [ ] Private vulnerability reporting is enabled, because `SECURITY.md` points to it.
- [ ] Secret scanning and push protection are on.
- [ ] Dependabot alerts and security updates are on.
- [ ] Optional: CodeQL code scanning with the default setup once application code exists.

**Actions**
- [ ] Default workflow permissions are read-only.
- [ ] Require approval to run workflows from first-time contributors and outside collaborators.

## First push

GitHub reads issue templates, `CODEOWNERS`, `SECURITY.md` and `dependabot.yml` from the default branch. When the repository is new, `main` holds only the licence until `dev` is merged. Open the first `dev` to `main` pull request straight after the first push, and turn on Discussions at the same time so the issue chooser link does not 404. Dependabot security update pull requests target the default branch regardless of the `target-branch` setting, so expect those on `main`.

Until `dev` is merged into `main`, a fresh `git clone` of the default branch holds only the licence and notice. It has no README, no `package.json` and none of the steps in `docs/DEPLOYING.md`, so a stranger cannot run anything. Merge `dev` into `main` before the project is promoted or the fresh clone check below is repeated against the default branch.

## Branch model

Contributors branch from `dev` and open pull requests against `dev`. The maintainer merges `dev` into `main` for releases and milestones. Only `main` is deployed to production.

## Releases

1. Move the Unreleased entries in `CHANGELOG.md` under a new version heading with the date.
2. Choose the version by [Semantic Versioning](https://semver.org/). While the major version is 0, minor bumps may contain breaking changes.
3. Merge `dev` into `main`, tag `vX.Y.Z` and publish a GitHub release using the changelog text.

## Fresh clone check

Repeat this before a release and after any change to the toolchain, the build or the deployment docs. It proves a stranger can follow the docs. Use a new empty directory and no `.env` file or token.

1. `git clone https://github.com/lukeo100/Waylit.git waylit`, then `cd waylit`. Use `git checkout dev` if `dev` has not been merged to `main` yet.
2. Follow `README.md` and `docs/DEPLOYING.md` literally: `corepack enable`, `pnpm install`, then `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. Everything should pass, and `git status` should show no changes.
3. Start the build on a spare port with `PORT=3100 pnpm start`. Open `/ride` in Chrome, tap **I understand** and **Start trip**, and check that the HUD shows, the credits strip names OpenFreeMap, the manifest and `/sw.js` are served (the worker with `Cache-Control: no-cache`), and the map settings sheet shows Google 3D tiles as disabled with a plain message.
4. With the build running, `node apps/web/scripts/layout-check.mjs http://localhost:3100` runs the headless Chrome layout checks (it needs Chrome or Chromium, see the top of the script).
5. Note every place where the docs were wrong, missing or unclear, fix them, and record the result in the changelog.

Not covered by this check: a real Vercel import from a new account, and the optional Cesium ion token path. Do those by hand with your own account and token.

## If a secret leaks

1. Rotate or revoke it with the provider immediately. Treat it as compromised even if the repo is brought back clean.
2. Remove it from the current tree and open a pull request.
3. If the history needs cleaning, rewrite it with a tool such as `git filter-repo`, force push with the maintainer's explicit decision, and tell active contributors to re-clone.

## Reviewing contributions

- Check the pull request checklist, including the notes on secrets, third party content and vehicle safety.
- Anything under `packages/vehicle/` or touching vehicle communication gets extra care. Read-only telemetry is the default.
- Close bulk or unreviewed generated pull requests politely and point to the AI assistance rules in `CONTRIBUTING.md`.
- Be kind and follow the code of conduct. Report conduct problems the same way as described in `CODE_OF_CONDUCT.md`.

## Keeping docs in step

`docs/AGENT_BRIEF.md` is the public copy of the project brief. Update it whenever the brief is amended. Keep `docs/THIRD_PARTY.md` current whenever a dependency, data source or asset is added.

## Keeping a personal deployment private

A maintainer's own Vercel project is separate from the project and is not part of it. To keep it private:

- Connect it through the Vercel Git integration only. Do not add Vercel tokens, org IDs or project IDs to the repo or to GitHub Actions secrets. CI does not need them.
- Keep Deployment Protection on in the Vercel project settings, so previews and production require a Vercel login.
- The Vercel GitHub app can post preview URLs on pull requests and show deployments on the repo. On a public repo those are visible to everyone, so protection matters, and personal deployment URLs should not be pasted into issues, pull requests or docs.
- Never commit `.vercel/` (already ignored) or `.env*` files.
