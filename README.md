# Hotness Index

A personal "feels-like" heat scale from 0–10, where 5 means neutral. Has two modes:

- **Live at your location** — asks for location permission, fetches real weather, shows your live Hotness Index.
- **Try it yourself** — manual sliders for temperature, humidity, wind, and sun, so you can play with the formula.

## Setup

```
npm install
npm start
```

Open `http://localhost:3000`.

No API keys are needed for the weather or location-name lookups — both are free, keyless APIs.

## What's calling out, and why

| Service | What it's for | Key needed? |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Live temperature, humidity, wind, cloud cover | No |
| [BigDataCloud reverse geocoding](https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api) | Turns coordinates into a place name | No |
| [OpenStreetMap Nominatim](https://nominatim.org/) | Backup place-name lookup if BigDataCloud fails | No (be polite with request volume) |

Location lookups are intentionally capped at city/region/country level — never resolved to a street address — even from the fallback provider.

## Project structure

```
main.js                    Express server, routes, weather + geocoding + Discord logging
views/hotnessindex.ejs     The page (UI is untouched from the original design)
.env                       Your real secrets (gitignored)
.env.example               Template for the repo
```

---

Made by [Raunak Raj Adhikari](https://github.com/thisraunakk)
