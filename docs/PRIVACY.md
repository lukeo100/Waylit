# Privacy

Waylit has no backend and no accounts, and it does not collect data about you.

## Location

- Location is used only when you choose **Phone GPS** in the settings (or open the page with `?gps=live`) and tap **Start free ride**. The default is a simulated ride that uses no location.
- Your browser asks for permission at that moment. You can refuse, and the ride still works as a screen with a note.
- The position is used on your device to draw the ride, work out speed, distance and time, and set daylight. It is not stored, not written to the console, and not sent to any server by Waylit.
- Only the latest fix is held in memory, and it is gone when you end the trip or close the page. No trace of where you rode is kept, so the trip summary has distance, time and speed only.
- Map tiles are requested from the map provider for the area on screen, which reveals that area to that provider in the way any map does. Use the Simulator if you do not want that.
- The demo route and the replay trace are made up and are not real places. No personal location is in this repository, and none should be added.

## Saved settings

The map, effect, position source and ground height choices are saved in this browser's localStorage so they are remembered. They contain no location.
