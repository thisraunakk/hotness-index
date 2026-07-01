const express = require('express');
const path = require('path');

const app = express();

const AUTHOR = {
  name: 'Raunak Raj Adhikari',
  github: 'https://github.com/thisraunakk'
};

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

async function getLocationName(latitude, longitude) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );
    if (res.ok) {
      const data = await res.json();
      const parts = [data.locality, data.city, data.principalSubdivision, data.countryName]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i);
      if (parts.length) return parts.join(', ');
    }
  } catch (err) {
    console.error('BigDataCloud geocoding failed:', err.message);
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
      { headers: { 'User-Agent': 'hotness-index-personal-app/1.0 (contact: github.com/thisraunakk)' } }
    );
    if (res.ok) {
      const data = await res.json();
      const a = data.address || {};
      const parts = [a.city || a.town || a.village, a.state, a.country].filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
  } catch (err) {
    console.error('Nominatim geocoding failed:', err.message);
  }

  return 'an unknown location';
}

const PAST_DAYS = 2;
const FORECAST_DAYS = 7;

app.post('/api/live', async (req, res) => {
  const { latitude, longitude, accuracy } = req.body || {};

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude (numbers) are required.' });
  }

  try {
    const weatherUrl =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${latitude}&longitude=${longitude}` +
      '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,is_day,weather_code,precipitation' +
      '&hourly=temperature_2m,precipitation_probability,weather_code,relative_humidity_2m,wind_speed_10m,cloud_cover,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
      `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}` +
      '&timezone=auto';

    const [weatherRes, locationName] = await Promise.all([
      fetch(weatherUrl),
      getLocationName(latitude, longitude)
    ]);

    if (!weatherRes.ok) {
      throw new Error(`Weather API responded with ${weatherRes.status}`);
    }

    const weatherData = await weatherRes.json();
    const current = weatherData.current || {};
    const hourly = weatherData.hourly || {};
    const daily = weatherData.daily || {};

    const temperature = current.temperature_2m;
    const humidity = current.relative_humidity_2m;
    const wind = current.wind_speed_10m;
    const isDay = current.is_day === 1;
    const cloudCover = current.cloud_cover;
    const weatherCode = current.weather_code;

    const sun = isDay && typeof cloudCover === 'number' && cloudCover < 50;

    let rainChanceNow = null;
    let hourlyWindow = [];
    if (Array.isArray(hourly.time)) {
      let nowIdx = hourly.time.indexOf(current.time);
      if (nowIdx === -1) {
        nowIdx = hourly.time.findIndex((t) => t > current.time) - 1;
      }
      if (nowIdx >= 0) {
        rainChanceNow = hourly.precipitation_probability
          ? hourly.precipitation_probability[nowIdx]
          : null;

        const end = Math.min(nowIdx + 24, hourly.time.length);
        for (let i = nowIdx; i < end; i++) {
          const isDayHour = hourly.is_day ? hourly.is_day[i] === 1 : null;
          const cloudHour = hourly.cloud_cover ? hourly.cloud_cover[i] : null;
          hourlyWindow.push({
            time: hourly.time[i],
            temp: hourly.temperature_2m[i],
            humidity: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
            wind: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
            sun: isDayHour === true && typeof cloudHour === 'number' && cloudHour < 50,
            precipProb: hourly.precipitation_probability
              ? hourly.precipitation_probability[i]
              : null,
            code: hourly.weather_code ? hourly.weather_code[i] : null
          });
        }
      }
    }

    const dailyAux = {};
    if (Array.isArray(hourly.time)) {
      hourly.time.forEach((t, i) => {
        const date = t.slice(0, 10);
        const hour = Number(t.slice(11, 13));
        const entry = dailyAux[date] || { bestDiff: Infinity };
        const diff = Math.abs(hour - 14);
        if (diff < entry.bestDiff) {
          const isDayHour = hourly.is_day ? hourly.is_day[i] === 1 : null;
          const cloudHour = hourly.cloud_cover ? hourly.cloud_cover[i] : null;
          dailyAux[date] = {
            bestDiff: diff,
            humidity: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
            wind: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
            sun: isDayHour === true && typeof cloudHour === 'number' && cloudHour < 50
          };
        }
      });
    }

    const todayStr = (current.time || '').slice(0, 10);
    let dailyList = [];
    if (Array.isArray(daily.time)) {
      dailyList = daily.time.map((date, i) => {
        const diffDays = Math.round(
          (new Date(date) - new Date(todayStr)) / 86400000
        );
        const aux = dailyAux[date] || {};
        return {
          date,
          tempMin: daily.temperature_2m_min[i],
          tempMax: daily.temperature_2m_max[i],
          humidity: typeof aux.humidity === 'number' ? aux.humidity : humidity,
          wind: typeof aux.wind === 'number' ? aux.wind : wind,
          sun: typeof aux.sun === 'boolean' ? aux.sun : sun,
          precipProb: daily.precipitation_probability_max
            ? daily.precipitation_probability_max[i]
            : null,
          code: daily.weather_code ? daily.weather_code[i] : null,
          dayOffset: diffDays,
          isToday: diffDays === 0
        };
      });
    }

    res.json({
      temperature,
      humidity,
      wind,
      sun,
      cloudCover,
      isDay,
      weatherCode,
      rainChanceNow,
      locationName,
      hourly: hourlyWindow,
      daily: dailyList
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