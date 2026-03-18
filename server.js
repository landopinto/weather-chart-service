const express = require('express');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WIDTH = 800;
const HEIGHT = 440;

const renderer = new ChartJSNodeCanvas({
  width: WIDTH,
  height: HEIGHT,
  backgroundColour: '#ffffff',
  chartCallback: (ChartJS) => {
    ChartJS.defaults.font.family = 'sans-serif';
  }
});

function getRainColor(v) {
  if (v >= 70) return 'rgba(226,75,74,0.75)';
  if (v >= 40) return 'rgba(239,159,39,0.70)';
  return 'rgba(93,202,165,0.60)';
}

function parseOWM(list, timezone) {
  const slots = list.map(item => {
    const localHour = new Date((item.dt + timezone) * 1000).getUTCHours();
    return {
      label: String(localHour).padStart(2, '0') + 'h',
      temp: Math.round(item.main.temp * 10) / 10,
      pop: Math.round((item.pop || 0) * 100),
      desc: item.weather[0].description,
      localHour,
      isMorning: localHour >= 6 && localHour <= 9,
      isEvening: localHour >= 15 && localHour <= 18
    };
  });
  const temps = slots.map(s => s.temp);
  const minTemp = Math.round(Math.min(...temps));
  const maxTemp = Math.round(Math.max(...temps));
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const morningPop = avg(slots.filter(s => s.isMorning).map(s => s.pop));
  const eveningPop = avg(slots.filter(s => s.isEvening).map(s => s.pop));
  const morningDesc = slots.find(s => s.isMorning)?.desc || 'clear';
  const eveningDesc = slots.find(s => s.isEvening)?.desc || 'clear';
  return { slots, minTemp, maxTemp, morningPop, eveningPop, morningDesc, eveningDesc };
}

async function renderChart(list, city) {
  const timezone = city?.timezone || 3600;
  const { slots, minTemp, maxTemp, morningPop, eveningPop, morningDesc, eveningDesc } = parseOWM(list, timezone);
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin'
  });
  const morningStr = morningPop > 20 ? 'rain ' + morningPop + '%' : morningDesc;
  const eveningStr = eveningPop > 20 ? 'rain ' + eveningPop + '%' : eveningDesc;
  const subtitle = minTemp + 'deg - ' + maxTemp + 'degC   |   to office: ' + morningStr + '   |   back home: ' + eveningStr;
  const config = {
    type: 'bar',
    data: {
      labels: slots.map(s => s.label),
      datasets: [
        {
          type: 'line',
          label: 'Temp C',
          data: slots.map(s => s.temp),
          borderColor: '#378ADD',
          backgroundColor: 'rgba(55,138,221,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: slots.map(s => (s.isMorning || s.isEvening) && s.pop >= 40 ? '#E24B4A' : '#378ADD'),
          fill: true,
          tension: 0.4,
          yAxisID: 'yTemp',
          order: 1
        },
        {
          type: 'bar',
          label: 'Rain %',
          data: slots.map(s => s.pop),
          backgroundColor: slots.map(s => getRainColor(s.pop)),
          borderRadius: 4,
          yAxisID: 'yRain',
          order: 2
        }
      ]
    },
    options: {
      responsive: false,
      animation: false,
      layout: { padding: { top: 56, right: 64, bottom: 24, left: 24 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: [today + '  Munich', subtitle],
          color: '#3d3d3a',
          font: { size: 14, family: 'sans-serif' },
          padding: { bottom: 16 }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { color: '#73726c', font: { size: 11 } }
        },
        yTemp: {
          position: 'left',
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { color: '#3d3d3a', font: { size: 11 }, callback: v => Math.round(v) + 'deg' }
        },
        yRain: {
          position: 'right',
          min: 0,
          max: 100,
          grid: { display: false },
          ticks: { color: '#5DCAA5', font: { size: 11 }, callback: v => v + '%', stepSize: 25 }
        }
      }
    },
    plugins: [{
      id: 'commuteZones',
      beforeDraw(chart) {
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        if (!x) return;
        const bw = x.getPixelForValue(1) - x.getPixelForValue(0);
        slots.forEach((s, i) => {
          if (!s.isMorning && !s.isEvening) return;
          const cx = x.getPixelForValue(i);
          ctx.save();
          ctx.fillStyle = 'rgba(55,138,221,0.07)';
          ctx.fillRect(cx - bw / 2, top, bw, bottom - top);
          ctx.restore();
        });
      }
    }]
  };
  return renderer.renderToBuffer(config);
}

app.get('/chart', async (req, res) => {
  try {
    const apiKey = req.query.apikey || process.env.OWM_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Missing OWM API key' });
    const url = 'https://api.openweathermap.org/data/2.5/forecast?q=Munich,de&appid=' + apiKey + '&units=metric&cnt=8';
    const r = await fetch(url);
    const json = await r.json();
    if (!json.list) return res.status(500).json({ error: 'Bad OWM response', detail: json });
    const buffer = await renderChart(json.list, json.city);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/chart', async (req, res) => {
  try {
    const { list, city } = req.body;
    if (!list) return res.status(400).json({ error: 'Missing list' });
    const buffer = await renderChart(list, city);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log('Weather chart service on port ' + PORT));
