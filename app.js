/**
 * TideWatch v1.0
 * Geolocation → Nearest NOAA station → Tide data → Canvas chart
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CFG = {
  // Hours to show on each side of "now" by viewport width
  windowHours: {
    desktop: 12,   // ≥ 768px
    mobile:  3,    // < 768px
  },
  // Total hours to fetch (centered on now)
  fetchHours: { back: 48, forward: 48 },

  // Canvas dimensions
  canvas: {
    height: 320,
    paddingTop: 24,
    paddingBottom: 52,   // room for x-axis labels
    paddingLeft: 60,     // room for y-axis labels
    paddingRight: 24,
    pxPerHour: {
      desktop: 60,
      mobile: 80,
    },
  },

  // NOAA API
  noaa: {
    stationsUrl: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels&units=english',
    dataUrl:     'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
    product:     'water_level',
    datum:       'MLLW',
    units:       'english',
    timeZone:    'LST/LDT',
    format:      'json',
    interval:    '6',     // 6-minute interval
  },

  colors: {
    glow:      '#00d4ff',
    glowDim:   'rgba(0,212,255,0.15)',
    tideFill:  'rgba(0,180,230,0.18)',
    tideLine:  '#00d4ff',
    gridLine:  'rgba(0,212,255,0.07)',
    axisText:  '#4a6a7a',
    axisTextBright: '#c8dde8',
    accent:    '#f0a500',
    highMark:  'rgba(240,165,0,0.6)',
    lowMark:   'rgba(0,180,255,0.5)',
  },
};

// ─── STATE ────────────────────────────────────────────────────────────────────

let state = {
  lat: null,
  lon: null,
  station: null,
  readings: [],   // [{t: Date, v: number}]
  isMobile: window.innerWidth < 768,
};

// ─── DOM REFS ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const statusOverlay  = $('status-overlay');
const statusText     = $('status-text');
const retryBtn       = $('retry-btn');
const hero           = $('hero');
const chartSection   = $('chart-section');
const stationName    = $('station-name');
const stationDist    = $('station-dist');
const currentLevel   = $('current-level');
const trendValue     = $('trend-value');
const nextLevel      = $('next-extreme-level');
const nextLabel      = $('next-extreme-label');
const canvas         = $('tide-canvas');
const ctx            = canvas.getContext('2d');
const nowLine        = $('now-line');
const chartInner     = $('chart-inner');
const scrollWrapper  = $('chart-scroll-wrapper');

// ─── UTILS ────────────────────────────────────────────────────────────────────

function setStatus(msg) { statusText.textContent = msg; }

function showError(msg) {
  setStatus(msg);
  retryBtn.style.display = 'inline-block';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtNoaaDate(d) {
  // YYYYMMDD HH:MM
  return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtHour(d) {
  let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}${ampm}`;
}

function fmtDayShort(d) {
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── GEOLOCATION ─────────────────────────────────────────────────────────────

async function geolocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000 });
  });
}

// ─── NOAA STATIONS ───────────────────────────────────────────────────────────

async function fetchStations() {
  const res = await fetch(CFG.noaa.stationsUrl);
  if (!res.ok) throw new Error('Failed to fetch station list');
  const data = await res.json();
  return data.stations;
}

function findNearest(stations, lat, lon) {
  let best = null, bestDist = Infinity;
  for (const s of stations) {
    const d = haversineKm(lat, lon, parseFloat(s.lat), parseFloat(s.lng));
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return { station: best, distKm: bestDist };
}

// ─── NOAA TIDE DATA ───────────────────────────────────────────────────────────

async function fetchTideData(stationId) {
  const now = new Date();
  const begin = new Date(now.getTime() - CFG.fetchHours.back  * 3600 * 1000);
  const end   = new Date(now.getTime() + CFG.fetchHours.forward * 3600 * 1000);

  const params = new URLSearchParams({
    product:     CFG.noaa.product,
    application: 'tidewatch',
    begin_date:  fmtNoaaDate(begin),
    end_date:    fmtNoaaDate(end),
    datum:       CFG.noaa.datum,
    station:     stationId,
    time_zone:   CFG.noaa.timeZone,
    interval:    CFG.noaa.interval,
    units:       CFG.noaa.units,
    format:      CFG.noaa.format,
  });

  const url = `${CFG.noaa.dataUrl}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch tide data');
  const data = await res.json();

  if (data.error) throw new Error(data.error.message || 'NOAA error');

  return (data.data || []).map(d => ({
    t: new Date(d.t),
    v: parseFloat(d.v),
  })).filter(d => !isNaN(d.v));
}

// ─── HERO STATS ───────────────────────────────────────────────────────────────

function updateHero(readings) {
  const now = Date.now();
  // Find the reading closest to now
  let closest = readings.reduce((a, b) => Math.abs(b.t - now) < Math.abs(a.t - now) ? b : a);
  currentLevel.textContent = closest.v.toFixed(2);

  // Trend: compare last 30 min
  const ago30 = new Date(now - 30 * 60 * 1000);
  const prev = readings.find(r => r.t >= ago30);
  if (prev) {
    const delta = closest.v - prev.v;
    if (Math.abs(delta) < 0.05) {
      trendValue.textContent = '─';
      trendValue.style.color = 'var(--text-dim)';
    } else if (delta > 0) {
      trendValue.textContent = '▲ RISING';
      trendValue.style.color = 'var(--glow)';
    } else {
      trendValue.textContent = '▼ FALLING';
      trendValue.style.color = '#4ab8d4';
    }
  }

  // Find next high/low: local extremes after now
  const future = readings.filter(r => r.t > now);
  let nextExtreme = null, extremeType = '';
  for (let i = 1; i < future.length - 1; i++) {
    if (future[i].v > future[i-1].v && future[i].v > future[i+1].v) {
      nextExtreme = future[i]; extremeType = 'HIGH'; break;
    }
    if (future[i].v < future[i-1].v && future[i].v < future[i+1].v) {
      nextExtreme = future[i]; extremeType = 'LOW'; break;
    }
  }
  if (nextExtreme) {
    nextLevel.textContent = nextExtreme.v.toFixed(2);
    const hoursAway = ((nextExtreme.t - now) / 3600000).toFixed(1);
    nextLabel.textContent = `${extremeType} IN ${hoursAway}h`;
    nextLabel.style.color = extremeType === 'HIGH' ? 'var(--accent)' : 'var(--glow)';
  }
}

// ─── CANVAS CHART ─────────────────────────────────────────────────────────────

function drawChart(readings) {
  const isMobile = window.innerWidth < 768;
  const pxPerHour = isMobile ? CFG.canvas.pxPerHour.mobile : CFG.canvas.pxPerHour.desktop;
  const C = CFG.canvas;
  const col = CFG.colors;

  // Time span of all data
  const tMin = readings[0].t.getTime();
  const tMax = readings[readings.length - 1].t.getTime();
  const totalHours = (tMax - tMin) / 3600000;

  // Canvas size
  const W = Math.ceil(C.paddingLeft + totalHours * pxPerHour + C.paddingRight);
  const H = C.height;
  canvas.width  = W;
  canvas.height = H;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  chartInner.style.width  = W + 'px';
  chartInner.style.height = H + 'px';

  const plotW = W - C.paddingLeft - C.paddingRight;
  const plotH = H - C.paddingTop  - C.paddingBottom;

  // Value range
  const vals = readings.map(r => r.v);
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const vRange = vMax - vMin || 1;
  const vPad = vRange * 0.15;
  const yMin = vMin - vPad;
  const yMax = vMax + vPad;

  // Coordinate helpers
  const xOf = t => C.paddingLeft + ((t - tMin) / 3600000) * pxPerHour;
  const yOf = v => C.paddingTop  + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#060e1a');
  bg.addColorStop(1, '#030912');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Grid lines (horizontal, value-based) ──
  const nYLines = 5;
  ctx.strokeStyle = col.gridLine;
  ctx.lineWidth = 1;
  for (let i = 0; i <= nYLines; i++) {
    const v = yMin + (yMax - yMin) * (i / nYLines);
    const y = yOf(v);
    ctx.beginPath();
    ctx.moveTo(C.paddingLeft, y);
    ctx.lineTo(W - C.paddingRight, y);
    ctx.stroke();

    // y-axis label
    ctx.fillStyle = col.axisText;
    ctx.font = '10px "Space Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(1), C.paddingLeft - 8, y + 4);
  }

  // ── Vertical grid lines (hourly) ──
  const firstHour = new Date(tMin);
  firstHour.setMinutes(0, 0, 0);
  firstHour.setTime(firstHour.getTime() + 3600000); // next full hour

  ctx.strokeStyle = col.gridLine;
  ctx.lineWidth = 1;

  let prevDay = -1;
  let t = firstHour.getTime();
  while (t <= tMax) {
    const x = xOf(t);
    const d = new Date(t);
    const h = d.getHours();

    // Brighter line at midnight
    ctx.strokeStyle = h === 0 ? 'rgba(0,212,255,0.18)' : col.gridLine;
    ctx.lineWidth = h === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, C.paddingTop);
    ctx.lineTo(x, H - C.paddingBottom + 4);
    ctx.stroke();

    // x-axis time label — every 3 hours
    if (h % 3 === 0) {
      ctx.fillStyle = h === 0 ? col.axisTextBright : col.axisText;
      ctx.font = h === 0 ? 'bold 10px "Space Mono", monospace' : '10px "Space Mono", monospace';
      ctx.textAlign = 'center';

      if (h === 0 && d.getDay() !== prevDay) {
        ctx.fillText(fmtDayShort(d), x, H - C.paddingBottom + 18);
        prevDay = d.getDay();
      } else {
        ctx.fillText(fmtHour(d), x, H - C.paddingBottom + 18);
      }
    }

    t += 3600000;
  }

  // ── Tide fill ──
  ctx.beginPath();
  ctx.moveTo(xOf(readings[0].t.getTime()), yOf(readings[0].v));
  for (const r of readings) {
    ctx.lineTo(xOf(r.t.getTime()), yOf(r.v));
  }
  // Close path to bottom
  ctx.lineTo(xOf(readings[readings.length - 1].t.getTime()), H - C.paddingBottom);
  ctx.lineTo(xOf(readings[0].t.getTime()), H - C.paddingBottom);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, C.paddingTop, 0, H - C.paddingBottom);
  fillGrad.addColorStop(0,   'rgba(0,212,255,0.28)');
  fillGrad.addColorStop(0.5, 'rgba(0,150,200,0.12)');
  fillGrad.addColorStop(1,   'rgba(0,80,120,0.04)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // ── Tide line with glow ──
  // Outer glow
  ctx.beginPath();
  ctx.moveTo(xOf(readings[0].t.getTime()), yOf(readings[0].v));
  for (const r of readings) ctx.lineTo(xOf(r.t.getTime()), yOf(r.v));
  ctx.strokeStyle = 'rgba(0,212,255,0.2)';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Inner bright line
  ctx.beginPath();
  ctx.moveTo(xOf(readings[0].t.getTime()), yOf(readings[0].v));
  for (const r of readings) ctx.lineTo(xOf(r.t.getTime()), yOf(r.v));
  ctx.strokeStyle = col.tideLine;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── High / Low markers ──
  for (let i = 1; i < readings.length - 1; i++) {
    const prev = readings[i - 1].v;
    const curr = readings[i].v;
    const next = readings[i + 1].v;
    const isHigh = curr > prev && curr > next;
    const isLow  = curr < prev && curr < next;
    if (!isHigh && !isLow) continue;

    const x = xOf(readings[i].t.getTime());
    const y = yOf(curr);

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = isHigh ? col.highMark : col.lowMark;
    ctx.fill();
    ctx.strokeStyle = isHigh ? col.accent : col.glow;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    ctx.fillStyle = isHigh ? col.accent : col.glow;
    ctx.font = '9px "Space Mono", monospace';
    ctx.textAlign = 'center';
    const label = (isHigh ? 'H ' : 'L ') + curr.toFixed(1);
    ctx.fillText(label, x, isHigh ? y - 12 : y + 20);
  }

  // ── Y-axis label ──
  ctx.save();
  ctx.translate(14, C.paddingTop + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = col.axisText;
  ctx.font = '9px "Space Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WATER LEVEL (ft, MLLW)', 0, 0);
  ctx.restore();

  // ── NOW line via DOM ──
  const nowX = xOf(Date.now());
  nowLine.style.left = nowX + 'px';
  nowLine.style.top  = C.paddingTop + 'px';
  nowLine.style.height = (H - C.paddingTop) + 'px';

  // ── Scroll to "now - window" ──
  const windowHours = isMobile ? CFG.windowHours.mobile : CFG.windowHours.desktop;
  const scrollTarget = nowX - C.paddingLeft - windowHours * pxPerHour;
  scrollWrapper.scrollLeft = Math.max(0, scrollTarget);
}

// ─── DRAG TO SCROLL ───────────────────────────────────────────────────────────

function enableDragScroll(el) {
  let isDown = false, startX, scrollLeft;
  el.addEventListener('mousedown', e => {
    isDown = true; el.classList.add('dragging');
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
  });
  el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('dragging'); });
  el.addEventListener('mouseup',    () => { isDown = false; el.classList.remove('dragging'); });
  el.addEventListener('mousemove',  e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = scrollLeft - (x - startX);
  });
}

// ─── MAIN FLOW ────────────────────────────────────────────────────────────────

async function run() {
  retryBtn.style.display = 'none';
  statusOverlay.classList.remove('hidden');
  hero.style.display = 'none';
  chartSection.style.display = 'none';

  try {
    // 1. Geolocate
    setStatus('Requesting location…');
    const pos = await geolocate();
    state.lat = pos.coords.latitude;
    state.lon = pos.coords.longitude;

    // 2. Fetch stations
    setStatus('Finding nearest tide station…');
    const stations = await fetchStations();
    const { station, distKm } = findNearest(stations, state.lat, state.lon);
    state.station = station;

    stationName.textContent = station.name;
    stationDist.textContent = distKm < 10
      ? distKm.toFixed(1) + ' km'
      : Math.round(distKm) + ' km';

    // 3. Fetch tide data
    setStatus(`Loading tide data for ${station.name}…`);
    const readings = await fetchTideData(station.id);
    if (readings.length < 2) throw new Error('Insufficient tide data returned');
    state.readings = readings;

    // 4. Render
    statusOverlay.classList.add('hidden');
    hero.style.display = '';
    chartSection.style.display = '';

    updateHero(readings);
    drawChart(readings);
    enableDragScroll(scrollWrapper);

    // 5. Live updates every 6 minutes
    setInterval(async () => {
      try {
        const fresh = await fetchTideData(state.station.id);
        if (fresh.length > 1) {
          state.readings = fresh;
          updateHero(fresh);
          drawChart(fresh);
        }
      } catch (_) { /* silent */ }
    }, 6 * 60 * 1000);

    // Redraw on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => drawChart(state.readings), 200);
    });

  } catch (err) {
    console.error(err);
    if (err.code === 1) {
      showError('Location access denied. Please allow location and try again.');
    } else {
      showError('Error: ' + (err.message || 'Unknown error'));
    }
  }
}

retryBtn.addEventListener('click', run);
run();
