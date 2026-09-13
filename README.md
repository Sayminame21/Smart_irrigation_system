# Fieldwell — ESP32 Smart Irrigation Dashboard

A single-page web dashboard for monitoring and controlling an ESP32-based
smart irrigation system. It shows live soil moisture, temperature,
humidity, tank level, and wind conditions, lets you start/stop the pump
manually or switch to automatic threshold-based irrigation, and keeps a
history of irrigation events and water usage.

Runs out of the box in **demo mode** with simulated sensor data — no
hardware required to try it out.

## Files

- `index.html` — page structure and markup
- `style.css` — styling and layout
- `script.js` — application logic, demo simulation, and ESP32 REST client

## Quick start

Just open `index.html` in a browser. It loads in demo mode with
simulated moisture, temperature, humidity, tank, and wind readings that
update automatically, so you can explore the dashboard, irrigation
controls, and history views immediately.

## Connecting a real ESP32

1. Open `script.js`.
2. Set `DEMO_MODE` to `false`.
3. Update `ESP32_API.baseUrl` to your device's address, e.g.
   `http://192.168.1.120`.
4. Implement the following REST endpoints on the ESP32 firmware:

   | Endpoint               | Method | Purpose                          |
   |-------------------------|--------|-----------------------------------|
   | `/api/status`           | GET    | Current sensor & controller state |
   | `/api/pump/on`          | POST   | Turn the pump on manually         |
   | `/api/pump/off`         | POST   | Turn the pump off manually        |
   | `/api/automatic/on`     | POST   | Enable automatic irrigation mode  |
   | `/api/automatic/off`    | POST   | Disable automatic irrigation mode |
   | `/api/settings`         | POST   | Update pump on/off thresholds     |

   Expected JSON body for `/api/status`:

   ```json
   {
     "moisture": 46,
     "rawMoisture": 2450,
     "pump": false,
     "automatic": true,
     "online": true,
     "wifiConnected": true,
     "signalStrength": -58,
     "uptimeSeconds": 16342,
     "pumpOnThreshold": 35,
     "pumpOffThreshold": 60,
     "temperature": 27.5,
     "humidity": 58,
     "tankLevel": 71,
     "windSpeed": 9,
     "windDirection": "NE"
   }
   ```

   Any fields you omit fall back gracefully in the UI.

The dashboard polls `/api/status` every 2 seconds by default
(`ESP32_API.pollIntervalMs`), with a request timeout of 4 seconds
(`ESP32_API.requestTimeoutMs`).

## Weather widget

The local weather panel uses the free [Open-Meteo](https://open-meteo.com/)
API (no API key required) and refreshes every 10 minutes. It uses the
browser's geolocation when available, falling back to a default
location if geolocation is denied or unavailable.

## Notes

- All charts are rendered with [Chart.js](https://www.chartjs.org/) (loaded via CDN in `index.html`).
- No build step or dependencies are required — it's plain HTML/CSS/JS.
