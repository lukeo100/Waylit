# Waylit project brief (public mirror)

**Status:** Approved on 2026-11-22. Amendment 1 (public repository and open source practice), Amendment 2 (model policy) and Amendment 3 (mapping provider decision) applied the same day. Amendment 4 (workflow), Amendment 5 (HUD dock and daylight) and Amendment 6 (HUD feedback) followed on 2026-11-25. Amendment 7 (holographic guidance look and map switch) and Amendment 8 (live location and vehicle data) followed on 2026-11-26.

This is the public, sanitised copy of the project brief. It tells AI coding agents and contributors what Waylit is, what is in scope and how to work. The maintainer keeps private planning notes elsewhere, so this file is the version everyone can see. To propose a change to the brief, open an issue.

## 1. Goal

Build milestone 1 of Waylit: an installable, landscape-oriented progressive web app that shows an immersive third-person 3D navigation view for an electric scooter, using simulated GPS and simulated vehicle telemetry. It must run smoothly on a mid-range Android phone.

The 3D riding view is the defining feature and the biggest technical risk, so it is proven before routing, speed zones, Bluetooth, a backend or the Expo app are built. The wider vision is in [VISION.md](VISION.md) and the phases in [ROADMAP.md](ROADMAP.md).

## 2. Success criteria for milestone 1

1. The PWA installs on Android Chrome and launches in standalone landscape mode, with no browser navigation, website header or sidebar on the riding screen.
2. The riding screen has the layout described in [VISION.md](VISION.md): speed, next turn, distance, ETA and remaining trip at top left, time, weather, connectivity and a minimap at top right, and one joined glass dock along the bottom with the media player on the left and the vehicle dashboard with an End Trip button on the right, above a reserved credits strip that nothing covers.
3. A realistic 3D environment renders from the provider chosen in the mapping spike (see Amendment 3), with a third-person camera following the simulated rider. A holographic rider silhouette and an original stylised scooter sit in the lower middle of the screen.
4. A glowing route corridor, floating chevron arrows and a holographic heading marker show the route. A turn instruction appears and its distance counts down.
5. Scene lighting follows the real local time of day, and a time override demonstrates sunset, day and night.
6. Simulated GPS follows a predefined route with smoothing. Simulated telemetry uses realistic scooter values. GPS speed and vehicle speed are separate values, and GPS is the fallback when vehicle telemetry is missing.
7. The media player works with original mock tracks and artwork, and is wired to the browser Media Session API.
8. End Trip ends the simulated trip and returns to a summary or start state.
9. On a mid-range Android phone, the ride scene holds a median of at least 30 fps over a 5 minute simulated ride without crashing.
10. The map provider sits behind an interface. Navigation logic is separate from rendering. Vehicle access goes through a vehicle interface with a mock adapter. Code is split into packages so a native app can reuse it.
11. Docs describe what was actually built, and the mapping spike report records its decision with sources.
12. The repository follows open source practice: licence, README, contribution docs, code of conduct, security policy, templates, code owners, Dependabot and a passing CI workflow.
13. A stranger can clone the repo, install and run it with no API keys, using the fallback map and mock data.
14. A stranger can deploy their own copy from `docs/DEPLOYING.md` with their own accounts and keys, on Vercel and on one self-host path.
15. No secrets, personal data or third party copyrighted material appears in the working tree or git history.
16. Third party code, data and assets are listed with their licences in `docs/THIRD_PARTY.md`, and required attributions appear in the app.

## 3. Scope

**In scope:** roadmap phases 1 and 2 (PWA foundation, design system, HUD, media player and dashboard with mock data, then the 3D mapping prototype with rider, scooter and holographic corridor), plus live phone GPS as an alternative to the simulator (Amendment 8), a read-only Web Bluetooth adapter for the Segway Ninebot MAX G3 (Amendment 8, mock stays the default), plus screen wake lock, orientation handling, service worker caching, a short note on PWA limits, the open source repository foundations, bring-your-own-keys configuration, a fallback mode that runs with no keys, and contributor-facing documentation.

**Out of scope for milestone 1:** a routing engine, search, speed zones, any control commands sent to a vehicle, any backend or accounts, route planner, trip history and vehicle management screens, Spotify integration, multiple vehicle adapters, background tracking, the Expo app, a maintainer-hosted public instance, a CLA or DCO process.

## 4. Constraints

- **Free tiers only.** No paid plan is required to build, run or deploy Waylit. If a free allowance runs out, fall back to the OpenStreetMap-based option.
- **Provider terms.** Attribution and licence rules of any map or tile provider must be verified before use, and required attribution must be visible and never covered by the HUD. Do not assume a use is allowed.
- **Bring your own keys.** Keys and tokens, including the Cesium ion token, come from each deployer's environment variables and are never committed or shared. Without keys the app uses the fallback provider and mock data. Browser keys are restricted by referrer and quota. There is no Google billing account and no direct Google key path.
- **Public repository.** Everything committed is visible forever. Scan for secrets and personal data before every push. Keep private links, personal devices and location details out.
- **Built for everyone.** No maintainer-specific values in code, config or docs. Maintainer accounts and project identifiers never appear in the repo.
- **Assets.** Original stylised scooter and rider models. No vehicle maker artwork or logos. Mock media uses original placeholder names and generated artwork. No third party copyrighted material.
- **Safety.** No code may write to vehicle firmware, braking or other critical systems. The README and the app's first run state that Waylit is a navigation aid, not a safety system.
- **Licence.** Apache 2.0. Inbound equals outbound under section 5, so there is no CLA and no DCO sign-off.
- **Later backend.** Any later Supabase work must be deployable by anyone, with migrations and seed data in the repo and no hardcoded project references.
- **Models.** Every agent uses Sonnet 5.5 on high effort, including orchestration, research, development and UI work. Only the critic agent uses Opus 5.5. Where the task table names another model as owner, read Sonnet 5.5 on high effort instead (Amendment 2).
- **Style.** Plain prose, no em dashes, no emojis in docs or UI copy unless needed.

## 5. Milestone 1 tasks

| # | Task | Depends on | Acceptance check |
|---|---|---|---|
| 1 | Create the public repository and hosting project | none | Repository exists and a placeholder preview loads |
| 2 | Write public vision and roadmap docs and the agent pointers | 1 | Files present |
| 3 | Mapping spike research: provider terms, free allowance, attribution, renderer options on Android Chrome | 1 | Written decision report with sources |
| 4 | Project structure and design system | 13 | Builds, deploys a preview, tokens documented |
| 5 | PWA shell: manifest, service worker, install, landscape, standalone, wake lock | 4 | Criterion 1 |
| 6 | HUD, media player and vehicle dashboard with mock data | 4 | Criteria 2 and 8 |
| 7 | Simulation layer: simulated GPS, vehicle interface with mock adapter, mock media | 4 | Criteria 6, 7 and 10 |
| 8 | 3D environment on the chosen provider behind the provider interface | 3, 4 | Criteria 3, 5 and 10 |
| 9 | Rider silhouette, scooter model, glowing corridor, chevrons, heading marker | 7, 8 | Criterion 4 |
| 10 | Performance pass and device test | 5 to 9 | Criterion 9 |
| 11 | Review each task against the criteria | each task | Pass or fail with specific fixes |
| 12 | Close out: update docs and propose the plan for later phases | 11 | Criterion 11 |
| 13 | Open source foundation (this set of files) | 1 | Criteria 12, 15 and 16 |
| 14 | Maintainer repository settings, see [MAINTAINING.md](MAINTAINING.md) | 13 | Settings enabled |
| 15 | Fresh clone and deploy test from a clean environment | 5, 13 | Criteria 13 and 14 |

## 6. Working rules for agents

**May do without asking:** read freely, commit to `dev`, open pull requests from `dev` to `main`, deploy preview builds, install packages from public registries, run local tests and builds, and run up to three revise and review rounds per task.

**Needs the maintainer's approval:** production deploys, anything that costs money, creating or rotating keys and tokens, adding a backend, the mapping provider decision, changes to scope or this brief, merging to `main`, changing repository visibility, settings or access, deleting content, and anything that sends messages outside the project.

**Report back when:** the mapping spike report is ready, a task still fails review after three rounds, a licence or safety concern appears, a secret or personal data scan flags anything, a blocker needs the maintainer, the first frame rate reading on a real device is available, or milestone 1 is ready for a device test.

## 7. Main risks

| Risk | Mitigation |
|---|---|
| Provider terms, quota or cost make a tile source unusable | Check terms first. Fall back to an OpenStreetMap-based renderer behind the provider interface |
| Photorealistic tiles are too heavy for mid-range phones | Frame budget, lower detail, measure early |
| Route corridor floats or clips on reality-mesh tiles | In Google mode the corridor uses classification and never reads or records heights from Google tiles. Sampled heights from open elevation data are used only in the fallback. Stylise with glow to hide imperfections. If it looks poor on a device, the maintainer may accept the risk or disable the feature (Amendment 3) |
| Phone use while riding | Large touch targets, minimal interaction while moving, check local rules |
| Secrets or personal data reach the public history | Scans before every push, push protection, `.env.example` only |
| Setup works only on the maintainer's machine | Fresh clone test, pinned toolchain, committed lockfile |
| Maintainer time lost to unreviewed generated pull requests | Templates, code owners, protected `main`, stated AI policy |

## 8. Amendments

**Amendment 1, 2026-11-22.** The project is developed in a public repository and is built for everyone, not only the maintainer. Criteria 12 to 16 and the open source constraints were added, and the maintainer keeps private planning notes elsewhere.

**Amendment 2, 2026-11-22. Model policy.** Every agent uses Sonnet 5.5 on high effort, except the critic, which uses Opus 5.5. This applies to work started after the change.

**Amendment 3, 2026-11-22. Mapping provider decision.**

- The primary provider is CesiumJS showing Google Photorealistic 3D Tiles through a Cesium ion token. There is no Google billing account and no direct Google key path.
- The fallback is MapLibre GL JS on OpenFreeMap tiles with open terrain. It is what runs when no token is configured.
- In Google mode the minimap is a plain drawn route. It never uses OpenStreetMap content, because the Google terms do not allow mixing Google tiles with other map content.
- In Google mode the route corridor uses classification only. It never reads or records heights from Google tiles. Heights sampled from open elevation data are used only in the fallback.
- Chevrons, rider and scooter may float or sink slightly in Google mode. This is an accepted risk for success criterion 4.
- Attribution for Google, Cesium and OpenStreetMap must stay uncovered, so the HUD layout leaves room for it.
- Everything stays behind the map provider interface, so the provider can be swapped without changing navigation logic.

**Amendment 4, 2026-11-25. Workflow.** Agents commit to the working feature branch and push it, and do not open new pull requests. Changes may be fast-forwarded to `dev`. The `main` branch stays protected and merging to it needs the maintainer. Commits are authored and committed by the maintainer with no AI trailers.

**Amendment 5, 2026-11-25. HUD dock and daylight.**

- The media player and the vehicle dashboard form one joined glass dock along the bottom of the riding screen, above a reserved credits strip that nothing covers. Success criterion 2 is worded to match.
- Day and night are computed from the rider's location and the date using the sun's position, not fixed hours. Scene lighting and the HUD use the same daylight state, and a development time override can jump to dawn, noon, sunset or night to demonstrate it (supports success criterion 5).

**Amendment 6, 2026-11-25. HUD feedback.** Amber and red may be used for warnings and errors, with cyan staying the only other accent. The riding screen hides the phone's system bars by running fullscreen, so the app draws its own top strip. The bottom dock is content sized and centred, not full width.

**Amendment 7, 2026-11-26. Holographic guidance look.** The 3D scene shows route guidance as a cyan hologram on both providers: a translucent route ribbon with brighter rails, floating chevrons that bend toward the next turn, a vertical turn beacon with a distance countdown and direction, and a holographic rider on an original stylised kick scooter. In Google mode the corridor classification and the hologram overlays (chevrons, beacon, rider, heading marker) are on by default under Amendment 3. The ribbon uses classification only at the documented ground height constant, and the other items are flat translucent primitives that read no height, depth or geometry from the tiles. The scan band and the ground grid are part of the hologram screen effect on Google tiles, sit behind the existing fx switch and are off by default, and are exposed as a user setting (Off, Low, High) because the Google terms (3.2.3) are a grey area. On a slow phone the hologram steps down on its own (fewer chevrons, then no rails volume) below 30 fps median. The MapLibre fallback gets the full look by default. Turn instruction logic with a distance countdown, driven by the demo route and the GpsSimulator and read from the same distance as the HUD, satisfies success criterion 4. A map switch in the riding UI (Google 3D tiles or the fallback map, remembered on the device, with the address overriding it) was added at the maintainer's request.

Not verified: the frame rate on the Samsung A35, the look and the classification on real Google tiles (including reality mesh tiles), and the fallback look on a device. Only procedural scenes were checked in headless Chrome.

**Amendment 8, 2026-11-26. Live location and vehicle data.** Milestone 1 scope widens to include (a) live phone GPS as an alternative to the simulator, with permission handling, accuracy filtering and wake lock, and (b) a real Segway Ninebot MAX G3 adapter over Web Bluetooth that reads telemetry only and sends no control commands, with the mock adapter staying the default. Code is original, written from documented protocol facts only, never copied from other projects, so the Apache 2.0 licence is kept. If a browser cannot read the G3, the fallback is phone GPS speed now and a possible Expo companion later. No location trace is stored or transmitted by default, and no personal locations enter the repo. The maintainer tests live on the Vercel dev site on a Samsung A35. Routing, search and speed zones stay out of scope.
