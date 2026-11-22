# Deploying your own copy

> **Status: partial.** Running locally works today. The Vercel and self-host steps are outlined below and will be checked from a clean environment before the first release. The PWA install steps arrive with the PWA shell (task 5).

The goal is that anyone can run their own copy with their own accounts and keys. There is no shared hosted instance and no shared API key.

## 1. Requirements

All free:

- [Node.js](https://nodejs.org/) 22 LTS. The exact major version is in `.nvmrc`. With nvm, run `nvm use`.
- pnpm 10. The exact version is pinned in the `packageManager` field of `package.json`. The simplest way to get it is Corepack, which ships with Node.js: `corepack enable`.
- Git.

## 2. Run locally with no keys

```sh
git clone https://github.com/lukeo100/Waylit.git waylit
cd waylit
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:3000. No `.env` file, account or API key is needed.

To check a production build locally:

```sh
pnpm build
pnpm start
```

## 3. Deploy on Vercel

1. Fork the repository on GitHub.
2. In Vercel, import the fork. Set the **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm from the lockfile, and installs the whole workspace.
3. Leave environment variables empty for a no-keys deployment, or add the optional ones from section 5.
4. Deploy.

Free Hobby plans are enough. Keep Deployment Protection on if the deployment is only for you.

## 4. Self-host

> **Proposed, not final.** The recommendation below is a proposal for the maintainer to approve. Nothing in the build is switched yet.

### Recommendation: static export

Build Waylit as a static site with Next.js static export (`output: "export"`), and serve the resulting `apps/web/out/` folder from any static web server or free static host.

Why:

- **Milestone 1 has no server.** The app is a client-side PWA with simulated GPS, mock telemetry and mock media. There are no API routes, no server rendering per request and no backend in scope.
- **Cheapest and simplest to run.** Plain files work on any web server (nginx, Caddy, Apache) and on free static hosts. There is no Node.js process to keep alive, patch or monitor.
- **Smaller attack surface.** No server code runs in production, so there is nothing server-side to exploit or misconfigure.
- **Fits the PWA.** A service worker and manifest are static files, and offline caching works the same as on Vercel.
- **Keys stay the deployer's.** Public keys are inlined at build time, so each deployer builds with their own environment. This matches the bring-your-own-keys rule.

Trade-offs to accept:

- Features that need a server are unavailable in this mode: route handlers, middleware, incremental regeneration and the built-in image optimiser. The app should avoid them in milestone 1 so the same code builds both ways.
- `NEXT_PUBLIC_*` values are fixed at build time. Changing a key means rebuilding.
- Response headers (content security policy, service worker caching) must be set in the web server config rather than in Next.js. Example configs would be added to the docs.
- HTTPS is required for service workers, geolocation and Web Bluetooth. Most static hosts provide it. A self-managed server needs a certificate, for example from Let's Encrypt.

### Alternative: Docker image

A Docker image built from Next.js standalone output runs `next start` inside a container. It supports every Next.js feature and suits a later phase if the app gains server code. It is heavier to build and run, needs a long-running process, and adds an image to maintain. It is worth revisiting if a later phase needs server features. A Docker image could also simply wrap the static export in a small web server, for people who prefer containers.

### Next steps if approved

Add a build flag for static export, check the app builds and runs in both modes in CI, and document the steps for one static host and one generic web server.

## 5. Environment variables

Every variable is optional. With all of them empty, Waylit uses its defaults, the fallback map and mock data. Names are listed in [`.env.example`](../.env.example). For local development, copy it to `apps/web/.env.local`, which is ignored by git.

| Variable | Default when empty | Purpose |
|---|---|---|
| `NEXT_PUBLIC_WAYLIT_SOURCE_URL` | The upstream repository | Link to the source code shown in the app. Point it at your fork if you change the code, which helps you meet the licence's notice requirements |
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | Not used yet | Reserved for the mapping provider decision |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Not used yet | Reserved for the mapping provider decision |

Variables starting with `NEXT_PUBLIC_` are included in the browser bundle and are visible to anyone who loads the app. Only put browser-safe keys there, restricted by referrer and quota.

## 6. Optional providers

To be written after the mapping spike: how to get your own key for the chosen provider, how to restrict it by referrer and quota, and which terms you agree to.

## 7. Installing the PWA

To be written with the PWA shell (task 5): Android and desktop steps and browser limitations.

## 8. Updating and troubleshooting

- **`pnpm: command not found`.** Run `corepack enable`, then open a new terminal.
- **Install fails with an engine error.** Check `node --version` matches `.nvmrc`.
- **Lockfile errors in CI.** Run `pnpm install` locally and commit the updated `pnpm-lock.yaml`.

If you hit a gap while following this guide, open an issue. Unclear deployment steps count as bugs.
