/* ═══════════════════════════════════════════════════════════════
   Mochi Money – Weather Visual Effects Engine
   Dynamic particles: rain, wind-blown leaves, falling petals,
   drifting clouds, lightning, snow, fog.
   Auto-adapts to the Open-Meteo weather_code from fetchWeatherFor.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── tunables ──────────────────────────────────────────────── */
  const CFG = {
    rain:    { max: 160, speed: [9, 18], len: [14, 30], wind: 3 },
    drizzle: { max: 50,  speed: [4, 8],  len: [6, 14],  wind: 1 },
    snow:    { max: 70,  speed: [1, 3],  size: [2, 5],  wind: 0.8 },
    leaf:    { max: 14,  speed: [1.2, 3], size: [10, 18], wind: 2 },
    petal:   { max: 20,  speed: [0.8, 2.2], size: [5, 11], wind: 1.3 },
    cloud:   { max: 5,   speed: [0.25, 0.7] },
    fog:     { layers: 3, opacity: 0.16 },
    thunder: { minMs: 3500, maxMs: 11000 },
  };

  /* ── runtime state ─────────────────────────────────────────── */
  let cvs, cx, raf;
  let pts = [], clds = [];
  let fx  = new Set();
  let wnd = 0, dayF = true;
  let thTimer = null, flash = 0;
  let lastCode = null;

  const R  = (a, b) => a + Math.random() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const PK = a => a[RI(0, a.length - 1)];

  /* ── canvas ────────────────────────────────────────────────── */
  function boot() {
    const pg = document.getElementById('page-weather');
    if (!pg) return false;
    if (cvs && cvs.parentElement === pg) return true;
    cvs = document.createElement('canvas');
    cvs.id = 'weatherFxCanvas';
    cvs.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:2;border-radius:inherit;';
    pg.style.position = 'relative';
    pg.insertBefore(cvs, pg.firstChild);
    cx = cvs.getContext('2d');
    fit();
    return true;
  }
  function fit() {
    if (!cvs) return;
    const pg = document.getElementById('page-weather');
    if (!pg) return;
    const w = pg.clientWidth, h = pg.scrollHeight;
    cvs.width  = w * devicePixelRatio;
    cvs.height = h * devicePixelRatio;
    cvs.style.height = h + 'px';
    cx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  /* ── weather-code → effects ────────────────────────────────── */
  function decode(code, day) {
    dayF = day !== 0;
    const s = new Set(), c = Number(code);
    if      (c <= 1)              { s.add('petal'); if (dayF) s.add('cloudL'); }
    else if (c <= 3)              { s.add('cloud'); s.add('leaf'); }
    else if (c >= 45 && c <= 48)  { s.add('fog');   s.add('cloud'); }
    else if (c >= 51 && c <= 57)  { s.add('drizzle'); s.add('cloud'); s.add('leaf'); }
    else if (c >= 61 && c <= 67)  { s.add('rain'); s.add('cloud'); s.add('leaf'); s.add('petal'); }
    else if (c >= 71 && c <= 77)  { s.add('snow'); s.add('cloud'); }
    else if (c >= 80 && c <= 82)  { s.add('rain'); s.add('cloud'); s.add('leaf'); s.add('petal'); }
    else if (c >= 85 && c <= 86)  { s.add('snow'); s.add('cloud'); }
    else if (c >= 95)             { s.add('rain'); s.add('cloud'); s.add('thunder'); s.add('leaf'); s.add('petal'); }
    return s;
  }

  /* ── factories ─────────────────────────────────────────────── */
  function mRain(w, h, c) {
    return { t: 'r', x: R(-20, w+20), y: R(-h*.3, -10),
      sp: R(c.speed[0],c.speed[1]), ln: R(c.len[0],c.len[1]),
      wi: c.wind + wnd*.3, a: R(.25,.6), th: R(1,2.2) };
  }
  function mSnow(w, h) {
    return { t: 's', x: R(-10,w+10), y: R(-h*.2,-5),
      sp: R(CFG.snow.speed[0],CFG.snow.speed[1]),
      sz: R(CFG.snow.size[0],CFG.snow.size[1]),
      wi: R(-CFG.snow.wind,CFG.snow.wind),
      a: R(.4,.9), wb: R(0,6.28), ws: R(.01,.04) };
  }
  const LC = ['#5a8f3c','#7cba45','#d4a843','#c47530','#8b5e3c','#b8860b'];
  function mLeaf(w, h) {
    return { t: 'l', x: R(-20,w+40), y: R(-h*.15,-10),
      sp: R(CFG.leaf.speed[0],CFG.leaf.speed[1]),
      sz: R(CFG.leaf.size[0],CFG.leaf.size[1]),
      wi: R(CFG.leaf.wind, CFG.leaf.wind+wnd*.5),
      ro: R(0,6.28), rs: R(-.06,.06),
      wb: R(0,6.28), wa: R(.5,2), wf: R(.02,.05),
      cl: PK(LC), a: R(.6,.95) };
  }
  const PC = ['#f9b4c2','#f7a0b5','#fcc5d3','#f8d1dc','#e8a0b0','#f5c6d0','#fbb1c1'];
  function mPetal(w, h) {
    return { t: 'p', x: R(-20,w+40), y: R(-h*.15,-10),
      sp: R(CFG.petal.speed[0],CFG.petal.speed[1]),
      sz: R(CFG.petal.size[0],CFG.petal.size[1]),
      wi: R(CFG.petal.wind*.5, CFG.petal.wind+wnd*.4),
      ro: R(0,6.28), rs: R(-.04,.04),
      wb: R(0,6.28), wa: R(1,3), wf: R(.015,.04),
      cl: PK(PC), a: R(.5,.85), sy: R(.4,1) };
  }
  function mCloud(w) {
    return { x: R(-260,-80), y: R(8,110),
      sp: R(CFG.cloud.speed[0],CFG.cloud.speed[1])+wnd*.05,
      cw: R(100,220), ch: R(28,56), a: R(.12,.32) };
  }

  /* ── draw primitives ───────────────────────────────────────── */
  function dR(p) {
    cx.save(); cx.globalAlpha = p.a;
    cx.strokeStyle = `rgba(140,180,220,${p.a})`;
    cx.lineWidth = p.th; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(p.x, p.y);
    cx.lineTo(p.x + p.wi*.6, p.y + p.ln);
    cx.stroke(); cx.restore();
  }
  function dS(p) {
    cx.save(); cx.globalAlpha = p.a; cx.fillStyle = '#fff';
    cx.shadowColor = '#fff'; cx.shadowBlur = 3;
    cx.beginPath(); cx.arc(p.x, p.y, p.sz, 0, 6.28); cx.fill();
    cx.restore();
  }
  function dL(p) {
    cx.save(); cx.globalAlpha = p.a;
    cx.translate(p.x, p.y); cx.rotate(p.ro);
    cx.fillStyle = p.cl;
    cx.beginPath();
    cx.moveTo(0, -p.sz*.5);
    cx.bezierCurveTo(p.sz*.6,-p.sz*.3, p.sz*.5,p.sz*.3, 0,p.sz*.5);
    cx.bezierCurveTo(-p.sz*.5,p.sz*.3, -p.sz*.6,-p.sz*.3, 0,-p.sz*.5);
    cx.fill();
    // vein
    cx.strokeStyle = 'rgba(0,0,0,.12)'; cx.lineWidth = .5;
    cx.beginPath(); cx.moveTo(0,-p.sz*.4); cx.lineTo(0,p.sz*.4); cx.stroke();
    cx.restore();
  }
  function dP(p) {
    cx.save(); cx.globalAlpha = p.a;
    cx.translate(p.x, p.y); cx.rotate(p.ro); cx.scale(1, p.sy);
    cx.fillStyle = p.cl; const s = p.sz;
    cx.beginPath(); cx.moveTo(0,-s*.3);
    cx.bezierCurveTo(s*.5,-s*.6, s*.7,0, 0,s*.5);
    cx.bezierCurveTo(-s*.7,0, -s*.5,-s*.6, 0,-s*.3);
    cx.fill(); cx.restore();
  }
  function dC(c) {
    cx.save(); cx.globalAlpha = c.a;
    cx.fillStyle = dayF ? '#cdd6e4' : '#7a8a9f';
    const mx = c.x+c.cw*.5, my = c.y+c.ch*.5, r = c.ch*.5;
    [[-.2,.2,.9],[0,-.1,1.15],[.2,.15,.85],[-.08,.35,.7]].forEach(([dx,dy,sc]) => {
      cx.beginPath(); cx.arc(mx+c.cw*dx, my+r*dy, r*sc, 0, 6.28); cx.fill();
    });
    cx.restore();
  }
  function dFog(w, h) {
    if (!fx.has('fog')) return;
    cx.save();
    for (let i = 0; i < CFG.fog.layers; i++) {
      const y = h*(.2+i*.25);
      const g = cx.createLinearGradient(0,y-40,0,y+40);
      g.addColorStop(0,'rgba(220,220,230,0)');
      g.addColorStop(.5,`rgba(220,220,230,${CFG.fog.opacity})`);
      g.addColorStop(1,'rgba(220,220,230,0)');
      cx.fillStyle = g; cx.fillRect(0,y-40,w,80);
    }
    cx.restore();
  }
  function dFlash(w, h) {
    if (flash <= 0) return;
    cx.save(); cx.globalAlpha = flash; cx.fillStyle = '#f0f0ff';
    cx.fillRect(0,0,w,h); cx.restore();
    flash *= .85; if (flash < .01) flash = 0;
  }

  /* ── spawn & physics ───────────────────────────────────────── */
  function spawn(w, h) {
    const rt = fx.has('rain') ? 'rain' : fx.has('drizzle') ? 'drizzle' : null;
    if (rt) {
      const cfg = rt === 'rain' ? CFG.rain : CFG.drizzle;
      const cur = pts.filter(p => p.t === 'r').length;
      for (let i = 0, n = Math.min(8, cfg.max-cur); i < n; i++)
        pts.push(mRain(w, h, cfg));
    }
    if (fx.has('snow')) {
      const c = pts.filter(p => p.t === 's').length;
      for (let i = 0, n = Math.min(3, CFG.snow.max-c); i < n; i++) pts.push(mSnow(w,h));
    }
    if (fx.has('leaf') && pts.filter(p=>p.t==='l').length < CFG.leaf.max && Math.random()<.08)
      pts.push(mLeaf(w,h));
    if (fx.has('petal') && pts.filter(p=>p.t==='p').length < CFG.petal.max && Math.random()<.06)
      pts.push(mPetal(w,h));
    const cMax = fx.has('cloudL') ? 3 : fx.has('cloud') ? CFG.cloud.max : 0;
    while (clds.length < cMax) clds.push(mCloud(w));
  }

  function tick(w, h) {
    for (let i = pts.length-1; i >= 0; i--) {
      const p = pts[i];
      if (p.t === 'r') {
        p.x += p.wi; p.y += p.sp;
        if (p.y > h+10 || p.x > w+40) { pts.splice(i,1); continue; }
      } else if (p.t === 's') {
        p.wb += p.ws; p.x += p.wi + Math.sin(p.wb)*.5; p.y += p.sp;
        if (p.y > h+10) { pts.splice(i,1); continue; }
      } else if (p.t === 'l') {
        p.wb += p.wf; p.x += p.wi + Math.sin(p.wb)*p.wa;
        p.y += p.sp + Math.cos(p.wb*.7)*.3; p.ro += p.rs;
        if (p.y>h+20||p.x>w+40||p.x<-40) { pts.splice(i,1); continue; }
      } else if (p.t === 'p') {
        p.wb += p.wf; p.x += p.wi + Math.sin(p.wb)*p.wa;
        p.y += p.sp + Math.sin(p.wb*1.3)*.2; p.ro += p.rs;
        if (p.y>h+20||p.x>w+40||p.x<-40) { pts.splice(i,1); continue; }
      }
    }
    for (let i = clds.length-1; i >= 0; i--) {
      clds[i].x += clds[i].sp;
      if (clds[i].x > w+50) clds.splice(i,1);
    }
  }

  /* ── render loop ───────────────────────────────────────────── */
  function loop() {
    if (!cvs || !cx) return;
    const pg = document.getElementById('page-weather');
    if (!pg) { raf = requestAnimationFrame(loop); return; }
    const w = pg.clientWidth, h = pg.scrollHeight;
    if (cvs.width !== w*devicePixelRatio || cvs.height !== h*devicePixelRatio) {
      cvs.width = w*devicePixelRatio; cvs.height = h*devicePixelRatio;
      cvs.style.height = h+'px';
      cx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    }
    cx.clearRect(0,0,w,h);
    clds.forEach(c => dC(c));
    dFog(w,h);
    pts.forEach(p => { if(p.t==='r')dR(p); else if(p.t==='s')dS(p); else if(p.t==='l')dL(p); else dP(p); });
    dFlash(w,h);
    spawn(w,h); tick(w,h);
    raf = requestAnimationFrame(loop);
  }

  /* ── thunder ───────────────────────────────────────────────── */
  function thSched() {
    if (thTimer) clearTimeout(thTimer);
    if (!fx.has('thunder')) return;
    thTimer = setTimeout(() => { flash = R(.5,.9); thSched(); },
      R(CFG.thunder.minMs, CFG.thunder.maxMs));
  }

  /* ── API ───────────────────────────────────────────────────── */
  function go(code, day, windKmh) {
    if (!boot()) return;
    const c = Number(code);
    if (c === lastCode) return;
    lastCode = c;
    wnd = Math.min((windKmh||0)/15, 5);
    fx = decode(c, day);
    pts = pts.slice(-20); clds = clds.slice(-2);
    if (fx.has('thunder')) thSched();
    else { if(thTimer)clearTimeout(thTimer); flash=0; }
    if (!raf) loop();
  }
  function halt() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (thTimer) { clearTimeout(thTimer); thTimer = null; }
    pts=[]; clds=[]; flash=0; fx.clear(); lastCode=null;
    if (cx && cvs) cx.clearRect(0,0,cvs.width,cvs.height);
  }
  function active() {
    const p = document.getElementById('page-weather');
    return p && p.classList.contains('active');
  }

  /* ── hooks ─────────────────────────────────────────────────── */
  // 1) showPage: start/stop when navigating
  const _sp = window.showPage;
  window.showPage = function(page) {
    _sp(page);
    if (page === 'weather') {
      if (lastCode !== null) { const sv=lastCode; lastCode=null; go(sv,dayF?1:0,wnd*15); }
    } else halt();
  };

  // 2) fetchWeatherFor: intercept to capture weather_code
  const _fw = window.fetchWeatherFor;
  window.fetchWeatherFor = async function(place) {
    await _fw(place);
    // After original renders the DOM, read weather data
    // Re-fetch only current codes (tiny payload, same cache)
    try {
      const q = new URLSearchParams({
        latitude: place.latitude, longitude: place.longitude,
        current: 'weather_code,is_day,wind_speed_10m', timezone: 'auto'
      });
      const d = await fetch('https://api.open-meteo.com/v1/forecast?' + q).then(r => r.json());
      if (d.current && active())
        go(d.current.weather_code, d.current.is_day, d.current.wind_speed_10m);
    } catch (e) { /* silent */ }
  };

  /* ── events ────────────────────────────────────────────────── */
  window.addEventListener('resize', () => { if (active()) fit(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if(raf){cancelAnimationFrame(raf);raf=null;} }
    else if (active() && fx.size > 0 && !raf) loop();
  });

  window.weatherFx = { start: go, stop: halt };
})();
