# Vehicle adapter: Segway Ninebot MAX G3 over Bluetooth

Waylit can read live telemetry from a Segway Ninebot MAX G3 over Web Bluetooth. It is read only, it is off by default (the mock adapter stays the default), and nothing is verified on a real scooter yet. This page says what is known, what is not, and how to test it safely. It was approved as Amendment 8 in [AGENT_BRIEF.md](AGENT_BRIEF.md).

Waylit is not affiliated with Segway. The names Segway and Ninebot are used only to say which vehicle is supported. No logos or artwork are used.

## What it does

- Reads speed, battery percent, range, trip distance, total distance, riding mode, temperature, and error and warning codes, and nothing else.
- Sends only two kinds of request: the three handshake steps that set up an encrypted session, and read requests for nine allowlisted registers. Every other command, including every write, is refused in code (see "The read only guard" in [ARCHITECTURE.md](ARCHITECTURE.md)).
- Shows the vehicle speed when it is fresh, and falls back to GPS speed when it is not (after the two second stale limit). GPS speed and vehicle speed stay separate values.
- Starts only from a tap on Connect, shows the browser's own device chooser each session, and never connects in the background.

## Known

These come from the public reverse engineering documentation credited in [THIRD_PARTY.md](THIRD_PARTY.md) (a description of the protocol, not code), plus the Web Bluetooth specification and the behaviour of Chrome on Android.

- The scooter advertises a name that starts with "NB" and has one custom service, `6e400001-0000-0000-006e-696e65626f74`. Requests are written to `6e400002-...` and replies arrive as notifications on `6e400004-...`. Waylit names no other characteristic.
- Frames start with `5A A5`, then a length, source, target, command, register number and payload. Large frames are cut into pieces of at most the MTU minus 3 bytes (Waylit uses 20).
- The session is encrypted with AES-128. The key comes from SHA-1 over the advertised name and later a random challenge from the scooter and a session password. A four byte tag and a counter protect every frame. The setup has three steps: first contact (the scooter returns the challenge and its serial number), pairing (a password is stored on the scooter) and authentication.
- Register numbers for the G3: speed `0x57`, battery `0x55`, total mileage `0x62`, trip mileage `0x68`, range `0x5F` (the nearest candidate), riding mode `0x5A`, temperature `0x6B`, error `0x58`, warning `0x59`.
- Chrome on Android needs HTTPS and a tap before it shows the Bluetooth chooser. GATT connections and notifications work with no flag. Listing previously granted devices and watching advertisements are not reliable on Android, so the chooser is shown every session. A phone with the screen off drops the link, so Waylit keeps the screen awake while the scooter is linked. iPhone and iPad browsers have no Web Bluetooth.

## Unknown

Treat all of these as open until tested on a real G3.

- **Units and scale.** The documentation gives register numbers and sizes only. Waylit guesses speed in 0.1 km/h, trip and range in 10 m, total distance in metres, temperature in 0.1 degree C. Values outside a sensible range are dropped instead of shown. The guesses live in `packages/vehicle/src/g3/telemetry.ts`.
- **Which board answers.** The documentation does not say which board address answers telemetry reads on a G3. Waylit tries `0x09` and then `0x01` and remembers the first that answers.
- **The meaning of the riding mode number.** It is shown as "Mode N".
- **Byte order and sign.** Little endian is assumed.
- **The exact tail layout of the first handshake frame.** The documentation describes two slightly different layouts. Waylit writes one and accepts either when reading.
- **Whether the counter wraps.** Only 16 bits are sent. Waylit starts a fresh session before the counter runs out.
- **Pairing.** Whether pairing from a browser works on a G3 at all, whether it needs a button press, and whether it signs the official app out of the scooter. The credentials page of the documentation says some commands need a per device secret that the Segway cloud issues and a third party tool cannot create. Waylit never needs or invents such a secret, and it does not send any command that would. If the handshake cannot be completed, the state is "auth needed" and no data is shown. Nothing is made up.
- **Segway's terms.** The warranty text may exclude third party use. Read it before you pair.
- **Reconnect behaviour** with the official app running, and the scooter's behaviour after several failed attempts.

## Safety and the road rules in Victoria

- Waylit is a navigation aid, not a safety system. It never sends control commands, so it cannot change speed, brakes, lights or locks.
- Mount the phone. Use the screen by glancing only. Do not touch it while moving. Waylit turns off connecting and gives other controls a hold to press above 8 km/h, but that is a backstop, not permission.
- Do not connect, pair or change settings while riding. Do it stationary, before you set off.
- The Victoria Police page on e-scooters, https://www.police.vic.gov.au/electric-powered-scooters-e-scooters, says riders should not use a mobile phone, that riders should not go faster than 20 km/h, that a legal e-scooter has a top speed of 25 km/h, and that legal e-scooters may be used on shared paths and on roads up to 60 km/h. It does not say a mounted phone is allowed. Check the current rules yourself before riding with a phone. This page is not legal advice.

## Testing, in this order

### 1. Desk simulator (no hardware)

The simulator is a pretend scooter behind a fake Bluetooth link. The real frame parser, crypto, guard and adapter all run against it. It proves the code is consistent with itself, not that a real G3 agrees.

1. Open `/ride?vehicle=g3sim` on the A35 (Chrome) or on a desktop. Add `&dev=1` to see the dev controls.
2. Tap the layers button beside the minimap. Scroll the sheet to the Vehicle section. It says "Desk simulator. No real scooter is used."
3. Tap Connect. The state line turns amber: "This phone is not paired with the scooter yet." The simulated scooter holds no pairing yet.
4. Tap Pair this phone. About three seconds later the state is "Connected". (The simulator answers "pending" once first, like a scooter that waits for a button press.)
5. Close the sheet. The dashboard shows the simulated battery (about 87 percent) and range, and the speed follows a repeating ride (up to about 20 km/h). Tap Start trip and check the headline speed is the vehicle speed and the small GPS figure is separate.
6. With dev controls on, turn on "Lose scooter data". The speed switches to GPS after about two seconds and the "No scooter data" note shows. Turn it off to return.
7. Tap Disconnect. The speed falls back to GPS. Reload the page: the simulator forgets its pairing, so Pair is needed again.
8. Open `/ride` with no parameter and check the Vehicle section says Mock and that nothing Bluetooth related is offered.

### 2. nRF Connect (no Waylit, read only)

nRF Connect for Mobile (Nordic Semiconductor, free) shows what the scooter exposes. Do this stationary, with the official Segway app fully closed (force stop it), because a scooter normally talks to one phone at a time.

1. Switch the scooter on. Open nRF Connect and scan. Find a device whose name starts with "NB".
2. Connect. Check the service list for `6e400001-0000-0000-006e-696e65626f74`. Under it, check a characteristic ending `0002` (write) and one ending `0004` (notify), and note their properties.
3. Turn on notifications for `0004` only (the bell icon). Do not write to anything. Do not open other services.
4. Note the MTU nRF Connect reports, and whether the connection stayed up for a minute.
5. Disconnect. Write the findings in the Run Log. Do not post screenshots that show the device name or address in public.

### 3. The real G3

Risks first. You accept all of these before you try:

1. **Pairing writes a new secret to the scooter.** It may sign the official Segway app out of the scooter, and you may have to pair the app again. Waylit pairs only when you tap Pair this phone, never on its own.
2. **Nothing is verified.** The protocol notes come from reverse engineering that was not checked on a MAX G3 by this project. Frames may be refused, numbers may be wrong, or nothing may answer.
3. **Segway's terms and warranty** may not cover third party use.
4. **Failed attempts.** What a G3 does after many failed attempts is unknown. Waylit tries once per tap and does not hammer the scooter, but stop after two failures and report.
5. **Riding with a phone.** Test stationary only. Mount the phone, and follow the road rules above.
6. **Bluetooth quirks.** Only one phone can usually be connected. A screen that turns off drops the link. A drop mid ride falls back to GPS speed and, after retries, asks for a tap.

Steps, with the scooter stationary and switched on, in Chrome on the A35 over the HTTPS dev site:

1. Force stop the official Segway app. Switch Bluetooth on.
2. Open `/ride?dev=1`. Tap the layers button, scroll to Vehicle and choose MAX G3 (Bluetooth).
3. Tap Connect. Pick the device whose name starts with "NB" in the browser chooser.
4. If the state says it needs pairing, decide whether to go on. To go on, tap Pair this phone and press the scooter's button if it asks. The state line tells you what happened. If it reports "pairing timed out" or "did not accept", stop there.
5. If it connects, compare against the scooter's own display with the scooter stationary: battery percent, trip distance, range and the riding mode. Speed should read 0.
6. To check the scales, connect Chrome to the phone over USB (`chrome://inspect`), open the console and read the `g3 raw` lines (development builds and `?dev=1` only). Each shows a register name and its raw bytes, low byte first. Compare with the display and send the pairs in the Run Log. They are the only way to fix the unit guesses.
7. Only with the scooter held safely off the ground, or with a helper walking it, check that speed rises and falls with the wheel. Do not do this while riding.
8. Turn the scooter off. The state should go to "Link lost", the speed should fall back to GPS, and after the retries it should say "Tap Connect to try again".
9. If anything looks wrong, tap Disconnect, and use Forget pairing in the Vehicle section if you want this phone to drop its stored pairing.

What Waylit stores on the phone: the pairing secret (random, made on the phone when you pair) in localStorage under a key that includes the scooter's advertised name. It is never sent anywhere, logged or committed. Clearing site data removes it.

## Where the code is

- `packages/vehicle/src/g3/` holds the frame layer, crypto, guard, session, adapter, Web Bluetooth transport and the desk simulator.
- `apps/web/src/vehicle/` and `apps/web/src/hud/VehicleSettings.tsx` hold the choice, the controller and the Vehicle section.
- Design: [ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [PWA.md](PWA.md).
