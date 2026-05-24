/* ── TIDE TRACKER v2.3.2 · app.js ── */

const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════ */
const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// Chart geometry (SVG units per day)
const DAY_W  = 1000;   // SVG units wide per day
const CHART_H = 310;   // SVG height
const Y0 = 14, Y1 = 278, CH = Y1 - Y0;  // chart area top/bottom/height
const TRACK_H = 26;    // moon/sun track height
const AXIS_H  = 22;    // time axis height
const LABEL_W = 58;    // fixed label column width (px)

// Pointer is at center of visible area
// On load we position the chart so NOW is under the pointer

/* ══════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════ */
function fmt12fromMins(totalMins) {
  totalMins = ((totalMins % 1440) + 1440) % 1440;
  let h = Math.floor(totalMins / 60), m = Math.round(totalMins % 60);
  if (m === 60) { h++; m = 0; } h = h % 24;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${(h%12)||12}:${String(m).padStart(2,'0')} ${ap}`;
}

function fmt12(dateStr) {
  const d = new Date(dateStr.replace(' ','T'));
  let h = d.getHours(), m = d.getMinutes(), ap = h>=12?'PM':'AM';
  h = h%12||12;
  return `${h}:${String(m).padStart(2,'0')} ${ap}`;
}

function dateKey(date) {
  return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
}

function offsetDate(base, days) {
  const d = new Date(base); d.setDate(d.getDate()+days); return d;
}

function toJD(date) { return date.getTime()/86400000 + 2440587.5; }
function setMsg(msg) { $('loaderMsg').textContent = msg; }

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function startClock() {
  function tick() {
    const n = new Date();
    const day = DAYS[n.getDay()][0] + DAYS[n.getDay()].slice(1).toLowerCase();
    const mon = MONTHS[n.getMonth()][0] + MONTHS[n.getMonth()].slice(1).toLowerCase();
    const el=$('headerDate');
    if(el) el.textContent = `${day}, ${mon} ${n.getDate()}, ${n.getFullYear()}`;
  }
  tick(); setInterval(tick, 60000);
}

/* ══════════════════════════════════════════════
   ASTRONOMY — Sun
══════════════════════════════════════════════ */
function calcSun(lat, lon, date) {
  const DEG = Math.PI/180;
  const JD = toJD(date), n = JD-2451545.0;
  const L = ((280.460+0.9856474*n)%360+360)%360;
  const g = ((357.528+0.9856003*n)%360+360)%360;
  const lam = L+1.915*Math.sin(g*DEG)+0.02*Math.sin(2*g*DEG);
  const eps = 23.439-0.0000004*n;
  const sinDec = Math.sin(eps*DEG)*Math.sin(lam*DEG);
  const dec = Math.asin(sinDec);
  const cosH = (Math.sin(-0.833*DEG)-Math.sin(lat*DEG)*sinDec)/(Math.cos(lat*DEG)*Math.cos(dec));
  if (cosH>1)  return {riseMins:null,setMins:null,polar:'night'};
  if (cosH<-1) return {riseMins:null,setMins:null,polar:'day'};
  const H = Math.acos(cosH)/DEG;
  const RA = Math.atan2(Math.cos(eps*DEG)*Math.sin(lam*DEG),Math.cos(lam*DEG))/DEG/15;
  const EoT = L/15-((RA+24)%24);
  const localHrs = -date.getTimezoneOffset()/60;
  const noon = 12-EoT-lon/15+localHrs;
  return {riseMins:(noon-H/15)*60, setMins:(noon+H/15)*60};
}

/* ══════════════════════════════════════════════
   ASTRONOMY — Moon phase
══════════════════════════════════════════════ */
function calcMoonPhase(date) {
  const JD=toJD(date), T=(JD-2451545.0)/36525;
  const DEG=Math.PI/180;
  const D=((297.85036+445267.111480*T-0.0019142*T*T+T*T*T/189474)%360+360)%360;
  const M=((357.52772+35999.050340*T-0.0001603*T*T-T*T*T/300000)%360+360)%360;
  const Mp=((134.96298+477198.867398*T+0.0086972*T*T+T*T*T/56250)%360+360)%360;
  const elong=((D+6.289*Math.sin(Mp*DEG)-2.100*Math.sin(M*DEG)+1.274*Math.sin((2*D-Mp)*DEG)+0.658*Math.sin(2*D*DEG)+0.214*Math.sin(2*Mp*DEG)+0.110*Math.sin(D*DEG))%360+360)%360;
  const illumination=(1-Math.cos(elong*DEG))/2;
  const knownNew=2451550.09766, syn=29.53058867;
  const age=((JD-knownNew)%syn+syn)%syn;
  const fraction=age/syn;
  let name,emoji;
  if(age<1.85){name='New Moon';emoji='🌑';}
  else if(age<7.38){name='Waxing Crescent';emoji='🌒';}
  else if(age<9.22){name='First Quarter';emoji='🌓';}
  else if(age<14.77){name='Waxing Gibbous';emoji='🌔';}
  else if(age<16.61){name='Full Moon';emoji='🌕';}
  else if(age<22.15){name='Waning Gibbous';emoji='🌖';}
  else if(age<23.99){name='Last Quarter';emoji='🌗';}
  else{name='Waning Crescent';emoji='🌘';}
  return {age,fraction,illumination:illumination*100,name,emoji};
}

/* ══════════════════════════════════════════════
   ASTRONOMY — Moonrise/Moonset (Meeus)
══════════════════════════════════════════════ */
function calcMoonRiseSet(lat, lon, date) {
  const DEG=Math.PI/180;
  const localHrs=-date.getTimezoneOffset()/60;
  function moonCoords(JD){
    const T=(JD-2451545.0)/36525;
    const Lo=((218.3165+481267.8813*T)%360+360)%360;
    const M=((357.5291+35999.0503*T)%360+360)%360;
    const Mp=((134.9634+477198.8676*T)%360+360)%360;
    const D=((297.8502+445267.1115*T)%360+360)%360;
    const F=((93.2721+483202.0175*T)%360+360)%360;
    const lam=Lo+6.289*Math.sin(Mp*DEG)-1.274*Math.sin((2*D-Mp)*DEG)+0.658*Math.sin(2*D*DEG)-0.186*Math.sin(M*DEG)-0.059*Math.sin((2*D-2*Mp)*DEG)-0.057*Math.sin((2*D-Mp-M)*DEG)+0.053*Math.sin((2*D+Mp)*DEG)+0.046*Math.sin((2*D-M)*DEG)+0.041*Math.sin((Mp-M)*DEG)-0.035*Math.sin(D*DEG)-0.031*Math.sin((Mp+M)*DEG)-0.015*Math.sin((2*F-2*D)*DEG)+0.011*Math.sin((Mp-4*D)*DEG);
    const beta=5.128*Math.sin(F*DEG)+0.280*Math.sin((Mp+F)*DEG)+0.277*Math.sin((Mp-F)*DEG)+0.173*Math.sin((2*D-F)*DEG)+0.055*Math.sin((2*D-Mp+F)*DEG)+0.046*Math.sin((2*D-Mp-F)*DEG);
    const dist=385001-20905*Math.cos(Mp*DEG);
    const pi=Math.asin(6378.14/dist)/DEG;
    const eps=23.4393-0.0130042*T;
    const ra=Math.atan2(Math.sin(lam*DEG)*Math.cos(eps*DEG)-Math.tan(beta*DEG)*Math.sin(eps*DEG),Math.cos(lam*DEG))/DEG;
    const dec=Math.asin(Math.sin(beta*DEG)*Math.cos(eps*DEG)+Math.cos(beta*DEG)*Math.sin(eps*DEG)*Math.sin(lam*DEG))/DEG;
    return{ra:((ra%360)+360)%360,dec,pi};
  }
  function GST0(JD0){const T=(JD0-2451545.0)/36525;return((100.4606184+36000.77004*T+0.000387933*T*T)%360+360)%360;}
  const JD0_local=toJD(new Date(date.getFullYear(),date.getMonth(),date.getDate(),0,0,0));
  const JD0_UT=JD0_local+date.getTimezoneOffset()/1440;
  const mc=[-1,0,1].map(i=>moonCoords(JD0_UT+i));
  const gst0=GST0(JD0_UT);
  const latRad=lat*DEG;
  const h0=0.7275*mc[1].pi-0.5667;
  function riseset(isRise){
    function interp3(y1,y2,y3,n){const a=y2-y1,b=y3-y2,c=b-a;return y2+n/2*(a+b+c*n);}
    let ra0=mc[0].ra,ra1=mc[1].ra,ra2=mc[2].ra;
    if(ra1-ra0>180)ra0+=360;if(ra2-ra1>180)ra1+=360;
    if(ra0-ra1>180)ra0-=360;if(ra1-ra2>180)ra1-=360;
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
  function utToLocal(frac){
    if(frac===null)return null;
    return((frac*1440+localHrs*60)%1440+1440)%1440;
  }
  return{riseMins:utToLocal(riseset(true)),setMins:utToLocal(riseset(false))};
}

/* ══════════════════════════════════════════════
   ASTRONOMY — Tidal Index
══════════════════════════════════════════════ */
function calcTidalIndex(date) {
  const JD=toJD(date),T=(JD-2451545.0)/36525;
  const DEG=Math.PI/180;
  const D=((297.85036+445267.111480*T-0.0019142*T*T+T*T*T/189474)%360+360)%360;
  const M=((357.52772+35999.050340*T-0.0001603*T*T-T*T*T/300000)%360+360)%360;
  const Mp=((134.96298+477198.867398*T+0.0086972*T*T+T*T*T/56250)%360+360)%360;
  const elong=((D+6.289*Math.sin(Mp*DEG)-2.100*Math.sin(M*DEG)+1.274*Math.sin((2*D-Mp)*DEG)+0.658*Math.sin(2*D*DEG)+0.214*Math.sin(2*Mp*DEG)+0.110*Math.sin(D*DEG))%360+360)%360;
  const alignment=Math.abs(Math.cos(elong*DEG));
  const dist=385001-20905*Math.cos(Mp*DEG)-3699*Math.cos((2*D-Mp)*DEG)-2956*Math.cos(2*D*DEG);
  const distFactor=Math.pow(384400/dist,3);
  const distNorm=Math.max(0,Math.min(1,(distFactor-0.85)/(1.18-0.85)));
  const index=Math.max(0,Math.min(100,Math.round((alignment*0.70+distNorm*0.30)*100)));
  let label,cls;
  if(index>=68){label='Spring';cls='tidal-spring';}
  else if(index<=32){label='Neap';cls='tidal-neap';}
  else{label='Moderate';cls='tidal-mod';}
  return{index,label,cls,alignPct:Math.round(alignment*100),distKm:Math.round(dist)};
}

/* ══════════════════════════════════════════════
   MOON SVG ICONS
══════════════════════════════════════════════ */
function moonSVG(fraction) {
  const r=9,cx=10,cy=10,w=20,h=20;
  const dark='#2a3f55',lit='#94a3b8';
  const waning=fraction>0.5;
  const xScale=Math.cos(2*Math.PI*fraction);
  const axR=Math.max(0.5,Math.abs(xScale)*r);
  let litPath;
  if(fraction<0.015||fraction>0.985){litPath='';}
  else if(Math.abs(fraction-0.5)<0.015){litPath=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${lit}"/>`;}
  else if(!waning){
    const tSweep=xScale>0?'0':'1';
    litPath=`<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 1 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  } else {
    const tSweep=xScale<0?'0':'1';
    litPath=`<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 0 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>${litPath}</svg>`;
}

function moonSVGLarge(fraction) {
  const r=22,cx=24,cy=24,w=48,h=48;
  const dark='#2a3f55',lit='#94a3b8';
  const waning=fraction>0.5;
  const xScale=Math.cos(2*Math.PI*fraction);
  const axR=Math.max(0.5,Math.abs(xScale)*r);
  let litPath;
  if(fraction<0.015||fraction>0.985){litPath='';}
  else if(Math.abs(fraction-0.5)<0.015){litPath=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${lit}"/>`;}
  else if(!waning){
    const tSweep=xScale>0?'0':'1';
    litPath=`<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 1 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  } else {
    const tSweep=xScale<0?'0':'1';
    litPath=`<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 0 ${cx} ${cy+r} A ${axR} ${r} 0 0 ${tSweep} ${cx} ${cy-r} Z" fill="${lit}"/>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>${litPath}</svg>`;
}

/* ══════════════════════════════════════════════
   NOAA
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

async function fetchRange(stationId, startDate, numDays) {
  const begin=dateKey(startDate);
  const end=dateKey(offsetDate(startDate,numDays-1));
  const base=`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${end}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&application=tidetracker&format=json`;
  const [hiloR,hrR]=await Promise.all([fetch(base+'&interval=hilo'),fetch(base+'&interval=h')]);
  const [hiloJ,hrJ]=await Promise.all([hiloR.json(),hrR.json()]);
  if(hiloJ.error||!hiloJ.predictions)throw new Error(hiloJ.error?.message||'No hi/lo data.');
  if(hrJ.error||!hrJ.predictions)throw new Error('No hourly data.');
  const hiloByDay={},hourlyByDay={};
  for(const p of hiloJ.predictions){const k=p.t.slice(0,10).replace(/-/g,'');if(!hiloByDay[k])hiloByDay[k]=[];hiloByDay[k].push(p);}
  for(const p of hrJ.predictions){const k=p.t.slice(0,10).replace(/-/g,'');if(!hourlyByDay[k])hourlyByDay[k]=[];hourlyByDay[k].push(p);}
  return{hiloByDay,hourlyByDay};
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
   MULTI-DAY CHART STATE
══════════════════════════════════════════════ */
let _dayCache  = {};   // key → {hilo, hourly, date, sun, moonRS, moon}
let _days      = [];   // ordered array of day keys
let _globalLo  = 0;
let _globalHi  = 10;
let _lat = 0, _lon = 0;
let _panOffset = 0;    // current pan position in SVG units (0 = start of first day)
let _totalW    = 0;    // total SVG width = numDays * DAY_W
let _visibleW  = 0;    // visible SVG units (depends on container width)

// Convert pan offset to a Date + minutes
function panToDateTime() {
  const totalMins = (_panOffset / DAY_W) * 1440;
  const dayIndex  = Math.floor(totalMins / 1440);
  const mins      = totalMins % 1440;
  const key       = _days[Math.max(0, Math.min(_days.length-1, dayIndex))];
  return { key, mins, dayIndex };
}

// Convert Date + mins to pan offset
function dateTimeToPan(dayIndex, mins) {
  return dayIndex * DAY_W + (mins / 1440) * DAY_W;
}

/* ══════════════════════════════════════════════
   CATMULL-ROM SPLINE
══════════════════════════════════════════════ */
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
   BUILD CONTINUOUS MULTI-DAY SVGs
══════════════════════════════════════════════ */
function buildContinuousCharts() {
  const numDays = _days.length;
  _totalW = numDays * DAY_W;

  const lo = _globalLo, hi = _globalHi;
  const pad = (hi-lo)*0.18;
  const vlo = lo-pad, vhi = hi+pad;
  const vRange = vhi-vlo;

  function toY(v) { return Y1-((v-vlo)/vRange)*CH; }

  // ── Tide SVG ──
  const tideSvg = $('tideSvg');
  tideSvg.setAttribute('viewBox', `0 0 ${_totalW} ${CHART_H}`);
  tideSvg.setAttribute('width', _totalW);

  // Clear dynamic content
  $('tideGrid').innerHTML = '';
  $('tideYAxis').innerHTML = '';

  // Y axis labels + horizontal grid lines (repeat each day)
  for(let di=0;di<numDays;di++){
    const x0 = di*DAY_W;
    for(let i=0;i<=5;i++){
      const v=vlo+(vhi-vlo)*(i/5), y=toY(v);
      if(di===0){
        const t=svgEl('text',{x:x0+6,y:y-4,'text-anchor':'start',fill:'#7a9bbf','font-family':'DM Mono, monospace','font-size':11});
        t.textContent=v.toFixed(1);
        $('tideYAxis').appendChild(t);
      }
      $('tideGrid').appendChild(svgEl('line',{x1:x0,y1:y,x2:x0+DAY_W,y2:y,stroke:'#1a3050','stroke-width':0.7}));
    }
    // Vertical hour lines
    for(let h=0;h<=24;h+=3){
      const x=x0+(h/24)*DAY_W;
      $('tideGrid').appendChild(svgEl('line',{x1:x,y1:Y0,x2:x,y2:Y1,stroke:'#1a3050','stroke-width':0.5}));
    }
    // Day boundary line
    if(di>0){
      $('tideGrid').appendChild(svgEl('line',{x1:di*DAY_W,y1:Y0,x2:di*DAY_W,y2:Y1,stroke:'#2a5080','stroke-width':1.5}));
    }
  }

  // Tide curve + fill across all days
  let allPts = [];
  _days.forEach((key,di)=>{
    const cache = _dayCache[key];
    if(!cache||!cache.hourly||!cache.hourly.length)return;
    cache.hourly.forEach(p=>{
      const dt=new Date(p.t.replace(' ','T'));
      const mins=dt.getHours()*60+dt.getMinutes();
      const x=di*DAY_W+(mins/1440)*DAY_W;
      const y=toY(parseFloat(p.v));
      allPts.push([x,y]);
    });
  });

  if(allPts.length){
    const path=catmullRom(allPts);
    $('wCurve').setAttribute('d',path);
    $('wFill').setAttribute('d',path+` L${allPts[allPts.length-1][0]},${Y1} L${allPts[0][0]},${Y1} Z`);
    // Update clip path
    $('tClip').querySelector('rect').setAttribute('width', _totalW);
  }

  // Hi/Lo markers
  $('hlOnChart').innerHTML='';
  _days.forEach((key,di)=>{
    const cache=_dayCache[key];
    if(!cache||!cache.hilo)return;
    cache.hilo.forEach(pt=>{
      const dt=new Date(pt.t.replace(' ','T'));
      const mins=dt.getHours()*60+dt.getMinutes();
      const x=di*DAY_W+(mins/1440)*DAY_W;
      const y=toY(parseFloat(pt.v));
      const isH=pt.type==='H';
      const col=isH?'#60a5fa':'#94a3b8';
      const ly=isH?y-36:y+46;
      $('hlOnChart').appendChild(svgEl('line',{x1:x,y1:y,x2:x,y2:isH?ly+18:ly-18,stroke:col,'stroke-width':0.8,'stroke-dasharray':'3 2',opacity:0.5}));
      $('hlOnChart').appendChild(svgEl('circle',{cx:x,cy:y,r:5,fill:col,stroke:'#0d1526','stroke-width':2}));
      $('hlOnChart').appendChild(svgEl('rect',{x:x-36,y:ly-13,width:72,height:26,fill:'#060f1c',rx:3,opacity:0.93}));
      const ht=svgEl('text',{x,y:ly,'text-anchor':'middle',fill:col,'font-family':'DM Mono, monospace','font-size':12,'font-weight':500});
      ht.textContent=`${isH?'▲':'▼'} ${parseFloat(pt.v).toFixed(2)} ft`;
      $('hlOnChart').appendChild(ht);
      const tt=svgEl('text',{x,y:ly+12,'text-anchor':'middle',fill:'#7a9bbf','font-family':'DM Mono, monospace','font-size':10});
      tt.textContent=fmt12(pt.t);
      $('hlOnChart').appendChild(tt);
    });
  });

  // Sun rise/set lines on chart — times shown in sun track above, no labels here
  $('sunOnChart').innerHTML='';
  _days.forEach((key,di)=>{
    const cache=_dayCache[key];
    if(!cache||!cache.sun)return;
    const sun=cache.sun;
    [{mins:sun.riseMins},{mins:sun.setMins}]
      .filter(e=>e.mins!=null)
      .forEach(ev=>{
        const x=di*DAY_W+(ev.mins/1440)*DAY_W;
        $('sunOnChart').appendChild(svgEl('line',{x1:x,y1:Y0,x2:x,y2:Y1,stroke:'#f59e0b','stroke-width':1,'stroke-dasharray':'4 3',opacity:0.5}));
      });
  });

  // Border rect per day
  const border=$('tideBorder');
  if(border){border.setAttribute('x',0);border.setAttribute('width',_totalW);}

  // ── Moon track SVG ──
  const moonSvg=$('moonTrack');
  moonSvg.setAttribute('viewBox',`0 0 ${_totalW} ${TRACK_H}`);
  moonSvg.setAttribute('width',_totalW);
  moonSvg.innerHTML='';
  _days.forEach((key,di)=>{
    const cache=_dayCache[key];
    if(!cache||!cache.moonRS)return;
    const {riseMins,setMins}=cache.moonRS;
    if(riseMins===null)return;
    const W=DAY_W,x0=di*DAY_W;
    const rx=x0+(riseMins/1440)*W, sx=x0+(setMins/1440)*W;
    const band={y:4,height:TRACK_H-8,fill:'rgba(148,163,184,0.14)',rx:2};
    if(rx<sx){moonSvg.appendChild(svgEl('rect',{x:rx,width:sx-rx,...band}));}
    else{moonSvg.appendChild(svgEl('rect',{x:x0,width:sx-x0,...band}));moonSvg.appendChild(svgEl('rect',{x:rx,width:x0+W-rx,...band}));}
    moonSvg.appendChild(svgEl('line',{x1:rx,y1:0,x2:rx,y2:TRACK_H,stroke:'#94a3b8','stroke-width':1.2}));
    moonSvg.appendChild(svgEl('line',{x1:sx,y1:0,x2:sx,y2:TRACK_H,stroke:'#94a3b8','stroke-width':1.2}));
    // Background
    moonSvg.appendChild(svgEl('rect',{x:x0,y:0,width:W,height:TRACK_H,fill:'none',stroke:'#1e3a5f','stroke-width':0.5}));
  });

  // ── Sun track SVG ──
  const sunSvg=$('sunTrack');
  sunSvg.setAttribute('viewBox',`0 0 ${_totalW} ${TRACK_H}`);
  sunSvg.setAttribute('width',_totalW);
  sunSvg.innerHTML='';
  _days.forEach((key,di)=>{
    const cache=_dayCache[key];
    if(!cache||!cache.sun)return;
    const sun=cache.sun;
    if(sun.riseMins===null)return;
    const W=DAY_W,x0=di*DAY_W;
    const rx=x0+(sun.riseMins/1440)*W, sx=x0+(sun.setMins/1440)*W;
    sunSvg.appendChild(svgEl('rect',{x:rx,y:4,width:sx-rx,height:TRACK_H-8,fill:'rgba(245,158,11,0.2)',rx:2}));
    sunSvg.appendChild(svgEl('line',{x1:rx,y1:0,x2:rx,y2:TRACK_H,stroke:'#f59e0b','stroke-width':1.2}));
    sunSvg.appendChild(svgEl('line',{x1:sx,y1:0,x2:sx,y2:TRACK_H,stroke:'#f59e0b','stroke-width':1.2}));
    sunSvg.appendChild(svgEl('rect',{x:x0,y:0,width:W,height:TRACK_H,fill:'none',stroke:'#1e3a5f','stroke-width':0.5}));
    // Sunrise label — vertically centered, to the right of rise line
    const rLbl=svgEl('text',{x:rx+5,y:TRACK_H/2,fill:'#fcd34d','font-family':'DM Mono, monospace','font-size':9,'font-weight':500,'dominant-baseline':'middle'});
    rLbl.textContent=`▲ ${fmt12fromMins(sun.riseMins)}`;
    sunSvg.appendChild(rLbl);
    // Sunset label — vertically centered, to the LEFT of set line so it stays inside
    const sLbl=svgEl('text',{x:sx-5,y:TRACK_H/2,fill:'#fcd34d','font-family':'DM Mono, monospace','font-size':9,'font-weight':500,'dominant-baseline':'middle','text-anchor':'end'});
    sLbl.textContent=`▼ ${fmt12fromMins(sun.setMins)}`;
    sunSvg.appendChild(sLbl);
  });

  // ── Time axis SVG ──
  const axisSvg=$('timeAxis');
  axisSvg.setAttribute('viewBox',`0 0 ${_totalW} ${AXIS_H}`);
  axisSvg.setAttribute('width',_totalW);
  axisSvg.innerHTML='';
  const timeLabels=['12a','3a','6a','9a','12p','3p','6p','9p','12a'];
  _days.forEach((key,di)=>{
    const x0=di*DAY_W;
    // Day label
    const cache=_dayCache[key];
    if(cache&&cache.date){
      const d=cache.date;
      const dlbl=svgEl('text',{x:x0+DAY_W/2,y:AXIS_H-2,'text-anchor':'middle',fill:'#2a5080','font-family':'DM Mono, monospace','font-size':9,'letter-spacing':'0.06em'});
      dlbl.textContent=`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
      axisSvg.appendChild(dlbl);
    }
    timeLabels.forEach((lbl,i)=>{
      const x=x0+(i/8)*DAY_W;
      axisSvg.appendChild(svgEl('line',{x1:x,y1:0,x2:x,y2:4,stroke:'#2a5080','stroke-width':1}));
      const t=svgEl('text',{x,y:14,'text-anchor':'middle',fill:'#7a9bbf','font-family':'DM Mono, monospace','font-size':10,'letter-spacing':'0.04em'});
      t.textContent=lbl;
      axisSvg.appendChild(t);
    });
  });
}

/* ══════════════════════════════════════════════
   PAN / POINTER SYSTEM
══════════════════════════════════════════════ */
function getVisibleW() {
  const scroll=$('chartScroll');
  if(!scroll)return DAY_W;
  return (scroll.offsetWidth/_totalW)*_totalW || DAY_W;
}

// Apply current pan offset — moves all SVGs together
let _lastChipKey = null;
let _isKeyAnimating = false;
function applyPan() {
  const svgs=['moonTrack','sunTrack','tideSvg','timeAxis'];
  const clampedOffset=Math.max(0,Math.min(_totalW-_visibleW,_panOffset));
  svgs.forEach(id=>{
    const el=$(id);
    if(el)el.style.transform=`translateX(${-clampedOffset}px)`;
  });
  if(!_isKeyAnimating)updatePointerInfo();
  updateDateChip();
  // Scroll date strip to keep selected chip visible — only when day changes
  const {key}=svgXToDateTime(pointerSvgX());
  if(key&&key!==_lastChipKey){
    _lastChipKey=key;
    updateStripScroll(key,true);
  }
}

// Get the absolute SVG X at the pointer (center of visible area)
function pointerSvgX() {
  return _panOffset+_visibleW/2;
}

// Convert absolute SVG X to day index + minutes
function svgXToDateTime(svgX) {
  const dayIndex=Math.floor(svgX/DAY_W);
  const safeDay=Math.max(0,Math.min(_days.length-1,dayIndex));
  const fracInDay=(svgX-safeDay*DAY_W)/DAY_W;
  const mins=Math.max(0,Math.min(1439,fracInDay*1440));
  return{dayIndex:safeDay,mins,key:_days[safeDay]};
}

// Interpolate tide height for a given day key + minutes
function interpHeightForDay(key, mins) {
  const cache=_dayCache[key];
  if(!cache||!cache.hourly||!cache.hourly.length)return 0;
  const hourly=cache.hourly;
  for(let i=0;i<hourly.length-1;i++){
    const t0=new Date(hourly[i].t.replace(' ','T'));
    const t1=new Date(hourly[i+1].t.replace(' ','T'));
    const m0=t0.getHours()*60+t0.getMinutes();
    const m1=t1.getHours()*60+t1.getMinutes();
    if(mins>=m0&&mins<=m1){
      const frac=(mins-m0)/(m1-m0);
      return parseFloat(hourly[i].v)+frac*(parseFloat(hourly[i+1].v)-parseFloat(hourly[i].v));
    }
  }
  return parseFloat(hourly[hourly.length-1].v);
}

// Determine if tide is rising or falling at given point
function risingOrFalling(key, mins) {
  const h1=interpHeightForDay(key,mins);
  const h2=interpHeightForDay(key,Math.min(1439,mins+10));
  return h2>h1?'↑':'↓';
}

function isAboveHorizon(mins,rise,set){
  if(rise===null||set===null)return false;
  return rise<set?mins>=rise&&mins<=set:mins>=rise||mins<=set;
}

// Update the info bar with current pointer position data
function updatePointerInfo() {
  const {key,mins}=svgXToDateTime(pointerSvgX());
  const cache=_dayCache[key];
  if(!cache)return;

  const h=interpHeightForDay(key,mins);
  const arrow=risingOrFalling(key,mins);
  const rising=arrow==='↑';
  const d=cache.date;
  const dayStr=DAYS[d.getDay()];
  const monStr=MONTHS[d.getMonth()];
  const dayName=dayStr[0]+dayStr.slice(1).toLowerCase();
  const monName=monStr[0]+monStr.slice(1).toLowerCase();

  $('infoDatetime').textContent=`${dayName}, ${monName} ${d.getDate()} ${fmt12fromMins(mins)}`;
  const tideEl=$('infoTideNum');
  if(tideEl){
    tideEl.innerHTML=`<span style="font-size:0.75em;line-height:1;vertical-align:middle">${rising?'▲':'▼'}</span> ${h.toFixed(2)} ft`;
  }
}

// Update date chip selection
function updateDateChip() {
  const {key}=svgXToDateTime(pointerSvgX());
  document.querySelectorAll('.day-chip').forEach(c=>{
    c.classList.toggle('day-chip--selected',c.dataset.key===key);
  });
}

/* ══════════════════════════════════════════════
   POINTER LINE (fixed center vertical line)
══════════════════════════════════════════════ */
function renderPointerLine() {
  // The pointer is a fixed CSS element centered over the chart scroll area
  // It doesn't move — the chart moves under it
  const ptr=$('pointerLine');
  if(!ptr)return;
  // Position it at center of chart scroll area
  const scroll=$('chartScroll');
  if(!scroll)return;
  const centerX=scroll.offsetWidth/2;
  ptr.style.left=centerX+'px';
}

/* ══════════════════════════════════════════════
   DRAG / TOUCH PAN
══════════════════════════════════════════════ */
function initPan() {
  const scrollWrap=document.querySelector('.chart-scroll-wrap');
  const scroll=$('chartScroll');
  if(!scrollWrap||!scroll)return;

  _visibleW=scrollWrap.offsetWidth;

  let dragging=false,startX=0,startPan=0;

  function onStart(clientX){
    dragging=true;
    startX=clientX;
    startPan=_panOffset;
    scrollWrap.style.cursor='grabbing';
  }

  function onMove(clientX){
    if(!dragging)return;
    // Moving finger RIGHT means going back in time (pan left = decrease offset)
    const dx=clientX-startX;
    // SVG units per pixel
    const svgPerPx=_totalW/scroll.offsetWidth;
    _panOffset=Math.max(0,Math.min(_totalW-_visibleW,startPan-dx*svgPerPx));
    applyPan();
  }

  function onEnd(){
    dragging=false;
    scrollWrap.style.cursor='';
  }

  scrollWrap.addEventListener('mousedown',e=>{e.preventDefault();onStart(e.clientX);});
  window.addEventListener('mousemove',e=>{if(dragging)onMove(e.clientX);});
  window.addEventListener('mouseup',onEnd);

  scrollWrap.addEventListener('touchstart',e=>{e.preventDefault();onStart(e.touches[0].clientX);},{passive:false});
  scrollWrap.addEventListener('touchmove',e=>{e.preventDefault();onMove(e.touches[0].clientX);},{passive:false});
  scrollWrap.addEventListener('touchend',onEnd);

  // Resize handler
  window.addEventListener('resize',()=>{
    _visibleW=scrollWrap.offsetWidth;
    renderPointerLine();
    applyPan();
  });

  // ── Keyboard pan ──
  // Arrow keys: 1 hour · Shift+Arrow: 6 hours · T: jump to now
  let _keyTarget = null;   // destination pan offset for smooth animation
  let _keyRafId  = null;   // rAF handle

  function smoothPanTo(target) {
    _panOffset = Math.max(0, Math.min(_totalW - _visibleW, target));
    _keyTarget = _panOffset;
    applyPan();
  }

  window.addEventListener('keydown', e => {
    // Ignore if focus is inside an input/textarea
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const hrInSvg  = DAY_W / 24;          // SVG units per hour
    const step6    = hrInSvg;             // Shift+arrow = 1 hour
    const step1    = DAY_W / (24 * 60);  // Arrow = 1 minute

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      smoothPanTo((_keyTarget ?? _panOffset) + (e.shiftKey ? step6 : step1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      smoothPanTo((_keyTarget ?? _panOffset) - (e.shiftKey ? step6 : step1));
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      const today  = new Date();
      const nowMins = today.getHours() * 60 + today.getMinutes();
      const todayIdx = _days.indexOf(dateKey(today));
      if (todayIdx >= 0) {
        const nowSvgX = todayIdx * DAY_W + (nowMins / 1440) * DAY_W;
        smoothPanTo(nowSvgX - _visibleW / 2);
      }
    }
  });
}

/* ══════════════════════════════════════════════
   DATE STRIP (chips)
══════════════════════════════════════════════ */
function buildDateStrip() {
  const strip=$('dateStrip');
  strip.innerHTML='';
  const today=new Date();
  const todayKey=dateKey(today);

  _days.forEach(key=>{
    const cache=_dayCache[key];
    if(!cache)return;
    const d=cache.date;
    const isToday=key===todayKey;

    const chip=document.createElement('div');
    chip.className='day-chip'+(isToday?' day-chip--today':'');
    chip.dataset.key=key;

    const topRow=document.createElement('div');
    topRow.className='chip-top-row';
    const leftCol=document.createElement('div');
    leftCol.className='chip-left';
    const dayName=document.createElement('div');
    dayName.className='chip-day';
    const dayStr=DAYS[d.getDay()];
    dayName.textContent=isToday?'Today':dayStr[0]+dayStr.slice(1).toLowerCase();
    const dateNum=document.createElement('div');
    dateNum.className='chip-date';
    const monStr=MONTHS[d.getMonth()];
    dateNum.textContent=`${d.getDate()} ${monStr[0]+monStr.slice(1).toLowerCase()}`;
    leftCol.appendChild(dayName);
    leftCol.appendChild(dateNum);
    const moonEl=document.createElement('div');
    moonEl.className='chip-moon';
    moonEl.id='cm-'+key;
    topRow.appendChild(leftCol);
    topRow.appendChild(moonEl);

    const spark=document.createElement('canvas');
    spark.className='chip-spark';
    spark.width=80;spark.height=28;

    const hiloWrap=document.createElement('div');
    hiloWrap.className='chip-hilo';
    hiloWrap.id='hilo-'+key;

    const tidalWrap=document.createElement('div');
    tidalWrap.className='chip-tidal';
    tidalWrap.id='ct-'+key;

    chip.appendChild(topRow);
    chip.appendChild(spark);
    chip.appendChild(hiloWrap);
    chip.appendChild(tidalWrap);
    strip.appendChild(chip);

    // Click chip → pan to that day at noon
    chip.addEventListener('click',()=>{
      const di=_days.indexOf(key);
      if(di<0)return;
      _panOffset=Math.max(0,Math.min(_totalW-_visibleW,di*DAY_W+DAY_W*0.5-_visibleW/2));
      applyPan();
      updateStripScroll(key);
    });
  });

  fillChipData();
}

function fillChipData() {
  _days.forEach(key=>{
    const cache=_dayCache[key];
    if(!cache)return;

    // Sparkline
    const chip=document.querySelector(`.day-chip[data-key="${key}"]`);
    if(!chip)return;
    const canvas=chip.querySelector('.chip-spark');
    if(canvas&&cache.hourly){
      const ctx=canvas.getContext('2d');
      const w=canvas.width,h=canvas.height;
      ctx.clearRect(0,0,w,h);
      const vals=cache.hourly.map(p=>parseFloat(p.v));
      const lo=_globalLo,hi=_globalHi,range=hi-lo||1;
      const px=i=>(i/(vals.length-1))*w;
      const py=v=>h-((v-lo)/range)*(h-4)-2;
      ctx.beginPath();
      ctx.moveTo(px(0),py(vals[0]));
      for(let i=1;i<vals.length;i++)ctx.lineTo(px(i),py(vals[i]));
      ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
      ctx.fillStyle='rgba(59,130,246,0.18)';ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px(0),py(vals[0]));
      for(let i=1;i<vals.length;i++)ctx.lineTo(px(i),py(vals[i]));
      ctx.strokeStyle='#3b82f6';ctx.lineWidth=1.5;ctx.stroke();
    }

    // Hi/lo
    const hiloEl=$('hilo-'+key);
    if(hiloEl&&cache.hilo){
      const highs=cache.hilo.filter(p=>p.type==='H').map(p=>parseFloat(p.v));
      const lows=cache.hilo.filter(p=>p.type==='L').map(p=>parseFloat(p.v));
      if(highs.length){
        const hi=Math.max(...highs),lo=Math.min(...lows);
        hiloEl.innerHTML=`<span class="chip-hi">▲ ${hi.toFixed(1)}</span><span class="chip-lo">▼ ${lo.toFixed(1)}</span>`;
      }
    }

    // Moon emoji SVG
    const moonEl=$('cm-'+key);
    if(moonEl&&cache.moon){
      moonEl.innerHTML=moonSVG(cache.moon.fraction);
    }

    // Tidal index — label not displayed (math kept for future use)
  });
}

function updateStripScroll(key, instant=false) {
  const strip=$('dateStrip');
  const el=document.querySelector(`.day-chip[data-key="${key}"]`);
  if(!strip||!el)return;
  // Scroll the strip container so the chip is centered — never touches page scroll
  const chipCenter=el.offsetLeft+el.offsetWidth/2;
  const target=chipCenter-strip.offsetWidth/2;
  if(instant){
    strip.scrollLeft=target;
  } else {
    strip.scrollTo({left:target,behavior:'smooth'});
  }
}

/* ══════════════════════════════════════════════
   STATS PANEL
══════════════════════════════════════════════ */
function renderStats(key) {
  const cache=_dayCache[key];
  if(!cache)return;
  const today=new Date();
  const isToday=key===dateKey(today);
  const nowMins=isToday?(today.getHours()*60+today.getMinutes()):0;

  if(isToday){
    $('sCurrent').textContent=interpHeightForDay(key,nowMins).toFixed(2);
    $('currentCard').style.display='';
  } else {
    $('currentCard').style.display='none';
  }

  const now=new Date();
  const future=isToday?
    (cache.hilo||[]).filter(p=>new Date(p.t.replace(' ','T'))>now):
    (cache.hilo||[]);

  if(future.length>=1){
    const n=future[0];
    $('sNextLbl').textContent=n.type==='H'?(isToday?'NEXT HIGH':'FIRST HIGH'):(isToday?'NEXT LOW':'FIRST LOW');
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

  const hs=(cache.hilo||[]).map(p=>parseFloat(p.v));
  if(hs.length)$('sRange').textContent=(Math.max(...hs)-Math.min(...hs)).toFixed(2);

  if(cache.moon){
    const bsvg=$('moonBigSvg');
    if(bsvg)bsvg.innerHTML=moonSVGLarge(cache.moon.fraction);
    $('sMoonName').textContent=cache.moon.name.toUpperCase();
    $('sMoonIllum').textContent=`${Math.round(cache.moon.illumination)}% illuminated`;
  }

  const tidal=calcTidalIndex(cache.date);
  $('sTidalIndex').textContent=tidal.index;
  $('sTidalLabel').textContent=tidal.label;
  $('sTidalLabel').className='sc-unit tidal-label '+tidal.cls;
  $('sTidalAlign').textContent=tidal.alignPct+'%';
  $('sTidalDist').textContent=Math.round(tidal.distKm/1000)+'k km';
  const bar=$('tidalIndexBar');
  if(bar)bar.style.width=tidal.index+'%';

  $('statsRow').style.display='grid';
}

/* ══════════════════════════════════════════════
   NOW TICKER
══════════════════════════════════════════════ */
function startNowTicker() {
  function tick() {
    const todayKey=dateKey(new Date());
    const {key}=svgXToDateTime(pointerSvgX());
    if(key===todayKey){
      const now=new Date();
      const nowMins=now.getHours()*60+now.getMinutes();
      const h=interpHeightForDay(todayKey,nowMins);
      $('sCurrent').textContent=h.toFixed(2);
    }
    updatePointerInfo();
  }
  tick();
  setInterval(tick,60000);
}

/* ══════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════ */
async function init() {
  startClock();

  if(!navigator.geolocation){
    setMsg('GEOLOCATION NOT SUPPORTED');return;
  }

  let lat,lon;
  try{
    const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:14000}));
    lat=pos.coords.latitude;lon=pos.coords.longitude;
  }catch{
    setMsg('LOCATION ACCESS DENIED — PLEASE ENABLE AND RELOAD');
    $('pulseDot').classList.add('dim');return;
  }
  _lat=lat;_lon=lon;

  // Station
  setMsg('LOCATING NEAREST TIDE STATION');
  let station;
  try{station=await findStation(lat,lon);}
  catch(e){setMsg(e.message.toUpperCase());return;}

  $('stationName').textContent=station.name;
  $('stationId').textContent=`${station.id} · ${station.state||''}`;
  $('footerStn').textContent=`STATION ${station.id} — ${station.name}`;

  // Fetch 60 days
  const today=new Date();
  const START_OFFSET=-2,NUM_DAYS=60;
  const startDate=offsetDate(today,START_OFFSET);

  setMsg('LOADING 60-DAY TIDE DATA…');
  let hiloByDay,hourlyByDay;
  try{
    const r=await fetchRange(station.id,startDate,NUM_DAYS);
    hiloByDay=r.hiloByDay;hourlyByDay=r.hourlyByDay;
  }catch(e){setMsg(e.message.toUpperCase());return;}

  // Build cache with astronomy per day
  let glo=Infinity,ghi=-Infinity;
  for(let i=0;i<NUM_DAYS;i++){
    const d=offsetDate(startDate,i);
    const key=dateKey(d);
    const hilo=hiloByDay[key]||[];
    const hourly=hourlyByDay[key]||[];
    if(hourly.length){
      const vals=hourly.map(p=>parseFloat(p.v));
      glo=Math.min(glo,...vals);ghi=Math.max(ghi,...vals);
    }
    let sun,moonRS,moon;
    try{sun=calcSun(lat,lon,d);}catch{sun={riseMins:null,setMins:null};}
    try{moonRS=calcMoonRiseSet(lat,lon,d);}catch{moonRS={riseMins:null,setMins:null};}
    try{moon=calcMoonPhase(d);}catch{moon=null;}
    _dayCache[key]={hilo,hourly,date:d,sun,moonRS,moon};
    _days.push(key);
  }
  _globalLo=glo;_globalHi=ghi;
  _totalW=NUM_DAYS*DAY_W;

  // Meta strip
  const latDir=lat>=0?'N':'S',lonDir=lon>=0?'E':'W';
  const coordsEl=$('metaCoords');
  if(coordsEl)coordsEl.textContent=`${Math.abs(lat).toFixed(3)}° ${latDir}  ${Math.abs(lon).toFixed(3)}° ${lonDir}`;
  $('metaStrip').style.opacity='1';
  $('pulseDot').classList.remove('dim');

  // Show UI
  $('loadingWrap').style.display='none';
  $('chartPanel').style.display='flex';
  $('chartPanel').style.flexDirection='column';
  $('dateStripWrap').style.display='block';

  // Build continuous charts
  buildContinuousCharts();

  // Initial pan — center on NOW
  const nowMins=today.getHours()*60+today.getMinutes();
  const todayIndex=_days.indexOf(dateKey(today));
  if(todayIndex>=0){
    const scrollWrapEl=document.querySelector('.chart-scroll-wrap');
    _visibleW=scrollWrapEl?scrollWrapEl.offsetWidth:DAY_W;
    const svgPerPx=_totalW/(_visibleW||1);
    const nowSvgX=todayIndex*DAY_W+(nowMins/1440)*DAY_W;
    _panOffset=Math.max(0,Math.min(_totalW-_visibleW,nowSvgX-_visibleW/2));
  }

  // Init pan interaction
  initPan();
  renderPointerLine();
  applyPan();

  // Date strip
  buildDateStrip();
  updateDateChip();

  // Stats for today
  renderStats(dateKey(today));

  // Now ticker
  startNowTicker();
}

init();
