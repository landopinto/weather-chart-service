const express = require('express');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WIDTH = 800;
const HEIGHT = 480;

const renderer = new ChartJSNodeCanvas({
  width: WIDTH,
  height: HEIGHT,
  backgroundColour: '#ffffff',
  plugins: {
    modern: ['chartjs-plugin-annotation']
  }
});

function getCommuteColor(rainPct) {
  if (rainPct >= 70) return 'rgba(226,75,74,0.75)';
  if (rainPct >= 40) return 'rgba(239,159,39,0.70)';
  return 'rgba(93,202,165,0.60)';
}

function buildConfig(data, dateLabel) {
  const { slots, minTemp, maxTemp, morningCommute, eveningCommute } = data;

  const labels = slots.map(s => s.label);
  const temps  = slots.map(s => Math.round(s.temp * 10) / 10);
  const rains  = slots.map(s => Math.round(s.pop * 100));

  const pointColors = slots.map(s =>
    s.isCommute && s.pop >= 0.4 ? '#E24B4A' : '#378ADD'
  );

  const barColors = rains.map(v =>
    v >= 70 ? 'rgba(226,75,74,0.75)' :
    v >= 40 ? 'rgba(239,159,39,0.70)' :
              'rgba(93,202,165,0.60)'
  );

  // Commute zone annotation boxes
  const morningIdx = slots.reduce((acc, s, i) => s.isMorningCommute ? [...acc, i] : acc, []);
  const eveningIdx = slots.reduce((acc, s, i) => s.isEveningCommute ? [...acc, i] : acc, []);

  const annotations = {};

  if (morningIdx.length) {
    annotations.morningZone = {
      type: 'box',
      xMin: morningIdx[0] - 0.5,
      xMax: morningIdx[morningIdx.length - 1] + 0.5,
      backgroundColor: 'rgba(55,138,221,0.07)',
      borderColor: 'rgba(55,138,221,0.25)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        display: true,
        content: '→ office',
        position: { x: 'start', y: 'start' },
        font: { size: 10, family: 'sans-serif' },
        color: '#888780',
        padding: 4
      }
    };
  }

  if (eveningIdx.length) {
    annotations.eveningZone = {
      type: 'box',
      xMin: eveningIdx[0] - 0.5,
      xMax: eveningIdx[eveningIdx.length - 1] + 0.5,
      backgroundColor: 'rgba(55,138,221,0.07)',
      borderColor: 'rgba(55,138,221,0.25)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        display: true,
        content: '← home',
        position: { x: 'start', y: 'start' },
        font: { size: 10, family: 'sans-serif' },
        color: '#888780',
        padding: 4
      }
    };
  }

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Temp °C',
          data: temps,
          borderColor: '#378ADD',
          backgroundColor: 'rgba(55,138,221,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          fill: true,
          tension: 0.4,
          yAxisID: 'yTemp',
          order: 1
        },
        {
          type: 'bar',
          label: 'Rain %',
          data: rains,
          backgroundColor: barColors,
          borderRadius: 4,
          yAxisID: 'yRain',
          order: 2
        }
      ]
    },
    options: {
      responsive: false,
      animation: false,
      layout: { padding: { top: 48, right: 60, bottom: 20, left: 20 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: [
            dateLabel,
            `${Math.round(minTemp)}°C – ${Math.round(maxTemp)}°C  ·  morning: ${morningCommute.desc} ${morningCommute.pop > 20 ? '🌧 ' + morningCommute.pop + '%' : ''}  ·  evening: ${eveningCommute.desc} ${eveningCommute.pop > 20 ? '🌧 ' + eveningCommute.pop + '%' : ''}`
          ],
          color: '#3d3d3a',
          font: [
            { size: 15, weight: '500', family: 'sans-serif' },
            { size: 11, weight: 'normal', family: 'sans-serif' }
          ],
          padding: { bottom: 12 }
        },
        annotation: { annotations }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { color: '#73726c', font: { size: 11, family: 'sans-serif' }, autoSkip: false },
          border: { display: false }
        },
        yTemp: {
          position: 'left',
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            color: '#3d3d3a',
            font: { size: 11, family: 'sans-serif' },
            callback: v => Math.round(v) + '°'
          },
          border: { display: false }
        },
        yRain: {
          position: 'right',
          min: 0,
          max: 100,
          grid: { display: false },
          ticks: {
            color: '#5DCAA5',
            font: { size: 11, family: 'sans-serif' },
            callback: v => v + '%',
            stepSize: 25
          },
          border: { display: false }
        }
      }
    }
  };
}

function parseOWMData(owmList, timezone = 3600) {
  const slots = owmList.map(item => {
    const utcHour = new Date((item.dt + timezone) * 1000).getUTCHours();
    return {
      label: utcHour.toString().padStart(2, '0') + 'h',
      temp: item.main.temp,
      pop: item.pop || 0,
      desc: item.weather[0].description,
      utcHour,
      isCommute: (utcHour >= 6 && utcHour <= 9) || (utcHour >= 15 && utcHour <= 18),
      isMorningCommute: utcHour >= 6 && utcHour <= 9,
      isEveningCommute: utcHour >= 15 && utcHour <= 18
    };
  });

  const allTemps = slots.map(s => s.temp);
  const minTemp = Math.min(...allTemps);
  const maxTemp = Math.max(...allTemps);

  const morningSlots = slots.filter(s => s.isMorningCommute);
  const eveningSlots = slots.filter(s => s.isEveningCommute);

  const avgPop = arr => arr.length
    ? Math.round(arr.reduce((a, b) => a + b.pop, 0) / arr.length * 100)
    : 0;

  const morningDesc = morningSlots[0]?.desc || 'clear';
  const eveningDesc = eveningSlots[0]?.desc || 'clear';

  return {
    slots,
    minTemp,
    maxTemp,
    morningCommute: { pop: avgPop(morningSlots), desc: morningDesc },
    eveningCommute: { pop: avgPop(eveningSlots), desc: eveningDesc }
  };
}

// GET /chart?apikey=OWM_KEY
// or POST /chart with body { list: [...], city: {...} }
app.get('/chart', async (req, res) => {
  try {
    const apiKey = req.query.apikey || process.env.OWM_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Missing OWM API key' });

    const url = `https://api.openweathermap.org/data/2.5/forecast?q=Munich,de&appid=${apiKey}&units=metric&cnt=8`;
    const r = await fetch(url);
    const json = await r.json();

    if (!json.list) return res.status(500).json({ error: 'Bad OWM response', detail: json });

    const timezone = json.city.timezone;
    const data = parseOWMData(json.list, timezone);

    const today = new Date();
    const dateLabel = today.toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'Europe/Berlin'
    }) + ' · Munich';

    const config = buildConfig(data, dateLabel);
    const buffer = await renderer.renderToBuffer(config);

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /chart — accepts pre-fetched OWM data (used by n8n to avoid double fetch)
app.post('/chart', async (req, res) => {
  try {
    const { list, city } = req.body;
    if (!list) return res.status(400).json({ error: 'Missing list in body' });

    const timezone = city?.timezone || 3600;
    const data = parseOWMData(list, timezone);

    const today = new Date();
    const dateLabel = today.toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'Europe/Berlin'
    }) + ' · Munich';

    const config = buildConfig(data, dateLabel);
    const buffer = await renderer.renderToBuffer(config);

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Weather chart service running on port ${PORT}`));
