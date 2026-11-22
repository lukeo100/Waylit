# Deploying your own copy

> **Status: not available yet.** Waylit has no application code, so there is nothing to deploy. This guide will be written when the app shell exists and will be checked from a clean environment before the first release.

The goal is that anyone can run their own copy with their own accounts and keys. There is no shared hosted instance and no shared API key.

## Planned contents

1. **Requirements.** Tools and versions, all free to obtain.
2. **Run locally with no keys.** Clone, install, start the dev server and use the fallback map and mock data.
3. **Deploy on Vercel.** Fork, import the repository, set optional environment variables, deploy.
4. **Self-host.** One path that does not depend on Vercel, either a Docker image or a static export, chosen during project setup.
5. **Environment variables.** The full list from `.env.example`, what each one does and what happens when it is empty.
6. **Optional providers.** How to get your own Cesium ion token or Google key, how to restrict it by referrer and quota, and the terms you agree to.
7. **Installing the PWA.** Android and desktop steps and browser limitations.
8. **Updating and troubleshooting.**

If you hit a gap while following this guide once it exists, open an issue. Unclear deployment steps count as bugs.
