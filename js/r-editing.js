/* r-editing.js — 편집(editing) 용어 '결과' 렌더러 (classic script, ES2020)
 * 원본: 12초 카페 쇼츠 가편집. coffee.mp4(A롤) + 스틸(B롤)을 하드 컷으로만 이어 붙인 타임라인.
 * 타일 1개 = 숨은 <video> 1개
 *   → 프로그램 캔버스 P(≤640px, 타임라인·전환·효과)
 *   → 베이스 캔버스(그레이딩·프레이밍)
 *   → 오버레이 캔버스(자막·모션그래픽·오디오 패널, DPR 해상도라 글자가 선명).
 * 용어 → 레시피 표(RX). 런타임 추측 없음. 조합은 레시피를 합쳐요(프레이밍 1개, 자막 스타일 1개 = 마지막 것).
 */
(function () {
  'use strict';
  var PD = window.PD = window.PD || {};

  var LW = 640, LH = 360, DUR = 12, TAU = Math.PI * 2;
  var VSRC = 'assets/primary/coffee.mp4', VOICE_SRC = 'assets/primary/voice.mp3';
  var STILL_SRC = {
    product: 'assets/primary/product.jpg', street: 'assets/primary/street.jpg',
    portrait: 'assets/primary/portrait.jpg', painting: 'assets/primary/painting.jpg'
  };
  // 피사체 중심(16:9 커버 좌표, 0~1)
  var ANCH = { coffee: [0.46, 0.58], product: [0.30, 0.72], street: [0.53, 0.64], portrait: [0.51, 0.40], painting: [0.5, 0.55] };
  var SRC_COL = { coffee: '#2e8a74', product: '#8b919b', street: '#7a6450', portrait: '#b8704e', painting: '#6f5a9c', card: '#b08a4a', black: '#2a2a2e' };
  var SRC_KO = { coffee: '커피', product: '머그', street: '거리', portrait: '인물', painting: '그림', card: '타이틀', black: '블랙' };
  var NOCAM = { s: 1, x: 0, y: 0, r: 0 };

  /* ---------- utils ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function sm(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function seg(t, a, b) { return sm((t - a) / (b - a)); }
  function lin(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function eio(u) { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eout(u) { u = clamp(u, 0, 1); return 1 - Math.pow(1 - u, 3); }
  function ein(u) { u = clamp(u, 0, 1); return u * u * u; }
  function back(u) { u = clamp(u, 0, 1); var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function frac(x) { return x - Math.floor(x); }
  function nz(t, s) { s = s || 0; return Math.sin(t * 1.73 + s) * 0.5 + Math.sin(t * 2.97 + s * 2.1) * 0.3 + Math.sin(t * 5.31 + s * 3.7) * 0.2; }
  // a~b 구간에서 0→1→0 (페이드 f초)
  function win(t, a, b, f) { f = f || 0.15; if (t < a || t > b) return 0; return Math.min(1, (t - a) / f, (b - t) / f); }
  function kf(ks, t, ease) {
    ease = ease || sm;
    if (t <= ks[0][0]) return ks[0][1];
    for (var i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) { var a = ks[i - 1], b = ks[i]; return lerp(a[1], b[1], ease((t - a[0]) / (b[0] - a[0]))); }
    }
    return ks[ks.length - 1][1];
  }
  function mkC(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function css(e, s) { for (var k in s) e.style[k] = s[k]; return e; }
  function mk(tag, style, parent) { var e = document.createElement(tag); if (style) css(e, style); if (parent) parent.appendChild(e); return e; }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function noop() {}

  // ctx.filter 지원 여부(사파리 일부는 속성만 있고 동작 안 함 → 픽셀로 확인)
  var HASF = (function () {
    try {
      var c = mkC(8, 8), x = c.getContext('2d');
      if (!x || !('filter' in x)) return false;
      x.filter = 'blur(2px)'; x.fillStyle = '#000'; x.fillRect(3, 3, 2, 2); x.filter = 'none';
      return x.getImageData(0, 0, 1, 1).data[3] > 0;
    } catch (e) { return false; }
  })();

  /* ---------- 폰트 ---------- */
  var FF = {
    hz: "'Black Han Sans','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    jua: "'Jua','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    dh: "'Do Hyeon','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    nk: "'Noto Sans KR','IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    gd: "'Gowun Dodum','Noto Sans KR','Apple SD Gothic Neo',serif",
    vt: "'VT323',ui-monospace,Menlo,Consolas,monospace",
    ui: "'IBM Plex Sans KR','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif",
    mono: "'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace"
  };
  var FONT_URL = 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Noto+Sans+KR:wght@500;700;900&family=Gowun+Dodum&family=VT323&display=swap';
  var fontsReady = false, fontsStarted = false, LIVE = [];
  function poke() { for (var i = 0; i < LIVE.length; i++) LIVE[i].need = true; }
  function injectFonts() {
    if (fontsStarted) return; fontsStarted = true;
    try {
      if (!document.getElementById('pd-editing-fonts')) {
        var l = document.createElement('link');
        l.id = 'pd-editing-fonts'; l.rel = 'stylesheet'; l.href = FONT_URL;
        document.head.appendChild(l);
      }
    } catch (e) { /* ignore */ }
    var done = function () { fontsReady = true; poke(); };
    var to = setTimeout(done, 2600);
    try {
      if (document.fonts && document.fonts.load) {
        var sample = '아침을 깨우는 한 잔 직접 볶은 원두로 매일 7시 오픈 모닝빈에서 만나요 두둥 MORNING Bean 0123';
        var fams = ['Black Han Sans', 'Jua', 'Do Hyeon', 'Noto Sans KR', 'Gowun Dodum', 'VT323'];
        var ps = [];
        // 링크 CSS가 먼저 붙어야 load가 의미 있어요
        setTimeout(function () {
          for (var i = 0; i < fams.length; i++) {
            ps.push(document.fonts.load('700 32px "' + fams[i] + '"', sample).catch(noop));
            if (fams[i] === 'Noto Sans KR') { ps.push(document.fonts.load('900 32px "Noto Sans KR"', sample).catch(noop)); ps.push(document.fonts.load('500 32px "Noto Sans KR"', sample).catch(noop)); }
          }
          Promise.all(ps).then(function () { clearTimeout(to); done(); setTimeout(poke, 400); });
        }, 60);
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------- 스틸(모듈 캐시, 16:9 커버로 미리 잘라 둠) ---------- */
  var STILL = {}, STILLP = {}, BLURS = {}, PLATE = null;
  function loadStill(k) {
    if (!STILLP[k]) {
      var p = PD.loadImage ? PD.loadImage(STILL_SRC[k]) : new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = STILL_SRC[k]; });
      STILLP[k] = p.then(function (im) {
        var c = mkC(960, 540), x = c.getContext('2d'), iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
        var s = Math.max(960 / iw, 540 / ih), w = iw * s, h = ih * s;
        x.drawImage(im, (960 - w) / 2, (540 - h) / 2, w, h);
        STILL[k] = c; poke(); return c;
      }).catch(function () { return null; });
    }
    return STILLP[k];
  }
  function loadAllStills() { for (var k in STILL_SRC) loadStill(k); }
  // 저해상도 흐림 사본(배경 흐림용)
  function blurOf(k) {
    if (BLURS[k]) return BLURS[k];
    var s = STILL[k]; if (!s) return null;
    var a = mkC(160, 90), b = mkC(48, 27);
    a.getContext('2d').drawImage(s, 0, 0, 160, 90); b.getContext('2d').drawImage(a, 0, 0, 48, 27);
    BLURS[k] = b; return b;
  }
  // 머그를 지운 클린 플레이트(오른쪽 빈 벽·테이블을 옮겨 붙이고 가장자리를 부드럽게)
  function cleanPlate() {
    if (PLATE) return PLATE;
    var s = STILL.product; if (!s) return null;
    var c = mkC(960, 540), x = c.getContext('2d');
    x.drawImage(s, 0, 0);
    var t = mkC(960, 540), y = t.getContext('2d');
    var dx0 = 0.08 * 960, dw = 0.52 * 960, sx0 = 0.48 * 960, top = 0.42 * 540, h = 540 - top;
    y.drawImage(s, sx0, top, dw, h, dx0, top, dw, h);
    y.globalCompositeOperation = 'destination-in';
    var gx = y.createLinearGradient(dx0, 0, dx0 + dw, 0);
    gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.08, '#000'); gx.addColorStop(0.92, '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
    y.fillStyle = gx; y.fillRect(dx0, top, dw, h);
    y.globalCompositeOperation = 'destination-in';
    var gy = y.createLinearGradient(0, top, 0, top + 50);
    gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(1, '#000');
    y.fillStyle = gy; y.fillRect(0, top, 960, h);
    x.drawImage(t, 0, 0);
    PLATE = c; return c;
  }

  /* ---------- 그레인 ---------- */
  var GRAIN = null;
  function grain() {
    if (GRAIN) return GRAIN;
    GRAIN = [];
    for (var k = 0; k < 4; k++) {
      var c = mkC(128, 128), x = c.getContext('2d'), im = x.createImageData(128, 128), d = im.data;
      for (var i = 0; i < d.length; i += 4) { var v = (Math.random() * 255) | 0; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
      x.putImageData(im, 0, 0); GRAIN.push(c);
    }
    return GRAIN;
  }

  /* ---------- 대본·자막 ---------- */
  var CAPS = [
    { t0: 0.4, t1: 2.9, text: '아침을 깨우는 한 잔', key: '한 잔', en: 'A cup that wakes up your morning', emoji: '☕', chunks: ['아침을', '깨우는', '한 잔'] },
    { t0: 3.1, t1: 5.6, text: '직접 볶은 원두로', key: '원두로', en: 'Made with beans we roast ourselves', emoji: '🔥', chunks: ['직접 볶은', '원두로'] },
    { t0: 6.0, t1: 8.5, text: '매일 아침 7시 오픈', key: '7시 오픈', en: 'Open every day at 7 a.m.', emoji: '⏰', chunks: ['매일 아침', '7시 오픈'] },
    { t0: 8.9, t1: 11.6, text: '모닝빈에서 만나요', key: '모닝빈에서', en: 'See you at Morning Bean', emoji: '👋', chunks: ['모닝빈에서', '만나요'] }
  ];
  (function () {
    for (var i = 0; i < CAPS.length; i++) {
      var c = CAPS[i], ws = c.text.split(' '), n = 0, j;
      for (j = 0; j < ws.length; j++) n += ws[j].length + 0.6;
      var span = c.t1 - c.t0 - 0.35, acc = c.t0; c.words = [];
      for (j = 0; j < ws.length; j++) { var d = span * (ws[j].length + 0.6) / n; c.words.push({ w: ws[j], t0: acc, t1: acc + d }); acc += d; }
      var m = c.chunks.length, cs = (c.t1 - c.t0) / m; c.cks = [];
      for (j = 0; j < m; j++) c.cks.push({ w: c.chunks[j], t0: c.t0 + j * cs, t1: c.t0 + (j + 1) * cs, key: c.chunks[j] === c.key });
    }
  })();
  function capAt(t) { for (var i = 0; i < CAPS.length; i++) if (t >= CAPS[i].t0 && t < CAPS[i].t1) return CAPS[i]; return null; }
  function chunkAt(t) {
    for (var i = 0; i < CAPS.length; i++) {
      var c = CAPS[i]; if (t < c.t0 || t >= c.t1) continue;
      for (var j = 0; j < c.cks.length; j++) if (t >= c.cks[j].t0 && t < c.cks[j].t1) return { c: c, k: c.cks[j], i: j };
    }
    return null;
  }
  // 목소리 파일(voice.mp3)의 말소리 구간(ffmpeg silencedetect -30dB 기준)
  var VSEG = [[0.05, 4.65], [5.84, 9.21], [10.36, 11.03], [12.43, 14.69], [15.28, 16.01], [17.75, 20.12]];
  var BEAT = 0.6;

  /* ---------- 오디오(모듈 캐시) ---------- */
  var SR = 44100, AB = {}, ABP = {}, PK = {};
  function OAC() { return window.OfflineAudioContext || window.webkitOfflineAudioContext; }
  function render(sec, fn) {
    var C = OAC(); if (!C) return Promise.reject(new Error('no audio'));
    var o = new C(1, Math.ceil(sec * SR), SR);
    fn(o, o.destination);
    return new Promise(function (res, rej) {
      o.oncomplete = function (e) { res(e.renderedBuffer); };
      try { var p = o.startRendering(); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
    });
  }
  function normalize(buf, peak) {
    var d = buf.getChannelData(0), m = 0, i;
    for (i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > m) m = a; }
    if (m > 0) { var k = peak / m; for (i = 0; i < d.length; i++) d[i] *= k; }
    return buf;
  }
  function noiseBuf(o, sec, brown) {
    var b = o.createBuffer(1, Math.ceil(sec * o.sampleRate), o.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < d.length; i++) {
      var w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  function noiseSrc(o, buf, t, dur, loop) { var s = o.createBufferSource(); s.buffer = buf; s.loop = !!loop; s.start(t); if (dur) s.stop(t + dur); return s; }
  function NOTE(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var CHORDS = [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 58]];
  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function kick(o, out, t, v) {
    var s = o.createOscillator(), g = o.createGain();
    s.frequency.setValueAtTime(130, t); s.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    s.connect(g); g.connect(out); s.start(t); s.stop(t + 0.35);
  }
  function hat(o, out, nb, t, v) {
    var s = noiseSrc(o, nb, t, 0.07), f = o.createBiquadFilter(), g = o.createGain();
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    s.connect(f); f.connect(g); g.connect(out);
  }
  function tone(o, out, type, f, t, a, hold, rel, v, dest) {
    var s = o.createOscillator(), g = o.createGain(); s.type = type; s.frequency.value = f;
    env(g, t, a, v, hold, rel); s.connect(g); g.connect(dest || out); s.start(t); s.stop(t + a + hold + rel + 0.05);
    return s;
  }
  function synthMusic(o, out, mode) {
    var len = o.length / SR, bar = BEAT * 4, nb = noiseBuf(o, 1);
    var lp = o.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 0.4; lp.connect(out);
    var dropT = mode === 'drop' ? 4.8 : -1, endT = mode === 'end' ? 10.8 : 99;
    if (mode === 'drop') { lp.frequency.setValueAtTime(320, 0); lp.frequency.exponentialRampToValueAtTime(2400, 4.7); lp.frequency.setValueAtTime(2200, 4.8); }
    for (var b = 0; b * bar < Math.min(len, endT); b++) {
      var t0 = b * bar, ch = CHORDS[b % 4], dur = Math.min(bar, endT - t0);
      for (var i = 0; i < ch.length; i++) {
        tone(o, out, 'triangle', NOTE(ch[i]), t0, 0.25, Math.max(0.05, dur - 0.35), 0.5, 0.05, lp);
        tone(o, out, 'sine', NOTE(ch[i] + 12) * 1.003, t0, 0.3, Math.max(0.05, dur - 0.4), 0.5, 0.015, lp);
      }
    }
    if (mode === 'end') {
      var fc = [41, 53, 57, 60, 64, 69];
      for (var q = 0; q < fc.length; q++) tone(o, out, q ? 'triangle' : 'sine', NOTE(fc[q]), 10.8, 0.02, 0.3, 1.0, q ? 0.06 : 0.3, lp);
      kick(o, out, 10.8, 0.8);
    }
    for (var k = 0; k * BEAT < len; k++) {
      var t = k * BEAT; if (t >= endT - 0.01) break;
      if (dropT > 0 && t < dropT - 0.01) continue;
      kick(o, out, t, 0.55);
      hat(o, out, nb, t + BEAT / 2, 0.06);
      if (k % 2 === 1) hat(o, out, nb, t, 0.03);
      if (k % 2 === 0) tone(o, out, 'sine', NOTE(CHORDS[Math.floor(t / bar) % 4][0] - 12), t, 0.01, 0.15, 0.4, 0.28);
    }
    if (mode === 'drop') { riser(o, out, 2.4, 2.4, 0.25); impact(o, out, 4.8, 0.6); }
  }
  function whoosh(o, out, t, v) {
    var nb = noiseBuf(o, 1), s = noiseSrc(o, nb, t, 0.75), f = o.createBiquadFilter(), g = o.createGain();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2800, t + 0.28); f.frequency.exponentialRampToValueAtTime(380, t + 0.7);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.8, t + 0.26); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
    s.connect(f); f.connect(g); g.connect(out);
  }
  function riser(o, out, t, d, v) {
    var nb = noiseBuf(o, d + 0.1), s = noiseSrc(o, nb, t, d), f = o.createBiquadFilter(), g = o.createGain();
    f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(6000, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.5, t + d - 0.02); g.gain.linearRampToValueAtTime(0, t + d);
    s.connect(f); f.connect(g); g.connect(out);
    var w = o.createOscillator(), wf = o.createBiquadFilter(), wg = o.createGain();
    w.type = 'sawtooth'; w.frequency.setValueAtTime(110, t); w.frequency.exponentialRampToValueAtTime(880, t + d);
    wf.type = 'lowpass'; wf.frequency.value = 1800;
    wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime((v || 0.5) * 0.18, t + d - 0.02); wg.gain.linearRampToValueAtTime(0, t + d);
    w.connect(wf); wf.connect(wg); wg.connect(out); w.start(t); w.stop(t + d + 0.02);
  }
  function impact(o, out, t, v) {
    var s = o.createOscillator(), g = o.createGain();
    s.frequency.setValueAtTime(95, t); s.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    g.gain.setValueAtTime(v || 1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    s.connect(g); g.connect(out); s.start(t); s.stop(t + 1.15);
    var nb = noiseBuf(o, 0.4), n = noiseSrc(o, nb, t, 0.35), f = o.createBiquadFilter(), ng = o.createGain();
    f.type = 'lowpass'; f.frequency.value = 1400;
    ng.gain.setValueAtTime((v || 1) * 0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(f); f.connect(ng); ng.connect(out);
  }
  var AUD = {
    voice: function () {
      return fetch(VOICE_SRC).then(function (r) { if (!r.ok) throw new Error('voice'); return r.arrayBuffer(); }).then(function (ab) {
        var C = OAC(), o = new C(1, 1, SR);
        return new Promise(function (res, rej) { var p = o.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
      });
    },
    bed: function () { return render(13, function (o, out) { synthMusic(o, out, 'bed'); }); },
    drop: function () { return render(13.5, function (o, out) { synthMusic(o, out, 'drop'); }); },
    end: function () { return render(13, function (o, out) { synthMusic(o, out, 'end'); }); },
    whoosh: function () { return render(0.8, function (o, out) { whoosh(o, out, 0.01, 0.9); }); },
    riser: function () { return render(2.6, function (o, out) { riser(o, out, 0.01, 2.4, 0.7); }); },
    impact: function () { return render(1.3, function (o, out) { impact(o, out, 0.01, 1); }); },
    room: function () {
      return render(12.5, function (o, out) {
        var s = noiseSrc(o, noiseBuf(o, 12.5, true), 0), f = o.createBiquadFilter(), g = o.createGain();
        f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 1; s.connect(f); f.connect(g); g.connect(out);
        var h = noiseSrc(o, noiseBuf(o, 12.5), 0), hf = o.createBiquadFilter(), hg = o.createGain();
        hf.type = 'bandpass'; hf.frequency.value = 2500; hf.Q.value = 0.5; hg.gain.value = 0.08; h.connect(hf); hf.connect(hg); hg.connect(out);
      });
    },
    cafe: function () {
      return render(12.5, function (o, out) {
        var s = noiseSrc(o, noiseBuf(o, 12.5), 0), f = o.createBiquadFilter(), g = o.createGain(), lfo = o.createOscillator(), lg = o.createGain();
        f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.9; g.gain.value = 0.5;
        lfo.frequency.value = 3.3; lg.gain.value = 0.18; lfo.connect(lg); lg.connect(g.gain); lfo.start(0);
        s.connect(f); f.connect(g); g.connect(out);
        for (var i = 0; i < 9; i++) { var t = 0.6 + i * 1.31 + hash(i) * 0.6; tone(o, out, 'sine', 2400 + hash(i + 3) * 1600, t, 0.002, 0.01, 0.25, 0.12); tone(o, out, 'sine', 5100 + hash(i + 7) * 900, t, 0.002, 0.005, 0.12, 0.05); }
      });
    },
    street: function () {
      return render(12.5, function (o, out) {
        var s = noiseSrc(o, noiseBuf(o, 12.5, true), 0), f = o.createBiquadFilter(), g = o.createGain();
        f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(0.6, 0); g.gain.linearRampToValueAtTime(1, 3); g.gain.linearRampToValueAtTime(0.5, 7); g.gain.linearRampToValueAtTime(0.9, 11);
        s.connect(f); f.connect(g); g.connect(out);
        var c = noiseSrc(o, noiseBuf(o, 12.5), 0), cf = o.createBiquadFilter(), cg = o.createGain();
        cf.type = 'bandpass'; cf.frequency.setValueAtTime(500, 2); cf.frequency.linearRampToValueAtTime(1400, 4); cf.frequency.linearRampToValueAtTime(600, 6); cf.Q.value = 1.5;
        cg.gain.setValueAtTime(0, 0); cg.gain.linearRampToValueAtTime(0.25, 3.8); cg.gain.linearRampToValueAtTime(0, 6.5);
        c.connect(cf); cf.connect(cg); cg.connect(out);
        tone(o, out, 'square', 415, 8.2, 0.02, 0.32, 0.1, 0.05); tone(o, out, 'square', 349, 8.2, 0.02, 0.32, 0.1, 0.05);
      });
    },
    hiss: function () {
      return render(12.5, function (o, out) {
        var s = noiseSrc(o, noiseBuf(o, 12.5), 0), f = o.createBiquadFilter(), g = o.createGain();
        f.type = 'highpass'; f.frequency.value = 3000; g.gain.value = 0.6; s.connect(f); f.connect(g); g.connect(out);
        var h = o.createOscillator(), hg = o.createGain(); h.frequency.value = 60; hg.gain.value = 0.35; h.connect(hg); hg.connect(out); h.start(0); h.stop(12.5);
        var h2 = o.createOscillator(), h2g = o.createGain(); h2.frequency.value = 180; h2g.gain.value = 0.12; h2.connect(h2g); h2g.connect(out); h2.start(0); h2.stop(12.5);
      });
    }
  };
  function getAud(k) {
    if (!AUD[k]) return Promise.reject(new Error('no ' + k));
    if (!ABP[k]) {
      ABP[k] = AUD[k]().then(function (b) {
        if (k !== 'voice') normalize(b, 0.85);
        AB[k] = b; PK[k] = mkPeaks(b); poke(); return b;
      }).catch(function (e) { ABP[k] = null; throw e; });
    }
    return ABP[k];
  }
  function needAud(keys) { return Promise.all(keys.map(getAud)); }
  function mkPeaks(b) {
    var d = b.getChannelData(0), sr = b.sampleRate, n = Math.ceil(b.duration * 100), p = new Float32Array(n), st = Math.floor(sr / 100);
    for (var i = 0; i < n; i++) {
      var m = 0, e = Math.min(d.length, (i + 1) * st);
      for (var j = i * st; j < e; j += 4) { var a = d[j] < 0 ? -d[j] : d[j]; if (a > m) m = a; }
      p[i] = m;
    }
    return p;
  }
  function peakAt(k, bt) { var p = PK[k]; if (!p || bt < 0) return 0; var i = (bt * 100) | 0; return i < p.length ? p[i] : 0; }

  // 실시간 믹서(클릭 후에만 만들어요)
  function Mixer(ac, out, T0) { this.ac = ac; this.out = out; this.T0 = T0; this.nodes = []; }
  Mixer.prototype.play = function (k, o) {
    var buf = AB[k]; if (!buf) return null;
    o = o || {};
    var ac = this.ac, s = ac.createBufferSource(), g = ac.createGain(), T0 = this.T0;
    s.buffer = buf;
    if (o.rate) s.playbackRate.value = o.rate;
    var gv = o.gain == null ? 1 : o.gain;
    if (o.env) {
      g.gain.setValueAtTime(o.env[0][1] * gv, T0);
      for (var i = 0; i < o.env.length; i++) g.gain.linearRampToValueAtTime(o.env[i][1] * gv, T0 + o.env[i][0]);
    } else g.gain.value = gv;
    s.connect(g); g.connect(o.dest || this.out);
    var st = T0 + (o.t || 0);
    if (o.dur != null) s.start(st, o.off || 0, o.dur); else s.start(st, o.off || 0);
    this.nodes.push(s, g);
    return g;
  };
  Mixer.prototype.node = function (n) { this.nodes.push(n); return n; };
  Mixer.prototype.stop = function () {
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      try { if (n.stop) n.stop(); } catch (e) { /* ignore */ }
      try { n.disconnect(); } catch (e) { /* ignore */ }
    }
    this.nodes = [];
  };
  // 더킹 곡선: 말소리 구간에서 lo로 내려가요
  function duckEnv(hi, lo, segs, end) {
    var e = [[0, hi]], last = 0;
    for (var i = 0; i < segs.length; i++) {
      var a = segs[i][0], b = segs[i][1]; if (a >= end) break;
      e.push([Math.max(last, a - 0.25), hi]); e.push([Math.max(last + 0.01, a), lo]);
      e.push([Math.min(end, b), lo]); e.push([Math.min(end, b + 0.35), hi]); last = b + 0.35;
    }
    e.push([end, hi]);
    return e;
  }
  function envAt(e, t) {
    if (t <= e[0][0]) return e[0][1];
    for (var i = 1; i < e.length; i++) if (t <= e[i][0]) { var a = e[i - 1], b = e[i]; return b[0] === a[0] ? b[1] : lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0])); }
    return e[e.length - 1][1];
  }

  /* ---------- 캔버스 기본 ---------- */
  function full(g, c, a) { if (a != null) g.globalAlpha = clamp(a, 0, 1); g.drawImage(c, 0, 0, LW, LH); g.globalAlpha = 1; }
  function sub(g, c, sx, sy, sw, sh, dx, dy, dw, dh) {
    var k = c._k || (c.width / LW);
    sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(sw, LW - sx); sh = Math.min(sh, LH - sy);
    if (sw <= 0 || sh <= 0) return;
    g.drawImage(c, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh);
  }
  function copyP(T, dst) {
    var x = dst._x; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'copy';
    x.drawImage(T.P, 0, 0); x.globalCompositeOperation = 'source-over'; x.setTransform(dst._k, 0, 0, dst._k, 0, 0);
    return dst;
  }
  function camOf(T, c, t) {
    var lt = t - c.t0, u = clamp(lt / Math.max(0.001, c.t1 - c.t0), 0, 1);
    var cm = typeof c.cam === 'function' ? c.cam(u, lt, t) : (c.cam || NOCAM);
    var gc = T.R.gcam ? T.R.gcam(t, c, T) : null;
    if (!gc) return cm;
    return { s: (cm.s || 1) * (gc.s || 1), x: (cm.x || 0) + (gc.x || 0), y: (cm.y || 0) + (gc.y || 0), r: (cm.r || 0) + (gc.r || 0), fx: cm.fx };
  }
  function drawImgCam(g, img, key, cam, alpha) {
    var an = ANCH[key] || [0.5, 0.5], ax = an[0] * LW, ay = an[1] * LH;
    g.save();
    if (alpha != null && alpha < 1) g.globalAlpha = alpha;
    if (cam && ((cam.s || 1) !== 1 || cam.x || cam.y || cam.r || cam.fx)) {
      var s = cam.s || 1;
      g.translate(ax + (cam.x || 0), ay + (cam.y || 0)); if (cam.r) g.rotate(cam.r); g.scale(s * (cam.fx || 1), s); g.translate(-ax, -ay);
    }
    g.drawImage(img, 0, 0, LW, LH);
    g.restore();
  }
  // 소스 좌표(0~1) → 카메라 적용 후 프로그램 좌표(회전 무시)
  function camPt(key, cam, nx, ny) {
    var an = ANCH[key] || [0.5, 0.5], ax = an[0] * LW, ay = an[1] * LH, s = (cam && cam.s) || 1;
    return [ax + ((cam && cam.x) || 0) + (nx * LW - ax) * s, ay + ((cam && cam.y) || 0) + (ny * LH - ay) * s];
  }
  function layers(g, L, x, y, w, h) {
    for (var i = 0; i < L.length; i++) {
      var l = L[i];
      g.globalCompositeOperation = l[0]; g.globalAlpha = l[2] == null ? 1 : l[2];
      g.fillStyle = typeof l[1] === 'function' ? l[1](g, x, y, w, h) : l[1];
      g.fillRect(x, y, w, h);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  function vignette(g, x, y, w, h, a) {
    var cx = x + w / 2, cy = y + h / 2, gr = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.32, cx, cy, Math.max(w, h) * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + a + ')');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  function grainOv(g, x, y, w, h, a, t) {
    var tiles = grain(), c = tiles[Math.floor(t * 24) % 4];
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = a;
    var p = g.createPattern(c, 'repeat'); g.fillStyle = p; g.translate((t * 977) % 128, (t * 613) % 128); g.fillRect(x - 128, y - 128, w + 256, h + 256);
    g.restore();
  }
  // 흐림: 축소 후 확대(사파리에서도 동작)
  var BL1 = null, BL2 = null;
  function blurDraw(g, src, f, dx, dy, dw, dh, sx, sy, sw, sh) {
    if (!BL1) { BL1 = mkC(320, 180); BL2 = mkC(320, 180); }
    var a = BL1.getContext('2d'), b = BL2.getContext('2d');
    var w1 = Math.max(6, Math.round(lerp(160, 10, clamp(f, 0, 1)))), h1 = Math.max(4, Math.round(w1 * (dh / dw)));
    h1 = Math.min(h1, 180); var mw = Math.min(320, w1 * 2), mh = Math.min(180, h1 * 2);
    a.clearRect(0, 0, 320, 180); b.clearRect(0, 0, 320, 180);
    var W = src.videoWidth || src.width, H = src.videoHeight || src.height;
    if (sx == null) { sx = 0; sy = 0; sw = W; sh = H; }
    a.drawImage(src, sx, sy, sw, sh, 0, 0, mw, mh);
    b.drawImage(BL1, 0, 0, mw, mh, 0, 0, w1, h1);
    g.drawImage(BL2, 0, 0, w1, h1, dx, dy, dw, dh);
  }
  function pixelate(g, src, x, y, w, h, block) {
    if (!BL1) { BL1 = mkC(320, 180); BL2 = mkC(320, 180); }
    var a = BL1.getContext('2d'), k = src._k || (src.width / LW);
    var bw = Math.max(1, Math.round(w / block)), bh = Math.max(1, Math.round(h / block));
    if (bw > 320 || bh > 180) return;
    a.clearRect(0, 0, bw, bh); a.drawImage(src, x * k, y * k, w * k, h * k, 0, 0, bw, bh);
    var sm0 = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
    g.drawImage(BL1, 0, 0, bw, bh, x, y, w, h);
    g.imageSmoothingEnabled = sm0;
  }
  function rgbSplit(T, g, ax, ay) {
    var src = copyP(T, T.buf('rs0')), cols = ['#ff0000', '#00ff00', '#0000ff'], off = [[-ax, -ay], [0, 0], [ax, ay]];
    g.save(); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.fillRect(0, 0, LW, LH);
    for (var i = 0; i < 3; i++) {
      var ch = T.buf('rs' + (i + 1)), x = ch._x;
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'copy'; x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'multiply'; x.fillStyle = cols[i]; x.fillRect(0, 0, ch.width, ch.height);
      x.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'lighter'; g.drawImage(ch, off[i][0] - Math.abs(ax) * 0.5, off[i][1] - Math.abs(ay) * 0.5, LW + Math.abs(ax), LH + Math.abs(ay));
    }
    g.restore();
  }
  function glitchSlices(T, g, amt, seed, alt) {
    var src = copyP(T, T.buf('gl'));
    for (var i = 0; i < 14; i++) {
      var r = hash(seed * 13 + i); if (r < 0.5) continue;
      var y = Math.floor(hash(seed * 7 + i * 3) * LH), h = Math.min(LH - y, 3 + Math.floor(hash(seed + i * 5) * 26)), dx = (hash(seed * 3 + i) - 0.5) * 110 * amt;
      if (h <= 0) continue;
      sub(g, (alt && r > 0.85) ? alt : src, 0, y, LW, h, dx, y, LW, h);
      if (r > 0.9) { g.fillStyle = hash(i + seed) > 0.5 ? 'rgba(255,0,170,.38)' : 'rgba(0,255,220,.32)'; g.fillRect(hash(i * 9 + seed) * LW, y, 20 + hash(i) * 120, h * 0.7); }
    }
  }
  // 루마 마스크(밝은 곳부터 B가 드러나요)
  var LM = null;
  function lumaMask(B, th) {
    if (!LM) { LM = mkC(256, 144); LM._x = LM.getContext('2d', { willReadFrequently: true }); }
    var x = LM._x; x.clearRect(0, 0, 256, 144); x.drawImage(B, 0, 0, 256, 144);
    var im; try { im = x.getImageData(0, 0, 256, 144); } catch (e) { return null; }
    var d = im.data;
    for (var i = 0; i < d.length; i += 4) {
      var L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, a = (L - th) / 0.14;
      d[i + 3] = a <= 0 ? 0 : (a >= 1 ? 255 : a * 255);
    }
    x.putImageData(im, 0, 0);
    return LM;
  }
  function leakOv(g, a, ph, big) {
    if (a <= 0.01) return;
    g.save(); g.globalCompositeOperation = 'screen';
    var x = lerp(-0.25, 1.25, ph) * LW, y = LH * (0.3 + 0.2 * Math.sin(ph * 3)), r = LW * (0.5 + 0.4 * (big || 0));
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,238,196,' + (0.95 * a).toFixed(3) + ')'); gr.addColorStop(0.35, 'rgba(255,142,40,' + (0.72 * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
    var x2 = LW - x * 0.7, gr2 = g.createRadialGradient(x2, LH * 0.9, 0, x2, LH * 0.9, r * 0.8);
    gr2.addColorStop(0, 'rgba(255,90,60,' + (0.6 * a).toFixed(3) + ')'); gr2.addColorStop(1, 'rgba(255,40,80,0)');
    g.fillStyle = gr2; g.fillRect(0, 0, LW, LH);
    g.restore();
  }

  /* ---------- 클립·타임라인 ---------- */
  function C(src, t0, t1, cam, extra) { var c = { src: src, t0: t0, t1: t1, cam: cam || null }; if (extra) for (var k in extra) c[k] = extra[k]; return c; }
  function BASE() { return [C('coffee', 0, 5), C('product', 5, 8), C('coffee', 8, 12)]; }
  function push(s0, s1, x0, x1, y0, y1) { return function (u) { var e = sm(u); return { s: lerp(s0, s1, e), x: lerp(x0 || 0, x1 || 0, e), y: lerp(y0 || 0, y1 || 0, e) }; }; }
  function clipIdx(cl, t) { for (var i = cl.length - 1; i >= 0; i--) if (t >= cl[i].t0) return i; return 0; }
  function drawClip(T, g, c, t, alpha) {
    var cam = camOf(T, c, t);
    if (c.draw) { c.draw(T, g, t, cam, c); return; }
    if (c.src === 'black') { g.fillStyle = '#000'; g.fillRect(0, 0, LW, LH); return; }
    var img = T.img(c.src);
    if (!img) { g.fillStyle = '#101012'; g.fillRect(0, 0, LW, LH); return; }
    if (c.f && HASF) g.filter = c.f;
    drawImgCam(g, img, c.src, cam, alpha);
    if (c.f && HASF) g.filter = 'none';
    if (c.L) layers(g, c.L, 0, 0, LW, LH);
  }
  var TRD = { dissolve: 1.0, black: 0.9, white: 0.7, flash: 0.3, whip: 0.45, zoom: 0.6, glitch: 0.5, luma: 1.2, wipe: 0.7, spin: 0.7, morph: 0.7, leak: 1.1, shape: 1.2 };
  function drawProgram(T, g, t) {
    var cl = T.E.clips, tr = T.E.tr, n = cl.length;
    for (var i = 1; i < n; i++) {
      var c = cl[i], ty = c.tr || (tr && tr.type);
      if (!ty || c.noTr) continue;
      var d = c.trd || (tr && tr.dur) || TRD[ty] || 0.8, b = c.t0;
      if (t >= b - d / 2 && t < b + d / 2) { transition(T, g, cl[i - 1], c, (t - (b - d / 2)) / d, t, ty); return; }
    }
    drawClip(T, g, cl[clipIdx(cl, t)], t);
  }
  function transition(T, g, A, B, p, t, ty) {
    var f = TRX[ty];
    if (!f) { drawClip(T, g, p < 0.5 ? A : B, t); return; }
    var ca = T.buf('tA'), cb = T.buf('tB');
    T.clipTo(ca, A, t); T.clipTo(cb, B, t);
    f(T, g, ca, cb, p, t, A, B);
  }
  function dip(g, A, B, p, col) {
    full(g, p < 0.5 ? A : B);
    g.fillStyle = col; g.globalAlpha = clamp(1.3 * (1 - Math.abs(p * 2 - 1)), 0, 1); g.fillRect(0, 0, LW, LH); g.globalAlpha = 1;
  }
  var TRX = {
    dissolve: function (T, g, A, B, p) { full(g, A); full(g, B, sm(p)); },
    black: function (T, g, A, B, p) { dip(g, A, B, p, '#000'); },
    white: function (T, g, A, B, p) { dip(g, A, B, p, '#fff'); },
    flash: function (T, g, A, B, p) { dip(g, A, B, p, '#fff'); },
    whip: function (T, g, A, B, p) {
      var Cc = T.buf('tC'), c = Cc._x, e = eio(p), off = e * LW, sp = Math.sin(Math.PI * p);
      c.setTransform(Cc._k, 0, 0, Cc._k, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, LW, LH);
      c.drawImage(A, -off, 0, LW, LH); c.drawImage(B, LW - off, 0, LW, LH);
      var n = 8, st = sp * 30;
      for (var i = 0; i < n; i++) { g.globalAlpha = 1 / (i + 1); g.drawImage(Cc, (i - (n - 1) / 2) * st - LW * 0.06, -LH * 0.06, LW * 1.12, LH * 1.12); }
      g.globalAlpha = 1;
    },
    zoom: function (T, g, A, B, p) {
      var first = p < 0.5, src = first ? A : B, q = first ? ein(p * 2) : 1 - eout((p - 0.5) * 2), s = 1 + q * 1.8, sp = Math.sin(Math.PI * p), n = 6, cx = LW * 0.5, cy = LH * 0.52;
      for (var i = 0; i < n; i++) { var si = s * (1 + i * 0.04 * sp); g.globalAlpha = 1 / (i + 1); g.drawImage(src, cx - cx * si, cy - cy * si, LW * si, LH * si); }
      g.globalAlpha = 1;
      if (sp > 0.6) { g.fillStyle = 'rgba(255,255,255,' + ((sp - 0.6) * 0.8).toFixed(3) + ')'; g.fillRect(0, 0, LW, LH); }
    },
    glitch: function (T, g, A, B, p, t) {
      full(g, p < 0.5 ? A : B);
      var amt = Math.sin(Math.PI * p), seed = Math.floor(t * 24);
      glitchSlices(T, g, amt, seed, p < 0.5 ? B : A);
      if (amt > 0.15) rgbSplit(T, g, (3 + amt * 12) * (hash(seed) > 0.5 ? 1 : -1), 0);
    },
    luma: function (T, g, A, B, p) {
      full(g, A);
      var m = lumaMask(B, 1 - p * 1.3);
      if (m) g.drawImage(m, 0, 0, LW, LH); else full(g, B, p);
    },
    wipe: function (T, g, A, B, p) {
      full(g, A);
      var e = eio(p), x = -60 + e * (LW + 120), sl = 40;
      g.save(); g.beginPath(); g.moveTo(-10, -10); g.lineTo(x + sl, -10); g.lineTo(x - sl, LH + 10); g.lineTo(-10, LH + 10); g.closePath(); g.clip(); full(g, B); g.restore();
      g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + sl, -10); g.lineTo(x - sl, LH + 10); g.stroke();
    },
    spin: function (T, g, A, B, p) {
      var first = p < 0.5, src = first ? A : B, q = first ? ein(p * 2) : -(1 - eout((p - 0.5) * 2)), th = q * Math.PI, sp = Math.sin(Math.PI * p);
      var cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th)), k = Math.max((LW * cs + LH * sn) / LW, (LW * sn + LH * cs) / LH) * 1.08;
      g.fillStyle = '#000'; g.fillRect(0, 0, LW, LH);
      for (var i = 0; i < 6; i++) {
        g.save(); g.globalAlpha = 1 / (i + 1); g.translate(LW / 2, LH / 2); g.rotate(th + (i - 2.5) * 0.045 * sp); g.scale(k, k);
        g.drawImage(src, -LW / 2, -LH / 2, LW, LH); g.restore();
      }
    },
    morph: function (T, g, A, B, p, t, cA, cB) {
      var e = eio(p), ka = camOf(T, cA, cA.t1), kb = camOf(T, cB, cB.t0), img = T.img(cB.src);
      if (!img) { full(g, B); return; }
      drawImgCam(g, img, cB.src, { s: lerp(ka.s || 1, kb.s || 1, e), x: lerp(ka.x || 0, kb.x || 0, e), y: lerp(ka.y || 0, kb.y || 0, e), r: 0 });
      g.globalAlpha = 0.22 * Math.sin(Math.PI * p); g.drawImage(p < 0.5 ? A : B, 0, 0, LW, LH); g.globalAlpha = 1;
    },
    leak: function (T, g, A, B, p) { full(g, A); full(g, B, seg(p, 0.38, 0.62)); leakOv(g, Math.sin(Math.PI * p), p, 1); },
    shape: function (T, g, A, B, p, t, cA) {
      full(g, A);
      var Cc = T.buf('tC'), c = Cc._x, an = ANCH[cA.src] || [0.5, 0.5], ax = an[0] * LW, ay = an[1] * LH;
      c.setTransform(Cc._k, 0, 0, Cc._k, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.clearRect(0, 0, LW, LH); c.drawImage(B, 0, 0, LW, LH);
      c.globalCompositeOperation = 'destination-in';
      var key = cA.src === 'coffee' ? T.keyed() : null;
      if (key) {
        var s = lerp(1, 9, ein(lin(p, 0.2, 1)));
        c.globalAlpha = seg(p, 0, 0.2);
        var cam = camOf(T, cA, t);
        c.save(); c.translate(ax, ay); c.scale(s, s); c.translate(-ax, -ay); drawImgCam(c, key, 'coffee', cam); c.restore();
      } else {
        c.fillStyle = '#000'; c.beginPath(); c.arc(ax, ay, lerp(2, 760, ein(p)), 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      g.drawImage(Cc, 0, 0, LW, LH);
    }
  };

  /* ---------- 그레이딩 ---------- */
  function gradeDraw(T, g, s, d, G, vd) {
    vd = vd || d;
    g.save(); g.beginPath(); g.rect(d[0], d[1], d[2], d[3]); g.clip();
    var useF = G && G.f && HASF;
    if (useF) g.filter = G.f;
    sub(g, T.P, s[0], s[1], s[2], s[3], d[0], d[1], d[2], d[3]);
    if (useF) g.filter = 'none';
    if (G) {
      if (G.L) layers(g, G.L, d[0], d[1], d[2], d[3]);
      if (!HASF && G.fb) layers(g, G.fb, d[0], d[1], d[2], d[3]);
      if (G.vig) vignette(g, vd[0], vd[1], vd[2], vd[3], G.vig);
      if (G.grain) grainOv(g, d[0], d[1], d[2], d[3], G.grain, T.t);
    }
    g.restore();
  }
  function out(T, b, s, d) {
    var R = T.R, G = R.grade;
    if (R.split && G) {
      var sp = clamp(R.split(T.t), 0, 1), fx = sp;
      gradeDraw(T, b, s, d, R.splitRaw || null);
      if (fx < 1) gradeDraw(T, b, [s[0] + s[2] * fx, s[1], s[2] * (1 - fx), s[3]], [d[0] + d[2] * fx, d[1], d[2] * (1 - fx), d[3]], G, d);
      T.F.splitX = d[0] + d[2] * fx; T.F.splitD = d;
    } else gradeDraw(T, b, s, d, G);
  }

  /* ---------- 프레이밍 ---------- */
  function subjX(T, t) {
    var cl = T.E.clips, c = cl[clipIdx(cl, t)], an = ANCH[c.src] || [0.5, 0.5];
    return camPt(c.src, camOf(T, c, t), an[0], an[1])[0];
  }
  function setFR(F, fr, m, cx, cy, cw, ch) { F.FR = fr; F.M = m || fr; F.cx = cx; F.cy = cy; F.cw = cw; F.ch = ch; }
  function reframe(T, b, t, VP, F, ar, track) {
    var cw = LH * ar, cx;
    if (track) {
      var tx = subjX(T, t);
      if (T.mem.tx == null || !T.playing && !T.aud) T.mem.tx = tx;
      else T.mem.tx = lerp(T.mem.tx, tx, 1 - Math.exp(-(T.dt || 0.033) * 5));
      cx = T.mem.tx;
    } else cx = subjX(T, t);
    var sx = clamp(cx - cw / 2, 0, LW - cw), k = VP.w / LW;
    out(T, b, [0, 0, LW, LH], [VP.x, VP.y, VP.w, VP.h]);
    b.fillStyle = 'rgba(8,8,10,.66)'; b.fillRect(VP.x, VP.y, VP.w, VP.h);
    var fr = { x: VP.x + sx * k, y: VP.y, w: cw * k, h: VP.h };
    out(T, b, [sx, 0, cw, LH], [fr.x, fr.y, fr.w, fr.h]);
    setFR(F, fr, fr, sx, 0, cw, LH); F.border = ar === 1 ? '1:1' : '9:16';
  }
  function vcrop(T, b, t, VP, F, ar) {
    var cw = LH * ar, sx = clamp(subjX(T, t) - cw / 2, 0, LW - cw), h = VP.h, w = h * ar;
    var fr = { x: VP.x + (VP.w - w) / 2, y: VP.y, w: w, h: h };
    out(T, b, [sx, 0, cw, LH], [fr.x, fr.y, fr.w, fr.h]);
    setFR(F, fr, fr, sx, 0, cw, LH);
  }
  var FRAMES = {
    vertical: function (T, b, t, VP, F) { reframe(T, b, t, VP, F, 9 / 16, false); },
    square: function (T, b, t, VP, F) { reframe(T, b, t, VP, F, 1, false); },
    auto: function (T, b, t, VP, F) { reframe(T, b, t, VP, F, 9 / 16, true); },
    short: function (T, b, t, VP, F) { vcrop(T, b, t, VP, F, 9 / 16); },
    blurfill: function (T, b, t, VP, F) {
      var h = VP.h, w = h * 9 / 16, fr = { x: VP.x + (VP.w - w) / 2, y: VP.y, w: w, h: h }, cw = LH * 9 / 16, k = T.pk;
      b.save(); b.beginPath(); b.rect(fr.x, fr.y, fr.w, fr.h); b.clip();
      blurDraw(b, T.P, 0.8, fr.x - 6, fr.y - 6, fr.w + 12, fr.h + 12, (LW - cw) / 2 * k, 0, cw * k, LH * k);
      b.fillStyle = 'rgba(0,0,0,.28)'; b.fillRect(fr.x, fr.y, fr.w, fr.h);
      b.restore();
      var mh = w * LH / LW, m = { x: fr.x, y: fr.y + (h - mh) / 2, w: w, h: mh };
      out(T, b, [0, 0, LW, LH], [m.x, m.y, m.w, m.h]);
      setFR(F, fr, m, 0, 0, LW, LH);
    },
    letterbox: function (T, b, t, VP, F) {
      out(T, b, [0, 0, LW, LH], [VP.x, VP.y, VP.w, VP.h]);
      var bh = (VP.h - VP.w / 2.39) / 2 * eio(lin(t % DUR, 0.2, 1.4));
      b.fillStyle = '#000'; b.fillRect(VP.x, VP.y, VP.w, bh); b.fillRect(VP.x, VP.y + VP.h - bh, VP.w, bh);
      var fr = { x: VP.x, y: VP.y + bh, w: VP.w, h: VP.h - 2 * bh };
      setFR(F, fr, VP, 0, 0, LW, LH);
    },
    stabilize: function (T, b, t, VP, F) {
      var hw = VP.w / 2, jx = nz(t * 3.1, 1) * 9 + nz(t * 9, 4) * 3, jy = nz(t * 2.7, 2) * 7 + nz(t * 8, 7) * 2, jr = nz(t * 2.3, 3) * 0.018;
      b.save(); b.beginPath(); b.rect(VP.x, VP.y, hw, VP.h); b.clip();
      b.translate(VP.x + VP.w / 2 + jx, VP.y + VP.h / 2 + jy); b.rotate(jr); b.scale(1.04, 1.04); b.translate(-(VP.x + VP.w / 2), -(VP.y + VP.h / 2));
      out(T, b, [0, 0, LW, LH], [VP.x, VP.y, VP.w, VP.h]); b.restore();
      b.save(); b.beginPath(); b.rect(VP.x + hw, VP.y, hw, VP.h); b.clip();
      b.translate(VP.x + VP.w / 2, VP.y + VP.h / 2); b.scale(1.1, 1.1); b.translate(-(VP.x + VP.w / 2), -(VP.y + VP.h / 2));
      out(T, b, [0, 0, LW, LH], [VP.x, VP.y, VP.w, VP.h]); b.restore();
      setFR(F, VP, VP, 0, 0, LW, LH); F.halves = ['보정 전', '보정 후'];
    },
    zoomcrop: function (T, b, t, VP, F) {
      var z = kf([[0, 1], [2.4, 1], [3.1, 1.6], [9, 1.6], [9.7, 1], [12, 1]], t, eio);
      var w = LW / z, h = LH / z, ax = ANCH.coffee[0] * LW, ay = ANCH.coffee[1] * LH;
      var sx = clamp(ax - w / 2, 0, LW - w), sy = clamp(ay - h / 2 - 10, 0, LH - h);
      out(T, b, [sx, sy, w, h], [VP.x, VP.y, VP.w, VP.h]);
      setFR(F, VP, VP, sx, sy, w, h);
      var gw = LW / 1.6, gh = LH / 1.6, gx = clamp(ax - gw / 2, 0, LW - gw), gy = clamp(ay - gh / 2 - 10, 0, LH - gh);
      F.guide = z < 1.02 && t > 0.5 && t < 2.5 ? [gx, gy, gw, gh] : null;
    }
  };
  function compose(T, t) {
    var b = T.gB, R = T.R, VP = T.VP, F = T.F;
    b.setTransform(T.pk, 0, 0, T.pk, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
    b.fillStyle = '#0c0c0e'; b.fillRect(0, 0, LW, LH);
    F.splitX = null; F.border = null; F.halves = null; F.guide = null;
    setFR(F, VP, VP, 0, 0, LW, LH);
    var fm = R.frame && FRAMES[R.frame];
    if (fm) fm(T, b, t, VP, F); else out(T, b, [0, 0, LW, LH], [VP.x, VP.y, VP.w, VP.h]);
  }

  /* ---------- 오버레이 글자·칩 ---------- */
  var UIK = 1;
  function uk(v, cap) { return v * Math.min(UIK, cap || 1.8); }
  function uiAt(o, ax, ay, k, fn) {
    var s = UIK; o.save(); o.translate(ax, ay); o.scale(k, k); o.translate(-ax, -ay); UIK = 1;
    try { fn(); } finally { UIK = s; o.restore(); }
  }
  function ui(anchor, fn) {
    return function (T, o, t, F) {
      var a = anchor(F), k = Math.min(UIK, a[2] || 9);
      if (k <= 1.01) { fn(T, o, t, F); return; }
      uiAt(o, a[0], a[1], k, function () { fn(T, o, t, F); });
    };
  }
  function setFont(o, w, size, fam) { o.font = w + ' ' + size.toFixed(1) + 'px ' + fam; }
  function txt(o, s, x, y, st) {
    setFont(o, st.w || 700, st.size, st.font || FF.nk);
    o.textAlign = st.align || 'center'; o.textBaseline = st.base || 'alphabetic';
    o.lineJoin = 'round'; o.miterLimit = 2;
    if (st.alpha != null) o.globalAlpha = clamp(st.alpha, 0, 1);
    if (st.shadow) { o.shadowColor = st.shadow; o.shadowBlur = st.sb != null ? st.sb : st.size * 0.3; o.shadowOffsetY = st.sy != null ? st.sy : st.size * 0.06; }
    if (st.stroke2) { o.strokeStyle = st.stroke2; o.lineWidth = st.sw2; o.strokeText(s, x, y); o.shadowColor = 'transparent'; }
    if (st.stroke) { o.strokeStyle = st.stroke; o.lineWidth = st.sw; o.strokeText(s, x, y); o.shadowColor = 'transparent'; }
    if (st.fill !== false) { o.fillStyle = st.fill || '#fff'; o.fillText(s, x, y); }
    o.shadowColor = 'transparent'; o.shadowBlur = 0; o.shadowOffsetY = 0; o.globalAlpha = 1;
  }
  function tw(o, s, w, size, fam) { setFont(o, w, size, fam); return o.measureText(s).width; }
  function fit(o, s, size, maxW, w, fam) { var m = tw(o, s, w, size, fam); return m > maxW ? size * maxW / m : size; }
  function chip(o, text, x, y, opt) {
    opt = opt || {};
    var fs = uk(opt.size || 10.5, 2.2), pd = fs * 0.66;
    setFont(o, 600, fs, FF.ui);
    var w = o.measureText(text).width + pd * 2, h = fs * 1.85;
    if (opt.right) x -= w;
    if (opt.center) x -= w / 2;
    if (opt.up) y -= h;
    o.fillStyle = opt.bg || 'rgba(0,0,0,.62)'; rr(o, x, y, w, h, fs * 0.48); o.fill();
    o.fillStyle = opt.fg || '#fff'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText(text, x + pd, y + h / 2 + 0.5);
    return w;
  }
  function arrow(o, x0, y0, x1, y1, col, w, head) {
    o.strokeStyle = col; o.fillStyle = col; o.lineWidth = w; o.lineCap = 'round';
    o.beginPath(); o.moveTo(x0, y0); o.lineTo(x1, y1); o.stroke();
    var a = Math.atan2(y1 - y0, x1 - x0), hl = head || w * 3.2;
    o.beginPath(); o.moveTo(x1, y1); o.lineTo(x1 - hl * Math.cos(a - 0.45), y1 - hl * Math.sin(a - 0.45)); o.lineTo(x1 - hl * Math.cos(a + 0.45), y1 - hl * Math.sin(a + 0.45)); o.closePath(); o.fill();
  }
  function dimFR(o, F, a) { var R = F.FR; o.fillStyle = 'rgba(0,0,0,' + a + ')'; o.fillRect(R.x, R.y, R.w, R.h); }

  /* ---------- 패널(타임라인·오디오 레인) ---------- */
  var PL = 50;
  function setPL() { PL = 44 * Math.min(UIK, 1.9); }
  function PX(PR, t) { return PR.x + PL + clamp(t / DUR, 0, 1) * (PR.w - PL - 8); }
  function panelBg(o, PR) { o.fillStyle = '#141417'; rr(o, PR.x, PR.y, PR.w, PR.h, 7); o.fill(); }
  function laneBox(o, PR, y, h, name, col) {
    o.fillStyle = '#1d1d22'; rr(o, PR.x + PL, y, PR.w - PL - 8, h, 3); o.fill();
    setFont(o, 600, Math.min(uk(10), h * 0.62), FF.ui); o.fillStyle = col || '#c9c9d1'; o.textAlign = 'left'; o.textBaseline = 'middle';
    o.fillText(name, PR.x + 8, y + h / 2 + 0.5);
  }
  function block(o, PR, y, h, t0, t1, col, label, hatch, alpha) {
    var x0 = PX(PR, t0), x1 = PX(PR, t1);
    if (x1 - x0 < 0.5) return;
    o.globalAlpha = alpha == null ? 1 : alpha;
    o.fillStyle = col; rr(o, x0 + 0.5, y + 1, x1 - x0 - 1, h - 2, 3); o.fill();
    if (hatch) {
      o.save(); rr(o, x0 + 0.5, y + 1, x1 - x0 - 1, h - 2, 3); o.clip();
      o.strokeStyle = 'rgba(255,255,255,.35)'; o.lineWidth = 1.2;
      for (var hx = x0 - h; hx < x1; hx += 6) { o.beginPath(); o.moveTo(hx, y + h); o.lineTo(hx + h, y); o.stroke(); }
      o.restore();
    }
    if (label && x1 - x0 > 18) {
      setFont(o, 600, Math.min(uk(9.5), h * 0.62), FF.ui); o.fillStyle = 'rgba(255,255,255,.92)'; o.textAlign = 'left'; o.textBaseline = 'middle';
      o.save(); o.beginPath(); o.rect(x0, y, x1 - x0 - 2, h); o.clip(); o.fillText(label, x0 + 4, y + h / 2 + 0.5); o.restore();
    }
    o.globalAlpha = 1;
  }
  function wave(o, PR, y, h, k, t0, t1, off, gfn, col) {
    var p = PK[k], x0 = PX(PR, t0), x1 = PX(PR, t1), mid = y + h / 2, sc = PKM(k);
    o.strokeStyle = col || 'rgba(255,255,255,.8)'; o.lineWidth = 1.1; o.beginPath();
    if (!p) { o.moveTo(x0, mid); o.lineTo(x1, mid); o.stroke(); return; }
    var dtx = DUR / (PR.w - PL - 8);
    for (var x = x0; x < x1; x += 1.6) {
      var tt = t0 + (x - x0) * dtx, a = peakAt(k, off + (tt - t0)) * sc * (typeof gfn === 'function' ? gfn(tt) : (gfn == null ? 1 : gfn));
      var hh = Math.max(0.4, a * h * 0.46);
      o.moveTo(x, mid - hh); o.lineTo(x, mid + hh);
    }
    o.stroke();
  }
  var PKMC = {};
  function PKM(k) {
    if (PKMC[k]) return PKMC[k];
    var p = PK[k]; if (!p) return 1;
    var m = 0; for (var i = 0; i < p.length; i++) if (p[i] > m) m = p[i];
    PKMC[k] = m > 0 ? 1 / m : 1; return PKMC[k];
  }
  function envLine(o, PR, y, h, fn, t0, t1, col) {
    o.strokeStyle = col || '#ffd34d'; o.lineWidth = 1.4; o.beginPath();
    for (var tt = t0; tt <= t1 + 0.001; tt += 0.05) { var x = PX(PR, tt), yy = y + h - 2 - clamp(fn(tt), 0, 1) * (h - 4); if (tt === t0) o.moveTo(x, yy); else o.lineTo(x, yy); }
    o.stroke();
  }
  function playhead(o, PR, t) {
    var x = PX(PR, t);
    o.strokeStyle = '#ff4d4d'; o.lineWidth = 1.4; o.beginPath(); o.moveTo(x, PR.y + 3); o.lineTo(x, PR.y + PR.h - 3); o.stroke();
    o.fillStyle = '#ff4d4d'; o.beginPath(); o.moveTo(x - 4, PR.y + 2); o.lineTo(x + 4, PR.y + 2); o.lineTo(x, PR.y + 7); o.closePath(); o.fill();
  }
  function rows(PR, n) {
    var gap = 4, h = (PR.h - 12 - (n - 1) * gap) / n, a = [];
    for (var i = 0; i < n; i++) a.push({ y: PR.y + 6 + i * (h + gap), h: h });
    return a;
  }
  function vtrack(o, PR, y, h, clips, opt) {
    opt = opt || {};
    for (var i = 0; i < clips.length; i++) { var c = clips[i]; block(o, PR, y, h, c.t0, c.t1, c.col || SRC_COL[c.src] || '#555', c.lab || SRC_KO[c.src] || '', c.hatch, c.a); }
  }
  // 레인 패널: spec(T, t) → [{name, col, clips:[{k,t0,t1,off,g,env,col,label,hatch,block}], gaps:[[a,b]], marks:[[t,lab]], v:[clips]}]
  function lanes(spec) {
    return function (T, o, t, PR) {
      panelBg(o, PR);
      var L = typeof spec === 'function' ? spec(T, t) : spec, R = rows(PR, L.length);
      for (var i = 0; i < L.length; i++) {
        var ln = L[i], y = R[i].y, h = R[i].h;
        laneBox(o, PR, y, h, ln.name, ln.lc);
        if (ln.v) vtrack(o, PR, y, h, ln.v);
        var cl = ln.clips || [];
        for (var j = 0; j < cl.length; j++) {
          var c = cl[j];
          block(o, PR, y, h, c.t0, c.t1, c.col || 'rgba(120,170,255,.22)', c.label, c.hatch);
          if (c.k) wave(o, PR, y, h, c.k, c.t0, c.t1, c.off || 0, c.g, c.wc);
          if (c.env) envLine(o, PR, y, h, c.env, c.t0, c.t1, c.ec);
        }
        var gp = ln.gaps || [];
        for (j = 0; j < gp.length; j++) { var gx0 = PX(PR, gp[j][0]), gx1 = PX(PR, gp[j][1]); o.fillStyle = ln.gc || 'rgba(255,77,77,.28)'; o.fillRect(gx0, y + 1, gx1 - gx0, h - 2); }
        var mk2 = ln.marks || [];
        for (j = 0; j < mk2.length; j++) {
          var mx = PX(PR, mk2[j][0]);
          o.fillStyle = mk2[j][2] || '#ffd34d'; o.beginPath(); o.moveTo(mx, y + 2); o.lineTo(mx + 4, y + h / 2); o.lineTo(mx, y + h - 2); o.lineTo(mx - 4, y + h / 2); o.closePath(); o.fill();
          if (mk2[j][1]) { setFont(o, 600, uk(9), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText(mk2[j][1], mx + 6, y + h / 2 + 0.5); }
        }
      }
      if (T.R.pextra) T.R.pextra(T, o, t, PR, R);
      playhead(o, PR, t);
    };
  }
  function vOf(T) { return T.aud ? T.aud.vi : (T.R.audio && T.R.audio.v ? T.R.audio.v.length - 1 : 0); }

  /* ---------- 타일 ---------- */
  var BTN = {
    fontFamily: 'inherit', fontWeight: '600', fontSize: '12px', lineHeight: '1', padding: '6px 10px', borderRadius: '999px', cursor: 'pointer',
    background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--line)', whiteSpace: 'nowrap'
  };
  function Tile(el, R, opts) {
    var T = this;
    T.el = el; T.R = R; T.E = R.E; T.reduced = !!opts.reducedMotion; T.thumb = !!opts.thumb; T.note = opts.note || null;
    T.playing = !T.reduced && !T.thumb;
    T.t = T.playing ? 0 : (R.rep != null ? R.rep : 2.2);
    T.mem = {}; T.bufs = {}; T.ls = []; T.visible = true; T.dead = false; T.need = true; T.last = 0; T.ci = -1; T.dt = 0;
    var F = T.F = {};
    F.map = function (px, py) { var M = F.M; return [M.x + (px - F.cx) / F.cw * M.w, M.y + (py - F.cy) / F.ch * M.h]; };
    F.sc = function (v) { return v * F.M.w / F.cw; };
    T.root = mk('div', { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'hidden', background: '#0c0c0e' }, el);
    var cs = { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block' };
    T.cB = mk('canvas', cs, T.root); T.cO = mk('canvas', cs, T.root);
    T.cB.setAttribute('aria-hidden', 'true'); T.cO.setAttribute('aria-hidden', 'true');
    T.P = document.createElement('canvas');
    T.size();
    if (R.panel) {
      var ph = (R.ph || 96) * Math.min(clamp(LW / Math.max(1, el.clientWidth || LW), 1, 2.2), 1.45), vh = LH - ph - 8, vw = vh * 16 / 9;
      T.VP = { x: (LW - vw) / 2, y: 4, w: vw, h: vh }; T.PR = { x: 8, y: vh + 8, w: LW - 16, h: ph - 6 };
    } else { T.VP = { x: 0, y: 0, w: LW, h: LH }; T.PR = null; }

    var v = T.video = mk('video', { position: 'absolute', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' }, T.root);
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.setAttribute('tabindex', '-1');
    T.on(v, 'loadeddata', function () {
      T.vready = true; T.need = true;
      if (T.playing) T.tryPlay();
      else { try { v.currentTime = R.vrep != null ? R.vrep : 1.6; } catch (e) { T.seeked = true; } }
    });
    T.on(v, 'seeked', function () { T.seeked = true; T.need = true; });
    v.src = VSRC;

    if (T.reduced && !T.thumb) T.playBtn();
    if (R.audio && !T.thumb) T.audioBtns();
    if (R.akeys && !T.thumb) needAud(R.akeys).catch(noop);
    if (typeof ResizeObserver === 'function') { T.ro = new ResizeObserver(function () { T.size(); T.need = true; }); T.ro.observe(el); }
    if (typeof IntersectionObserver === 'function') {
      T.io = new IntersectionObserver(function (ents) {
        for (var j = 0; j < ents.length; j++) T.visible = ents[j].isIntersecting;
        if (T.visible) { T.need = true; T.last = 0; } else if (!T.video.paused) T.video.pause();
      });
      T.io.observe(el);
    }
    LIVE.push(T);
    T._f = function (now) { T.frame(now); };
    T.raf = requestAnimationFrame(T._f);
  }
  Tile.prototype.on = function (tg, ev, fn) { tg.addEventListener(ev, fn); this.ls.push([tg, ev, fn]); };
  Tile.prototype.size = function () {
    var w = this.el.clientWidth || 480, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.max(160, Math.round(Math.min(640, w * dpr))), ow = Math.max(240, Math.round(Math.min(1280, w * dpr)));
    if (pw === this.pw && ow === this.ow) return;
    this.pw = pw; this.ph = Math.round(pw * LH / LW); this.pk = pw / LW;
    this.ow = ow; this.oh = Math.round(ow * LH / LW); this.ok = ow / LW;
    this.cB.width = pw; this.cB.height = this.ph; this.P.width = pw; this.P.height = this.ph; this.P._k = this.pk;
    this.cO.width = ow; this.cO.height = this.oh;
    this.gB = this.cB.getContext('2d'); this.gP = this.P.getContext('2d'); this.gO = this.cO.getContext('2d');
    this.bufs = {};
  };
  Tile.prototype.buf = function (name) {
    var c = this.bufs[name];
    if (!c) { c = this.bufs[name] = mkC(this.pw, this.ph); c._x = c.getContext('2d'); c._k = this.pk; c._x.setTransform(c._k, 0, 0, c._k, 0, 0); }
    return c;
  };
  Tile.prototype.clipTo = function (c, clip, t) {
    var x = c._x; x.setTransform(c._k, 0, 0, c._k, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#000'; x.fillRect(0, 0, LW, LH); drawClip(this, x, clip, t);
  };
  Tile.prototype.img = function (k) {
    if (k === 'coffee') { if (this.hold) return this.hold; var v = this.video; return v && this.vready && v.readyState >= 2 ? v : null; }
    return STILL[k] || null;
  };
  // 청록 배경 키잉(320×180, 프레임이 바뀔 때만 다시 계산)
  Tile.prototype.keyed = function () {
    var v = this.video; if (!v || !this.vready || v.readyState < 2) return null;
    var kc = this.kc;
    if (!kc) { kc = this.kc = mkC(320, 180); kc._x = kc.getContext('2d', { willReadFrequently: true }); kc._k = 0.5; }
    var ct = v.currentTime;
    if (this.kt === ct && this.kok) return kc;
    var x = kc._x; x.clearRect(0, 0, 320, 180); x.drawImage(v, 0, 0, 320, 180);
    var im; try { im = x.getImageData(0, 0, 320, 180); } catch (e) { this.kok = false; return null; }
    var d = im.data;
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2], m = (r + b) / 2, dd = g - m;
      var k1 = (dd - 30) / 12, k2 = (g - 95) / 17;
      k1 = k1 <= 0 ? 0 : (k1 >= 1 ? 1 : k1 * k1 * (3 - 2 * k1)); k2 = k2 <= 0 ? 0 : (k2 >= 1 ? 1 : k2 * k2 * (3 - 2 * k2));
      var a = 1 - k1 * k2;
      d[i + 3] = a * 255;
      if (dd > 6) d[i + 1] = m + 6;
    }
    x.putImageData(im, 0, 0);
    this.kt = ct; this.kok = true;
    return kc;
  };
  Tile.prototype.tryPlay = function () {
    var v = this.video; if (!v || !v.paused) return;
    try { var p = v.play(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ }
  };
  Tile.prototype.syncVideo = function () {
    var v = this.video, R = this.R; if (!v || !this.vready) return;
    if (v.paused) this.tryPlay();
    var r = R.rate ? clamp(R.rate(this.t), 0.25, 4) : 1;
    if (Math.abs((v._r || 1) - r) > 0.02) { v._r = r; try { v.playbackRate = r; } catch (e) { /* ignore */ } }
    var ci = clipIdx(this.E.clips, this.t);
    if (ci !== this.ci) { var c = this.E.clips[ci]; this.ci = ci; if (c.seek != null) { try { v.currentTime = c.seek; } catch (e) { /* ignore */ } } }
  };
  Tile.prototype.frame = function (now) {
    var T = this; if (T.dead) return;
    T.raf = requestAnimationFrame(T._f);
    if (!T.visible) { if (T.video && !T.video.paused) T.video.pause(); T.last = 0; return; }
    var moving = T.playing || !!T.aud;
    if (moving) {
      if (T.last && now - T.last < 30) return;
      var dt = T.last ? Math.min(0.1, (now - T.last) / 1000) : 0; T.last = now;
      if (T.aud) {
        var at = T.aud.ac.currentTime - T.aud.T0;
        T.t = clamp(at, 0, DUR - 0.001);
        if (at > T.aud.len) T.stopAudio();
      } else T.t = (T.t + dt) % DUR;
      T.dt = dt;
      T.syncVideo();
    } else {
      if (T.video && !T.video.paused) T.video.pause();
      if (!T.need) return;
      T.dt = 0;
    }
    T.need = false;
    try { T.draw(); } catch (e) { if (!T.err) { T.err = true; if (window.console) console.warn('[r-editing]', e); } }
    if (T.thumb && T.complete()) T.finishThumb();
  };
  Tile.prototype.complete = function () {
    var n = 0; for (var k in STILL) if (STILL[k]) n++;
    return this.vready && this.seeked && n >= 4 && fontsReady;
  };
  Tile.prototype.finishThumb = function () {
    cancelAnimationFrame(this.raf); this.raf = 0;
    var v = this.video; try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ }
  };
  Tile.prototype.draw = function () {
    var T = this, R = T.R, t = T.t, g = T.gP;
    g.setTransform(T.pk, 0, 0, T.pk, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, LW, LH);
    if (R.pre) for (var a = 0; a < R.pre.length; a++) R.pre[a](T, g, t);
    drawProgram(T, g, t);
    for (var i = 0; i < R.fx.length; i++) { g.save(); R.fx[i](T, g, t); g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    compose(T, t);
    overlay(T, t);
  };
  Tile.prototype.playBtn = function () {
    var T = this, b = T.btn = mk('button', Object.assign({ position: 'absolute', zIndex: '6', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', padding: '9px 14px', fontSize: '13px' }, BTN), T.root);
    b.style.position = 'absolute'; b.style.left = '50%'; b.style.top = '50%'; b.style.transform = 'translate(-50%,-50%)'; b.style.padding = '9px 14px';
    b.type = 'button'; b.textContent = '▶ 재생'; b.setAttribute('aria-label', '재생');
    T.on(b, 'click', function (ev) {
      ev.stopPropagation();
      T.playing = !T.playing;
      b.textContent = T.playing ? '❚❚' : '▶ 재생';
      b.setAttribute('aria-label', T.playing ? '일시정지' : '재생');
      css(b, T.playing ? { left: '8px', top: 'auto', bottom: '8px', transform: 'none', padding: '6px 9px' } : { left: '50%', top: '50%', bottom: 'auto', transform: 'translate(-50%,-50%)', padding: '9px 14px' });
      if (T.playing) { T.last = 0; T.tryPlay(); } else T.video.pause();
      T.need = true;
    });
  };
  Tile.prototype.audioBtns = function () {
    var T = this, A = T.R.audio, box = mk('div', { position: 'absolute', right: '8px', top: '8px', zIndex: '6', display: 'flex', gap: '6px' }, T.root);
    var labels = A.v || ['소리'];
    T.abtn = [];
    labels.forEach(function (lb, i) {
      var b = mk('button', BTN, box);
      b.type = 'button'; b._lb = lb; b.textContent = '▶ ' + lb; b.setAttribute('aria-label', lb + ' 소리 듣기');
      T.on(b, 'click', function (ev) { ev.stopPropagation(); if (T.aud && T.aud.vi === i) T.stopAudio(); else T.playAudio(i); });
      T.abtn.push(b);
    });
  };
  Tile.prototype.setBtns = function (pend) {
    var a = this.abtn; if (!a) return;
    for (var i = 0; i < a.length; i++) {
      var on = this.aud && this.aud.vi === i;
      a[i].textContent = pend === i ? '…' : (on ? '■ 정지' : '▶ ' + a[i]._lb);
      a[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };
  Tile.prototype.playAudio = function (vi) {
    var T = this, A = T.R.audio, ac = null;
    try { ac = PD.sound && PD.sound.ctx ? PD.sound.ctx() : null; } catch (e) { ac = null; }
    if (!ac) return;
    T.stopAudio();
    var tok = T.atok = (T.atok || 0) + 1;
    T.setBtns(vi);
    needAud(A.keys).then(function () {
      if (T.dead || tok !== T.atok) return;
      var outG = ac.createGain(); outG.gain.value = A.vol || 0.9; outG.connect(ac.destination);
      var M = new Mixer(ac, outG, ac.currentTime + 0.08);
      try { A.mix(M, vi, ac); } catch (e) { M.stop(); try { outG.disconnect(); } catch (e2) { /* ignore */ } T.setBtns(); return; }
      M.node(outG);
      var stopFn = function () { T.stopAudio(true); };
      T.aud = { ac: ac, T0: M.T0, M: M, vi: vi, len: A.len || DUR, stopFn: stopFn };
      if (PD.sound && PD.sound.claim) PD.sound.claim(stopFn);
      T.t = 0; T.last = 0; T.ci = -1; T.mem = {};
      T.setBtns();
    }).catch(function () { if (tok === T.atok) T.setBtns(); });
  };
  Tile.prototype.stopAudio = function (fromClaim) {
    var a = this.aud; this.atok = (this.atok || 0) + 1;
    if (!a) { this.setBtns(); return; }
    this.aud = null;
    a.M.stop();
    if (!fromClaim && PD.sound && PD.sound.release) { try { PD.sound.release(a.stopFn); } catch (e) { /* ignore */ } }
    this.setBtns();
    this.need = true;
  };
  Tile.prototype.destroy = function () {
    var T = this; if (T.dead) return;
    T.stopAudio(); T.dead = true;
    if (T.raf) cancelAnimationFrame(T.raf);
    for (var i = 0; i < T.ls.length; i++) { try { T.ls[i][0].removeEventListener(T.ls[i][1], T.ls[i][2]); } catch (e) { /* ignore */ } }
    T.ls = [];
    if (T.ro) T.ro.disconnect(); if (T.io) T.io.disconnect();
    var v = T.video; if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } }
    var k = LIVE.indexOf(T); if (k >= 0) LIVE.splice(k, 1);
    T.bufs = {}; T.hold = null; T.kc = null;
    if (T.root && T.root.parentNode) T.root.parentNode.removeChild(T.root);
  };

  function overlay(T, t) {
    var o = T.gO, R = T.R, F = T.F, VP = T.VP;
    UIK = clamp(LW / Math.max(1, T.el.clientWidth || LW), 1, 2.2); setPL();
    o.setTransform(T.ok, 0, 0, T.ok, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, LW, LH);
    o.save(); o.beginPath(); o.rect(VP.x, VP.y, VP.w, VP.h); o.clip();
    if (R.capFirst) R.capFirst(T, o, t, F);
    if (R.cap && CAPST[R.cap]) { o.save(); CAPST[R.cap](T, o, t, F.FR, F); o.restore(); }
    for (var i = 0; i < R.ov.length; i++) { o.save(); R.ov[i](T, o, t, F); o.restore(); o.globalAlpha = 1; }
    if (F.border) {
      var fr = F.FR; o.strokeStyle = 'rgba(255,255,255,.95)'; o.lineWidth = 1.5; o.strokeRect(fr.x + 0.75, fr.y + 0.75, fr.w - 1.5, fr.h - 1.5);
      chip(o, F.border, fr.x + fr.w / 2, fr.y + 6, { center: true });
    }
    if (F.guide) {
      var gp = F.map(F.guide[0], F.guide[1]), gq = F.map(F.guide[0] + F.guide[2], F.guide[1] + F.guide[3]);
      o.setLineDash([6, 4]); o.strokeStyle = '#fff'; o.lineWidth = 1.5; o.strokeRect(gp[0], gp[1], gq[0] - gp[0], gq[1] - gp[1]); o.setLineDash([]);
      chip(o, '크롭 영역', gp[0] + 4, gp[1] + 4);
    }
    if (F.halves) {
      var mx = VP.x + VP.w / 2; o.fillStyle = 'rgba(255,255,255,.9)'; o.fillRect(mx - 1, VP.y, 2, VP.h);
      chip(o, F.halves[0], mx - 8, VP.y + 8, { right: true }); chip(o, F.halves[1], mx + 8, VP.y + 8);
    }
    if (F.splitX != null && R.split) {
      var d = F.splitD, sx = F.splitX;
      if (sx > d[0] + 1 && sx < d[0] + d[2] - 1) { o.fillStyle = 'rgba(255,255,255,.92)'; o.fillRect(sx - 1, d[1], 2, d[3]); }
      var lb = R.splitL || ['원본', '보정'];
      if (sx > d[0] + 50) chip(o, lb[0], sx - 8, d[1] + d[3] - 8, { right: true, up: true });
      if (sx < d[0] + d[2] - 50) chip(o, lb[1], sx + 8, d[1] + d[3] - 8, { up: true });
    }
    if (R.chip) { var ct = typeof R.chip === 'function' ? R.chip(t, T) : R.chip; if (ct) chip(o, ct, VP.x + 8, VP.y + 8); }
    if (T.note) chip(o, T.note, VP.x + 8, VP.y + VP.h - 8, { up: true });
    o.restore();
    if (R.panel && T.PR) { o.save(); R.panel(T, o, t, T.PR); o.restore(); }
  }

  /* ---------- 자막 스타일 ---------- */
  var EMOJI_F = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  function cAlpha(t, a, b, f) { f = f || 0.08; return clamp(Math.min((t - a) / f, (b - t) / f), 0, 1); }
  function burnSt(size, extra) {
    var s = { size: size, w: 700, font: FF.nk, fill: '#fff', stroke: 'rgba(0,0,0,.85)', sw: size * 0.19, shadow: 'rgba(0,0,0,.55)', sb: size * 0.35 };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }
  function burnLines(o, lines, R, yf, opt) {
    opt = opt || {};
    var base = opt.size || R.h * 0.058, size = base, i, w = opt.w || 700, fam = opt.font || FF.nk;
    for (i = 0; i < lines.length; i++) size = Math.min(size, fit(o, lines[i], base, R.w * 0.86, w, fam));
    var lh = size * 1.34, y = R.y + R.h * (yf || 0.885) - (lines.length - 1) * lh;
    for (i = 0; i < lines.length; i++) {
      var st = burnSt(size, opt.st); st.w = w; st.font = fam; st.alpha = opt.alpha;
      if (opt.cols && opt.cols[i]) st.fill = opt.cols[i];
      txt(o, lines[i], R.x + R.w / 2, y + i * lh, st);
    }
    return { size: size, y: y, lh: lh };
  }
  function popS(t, t0, d) { var u = (t - t0) / (d || 0.16); return u >= 1 ? 1 : lerp(0.55, 1, back(u)); }
  function fmtTC(s) {
    var ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60, r = ms % 1000;
    function p(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
    return p(h, 2) + ':' + p(m, 2) + ':' + p(ss, 2) + ',' + p(r, 3);
  }
  var CAP2 = [['아침을 깨우는', '따뜻한 한 잔'], ['직접 볶은 원두로', '매일 내려요'], ['매일 아침 7시에', '문을 열어요'], ['모닝빈에서', '만나요']];
  var DIAL = [
    ['- 아침 첫 잔 드릴까요?', '- 네, 라떼로 주세요'], ['- 원두는 직접 볶았어요', '- 향이 정말 좋네요'],
    ['- 매일 7시에 열어요', '- 내일 또 올게요'], ['- 모닝빈에서 만나요', '- 잘 마실게요!']
  ];
  var YN = [
    { t0: 0.5, t1: 2.9, s: '(김 모락모락~)', x: 0.7, y: 0.2, col: '#ff8fb8', r: -0.05 },
    { t0: 3.0, t1: 4.9, s: '향 미쳤다...✨', x: 0.27, y: 0.26, col: '#ffe066', r: 0.04 },
    { t0: 5.3, t1: 7.9, s: '컵까지 예쁨 주의', x: 0.66, y: 0.3, col: '#7fd3ff', r: -0.04 },
    { t0: 8.5, t1: 11.6, s: '오늘도 출근 성공!', x: 0.5, y: 0.17, col: '#8ef0b8', r: 0.03 }
  ];
  var SFXW = [
    { t0: 0.7, t1: 3.4, s: '모락모락~', x: 0.5, y: 0.17, col: '#ffffff', oc: '#2b7bd8', font: 'jua', sz: 0.085, wob: 1 },
    { t0: 4.92, t1: 6.6, s: '두둥!', x: 0.5, y: 0.42, col: 'grad', oc: '#c3121c', font: 'hz', sz: 0.21, shake: 1 },
    { t0: 6.7, t1: 7.95, s: '반짝✨', x: 0.62, y: 0.33, col: '#fff7a8', oc: '#d08a00', font: 'jua', sz: 0.09 },
    { t0: 8.1, t1: 9.7, s: '스윽~', x: 0.28, y: 0.3, col: '#ffffff', oc: '#6a3fd8', font: 'jua', sz: 0.085, slide: 1 },
    { t0: 10.0, t1: 11.8, s: '꿀꺽', x: 0.7, y: 0.26, col: '#ffd0a0', oc: '#7a3a12', font: 'hz', sz: 0.12, shake: 0.4 }
  ];
  var BUB = [
    { t0: 0.6, t1: 4.6, s: '따뜻할 때 마셔요!', bx: 0.78, by: 0.17, ax: 0.6, ay: 0.3 },
    { t0: 5.3, t1: 7.85, s: '저도 데려가요!', bx: 0.6, by: 0.26, ax: 0.36, ay: 0.55 },
    { t0: 8.5, t1: 11.6, s: '내일 7시에 또 봐요', bx: 0.24, by: 0.16, ax: 0.38, ay: 0.32 }
  ];
  var SIT = [
    { t0: 0.3, t1: 4.85, tag: '상황', s: '오전 6시 50분, 오픈 10분 전' },
    { t0: 5.15, t1: 7.85, tag: '등장', s: '오늘의 머그, 출근 완료' },
    { t0: 8.15, t1: 11.8, tag: '드디어', s: '오늘의 첫 잔이 나왔어요' }
  ];
  var LT = [
    { t0: 0.6, t1: 4.7, a: '모닝빈 성수점', b: '로스터리 카페 · 매일 아침 7시 오픈' },
    { t0: 8.4, t1: 11.7, a: '김하나 바리스타', b: '모닝빈 헤드 로스터' }
  ];
  function wordsLayout(o, words, size, w, fam) {
    setFont(o, w, size, fam);
    var sp = o.measureText(' ').width, xs = [], x = 0;
    for (var i = 0; i < words.length; i++) { var ww = o.measureText(words[i]).width; xs.push([x, ww]); x += ww + sp; }
    return { xs: xs, W: x - sp };
  }
  function bubble(o, x, y, w, h, tx, ty, fill, line) {
    var r = Math.min(14, h / 2);
    o.beginPath();
    o.moveTo(x + r, y); o.lineTo(x + w - r, y); o.quadraticCurveTo(x + w, y, x + w, y + r); o.lineTo(x + w, y + h - r); o.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    var bx = clamp(tx, x + r + 8, x + w - r - 8), tail = tx < x + w / 2 ? -1 : 1;
    o.lineTo(bx + 9, y + h); o.lineTo(tx, ty); o.lineTo(bx - 3 * tail - 6, y + h);
    o.lineTo(x + r, y + h); o.quadraticCurveTo(x, y + h, x, y + h - r); o.lineTo(x, y + r); o.quadraticCurveTo(x, y, x + r, y); o.closePath();
    o.fillStyle = fill || '#fff'; o.shadowColor = 'rgba(0,0,0,.35)'; o.shadowBlur = 8; o.shadowOffsetY = 2; o.fill();
    o.shadowColor = 'transparent'; o.shadowBlur = 0; o.shadowOffsetY = 0;
    if (line) { o.strokeStyle = line; o.lineWidth = 2; o.stroke(); }
  }

  var CAPST = {
    burn: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      burnLines(o, [c.text], R, 0.885, { alpha: cAlpha(t, c.t0, c.t1) });
    },
    cc: function (T, o, t, R) {
      var c = capAt(t), i = c ? CAPS.indexOf(c) : -1;
      if (c) {
        var size = fit(o, c.text, R.h * 0.054, R.w * 0.82, 500, FF.nk), w = tw(o, c.text, 500, size, FF.nk), y = R.y + R.h * 0.86;
        o.fillStyle = 'rgba(8,8,8,.78)'; o.fillRect(R.x + R.w / 2 - w / 2 - size * 0.4, y - size * 1.0, w + size * 0.8, size * 1.42);
        txt(o, c.text, R.x + R.w / 2, y, { size: size, w: 500, font: FF.nk, fill: '#fff' });
      }
      // CC 켜짐 표시
      var K = Math.min(UIK, 1.8);
      uiAt(o, R.x + R.w, R.y, K, function () {
      var bx = R.x + R.w - 36, by = R.y + 8;
      o.fillStyle = '#fff'; rr(o, bx, by, 28, 18, 3); o.fill();
      setFont(o, 800, uk(11), FF.ui); o.fillStyle = '#111'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('CC', bx + 14, by + 9.5);
      o.fillStyle = '#ff2b2b'; o.fillRect(bx + 3, by + 20, 22, 2.5);
      });
      // SRT 파일 미리보기
      uiAt(o, R.x, R.y, Math.min(K, R.w * 0.62 / 190), function () {
      var cue = c || CAPS[0], n = c ? i + 1 : 1, px = R.x + 10, py = R.y + 34, lines = [String(n), fmtTC(cue.t0) + ' --> ' + fmtTC(cue.t1), cue.text];
      setFont(o, 500, uk(9.5), FF.mono);
      var mw = 0; for (var j = 0; j < lines.length; j++) mw = Math.max(mw, o.measureText(lines[j]).width);
      o.fillStyle = 'rgba(18,18,22,.86)'; rr(o, px, py, mw + 16, 64, 6); o.fill();
      setFont(o, 600, uk(9), FF.ui); o.fillStyle = '#9aa0ff'; o.textAlign = 'left'; o.textBaseline = 'top'; o.fillText('cafe-short.ko.srt', px + 8, py + 6);
      setFont(o, 500, uk(9.5), FF.mono);
      for (j = 0; j < lines.length; j++) { o.fillStyle = j === 1 ? '#8fd18f' : '#e8e8ee'; o.fillText(lines[j], px + 8, py + 20 + j * 13); }
      });
    },
    auto: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      var ERR = { '볶은': '보끈', '모닝빈에서': '모닝 빈에서' };
      var shown = [], i;
      for (i = 0; i < c.words.length; i++) if (t >= c.words[i].t0 - 0.05) shown.push(c.words[i]);
      if (!shown.length) return;
      var disp = shown.map(function (w) { return ERR[w.w] || w.w; });
      var size = fit(o, c.text + ' ', R.h * 0.058, R.w * 0.84, 700, FF.nk), L = wordsLayout(o, disp, size, 700, FF.nk);
      var full2 = wordsLayout(o, c.words.map(function (w) { return ERR[w.w] || w.w; }), size, 700, FF.nk);
      var x0 = R.x + R.w / 2 - full2.W / 2, y = R.y + R.h * 0.885;
      for (i = 0; i < shown.length; i++) {
        var w = shown[i], a = clamp((t - w.t0 + 0.05) / 0.12, 0, 1) * cAlpha(t, c.t0, c.t1);
        txt(o, disp[i], x0 + L.xs[i][0], y, burnSt(size, { align: 'left', alpha: a, fill: t < w.t1 ? '#e6e6e6' : '#fff' }));
        if (ERR[w.w]) {
          var ux = x0 + L.xs[i][0], uw = L.xs[i][1], uy = y + size * 0.28;
          o.strokeStyle = '#ff4d4d'; o.lineWidth = 1.6; o.beginPath();
          for (var q = 0; q <= uw; q += 2) { var yy = uy + Math.sin(q * 0.9) * 1.6; if (q === 0) o.moveTo(ux + q, yy); else o.lineTo(ux + q, yy); }
          o.stroke();
          if (t > w.t1 + 0.25) {
            var tg = '수정 → ' + w.w, ts = Math.max(9, size * 0.5);
            setFont(o, 700, ts, FF.ui); var gw = o.measureText(tg).width + 12;
            var gx = clamp(ux + uw / 2 - gw / 2, R.x + 4, R.x + R.w - gw - 4), gy = y - size * 1.25 - ts - 8;
            o.fillStyle = '#ffd43b'; rr(o, gx, gy, gw, ts + 8, 4); o.fill();
            o.fillStyle = '#1a1a1a'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText(tg, gx + 6, gy + ts / 2 + 4.5);
          }
        }
      }
    },
    karaoke: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      var ws = c.words.map(function (w) { return w.w; }), size = fit(o, c.text, R.h * 0.07, R.w * 0.86, 900, FF.nk), L = wordsLayout(o, ws, size, 900, FF.nk);
      var x0 = R.x + R.w / 2 - L.W / 2, y = R.y + R.h * 0.87, a = cAlpha(t, c.t0, c.t1), px = x0;
      for (var i = 0; i < c.words.length; i++) {
        var w = c.words[i];
        if (t >= w.t1) px = x0 + L.xs[i][0] + L.xs[i][1];
        else if (t >= w.t0) px = x0 + L.xs[i][0] + L.xs[i][1] * eio((t - w.t0) / (w.t1 - w.t0));
      }
      txt(o, c.text, x0, y, burnSt(size, { w: 900, align: 'left', alpha: a, sw: size * 0.22 }));
      o.save(); o.beginPath(); o.rect(x0 - 4, y - size * 1.3, px - x0 + 4, size * 1.8); o.clip();
      txt(o, c.text, x0, y, { size: size, w: 900, font: FF.nk, align: 'left', fill: '#ffd400', stroke: '#000', sw: size * 0.22, alpha: a });
      o.restore();
    },
    hormozi: function (T, o, t, R) {
      var k = chunkAt(t); if (!k) return;
      var ci = CAPS.indexOf(k.c), keyCol = ci % 2 ? '#3df07a' : '#ffe14a';
      var size = fit(o, k.k.w, R.h * 0.13, R.w * 0.86, 400, FF.hz), s = popS(t, k.k.t0, 0.17), x = R.x + R.w / 2, y = R.y + R.h * 0.7;
      o.save(); o.translate(x, y); o.scale(s, s); if (k.k.key) o.rotate(-0.035);
      txt(o, k.k.w, 0, 0, { size: size, w: 400, font: FF.hz, fill: k.k.key ? keyCol : '#fff', stroke: '#000', sw: size * 0.24, shadow: 'rgba(0,0,0,.6)', sb: size * 0.25, sy: size * 0.08, base: 'middle' });
      o.restore();
    },
    oneword: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      for (var i = 0; i < c.words.length; i++) {
        var w = c.words[i]; if (t < w.t0 || t >= w.t1 + (i === c.words.length - 1 ? 0.35 : 0)) continue;
        var isKey = c.key.indexOf(w.w) >= 0, size = fit(o, w.w, R.h * 0.17, R.w * 0.84, 400, FF.dh), s = popS(t, w.t0, 0.14);
        o.save(); o.translate(R.x + R.w / 2, R.y + R.h * 0.56); o.scale(s, s);
        txt(o, w.w, 0, 0, { size: size, w: 400, font: FF.dh, fill: isKey ? '#ffd400' : '#fff', stroke: '#111', sw: size * 0.2, shadow: 'rgba(0,0,0,.5)', base: 'middle' });
        o.restore();
        break;
      }
    },
    emoji: function (T, o, t, R) {
      var k = chunkAt(t); if (!k) return;
      var size = fit(o, k.k.w, R.h * 0.11, R.w * 0.84, 400, FF.jua), s = popS(t, k.k.t0, 0.16), x = R.x + R.w / 2, y = R.y + R.h * 0.74;
      o.save(); o.translate(x, y); o.scale(s, s);
      txt(o, k.k.w, 0, 0, { size: size, w: 400, font: FF.jua, fill: k.k.key ? '#ffe14a' : '#fff', stroke: '#2a1640', sw: size * 0.22, shadow: 'rgba(0,0,0,.45)', base: 'middle' });
      o.restore();
      var c = k.c, keyT = c.cks[c.cks.length - 1].t0, es = popS(t, keyT, 0.22), bob = Math.sin(t * 6) * 3;
      if (t >= keyT) {
        o.save(); o.translate(x, y - size * 1.25 + bob); o.scale(es, es); o.rotate(Math.sin(t * 4) * 0.12);
        o.font = (R.h * 0.13).toFixed(1) + 'px ' + EMOJI_F; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff'; o.fillText(c.emoji, 0, 0);
        o.restore();
      }
    },
    lower3: function (T, o, t, R) {
      for (var i = 0; i < LT.length; i++) {
        var L = LT[i]; if (t < L.t0 || t > L.t1) continue;
        var inn = eout((t - L.t0) / 0.5), outp = ein((t - (L.t1 - 0.4)) / 0.4), p = inn * (1 - outp);
        var x = R.x + R.w * 0.055, y = R.y + R.h * 0.7, s1 = R.h * 0.058, s2 = R.h * 0.036;
        var w1 = tw(o, L.a, 900, s1, FF.nk), w2 = tw(o, L.b, 500, s2, FF.nk), bw = Math.max(w1, w2) + s1 * 1.2, bh = s1 * 1.35 + s2 * 1.75;
        o.fillStyle = '#ffb020'; o.fillRect(x, y, 5, bh * eout((t - L.t0) / 0.3) * (1 - outp));
        o.save(); o.beginPath(); o.rect(x + 5, y - 2, bw * p, bh + 4); o.clip();
        o.fillStyle = 'rgba(255,255,255,.96)'; o.fillRect(x + 5, y, bw, s1 * 1.35);
        o.fillStyle = 'rgba(20,20,24,.86)'; o.fillRect(x + 5, y + s1 * 1.35, bw * 0.92, s2 * 1.75);
        var ty = (1 - eout((t - L.t0 - 0.15) / 0.4)) * 8;
        txt(o, L.a, x + 5 + s1 * 0.5, y + s1 * 1.02 + ty, { size: s1, w: 900, font: FF.nk, fill: '#141414', align: 'left' });
        txt(o, L.b, x + 5 + s1 * 0.5, y + s1 * 1.35 + s2 * 1.22 + ty, { size: s2, w: 500, font: FF.nk, fill: '#f2f2f2', align: 'left' });
        o.restore();
      }
    },
    kinetic: function (T, o, t, R) {
      var c = capAt(t) || (t >= 11.6 ? CAPS[3] : null); if (!c) return;
      var outp = ein((t - (c.t1 - 0.3)) / 0.3);
      o.fillStyle = 'rgba(0,0,0,' + (0.5).toFixed(2) + ')'; o.fillRect(R.x, R.y, R.w, R.h);
      var ws = c.words, n = ws.length, sizes = [], hs = 0, i;
      for (i = 0; i < n; i++) { var key = c.key.indexOf(ws[i].w) >= 0; sizes.push(fit(o, ws[i].w, R.h * (key ? 0.2 : 0.115), R.w * 0.8, 400, FF.hz)); hs += sizes[i] * 1.02; }
      var y = R.y + R.h / 2 - hs / 2 - (outp * R.h * 0.12);
      for (i = 0; i < n; i++) {
        var w = ws[i], sz = sizes[i]; y += sz * 1.02;
        if (t < w.t0) continue;
        var u = eout((t - w.t0) / 0.32), kind = (i + CAPS.indexOf(c)) % 4, dx = 0, dy = 0, sc = 1, rot = 0;
        if (kind === 0) dx = -(1 - u) * R.w * 0.6; else if (kind === 1) dy = -(1 - u) * R.h * 0.4; else if (kind === 2) sc = lerp(2.2, 1, u); else { dx = (1 - u) * R.w * 0.6; rot = (1 - u) * 0.4; }
        var keyW = c.key.indexOf(w.w) >= 0;
        o.save(); o.globalAlpha = clamp(u * 1.4, 0, 1) * (1 - outp); o.translate(R.x + R.w / 2 + dx, y - sz * 0.38 + dy); o.rotate(rot); o.scale(sc, sc);
        txt(o, w.w, 0, 0, { size: sz, w: 400, font: FF.hz, fill: keyW ? '#ffcf3a' : '#fff', base: 'middle', alpha: o.globalAlpha });
        o.restore();
      }
    },
    yeneung: function (T, o, t, R, F) {
      for (var i = 0; i < YN.length; i++) {
        var Y = YN[i]; if (t < Y.t0 || t > Y.t1) continue;
        var p = F.map(Y.x * LW, Y.y * LH), size = fit(o, Y.s, R.h * 0.075, R.w * 0.6, 400, FF.jua), s = popS(t, Y.t0, 0.22) * (1 - ein((t - Y.t1 + 0.15) / 0.15) * 0.4);
        o.save(); o.translate(clamp(p[0], R.x + R.w * 0.2, R.x + R.w * 0.8), p[1] + Math.sin(t * 5 + i) * 2.5); o.rotate(Y.r); o.scale(s, s);
        txt(o, Y.s, 0, 0, { size: size, w: 400, font: FF.jua, fill: Y.col, stroke: '#fff', sw: size * 0.3, stroke2: 'rgba(70,35,45,.9)', sw2: size * 0.52, shadow: 'rgba(0,0,0,.35)', base: 'middle' });
        o.restore();
      }
    },
    effect: function (T, o, t, R, F) {
      for (var i = 0; i < SFXW.length; i++) {
        var W = SFXW[i]; if (t < W.t0 || t > W.t1) continue;
        var fam = W.font === 'hz' ? FF.hz : FF.jua, size = fit(o, W.s, R.h * W.sz, R.w * 0.8, 400, fam), p = F.map(W.x * LW, W.y * LH);
        var s = popS(t, W.t0, 0.2), dx = 0, dy = 0, rot = 0, a = cAlpha(t, W.t0, W.t1, 0.12);
        if (W.shake) { var dec = Math.exp(-(t - W.t0) * 3) * W.shake; dx = (hash(Math.floor(t * 30)) - 0.5) * 16 * dec; dy = (hash(Math.floor(t * 30) + 9) - 0.5) * 12 * dec; }
        if (W.wob) { rot = Math.sin(t * 7) * 0.06; dy += Math.sin(t * 5) * 3; }
        if (W.slide) dx -= (1 - eout((t - W.t0) / 0.4)) * 60;
        var fill = W.col;
        if (W.col === 'grad') { var gr = o.createLinearGradient(0, -size * 0.6, 0, size * 0.4); gr.addColorStop(0, '#fff36b'); gr.addColorStop(1, '#ff8a00'); fill = gr; }
        o.save(); o.translate(clamp(p[0], R.x + R.w * 0.15, R.x + R.w * 0.85) + dx, p[1] + dy); o.rotate(rot); o.scale(s, s);
        txt(o, W.s, 0, 0, { size: size, w: 400, font: fam, fill: fill, stroke: '#fff', sw: size * 0.16, stroke2: W.oc, sw2: size * 0.36, shadow: 'rgba(0,0,0,.4)', base: 'middle', alpha: a });
        o.restore();
      }
    },
    bubble: function (T, o, t, R, F) {
      for (var i = 0; i < BUB.length; i++) {
        var B = BUB[i]; if (t < B.t0 || t > B.t1) continue;
        var size = R.h * 0.052, p = F.map(B.bx * LW, B.by * LH), a = F.map(B.ax * LW, B.ay * LH), s = popS(t, B.t0, 0.22), w = tw(o, B.s, 400, size, FF.jua) + size * 1.4, h = size * 1.9;
        if (w > R.w * 0.9) { size *= R.w * 0.9 / w; w = R.w * 0.9; h = size * 1.9; }
        var bx = clamp(p[0] - w / 2, R.x + 6, R.x + R.w - w - 6), by = clamp(p[1] - h / 2, R.y + 6, R.y + R.h - h - 30);
        o.save(); o.globalAlpha = cAlpha(t, B.t0, B.t1, 0.1);
        o.translate(bx + w / 2, by + h); o.scale(s, s); o.translate(-(bx + w / 2), -(by + h));
        bubble(o, bx, by, w, h, a[0], a[1], '#fff', '#1b1b1b');
        txt(o, B.s, bx + w / 2, by + h / 2 + 1, { size: size, w: 400, font: FF.jua, fill: '#1b1b1b', base: 'middle' });
        o.restore();
      }
    },
    situation: function (T, o, t, R) {
      for (var i = 0; i < SIT.length; i++) {
        var S = SIT[i]; if (t < S.t0 || t > S.t1) continue;
        var size = Math.min(R.h * 0.05, R.w * 0.045), p = eout((t - S.t0) / 0.35), q = ein((t - S.t1 + 0.25) / 0.25);
        var tw1 = tw(o, S.tag, 400, size, FF.jua) + size * 0.9, tw2 = tw(o, S.s, 400, size, FF.jua) + size * 1.1, h = size * 1.75;
        var x = R.x + R.w * 0.04 - (1 - p) * 40, y = R.y + R.h * 0.06;
        o.save(); o.globalAlpha = p * (1 - q);
        o.shadowColor = 'rgba(0,0,0,.3)'; o.shadowBlur = 6; o.shadowOffsetY = 2;
        o.fillStyle = '#fff'; rr(o, x, y, tw1 + tw2, h, 5); o.fill();
        o.shadowColor = 'transparent';
        o.fillStyle = '#ff5a5f'; rr(o, x, y, tw1, h, 5); o.fill(); o.fillRect(x + tw1 - 6, y, 6, h);
        txt(o, S.tag, x + tw1 / 2, y + h / 2 + 1, { size: size, w: 400, font: FF.jua, fill: '#fff', base: 'middle', alpha: p * (1 - q) });
        txt(o, S.s, x + tw1 + tw2 / 2, y + h / 2 + 1, { size: size, w: 400, font: FF.jua, fill: '#232323', base: 'middle', alpha: p * (1 - q) });
        o.restore();
      }
    },
    safe: function (T, o, t, R) {
      var boxes = [[0.93, '액션 세이프 93%', 'rgba(255,255,255,.55)'], [0.9, '타이틀 세이프 90%', '#ffd34d']];
      for (var i = 0; i < boxes.length; i++) {
        var k = boxes[i][0], w = R.w * k, h = R.h * k, x = R.x + (R.w - w) / 2, y = R.y + (R.h - h) / 2;
        o.setLineDash([5, 4]); o.strokeStyle = boxes[i][2]; o.lineWidth = 1.2; o.strokeRect(x, y, w, h); o.setLineDash([]);
        setFont(o, 600, uk(9), FF.ui); o.fillStyle = boxes[i][2]; o.textAlign = 'right'; o.textBaseline = i ? 'top' : 'bottom'; o.fillText(boxes[i][1], x + w - 4, i ? y + 4 : y - 2);
      }
      var tx = R.x + R.w * 0.05 + 6, ty = R.y + R.h * 0.05 + 6;
      txt(o, 'MORNING BEAN', tx, ty + R.h * 0.07, { size: R.h * 0.07, w: 400, font: FF.hz, fill: '#fff', align: 'left', shadow: 'rgba(0,0,0,.5)' });
      var c = capAt(t); if (c) burnLines(o, [c.text], R, 0.875, { alpha: cAlpha(t, c.t0, c.t1) });
    },
    cpl: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      var L = CAP2[CAPS.indexOf(c)], m = burnLines(o, L, R, 0.88, { alpha: cAlpha(t, c.t0, c.t1) });
      for (var i = 0; i < L.length; i++) {
        var n = Array.from(L[i]).length, w = tw(o, L[i], 700, m.size, FF.nk), x = R.x + R.w / 2 + w / 2 + 8, y = m.y + i * m.lh - m.size * 0.75;
        chip(o, n + '자', Math.min(x, R.x + R.w - 40), y, { bg: n <= 16 ? 'rgba(46,160,90,.92)' : 'rgba(220,60,60,.92)', size: 9.5 });
      }
      chip(o, '줄당 16자 · 최대 2줄', R.x + R.w - 8, R.y + 8, { right: true });
    },
    cps: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      var m = burnLines(o, [c.text], R, 0.885, { alpha: cAlpha(t, c.t0, c.t1) });
      var n = Array.from(c.text.replace(/ /g, '')).length, d = c.t1 - c.t0, cps = n / d;
      uiAt(o, R.x + R.w, R.y, Math.min(UIK, 1.8, R.w * 0.6 / 160), function () {
      var x = R.x + R.w - 150, y = R.y + 10, w = 138;
      o.fillStyle = 'rgba(0,0,0,.62)'; rr(o, x - 6, y - 4, w + 12, 44, 6); o.fill();
      setFont(o, 700, uk(11), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'left'; o.textBaseline = 'top';
      o.fillText(cps.toFixed(1) + '자/초', x, y);
      setFont(o, 500, uk(9), FF.ui); o.fillStyle = '#c8c8d0'; o.fillText(n + '자 · ' + d.toFixed(1) + '초 · 기준 12자', x + 52, y + 2);
      var by = y + 22, max = 16;
      o.fillStyle = 'rgba(255,255,255,.18)'; o.fillRect(x, by, w, 8);
      o.fillStyle = 'rgba(70,200,120,.55)'; o.fillRect(x, by, w * 12 / max, 8);
      o.fillStyle = 'rgba(230,70,70,.55)'; o.fillRect(x + w * 12 / max, by, w * 4 / max, 8);
      var nx = x + w * clamp(cps / max, 0, 1); o.fillStyle = '#fff'; o.fillRect(nx - 1.5, by - 3, 3, 14);
      });
      void m;
    },
    linebreak: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      burnLines(o, CAP2[CAPS.indexOf(c)], R, 0.88, { alpha: cAlpha(t, c.t0, c.t1) });
      var bad = [['아침을 깨우는 따뜻한', '한 잔.'], ['직접 볶은 원두로 매일', '내려요.'], ['매일 아침 7시에 문을', '열어요.'], ['모닝빈에서 만', '나요.']][CAPS.indexOf(c)];
      uiAt(o, R.x, R.y, Math.min(UIK, 1.8, R.w * 0.6 / 160), function () {
      var x = R.x + 10, y = R.y + 10, s = 10.5;
      o.fillStyle = 'rgba(0,0,0,.62)'; rr(o, x, y, 150, 50, 6); o.fill();
      setFont(o, 700, s, FF.ui); o.textAlign = 'left'; o.textBaseline = 'top'; o.fillStyle = '#ff6b6b';
      o.fillText('✕ ' + bad[0], x + 8, y + 8); o.fillText('   ' + bad[1], x + 8, y + 24);
      o.strokeStyle = 'rgba(255,107,107,.8)'; o.lineWidth = 1.2; o.beginPath(); o.moveTo(x + 22, y + 15); o.lineTo(x + 142, y + 15); o.stroke();
      setFont(o, 600, uk(9), FF.ui); o.fillStyle = '#c8c8d0'; o.fillText('의미가 끊기고 마침표가 남아요', x + 8, y + 38);
      });
    },
    speaker: function (T, o, t, R) {
      var c = capAt(t); if (c) burnLines(o, DIAL[CAPS.indexOf(c)], R, 0.885, { alpha: cAlpha(t, c.t0, c.t1), cols: ['#ffe066', '#7fe0ff'] });
      var lw = chip(o, '● 손님', R.x + R.w - 8, R.y + 8, { right: true, fg: '#7fe0ff' });
      chip(o, '● 바리스타', R.x + R.w - 14 - lw, R.y + 8, { right: true, fg: '#ffe066' });
    },
    sdh: function (T, o, t, R) {
      var cues = [[0, 4.8, '[잔잔한 피아노 음악]'], [4.85, 6.3, '[컵 내려놓는 소리]'], [7.7, 9.2, '[딸랑, 문 종소리]'], [9.2, 12, '[잔잔한 피아노 음악]']];
      for (var i = 0; i < cues.length; i++) if (t >= cues[i][0] && t < cues[i][1]) {
        burnLines(o, [cues[i][2]], R, 0.13, { alpha: cAlpha(t, cues[i][0], cues[i][1], 0.12), w: 500, st: { fill: '#e8e8e8' }, size: R.h * 0.05 });
      }
      var c = capAt(t); if (!c) return;
      var line = CAPS.indexOf(c) === 0 ? '(바리스타) ' + c.text : c.text;
      burnLines(o, [line], R, 0.885, { alpha: cAlpha(t, c.t0, c.t1) });
    },
    trans: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      var a = cAlpha(t, c.t0, c.t1);
      burnLines(o, [c.text], R, 0.8, { alpha: a });
      burnLines(o, [c.en], R, 0.9, { alpha: a, w: 500, size: R.h * 0.046, st: { fill: '#ffe9a8' } });
      chip(o, 'KO · EN', R.x + R.w - 8, R.y + 8, { right: true });
    },
    pos: function (T, o, t, R) {
      var bh = R.h * 0.24, by = R.y + R.h - bh;
      o.fillStyle = 'rgba(255,60,60,.16)'; o.fillRect(R.x, by, R.w, bh);
      o.setLineDash([5, 4]); o.strokeStyle = 'rgba(255,120,120,.9)'; o.lineWidth = 1.2; o.beginPath(); o.moveTo(R.x, by); o.lineTo(R.x + R.w, by); o.stroke(); o.setLineDash([]);
      setFont(o, 600, uk(10), FF.ui); o.fillStyle = 'rgba(255,190,190,.95)'; o.textAlign = 'left'; o.textBaseline = 'top'; o.fillText('하단 UI 영역', R.x + 8, by + 6);
      var c = capAt(t); if (!c) return;
      burnLines(o, [c.text], R, 0.66, { alpha: cAlpha(t, c.t0, c.t1), size: R.h * 0.07, w: 900 });
    },
    stroke: function (T, o, t, R) {
      var c = capAt(t); if (!c) return;
      var a = cAlpha(t, c.t0, c.t1), size = fit(o, c.text, R.h * 0.064, R.w * 0.7, 700, FF.nk), x = R.x + R.w / 2;
      txt(o, c.text, x, R.y + R.h * 0.62, { size: size, w: 700, font: FF.nk, fill: '#fff', alpha: a });
      txt(o, c.text, x, R.y + R.h * 0.86, burnSt(size, { sw: size * 0.22, alpha: a }));
      chip(o, '테두리 없음', R.x + 10, R.y + R.h * 0.62 - size * 1.15, { up: true });
      chip(o, '테두리 · 그림자', R.x + 10, R.y + R.h * 0.86 - size * 1.15, { up: true });
    }
  };

  /* ---------- 효과 조각 ---------- */
  function shakeAt(times, amp) {
    return function (t) {
      var e = 0;
      for (var i = 0; i < times.length; i++) { var d = t - times[i]; if (d >= 0 && d < 0.7) e = Math.max(e, Math.exp(-d * 7)); }
      if (e < 0.01) return null;
      var f = Math.floor(t * 40);
      return { x: (hash(f) - 0.5) * 2 * amp * e, y: (hash(f + 3) - 0.5) * 2 * amp * e, r: (hash(f + 7) - 0.5) * 0.03 * e, s: 1 + 0.07 * e };
    };
  }
  function flashAt(times, d, col) {
    return function (T, g, t) {
      for (var i = 0; i < times.length; i++) {
        var u = (t - times[i]) / d;
        if (u >= 0 && u < 1) { g.fillStyle = col || '#fff'; g.globalAlpha = (1 - u) * (1 - u); g.fillRect(0, 0, LW, LH); g.globalAlpha = 1; }
      }
    };
  }
  function applyG(T, g, G) {
    var src = copyP(T, T.buf('gfx'));
    g.save(); if (HASF && G.f) g.filter = G.f; full(g, src); g.restore();
    if (G.L) layers(g, G.L, 0, 0, LW, LH);
    if (!HASF && G.fb) layers(g, G.fb, 0, 0, LW, LH);
    if (G.vig) vignette(g, 0, 0, LW, LH, G.vig);
  }
  function gradeFx(fn) { return function (T, g, t) { var G = fn(t, T); if (G) applyG(T, g, G); }; }
  function beforeAfter(fx, pos) {
    return function (T, g, t) {
      var raw = copyP(T, T.buf('ba'));
      fx(T, g, t);
      var x = clamp(pos(t), 0, 1) * LW;
      if (x > 0.5) { g.save(); g.beginPath(); g.rect(0, 0, x, LH); g.clip(); full(g, raw); g.restore(); }
      T.mem.baX = x;
    };
  }
  function baOv(labels) {
    return function (T, o, t, F) {
      var x = T.mem.baX; if (x == null) return;
      var p = F.map(x, 0), q = F.map(x, LH);
      if (x > 1 && x < LW - 1) { o.fillStyle = 'rgba(255,255,255,.92)'; o.fillRect(p[0] - 1, p[1], 2, q[1] - p[1]); }
      if (x > 70) chip(o, labels[0], p[0] - 8, q[1] - 8, { right: true, up: true });
      if (x < LW - 70) chip(o, labels[1], p[0] + 8, q[1] - 8, { up: true });
    };
  }
  function halvesOv(labels) {
    return function (T, o, t, F) {
      var M = F.M, mx = M.x + M.w / 2;
      o.fillStyle = 'rgba(255,255,255,.9)'; o.fillRect(mx - 1, M.y, 2, M.h);
      chip(o, labels[0], mx - 8, M.y + M.h - 8, { right: true, up: true }); chip(o, labels[1], mx + 8, M.y + M.h - 8, { up: true });
    };
  }
  function sweep(t) { return 0.5 + 0.3 * Math.sin(t * TAU / 12 - 0.4); }
  function halfFx(fn) { // 오른쪽 절반에만 fn 결과 적용(왼쪽은 원본)
    return function (T, g, t) {
      var raw = copyP(T, T.buf('hf'));
      fn(T, g, t);
      g.save(); g.beginPath(); g.rect(0, 0, LW / 2, LH); g.clip(); full(g, raw); g.restore();
    };
  }
  function chipFor(list) { return function (t) { for (var i = 0; i < list.length; i++) if (t >= list[i][0] && t < list[i][1]) return list[i][2]; return null; }; }
  function curClip(T, t) { var cl = T.E.clips; return cl[clipIdx(cl, t)]; }
  // 현재 클립 기준 소스 좌표 → 오버레이 좌표
  function track(T, F, t, nx, ny) {
    var c = curClip(T, t), p = camPt(c.src, camOf(T, c, t), nx, ny);
    return F.map(p[0], p[1]);
  }

  // 날씨·계절·입자
  function rainFx(T, g, t) {
    applyG(T, g, { f: 'brightness(.62) saturate(.7) contrast(1.12)', L: [['multiply', '#5b74a8', 1], ['lighten', '#0a1020', 1]], fb: [['multiply', '#7a7a7a', 1]] });
    g.strokeStyle = 'rgba(205,218,255,.5)'; g.lineWidth = 1; g.beginPath();
    var W = LW * 1.2;
    for (var i = 0; i < 150; i++) {
      var sp = 650 + hash(i) * 450, len = 12 + hash(i + 2) * 16, y = ((hash(i + 5) * (LH + 60) + t * sp) % (LH + 60)) - 30;
      var x = (((hash(i + 11) * W - t * sp * 0.2) % W) + W) % W - 30;
      g.moveTo(x, y); g.lineTo(x - len * 0.2, y + len);
    }
    g.stroke();
    var lf = win(t % 6, 4.1, 4.32, 0.04) + 0.6 * win(t % 6, 4.42, 4.55, 0.03);
    if (lf > 0) { g.fillStyle = 'rgba(225,232,255,' + (0.5 * lf).toFixed(3) + ')'; g.fillRect(0, 0, LW, LH); }
    for (i = 0; i < 8; i++) {
      var dx = hash(i + 40) * LW, dy = hash(i + 50) * LH, r = 5 + hash(i + 60) * 9, gr = g.createRadialGradient(dx - r * 0.3, dy - r * 0.3, 0, dx, dy, r);
      gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(0.6, 'rgba(180,200,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(dx, dy, r, 0, TAU); g.fill();
    }
  }
  function snowFx(T, g, t) {
    applyG(T, g, { f: 'saturate(.72) brightness(1.06) contrast(.95)', L: [['screen', '#9cc3ff', 0.16], ['soft-light', '#d6e8ff', 0.45]] });
    var fr = g.createLinearGradient(0, LH * 0.75, 0, LH); fr.addColorStop(0, 'rgba(255,255,255,0)'); fr.addColorStop(1, 'rgba(240,248,255,.4)');
    g.fillStyle = fr; g.fillRect(0, 0, LW, LH);
    g.fillStyle = '#fff';
    for (var i = 0; i < 110; i++) {
      var sp = 18 + hash(i) * 40, r = 0.8 + hash(i + 1) * 2.4, y = (hash(i + 3) * (LH + 20) + t * sp) % (LH + 20) - 10;
      var x = (hash(i + 7) * LW + Math.sin(t * (0.6 + hash(i + 9)) + i) * 14 + LW) % LW;
      g.globalAlpha = 0.55 + hash(i + 13) * 0.45; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  function petalFx(T, g, t) {
    applyG(T, g, { f: 'brightness(1.06) saturate(1.05)', L: [['soft-light', '#ffc2d6', 0.4], ['screen', '#3a1a22', 0.25]] });
    for (var i = 0; i < 46; i++) {
      var sp = 22 + hash(i) * 30, y = (hash(i + 3) * (LH + 30) + t * sp) % (LH + 30) - 15, x = (hash(i + 7) * LW + Math.sin(t * 0.9 + i) * 26 + t * 12 + LW) % LW;
      g.save(); g.translate(x, y); g.rotate(t * (1 + hash(i + 5)) + i); g.scale(1, 0.55 + 0.4 * Math.sin(t * 3 + i));
      g.fillStyle = hash(i + 9) > 0.5 ? 'rgba(255,190,210,.92)' : 'rgba(255,220,232,.9)';
      g.beginPath(); g.ellipse(0, 0, 4 + hash(i + 11) * 3, 2.6, 0, 0, TAU); g.fill(); g.restore();
    }
  }
  function particleFx(T, g, t) {
    g.save(); g.globalCompositeOperation = 'screen';
    for (var i = 0; i < 26; i++) {
      var r = 6 + hash(i) * 18, x = (hash(i + 1) * LW + Math.sin(t * 0.3 + i) * 30), y = (hash(i + 2) * LH - t * (6 + hash(i + 3) * 10) + LH * 4) % LH;
      var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,214,150,.38)'); gr.addColorStop(0.7, 'rgba(255,190,120,.12)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    for (i = 0; i < 70; i++) {
      var px = (hash(i + 30) * LW + Math.sin(t * 0.7 + i) * 12), py = (hash(i + 31) * LH - t * (10 + hash(i + 32) * 22) + LH * 9) % LH, a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + i * 1.7));
      g.fillStyle = 'rgba(255,248,225,' + (a * 0.85).toFixed(3) + ')'; g.beginPath(); g.arc(px, py, 0.7 + hash(i + 33) * 1.3, 0, TAU); g.fill();
      if (hash(i + 34) > 0.86) { var s = 4 + 5 * a; g.strokeStyle = 'rgba(255,250,230,' + (a * 0.8).toFixed(3) + ')'; g.lineWidth = 1; g.beginPath(); g.moveTo(px - s, py); g.lineTo(px + s, py); g.moveTo(px, py - s); g.lineTo(px, py + s); g.stroke(); }
    }
    g.restore();
  }
  function sparkleFx(T, g, t) {
    g.save(); g.globalCompositeOperation = 'screen';
    for (var i = 0; i < 18; i++) {
      var ph = frac(t * 0.6 + hash(i)), a = Math.sin(ph * Math.PI), x = LW * (0.12 + hash(i + 3) * 0.45), y = LH * (0.45 + hash(i + 4) * 0.45), s = 3 + 7 * a;
      g.strokeStyle = 'rgba(255,255,240,' + (0.9 * a).toFixed(3) + ')'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
    }
    g.restore();
  }
  // 수채화풍(저해상도 포스터라이즈 → 부드럽게 확대)
  var PT = null;
  function paintFx(T, g) {
    if (!PT) { PT = mkC(192, 108); PT._x = PT.getContext('2d', { willReadFrequently: true }); }
    var x = PT._x; x.clearRect(0, 0, 192, 108); x.drawImage(T.P, 0, 0, 192, 108);
    var im; try { im = x.getImageData(0, 0, 192, 108); } catch (e) { return; }
    var d = im.data, q = 40;
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], gg = d[i + 1], b = d[i + 2], l = (r + gg + b) / 3;
      r = l + (r - l) * 1.4 + 10; gg = l + (gg - l) * 1.4 + 6; b = l + (b - l) * 1.4;
      d[i] = clamp(Math.round(r / q) * q, 0, 255); d[i + 1] = clamp(Math.round(gg / q) * q, 0, 255); d[i + 2] = clamp(Math.round(b / q) * q, 0, 255);
    }
    x.putImageData(im, 0, 0);
    full(g, PT);
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.35; blurDraw(g, PT, 0.55, 0, 0, LW, LH); g.restore();
    g.fillStyle = 'rgba(250,240,220,.12)'; g.fillRect(0, 0, LW, LH);
    grainOv(g, 0, 0, LW, LH, 0.22, 0.5);
  }
  function relightFx(T, g, t) {
    var lx = LW * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * TAU / 12 - 1.2))), ly = LH * 0.12;
    var sh = g.createLinearGradient(lx, 0, LW - lx, LH * 0.6);
    sh.addColorStop(0, 'rgba(255,255,255,1)'); sh.addColorStop(1, 'rgba(40,50,80,1)');
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.75; g.fillStyle = sh; g.fillRect(0, 0, LW, LH); g.restore();
    g.save(); g.globalCompositeOperation = 'screen';
    var gr = g.createRadialGradient(lx, ly, 0, lx, ly, LW * 0.7);
    gr.addColorStop(0, 'rgba(255,190,110,.75)'); gr.addColorStop(0.45, 'rgba(255,140,60,.25)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, LW, LH); g.restore();
    T.mem.lx = lx;
  }
  function vhsFx(T, g, t) {
    rgbSplit(T, g, 2.6, 0);
    var tb = ((t * 0.21) % 1.2 - 0.1) * LH, n = Math.floor(t * 30);
    g.fillStyle = 'rgba(0,0,0,.16)';
    for (var y = 0; y < LH; y += 3) g.fillRect(0, y, LW, 1);
    var src = copyP(T, T.buf('vh'));
    sub(g, src, 0, tb, LW, 14, (hash(n) - 0.5) * 14, tb, LW, 14);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, tb + 4, LW, 3);
    for (var i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,' + (hash(n * 3 + i) * 0.35).toFixed(3) + ')'; g.fillRect(hash(n + i * 7) * LW, tb + hash(n + i) * 14, 2 + hash(i + n) * 10, 1); }
  }
  function vhsOv(T, o, t, F) {
    var R = F.FR, s = R.h * 0.07, sh = 'rgba(0,0,0,.6)';
    txt(o, 'PLAY ▶', R.x + R.w * 0.05, R.y + R.h * 0.12, { size: s, w: 400, font: FF.vt, align: 'left', fill: '#f4f4f4', shadow: sh, sb: 2 });
    var sec = Math.floor(t), tc = 'SP  0:00:' + (sec < 10 ? '0' : '') + sec;
    txt(o, tc, R.x + R.w * 0.95, R.y + R.h * 0.12, { size: s, w: 400, font: FF.vt, align: 'right', fill: '#f4f4f4', shadow: sh, sb: 2 });
    txt(o, 'AM 7:00', R.x + R.w * 0.05, R.y + R.h * 0.83, { size: s, w: 400, font: FF.vt, align: 'left', fill: '#f4f4f4', shadow: sh, sb: 2 });
    txt(o, 'OCT. 18 1996', R.x + R.w * 0.05, R.y + R.h * 0.92, { size: s, w: 400, font: FF.vt, align: 'left', fill: '#f4f4f4', shadow: sh, sb: 2 });
  }
  function filmBurnFx(T, g, t) {
    var hits = [[4.5, 5.6], [10.5, 11.9]];
    for (var i = 0; i < hits.length; i++) {
      var u = (t - hits[i][0]) / (hits[i][1] - hits[i][0]); if (u < 0 || u > 1) continue;
      var a = Math.sin(Math.PI * u);
      g.save(); g.globalCompositeOperation = 'screen';
      for (var k = 0; k < 4; k++) {
        var cx = LW * (k % 2 ? 1.05 : -0.05) + Math.sin(u * 3 + k) * 60, cy = LH * (0.2 + 0.25 * k) + Math.cos(u * 2 + k) * 40, r = LW * (0.25 + 0.55 * a) * (0.7 + 0.3 * hash(k));
        var gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(255,250,225,' + (0.95 * a).toFixed(3) + ')'); gr.addColorStop(0.3, 'rgba(255,170,40,' + (0.8 * a).toFixed(3) + ')'); gr.addColorStop(0.7, 'rgba(220,50,10,' + (0.45 * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(120,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
      }
      g.restore();
      g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.6 * a; vignette(g, 0, 0, LW, LH, 1); g.restore();
    }
  }
  function flareFx(T, g, t) {
    var sx = LW * (0.78 + 0.08 * Math.sin(t * 0.5)), sy = LH * 0.12, cx = LW / 2, cy = LH / 2;
    g.save(); g.globalCompositeOperation = 'screen';
    var gr = g.createRadialGradient(sx, sy, 0, sx, sy, 90); gr.addColorStop(0, 'rgba(255,255,245,.95)'); gr.addColorStop(0.2, 'rgba(255,220,170,.5)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
    var st = g.createLinearGradient(0, sy, LW, sy); st.addColorStop(0, 'rgba(90,150,255,0)'); st.addColorStop(sx / LW, 'rgba(160,200,255,.75)'); st.addColorStop(1, 'rgba(90,150,255,0)');
    g.fillStyle = st; g.fillRect(0, sy - 2, LW, 4);
    var gh = [[0.35, 14, 'rgba(120,255,200,.18)'], [0.6, 26, 'rgba(255,170,90,.14)'], [1.25, 40, 'rgba(140,140,255,.12)'], [1.6, 18, 'rgba(255,120,200,.16)']];
    for (var i = 0; i < gh.length; i++) {
      var k = gh[i][0], x = sx + (cx - sx) * k * 2, y = sy + (cy - sy) * k * 2;
      g.fillStyle = gh[i][2]; g.beginPath();
      for (var j = 0; j < 6; j++) { var a = j * TAU / 6 + 0.3; if (j) g.lineTo(x + Math.cos(a) * gh[i][1], y + Math.sin(a) * gh[i][1]); else g.moveTo(x + Math.cos(a) * gh[i][1], y + Math.sin(a) * gh[i][1]); }
      g.closePath(); g.fill();
    }
    g.restore();
  }
  function glitchFx(T, g, t) {
    var B = [1.2, 4.7, 7.4, 10.2];
    for (var i = 0; i < B.length; i++) {
      var u = (t - B[i]) / 0.5; if (u < 0 || u > 1) continue;
      var amt = Math.sin(Math.PI * u), seed = Math.floor(t * 24);
      glitchSlices(T, g, amt, seed);
      rgbSplit(T, g, (4 + 14 * amt) * (hash(seed) > 0.5 ? 1 : -1), (hash(seed + 1) - 0.5) * 4);
      for (var k = 0; k < 6; k++) { if (hash(seed * 5 + k) < 0.5) continue; g.fillStyle = 'rgba(' + (hash(k) > 0.5 ? '255,255,255' : '0,0,0') + ',.5)'; g.fillRect(hash(seed + k * 3) * LW, hash(seed + k * 7) * LH, 8 + hash(k + seed) * 40, 4 + hash(k * 2 + seed) * 10); }
    }
  }
  // 키잉 합성(크로마키·배경 바꾸기)
  function keyComp(bg, opt) {
    opt = opt || {};
    return function (T, g, t, cam) {
      var b = STILL[bg];
      if (b) drawImgCam(g, b, bg, { s: 1.04 + 0.04 * (t / DUR), x: 0, y: 0 });
      if (opt.blurBg && b) { g.save(); g.globalAlpha = 0.6; blurDraw(g, b, 0.45, 0, 0, LW, LH); g.restore(); }
      if (opt.mixT) { var v0 = T.img('coffee'), m = 1 - seg(t, opt.mixT[0], opt.mixT[1]); if (v0 && m > 0) drawImgCam(g, v0, 'coffee', null, m); }
      var k = T.keyed(); if (!k) return;
      var kc = { s: (opt.s || 0.8) * (cam.s || 1), x: (opt.x || 0) + (cam.x || 0), y: (opt.y || 30) + (cam.y || 0) };
      var p = camPt('coffee', kc, 0.46, 0.97);
      g.save(); g.globalAlpha = 0.45; g.fillStyle = '#000'; g.beginPath(); g.ellipse(p[0], p[1] - 4, 120 * kc.s, 12 * kc.s, 0, 0, TAU); g.filter = HASF ? 'blur(6px)' : 'none'; g.fill(); g.restore();
      drawImgCam(g, k, 'coffee', kc);
      if (opt.wipe) {
        var wx = LW * seg(t, opt.wipe[0], opt.wipe[1]);
        if (wx < LW - 1) { var v = T.img('coffee'); if (v) { g.save(); g.beginPath(); g.rect(wx, 0, LW - wx, LH); g.clip(); drawImgCam(g, v, 'coffee', cam); g.restore(); } T.mem.baX = wx; T.mem.baRev = true; }
        else T.mem.baX = null;
      }
    };
  }
  function keyedOver(T, g, cam) { var k = T.keyed(); if (k) drawImgCam(g, k, 'coffee', cam); return k; }

  /* ---------- 패널 조각 ---------- */
  function tlPanel(extra) {
    return lanes(function (T, t) {
      var L = [{ name: '영상', v: T.E.clips.map(function (c) { return { t0: c.t0, t1: c.t1, src: c.src, lab: c.lab, hatch: c.gen, col: c.gen ? '#7c5cd6' : null }; }) }];
      return extra ? L.concat(extra(T, t)) : L;
    });
  }
  function scriptPanel(items, opt) {
    opt = opt || {};
    return function (T, o, t, PR) {
      panelBg(o, PR);
      var list = typeof items === 'function' ? items(T, t) : items, lh = uk(opt.lh || 17, 1.6), fs = uk(opt.fs || 11.5, 1.6), x = PR.x + 12, y = PR.y + lh * 0.75, right = PR.x + PR.w - 12;
      if (opt.title) { setFont(o, 600, uk(9.5, 1.6), FF.ui); o.fillStyle = '#8c8c99'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText(opt.title, x, PR.y + uk(10, 1.6)); y += lh * 0.45; }
      for (var i = 0; i < list.length; i++) {
        var it = list[i], s = it.s + (opt.block ? '' : ' ');
        setFont(o, it.b ? 700 : 500, fs, FF.ui);
        var w = o.measureText(s).width;
        if (opt.block || x + w > right) { if (x > PR.x + 12) { x = PR.x + 12; y += lh; } }
        var on = !it.cut && t >= it.t0 && t < it.t1;
        if (it.sel) { o.fillStyle = 'rgba(90,140,255,.45)'; o.fillRect(x - 2, y - fs * 0.7, w, fs * 1.4); }
        if (on) { o.fillStyle = 'rgba(255,211,77,.9)'; rr(o, x - 3, y - fs * 0.72, w + 2, fs * 1.44, 3); o.fill(); }
        o.fillStyle = it.cut ? '#ff6b6b' : (on ? '#111' : (it.dim ? '#7d7d88' : '#e8e8ee')); o.textAlign = 'left'; o.textBaseline = 'middle';
        o.fillText(s, x, y);
        if (it.cut) { o.strokeStyle = '#ff6b6b'; o.lineWidth = 1.4; o.beginPath(); o.moveTo(x, y + 0.5); o.lineTo(x + w - 4, y + 0.5); o.stroke(); }
        if (it.tag) { setFont(o, 600, uk(9, 1.6), FF.ui); var tw2 = o.measureText(it.tag).width + 8; o.fillStyle = it.tc || 'rgba(255,255,255,.14)'; rr(o, right - tw2, y - fs * 0.62, tw2, fs * 1.24, 3); o.fill(); o.fillStyle = '#fff'; o.fillText(it.tag, right - tw2 + 4, y); }
        x += w;
        if (opt.block) { x = PR.x + 12; y += lh; }
        if (y > PR.y + PR.h - 6) break;
      }
    };
  }
  // 라우드니스 미터 패널
  function loudPanel(targets) {
    return function (T, o, t, PR) {
      panelBg(o, PR);
      var vi = vOf(T), lv = vi === 0 ? -20.8 : -14.0, live = T.aud ? lv + Math.sin(t * 7) * 0.8 * (T.aud ? 1 : 0) : lv;
      var R2 = rows({ x: PR.x, y: PR.y, w: PR.w * 0.62, h: PR.h }, 2), sub2 = { x: PR.x, y: PR.y, w: PR.w * 0.62, h: PR.h };
      laneBox(o, sub2, R2[0].y, R2[0].h, '원본'); wave(o, sub2, R2[0].y, R2[0].h, 'voice', 0, 12, 0, 0.45, 'rgba(150,180,255,.85)');
      laneBox(o, sub2, R2[1].y, R2[1].h, '맞춤'); wave(o, sub2, R2[1].y, R2[1].h, 'voice', 0, 12, 0, 0.92, 'rgba(120,230,160,.9)');
      playhead(o, sub2, t);
      var K = Math.min(UIK, 1.6), mx = PR.x + PR.w * 0.66, mw = PR.w * 0.31, my = PR.y + 26 * K, mh = 12, lo = -30, hi = -6;
      function X(db) { return mx + (db - lo) / (hi - lo) * mw; }
      setFont(o, 600, uk(10), FF.ui); o.fillStyle = '#c9c9d1'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('통합 음량', mx, PR.y + 12 * K);
      setFont(o, 700, uk(13), FF.mono); o.fillStyle = vi === 0 ? '#ffb4a8' : '#9ff0b8'; o.textAlign = 'right'; o.fillText(live.toFixed(1) + ' LUFS', mx + mw, PR.y + 12 * K);
      o.fillStyle = '#26262c'; o.fillRect(mx, my, mw, mh);
      var gr = o.createLinearGradient(mx, 0, mx + mw, 0); gr.addColorStop(0, '#2f9e5a'); gr.addColorStop(0.7, '#d8c23a'); gr.addColorStop(1, '#e0533a');
      o.fillStyle = gr; o.fillRect(mx, my, X(live) - mx, mh);
      o.fillStyle = '#fff'; o.fillRect(X(-14) - 1, my - 4, 2, mh + 8);
      setFont(o, 600, uk(9), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'top'; o.fillText('목표 -14', X(-14), my + mh + 5);
      if (targets) {
        var ty = my + mh + 20 * K;
        for (var i = 0; i < targets.length; i++) { setFont(o, 500, uk(9.5), FF.ui); o.fillStyle = '#b8b8c2'; o.textAlign = 'left'; o.textBaseline = 'top'; o.fillText(targets[i], mx, ty + i * 12 * K); }
      }
    };
  }

  /* ---------- 모션그래픽 조각 ---------- */
  function fmtN(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function starburst(o, x, y, r1, r2, n, col) {
    o.beginPath();
    for (var i = 0; i < n * 2; i++) { var a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1; if (i) o.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else o.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    o.closePath(); o.fillStyle = col; o.fill();
  }
  function beanLogo(o, x, y, r, p, col) {
    o.strokeStyle = col || '#fff'; o.lineWidth = r * 0.12; o.lineCap = 'round';
    o.beginPath(); o.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p * 1.4, 0, 1)); o.stroke();
    if (p > 0.45) {
      var q = clamp((p - 0.45) / 0.4, 0, 1);
      o.save(); o.globalAlpha = q; o.translate(x, y); o.rotate(-0.5); o.fillStyle = col || '#fff';
      o.beginPath(); o.ellipse(0, 0, r * 0.42, r * 0.62, 0, 0, TAU); o.fill();
      o.strokeStyle = '#3a2416'; o.lineWidth = r * 0.08; o.beginPath(); o.moveTo(0, -r * 0.5); o.bezierCurveTo(-r * 0.2, -r * 0.15, r * 0.2, r * 0.15, 0, r * 0.5); o.stroke();
      o.restore();
    }
  }
  function cursor(o, x, y, down) {
    o.save(); o.translate(x, y); if (down) o.scale(0.9, 0.9);
    o.fillStyle = '#fff'; o.strokeStyle = '#111'; o.lineWidth = 1.2;
    o.beginPath(); o.moveTo(0, 0); o.lineTo(0, 16); o.lineTo(4.5, 12); o.lineTo(7.5, 18.5); o.lineTo(10, 17.3); o.lineTo(7, 11); o.lineTo(12.5, 11); o.closePath(); o.fill(); o.stroke();
    o.restore();
  }
  function stillThumb(o, key, x, y, w, h, T) {
    var im = key === 'coffee' ? T.P : STILL[key];
    o.fillStyle = '#222'; o.fillRect(x, y, w, h);
    if (!im) return;
    var iw = key === 'coffee' ? LW : 960, ih = key === 'coffee' ? LH : 540, k = key === 'coffee' ? T.pk : 1.5;
    var sr = w / h, cw = Math.min(iw, ih * sr), ch = cw / sr, an = ANCH[key] || [0.5, 0.5], sx = clamp(an[0] * iw - cw / 2, 0, iw - cw), sy = clamp(an[1] * ih - ch / 2, 0, ih - ch);
    if (key === 'coffee') o.drawImage(im, sx * k, sy * k, cw * k, ch * k, x, y, w, h); else o.drawImage(im, sx, sy, cw, ch, x, y, w, h);
  }
  function card(o, x, y, w, h, r) { o.fillStyle = 'rgba(20,20,24,.9)'; o.shadowColor = 'rgba(0,0,0,.4)'; o.shadowBlur = 14; rr(o, x, y, w, h, r || 10); o.fill(); o.shadowColor = 'transparent'; o.shadowBlur = 0; }
  function kv(o, x, y, k, v, w, vc) {
    setFont(o, 500, uk(10.5), FF.ui); o.fillStyle = '#9a9aa6'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText(k, x, y);
    setFont(o, 600, uk(10.5), FF.ui); o.fillStyle = vc || '#f2f2f5'; o.textAlign = 'right'; o.fillText(v, x + w, y);
  }

  // 무음 삭제용 구간
  var SILC = (function () {
    var out = [], acc = 0;
    for (var i = 0; i < VSEG.length && acc < DUR; i++) {
      var a = Math.max(0, VSEG[i][0] - 0.12), b = VSEG[i][1] + 0.12, d = b - a;
      out.push({ a: a, t0: acc, t1: Math.min(DUR, acc + d) }); acc += d;
    }
    return out;
  })();
  // 말버릇 제거용 단어
  var FILL = (function () {
    var w = ['음…', '아침을', '깨우는', '어…', '한 잔.', '그…', '직접', '볶은', '원두로.', '음…', '매일', '아침', '7시', '오픈!', '어…', '모닝빈에서', '만나요.'];
    var fill = { '음…': 1, '어…': 1, '그…': 1 }, n = 0, i, out = [];
    for (i = 0; i < w.length; i++) if (!fill[w[i]]) n += w[i].length + 1;
    var acc = 0.2, span = 11.4;
    for (i = 0; i < w.length; i++) {
      if (fill[w[i]]) { out.push({ s: w[i], t0: acc, t1: acc, cut: true }); continue; }
      var d = span * (w[i].length + 1) / n; out.push({ s: w[i], t0: acc, t1: acc + d }); acc += d;
    }
    return out;
  })();
  function fillerClips() {
    var cuts = [0], i;
    for (i = 0; i < FILL.length; i++) if (FILL[i].cut && FILL[i].t0 > 0.3) cuts.push(FILL[i].t0);
    cuts.push(DUR);
    var out = [];
    for (i = 0; i < cuts.length - 1; i++) out.push(C('portrait', cuts[i], cuts[i + 1], { s: i % 2 ? 1.34 : 1.2, x: i % 2 ? -10 : 6, y: i % 2 ? 12 : 4 }));
    return out;
  }
  var TBE = [
    { s: '아침을 깨우는 한 잔.', t0: 0, t1: 3 }, { s: '직접 볶은 원두로 내려요.', t0: 3, t1: 6 },
    { s: '아, 잠깐만요. 다시 할게요.', t0: 6, t1: 6, x: 1 }, { s: '매일 아침 7시에 열어요.', t0: 6, t1: 9 }, { s: '모닝빈에서 만나요.', t0: 9, t1: 12 }
  ];

  /* ---------- 레시피 표 ---------- */
  var LC = { v: 'rgba(90,150,255,.24)', m: 'rgba(180,120,255,.22)', s: 'rgba(255,170,60,.28)', a: 'rgba(70,200,150,.22)', r: 'rgba(160,160,170,.2)' };
  var WC = { v: 'rgba(165,198,255,.92)', m: 'rgba(212,178,255,.88)', s: 'rgba(255,202,122,.95)', a: 'rgba(140,235,200,.88)', r: 'rgba(200,200,210,.7)' };
  var DUCK = duckEnv(1, 0.2, VSEG, 12.5);
  var GAPS12 = (function () { var g = [], last = 0; for (var i = 0; i < VSEG.length; i++) { if (VSEG[i][0] > last + 0.05 && last < 12) g.push([last, Math.min(12, VSEG[i][0])]); last = VSEG[i][1]; } if (last < 12) g.push([last, 12]); return g; })();
  function one(v) { return function () { return v; }; }
  function sfxLane(name, list, k) { return { name: name, clips: list.map(function (s) { return { k: k || s[1], t0: s[0], t1: s[0] + (s[2] || 0.8), col: LC.s, wc: WC.s }; }) }; }
  function abMix(keys, fn) { return { keys: keys, v: ['전', '후'], mix: fn }; }
  var VHOLD = function (u) { return { s: 1 + 0.06 * u }; };
  var CUPZ = function (s) { return function (t, c) { return c.src === 'coffee' ? { s: s(t), y: (0.58 - 0.42) * LH * (s(t) - 1) } : (c.src === 'product' ? { s: s(t), x: -96 * (s(t) - 1), y: 21.6 * (s(t) - 1) } : null); }; };
  function title(o, s, x, y, size, col, font, extra) { var st = { size: size, w: 400, font: font || FF.hz, fill: col || '#fff', base: 'middle', shadow: 'rgba(0,0,0,.45)' }; if (extra) for (var k in extra) st[k] = extra[k]; txt(o, s, x, y, st); }

  var G = {
    correct: { f: 'brightness(1.12) contrast(1.06) saturate(.9)', L: [['soft-light', '#ff7fb0', 0.16], ['soft-light', '#ffd2a0', 0.18]], fb: [['screen', '#3a2a30', 0.35]] },
    warm: { f: 'contrast(1.12) saturate(1.1) brightness(.97)', L: [['soft-light', '#ff9e4a', 0.5], ['lighten', '#2a1406', 1]], vig: 0.35, fb: [['soft-light', '#ff9e4a', 0.35]] },
    teal: { f: 'contrast(1.16) saturate(1.18)', L: [['lighten', '#0a3b44', 1], ['soft-light', '#ff8a3a', 0.5], ['multiply', '#d8f0f2', 0.22]], vig: 0.3 },
    film: { f: 'contrast(.92) saturate(.82) sepia(.14)', L: [['lighten', '#20180f', 1], ['soft-light', '#ffcf9a', 0.32]], grain: 0.32, vig: 0.4, fb: [['soft-light', '#ffcf9a', 0.4]] },
    night: { f: 'brightness(.5) saturate(.45) contrast(1.18)', L: [['multiply', '#4a6aa8', 1], ['lighten', '#060a1a', 1]], fb: [['multiply', '#3a4a78', 1]] },
    bw: { f: 'grayscale(1) contrast(1.22) brightness(1.03)', fb: [['saturation', '#808080', 1]] },
    scurve: { f: 'contrast(1.38) saturate(1.06)', fb: [['overlay', '#808080', 0.0]] },
    hdr: { f: 'brightness(1.02) contrast(.94) saturate(1.08)' },
    sdr: { f: 'brightness(1.3) contrast(1.2) saturate(.95)' },
    vhs: { f: 'saturate(.75) contrast(.9) brightness(1.05) sepia(.15)', L: [['lighten', '#141016', 1]] }
  };
  var LUTS = [
    ['따뜻한 필름', { f: 'contrast(1.05) saturate(.9) sepia(.22)', L: [['soft-light', '#ffb36b', 0.4], ['lighten', '#1e140c', 1]] }],
    ['시네마 틸', { f: 'contrast(1.15) saturate(1.1)', L: [['lighten', '#0a3842', 1], ['soft-light', '#ff9a50', 0.35]] }],
    ['빈티지 페이드', { f: 'contrast(.82) saturate(.7) brightness(1.06)', L: [['lighten', '#3a3430', 1], ['soft-light', '#c8e0ff', 0.25]] }]
  ];

  var RX = {
    /* === 컷·호흡 === */
    'hard-cut': { panel: tlPanel(), ov: [function (T, o, t, F) { for (var i = 0; i < 2; i++) { var c = [5, 8][i]; if (t >= c && t < c + 0.5) chip(o, '컷', F.FR.x + F.FR.w / 2, F.FR.y + 10, { center: true, bg: 'rgba(255,77,77,.9)' }); } }], rep: 5.1 },
    'jump-cut': {
      tl: function () {
        var S = [[0, 1.6, 0.4, { s: 1 }], [1.6, 3.1, 3.4, { s: 1.14, x: -26, y: -8 }], [3.1, 4.5, 6.2, { s: 1.04, x: 14 }], [4.5, 6.0, 8.6, { s: 1.2, x: 10, y: -14 }],
          [6.0, 7.4, 10.4, { s: 1.06, x: -10 }], [7.4, 8.9, 1.8, { s: 1.16, x: -20, y: -6 }], [8.9, 10.4, 4.8, { s: 1.02 }], [10.4, 12, 7.6, { s: 1.12, x: 16, y: -10 }]];
        return S.map(function (a) { return C('coffee', a[0], a[1], a[3], { seek: a[2] }); });
      },
      ov: [function (T, o, t, F) { var c = curClip(T, t), s = c.seek + (t - c.t0); chip(o, '원본 ' + fmtTC(s).slice(3, 8), F.FR.x + F.FR.w - 8, F.FR.y + 8, { right: true }); }],
      rep: 1.8
    },
    'j-cut': jl(4.6, 'J'),
    'l-cut': jl(7.4, 'L'),
    'match-cut': {
      tl: function () {
        return [C('coffee', 0, 5, function (u) { return { s: lerp(1, 1.18, eio(u)) }; }),
          C('product', 5, 8, function (u) { return { s: lerp(1.62, 1.72, u), x: 102, y: -50 }; }),
          C('coffee', 8, 12, function (u) { return { s: lerp(1.18, 1, eio(u)) }; })];
      },
      ov: [function (T, o, t, F) {
        var a = Math.max(win(t, 4.55, 5.5, 0.15), win(t, 7.55, 8.5, 0.15)); if (a <= 0) return;
        var p = F.map(ANCH.coffee[0] * LW, ANCH.coffee[1] * LH), r = F.sc(150);
        o.globalAlpha = a; o.setLineDash([7, 5]); o.strokeStyle = '#ffd34d'; o.lineWidth = 2; o.beginPath(); o.ellipse(p[0], p[1] - F.sc(8), r, r * 0.92, 0, 0, TAU); o.stroke(); o.setLineDash([]);
        chip(o, '모양이 겹쳐요', p[0], p[1] - r - 4, { center: true, up: true }); o.globalAlpha = 1;
      }],
      rep: 5.2
    },
    'cutaway': {
      tl: function () { return [C('coffee', 0, 3.4), C('product', 3.4, 4.6, { s: 2.2, x: -60, y: 30 }, { lab: '컷어웨이' }), C('coffee', 4.6, 8.2, VHOLD), C('street', 8.2, 9.4, push(1.4, 1.55), { lab: '컷어웨이' }), C('coffee', 9.4, 12)]; },
      chip: function (t, T) { return curClip(T, t).lab || null; }, rep: 3.9
    },
    'cross-cutting': {
      tl: function () {
        var d = [2, 2, 1.5, 1.5, 1, 1, 0.75, 0.75, 0.75, 0.75], out = [], acc = 0;
        for (var i = 0; i < d.length; i++) { var k = i % 2 ? 'street' : 'coffee', s0 = 1 + i * 0.03; out.push(C(k, acc, acc + d[i], { s: s0 + (k === 'street' ? 0.05 : 0) }, { lab: k === 'coffee' ? '카페 · 7:00' : '출근길 · 7:00' })); acc += d[i]; }
        return out;
      },
      chip: function (t, T) { return curClip(T, t).lab; }, rep: 2.5
    },
    'montage': {
      tl: function () {
        var S = [['coffee', 1.2, { s: 1.1 }, 'saturate(1.15) contrast(1.08)'], ['product', 1.0, push(1.05, 1.2, 0, -10), 'sepia(.25) contrast(1.05)'], ['street', 1.0, push(1.25, 1.05), 'contrast(1.2) saturate(.9)'],
          ['portrait', 1.0, push(1.1, 1.25, 0, 0, 0, 10), 'saturate(1.1) brightness(1.05)'], ['coffee', 0.9, { s: 1.6, y: 40 }, 'contrast(1.15) saturate(1.2)'], ['product', 1.0, push(1.4, 1.2, -20, 0), 'brightness(1.05) sepia(.15)'],
          ['street', 1.0, push(1.06, 1.2, 10, -10), 'grayscale(.6) contrast(1.2)'], ['portrait', 1.0, push(1.3, 1.15), 'sepia(.2) saturate(1.1)'], ['coffee', 1.4, push(1.3, 1.12), 'saturate(1.1)'],
          ['product', 1.1, push(1.0, 1.12), 'contrast(1.1)'], ['coffee', 1.4, push(1.2, 1.0), 'saturate(1.05)']];
        var acc = 0, out = [];
        for (var i = 0; i < S.length; i++) { out.push(C(S[i][0], acc, Math.min(12, acc + S[i][1]), S[i][2], { f: S[i][3] })); acc += S[i][1]; }
        out[out.length - 1].t1 = 12; return out;
      },
      audio: { keys: ['bed'], mix: function (M) { M.play('bed', { dur: 12, gain: 0.8, env: [[0, 0], [0.3, 1], [11.4, 1], [12, 0]] }); } }, rep: 3.6
    },
    'smash-cut': {
      tl: function () { return [C('coffee', 0, 5, push(1, 1.05), { f: 'saturate(.35) brightness(.72)' }), C('street', 5, 6.4, { s: 1.3 }, { f: 'saturate(1.5) contrast(1.35) brightness(1.08)' }), C('product', 6.4, 8, push(1.4, 1.25), { f: 'saturate(1.3) contrast(1.2)' }), C('coffee', 8, 12, push(1.25, 1.1), { f: 'saturate(1.25) contrast(1.15) brightness(1.06)' })]; },
      gcam: shakeAt([5], 12), fx: [flashAt([5], 0.25)],
      ov: [function (T, o, t, F) { if (t < 5 || t > 6.4) return; var R = F.FR, s = popS(t, 5, 0.14), sz = fit(o, '오픈!', R.h * 0.24, R.w * 0.7, 400, FF.hz); o.translate(R.x + R.w / 2, R.y + R.h * 0.5); o.scale(s, s); txt(o, '오픈!', 0, 0, { size: sz, w: 400, font: FF.hz, fill: '#ffe14a', stroke: '#000', sw: sz * 0.2, base: 'middle', shadow: 'rgba(0,0,0,.6)' }); }],
      audio: { keys: ['room', 'impact', 'bed'], mix: function (M) { M.play('room', { dur: 5, gain: 0.12 }); M.play('impact', { t: 5, gain: 1 }); M.play('bed', { t: 5, off: 2.4, dur: 7, gain: 0.85 }); } },
      rep: 5.3
    },
    'fast-pacing': {
      tl: function () {
        var src = ['coffee', 'product', 'street', 'coffee', 'portrait', 'product', 'coffee', 'street', 'product', 'coffee', 'portrait', 'product', 'coffee'], cams = [{ s: 1 }, { s: 1.2 }, { s: 1.1 }, { s: 1.4, y: 30 }, { s: 1.15 }, { s: 1.5, x: -40 }, { s: 1.1, x: 20 }];
        var out = [], acc = 0;
        for (var i = 0; acc < 12; i++) { var d = 0.8 + 0.2 * hash(i); out.push(C(src[i % src.length], acc, Math.min(12, acc + d), cams[i % cams.length])); acc += d; }
        return out;
      },
      chip: '샷 평균 0.9초', rep: 2.3
    },
    'slow-pacing': {
      tl: function () { return [C('coffee', 0, 7, push(1, 1.12)), C('product', 7, 12, push(1.02, 1.1, 0, 8))]; },
      tr: { type: 'dissolve', dur: 1.6 }, chip: '샷 평균 6초', rep: 3
    },
    'cut-on-beat': {
      tl: function () { var src = ['coffee', 'product', 'street', 'portrait', 'coffee'], out = []; for (var i = 0; i < 10; i++) out.push(C(src[i % 5], i * 1.2, (i + 1) * 1.2, { s: 1.05 + (i % 3) * 0.08 })); return out; },
      gcam: function (t) { var d = t % BEAT; return { s: 1 + 0.035 * Math.exp(-d * 9) }; },
      ov: [function (T, o, t, F) {
        var R = F.FR, b = Math.floor(t / BEAT), x0 = R.x + R.w / 2 - 33;
        for (var i = 0; i < 4; i++) { var on = b % 4 === i, d = t % BEAT; o.fillStyle = on ? (i % 2 === 0 ? '#ffd34d' : '#fff') : 'rgba(255,255,255,.3)'; o.beginPath(); o.arc(x0 + i * 22, R.y + R.h - 18, on ? 6 + 3 * Math.exp(-d * 10) : 5, 0, TAU); o.fill(); }
        var dc = t % 1.2; if (dc < 0.15) { o.strokeStyle = 'rgba(255,211,77,' + (1 - dc / 0.15) + ')'; o.lineWidth = 6; o.strokeRect(R.x + 3, R.y + 3, R.w - 6, R.h - 6); }
      }],
      audio: { keys: ['bed'], mix: function (M) { M.play('bed', { dur: 12, gain: 0.9 }); } }, rep: 2.42
    },
    'invisible-cut': {
      tl: function () { return [C('coffee', 0, 6, function (u, lt) { return { s: 1.3, x: -ein(lin(lt, 4.6, 6)) * 80 }; }), C('street', 6, 12, function (u, lt) { return { s: 1.25, x: 70 * (1 - eout(lt / 1.2)) }; })]; },
      fx: [function (T, g, t) {
        var p = lin(t, 5.45, 6.6); if (p <= 0 || p >= 1) return;
        var x = lerp(LW + 40, -2 * LW - 40, p), w = LW * 2, gr = g.createLinearGradient(x, 0, x + w, 0);
        gr.addColorStop(0, 'rgba(12,10,9,0)'); gr.addColorStop(0.12, 'rgba(12,10,9,1)'); gr.addColorStop(0.88, 'rgba(12,10,9,1)'); gr.addColorStop(1, 'rgba(12,10,9,0)');
        g.fillStyle = gr; g.fillRect(x, 0, w, LH);
      }],
      chip: chipFor([[5.3, 6.9, '가림 뒤에서 컷']]), rep: 5.7
    },
    'punch-in-cut': {
      tl: function () { return [C('coffee', 0, 1.8), C('coffee', 1.8, 2.9, { s: 1.2, y: 10 }), C('coffee', 2.9, 4.2), C('coffee', 4.2, 5, { s: 1.18, y: 8 }), C('product', 5, 6.5), C('product', 6.5, 8, { s: 1.2 }), C('coffee', 8, 9.5), C('coffee', 9.5, 11, { s: 1.2, y: 10 }), C('coffee', 11, 12)]; },
      cap: 'burn', rep: 2.2
    },
    'b-roll-insert': {
      tl: function () { return [C('portrait', 0, 2.6, push(1.05, 1.1)), C('coffee', 2.6, 5.2, push(1, 1.08), { lab: 'B롤' }), C('portrait', 5.2, 6.8, push(1.1, 1.14)), C('product', 6.8, 9.4, push(1.02, 1.12), { lab: 'B롤' }), C('portrait', 9.4, 12, push(1.12, 1.18))]; },
      cap: 'burn', chip: function (t, T) { return curClip(T, t).lab ? 'B롤 · 목소리는 계속' : 'A롤'; }, rep: 3.4
    },
    'cold-open-hook': {
      tl: function () { return [C('product', 0, 0.8, push(1.6, 1.4)), C('coffee', 0.8, 1.6, { s: 1.6, y: 40 }), C('street', 1.6, 2.3, push(1.3, 1.15)), C('product', 2.3, 3, { s: 1.25 }), C('coffee', 3, 8, push(1, 1.06)), C('product', 8, 12, push(1, 1.08))]; },
      fx: [flashAt([0], 0.2)],
      ov: [function (T, o, t, F) {
        var R = F.FR;
        if (t < 3) {
          var s = popS(t, 0.05, 0.2), z1 = fit(o, '7시에만', R.h * 0.15, R.w * 0.8, 400, FF.hz), z2 = fit(o, '파는 커피', R.h * 0.15, R.w * 0.8, 400, FF.hz);
          o.save(); o.translate(R.x + R.w / 2, R.y + R.h * 0.42); o.scale(s, s);
          txt(o, '7시에만', 0, -z1 * 0.55, { size: z1, w: 400, font: FF.hz, fill: '#ffe14a', stroke: '#000', sw: z1 * 0.2, base: 'middle' });
          txt(o, '파는 커피', 0, z2 * 0.65, { size: z2, w: 400, font: FF.hz, fill: '#fff', stroke: '#000', sw: z2 * 0.2, base: 'middle' });
          o.restore();
          chip(o, '첫 3초 · ' + t.toFixed(1) + '초', R.x + R.w - 8, R.y + 8, { right: true, bg: 'rgba(255,77,77,.9)' });
        }
      }],
      rep: 1.0
    },
    'cut-on-action': {
      tl: function () {
        return [C('coffee', 0, 5, function (u, lt) { return { s: 1 + 0.5 * ein(lin(lt, 4.1, 5)) }; }),
          C('product', 5, 8, function (u, lt) { return { s: 1.25 + 0.35 * (1 - eout(lt / 0.9)), x: -60 * ein(lin(lt, 2.3, 3)) }; }),
          C('coffee', 8, 12, function (u, lt) { return { s: 1.25, x: 60 * (1 - eout(lt / 0.9)) }; })];
      },
      chip: chipFor([[4.4, 5.6, '움직임 중에 컷'], [7.4, 8.6, '움직임 중에 컷']]), rep: 5.15
    },
    'reaction-shot': {
      tl: function () { return [C('coffee', 0, 4), C('portrait', 4, 6, push(1.12, 1.24), { lab: '리액션' }), C('product', 6, 9), C('portrait', 9, 10.5, push(1.2, 1.3), { lab: '리액션' }), C('coffee', 10.5, 12)]; },
      chip: function (t, T) { return curClip(T, t).lab || null; }, rep: 4.8
    },
    'loop-edit': {
      tl: function () { return [C('coffee', 0, 5, push(1, 1.1)), C('product', 5, 8), C('coffee', 8, 12, push(1.1, 1))]; },
      cap: 'burn',
      panel: tlPanel(), pextra: function (T, o, t, PR, Rw) {
        var x0 = PX(PR, 0.1), x1 = PX(PR, 11.9), y = Rw[0].y + Rw[0].h * 0.45, dy = Rw[0].h * 0.42;
        o.strokeStyle = '#ffd34d'; o.lineWidth = 2; o.beginPath(); o.moveTo(x1, y); o.bezierCurveTo(x1, y + dy, x0, y + dy, x0 + 2, y + 4); o.stroke();
        arrow(o, x0 + 4, y + 10, x0 + 2, y + 2, '#ffd34d', 2, 7);
        setFont(o, 700, uk(9.5), FF.ui); o.fillStyle = '#ffd34d'; o.textAlign = 'center'; o.textBaseline = 'bottom'; o.fillText('끝 프레임 = 첫 프레임', (x0 + x1) / 2, y + dy * 0.7);
      },
      chip: chipFor([[11.4, 12, '∞ 처음으로 이어져요'], [0, 0.5, '∞ 처음으로 이어져요']]), rep: 11.7
    },
    'rough-cut': {
      panel: lanes(function (T) {
        return [{ name: '러프', v: [{ t0: 0, t1: 5.7, src: 'coffee' }, { t0: 5.7, t1: 6.1, src: 'black', lab: '' }, { t0: 6.1, t1: 9.6, src: 'product' }, { t0: 9.6, t1: 12, src: 'coffee' }] },
          { name: '파인', v: T.E.clips.map(function (c) { return { t0: c.t0, t1: c.t1, src: c.src }; }) }];
      }),
      pextra: function (T, o, t, PR, Rw) { setFont(o, 600, uk(9), FF.ui); o.fillStyle = '#ffd34d'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('프레임 단위로 다듬어요', PX(PR, 6.2), Rw[0].y + Rw[0].h / 2); },
      rep: 5.2
    },
    'paper-edit-term': {
      cap: 'burn',
      panel: scriptPanel([
        { s: '① 아침을 깨우는 한 잔', t0: 0.4, t1: 2.9, tag: '커피' }, { s: '② 직접 볶은 원두로', t0: 3.1, t1: 5.6, tag: '커피' },
        { s: '✕ 사실 저도 커피 잘 몰라요', cut: true, t0: 0, t1: 0 }, { s: '③ 매일 아침 7시 오픈', t0: 6, t1: 8.5, tag: '머그' },
        { s: '④ 모닝빈에서 만나요', t0: 8.9, t1: 11.6, tag: '커피' }
      ], { block: true, lh: 15, fs: 10.5, title: '페이퍼 에디트 · 쓸 문장과 순서' }),
      ph: 104, rep: 3.5
    },

    /* === 전환 === */
    'cross-dissolve': { tr: { type: 'dissolve', dur: 1.2 }, rep: 5.0 },
    'dip-to-black': { tr: { type: 'black', dur: 1.0 }, rep: 4.75 },
    'dip-to-white': { tr: { type: 'white', dur: 0.8 }, rep: 4.85 },
    'whip-pan-transition': { tl: function () { return [C('coffee', 0, 5), C('street', 5, 8, { s: 1.05 }), C('coffee', 8, 12)]; }, tr: { type: 'whip', dur: 0.45 }, rep: 4.95 },
    'zoom-transition': { tr: { type: 'zoom', dur: 0.6 }, rep: 4.85 },
    'glitch-transition': { tr: { type: 'glitch', dur: 0.5 }, rep: 4.9 },
    'luma-fade': { tr: { type: 'luma', dur: 1.4 }, rep: 5.0 },
    'wipe-transition': { tr: { type: 'wipe', dur: 0.8 }, rep: 5.0 },
    'spin-transition': { tr: { type: 'spin', dur: 0.8 }, rep: 4.85 },
    'morph-cut': {
      tl: function () { return [C('portrait', 0, 4, { s: 1.1, x: 0 }), C('portrait', 4, 8, { s: 1.24, x: -16, y: -6 }, { noTr: true }), C('portrait', 8, 12, { s: 1.1, x: 12 }, { tr: 'morph', trd: 0.8 })]; },
      chip: chipFor([[3.5, 4.6, '점프 컷 · 튀어요'], [7.5, 8.7, '모프 컷 · 부드러워요']]), rep: 8.0
    },
    'light-leak-transition': { tr: { type: 'leak', dur: 1.1 }, rep: 5.0 },
    'shape-mask-transition': { tr: { type: 'shape', dur: 1.3 }, rep: 5.1 },

    /* === 효과·VFX === */
    'glitch-effect': { fx: [glitchFx], rep: 1.45 },
    'vhs-look': { fx: [vhsFx], grade: G.vhs, ov: [vhsOv], rep: 2.0 },
    'rgb-split': { fx: [function (T, g, t) { var d = t % BEAT, a = 2 + 12 * Math.exp(-d * 8); rgbSplit(T, g, a, a * 0.25); }], gcam: function (t) { return { s: 1 + 0.04 * Math.exp(-(t % BEAT) * 8) }; }, rep: 0.62 },
    'film-burn': { fx: [filmBurnFx], rep: 5.0 },
    'light-leaks': { fx: [function (T, g, t) { leakOv(g, 0.6, frac(t / 7), 0.6); }], rep: 2.5 },
    'lens-flare-overlay': { fx: [flareFx], rep: 2 },
    'camera-shake': { gcam: shakeAt([0.5, 5, 8, 10], 14), fx: [flashAt([5, 8], 0.12, 'rgba(255,255,255,.6)')], rep: 5.05 },
    'speed-ramp': {
      tl: function () { return [C('coffee', 0, 12)]; },
      rate: function (t) { return kf([[0, 1], [1.5, 1], [2.0, 3], [3.2, 3], [3.8, 0.3], [6.6, 0.3], [7.2, 1], [8.6, 1], [9.0, 2.5], [10, 2.5], [10.6, 0.4], [11.6, 0.4], [12, 1]], t); },
      pre: [function (T, g, t) { var r = T.R.rate(t); T.mem.vt = (T.mem.vt || 0) + (T.dt || 0) * r; }],
      gcam: function (t, c, T) { var v = T.mem.vt || 0; return { s: 1.1, x: Math.sin(v * 0.9) * 28, y: Math.cos(v * 0.7) * 8 }; },
      ov: [ui(function (F) { return [F.FR.x, F.FR.y + F.FR.h, 1.8]; }, function (T, o, t, F) {
        var R = F.FR, x = R.x + 10, y = R.y + R.h - 44, w = 120, h = 32, rt = T.R.rate;
        o.fillStyle = 'rgba(0,0,0,.6)'; rr(o, x - 4, y - 4, w + 8, h + 8, 6); o.fill();
        o.strokeStyle = '#ffd34d'; o.lineWidth = 1.5; o.beginPath();
        for (var i = 0; i <= 60; i++) { var tt = i / 60 * 12, yy = y + h - (Math.log(rt(tt)) / Math.log(3) * 0.5 + 0.5) * h; if (i) o.lineTo(x + i / 60 * w, yy); else o.moveTo(x, yy); }
        o.stroke();
        var r = rt(t); o.fillStyle = '#fff'; o.beginPath(); o.arc(x + t / 12 * w, y + h - (Math.log(r) / Math.log(3) * 0.5 + 0.5) * h, 3, 0, TAU); o.fill();
        chip(o, r.toFixed(1) + '×', x + w + 10, y + 6, { bg: r < 0.8 ? 'rgba(80,140,255,.9)' : (r > 1.5 ? 'rgba(255,90,80,.9)' : 'rgba(0,0,0,.6)') });
      })],
      rep: 4.5
    },
    'freeze-frame': {
      tl: function () { return [C('coffee', 0, 9, push(1, 1.1)), C('product', 9, 12)]; },
      fx: [function (T, g, t) {
        if (t >= 4.5 && t < 7.5) {
          if (!T.mem.fz) T.mem.fz = copyP(T, T.buf('fz'));
          var z = 1 + 0.06 * eout((t - 4.5) / 3);
          g.save(); if (HASF) g.filter = 'saturate(.7) contrast(1.08)'; g.translate(LW / 2, LH / 2); g.scale(z, z); g.translate(-LW / 2, -LH / 2); full(g, T.mem.fz); g.restore();
          var u = (t - 4.5) / 0.3; if (u < 1) { g.fillStyle = '#fff'; g.globalAlpha = (1 - u) * (1 - u); g.fillRect(0, 0, LW, LH); g.globalAlpha = 1; }
        } else T.mem.fz = null;
      }],
      ov: [function (T, o, t, F) {
        if (t < 4.6 || t > 7.5) return;
        var R = F.FR, p = back((t - 4.6) / 0.35), x = R.x + R.w * 0.08, y = R.y + R.h * 0.62, s1 = R.h * 0.075, s2 = R.h * 0.045;
        o.save(); o.translate(x, y); o.rotate(-0.06); o.scale(p, p);
        var w = Math.max(tw(o, '모닝빈 시그니처 라떼', 400, s1, FF.hz), 10) + s1;
        o.fillStyle = '#ffe14a'; o.fillRect(0, -s1 * 1.1, w, s1 * 1.5);
        txt(o, '모닝빈 시그니처 라떼', s1 * 0.5, 0, { size: s1, w: 400, font: FF.hz, fill: '#1b1b1b', align: 'left' });
        o.fillStyle = '#111'; o.fillRect(s1 * 0.3, s1 * 0.5, w * 0.62, s2 * 1.6);
        txt(o, '판매 1위 메뉴', s1 * 0.55, s1 * 0.5 + s2 * 1.18, { size: s2, w: 700, font: FF.nk, fill: '#fff', align: 'left' });
        o.restore();
      }],
      rep: 5.4
    },
    'echo-trail': {
      tl: function () { return [C('coffee', 0, 12)]; },
      gcam: function (t) { return { s: 1.32, x: Math.sin(t * 1.7) * 60, r: Math.sin(t * 1.7) * 0.035 }; },
      fx: [function (T, g, t) {
        var A = T.buf('echo'), a = A._x, cur = copyP(T, T.buf('ecur'));
        a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over'; a.globalAlpha = T.playing || T.aud ? 0.3 : 1; a.drawImage(T.P, 0, 0); a.globalAlpha = 1;
        full(g, A); g.globalCompositeOperation = 'lighten'; full(g, cur, 0.8); g.globalCompositeOperation = 'source-over';
      }],
      rep: 2.4
    },
    'defocus-blur': {
      fx: [function (T, g, t) {
        var a = Math.max(1 - lin(t, 0, 1.0), lin(t, 4.3, 5) * (t < 5 ? 1 : 0), (t >= 5 && t < 5.8) ? 1 - lin(t, 5, 5.8) : 0, (t >= 7.3 && t < 8) ? lin(t, 7.3, 8) : 0, (t >= 8 && t < 8.8) ? 1 - lin(t, 8, 8.8) : 0, lin(t, 11.2, 12));
        a = sm(a); if (a < 0.02) return;
        var src = copyP(T, T.buf('bl')); blurDraw(g, src, a * 0.85, 0, 0, LW, LH);
      }],
      rep: 0.45
    },
    'vignette': { grade: { vig: 0.78, f: 'contrast(1.04)' }, split: one(0.5), splitL: ['원본', '비네트'], rep: 2 },
    'chroma-key': {
      tl: function () { return [C('coffee', 0, 12, null, { draw: keyComp('street', { s: 0.82, y: 26, wipe: [0.4, 2.0] }) })]; },
      ov: [baOv(['키잉', '원본'])], chip: '청록 배경 → 거리', rep: 4
    },
    'magic-mask': {
      tl: function () { return [C('coffee', 0, 12, push(1, 1.08), { draw: function (T, g, t, cam) {
        var v = T.img('coffee'); if (!v) return;
        g.save(); if (HASF) g.filter = 'grayscale(1) brightness(.42)'; drawImgCam(g, v, 'coffee', cam); g.restore();
        if (!HASF) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, LW, LH); }
        var k = T.keyed(); if (!k) return;
        g.save(); g.shadowColor = 'rgba(80,240,255,.9)'; g.shadowBlur = 14; drawImgCam(g, k, 'coffee', cam); g.restore();
        drawImgCam(g, k, 'coffee', cam);
      } })]; },
      chip: '피사체만 분리', rep: 3
    },
    'clone-effect': {
      tl: function () { return [C('coffee', 0, 12, null, { draw: function (T, g, t, cam) {
        var v = T.img('coffee'); if (!v) return; drawImgCam(g, v, 'coffee', cam);
        var k = T.keyed(); if (!k) return;
        var L = [[1.0, -190, 40, 0.56], [2.0, 205, 40, 0.56]];
        for (var i = 0; i < L.length; i++) { var s = popS(t, L[i][0], 0.3); if (t < L[i][0]) continue; drawImgCam(g, k, 'coffee', { s: L[i][3] * s, x: L[i][1], y: L[i][2] }); }
      } })]; },
      rep: 3
    },
    'split-screen': {
      tl: function () { return [C('coffee', 0, 12, null, { draw: function (T, g, t) {
        var S = ['coffee', 'product', 'street'], w = (LW - 8) / 3;
        g.fillStyle = '#000'; g.fillRect(0, 0, LW, LH);
        for (var i = 0; i < 3; i++) {
          var img = T.img(S[i]); if (!img) continue;
          var x0 = i * (w + 4), off = 0;
          g.save(); g.beginPath(); g.rect(x0, off, w, LH); g.clip();
          var an = ANCH[S[i]]; drawImgCam(g, img, S[i], { s: 1.15 + 0.05 * Math.sin(t * 0.4 + i), x: x0 + w / 2 - an[0] * LW, y: off });
          g.restore();
        }
      } })]; },
      rep: 3
    },
    'picture-in-picture': {
      tl: function () { return [C('coffee', 0, 12, push(1, 1.06))]; },
      fx: [function (T, g, t) {
        var im = T.img('portrait'); if (!im) return;
        var p = 1;
        var w = LW * 0.3, h = w * 9 / 16, x = LW - w - 16, y = LH - h - 16;
        g.save(); g.translate(x + w, y + h); g.scale(p, p); g.translate(-(x + w), -(y + h));
        g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 14; g.fillStyle = '#fff'; rr(g, x - 3, y - 3, w + 6, h + 6, 10); g.fill(); g.shadowColor = 'transparent';
        rr(g, x, y, w, h, 8); g.clip();
        var z = 1.6 + 0.05 * Math.sin(t), sw = 960 / z, sh = 540 / z, sx = clamp(ANCH.portrait[0] * 960 - sw / 2, 0, 960 - sw), sy = clamp(ANCH.portrait[1] * 540 - sh / 2, 0, 540 - sh);
        g.drawImage(im, sx, sy, sw, sh, x, y, w, h);
        g.restore();
      }],
      rep: 2
    },
    'mirror-kaleidoscope': {
      tl: function () { return [C('coffee', 0, 12, function (u, lt) { return { s: 1.35, x: Math.sin(lt * 0.6) * 40, r: Math.sin(lt * 0.4) * 0.08 }; })]; },
      fx: [function (T, g, t) {
        var src = copyP(T, T.buf('mir'));
        if (t < 6) { g.save(); g.beginPath(); g.rect(LW / 2, 0, LW / 2, LH); g.clip(); g.translate(LW, 0); g.scale(-1, 1); sub(g, src, 0, 0, LW / 2, LH, 0, 0, LW / 2, LH); g.restore(); }
        else {
          var q = [[1, 1, 0, 0], [-1, 1, LW, 0], [1, -1, 0, LH], [-1, -1, LW, LH]];
          for (var i = 0; i < 4; i++) { g.save(); g.translate(q[i][2], q[i][3]); g.scale(q[i][0], q[i][1]); sub(g, src, 34, 63, 260, 146, 0, 0, LW / 2, LH / 2); g.restore(); }
        }
      }],
      chip: chipFor([[0, 6, '미러'], [6, 12, '만화경']]), rep: 7.5
    },
    'particle-overlay': { fx: [particleFx], rep: 2 },
    'film-grain-overlay': { grade: { grain: 0.55, f: 'contrast(1.05) saturate(.92)', fb: [] }, split: one(0.5), splitL: ['원본', '그레인'], rep: 2 },
    'blur-censor': {
      tl: function () { return [C('coffee', 0, 3.5), C('portrait', 3.5, 12, push(1.0, 1.15))]; },
      fx: [function (T, g, t) {
        var c = curClip(T, t); if (c.src !== 'portrait') return;
        var cam = camOf(T, c, t), a = camPt('portrait', cam, 0.4, 0.14), b = camPt('portrait', cam, 0.62, 0.7);
        var src = copyP(T, T.buf('cen')); pixelate(g, src, a[0], a[1], b[0] - a[0], b[1] - a[1], 14);
      }],
      chip: function (t, T) { return curClip(T, t).src === 'portrait' ? '얼굴 모자이크 · 따라가요' : null; }, rep: 6
    },
    'text-behind-subject': {
      tl: function () { return [C('coffee', 0, 12, push(1, 1.08), { draw: function (T, g, t, cam) {
        var v = T.img('coffee'); if (!v) return; drawImgCam(g, v, 'coffee', cam);
        var p = eout((t - 0.3) / 0.9), y = LH * 0.29 + (1 - p) * 40, sz = 112;
        g.save(); g.globalAlpha = clamp(p * 1.3, 0, 1); g.beginPath(); g.rect(0, 0, LW, LH * 0.6); g.clip();
        g.font = '400 ' + sz + 'px ' + FF.hz; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff6e6'; g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 10; g.fillText('MORNING', LW / 2, y);
        g.restore();
        keyedOver(T, g, cam);
      } })]; },
      rep: 3
    },

    /* === 자막 === */
    'burned-in-captions': { cap: 'burn', rep: 1.6 },
    'closed-captions-srt': { cap: 'cc', rep: 1.6 },
    'auto-captions': { cap: 'auto', chip: '자동 자막', rep: 5.4 },
    'karaoke-highlight': { cap: 'karaoke', rep: 1.5 },
    'hormozi-captions': { cap: 'hormozi', rep: 2.3 },
    'one-word-captions': { cap: 'oneword', rep: 1.4 },
    'emoji-captions': { cap: 'emoji', rep: 2.4 },
    'lower-third': { cap: 'lower3', rep: 2.2 },
    'kinetic-typography': { cap: 'kinetic', rep: 2.5 },
    'yeneung-color-caption': { cap: 'yeneung', rep: 1.6 },
    'effect-caption': { cap: 'effect', gcam: shakeAt([4.92], 10), rep: 5.15 },
    'speech-bubble-caption': { cap: 'bubble', rep: 2 },
    'situation-caption': { cap: 'situation', rep: 2 },
    'title-safe': { cap: 'safe', rep: 1.6 },
    'chars-per-line': { cap: 'cpl', rep: 4.2 },
    'reading-speed-cps': { cap: 'cps', rep: 1.6 },
    'line-break-rules': { cap: 'linebreak', rep: 4.2 },
    'speaker-labels': { cap: 'speaker', rep: 1.6 },
    'sdh-sound-cues': { cap: 'sdh', rep: 5.2 },
    'translated-subtitles': { cap: 'trans', rep: 1.6 },
    'caption-position': { cap: 'pos', rep: 1.6 },
    'caption-stroke-shadow': { tl: function () { return [C('product', 0, 12, push(1.05, 1.15, 0, -10))]; }, cap: 'stroke', rep: 1.6 },

    /* === 색보정 === */
    'color-correction': { grade: G.correct, split: sweep, splitL: ['원본', '보정'], rep: 2 },
    'color-grading': { grade: G.warm, split: sweep, splitL: ['보정만', '그레이딩'], rep: 2 },
    'lut': {
      fx: [gradeFx(function (t) { return LUTS[Math.floor(t / 4) % 3][1]; })],
      chip: function (t) { return 'LUT · ' + LUTS[Math.floor(t / 4) % 3][0]; }, rep: 5.5
    },
    'teal-orange': { grade: G.teal, split: sweep, splitL: ['원본', '틸 앤 오렌지'], rep: 2 },
    'film-emulation': { grade: G.film, split: sweep, splitL: ['디지털', '필름 룩'], rep: 2 },
    'day-for-night': { grade: G.night, split: sweep, splitL: ['낮', '밤'], rep: 2 },
    'skin-tone-line': {
      tl: function () { return [C('portrait', 0, 12, push(1.05, 1.15))]; },
      fx: [gradeFx(function (t) { return t < 6 ? { f: 'hue-rotate(-14deg) saturate(1.05)', L: [['soft-light', '#7cff9a', 0.35]] } : { f: 'saturate(1.02)', L: [['soft-light', '#ffb88a', 0.12]] }; })],
      ov: [function (T, o, t, F) {
        var R = F.FR, r = Math.min(46, R.h * 0.15), cx = R.x + R.w - r - 14, cy = R.y + R.h - r - 14;
        if (!VSC) { VSC = mkC(64, 36); VSC._x = VSC.getContext('2d', { willReadFrequently: true }); }
        if (!T.mem.vs || Math.abs((T.mem.vst || 0) - t) > 0.2 || !T.playing) {
          var x = VSC._x; x.drawImage(T.P, 0, 0, 64, 36);
          try { T.mem.vs = x.getImageData(0, 0, 64, 36).data; } catch (e) { T.mem.vs = null; } T.mem.vst = t;
        }
        o.fillStyle = 'rgba(10,10,12,.82)'; o.beginPath(); o.arc(cx, cy, r + 6, 0, TAU); o.fill();
        o.strokeStyle = 'rgba(255,255,255,.25)'; o.lineWidth = 1; o.beginPath(); o.arc(cx, cy, r, 0, TAU); o.stroke();
        o.beginPath(); o.moveTo(cx - r, cy); o.lineTo(cx + r, cy); o.moveTo(cx, cy - r); o.lineTo(cx, cy + r); o.stroke();
        var sa = 123 * Math.PI / 180; o.strokeStyle = '#ffd34d'; o.lineWidth = 1.4; o.beginPath(); o.moveTo(cx, cy); o.lineTo(cx + Math.cos(sa) * r, cy - Math.sin(sa) * r); o.stroke();
        var d = T.mem.vs;
        if (d) {
          o.fillStyle = 'rgba(160,255,190,.55)';
          for (var i = 0; i < d.length; i += 8) {
            var rr0 = d[i] / 255, gg = d[i + 1] / 255, bb = d[i + 2] / 255, u = -0.169 * rr0 - 0.331 * gg + 0.5 * bb, v = 0.5 * rr0 - 0.419 * gg - 0.081 * bb;
            o.fillRect(cx + u * r * 2.4 - 0.8, cy - v * r * 2.4 - 0.8, 1.6, 1.6);
          }
        }
        setFont(o, 600, uk(9), FF.ui); o.fillStyle = '#ffd34d'; o.textAlign = 'center'; o.textBaseline = 'top'; o.fillText('스킨톤 라인', cx, cy + r + 8);
      }],
      chip: chipFor([[0, 6, '피부가 푸르게 떠요'], [6, 12, '라인에 맞췄어요']]), rep: 8
    },
    'contrast-curve': {
      grade: G.scurve, split: one(0.5), splitL: ['원본', 'S커브'],
      ov: [ui(function (F) { return [F.FR.x + F.FR.w, F.FR.y, 1.8]; }, function (T, o, t, F) {
        var R = F.FR, s = 52, x = R.x + R.w - s - 14, y = R.y + 12;
        o.fillStyle = 'rgba(10,10,12,.78)'; rr(o, x - 6, y - 6, s + 12, s + 12, 6); o.fill();
        o.strokeStyle = 'rgba(255,255,255,.3)'; o.lineWidth = 1; o.strokeRect(x, y, s, s); o.beginPath(); o.moveTo(x, y + s); o.lineTo(x + s, y); o.stroke();
        o.strokeStyle = '#ffd34d'; o.lineWidth = 2; o.beginPath(); o.moveTo(x, y + s); o.bezierCurveTo(x + s * 0.45, y + s, x + s * 0.55, y, x + s, y); o.stroke();
      })],
      rep: 2
    },
    'shot-matching': {
      tl: function () { return [C('coffee', 0, 12, null, { draw: function (T, g, t) {
        var w = (LW - 4) / 2, S = ['coffee', 'product'];
        for (var i = 0; i < 2; i++) {
          var img = T.img(S[i]); if (!img) continue; var x0 = i * (w + 4), an = ANCH[S[i]];
          g.save(); g.beginPath(); g.rect(x0, 0, w, LH); g.clip();
          if (i === 1 && t >= 6 && HASF) g.filter = 'sepia(.28) saturate(1.15) brightness(.9) contrast(1.06)';
          drawImgCam(g, img, S[i], { s: 1.2, x: x0 + w / 2 - an[0] * LW });
          g.filter = 'none';
          if (i === 1 && t >= 6) { g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.35; g.fillStyle = '#ff9a5a'; g.fillRect(x0, 0, w, LH); g.globalAlpha = 0.25; g.fillStyle = '#2e8a74'; g.globalCompositeOperation = 'soft-light'; g.fillRect(x0, 0, w, LH); }
          g.restore();
        }
      } })]; },
      chip: chipFor([[0, 6, '맞추기 전 · 톤이 달라요'], [6, 12, '맞춘 후 · 같은 공간 같아요']]), rep: 8
    },
    'hdr-sdr': { tl: function () { return [C('street', 0, 12, push(1.0, 1.08))]; }, grade: G.hdr, splitRaw: G.sdr, split: one(0.5), splitL: ['SDR · 하늘이 날아가요', 'HDR · 밝은 곳까지 살아요'], rep: 2 },
    'white-balance': {
      tl: function () { return [C('product', 0, 12, push(1.02, 1.1))]; },
      fx: [gradeFx(function (t) { return t < 4 ? { f: 'sepia(.35) saturate(1.3)', L: [['soft-light', '#ff9a2a', 0.55]] } : (t < 8 ? { f: 'saturate(1.1)', L: [['soft-light', '#4a8cff', 0.6], ['multiply', '#d8e6ff', 0.5]] } : null); })],
      chip: chipFor([[0, 4, '3200K · 누렇게 떠요'], [4, 8, '9000K · 푸르게 떠요'], [8, 12, '5600K · 흰색이 흰색이에요']]), rep: 9
    },
    'black-and-white': { grade: G.bw, split: sweep, splitL: ['컬러', '흑백'], rep: 2 },

    /* === 오디오 편집 === */
    'audio-ducking': {
      panel: lanes(function (T) {
        var vi = vOf(T), e = vi ? function (t) { return envAt(DUCK, t); } : one(1);
        return [{ name: '목소리', clips: [{ k: 'voice', t0: 0, t1: 12, col: LC.v, wc: WC.v }] }, { name: '음악', clips: [{ k: 'bed', t0: 0, t1: 12, col: LC.m, wc: WC.m, g: e, env: e }] }];
      }),
      audio: { keys: ['voice', 'bed'], v: ['전', '후'], mix: function (M, vi) { M.play('voice', { dur: 12 }); M.play('bed', { dur: 12.2, gain: 0.5, env: vi ? DUCK : [[0, 1], [12, 1]] }); } }, rep: 2
    },
    'room-tone': {
      panel: lanes(function (T) {
        var vi = vOf(T), L = [{ name: '목소리', clips: [{ k: 'voice', t0: 0, t1: 12, col: LC.v, wc: WC.v }], gaps: GAPS12 }];
        L.push({ name: '룸톤', clips: vi ? [{ k: 'room', t0: 0, t1: 12, col: LC.r, wc: WC.r, g: 0.5 }] : [] });
        return L;
      }),
      audio: abMix(['voice','room'], function (M, vi) {
        var e = [[0, 1]]; for (var i = 0; i < GAPS12.length; i++) { e.push([GAPS12[i][0], 1], [GAPS12[i][0] + 0.005, 0], [GAPS12[i][1] - 0.005, 0], [GAPS12[i][1], 1]); }
        M.play('voice', { dur: 12, env: e });
        if (vi) M.play('room', { dur: 12, gain: 0.09 });
      }), rep: 5
    },
    'whoosh-sfx': {
      tl: function () { var b = BASE(); b[1].tr = 'whip'; b[2].tr = 'whip'; return b; },
      panel: lanes(function (T) { return [{ name: '음악', clips: [{ k: 'bed', t0: 0, t1: 12, col: LC.m, wc: WC.m, g: 0.5 }] }, vOf(T) ? sfxLane('효과음', [[4.72, 'whoosh', 0.75], [7.72, 'whoosh', 0.75]]) : { name: '효과음', clips: [] }]; }),
      audio: abMix(['bed','whoosh'], function (M, vi) { M.play('bed', { dur: 12, gain: 0.35 }); if (vi) { M.play('whoosh', { t: 4.72, gain: 0.9 }); M.play('whoosh', { t: 7.72, gain: 0.9 }); } }),
      akeys: ['whoosh'], rep: 5
    },
    'riser-sfx': {
      tl: function () { var b = BASE(); b[1].tr = 'flash'; return b; },
      panel: lanes(function (T) { return [{ name: '음악', clips: [{ k: 'bed', t0: 0, t1: 12, col: LC.m, wc: WC.m, g: 0.5 }] }, vOf(T) ? { name: '효과음', clips: [{ k: 'riser', t0: 2.6, t1: 5.0, col: LC.s, wc: WC.s }, { k: 'impact', t0: 5.0, t1: 6.2, col: LC.s, wc: WC.s }], marks: [[5, '공개']] } : { name: '효과음', clips: [] }]; }),
      audio: abMix(['bed','riser','impact'], function (M, vi) { M.play('bed', { dur: 12, gain: 0.32 }); if (vi) { M.play('riser', { t: 2.6, gain: 0.8 }); M.play('impact', { t: 5.0, gain: 0.9 }); } }),
      akeys: ['riser', 'impact'], rep: 4.6
    },
    'impact-hit': {
      gcam: shakeAt([0.5, 5, 8], 12), fx: [flashAt([5, 8], 0.12, 'rgba(255,255,255,.55)')], cap: 'hormozi',
      panel: lanes(function (T) { return [{ name: '음악', clips: [{ k: 'bed', t0: 0, t1: 12, col: LC.m, wc: WC.m, g: 0.5 }] }, vOf(T) ? sfxLane('효과음', [[0.5, 'impact', 1.1], [5, 'impact', 1.1], [8, 'impact', 1.1]]) : { name: '효과음', clips: [] }]; }),
      audio: abMix(['bed','impact'], function (M, vi) { M.play('bed', { dur: 12, gain: 0.4 }); if (vi) { M.play('impact', { t: 0.5, gain: 0.9 }); M.play('impact', { t: 5, gain: 0.9 }); M.play('impact', { t: 8, gain: 0.9 }); } }),
      akeys: ['impact'], rep: 5.05
    },
    'music-bed': {
      panel: lanes(function (T) { var vi = vOf(T); return [{ name: '목소리', clips: [{ k: 'voice', t0: 0, t1: 12, col: LC.v, wc: WC.v }] }, { name: '음악', clips: vi ? [{ k: 'bed', t0: 0, t1: 12, col: LC.m, wc: WC.m, g: 0.32, env: function (t) { return 0.32 * Math.min(1, t / 1, (12 - t) / 1.2); } }] : [] }]; }),
      audio: abMix(['voice','bed'], function (M, vi) { M.play('voice', { dur: 12 }); if (vi) M.play('bed', { dur: 12, gain: 0.16, env: [[0, 0], [1, 1], [10.8, 1], [12, 0]] }); }), rep: 3
    },
    'beat-drop-sync': {
      tl: function () { return [C('coffee', 0, 4.8, push(1, 1.08), { f: 'saturate(.6) brightness(.8)' }), C('product', 4.8, 8, function (u, lt) { return { s: 1.0 + 0.25 * (1 - eout(lt / 0.5)) }; }), C('coffee', 8, 12, push(1.1, 1.0), { f: 'saturate(1.2) contrast(1.08)' })]; },
      fx: [flashAt([4.8], 0.3)],
      panel: lanes(function (T) { var vi = vOf(T), off = vi ? 0 : 1.4; return [{ name: '영상', v: T.E.clips.map(function (c) { return { t0: c.t0, t1: c.t1, src: c.src }; }), marks: [[4.8, '공개']] }, { name: '음악', clips: [{ k: 'drop', t0: off, t1: 12, col: LC.m, wc: WC.m }], marks: [[4.8 + off, '드롭', vi ? '#9ff0b8' : '#ff6b6b']] }]; }),
      audio: abMix(['drop'], function (M, vi) { M.play('drop', { t: vi ? 0 : 1.4, dur: vi ? 12 : 10.6, gain: 0.9 }); }), akeys: ['drop'], rep: 4.9
    },
    'voice-enhance': {
      panel: lanes(function (T) { var vi = vOf(T); return [{ name: vi ? '향상 후' : '원본', clips: [{ k: 'voice', t0: 0, t1: 12, col: vi ? LC.a : LC.v, wc: vi ? WC.a : WC.v }].concat(vi ? [] : [{ k: 'hiss', t0: 0, t1: 12, col: 'rgba(0,0,0,0)', wc: 'rgba(255,120,120,.6)', g: 0.18 }]) }]; }),
      audio: abMix(['voice','hiss'], function (M, vi, ac) {
        if (!vi) {
          var lp = M.node(ac.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(M.out);
          var cv = M.node(ac.createConvolver()), wet = M.node(ac.createGain()); cv.buffer = irBuf(ac); wet.gain.value = 0.55; cv.connect(wet); wet.connect(M.out);
          var dry = M.play('voice', { dur: 12, dest: lp }); if (dry) dry.connect(cv);
          M.play('hiss', { dur: 12, gain: 0.07 });
        } else {
          var hp = M.node(ac.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 90;
          var pk = M.node(ac.createBiquadFilter()); pk.type = 'peaking'; pk.frequency.value = 3200; pk.gain.value = 4; pk.Q.value = 0.8;
          var cp = M.node(ac.createDynamicsCompressor()); cp.threshold.value = -22; cp.ratio.value = 3.5;
          var mk2 = M.node(ac.createGain()); mk2.gain.value = 1.5;
          hp.connect(pk); pk.connect(cp); cp.connect(mk2); mk2.connect(M.out);
          M.play('voice', { dur: 12, dest: hp });
        }
      }), rep: 3
    },
    'dialogue-isolation': {
      panel: lanes(function (T) { var vi = vOf(T); return [{ name: '대사', clips: [{ k: 'voice', t0: 0, t1: 12, col: LC.v, wc: WC.v }] }, { name: '배경음', clips: [{ k: 'street', t0: 0, t1: 12, col: LC.a, wc: WC.a, g: vi ? 0.15 : 1, env: one(vi ? 0.15 : 1) }] }, { name: '울림', clips: [{ k: 'room', t0: 0, t1: 12, col: LC.r, wc: WC.r, g: vi ? 0.1 : 0.7, env: one(vi ? 0.1 : 0.7) }] }]; }),
      audio: abMix(['voice','street','room'], function (M, vi) { M.play('voice', { dur: 12 }); M.play('street', { dur: 12, gain: vi ? 0.05 : 0.5 }); M.play('room', { dur: 12, gain: vi ? 0.02 : 0.2 }); }), rep: 3
    },
    'loudness-normalization': {
      panel: loudPanel(null),
      audio: abMix(['voice'], function (M, vi, ac) {
        if (!vi) { M.play('voice', { dur: 12 }); return; }
        var cp = M.node(ac.createDynamicsCompressor()); cp.threshold.value = -10; cp.ratio.value = 8; cp.knee.value = 6; cp.attack.value = 0.003; cp.release.value = 0.15; cp.connect(M.out);
        M.play('voice', { dur: 12, gain: 2.19, dest: cp });
      }), akeys: ['voice'], rep: 3
    },
    'silence-removal': {
      tl: function () { return SILC.map(function (s, i) { return C('coffee', s.t0, s.t1, { s: i % 2 ? 1.14 : 1.0, y: i % 2 ? -6 : 0 }); }); },
      panel: lanes(function () {
        return [{ name: '원본', clips: [{ k: 'voice', t0: 0, t1: 12, col: LC.v, wc: WC.v }], gaps: GAPS12 },
          { name: '삭제 후', clips: SILC.map(function (s) { return { k: 'voice', t0: s.t0, t1: s.t1, off: s.a, col: LC.a, wc: WC.a }; }) }];
      }),
      audio: abMix(['voice'], function (M, vi) {
        if (!vi) { M.play('voice', { dur: 12 }); return; }
        for (var i = 0; i < SILC.length; i++) { var s = SILC[i]; M.play('voice', { t: s.t0, off: s.a, dur: s.t1 - s.t0, env: [[0, 0], [s.t0, 0], [s.t0 + 0.02, 1], [s.t1 - 0.02, 1], [s.t1, 0]] }); }
      }), chip: '말 사이 빈 곳을 잘랐어요', rep: 4.8
    },
    'audio-crossfade': {
      panel: lanes(function (T) {
        var vi = vOf(T), a = vi ? 6.3 : 6, b = vi ? 5.7 : 6;
        return [{ name: '음악', clips: [{ k: 'bed', t0: 0, t1: a, col: LC.m, wc: WC.m, env: vi ? function (t) { return 1 - lin(t, 5.7, 6.3); } : null }] },
          { name: '거리 소리', clips: [{ k: 'street', t0: b, t1: 12, off: b, col: LC.a, wc: WC.a, env: vi ? function (t) { return lin(t, 5.7, 6.3); } : null }] }];
      }),
      tl: function () { return [C('coffee', 0, 6), C('street', 6, 12, push(1, 1.08))]; },
      audio: abMix(['bed','street'], function (M, vi) {
        if (!vi) { M.play('bed', { dur: 6, gain: 0.7 }); M.play('street', { t: 6, off: 6, dur: 6, gain: 0.9 }); }
        else { M.play('bed', { dur: 6.4, gain: 0.7, env: [[0, 1], [5.7, 1], [6.3, 0]] }); M.play('street', { t: 5.7, off: 5.7, dur: 6.3, gain: 0.9, env: [[0, 0], [5.7, 0], [6.3, 1], [12, 1]] }); }
      }), rep: 6
    },
    'music-remix-length': {
      panel: lanes(function (T) {
        var vi = vOf(T);
        return [{ name: '원곡', clips: [{ k: 'bed', t0: 0, t1: 12, col: vi ? 'rgba(180,120,255,.1)' : LC.m, wc: vi ? 'rgba(212,178,255,.35)' : WC.m }], marks: [[11.85, '뚝', '#ff6b6b']] },
          { name: '맞춤', clips: [{ k: 'end', t0: 0, t1: 12, col: vi ? LC.a : 'rgba(70,200,150,.1)', wc: vi ? WC.a : 'rgba(140,235,200,.35)' }], marks: [[10.8, '끝 화음']] }];
      }),
      audio: abMix(['bed','end'], function (M, vi) { if (!vi) M.play('bed', { dur: 12, gain: 0.85 }); else M.play('end', { dur: 12.8, gain: 0.85 }); }), akeys: ['bed', 'end'], rep: 11
    },
    'ambience-bed': {
      tl: function () { return [C('product', 0, 6, push(1, 1.08)), C('coffee', 6, 12)]; },
      panel: lanes(function (T) { var vi = vOf(T); return [{ name: '목소리', clips: [{ k: 'voice', t0: 0, t1: 12, col: LC.v, wc: WC.v }] }, { name: '카페 소음', clips: vi ? [{ k: 'cafe', t0: 0, t1: 12, col: LC.a, wc: WC.a, g: 0.5 }] : [] }]; }),
      audio: abMix(['voice','cafe'], function (M, vi) { M.play('voice', { dur: 12 }); if (vi) M.play('cafe', { dur: 12, gain: 0.3, env: [[0, 0], [0.8, 1], [11.2, 1], [12, 0]] }); }), rep: 3
    },

    /* === 화면비·프레이밍 === */
    'vertical-9-16': { frame: 'vertical', rep: 2 },
    'square-1-1': {
      frame: 'square',
      ov: [function (T, o, t, F) { var R = F.FR, w = R.h * 0.8, x = R.x + (R.w - w) / 2; o.setLineDash([5, 4]); o.strokeStyle = 'rgba(255,211,77,.95)'; o.lineWidth = 1.4; o.strokeRect(x, R.y + 2, w, R.h - 4); o.setLineDash([]); chip(o, '4:5', x + 4, R.y + R.h - 6, { bg: 'rgba(255,211,77,.9)', fg: '#111', up: true }); }],
      rep: 2
    },
    'landscape-16-9': {
      ov: [function (T, o, t, F) {
        var R = F.FR, h = 34 * Math.min(UIK, 1.6), y = R.y + R.h - h, gr = o.createLinearGradient(0, y - 20, 0, R.y + R.h);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)'); o.fillStyle = gr; o.fillRect(R.x, y - 20, R.w, h + 20);
        var bx = R.x + 12, bw = R.w - 24, by = y + 4;
        o.fillStyle = 'rgba(255,255,255,.3)'; o.fillRect(bx, by, bw, 3); o.fillStyle = '#ff2b2b'; o.fillRect(bx, by, bw * t / 12, 3);
        o.beginPath(); o.arc(bx + bw * t / 12, by + 1.5, 5, 0, TAU); o.fill();
        o.fillStyle = '#fff'; o.beginPath(); o.moveTo(bx + 2, by + 12); o.lineTo(bx + 12, by + 18); o.lineTo(bx + 2, by + 24); o.closePath(); o.fill();
        setFont(o, 600, uk(10.5), FF.ui); o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('0:' + (t < 10 ? '0' : '') + Math.floor(t) + ' / 0:12', bx + 22, by + 18);
        o.textAlign = 'right'; o.fillText('1920×1080 · 16:9', bx + bw, by + 18);
      }],
      rep: 4
    },
    'auto-reframe': {
      frame: 'auto', gcam: function (t, c) { return c.src === 'coffee' ? { s: 1.25, x: Math.sin(t * 0.8) * 80 } : null; },
      ov: [function (T, o, t, F) {
        var c = curClip(T, t), an = ANCH[c.src], p = track(T, F, t, an[0], an[1]), s = F.sc(150);
        o.strokeStyle = '#4df0ff'; o.lineWidth = 1.5; o.setLineDash([4, 3]); o.strokeRect(p[0] - s * 0.6, p[1] - s * 0.62, s * 1.2, s * 1.1); o.setLineDash([]);
        chip(o, 'AI 추적', p[0] - s * 0.6, p[1] - s * 0.62 - 3, { bg: 'rgba(0,150,170,.9)', up: true });
      }],
      rep: 3
    },
    'letterbox': { frame: 'letterbox', chip: '2.39:1', rep: 3 },
    'blur-fill': { frame: 'blurfill', rep: 2 },
    'ken-burns': {
      tl: function () { return [C('product', 0, 4, push(1, 1.25, 0, 30, 0, -10)), C('street', 4, 8, push(1.25, 1.06, 0, 0, -20, 8)), C('portrait', 8, 12, push(1.02, 1.3, 0, 0, 0, 20))]; },
      rep: 2
    },
    'stabilization': { frame: 'stabilize', rep: 2.3 },
    'digital-zoom-crop': { frame: 'zoomcrop', chip: function (t) { return t > 2.6 && t < 9.4 ? '크롭 160% · 4K 원본이라 선명해요' : '4K 원본'; }, rep: 1.6 },
    'shorts-safe-zone': {
      frame: 'short',
      ov: [function (T, o, t, F) {
        var R = F.FR, x = R.x, y = R.y, w = R.w, h = R.h;
        o.fillStyle = 'rgba(255,60,60,.18)'; o.fillRect(x, y + h * 0.8, w, h * 0.2); o.fillRect(x + w * 0.84, y + h * 0.35, w * 0.16, h * 0.45); o.fillRect(x, y, w, h * 0.08);
        o.setLineDash([4, 3]); o.strokeStyle = 'rgba(120,255,160,.9)'; o.lineWidth = 1.2; o.strokeRect(x + w * 0.06, y + h * 0.1, w * 0.76, h * 0.68); o.setLineDash([]);
        var c = capAt(t); if (c) burnLines(o, [c.text], R, 0.6, { alpha: cAlpha(t, c.t0, c.t1), size: h * 0.05 });
        var ix = x + w * 0.92, ic = ['♥', '💬', '↗', '⟳'], lb = ['1.2만', '318', '공유', '리믹스'];
        for (var i = 0; i < 4; i++) {
          var iy = y + h * (0.42 + i * 0.1);
          o.fillStyle = 'rgba(0,0,0,.35)'; o.beginPath(); o.arc(ix, iy, 10, 0, TAU); o.fill();
          o.font = '12px ' + EMOJI_F; o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(ic[i], ix, iy + 0.5);
          setFont(o, 600, uk(7.5), FF.ui); o.fillText(lb[i], ix, iy + 16);
        }
        setFont(o, 700, uk(9), FF.ui); o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
        o.fillText('@morningbean', x + 10, y + h * 0.84);
        setFont(o, 500, uk(8), FF.ui); o.fillText('아침을 깨우는 한 잔 #카페', x + 10, y + h * 0.89); o.fillText('♪ 모닝빈 · 오리지널 사운드', x + 10, y + h * 0.94);
        setFont(o, 700, uk(10), FF.ui); o.fillText('Shorts', x + 10, y + h * 0.04);
        chip(o, '세이프존', x + w * 0.06 + 2, y + h * 0.1 + 2, { bg: 'rgba(40,160,80,.9)', size: 9 });
      }],
      rep: 1.6
    },
    'image-to-video-insert': {
      tl: function () { return [C('coffee', 0, 4), C('product', 4, 9, null, { draw: function (T, g, t, cam, c) {
        var im = STILL.product; if (!im) return; var u = (t - c.t0) / (c.t1 - c.t0);
        drawImgCam(g, im, 'product', { s: lerp(1.04, 1.1, u), x: lerp(-6, 8, u) });
        var B = T.buf('fg'), b = B._x; b.setTransform(B._k, 0, 0, B._k, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, LW, LH);
        drawImgCam(b, im, 'product', { s: lerp(1.08, 1.26, u), x: lerp(4, -22, u) });
        b.globalCompositeOperation = 'destination-in';
        var ax = ANCH.product[0] * LW, ay = ANCH.product[1] * LH, gr = b.createRadialGradient(ax, ay, 40, ax, ay, 150);
        gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = gr; b.fillRect(0, 0, LW, LH);
        b.globalCompositeOperation = 'source-over';
        full(g, B);
        var sx = lerp(-0.3, 1.3, frac(u * 1.2)) * LW, sg = g.createLinearGradient(sx - 60, 0, sx + 60, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.22)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = sg; g.fillRect(0, 0, LW, LH); g.restore();
      } }), C('coffee', 9, 12)]; },
      chip: function (t) { return t >= 4 && t < 9 ? '사진 한 장 → 움직이는 컷' : null; }, rep: 6
    },

    /* === 모션그래픽 === */
    'text-animation': {
      ov: [function (T, o, t, F) {
        var R = F.FR, cx = R.x + R.w / 2, cy = R.y + R.h * 0.22, sz;
        if (t >= 0.4 && t < 4.6) {
          var s = '아침을 깨우는 한 잔', n = Math.min(Array.from(s).length, Math.floor((t - 0.4) / 0.11)), shown = Array.from(s).slice(0, n).join('');
          sz = fit(o, s, R.h * 0.09, R.w * 0.8, 700, FF.nk); var w = tw(o, s, 700, sz, FF.nk), wx = tw(o, shown, 700, sz, FF.nk);
          txt(o, shown, cx - w / 2, cy, { size: sz, w: 700, font: FF.nk, align: 'left', base: 'middle', fill: '#fff', shadow: 'rgba(0,0,0,.6)' });
          if (Math.floor(t * 2.5) % 2 === 0) { o.fillStyle = '#ffd34d'; o.fillRect(cx - w / 2 + wx + 3, cy - sz * 0.55, 3, sz * 1.1); }
        } else if (t >= 5.1 && t < 7.9) {
          var ch = Array.from('직접 볶은 원두'); sz = fit(o, '직접 볶은 원두', R.h * 0.12, R.w * 0.8, 400, FF.hz);
          var tot = tw(o, '직접 볶은 원두', 400, sz, FF.hz), x = cx - tot / 2;
          for (var i = 0; i < ch.length; i++) { var cw = tw(o, ch[i], 400, sz, FF.hz), u = back((t - 5.1 - i * 0.06) / 0.35); if (u > 0) { o.save(); o.translate(x + cw / 2, cy + (1 - u) * 30); o.globalAlpha = clamp(u, 0, 1); txt(o, ch[i], 0, 0, { size: sz, w: 400, font: FF.hz, base: 'middle', fill: '#ffe9b0', shadow: 'rgba(0,0,0,.5)', alpha: clamp(u, 0, 1) }); o.restore(); } x += cw; }
        } else if (t >= 8.4 && t < 11.7) {
          var u2 = eout((t - 8.4) / 1.4), s2 = 'MORNING BEAN'; sz = R.h * 0.09;
          o.save(); o.globalAlpha = clamp(u2 * 1.5, 0, 1); var gap = lerp(R.w * 0.06, sz * 0.12, u2), tot2 = 0, cs = Array.from(s2), ws = [];
          for (var j = 0; j < cs.length; j++) { ws.push(tw(o, cs[j], 400, sz, FF.hz)); tot2 += ws[j] + gap; }
          var xx = cx - (tot2 - gap) / 2;
          for (j = 0; j < cs.length; j++) { txt(o, cs[j], xx + ws[j] / 2, cy, { size: sz, w: 400, font: FF.hz, base: 'middle', fill: '#fff', alpha: o.globalAlpha }); xx += ws[j] + gap; }
          o.restore();
        }
      }],
      rep: 2.8
    },
    'progress-bar': {
      ov: [function (T, o, t, F) {
        var R = F.FR, y = R.y + 6, x = R.x + 10, w = R.w - 20, gr = o.createLinearGradient(x, 0, x + w, 0);
        o.fillStyle = 'rgba(255,255,255,.25)'; rr(o, x, y, w, 6, 3); o.fill();
        gr.addColorStop(0, '#ffb020'); gr.addColorStop(1, '#ff5a5f'); o.fillStyle = gr; rr(o, x, y, Math.max(6, w * t / 12), 6, 3); o.fill();
        for (var i = 0; i < 2; i++) { var cx = x + w * [5, 8][i] / 12; o.fillStyle = 'rgba(0,0,0,.55)'; o.fillRect(cx - 1, y, 2, 6); }
        o.fillStyle = '#fff'; o.beginPath(); o.arc(x + w * t / 12, y + 3, 5, 0, TAU); o.fill();
      }],
      rep: 6
    },
    'stickers-emoji': {
      ov: [function (T, o, t, F) {
        var R = F.FR;
        function em(e, nx, ny, t0, t1, sz) {
          if (t < t0 || t > t1) return; var p = F.map(nx * LW, ny * LH), s = popS(t, t0, 0.25) * (1 - ein((t - t1 + 0.2) / 0.2));
          o.save(); o.translate(p[0], p[1] + Math.sin(t * 5 + nx * 9) * 3); o.rotate(Math.sin(t * 4 + ny * 7) * 0.15); o.scale(s, s);
          o.fillStyle = '#fff'; o.beginPath(); o.arc(0, 0, sz * 0.62, 0, TAU); o.shadowColor = 'rgba(0,0,0,.3)'; o.shadowBlur = 6; o.fill(); o.shadowColor = 'transparent';
          o.font = sz.toFixed(1) + 'px ' + EMOJI_F; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(e, 0, sz * 0.05); o.restore();
        }
        em('☕', 0.7, 0.24, 0.6, 4.7, R.h * 0.12);
        if (t > 1.4 && t < 4.7) { var s = popS(t, 1.4, 0.25), p = F.map(0.18 * LW, 0.2 * LH); o.save(); o.translate(p[0], p[1]); o.rotate(-0.2 + Math.sin(t * 3) * 0.05); o.scale(s, s); starburst(o, 0, 0, R.h * 0.1, R.h * 0.075, 14, '#ff4d6d'); txt(o, 'NEW', 0, 1, { size: R.h * 0.055, w: 400, font: FF.hz, fill: '#fff', base: 'middle' }); o.restore(); }
        for (var i = 0; i < 4; i++) { var t0 = 5.3 + i * 0.5; em('❤️', 0.3 + 0.12 * Math.sin(i * 2), 0.55 - 0.1 * ((t - t0) % 2.5), t0, 7.9, R.h * 0.08); }
        em('👍', 0.72, 0.3, 8.5, 11.6, R.h * 0.13);
        if (t > 9 && t < 11.6) { var s2 = popS(t, 9, 0.25), q = F.map(0.32 * LW, 0.2 * LH); o.save(); o.translate(q[0], q[1]); o.rotate(0.08); o.scale(s2, s2); var lw = tw(o, 'GOOD MORNING', 400, R.h * 0.06, FF.hz) + 18; o.fillStyle = '#ffe14a'; rr(o, -lw / 2, -R.h * 0.05, lw, R.h * 0.1, 6); o.fill(); txt(o, 'GOOD MORNING', 0, 1, { size: R.h * 0.06, w: 400, font: FF.hz, fill: '#1b1b1b', base: 'middle' }); o.restore(); }
      }],
      rep: 2.2
    },
    'callout-arrow': {
      ov: [function (T, o, t, F) {
        var R = F.FR, col = '#ff3b30';
        function call(nx, ny, rx, ry, lx, ly, lab, t0, t1) {
          if (t < t0 || t > t1) return; var p = track(T, F, t, nx, ny), L = F.map(lx * LW, ly * LH), pr = eio((t - t0) / 0.5), a = 1 - ein((t - t1 + 0.25) / 0.25);
          o.globalAlpha = a; o.strokeStyle = col; o.lineWidth = 3; o.lineCap = 'round';
          o.beginPath(); o.ellipse(p[0], p[1], F.sc(rx), F.sc(ry), -0.08, -Math.PI / 2, -Math.PI / 2 + TAU * pr * 1.05); o.stroke();
          if (pr > 0.6) {
            var q = eout((pr - 0.6) / 0.4), ex = lerp(L[0], p[0] - F.sc(rx) * 0.8, q), ey = lerp(L[1], p[1] - F.sc(ry) * 0.6, q);
            arrow(o, L[0], L[1], ex, ey, col, 3, 11);
            var sz = R.h * 0.05, w = tw(o, lab, 700, sz, FF.nk) + 16; o.fillStyle = col; rr(o, L[0] - w / 2, L[1] - sz * 1.6, w, sz * 1.5, 5); o.fill();
            txt(o, lab, L[0], L[1] - sz * 0.85, { size: sz, w: 700, font: FF.nk, fill: '#fff', base: 'middle' });
          }
          o.globalAlpha = 1;
        }
        call(0.47, 0.37, 130, 60, 0.82, 0.18, '직접 볶은 원두', 0.8, 4.7);
        call(0.44, 0.66, 40, 55, 0.68, 0.32, '손에 착 감기는 손잡이', 5.4, 7.9);
      }],
      rep: 2.6
    },
    'zoom-highlight': {
      gcam: CUPZ(function (t) { return kf([[0, 1], [1.8, 1], [2.5, 1.9], [4.4, 1.9], [4.9, 1], [5.4, 1], [6.0, 2.0], [7.5, 2.0], [7.95, 1], [12, 1]], t, eio); }),
      ov: [function (T, o, t, F) {
        if (t > 0.5 && t < 1.85) { var a = F.map(0.33 * LW, 0.33 * LH), b = F.map(0.6 * LW, 0.52 * LH); o.strokeStyle = '#ffd34d'; o.lineWidth = 2.5; rr(o, a[0], a[1], b[0] - a[0], b[1] - a[1], 8); o.stroke(); chip(o, '크레마', a[0], a[1] - 4, { bg: 'rgba(255,211,77,.92)', fg: '#111', up: true }); }
        if (t > 2.5 && t < 4.4) chip(o, '줌 강조', F.FR.x + 8, F.FR.y + 8);
      }],
      rep: 3
    },
    'end-screen-cta': {
      ov: [function (T, o, t, F) {
        if (t < 8.5) return; var R = F.FR, p = eout((t - 8.5) / 0.6);
        o.fillStyle = 'rgba(10,8,6,' + (0.72 * p).toFixed(3) + ')'; o.fillRect(R.x, R.y, R.w, R.h);
        o.save(); o.globalAlpha = p; o.translate(0, (1 - p) * 20);
        var cx = R.x + R.w * 0.3, cy = R.y + R.h * 0.4, r = R.h * 0.1;
        o.fillStyle = '#3a2416'; o.beginPath(); o.arc(cx, cy, r * 1.25, 0, TAU); o.fill(); beanLogo(o, cx, cy, r, 1, '#f3e2c4');
        title(o, '모닝빈', cx, cy + r * 2.0, R.h * 0.075, '#fff');
        setFont(o, 500, R.h * 0.04, FF.nk); o.fillStyle = '#d8cbb8'; o.textAlign = 'center'; o.fillText('성수동 · 매일 아침 7시', cx, cy + r * 2.9);
        var bw = R.w * 0.3, bh = R.h * 0.1, bx = cx - bw / 2, by = cy + r * 3.4, pulse = 1 + 0.04 * Math.sin(t * 6);
        o.save(); o.translate(cx, by + bh / 2); o.scale(pulse, pulse); o.fillStyle = '#ffb020'; rr(o, -bw / 2, -bh / 2, bw, bh, bh / 2); o.fill();
        txt(o, '지금 길찾기 →', 0, 1, { size: bh * 0.42, w: 700, font: FF.nk, fill: '#1b1206', base: 'middle' }); o.restore();
        var tw0 = R.w * 0.3, th = tw0 * 9 / 16, tx = R.x + R.w * 0.62;
        stillThumb(o, 'product', tx, R.y + R.h * 0.2, tw0, th, T); stillThumb(o, 'street', tx, R.y + R.h * 0.2 + th + 14, tw0, th, T);
        o.strokeStyle = '#fff'; o.lineWidth = 1.5; o.strokeRect(tx, R.y + R.h * 0.2, tw0, th); o.strokeRect(tx, R.y + R.h * 0.2 + th + 14, tw0, th);
        setFont(o, 600, uk(9.5), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'left'; o.textBaseline = 'bottom'; o.fillText('다음 영상', tx, R.y + R.h * 0.2 - 4);
        void bx;
        o.restore();
      }],
      rep: 10
    },
    'logo-sting': {
      ov: [function (T, o, t, F) {
        var R = F.FR, w0 = t < 2.4 ? [0, 2.4] : (t > 9.6 ? [9.6, 12] : null); if (!w0) return;
        var u = (t - w0[0]) / (w0[1] - w0[0]), a = Math.min(1, u / 0.12, (1 - u) / 0.12);
        o.fillStyle = 'rgba(28,18,10,' + (0.85 * a).toFixed(3) + ')'; o.fillRect(R.x, R.y, R.w, R.h);
        var cx = R.x + R.w / 2, cy = R.y + R.h * 0.42, r = R.h * 0.11;
        o.save(); o.globalAlpha = a; beanLogo(o, cx, cy, r, eio(u / 0.55), '#f3e2c4');
        var q = eout((u - 0.35) / 0.4), sz = R.h * 0.1, s = 'Morning Bean', w = tw(o, s, 400, sz, FF.hz);
        o.save(); o.beginPath(); o.rect(cx - w / 2 - 4, cy + r * 1.5, (w + 8) * q, sz * 1.6); o.clip();
        txt(o, s, cx, cy + r * 1.5 + sz * 0.85, { size: sz, w: 400, font: FF.hz, fill: '#fff', base: 'middle' }); o.restore();
        if (q > 0.9) { setFont(o, 700, R.h * 0.04, FF.nk); o.fillStyle = '#d9b98a'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('모닝빈', cx, cy + r * 1.5 + sz * 1.9); }
        for (var i = 0; i < 6; i++) { var ph = (u * 2 + i / 6) % 1, ang = i * 1.05, rr2 = r * (1.3 + ph * 1.2), sa = Math.sin(ph * Math.PI) * (u > 0.45 ? 1 : 0); o.fillStyle = 'rgba(255,230,180,' + sa.toFixed(3) + ')'; o.beginPath(); o.arc(cx + Math.cos(ang) * rr2, cy + Math.sin(ang) * rr2, 2, 0, TAU); o.fill(); }
        o.restore();
      }],
      rep: 1.8
    },
    'keyframe-easing': {
      ov: [function (T, o, t, F) {
        var R = F.FR; o.fillStyle = 'rgba(0,0,0,.5)'; o.fillRect(R.x, R.y, R.w, R.h);
        var ph = (t % 3) / 3, u = ph < 0.6 ? ph / 0.6 : 1, rows2 = [['선형', function (x) { return x; }, R.y + R.h * 0.32], ['이징', eio, R.y + R.h * 0.68]];
        for (var i = 0; i < 2; i++) {
          var y = rows2[i][2], x0 = R.x + R.w * 0.2, x1 = R.x + R.w * 0.82, e = rows2[i][1](u), x = lerp(x0, x1, e);
          o.strokeStyle = 'rgba(255,255,255,.25)'; o.lineWidth = 1; o.beginPath(); o.moveTo(x0, y + 26); o.lineTo(x1, y + 26); o.stroke();
          o.fillStyle = '#ffd34d'; for (var k = 0; k < 2; k++) { var kx = k ? x1 : x0; o.beginPath(); o.moveTo(kx, y + 21); o.lineTo(kx + 5, y + 26); o.lineTo(kx, y + 31); o.lineTo(kx - 5, y + 26); o.closePath(); o.fill(); }
          o.fillStyle = i ? '#ffb020' : '#8fb8ff'; rr(o, x - 26, y - 14, 52, 28, 7); o.fill();
          txt(o, '☕', x, y + 1, { size: 15, w: 400, font: EMOJI_F, base: 'middle' });
          setFont(o, 700, uk(11), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText(rows2[i][0], R.x + 12, y);
          var gx = R.x + 12, gy = y + 10, gs = 22; o.strokeStyle = 'rgba(255,255,255,.7)'; o.lineWidth = 1.4; o.beginPath();
          for (var q = 0; q <= 20; q++) { var xx = q / 20, yy = rows2[i][1](xx); if (q) o.lineTo(gx + xx * gs, gy + gs - yy * gs); else o.moveTo(gx, gy + gs); } o.stroke();
        }
      }],
      rep: 0.9
    },
    'subscribe-animation': {
      ov: [ui(function (F) { return [F.FR.x, F.FR.y + F.FR.h, Math.min(2, F.FR.w / 300)]; }, function (T, o, t, F) {
        var R = F.FR, lt = t < 6 ? t - 1 : t - 7; if (lt < 0 || lt > 4.2) return;
        var p = eout(lt / 0.4) * (1 - ein((lt - 3.8) / 0.4)), x = R.x + 14, y = R.y + R.h - 58 + (1 - p) * 40, w = 196, h = 40;
        o.save(); o.globalAlpha = clamp(p, 0, 1);
        o.fillStyle = 'rgba(15,15,18,.88)'; rr(o, x, y, w, h, h / 2); o.fill();
        o.fillStyle = '#3a2416'; o.beginPath(); o.arc(x + 20, y + 20, 14, 0, TAU); o.fill(); beanLogo(o, x + 20, y + 20, 9, 1, '#f3e2c4');
        setFont(o, 700, uk(11.5), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('모닝빈', x + 40, y + 20);
        var on = lt > 1.6, bx = x + 104, bw = 82;
        o.fillStyle = on ? '#3a3a40' : '#ff1f1f'; rr(o, bx, y + 7, bw, 26, 13); o.fill();
        setFont(o, 700, uk(11), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'center'; o.fillText(on ? '🔔 구독중' : '구독', bx + bw / 2, y + 20.5);
        if (lt > 2.2) { var s = popS(lt, 2.2, 0.25); o.save(); o.translate(bx + bw + 22, y + 20); o.scale(s, s); o.font = '20px ' + EMOJI_F; o.textAlign = 'center'; o.fillText('👍', 0, 0); o.restore(); }
        var cxp = lerp(x + w + 60, bx + bw * 0.6, eio((lt - 0.4) / 1.0)), cyp = lerp(y - 30, y + 18, eio((lt - 0.4) / 1.0));
        if (lt < 3.0) cursor(o, cxp, cyp, lt > 1.5 && lt < 1.7);
        o.restore();
      })],
      rep: 2.8
    },
    'tracking-text': {
      gcam: function (t, c) { return c.src === 'coffee' ? { s: 1.2, x: Math.sin(t * 0.9) * 50, y: Math.cos(t * 0.7) * 12 } : (c.src === 'product' ? { s: 1.25, x: Math.sin(t * 1.2) * 40 } : null); },
      ov: [function (T, o, t, F) {
        var c = curClip(T, t), co = c.src === 'coffee', p = track(T, F, t, co ? 0.6 : 0.44, co ? 0.34 : 0.6), lab = co ? '산미 낮은 블렌드' : '세라믹 머그 · 350ml';
        var lx = p[0] + F.sc(70), ly = p[1] - F.sc(60), sz = F.FR.h * 0.045, w = tw(o, lab, 700, sz, FF.nk) + 16;
        o.strokeStyle = '#fff'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(p[0], p[1]); o.lineTo(lx, ly); o.lineTo(lx + 8, ly); o.stroke();
        o.fillStyle = '#fff'; o.beginPath(); o.arc(p[0], p[1], 4, 0, TAU); o.fill();
        o.fillStyle = 'rgba(255,255,255,.95)'; rr(o, lx + 8, ly - sz * 0.9, w, sz * 1.8, 5); o.fill();
        txt(o, lab, lx + 16, ly + 0.5, { size: sz, w: 700, font: FF.nk, fill: '#141414', align: 'left', base: 'middle' });
      }],
      rep: 2
    },
    'title-card': {
      tl: function () {
        return [C('coffee', 0, 2.4, null, { lab: '타이틀', draw: function (T, g, t) {
          g.fillStyle = '#f3ead8'; g.fillRect(0, 0, LW, LH); var u = eout(t / 0.8);
          g.globalAlpha = u; g.font = '400 52px ' + FF.gd; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a2416'; g.fillText('모닝빈의 아침', LW / 2, LH * 0.46 + (1 - u) * 12);
          g.font = '500 16px ' + FF.nk; g.fillStyle = '#8a6a4a'; g.fillText('EP.01 · 오늘의 첫 잔', LW / 2, LH * 0.62); g.fillStyle = '#c9a46a'; g.fillRect(LW / 2 - 30 * u, LH * 0.55, 60 * u, 2); g.globalAlpha = 1;
        } }), C('coffee', 2.4, 6.5, push(1, 1.06)), C('product', 6.5, 9.5), C('coffee', 9.5, 12)];
      },
      tr: { type: 'dissolve', dur: 0.5 },
      ov: [function (T, o, t, F) { if (t < 6.6 || t > 8.8) return; var R = F.FR, a = cAlpha(t, 6.6, 8.8, 0.3); title(o, 'Chapter 2', R.x + R.w * 0.08, R.y + R.h * 0.72, R.h * 0.05, 'rgba(255,255,255,' + a + ')', FF.nk, { align: 'left', w: 700 }); title(o, '직접 볶은 원두', R.x + R.w * 0.08, R.y + R.h * 0.82, R.h * 0.09, 'rgba(255,255,255,' + a + ')', FF.hz, { align: 'left' }); }],
      rep: 1.2
    },
    'number-counter': {
      ov: [function (T, o, t, F) {
        var R = F.FR;
        function counter(t0, t1, to, unit, lab, fmt) {
          if (t < t0 || t > t1) return; var u = eout((t - t0) / 1.6), a = cAlpha(t, t0, t1, 0.2), v = to * u, sz = R.h * 0.17;
          o.save(); o.globalAlpha = a; o.fillStyle = 'rgba(0,0,0,.35)'; o.fillRect(R.x, R.y + R.h * 0.3, R.w, R.h * 0.4);
          setFont(o, 700, R.h * 0.045, FF.nk); o.fillStyle = '#ffe9b0'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(lab, R.x + R.w / 2, R.y + R.h * 0.37);
          txt(o, (fmt ? fmt(v) : fmtN(v)) + unit, R.x + R.w / 2, R.y + R.h * 0.53, { size: sz, w: 400, font: FF.hz, fill: '#fff', base: 'middle', shadow: 'rgba(0,0,0,.5)', alpha: a });
          o.restore();
        }
        counter(0.8, 4.7, 1284, '잔', '오늘 내린 커피', null);
        counter(5.4, 7.9, 30, '%', '오픈 할인', function (v) { return String(Math.round(v)); });
        counter(8.6, 11.8, 3200, '+', '단골 손님', null);
      }],
      rep: 3.5
    },

    /* === AI 편집 === */
    'remove-object': {
      tl: function () { return [C('product', 0, 12, push(1, 1.05), { draw: function (T, g, t, cam) {
        var im = STILL.product; if (!im) return; drawImgCam(g, im, 'product', cam);
        var pl = cleanPlate(); if (!pl) return;
        var x = t < 10 ? LW * eio(lin(t, 1.8, 3.6)) : LW * (1 - seg(t, 10, 10.6));
        if (t >= 10) { g.globalAlpha = 1 - seg(t, 10, 10.8); drawImgCam(g, pl, 'product', cam); g.globalAlpha = 1; }
        else if (x > 0) { g.save(); g.beginPath(); g.rect(0, 0, x, LH); g.clip(); drawImgCam(g, pl, 'product', cam); g.restore(); if (x < LW - 1) { var gr = g.createLinearGradient(x - 30, 0, x + 4, 0); gr.addColorStop(0, 'rgba(170,140,255,0)'); gr.addColorStop(1, 'rgba(170,140,255,.7)'); g.fillStyle = gr; g.fillRect(x - 30, 0, 34, LH); } }
      } })]; },
      ov: [function (T, o, t, F) {
        if (t > 0.3 && t < 2.2) { var c = curClip(T, t), cam = camOf(T, c, t), a = camPt('product', cam, 0.11, 0.48), b = camPt('product', cam, 0.5, 0.97), p = F.map(a[0], a[1]), q = F.map(b[0], b[1]); o.setLineDash([6, 4]); o.lineDashOffset = -t * 30; o.strokeStyle = '#a78bfa'; o.lineWidth = 2; o.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); o.setLineDash([]); chip(o, '지울 물체', p[0], p[1] - 4, { bg: 'rgba(120,90,220,.92)', up: true }); }
      }],
      chip: chipFor([[3.6, 10, 'AI가 빈자리를 채웠어요']]), rep: 5
    },
    'replace-background': {
      tl: function () { return [C('coffee', 0, 12, null, { draw: keyComp('painting', { s: 0.78, y: 34, mixT: [0.5, 1.7] }) })]; },
      chip: chipFor([[1.7, 12, '배경 → 그림 · 경계는 확인해요']]), rep: 4
    },
    'relight': {
      fx: [relightFx],
      ov: [function (T, o, t, F) { if (T.mem.lx == null) return; var p = F.map(T.mem.lx, LH * 0.08); o.fillStyle = '#ffcf7a'; o.beginPath(); o.arc(p[0], p[1], 7, 0, TAU); o.fill(); o.strokeStyle = '#ffcf7a'; o.lineWidth = 1.5; for (var i = 0; i < 8; i++) { var a = i * TAU / 8; o.beginPath(); o.moveTo(p[0] + Math.cos(a) * 10, p[1] + Math.sin(a) * 10); o.lineTo(p[0] + Math.cos(a) * 14, p[1] + Math.sin(a) * 14); o.stroke(); } }],
      chip: '빛 방향 바꾸기', rep: 3
    },
    'change-weather': { fx: [beforeAfter(rainFx, sweep)], ov: [baOv(['원본', '비 오는 밤'])], rep: 2 },
    'change-season': {
      fx: [function (T, g, t) { if (t < 6) snowFx(T, g, t); else petalFx(T, g, t); }, flashAt([6], 0.3)],
      chip: chipFor([[0, 6, '겨울 버전'], [6, 12, '봄 버전']]), rep: 3
    },
    'style-transfer-v2v': { fx: [beforeAfter(paintFx, sweep)], ov: [baOv(['실사', '수채화'])], rep: 2 },
    'generative-extend': {
      tl: function () { return [C('coffee', 0, 5), C('product', 5, 8), C('coffee', 8, 9.6), C('coffee', 9.6, 12, null, { gen: true, lab: 'AI 연장' })]; },
      panel: tlPanel(function () { return [{ name: '음악', clips: [{ k: 'bed', t0: 0, t1: 12, col: LC.m, wc: WC.m }], marks: [[9.6, '원본 끝', '#ff6b6b']] }]; }),
      ov: [function (T, o, t, F) { if (t < 9.6) return; var R = F.FR, a = 0.5 + 0.5 * Math.sin(t * 5); o.strokeStyle = 'rgba(167,139,250,' + (0.5 + 0.4 * a).toFixed(3) + ')'; o.lineWidth = 4; o.strokeRect(R.x + 2, R.y + 2, R.w - 4, R.h - 4); chip(o, 'AI가 만든 프레임', R.x + 8, R.y + 8, { bg: 'rgba(120,90,220,.92)' }); }],
      akeys: ['bed'], rep: 10.5
    },
    'frame-interpolation': {
      tl: function () { return [C('coffee', 0, 12)]; }, rate: one(0.5),
      gcam: function (t) { return { s: 1.18, x: Math.sin(t * 0.9) * 46, y: Math.cos(t * 0.6) * 10 }; },
      fx: [function (T, g, t) {
        var k = Math.floor(t / 0.2);
        if (T.mem.fik !== k || !T.mem.fi) { T.mem.fi = copyP(T, T.buf('fi')); T.mem.fik = k; }
        g.save(); g.beginPath(); g.rect(0, 0, LW / 2, LH); g.clip(); full(g, T.mem.fi); g.restore();
      }],
      ov: [halvesOv(['12fps · 뚝뚝 끊겨요', 'AI 보간 60fps'])], rep: 3
    },
    'ai-upscale': {
      fx: [function (T, g) { var src = copyP(T, T.buf('up')); pixelate(g, src, 0, 0, LW / 2, LH, 7); g.save(); g.beginPath(); g.rect(LW / 2, 0, LW / 2, LH); g.clip(); if (HASF) g.filter = 'contrast(1.08) saturate(1.06)'; full(g, src); g.restore(); }],
      ov: [halvesOv(['360p', '4K 업스케일'])], rep: 2
    },
    'denoise': {
      fx: [function (T, g, t) {
        applyG(T, g, { f: 'brightness(.6) contrast(1.05)', fb: [['multiply', '#999', 1]] });
        g.save(); g.beginPath(); g.rect(0, 0, LW / 2, LH); g.clip(); grainOv(g, 0, 0, LW / 2, LH, 0.95, t);
        g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.18; var tl2 = grain()[(Math.floor(t * 24) + 2) % 4]; g.fillStyle = g.createPattern(tl2, 'repeat'); g.fillRect(0, 0, LW / 2, LH); g.restore();
      }],
      ov: [halvesOv(['노이즈', 'AI 제거 후'])], rep: 2
    },
    'lip-sync-dubbing': {
      tl: function () { return [C('portrait', 0, 12, push(1.5, 1.6, 0, 0, -40, -46))]; },
      panel: lanes(function () {
        var ko = [], en = [], vis = ['ㅏ', 'ㅗ', 'ㅁ', 'ㅜ', 'ㅣ', 'ㅓ'], vz = [];
        for (var i = 0; i < CAPS.length; i++) {
          var c = CAPS[i]; for (var j = 0; j < c.words.length; j++) ko.push({ t0: c.words[j].t0, t1: c.words[j].t1 - 0.04, col: 'rgba(90,150,255,.55)', lab: c.words[j].w });
          var ew = c.en.split(' '), d = (c.t1 - c.t0 - 0.3) / ew.length; for (j = 0; j < ew.length; j++) en.push({ t0: c.t0 + j * d, t1: c.t0 + (j + 1) * d - 0.03, col: 'rgba(70,200,150,.55)', lab: ew[j] });
          for (j = 0; j < 6; j++) vz.push({ t0: c.t0 + j * (c.t1 - c.t0) / 6, t1: c.t0 + (j + 1) * (c.t1 - c.t0) / 6 - 0.03, col: 'rgba(255,170,60,.5)', lab: vis[(i + j) % 6] });
        }
        return [{ name: '한국어', v: ko }, { name: '영어 더빙', v: en }, { name: '입 모양', v: vz }];
      }),
      ov: [function (T, o, t, F) { var p = track(T, F, t, 0.51, 0.585), s = F.sc(40); o.setLineDash([4, 3]); o.strokeStyle = '#ffb020'; o.lineWidth = 1.5; o.strokeRect(p[0] - s, p[1] - s * 0.5, s * 2, s); o.setLineDash([]); chip(o, '입 모양 맞춤', p[0] - s, p[1] + s * 0.5 + 4, { bg: 'rgba(200,120,0,.92)' }); var c = capAt(t); if (c) burnLines(o, [c.en], F.FR, 0.9, { size: F.FR.h * 0.05, alpha: cAlpha(t, c.t0, c.t1) }); }],
      ph: 100, rep: 3.2
    },
    'eye-contact': {
      tl: function () { return [C('portrait', 0, 12, null, { draw: function (T, g, t) {
        var im = STILL.portrait; if (!im) return; var cam = { s: 2.3, x: 0, y: 30 }; drawImgCam(g, im, 'portrait', cam);
        if (t < 6) {
          var E = [[0.4575, 0.378], [0.5656, 0.376]];
          for (var i = 0; i < 2; i++) {
            var p = camPt('portrait', cam, E[i][0], E[i][1]), rx = 0.021 * LW * cam.s, ry = 0.012 * LH * cam.s;
            g.save(); g.beginPath(); g.ellipse(p[0], p[1], rx, ry, 0, 0, TAU); g.clip();
            drawImgCam(g, im, 'portrait', { s: cam.s, x: cam.x + rx * 0.42, y: cam.y });
            g.restore();
          }
        }
      } })]; },
      ov: [function (T, o, t, F) {
        var M = F.M, w = M.w * 0.34, h = w * 0.32, x = M.x + M.w - w - 10, y = M.y + 10, k = T.pk;
        o.fillStyle = '#000'; o.fillRect(x - 2, y - 2, w + 4, h + 4);
        o.drawImage(T.P, LW * 0.28 * k, LH * 0.33 * k, LW * 0.44 * k, LH * 0.2 * k, x, y, w, h);
        o.strokeStyle = '#fff'; o.lineWidth = 1.5; o.strokeRect(x, y, w, h);
      }],
      chip: chipFor([[0, 6, '보정 전 · 옆을 봐요'], [6, 12, '보정 후 · 카메라를 봐요']]), rep: 8
    },
    'filler-word-removal': {
      tl: fillerClips,
      panel: scriptPanel(FILL, { title: '자동 대본 · 군말 지우기', fs: 12, lh: 19 }), rep: 3
    },
    'auto-highlights': {
      panel: function (T, o, t, PR) {
        panelBg(o, PR); var x0 = PR.x + 12, x1 = PR.x + PR.w - 12, y0 = PR.y + 22, h = PR.h - 40;
        setFont(o, 600, uk(9.5), FF.ui); o.fillStyle = '#9a9aa6'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('원본 24:10 · 하이라이트 점수', x0, PR.y + 10);
        o.strokeStyle = '#8fb8ff'; o.lineWidth = 1.4; o.beginPath();
        for (var i = 0; i <= 200; i++) { var u = i / 200, v = 0.35 + 0.25 * nz(u * 14, 2) + 0.4 * Math.exp(-Math.pow((u - 0.62) / 0.03, 2)) + 0.25 * Math.exp(-Math.pow((u - 0.24) / 0.03, 2)) + 0.2 * Math.exp(-Math.pow((u - 0.86) / 0.025, 2)); v = clamp(v, 0, 1); var X = lerp(x0, x1, u), Y = y0 + h - v * h; if (i) o.lineTo(X, Y); else o.moveTo(X, Y); }
        o.stroke();
        var pk = [[0.62, '1위 92점', '#ffd34d'], [0.24, '2위 81점', '#c9c9d1'], [0.86, '3위 77점', '#c9c9d1']];
        for (i = 0; i < 3; i++) { var X2 = lerp(x0, x1, pk[i][0]); o.fillStyle = i ? 'rgba(255,255,255,.12)' : 'rgba(255,211,77,.25)'; o.fillRect(X2 - 14, y0, 28, h); chip(o, pk[i][1], X2, y0 + h + 2, { center: true, size: 9, bg: i ? 'rgba(60,60,70,.95)' : 'rgba(255,211,77,.95)', fg: i ? '#fff' : '#111' }); }
        var px = lerp(x0, x1, 0.62) - 14 + 28 * (t / 12); o.fillStyle = '#ff4d4d'; o.fillRect(px - 1, y0, 2, h);
      },
      ph: 100, chip: '하이라이트 1 · 92점', rep: 3
    },
    'virality-score': {
      ov: [ui(function (F) { return [F.FR.x + F.FR.w, F.FR.y + F.FR.h / 2, Math.min(F.FR.w / 175, F.FR.h / 175)]; }, function (T, o, t, F) {
        var R = F.FR, w = 150, h = 158, x = R.x + R.w - w - 12, y = R.y + (R.h - h) / 2, sc = Math.round(87 * eout(t / 1.5));
        card(o, x, y, w, h, 12);
        setFont(o, 600, uk(10), FF.ui); o.fillStyle = '#b8b8c2'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('바이럴 점수', x + 12, y + 16);
        var cx = x + w / 2, cy = y + 56, r = 28;
        o.strokeStyle = 'rgba(255,255,255,.15)'; o.lineWidth = 7; o.beginPath(); o.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); o.stroke();
        o.strokeStyle = '#3ddc84'; o.beginPath(); o.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * sc / 100); o.stroke();
        setFont(o, 800, uk(20), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'center'; o.fillText(String(sc), cx, cy + 2);
        var f = [['후킹', 0.9], ['길이', 1], ['자막', 0.7], ['음악', 0.8]];
        for (var i = 0; i < 4; i++) { var yy = y + 100 + i * 14; setFont(o, 500, uk(9.5), FF.ui); o.fillStyle = '#c9c9d1'; o.textAlign = 'left'; o.fillText(f[i][0], x + 12, yy); o.fillStyle = 'rgba(255,255,255,.15)'; o.fillRect(x + 46, yy - 3, w - 60, 6); o.fillStyle = '#3ddc84'; o.fillRect(x + 46, yy - 3, (w - 60) * f[i][1] * eout(t / 1.5), 6); }
      })],
      rep: 3
    },
    'text-based-edit': {
      cap: 'burn',
      panel: scriptPanel(function (T, t) {
        var lt = t % 12;
        return TBE.map(function (s) { if (!s.x) return s; return { s: s.s, t0: 0, t1: 0, cut: lt > 2.6, sel: lt > 1.2 && lt <= 2.6, dim: lt <= 1.2 }; });
      }, { block: true, lh: 15, fs: 10.5, title: '대본에서 문장을 지우면 영상도 잘려요' }),
      ph: 104, rep: 3
    },
    'ai-b-roll': {
      tl: function () { return [C('portrait', 0, 3.1, push(1.05, 1.1)), C('product', 3.1, 5.6, push(1, 1.1), { lab: 'AI B롤 · #원두' }), C('portrait', 5.6, 6.0, { s: 1.12 }), C('street', 6.0, 8.5, push(1.05, 1.15), { lab: 'AI B롤 · #오픈' }), C('portrait', 8.5, 12, push(1.12, 1.18))]; },
      cap: 'burn',
      panel: lanes(function () { return [{ name: 'B롤', v: [{ t0: 3.1, t1: 5.6, src: 'product', lab: '✦ #원두' }, { t0: 6, t1: 8.5, src: 'street', lab: '✦ #오픈' }] }, { name: 'A롤', v: [{ t0: 0, t1: 12, src: 'portrait', lab: '인물 · 말하는 장면' }] }]; }),
      chip: function (t, T) { return curClip(T, t).lab || null; }, rep: 4
    },
    'pikaffects': {
      tl: function () { return [C('coffee', 0, 12, null, { draw: function (T, g, t, cam) {
        var v = T.img('coffee'); if (!v) return; drawImgCam(g, v, 'coffee', cam);
        var k = T.keyed(); if (!k) return;
        var inf = t < 1.5 ? 0 : (t < 4 ? eout((t - 1.5) / 2.5) : (t < 6.5 ? 1 : 1 - eio((t - 6.5) / 1)));
        if (inf <= 0.001) return;
        var wob = Math.sin(t * 9) * 0.06 * inf, s = 1 + 0.5 * inf, ax = ANCH.coffee[0] * LW, by = 0.97 * LH;
        g.save(); g.translate(ax, by); g.scale(s * (1 + wob), s * (1 - wob)); g.translate(-ax, -by); g.drawImage(k, 0, 0, LW, LH); g.restore();
      } })]; },
      chip: '부풀리기 효과', rep: 4.5
    },
    'kling-effects': {
      tl: function () { return [C('product', 0, 12, push(1, 1.3, 0, 30, 0, -10))]; }, fx: [sparkleFx],
      ov: [ui(function (F) { return [F.FR.x + F.FR.w / 2, F.FR.y + F.FR.h, F.FR.w * 0.95 / 256]; }, function (T, o, t, F) {
        var R = F.FR, L = ['확대', '회전', '반짝임', '흔들기'], w = 58, h = 24, x = R.x + (R.w - (w + 6) * 4) / 2, y = R.y + R.h - h - 10;
        for (var i = 0; i < 4; i++) { var on = i === 0 || i === 2; o.fillStyle = on ? 'rgba(255,211,77,.95)' : 'rgba(0,0,0,.6)'; rr(o, x + i * (w + 6), y, w, h, 6); o.fill(); setFont(o, 700, uk(10.5), FF.ui); o.fillStyle = on ? '#111' : '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(L[i], x + i * (w + 6) + w / 2, y + h / 2 + 0.5); }
      })],
      chip: '템플릿 · 확대 + 반짝임', rep: 5
    },
    'higgsfield-effects': {
      gcam: function (t, c) {
        var z = 0, f = Math.floor(t * 40);
        [2, 8.4].forEach(function (a) { var d = t - a; if (d >= 0 && d < 1.6) z = Math.max(z, d < 0.2 ? eout(d / 0.2) : (d < 1.2 ? 1 : 1 - eio((d - 1.2) / 0.4))); });
        if (z <= 0) return null;
        var an = ANCH[c.src] || [0.5, 0.5], e = (t % 6.4) < 2.3 ? 1 : 0.5;
        return { s: 1 + 1.4 * z, x: (hash(f) - 0.5) * 10 * z * e, y: (hash(f + 1) - 0.5) * 8 * z * e + (c.src === 'coffee' ? (0.58 - 0.45) * LH * 1.4 * z : 0) * (an ? 1 : 0) };
      },
      fx: [function (T, g, t) {
        [2, 8.4].forEach(function (a) {
          var d = t - a; if (d < 0 || d > 0.35) return; var sp = Math.sin(Math.PI * d / 0.35), src = copyP(T, T.buf('hz'));
          for (var i = 1; i < 6; i++) { var s = 1 + i * 0.05 * sp; g.globalAlpha = 1 / (i + 1); g.drawImage(src, LW / 2 - LW / 2 * s, LH / 2 - LH / 2 * s, LW * s, LH * s); }
          g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - d / 0.35)).toFixed(3) + ')'; g.fillRect(0, 0, LW, LH);
        });
      }],
      chip: '프리셋 · Crash Zoom', rep: 2.6
    },
    'new-camera-angle': {
      fx: [halfFx(function (T, g) {
        var src = copyP(T, T.buf('na')); g.fillStyle = '#000'; g.fillRect(LW / 2, 0, LW / 2, LH);
        g.save(); g.beginPath(); g.rect(LW / 2, 0, LW / 2, LH); g.clip();
        g.translate(LW * 0.75, LH * 0.95); g.transform(1, 0, -0.18, 1, 0, 0); g.scale(1.35, 1.75); g.rotate(-0.06); g.translate(-ANCH.coffee[0] * LW, -0.95 * LH);
        full(g, src); g.restore();
      })],
      ov: [halvesOv(['원본 앵글', '새 앵글 · 로우 앵글'])], chip: '가상 예시', rep: 2
    },
    'media-search': {
      ov: [function (T, o, t, F) {
        var R = F.FR, q = '김 나는 컵 클로즈업', n = Math.min(Array.from(q).length, Math.floor(t / 0.12)), shown = Array.from(q).slice(0, n).join('');
        o.fillStyle = 'rgba(0,0,0,.5)'; o.fillRect(R.x, R.y, R.w, R.h);
        var bx = R.x + R.w * 0.12, bw = R.w * 0.76, by = R.y + 14, bh = 30;
        o.fillStyle = '#fff'; rr(o, bx, by, bw, bh, 15); o.fill();
        setFont(o, 500, uk(12), FF.ui); o.fillStyle = '#111'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('🔍  ' + shown + (Math.floor(t * 2.5) % 2 && n < Array.from(q).length ? '|' : ''), bx + 12, by + bh / 2 + 0.5);
        if (t < 2.4) return;
        var K = ['coffee', 'product', 'street', 'portrait'], S = [98, 61, 22, 9], w = (R.w - 60) / 4, h = w * 9 / 16, y = R.y + R.h - h - 30;
        for (var i = 0; i < 4; i++) {
          var p = back((t - 2.4 - i * 0.12) / 0.3); if (p <= 0) continue; var x = R.x + 12 + i * (w + 12);
          o.save(); o.translate(x + w / 2, y + h / 2); o.scale(p, p); o.translate(-(x + w / 2), -(y + h / 2));
          stillThumb(o, K[i], x, y, w, h, T); o.strokeStyle = i ? 'rgba(255,255,255,.4)' : '#ffd34d'; o.lineWidth = i ? 1 : 3; o.strokeRect(x, y, w, h);
          chip(o, S[i] + '%', x + 4, y + h + 4, { size: 9, bg: i ? 'rgba(40,40,46,.9)' : 'rgba(255,211,77,.95)', fg: i ? '#fff' : '#111' });
          o.restore();
        }
      }],
      rep: 4
    },
    'script-to-timeline': {
      cap: 'burn',
      panel: function (T, o, t, PR) {
        panelBg(o, PR); var lx = PR.x + 10, tx0 = PR.x + PR.w * 0.42, tx1 = PR.x + PR.w - 10, ty = PR.y + PR.h / 2 - 12, th = 24, cl = T.E.clips;
        for (var i = 0; i < CAPS.length; i++) {
          var K = Math.min(UIK, 1.6), c = CAPS[i], y = PR.y + 14 * K + i * 19 * K, on = t >= c.t0 && t < c.t1;
          setFont(o, on ? 700 : 500, 10.5, FF.ui); o.fillStyle = on ? '#ffd34d' : '#d8d8e0'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText((i + 1) + '. ' + c.text, lx, y);
        }
        for (i = 0; i < cl.length; i++) {
          var a = clamp((t - 0.2 - i * 0.45) / 0.3, 0, 1); if (a <= 0) continue;
          var x0 = lerp(tx0, tx1, cl[i].t0 / 12), x1 = lerp(tx0, tx1, cl[i].t1 / 12);
          o.globalAlpha = a; o.fillStyle = SRC_COL[cl[i].src]; rr(o, x0 + 1, ty + (1 - a) * 10, x1 - x0 - 2, th, 4); o.fill();
          setFont(o, 600, uk(9.5), FF.ui); o.fillStyle = '#fff'; o.fillText(SRC_KO[cl[i].src], x0 + 6, ty + th / 2 + (1 - a) * 10); o.globalAlpha = 1;
        }
        setFont(o, 600, uk(9), FF.ui); o.fillStyle = '#a78bfa'; o.textAlign = 'left'; o.fillText('✦ 대본에 맞는 테이크를 찾아 놓았어요', tx0, ty + th + 14);
        var px = lerp(tx0, tx1, t / 12); o.fillStyle = '#ff4d4d'; o.fillRect(px - 1, ty - 6, 2, th + 12);
      },
      ph: 100, rep: 3
    },
    'ai-audio-mix': {
      panel: lanes(function (T) {
        var vi = vOf(T); return [{ name: '대사', clips: [{ k: 'voice', t0: 0, t1: 12, col: LC.v, wc: WC.v, g: vi ? 1 : 0.55 }] }, { name: '음악', clips: [{ k: 'bed', t0: 0, t1: 12, col: LC.m, wc: WC.m, g: vi ? function (t) { return envAt(DUCK, t) * 0.6; } : 1, env: vi ? function (t) { return envAt(DUCK, t) * 0.6; } : one(1) }] }, sfxLane('효과음', [[4.72, 'whoosh', 0.75], [7.72, 'whoosh', 0.75]])];
      }),
      audio: abMix(['voice','bed','whoosh'], function (M, vi) {
        M.play('voice', { dur: 12, gain: vi ? 1 : 0.5 });
        M.play('bed', { dur: 12, gain: vi ? 0.3 : 0.75, env: vi ? DUCK : [[0, 1], [12, 1]] });
        M.play('whoosh', { t: 4.72, gain: vi ? 0.35 : 1 }); M.play('whoosh', { t: 7.72, gain: vi ? 0.35 : 1 });
      }), akeys: ['whoosh'], rep: 3
    },

    /* === 내보내기 === */
    'h264-mp4': {
      ov: [ui(function (F) { return [F.FR.x + F.FR.w / 2, F.FR.y + F.FR.h / 2, Math.min(F.FR.w * 0.92 / 220, F.FR.h * 0.92 / 158)]; }, function (T, o, t, F) {
        var R = F.FR; dimFR(o, F, 0.45); var w = 220, h = 158, x = R.x + (R.w - w) / 2, y = R.y + (R.h - h) / 2; card(o, x, y, w, h, 12);
        setFont(o, 700, uk(12.5), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText('내보내기', x + 14, y + 18);
        var K = [['형식', 'MP4'], ['코덱', 'H.264 (High)'], ['오디오', 'AAC · 48kHz'], ['해상도', '1080 × 1920'], ['프레임', '29.97fps']];
        for (var i = 0; i < K.length; i++) kv(o, x + 14, y + 40 + i * 16, K[i][0], K[i][1], w - 28);
        var p = clamp((t % 6) / 4, 0, 1); o.fillStyle = 'rgba(255,255,255,.15)'; rr(o, x + 14, y + h - 22, w - 28, 8, 4); o.fill(); o.fillStyle = p >= 1 ? '#3ddc84' : '#5b8cff'; rr(o, x + 14, y + h - 22, (w - 28) * p, 8, 4); o.fill();
        setFont(o, 600, uk(9.5), FF.ui); o.fillStyle = '#c9c9d1'; o.textAlign = 'right'; o.fillText(p >= 1 ? '완료 ✓' : Math.round(p * 100) + '%', x + w - 14, y + h - 30);
      })],
      rep: 3
    },
    'bitrate-target': {
      fx: [function (T, g) { var src = copyP(T, T.buf('br')); g.save(); g.beginPath(); g.rect(0, 0, LW / 2, LH); g.clip(); pixelate(g, src, 0, 0, LW / 2, LH, 9); g.globalAlpha = 0.5; blurDraw(g, src, 0.5, 0, 0, LW, LH); g.restore(); }],
      ov: [halvesOv(['1Mbps · 깍두기가 보여요', '8Mbps · 권장'])], rep: 2
    },
    'frame-rate-match': {
      tl: function () { return [C('coffee', 0, 12)]; },
      gcam: function (t) { return { s: 1.25, x: Math.sin(t * 1.3) * 60 }; },
      fx: [function (T, g, t) {
        var k = Math.floor(t * 24), pat = k % 5 === 4 ? k - 1 : k;
        if (T.mem.frk !== pat || !T.mem.fr) { T.mem.fr = copyP(T, T.buf('frm')); T.mem.frk = pat; }
        g.save(); g.beginPath(); g.rect(0, 0, LW / 2, LH); g.clip(); full(g, T.mem.fr); g.restore();
      }],
      ov: [halvesOv(['24 → 30fps 변환 · 툭툭', '원본 프레임레이트'])], rep: 2
    },
    'shorts-length': {
      ov: [ui(function (F) { return [F.FR.x + F.FR.w / 2, F.FR.y + F.FR.h * 0.45, Math.min(F.FR.w * 0.95 / 340, F.FR.h * 0.9 / 120)]; }, function (T, o, t, F) {
        var R = F.FR; dimFR(o, F, 0.5); var w = Math.min(R.w - 40, 300), x = R.x + (R.w - w) / 2, y = R.y + R.h * 0.45;
        setFont(o, 700, uk(12.5), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('쇼츠 길이', R.x + R.w / 2, y - 40);
        function X(s) { return x + w * Math.sqrt(s / 180); }
        o.fillStyle = 'rgba(255,255,255,.15)'; rr(o, x, y - 6, w, 12, 6); o.fill();
        o.fillStyle = 'rgba(61,220,132,.75)'; o.fillRect(X(15), y - 6, X(30) - X(15), 12);
        var lb = [[0, '0초'], [15, '15'], [30, '30초'], [60, '1분'], [180, '3분']];
        for (var i = 0; i < lb.length; i++) { setFont(o, 500, uk(9.5), FF.ui); o.fillStyle = '#c9c9d1'; o.fillText(lb[i][1], X(lb[i][0]), y + 18); }
        var mx = X(12 * eout(t / 2)); o.fillStyle = '#ffd34d'; o.beginPath(); o.moveTo(mx, y - 8); o.lineTo(mx - 5, y - 16); o.lineTo(mx + 5, y - 16); o.closePath(); o.fill();
        setFont(o, 700, uk(10), FF.ui); o.fillStyle = '#ffd34d'; o.fillText('이 영상 12초', mx, y - 24);
        setFont(o, 500, uk(10), FF.ui); o.fillStyle = '#e8e8ee'; o.fillText('최대 3분 · 끝까지 보기 좋은 길이는 15~30초', R.x + R.w / 2, y + 42);
      })],
      rep: 3
    },
    'thumbnail-first-frame': {
      ov: [function (T, o, t, F) {
        var R = F.FR; o.fillStyle = '#0f0f12'; o.fillRect(R.x, R.y, R.w, R.h);
        var h = R.h - 40, w = h * 9 / 16, gap = 14, x0 = R.x + (R.w - (w * 3 + gap * 2)) / 2, y = R.y + 20, K = ['street', 'coffee', 'portrait'];
        for (var i = 0; i < 3; i++) {
          var x = x0 + i * (w + gap); stillThumb(o, K[i], x, y, w, h, T);
          if (i === 1) {
            var s1 = w * 0.17; txt(o, '7시에만', x + w / 2, y + h * 0.42, { size: s1, w: 400, font: FF.hz, fill: '#ffe14a', stroke: '#000', sw: s1 * 0.2, base: 'middle' }); txt(o, '파는 커피', x + w / 2, y + h * 0.42 + s1 * 1.15, { size: s1, w: 400, font: FF.hz, fill: '#fff', stroke: '#000', sw: s1 * 0.2, base: 'middle' });
            o.strokeStyle = '#ffd34d'; o.lineWidth = 2.5; o.strokeRect(x, y, w, h);
          } else { o.fillStyle = 'rgba(0,0,0,.35)'; o.fillRect(x, y, w, h); }
          setFont(o, 500, uk(8.5), FF.ui); o.fillStyle = '#c9c9d1'; o.textAlign = 'left'; o.textBaseline = 'top'; o.fillText(['출근길 브이로그', '모닝빈', '오늘의 기록'][i], x, y + h + 4);
        }
      }],
      chip: '피드에서 보이는 첫 프레임', rep: 1
    },
    'loudness-target': {
      panel: loudPanel(['유튜브 · 스포티파이 -14 LUFS', '-1 dBTP · 틱톡·릴스는 비공식']),
      audio: abMix(['voice'], function (M, vi, ac) { if (!vi) { M.play('voice', { dur: 12 }); return; } var cp = M.node(ac.createDynamicsCompressor()); cp.threshold.value = -10; cp.ratio.value = 8; cp.connect(M.out); M.play('voice', { dur: 12, gain: 2.19, dest: cp }); }),
      akeys: ['voice'], rep: 3
    },
    'prores-master': {
      ov: [ui(function (F) { return [F.FR.x + F.FR.w / 2, F.FR.y + F.FR.h / 2, Math.min(F.FR.w * 0.92 / 250, F.FR.h * 0.92 / 118)]; }, function (T, o, t, F) {
        var R = F.FR; dimFR(o, F, 0.45); var w = 250, h = 118, x = R.x + (R.w - w) / 2, y = R.y + (R.h - h) / 2; card(o, x, y, w, h, 12);
        var L = [['master.mov', 'ProRes 422 HQ', '1.9GB', 1, '#a78bfa'], ['upload.mp4', 'H.264 · 8Mbps', '12MB', 0.08, '#5b8cff']];
        for (var i = 0; i < 2; i++) {
          var yy = y + 22 + i * 46; setFont(o, 700, uk(11), FF.mono); o.fillStyle = '#fff'; o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillText(L[i][0], x + 14, yy);
          setFont(o, 500, uk(9.5), FF.ui); o.fillStyle = '#9a9aa6'; o.fillText(L[i][1], x + 108, yy); o.textAlign = 'right'; o.fillStyle = '#fff'; o.fillText(L[i][2], x + w - 14, yy);
          o.fillStyle = 'rgba(255,255,255,.12)'; rr(o, x + 14, yy + 10, w - 28, 8, 4); o.fill(); o.fillStyle = L[i][4]; rr(o, x + 14, yy + 10, Math.max(8, (w - 28) * L[i][3] * eout(t / 1.5)), 8, 4); o.fill();
        }
      })],
      chip: '마스터는 따로 보관해요', rep: 3
    },
    'content-credentials': {
      tl: function () { return [C('coffee', 0, 12, null, { draw: keyComp('painting', { s: 0.78, y: 34 }) })]; },
      ov: [ui(function (F) { return [F.FR.x + F.FR.w, F.FR.y, Math.min(F.FR.w * 0.9 / 200, F.FR.h * 0.9 / 140)]; }, function (T, o, t, F) {
        var R = F.FR, bx = R.x + R.w - 34, by = R.y + 10;
        o.fillStyle = '#fff'; o.beginPath(); o.arc(bx + 12, by + 12, 12, 0, TAU); o.fill(); setFont(o, 800, uk(11), FF.ui); o.fillStyle = '#111'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('cr', bx + 12, by + 12.5);
        var p = eout((t - 0.8) / 0.4) * (1 - ein((t - 9.6) / 0.4)); if (p <= 0) return;
        var w = 190, h = 96, x = bx + 24 - w, y = by + 30;
        o.save(); o.globalAlpha = p; card(o, x, y, w, h, 10);
        setFont(o, 700, uk(11), FF.ui); o.fillStyle = '#fff'; o.textAlign = 'left'; o.fillText('콘텐츠 자격 증명', x + 12, y + 16);
        kv(o, x + 12, y + 38, '만든 곳', '편집 앱', w - 24); kv(o, x + 12, y + 56, 'AI 사용', '배경 교체', w - 24, '#ffd34d'); kv(o, x + 12, y + 74, '서명', '2026-10-18', w - 24);
        o.restore();
      })],
      rep: 3
    }
  };
  function jl(aCut, kind) {
    return {
      tl: function () { return [C('coffee', 0, 6, push(1, 1.06)), C('street', 6, 12, push(1.04, 1.12))]; },
      panel: lanes(function (T) {
        var vi = vOf(T), a = vi ? aCut : 6;
        return [{ name: '영상', v: [{ t0: 0, t1: 6, src: 'coffee' }, { t0: 6, t1: 12, src: 'street' }] },
          { name: '소리', clips: [{ k: 'cafe', t0: 0, t1: a, col: 'rgba(46,138,116,.55)', wc: WC.a, label: '' }, { k: 'street', t0: a, t1: 12, off: a, col: 'rgba(122,100,80,.6)', wc: 'rgba(240,220,190,.85)' }] }];
      }),
      pextra: function (T, o, t, PR, Rw) {
        if (!vOf(T)) return;
        var x0 = PX(PR, aCut), x1 = PX(PR, 6), y = Rw[1].y + Rw[1].h + 1;
        o.strokeStyle = '#ffd34d'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(x0, Rw[1].y); o.lineTo(x0, y + 2); o.lineTo(x1, y + 2); o.lineTo(x1, Rw[0].y); o.stroke();
        setFont(o, 700, uk(9.5), FF.ui); o.fillStyle = '#ffd34d'; o.textAlign = kind === 'J' ? 'right' : 'left'; o.textBaseline = 'middle';
        o.fillText(kind === 'J' ? '다음 소리가 먼저 ' : ' 앞 소리가 이어져요', kind === 'J' ? x0 - 4 : x0 + 4, Rw[1].y + Rw[1].h / 2);
      },
      audio: abMix(['cafe','voice','street'], function (M, vi) {
        var a = vi ? aCut : 6;
        M.play('cafe', { dur: a + 0.2, gain: 0.7, env: [[0, 1], [a - 0.12, 1], [a + 0.12, 0]] });
        M.play('voice', { dur: Math.min(a, 12), env: [[0, 1], [a - 0.15, 1], [a, 0]] });
        M.play('street', { t: Math.max(0, a - 0.12), off: Math.max(0, a - 0.12), gain: 0.9, env: [[0, 0], [a - 0.12, 0], [a + 0.15, 1], [12, 1]] });
      }),
      ph: 80, rep: kind === 'J' ? 5.2 : 6.8
    };
  }
  var VSC = null;
  var IRB = null;
  function irBuf(ac) {
    if (IRB && IRB.sampleRate === ac.sampleRate) return IRB;
    var n = Math.floor(ac.sampleRate * 1.8), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    IRB = b; return b;
  }

  /* ---------- 합치기·등록 ---------- */
  function merge(list) {
    var R = { fx: [], ov: [], pre: [] }, tl = null, gcams = [], grades = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.tl) tl = r.tl;
      if (r.tr) R.tr = r.tr;
      if (r.gcam) gcams.push(r.gcam);
      if (r.rate) R.rate = r.rate;
      if (r.pre) R.pre = R.pre.concat(r.pre);
      if (r.fx) R.fx = R.fx.concat(r.fx);
      if (r.ov) R.ov = R.ov.concat(r.ov);
      if (r.grade) grades.push(r.grade);
      if (r.split) { R.split = r.split; R.splitL = r.splitL; R.splitRaw = r.splitRaw || null; }
      if (r.frame) R.frame = r.frame;
      if (r.cap) R.cap = r.cap;
      if (r.panel && !R.panel) { R.panel = r.panel; R.ph = r.ph; R.pextra = r.pextra; }
      if (r.audio && !R.audio) R.audio = r.audio;
      if (r.akeys) R.akeys = (R.akeys || []).concat(r.akeys);
      if (r.rep != null) R.rep = r.rep;
      if (r.vrep != null) R.vrep = r.vrep;
      if (r.chip && list.length === 1) R.chip = r.chip;
    }
    R.E = { clips: tl ? tl() : BASE(), tr: R.tr || null };
    if (gcams.length === 1) R.gcam = gcams[0];
    else if (gcams.length > 1) R.gcam = function (t, c, T) {
      var o = { s: 1, x: 0, y: 0, r: 0 }, any = false;
      for (var j = 0; j < gcams.length; j++) { var g = gcams[j](t, c, T); if (!g) continue; any = true; o.s *= g.s || 1; o.x += g.x || 0; o.y += g.y || 0; o.r += g.r || 0; }
      return any ? o : null;
    };
    if (grades.length === 1) R.grade = grades[0];
    else if (grades.length > 1) {
      var m = { f: '', L: [], fb: [], vig: 0, grain: 0 };
      for (var k = 0; k < grades.length; k++) { var gg = grades[k]; if (gg.f) m.f += ' ' + gg.f; if (gg.L) m.L = m.L.concat(gg.L); if (gg.fb) m.fb = m.fb.concat(gg.fb); m.vig = Math.max(m.vig, gg.vig || 0); m.grain = Math.max(m.grain, gg.grain || 0); }
      m.f = m.f.trim(); R.grade = m;
    }
    if (R.panel && R.audio) R.akeys = (R.akeys || []).concat(R.audio.keys);
    return R;
  }
  function collect(terms) {
    var list = [], any = false;
    for (var i = 0; i < terms.length; i++) { var id = terms[i] && terms[i].id, r = id && RX.hasOwnProperty(id) ? RX[id] : null; if (r) { list.push(r); any = true; } }
    return { list: list, any: any };
  }
  var PRIMARY = { key: 'cafe-short', label: '카페 쇼츠 가편집', src: VSRC, prompt: 'Edit a 12-second cafe Short from the coffee clip and product stills' };
  var DEF = {
    aspect: '16/9',
    primaries: [PRIMARY],
    primaryFor: function () { return 'cafe-short'; },
    supports: function (term) { return !!(term && RX.hasOwnProperty(term.id)); },
    render: function (el, terms, ctx) {
      terms = terms || []; ctx = ctx || {};
      injectFonts(); loadAllStills();
      var T = null, c = collect(terms), opts = { reducedMotion: !!ctx.reducedMotion, thumb: !!ctx.thumb, note: terms.length && !c.any ? '원본으로 보여줘요' : null };
      try {
        T = new Tile(el, merge(c.list), opts);
      } catch (e) {
        if (window.console) console.warn('[r-editing]', e);
        try { if (T) T.destroy(); } catch (e2) { /* ignore */ }
        el.textContent = '';
        try { opts.note = terms.length ? '원본으로 보여줘요' : null; T = new Tile(el, merge([]), opts); } catch (e3) { T = null; }
      }
      return function () { if (T) T.destroy(); T = null; };
    }
  };
  PD.editingTerms = Object.keys(RX);
  var tries = 0;
  function reg() {
    if (typeof PD.registerRenderer === 'function') { PD.registerRenderer('editing', DEF); return; }
    if (tries === 0) (PD._pendingRenderers = PD._pendingRenderers || []).push(['editing', DEF]);
    if (tries++ < 100) setTimeout(reg, 100);
  }
  reg();
})();
