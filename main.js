// main.js — Hotness Index server
//
// Routes:
//   GET  /            renders the page (views/hotnessindex.ejs)
//   POST /api/live    receives { latitude, longitude } from the browser,
//                      fetches live weather + a location name, and
//                      returns them as JSON
//
// External APIs used (both free, no API key, no signup, no config.json):
//   - Open-Meteo Forecast API        https://open-meteo.com/
//   - BigDataCloud reverse geocoding https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api

const express = require('express');
const path = require('path');

const app = express();

const AUTHOR = {
  name: 'Raunak Raj Adhikari',
  github: 'https://github.com/thisraunakk'
};

// Default values the manual sliders start at on first load.
const DEFAULTS = {
  temp: 25,
  humidity: 50,
  wind: 10,
  sun: false,
  neutral: 20,
  sensitivity: 0.11
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());

app.get('/', (req, res) => {
  res.render('hotnessindex', {
    author: AUTHOR,
    defaults: DEFAULTS
  });
});

app.post('/api/live', async (req, res) => {
  const { latitude, longitude } = req.body || {};

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude (numbers) are required.' });
  }

  try {
    const weatherUrl =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${latitude}&longitude=${longitude}` +
      '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,is_day' +
      '&timezone=auto';

    const geoUrl =
      'https://api.bigdatacloud.net/data/reverse-geocode-client' +
      `?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;

    const [weatherRes, geoRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(geoUrl)
    ]);

    if (!weatherRes.ok) {
      throw new Error(`Weather API responded with ${weatherRes.status}`);
    }

    const weatherData = await weatherRes.json();
    const current = weatherData.current || {};

    const temperature = current.temperature_2m;
    const humidity = current.relative_humidity_2m;
    const wind = current.wind_speed_10m; // Open-Meteo default unit is km/h, matching the slider
    const isDay = current.is_day === 1;
    const cloudCover = current.cloud_cover;

    // Stand-in for "standing in direct sun": daytime and not very cloudy.
    const sun = isDay && typeof cloudCover === 'number' && cloudCover < 50;

    let locationName = 'your location';
    if (geoRes.ok) {
      try {
        const geoData = await geoRes.json();
        const place = geoData.city || geoData.locality || geoData.principalSubdivision;
        const country = geoData.countryName;
        const built = [place, country].filter(Boolean).join(', ');
        if (built) locationName = built;
      } catch (_) {
        // Reverse geocoding failed silently — weather data still goes through.
      }
    }

    res.json({
      temperature,
      humidity,
      wind,
      sun,
      cloudCover,
      isDay,
      locationName
    });
  } catch (err) {
    console.error('Live data fetch failed:', err.message);
    res.status(502).json({ error: 'Could not fetch live weather right now. Try again in a moment.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hotness index running at http://localhost:${PORT}`);
});