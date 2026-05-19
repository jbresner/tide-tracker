/* ── TIDELINE v1.6 · app.js ── */

const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════ */
function fmt12(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T'));
  let h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')} ${ap}`;
}

function fmt12fromMins(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(mins / 60), m = Math.round(mins % 60);
  if (m === 60) { h++; m = 0; }
  h = h % 24;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${(h % 12) || 12}:${String(m).padStart(2,'0')} ${ap}`;
}

function dateStr(date) {
  return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
}

function offsetDate(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function toJD(date) { return date.getTime() / 86400000 + 2440587.5; }
function setMsg(msg) { $('loaderMsg').textContent = msg; }

const DAYS  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTHS= ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function startClock() {
  function tick() {
    const n = new Date();
    $('headerDate').textContent = `${DAYS[n.getDay()]} ${String(n.getDate()).padStart(2,'0')} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
  }
  tick(); setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════
   ASTRONOMY — Sun
══════════════════════════════════════════════ */
function calcSun(lat, lon, date) {
  const DEG = Math.PI / 180;
  const JD = toJD(date), n = JD - 2451545.0;
  const L = ((280.460 + 0.9856474*n) % 360+360) % 360;
  const g = ((357.528 + 0.9856003*n) % 360+360) % 360;
  const lam = L + 1.915*Math.sin(g*DEG) + 0.02*Math.sin(2*g*DEG);
  const eps = 23.439 - 0.0000004*n;
  const sinDec = Math.sin(eps*DEG)*Math.sin(lam*DEG);
  const dec = Math.asin(sinDec);
  const cosH = (Math.sin(-0.833*DEG) - Math.sin(lat*DEG)*sinDec) / (Math.cos(lat*DEG)*Math.cos(dec));
  if (cosH > 1)  return { riseMins:null, setMins:null, polar:'night' };
  if (cosH < -1) return { riseMins:null, setMins:null, polar:'day' };
  const H = Math.acos(cosH)/DEG;
  const RA = Math.atan2(Math.cos(eps*DEG)*Math.sin(lam*DEG), Math.cos(lam*DEG))/DEG/15;
  const EoT = L/15 - ((RA+24)%24);
  const localHrs = -date.getTimezoneOffset()/60;
  const noon = 12 - EoT - lon/15 + localHrs;
  return { riseMins:(noon - H/15)*60, setMins:(noon + H/15)*60 };
}

/* ══════════════════════════════════════════════
   ASTRONOMY — Moon phase
══════════════════════════════════════════════ */
function calcMoonPhase(date) {
  const JD = toJD(date), T = (JD-2451545.0)/36525;
  const DEG = Math.PI/180;
  const D  = ((297.85036+445267.111480*T-0.0019142*T*T+T*T*T/189474)%360+360)%360;
  const M  = ((357.52772+ 35999.050340*T-0.0001603*T*T-T*T*T/300000)%360+360)%360;
  const Mp = ((134.96298+477198.867398*T+0.0086972*T*T+T*T*T/56250) %360+360)%360;
  const elong = ((D+6.289*Math.sin(Mp*DEG)-2.100*Math.sin(M*DEG)+1.274*Math.sin((2*D-Mp)*DEG)+0.658*Math.sin(2*D*DEG)+0.214*Math.sin(2*Mp*DEG)+0.110*Math.sin(D*DEG))%360+360)%360;
  const illumination = (1-Math.cos(elong*DEG))/2;
  const knownNew = 2451550.09766, syn = 29.53058867;
  const age = ((JD-knownNew)%syn+syn)%syn;
  const fraction = age/syn;
  let name,emoji;
  if      (age< 1.85){name='New Moon';        emoji='🌑';}
  else if (age< 7.38){name='Waxing Crescent'; emoji='🌒';}
  else if (age< 9.22){name='First Quarter';   emoji='🌓';}
  else if (age<14.77){name='Waxing Gibbous';  emoji='🌔';}
  else if (age<16.61){name='Full Moon';        emoji='🌕';}
  else if (age<22.15){name='Waning Gibbous';  emoji='🌖';}
  else if (age<23.99){name='Last Quarter';    emoji='🌗';}
  else               {name='Waning Crescent'; emoji='🌘';}
  return { age, fraction, illumination:illumination*100, name, emoji };
}

/* ══════════════════════════════════════════════
   ASTRONOMY — Moonrise/Moonset (Meeus Ch.15)
══════════════════════════════════════════════ */
function calcMoonRiseSet(lat, lon, date) {
  const DEG = Math.PI/180;
  const localHrs = -date.getTimezoneOffset()/60;

  function moonCoords(JD) {
    const T = (JD-2451545.0)/36525;
    const Lo=((218.3165+481267.8813*T)%360+360)%360;
    const M =((357.5291+ 35999.0503*T)%360+360)%360;
    const Mp=((134.9634+477198.8676*T)%360+360)%360;
    const D =((297.8502+445267.1115*T)%360+360)%360;
    const F =((93.2721 +483202.0175*T)%360+360)%360;
    const lam=Lo+6.289*Math.sin(Mp*DEG)-1.274*Math.sin((2*D-Mp)*DEG)+0.658*Math.sin(2*D*DEG)-0.186*Math.sin(M*DEG)-0.059*Math.sin((2*D-2*Mp)*DEG)-0.057*Math.sin((2*D-Mp-M)*DEG)+0.053*Math.sin((2*D+Mp)*DEG)+0.046*Math.sin((2*D-M)*DEG)+0.041*Math.sin((Mp-M)*DEG)-0.035*Math.sin(D*DEG)-0.031*Math.sin((Mp+M)*DEG)-0.015*Math.sin((2*F-2*D)*DEG)+0.011*Math.sin((Mp-4*D)*DEG);
    const beta=5.128*Math.sin(F*DEG)+0.280*Math.sin((Mp+F)*DEG)+0.277*Math.sin((Mp-F)*DEG)+0.173*Math.sin((2*D-F)*DEG)+0.055*Math.sin((2*D-Mp+F)*DEG)+0.046*Math.sin((2*D-Mp-F)*DEG);
    const dist=385001-20905*Math.cos(Mp*DEG);
    const pi=Math.asin(6378.14/dist)/DEG;
    const eps=23.4393-0.0130042*T;
    const ra=Math.atan2(Math.sin(lam*DEG)*Math.cos(eps*DEG)-Math.tan(beta*DEG)*Math.sin(eps*DEG),Math.cos(lam*DEG))/DEG;
    const dec=Math.asin(Math.sin(beta*DEG)*Math.cos(eps*DEG)+Math.cos(beta*DEG)*Math.sin(eps*DEG)*Math.sin(lam*DEG))/DEG;
    return { ra:((ra%360)+360)%360, dec, pi };
  }

  function GST0(JD0) {
    const T=(JD0-2451545.0)/36525;
    return ((100.4606184+36000.77004*T+0.000387933*T*T)%360+360)%360;
  }

  const JD0_local = toJD(new Date(date.getFullYear(),date.getMonth(),date.getDate(),0,0,0));
  const JD0_UT = JD0_local + date.getTimezoneOffset()/1440;
  const mc = [-1,0,1].map(i=>moonCoords(JD0_UT+i));
  const gst0 = GST0(JD0_UT);
  const latRad = lat*DEG;
  const h0 = 0.7275*mc[1].pi - 0.5667;

  function riseset(isRise) {
    function interp3(y1,y2,y3,n){const a=y2-y1,b=y3-y2,c=b-a;return y2+n/2*(a+b+c*n);}
    let ra0=mc[0].ra,ra1=mc[1].ra,ra2=mc[2].ra;
    if(ra1-ra0>180)ra0+=360; if(ra2-ra1>180)ra1+=360;
    if(ra0-ra1>180)ra0-=360; if(ra1-ra2>180)ra1-=360;
    const dec1Rad=mc[1].dec*DEG;
    const cosH0=(Math.sin(h0*DEG)-Math.sin(latRad)*Math.sin(dec1Rad))/(Math.cos(latRad)*Math.cos(dec1Rad));
    if(cosH0<-1||cosH0>1)return null;
    const H0=Math.acos(cosH0)/DEG;
    const m0=((mc[1].ra-lon-gst0)%360+360)%360/360;
    let m=((( isRise?m0-H0/360:m0+H0/360)%1)+1)%1;
    for(let i=0;i<2;i++){
      const theta=(gst0+360.985647*m)%360;
      const nn=m+date.getTimezoneOffset()/1440;
      const ra_i=interp3(ra0,ra1,ra2,nn);
      const dec_i=interp3(mc[0].dec,mc[1].dec,mc[2].dec,nn);
      const H=((theta+lon-ra_i)%360+360)%360;
      const Hpm=H>180?H-360:H;
      const h=Math.asin(Math.sin(latRad)*Math.sin(dec_i*DEG)+Math.cos(latRad)*Math.cos(dec_i*DEG)*Math.cos(Hpm*DEG))/DEG;
      const dm=(h-h0)/(360*Math.cos(dec_i*DEG)*Math.cos(latRad)*Math.sin(Hpm*DEG));
      m=((m+dm)%1+1)%1;
    }
    return m;
  }

  function utToLocal(frac) {
    if(frac===null)return null;
    return ((frac*1440+localHrs*60)%1440+1440)%1440;
  }

  return { riseMins:utToLocal(riseset(true)), setMins:utToLocal(riseset(false)) };
}

/* ══════════════════════════════════════════════
   MOON CANVAS RENDERER
══════════════════════════════════════════════ */
function drawMoon(canvas, fraction, illuminationPct) {
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height,r=Math.min(w,h)/2-1,cx=w/2,cy=h/2;
  ctx.clearRect(0,0,w,h);
  const waning=fraction>0.5;
  const xScale=Math.cos(2*Math.PI*fraction);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.fillStyle='#0c1928'; ctx.fill();
  ctx.save(); ctx.beginPath();
  if(!waning){
    ctx.arc(cx,cy,r,-Math.PI/2,Math.PI/2,false);
    ctx.ellipse(cx,cy,r*Math.abs(xScale),r,0,Math.PI/2,-Math.PI/2,xScale>=0);
  } else {
    ctx.arc(cx,cy,r,Math.PI/2,-Math.PI/2,false);
    ctx.ellipse(cx,cy,r*Math.abs(xScale),r,0,-Math.PI/2,Math.PI/2,xScale<=0);
  }
  ctx.closePath(); ctx.fillStyle=w>30?'#d0e8ff':'#b8d0e8'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI);
  ctx.strokeStyle='rgba(148,163,184,0.3)'; ctx.lineWidth=0.8; ctx.stroke();
}

/* ══════════════════════════════════════════════
   MOON CYCLE STRIP
══════════════════════════════════════════════ */
function renderMoonCycleStrip(currentName) {
  const phases=[{name:'New Moon',emoji:'🌑'},{name:'Waxing Crescent',emoji:'🌒'},{name:'First Quarter',emoji:'🌓'},{name:'Waxing Gibbous',emoji:'🌔'},{name:'Full Moon',emoji:'🌕'},{name:'Waning Gibbous',emoji:'🌖'},{name:'Last Quarter',emoji:'🌗'},{name:'Waning Crescent',emoji:'🌘'}];
  const c=$('moonCycleStrip'); if(!c)return; c.innerHTML='';
  phases.forEach(p=>{
    const isCurrent=p.name===currentName;
    const cell=document.createElement('div');
    cell.className='phase-cell'+(isCurrent?' phase-cell--active':'');
    const icon=document.createElement('span'); icon.className='phase-emoji'; icon.textContent=p.emoji;
    const lbl=document.createElement('span');  lbl.className='phase-name';  lbl.textContent=p.name;
    cell.appendChild(icon); cell.appendChild(lbl); c.appendChild(cell);
  });
}


/* ══════════════════════════════════════════════
   TIDAL FORCE INDEX
   0–100 index combining phase alignment (70%)
   and lunar distance (30%).
══════════════════════════════════════════════ */
function calcTidalIndex(date) {
  const JD = toJD(date), T = (JD - 2451545.0) / 36525;
  const DEG = Math.PI / 180;
  const D  = ((297.85036 + 445267.111480*T - 0.0019142*T*T + T*T*T/189474) % 360 + 360) % 360;
  const M  = ((357.52772 +  35999.050340*T - 0.0001603*T*T - T*T*T/300000) % 360 + 360) % 360;
  const Mp = ((134.96298 + 477198.867398*T + 0.0086972*T*T + T*T*T/56250)  % 360 + 360) % 360;
  const elong = ((D + 6.289*Math.sin(Mp*DEG) - 2.100*Math.sin(M*DEG)
    + 1.274*Math.sin((2*D-Mp)*DEG) + 0.658*Math.sin(2*D*DEG)
    + 0.214*Math.sin(2*Mp*DEG)    + 0.110*Math.sin(D*DEG)) % 360 + 360) % 360;
  const alignment = Math.abs(Math.cos(elong * DEG)); // 1=spring, 0=neap
  const dist = 385001 - 20905*Math.cos(Mp*DEG)
                       -  3699*Math.cos((2*D-Mp)*DEG)
                       -  2956*Math.cos(2*D*DEG);
  const distFactor = Math.pow(384400 / dist, 3); // ~0.85–1.18
  const distNorm = Math.max(0, Math.min(1, (distFactor - 0.85) / (1.18 - 0.85)));
  const index = Math.max(0, Math.min(100, Math.round((alignment * 0.70 + distNorm * 0.30) * 100)));
  let label, cls;
  if      (index >= 68) { label = 'Spring';   cls = 'tidal-spring'; }
  else if (index <= 32) { label = 'Neap';     cls = 'tidal-neap';   }
  else                  { label = 'Moderate'; cls = 'tidal-mod';    }
  return { index, label, cls, alignPct: Math.round(alignment*100), distKm: Math.round(dist) };
}


/* ══════════════════════════════════════════════
   SVG MOON ICON — clean geometric, two-tone gray
   fraction: 0=new, 0.25=first qtr, 0.5=full, 0.75=last qtr
══════════════════════════════════════════════ */
function moonSVG(fraction) {
  const r = 9, cx = 10, cy = 10, w = 20, h = 20;
  const dark = '#2a3f55', lit = '#94a3b8';
  const waning = fraction > 0.5;
  // xScale: 1=new/full boundary, 0=quarter, -1=opposite quarter
  // cos(2π*f): f=0→1, f=0.25→0, f=0.5→-1, f=0.75→0
  const xScale = Math.cos(2 * Math.PI * fraction);
  const axR = Math.max(0.5, Math.abs(xScale) * r);

  let litPath;
  if (fraction < 0.015 || fraction > 0.985) {
    litPath = ''; // new moon — all dark
  } else if (Math.abs(fraction - 0.5) < 0.015) {
    litPath = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${lit}"/>`; // full moon
  } else if (!waning) {
    // Waxing (0→0.5): lit on RIGHT
    // Right semicircle: top→bottom clockwise (sweep=1)
    // Terminator ellipse: bottom→top
    //   xScale>0 (crescent, 0→0.25): ellipse curves LEFT (sweep=0) = thin sliver
    //   xScale<0 (gibbous, 0.25→0.5): ellipse curves RIGHT (sweep=1) = fat portion
    const tSweep = xScale > 0 ? '0' : '1';
    litPath = `<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 1 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  } else {
    // Waning (0.5→1): lit on LEFT
    // Left semicircle: top→bottom counter-clockwise (sweep=0)
    //   xScale<0 (gibbous, 0.5→0.75): ellipse curves LEFT (sweep=0) = fat portion
    //   xScale>0 (crescent, 0.75→1): ellipse curves RIGHT (sweep=1) = thin sliver
    const tSweep = xScale < 0 ? '0' : '1';
    litPath = `<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 0 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  }

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>
    ${litPath}
  </svg>`;
}

function moonSVGLarge(fraction) {
  const r = 22, cx = 24, cy = 24, w = 48, h = 48;
  const dark = '#2a3f55', lit = '#94a3b8';
  const waning = fraction > 0.5;
  const xScale = Math.cos(2 * Math.PI * fraction);
  const axR = Math.max(0.5, Math.abs(xScale) * r);
  let litPath;
  if (fraction < 0.015 || fraction > 0.985) {
    litPath = '';
  } else if (Math.abs(fraction - 0.5) < 0.015) {
    litPath = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${lit}"/>`;
  } else if (!waning) {
    const tSweep = xScale > 0 ? '0' : '1';
    litPath = `<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 1 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  } else {
    const tSweep = xScale < 0 ? '0' : '1';
    litPath = `<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 0 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>
    ${litPath}
  </svg>`;
}


/* ══════════════════════════════════════════════
   NOAA — nearest station
══════════════════════════════════════════════ */
async function findStation(lat, lon) {
  const r=await fetch('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels&units=english');
  if(!r.ok)throw new Error('Cannot reach NOAA station directory.');
  const data=await r.json();
  let best=null,bestD=Infinity;
  for(const s of data.stations){const d=Math.hypot(s.lat-lat,s.lng-lon);if(d<bestD){bestD=d;best=s;}}
  if(!best)throw new Error('No NOAA station found near your location.');
  return best;
}

/* ══════════════════════════════════════════════
   NOAA — fetch a range of days (single call)
══════════════════════════════════════════════ */
async function fetchRange(stationId, startDate, numDays) {
  const begin = dateStr(startDate);
  const end   = dateStr(offsetDate(startDate, numDays - 1));
  const base  = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${end}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&application=tideline&format=json`;
  const [hiloR, hrR] = await Promise.all([fetch(base+'&interval=hilo'), fetch(base+'&interval=h')]);
  const [hiloJ, hrJ] = await Promise.all([hiloR.json(), hrR.json()]);
  if(hiloJ.error||!hiloJ.predictions) throw new Error(hiloJ.error?.message||'No hi/lo data.');
  if(hrJ.error  ||!hrJ.predictions)   throw new Error('No hourly data.');

  // Split by date
  const hiloByDay = {}, hourlyByDay = {};
  for(const p of hiloJ.predictions){
    const key = p.t.slice(0,10).replace(/-/g,'');
    if(!hiloByDay[key]) hiloByDay[key]=[];
    hiloByDay[key].push(p);
  }
  for(const p of hrJ.predictions){
    const key = p.t.slice(0,10).replace(/-/g,'');
    if(!hourlyByDay[key]) hourlyByDay[key]=[];
    hourlyByDay[key].push(p);
  }
  return { hiloByDay, hourlyByDay };
}

/* ══════════════════════════════════════════════
   SVG HELPER
══════════════════════════════════════════════ */
function svgEl(tag, attrs) {
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);
  return el;
}

/* ══════════════════════════════════════════════
   SPARKLINE — mini tide curve for date strip chip
══════════════════════════════════════════════ */
function drawSparkline(canvas, hourly, globalLo, globalHi) {
  if(!canvas||!hourly||hourly.length<2)return;
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);

  const vals=hourly.map(p=>parseFloat(p.v));
  const lo=globalLo, hi=globalHi;
  const range=hi-lo||1;

  function px(i){ return (i/(hourly.length-1))*w; }
  function py(v){ return h-((v-lo)/range)*(h-4)-2; }

  // Fill
  ctx.beginPath();
  ctx.moveTo(px(0),py(vals[0]));
  for(let i=1;i<vals.length;i++) ctx.lineTo(px(i),py(vals[i]));
  ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath();
  ctx.fillStyle='rgba(59,130,246,0.18)'; ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(px(0),py(vals[0]));
  for(let i=1;i<vals.length;i++) ctx.lineTo(px(i),py(vals[i]));
  ctx.strokeStyle='#3b82f6'; ctx.lineWidth=1.5; ctx.stroke();
}

/* ══════════════════════════════════════════════
   CHART CONSTANTS (shared with scrub)
══════════════════════════════════════════════ */
let _hourly=[], _sun=null, _moonRS=null, _moon=null;
const _X0=64,_X1=990,_Y0=14,_Y1=278,_CW=926,_CH=264;
let _lo=0,_hi=10;

function toY(v){ return _Y1-(v-_lo)/(_hi-_lo)*_CH; }

function interpHeight(mins) {
  for(let i=0;i<_hourly.length-1;i++){
    const t0=new Date(_hourly[i].t.replace(' ','T'));
    const t1=new Date(_hourly[i+1].t.replace(' ','T'));
    const m0=t0.getHours()*60+t0.getMinutes();
    const m1=t1.getHours()*60+t1.getMinutes();
    if(mins>=m0&&mins<=m1){
      const frac=(mins-m0)/(m1-m0);
      return parseFloat(_hourly[i].v)+frac*(parseFloat(_hourly[i+1].v)-parseFloat(_hourly[i].v));
    }
  }
  return parseFloat(_hourly[_hourly.length-1].v);
}

function isAboveHorizon(mins,rise,set){
  if(rise===null||set===null)return false;
  return rise<set?mins>=rise&&mins<=set:mins>=rise||mins<=set;
}

function catmullRom(pts) {
  if(pts.length<2)return'';
  let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(i-1,0)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(i+2,pts.length-1)];
    const cp1x=p1[0]+(p2[0]-p0[0])/6,cp1y=p1[1]+(p2[1]-p0[1])/6;
    const cp2x=p2[0]-(p3[0]-p1[0])/6,cp2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/* ══════════════════════════════════════════════
   RENDER — track bars
══════════════════════════════════════════════ */
function renderTrack(svgId, riseMins, setMins, fillColor, lineColor) {
  const svg=$(svgId); svg.innerHTML='';
  const W=1000,H=26;
  const rx=riseMins/1440*W, sx=setMins/1440*W;
  svg.appendChild(svgEl('rect',{x:0,y:0,width:W,height:H,fill:'#060f1c',rx:2}));
  const band={y:4,height:H-8,fill:fillColor,rx:2};
  if(rx<sx){svg.appendChild(svgEl('rect',{x:rx,width:sx-rx,...band}));}
  else{svg.appendChild(svgEl('rect',{x:0,width:sx,...band}));svg.appendChild(svgEl('rect',{x:rx,width:W-rx,...band}));}
  svg.appendChild(svgEl('line',{x1:rx,y1:0,x2:rx,y2:H,stroke:lineColor,'stroke-width':1.5}));
  const rt=svgEl('text',{x:rx+5,y:17,fill:lineColor,'font-family':'DM Mono, monospace','font-size':11,'letter-spacing':'0.03em'});
  rt.textContent=fmt12fromMins(riseMins); svg.appendChild(rt);
  svg.appendChild(svgEl('line',{x1:sx,y1:0,x2:sx,y2:H,stroke:lineColor,'stroke-width':1.5}));
  const st=svgEl('text',{x:sx-5,y:17,fill:lineColor,'text-anchor':'end','font-family':'DM Mono, monospace','font-size':11,'letter-spacing':'0.03em'});
  st.textContent=fmt12fromMins(setMins); svg.appendChild(st);
  svg.appendChild(svgEl('rect',{x:0,y:0,width:W,height:H,fill:'none',stroke:'#1e3a5f','stroke-width':0.8,rx:2}));
}

/* ══════════════════════════════════════════════
   RENDER — time axis
══════════════════════════════════════════════ */
function renderTimeAxis() {
  const svg=$('timeAxis'); svg.innerHTML=''; const W=1000;
  ['12 AM','3 AM','6 AM','9 AM','12 PM','3 PM','6 PM','9 PM','12 AM'].forEach((lbl,i)=>{
    const x=(i/8)*W;
    svg.appendChild(svgEl('line',{x1:x,y1:0,x2:x,y2:5,stroke:'#2a5080','stroke-width':1}));
    const t=svgEl('text',{x,y:18,'text-anchor':'middle',fill:'#7a9bbf','font-family':'DM Mono, monospace','font-size':11,'letter-spacing':'0.04em'});
    t.textContent=lbl; svg.appendChild(t);
  });
}

/* ══════════════════════════════════════════════
   RENDER — main tide chart
══════════════════════════════════════════════ */
function renderTide(hilo, hourly, sun, moonRS, moon) {
  _hourly=hourly; _sun=sun; _moonRS=moonRS; _moon=moon;

  const vals=[...hilo,...hourly].map(p=>parseFloat(p.v));
  const minV=Math.min(...vals),maxV=Math.max(...vals),pad=(maxV-minV)*0.18;
  _lo=minV-pad; _hi=maxV+pad;

  function toX(tStr){const dt=new Date(tStr.replace(' ','T'));return _X0+(dt.getHours()*60+dt.getMinutes())/1440*_CW;}

  const grid=$('tideGrid'),yAx=$('tideYAxis');
  grid.innerHTML=''; yAx.innerHTML='';
  for(let i=0;i<=5;i++){
    const v=_lo+(_hi-_lo)*(i/5),y=toY(v);
    grid.appendChild(svgEl('line',{x1:_X0,y1:y,x2:_X1,y2:y,stroke:'#1a3050','stroke-width':0.7}));
    const t=svgEl('text',{x:_X0-8,y:y+4,'text-anchor':'end',fill:'#7a9bbf','font-family':'DM Mono, monospace','font-size':11});
    t.textContent=v.toFixed(1); yAx.appendChild(t);
  }
  for(let h=0;h<=24;h+=3){const x=_X0+(h/24)*_CW;grid.appendChild(svgEl('line',{x1:x,y1:_Y0,x2:x,y2:_Y1,stroke:'#1a3050','stroke-width':0.5}));}

  const pts=hourly.map(p=>[toX(p.t),toY(parseFloat(p.v))]);
  const path=catmullRom(pts);
  $('wCurve').setAttribute('d',path);
  $('wFill').setAttribute('d',path+` L${pts[pts.length-1][0]},${_Y1} L${pts[0][0]},${_Y1} Z`);

  // Sun markers
  const sunG=$('sunOnChart'); sunG.innerHTML='';
  if(sun.riseMins!=null){
    [{mins:sun.riseMins,isRise:true},{mins:sun.setMins,isRise:false}].forEach(ev=>{
      const x=_X0+(ev.mins/1440)*_CW;
      sunG.appendChild(svgEl('line',{x1:x,y1:_Y0,x2:x,y2:_Y1,stroke:'#f59e0b','stroke-width':1,'stroke-dasharray':'4 3',opacity:0.65}));
      const ly=_Y0+30;
      sunG.appendChild(svgEl('rect',{x:x-34,y:ly-13,width:68,height:20,fill:'#0d1a2e',rx:3,opacity:0.92}));
      const icon=svgEl('text',{x:x-20,y:ly+1,fill:'#f59e0b','font-size':13,'font-family':'serif'});
      icon.textContent='☀'; sunG.appendChild(icon);
      const lbl=svgEl('text',{x:x-4,y:ly+1,fill:'#fcd34d','font-family':'DM Mono, monospace','font-size':11});
      lbl.textContent=fmt12fromMins(ev.mins); sunG.appendChild(lbl);
    });
  }

  // Hi/Lo markers
  const hlG=$('hlOnChart'); hlG.innerHTML='';
  hilo.forEach(pt=>{
    const x=toX(pt.t),y=toY(parseFloat(pt.v)),isH=pt.type==='H';
    const col=isH?'#60a5fa':'#94a3b8',ly=isH?y-36:y+46;
    hlG.appendChild(svgEl('line',{x1:x,y1:y,x2:x,y2:isH?ly+18:ly-18,stroke:col,'stroke-width':0.8,'stroke-dasharray':'3 2',opacity:0.5}));
    hlG.appendChild(svgEl('circle',{cx:x,cy:y,r:5,fill:col,stroke:'#0d1526','stroke-width':2}));
    hlG.appendChild(svgEl('rect',{x:x-36,y:ly-13,width:72,height:26,fill:'#060f1c',rx:3,opacity:0.93}));
    const ht=svgEl('text',{x,y:ly,'text-anchor':'middle',fill:col,'font-family':'DM Mono, monospace','font-size':12,'font-weight':500});
    ht.textContent=`${isH?'▲':'▼'} ${parseFloat(pt.v).toFixed(2)} ft`; hlG.appendChild(ht);
    const tt=svgEl('text',{x,y:ly+12,'text-anchor':'middle',fill:'#7a9bbf','font-family':'DM Mono, monospace','font-size':10});
    tt.textContent=fmt12(pt.t); hlG.appendChild(tt);
  });

  // NOW indicator (only on today)
  const todayKey=dateStr(new Date());
  const displayKey=dateStr(_displayDate);
  const nowG=$('nowG');
  if(todayKey===displayKey){
    const now=new Date(),nowMins=now.getHours()*60+now.getMinutes();
    const nx=_X0+(nowMins/1440)*_CW,ny=toY(interpHeight(nowMins));
    nowG.style.display='';
    $('nowL').setAttribute('x1',nx);$('nowL').setAttribute('x2',nx);
    $('nowC').setAttribute('cx',nx);$('nowC').setAttribute('cy',ny);
    // Time + height label above the dot
    const nowTimeStr=`${(now.getHours()%12)||12}:${String(now.getMinutes()).padStart(2,'0')} ${now.getHours()>=12?'PM':'AM'}`;
    const nowHtStr=interpHeight(nowMins).toFixed(2)+' ft';
    $('nowTime').setAttribute('x',nx);$('nowTime').setAttribute('y',ny-22);
    $('nowTime').textContent=nowTimeStr;
    $('nowHt').setAttribute('x',nx);$('nowHt').setAttribute('y',ny-10);
    $('nowHt').textContent=nowHtStr;
    // Background pill
    $('nowBg').setAttribute('x',nx-34);$('nowBg').setAttribute('y',ny-32);
    $('nowBg').setAttribute('width',68);$('nowBg').setAttribute('height',26);
  } else {
    nowG.style.display='none';
  }
}

/* ══════════════════════════════════════════════
   RENDER — stats
══════════════════════════════════════════════ */
function renderStats(hilo, hourly, moon, date) {
  const todayKey=dateStr(new Date());
  const isToday=dateStr(date)===todayKey;
  const nowMins=isToday?(new Date().getHours()*60+new Date().getMinutes()):0;

  if(isToday){
    $('sCurrent').textContent=interpHeight(nowMins).toFixed(2);
    $('currentCard').style.display='';
  } else {
    $('currentCard').style.display='none';
  }

  const future=isToday?hilo.filter(p=>new Date(p.t.replace(' ','T'))>new Date()):hilo;
  if(future.length>=1){
    const n=future[0];
    $('sNextLbl').textContent=n.type==='H'?'FIRST HIGH':'FIRST LOW';
    if(isToday) $('sNextLbl').textContent=n.type==='H'?'NEXT HIGH':'NEXT LOW';
    $('sNextVal').textContent=parseFloat(n.v).toFixed(2);
    $('sNextTime').textContent=fmt12(n.t);
    $('nextCard').style.borderTop=n.type==='H'?'2px solid #3b82f6':'2px solid #94a3b8';
  }
  if(future.length>=2){
    const a=future[1];
    $('sAfterLbl').textContent=a.type==='H'?'FOLLOWING HIGH':'FOLLOWING LOW';
    $('sAfterVal').textContent=parseFloat(a.v).toFixed(2);
    $('sAfterTime').textContent=fmt12(a.t);
  }

  const hs=hilo.map(p=>parseFloat(p.v));
  $('sRange').textContent=(Math.max(...hs)-Math.min(...hs)).toFixed(2);
  $('sMoonName').textContent=moon.name.toUpperCase();
  $('sMoonIllum').textContent=`${Math.round(moon.illumination)}% illuminated`;
  const bsvg=$('moonBigSvg'); if(bsvg) bsvg.innerHTML=moonSVGLarge(moon.fraction);
  // Tidal force index
  const tidal = calcTidalIndex(date);
  $('sTidalIndex').textContent = tidal.index;
  $('sTidalLabel').textContent = tidal.label;
  $('sTidalLabel').className   = 'sc-unit tidal-label ' + tidal.cls;
  $('sTidalAlign').textContent = tidal.alignPct + '%';
  $('sTidalDist').textContent  = Math.round(tidal.distKm / 1000) + 'k km';
  const bar = $('tidalIndexBar');
  if (bar) bar.style.width = tidal.index + '%';
  // Tidal bar color via class on parent
  const tc = $('tidalCard');
  if (tc) tc.className = 'stat-card stat-card--tidal ' + tidal.cls;

  $('statsRow').style.display='grid';
}

/* ══════════════════════════════════════════════
   DATE STRIP
══════════════════════════════════════════════ */
let _lat=0,_lon=0,_station=null,_dayCache={},_displayDate=new Date();
let _globalLo=0,_globalHi=10; // consistent Y scale across all days

function buildDateStrip(today, numDays, startOffset) {
  const strip=$('dateStrip'); strip.innerHTML='';
  for(let i=startOffset;i<startOffset+numDays;i++){
    const d=offsetDate(today,i);
    const key=dateStr(d);
    const isToday=key===dateStr(today);

    const chip=document.createElement('div');
    chip.className='day-chip'+(isToday?' day-chip--today':'');
    chip.dataset.key=key;
    chip.dataset.offset=i;

    // Top row: day+date left, moon emoji right
    const topRow=document.createElement('div');
    topRow.className='chip-top-row';

    const leftCol=document.createElement('div');
    leftCol.className='chip-left';

    const dayName=document.createElement('div');
    dayName.className='chip-day';
    dayName.textContent=isToday?'TODAY':DAYS[d.getDay()];

    const dateNum=document.createElement('div');
    dateNum.className='chip-date';
    dateNum.textContent=`${d.getDate()} ${MONTHS[d.getMonth()]}`;

    leftCol.appendChild(dayName);
    leftCol.appendChild(dateNum);

    const moonEmoji=document.createElement('div');
    moonEmoji.className='chip-moon';
    moonEmoji.id='cm-'+key;

    topRow.appendChild(leftCol);
    topRow.appendChild(moonEmoji);

    const spark=document.createElement('canvas');
    spark.className='chip-spark';
    spark.width=80; spark.height=28;

    const hiloWrap=document.createElement('div');
    hiloWrap.className='chip-hilo';
    hiloWrap.id=`hilo-${key}`;
    hiloWrap.textContent='—';

    const tidalWrap=document.createElement('div');
    tidalWrap.className='chip-tidal';
    tidalWrap.id='ct-'+key;

    chip.appendChild(topRow);
    chip.appendChild(spark);
    chip.appendChild(hiloWrap);
    chip.appendChild(tidalWrap);
    strip.appendChild(chip);

    // Click to select
    chip.addEventListener('click', ()=>selectDay(d));

    // Draw sparkline if data cached
    if(_dayCache[key]){
      drawSparkline(spark,_dayCache[key].hourly,_globalLo,_globalHi);
      renderChipHilo(key,_dayCache[key].hilo);
    }
  }
}

function renderChipHilo(key, hilo) {
  const el=$(`hilo-${key}`); if(!el)return;
  const highs=hilo.filter(p=>p.type==='H').map(p=>parseFloat(p.v));
  const lows =hilo.filter(p=>p.type==='L').map(p=>parseFloat(p.v));
  if(!highs.length){el.textContent='—';return;}
  const hi=Math.max(...highs),lo=Math.min(...lows);
  el.innerHTML=`<span class="chip-hi">▲ ${hi.toFixed(1)}</span><span class="chip-lo">▼ ${lo.toFixed(1)}</span>`;
}

function updateStripSelection(date) {
  const key=dateStr(date);
  document.querySelectorAll('.day-chip').forEach(c=>{
    c.classList.toggle('day-chip--selected',c.dataset.key===key);
  });
  // Scroll selected chip into view
  const el=document.querySelector(`.day-chip[data-key="${key}"]`);
  if(el) el.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}

function fillSparklines() {
  document.querySelectorAll('.day-chip').forEach(chip=>{
    const key=chip.dataset.key;
    if(_dayCache[key]){
      const canvas=chip.querySelector('.chip-spark');
      drawSparkline(canvas,_dayCache[key].hourly,_globalLo,_globalHi);
      renderChipHilo(key,_dayCache[key].hilo);
      // Tidal index chip indicator
      const el=$('ct-'+key);
      if(el){
        const t=calcTidalIndex(_dayCache[key].date);
        el.innerHTML='<span class="chip-ti">'+t.index+'&nbsp;</span><span class="chip-tl">'+t.label+'</span>';
      }
      // Moon phase SVG icon
      const mel=$('cm-'+key);
      if(mel){
        const mp=calcMoonPhase(_dayCache[key].date);
        mel.innerHTML=moonSVG(mp.fraction);
      }
    }
  });
}

/* ══════════════════════════════════════════════
   SELECT DAY — update all panels
══════════════════════════════════════════════ */
async function selectDay(date) {
  _displayDate=date;
  const key=dateStr(date);
  updateStripSelection(date);

  // Update header date display
  $('headerDate').textContent=`${DAYS[date.getDay()]} ${String(date.getDate()).padStart(2,'0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  const data=_dayCache[key];
  if(!data){
    // Shouldn't happen since we pre-fetch, but handle gracefully
    return;
  }

  const sun   = calcSun(_lat,_lon,date);
  const moon  = calcMoonPhase(date);
  const moonRS= calcMoonRiseSet(_lat,_lon,date);

  // Update meta strip
  $('metaMoonPhase').textContent=moon.name;
  $('metaMoonIllum').textContent=`${Math.round(moon.illumination)}% lit`;
  const msvg=$('metaMoonSvg'); if(msvg) msvg.innerHTML=moonSVG(moon.fraction);

  // Update tracks
  if(sun.riseMins!=null){renderTrack('sunTrack',sun.riseMins,sun.setMins,'rgba(245,158,11,0.2)','#f59e0b');}
  if(moonRS.riseMins!=null){renderTrack('moonTrack',moonRS.riseMins,moonRS.setMins,'rgba(148,163,184,0.14)','#94a3b8');}

  // Animate chart transition
  const chartPanel=$('chartPanel');
  chartPanel.classList.add('chart-transition');
  setTimeout(()=>chartPanel.classList.remove('chart-transition'),300);

  renderTide(data.hilo,data.hourly,sun,moonRS,moon);
  renderStats(data.hilo,data.hourly,moon,date);
}

/* ══════════════════════════════════════════════
   SWIPE on main chart → change day
══════════════════════════════════════════════ */
function initChartSwipe() {
  const chart=$('tideSvg');
  let touchStartX=0, touchStartY=0;

  chart.addEventListener('touchstart',e=>{
    touchStartX=e.touches[0].clientX;
    touchStartY=e.touches[0].clientY;
  },{passive:true});

  chart.addEventListener('touchend',e=>{
    const dx=e.changedTouches[0].clientX-touchStartX;
    const dy=e.changedTouches[0].clientY-touchStartY;
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){
      const next=offsetDate(_displayDate,dx<0?1:-1);
      const key=dateStr(next);
      if(_dayCache[key]) selectDay(next);
    }
  },{passive:true});
}

/* ══════════════════════════════════════════════
   STRIP DRAG SCROLL
══════════════════════════════════════════════ */
function initStripDrag() {
  const strip=$('dateStrip');
  let isDown=false,startX=0,scrollLeft=0;

  strip.addEventListener('mousedown',e=>{
    isDown=true; startX=e.pageX-strip.offsetLeft; scrollLeft=strip.scrollLeft;
    strip.style.cursor='grabbing';
  });
  strip.addEventListener('mouseleave',()=>{ isDown=false; strip.style.cursor=''; });
  strip.addEventListener('mouseup',  ()=>{ isDown=false; strip.style.cursor=''; });
  strip.addEventListener('mousemove',e=>{
    if(!isDown)return; e.preventDefault();
    const x=e.pageX-strip.offsetLeft;
    strip.scrollLeft=scrollLeft-(x-startX);
  });
}

/* ══════════════════════════════════════════════
   SCRUB CURSOR
══════════════════════════════════════════════ */
function initScrub() {
  const svg=$('tideSvg'),lineEl=$('scrubLine'),dotEl=$('scrubDot'),tooltip=$('scrubTooltip'),closeBtn=$('ttClose');
  if(!svg||!tooltip||!closeBtn)return;
  let dragging=false;

  function getSvgX(clientX){const r=svg.getBoundingClientRect();return Math.max(_X0,Math.min(_X1,(clientX-r.left)/r.width*1000));}

  function show(clientX,clientY){
    const svgX=getSvgX(clientX),mins=(svgX-_X0)/_CW*1440,h=interpHeight(mins),cy=toY(h);
    if(lineEl){lineEl.setAttribute('x1',svgX);lineEl.setAttribute('x2',svgX);lineEl.style.display='';}
    if(dotEl){dotEl.setAttribute('cx',svgX);dotEl.setAttribute('cy',cy);dotEl.style.display='';}
    const sunUp=_sun&&isAboveHorizon(mins,_sun.riseMins,_sun.setMins);
    const moonUp=_moonRS&&isAboveHorizon(mins,_moonRS.riseMins,_moonRS.setMins);
    $('ttTime').textContent=fmt12fromMins(mins);
    $('ttHeight').textContent=h.toFixed(2)+' ft MLLW';
    $('ttSun').textContent=sunUp?'☀  Sun above horizon':'☀  Sun below horizon';
    $('ttMoon').textContent=moonUp?'🌑 Moon above horizon':'🌑 Moon below horizon';
    $('ttPhase').textContent=_moon?`${_moon.emoji} ${_moon.name} · ${Math.round(_moon.illumination)}% lit`:'';
    const ttW=200,margin=14;
    const left=clientX+margin+ttW>window.innerWidth?clientX-ttW-margin:clientX+margin;
    tooltip.style.display='block';
    tooltip.style.left=left+'px';
    tooltip.style.top=Math.max(8,clientY-20)+'px';
  }

  function hide(){
    if(lineEl)lineEl.style.display='none';
    if(dotEl)dotEl.style.display='none';
    tooltip.style.display='none';
    dragging=false;
  }

  svg.style.cursor='crosshair';
  svg.addEventListener('mousedown',e=>{dragging=true;show(e.clientX,e.clientY);});
  svg.addEventListener('mousemove',e=>{if(dragging)show(e.clientX,e.clientY);});
  window.addEventListener('mouseup',()=>{dragging=false;});
  closeBtn.addEventListener('click',hide);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});

  // Touch — scrub takes priority over swipe if drag is horizontal on chart
  let tStartX=0,tStartY=0,tScrubbing=false;
  svg.addEventListener('touchstart',e=>{
    tStartX=e.touches[0].clientX;tStartY=e.touches[0].clientY;tScrubbing=false;
  },{passive:true});
  svg.addEventListener('touchmove',e=>{
    const dx=Math.abs(e.touches[0].clientX-tStartX),dy=Math.abs(e.touches[0].clientY-tStartY);
    if(!tScrubbing&&dx<10&&dy<10)return;
    tScrubbing=true;
    e.preventDefault();
    show(e.touches[0].clientX,e.touches[0].clientY);
  },{passive:false});
  svg.addEventListener('touchend',()=>{dragging=false;});
}

/* ══════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════ */
async function init() {
  startClock();

  if(!navigator.geolocation){setMsg('GEOLOCATION NOT SUPPORTED BY YOUR BROWSER');return;}

  let lat,lon;
  try{
    const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:14000}));
    lat=pos.coords.latitude;lon=pos.coords.longitude;
  }catch{
    setMsg('LOCATION ACCESS DENIED — PLEASE ENABLE AND RELOAD');
    $('pulseDot').classList.add('dim');return;
  }
  _lat=lat;_lon=lon;

  const today=new Date();
  _displayDate=today;

  // Astronomy for today
  const sun   =calcSun(lat,lon,today);
  const moon  =calcMoonPhase(today);
  const moonRS=calcMoonRiseSet(lat,lon,today);

  // Meta strip
  const latDir=lat>=0?'N':'S',lonDir=lon>=0?'E':'W';
  $('metaCoords').textContent=`${Math.abs(lat).toFixed(3)}° ${latDir}  ${Math.abs(lon).toFixed(3)}° ${lonDir}`;
  $('metaMoonPhase').textContent=moon.name;
  $('metaMoonIllum').textContent=`${Math.round(moon.illumination)}% lit`;
  const msvg=$('metaMoonSvg'); if(msvg) msvg.innerHTML=moonSVG(moon.fraction);
  $('metaStrip').style.opacity='1';

  if(sun.riseMins!=null){renderTrack('sunTrack',sun.riseMins,sun.setMins,'rgba(245,158,11,0.2)','#f59e0b');}
  if(moonRS.riseMins!=null){renderTrack('moonTrack',moonRS.riseMins,moonRS.setMins,'rgba(148,163,184,0.14)','#94a3b8');}
  renderTimeAxis();

  // Find station
  setMsg('LOCATING NEAREST TIDE STATION');
  let station;
  try{station=await findStation(lat,lon);}
  catch(e){setMsg(e.message.toUpperCase());return;}
  _station=station;
  $('stationName').textContent=station.name;
  $('stationId').textContent=`NOAA TIDE STATION ${station.id} · ${station.state||''}`;
  $('footerStn').textContent=`STATION ${station.id} — ${station.name}`;

  // Fetch 14 days: 2 before today through 11 after
  const START_OFFSET=-2, NUM_DAYS=60;
  const startDate=offsetDate(today,START_OFFSET);
  setMsg('LOADING 60-DAY TIDE DATA…');
  let hiloByDay,hourlyByDay;
  try{
    const r=await fetchRange(station.id,startDate,NUM_DAYS);
    hiloByDay=r.hiloByDay;hourlyByDay=r.hourlyByDay;
  }catch(e){setMsg(e.message.toUpperCase());return;}

  // Build cache and compute global Y range for consistent sparklines
  let glo=Infinity,ghi=-Infinity;
  for(let i=0;i<NUM_DAYS;i++){
    const d=offsetDate(startDate,i);
    const key=dateStr(d);
    const hilo=hiloByDay[key]||[];
    const hourly=hourlyByDay[key]||[];
    if(hourly.length){
      const vals=hourly.map(p=>parseFloat(p.v));
      glo=Math.min(glo,...vals);ghi=Math.max(ghi,...vals);
    }
    _dayCache[key]={hilo,hourly,date:d};
  }
  _globalLo=glo;_globalHi=ghi;

  // Build date strip
  buildDateStrip(today,NUM_DAYS,START_OFFSET);
  fillSparklines();
  updateStripSelection(today);

  // Show today
  $('loadingWrap').style.display='none';
  $('chartPanel').style.display='flex';
  $('chartPanel').style.flexDirection='column';
  $('dateStripWrap').style.display='block';

  const todayData=_dayCache[dateStr(today)];
  renderTide(todayData.hilo,todayData.hourly,sun,moonRS,moon);
  renderStats(todayData.hilo,todayData.hourly,moon,today);

  initScrub();
  initPanHandle();
  startNowTicker();
  initChartSwipe();
  initStripDrag();
}

init();
