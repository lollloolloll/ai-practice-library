/* r-video.js — 영상 용어 '이론적 결과' 렌더러 (classic script, ES2020)
 * 원본: assets/primary/coffee.mp4 한 클립. 용어마다 가상 카메라·그레이딩·속도·오버레이를 조합해 보여준다.
 * 구조: 타일 1개 = <video> 1개 + 레이어(배경 확장, 카메라 래퍼, 피사체 마스크, 효과 캔버스, 오버레이, HUD, 도식 SVG).
 */
(function () {
  'use strict';
  var PD = window.PD = window.PD || {};

  var SRC = 'assets/primary/coffee.mp4';
  var FX = 0.5, FY = 0.55;          // 피사체(컵) 중심 — 원본 프레임 비율 좌표. 원본에 맞게 조정 가능.
  var TAU = Math.PI * 2;
  var MAX_RES = 960;                 // 오버레이 캔버스 최대 픽셀 폭
  var W7 = 'rgba(255,255,255,.72)';

  /* ---------- utils ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function pp(t, P) { return 0.5 - 0.5 * Math.cos(TAU * t / P); }     // 0→1→0
  function sn(t, P) { return Math.sin(TAU * t / P); }
  function frac(x) { return x - Math.floor(x); }
  function cyc(t, P) { return frac(t / P); }
  function nz(t, s) { s = s || 0; return Math.sin(t * 1.73 + s) * 0.5 + Math.sin(t * 2.97 + s * 2.1) * 0.3 + Math.sin(t * 5.31 + s * 3.7) * 0.2; }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function seg(u, a, b) { return smooth((u - a) / (b - a)); }       // 0 before a, 1 after b
  // 한 방향 이동 + 루프 이음새에서 짧게 암전
  function prog(t, P, S) {
    var u = cyc(t, P);
    if (S) {
      var d = u > 0.93 ? (u - 0.93) / 0.07 : (u < 0.04 ? 1 - u / 0.04 : 0);
      if (d > S.dip) S.dip = d;
    }
    return smooth(u / 0.86);
  }
  function kf(ks, t) {
    if (t <= ks[0][0]) return ks[0][1];
    for (var i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) { var a = ks[i - 1], b = ks[i]; return lerp(a[1], b[1], smooth((t - a[0]) / (b[0] - a[0]))); }
    }
    return ks[ks.length - 1][1];
  }
  // CSS 변환(translate·rotateX·rotateY·rotateZ·scale, 원점 ox/oy, 원근 d)을 그대로 투영해
  // 타일 네 모서리가 변환된 화면 안에 들어오는 최소 배율(≥1)을 찾는다.
  function projQuad(W, H, d, c, ox, oy, s) {
    var rx = c.rx * Math.PI / 180, ry = c.ry * Math.PI / 180, rz = c.rz * Math.PI / 180;
    var cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry), cZ = Math.cos(rz), sZ = Math.sin(rz);
    var tx = c.x / 100 * W, ty = c.y / 100 * H, OX = ox * W, OY = oy * H, P = [[0, 0], [W, 0], [W, H], [0, H]], out = [];
    for (var i = 0; i < 4; i++) {
      var x = (P[i][0] - OX) * s, y = (P[i][1] - OY) * s, z = 0, t;
      t = x * cZ - y * sZ; y = x * sZ + y * cZ; x = t;            // rotateZ
      t = x * cY + z * sY; z = -x * sY + z * cY; x = t;           // rotateY
      t = y * cX - z * sX; z = y * sX + z * cX; y = t;            // rotateX
      x += OX + tx; y += OY + ty;
      var k = d / Math.max(1, d - z);
      out.push([W / 2 + (x - W / 2) * k, H / 2 + (y - H / 2) * k]);
    }
    return out;
  }
  function covers(q, W, H) {
    var m = -0.75, C = [[-m, -m], [W + m, -m], [W + m, H + m], [-m, H + m]], sgn = 0;
    for (var j = 0; j < 4; j++) {
      for (var i = 0; i < 4; i++) {
        var a = q[i], b = q[(i + 1) % 4], cr = (b[0] - a[0]) * (C[j][1] - a[1]) - (b[1] - a[1]) * (C[j][0] - a[0]);
        if (Math.abs(cr) < 1e-6) continue;
        var sg = cr > 0 ? 1 : -1;
        if (!sgn) sgn = sg; else if (sg !== sgn) return false;
      }
    }
    return true;
  }
  function coverK(W, H, d, c, ox, oy) {
    if (!W || !H) return 1;
    if (covers(projQuad(W, H, d, c, ox, oy, c.s), W, H)) return 1;
    var lo = 1, hi = 1.5;
    while (hi < 4 && !covers(projQuad(W, H, d, c, ox, oy, c.s * hi), W, H)) { lo = hi; hi *= 1.4; }
    for (var it = 0; it < 9; it++) {
      var mid = (lo + hi) / 2;
      if (covers(projQuad(W, H, d, c, ox, oy, c.s * mid), W, H)) hi = mid; else lo = mid;
    }
    return hi * 1.01;
  }
  function css(e, s) { for (var k in s) e.style[k] = s[k]; return e; }
  function mk(tag, style, parent) { var e = document.createElement(tag); if (style) css(e, style); if (parent) parent.appendChild(e); return e; }
  function full(extra) {
    var o = { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function setS(e, prop, val) { var k = '_s_' + prop; if (e[k] !== val) { e[k] = val; e.style[prop] = val; } }
  function setMask(e, m) {
    var k = '_mask';
    if (e[k] === m) return; e[k] = m;
    e.style.webkitMaskImage = m; e.style.maskImage = m;
  }
  var MASK = {
    ellipse: 'radial-gradient(ellipse 24% 34% at ' + (FX * 100) + '% ' + (FY * 100) + '%, #000 55%, rgba(0,0,0,0) 100%)',
    small: 'radial-gradient(ellipse 14% 20% at ' + (FX * 100) + '% ' + ((FY - 0.06) * 100) + '%, #000 45%, rgba(0,0,0,0) 100%)',
    big: 'radial-gradient(ellipse 30% 42% at ' + (FX * 100) + '% ' + (FY * 100) + '%, #000 62%, rgba(0,0,0,0) 100%)',
    band: 'linear-gradient(to bottom, rgba(0,0,0,0) ' + ((FY - 0.27) * 100) + '%, #000 ' + ((FY - 0.1) * 100) + '%, #000 ' + ((FY + 0.08) * 100) + '%, rgba(0,0,0,0) ' + ((FY + 0.25) * 100) + '%)'
  };

  /* ---------- module caches ---------- */
  var grainTiles = null;
  function getGrain() {
    if (grainTiles) return grainTiles;
    grainTiles = [];
    for (var k = 0; k < 4; k++) {
      var c = document.createElement('canvas'); c.width = 160; c.height = 160;
      var x = c.getContext('2d'), im = x.createImageData(160, 160), d = im.data;
      for (var i = 0; i < d.length; i += 4) { var v = (Math.random() * 255) | 0; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
      x.putImageData(im, 0, 0); grainTiles.push(c);
    }
    return grainTiles;
  }
  var lutCache = {};
  function fisheyeLUT(w, h, k) {
    var key = w + 'x' + h + ':' + k;
    if (lutCache[key]) return lutCache[key];
    var lut = new Int32Array(w * h), cx = w / 2, cy = h / 2, rn = Math.sqrt(cx * cx + cy * cy);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = (x - cx) / rn, dy = (y - cy) / rn, r2 = dx * dx + dy * dy;
        var f = (1 - k) + k * r2;
        var sx = Math.round(cx + (x - cx) * f), sy = Math.round(cy + (y - cy) * f);
        lut[y * w + x] = (sx >= 0 && sx < w && sy >= 0 && sy < h) ? sy * w + sx : -1;
      }
    }
    lutCache[key] = lut;
    return lut;
  }
  var qCache = {};
  function quantLUT(levels) {
    if (qCache[levels]) return qCache[levels];
    var a = new Uint8Array(256), st = 255 / (levels - 1);
    for (var i = 0; i < 256; i++) a[i] = clamp(Math.round(Math.round(i / st) * st), 0, 255);
    qCache[levels] = a;
    return a;
  }

  /* ---------- state ---------- */
  function newState() {
    return {
      cam: { x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0, flip: false },
      g: { b: 1, c: 1, sat: 1, sep: 0, hue: 0, gray: 0, blur: 0 },
      vblur: 0, rate: 1, mode: 'play', stepFps: 0, seekTo: null, maxT: 0,
      dip: 0, dipColor: '#000', subj: null, glow: 0, fx: null, tints: [],
      outline: false, hideCam: false, camOrigin: null
    };
  }
  function G(S, o) {
    var g = S.g;
    if (o.b != null) g.b *= o.b;
    if (o.c != null) g.c *= o.c;
    if (o.sat != null) g.sat *= o.sat;
    if (o.sep) g.sep = Math.max(g.sep, o.sep);
    if (o.hue) g.hue += o.hue;
    if (o.gray) g.gray = Math.max(g.gray, o.gray);
    if (o.blur) g.blur += o.blur;
  }
  function filt(g) {
    var f = '';
    if (g.sep > 0.001) f += 'sepia(' + g.sep.toFixed(3) + ') ';
    if (Math.abs(g.hue) > 0.1) f += 'hue-rotate(' + g.hue.toFixed(1) + 'deg) ';
    if (Math.abs(g.sat - 1) > 0.001) f += 'saturate(' + g.sat.toFixed(3) + ') ';
    if (g.gray > 0.001) f += 'grayscale(' + g.gray.toFixed(3) + ') ';
    if (Math.abs(g.b - 1) > 0.001) f += 'brightness(' + g.b.toFixed(3) + ') ';
    if (Math.abs(g.c - 1) > 0.001) f += 'contrast(' + g.c.toFixed(3) + ') ';
    if (g.blur > 0.05) f += 'blur(' + g.blur.toFixed(2) + 'px)';
    return f || 'none';
  }

  /* ---------- Tile ---------- */
  var BLEND = { shade: ['multiply', '3'], light: ['screen', '4'], grain: ['overlay', '5'], ov: ['normal', '6'] };

  function Tile(el, effects, opts) {
    var T = this;
    T.el = el; T.fx = effects; T.reduced = !!opts.reducedMotion;
    T.t = T.reduced ? 1.5 : 0; T.playing = !T.reduced; T.ready = false; T.visible = true; T.dead = false;
    T.layers = {}; T.views = {}; T.mem = {}; T.tintEls = []; T.listeners = [];
    T.w = el.clientWidth || 320; T.h = el.clientHeight || 180;

    T.root = mk('div', full({ overflow: 'hidden', background: '#000', isolation: 'isolate' }), el);
    T.bg = mk('canvas', full({ zIndex: '0', filter: 'blur(14px) brightness(.55) saturate(1.1)', transform: 'scale(1.15)' }), T.root);
    T.bg.width = 64; T.bg.height = 36; T.bgx = T.bg.getContext('2d');
    T.persp = Math.round(T.w * 2.4);
    T.stage = mk('div', full({ zIndex: '1', perspective: T.persp + 'px', perspectiveOrigin: '50% 50%' }), T.root);
    T.cam = mk('div', full({ transformOrigin: (FX * 100) + '% ' + (FY * 100) + '%', willChange: 'transform' }), T.stage);
    var v = T.video = mk('video', full({ objectFit: 'cover', display: 'block', zIndex: '0' }), T.cam);
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    if (!T.reduced) v.autoplay = true;
    T.dipEl = mk('div', full({ zIndex: '7', pointerEvents: 'none', opacity: '0', background: '#000' }), T.root);
    T.hud = mk('div', full({ zIndex: '8', pointerEvents: 'none' }), T.root);

    T.on(v, 'loadeddata', function () {
      T.ready = true; T.needDraw = true;
      if (T.playing) T.tryPlay();
      else { try { v.currentTime = 1.2; } catch (e) { /* ignore */ } }
    });
    T.on(v, 'seeked', function () { T.needDraw = true; });
    v.src = SRC;

    for (var i = 0; i < effects.length; i++) if (effects[i].setup) effects[i].setup(T);

    if (T.reduced) T.makePlayButton();

    if (typeof ResizeObserver === 'function') {
      T.ro = new ResizeObserver(function () { T.resize(); });
      T.ro.observe(el);
    }
    if (typeof IntersectionObserver === 'function') {
      T.io = new IntersectionObserver(function (ents) {
        for (var j = 0; j < ents.length; j++) T.visible = ents[j].isIntersecting;
        if (!T.visible && !T.video.paused) T.video.pause();
        if (T.visible && T.playing && T.ready) T.needDraw = true;
      });
      T.io.observe(el);
    }
    T._f = function (now) { T.frame(now); };
    T.raf = requestAnimationFrame(T._f);
  }
  Tile.prototype.on = function (target, ev, fn) { target.addEventListener(ev, fn); this.listeners.push([target, ev, fn]); };
  Tile.prototype.tryPlay = function () {
    var v = this.video;
    if (!v.paused) return;
    try { var p = v.play(); if (p && p.catch) p.catch(function () { /* autoplay blocked */ }); } catch (e) { /* ignore */ }
  };
  Tile.prototype.resize = function () {
    var T = this, w = T.el.clientWidth, h = T.el.clientHeight;
    if (!w || !h || (w === T.w && h === T.h)) return;
    T.w = w; T.h = h;
    T.persp = Math.round(w * 2.4); T.stage.style.perspective = T.persp + 'px';
    for (var n in T.layers) T.sizeCanvas(T.layers[n]);
    T.needDraw = true;
  };
  Tile.prototype.sizeCanvas = function (c) {
    var T = this, k = Math.min(window.devicePixelRatio || 1, MAX_RES / Math.max(1, T.w));
    c.width = Math.max(1, Math.round(T.w * k)); c.height = Math.max(1, Math.round(T.h * k)); c._k = k;
  };
  // 화면 공간 오버레이 레이어(이름별 블렌드 모드)
  Tile.prototype.L = function (name) {
    var T = this, c = T.layers[name];
    if (!c) {
      var b = BLEND[name] || BLEND.ov;
      c = mk('canvas', full({ pointerEvents: 'none', zIndex: b[1], mixBlendMode: b[0] }), T.root);
      c._x = c.getContext('2d'); T.layers[name] = c; T.sizeCanvas(c);
      c._x.setTransform(c._k, 0, 0, c._k, 0, 0);
    }
    return c._x;
  };
  // 카메라 래퍼 안쪽 캔버스(피사체 마스크·홀드·효과·글로우)
  Tile.prototype.inner = function (key, w, h, style) {
    var T = this, c = T[key];
    if (!c) {
      c = mk('canvas', full(style || {}), T.cam);
      c.width = w; c.height = h; c._x = c.getContext('2d');
      T[key] = c;
    }
    return c;
  };
  Tile.prototype.snapshot = function () {
    var T = this;
    if (!T.snap) { T.snap = document.createElement('canvas'); T.snap.width = 960; T.snap.height = 540; }
    if (T.ready) T.snap.getContext('2d').drawImage(T.video, 0, 0, 960, 540);
    return T.snap;
  };
  // 두 번째 화면(전환·시퀀스용): sp = {s, x, y, flip, filter, op, tf, clip, src}
  Tile.prototype.view = function (i, sp) {
    var T = this, c = T.views[i];
    if (!c) {
      c = mk('canvas', full({ zIndex: '2', pointerEvents: 'none' }), T.root);
      c.width = 960; c.height = 540; c._x = c.getContext('2d'); T.views[i] = c;
    }
    c._used = true;
    var src = sp.src || T.video, vw = src.videoWidth || src.width, vh = src.videoHeight || src.height;
    if (vw && T.ready) {
      var s = Math.max(1, sp.s || 1), sw = vw / s, sh = vh / s;
      var cx = (sp.x == null ? FX : sp.x) * vw, cy = (sp.y == null ? FY : sp.y) * vh;
      var sx = clamp(cx - sw / 2, 0, vw - sw), sy = clamp(cy - sh / 2, 0, vh - sh);
      var x = c._x;
      x.setTransform(1, 0, 0, 1, 0, 0);
      if (sp.flip) x.setTransform(-1, 0, 0, 1, 960, 0);
      x.drawImage(src, sx, sy, sw, sh, 0, 0, 960, 540);
      x.setTransform(1, 0, 0, 1, 0, 0);
    }
    setS(c, 'filter', sp.filter || 'none');
    setS(c, 'opacity', String(sp.op == null ? 1 : clamp(sp.op, 0, 1)));
    setS(c, 'transform', sp.tf || 'none');
    setS(c, 'clipPath', sp.clip || 'none');
    setS(c, 'display', 'block');
    return c;
  };
  Tile.prototype.chip = function (text, pos, mono) {
    var e = mk('div', {
      position: 'absolute', fontWeight: '600', fontSize: '11px', lineHeight: '1.2',
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit', color: '#fff', background: 'rgba(0,0,0,.55)', padding: '4px 7px', borderRadius: '6px',
      whiteSpace: 'nowrap', letterSpacing: '0', pointerEvents: 'none'
    }, this.hud);
    var p = pos || 'tl', cn = this.chipN || (this.chipN = {}), kq = cn[p] || 0;
    cn[p] = kq + 1;
    var m = (8 + kq * 24) + 'px';
    if (p.indexOf('t') === 0) e.style.top = m; else e.style.bottom = m;
    if (p.charAt(1) === 'l') e.style.left = '8px';
    else if (p.charAt(1) === 'r') e.style.right = '8px';
    else { e.style.left = '50%'; e.style.transform = 'translateX(-50%)'; }
    e.textContent = text;
    return e;
  };
  Tile.prototype.makePlayButton = function () {
    var T = this;
    var b = T.btn = mk('button', {
      position: 'absolute', zIndex: '10', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      fontFamily: 'inherit', fontWeight: '600', fontSize: '13px', lineHeight: '1', padding: '9px 14px', borderRadius: '999px', cursor: 'pointer',
      background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--line)'
    }, T.root);
    b.type = 'button'; b.textContent = '▶ 재생'; b.setAttribute('aria-label', '재생');
    T.on(b, 'click', function (ev) {
      ev.stopPropagation();
      T.playing = !T.playing;
      b.textContent = T.playing ? '❚❚' : '▶ 재생';
      b.setAttribute('aria-label', T.playing ? '일시정지' : '재생');
      css(b, T.playing ? { left: '8px', top: 'auto', bottom: '8px', transform: 'none', padding: '6px 9px' } :
        { left: '50%', top: '50%', bottom: 'auto', transform: 'translate(-50%,-50%)', padding: '9px 14px' });
      if (T.svg && T.svg.pauseAnimations) { if (T.playing) T.svg.unpauseAnimations(); else T.svg.pauseAnimations(); }
      if (T.playing) T.tryPlay(); else T.video.pause();
      T.needDraw = true;
    });
  };
  Tile.prototype.frame = function (now) {
    var T = this;
    if (T.dead) return;
    T.raf = requestAnimationFrame(T._f);
    var dt = T.last ? Math.min(0.1, (now - T.last) / 1000) : 0;
    T.last = now;
    if (!T.visible) return;
    if (T.playing) T.t += dt;
    else if (!T.needDraw) return;
    T.needDraw = false;
    try { T.step(T.playing ? dt : 0); }
    catch (e) {
      if (!T.err) { T.err = e; if (window.console) console.warn('[r-video]', e); }
      T.fx = [];
    }
  };
  Tile.prototype.step = function (dt) {
    var T = this, t = T.t, S = newState(), i, e, n;
    for (n in T.views) T.views[n]._used = false;
    for (i = 0; i < T.fx.length; i++) { e = T.fx[i]; if (e.apply) e.apply(S, t, T, dt); }
    for (n in T.views) if (!T.views[n]._used) setS(T.views[n], 'display', 'none');
    T.commit(S, dt);
    for (n in T.layers) {
      var c = T.layers[n], x = c._x;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
      x.setTransform(c._k, 0, 0, c._k, 0, 0);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    for (i = 0; i < T.fx.length; i++) { e = T.fx[i]; if (e.draw) e.draw(T, S, t, T.w, T.h); }
  };
  Tile.prototype.commit = function (S, dt) {
    var T = this, c = S.cam, v = T.video;
    // 회전·이동 시 프레임 가장자리가 보이지 않도록 자동 오버스캔
    if (!S.outline && !S.noCover) {
      var og = (S.camOrigin || '').match(/([\d.]+)%\s+([\d.]+)%/);
      c.s *= coverK(T.w, T.h, T.persp, c, og ? og[1] / 100 : FX, og ? og[2] / 100 : FY);
    }
    var tf = 'translate3d(' + c.x.toFixed(3) + '%,' + c.y.toFixed(3) + '%,0)';
    if (c.rx) tf += ' rotateX(' + c.rx.toFixed(2) + 'deg)';
    if (c.ry) tf += ' rotateY(' + c.ry.toFixed(2) + 'deg)';
    if (c.rz) tf += ' rotateZ(' + c.rz.toFixed(2) + 'deg)';
    tf += ' scale(' + (c.flip ? -c.s : c.s).toFixed(4) + ',' + c.s.toFixed(4) + ')';
    setS(T.cam, 'transform', tf);
    setS(T.cam, 'transformOrigin', S.camOrigin || ((FX * 100) + '% ' + (FY * 100) + '%'));
    setS(T.cam, 'filter', filt(S.g));
    setS(T.cam, 'visibility', S.hideCam ? 'hidden' : 'visible');
    setS(v, 'filter', S.vblur > 0.05 ? 'blur(' + S.vblur.toFixed(2) + 'px)' : 'none');

    if (T.playing && T.ready && T.visible) T.timeCtl(S, dt);
    if (T.ready) { try { T.bgx.drawImage(v, 0, 0, 64, 36); } catch (e) { /* not ready */ } }

    // 스텝(저프레임) 홀드
    var src = v;
    if (S.stepFps > 0) {
      var hc = T.inner('hold', 960, 540, { zIndex: '1' });
      if (T.ready && (T.mem._step == null || Math.abs(T.t - T.mem._step) >= 1 / S.stepFps || !T.playing)) {
        hc._x.drawImage(v, 0, 0, 960, 540); T.mem._step = T.t;
      }
      setS(hc, 'display', 'block'); src = hc;
    } else if (T.hold) setS(T.hold, 'display', 'none');

    // 픽셀/드로잉 효과
    if (S.fx && FXP[S.fx.name]) {
      var fc = T.inner('fxc', 480, 270, { zIndex: '2' });
      if (T.ready) FXP[S.fx.name](T, S.fx, src, fc, S);
      setS(fc, 'display', 'block');
    } else if (T.fxc) setS(T.fxc, 'display', 'none');

    // 피사체 마스크 레이어
    if (S.subj) {
      var sc = T.inner('subjC', 960, 540, { zIndex: '3', transformOrigin: (FX * 100) + '% ' + (FY * 100) + '%' });
      if (T.ready) sc._x.drawImage(src, 0, 0, 960, 540);
      setMask(sc, MASK[S.subj.mask] || S.subj.mask || MASK.ellipse);
      setS(sc, 'transform', 'scale(' + (S.subj.s || 1).toFixed(4) + ')');
      setS(sc, 'filter', S.subj.blur > 0.05 ? 'blur(' + S.subj.blur.toFixed(2) + 'px)' : 'none');
      setS(sc, 'display', 'block');
    } else if (T.subjC) setS(T.subjC, 'display', 'none');

    // 글로우(디퓨전·할레이션)
    if (S.glow > 0) {
      var gc = T.inner('glowC', 320, 180, { zIndex: '4', filter: 'blur(9px) brightness(1.15)', mixBlendMode: 'screen' });
      if (T.ready) gc._x.drawImage(src, 0, 0, 320, 180);
      setS(gc, 'opacity', S.glow.toFixed(3)); setS(gc, 'display', 'block');
    } else if (T.glowC) setS(T.glowC, 'display', 'none');

    // 색 틴트 레이어
    var i;
    for (i = 0; i < S.tints.length; i++) {
      var td = T.tintEls[i];
      if (!td) { td = mk('div', full({ zIndex: '5', pointerEvents: 'none' }), T.cam); T.tintEls.push(td); }
      var tn = S.tints[i];
      setS(td, 'background', tn.c); setS(td, 'mixBlendMode', tn.m || 'normal');
      setS(td, 'opacity', String(tn.o == null ? 1 : clamp(tn.o, 0, 1))); setS(td, 'display', 'block');
    }
    for (; i < T.tintEls.length; i++) setS(T.tintEls[i], 'display', 'none');

    // 원본 프레임 경계(와이드 샷)
    if (S.outline) {
      if (!T.outEl) T.outEl = mk('div', full({ zIndex: '6', boxSizing: 'border-box', pointerEvents: 'none', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.55)' }), T.cam);
      setS(T.outEl, 'borderWidth', (1.4 / Math.max(0.2, c.s)).toFixed(2) + 'px'); setS(T.outEl, 'display', 'block');
    } else if (T.outEl) setS(T.outEl, 'display', 'none');

    setS(T.dipEl, 'background', S.dipColor);
    setS(T.dipEl, 'opacity', clamp(S.dip, 0, 1).toFixed(3));
  };
  Tile.prototype.timeCtl = function (S, dt) {
    var T = this, v = T.video, d = v.duration || 13;
    if (S.mode === 'freeze') { if (!v.paused) v.pause(); return; }
    if (S.mode === 'reverse') {
      if (!v.paused) v.pause();
      if (T.mem._rev == null) T.mem._rev = v.currentTime;
      T.mem._rev -= dt * (S.rate || 1);
      if (T.mem._rev < 0.1) T.mem._rev = d - 0.2;
      if (!v.seeking) { try { v.currentTime = T.mem._rev; } catch (e) { /* ignore */ } }
      return;
    }
    T.mem._rev = null;
    if (S.seekTo != null) { try { v.currentTime = S.seekTo; } catch (e) { /* ignore */ } }
    if (S.maxT && v.currentTime > S.maxT) { try { v.currentTime = 0; } catch (e) { /* ignore */ } }
    var r = clamp(S.rate, 0.0625, 16);
    if (Math.abs(v.playbackRate - r) > 0.01) v.playbackRate = r;
    T.tryPlay();
  };
  Tile.prototype.grab = function (src, w, h) {
    var T = this;
    if (!T.work || T.work.width !== w || T.work.height !== h) {
      T.work = document.createElement('canvas'); T.work.width = w; T.work.height = h;
      T.workX = T.work.getContext('2d', { willReadFrequently: true });
    }
    try { T.workX.drawImage(src, 0, 0, w, h); return T.workX.getImageData(0, 0, w, h); } catch (e) { return null; }
  };
  Tile.prototype.put = function (fc, img) {
    if (fc.width !== img.width || fc.height !== img.height) { fc.width = img.width; fc.height = img.height; fc._x = fc.getContext('2d'); }
    fc._x.putImageData(img, 0, 0);
  };
  Tile.prototype.destroy = function () {
    var T = this;
    if (T.dead) return;
    T.dead = true;
    cancelAnimationFrame(T.raf);
    if (T.ro) T.ro.disconnect();
    if (T.io) T.io.disconnect();
    for (var i = 0; i < T.listeners.length; i++) { var l = T.listeners[i]; l[0].removeEventListener(l[1], l[2]); }
    T.listeners = [];
    try { T.video.pause(); T.video.removeAttribute('src'); T.video.load(); } catch (e) { /* ignore */ }
    if (T.root.parentNode) T.root.parentNode.removeChild(T.root);
    T.snap = null; T.work = null; T.workX = null;
  };

  /* ---------- 픽셀·드로잉 효과 (≤ 480px) ---------- */
  var FXP = {
    // 배럴 왜곡: 광각(약) / 어안(강)
    fisheye: function (T, o, src, fc) {
      var w = 480, h = 270, d = T.grab(src, w, h); if (!d) return;
      var lut = fisheyeLUT(w, h, o.k || 0.4);
      if (!T.mem._fo || T.mem._fo.width !== w) T.mem._fo = new ImageData(w, h);
      var out = T.mem._fo, s32 = new Uint32Array(d.data.buffer), o32 = new Uint32Array(out.data.buffer);
      for (var i = 0; i < lut.length; i++) { var j = lut[i]; o32[i] = j < 0 ? 0xff000000 : s32[j]; }
      T.put(fc, out);
    },
    // 포스터라이즈 + 외곽선(셀 애니메이션 느낌)
    poster: function (T, o, src, fc) {
      var w = 480, h = 270, d = T.grab(src, w, h); if (!d) return;
      var p = d.data, q = quantLUT(o.levels || 5), n = w * h, i, j;
      var lum = T.mem._lum && T.mem._lum.length === n ? T.mem._lum : (T.mem._lum = new Uint8Array(n));
      for (i = 0, j = 0; i < n; i++, j += 4) lum[i] = (p[j] * 77 + p[j + 1] * 150 + p[j + 2] * 29) >> 8;
      var edge = o.edges !== false, thr = o.thr || 34;
      for (i = 0, j = 0; i < n; i++, j += 4) {
        p[j] = q[p[j]]; p[j + 1] = q[p[j + 1]]; p[j + 2] = q[p[j + 2]];
        if (edge && i % w < w - 1 && i < n - w) {
          var e = Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + w]);
          if (e > thr) { p[j] = p[j] * 0.25; p[j + 1] = p[j + 1] * 0.22; p[j + 2] = p[j + 2] * 0.3; }
        }
      }
      T.put(fc, d);
    },
    // VHS: 저해상도 + 색 번짐 + 트래킹 노이즈
    vhs: function (T, o, src, fc) {
      var w = 320, h = 180, d = T.grab(src, w, h); if (!d) return;
      var p = d.data, t = T.t;
      if (!T.mem._vo || T.mem._vo.width !== w) T.mem._vo = new ImageData(w, h);
      var out = T.mem._vo, q = out.data, band = (frac(t * 0.23) * 1.3 - 0.15) * h;
      for (var y = 0; y < h; y++) {
        var inBand = Math.abs(y - band) < 7, sh = inBand ? Math.round((hash(y + Math.floor(t * 30)) - 0.5) * 14) : 0;
        sh += Math.round(nz(y * 0.08 + t * 2, 1) * 1.2);
        for (var x = 0; x < w; x++) {
          var k = (y * w + x) * 4;
          var xr = clamp(x + sh + 3, 0, w - 1), xg = clamp(x + sh, 0, w - 1), xb = clamp(x + sh - 2, 0, w - 1);
          var row = y * w * 4;
          q[k] = p[row + xr * 4]; q[k + 1] = p[row + xg * 4 + 1]; q[k + 2] = p[row + xb * 4 + 2]; q[k + 3] = 255;
          if (inBand && hash(x * 7 + y * 13 + Math.floor(t * 40)) > 0.82) { q[k] = 235; q[k + 1] = 235; q[k + 2] = 235; }
        }
      }
      T.put(fc, out);
    },
    // 녹아내림(피카 이펙트): 세로 띠를 아래로 늘인다
    melt: function (T, o, src, fc) {
      if (fc.width !== 480) { fc.width = 480; fc.height = 270; fc._x = fc.getContext('2d'); }
      var x = fc._x, n = 60, sw = (src.videoWidth || src.width) / n, sh = src.videoHeight || src.height, m = o.m || 0;
      x.fillStyle = '#000'; x.fillRect(0, 0, 480, 270);
      for (var i = 0; i < n; i++) {
        var dist = 1 - Math.min(1, Math.abs(i / n - FX) * 2.2);
        var off = m * (0.35 + 0.65 * dist) * (0.6 + 0.4 * hash(i * 3.1)) * 270 * 0.55;
        x.drawImage(src, i * sw, 0, sw + 1, sh, i * 8, 0, 9, 270 + off);
      }
    },
    // 글리치(홀로그램): 가로 슬라이스 밀림
    glitch: function (T, o, src, fc) {
      if (fc.width !== 480) { fc.width = 480; fc.height = 270; fc._x = fc.getContext('2d'); }
      var x = fc._x, vw = src.videoWidth || src.width, vh = src.videoHeight || src.height, k = Math.floor(T.t * 9);
      x.drawImage(src, 0, 0, 480, 270);
      for (var i = 0; i < 6; i++) {
        if (hash(k * 11 + i) < 0.45) continue;
        var y = hash(k * 5 + i * 17) * 270, hh = 3 + hash(k + i) * 16, dx = (hash(k * 3 + i * 7) - 0.5) * 40;
        x.drawImage(src, 0, y / 270 * vh, vw, hh / 270 * vh, dx, y, 480, hh);
      }
    },
    // 투 샷: 같은 컵을 좌우로 마주 보게
    twin: function (T, o, src, fc) {
      if (fc.width !== 480) { fc.width = 480; fc.height = 270; fc._x = fc.getContext('2d'); }
      var x = fc._x, vw = src.videoWidth || src.width, vh = src.videoHeight || src.height;
      var sh = vh * 0.85, sw = sh * (240 / 270), sx = clamp(FX * vw - sw * 0.62, 0, vw - sw), sy = clamp(FY * vh - sh / 2, 0, vh - sh);
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(src, sx, sy, sw, sh, 0, 0, 240, 270);
      x.setTransform(-1, 0, 0, 1, 480, 0); x.drawImage(src, sx, sy, sw, sh, 0, 0, 240, 270);
      x.setTransform(1, 0, 0, 1, 0, 0);
    },
    // 모션 브러시: 정지 프레임 위 칠한 영역만 움직인다
    brush: function (T, o, src, fc) {
      if (fc.width !== 480) { fc.width = 480; fc.height = 270; fc._x = fc.getContext('2d'); }
      var x = fc._x;
      if (!T.mem._bs) { T.snapshot(); T.mem._bs = true; }
      x.drawImage(T.snap, 0, 0, 480, 270);
      x.save(); x.beginPath();
      x.ellipse(FX * 480, (FY - 0.24) * 270, 480 * 0.13, 270 * 0.24 * (o.r || 1), 0, 0, TAU);
      x.clip(); x.drawImage(src, 0, 0, 480, 270); x.restore();
    }
  };

  /* ---------- 2D 그리기 도우미 (CSS px 단위) ---------- */
  function drawGrain(x, w, h, t, alpha, scale) {
    var g = getGrain(), f = Math.floor(t * 24), tile = g[f % 4], sc = scale || 1;
    var pat = x.createPattern(tile, 'repeat'); if (!pat) return;
    x.save(); x.globalAlpha = alpha; x.scale(sc, sc);
    var ox = Math.floor(hash(f) * 160), oy = Math.floor(hash(f + 7) * 160);
    x.translate(-ox, -oy); x.fillStyle = pat; x.fillRect(ox, oy, w / sc + 1, h / sc + 1);
    x.restore();
  }
  function vignette(x, w, h, a, inner) {
    var g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * (inner || 0.35), w / 2, h / 2, Math.sqrt(w * w + h * h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + a + ')');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  function glow(x, px, py, r, rgb, a) {
    if (r <= 0 || a <= 0) return;
    var g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
  // 전경 오클루더(흐린 기둥·잎) — 시차로 카메라 이동을 보여준다
  function occluders(x, w, h, off, n, dark) {
    for (var i = 0; i < n; i++) {
      var sp = 1 + i * 0.45, px = frac(off * sp + hash(i + 3)) * w * 1.7 - w * 0.35;
      var bw = w * (0.06 + 0.06 * hash(i + 9)), py = h * (0.5 + 0.5 * (hash(i + 5) - 0.5));
      x.save(); x.translate(px, py); x.scale(1, 4.5);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, bw), a = 0.6 * dark * (0.7 + 0.3 * hash(i + 1));
      g.addColorStop(0, 'rgba(14,10,8,' + a + ')'); g.addColorStop(0.35, 'rgba(14,10,8,' + (a * 0.6) + ')'); g.addColorStop(1, 'rgba(14,10,8,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, bw, 0, TAU); x.fill(); x.restore();
    }
  }
  // 보케·먼지 흐름 — speed>0 이면 앞으로(바깥으로 퍼짐), <0 이면 뒤로
  function flow(x, w, h, t, speed, n, a) {
    var cx = w * FX, cy = h * FY, R = Math.sqrt(w * w + h * h) * 0.62;
    for (var i = 0; i < n; i++) {
      var ang = hash(i * 1.7) * TAU, r = frac(t * speed * (0.6 + 0.5 * hash(i + 2)) + hash(i * 3.3));
      var rr = r * r, px = cx + Math.cos(ang) * rr * R, py = cy + Math.sin(ang) * rr * R * 0.8;
      var al = a * Math.sin(Math.PI * r);
      glow(x, px, py, 2 + rr * w * 0.035, '255,236,210', al);
    }
  }
  function particles(x, w, h, t, o) {
    // o: {n, vx, vy, size, rgb, a, wob, y0, y1}
    var n = o.n || 50;
    for (var i = 0; i < n; i++) {
      var sp = 0.6 + 0.8 * hash(i + 11);
      var px = frac(hash(i) + t * (o.vx || 0) * sp + (o.wob ? 0.01 * Math.sin(t * 1.3 + i) : 0)) * w;
      var py = frac(hash(i + 40) + t * (o.vy || 0) * sp) * h;
      var sz = (o.size || 2) * (0.5 + hash(i + 70));
      var al = (o.a || 0.6) * (0.4 + 0.6 * hash(i + 90)) * (o.tw ? (0.5 + 0.5 * Math.sin(t * 4 + i * 2.3)) : 1);
      if (o.streak) {
        x.strokeStyle = 'rgba(' + (o.rgb || '255,255,255') + ',' + al + ')'; x.lineWidth = Math.max(0.6, sz * 0.4);
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + o.streak[0], py + o.streak[1]); x.stroke();
      } else glow(x, px, py, sz * 2.2, o.rgb || '255,255,255', al);
    }
  }
  function smokeWisps(x, w, h, t, a, n) {
    var cx = w * FX, top = h * (FY - 0.12);
    for (var i = 0; i < (n || 7); i++) {
      var u = frac(t * 0.18 + i / (n || 7));
      var px = cx + Math.sin(t * 0.9 + i * 1.7 + u * 5) * w * 0.035 * (1 + u * 2);
      var py = top - u * h * 0.5;
      glow(x, px, py, w * (0.03 + u * 0.06), '255,255,255', a * Math.sin(Math.PI * u));
    }
  }
  function label(x, text, px, py, o) {
    o = o || {};
    x.save();
    x.font = (o.weight || 600) + ' ' + (o.size || 11) + 'px ' + (o.font || 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif');
    x.textAlign = o.align || 'left'; x.textBaseline = 'middle';
    if (o.bg) {
      var mw = x.measureText(text).width, pad = 5, bx = o.align === 'center' ? px - mw / 2 - pad : (o.align === 'right' ? px - mw - pad : px - pad);
      x.fillStyle = o.bg; roundRect(x, bx, py - (o.size || 11) * 0.75, mw + pad * 2, (o.size || 11) * 1.5, 4); x.fill();
    }
    if (o.shadow !== false) { x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = 3; }
    x.fillStyle = o.color || '#fff'; x.fillText(text, px, py);
    x.restore();
  }
  function roundRect(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
    x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h); x.lineTo(a + r, b + h);
    x.quadraticCurveTo(a, b + h, a, b + h - r); x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b); x.closePath();
  }
  // 영상 일부를 사각형 패널에 그린다(시퀀스·레퍼런스 카드)
  function panel(x, src, rx, ry, rw, rh, s, cxf, cyf, flip) {
    var vw = src.videoWidth || src.width, vh = src.videoHeight || src.height;
    if (!vw) return;
    var ar = rw / rh, sh = vh / (s || 1), sw = sh * ar;
    if (sw > vw) { sw = vw; sh = sw / ar; }
    var sx = clamp((cxf == null ? FX : cxf) * vw - sw / 2, 0, vw - sw), sy = clamp((cyf == null ? FY : cyf) * vh - sh / 2, 0, vh - sh);
    x.save();
    if (flip) { x.translate(rx + rw, ry); x.scale(-1, 1); x.drawImage(src, sx, sy, sw, sh, 0, 0, rw, rh); }
    else x.drawImage(src, sx, sy, sw, sh, rx, ry, rw, rh);
    x.restore();
  }
  function ringMark(x, w, h, a, r) {
    x.save(); x.strokeStyle = 'rgba(255,255,255,' + a + ')'; x.lineWidth = 1.5; x.setLineDash([4, 4]);
    x.beginPath(); x.ellipse(w * FX, h * FY, w * (r || 0.13), h * (r || 0.13) * 1.45, 0, 0, TAU); x.stroke(); x.restore();
  }
  // 상단 타임라인(구간 라벨 + 재생 헤드)
  function timeline(x, w, h, segs, u, y) {
    var m = 8, bw = w - m * 2, by = y == null ? 8 : y, bh = 16, i;
    for (i = 0; i < segs.length; i++) {
      var a = segs[i][0], b = segs[i][1], on = u >= a && u < b;
      x.fillStyle = on ? 'rgba(255,255,255,.88)' : 'rgba(0,0,0,.5)';
      roundRect(x, m + a * bw + 1, by, (b - a) * bw - 2, bh, 3); x.fill();
      label(x, segs[i][2], m + (a + b) / 2 * bw, by + bh / 2, { align: 'center', size: 10, color: on ? '#111' : '#fff', shadow: false });
    }
    x.fillStyle = '#ff4d4d'; x.fillRect(m + u * bw - 1, by - 2, 2, bh + 4);
  }

  /* ---------- 카메라 도식(교과서 SVG, 64px) ---------- */
  function camIcon() {
    return '<rect x="-4.5" y="-1" width="9" height="7" rx="1.5" fill="' + W7 + '"/><path d="M-3 -1 L0 -5.5 L3 -1Z" fill="' + W7 + '"/>';
  }
  function cone(wd, len) { return '<path d="M0 -3 L' + (-wd) + ' ' + (-len) + ' L' + wd + ' ' + (-len) + 'Z" fill="rgba(255,255,255,.16)"/>'; }
  function diag(sp) {
    var s = '', d = sp.dur || 4, rep = ' dur="' + d + 's" repeatCount="indefinite"';
    if (sp.side) s += '<line x1="4" y1="57" x2="60" y2="57" stroke="' + W7 + '" stroke-width="1"/><rect x="40" y="48" width="8" height="9" rx="1.5" fill="none" stroke="' + W7 + '" stroke-width="1.4"/>';
    else if (sp.sub !== false) {
      var sx = sp.sub ? sp.sub[0] : 32, sy = sp.sub ? sp.sub[1] : 24;
      s += '<g><circle cx="0" cy="0" r="5" fill="none" stroke="' + W7 + '" stroke-width="1.4"/><circle cx="0" cy="0" r="1.6" fill="' + W7 + '"/>';
      if (sp.face) s += '<path d="M0 -5 L0 -10" stroke="' + W7 + '" stroke-width="1.4"/>';
      if (sp.subPath) s += '<animateMotion' + rep + ' path="' + sp.subPath + '"/>';
      s += '</g>';
      if (!sp.subPath) s = s.replace('<g>', '<g transform="translate(' + sx + ' ' + sy + ')">');
    }
    if (sp.extra) s += sp.extra;
    if (sp.path) s += '<path d="' + sp.path + '" fill="none" stroke="' + W7 + '" stroke-width="1.1" stroke-dasharray="2 2.5"/>';
    if (sp.nocam) return s;
    var inner = '<g transform="rotate(' + (sp.rot || 0) + ')">';
    if (sp.rotVals) inner = '<g><animateTransform attributeName="transform" type="rotate" values="' + sp.rotVals + '"' + (sp.rotTimes ? ' keyTimes="' + sp.rotTimes + '"' : '') + rep + '/>';
    var cw = sp.cone ? sp.cone[0] : 7, cl = sp.cone ? sp.cone[1] : 20;
    if (sp.coneVals) {
      var vals = sp.coneVals.map(function (q) { return 'M0 -3 L' + (-q) + ' ' + (-cl) + ' L' + q + ' ' + (-cl) + 'Z'; }).join(';');
      inner += '<path d="M0 -3 L' + (-cw) + ' ' + (-cl) + ' L' + cw + ' ' + (-cl) + 'Z" fill="rgba(255,255,255,.16)"><animate attributeName="d" values="' + vals + '"' + (sp.coneTimes ? ' keyTimes="' + sp.coneTimes + '"' : '') + rep + '/></path>';
    } else if (sp.cone !== false) inner += cone(cw, cl);
    inner += '<g' + (sp.spin ? '' : '') + '>' + camIcon() + (sp.spin ? '<animateTransform attributeName="transform" type="rotate" values="0;360"' + rep + '/>' : '') + '</g></g>';
    if (sp.path) {
      var kp = sp.mode === 'alt' ? ' keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear"' : '';
      s += '<g><animateMotion' + rep + kp + ' path="' + (sp.motion || sp.path) + '"/>' + inner + '</g>';
    } else {
      var c = sp.cam || [32, 50];
      s += '<g transform="translate(' + c[0] + ' ' + c[1] + ')">' + inner + '</g>';
    }
    return s;
  }
  function addDiagram(T, sp) {
    var box = mk('div', {
      position: 'absolute', right: '8px', bottom: '8px', width: '64px', height: '64px', zIndex: '9', pointerEvents: 'none',
      borderRadius: '8px', background: 'rgba(0,0,0,.28)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.85))'
    }, T.root);
    box.innerHTML = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' + diag(sp) + '</svg>';
    T.svg = box.firstChild;
    if (T.reduced && T.svg && T.svg.pauseAnimations) { T.svg.pauseAnimations(); try { T.svg.setCurrentTime(1); } catch (e) { /* ignore */ } }
    if (T.btn) css(T.btn, {});
    return box;
  }

  /* ---------- 효과 빌더 ---------- */
  function crop(s, dx, dy) { return { apply: function (S) { S.cam.s *= s; S.cam.x += dx || 0; S.cam.y += dy || 0; } }; }
  function wideFx(s) { return { apply: function (S) { S.cam.s *= s; S.outline = true; } }; }
  function grade(o) { return { apply: function (S) { G(S, o); } }; }
  function tint(c, m, o) { return { apply: function (S) { S.tints.push({ c: c, m: m, o: o }); } }; }
  function dof(blur, mask) {
    return { apply: function (S) { S.vblur += blur; if (!S.subj) S.subj = { mask: mask || 'ellipse', s: 1, blur: 0 }; } };
  }
  function glowFx(a) { return { apply: function (S) { S.glow = Math.max(S.glow, a); } }; }
  function grainFx(a, sc) { return { draw: function (T, S, t, w, h) { drawGrain(T.L('grain'), w, h, t, a, sc); } }; }
  function vigFx(a, inner) { return { draw: function (T, S, t, w, h) { vignette(T.L('ov'), w, h, a, inner); } }; }
  function chipFx(text, pos, mono) { return { setup: function (T) { T.chip(text, pos, mono); } }; }
  function dg(spec) { return { dg: spec }; }
  function rateFx(r) { return { apply: function (S) { S.rate *= r; } }; }
  function fxFx(o) { return { apply: function (S) { S.fx = o; } }; }
  function handheldFx(a) {
    return { apply: function (S, t) {
      S.cam.s *= 1 + 0.1 * a; S.cam.x += nz(t * 2.1, 1) * 1.3 * a; S.cam.y += nz(t * 2.4, 4) * 1.1 * a; S.cam.rz += nz(t * 1.7, 7) * 0.8 * a;
    } };
  }
  function rateChip() {
    return {
      setup: function (T) { T.mem.rc = T.chip('', 'tl', true); },
      draw: function (T, S) {
        var r = S.mode === 'freeze' ? '정지' : (S.mode === 'reverse' ? '◀ 역재생' : (clamp(S.rate, 0.0625, 16).toFixed(2).replace(/\.?0+$/, '') + '×'));
        if (T.mem.rc && T.mem.rc._t !== r) { T.mem.rc._t = r; T.mem.rc.textContent = r; }
      }
    };
  }
  function liveChip(pos, fn, mono) {
    return {
      setup: function (T) { T.mem['lc' + pos] = T.chip('', pos, mono); },
      draw: function (T, S, t) {
        var e = T.mem['lc' + pos], s = fn(t, T, S);
        if (e && e._t !== s) { e._t = s; e.textContent = s; e.style.visibility = s ? 'visible' : 'hidden'; }
      }
    };
  }
  // 레터박스/필러박스(퍼센트)
  function setBars(T, top, side) {
    if (!T.barEls) {
      T.barEls = [];
      var pos = [{ left: '0', right: '0', top: '0' }, { left: '0', right: '0', bottom: '0' }, { top: '0', bottom: '0', left: '0' }, { top: '0', bottom: '0', right: '0' }];
      for (var i = 0; i < 4; i++) {
        var b = mk('div', { position: 'absolute', background: '#000', pointerEvents: 'none' }, T.hud);
        css(b, pos[i]); T.barEls.push(b);
      }
      T.hud.insertBefore(T.barEls[3], T.hud.firstChild); T.hud.insertBefore(T.barEls[2], T.hud.firstChild);
      T.hud.insertBefore(T.barEls[1], T.hud.firstChild); T.hud.insertBefore(T.barEls[0], T.hud.firstChild);
    }
    setS(T.barEls[0], 'height', top.toFixed(2) + '%'); setS(T.barEls[1], 'height', top.toFixed(2) + '%');
    setS(T.barEls[2], 'width', side.toFixed(2) + '%'); setS(T.barEls[3], 'width', side.toFixed(2) + '%');
  }
  // 흐린 실루엣(그림자 트릭) — 오프셋/블러는 변환의 영향을 받지 않으므로 k 보정
  function soft(x, blur, color, pathFn) {
    var k = x.canvas._k || 1;
    x.save(); x.shadowColor = color; x.shadowBlur = blur * k; x.shadowOffsetX = 10000 * k; x.fillStyle = '#000';
    x.translate(-10000, 0); x.beginPath(); pathFn(x); x.fill(); x.restore();
  }
  // 휩: u(0..1) → [위치 -1..1, 속도 0..1]
  function whip(u, a, b, c, d) {
    var e;
    if (u < a) return [-1, 0];
    if (u < b) { e = (u - a) / (b - a); return [-1 + 2 * smooth(e), 6 * e * (1 - e) / 1.5]; }
    if (u < c) return [1, 0];
    if (u < d) { e = (u - c) / (d - c); return [1 - 2 * smooth(e), 6 * e * (1 - e) / 1.5]; }
    return [-1, 0];
  }
  function streaks(x, w, h, a) {
    if (a < 0.02) return;
    for (var i = 0; i < 26; i++) {
      var y = hash(i * 2.3) * h, l = w * (0.3 + 0.6 * hash(i + 4));
      x.fillStyle = 'rgba(255,255,255,' + (a * 0.22 * hash(i + 8)) + ')';
      x.fillRect(hash(i + 1) * w - l / 2, y, l, 1 + 2 * hash(i + 6));
    }
  }
  var ORBIT_ARC = 'M16.4 41.6 A22 22 0 0 0 47.6 41.6';

  /* ---------- 용어 → 효과 표 ---------- */
  var MAP = {
    /* 샷 크기 */
    'extreme-wide-shot': [wideFx(0.42)],
    'wide-establishing-shot': [wideFx(0.62), { apply: function (S, t) { S.cam.x += sn(t, 14) * 4; } }],
    'full-shot': [wideFx(0.84)],
    'medium-full-shot': [crop(1.15)],
    'medium-shot': [crop(1.4)],
    'medium-close-up': [crop(1.75)],
    'close-up': [crop(2.3)],
    'extreme-close-up': [crop(3.4, 0, 3)],
    'insert-shot': [crop(2.8, -4, 8), dof(3, 'small')],
    'two-shot': [fxFx({ name: 'twin' })],
    'over-the-shoulder': [crop(1.3, 7, 0), dof(2.5), {
      draw: function (T, S, t, w, h) {
        soft(T.L('ov'), 22, 'rgba(12,10,9,.94)', function (x) {
          x.ellipse(w * 0.08, h * 1.02, w * 0.34, h * 0.42, 0, 0, TAU);
          x.ellipse(w * 0.1 + nz(t * 0.7, 2) * 2, h * 0.5, w * 0.12, h * 0.25, 0, 0, TAU);
        });
      }
    }],
    'pov-shot': [handheldFx(0.45), { apply: function (S, t) { S.cam.s *= 1.15; S.cam.rx -= 8; S.cam.y += 3 + Math.sin(t * TAU * 0.25) * 0.9; } }, vigFx(0.5, 0.25)],

    /* 카메라 앵글 */
    'eye-level': [dg({ side: true, cam: [12, 52], rot: 90, cone: [6, 26], extra: '<line x1="4" y1="52" x2="60" y2="52" stroke="' + W7 + '" stroke-width="0.8" stroke-dasharray="2 2"/>' }), {
      draw: function (T, S, t, w, h) {
        var x = T.L('ov'); x.save(); x.strokeStyle = 'rgba(255,255,255,.35)'; x.setLineDash([5, 5]); x.lineWidth = 1;
        x.beginPath(); x.moveTo(0, h * FY); x.lineTo(w, h * FY); x.stroke(); x.restore();
      }
    }],
    'low-angle': [{ apply: function (S) { S.cam.rx += 16; S.cam.s *= 1.35; S.cam.y -= 4; } }, dg({ side: true, cam: [14, 56], rot: 62, cone: [6, 28] })],
    'high-angle': [{ apply: function (S) { S.cam.rx -= 16; S.cam.s *= 1.35; S.cam.y += 4; } }, dg({ side: true, cam: [14, 16], rot: 128, cone: [6, 34] })],
    'birds-eye-view': [{ apply: function (S, t) { S.cam.rx -= 34; S.cam.s *= 1.75; S.cam.y += 6; S.cam.rz += sn(t, 16) * 4; } }, dg({ side: true, cam: [44, 9], rot: 180, cone: [8, 34] })],
    'worms-eye-view': [{ apply: function (S) { S.cam.rx += 32; S.cam.s *= 1.85; S.cam.y -= 8; S.camOrigin = '50% 80%'; } }, dg({ side: true, cam: [27, 57], rot: 42, cone: [7, 28] })],
    'dutch-angle': [{ apply: function (S) { S.cam.rz += 13; S.cam.s *= 1.32; } }, dg({ nocam: true, sub: false, extra: '<g transform="rotate(-13 32 32)"><rect x="12" y="18" width="40" height="28" rx="2" fill="none" stroke="' + W7 + '" stroke-width="1.4"/></g><line x1="6" y1="32" x2="58" y2="32" stroke="' + W7 + '" stroke-width="0.8" stroke-dasharray="2 2"/>' })],
    'profile-shot': [{ apply: function (S) { S.cam.ry += 38; S.cam.s *= 1.4; S.cam.x -= 5; } }, dg({ sub: [34, 26], face: true, cam: [8, 26], rot: 90, cone: [6, 22] })],
    'rear-shot': [{ apply: function (S) { S.cam.flip = !S.cam.flip; S.cam.ry -= 22; S.cam.s *= 1.35; } }, grade({ b: 0.85 }), dg({ sub: [32, 24], face: true, cam: [32, 50] })],

    /* 카메라 무빙 */
    'static-shot': [dg({ cam: [32, 50] }), chipFx('고정', 'tl')],
    'pan': [{ apply: function (S, t) { var v = -Math.cos(TAU * t / 7); S.cam.s *= 1.4; S.cam.x -= v * 13; S.cam.ry += v * 7; } },
      dg({ rotVals: '-28;28;-28', dur: 7 })],
    'tilt': [{ apply: function (S, t) { var v = -Math.cos(TAU * t / 7); S.cam.s *= 1.4; S.cam.y += v * 12; S.cam.rx += v * 6; } },
      dg({ side: true, cam: [14, 46], rotVals: '55;125;55', dur: 7, cone: [6, 26] })],
    'dolly-in': [{ apply: function (S, t) { var p = prog(t, 6, S); S.cam.s *= 1.05 + 0.6 * p; S.cam.y += Math.sin(t * 5) * 0.25; } },
      { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, 0.25, 18, 0.45); } }, dg({ path: 'M32 56 L32 36', dur: 6 })],
    'dolly-out': [{ apply: function (S, t) { var p = prog(t, 6, S); S.cam.s *= 1.65 - 0.6 * p; S.cam.y += Math.sin(t * 5) * 0.25; } },
      { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, -0.25, 18, 0.45); } }, dg({ path: 'M32 36 L32 58', dur: 6 })],
    'slow-push-in': [{ apply: function (S, t) { var p = prog(t, 9, S); S.cam.s *= 1 + 0.22 * p; } },
      { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, 0.08, 10, 0.3); } }, dg({ path: 'M32 54 L32 44', dur: 9 })],
    'pull-out-reveal': [{ apply: function (S, t) { var p = prog(t, 8, S); S.cam.s *= lerp(2.8, 0.62, p); S.outline = p > 0.55; } },
      dg({ path: 'M32 32 L32 60', dur: 8 })],
    'truck': [{ apply: function (S, t) { var c = -Math.cos(TAU * t / 7); S.cam.s *= 1.35; S.cam.x -= c * 9; } },
      { draw: function (T, S, t, w, h) { occluders(T.L('ov'), w, h, Math.cos(TAU * t / 7) * 0.5, 3, 0.85); } },
      dg({ path: 'M12 50 L52 50', mode: 'alt', dur: 7 })],
    'tracking-shot': [{ apply: function (S, t) { S.cam.s *= 1.25; S.cam.x += sn(t, 5) * 1.5; S.cam.y += Math.sin(t * TAU * 1.6) * 0.35; } },
      { draw: function (T, S, t, w, h) { occluders(T.L('ov'), w, h, -t * 0.22, 3, 0.85); } },
      dg({ subPath: 'M10 24 L54 24', path: 'M10 50 L54 50', dur: 5 })],
    'follow-shot': [{ apply: function (S, t) { S.cam.s *= 1.3; S.cam.y += Math.abs(Math.sin(Math.PI * t * 1.8)) * 0.9; S.cam.rz += Math.sin(Math.PI * t * 0.9) * 0.7; } },
      { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, 0.12, 14, 0.4); } },
      dg({ subPath: 'M32 34 L32 12', path: 'M32 58 L32 36', dur: 4 })],
    'leading-shot': [{ apply: function (S, t) { S.cam.s *= 1.3; S.cam.y += Math.abs(Math.sin(Math.PI * t * 1.8)) * 0.9; S.cam.rz += Math.sin(Math.PI * t * 0.9) * 0.6; } },
      { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, -0.12, 14, 0.4); } },
      dg({ subPath: 'M32 58 L32 36', path: 'M32 34 L32 12', rot: 180, dur: 4 })],
    'pedestal': [{ apply: function (S, t) { var v = -Math.cos(TAU * t / 7); S.cam.s *= 1.4; S.cam.y += v * 12; } },
      dg({ side: true, path: 'M14 52 L14 24', mode: 'alt', rot: 90, cone: [5, 24], dur: 7 })],
    'crane-up': [{ apply: function (S, t) { var p = prog(t, 8, S); S.cam.s *= lerp(1.25, 1.55, p); S.cam.y += lerp(-8, 10, p); S.cam.rx -= 16 * p; } },
      dg({ side: true, path: 'M10 54 Q12 22 34 14', rot: 125, dur: 8 })],
    'orbit': [{ apply: function (S, t) { var v = -Math.cos(TAU * t / 8); S.cam.s *= 1.4; S.cam.ry += v * 16; S.cam.x -= v * 6; } },
      dg({ path: ORBIT_ARC, mode: 'alt', dur: 8, sub: [32, 26] })],
    '360-orbit': [{ apply: function (S, t) {
      var a = TAU * t / 8, ca = Math.cos(a);
      S.cam.s *= 1.4; S.cam.ry += 16 * Math.sin(a); S.cam.x -= Math.sin(a) * 5;
      if (ca < 0) S.cam.flip = !S.cam.flip;
      if (Math.abs(ca) < 0.14) S.g.blur += (1 - Math.abs(ca) / 0.14) * 5;
    } },
      dg({ path: 'M10 26 A22 22 0 1 0 54 26 A22 22 0 1 0 10 26', dur: 8, sub: [32, 26] })],
    'handheld': [handheldFx(1), dg({ path: 'M30 50 L34 48 L31 52 L35 51 L32 49 Z', dur: 1.4 })],
    'steadicam': [{ apply: function (S, t) { S.cam.s *= 1.18; S.cam.x += sn(t, 9) * 2.5; S.cam.y += sn(t + 2, 11) * 1.6; S.cam.rz += sn(t, 13) * 0.4; } },
      { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, 0.05, 8, 0.25); } },
      dg({ path: 'M24 58 C 36 52, 26 46, 34 38', mode: 'alt', dur: 9 })],
    'aerial-shot': [{ apply: function (S, t) { S.cam.rx -= 28; S.cam.s *= 1.6; S.cam.rz += sn(t, 20) * 8; S.cam.y += 4 + sn(t, 14) * 3; } },
      grade({ c: 0.95, b: 1.03 }), dg({ side: true, path: 'M6 10 L44 10', mode: 'alt', rot: 160, cone: [9, 40], dur: 10 })],
    'fpv-drone': [{ apply: function (S, t) {
      var a = TAU * t / 5;
      S.cam.s *= 1.6 + 0.35 * Math.sin(a); S.cam.rz += 11 * Math.sin(a + 0.6); S.cam.x += 12 * Math.sin(a);
      S.cam.y += 5 * Math.sin(2 * a); S.cam.ry += 9 * Math.cos(a); S.g.blur += Math.max(0, Math.abs(Math.cos(a)) - 0.75) * 8;
    } }, { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, 0.5, 24, 0.5); } },
      dg({ path: 'M10 58 C 20 30, 50 50, 40 22 S 20 6, 30 4', dur: 5 })],
    'whip-pan': [{ apply: function (S, t) {
      var r = whip(cyc(t, 4), 0.4, 0.47, 0.9, 0.97);
      S.cam.s *= 1.5; S.cam.x -= r[0] * 14; S.cam.ry -= r[0] * 4; S.g.blur += r[1] * 9; S.mem_whip = r[1];
    }, draw: function (T, S, t, w, h) { streaks(T.L('light'), w, h, S.mem_whip || 0); } },
      dg({ rotVals: '-35;-35;35;35;-35;-35', rotTimes: '0;0.4;0.47;0.9;0.97;1', dur: 4 })],
    'crash-zoom': [{ apply: function (S, t) {
      var u = cyc(t, 3.6), z = seg(u, 0.4, 0.45);
      S.cam.s *= 1 + 1.6 * z; if (u > 0.4 && u < 0.47) S.g.blur += 6 * Math.sin(Math.PI * (u - 0.4) / 0.07);
      if (u > 0.95) S.dip = Math.max(S.dip, (u - 0.95) / 0.05); if (u < 0.03) S.dip = Math.max(S.dip, 1 - u / 0.03);
    } }, dg({ coneVals: [12, 12, 3, 3, 12], coneTimes: '0;0.4;0.45;0.95;1', dur: 3.6 })],
    'zoom-in': [{ apply: function (S, t) { S.cam.s *= 1 + 0.9 * pp(t, 7); } }, dg({ coneVals: [12, 4, 12], dur: 7 })],
    'dolly-zoom': [{ apply: function (S, t) {
      var cs = 1.75 - 0.75 * pp(t, 6);
      S.cam.s *= cs; S.subj = { mask: 'big', s: 1.75 / cs, blur: 0 };
    } }, dg({ path: 'M32 40 L32 60', mode: 'alt', coneVals: [12, 5, 12], dur: 6 })],
    'bullet-time': [{ apply: function (S, t) {
      var u = cyc(t, 6), ry = 0;
      if (u >= 0.25 && u < 0.75) { S.mode = 'freeze'; ry = lerp(-18, 18, smooth((u - 0.25) / 0.5)); G(S, { sat: 0.8, c: 1.08 }); }
      else if (u >= 0.75 && u < 0.85) ry = lerp(18, 0, smooth((u - 0.75) / 0.1));
      else if (u >= 0.15 && u < 0.25) ry = lerp(0, -18, smooth((u - 0.15) / 0.1));
      S.cam.s *= 1.4; S.cam.ry += ry; S.cam.x -= ry * 0.3; S.mem_ry = ry;
    } },
      dg({ path: ORBIT_ARC, mode: 'alt', dur: 6, sub: [32, 26], extra: '<rect x="44" y="12" width="2.2" height="7" fill="' + W7 + '"/><rect x="48" y="12" width="2.2" height="7" fill="' + W7 + '"/>' })],
    'snorricam': [{ apply: function (S, t) { S.cam.rz += sn(t, 2.2) * 6 + nz(t, 3) * 1.5; S.cam.s *= 1.38; S.cam.y += Math.sin(t * TAU / 1.1) * 0.6; } },
      vigFx(0.4), dg({ sub: [32, 24], cam: [32, 40], cone: [4, 8], extra: '<line x1="32" y1="29" x2="32" y2="35" stroke="' + W7 + '" stroke-width="2"/>' })],
    'roll': [{ apply: function (S, t) { S.cam.rz += (t * 36) % 360; S.cam.s *= 1.85; } }, dg({ spin: true, dur: 10, cam: [32, 46] })],
    'one-take': [{ apply: function (S, t) {
      var u = t % 12;
      S.cam.s *= kf([[0, 1], [3, 1.6], [6, 1.6], [9, 1.45], [12, 1]], u);
      S.cam.x += kf([[0, 0], [3, 0], [6, -12], [9, -12], [12, 0]], u);
      S.cam.y += kf([[0, 0], [6, 0], [9, 10], [12, 0]], u);
      S.cam.rx += kf([[0, 0], [6, 0], [9, -12], [12, 0]], u);
      S.cam.ry += kf([[0, 0], [3, 0], [6, 6], [9, 6], [12, 0]], u);
    } }, liveChip('tl', function (t) { return '00:' + ('0' + Math.floor(t % 12)).slice(-2) + ' · 컷 없음'; }, true),
      dg({ path: 'M32 58 L32 42 Q46 40 48 30 Q40 14 20 20 Q10 34 32 58', dur: 12 })],
    'parallax': [{ apply: function (S, t) { var c = -Math.cos(TAU * t / 6); S.cam.s *= 1.35; S.cam.x -= c * 5; } },
      { draw: function (T, S, t, w, h) { var c = -Math.cos(TAU * t / 6), x = T.L('ov'); occluders(x, w, h, -c * 0.4, 3, 0.35); occluders(x, w, h, -c * 0.95 + 0.5, 3, 0.9); } },
      dg({ path: 'M12 50 L52 50', mode: 'alt', dur: 6, extra: '<circle cx="20" cy="38" r="2.5" fill="' + W7 + '"/><circle cx="46" cy="42" r="3.5" fill="' + W7 + '"/>' })],

    /* 렌즈·초점 */
    'wide-angle-lens': [fxFx({ name: 'fisheye', k: 0.2 })],
    '50mm-lens': [crop(1.15)],
    '85mm-portrait': [crop(1.7), dof(3)],
    'telephoto-lens': [crop(2.4), dof(5, 'big'), grade({ c: 0.94 }), { apply: function (S, t) { S.cam.x += nz(t * 0.6, 2) * 0.3; } }],
    'macro-lens': [crop(3.8, 0, 9), dof(6, 'small'), grade({ sat: 1.15 })],
    'fisheye-lens': [fxFx({ name: 'fisheye', k: 0.55 }), {
      draw: function (T, S, t, w, h) {
        var x = T.L('ov'), g = x.createRadialGradient(w / 2, h / 2, h * 0.5, w / 2, h / 2, h * 0.62);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      }
    }],
    'anamorphic': [grade({ c: 1.08, sat: 1.05 }), tint('#1d4f7a', 'soft-light', 0.3), {
      apply: function (S, t, T) { setBars(T, 12.8, 0); },
      draw: function (T, S, t, w, h) {
        var x = T.L('light'), fx = w * (0.5 + 0.18 * sn(t, 9)), fy = h * 0.36, i;
        x.save(); x.translate(fx, fy); x.scale(1, 0.018); glow(x, 0, 0, w * 0.75, '70,140,255', 0.75); x.restore();
        glow(x, fx, fy, w * 0.03, '220,235,255', 0.9);
        for (i = 0; i < 5; i++) {
          x.save(); x.translate(w * (0.12 + 0.19 * i), h * (0.2 + 0.08 * hash(i))); x.scale(0.55, 1);
          glow(x, 0, 0, h * 0.07, '255,210,160', 0.18); x.restore();
        }
      }
    }],
    'shallow-dof': [dof(6)],
    'deep-focus': [grade({ c: 1.06, sat: 1.04 })],
    'rack-focus': [{ apply: function (S, t) {
      var u = cyc(t, 5), f = seg(u, 0.4, 0.55) - seg(u, 0.88, 1);
      S.vblur += 6 * (1 - f); S.subj = { mask: 'ellipse', s: 1, blur: 6 * f };
    } }],
    'soft-focus': [glowFx(0.55), grade({ blur: 0.7, c: 0.9, b: 1.04 })],
    'tilt-shift': [{ apply: function (S) { S.cam.rx -= 10; S.cam.s *= 1.15; } }, dof(5, 'band'), grade({ sat: 1.4, c: 1.12 }), rateFx(2)],
    'lens-flare': [{
      draw: function (T, S, t, w, h) {
        var x = T.L('light'), sx = w * (0.22 + 0.22 * sn(t, 10)), sy = h * 0.18, cx = w / 2, cy = h / 2;
        glow(x, sx, sy, w * 0.28, '255,190,120', 0.45); glow(x, sx, sy, w * 0.045, '255,255,240', 0.95);
        x.save(); x.translate(sx, sy); x.scale(1, 0.02); glow(x, 0, 0, w * 0.5, '255,220,180', 0.6); x.restore();
        var gh = [[0.5, 0.03, '120,200,255', 0.25], [0.85, 0.06, '255,140,90', 0.18], [1.3, 0.025, '160,255,180', 0.25], [1.7, 0.09, '140,120,255', 0.14]];
        for (var i = 0; i < gh.length; i++) glow(x, sx + (cx - sx) * gh[i][0] * 1.2, sy + (cy - sy) * gh[i][0] * 1.2, w * gh[i][1], gh[i][2], gh[i][3]);
      }
    }],

    /* 촬영 속도·시간 */
    'slow-motion': [rateFx(0.25), rateChip()],
    'real-time': [rateChip()],
    'timelapse': [rateFx(8), rateChip(), { apply: function (S, t) { S.g.b *= 1 + 0.07 * nz(t * 9, 3); } }, {
      draw: function (T, S, t, w, h) {
        var x = T.L('shade'), p = cyc(t, 2.5) * w * 1.8 - w * 0.4, g = x.createLinearGradient(p - w * 0.3, 0, p + w * 0.3, h * 0.3);
        g.addColorStop(0, 'rgba(40,40,70,0)'); g.addColorStop(0.5, 'rgba(40,40,70,.55)'); g.addColorStop(1, 'rgba(40,40,70,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      }
    }],
    'hyperlapse': [rateFx(8), rateChip(), { apply: function (S, t) {
      var k = Math.floor(t * 4), p = prog(t, 6, S);
      S.cam.s *= 1.1 + 0.5 * p; S.cam.x += (hash(k) - 0.5) * 1.2; S.cam.y += (hash(k + 9) - 0.5) * 1.0; S.cam.rz += (hash(k + 3) - 0.5) * 0.8;
      S.g.b *= 1 + 0.06 * nz(t * 9, 3);
    } }, { draw: function (T, S, t, w, h) { flow(T.L('light'), w, h, t, 0.3, 16, 0.35); } }],
    'speed-ramp': [{ apply: function (S, t) {
      var u = cyc(t, 5), m = seg(u, 0.3, 0.4) - seg(u, 0.7, 0.8);
      S.rate *= 1 - 0.8 * m; S.cam.s *= 1 + 0.08 * m;
    } }, rateChip()],
    'freeze-frame': [{ apply: function (S, t) {
      var u = cyc(t, 5), fr = u >= 0.5 && u < 0.9;
      if (fr) { S.mode = 'freeze'; S.cam.s *= 1 + 0.08 * smooth((u - 0.5) / 0.1); G(S, { sat: 0.55, c: 1.1 }); }
      S.mem_flash = fr ? Math.max(0, 1 - (u - 0.5) / 0.06) : 0;
    }, draw: function (T, S, t, w, h) {
      if (S.mem_flash > 0) { var x = T.L('ov'); x.fillStyle = 'rgba(255,255,255,' + (S.mem_flash * 0.8) + ')'; x.fillRect(0, 0, w, h); }
    } }, rateChip()],
    'reverse-motion': [{ apply: function (S) { S.mode = 'reverse'; } }, rateChip()],
    'stop-motion': [{ apply: function (S, t) {
      var k = Math.floor(t * 12);
      S.stepFps = 12; S.cam.x += (hash(k) - 0.5) * 0.5; S.cam.y += (hash(k + 5) - 0.5) * 0.5; S.g.b *= 1 + (hash(k + 3) - 0.5) * 0.06;
    } }, chipFx('12fps', 'tl', true)],

    /* 피사체 동작 */
    'action-beats': [{ apply: function (S, t) {
      var u = cyc(t, 8), b = Math.floor(u * 4), l = u * 4 - b;
      if (b === 1) S.cam.s *= 1 + 0.35 * smooth(l);
      else if (b === 2) { S.cam.s *= 1.35; S.mode = 'freeze'; }
      else if (b === 3) S.cam.s *= 1.35 - 0.35 * smooth(l);
    }, draw: function (T, S, t, w) {
      timeline(T.L('ov'), w, 0, [[0, 0.25, '1 김 오름'], [0.25, 0.5, '2 다가감'], [0.5, 0.75, '3 멈춤'], [0.75, 1, '4 물러남']], cyc(t, 8));
    } }],
    'vague-motion': [{ apply: function (S, t) {
      S.cam.s *= 1.2 + 0.1 * nz(t * 0.3, 9); S.cam.x += nz(t * 0.5, 1) * 4; S.cam.y += nz(t * 0.4, 5) * 3; S.cam.rz += nz(t * 0.35, 2) * 2;
      if (nz(t * 0.25, 11) > 0.45) S.mode = 'freeze';
    } }, chipFx('“moves around”', 'tl', true)],
    'secondary-motion': [{ draw: function (T, S, t, w, h) {
      var x = T.L('shade');
      for (var i = 0; i < 11; i++) {
        var px = w * (hash(i) * 1.1 - 0.05) + Math.sin(t * 0.9 + i) * w * 0.025, py = h * (0.15 + 0.8 * hash(i + 20)) + Math.cos(t * 0.7 + i * 2) * h * 0.02;
        var g = x.createRadialGradient(px, py, 0, px, py, w * (0.06 + 0.05 * hash(i + 4)));
        g.addColorStop(0, 'rgba(50,60,40,.55)'); g.addColorStop(1, 'rgba(50,60,40,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      }
      smokeWisps(T.L('light'), w, h, t, 0.16, 8);
    } }],
    'crowd-motion': [{ draw: function (T, S, t, w, h) {
      var x = T.L('ov');
      for (var i = 0; i < 7; i++) {
        var dir = i % 2 ? 1 : -1, sp = 0.04 + 0.05 * hash(i + 2), px = frac(hash(i) + t * sp * dir) * w * 1.4 - w * 0.2;
        var ph = h * (0.32 + 0.16 * hash(i + 7)), py = h * (0.12 + 0.1 * hash(i + 3)), bw = ph * 0.22;
        var bob = Math.abs(Math.sin(t * 4 * (0.8 + sp * 5) + i)) * h * 0.008;
        soft(x, 9, 'rgba(22,18,16,.5)', function (c) {
          c.ellipse(px, py - bob, bw * 0.4, bw * 0.5, 0, 0, TAU);
          c.moveTo(px + bw, py + bw * 0.6); c.ellipse(px, py + bw * 0.6 + ph * 0.35 - bob, bw, ph * 0.4, 0, 0, TAU);
        });
      }
      x.save(); x.globalCompositeOperation = 'destination-out';
      var g = x.createRadialGradient(w * FX, h * FY, 0, w * FX, h * FY, w * 0.22);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h); x.restore();
    } }],

    /* 전환·편집 */
    'hard-cut': [{ apply: function (S, t, T) { if (cyc(t, 4) >= 0.5) T.view(0, { s: 2.3 }); } }],
    'match-cut': [{ apply: function (S, t, T) {
      var u = cyc(t, 4);
      if (u >= 0.5) T.view(0, { s: 1, filter: 'grayscale(.4) sepia(.5) hue-rotate(185deg) saturate(1.6) brightness(.75) contrast(1.15)' });
      S.mem_ring = u >= 0.5 ? Math.max(0, 1 - (u - 0.5) / 0.15) : Math.max(0, 1 - u / 0.15);
    }, draw: function (T, S, t, w, h) { if (S.mem_ring > 0) ringMark(T.L('ov'), w, h, S.mem_ring * 0.9, 0.14); } }],
    'cross-dissolve': [{ apply: function (S, t, T) {
      var u = cyc(t, 5), op = seg(u, 0.3, 0.5) - seg(u, 0.8, 1);
      if (op > 0.001) T.view(0, { s: 2.2, filter: 'sepia(.25) saturate(1.2)', op: op });
    } }],
    'fade-to-black': [{ apply: function (S, t, T) {
      var u = cyc(t, 6);
      S.dip = Math.max(S.dip, seg(u, 0.3, 0.42) - seg(u, 0.42, 0.54) + seg(u, 0.82, 0.92) - seg(u, 0.92, 1));
      if (u >= 0.42 && u < 0.92) T.view(0, { s: 2.2, filter: 'sepia(.2) saturate(1.15)' });
    } }],
    'whip-pan-transition': [{ apply: function (S, t, T) {
      var r = whip(cyc(t, 4), 0.42, 0.5, 0.92, 1), m = (r[0] + 1) / 2;
      S.noCover = true; S.cam.x -= m * 100; S.g.blur += r[1] * 10; S.mem_whip = r[1];
      if (m > 0.001) T.view(0, { s: 2.2, filter: r[1] > 0.02 ? 'blur(' + (r[1] * 10).toFixed(1) + 'px) sepia(.2)' : 'sepia(.2)', tf: 'translateX(' + ((1 - m) * 100).toFixed(2) + '%)' });
    }, draw: function (T, S, t, w, h) { streaks(T.L('light'), w, h, S.mem_whip || 0); } }],
    'morph': [{ apply: function (S, t, T) {
      var u = cyc(t, 5), m = seg(u, 0.3, 0.55) - seg(u, 0.8, 1), bump = Math.sin(Math.PI * m);
      S.cam.s *= 1 + 0.1 * m; S.g.blur += bump * 5;
      if (m > 0.001) T.view(0, { s: 1.6, x: 0.47, op: m, filter: 'hue-rotate(160deg) saturate(1.5) blur(' + (bump * 6).toFixed(1) + 'px)', tf: 'scale(' + (1.12 - 0.12 * m).toFixed(3) + ')' });
    } }],
    'shot-reverse-shot': [{ apply: function (S, t, T) {
      S.cam.s *= 1.5; S.cam.x += 8;
      if (cyc(t, 4) >= 0.5) T.view(0, { s: 1.5, x: 0.42, flip: true, filter: 'brightness(.85) saturate(.9) hue-rotate(-10deg)' });
    } }, liveChip('tl', function (t) { return cyc(t, 4) < 0.5 ? '샷' : '리버스 샷'; })],
    'cutaway': [{ apply: function (S, t, T) { var u = cyc(t, 6); if (u >= 0.55 && u < 0.78) T.view(0, { s: 3.2, y: FY - 0.2, filter: 'saturate(1.1)' }); } }],
    'montage': [{ apply: function (S, t, T) {
      var sl = Math.floor(cyc(t, 3.2) * 6);
      var L6 = [null, { s: 2.4, filter: 'saturate(1.4)' }, { s: 1.6, flip: true, filter: 'grayscale(1) contrast(1.2)' },
        { s: 3.2, y: 0.35, filter: 'sepia(.5)' }, { s: 1.3, x: 0.42, filter: 'hue-rotate(200deg) saturate(1.3)' }, { s: 2, flip: true }];
      if (L6[sl]) T.view(0, L6[sl]);
    } }],

    /* 조명·시간대 */
    'golden-hour': [grade({ sep: 0.3, hue: -8, sat: 1.35, b: 1.05, c: 1.05 }),
      tint('linear-gradient(115deg, rgba(255,170,60,.6), rgba(255,120,40,0) 60%)', 'screen', 0.85),
      { draw: function (T, S, t, w, h) { glow(T.L('light'), w * 0.12, h * 0.1, w * 0.35, '255,170,80', 0.35); } }],
    'blue-hour': [grade({ b: 0.8, sat: 0.9, c: 1.05 }), tint('#2a4dff', 'soft-light', 0.55),
      tint('linear-gradient(to bottom, rgba(40,70,160,.55), rgba(0,0,0,0) 70%)', 'screen', 0.6)],
    'harsh-noon': [grade({ c: 1.4, b: 1.12, sat: 1.1 }), tint('linear-gradient(to bottom, rgba(255,255,235,.3), rgba(0,0,0,0) 55%)', 'screen', 1)],
    'overcast': [grade({ c: 0.82, sat: 0.72, b: 1.04 }), tint('#9aa8b5', 'soft-light', 0.5)],
    'night-neon': [grade({ b: 0.55, c: 1.25, sat: 1.3 }), { apply: function (S, t) {
      S.tints.push({ c: 'linear-gradient(90deg, rgba(255,40,170,.85), rgba(255,40,170,0) 45%)', m: 'screen', o: 0.85 + 0.15 * nz(t * 7, 1) });
      S.tints.push({ c: 'linear-gradient(270deg, rgba(0,220,255,.75), rgba(0,220,255,0) 45%)', m: 'screen', o: 0.9 + 0.1 * nz(t * 5, 4) });
    }, draw: function (T, S, t, w, h) {
      var x = T.L('light');
      for (var i = 0; i < 8; i++) glow(x, w * (0.05 + 0.13 * i), h * (0.12 + 0.12 * hash(i)), w * 0.05, i % 2 ? '0,220,255' : '255,50,180', 0.35 * (0.8 + 0.2 * nz(t * 3, i)));
    } }],
    'low-key': [grade({ b: 0.62, c: 1.45 }), tint('radial-gradient(ellipse 35% 45% at 50% 55%, rgba(0,0,0,0) 40%, rgba(0,0,0,.85) 100%)', 'normal', 1)],
    'high-key': [grade({ b: 1.35, c: 0.78, sat: 0.85 }), tint('#ffffff', 'screen', 0.12)],
    'chiaroscuro': [grade({ c: 1.55, b: 0.82, sat: 0.85 }),
      tint('linear-gradient(90deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.92) 78%)', 'multiply', 1),
      tint('radial-gradient(ellipse 30% 40% at 38% 50%, rgba(255,220,170,.5), rgba(0,0,0,0) 70%)', 'screen', 0.8)],
    'rim-light': [grade({ b: 0.55, c: 1.3 }), { draw: function (T, S, t, w, h) {
      var x = T.L('light'), cx = w * FX, cy = h * FY;
      x.save(); x.translate(cx, cy); x.scale(1, 1.3);
      var g = x.createRadialGradient(0, 0, w * 0.13, 0, 0, w * 0.24);
      g.addColorStop(0, 'rgba(255,230,190,0)'); g.addColorStop(0.45, 'rgba(255,230,190,.55)'); g.addColorStop(1, 'rgba(255,230,190,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, w * 0.24, 0, TAU); x.fill(); x.restore();
      glow(x, cx, h * (FY - 0.3), w * 0.32, '255,230,200', 0.35);
    } }],
    'silhouette': [grade({ b: 0.28, c: 2.2, sat: 0.6 }), { draw: function (T, S, t, w, h) {
      var x = T.L('light'); x.save(); x.translate(w / 2, h * 0.2); x.scale(1.5, 1);
      glow(x, 0, 0, w * 0.5, '255,170,100', 0.85); x.restore();
    } }],
    'volumetric-light': [grade({ c: 0.92, b: 1.05, sat: 0.95 }), { draw: function (T, S, t, w, h) {
      var x = T.L('light'), ox = w * 0.12, oy = -h * 0.15;
      for (var i = 0; i < 6; i++) {
        var a = (0.55 + i * 0.09) , len = w * 1.4, wd = w * (0.02 + 0.03 * hash(i));
        var al = 0.1 + 0.07 * Math.sin(t * 0.6 + i * 1.3);
        x.save(); x.translate(ox, oy); x.rotate(a);
        var g = x.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,240,210,' + (al * 1.6) + ')'); g.addColorStop(1, 'rgba(255,240,210,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(0, -wd * 0.3); x.lineTo(len, -wd * 2); x.lineTo(len, wd * 2); x.lineTo(0, wd * 0.3); x.closePath(); x.fill(); x.restore();
      }
      x.fillStyle = 'rgba(255,250,240,.05)'; x.fillRect(0, 0, w, h);
      particles(x, w, h, t, { n: 40, vx: 0.004, vy: -0.01, size: 1.2, rgb: '255,240,210', a: 0.6, tw: true });
    } }],
    'practical-lights': [grade({ sep: 0.2, b: 0.85, sat: 1.1 }), { draw: function (T, S, t, w, h) {
      var x = T.L('light'), P4 = [[0.15, 0.2], [0.82, 0.15], [0.65, 0.28], [0.3, 0.12]];
      for (var i = 0; i < P4.length; i++) {
        var f = 0.9 + 0.1 * nz(t * 3, i);
        glow(x, w * P4[i][0], h * P4[i][1], w * 0.12, '255,180,90', 0.35 * f); glow(x, w * P4[i][0], h * P4[i][1], w * 0.02, '255,240,200', 0.8 * f);
      }
    } }],
    'motivated-lighting': [grade({ c: 1.1 }), { draw: function (T, S, t, w, h) {
      var x = T.L('shade'), cx = w * (FX - 0.05), cy = h * FY;
      x.fillStyle = 'rgba(60,60,80,.6)'; x.fillRect(0, 0, w, h);
      x.save(); x.globalCompositeOperation = 'destination-out';
      soft(x, 14, 'rgba(0,0,0,1)', function (c) {
        var pw = w * 0.11, ph = h * 0.2, gap = w * 0.012, sk = w * 0.05;
        for (var r = 0; r < 2; r++) for (var q = 0; q < 2; q++) {
          var px = cx - pw - gap / 2 + q * (pw + gap) + r * sk, py = cy - ph - gap / 2 + r * (ph + gap);
          c.moveTo(px + sk, py); c.lineTo(px + sk + pw, py); c.lineTo(px + pw, py + ph); c.lineTo(px, py + ph); c.closePath();
        }
      });
      x.restore();
      glow(T.L('light'), cx, cy, w * 0.25, '255,215,160', 0.22);
    } }],
    'soft-window-light': [grade({ c: 0.9, b: 1.02, sat: 0.95 }),
      tint('linear-gradient(90deg, rgba(255,250,240,.6), rgba(255,250,240,0) 60%)', 'screen', 0.9),
      tint('linear-gradient(270deg, rgba(0,0,0,.45), rgba(0,0,0,0) 55%)', 'multiply', 1)],
    'candlelight': [{ apply: function (S, t) { G(S, { sep: 0.45, hue: -12, sat: 1.5, b: 0.72 * (1 + 0.12 * nz(t * 6, 2)), c: 1.1 }); } },
      { draw: function (T, S, t, w, h) { glow(T.L('light'), w * FX, h * 0.98, w * 0.6, '255,140,40', 0.35 * (1 + 0.2 * nz(t * 7, 5))); } }, vigFx(0.55)],
    'haze-fog': [grade({ c: 0.78, b: 1.06, sat: 0.85 }), { draw: function (T, S, t, w, h) {
      var x = T.L('light');
      for (var i = 0; i < 7; i++) glow(x, frac(hash(i) + t * 0.015 * (1 + i % 3)) * w * 1.4 - w * 0.2, h * (0.3 + 0.5 * hash(i + 4)), w * 0.35, '230,235,240', 0.16);
    } }],
    'color-anchors': [grade({ sep: 0.25, sat: 0.8, c: 1.08 }), tint('#6f8a6e', 'soft-light', 0.35),
      tint('radial-gradient(ellipse 30% 40% at 50% 55%, #b5532f, rgba(0,0,0,0) 70%)', 'soft-light', 0.6),
      { draw: function (T, S, t, w, h) {
        var x = T.L('ov'), C5 = ['#2b1d16', '#c8a27a', '#e9dcc6', '#6f8a6e', '#b5532f'];
        for (var i = 0; i < C5.length; i++) {
          x.fillStyle = C5[i]; x.fillRect(8 + i * 18, h - 22, 14, 14);
          x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1; x.strokeRect(8.5 + i * 18, h - 21.5, 13, 13);
        }
      } }],

    /* 필름 룩·색보정 */
    '35mm-film': [grade({ c: 1.06, sat: 0.95, sep: 0.12 }), { apply: function (S, t) {
      S.cam.x += nz(t * 3, 1) * 0.15; S.cam.y += nz(t * 3.3, 2) * 0.12; S.g.b *= 1 + 0.02 * nz(t * 12, 4);
    } }, glowFx(0.15), grainFx(0.22, 1), vigFx(0.35)],
    '16mm-film': [grade({ c: 1.12, sat: 0.85, sep: 0.18, blur: 0.4 }), { apply: function (S, t) {
      S.cam.x += nz(t * 3, 1) * 0.4; S.cam.y += nz(t * 3.3, 2) * 0.35; S.g.b *= 1 + 0.04 * nz(t * 12, 4);
    }, draw: function (T, S, t, w, h) {
      var x = T.L('ov'), k = Math.floor(t * 24);
      if (hash(k) > 0.6) { x.fillStyle = 'rgba(20,15,10,.7)'; for (var i = 0; i < 3; i++) { x.beginPath(); x.arc(hash(k + i * 3) * w, hash(k + i * 5 + 1) * h, 0.6 + hash(k + i) * 1.6, 0, TAU); x.fill(); } }
      if (hash(k + 1) > 0.85) { x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(hash(k + 2) * w, 0, 1, h); }
    } }, grainFx(0.42, 1.7), vigFx(0.6, 0.25)],
    'digital-clean': [grade({ c: 1.07, sat: 1.06, b: 1.01 })],
    'vhs': [fxFx({ name: 'vhs' }), grade({ sat: 1.25, c: 0.9, b: 1.05 }), { draw: function (T, S, t, w, h) {
      var x = T.L('ov');
      x.fillStyle = 'rgba(0,0,0,.18)'; for (var y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
      var mono = { font: 'ui-monospace, Menlo, Consolas, monospace', size: 13 };
      label(x, 'PLAY ▶', 12, 18, mono); label(x, 'SP', w - 12, 18, { font: mono.font, size: 13, align: 'right' });
      var sec = Math.floor(t) % 60;
      label(x, 'OCT.15 2026', 12, h - 16, mono); label(x, '07:42:' + ('0' + sec).slice(-2), w - 12, h - 16, { font: mono.font, size: 13, align: 'right' });
    } }],
    'retro-80s-film': [grade({ sep: 0.3, sat: 1.15, c: 0.88, b: 1.04, hue: -6 }), tint('#ff6fa8', 'soft-light', 0.25),
      tint('rgb(60,30,60)', 'lighten', 0.35), grainFx(0.25, 1.3), vigFx(0.4)],
    'teal-orange': [grade({ sat: 1.2, c: 1.12 }), tint('#008c9e', 'soft-light', 0.55),
      tint('radial-gradient(ellipse 28% 38% at 50% 55%, #ff8a3d, rgba(0,0,0,0) 75%)', 'soft-light', 0.7)],
    'bleach-bypass': [grade({ sat: 0.42, c: 1.4, b: 1.02 }), grainFx(0.12)],
    'monochrome': [grade({ gray: 1, c: 1.15 }), grainFx(0.1)],
    'pastel-grade': [grade({ sat: 0.7, b: 1.12, c: 0.82 }), tint('#ffd1dc', 'soft-light', 0.5), tint('rgb(255,230,240)', 'screen', 0.12)],
    'diffusion-filter': [glowFx(0.6), grade({ c: 0.9, b: 1.03 })],
    'aspect-ratio': [{ apply: function (S, t, T) {
      var u = cyc(t, 6), m = seg(u, 0.4, 0.5) - seg(u, 0.9, 1);
      setBars(T, 12.8 * (1 - m), 34.2 * m);
    } }, liveChip('tl', function (t) { var u = cyc(t, 6), m = seg(u, 0.4, 0.5) - seg(u, 0.9, 1); return m < 0.5 ? '2.39:1' : '9:16'; }, true)],

    /* 장르·스타일 */
    'documentary': [handheldFx(0.55), grade({ sat: 0.85, c: 1.05 }), { apply: function (S, t) { S.cam.s *= 1 + 0.06 * pp(t, 12); } }],
    'commercial-ad': [{ apply: function (S, t) { var p = prog(t, 8, S); S.cam.s *= 1.1 + 0.25 * p; } },
      grade({ sat: 1.2, c: 1.12, b: 1.05 }), glowFx(0.25), dof(2), { draw: function (T, S, t, w, h) {
        var x = T.L('light'), p = cyc(t, 4) * w * 2 - w * 0.5, g = x.createLinearGradient(p - w * 0.12, 0, p + w * 0.12, h * 0.25);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      } }],
    'music-video': [{ apply: function (S, t) {
      var beat = t * 2, f = frac(beat), pulse = Math.exp(-f * 6), k = Math.floor(beat / 2);
      S.cam.s *= 1.12 + 0.08 * pulse; S.cam.rz += (k % 2 ? 1 : -1) * 2 * pulse;
      G(S, { hue: [0, -30, 40, 180][k % 4], c: 1.2, sat: 1.4 }); S.mem_pulse = pulse;
    }, draw: function (T, S, t, w, h) {
      var x = T.L('light'), p = S.mem_pulse || 0;
      glow(x, 0, h / 2, w * 0.5, '255,40,200', 0.45 * p); glow(x, w, h / 2, w * 0.5, '0,220,255', 0.45 * p);
    } }],
    'film-noir': [grade({ gray: 1, c: 1.6, b: 0.85 }), { draw: function (T, S, t, w, h) {
      var x = T.L('shade'), off = (t * 3) % 18;
      x.save(); x.translate(w / 2, h / 2); x.rotate(-0.35); x.fillStyle = 'rgba(0,0,0,.72)';
      for (var y = -h * 1.2 + off; y < h * 1.2; y += 18) x.fillRect(-w, y, w * 2, 9);
      x.restore();
    } }, vigFx(0.6), grainFx(0.15)],
    'found-footage': [grade({ sep: 0.4, hue: 50, sat: 0.6, c: 1.15 }), { apply: function (S) { S.cam.rx -= 18; S.cam.s *= 1.3; S.stepFps = 8; } },
      grainFx(0.35), { draw: function (T, S, t, w, h) {
        var x = T.L('ov'), mono = 'ui-monospace, Menlo, Consolas, monospace', sec = Math.floor(t) % 60;
        label(x, 'CAM 03', 10, 16, { font: mono, size: 12 });
        if (Math.floor(t * 1.5) % 2 === 0) label(x, '● REC', w - 10, 16, { font: mono, size: 12, align: 'right', color: '#ff4040' });
        label(x, '2026-10-15 07:42:' + ('0' + sec).slice(-2), 10, h - 14, { font: mono, size: 12 });
      } }],
    'anime': [fxFx({ name: 'poster', levels: 5 }), grade({ sat: 1.35, b: 1.05 })],
    'pixar-3d': [grade({ sat: 1.3, b: 1.08, c: 0.95, blur: 0.4 }), glowFx(0.35), dof(3), tint('#ffb070', 'soft-light', 0.3)],
    'claymation': [{ apply: function (S, t) {
      var k = Math.floor(t * 12); S.stepFps = 12; S.cam.rz += (hash(k) - 0.5) * 0.6; S.cam.x += (hash(k + 4) - 0.5) * 0.6;
    } }, grade({ sat: 1.15, sep: 0.15, c: 1.05 }), fxFx({ name: 'poster', levels: 9, edges: false }), tint('#ff9a5a', 'soft-light', 0.25), vigFx(0.35)],
    'vlog-ugc': [handheldFx(0.8), crop(1.25), grade({ sat: 1.12, b: 1.06 }), { apply: function (S, t, T) {
      setBars(T, 0, 34.2);
      if (!T.mem.vb) {
        T.mem.vb = true;
        for (var i = 2; i < 4; i++) css(T.barEls[i], { background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(14px)', webkitBackdropFilter: 'blur(14px)' });
      }
    } }],
    'nature-doc': [crop(2.2), dof(4, 'big'), rateFx(0.5), grade({ sat: 1.05, sep: 0.08 }), { apply: function (S, t) { S.cam.x += sn(t, 16) * 3; } }],

    /* 물리·VFX */
    'fluid-sim': [rateFx(0.5), { draw: function (T, S, t, w, h) {
      var x = T.L('ov'), u = cyc(t, 3), tau = u * 1.1, cx = w * FX, cy = h * (FY - 0.1);
      if (u < 0.45) {
        x.save(); x.strokeStyle = 'rgba(90,55,30,' + (0.8 * (1 - u / 0.45)) + ')'; x.lineWidth = 2;
        x.beginPath(); x.ellipse(cx, cy, w * (0.03 + u * 0.25), h * (0.01 + u * 0.05), 0, 0, TAU); x.stroke(); x.restore();
      }
      for (var i = 0; i < 36; i++) {
        var a = -Math.PI / 2 + (hash(i) - 0.5) * 2.4, v = h * (0.5 + 0.6 * hash(i + 5));
        var px = cx + Math.cos(a) * v * tau * 0.8, py = cy + Math.sin(a) * v * tau + h * 2.2 * tau * tau;
        if (py > h * (FY + 0.05)) continue;
        var r = 1.2 + 2.2 * hash(i + 9);
        x.fillStyle = 'rgba(70,40,20,.92)'; x.beginPath(); x.ellipse(px, py, r, r * 1.3, 0, 0, TAU); x.fill();
        x.fillStyle = 'rgba(255,240,220,.7)'; x.beginPath(); x.arc(px - r * 0.3, py - r * 0.4, r * 0.35, 0, TAU); x.fill();
      }
    } }],
    'particle-fx': [grade({ sep: 0.1, sat: 1.1 }), { draw: function (T, S, t, w, h) {
      var x = T.L('light');
      particles(x, w, h, t, { n: 55, vx: 0.005, vy: -0.06, size: 1.6, rgb: '255,150,60', a: 0.85, tw: true });
      particles(x, w, h, t + 30, { n: 30, vx: 0.003, vy: -0.01, size: 1, rgb: '255,255,240', a: 0.4 });
    } }],
    'cloth-sim': [{ draw: function (T, S, t, w, h) {
      var x = T.L('ov'), y, n = 24;
      var edge = function (yy) { var q = yy / h; return w * (0.2 + 0.04 * Math.sin(q * 6 + t * 2.2) + 0.03 * Math.sin(q * 13 - t * 3.1) + 0.05 * q * Math.sin(t * 1.4)); };
      var g = x.createLinearGradient(0, 0, w * 0.3, 0);
      g.addColorStop(0, 'rgba(245,240,230,.65)'); g.addColorStop(1, 'rgba(245,240,230,.38)');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 0);
      for (y = 0; y <= n; y++) x.lineTo(edge(h * y / n), h * y / n);
      x.lineTo(0, h); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.09)'; x.lineWidth = 2;
      for (var f = 1; f < 4; f++) {
        x.beginPath();
        for (y = 0; y <= n; y++) { var yy = h * y / n, xx = edge(yy) * f / 4 + Math.sin(yy / h * 9 + t * 2 + f) * 3; if (y) x.lineTo(xx, yy); else x.moveTo(xx, yy); }
        x.stroke();
      }
    } }],
    'destruction': [{ apply: function (S, t, T) {
      var u = cyc(t, 5), k = Math.floor(t / 5);
      if (u >= 0.36 && T.mem.dk !== k && T.ready) { T.snapshot(); T.mem.dk = k; }
      var tau = 0;
      if (u >= 0.36 && u < 0.7) tau = smooth((u - 0.36) / 0.34);
      else if (u >= 0.7 && u < 0.9) tau = 1 - smooth((u - 0.7) / 0.2);
      if (tau > 0.001 && T.snap) S.hideCam = true;
      S.mem_tau = tau; S.mem_flash = u >= 0.36 && u < 0.42 ? 1 - (u - 0.36) / 0.06 : 0;
    }, draw: function (T, S, t, w, h) {
      var x = T.L('ov'), tau = S.mem_tau || 0, sh = getShards(), i;
      if (tau > 0.001 && T.snap) {
        for (i = 0; i < sh.length; i++) {
          var p = sh[i], dx = p.vx * tau * w, dy = (p.vy * tau + 0.9 * tau * tau) * h;
          x.save(); x.translate(p.cx * w + dx, p.cy * h + dy); x.rotate(p.vr * tau); x.translate(-p.cx * w, -p.cy * h);
          x.beginPath(); x.moveTo(p.p[0][0] * w, p.p[0][1] * h); x.lineTo(p.p[1][0] * w, p.p[1][1] * h); x.lineTo(p.p[2][0] * w, p.p[2][1] * h); x.closePath();
          x.clip(); x.drawImage(T.snap, 0, 0, w, h); x.restore();
        }
        particles(T.L('light'), w, h, t, { n: 30, vx: 0.02, vy: 0.05, size: 1.2, rgb: '255,200,140', a: 0.6 * tau });
      }
      if (S.mem_flash > 0) { glow(T.L('light'), w * FX, h * FY, w * 0.7, '255,220,170', S.mem_flash); }
    } }],
    'weight-inertia': [{ apply: function (S, t) {
      var u = cyc(t, 4), y, tau;
      S.cam.s *= 1.25;
      if (u < 0.25) { y = -22 * (1 - Math.pow(u / 0.25, 2)); S.cam.y += y; S.mem_imp = 0; }
      else {
        tau = (u - 0.25) * 4; var e = Math.exp(-5 * tau);
        S.cam.y += 3 * e * Math.sin(tau * 18); S.cam.s *= 1 + 0.03 * e * Math.sin(tau * 18 + 1.2);
        S.cam.rz += 1.2 * Math.exp(-6 * tau) * Math.sin(tau * 40); S.mem_imp = tau;
      }
      if (u > 0.94) S.dip = Math.max(S.dip, (u - 0.94) / 0.06);
      if (u < 0.03) S.dip = Math.max(S.dip, 1 - u / 0.03);
    }, draw: function (T, S, t, w, h) {
      var tau = S.mem_imp || 0;
      if (tau > 0 && tau < 1.2) {
        var x = T.L('light'), a = 0.35 * (1 - tau / 1.2);
        for (var i = 0; i < 10; i++) {
          var s2 = i % 2 ? 1 : -1, d = w * (0.12 + tau * 0.18 * (0.6 + 0.4 * hash(i)));
          glow(x, w * FX + s2 * d * (0.5 + hash(i + 3)), h * (FY + 0.2) - tau * h * 0.05 * hash(i + 7), w * 0.05 * (1 + tau), '200,190,180', a);
        }
      }
    } }],
    'transformation': [{ apply: function (S, t, T) {
      var u = cyc(t, 6), R = seg(u, 0.25, 0.5) - seg(u, 0.8, 0.95);
      S.mem_R = R;
      if (R > 0.001) T.view(0, { s: 1, filter: 'sepia(1) hue-rotate(160deg) saturate(2.4) brightness(1.1) contrast(1.1)', clip: 'circle(' + (R * 120).toFixed(2) + '% at ' + (FX * 100) + '% ' + (FY * 100) + '%)' });
    }, draw: function (T, S, t, w, h) {
      var R = S.mem_R || 0; if (R <= 0.001 || R >= 0.999) return;
      var x = T.L('light'), rp = R * 1.2 * Math.sqrt(w * w + h * h) / Math.SQRT2;
      for (var i = 0; i < 28; i++) {
        var a = i / 28 * TAU + t * 0.5;
        glow(x, w * FX + Math.cos(a) * rp, h * FY + Math.sin(a) * rp, 4 + 4 * hash(i), '180,255,255', 0.8 * (0.5 + 0.5 * Math.sin(t * 9 + i)));
      }
    } }],
    'pikaffects': [{ apply: function (S, t) {
      var u = cyc(t, 4); S.fx = { name: 'melt', m: seg(u, 0.15, 0.7) };
      if (u > 0.93) S.dip = Math.max(S.dip, (u - 0.93) / 0.07);
      if (u < 0.03) S.dip = Math.max(S.dip, 1 - u / 0.03);
    } }, chipFx('Melt', 'tl', true)],
    'hologram': [fxFx({ name: 'glitch' }), grade({ sep: 1, hue: 150, sat: 2.2, b: 1.1 }), { apply: function (S, t) {
      S.g.b *= hash(Math.floor(t * 14)) > 0.15 ? 1 : 0.55;
    }, draw: function (T, S, t, w, h) {
      var x = T.L('light');
      x.fillStyle = 'rgba(120,255,255,.08)'; for (var y = (t * 20) % 3; y < h; y += 3) x.fillRect(0, y, w, 1);
      glow(x, w * FX, h * FY, w * 0.35, '80,230,255', 0.18);
    } }],

    /* 오디오·대사 (하단 트랙 레인 + 자막) */
    'dialogue-colon-syntax': [audioFx({ tag: 'Barista says: "…"', active: ['d'], d: [[0.15, 0.55, '“따뜻할 때 드세요.”']], a: [[0, 1]] })],
    'dialogue-block': [audioFx({ tag: 'Dialogue:', active: ['d'], d: [[0.08, 0.4, 'A: 향이 좋네요.'], [0.5, 0.85, 'B: 방금 내렸어요.']], a: [[0, 1]] })],
    'voiceover': [audioFx({ tag: 'V.O.', active: ['d'], d: [[0.1, 0.8, '(화면 밖) “하루는 한 잔으로 시작돼요.”']], m: [[0, 1]] })],
    'sfx-label': [audioFx({ tag: 'SFX:', active: ['s'], s: [[0.2, 0.28, '달그락'], [0.6, 0.7, '후루룩']], a: [[0, 1]] })],
    'ambient-label': [audioFx({ tag: 'Ambient noise:', active: ['a'], a: [[0, 1, '카페 웅성임 · 빗소리']] })],
    'music-score': [audioFx({ tag: 'Music:', active: ['m'], m: [[0, 1, '로파이 재즈 · 느린 템포']], a: [[0, 1]] })],
    'no-music': [audioFx({ tag: 'only natural sounds', active: ['a', 's'], a: [[0, 1, '창밖 빗소리']], s: [[0.4, 0.48, '달그락']], mute: 'm' })],
    'voice-tone': [audioFx({ tag: 'whispers', active: ['d'], d: [[0.15, 0.7, '(속삭이듯) “아직 뜨거워요.”']], a: [[0, 1]] })],
    'emotion-cue': [audioFx({ tag: 'Emotion: 그리움', active: ['d'], d: [[0.2, 0.7, '“그때도 이 향이었죠.”']], m: [[0, 1]] }),
      grade({ sat: 0.8, b: 0.95 }), tint('#4a6fa5', 'soft-light', 0.3), { apply: function (S, t) { S.cam.s *= 1 + 0.12 * pp(t, 16); } }],
    'singing': [audioFx({ tag: 'sings', active: ['d'], d: [[0.1, 0.9, '♪ 김이 오르는 아침 ♪']], m: [[0, 1]] })],

    /* 시퀀스·멀티샷 */
    'timestamp-prompting': [{ apply: function (S, t, T) {
      var k = Math.floor(cyc(t, 6) * 3);
      if (k === 1) T.view(0, { s: 2.2 }); else if (k === 2) T.view(0, { s: 3.2, y: FY - 0.08 });
    }, draw: function (T, S, t, w) {
      timeline(T.L('ov'), w, 0, [[0, 1 / 3, '[00:00-00:02]'], [1 / 3, 2 / 3, '[00:02-00:04]'], [2 / 3, 1, '[00:04-00:06]']], cyc(t, 6));
    } }],
    'multi-shot-numbered': [{ apply: function (S, t, T) {
      var k = Math.floor(cyc(t, 6) * 3);
      if (k === 1) T.view(0, { s: 1.5, tf: 'perspective(800px) rotateX(12deg) scale(1.25)' });
      else if (k === 2) T.view(0, { s: 2.6, flip: true, filter: 'saturate(1.1)' });
    } }, liveChip('tl', function (t) { return 'Shot ' + (Math.floor(cyc(t, 6) * 3) + 1); }, true)],
    'lens-switch': [{ apply: function (S, t, T) {
      if (cyc(t, 4) < 0.5) S.fx = { name: 'fisheye', k: 0.2 };
      else T.view(0, { s: 2.4, filter: 'contrast(.95)' });
    } }, liveChip('tl', function (t) { return cyc(t, 4) < 0.5 ? '24mm' : '85mm'; }, true), chipFx('lens switch', 'tr', true)],
    'consistent-subject-anchor': [{ apply: function (S) { S.hideCam = true; }, draw: function (T, S, t, w, h) {
      var x = T.L('ov'), m = 6, pw = (w - m * 4) / 3, ph = Math.min(h * 0.62, pw * 1.3), py = (h - ph) / 2 - 4;
      var spec = [[1, FX, FY, false, null], [1.8, 0.46, FY, false, 'rgba(255,150,60,.35)'], [2.6, FX, FY, true, 'rgba(60,120,255,.3)']];
      for (var i = 0; i < 3; i++) {
        var px = m + i * (pw + m), sp = spec[i];
        panel(x, T.video, px, py, pw, ph, sp[0], sp[1], sp[2], sp[3]);
        if (sp[4]) { x.save(); x.globalCompositeOperation = 'soft-light'; x.fillStyle = sp[4]; x.fillRect(px, py, pw, ph); x.restore(); }
        x.save(); x.strokeStyle = 'rgba(255,255,255,.85)'; x.setLineDash([3, 3]); x.lineWidth = 1.2;
        x.beginPath(); x.ellipse(px + pw / 2, py + ph * (i === 0 ? FY : 0.5), pw * 0.22 * (i === 0 ? 0.7 : 1), ph * 0.18 * (i === 0 ? 0.7 : 1), 0, 0, TAU); x.stroke(); x.restore();
        label(x, 'Shot ' + (i + 1), px + 6, py + 11, { size: 10, bg: 'rgba(0,0,0,.5)' });
      }
      label(x, '같은 묘사 · “white ceramic cup”', w / 2, py + ph + 14, { align: 'center', size: 11 });
    } }],
    'extend-video': [{ apply: function (S, t) { var u = cyc(t, 8); if (u >= 0.5) S.cam.s *= 1 + 0.25 * smooth((u - 0.5) / 0.5); },
      draw: function (T, S, t, w, h) { timeline(T.L('ov'), w, h, [[0, 0.5, '원본 0–4초'], [0.5, 1, '연장 4–8초']], cyc(t, 8), h - 26); } }],

    /* 모델별 문법·기능 */
    'start-end-frame': [{ apply: function (S, t, T) {
      if (!T.mem.se && T.ready) { T.snapshot(); T.mem.se = 1; }
      S.mem_p = prog(t, 5, S); S.cam.s *= 1 + 1.2 * S.mem_p;
    }, draw: function (T, S, t, w, h) {
      if (!T.snap) return;
      var x = T.L('ov'), tw = w * 0.22, th = tw * 9 / 16, y = h - th - 10, p = S.mem_p || 0;
      thumb(x, T.snap, 10, y, tw, th, 1, '시작'); thumb(x, T.snap, w - tw - 10, y, tw, th, 2.2, '끝');
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.5; x.setLineDash([3, 3]);
      x.beginPath(); x.moveTo(14 + tw, y + th / 2); x.lineTo(w - tw - 14, y + th / 2); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#ff4d4d'; x.beginPath(); x.arc(lerp(14 + tw, w - tw - 14, p), y + th / 2, 4, 0, TAU); x.fill();
    } }],
    'image-to-video': [{ apply: function (S, t) { if (cyc(t, 5) < 0.32) S.mode = 'freeze'; },
      draw: function (T, S, t, w, h) {
        var x = T.L('ov');
        if (cyc(t, 5) < 0.32) { x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); }
        else smokeWisps(T.L('light'), w, h, t, 0.18, 7);
      } }, liveChip('tl', function (t) { return cyc(t, 5) < 0.32 ? '이미지 1장' : '동작만 묘사'; })],
    'ingredients-reference': [crop(1.1), grade({ sep: 0.25, sat: 1.25, hue: -6 }), { apply: function (S, t, T) {
      if (!T.mem.ir && T.ready) { T.snapshot(); T.mem.ir = 1; }
    }, draw: function (T, S, t, w, h) {
      if (!T.snap) return;
      var x = T.L('ov'), tw = w * 0.17, th = tw * 9 / 16, R = [[2.4, FX, FY], [3, FX, FY - 0.2], [2, FX, 0.85]];
      for (var i = 0; i < 3; i++) {
        var y = 8 + i * (th + 14);
        thumb(x, T.snap, 8, y, tw, th, R[i][0], null, R[i][1], R[i][2]);
        if (i < 2) label(x, '+', 8 + tw / 2, y + th + 7, { align: 'center', size: 11 });
      }
      label(x, '→', 16 + tw, 8 + th * 1.5 + 14, { size: 16 });
    } }],
    'character-reference': [{ apply: function (S, t, T) {
      if (!T.mem.cr && T.ready) { T.snapshot(); T.mem.cr = 1; }
      if (cyc(t, 4) < 0.5) { S.cam.s *= 1.2; G(S, { sep: 0.25, sat: 1.2 }); }
      else T.view(0, { s: 2.2, flip: true, filter: 'hue-rotate(190deg) saturate(.8) brightness(.85)' });
    }, draw: function (T, S, t, w, h) {
      var x = T.L('ov'), tw = w * 0.2, th = tw * 9 / 16;
      if (T.snap) thumb(x, T.snap, 8, 8, tw, th, 2.4, '레퍼런스');
      ringMark(x, w, h, 0.8, cyc(t, 4) < 0.5 ? 0.1 : 0.2);
    } }],
    'motion-brush': [fxFx({ name: 'brush' }), { draw: function (T, S, t, w, h) {
      var x = T.L('ov'), cx = w * FX, cy = h * (FY - 0.24), p = cyc(t, 2);
      x.save(); x.strokeStyle = 'rgba(190,120,255,.9)'; x.lineWidth = 2; x.setLineDash([5, 4]);
      x.beginPath(); x.ellipse(cx, cy, w * 0.13, h * 0.24, 0, 0, TAU); x.stroke(); x.setLineDash([]);
      x.fillStyle = 'rgba(190,120,255,.12)'; x.fill();
      var y0 = h * (FY - 0.06), y1 = h * (FY - 0.44), yy = lerp(y0, y1, p);
      x.lineWidth = 2.5; x.strokeStyle = 'rgba(255,255,255,.9)';
      x.beginPath(); x.moveTo(cx, y0); x.lineTo(cx, yy); x.stroke();
      x.beginPath(); x.moveTo(cx - 6, yy + 7); x.lineTo(cx, yy); x.lineTo(cx + 6, yy + 7); x.stroke();
      x.restore();
    } }],
    'camera-control-preset': [{ apply: function (S, t) {
      var u = cyc(t, 9), k = Math.floor(u * 3), l = smooth(u * 3 - k);
      if (k === 0) S.cam.s *= 1 + 0.5 * l;
      else if (k === 1) { var ry = lerp(-20, 20, l); S.cam.s *= 1.4; S.cam.ry += ry; S.cam.x -= ry * 0.35; }
      else { S.cam.s *= 1.3; S.cam.y += lerp(-8, 8, l); S.cam.rx -= 14 * l; }
    }, draw: function (T, S, t, w) { timeline(T.L('ov'), w, 0, [[0, 1 / 3, 'Push In'], [1 / 3, 2 / 3, 'Orbit'], [2 / 3, 1, 'Crane Up']], cyc(t, 9)); } }],
    'bracket-camera-commands': [{ apply: function (S, t) {
      var u = cyc(t, 6), k = u < 0.5 ? 0 : 1, l = smooth(u * 2 - k);
      if (k === 0) S.cam.s *= 1 + 0.45 * l;
      else { S.cam.s *= 1.45; S.cam.x += 14 * l; S.cam.ry -= 6 * l; }
    }, draw: function (T, S, t, w) { timeline(T.L('ov'), w, 0, [[0, 0.5, '[Push in]'], [0.5, 1, '[Pan left]']], cyc(t, 6)); } }],
    'negative-prompt': [{ apply: function (S, t) {
      var u = cyc(t, 6), a = 1 - seg(u, 0.35, 0.55);
      S.g.blur += 2.2 * a; S.cam.x += nz(t * 6, 1) * 1.5 * a; S.cam.s *= 1.05 + 0.06 * a * nz(t * 3, 2); S.g.b *= 1 + 0.12 * a * nz(t * 11, 3);
      if (a > 0.05) S.fx = { name: 'melt', m: 0.08 * a * (0.5 + 0.5 * Math.sin(t * 3)) };
      if (u > 0.94) S.dip = Math.max(S.dip, (u - 0.94) / 0.06);
      if (u < 0.03) S.dip = Math.max(S.dip, 1 - u / 0.03);
    } }, liveChip('tl', function (t) { return cyc(t, 6) < 0.45 ? 'negative 없음' : 'negative: blur, distortion'; }, true)],
    'positive-exclusion': [{ draw: function (T, S, t, w, h) {
      var lx = T.L('light'); lx.save(); lx.beginPath(); lx.rect(0, 0, w / 2, h); lx.clip(); smokeWisps(lx, w, h, t, 0.4, 10); lx.restore();
      var x = T.L('ov'); x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(w / 2 - 0.75, 0, 1.5, h);
      label(x, '“no steam”', w / 4, 16, { align: 'center', size: 11, bg: 'rgba(0,0,0,.55)', font: 'ui-monospace, Menlo, monospace' });
      label(x, '“clear, still air”', w * 0.75, 16, { align: 'center', size: 11, bg: 'rgba(0,0,0,.55)', font: 'ui-monospace, Menlo, monospace' });
    } }],
    'video-to-video-edit': [{ apply: function (S, t, T) {
      var X = 50 + 30 * sn(t, 6); S.mem_X = X;
      T.view(0, { s: 1, filter: 'sepia(.35) hue-rotate(-10deg) saturate(1.45) brightness(1.08) contrast(1.05)', clip: 'inset(0 0 0 ' + X.toFixed(2) + '%)' });
    }, draw: function (T, S, t, w, h) {
      var x = T.L('ov'), X = (S.mem_X || 50) / 100 * w;
      x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(X - 0.75, 0, 1.5, h);
      label(x, '원본', 10, 16, { size: 11, bg: 'rgba(0,0,0,.5)' });
      label(x, 'relight', w - 10, 16, { size: 11, bg: 'rgba(0,0,0,.5)', align: 'right', font: 'ui-monospace, Menlo, monospace' });
    } }],
    'new-angle-aleph': [{ apply: function (S, t, T) {
      if (cyc(t, 5) >= 0.5) T.view(0, { s: 1.4, flip: true, tf: 'perspective(900px) rotateY(-18deg) rotateX(8deg) scale(1.2)', filter: 'brightness(.95)' });
    } }, liveChip('tl', function (t) { return cyc(t, 5) < 0.5 ? '입력 영상' : '새 앵글'; })],
    'remix-one-change': [{ apply: function (S, t, T) {
      if (cyc(t, 4) >= 0.5) T.view(0, { s: 1, filter: 'sepia(.45) hue-rotate(-15deg) saturate(1.5) brightness(1.05)' });
    } }, liveChip('tl', function (t) { return cyc(t, 4) < 0.5 ? 'v1' : 'v2 · 색감만 변경'; })],
    'duration-param': [{ apply: function (S, t, T) {
      var tt = t % 18, k = tt < 4 ? 0 : (tt < 10 ? 1 : 2);
      S.mem_D = [4, 6, 8][k]; S.mem_l = tt - [0, 4, 10][k];
      if (T.mem.dk2 !== k) { S.seekTo = 0; T.mem.dk2 = k; }
    }, draw: function (T, S, t, w, h) {
      var x = T.L('ov'), m = 10, bw = w - m * 2, y = h - 22, D = S.mem_D || 4;
      x.fillStyle = 'rgba(0,0,0,.5)'; roundRect(x, m, y, bw, 10, 4); x.fill();
      x.fillStyle = 'rgba(255,255,255,.85)'; roundRect(x, m, y, bw * D / 8, 10, 4); x.fill();
      x.fillStyle = '#ff4d4d'; x.fillRect(m + bw * (S.mem_l || 0) / 8 - 1, y - 3, 2, 16);
      label(x, D + '초', m + bw * D / 8 + 6, y - 9, { size: 12 });
    } }],
    'loop': [{ apply: function (S, t) { if (cyc(t, 6) >= 0.5) S.mode = 'reverse'; },
      draw: function (T, S, t, w) {
        var x = T.L('ov'), cx = w - 22, cy = 22, u = cyc(t, 6);
        x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, 12, 0, TAU); x.stroke();
        x.strokeStyle = '#fff'; x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy, 12, -Math.PI / 2, -Math.PI / 2 + u * TAU); x.stroke();
        label(x, '↻', cx, cy + 1, { align: 'center', size: 13 });
      } }]
  };

  /* ---------- MAP 도우미(호이스팅) ---------- */
  function thumb(x, src, px, py, tw, th, s, text, cxf, cyf) {
    panel(x, src, px, py, tw, th, s, cxf, cyf, false);
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.5; x.setLineDash([]); x.strokeRect(px, py, tw, th);
    if (text) label(x, text, px + 4, py + th - 8, { size: 10, bg: 'rgba(0,0,0,.55)' });
  }
  var LANE = [['d', '대사', '255,209,102'], ['s', '효과음', '123,223,242'], ['a', '앰비언스', '178,247,165'], ['m', '음악', '247,161,196']];
  function audioFx(sp) {
    return {
      setup: function (T) { if (sp.tag) T.chip(sp.tag, 'tl', true); },
      draw: function (T, S, t, w, h) {
        var x = T.L('ov'), u = cyc(t, 8), ph = Math.min(h * 0.42, 70), top = h - ph, lx = 58, rw = w - lx - 8, lh = (ph - 10) / 4, i, j;
        x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, top, w, ph);
        var sub = null, sfx = null;
        for (i = 0; i < 4; i++) {
          var key = LANE[i][0], y0 = top + 5 + i * lh, on = sp.active.indexOf(key) >= 0, col = LANE[i][2];
          label(x, LANE[i][1], 8, y0 + lh / 2, { size: 10, color: on ? '#fff' : 'rgba(255,255,255,.5)', shadow: false });
          if (sp.mute === key) {
            x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(lx, y0 + lh / 2 - 0.5, rw, 1);
            label(x, '없음', lx + 6, y0 + lh / 2, { size: 10, color: '#ff8080', shadow: false });
            continue;
          }
          var bl = sp[key] || [];
          for (j = 0; j < bl.length; j++) {
            var b = bl[j], bx = lx + b[0] * rw, bw = (b[1] - b[0]) * rw, live = u >= b[0] && u < b[1];
            for (var xx = bx; xx < bx + bw; xx += 3) {
              var amp = (0.25 + 0.75 * hash(Math.floor(xx) * 0.37 + i * 13)) * lh * 0.4 * (key === 'a' ? 0.5 : 1);
              if (live && Math.abs(xx - (lx + u * rw)) < 12) amp *= 1 + 0.4 * Math.sin(t * 20 + xx);
              x.fillStyle = on ? 'rgba(' + col + ',' + (live ? 0.95 : 0.6) + ')' : 'rgba(255,255,255,.28)';
              x.fillRect(xx, y0 + lh / 2 - amp, 2, Math.max(1, amp * 2));
            }
            if (b[2] && on && key !== 'd') label(x, b[2], bx + 4, y0 + lh / 2, { size: 9, bg: 'rgba(0,0,0,.6)', shadow: false });
            if (live && b[2] && key === 'd') sub = b[2];
            if (live && b[2] && key === 's') sfx = b[2];
          }
        }
        x.fillStyle = '#ff4d4d'; x.fillRect(lx + u * rw - 1, top + 3, 2, ph - 6);
        if (sub) label(x, sub, w / 2, top - 14, { align: 'center', size: 13, bg: 'rgba(0,0,0,.55)' });
        if (sfx) label(x, 'SFX · ' + sfx, w * FX, h * (FY - 0.3), { align: 'center', size: 12, bg: 'rgba(0,0,0,.5)' });
      }
    };
  }
  var shardCache = null;
  function getShards() {
    if (shardCache) return shardCache;
    var C = 8, R = 5, V = [], i, j, out = [];
    for (j = 0; j <= R; j++) {
      V.push([]);
      for (i = 0; i <= C; i++) {
        var jx = (i > 0 && i < C) ? (hash(i * 7 + j * 13) - 0.5) * 0.6 / C : 0, jy = (j > 0 && j < R) ? (hash(i * 3 + j * 17 + 5) - 0.5) * 0.6 / R : 0;
        V[j].push([i / C + jx, j / R + jy]);
      }
    }
    function add(a, b, c, n) {
      var cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, dx = cx - FX, dy = cy - FY, d = Math.sqrt(dx * dx + dy * dy) + 0.05;
      out.push({ p: [a, b, c], cx: cx, cy: cy, vx: dx / d * (0.25 + 0.35 * hash(n)), vy: dy / d * 0.3 - 0.35 * hash(n + 1), vr: (hash(n + 2) - 0.5) * 3 });
    }
    for (j = 0; j < R; j++) for (i = 0; i < C; i++) {
      var n = j * C + i, a = V[j][i], b = V[j][i + 1], c = V[j + 1][i + 1], d2 = V[j + 1][i];
      if ((i + j) % 2) { add(a, b, c, n * 2); add(a, c, d2, n * 2 + 1); } else { add(a, b, d2, n * 2); add(b, c, d2, n * 2 + 1); }
    }
    shardCache = out;
    return out;
  }

  /* ---------- 등록 ---------- */
  function collect(terms) {
    var fx = [], spec = null, any = false;
    for (var i = 0; i < terms.length; i++) {
      var m = terms[i] && MAP[terms[i].id];
      if (!m) continue;
      any = true;
      for (var j = 0; j < m.length; j++) { if (m[j].dg) spec = m[j].dg; fx.push(m[j]); }
    }
    return { fx: fx, dg: spec, any: any };
  }
  var def = {
    aspect: '16/9',
    primaries: [{ key: 'coffee', label: '커피 한 잔', src: SRC, prompt: 'A cup of hot coffee on a table, steam rising, static shot' }],
    primaryFor: function () { return 'coffee'; },
    supports: function (term) { return !!(term && MAP.hasOwnProperty(term.id)); },
    render: function (el, terms, ctx) {
      terms = terms || []; ctx = ctx || {};
      var c = collect(terms), T = null, rm = !!ctx.reducedMotion;
      try {
        T = new Tile(el, c.fx, { reducedMotion: rm });
        if (c.dg) addDiagram(T, c.dg);
        if (terms.length && !c.any) T.chip('원본으로 보여줘요', 'tl');
      } catch (e) {
        if (window.console) console.warn('[r-video]', e);
        if (T) T.destroy();
        el.textContent = '';
        T = new Tile(el, [], { reducedMotion: rm });
        if (terms.length) T.chip('원본으로 보여줘요', 'tl');
      }
      return function () { if (T) T.destroy(); T = null; };
    }
  };
  PD.videoTerms = Object.keys(MAP);
  if (typeof PD.registerRenderer === 'function') PD.registerRenderer('video', def);
  else (PD._pendingRenderers = PD._pendingRenderers || []).push(['video', def]);
})();
