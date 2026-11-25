# Vision

Waylit is an open source navigation platform for electric scooters and bicycles. It is meant to feel like a dedicated automotive-style cockpit, not a flat map on a phone.

## Core idea

Build one application experience that runs on several platforms. A progressive web app comes first because it allows quick iteration and deployment without app store distribution. A native Expo app follows later for better Bluetooth, background location and rendering performance. The two should look and behave practically identically, and share navigation logic, routing, vehicle interfaces, data models and design tokens.

## The riding screen

The 3D environment is the primary visual element. Interface elements complement it and never overwhelm it. The screen is designed for landscape orientation and full-screen use, with no website header, sidebar or unnecessary browser chrome.

- **3D world.** A third-person view of the rider travelling through realistic roads, buildings, trees and terrain, with a perspective camera that follows the rider. The rider and vehicle sit around the lower middle of the screen, with a stylised holographic rider silhouette.
- **Route.** A glowing route corridor on the road, floating chevron arrows for upcoming turns, a holographic heading marker and subtle road-edge highlighting.
- **Lighting.** Scene lighting follows the local time of day: warm light and long shadows at sunset, natural daylight by day, street lighting and subtle vehicle illumination at night.
- **Top left.** A very large current speed, next instruction, distance to the next turn, estimated arrival, remaining distance and remaining duration.
- **Top right.** Time, weather, connectivity and a small 2D minimap showing the upcoming route and heading.
- **Bottom dock.** One joined glass dock along the bottom, sized to its content and centred rather than stretched across the screen. On the left, a compact media player with artwork, artist, track, previous, play or pause, next and progress. On the right, a vehicle dashboard with battery, estimated range, trip distance, trip duration and an End Trip button. Below it, a reserved credits strip that nothing covers.

The look is dark and premium: flat translucent dark panels, one soft cyan accent, restrained holographic effects, minimal readable typography and smooth animation. Where the underlying 3D geometry is imperfect, subtle lighting and stylisation keep the scene cohesive. Performance always takes priority over visual complexity.

## Principles

1. PWA first, one consistent experience across platforms.
2. Vehicle agnostic. The first development vehicle is the Segway Ninebot MAX G3, but nothing about it is hardcoded into the app.
3. Keep map and tile providers replaceable. The app must run with no keys using a fallback map and mock data.
4. Separate navigation logic from visual rendering.
5. Use mock GPS and vehicle telemetry early in development.
6. Never compromise vehicle safety. Telemetry is read-only by default, and nothing may touch firmware, braking or other critical systems.
7. Prioritise mobile performance and usability.
8. Make source and authority of speed-limit data explicit. User-submitted information is never presented as an official legal limit.
9. Built for everyone: anyone can run and deploy their own copy.

## Vehicle support

All vehicles sit behind a standard interface with optional telemetry such as speed, battery, range, riding mode, status, distance, temperature and error codes. Not every vehicle supports every field, so the app handles missing data gracefully and falls back to GPS-derived speed and trip data. Protocols from older models are not assumed to work on newer ones. Research on a vehicle's Bluetooth protocol happens before any integration is written.

## Speed zones

A planned speed-zone layer will show road speed limits from open datasets, and allow custom zones for shared paths, parks, trails, campuses and private property. It must keep personal overrides separate from shared data, distinguish official limits from community-managed zones and personal preferences, and be configurable per country and jurisdiction.

## Navigation and positioning

Real-time location, heading, route calculation, turn-by-turn instructions, recalculation, arrival estimates and position smoothing. Routing for scooters and bicycles should account for shared paths, cycling infrastructure, road types, hills, legal access and speed zones.

## Where this is going

The long-term aim is a vehicle-agnostic navigation ecosystem that combines an immersive riding view, rich geographical detail and the practicality of a dedicated navigation app, with a community-maintained layer for roads, shared paths and other riding environments. See the [roadmap](ROADMAP.md) for the phases.
