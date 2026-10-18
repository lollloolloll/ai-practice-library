/* r-image.js — 이미지 필드 '이론적 결과' 렌더러 (canvas 2D, classic script) */
(function () {
  'use strict';
  var PD = window.PD = window.PD || {};
  var W = 800, H = 533, N = W * H;

  // ---------------- math ----------------
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ss(a, b, x) { var t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function P() { return new Float32Array(N); }
  function hexc(h) {
    h = String(h).replace('#', '');
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
  }
  function rgbs(c, a) {
    return 'rgba(' + Math.round(cl(c[0]) * 255) + ',' + Math.round(cl(c[1]) * 255) + ',' + Math.round(cl(c[2]) * 255) + ',' + (a == null ? 1 : a) + ')';
  }
  function rng(seed) {
    var s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function hash2(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, o) {
    var t = 0, a = 0.5, f = 1, n = 0;
    for (var i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; }
    return t / n;
  }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------------- planes ----------------
  function boxH(src, dst, w, h, r) {
    if (r < 1) { dst.set(src); return; }
    var inv = 1 / (2 * r + 1);
    for (var y = 0; y < h; y++) {
      var o = y * w, acc = 0, k;
      for (k = -r; k <= r; k++) acc += src[o + (k < 0 ? 0 : (k >= w ? w - 1 : k))];
      for (var x = 0; x < w; x++) {
        dst[o + x] = acc * inv;
        var a = x + r + 1, b = x - r;
        acc += src[o + (a >= w ? w - 1 : a)] - src[o + (b < 0 ? 0 : b)];
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    if (r < 1) { dst.set(src); return; }
    var inv = 1 / (2 * r + 1);
    for (var x = 0; x < w; x++) {
      var acc = 0, k;
      for (k = -r; k <= r; k++) acc += src[(k < 0 ? 0 : (k >= h ? h - 1 : k)) * w + x];
      for (var y = 0; y < h; y++) {
        dst[y * w + x] = acc * inv;
        var a = y + r + 1, b = y - r;
        acc += src[(a >= h ? h - 1 : a) * w + x] - src[(b < 0 ? 0 : b) * w + x];
      }
    }
  }
  function blurPl(src, w, h, rx, ry, passes) {
    rx = Math.round(rx); ry = ry == null ? rx : Math.round(ry); passes = passes || 3;
    var a = new Float32Array(src), t = new Float32Array(src.length);
    for (var i = 0; i < passes; i++) { boxH(a, t, w, h, rx); boxV(t, a, w, h, ry); }
    return a;
  }
  function samp(pl, w, h, x, y) {
    if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
    if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
    var x0 = x | 0, y0 = y | 0, x1 = x0 < w - 1 ? x0 + 1 : x0, y1 = y0 < h - 1 ? y0 + 1 : y0, tx = x - x0, ty = y - y0;
    var a = pl[y0 * w + x0], b = pl[y0 * w + x1], c = pl[y1 * w + x0], d = pl[y1 * w + x1];
    var t = a + (b - a) * tx;
    return t + ((c + (d - c) * tx) - t) * ty;
  }
  function resample(pl, pw, ph, sx, sy, sw, sh, w, h) {
    var out = new Float32Array(w * h), fx = sw / w, fy = sh / h;
    for (var y = 0; y < h; y++) {
      var yy = sy + (y + 0.5) * fy - 0.5;
      for (var x = 0; x < w; x++) out[y * w + x] = samp(pl, pw, ph, sx + (x + 0.5) * fx - 0.5, yy);
    }
    return out;
  }
  function lumPl(S) { var p = P(); for (var i = 0; i < N; i++) p[i] = lum(S.r[i], S.g[i], S.b[i]); return p; }
  function blurRGB(S, rx, ry) { return { r: blurPl(S.r, W, H, rx, ry), g: blurPl(S.g, W, H, rx, ry), b: blurPl(S.b, W, H, rx, ry) }; }
  function wblur(S, rx, wgt, ry) {
    if (!wgt) return blurRGB(S, rx, ry);
    var wr = P(), wg = P(), wb = P(), i;
    for (i = 0; i < N; i++) { wr[i] = S.r[i] * wgt[i]; wg[i] = S.g[i] * wgt[i]; wb[i] = S.b[i] * wgt[i]; }
    var bw = blurPl(wgt, W, H, rx, ry), br = blurPl(wr, W, H, rx, ry), bg = blurPl(wg, W, H, rx, ry), bb = blurPl(wb, W, H, rx, ry);
    for (i = 0; i < N; i++) {
      if (bw[i] > 0.002) { var d = 1 / bw[i]; br[i] *= d; bg[i] *= d; bb[i] *= d; }
      else { br[i] = S.r[i]; bg[i] = S.g[i]; bb[i] = S.b[i]; }
    }
    return { r: br, g: bg, b: bb };
  }
  function toCanvas(S, cv) {
    cv = cv || mkCanvas(W, H);
    var c = cv.getContext('2d'), id = c.createImageData(W, H), d = id.data;
    for (var i = 0, j = 0; i < N; i++, j += 4) { d[j] = S.r[i] * 255; d[j + 1] = S.g[i] * 255; d[j + 2] = S.b[i] * 255; d[j + 3] = 255; }
    c.putImageData(id, 0, 0);
    return cv;
  }
  function fromCanvas(S, cv) {
    var d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    for (var i = 0, j = 0; i < N; i++, j += 4) { S.r[i] = d[j] / 255; S.g[i] = d[j + 1] / 255; S.b[i] = d[j + 2] / 255; }
  }
  function raster(draw, br) {
    var cv = mkCanvas(W, H), c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    draw(c);
    var d = c.getImageData(0, 0, W, H).data, p = P();
    for (var i = 0; i < N; i++) p[i] = d[i * 4 + 3] / 255;
    return br ? blurPl(p, W, H, br) : p;
  }
  // colored layer (premultiplied planes)
  function layer(draw, br) {
    var cv = mkCanvas(W, H), c = cv.getContext('2d');
    draw(c);
    var d = c.getImageData(0, 0, W, H).data, r = P(), g = P(), b = P(), a = P();
    for (var i = 0, j = 0; i < N; i++, j += 4) {
      var al = d[j + 3] / 255; a[i] = al;
      r[i] = d[j] / 255 * al; g[i] = d[j + 1] / 255 * al; b[i] = d[j + 2] / 255 * al;
    }
    if (br) { r = blurPl(r, W, H, br); g = blurPl(g, W, H, br); b = blurPl(b, W, H, br); a = blurPl(a, W, H, br); }
    return { r: r, g: g, b: b, a: a };
  }
  function over(S, L, k) {
    k = k == null ? 1 : k;
    for (var i = 0; i < N; i++) {
      var a = L.a[i] * k; if (a <= 0.001) continue;
      S.r[i] = S.r[i] * (1 - a) + L.r[i] * k; S.g[i] = S.g[i] * (1 - a) + L.g[i] * k; S.b[i] = S.b[i] * (1 - a) + L.b[i] * k;
    }
  }
  function screenL(S, L, k) {
    k = k == null ? 1 : k;
    for (var i = 0; i < N; i++) {
      S.r[i] = 1 - (1 - S.r[i]) * (1 - cl(L.r[i] * k));
      S.g[i] = 1 - (1 - S.g[i]) * (1 - cl(L.g[i] * k));
      S.b[i] = 1 - (1 - S.b[i]) * (1 - cl(L.b[i] * k));
    }
  }
  function clampS(S) { for (var i = 0; i < N; i++) { S.r[i] = cl(S.r[i]); S.g[i] = cl(S.g[i]); S.b[i] = cl(S.b[i]); } }
  function snapshot(S) { return { r: new Float32Array(S.r), g: new Float32Array(S.g), b: new Float32Array(S.b) }; }
  function warp(S, fn, black) {
    var c = snapshot(S), o = [0, 0];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x; fn(x, y, o);
      if (black && (o[0] < 0 || o[1] < 0 || o[0] > W - 1 || o[1] > H - 1)) { S.r[i] = S.g[i] = S.b[i] = 0.02; continue; }
      S.r[i] = samp(c.r, W, H, o[0], o[1]); S.g[i] = samp(c.g, W, H, o[0], o[1]); S.b[i] = samp(c.b, W, H, o[0], o[1]);
    }
  }

  // cached noise planes
  var NC = {};
  function noisePl(scale, oct, seed, sx, sy) {
    sx = sx || 1; sy = sy || 1;
    var k = scale + '|' + oct + '|' + seed + '|' + sx + '|' + sy;
    if (NC[k]) return NC[k];
    var p = P();
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) p[y * W + x] = fbm(x * sx / scale, y * sy / scale, seed, oct);
    NC[k] = p; return p;
  }
  function gnoise(big) {
    var k = big ? 'gb' : 'gs';
    if (NC[k]) return NC[k];
    var r = rng(big ? 77 : 99), p = P(), i;
    for (i = 0; i < N; i++) p[i] = (r() + r() + r() - 1.5) * 1.15;
    if (big) { p = blurPl(p, W, H, 1, 1, 1); for (i = 0; i < N; i++) p[i] *= 2.2; }
    NC[k] = p; return p;
  }
  function paperPl() {
    if (NC.paper) return NC.paper;
    var a = noisePl(3, 3, 51), b = gnoise(true), p = P();
    for (var i = 0; i < N; i++) p[i] = cl(0.55 + (a[i] - 0.5) * 0.9 + b[i] * 0.08);
    NC.paper = p; return p;
  }

  // ---------------- colour helpers ----------------
  function rgb2hsv(r, g, b, o) {
    var mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b), d = mx - mn, h = 0;
    if (d > 1e-6) {
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    o[0] = h; o[1] = mx > 1e-6 ? d / mx : 0; o[2] = mx;
  }
  function hsv2rgb(h, s, v, o) {
    h = (((h % 1) + 1) % 1) * 6;
    var i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    switch (i % 6) {
      case 0: o[0] = v; o[1] = t; o[2] = p; break;
      case 1: o[0] = q; o[1] = v; o[2] = p; break;
      case 2: o[0] = p; o[1] = v; o[2] = t; break;
      case 3: o[0] = p; o[1] = q; o[2] = v; break;
      case 4: o[0] = t; o[1] = p; o[2] = v; break;
      default: o[0] = v; o[1] = p; o[2] = q;
    }
  }
  function lut(stops) {
    var T = new Float32Array(256 * 3), cs = stops.map(function (s) { return [s[0], hexc(s[1])]; });
    for (var i = 0; i < 256; i++) {
      var t = i / 255, k = 0;
      while (k < cs.length - 2 && t > cs[k + 1][0]) k++;
      var a = cs[k], b = cs[k + 1], u = cl((t - a[0]) / ((b[0] - a[0]) || 1));
      for (var c = 0; c < 3; c++) T[i * 3 + c] = mix(a[1][c], b[1][c], u);
    }
    return T;
  }

  // ---------------- primaries & sources ----------------
  var PRIM = {
    portrait: { key: 'portrait', label: '인물 사진', src: 'assets/primary/portrait.jpg',
      prompt: 'Portrait of a young woman with a copper bob haircut, a lake and hills softly blurred behind her' },
    street: { key: 'street', label: '거리 풍경', src: 'assets/primary/street.jpg',
      prompt: 'An empty downtown street with tram tracks running between tall buildings' },
    product: { key: 'product', label: '제품 사진', src: 'assets/primary/product.jpg',
      prompt: 'A white ceramic mug on a white table against a plain wall' },
    painting: { key: 'painting', label: '명화', src: 'assets/primary/painting.jpg',
      prompt: 'A horse-drawn hay wagon crossing a shallow river beside a farmhouse in the English countryside' }
  };
  var SRC = {};
  function loadImg(src) {
    if (PD.loadImage) return PD.loadImage(src);
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  function getSrc(key) {
    var c = SRC[key];
    if (c) return c.p;
    c = SRC[key] = {};
    c.p = loadImg(PRIM[key].src).then(function (img) { c.e = buildSrc(key, img); return c.e; });
    c.p.catch(function () { delete SRC[key]; });
    return c.p;
  }
  function readRegion(e, vp) {
    var cv = mkCanvas(W, H), cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(e.img, vp.x * e.iw, vp.y * e.ih, vp.w * e.iw, vp.h * e.ih, 0, 0, W, H);
    var d = cx.getImageData(0, 0, W, H).data, r = P(), g = P(), b = P();
    for (var i = 0, j = 0; i < N; i++, j += 4) { r[i] = d[j] / 255; g[i] = d[j + 1] / 255; b[i] = d[j + 2] / 255; }
    return { r: r, g: g, b: b };
  }
  function fullData(e) {
    if (e.full) return e.full;
    var cv = mkCanvas(e.iw, e.ih), c = cv.getContext('2d');
    c.drawImage(e.img, 0, 0);
    e.full = { d: c.getImageData(0, 0, e.iw, e.ih).data, w: e.iw, h: e.ih };
    return e.full;
  }
  function buildSrc(key, img) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, base;
    if (iw / ih > 1.5) { var bw = ih * 1.5 / iw; base = { x: (1 - bw) / 2, y: 0, w: bw, h: 1 }; }
    else { var bh = iw / 1.5 / ih; base = { x: 0, y: (1 - bh) / 2, w: 1, h: bh }; }
    var e = { key: key, img: img, iw: iw, ih: ih, base: base };
    e.f0 = readRegion(e, base);
    buildMaps(e);
    return e;
  }
  function mugMask(x, y) {
    var body = 0, handle = 0;
    if (y >= 0.497 && y <= 0.868) {
      var t = y < 0.68 ? 0 : (y - 0.68) / 0.2;
      var hw = 0.128 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.5)));
      if (y < 0.51) hw *= 0.97;
      body = Math.abs(x - 0.258) <= hw ? 1 : 0;
    }
    var hu = (x - 0.435) / 0.046, hv = (y - 0.643) / 0.093, iu = (x - 0.432) / 0.022, iv = (y - 0.643) / 0.066;
    if (x > 0.38 && hu * hu + hv * hv <= 1 && iu * iu + iv * iv > 1) handle = 1;
    return body || handle ? 1 : 0;
  }
  function buildMaps(e) {
    var f = e.f0, R = f.r, G = f.g, B = f.b, b = e.base, k = e.key;
    var m = P(), sky = P(), dep = P(), gnd = P(), geo = P(), i, x, y;
    for (y = 0; y < H; y++) {
      var Y0 = b.y + (y + 0.5) / H * b.h;
      for (x = 0; x < W; x++) {
        i = y * W + x;
        var X0 = b.x + (x + 0.5) / W * b.w, r = R[i], g = G[i], bl = B[i], L = lum(r, g, bl);
        if (k === 'portrait') {
          var warm = ss(0.015, 0.06, r - g) * ss(0.05, 0.13, r - bl);
          var dark = Y0 > 0.72 ? ss(0.38, 0.27, L) : 0;
          var ex = (X0 - 0.515) / 0.235, ey = (Y0 - 0.40) / 0.39;
          var env = 1 - ss(0.88, 1.02, ex * ex + ey * ey);
          if (Y0 > 0.72 && Math.abs(X0 - 0.51) < 0.1 + (Y0 - 0.72) * 2.2) env = 1;
          var core = Math.max(fe(X0, Y0, 0.512, 0.46, 0.095, 0.2), fe(X0, Y0, 0.51, 0.72, 0.075, 0.13));
          m[i] = Math.max(core, Math.max(warm, dark) * env);
          geo[i] = Math.max(core, fe(X0, Y0, 0.515, 0.38, 0.215, 0.36), fe(X0, Y0, 0.51, 1.08, 0.4, 0.3));
          sky[i] = ss(0.6, 0.74, L) * ss(0.5, 0.33, Y0) * (bl > r ? 1 : 0);
          gnd[i] = ss(0.42, 0.5, Y0);
        } else if (k === 'street') {
          var mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
          sky[i] = ss(0.8, 0.9, L) * ss(0.16, 0.08, mx - mn) * ss(0.67, 0.6, Y0) * ss(0.36, 0.4, X0) * ss(0.68, 0.64, X0);
          var dx = (X0 - 0.52) * 1.5, dy = Y0 - 0.62;
          dep[i] = 1 - ss(0, 0.6, Math.sqrt(dx * dx + dy * dy));
          gnd[i] = ss(0.64, 0.7, Y0);
        } else if (k === 'product') {
          m[i] = mugMask(X0, Y0);
          gnd[i] = ss(0.73, 0.75, Y0);
          dep[i] = Y0 < 0.74 ? 1 : 1 - (Y0 - 0.74) / 0.26;
        } else {
          sky[i] = ss(0.5, 0.65, L) * ss(0.55, 0.4, Y0) * (bl >= r - 0.02 ? 1 : 0.3);
          dep[i] = 1 - Y0;
        }
      }
    }
    var ms = null;
    if (k === 'portrait') {
      m = blurPl(m, W, H, 2);
      for (i = 0; i < N; i++) m[i] = ss(0.25, 0.75, m[i]);
      m = blurPl(m, W, H, 2, 2, 2);
      for (i = 0; i < N; i++) geo[i] = Math.max(geo[i] * 0.85, m[i]);
      ms = softMask(geo);
      for (i = 0; i < N; i++) { sky[i] *= 1 - m[i]; dep[i] = 1 - ms[i]; gnd[i] *= 1 - m[i]; }
      e.plate = buildPlate(R, G, B, m);
    } else if (k === 'product') {
      m = blurPl(m, W, H, 1, 1, 1);
      ms = blurPl(m, W, H, 5);
    } else if (k === 'street') {
      sky = blurPl(sky, W, H, 1, 1, 2);
      for (i = 0; i < N; i++) dep[i] = Math.max(dep[i], sky[i]);
    }
    e.m = m; e.ms = ms || P(); e.sky = sky; e.dep = dep; e.gnd = gnd;
  }
  // feathered ellipse
  function fe(x, y, cx, cy, rx, ry) { var dx = (x - cx) / rx, dy = (y - cy) / ry; return 1 - ss(0.6, 1.25, dx * dx + dy * dy); }
  // heavily blurred subject mask (radius ~4-5% of width) for lighting and depth-of-field
  function softMask(m) {
    var s = blurPl(m, W, H, 14);
    for (var i = 0; i < N; i++) s[i] = ss(0.08, 0.85, s[i]);
    return blurPl(s, W, H, 4, 4, 2);
  }
  function buildPlate(R, G, B, m) {
    var md = blurPl(m, W, H, 8), i, x, y;
    for (i = 0; i < N; i++) md[i] = cl(md[i] * 3.2);
    var pr = new Float32Array(R), pg = new Float32Array(G), pb = new Float32Array(B);
    for (y = 0; y < H; y++) {
      var o = y * W, x0 = -1, x1 = -1;
      for (x = 0; x < W; x++) if (md[o + x] > 0.02) { if (x0 < 0) x0 = x; x1 = x; }
      if (x0 < 0) continue;
      var lr = 0, lg = 0, lb = 0, rr = 0, rg = 0, rb = 0, nl = 0, nr = 0, k;
      for (k = x0 - 8; k < x0 - 1; k++) if (k >= 0) { lr += R[o + k]; lg += G[o + k]; lb += B[o + k]; nl++; }
      for (k = x1 + 2; k < x1 + 9; k++) if (k < W) { rr += R[o + k]; rg += G[o + k]; rb += B[o + k]; nr++; }
      if (!nl && !nr) continue;
      if (!nl) { lr = rr; lg = rg; lb = rb; nl = nr; }
      if (!nr) { rr = lr; rg = lg; rb = lb; nr = nl; }
      lr /= nl; lg /= nl; lb /= nl; rr /= nr; rg /= nr; rb /= nr;
      for (x = x0; x <= x1; x++) {
        var t = x1 > x0 ? (x - x0) / (x1 - x0) : 0.5, j = o + x, a = md[j];
        pr[j] = mix(R[j], mix(lr, rr, t), a); pg[j] = mix(G[j], mix(lg, rg, t), a); pb[j] = mix(B[j], mix(lb, rb, t), a);
      }
    }
    var br = blurPl(pr, W, H, 7), bg = blurPl(pg, W, H, 7), bb = blurPl(pb, W, H, 7);
    for (i = 0; i < N; i++) { var w = md[i]; pr[i] = mix(pr[i], br[i], w); pg[i] = mix(pg[i], bg[i], w); pb[i] = mix(pb[i], bb[i], w); }
    return { r: pr, g: pg, b: pb };
  }
  function sameVp(a, b) {
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;
  }
  function cropMap(e, pl, vp) {
    if (!pl) return P();
    if (sameVp(vp, e.base)) return new Float32Array(pl);
    var b = e.base;
    return resample(pl, W, H, (vp.x - b.x) / b.w * W, (vp.y - b.y) / b.h * H, vp.w / b.w * W, vp.h / b.h * H, W, H);
  }
  function makeState(e, vp) {
    var f = sameVp(vp, e.base) ? snapshot(e.f0) : readRegion(e, vp);
    var S = { r: f.r, g: f.g, b: f.b, e: e, key: e.key, vp: vp, ov: [], hasMask: e.key === 'portrait' || e.key === 'product' };
    S.m = cropMap(e, e.m, vp); S.ms = cropMap(e, e.ms, vp); S.sky = cropMap(e, e.sky, vp); S.dep = cropMap(e, e.dep, vp); S.gnd = cropMap(e, e.gnd, vp);
    S.L0 = lumPl(S);
    return S;
  }
  function plate(S) {
    if (S.pl !== undefined) return S.pl;
    var p = S.e.plate;
    S.pl = p ? { r: cropMap(S.e, p.r, S.vp), g: cropMap(S.e, p.g, S.vp), b: cropMap(S.e, p.b, S.vp) } : null;
    return S.pl;
  }
  // source-normalized → working pixels
  function X(S, x) { return (x - S.vp.x) / S.vp.w * W; }
  function Y(S, y) { return (y - S.vp.y) / S.vp.h * H; }
  function LX(S, l) { return l / S.vp.w * W; }
  function LY(S, l) { return l / S.vp.h * H; }
  function srcY(S, y) { return S.vp.y + (y + 0.5) / H * S.vp.h; }
  function rw(S, reg, i) {
    switch (reg) {
      case 'S': return S.ms[i];
      case 'B': return 1 - S.ms[i];
      case 'K': return S.sky[i];
      case 'NK': return 1 - S.sky[i];
      case 'G': return S.gnd[i];
      default: return 1;
    }
  }
  // portrait regions
  function skinW(S, x, y) {
    var xs = S.vp.x + (x + 0.5) / W * S.vp.w, ys = S.vp.y + (y + 0.5) / H * S.vp.h;
    return Math.max(fe(xs, ys, 0.512, 0.47, 0.1, 0.2), 0.9 * fe(xs, ys, 0.51, 0.71, 0.07, 0.11));
  }

  // ================= tone & colour ops =================
  function grade(S, o) {
    var R = S.r, G = S.g, B = S.b;
    var ex = o.exp ? Math.pow(2, o.exp) : 1, t = o.temp || 0, ti = o.tint || 0;
    var kr = ex * (1 + 0.16 * t) * (1 + 0.03 * ti), kg = ex * (1 + 0.02 * t) * (1 - 0.09 * ti), kb = ex * (1 - 0.2 * t) * (1 + 0.03 * ti);
    var con = o.con || 0, lift = o.lift || 0, crush = o.crush || 0, sat = o.sat == null ? 1 : o.sat, vib = o.vib || 0;
    var shd = o.shd || 0, hl = o.hl || 0, mono = o.mono || 0, cap = o.cap == null ? 1 : o.cap, gam = o.gam || 1;
    var sc = o.sh ? hexc(o.sh) : null, sa = o.sha || 0, hc = o.hi ? hexc(o.hi) : null, ha = o.hia || 0;
    var mul = o.mul ? hexc(o.mul) : null, amt = o.amt == null ? 1 : o.amt, reg = o.reg;
    var ch = [0, 0, 0], c;
    for (var i = 0; i < N; i++) {
      var w = amt;
      if (reg) { w *= rw(S, reg, i); if (w <= 0.001) continue; }
      var r0 = R[i], g0 = G[i], b0 = B[i];
      ch[0] = r0 * kr; ch[1] = g0 * kg; ch[2] = b0 * kb;
      for (c = 0; c < 3; c++) {
        var v = ch[c];
        if (v > 1.2) v = 1.2;
        if (gam !== 1) v = Math.pow(v > 0 ? v : 0, gam);
        if (shd) v += shd * v * (1 - v) * (1 - v) * 2.2;
        if (hl) v -= hl * v * v * (1 - v) * 2.2;
        if (con) {
          var vc = v < 0 ? 0 : v > 1 ? 1 : v;
          v = con > 0 ? v + con * (vc * vc * (3 - 2 * vc) - vc) : 0.5 + (v - 0.5) * (1 + con);
        }
        if (crush) v = (v - crush) / (1 - crush);
        if (lift) v = lift + v * (1 - lift);
        ch[c] = v;
      }
      var L = lum(ch[0], ch[1], ch[2]);
      if (sat !== 1 || vib) {
        var s = sat;
        if (vib) { var mx = Math.max(ch[0], ch[1], ch[2]), mn = Math.min(ch[0], ch[1], ch[2]); s *= 1 + vib * (1 - cl((mx - mn) * 2)); }
        for (c = 0; c < 3; c++) ch[c] = L + (ch[c] - L) * s;
      }
      if (sc) { var ws = 1 - cl(L); ws *= ws * sa * 2; for (c = 0; c < 3; c++) ch[c] += (sc[c] - 0.5) * ws; }
      if (hc) { var wh = cl(L); wh *= wh * ha * 2; for (c = 0; c < 3; c++) ch[c] += (hc[c] - 0.5) * wh; }
      if (mono) { var L2 = lum(ch[0], ch[1], ch[2]); for (c = 0; c < 3; c++) ch[c] = mix(ch[c], L2, mono); }
      if (mul) for (c = 0; c < 3; c++) ch[c] *= mul[c];
      if (cap !== 1) for (c = 0; c < 3; c++) ch[c] *= cap;
      R[i] = cl(mix(r0, ch[0], w)); G[i] = cl(mix(g0, ch[1], w)); B[i] = cl(mix(b0, ch[2], w));
    }
  }
  function gmap(S, o) {
    var T = lut(o.stops), amt = o.amt == null ? 1 : o.amt;
    for (var i = 0; i < N; i++) {
      var w = amt * (o.reg ? rw(S, o.reg, i) : 1); if (w <= 0.001) continue;
      var j = Math.round(cl(lum(S.r[i], S.g[i], S.b[i])) * 255) * 3;
      S.r[i] = mix(S.r[i], T[j], w); S.g[i] = mix(S.g[i], T[j + 1], w); S.b[i] = mix(S.b[i], T[j + 2], w);
    }
  }
  function hueT(S, o) {
    var t = o.t, k = o.k == null ? 1 : o.k, sat = o.sat || 1, ms = o.minSat || 0, hsv = [0, 0, 0], rgb = [0, 0, 0];
    for (var i = 0; i < N; i++) {
      var w = o.reg ? rw(S, o.reg, i) : 1; if (w <= 0.001) continue;
      rgb2hsv(S.r[i], S.g[i], S.b[i], hsv);
      var h = hsv[0], bd = 9;
      for (var j = 0; j < t.length; j++) { var d = t[j] - h; d -= Math.round(d); if (Math.abs(d) < Math.abs(bd)) bd = d; }
      var s = Math.min(1, Math.max(hsv[1] * sat, ms));
      hsv2rgb(h + bd * k, s, hsv[2], rgb);
      S.r[i] = mix(S.r[i], rgb[0], w); S.g[i] = mix(S.g[i], rgb[1], w); S.b[i] = mix(S.b[i], rgb[2], w);
    }
  }
  function palMap(S, pal, amt) {
    var cs = pal.map(function (h) { return typeof h === 'string' ? hexc(h) : h; }), n = cs.length;
    amt = amt == null ? 1 : amt;
    for (var i = 0; i < N; i++) {
      var r = S.r[i], g = S.g[i], b = S.b[i], best = 0, bd = 1e9;
      for (var j = 0; j < n; j++) {
        var c = cs[j], dr = r - c[0], dg = g - c[1], db = b - c[2], d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < bd) { bd = d; best = j; }
      }
      var q = cs[best];
      S.r[i] = mix(r, q[0], amt); S.g[i] = mix(g, q[1], amt); S.b[i] = mix(b, q[2], amt);
    }
  }
  function kmeans(R, G, B, n, k, it, seed) {
    var rnd = rng(seed || 1), pr = new Float32Array(k), pg = new Float32Array(k), pb = new Float32Array(k), j, i, t;
    // init by luminance quantiles for good spread
    var idx = [];
    for (i = 0; i < n; i += Math.max(1, (n / 2000) | 0)) idx.push(i);
    idx.sort(function (a, b) { return lum(R[a], G[a], B[a]) - lum(R[b], G[b], B[b]); });
    for (j = 0; j < k; j++) { var s = idx[Math.min(idx.length - 1, Math.floor((j + 0.5) / k * idx.length))]; pr[j] = R[s]; pg[j] = G[s]; pb[j] = B[s]; }
    var sr = new Float64Array(k), sg = new Float64Array(k), sb = new Float64Array(k), cnt = new Float64Array(k);
    for (t = 0; t < it; t++) {
      sr.fill(0); sg.fill(0); sb.fill(0); cnt.fill(0);
      for (i = 0; i < n; i++) {
        var r = R[i], g = G[i], b = B[i], best = 0, bd = 1e9;
        for (j = 0; j < k; j++) { var dr = r - pr[j], dg = g - pg[j], db = b - pb[j], d = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (d < bd) { bd = d; best = j; } }
        sr[best] += r; sg[best] += g; sb[best] += b; cnt[best]++;
      }
      for (j = 0; j < k; j++) {
        if (cnt[j]) { pr[j] = sr[j] / cnt[j]; pg[j] = sg[j] / cnt[j]; pb[j] = sb[j] / cnt[j]; }
        else { var q = (rnd() * n) | 0; pr[j] = R[q]; pg[j] = G[q]; pb[j] = B[q]; }
      }
    }
    var out = [];
    for (j = 0; j < k; j++) out.push([pr[j], pg[j], pb[j]]);
    return out;
  }
  function kpal(S, k, satk) {
    var w = 200, h = 133;
    var R = resample(S.r, W, H, 0, 0, W, H, w, h), G = resample(S.g, W, H, 0, 0, W, H, w, h), B = resample(S.b, W, H, 0, 0, W, H, w, h);
    var pal = kmeans(R, G, B, w * h, k, 7, 3);
    if (satk) pal = pal.map(function (c) { var L = lum(c[0], c[1], c[2]); return [cl(L + (c[0] - L) * satk), cl(L + (c[1] - L) * satk), cl(L + (c[2] - L) * satk)]; });
    return pal;
  }
  function poster(S, o) {
    var n = (o.n || 5) - 1, soft = o.soft || 0;
    function q(v) { var t = v * n, f = Math.floor(t), r = t - f; if (soft) r = ss(0.5 - soft, 0.5 + soft, r); else r = r < 0.5 ? 0 : 1; return cl((f + r) / n); }
    for (var i = 0; i < N; i++) {
      if (o.lum) {
        var L = lum(S.r[i], S.g[i], S.b[i]), L2 = q(L), k = L > 0.01 ? L2 / L : 0;
        S.r[i] = cl(S.r[i] * k); S.g[i] = cl(S.g[i] * k); S.b[i] = cl(S.b[i] * k);
      } else { S.r[i] = q(S.r[i]); S.g[i] = q(S.g[i]); S.b[i] = q(S.b[i]); }
    }
  }
  function vign(S, o) {
    var k = o.k || 0.4, r0 = o.r0 == null ? 0.3 : o.r0, c = o.c ? hexc(o.c) : null;
    for (var y = 0; y < H; y++) {
      var dy = (y - H / 2) / (H / 2);
      for (var x = 0; x < W; x++) {
        var dx = (x - W / 2) / (W / 2), v = ss(r0, 1.5, dx * dx * 0.85 + dy * dy) * k, i = y * W + x;
        if (c) { S.r[i] = mix(S.r[i], c[0], v); S.g[i] = mix(S.g[i], c[1], v); S.b[i] = mix(S.b[i], c[2], v); }
        else { var f = 1 - v; S.r[i] *= f; S.g[i] *= f; S.b[i] *= f; }
      }
    }
  }
  function grain(S, o) {
    var n = gnoise(o.big), k = o.k || 0.05, col = o.col ? gnoise(!o.big) : null;
    for (var i = 0; i < N; i++) {
      var L = lum(S.r[i], S.g[i], S.b[i]), d = 2 * L - 1, w = k * (0.35 + 0.65 * (1 - d * d)), g = n[i] * w;
      if (col) { var g2 = col[i] * w * 0.4; S.r[i] = cl(S.r[i] + g + g2); S.g[i] = cl(S.g[i] + g); S.b[i] = cl(S.b[i] + g - g2); }
      else { S.r[i] = cl(S.r[i] + g); S.g[i] = cl(S.g[i] + g); S.b[i] = cl(S.b[i] + g); }
    }
  }
  function clarity(S, o) {
    var L = lumPl(S), Lb = blurPl(L, W, H, o.r || 6), k = o.k == null ? 0.4 : o.k;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, w = k;
      if (o.face) w *= skinW(S, x, y) * S.ms[i];
      if (w === 0) continue;
      var d = (L[i] - Lb[i]) * w;
      S.r[i] = cl(S.r[i] + d); S.g[i] = cl(S.g[i] + d); S.b[i] = cl(S.b[i] + d);
    }
  }
  function sharpen(S, o) { clarity(S, { r: 1, k: o.k == null ? 0.6 : o.k }); }
  function bloom(S, o) {
    var th = o.th == null ? 0.7 : o.th, hl = P(), c = o.c || [1, 1, 1], k = o.k == null ? 0.5 : o.k, i;
    for (i = 0; i < N; i++) { var L = lum(S.r[i], S.g[i], S.b[i]); hl[i] = ss(th, 1, L) * L; }
    hl = blurPl(hl, W, H, o.r || 12);
    for (i = 0; i < N; i++) {
      var v = hl[i] * k;
      S.r[i] = 1 - (1 - S.r[i]) * (1 - cl(v * c[0])); S.g[i] = 1 - (1 - S.g[i]) * (1 - cl(v * c[1])); S.b[i] = 1 - (1 - S.b[i]) * (1 - cl(v * c[2]));
    }
  }
  function halation(S, o) {
    var k = o.k == null ? 0.8 : o.k, hl = P(), i;
    for (i = 0; i < N; i++) { var L = lum(S.r[i], S.g[i], S.b[i]); hl[i] = ss(0.68, 0.95, L); }
    var a = blurPl(hl, W, H, 6), b = blurPl(hl, W, H, 2);
    for (i = 0; i < N; i++) {
      var v = (a[i] * 0.8 + b[i] * 0.4 - hl[i] * 0.6);
      if (v <= 0) continue; v *= k;
      S.r[i] = cl(S.r[i] + v * 0.95); S.g[i] = cl(S.g[i] + v * 0.22); S.b[i] = cl(S.b[i] + v * 0.1);
    }
  }
  function orton(S, o) {
    var b = blurRGB(S, o.r || 8), k = o.k == null ? 0.35 : o.k;
    for (var i = 0; i < N; i++) {
      S.r[i] = mix(S.r[i], 1 - (1 - S.r[i]) * (1 - b.r[i]), k);
      S.g[i] = mix(S.g[i], 1 - (1 - S.g[i]) * (1 - b.g[i]), k);
      S.b[i] = mix(S.b[i], 1 - (1 - S.b[i]) * (1 - b.b[i]), k);
    }
  }
  function blurmix(S, o) {
    var b = blurRGB(S, o.r || 2), k = o.k == null ? 0.5 : o.k;
    for (var i = 0; i < N; i++) { S.r[i] = mix(S.r[i], b.r[i], k); S.g[i] = mix(S.g[i], b.g[i], k); S.b[i] = mix(S.b[i], b.b[i], k); }
  }

  // ================= relighting =================
  function lightShape(S, L) {
    var p = P(), x, y, i, cx, cy, rx, ry, sf;
    if (L.t === 'rad') {
      cx = X(S, L.x); cy = Y(S, L.y); rx = Math.max(1, LX(S, L.rx)); ry = Math.max(1, LY(S, L.ry));
      for (y = 0; y < H; y++) {
        var dy = (y - cy) / ry; dy *= dy;
        for (x = 0; x < W; x++) { var dx = (x - cx) / rx; p[y * W + x] = Math.exp(-(dx * dx + dy) * 1.5); }
      }
    } else if (L.t === 'side') {
      cx = X(S, L.x); sf = Math.max(W * 0.045, LX(S, L.soft || 0.03));
      var col = new Float32Array(W);
      for (x = 0; x < W; x++) col[x] = ss(-1, 1, (x - cx) * L.dir / sf);
      for (y = 0; y < H; y++) p.set(col, y * W);
    } else if (L.t === 'vert') {
      cy = Y(S, L.y); sf = Math.max(H * 0.06, LY(S, L.soft || 0.03));
      for (y = 0; y < H; y++) { var v = ss(-1, 1, (y - cy) * L.dir / sf); p.fill(v, y * W, y * W + W); }
    } else if (L.t === 'poly') {
      p = raster(function (c) {
        c.beginPath();
        L.pts.forEach(function (q, j) { var px = X(S, q[0]), py = Y(S, q[1]); if (j) c.lineTo(px, py); else c.moveTo(px, py); });
        c.closePath(); c.fill();
      }, Math.max(10, L.blur || 0));
    } else if (L.t === 'rim') {
      var mb = blurPl(S.m, W, H, L.r || 5);
      for (i = 0; i < N; i++) p[i] = cl((S.m[i] - mb[i]) * 4);
      for (y = 0; y < H; y++) { var f = 1 - ss(0.72, 0.97, y / H); for (x = 0; x < W; x++) p[y * W + x] *= f; }
      p = blurPl(p, W, H, 1, 1, 1);
    } else if (L.t === 'caus') {
      var n1 = noisePl(60, 3, 71, 1, 1.4), n2 = noisePl(35, 2, 72);
      for (i = 0; i < N; i++) { var s = Math.abs(Math.sin((n1[i] * 1.3 + n2[i] * 0.5) * 22)); p[i] = Math.pow(1 - s, 7); }
      p = blurPl(p, W, H, 1, 1, 1);
    }
    return p;
  }
  function relight(S, o) {
    var m = S.ms, aS = o.amb == null ? 1 : o.amb, aB = o.bamb == null ? aS : o.bamb, ac = o.ac || [1, 1, 1], i;
    var Fr = P(), Fg = P(), Fb = P(), Ar = P(), Ag = P(), Ab = P();
    for (i = 0; i < N; i++) { var a = aB + (aS - aB) * m[i]; Fr[i] = a * ac[0]; Fg[i] = a * ac[1]; Fb[i] = a * ac[2]; }
    (o.L || []).forEach(function (L) {
      var p = lightShape(S, L), k = L.k == null ? 1 : L.k, c = L.c || [1, 1, 1], reg = L.reg, add = L.add;
      for (var j = 0; j < N; j++) {
        var v = p[j] * k; if (reg) v *= rw(S, reg, j); if (v === 0) continue;
        if (add) { Ar[j] += v * c[0]; Ag[j] += v * c[1]; Ab[j] += v * c[2]; }
        else { Fr[j] += v * c[0]; Fg[j] += v * c[1]; Fb[j] += v * c[2]; }
      }
    });
    function tm(v) { if (v < 0) return 0; return v < 0.85 ? v : 0.85 + 0.15 * Math.tanh((v - 0.85) / 0.15); }
    for (i = 0; i < N; i++) {
      var r = S.r[i], g = S.g[i], b = S.b[i];
      S.r[i] = tm(r * Fr[i] + Ar[i] * (0.35 + 0.65 * r));
      S.g[i] = tm(g * Fg[i] + Ag[i] * (0.35 + 0.65 * g));
      S.b[i] = tm(b * Fb[i] + Ab[i] * (0.35 + 0.65 * b));
    }
  }
  function castShadow(S, o) {
    var dx = LX(S, o.dx || 0.01), dy = LY(S, o.dy || 0.01), k = o.k == null ? 0.4 : o.k, sh = P();
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) sh[y * W + x] = samp(S.m, W, H, x - dx, y - dy);
    sh = blurPl(sh, W, H, o.blur || 2);
    for (var i = 0; i < N; i++) { var f = 1 - k * sh[i] * (1 - S.m[i]); S.r[i] *= f; S.g[i] *= f; S.b[i] *= f; }
  }
  var EYES = [[0.453, 0.398], [0.566, 0.398]];
  function catchl(S, o) {
    var cv = toCanvas(S), c = cv.getContext('2d'), r = LX(S, 0.0034);
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.strokeStyle = 'rgba(255,255,255,0.85)';
    EYES.forEach(function (e) {
      (o.pos || [[0, -0.004]]).forEach(function (q) {
        var x = X(S, e[0] + q[0]), y = Y(S, e[1] + q[1]);
        c.beginPath();
        if (o.s === 'rect') c.fillRect(x - r * 1.2, y - r * 0.9, r * 2.4, r * 1.8);
        else if (o.s === 'ring') { c.lineWidth = Math.max(1, r * 0.5); c.arc(x, y, r * 1.6, 0, 6.2832); c.stroke(); }
        else { c.arc(x, y, r, 0, 6.2832); c.fill(); }
      });
    });
    fromCanvas(S, cv);
  }
  function skin(S, o) {
    var b = blurRGB(S, o.r || 4), k = o.k == null ? 0.7 : o.k;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, w = skinW(S, x, y) * S.ms[i];
      if (w <= 0.01) continue;
      var d = Math.abs(lum(S.r[i], S.g[i], S.b[i]) - lum(b.r[i], b.g[i], b.b[i]));
      w *= k * (1 - ss(0.05, 0.13, d));
      S.r[i] = mix(S.r[i], b.r[i], w); S.g[i] = mix(S.g[i], b.g[i], w); S.b[i] = mix(S.b[i], b.b[i], w);
    }
  }

  // ================= optics =================
  function dof(S, o) {
    var R0 = o.r || 10, A = P(), i, x, y, wgt = null;
    if (o.mode === 'subject') {
      var mb = S.ms;
      wgt = P();
      for (i = 0; i < N; i++) { A[i] = 1 - mb[i]; wgt[i] = cl(1 - Math.max(S.m[i], mb[i]) * 1.6); }
    } else if (o.mode === 'depth') {
      for (i = 0; i < N; i++) A[i] = cl(Math.abs(S.dep[i] - (o.f || 0)) * (o.s || 1.5));
    } else if (o.mode === 'band') {
      for (y = 0; y < H; y++) { var a = ss(o.w0, o.w1, Math.abs(y / H - o.y)); A.fill(a, y * W, y * W + W); }
    } else if (o.mode === 'point') {
      var cx = X(S, o.x), cy = Y(S, o.y);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var dx = (x - cx) / W, dy = (y - cy) / W;
        A[y * W + x] = ss(o.w0, o.w1, Math.sqrt(dx * dx + dy * dy * 1.3));
      }
    }
    var ryk = o.ryk || 1, k = o.k == null ? 1 : o.k;
    var b1 = wblur(S, R0 * 0.4, wgt, R0 * 0.4 * ryk), b2 = wblur(S, R0, wgt, R0 * ryk);
    for (i = 0; i < N; i++) {
      var t = A[i] * k; if (t <= 0.001) continue;
      if (t < 0.5) { t *= 2; S.r[i] = mix(S.r[i], b1.r[i], t); S.g[i] = mix(S.g[i], b1.g[i], t); S.b[i] = mix(S.b[i], b1.b[i], t); }
      else { t = (t - 0.5) * 2; S.r[i] = mix(b1.r[i], b2.r[i], t); S.g[i] = mix(b1.g[i], b2.g[i], t); S.b[i] = mix(b1.b[i], b2.b[i], t); }
    }
  }
  function bokeh(S, o) {
    var cv = toCanvas(S), c = cv.getContext('2d'), rnd = rng(o.seed || 7), n = o.n || 30, tries = 0, placed = 0;
    var cols = o.cols ? o.cols.map(hexc) : null, y0 = o.y0 == null ? 0 : o.y0, y1 = o.y1 == null ? 1 : o.y1;
    var a0 = o.a0 == null ? 0.2 : o.a0, a1 = o.a1 == null ? 0.45 : o.a1, boost = o.boost || 1.3;
    c.globalCompositeOperation = 'screen';
    while (placed < n && tries < n * 40) {
      tries++;
      var x = rnd() * W, y = (y0 + rnd() * (y1 - y0)) * H, i = (Math.min(H - 1, y | 0)) * W + (x | 0);
      if (o.reg === 'B' && S.m[i] > 0.1) continue;
      if (o.minL && lum(S.r[i], S.g[i], S.b[i]) < o.minL) continue;
      var col = cols ? cols[(rnd() * cols.length) | 0] : [S.r[i] * boost + 0.08, S.g[i] * boost + 0.08, S.b[i] * boost + 0.08];
      var rad = o.r0 + rnd() * (o.r1 - o.r0), a = a0 + rnd() * (a1 - a0);
      var g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, rgbs(col, a * 0.65)); g.addColorStop(0.8, rgbs(col, a * 0.8)); g.addColorStop(0.93, rgbs(col, a)); g.addColorStop(1, rgbs(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 6.2832); c.fill();
      placed++;
    }
    fromCanvas(S, cv);
  }
  function ca(S, o) {
    var k = o.k || 0.01, cx = W / 2, cy = H / 2, c = snapshot(S);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, u = x - cx, v = y - cy;
      S.r[i] = samp(c.r, W, H, cx + u * (1 - k), cy + v * (1 - k));
      S.b[i] = samp(c.b, W, H, cx + u * (1 + k), cy + v * (1 + k));
    }
  }
  function mblur(S, o) {
    var r = o.r || 18, b = blurRGB(S, r, 0), mb = blurPl(S.m, W, H, r, 0), i;
    for (i = 0; i < N; i++) {
      var a = cl(mb[i] * 1.35) * 0.92;
      S.r[i] = mix(S.r[i], b.r[i], a); S.g[i] = mix(S.g[i], b.g[i], a); S.b[i] = mix(S.b[i], b.b[i], a);
    }
  }
  function glow(c, x, y, r, col, a) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + col + ',' + a + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function flare(S, o) {
    var sx = X(S, o.x), sy = Y(S, o.y), cx = W / 2, cy = H / 2;
    var L = layer(function (c) {
      c.globalCompositeOperation = 'lighter';
      glow(c, sx, sy, W * 0.5, '255,214,160', 0.5);
      glow(c, sx, sy, W * 0.07, '255,250,235', 1);
      c.save(); c.translate(sx, sy);
      for (var k = 0; k < 10; k++) {
        c.rotate(Math.PI / 5); var len = W * (k % 2 ? 0.12 : 0.22);
        var g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,240,220,0.5)'); g.addColorStop(1, 'rgba(255,240,220,0)');
        c.fillStyle = g; c.fillRect(0, -1, len, 2);
      }
      c.restore();
      [[0.45, 20, '120,255,190', 0.22], [0.85, 46, '255,150,90', 0.13], [1.2, 11, '150,170,255', 0.35], [1.55, 72, '255,220,130', 0.09], [1.95, 30, '210,130,255', 0.17], [2.3, 16, '130,255,230', 0.2]].forEach(function (q) {
        var x = sx + (cx - sx) * q[0], y = sy + (cy - sy) * q[0], g = c.createRadialGradient(x, y, 0, x, y, q[1]);
        g.addColorStop(0, 'rgba(' + q[2] + ',' + q[3] * 0.4 + ')'); g.addColorStop(0.8, 'rgba(' + q[2] + ',' + q[3] + ')'); g.addColorStop(1, 'rgba(' + q[2] + ',0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, q[1], 0, 6.2832); c.fill();
      });
      c.save(); c.translate(sx, sy); c.scale(1, 0.018); glow(c, 0, 0, W * 0.6, '255,225,195', 0.55); c.restore();
    });
    screenL(S, L, 1);
  }
  function sunstar(S, o) {
    var sx = X(S, o.x), sy = Y(S, o.y);
    var L = layer(function (c) {
      c.globalCompositeOperation = 'lighter';
      glow(c, sx, sy, W * 0.12, '255,248,235', 0.9);
      glow(c, sx, sy, W * 0.025, '255,255,255', 1);
      c.save(); c.translate(sx, sy); c.rotate(0.3);
      for (var k = 0; k < 14; k++) {
        c.rotate(Math.PI * 2 / 14); var len = W * (0.09 + (k % 2) * 0.05);
        var g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,250,240,0.95)'); g.addColorStop(1, 'rgba(255,250,240,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(0, -1.6); c.lineTo(len, 0); c.lineTo(0, 1.6); c.fill();
      }
      c.restore();
    });
    screenL(S, L, 1);
  }
  function streak(S, o) {
    var L = layer(function (c) {
      c.globalCompositeOperation = 'lighter';
      (o.pts || [[0.5, 0.5]]).forEach(function (p) {
        var x = X(S, p[0]), y = Y(S, p[1]);
        glow(c, x, y, W * 0.03, '235,245,255', 1);
        c.save(); c.translate(x, y); c.scale(1, 0.012); glow(c, 0, 0, W * 0.75, '90,150,255', 0.85); c.restore();
        c.save(); c.translate(x, y); c.scale(1, 0.004); glow(c, 0, 0, W * 0.45, '200,225,255', 1); c.restore();
      });
    });
    screenL(S, L, o.k == null ? 1 : o.k);
  }
  function leak(S) {
    var L = layer(function (c) {
      c.globalCompositeOperation = 'lighter';
      glow(c, W * 1.02, H * 0.25, W * 0.5, '255,110,40', 0.55);
      glow(c, W * 0.95, H * 0.95, W * 0.35, '255,40,60', 0.35);
    });
    screenL(S, L, 1);
  }

  // ================= scene composition =================
  function outpaint(S, o) {
    var s = o.s, sb = o.sb || Math.max(s, 0.8), ax = o.ax == null ? 0.5 : o.ax, pl = plate(S) || S;
    var nr = P(), ng = P(), nb = P(), nm = P(), bcx = W * 0.5, bcy = H * 0.42, tx = ax * W, haze = o.haze || 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, bx = bcx + (x - bcx) / sb, by = bcy + (y - bcy) / sb;
      var r = samp(pl.r, W, H, bx, by), g = samp(pl.g, W, H, bx, by), b = samp(pl.b, W, H, bx, by);
      if (haze) { r = mix(r, 0.82, haze); g = mix(g, 0.86, haze); b = mix(b, 0.9, haze); }
      var px = W * 0.5 + (x - tx) / s, py = H + (y - H) / s, mm = 0;
      if (px >= 0 && px <= W - 1 && py >= 0) {
        mm = samp(S.m, W, H, px, py);
        if (mm > 0.002) { r = mix(r, samp(S.r, W, H, px, py), mm); g = mix(g, samp(S.g, W, H, px, py), mm); b = mix(b, samp(S.b, W, H, px, py), mm); }
      }
      nr[i] = r; ng[i] = g; nb[i] = b; nm[i] = mm;
    }
    S.r = nr; S.g = ng; S.b = nb; S.m = nm; S.ms = softMask(nm); S.pl = null; S.sky = P();
    for (var j = 0; j < N; j++) S.dep[j] = 1 - nm[j];
  }
  function bgScale(S, o) {
    var pl = plate(S); if (!pl) return;
    var z = o.z, cx = X(S, o.cx), cy = Y(S, o.cy);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, a = 1 - S.m[i]; if (a <= 0.001) continue;
      var bx = cx + (x - cx) / z, by = cy + (y - cy) / z;
      S.r[i] = mix(S.r[i], samp(pl.r, W, H, bx, by), a); S.g[i] = mix(S.g[i], samp(pl.g, W, H, bx, by), a); S.b[i] = mix(S.b[i], samp(pl.b, W, H, bx, by), a);
    }
  }
  function nosubj(S) {
    var pl = plate(S); if (!pl) return;
    var n = gnoise(true);
    for (var i = 0; i < N; i++) { var d = n[i] * 0.006; S.r[i] = pl.r[i] + d; S.g[i] = pl.g[i] + d; S.b[i] = pl.b[i] + d; S.m[i] = 0; S.ms[i] = 0; }
  }
  function bgFill(S, o) {
    var amt = o.amt == null ? 1 : o.amt, keep = o.keep || 0, T = o.stops ? lut(o.stops) : null, c0 = o.c ? hexc(o.c) : null;
    var r0 = o.rad ? hexc(o.rad[0]) : null, r1 = o.rad ? hexc(o.rad[1]) : null, cx = o.rad ? X(S, o.cx) : 0, cy = o.rad ? Y(S, o.cy) : 0;
    var n = gnoise(true), col = [0, 0, 0];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, w = (1 - S.m[i]) * amt; if (w <= 0.001) continue;
      if (c0) { col[0] = c0[0]; col[1] = c0[1]; col[2] = c0[2]; }
      else if (T) { var j = Math.round(cl(y / H) * 255) * 3; col[0] = T[j]; col[1] = T[j + 1]; col[2] = T[j + 2]; }
      else { var dx = (x - cx) / W, dy = (y - cy) / W, t = cl(Math.sqrt(dx * dx + dy * dy) * 1.5); col[0] = mix(r0[0], r1[0], t); col[1] = mix(r0[1], r1[1], t); col[2] = mix(r0[2], r1[2], t); }
      var f = 1 + keep * (S.L0[i] - 0.6) + n[i] * 0.008;
      S.r[i] = mix(S.r[i], col[0] * f, w); S.g[i] = mix(S.g[i], col[1] * f, w); S.b[i] = mix(S.b[i], col[2] * f, w);
    }
  }
  function regionW(S, reg, x, y, i) {
    var L = S.L0[i];
    if (reg === 'mug') return S.m[i];
    if (reg === 'wall') return (1 - S.m[i]) * (1 - S.gnd[i]);
    if (reg === 'bg') return 1 - S.m[i];
    var ys = srcY(S, y);
    if (reg === 'shirt') return S.m[i] * ss(0.7, 0.76, ys) * ss(0.4, 0.3, L) * (1 - skinW(S, x, y));
    if (reg === 'hair') {
      var mx = Math.max(S.r[i], S.g[i], S.b[i]), sat = mx > 0 ? (mx - Math.min(S.r[i], S.g[i], S.b[i])) / mx : 0;
      return S.m[i] * (1 - skinW(S, x, y)) * ss(0.28, 0.42, sat) * (1 - ss(0.74, 0.8, ys));
    }
    return 0;
  }
  function recolor(S, o) {
    var t = hexc(o.c), amt = o.amt == null ? 1 : o.amt, wt = P(), sum = 0, sl = 0, i, x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; var w = regionW(S, o.reg, x, y, i); wt[i] = w; sum += w; sl += w * S.L0[i]; }
    if (sum < 1) return;
    var ref = sl / sum, hsv = [0, 0, 0], th = [0, 0, 0], rgb = [0, 0, 0];
    rgb2hsv(t[0], t[1], t[2], th);
    for (i = 0; i < N; i++) {
      var w2 = wt[i] * amt; if (w2 <= 0.001) continue;
      var f = S.L0[i] / Math.max(0.02, ref), nr = t[0] * f, ng = t[1] * f, nb = t[2] * f;
      if (o.hue) { rgb2hsv(S.r[i], S.g[i], S.b[i], hsv); hsv2rgb(th[0], Math.min(1, th[1] * 1.05), hsv[2], rgb); nr = rgb[0]; ng = rgb[1]; nb = rgb[2]; }
      var sp = ss(0.9, 1, S.L0[i]) * 0.7;
      nr = mix(nr, S.r[i], sp); ng = mix(ng, S.g[i], sp); nb = mix(nb, S.b[i], sp);
      S.r[i] = cl(mix(S.r[i], nr, w2)); S.g[i] = cl(mix(S.g[i], ng, w2)); S.b[i] = cl(mix(S.b[i], nb, w2));
    }
  }
  function mirrorX(S) {
    var c = snapshot(S), hw = W / 2;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, a = ss(hw - 8, hw + 8, x); if (a <= 0) continue;
      var j = y * W + (W - 1 - x);
      S.r[i] = mix(c.r[i], c.r[j], a); S.g[i] = mix(c.g[i], c.g[j], a); S.b[i] = mix(c.b[i], c.b[j], a);
    }
  }
  function fold(S) {
    // the city folds up overhead: the lower street, mirrored, becomes the "sky"
    var c = snapshot(S), y0 = H * 0.5, hz = [0.74, 0.79, 0.88];
    for (var y = 0; y < H; y++) {
      var a = ss(y0 + H * 0.03, y0 - H * 0.12, y); if (a <= 0.001) continue;
      var sy = H - 1 - (y / y0) * (H - 1 - y0), haze = 0.18 + 0.32 * cl(y / y0);
      for (var x = 0; x < W; x++) {
        var i = y * W + x, r = samp(c.r, W, H, x, sy), g = samp(c.g, W, H, x, sy), b = samp(c.b, W, H, x, sy);
        S.r[i] = mix(c.r[i], mix(r, hz[0], haze), a); S.g[i] = mix(c.g[i], mix(g, hz[1], haze), a); S.b[i] = mix(c.b[i], mix(b, hz[2], haze), a);
      }
    }
    var band = raster(function (cx) { cx.fillRect(0, y0 - H * 0.07, W, H * 0.1); }, 14);
    for (var j = 0; j < N; j++) { var w = band[j] * 0.55; S.r[j] = mix(S.r[j], hz[0], w); S.g[j] = mix(S.g[j], hz[1], w); S.b[j] = mix(S.b[j], hz[2], w); }
  }
  function renaissance(S) {
    gmap(S, { reg: 'B', stops: [[0, '#1f1a10'], [0.4, '#4a4a2a'], [0.75, '#7d7a52'], [1, '#b7ad80']], amt: 0.75 });
    blurmix(S, { r: 3, k: 0.55 });
    kuwa(S, { r: 2, sc: 1 });
    relight(S, { amb: 0.55, bamb: 0.7, L: [{ t: 'rad', x: 0.42, y: 0.36, rx: 0.22, ry: 0.32, k: 0.55, reg: 'S', c: [1.08, 1, 0.88] }] });
    gmap(S, { stops: [[0, '#1c120a'], [0.35, '#5a3c22'], [0.7, '#b48a5a'], [1, '#f0dcb0']], amt: 0.5 });
    grade(S, { temp: 0.28, sat: 0.72, con: 0.12, mul: '#f4e4bc' });
    orton(S, { r: 6, k: 0.15 });
    vign(S, { k: 0.75, r0: 0.25, c: '#140c06' });
    crack(S, { k: 1.5 });
    paper(S, { k: 0.08, canvas: 1 });
  }

  // ================= atmosphere & time =================
  function sky(S, o) {
    var T = lut(o.stops), amt = o.amt == null ? 1 : o.amt, y0 = o.y0 || 0, y1 = o.y1 == null ? 1 : o.y1, keep = o.keep || 0;
    var cn = o.clouds ? noisePl(90, 4, 33, 0.6, 1.4) : null;
    for (var y = 0; y < H; y++) {
      var t = cl((srcY(S, y) - y0) / (y1 - y0)), j = Math.round(t * 255) * 3;
      for (var x = 0; x < W; x++) {
        var i = y * W + x, w = S.sky[i] * amt; if (w <= 0.001) continue;
        var f = 1 + keep * (S.L0[i] - 0.85), cr = T[j] * f, cg = T[j + 1] * f, cb = T[j + 2] * f;
        if (cn) { var cc = ss(0.45, 0.75, cn[i]) * o.clouds; cr = mix(cr, o.cc ? o.cc[0] : 0.85, cc); cg = mix(cg, o.cc ? o.cc[1] : 0.86, cc); cb = mix(cb, o.cc ? o.cc[2] : 0.88, cc); }
        S.r[i] = mix(S.r[i], cr, w); S.g[i] = mix(S.g[i], cg, w); S.b[i] = mix(S.b[i], cb, w);
      }
    }
  }
  var LAMPS = [[0.406, 0.298, 1], [0.694, 0.274, 1], [0.469, 0.514, 0.45], [0.595, 0.497, 0.4], [0.676, 0.535, 0.3]];
  function city(S, o) {
    var L0 = S.L0, Lb = blurPl(L0, W, H, 3), win = o.win || 0, lk = o.lamps == null ? 1 : o.lamps;
    var wc = o.wc ? hexc(o.wc) : [1, 0.74, 0.4], x, y, i;
    if (win) for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var bld = (1 - S.sky[i]) * (1 - S.gnd[i]); if (bld < 0.1) continue;
      if (hash2((x / 7) | 0, (y / 5) | 0, 5) > win * 0.55) continue;
      var lit = ss(0.02, 0.09, Math.abs(L0[i] - Lb[i])) * bld * 0.85;
      S.r[i] = cl(S.r[i] + wc[0] * lit); S.g[i] = cl(S.g[i] + wc[1] * lit); S.b[i] = cl(S.b[i] + wc[2] * lit);
    }
    if (lk > 0) {
      var lc = o.lc || '255,190,110';
      var Lr = layer(function (c) {
        c.globalCompositeOperation = 'lighter';
        LAMPS.forEach(function (p) {
          var lx = X(S, p[0]), ly = Y(S, p[1]), s = p[2];
          glow(c, lx, ly, W * 0.09 * s, lc, 0.55 * lk);
          glow(c, lx, ly, W * 0.012 * s + 2, '255,245,225', 1);
          if (s > 0.9) {
            c.save(); c.translate(lx < W / 2 ? X(S, 0.36) : X(S, 0.76), Y(S, 0.82)); c.scale(1, 0.25);
            glow(c, 0, 0, W * 0.16, lc, 0.32 * lk); c.restore();
          }
        });
      });
      screenL(S, Lr, 1);
    }
  }
  function godrays(S, o) {
    var w2 = W >> 1, h2 = Math.ceil(H / 2), src = new Float32Array(w2 * h2), x, y, th = o.th || 0.7;
    for (y = 0; y < h2; y++) for (x = 0; x < w2; x++) {
      var i = Math.min(H - 1, y * 2) * W + x * 2;
      src[y * w2 + x] = ss(th, 1, lum(S.r[i], S.g[i], S.b[i])) * (o.useSky ? S.sky[i] : 1);
    }
    var sx = X(S, o.x) / 2, sy = Y(S, o.y) / 2, n = o.n || 44, dec = o.decay || 0.965, den = o.den || 0.9, out = new Float32Array(w2 * h2);
    for (y = 0; y < h2; y++) for (x = 0; x < w2; x++) {
      var dx = (sx - x) / n * den, dy = (sy - y) / n * den, px = x, py = y, wg = 1, acc = 0;
      for (var k = 0; k < n; k++) {
        px += dx; py += dy;
        if (px >= 0 && py >= 0 && px < w2 && py < h2) acc += src[(py | 0) * w2 + (px | 0)] * wg;
        wg *= dec;
      }
      out[y * w2 + x] = acc / n;
    }
    var up = blurPl(resample(out, w2, h2, 0, 0, w2, h2, W, H), W, H, 2), c = o.c || [1, 0.92, 0.75], kk = o.k || 0.8;
    for (var j = 0; j < N; j++) {
      var v = up[j] * kk * 3;
      S.r[j] = 1 - (1 - S.r[j]) * (1 - cl(v * c[0])); S.g[j] = 1 - (1 - S.g[j]) * (1 - cl(v * c[1])); S.b[j] = 1 - (1 - S.b[j]) * (1 - cl(v * c[2]));
    }
  }
  function fog(S, o) {
    var k = o.k || 0.5, c = hexc(o.c || '#d9dde0'), bf = blurRGB(S, 3);
    for (var i = 0; i < N; i++) {
      var a = cl(k * (0.18 + 0.95 * Math.pow(S.dep[i], 1.3)));
      S.r[i] = mix(mix(S.r[i], bf.r[i], a * 0.8), c[0], a);
      S.g[i] = mix(mix(S.g[i], bf.g[i], a * 0.8), c[1], a);
      S.b[i] = mix(mix(S.b[i], bf.b[i], a * 0.8), c[2], a);
    }
  }
  function wet(S, o) {
    var yv = Y(S, 0.62), bc = blurRGB(S, 1, 5), nz = noisePl(8, 2, 61, 0.3, 1), k = o.k || 0.4;
    for (var y = Math.max(0, Math.ceil(yv)); y < H; y++) {
      var t = (y - yv) / (H - yv), sy = 2 * yv - y, fr = (1 - t) * 0.7 + 0.3;
      for (var x = 0; x < W; x++) {
        var i = y * W + x, w = S.gnd[i] * k * fr; if (w <= 0.001) continue;
        var sx = x + (nz[i] - 0.5) * 8;
        S.r[i] = mix(S.r[i], samp(bc.r, W, H, sx, sy) * 0.92, w); S.g[i] = mix(S.g[i], samp(bc.g, W, H, sx, sy) * 0.92, w); S.b[i] = mix(S.b[i], samp(bc.b, W, H, sx, sy) * 0.95, w);
      }
    }
  }
  function rain(S, o) {
    var L = layer(function (c) {
      var rnd = rng(21); c.lineCap = 'round';
      for (var k = 0; k < (o.n || 1100); k++) {
        var x = rnd() * W * 1.1, y = rnd() * H * 1.05 - 20, len = 10 + rnd() * 28, a = 0.1 + rnd() * 0.3;
        c.strokeStyle = 'rgba(225,232,242,' + a + ')'; c.lineWidth = rnd() < 0.2 ? 1.6 : 1;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - len * 0.17, y + len); c.stroke();
      }
    }, 0);
    screenL(S, L, 1);
  }
  function snow(S, o) {
    var L0 = S.L0, Lb = blurPl(L0, W, H, 3), nz = noisePl(20, 3, 62), i;
    for (i = 0; i < N; i++) {
      var w = S.gnd[i] * 0.88 * (1 - ss(0.03, 0.1, Lb[i] - L0[i])) * (0.75 + 0.35 * nz[i]);
      var v = 0.93 + (nz[i] - 0.5) * 0.08;
      S.r[i] = mix(S.r[i], v * 0.97, w); S.g[i] = mix(S.g[i], v * 0.98, w); S.b[i] = mix(S.b[i], v, w);
    }
    var Lf = layer(function (c) {
      var rnd = rng(23), k, x, y, r;
      for (k = 0; k < (o.n || 900); k++) {
        x = rnd() * W; y = rnd() * H; r = 0.6 + rnd() * 1.4;
        c.fillStyle = 'rgba(255,255,255,' + (0.5 + rnd() * 0.45) + ')'; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
      }
      for (k = 0; k < 45; k++) {
        x = rnd() * W; y = rnd() * H; r = 5 + rnd() * 9;
        var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
      }
    }, 0);
    over(S, Lf, 1);
  }
  function trails(S) {
    var vx = X(S, 0.52), vy = Y(S, 0.645);
    function draw(c, wk) {
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      var rnd = rng(31);
      [[0.03, 0.36, '255,244,220'], [0.64, 0.98, '255,56,40']].forEach(function (ln, li) {
        for (var k = 0; k < 11; k++) {
          var bx = W * (ln[0] + rnd() * (ln[1] - ln[0])), by = H * (1.02 + rnd() * 0.08), a = 0.35 + rnd() * 0.45;
          var t0 = 0.04 + rnd() * 0.06, seg = 14;
          for (var s = 0; s < seg; s++) {
            var ta = t0 + (1 - t0) * s / seg, tb = t0 + (1 - t0) * (s + 1) / seg;
            c.strokeStyle = 'rgba(' + ln[2] + ',' + (a * (0.4 + 0.6 * ta)) + ')';
            c.lineWidth = (0.5 + ta * (li ? 3 : 4)) * wk;
            c.beginPath(); c.moveTo(vx + (bx - vx) * ta, vy + (by - vy) * ta); c.lineTo(vx + (bx - vx) * tb, vy + (by - vy) * tb); c.stroke();
          }
        }
      });
    }
    screenL(S, layer(function (c) { draw(c, 1); }, 0), 1);
    screenL(S, layer(function (c) { draw(c, 3); }, 3), 0.7);
  }
  function astro(S) {
    var bn = noisePl(40, 4, 81), dn = noisePl(25, 3, 82), x, y;
    var ax = W * 0.3, ay = 0, bx = W * 0.72, by = H * 0.62, lx = bx - ax, ly = by - ay, ll = Math.sqrt(lx * lx + ly * ly);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var i = y * W + x, w = S.sky[i]; if (w <= 0.01) continue;
      var t = y / H, br = mix(0.01, 0.07, t), bg = mix(0.015, 0.09, t), bb = mix(0.04, 0.2, t);
      var d = ((x - ax) * ly - (y - ay) * lx) / ll, band = Math.exp(-(d / 55) * (d / 55));
      var dust = band * (0.35 + 0.65 * bn[i]) * (1 - 0.6 * ss(0.5, 0.68, dn[i]));
      br += dust * 0.42; bg += dust * 0.38; bb += dust * 0.5;
      var h = hash2(x, y, 9), dens = 0.9975 - band * 0.006;
      if (h > dens) { var s = (h - dens) / (1 - dens); br += s; bg += s; bb += s * 1.05; }
      S.r[i] = mix(S.r[i], br, w); S.g[i] = mix(S.g[i], bg, w); S.b[i] = mix(S.b[i], bb, w);
    }
  }
  function particles(S, o) {
    var L = layer(function (c) {
      var rnd = rng(o.seed || 41); c.globalCompositeOperation = 'lighter';
      for (var k = 0; k < (o.n || 70); k++) {
        var x = rnd() * W, y = rnd() * H * 0.95, r = 1 + rnd() * 3.5;
        glow(c, x, y, r * 6, o.c || '255,214,140', 0.25 + rnd() * 0.25);
        glow(c, x, y, r, '255,250,230', 0.9);
      }
    }, 0);
    screenL(S, L, 1);
  }
  function foliage(S, o) {
    var L = layer(function (c) {
      var rnd = rng(o.seed || 51), cols = ['#2f4a22', '#3e5e2b', '#556f35', '#1f3318', '#6b7f3a'];
      for (var k = 0; k < 170; k++) {
        var left = rnd() < 0.55, x, y;
        if (o.top) { x = left ? rnd() * W * 0.32 : W - rnd() * W * 0.3; y = -10 + rnd() * H * 0.28; }
        else { x = left ? rnd() * W * 0.3 : W - rnd() * W * 0.26; y = H * 0.72 + rnd() * H * 0.33; }
        c.save(); c.translate(x, y); c.rotate(rnd() * 6.28);
        c.fillStyle = cols[(rnd() * cols.length) | 0];
        c.beginPath(); c.ellipse(0, 0, 14 + rnd() * 22, 5 + rnd() * 8, 0, 0, 6.2832); c.fill();
        c.restore();
      }
    }, o.blur == null ? 9 : o.blur);
    over(S, L, 1);
  }
  function ots(S) {
    var L = layer(function (c) {
      c.fillStyle = '#2a201a'; c.beginPath(); c.ellipse(W * 0.04, H * 0.42, W * 0.17, H * 0.38, 0.1, 0, 6.2832); c.fill();
      c.fillStyle = '#323844'; c.beginPath(); c.ellipse(W * 0.02, H * 1.1, W * 0.34, H * 0.46, 0, 0, 6.2832); c.fill();
    }, 16);
    over(S, L, 1);
  }
  function arch(S) {
    var x0 = W * 0.19, x1 = W * 0.81, rr = (x1 - x0) / 2, cy = H * 0.1 + rr;
    var L = layer(function (c) {
      var g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#463d34'); g.addColorStop(0.5, '#2c2621'); g.addColorStop(1, '#1d1915');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.moveTo(x0, H + 4); c.lineTo(x0, cy); c.arc(W / 2, cy, rr, Math.PI, 0); c.lineTo(x1, H + 4); c.closePath(); c.fill();
    }, 1);
    var spill = blurPl(L.a.map(function (v) { return 1 - v; }), W, H, 14), nz = noisePl(6, 4, 91), nz2 = noisePl(40, 3, 92);
    over(S, L, 1);
    for (var i = 0; i < N; i++) {
      var a = L.a[i]; if (a <= 0.01) continue;
      var f = (0.8 + 0.35 * nz[i] + 0.2 * nz2[i]) * (1 + spill[i] * 1.4);
      S.r[i] = mix(S.r[i], S.r[i] * f, a); S.g[i] = mix(S.g[i], S.g[i] * f, a); S.b[i] = mix(S.b[i], S.b[i] * f, a);
    }
  }
  function steam(S) {
    var L = layer(function (c) {
      var rnd = rng(61); c.lineCap = 'round';
      for (var k = 0; k < 6; k++) {
        var x = X(S, 0.19 + rnd() * 0.14), y = Y(S, 0.5), ph = rnd() * 6;
        c.strokeStyle = 'rgba(255,255,255,' + (0.12 + rnd() * 0.12) + ')'; c.lineWidth = 10 + rnd() * 16;
        c.beginPath(); c.moveTo(x, y);
        for (var s = 1; s <= 12; s++) { var yy = y - s * H * 0.035, xx = x + Math.sin(ph + s * 0.6) * W * 0.02 * (s / 6); c.lineTo(xx, yy); }
        c.stroke();
      }
    }, 9);
    screenL(S, L, 1.2);
  }

  // ================= materials (product) =================
  function drops(S, o) {
    var c = snapshot(S), rnd = rng(71), n = o.n || 110, placed = 0, tries = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      var onMug = placed < n * 0.72, cx, cy;
      if (onMug) { cx = X(S, 0.14 + rnd() * 0.24); cy = Y(S, 0.52 + rnd() * 0.33); if (S.m[(cy | 0) * W + (cx | 0)] < 0.9) continue; }
      else { cx = X(S, 0.05 + rnd() * 0.6); cy = Y(S, 0.76 + rnd() * 0.22); if (cy >= H - 8 || S.m[(cy | 0) * W + (cx | 0)] > 0.1) continue; }
      var r = (onMug ? 2.5 : 3) + rnd() * (onMug ? 5 : 6), ry = onMug ? r * 1.15 : r * 0.55;
      for (var y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (var x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        var u = (x - cx) / r, v = (y - cy) / ry, d2 = u * u + v * v; if (d2 >= 1) continue;
        var i = y * W + x, sx = cx - (x - cx) * 0.55, sy = cy - (y - cy) * 0.55 - ry * 0.3;
        var rr = samp(c.r, W, H, sx, sy), gg = samp(c.g, W, H, sx, sy), bb = samp(c.b, W, H, sx, sy);
        var rim = ss(0.5, 1, d2), dark = rim * (0.45 - 0.25 * v), hu = u + 0.35, hv = v + 0.4, hl = Math.exp(-(hu * hu + hv * hv) * 18) * 0.9;
        var cau = Math.exp(-((u - 0.1) * (u - 0.1) + (v - 0.55) * (v - 0.55)) * 10) * 0.18, a = 1 - ss(0.85, 1, d2) * 0.5;
        var f = 1 - dark;
        S.r[i] = mix(S.r[i], cl(rr * f + hl + cau), a); S.g[i] = mix(S.g[i], cl(gg * f + hl + cau), a); S.b[i] = mix(S.b[i], cl(bb * f + hl + cau * 1.1), a);
      }
      placed++;
    }
  }
  function metal(S) {
    var cx = X(S, 0.258), rx = LX(S, 0.13), st = noisePl(2, 2, 9, 0.05, 1), st2 = gnoise(false);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, w = S.m[i]; if (w <= 0.01) continue;
      var u = (x - cx) / rx, L = S.L0[i];
      var tone = 0.5 + 0.26 * Math.cos(u * 2.4 + 0.6) + 0.3 * Math.exp(-((u + 0.38) / 0.1) * ((u + 0.38) / 0.1)) + 0.12 * Math.exp(-((u - 0.55) / 0.08) * ((u - 0.55) / 0.08)) - 0.18 * u * u;
      var v = tone * (0.7 + 0.6 * (L - 0.55)) + (st[i] - 0.5) * 0.16 + st2[i] * 0.015;
      S.r[i] = mix(S.r[i], cl(v * 0.93), w); S.g[i] = mix(S.g[i], cl(v * 0.95), w); S.b[i] = mix(S.b[i], cl(v * 1.0), w);
    }
  }
  function weather(S) {
    var st = noisePl(45, 4, 101), sp = noisePl(5, 3, 102), vr = vor(18, 5), rnd = rng(103), x, y, i;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var m = S.m[i], stain = ss(0.52, 0.75, st[i]) * (m * 0.7 + 0.35), base = ss(0.6, 0.95, srcY(S, y)) * m * 0.35;
      var crack = m * (1 - ss(0.6, 1.4, vr.d2[i] - vr.d1[i])) * 0.35, speck = m * ss(0.78, 0.86, sp[i]) * 0.5;
      var f = 1 - crack - speck - base * 0.6;
      S.r[i] = cl(mix(S.r[i], S.r[i] * 0.78, stain) * f); S.g[i] = cl(mix(S.g[i], S.g[i] * 0.68, stain) * f); S.b[i] = cl(mix(S.b[i], S.b[i] * 0.5, stain) * f);
    }
    for (var k = 0; k < 40; k++) {
      var cx = X(S, 0.15 + rnd() * 0.22), cy = Y(S, 0.5 + rnd() * 0.35), r = 1 + rnd() * 2.2;
      for (y = Math.floor(cy - r); y <= cy + r; y++) for (x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        i = y * W + x; var dd = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (r * r);
        if (dd < 1 && S.m[i] > 0.9) { S.r[i] *= 0.62; S.g[i] *= 0.58; S.b[i] *= 0.52; }
      }
    }
    grade(S, { sat: 0.7, temp: 0.18, con: 0.12, exp: -0.15 });
  }
  function reflect(S, o) {
    var yb = Y(S, 0.866), k = o.k || 0.5, c = blurRGB(S, 1), h = H * 0.2;
    for (var y = Math.ceil(yb); y < H; y++) {
      var sy = 2 * yb - y, fade = Math.pow(cl(1 - (y - yb) / h), 1.5);
      for (var x = 0; x < W; x++) {
        var i = y * W + x, a = k * samp(S.m, W, H, x, sy) * fade; if (a <= 0.001) continue;
        S.r[i] = mix(S.r[i], samp(c.r, W, H, x, sy) * 0.92, a); S.g[i] = mix(S.g[i], samp(c.g, W, H, x, sy) * 0.92, a); S.b[i] = mix(S.b[i], samp(c.b, W, H, x, sy) * 0.94, a);
      }
    }
  }
  function contact(S, o) {
    relight(S, { amb: 1, L: [{ t: 'rad', x: 0.262, y: 0.872, rx: 0.13, ry: 0.016, k: -(o.k || 0.35), reg: 'B' }, { t: 'rad', x: 0.33, y: 0.89, rx: 0.2, ry: 0.04, k: -(o.k || 0.35) * 0.4, reg: 'B' }] });
  }
  function sss(S) {
    relight(S, { amb: 0.95, bamb: 1.12, L: [{ t: 'rim', r: 8, k: 0.9, add: 1, c: [1, 0.42, 0.22] }] });
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, w = skinW(S, x, y) * S.m[i]; if (w <= 0.01) continue;
      var L = lum(S.r[i], S.g[i], S.b[i]);
      S.r[i] = cl(S.r[i] + 0.07 * (1 - L) * w + 0.02 * w); S.g[i] = cl(S.g[i] - 0.015 * w);
    }
    orton(S, { r: 5, k: 0.18 });
    grade(S, { temp: 0.1 });
  }

  // ================= geometry =================
  function rotate(S, o) {
    var a = o.deg * Math.PI / 180, s = Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) * (W / H);
    var src = toCanvas(S), out = mkCanvas(W, H), c = out.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.translate(W / 2, H / 2); c.rotate(a); c.scale(s, s); c.drawImage(src, -W / 2, -H / 2);
    fromCanvas(S, out);
  }
  function keystone(S, o) {
    var src = toCanvas(S), out = mkCanvas(W, H), c = out.getContext('2d'), mn = Math.min(o.top, o.bot), p = o.p || 1;
    c.imageSmoothingQuality = 'high';
    for (var y = 0; y < H; y++) {
      var t = (y + 0.5) / H, sy = Math.pow(t, p) * H - 0.5, sc = mix(o.top, o.bot, t) / mn, sw = W / sc;
      c.drawImage(src, (W - sw) / 2, Math.min(H - 1, Math.max(0, sy)), sw, 1, 0, y, W, 1);
    }
    fromCanvas(S, out);
  }
  function barrel(S, o) {
    var k = o.k, cx = W / 2, cy = H / 2, rn = Math.sqrt(cx * cx + cy * cy), z = 1 / (1 + k);
    warp(S, function (x, y, out) {
      var u = (x - cx) / rn, v = (y - cy) / rn, f = z * (1 + k * (u * u + v * v));
      out[0] = cx + u * f * rn; out[1] = cy + v * f * rn;
    });
  }
  function bulge(S, o) {
    var cx = X(S, o.x), cy = Y(S, o.y), R = LX(S, o.r), k = o.k || 0.25;
    warp(S, function (x, y, out) {
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= R || d < 0.001) { out[0] = x; out[1] = y; return; }
      var t = d / R, f = mix(Math.pow(t, k), 1, t * t);
      out[0] = cx + dx * f; out[1] = cy + dy * f;
    });
  }
  function ipm(S, o) {
    if (S.key !== 'street') return;
    var fd = fullData(S.e), d = fd.d, fw = fd.w, fh = fd.h, yh = 0.62, xv = 0.52, A = 1 - yh;
    for (var y = 0; y < H; y++) {
      var Z = o.z0 + (1 - (y + 0.5) / H) * (o.z1 - o.z0), sy = (yh + A / Z) * fh - 0.5;
      if (sy > fh - 1) sy = fh - 1;
      var y0 = sy | 0, y1 = y0 < fh - 1 ? y0 + 1 : y0, ty = sy - y0;
      for (var x = 0; x < W; x++) {
        var Xw = ((x + 0.5) / W - 0.5) * 2 * o.xr + (o.xc || 0), sx = (xv + Xw * 0.5 / Z) * fw - 0.5;
        if (sx < 0) sx = 0; if (sx > fw - 1) sx = fw - 1;
        var x0 = sx | 0, x1 = x0 < fw - 1 ? x0 + 1 : x0, tx = sx - x0, i = y * W + x;
        var a = (y0 * fw + x0) * 4, b = (y0 * fw + x1) * 4, c = (y1 * fw + x0) * 4, e = (y1 * fw + x1) * 4;
        for (var ch = 0; ch < 3; ch++) {
          var t0 = d[a + ch] + (d[b + ch] - d[a + ch]) * tx, t1 = d[c + ch] + (d[e + ch] - d[c + ch]) * tx, v = (t0 + (t1 - t0) * ty) / 255;
          if (ch === 0) S.r[i] = v; else if (ch === 1) S.g[i] = v; else S.b[i] = v;
        }
      }
    }
    S.m = P(); S.ms = P(); S.sky = P(); S.gnd.fill(1); S.dep.fill(0); S.L0 = lumPl(S);
  }
  function letterbox(S, o) {
    var ratio = o.ratio, col = hexc(o.col || '#0e0e0f'), i, x, y;
    if (ratio >= W / H) {
      var ch = W / ratio, y0 = (H - ch) / 2;
      for (y = 0; y < H; y++) if (y < y0 || y >= y0 + ch) { S.r.fill(col[0], y * W, y * W + W); S.g.fill(col[1], y * W, y * W + W); S.b.fill(col[2], y * W, y * W + W); }
    } else {
      var cw = Math.round(H * ratio), x0 = Math.round((W - cw) / 2), cxw = o.cx == null ? W / 2 : X(S, o.cx);
      var sx0 = Math.round(Math.max(0, Math.min(W - cw, cxw - cw / 2))), c = snapshot(S);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x;
        if (x < x0 || x >= x0 + cw) { S.r[i] = col[0]; S.g[i] = col[1]; S.b[i] = col[2]; }
        else { var j = y * W + (x - x0 + sx0); S.r[i] = c.r[j]; S.g[i] = c.g[j]; S.b[i] = c.b[j]; }
      }
    }
  }
  function shrink(S, o) {
    var c = snapshot(S), s = o.s, sx = X(S, o.sx), sy = Y(S, o.sy), tx = o.tx * W, ty = o.ty * H;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, px = sx + (x - tx) / s, py = sy + (y - ty) / s;
      S.r[i] = samp(c.r, W, H, px, py); S.g[i] = samp(c.g, W, H, px, py); S.b[i] = samp(c.b, W, H, px, py);
    }
  }
  function polaroid(S, o) {
    var src = toCanvas(S), out = mkCanvas(W, H), c = out.getContext('2d');
    var bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#e2ddd3'); bg.addColorStop(1, '#cfc8bb');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    var ch = H * 0.9, cw = ch * 0.83, m = cw * 0.065, pw = cw - 2 * m;
    c.save(); c.translate(W / 2, H / 2); c.rotate(-0.035);
    c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = '#f6f4ee'; c.fillRect(-cw / 2, -ch / 2, cw, ch);
    c.shadowColor = 'transparent';
    var cx = Math.max(H / 2, Math.min(W - H / 2, X(S, o.cx == null ? 0.51 : o.cx)));
    c.drawImage(src, cx - H / 2, 0, H, H, -cw / 2 + m, -ch / 2 + m, pw, pw);
    c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(-cw / 2 + m, -ch / 2 + m, pw, 1.5);
    c.restore();
    fromCanvas(S, out);
  }
  function sticker(S) {
    var m = new Float32Array(S.m), y, x, i;
    for (y = 0; y < H; y++) { var f = 1 - ss(0.9, 0.96, y / H); for (x = 0; x < W; x++) m[y * W + x] *= f; }
    var d = blurPl(m, W, H, 7), cv = mkCanvas(W, H), c = cv.getContext('2d'), id = c.createImageData(W, H), px = id.data;
    for (i = 0; i < N; i++) {
      var a = Math.max(m[i], ss(0.04, 0.1, d[i])), mm = cl(m[i] * 1.2), j = i * 4;
      px[j] = mix(1, S.r[i], mm) * 255; px[j + 1] = mix(1, S.g[i], mm) * 255; px[j + 2] = mix(1, S.b[i], mm) * 255; px[j + 3] = a * 255;
    }
    c.putImageData(id, 0, 0);
    var out = mkCanvas(W, H), o2 = out.getContext('2d');
    o2.fillStyle = '#e7e4dd'; o2.fillRect(0, 0, W, H);
    o2.save(); o2.translate(W / 2, H * 0.52); o2.rotate(-0.07); o2.scale(0.84, 0.84);
    o2.shadowColor = 'rgba(0,0,0,0.28)'; o2.shadowBlur = 14; o2.shadowOffsetX = 4; o2.shadowOffsetY = 7;
    o2.drawImage(cv, -W / 2, -H / 2);
    o2.restore();
    fromCanvas(S, out);
    S.m = P(); S.ms = P();
  }
  function tile(S, o) {
    var sx = 0.04 * W, sy = 0.12 * H, sw = 0.34 * W, sh = 0.5 * H, tw = Math.round(W / 3), th = Math.round(H / 2);
    var tr = resample(S.r, W, H, sx, sy, sw, sh, tw, th), tg = resample(S.g, W, H, sx, sy, sw, sh, tw, th), tb = resample(S.b, W, H, sx, sy, sw, sh, tw, th);
    var nr = new Float32Array(tw * th), ng = new Float32Array(tw * th), nb = new Float32Array(tw * th), x, y;
    for (y = 0; y < th; y++) for (x = 0; x < tw; x++) {
      var ex = Math.min(x, tw - 1 - x) / (tw / 2), ey = Math.min(y, th - 1 - y) / (th / 2), w = 1 - ss(0, 0.55, Math.min(ex, ey));
      var j = y * tw + x, k = ((y + (th >> 1)) % th) * tw + ((x + (tw >> 1)) % tw);
      nr[j] = mix(tr[j], tr[k], w); ng[j] = mix(tg[j], tg[k], w); nb[j] = mix(tb[j], tb[k], w);
    }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var i = y * W + x, q = (y % th) * tw + (x % tw);
      S.r[i] = nr[q]; S.g[i] = ng[q]; S.b[i] = nb[q];
    }
    S.ov.push(function (c, w, h, d) {
      c.setLineDash([5 * d, 4 * d]); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = d;
      c.strokeRect(w / 3, 0.5, w / 3, h / 2); c.setLineDash([]);
    });
  }
  function draft(S, o) {
    var w = o.w || 200, h = Math.round(w * H / W);
    ['r', 'g', 'b'].forEach(function (k) { var lo = resample(blurPl(S[k], W, H, Math.max(1, W / w / 2)), W, H, 0, 0, W, H, w, h); S[k] = resample(lo, w, h, 0, 0, w, h, W, H); });
  }
  function scan(S) {
    for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x++) { var i = y * W + x; S.r[i] *= 0.86; S.g[i] *= 0.86; S.b[i] *= 0.86; }
  }
  function textOn(S, fn) { var cv = toCanvas(S), c = cv.getContext('2d'); fn(c); fromCanvas(S, cv); }
  function stamp(S) {
    textOn(S, function (c) {
      c.font = 'bold ' + Math.round(H * 0.048) + 'px "Courier New", Courier, monospace'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.shadowColor = 'rgba(255,90,0,0.9)'; c.shadowBlur = 6; c.fillStyle = '#ff9a3a';
      c.fillText("'26 10 15", W * 0.94, H * 0.93);
    });
  }
  function cctv(S) {
    textOn(S, function (c) {
      c.font = 'bold ' + Math.round(H * 0.036) + 'px "Courier New", Courier, monospace'; c.textBaseline = 'top';
      c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 2; c.fillStyle = 'rgba(255,255,255,0.9)';
      c.textAlign = 'left'; c.fillText('CAM 03', W * 0.04, H * 0.05);
      c.textAlign = 'right'; c.fillText('2026-10-15  03:14:27', W * 0.96, H * 0.05);
      c.textAlign = 'left'; c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(W * 0.05, H * 0.92, H * 0.012, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillText('REC', W * 0.07, H * 0.9);
    });
  }
  function bigText(S, o) {
    textOn(S, function (c) {
      var fs = 90, fam = 'Impact, "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
      c.font = 'bold ' + fs + 'px ' + fam;
      var tw = c.measureText(o.t).width; fs = Math.floor(fs * Math.min(1.4, W * 0.88 / Math.max(1, tw)));
      c.font = 'bold ' + fs + 'px ' + fam; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = 'rgba(60,20,0,0.35)'; c.shadowBlur = 10; c.fillStyle = '#fff1dc';
      c.fillText(o.t, W / 2, H * 0.15);
    });
  }

  // ================= painterly / graphic styles =================
  function kuwa(S, o) {
    var r = o.r || 4, sc = o.sc || 1, w = Math.round(W * sc), h = Math.round(H * sc), n = w * h;
    var R = sc === 1 ? S.r : resample(S.r, W, H, 0, 0, W, H, w, h), G = sc === 1 ? S.g : resample(S.g, W, H, 0, 0, W, H, w, h), B = sc === 1 ? S.b : resample(S.b, W, H, 0, 0, W, H, w, h);
    var w1 = w + 1, sz = w1 * (h + 1), ir = new Float64Array(sz), ig = new Float64Array(sz), ib = new Float64Array(sz), il = new Float64Array(sz), il2 = new Float64Array(sz), x, y;
    for (y = 0; y < h; y++) {
      var ar = 0, ag = 0, ab = 0, al = 0, al2 = 0;
      for (x = 0; x < w; x++) {
        var i = y * w + x, L = lum(R[i], G[i], B[i]);
        ar += R[i]; ag += G[i]; ab += B[i]; al += L; al2 += L * L;
        var j = (y + 1) * w1 + x + 1, u = j - w1;
        ir[j] = ir[u] + ar; ig[j] = ig[u] + ag; ib[j] = ib[u] + ab; il[j] = il[u] + al; il2[j] = il2[u] + al2;
      }
    }
    var orr = new Float32Array(n), og = new Float32Array(n), ob = new Float32Array(n);
    var qx0 = [0, 0, 0, 0], qx1 = [0, 0, 0, 0], qy0 = [0, 0, 0, 0], qy1 = [0, 0, 0, 0];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var xa = x - r < 0 ? 0 : x - r, xb = x + r > w - 1 ? w - 1 : x + r, ya = y - r < 0 ? 0 : y - r, yb = y + r > h - 1 ? h - 1 : y + r;
      qx0[0] = xa; qx1[0] = x; qy0[0] = ya; qy1[0] = y;
      qx0[1] = x; qx1[1] = xb; qy0[1] = ya; qy1[1] = y;
      qx0[2] = xa; qx1[2] = x; qy0[2] = y; qy1[2] = yb;
      qx0[3] = x; qx1[3] = xb; qy0[3] = y; qy1[3] = yb;
      var bv = 1e9, br = 0, bg = 0, bb = 0;
      for (var q = 0; q < 4; q++) {
        var A = qy0[q] * w1 + qx0[q], Bq = qy0[q] * w1 + qx1[q] + 1, C = (qy1[q] + 1) * w1 + qx0[q], D = (qy1[q] + 1) * w1 + qx1[q] + 1;
        var cnt = (qx1[q] - qx0[q] + 1) * (qy1[q] - qy0[q] + 1);
        var ml = (il[D] - il[Bq] - il[C] + il[A]) / cnt, v = (il2[D] - il2[Bq] - il2[C] + il2[A]) / cnt - ml * ml;
        if (v < bv) { bv = v; br = (ir[D] - ir[Bq] - ir[C] + ir[A]) / cnt; bg = (ig[D] - ig[Bq] - ig[C] + ig[A]) / cnt; bb = (ib[D] - ib[Bq] - ib[C] + ib[A]) / cnt; }
      }
      var k = y * w + x; orr[k] = br; og[k] = bg; ob[k] = bb;
    }
    if (sc === 1) { S.r = orr; S.g = og; S.b = ob; }
    else { S.r = resample(orr, w, h, 0, 0, w, h, W, H); S.g = resample(og, w, h, 0, 0, w, h, W, H); S.b = resample(ob, w, h, 0, 0, w, h, W, H); }
  }
  function inkPl(S, o) {
    var L = lumPl(S), g1 = blurPl(L, W, H, o.r1 || 1), g2 = blurPl(L, W, H, o.r2 || 2), p = P(), t0 = o.t0 || 0.006, t1 = o.t1 || 0.03;
    for (var i = 0; i < N; i++) p[i] = ss(t0, t1, g2[i] - g1[i]);
    return p;
  }
  function ink(S, o) {
    var p = inkPl(S, o), c = hexc(o.c || '#151515'), k = o.k == null ? 1 : o.k, dx = o.dx || 0, dy = o.dy || 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, sx = x - dx, sy = y - dy;
      var a = (dx || dy) ? ((sx >= 0 && sy >= 0 && sx < W && sy < H) ? p[sy * W + sx] : 0) : p[i];
      a *= k; if (a <= 0.001) continue;
      S.r[i] = mix(S.r[i], c[0], a); S.g[i] = mix(S.g[i], c[1], a); S.b[i] = mix(S.b[i], c[2], a);
    }
  }
  function paper(S, o) {
    var p = paperPl(), k = o.k == null ? 0.12 : o.k, col = o.col ? hexc(o.col) : null, ct = o.tint == null ? 0.5 : o.tint;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, f = 1 - k + k * (p[i] + 0.45);
      if (o.canvas) f *= 1 + 0.03 * Math.sin(x * 1.7) * Math.sin(y * 1.7);
      var r = S.r[i] * f, g = S.g[i] * f, b = S.b[i] * f;
      if (col) { var L = lum(r, g, b), w = L * ct; r = mix(r, r * col[0] / 0.95, w); g = mix(g, g * col[1] / 0.95, w); b = mix(b, b * col[2] / 0.95, w); }
      S.r[i] = cl(r); S.g[i] = cl(g); S.b[i] = cl(b);
    }
  }
  function flowAngle(Lb, i) {
    var gx = Lb[i + 1] - Lb[i - 1], gy = Lb[i + W] - Lb[i - W];
    return { a: Math.atan2(gy, gx) + Math.PI / 2, m: Math.sqrt(gx * gx + gy * gy) };
  }
  function strokes(S, o) {
    var base = blurRGB(S, o.br || 2), Lb = blurPl(lumPl(S), W, H, o.fr || 4), rnd = rng(o.seed || 3), step = o.step || 6, pts = [], x, y, i;
    for (y = step / 2; y < H; y += step) for (x = step / 2; x < W; x += step) pts.push(x + (rnd() - 0.5) * step, y + (rnd() - 0.5) * step);
    var np = pts.length / 2, order = new Uint32Array(np);
    for (i = 0; i < np; i++) order[i] = i;
    for (i = np - 1; i > 0; i--) { var j = (rnd() * (i + 1)) | 0, tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
    var bs = { r: base.r, g: base.g, b: base.b }, cv = toCanvas(bs), c = cv.getContext('2d'), sat = o.sat || 1, jit = o.jit || 0.08;
    c.lineCap = 'round';
    for (var q = 0; q < np; q++) {
      var px = pts[order[q] * 2], py = pts[order[q] * 2 + 1];
      var xi = Math.max(1, Math.min(W - 2, px | 0)), yi = Math.max(1, Math.min(H - 2, py | 0)), k = yi * W + xi;
      var fl = flowAngle(Lb, k), ang = fl.m < 0.002 ? (o.def == null ? 0.8 : o.def) : fl.a;
      if (o.ang != null) ang = o.ang;
      ang += (rnd() - 0.5) * (o.aj == null ? 0.4 : o.aj);
      var r = base.r[k], g = base.g[k], b = base.b[k], L = lum(r, g, b), v = (rnd() - 0.5) * jit;
      r = L + (r - L) * sat + v + (rnd() - 0.5) * jit * 0.6; g = L + (g - L) * sat + v + (rnd() - 0.5) * jit * 0.6; b = L + (b - L) * sat + v + (rnd() - 0.5) * jit * 0.6;
      var len = o.len * (0.7 + rnd() * 0.6) / (1 + fl.m * (o.edge || 25)), dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      c.strokeStyle = rgbs([r, g, b]); c.lineWidth = o.wid * (0.8 + rnd() * 0.4);
      c.beginPath(); c.moveTo(px - dx, py - dy); c.lineTo(px + dx, py + dy); c.stroke();
    }
    fromCanvas(S, cv);
  }
  function dots(S, o) {
    var base = blurRGB(S, 2), rnd = rng(13), step = o.step || 4.5, cv = mkCanvas(W, H), c = cv.getContext('2d'), hsv = [0, 0, 0], rgb = [0, 0, 0];
    c.fillStyle = '#f2eee2'; c.fillRect(0, 0, W, H);
    for (var pass = 0; pass < 2; pass++) for (var y = step / 2; y < H; y += step) for (var x = step / 2; x < W; x += step) {
      var px = x + (rnd() - 0.5) * step, py = y + (rnd() - 0.5) * step, k = Math.min(H - 1, py | 0) * W + Math.min(W - 1, Math.max(0, px | 0));
      rgb2hsv(base.r[k], base.g[k], base.b[k], hsv);
      hsv2rgb(hsv[0] + (rnd() - 0.5) * 0.12, Math.min(1, hsv[1] * 1.6 + 0.1), Math.min(1, hsv[2] * (0.9 + rnd() * 0.25)), rgb);
      c.fillStyle = rgbs(rgb); c.beginPath(); c.arc(px, py, (o.rad || 2.3) * (0.8 + rnd() * 0.5) * (pass ? 0.8 : 1), 0, 6.2832); c.fill();
    }
    fromCanvas(S, cv);
  }
  var VC = {};
  function vor(cell, seed) {
    var key = cell + '|' + seed;
    if (VC[key]) return VC[key];
    var gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1, rnd = rng(seed), sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh), i, j;
    for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) { var k = j * gw + i; sx[k] = (i + 0.1 + rnd() * 0.8) * cell; sy[k] = (j + 0.1 + rnd() * 0.8) * cell; }
    var id = new Int32Array(N), d1 = P(), d2 = P();
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var ci = (x / cell) | 0, cj = (y / cell) | 0, b1 = 1e12, b2 = 1e12, bid = 0;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
        var ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
        var q = jj * gw + ii, ddx = x - sx[q], ddy = y - sy[q], d = ddx * ddx + ddy * ddy;
        if (d < b1) { b2 = b1; b1 = d; bid = q; } else if (d < b2) b2 = d;
      }
      var p = y * W + x; id[p] = bid; d1[p] = Math.sqrt(b1); d2[p] = Math.sqrt(b2);
    }
    VC[key] = { id: id, d1: d1, d2: d2, sx: sx, sy: sy, n: gw * gh };
    return VC[key];
  }
  function cellAvg(S, v) {
    var n = v.n, ar = new Float32Array(n), ag = new Float32Array(n), ab = new Float32Array(n), cn = new Float32Array(n), i;
    for (i = 0; i < N; i++) { var k = v.id[i]; ar[k] += S.r[i]; ag[k] += S.g[i]; ab[k] += S.b[i]; cn[k]++; }
    for (i = 0; i < n; i++) if (cn[i]) { ar[i] /= cn[i]; ag[i] /= cn[i]; ab[i] /= cn[i]; }
    return { r: ar, g: ag, b: ab };
  }
  function glass(S, o) {
    var cell = o.cell || 22, v = vor(cell, 7), a = cellAvg(S, v), nz = noisePl(5, 3, 111), nz2 = noisePl(30, 2, 112), hsv = [0, 0, 0], rgb = [0, 0, 0];
    for (var i = 0; i < N; i++) {
      var k = v.id[i];
      rgb2hsv(a.r[k], a.g[k], a.b[k], hsv);
      hsv2rgb(hsv[0], Math.min(1, hsv[1] * 1.7 + 0.12), Math.min(1, hsv[2] * 1.12 + 0.05), rgb);
      var f = (0.82 + 0.3 * nz[i] + 0.12 * nz2[i]) * (1.12 - 0.3 * v.d1[i] / cell), lead = 1 - ss(1.2, 2.8, v.d2[i] - v.d1[i]);
      S.r[i] = mix(rgb[0] * f, 0.07, lead); S.g[i] = mix(rgb[1] * f, 0.065, lead); S.b[i] = mix(rgb[2] * f, 0.06, lead);
    }
    bloom(S, { th: 0.75, r: 6, k: 0.3 });
  }
  function cubism(S) {
    kuwa(S, { r: 3, sc: 0.5 });
    var cell = 64, v = vor(cell, 11), c = snapshot(S), rnd = rng(12), n = v.n, off = new Float32Array(n * 4), i;
    for (i = 0; i < n; i++) { off[i * 4] = (rnd() - 0.5) * cell * 0.55; off[i * 4 + 1] = (rnd() - 0.5) * cell * 0.55; off[i * 4 + 2] = 1 + (rnd() - 0.5) * 0.25; off[i * 4 + 3] = rnd() * 6.28; }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      i = y * W + x; var k = v.id[i], cx = v.sx[k], cy = v.sy[k], s = off[k * 4 + 2], an = off[k * 4 + 3];
      var sx = cx + (x - cx) * s + off[k * 4], sy = cy + (y - cy) * s + off[k * 4 + 1];
      var sh = 1 + 0.2 * ((x - cx) * Math.cos(an) + (y - cy) * Math.sin(an)) / cell;
      S.r[i] = samp(c.r, W, H, sx, sy) * sh; S.g[i] = samp(c.g, W, H, sx, sy) * sh; S.b[i] = samp(c.b, W, H, sx, sy) * sh;
      var e = 1 - ss(1, 2.4, v.d2[i] - v.d1[i]);
      if (e > 0) { S.r[i] = mix(S.r[i], 0.16, e * 0.85); S.g[i] = mix(S.g[i], 0.14, e * 0.85); S.b[i] = mix(S.b[i], 0.12, e * 0.85); }
    }
    gmap(S, { stops: [[0, '#2b2622'], [0.35, '#6b5a45'], [0.6, '#a88e64'], [0.8, '#cdbb94'], [1, '#ece2c8']], amt: 0.62 });
    paper(S, { k: 0.1, canvas: 1 });
  }
  function mosaic(S, o) {
    var t = o.t || 11, b = blurRGB(S, 3), rnd = rng(17), nz = gnoise(false), x, y;
    var gw = Math.ceil(W / t) + 2, gh = Math.ceil(H / t) + 1, var1 = new Float32Array(gw * gh);
    for (var q = 0; q < gw * gh; q++) var1[q] = 0.92 + rnd() * 0.16;
    for (y = 0; y < H; y++) {
      var row = (y / t) | 0, shift = (row % 2) * t * 0.5, v = (y - row * t) / t;
      for (x = 0; x < W; x++) {
        var xx = x + shift, col = (xx / t) | 0, u = (xx - col * t) / t, i = y * W + x;
        var cx = Math.min(W - 1, Math.max(0, (col + 0.5) * t - shift)), cy = Math.min(H - 1, (row + 0.5) * t);
        var k = (cy | 0) * W + (cx | 0), f = var1[row * gw + col] * (1 + 0.08 * (0.5 - u) + 0.08 * (0.5 - v)) + nz[i] * 0.025;
        var e = Math.min(u, 1 - u, v, 1 - v) * t, g = 1 - ss(0.6, 1.6, e);
        S.r[i] = mix(b.r[k] * f, 0.84, g); S.g[i] = mix(b.g[k] * f, 0.81, g); S.b[i] = mix(b.b[k] * f, 0.76, g);
      }
    }
  }
  function lowpoly(S, o) {
    var cell = o.cell || 24, rnd = rng(17), gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1, px = [], py = [], i, j;
    for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) {
      var jx = (i > 0 && i < gw - 1) ? (rnd() - 0.5) * cell * 0.8 : 0, jy = (j > 0 && j < gh - 1) ? (rnd() - 0.5) * cell * 0.8 : 0;
      px.push(Math.min(W, i * cell + jx)); py.push(Math.min(H, j * cell + jy));
    }
    var b = blurRGB(S, 3), cv = mkCanvas(W, H), c = cv.getContext('2d');
    function tri(a, bq, cq) {
      var mx = (px[a] + px[bq] + px[cq]) / 3, my = (py[a] + py[bq] + py[cq]) / 3, k = Math.min(H - 1, my | 0) * W + Math.min(W - 1, mx | 0);
      var f = 0.95 + rnd() * 0.1, col = rgbs([b.r[k] * f, b.g[k] * f, b.b[k] * f]);
      c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(px[a], py[a]); c.lineTo(px[bq], py[bq]); c.lineTo(px[cq], py[cq]); c.closePath(); c.fill(); c.stroke();
    }
    for (j = 0; j < gh - 1; j++) for (i = 0; i < gw - 1; i++) {
      var p0 = j * gw + i, p1 = p0 + 1, p2 = p0 + gw, p3 = p2 + 1;
      if ((i + j) % 2) { tri(p0, p1, p2); tri(p1, p3, p2); } else { tri(p0, p1, p3); tri(p0, p3, p2); }
    }
    fromCanvas(S, cv);
  }
  function pixel(S, o) {
    var pw = o.w || 128, ph = Math.round(pw * H / W), rad = Math.max(1, W / pw / 2);
    var R = resample(blurPl(S.r, W, H, rad), W, H, 0, 0, W, H, pw, ph), G = resample(blurPl(S.g, W, H, rad), W, H, 0, 0, W, H, pw, ph), B = resample(blurPl(S.b, W, H, rad), W, H, 0, 0, W, H, pw, ph);
    var pal = kmeans(R, G, B, pw * ph, o.k || 16, 8, 5), bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], idx = new Uint8Array(pw * ph);
    for (var y = 0; y < ph; y++) for (var x = 0; x < pw; x++) {
      var i = y * pw + x, d = (bay[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 0.06, r = R[i] + d, g = G[i] + d, b = B[i] + d, best = 0, bd = 1e9;
      for (var k = 0; k < pal.length; k++) { var q = pal[k], dr = r - q[0], dg = g - q[1], db = b - q[2], dd = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (dd < bd) { bd = dd; best = k; } }
      idx[i] = best;
    }
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      var c = pal[idx[Math.min(ph - 1, (yy * ph / H) | 0) * pw + Math.min(pw - 1, (xx * pw / W) | 0)]], j = yy * W + xx;
      S.r[j] = c[0]; S.g[j] = c[1]; S.b[j] = c[2];
    }
  }
  function halftone(S, o) {
    var sp = o.sp || 6, an = (o.ang == null ? 45 : o.ang) * Math.PI / 180, ca = Math.cos(an), sa = Math.sin(an), Lb = blurPl(lumPl(S), W, H, 2);
    var col = hexc(o.c || '#111111'), k = o.k == null ? 0.8 : o.k, lo = o.lo == null ? 0.15 : o.lo, hi = o.hi == null ? 0.85 : o.hi;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, D = 1 - Lb[i]; if (D < 1 - hi) continue;
      var u = x * ca + y * sa, v = -x * sa + y * ca, du = u - (Math.floor(u / sp) + 0.5) * sp, dv = v - (Math.floor(v / sp) + 0.5) * sp;
      var dist = Math.sqrt(du * du + dv * dv), rad = sp * 0.5 * Math.sqrt(cl((D - lo) / (1 - lo))) * 1.25;
      var a = (1 - ss(rad - 0.7, rad + 0.7, dist)) * k; if (a <= 0) continue;
      S.r[i] = mix(S.r[i], col[0], a); S.g[i] = mix(S.g[i], col[1], a); S.b[i] = mix(S.b[i], col[2], a);
    }
  }
  function celShade(S, lv, vals) {
    for (var i = 0; i < N; i++) {
      var L = lum(S.r[i], S.g[i], S.b[i]), t = vals[0];
      for (var j = 0; j < lv.length; j++) if (L > lv[j]) t = vals[j + 1];
      var k = L > 0.01 ? t / L : 0;
      S.r[i] = cl(S.r[i] * k); S.g[i] = cl(S.g[i] * k); S.b[i] = cl(S.b[i] * k);
    }
  }
  function cel(S) {
    blurmix(S, { r: 2, k: 0.4 });
    kuwa(S, { r: 3, sc: 0.5 });
    var lines = inkPl(S, { r1: 1, r2: 2, t0: 0.008, t1: 0.026 });
    celShade(S, [0.3, 0.6], [0.42, 0.72, 0.97]);
    grade(S, { sat: 1.3, con: 0.05 });
    for (var i = 0; i < N; i++) { var a = lines[i] * 0.9; S.r[i] = mix(S.r[i], 0.17, a); S.g[i] = mix(S.g[i], 0.11, a); S.b[i] = mix(S.b[i], 0.11, a); }
  }
  function comic(S) {
    kuwa(S, { r: 3, sc: 0.5 });
    var lines = inkPl(S, { r1: 1, r2: 3, t0: 0.006, t1: 0.022 });
    celShade(S, [0.25, 0.5, 0.75], [0.25, 0.52, 0.78, 0.98]);
    grade(S, { sat: 1.5, con: 0.12 });
    halftone(S, { sp: 6, ang: 45, c: '#1a1a1a', k: 0.55, lo: 0.25, hi: 0.75 });
    for (var i = 0; i < N; i++) { var a = lines[i]; S.r[i] = mix(S.r[i], 0.05, a); S.g[i] = mix(S.g[i], 0.05, a); S.b[i] = mix(S.b[i], 0.06, a); }
  }
  function popart(S) {
    var pal = [['#ff3fa4', '#2b1a6b', '#ff8a00', '#ffe14d'], ['#29c5f6', '#c2185b', '#ffd600', '#fff3e0'], ['#ffe600', '#0047ab', '#ff4f79', '#ffffff'], ['#7cff4f', '#6a1b9a', '#ff6d00', '#ffd1e8']].map(function (p) { return p.map(hexc); });
    var L = blurPl(lumPl(S), W, H, 1), ln = inkPl(S, { r1: 1, r2: 2, t0: 0.008, t1: 0.024 }), m = S.m, has = S.hasMask;
    var nr = P(), ng = P(), nb = P(), hw = W / 2, hh = Math.floor(H / 2);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var qx = x < hw ? 0 : 1, qy = y < hh ? 0 : 1, q = qy * 2 + qx, ph = qy ? H - hh : hh;
      var sx = (x - qx * hw) * 2, sy = Math.min(H - 1, ((y - qy * hh) * H / ph) | 0), k = sy * W + Math.min(W - 1, sx);
      var lv = L[k], c = pal[q], col = has && m[k] < 0.5 ? c[0] : (lv < 0.36 ? c[1] : lv < 0.64 ? c[2] : c[3]);
      if (ln[k] > 0.45) col = [0.06, 0.05, 0.08];
      var i = y * W + x; nr[i] = col[0]; ng[i] = col[1]; nb[i] = col[2];
    }
    S.r = nr; S.g = ng; S.b = nb;
  }
  function lineart(S) {
    kuwa(S, { r: 3, sc: 0.5 });
    var p = inkPl(S, { r1: 1, r2: 2, t0: 0.006, t1: 0.016 });
    for (var i = 0; i < N; i++) { var a = p[i]; S.r[i] = mix(0.985, 0.07, a); S.g[i] = mix(0.98, 0.07, a); S.b[i] = mix(0.965, 0.08, a); }
  }
  function pencil(S) {
    var L = blurPl(lumPl(S), W, H, 1), inv = P(), i;
    for (i = 0; i < N; i++) inv[i] = 1 - L[i];
    var bi = blurPl(inv, W, H, 7), hn = noisePl(1.4, 1, 121, 0.12, 1);
    var pp = paperPl();
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      i = y * W + x;
      var v = cl(L[i] / Math.max(0.03, 1 - bi[i]));
      v = Math.pow(v, 2.2);
      var hatch = 0.5 + 0.5 * Math.sin((x + y) * 0.9 + hn[i] * 8), tone = (1 - L[i]) * 0.38 * (0.5 + hatch);
      v = cl(v - tone * 0.7) * (0.93 + 0.07 * pp[i]);
      S.r[i] = v * 0.97; S.g[i] = v * 0.97; S.b[i] = Math.min(1, v * 0.985 + 0.01);
    }
  }
  function charcoal(S) {
    var L = lumPl(S), sm = blurPl(L, W, H, 4, 2), tooth = gnoise(true), lines = inkPl(S, { r1: 1, r2: 3, t0: 0.006, t1: 0.03 }), pp = paperPl();
    for (var i = 0; i < N; i++) {
      var d = 1 - Math.pow(cl((sm[i] - 0.12) / 0.8), 0.9), mid = 1 - Math.abs(2 * d - 1);
      d = cl(d + tooth[i] * 0.22 * mid + lines[i] * 0.75);
      var v = (1 - d * 0.92) * (0.9 + 0.1 * pp[i]);
      S.r[i] = v * 0.93; S.g[i] = v * 0.915; S.b[i] = v * 0.89;
    }
  }
  function inkwash(S) {
    var L = blurPl(lumPl(S), W, H, 2), nz = noisePl(25, 3, 131), lines = inkPl(S, { r1: 1, r2: 2, t0: 0.008, t1: 0.03 }), pp = paperPl(), q = P(), i;
    for (i = 0; i < N; i++) { var t = Math.pow(1 - L[i], 1.35) + (nz[i] - 0.5) * 0.12, qq = Math.round(t * 3.5) / 3.5; q[i] = cl(mix(t, qq, 0.65)); }
    var qb = blurPl(q, W, H, 2);
    for (i = 0; i < N; i++) {
      var edge = cl(Math.abs(q[i] - qb[i]) * 3) * 0.35, ink2 = cl(q[i] * 0.92 + edge + lines[i] * 0.6);
      var p = 0.92 + 0.08 * pp[i];
      S.r[i] = mix(0.945, 0.1, ink2) * p; S.g[i] = mix(0.925, 0.095, ink2) * p; S.b[i] = mix(0.88, 0.09, ink2) * p;
    }
  }
  function warpNoise(S, o) {
    var a = noisePl(o.sc || 30, 2, (o.seed || 4)), b = noisePl(o.sc || 30, 2, (o.seed || 4) + 50), amp = o.amp || 3;
    warp(S, function (x, y, out) { var i = y * W + x; out[0] = x + (a[i] - 0.5) * 2 * amp; out[1] = y + (b[i] - 0.5) * 2 * amp; });
  }
  function watercolor(S) {
    kuwa(S, { r: 3, sc: 0.5 });
    warpNoise(S, { amp: 3, sc: 28, seed: 4 });
    var b = blurRGB(S, 4), gn = noisePl(6, 3, 8), pp = paperPl(), bn = noisePl(30, 3, 141), pc = [0.98, 0.965, 0.93], i;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      i = y * W + x;
      var r = S.r[i], g = S.g[i], bb = S.b[i];
      var er = r + 0.6 * (r - b.r[i]), eg = g + 0.6 * (g - b.g[i]), eb = bb + 0.6 * (bb - b.b[i]);
      r = Math.min(r, er) * 0.75 + r * 0.25; g = Math.min(g, eg) * 0.75 + g * 0.25; bb = Math.min(bb, eb) * 0.75 + bb * 0.25;
      var L = lum(r, g, bb), f = 1 - 0.22 * (1 - L) * (gn[i] - 0.5) * 2;
      r = 1 - (1 - r * f) * 0.86; g = 1 - (1 - g * f) * 0.86; bb = 1 - (1 - bb * f) * 0.86;
      var p = 0.9 + 0.1 * pp[i], wh = ss(0.8, 0.92, L) * 0.75;
      r = mix(r * p, pc[0], wh); g = mix(g * p, pc[1], wh); bb = mix(bb * p, pc[2], wh);
      var e = Math.min(x, W - 1 - x, y, H - 1 - y) / (0.08 * W) + (bn[i] - 0.5) * 1.1, bo = 1 - ss(0.15, 0.9, e);
      S.r[i] = cl(mix(r, pc[0], bo)); S.g[i] = cl(mix(g, pc[1], bo)); S.b[i] = cl(mix(bb, pc[2], bo));
    }
    grade(S, { sat: 1.12 });
  }
  function relief(S, o) {
    var L = lumPl(S), Lb = blurPl(L, W, H, 4), h = P(), k = o.k || 0.3, sc = o.len || 8, x, y, i;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x;
      var a = flowAngle(Lb, i).a, ca2 = Math.cos(a), sa2 = Math.sin(a);
      h[i] = vnoise((x * ca2 + y * sa2) / sc, (-x * sa2 + y * ca2) / 1.6, 13) * 0.6 + L[i] * 0.4;
    }
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x; var f = 1 + k * (h[i - W - 1] - h[i + W + 1]) * 2.2;
      S.r[i] = cl(S.r[i] * f); S.g[i] = cl(S.g[i] * f); S.b[i] = cl(S.b[i] * f);
    }
  }
  function oil(S) {
    kuwa(S, { r: 5, sc: 0.5 });
    kuwa(S, { r: 2, sc: 1 });
    relief(S, { k: 0.5, len: 10 });
    grade(S, { sat: 1.12, con: 0.08, temp: 0.05 });
    paper(S, { k: 0.06, canvas: 1 });
  }
  function gouache(S) {
    kuwa(S, { r: 3, sc: 0.5 });
    poster(S, { n: 8, soft: 0.25 });
    grade(S, { lift: 0.03, sat: 1.08, con: 0.06 });
    ink(S, { r1: 1, r2: 3, c: '#3a3028', k: 0.25 });
    relief(S, { k: 0.12, len: 6 });
    paper(S, { k: 0.14 });
  }
  function wave(S, o) {
    var amp = o.amp || 5, nz = noisePl(60, 2, 151);
    warp(S, function (x, y, out) { var n = nz[y * W + x]; out[0] = x + amp * Math.sin(y * 0.025 + n * 5); out[1] = y + amp * 0.6 * Math.sin(x * 0.02 + n * 4); });
  }
  function crack(S, o) {
    var v = vor(26, 5), v2 = vor(9, 6), nz = noisePl(15, 2, 161), kk = (o && o.k) || 1;
    for (var i = 0; i < N; i++) {
      var a = (1 - ss(0.4, 1.3, v.d2[i] - v.d1[i])) * 0.28 + (1 - ss(0.3, 0.9, v2.d2[i] - v2.d1[i])) * 0.1 * nz[i];
      var f = 1 - a * kk; S.r[i] *= f; S.g[i] *= f; S.b[i] *= f;
    }
  }
  function ukiyo(S) {
    kuwa(S, { r: 4, sc: 0.5 });
    palMap(S, ['#1f3a5f', '#3d5a80', '#8fb3c9', '#e9dcc0', '#d8c7a0', '#c8553d', '#d9a441', '#6b7f4b', '#4a5a36', '#2b2b2b', '#7a5c3e'], 0.88);
    ink(S, { r1: 1, r2: 2, c: '#26221c', k: 0.85, t0: 0.006, t1: 0.03 });
    for (var y = 0; y < H * 0.22; y++) {
      var a = (1 - y / (H * 0.22)) * 0.65;
      for (var x = 0; x < W; x++) { var i = y * W + x; S.r[i] = mix(S.r[i], S.r[i] * 0.3, a); S.g[i] = mix(S.g[i], S.g[i] * 0.48, a); S.b[i] = mix(S.b[i], S.b[i] * 0.78, a); }
    }
    paper(S, { k: 0.16, col: '#efe3c6', tint: 0.4 });
  }
  function woodblock(S) {
    kuwa(S, { r: 4, sc: 0.5 });
    var pal = kpal(S, 6, 0.85);
    palMap(S, pal, 1);
    grade(S, { temp: 0.08, con: 0.05 });
    var gn = noisePl(200, 3, 171, 0.15, 1);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, gr = 0.5 + 0.5 * Math.sin(y * 0.16 + gn[i] * 30), f = 0.9 + 0.1 * gr;
      S.r[i] *= f; S.g[i] *= f; S.b[i] *= f;
    }
    ink(S, { r1: 1, r2: 3, c: '#2a2420', k: 0.9, dx: 2, dy: 1 });
    paper(S, { k: 0.15, col: '#eadfc8', tint: 0.4 });
  }
  function linocut(S) {
    var L = blurPl(lumPl(S), W, H, 1), nz = noisePl(40, 2, 181), pp = paperPl();
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, l = cl((L[i] - 0.12) / 0.78);
      var s = 0.5 + 0.5 * Math.sin(y * 0.62 + 4 * Math.sin(x * 0.018) + nz[i] * 7), a = ss(l - 0.07, l + 0.07, s);
      if (l < 0.12) a = 1; else if (l > 0.9) a = 0;
      var p = 0.94 + 0.06 * pp[i];
      S.r[i] = mix(0.945, 0.085, a) * p; S.g[i] = mix(0.91, 0.075, a) * p; S.b[i] = mix(0.84, 0.065, a) * p;
    }
  }
  function blueprint(S) {
    var Lb = blurPl(lumPl(S), W, H, 1), mb = blurPl(S.m, W, H, 1), e = P(), mx = 0.0001, x, y, i;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x; var gx = Lb[i + 1] - Lb[i - 1], gy = Lb[i + W] - Lb[i - W]; e[i] = Math.sqrt(gx * gx + gy * gy); if (e[i] > mx) mx = e[i];
    }
    var nz = noisePl(30, 3, 191);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var ln = Math.max(ss(0.12, 0.35, e[i] / mx), cl(Math.abs(S.m[i] - mb[i]) * 7));
      var g = (x % 16 === 0 || y % 16 === 0) ? 0.1 : 0, G2 = (x % 80 === 0 || y % 80 === 0) ? 0.18 : 0, gg = Math.max(g, G2), f = 0.92 + 0.12 * nz[i];
      var r = 0.06 * f, gC = 0.24 * f, b = 0.45 * f;
      r = mix(r, 0.6, gg); gC = mix(gC, 0.76, gg); b = mix(b, 1, gg);
      S.r[i] = mix(r, 0.9, ln); S.g[i] = mix(gC, 0.95, ln); S.b[i] = mix(b, 1, ln);
    }
    textOn(S, function (c) {
      c.strokeStyle = 'rgba(230,240,255,0.85)'; c.fillStyle = 'rgba(230,240,255,0.9)'; c.lineWidth = 1;
      c.font = '12px "Courier New", Courier, monospace'; c.textAlign = 'center';
      var x0 = X(S, 0.13), x1 = X(S, 0.386), yy = Y(S, 0.45);
      c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.moveTo(x0, yy - 5); c.lineTo(x0, yy + 5); c.moveTo(x1, yy - 5); c.lineTo(x1, yy + 5); c.stroke();
      c.fillText('Ø 92', (x0 + x1) / 2, yy - 6);
      var xr = X(S, 0.52), y0 = Y(S, 0.497), y1 = Y(S, 0.867);
      c.beginPath(); c.moveTo(xr, y0); c.lineTo(xr, y1); c.moveTo(xr - 5, y0); c.lineTo(xr + 5, y0); c.moveTo(xr - 5, y1); c.lineTo(xr + 5, y1); c.stroke();
      c.save(); c.translate(xr + 14, (y0 + y1) / 2); c.rotate(-Math.PI / 2); c.fillText('H 98', 0, 0); c.restore();
      c.setLineDash([10, 4, 2, 4]); var xc = X(S, 0.258);
      c.beginPath(); c.moveTo(xc, Y(S, 0.43)); c.lineTo(xc, Y(S, 0.92)); c.stroke(); c.setLineDash([]);
      c.strokeRect(W - 190, H - 58, 170, 38); c.beginPath(); c.moveTo(W - 190, H - 39); c.lineTo(W - 20, H - 39); c.stroke();
      c.textAlign = 'left'; c.fillText('MUG-01', W - 182, H - 44); c.fillText('SCALE 1:2', W - 182, H - 25);
    });
  }
  function flatvec(S) {
    kuwa(S, { r: 4, sc: 0.5 });
    var pal = kpal(S, 8, 1.2);
    palMap(S, pal, 1);
  }
  function normalsShade(S, h, o) {
    var lx = -0.45, ly = -0.55, lz = 0.7, ll = Math.sqrt(lx * lx + ly * ly + lz * lz); lx /= ll; ly /= ll; lz /= ll;
    var hx = lx, hy = ly, hz = lz + 1, hl = Math.sqrt(hx * hx + hy * hy + hz * hz); hx /= hl; hy /= hl; hz /= hl;
    var st = o.st || 6, sp = o.sp || 0, pw = o.pw || 40, df = o.df == null ? 0.38 : o.df, base = o.base == null ? 0.72 : o.base;
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      var i = y * W + x, nx = (h[i - 1] - h[i + 1]) * st, ny = (h[i - W] - h[i + W]) * st, nz = 1, nl = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= nl; ny /= nl; nz /= nl;
      var d = Math.max(0, nx * lx + ny * ly + nz * lz), s = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), pw) * sp * (o.subjOnly ? S.m[i] : 1);
      var f = base + df * d;
      S.r[i] = cl(S.r[i] * f + s); S.g[i] = cl(S.g[i] * f + s); S.b[i] = cl(S.b[i] * f + s);
      if (o.sss) { var w = S.m[i] * (1 - d) * 0.12; S.r[i] = cl(S.r[i] + w); S.g[i] = cl(S.g[i] + w * 0.25); }
    }
  }
  function r3d(S) {
    kuwa(S, { r: 3, sc: 0.5 });
    blurmix(S, { r: 2, k: 0.5 });
    var h = blurPl(lumPl(S), W, H, 5), ao = blurPl(S.m, W, H, 12);
    normalsShade(S, h, { st: 7, sp: 0.5, pw: 48, sss: 1, subjOnly: 1 });
    for (var i = 0; i < N; i++) { var a = ao[i] * (1 - S.m[i]) * 0.35; S.r[i] *= 1 - a; S.g[i] *= 1 - a; S.b[i] *= 1 - a; }
    grade(S, { reg: 'B', sat: 0.7, exp: -0.1 });
    grade(S, { con: 0.1, sat: 1.1 });
  }
  function clay(S) {
    kuwa(S, { r: 5, sc: 0.5 });
    poster(S, { n: 7, soft: 0.3, lum: 1 });
    grade(S, { sat: 1.3, temp: 0.08 });
    var L = blurPl(lumPl(S), W, H, 6), nz = noisePl(9, 3, 201), h = P();
    for (var i = 0; i < N; i++) h[i] = L[i] * 1.2 + nz[i] * 0.35;
    normalsShade(S, h, { st: 9, sp: 0.1, pw: 10, df: 0.32, base: 0.8 });
  }
  function felt(S) {
    kuwa(S, { r: 4, sc: 0.5 });
    poster(S, { n: 6, soft: 0.2 });
    var f1 = noisePl(1.3, 2, 211, 1, 0.22), f2 = noisePl(1.3, 2, 212, 0.22, 1), g = gnoise(false);
    for (var i = 0; i < N; i++) { var f = 0.8 + 0.4 * (f1[i] + f2[i]) / 2 + g[i] * 0.03; S.r[i] = cl(S.r[i] * f); S.g[i] = cl(S.g[i] * f); S.b[i] = cl(S.b[i] * f); }
    blurmix(S, { r: 1, k: 0.35 });
    grade(S, { sat: 0.92, temp: 0.06, lift: 0.03 });
  }

  // ================= movement scenes / layouts =================
  function deco(S) {
    grade(S, { con: 0.25 });
    gmap(S, { stops: [[0, '#0b0a08'], [0.35, '#3a2c12'], [0.7, '#c9a227'], [1, '#f6e7b0']], amt: 0.92 });
    var vx = X(S, 0.52), vy = Y(S, 0.62);
    var rays = raster(function (c) {
      c.lineWidth = 2;
      for (var k = 0; k < 19; k++) { var a = Math.PI + (k + 0.5) / 19 * Math.PI; c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx + Math.cos(a) * W, vy + Math.sin(a) * W); c.stroke(); }
    }, 0);
    for (var i = 0; i < N; i++) { var a = rays[i] * S.sky[i] * 0.7; S.r[i] = mix(S.r[i], 0.78, a); S.g[i] = mix(S.g[i], 0.6, a); S.b[i] = mix(S.b[i], 0.2, a); }
    textOn(S, function (c) {
      c.strokeStyle = '#d4af37'; c.fillStyle = '#d4af37';
      c.lineWidth = 3; c.strokeRect(14, 14, W - 28, H - 28);
      c.lineWidth = 1; c.strokeRect(24, 24, W - 48, H - 48);
      [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H - 14, 1, -1], [W - 14, H - 14, -1, -1]].forEach(function (q) {
        for (var s = 0; s < 3; s++) { var d = 22 + s * 12; c.beginPath(); c.moveTo(q[0] + q[2] * d, q[1]); c.lineTo(q[0] + q[2] * d, q[1] + q[3] * d); c.lineTo(q[0], q[1] + q[3] * d); c.stroke(); }
      });
      c.beginPath(); c.moveTo(W / 2 - 30, 14); c.lineTo(W / 2, 40); c.lineTo(W / 2 + 30, 14); c.closePath(); c.fill();
    });
  }
  function bauhaus(S) {
    var L = lumPl(S);
    var bg = layer(function (c) {
      c.fillStyle = '#ece4d2'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#d62f1f'; c.beginPath(); c.arc(W * 0.6, H * 0.42, H * 0.36, 0, 6.2832); c.fill();
      c.fillStyle = '#1f4fa3'; c.fillRect(0, H * 0.62, W * 0.26, H * 0.38);
      c.fillStyle = '#f2b705'; c.beginPath(); c.moveTo(W * 0.8, H); c.lineTo(W, H * 0.56); c.lineTo(W, H); c.closePath(); c.fill();
      c.fillStyle = '#151515'; c.fillRect(W * 0.06, H * 0.08, W * 0.028, H * 0.5); c.fillRect(W * 0.06, H * 0.86, W * 0.88, H * 0.018);
    });
    for (var i = 0; i < N; i++) {
      var m = S.m[i], v = cl((L[i] - 0.2) * 1.5);
      v = v * v * (3 - 2 * v);
      S.r[i] = mix(bg.r[i], v * 0.96, m); S.g[i] = mix(bg.g[i], v * 0.94, m); S.b[i] = mix(bg.b[i], v * 0.9, m);
    }
  }
  function swiss(S) {
    grade(S, { mono: 1, con: 0.45, crush: 0.04 });
    var src = toCanvas(S), out = mkCanvas(W, H), c = out.getContext('2d');
    c.fillStyle = '#f1efe9'; c.fillRect(0, 0, W, H);
    var pw = W * 0.64, ph = H * 0.76, vx = X(S, 0.52);
    c.drawImage(src, Math.max(0, Math.min(W - pw, vx - pw / 2)), H * 0.12, pw, ph, W * 0.36, 0, pw, ph);
    c.fillStyle = '#e3242b'; c.fillRect(0, 0, W * 0.33, H * 0.44);
    c.fillStyle = '#111'; c.fillRect(0, H * 0.79, W, 3); c.fillRect(W * 0.33, H * 0.44, 1.5, H * 0.35);
    c.font = 'bold ' + Math.round(H * 0.17) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillText('stadt', W * 0.02, H * 0.975);
    c.font = Math.round(H * 0.026) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    c.fillText('1957', W * 0.36, H * 0.84);
    fromCanvas(S, out);
  }
  function synth(S) {
    grade(S, { exp: -0.7, sat: 0.6, con: 0.1 });
    gmap(S, { stops: [[0, '#0b0221'], [0.4, '#3b0f6b'], [0.75, '#c2188f'], [1, '#ffb3e6']], amt: 0.75 });
    sky(S, { stops: [[0, '#12002b'], [0.55, '#7a0f6e'], [0.85, '#ff4f8b'], [1, '#ffb347']], y0: 0, y1: 0.62, amt: 1 });
    var vx = X(S, 0.52), vy = Y(S, 0.62), r = H * 0.17, cy = Y(S, 0.47), i;
    var sun = raster(function (c) {
      c.beginPath(); c.arc(vx, cy, r, 0, 6.2832); c.fill();
      c.globalCompositeOperation = 'destination-out';
      for (var k = 0; k < 6; k++) c.fillRect(vx - r, cy + r * (0.08 + k * 0.16), 2 * r, 2 + k * 1.6);
    }, 1);
    for (var y = 0; y < H; y++) {
      var t = cl((y - (cy - r)) / (2 * r)), sr = 1, sg = mix(0.95, 0.24, t), sb = mix(0.45, 0.5, t);
      for (var x = 0; x < W; x++) { i = y * W + x; var a = sun[i] * S.sky[i]; if (a > 0) { S.r[i] = mix(S.r[i], sr, a); S.g[i] = mix(S.g[i], sg, a); S.b[i] = mix(S.b[i], sb, a); } }
    }
    var grid = raster(function (c) {
      c.lineWidth = 1.6;
      for (var k = -16; k <= 16; k++) { c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx + k * W * 0.11, H * 1.6); c.stroke(); }
      for (var z = 1; z < 40; z *= 1.32) { var yy = vy + (H - vy) / z; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
    }, 0);
    var gb = blurPl(grid, W, H, 3), Lb = blurPl(S.L0, W, H, 1), e = P(), x2, y2;
    for (y2 = 1; y2 < H - 1; y2++) for (x2 = 1; x2 < W - 1; x2++) { i = y2 * W + x2; var gx = Lb[i + 1] - Lb[i - 1], gy = Lb[i + W] - Lb[i - W]; e[i] = ss(0.04, 0.14, Math.sqrt(gx * gx + gy * gy)); }
    for (i = 0; i < N; i++) {
      var gw = (grid[i] * 0.9 + gb[i] * 0.9) * S.gnd[i], ed = e[i] * 0.55 * (1 - S.sky[i]) * (1 - S.gnd[i]);
      S.r[i] = cl(S.r[i] + gw * 1.0 + ed * 0.2); S.g[i] = cl(S.g[i] + gw * 0.25 + ed * 0.9); S.b[i] = cl(S.b[i] + gw * 0.85 + ed * 1.0);
    }
  }
  var SIGNS = [[0.30, 0.40, 0.022, 0.16, '255,40,200'], [0.36, 0.55, 0.05, 0.025, '0,240,255'], [0.72, 0.38, 0.018, 0.2, '0,240,255'], [0.80, 0.56, 0.06, 0.03, '255,60,160'], [0.655, 0.5, 0.012, 0.09, '255,220,60'], [0.12, 0.6, 0.08, 0.03, '0,255,170'], [0.9, 0.42, 0.02, 0.14, '255,40,120'], [0.445, 0.6, 0.016, 0.05, '160,90,255']];
  function cyber(S) {
    grade(S, { exp: -1.3, temp: -0.35, tint: 0.12, sat: 1.1, con: 0.15 });
    sky(S, { stops: [[0, '#070a1f'], [1, '#4a1a66']], y0: 0, y1: 0.62, amt: 0.95 });
    city(S, { win: 0.6, lamps: 0.5, wc: '#9fe8ff', lc: '120,220,255' });
    var L = layer(function (c) {
      c.globalCompositeOperation = 'lighter';
      SIGNS.forEach(function (s) {
        var x = X(S, s[0]), y = Y(S, s[1]), w = LX(S, s[2]), h = LY(S, s[3]);
        glow(c, x + w / 2, y + h / 2, Math.max(w, h) * 2.2, s[4], 0.5);
        c.fillStyle = 'rgba(' + s[4] + ',0.95)'; c.fillRect(x, y, w, h);
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6);
      });
    });
    screenL(S, L, 1);
    wet(S, { k: 0.55 });
    fog(S, { k: 0.18, c: '#4a2a6a' });
    bloom(S, { th: 0.6, r: 10, k: 0.5 });
  }
  function vapor(S) {
    bgFill(S, { stops: [[0, '#ff9ad5'], [0.5, '#b388ff'], [1, '#5ce1e6']], amt: 0.8, keep: 0.4 });
    gmap(S, { reg: 'S', stops: [[0, '#2d0a4e'], [0.45, '#ff4fa3'], [0.8, '#7df9ff'], [1, '#fff0fb']], amt: 0.55 });
    ca(S, { k: 0.006 });
    for (var y = 0; y < H; y += 3) for (var x = 0; x < W; x++) { var i = y * W + x; S.r[i] *= 0.93; S.g[i] *= 0.93; S.b[i] *= 0.93; }
    grain(S, { k: 0.03 });
  }
  function nouveau(S) {
    kuwa(S, { r: 3, sc: 0.5 });
    palMap(S, ['#2f2a24', '#5b4a3a', '#8c6d4f', '#c9a77c', '#e9dcc0', '#7f8f6a', '#b9725a', '#d9b98f', '#4f6158', '#a3ad8a'], 0.85);
    ink(S, { r1: 1, r2: 3, c: '#3a2a1e', k: 0.9, t0: 0.006, t1: 0.025 });
    bgFill(S, { c: '#d8cfae', amt: 0.55, keep: 0.5 });
    var cx = X(S, 0.515), cy = Y(S, 0.4);
    var halo = raster(function (c) { c.lineWidth = 3; [0.42, 0.46, 0.5].forEach(function (r) { c.beginPath(); c.arc(cx, cy, H * r, 0, 6.2832); c.stroke(); }); }, 0);
    for (var i = 0; i < N; i++) { var a = halo[i] * (1 - S.m[i]) * 0.9; S.r[i] = mix(S.r[i], 0.79, a); S.g[i] = mix(S.g[i], 0.64, a); S.b[i] = mix(S.b[i], 0.29, a); }
    var x0 = W * 0.1, x1 = W * 0.9, ecy = H * 0.32, rx = (x1 - x0) / 2, ry = H * 0.27;
    function path(c, gw) { c.beginPath(); c.moveTo(x0 - gw, H + 4); c.lineTo(x0 - gw, ecy); c.ellipse(W / 2, ecy, rx + gw, ry + gw, 0, Math.PI, 2 * Math.PI); c.lineTo(x1 + gw, H + 4); }
    var fr = layer(function (c) {
      c.fillStyle = '#2e2a22'; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-out'; path(c, 0); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over'; c.strokeStyle = '#c9a24a'; c.lineWidth = 3; path(c, -4); c.stroke(); c.lineWidth = 1.2; path(c, 6); c.stroke();
    }, 0);
    over(S, fr, 1);
    paper(S, { k: 0.1 });
  }
  function steamp(S) {
    gmap(S, { stops: [[0, '#1a120b'], [0.45, '#6e4a26'], [0.75, '#c08a45'], [1, '#f3dcb0']], amt: 0.78 });
    fog(S, { k: 0.35, c: '#b9a27f' });
    grade(S, { con: 0.2 });
    vign(S, { k: 0.55 });
    grain(S, { k: 0.05, big: 1 });
  }

  // ================= overlays (drawn crisp at display size) =================
  var GOLD_EYE = (function () {
    var x = 0, y = 0, w = 1.618034, h = 1;
    for (var k = 0; k < 24; k++) {
      var d = k % 4, s = Math.min(w, h);
      if (d === 0) { x += s; w -= s; } else if (d === 1) { y += s; h -= s; } else if (d === 2) { w -= s; } else { h -= s; }
    }
    return [(x + w / 2) / 1.618034, 1 - (y + h / 2)];
  })();
  function spiralPath(c, w, h) {
    var x = 0, y = 0, rw = 1.618034, rh = 1, sx = w / 1.618034;
    function P2(px, py) { return [px * sx, (1 - py) * h]; }
    c.beginPath();
    for (var k = 0; k < 10; k++) {
      var d = k % 4, s = Math.min(rw, rh), cx, cy, a0;
      if (d === 0) { cx = x + s; cy = y + s; a0 = Math.PI; x += s; rw -= s; }
      else if (d === 1) { cx = x; cy = y + s; a0 = 1.5 * Math.PI; y += s; rh -= s; }
      else if (d === 2) { cx = x + rw - s; cy = y; a0 = 0; rw -= s; }
      else { cx = x + s; cy = y + rh - s; a0 = 0.5 * Math.PI; rh -= s; }
      for (var t = 0; t <= 16; t++) {
        var a = a0 + (t / 16) * 0.5 * Math.PI, p = P2(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
        if (k === 0 && t === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]);
      }
    }
  }
  function inset(c, w, h, d, draw) {
    var bw = Math.min(w * 0.2, 128 * d), bh = bw * 0.62, x = w - bw - 8 * d, y = h - bh - 8 * d;
    c.save(); c.fillStyle = 'rgba(12,12,14,0.55)';
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, bw, bh, 6 * d); else c.rect(x, y, bw, bh);
    c.fill();
    c.translate(x, y); c.strokeStyle = 'rgba(255,255,255,0.92)'; c.fillStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 1.25 * d;
    draw(c, bw, bh); c.restore();
  }
  function ov(S, o) {
    var vx = X(S, 0.52) / W, vy = Y(S, 0.62) / H, rails = null;
    if (o.k === 'lead') {
      rails = [[0.388, 1, 0.523, 0.66], [0.603, 1, 0.523, 0.66], [0.0, 0.84, 0.5, 0.645], [1, 0.8, 0.545, 0.645]].map(function (q) {
        var x1 = X(S, q[0]) / W, y1 = Y(S, q[1]) / H, x2 = X(S, q[2]) / W, y2 = Y(S, q[3]) / H;
        return [x1, y1, x1 + (x2 - x1) * 0.88, y1 + (y2 - y1) * 0.88];
      });
    }
    S.ov.push(function (c, w, h, d) {
      c.save(); c.lineWidth = d; c.strokeStyle = 'rgba(255,255,255,0.72)'; c.fillStyle = 'rgba(255,255,255,0.9)';
      var k;
      if (o.k === 'thirds') {
        c.beginPath();
        for (k = 1; k < 3; k++) { c.moveTo(w * k / 3, 0); c.lineTo(w * k / 3, h); c.moveTo(0, h * k / 3); c.lineTo(w, h * k / 3); }
        c.stroke();
        if (o.pt) { c.lineWidth = 1.5 * d; c.beginPath(); c.arc(w * o.pt[0], h * o.pt[1], 7 * d, 0, 6.2832); c.stroke(); }
      } else if (o.k === 'center') {
        c.setLineDash([4 * d, 4 * d]); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
        c.setLineDash([]); c.strokeRect(w / 2 - 9 * d, h / 2 - 9 * d, 18 * d, 18 * d);
      } else if (o.k === 'sym') {
        c.setLineDash([6 * d, 5 * d]); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke(); c.setLineDash([]);
        [0.3, 0.7].forEach(function (yy) { c.beginPath(); c.moveTo(w / 2 - 14 * d, h * yy); c.lineTo(w / 2 - 5 * d, h * yy); c.moveTo(w / 2 + 5 * d, h * yy); c.lineTo(w / 2 + 14 * d, h * yy); c.stroke(); });
      } else if (o.k === 'vp') {
        var px = vx * w, py = vy * h;
        c.beginPath();
        [[0, 0], [w, 0], [0, h], [w, h], [0, h * 0.35], [w, h * 0.35], [w * 0.25, h], [w * 0.75, h]].forEach(function (q) { c.moveTo(px, py); c.lineTo(q[0], q[1]); });
        c.stroke();
        c.setLineDash([5 * d, 5 * d]); c.beginPath(); c.moveTo(0, py); c.lineTo(w, py); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.arc(px, py, 4.5 * d, 0, 6.2832); c.fill();
      } else if (o.k === 'lead') {
        c.strokeStyle = 'rgba(255,209,102,0.92)'; c.lineWidth = 3 * d; c.lineCap = 'round';
        rails.forEach(function (q) {
          c.beginPath(); c.moveTo(q[0] * w, q[1] * h); c.lineTo(q[2] * w, q[3] * h); c.stroke();
          var a = Math.atan2(q[3] - q[1], (q[2] - q[0]) * w / h), ax = q[2] * w, ay = q[3] * h, s = 9 * d;
          a = Math.atan2((q[3] - q[1]) * h, (q[2] - q[0]) * w);
          c.beginPath(); c.moveTo(ax - Math.cos(a - 0.45) * s, ay - Math.sin(a - 0.45) * s); c.lineTo(ax, ay); c.lineTo(ax - Math.cos(a + 0.45) * s, ay - Math.sin(a + 0.45) * s); c.stroke();
        });
      } else if (o.k === 'spiral') {
        c.lineWidth = 1.5 * d; c.strokeStyle = 'rgba(255,214,120,0.9)'; spiralPath(c, w, h); c.stroke();
      } else if (o.k === 'diag') {
        c.setLineDash([6 * d, 5 * d]); c.beginPath(); c.moveTo(0, h); c.lineTo(w, 0); c.stroke(); c.setLineDash([]);
      } else if (o.k === 'angle') {
        inset(c, w, h, d, function (g, bw, bh) {
          var sx = bw * 0.66, gy = bh * 0.86, hy = bh * 0.36;
          g.beginPath(); g.moveTo(bw * 0.08, gy); g.lineTo(bw * 0.92, gy); g.stroke();
          g.beginPath(); g.arc(sx, hy, bh * 0.08, 0, 6.2832); g.stroke();
          g.beginPath(); g.moveTo(sx, hy + bh * 0.08); g.lineTo(sx, gy); g.stroke();
          var a = o.a * Math.PI / 180, R = bh * 0.5, cx2 = sx - Math.cos(a) * R * 1.05, cy2 = hy - Math.sin(a) * R;
          cy2 = Math.max(bh * 0.1, Math.min(gy - bh * 0.06, cy2)); cx2 = Math.max(bw * 0.1, cx2);
          g.save(); g.setLineDash([3 * d, 3 * d]); g.beginPath(); g.moveTo(cx2, cy2); g.lineTo(sx, hy); g.stroke(); g.restore();
          var ang = Math.atan2(hy - cy2, sx - cx2), cs = bh * 0.1;
          g.save(); g.translate(cx2, cy2); g.rotate(ang); g.fillRect(-cs, -cs * 0.6, cs * 1.4, cs * 1.2); g.beginPath(); g.moveTo(cs * 0.4, 0); g.lineTo(cs * 0.95, -cs * 0.55); g.lineTo(cs * 0.95, cs * 0.55); g.closePath(); g.fill(); g.restore();
        });
      } else if (o.k === 'fov') {
        inset(c, w, h, d, function (g, bw, bh) {
          var cx2 = bw * 0.14, cy2 = bh * 0.5, a = o.a * Math.PI / 360, L = bw * 0.78;
          var ex = Math.min(L, (bh * 0.42) / Math.max(0.01, Math.tan(a)));
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.beginPath(); g.moveTo(cx2, cy2); g.lineTo(cx2 + ex, cy2 - Math.tan(a) * ex); g.lineTo(cx2 + ex, cy2 + Math.tan(a) * ex); g.closePath(); g.fill(); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(cx2 - bh * 0.1, cy2 - bh * 0.07, bh * 0.1, bh * 0.14);
          g.font = Math.round(9 * d) + 'px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
          g.fillText(o.a + '°', bw - 5 * d, bh - 4 * d);
        });
      } else if (o.k === 'swatch') {
        var sz = 14 * d, x0 = 8 * d, y0 = h - 8 * d - sz;
        c.font = Math.round(9.5 * d) + 'px ui-monospace, "Courier New", monospace'; c.textBaseline = 'middle';
        o.c.forEach(function (hx, j) {
          var yy = y0 - j * (sz + 5 * d);
          c.fillStyle = 'rgba(12,12,14,0.55)'; c.fillRect(x0 - 3 * d, yy - 3 * d, sz + 62 * d, sz + 6 * d);
          c.fillStyle = hx; c.fillRect(x0, yy, sz, sz); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.strokeRect(x0, yy, sz, sz);
          c.fillStyle = '#fff'; c.fillText(hx, x0 + sz + 5 * d, yy + sz / 2);
        });
      }
      c.restore();
    });
  }

  // ================= view (crop) =================
  function zoomVp(vp, o, e) {
    var b = e.base, w = vp.w / o.z, h = vp.h / o.z, ax = o.ax == null ? 0.5 : o.ax, ay = o.ay == null ? 0.5 : o.ay;
    var x = o.cx - ax * w, y = o.cy - ay * h;
    x = Math.max(b.x, Math.min(b.x + b.w - w, x)); y = Math.max(b.y, Math.min(b.y + b.h - h, y));
    return { x: x, y: y, w: w, h: h };
  }

  // ================= op registry =================
  var OPS = {
    zoom: { ph: 0, view: true, fn: zoomVp },
    ipm: { ph: 0.5, fn: ipm },
    outpaint: { ph: 1, fn: outpaint }, bgScale: { ph: 1, fn: bgScale }, nosubj: { ph: 1, fn: nosubj },
    mirrorX: { ph: 1.2, fn: mirrorX }, fold: { ph: 1.2, fn: fold }, renaissance: { ph: 5, fn: renaissance },
    recolor: { ph: 1.5, fn: recolor }, bgFill: { ph: 1.5, fn: bgFill },
    relight: { ph: 2, fn: relight }, castShadow: { ph: 2.1, fn: castShadow }, catchl: { ph: 2.2, fn: catchl }, skin: { ph: 2.3, fn: skin },
    sss: { ph: 2.2, fn: sss }, contact: { ph: 2.1, fn: contact }, metal: { ph: 1.6, fn: metal }, weather: { ph: 1.7, fn: weather },
    sky: { ph: 2.4, fn: sky }, astro: { ph: 2.45, fn: astro }, wet: { ph: 3.6, fn: wet },
    grade: { ph: 3, fn: grade }, gmap: { ph: 3.1, fn: gmap }, hueT: { ph: 3.2, fn: hueT },
    city: { ph: 3.5, fn: city }, godrays: { ph: 3.6, fn: godrays }, fog: { ph: 3.7, fn: fog },
    clarity: { ph: 4.05, fn: clarity }, sharpen: { ph: 4.06, fn: sharpen }, blurmix: { ph: 4.05, fn: blurmix },
    dof: { ph: 4, fn: dof }, mblur: { ph: 4.1, fn: mblur }, bokeh: { ph: 4.2, fn: bokeh },
    bloom: { ph: 4.3, fn: bloom }, orton: { ph: 4.3, fn: orton }, halation: { ph: 4.3, fn: halation }, trails: { ph: 4.4, fn: trails },
    ca: { ph: 4.5, fn: ca }, flare: { ph: 4.6, fn: flare }, sunstar: { ph: 4.6, fn: sunstar }, streak: { ph: 4.6, fn: streak }, leak: { ph: 4.6, fn: leak },
    rain: { ph: 4.7, fn: rain }, snow: { ph: 4.7, fn: snow }, particles: { ph: 4.7, fn: particles }, steam: { ph: 4.7, fn: steam }, drops: { ph: 4.7, fn: drops },
    reflect: { ph: 2.05, fn: reflect }, foliage: { ph: 4.8, fn: foliage }, ots: { ph: 4.8, fn: ots }, arch: { ph: 4.8, fn: arch },
    kuwa: { ph: 5, fn: kuwa }, poster: { ph: 5.1, fn: poster }, ink: { ph: 5.3, fn: ink }, paper: { ph: 5.9, fn: paper },
    strokes: { ph: 5, fn: strokes }, dots: { ph: 5, fn: dots }, glass: { ph: 5, fn: glass }, cubism: { ph: 5, fn: cubism },
    mosaic: { ph: 5, fn: mosaic }, lowpoly: { ph: 5, fn: lowpoly }, pixel: { ph: 5, fn: pixel }, halftone: { ph: 5.4, fn: halftone },
    pop: { ph: 5.2, fn: popart }, cel: { ph: 5, fn: cel }, comic: { ph: 5, fn: comic }, lineart: { ph: 5, fn: lineart },
    pencil: { ph: 5, fn: pencil }, charcoal: { ph: 5, fn: charcoal }, inkwash: { ph: 5, fn: inkwash }, watercolor: { ph: 5, fn: watercolor },
    oil: { ph: 5, fn: oil }, relief: { ph: 5.5, fn: relief }, gouache: { ph: 5, fn: gouache }, wave: { ph: 4.9, fn: wave },
    crack: { ph: 5.6, fn: crack }, ukiyo: { ph: 5, fn: ukiyo }, woodblock: { ph: 5, fn: woodblock }, linocut: { ph: 5, fn: linocut },
    blueprint: { ph: 5, fn: blueprint }, flatvec: { ph: 5, fn: flatvec }, r3d: { ph: 5, fn: r3d }, clay: { ph: 5, fn: clay }, felt: { ph: 5, fn: felt },
    palette: { ph: 5.1, fn: function (S, o) { if (o.kuwa) kuwa(S, { r: 4, sc: 0.5 }); palMap(S, o.pal, o.amt); } },
    deco: { ph: 5, fn: deco }, bauhaus: { ph: 5, fn: bauhaus }, swiss: { ph: 6.6, fn: swiss }, synth: { ph: 3.5, fn: synth },
    cyber: { ph: 3.5, fn: cyber }, vapor: { ph: 3.5, fn: vapor }, nouveau: { ph: 5, fn: nouveau }, steamp: { ph: 3.5, fn: steamp },
    snap: { ph: 4.95, fn: function (S) { S.snap = snapshot(S); } },
    unsnap: { ph: 5.95, fn: function (S, o) { if (!S.snap) return; var k = o.k == null ? 0.7 : o.k; for (var i = 0; i < N; i++) { S.r[i] = mix(S.snap.r[i], S.r[i], k); S.g[i] = mix(S.snap.g[i], S.g[i], k); S.b[i] = mix(S.snap.b[i], S.b[i], k); } } },
    rotate: { ph: 6, fn: rotate }, keystone: { ph: 6, fn: keystone }, barrel: { ph: 6.1, fn: barrel }, bulge: { ph: 6.1, fn: bulge },
    shrink: { ph: 6.2, fn: shrink }, tile: { ph: 6.2, fn: tile }, draft: { ph: 6.3, fn: draft },
    vign: { ph: 6.8, fn: vign }, grain: { ph: 7, fn: grain }, scan: { ph: 7.1, fn: scan },
    letterbox: { ph: 7.4, fn: letterbox }, polaroid: { ph: 7.5, fn: polaroid }, sticker: { ph: 7.5, fn: sticker },
    stamp: { ph: 7.6, fn: stamp }, cctv: { ph: 7.6, fn: cctv }, text: { ph: 7.6, fn: bigText },
    ov: { ph: 8, fn: ov }
  };

  // ================= term table =================
  function g(o) { return ['grade', o]; }
  function z(zm, cx, cy, ax, ay) { return ['zoom', { z: zm, cx: cx, cy: cy, ax: ax, ay: ay }]; }
  function lt(o) { return ['relight', o]; }
  function vg(k) { return ['vign', { k: k }]; }
  function gr(k, big) { return ['grain', { k: k, big: big }]; }
  function O(k, extra) { var o = extra || {}; o.k = k; return ['ov', o]; }
  var WARM = [1.06, 1, 0.9];
  var FLASH = lt({ amb: 1.2, bamb: 0.32, L: [{ t: 'rad', x: 0.51, y: 0.33, rx: 0.05, ry: 0.04, k: 0.25, reg: 'S' }, { t: 'rad', x: 0.512, y: 0.5, rx: 0.015, ry: 0.03, k: 0.3, reg: 'S' }] });
  var STREETNIGHT = [['sky', { stops: [[0, '#1c2a52'], [1, '#7d8fbf']], y0: 0, y1: 0.62, amt: 0.9 }], g({ exp: -1.1, temp: -0.35, sat: 0.85, con: 0.15 })];

  var T = {
    // ---- composition ----
    'rule-of-thirds': { p: 'portrait', o: [z(1.4, 0.51, 0.40, 1 / 3, 1 / 3), O('thirds', { pt: [1 / 3, 1 / 3] })] },
    'centered-composition': { p: 'portrait', o: [z(1.3, 0.51, 0.45), O('center')] },
    'symmetrical-composition': { p: 'street', o: [z(1.1, 0.52, 0.55), ['mirrorX', {}], O('sym')] },
    'leading-lines': { p: 'street', o: [g({ con: 0.08 }), O('lead')] },
    'negative-space': { p: 'product', o: [['shrink', { s: 0.5, sx: 0.3, sy: 0.68, tx: 0.17, ty: 0.79 }]] },
    'fill-the-frame': { p: 'portrait', o: [z(2.5, 0.51, 0.47)] },
    'framing-within-frame': { p: 'street', o: [['arch', {}]] },
    'one-point-perspective': { p: 'street', o: [O('vp')] },
    'foreground-interest': { p: 'portrait', o: [['dof', { mode: 'subject', r: 6 }], ['foliage', {}]] },
    'golden-ratio': { p: 'portrait', o: [z(1.6, 0.51, 0.40, GOLD_EYE[0], GOLD_EYE[1]), O('spiral')] },
    'diagonal-composition': { p: 'street', o: [z(1.7, 0.45, 0.83), ['rotate', { deg: 24 }], O('diag')] },
    // ---- shot size ----
    'extreme-close-up': { p: 'portrait', o: [z(3.2, 0.51, 0.405)] },
    'close-up': { p: 'portrait', o: [z(1.75, 0.51, 0.45)] },
    'medium-close-up': { p: 'portrait', o: [z(1.2, 0.51, 0.52)] },
    'medium-shot': { p: 'portrait', o: [['outpaint', { s: 0.78 }]] },
    'cowboy-shot': { p: 'portrait', o: [['outpaint', { s: 0.56 }]] },
    'full-body-shot': { p: 'portrait', o: [['outpaint', { s: 0.4, sb: 0.85 }]] },
    'wide-shot': { p: 'portrait', o: [['outpaint', { s: 0.3, sb: 0.8 }]] },
    'extreme-wide-shot': { p: 'portrait', o: [['outpaint', { s: 0.15, sb: 0.62, haze: 0.22 }]] },
    'over-the-shoulder': { p: 'portrait', o: [z(1.2, 0.51, 0.47, 0.62, 0.5), ['ots', {}]] },
    'macro-shot': { p: 'portrait', o: [z(7, 0.566, 0.398), ['dof', { mode: 'point', x: 0.566, y: 0.398, w0: 0.12, w1: 0.45, r: 10 }], ['clarity', { r: 3, k: 0.6 }]] },
    // ---- camera angle ----
    'eye-level': { p: 'portrait', o: [O('angle', { a: 0 })] },
    'low-angle': { p: 'portrait', o: [['keystone', { top: 1, bot: 1.28, p: 0.85 }], O('angle', { a: -30 })] },
    'high-angle': { p: 'portrait', o: [['keystone', { top: 1.3, bot: 1, p: 1.2 }], O('angle', { a: 35 })] },
    'birds-eye-view': { p: 'street', o: [['ipm', { z0: 1, z1: 2.27, xr: 0.95, xc: -0.05 }], vg(0.2), O('angle', { a: 90 })] },
    'worms-eye-view': { p: 'street', o: [z(1.15, 0.52, 0.6), ['keystone', { top: 1, bot: 1.75, p: 0.75 }], O('angle', { a: -80 })] },
    'dutch-angle': { p: 'portrait', o: [['rotate', { deg: -13 }]] },
    // ---- lens & optics ----
    'lens-14mm': { p: 'portrait', o: [['outpaint', { s: 0.7, sb: 0.75 }], ['bulge', { x: 0.51, y: 0.62, r: 0.42, k: 0.35 }], vg(0.3), O('fov', { a: 114 })] },
    'lens-35mm': { p: 'portrait', o: [['outpaint', { s: 0.86, sb: 0.9 }], ['bulge', { x: 0.51, y: 0.535, r: 0.3, k: 0.12 }], O('fov', { a: 63 })] },
    'lens-50mm': { p: 'portrait', o: [O('fov', { a: 47 })] },
    'lens-85mm': { p: 'portrait', o: [z(1.3, 0.51, 0.46), ['dof', { mode: 'subject', r: 11 }], O('fov', { a: 28 })] },
    'telephoto-lens': { p: 'portrait', o: [z(1.8, 0.51, 0.46), ['dof', { mode: 'subject', r: 18 }], O('fov', { a: 12 })] },
    'fisheye-lens': { p: 'street', o: [['barrel', { k: 0.85 }], vg(0.25)] },
    'tilt-shift': { p: 'street', o: [['dof', { mode: 'band', y: 0.72, w0: 0.06, w1: 0.3, r: 9 }], g({ sat: 1.45, con: 0.2, exp: 0.05 })] },
    'macro-lens': { p: 'portrait', o: [z(4, 0.566, 0.40), ['dof', { mode: 'point', x: 0.566, y: 0.40, w0: 0.1, w1: 0.4, r: 8 }], ['clarity', { r: 2, k: 0.5 }]] },
    'anamorphic-lens': { p: 'portrait', o: [['dof', { mode: 'subject', r: 6, ryk: 2.2 }], ['streak', { pts: [[0.18, 0.56], [0.86, 0.6]], k: 0.9 }], g({ con: 0.12, temp: -0.1 }), ['letterbox', { ratio: 2.39 }]] },
    'aperture-f1-4': { p: 'portrait', o: [['dof', { mode: 'subject', r: 16 }], ['bokeh', { n: 22, r0: 8, r1: 18, y0: 0.45, y1: 0.8, reg: 'B', minL: 0.45, a0: 0.25, a1: 0.5 }]] },
    'aperture-f11': { p: 'street', o: [['clarity', { r: 6, k: 0.35 }], ['sharpen', { k: 0.6 }], ['sunstar', { x: 0.615, y: 0.11 }]] },
    'shallow-dof': { p: 'street', o: [['dof', { mode: 'depth', f: 0, s: 1.6, r: 12 }]] },
    'deep-focus': { p: 'street', o: [['clarity', { r: 10, k: 0.4 }], ['sharpen', { k: 0.5 }], g({ con: 0.08 })] },
    'bokeh': { p: 'portrait', o: [['dof', { mode: 'subject', r: 12 }], ['bokeh', { n: 40, r0: 10, r1: 26, y0: 0.05, y1: 0.85, reg: 'B', a0: 0.18, a1: 0.45, boost: 1.4 }]] },
    'lens-flare': { p: 'street', o: [['flare', { x: 0.6, y: 0.1 }], g({ lift: 0.04, con: -0.08 })] },
    'chromatic-aberration': { p: 'portrait', o: [['ca', { k: 0.012 }]] },
    'motion-blur': { p: 'portrait', o: [['mblur', { r: 22 }]] },
    'long-exposure': { p: 'street', o: STREETNIGHT.concat([['city', { win: 0.5, lamps: 0.9 }], ['trails', {}]]) },
    // ---- camera & film ----
    'kodak-portra-400': { p: 'portrait', o: [g({ temp: 0.14, tint: 0.04, con: -0.08, sat: 0.85, shd: 0.18, lift: 0.025, hi: '#ffe3c8', hia: 0.08, sh: '#3b4a55', sha: 0.05 }), gr(0.035)] },
    'fuji-velvia': { p: 'portrait', o: [g({ sat: 1.65, vib: 0.3, con: 0.35, crush: 0.03, temp: 0.04 }), gr(0.02)] },
    'cinestill-800t': { p: 'portrait', o: [g({ temp: -0.38, tint: 0.06, con: 0.12, sat: 1.05, lift: 0.02 }), ['halation', { k: 0.9 }], gr(0.05)] },
    'ilford-hp5': { p: 'portrait', o: [g({ mono: 1, con: 0.22, lift: 0.03 }), gr(0.09, 1)] },
    'kodachrome': { p: 'portrait', o: [g({ con: 0.3, sat: 1.3, temp: 0.08, sh: '#203048', sha: 0.12, hi: '#fff0d0', hia: 0.06 }), ['hueT', { t: [0, 0.6], k: 0.15 }], gr(0.02)] },
    'polaroid': { p: 'portrait', o: [g({ lift: 0.08, con: -0.1, temp: 0.1, sat: 0.78, cap: 0.94, sh: '#2f6f7a', sha: 0.12, hi: '#fff1d6', hia: 0.1 }), vg(0.35), ['polaroid', {}]] },
    'disposable-camera': { p: 'portrait', o: [FLASH, ['castShadow', { dx: 0.012, dy: 0.012, k: 0.5, blur: 2 }], g({ temp: 0.12, sat: 1.1, con: 0.15 }), gr(0.07, 1), vg(0.5), ['stamp', {}]] },
    'digicam-2000s': { p: 'portrait', o: [g({ temp: -0.12, sat: 1.12, exp: 0.25, con: 0.1 }), ['draft', { w: 320 }], ['sharpen', { k: 1.1, ph: 6.4 }], gr(0.03)] },
    'vintage-80s-photo': { p: 'portrait', o: [g({ temp: 0.2, tint: 0.14, lift: 0.09, sat: 0.8, con: -0.05, hi: '#ffd8b0', hia: 0.1 }), ['orton', { r: 6, k: 0.25 }], ['leak', {}], gr(0.06), vg(0.4)] },
    'sony-a7': { p: 'portrait', o: [['clarity', { r: 5, k: 0.25 }], ['sharpen', { k: 0.45 }], g({ sat: 1.05, con: 0.06 })] },
    'medium-format': { p: 'portrait', o: [['dof', { mode: 'subject', r: 6 }], g({ con: -0.04, shd: 0.1, sat: 0.95 }), ['letterbox', { ratio: 1, cx: 0.51 }]] },
    'large-format': { p: 'portrait', o: [['dof', { mode: 'band', y: 0.46, w0: 0.12, w1: 0.4, r: 7 }], ['clarity', { r: 4, k: 0.3 }], g({ temp: 0.05 }), ['letterbox', { ratio: 0.8, cx: 0.51 }]] },
    'film-grain': { p: 'portrait', o: [gr(0.12, 1), g({ lift: 0.02 })] },
    'cctv-footage': { p: 'street', o: [g({ sat: 0.25, tint: -0.25, con: 0.2, exp: 0.1 }), ['draft', { w: 300 }], ['barrel', { k: 0.25 }], gr(0.08), ['scan', {}], vg(0.4), ['cctv', {}]] },
    // ---- lighting ----
    'rembrandt-lighting': { p: 'portrait', o: [lt({ amb: 0.28, bamb: 0.35, L: [{ t: 'side', x: 0.522, dir: -1, soft: 0.03, k: 0.62, reg: 'S', c: WARM }, { t: 'rad', x: 0.44, y: 0.36, rx: 0.2, ry: 0.28, k: 0.35, reg: 'S', c: WARM }, { t: 'poly', pts: [[0.53, 0.43], [0.59, 0.435], [0.54, 0.535]], blur: 4, k: 0.55, reg: 'S', c: WARM }, { t: 'rad', x: 0.25, y: 0.35, rx: 0.35, ry: 0.45, k: 0.3, reg: 'B' }] }), g({ con: 0.25, temp: 0.12, sat: 0.95 }), vg(0.35)] },
    'split-lighting': { p: 'portrait', o: [lt({ amb: 0.1, bamb: 0.3, L: [{ t: 'side', x: 0.513, dir: -1, soft: 0.006, k: 1, reg: 'S', c: WARM }, { t: 'rad', x: 0.2, y: 0.4, rx: 0.3, ry: 0.4, k: 0.25, reg: 'B' }] }), g({ con: 0.2 })] },
    'butterfly-lighting': { p: 'portrait', o: [lt({ amb: 0.55, bamb: 0.45, L: [{ t: 'rad', x: 0.51, y: 0.28, rx: 0.22, ry: 0.3, k: 0.55, reg: 'S' }, { t: 'rad', x: 0.512, y: 0.548, rx: 0.016, ry: 0.011, k: -0.5, reg: 'S' }, { t: 'vert', y: 0.67, dir: 1, soft: 0.02, k: -0.3, reg: 'S' }, { t: 'rad', x: 0.43, y: 0.52, rx: 0.03, ry: 0.06, k: -0.12, reg: 'S' }, { t: 'rad', x: 0.595, y: 0.52, rx: 0.03, ry: 0.06, k: -0.12, reg: 'S' }] }), ['catchl', { pos: [[0, -0.005]] }], g({ con: 0.15 })] },
    'loop-lighting': { p: 'portrait', o: [lt({ amb: 0.42, bamb: 0.45, L: [{ t: 'rad', x: 0.38, y: 0.3, rx: 0.28, ry: 0.35, k: 0.6, reg: 'S', c: WARM }, { t: 'side', x: 0.55, dir: -1, soft: 0.07, k: 0.2, reg: 'S' }, { t: 'rad', x: 0.532, y: 0.535, rx: 0.02, ry: 0.014, k: -0.35, reg: 'S' }] }), ['catchl', { pos: [[-0.002, -0.004]] }], g({ con: 0.15, temp: 0.05 })] },
    'clamshell-lighting': { p: 'portrait', o: [lt({ amb: 0.6, bamb: 0.35, L: [{ t: 'rad', x: 0.51, y: 0.3, rx: 0.25, ry: 0.3, k: 0.4, reg: 'S' }, { t: 'rad', x: 0.51, y: 0.75, rx: 0.25, ry: 0.2, k: 0.2, reg: 'S' }] }), ['skin', { k: 0.3 }], ['catchl', { pos: [[0, -0.005], [0, 0.005]] }], g({ con: 0.05, sat: 0.95 })] },
    'three-point-lighting': { p: 'portrait', o: [lt({ amb: 0.45, bamb: 0.4, L: [{ t: 'side', x: 0.48, dir: -1, soft: 0.12, k: 0.45, reg: 'S' }, { t: 'rad', x: 0.4, y: 0.35, rx: 0.2, ry: 0.3, k: 0.3, reg: 'S' }, { t: 'rim', r: 5, k: 0.9, add: 1, c: [1, 0.95, 0.85] }, { t: 'rad', x: 0.78, y: 0.35, rx: 0.25, ry: 0.35, k: 0.35, reg: 'B' }] }), g({ con: 0.15 })] },
    'rim-light': { p: 'portrait', o: [lt({ amb: 0.18, bamb: 0.12, L: [{ t: 'rim', r: 6, k: 1.4, add: 1, c: [1, 0.97, 0.9] }] }), g({ con: 0.2, crush: 0.02, temp: -0.05 })] },
    'backlighting': { p: 'portrait', o: [lt({ amb: 0.55, bamb: 1.35, ac: [1.04, 1, 0.94], L: [{ t: 'rim', r: 6, k: 1.1, add: 1, c: [1.2, 1, 0.75] }] }), ['bloom', { th: 0.7, r: 18, k: 0.6, c: [1, 0.85, 0.6] }], g({ lift: 0.1, temp: 0.3, con: -0.15, sat: 0.9 })] },
    'silhouette': { p: 'portrait', o: [lt({ amb: 0.05, bamb: 1.2, L: [{ t: 'rim', r: 3, k: 0.25, add: 1, c: [1, 0.7, 0.4] }] }), ['gmap', { reg: 'B', stops: [[0, '#5a2a1a'], [0.5, '#e0703a'], [1, '#ffe0a0']], amt: 0.8 }], g({ con: 0.25 })] },
    'front-lighting': { p: 'portrait', o: [lt({ amb: 1.05 }), g({ exp: 0.2, con: -0.35, shd: 0.35, sat: 1.05 })] },
    'chiaroscuro': { p: 'portrait', o: [lt({ amb: 0.1, bamb: 0.03, L: [{ t: 'rad', x: 0.43, y: 0.38, rx: 0.17, ry: 0.24, k: 1.05, reg: 'S', c: [1.1, 1, 0.85] }, { t: 'side', x: 0.52, dir: -1, soft: 0.05, k: 0.25, reg: 'S' }] }), g({ con: 0.35, temp: 0.15, crush: 0.02 }), vg(0.6)] },
    'low-key': { p: 'portrait', o: [lt({ amb: 0.2, bamb: 0.06, L: [{ t: 'rad', x: 0.47, y: 0.42, rx: 0.16, ry: 0.22, k: 0.75, reg: 'S' }, { t: 'rim', r: 5, k: 0.45, add: 1 }] }), g({ con: 0.25, crush: 0.03, sat: 0.9 })] },
    'high-key': { p: 'portrait', o: [['bgFill', { c: '#f6f6f3', amt: 0.92, keep: 0.15 }], g({ reg: 'S', exp: 0.4, con: -0.2, shd: 0.3, sat: 0.85, lift: 0.03 }), ['bloom', { th: 0.8, r: 10, k: 0.25 }]] },
    'softbox': { p: 'portrait', o: [lt({ amb: 0.55, bamb: 0.5, L: [{ t: 'rad', x: 0.36, y: 0.36, rx: 0.3, ry: 0.4, k: 0.55, reg: 'S' }] }), ['skin', { k: 0.5 }], ['catchl', { s: 'rect', pos: [[-0.002, -0.004]] }], g({ con: -0.08 })] },
    'hard-light': { p: 'portrait', o: [lt({ amb: 0.22, bamb: 0.85, L: [{ t: 'side', x: 0.53, dir: -1, soft: 0.004, k: 0.95, reg: 'S', c: [1.05, 1.02, 0.95] }, { t: 'poly', pts: [[0.515, 0.43], [0.548, 0.535], [0.522, 0.56], [0.512, 0.5]], blur: 1, k: -0.45, reg: 'S' }] }), ['castShadow', { dx: 0.03, dy: 0.02, k: 0.35, blur: 1 }], g({ con: 0.45, sat: 1.1, exp: 0.1 })] },
    'direct-flash': { p: 'portrait', o: [FLASH, ['castShadow', { dx: 0.012, dy: 0.012, k: 0.55, blur: 2 }], g({ con: 0.25, temp: -0.05, sat: 1.05 }), vg(0.55), gr(0.04)] },
    'window-light': { p: 'portrait', o: [lt({ amb: 0.32, bamb: 0.45, L: [{ t: 'side', x: 0.42, dir: -1, soft: 0.22, k: 0.8, reg: 'S', c: [1.03, 1, 0.95] }, { t: 'rad', x: 0.25, y: 0.4, rx: 0.35, ry: 0.5, k: 0.3 }] }), g({ temp: 0.06, con: 0.1, shd: 0.1 })] },
    'neon-lighting': { p: 'portrait', o: [lt({ amb: 0.1, bamb: 0.12, L: [{ t: 'side', x: 0.49, dir: -1, soft: 0.07, k: 1.2, reg: 'S', c: [1, 0.2, 0.8] }, { t: 'side', x: 0.535, dir: 1, soft: 0.07, k: 1.1, reg: 'S', c: [0.15, 0.85, 1] }, { t: 'rim', r: 5, k: 0.5, add: 1, c: [0.6, 0.4, 1] }] }), ['bokeh', { n: 26, r0: 10, r1: 26, reg: 'B', cols: ['#ff2bd6', '#24e1ff', '#8a5cff'], a0: 0.25, a1: 0.55 }], g({ con: 0.2, sat: 1.2 })] },
    'practical-lighting': { p: 'portrait', o: [lt({ amb: 0.22, bamb: 0.2, ac: [1.05, 0.95, 0.85], L: [{ t: 'rad', x: 0.2, y: 0.85, rx: 0.45, ry: 0.5, k: 1, c: [1.3, 0.85, 0.5] }] }), ['bokeh', { n: 18, r0: 8, r1: 20, reg: 'B', y0: 0.2, y1: 0.6, cols: ['#ffb347', '#ffd08a', '#ff9a3c'], a0: 0.3, a1: 0.6 }], g({ temp: 0.2, con: 0.15 })] },
    'candlelight': { p: 'portrait', o: [lt({ amb: 0.06, bamb: 0.03, L: [{ t: 'rad', x: 0.47, y: 0.85, rx: 0.28, ry: 0.45, k: 1.35, c: [1.35, 0.72, 0.3] }] }), g({ crush: 0.02, temp: 0.2, con: 0.1 }), ['bloom', { th: 0.6, r: 10, k: 0.3, c: [1, 0.6, 0.3] }], gr(0.03)] },
    'volumetric-light': { p: 'street', o: [g({ exp: -0.35, con: 0.15 }), ['godrays', { x: 0.55, y: -0.05, k: 0.9, useSky: 1, c: [1, 0.92, 0.75] }], ['fog', { k: 0.2, c: '#d8d0c0' }], g({ temp: 0.12, lift: 0.03 })] },
    'gel-lighting': { p: 'portrait', o: [lt({ amb: 0.2, bamb: 0.35, L: [{ t: 'side', x: 0.5, dir: -1, soft: 0.2, k: 0.8, c: [1, 0.3, 0.75] }, { t: 'side', x: 0.52, dir: 1, soft: 0.2, k: 0.8, c: [0.2, 0.8, 0.85] }] }), g({ con: 0.15, sat: 1.15 })] },
    'caustics': { p: 'portrait', o: [lt({ amb: 0.75, ac: [0.85, 0.95, 1], L: [{ t: 'caus', k: 0.6, add: 1, c: [0.75, 1, 0.95] }] }), g({ temp: -0.25, sat: 1.05 })] },
    // ---- time & weather ----
    'golden-hour': { p: 'street', o: [['sky', { stops: [[0, '#f7b267'], [1, '#ffe0a8']], y0: 0, y1: 0.62, amt: 0.9 }], g({ temp: 0.55, tint: 0.05, exp: 0.05, con: 0.15, sat: 1.25 }), lt({ amb: 1, L: [{ t: 'rad', x: 0.52, y: 0.62, rx: 0.3, ry: 0.35, k: 0.45, c: [1.2, 0.85, 0.5] }] }), ['bloom', { th: 0.75, r: 16, k: 0.45, c: [1, 0.8, 0.5] }]] },
    'blue-hour': { p: 'street', o: [['sky', { stops: [[0, '#1d2b5a'], [1, '#6a86c4']], y0: 0, y1: 0.62, amt: 0.95 }], g({ exp: -1.0, temp: -0.5, sat: 0.9, con: 0.1 }), ['city', { win: 0.7, lamps: 1 }]] },
    'midday-sun': { p: 'street', o: [['sky', { stops: [[0, '#3f7fd0'], [1, '#a9cdf2']], y0: 0, y1: 0.62, amt: 0.9 }], g({ exp: 0.2, con: 0.45, sat: 1.15, temp: -0.05, crush: 0.05 })] },
    'overcast': { p: 'street', o: [['sky', { stops: [[0, '#b9bec4'], [1, '#d4d7da']], y0: 0, y1: 0.62, amt: 0.85, clouds: 0.5, cc: [0.7, 0.72, 0.75] }], g({ con: -0.35, sat: 0.65, temp: -0.1, shd: 0.3, hl: 0.3 })] },
    'fog-mist': { p: 'street', o: [['fog', { k: 0.85, c: '#d5d9dc' }], g({ sat: 0.75, lift: 0.04 })] },
    'rain': { p: 'street', o: [g({ exp: -0.5, temp: -0.25, sat: 0.7, con: 0.1 }), ['wet', { k: 0.45 }], ['fog', { k: 0.22, c: '#9aa3ab' }], ['rain', {}]] },
    'night': { p: 'street', o: [['sky', { stops: [[0, '#04060d'], [1, '#141c36']], y0: 0, y1: 0.62, amt: 1 }], g({ exp: -1.8, temp: -0.55, sat: 0.6 }), ['city', { win: 0.45, lamps: 1.1 }]] },
    'snow': { p: 'street', o: [g({ exp: 0.2, temp: -0.25, sat: 0.6, con: -0.1 }), ['snow', {}], ['fog', { k: 0.2, c: '#e6eaee' }]] },
    // ---- colour ----
    'teal-orange': { p: 'portrait', o: [['hueT', { t: [0.075, 0.52], k: 0.5, sat: 1.12 }], g({ sh: '#1f6f78', sha: 0.22, hi: '#ffb070', hia: 0.12, con: 0.12 })] },
    'muted-colors': { p: 'portrait', o: [g({ sat: 0.45, con: -0.08, lift: 0.04 })] },
    'vibrant-colors': { p: 'portrait', o: [g({ sat: 1.6, vib: 0.4, con: 0.1 })] },
    'pastel': { p: 'portrait', o: [g({ sat: 0.6, lift: 0.22, con: -0.15, exp: 0.15, hi: '#ffd6e8', hia: 0.15, sh: '#b8d8f0', sha: 0.2 })] },
    'monochrome': { p: 'portrait', o: [['hueT', { t: [0.58], k: 1, sat: 0.9, minSat: 0.35 }]] },
    'black-and-white': { p: 'portrait', o: [g({ mono: 1, con: 0.15 })] },
    'sepia': { p: 'portrait', o: [g({ mono: 1 }), ['gmap', { stops: [[0, '#1e140c'], [0.5, '#7a5a3a'], [1, '#f4e6cc']], amt: 0.85 }]] },
    'complementary': { p: 'portrait', o: [['hueT', { t: [0.075, 0.575], k: 0.95, sat: 1.35 }], g({ con: 0.1 })] },
    'analogous': { p: 'portrait', o: [['hueT', { t: [0.98, 0.05, 0.11], k: 0.85, sat: 1.15 }]] },
    'hex-color': { p: 'product', o: [['recolor', { reg: 'mug', c: '#1F4E79' }], ['recolor', { reg: 'wall', c: '#F2E8D5' }], O('swatch', { c: ['#1F4E79', '#F2E8D5'] })] },
    'bleach-bypass': { p: 'portrait', o: [g({ sat: 0.4, con: 0.45, crush: 0.02, lift: 0.02 }), ['clarity', { r: 6, k: 0.3 }]] },
    'warm-tone': { p: 'portrait', o: [g({ temp: 0.45, tint: 0.05 })] },
    'cool-tone': { p: 'portrait', o: [g({ temp: -0.45 })] },
    // ---- medium ----
    'oil-painting': { p: 'portrait', o: [['oil', {}]] },
    'watercolor': { p: 'painting', o: [['watercolor', {}]] },
    'gouache': { p: 'painting', o: [['gouache', {}]] },
    'acrylic': { p: 'painting', o: [['strokes', { step: 6, len: 16, wid: 5.5, jit: 0.06, sat: 1.35, aj: 0.25, br: 2 }], g({ con: 0.15, ph: 5.2 }), ['relief', { k: 0.25 }]] },
    'ink-wash': { p: 'painting', o: [['inkwash', {}]] },
    'charcoal': { p: 'portrait', o: [['charcoal', {}]] },
    'pencil-sketch': { p: 'portrait', o: [['pencil', {}]] },
    'line-art': { p: 'portrait', o: [['lineart', {}]] },
    'flat-vector': { p: 'portrait', o: [['flatvec', {}]] },
    'cel-shaded-anime': { p: 'portrait', o: [['cel', {}]] },
    'comic-book': { p: 'portrait', o: [['comic', {}]] },
    '3d-render': { p: 'portrait', o: [['r3d', {}]] },
    'claymation': { p: 'portrait', o: [['clay', {}]] },
    'diorama': { p: 'street', o: [['dof', { mode: 'band', y: 0.72, w0: 0.05, w1: 0.28, r: 10 }], ['kuwa', { r: 2, sc: 1 }], g({ sat: 1.6, con: 0.25, exp: 0.1, ph: 5.2 })] },
    'felt-craft': { p: 'portrait', o: [['felt', {}]] },
    'pixel-art': { p: 'painting', o: [['pixel', { w: 128, k: 16 }]] },
    'low-poly': { p: 'portrait', o: [['lowpoly', { cell: 24 }]] },
    'woodblock-print': { p: 'painting', o: [['woodblock', {}]] },
    'linocut': { p: 'portrait', o: [['linocut', {}]] },
    'stained-glass': { p: 'painting', o: [['glass', { cell: 22 }]] },
    'mosaic': { p: 'painting', o: [['mosaic', { t: 11 }]] },
    'blueprint': { p: 'product', o: [['blueprint', {}]] },
    'sticker-design': { p: 'portrait', o: [['sticker', {}]] },
    // ---- art movements ----
    'impressionism': { p: 'painting', o: [['strokes', { step: 5, len: 9, wid: 4, jit: 0.14, sat: 1.25, aj: 0.9, br: 3 }], g({ exp: 0.12, lift: 0.04, ph: 5.2 })] },
    'post-impressionism': { p: 'painting', o: [['strokes', { step: 6, len: 18, wid: 4.5, jit: 0.1, sat: 1.5, aj: 0.15, br: 2 }], ['ink', { r1: 1, r2: 3, c: '#1d2b5a', k: 0.55 }], g({ con: 0.12, ph: 5.4 })] },
    'expressionism': { p: 'portrait', o: [['gmap', { stops: [[0, '#1a1446'], [0.3, '#2e7d32'], [0.5, '#e65100'], [0.75, '#ffd54f'], [1, '#fff3e0']], amt: 0.72 }], ['wave', { amp: 5 }], ['strokes', { step: 7, len: 14, wid: 6, jit: 0.18, aj: 1.2, sat: 1.2, br: 2 }]] },
    'surrealism': { p: 'street', o: [['fold', {}]] },
    'art-nouveau': { p: 'portrait', o: [['nouveau', {}]] },
    'art-deco': { p: 'street', o: [['deco', {}]] },
    'bauhaus': { p: 'portrait', o: [['bauhaus', {}]] },
    'swiss-style': { p: 'street', o: [['swiss', {}]] },
    'pop-art': { p: 'portrait', o: [['kuwa', { r: 3, sc: 0.5 }], ['pop', {}]] },
    'ukiyo-e': { p: 'painting', o: [['ukiyo', {}]] },
    'baroque': { p: 'portrait', o: [lt({ amb: 0.15, bamb: 0.1, L: [{ t: 'rad', x: 0.43, y: 0.36, rx: 0.2, ry: 0.28, k: 0.95, reg: 'S', c: [1.1, 1, 0.85] }] }), ['bgFill', { rad: ['#3b2a1c', '#0e0906'], cx: 0.45, cy: 0.35, amt: 0.95, keep: 0.3 }], ['kuwa', { r: 2, sc: 1 }], g({ temp: 0.3, sat: 0.85, con: 0.2, ph: 5.2 }), ['paper', { k: 0.08, canvas: 1 }], vg(0.5)] },
    'renaissance': { p: 'portrait', o: [['renaissance', {}]] },
    'cubism': { p: 'portrait', o: [['cubism', {}]] },
    'minimalism': { p: 'product', o: [['dof', { mode: 'subject', r: 25 }], g({ sat: 0.6, con: -0.05, exp: 0.08 }), ['shrink', { s: 0.55, sx: 0.3, sy: 0.68, tx: 0.5, ty: 0.62 }]] },
    'vaporwave': { p: 'portrait', o: [['vapor', {}]] },
    'synthwave': { p: 'street', o: [['synth', {}]] },
    'cyberpunk': { p: 'street', o: [['cyber', {}]] },
    'steampunk': { p: 'street', o: [['steamp', {}]] },
    'solarpunk': { p: 'street', o: [['sky', { stops: [[0, '#8ec5e8'], [1, '#fff0c2']], y0: 0, y1: 0.62, amt: 0.85 }], g({ exp: 0.2, temp: 0.15, sat: 1.2, tint: -0.12, lift: 0.05 }), ['foliage', { top: 1, blur: 3, seed: 53 }], ['foliage', { blur: 5, seed: 54 }], ['bloom', { th: 0.7, r: 14, k: 0.35, c: [1, 0.95, 0.8] }]] },
    'magical-realism': { p: 'portrait', o: [g({ temp: 0.18, lift: 0.04, sat: 1.05 }), ['orton', { r: 8, k: 0.25 }], ['particles', { n: 70 }]] },
    'mid-century-modern': { p: 'painting', o: [['palette', { kuwa: 1, pal: ['#e1a23b', '#2a7b7b', '#c8553d', '#7a7f3a', '#f2e6cf', '#3b2f2a', '#9bb7a8', '#d9c9a3'], amt: 1 }], ['paper', { k: 0.12 }], gr(0.03)] },
    // ---- photo genres ----
    'editorial-fashion': { p: 'portrait', o: [g({ con: 0.3, sat: 0.75, temp: -0.1, crush: 0.02, lift: 0.03 }), ['clarity', { r: 5, k: 0.25 }], ['letterbox', { ratio: 0.8, cx: 0.51, col: '#f2f0ec' }]] },
    'street-photography': { p: 'street', o: [g({ con: 0.28, sat: 1.1, crush: 0.03 }), ['rotate', { deg: 2.5 }], gr(0.05), vg(0.3)] },
    'documentary': { p: 'portrait', o: [g({ mono: 1, con: 0.3, crush: 0.02 }), gr(0.1, 1), vg(0.3)] },
    'studio-portrait': { p: 'portrait', o: [['bgFill', { rad: ['#a7a6a1', '#4b4a47'], cx: 0.51, cy: 0.4, amt: 1 }], lt({ amb: 0.62, bamb: 1, L: [{ t: 'rad', x: 0.38, y: 0.34, rx: 0.25, ry: 0.35, k: 0.45, reg: 'S' }] }), g({ con: 0.08 })] },
    'environmental-portrait': { p: 'portrait', o: [['outpaint', { s: 0.55, sb: 0.9, ax: 0.68 }], g({ con: 0.05 })] },
    'product-photography': { p: 'product', o: [['contact', { k: 0.35 }], g({ exp: 0.1, con: 0.15 }), ['clarity', { r: 4, k: 0.25 }], vg(0.15)] },
    'hero-shot': { p: 'product', o: [['bgFill', { rad: ['#3a3f48', '#0d0e11'], cx: 0.3, cy: 0.55, amt: 1, keep: 0.2 }], lt({ amb: 1, L: [{ t: 'rim', r: 4, k: 1.1, add: 1, c: [0.95, 0.97, 1] }] }), ['reflect', { k: 0.4 }], g({ con: 0.2 }), ['shrink', { s: 1.15, sx: 0.3, sy: 0.68, tx: 0.5, ty: 0.6 }]] },
    'food-photography': { p: 'product', o: [g({ temp: 0.3, sat: 1.15, exp: 0.05, con: 0.1 }), ['dof', { mode: 'subject', r: 8 }], ['steam', {}], vg(0.25)] },
    'architectural-photography': { p: 'street', o: [['sky', { stops: [[0, '#7fa7d6'], [1, '#d7e6f5']], y0: 0, y1: 0.6, amt: 0.85 }], g({ con: 0.18, sat: 0.9, temp: -0.05, shd: 0.25, hl: 0.2 }), ['clarity', { r: 8, k: 0.35 }]] },
    'astrophotography': { p: 'street', o: [['astro', {}], g({ exp: -2.1, temp: -0.5, sat: 0.7, con: 0.1, reg: 'NK' }), ['city', { win: 0.25, lamps: 0.6 }]] },
    'ugc-selfie': { p: 'portrait', o: [['bulge', { x: 0.51, y: 0.47, r: 0.3, k: 0.18 }], ['skin', { k: 0.6 }], g({ exp: 0.18, temp: 0.08, sat: 1.08, con: 0.05 }), ['letterbox', { ratio: 9 / 16, cx: 0.51 }]] },
    // ---- texture & detail ----
    'skin-texture': { p: 'portrait', o: [z(2.6, 0.51, 0.5), ['clarity', { r: 3, k: 1.1 }], ['sharpen', { k: 0.7 }]] },
    'airbrushed': { p: 'portrait', o: [z(2.6, 0.51, 0.5), ['skin', { k: 1, r: 5 }], g({ exp: 0.08, con: -0.05 }), ['orton', { r: 6, k: 0.15 }]] },
    'fabric-detail': { p: 'portrait', o: [z(3, 0.32, 0.9), ['clarity', { r: 2, k: 1.3 }], ['sharpen', { k: 0.8 }]] },
    'material-specific': { p: 'product', o: [['metal', {}], ['contact', { k: 0.3 }]] },
    'weathered': { p: 'product', o: [['weather', {}], vg(0.3)] },
    'pristine': { p: 'product', o: [['dof', { mode: 'subject', r: 20, k: 0.8 }], g({ exp: 0.18, con: 0.12, sat: 0.85 }), ['clarity', { r: 4, k: 0.2 }]] },
    'subsurface-scattering': { p: 'portrait', o: [['sss', {}]] },
    'wet-look': { p: 'product', o: [['drops', { n: 110 }], g({ con: 0.1 })] },
    // ---- mood ----
    'cinematic': { p: 'portrait', o: [['hueT', { t: [0.075, 0.52], k: 0.3 }], g({ sh: '#1d5a66', sha: 0.18, hi: '#ffc58f', hia: 0.08, con: 0.15, crush: 0.02 }), vg(0.25), gr(0.03), ['letterbox', { ratio: 2.39 }]] },
    'moody': { p: 'portrait', o: [g({ exp: -0.45, sat: 0.6, temp: -0.12, tint: -0.04, con: 0.25, lift: 0.03, sh: '#24383a', sha: 0.15 }), vg(0.55)] },
    'dreamy': { p: 'portrait', o: [['orton', { r: 10, k: 0.45 }], g({ lift: 0.1, sat: 0.8, con: -0.12, hi: '#ffd9ec', hia: 0.18, exp: 0.1 }), ['bloom', { th: 0.6, r: 16, k: 0.4, c: [1, 0.95, 0.95] }]] },
    'eerie': { p: 'street', o: [g({ temp: -0.2, tint: -0.25, sat: 0.5, con: 0.12, lift: 0.05, exp: -0.25 }), ['fog', { k: 0.35, c: '#b7c4b9' }], vg(0.5)] },
    'cheerful': { p: 'portrait', o: [g({ exp: 0.22, sat: 1.35, vib: 0.3, temp: 0.15, con: 0.08, lift: 0.02 })] },
    'nostalgic': { p: 'portrait', o: [g({ lift: 0.1, temp: 0.2, sat: 0.72, con: -0.08, hl: 0.15, sh: '#5a3d4a', sha: 0.08 }), gr(0.05), vg(0.4)] },
    'epic': { p: 'street', o: [['sky', { stops: [[0, '#2b2f3a'], [0.6, '#c97b4a'], [1, '#ffd08a']], y0: 0, y1: 0.62, amt: 0.9, clouds: 0.6, cc: [0.25, 0.24, 0.28] }], g({ con: 0.3, sat: 1.1, crush: 0.02 }), ['godrays', { x: 0.53, y: 0.5, k: 0.8, useSky: 1, c: [1, 0.85, 0.6] }], vg(0.45)] },
    'intimate': { p: 'portrait', o: [z(1.5, 0.51, 0.47), g({ temp: 0.25, exp: -0.2, lift: 0.03, sat: 0.9 }), ['dof', { mode: 'subject', r: 8 }], vg(0.4)] },
    // ---- quality (visual ones only) ----
    'hyper-detailed': { p: 'painting', o: [['clarity', { r: 3, k: 0.9 }], ['clarity', { r: 12, k: 0.4 }], ['sharpen', { k: 0.6 }]] },
    'octane-render': { p: 'product', o: [['bgFill', { rad: ['#2a2f38', '#0c0d10'], cx: 0.3, cy: 0.6, amt: 1, keep: 0.15 }], lt({ amb: 1, L: [{ t: 'rim', r: 4, k: 1.2, add: 1, c: [0.9, 0.95, 1] }] }), ['reflect', { k: 0.5 }], g({ con: 0.22, sat: 1.1 }), ['bloom', { th: 0.85, r: 8, k: 0.3 }]] },
    'ray-tracing': { p: 'product', o: [['reflect', { k: 0.55 }], ['contact', { k: 0.4 }], g({ con: 0.08 })] },
    // ---- model syntax with a visible effect ----
    'mj-ar': { p: 'portrait', o: [['letterbox', { ratio: 16 / 9 }]] },
    'mj-tile': { p: 'painting', o: [['tile', {}]] },
    'mj-draft': { p: 'portrait', o: [['draft', { w: 180 }], g({ sat: 0.9, con: -0.08 })] },
    'mj-exp': { p: 'portrait', o: [['clarity', { r: 12, k: 0.55 }], g({ sat: 1.18, shd: 0.35, hl: 0.25, con: 0.1 }), ['clarity', { r: 3, k: 0.35 }]] },
    'mj-no': { p: 'portrait', o: [['nosubj', {}]] },
    'quoted-text': { p: 'street', o: [g({ temp: 0.2, sat: 1.1 }), ['text', { t: 'LE FESTIVAL DU SOLEIL' }]] },
    'sd-weighting': { p: 'portrait', o: [['recolor', { reg: 'hair', c: '#c0441c', amt: 0.5, hue: 1 }], ['clarity', { r: 2, k: 1.4, face: 1 }], g({ reg: 'B', sat: 0.55, exp: -0.25 })] },
    'sd-break': { p: 'portrait', o: [['recolor', { reg: 'hair', c: '#c62828', amt: 0.85, hue: 1 }], ['recolor', { reg: 'shirt', c: '#1e5bd8', amt: 0.9, hue: 1 }], ['recolor', { reg: 'bg', c: '#3f8f3a', amt: 0.75, hue: 1 }]] },
    'sd-lora': { p: 'portrait', o: [['snap', {}], ['watercolor', {}], ['unsnap', { k: 0.7 }]] }
  };

  // ================= pipeline =================
  var CAT_PRIMARY = { composition: 'street', 'time-weather': 'street', medium: 'painting', 'art-movement': 'painting' };
  function primaryFor(term) {
    if (term && T[term.id]) return T[term.id].p;
    return (term && CAT_PRIMARY[term.category]) || 'portrait';
  }
  function supports(term) { return !!(term && T[term.id]); }
  // framing ops: in a combo only one term may reframe the picture
  var FRAMING = { zoom: 1, outpaint: 1, letterbox: 1, polaroid: 1, sticker: 1, shrink: 1, tile: 1, ipm: 1, rotate: 1, keystone: 1, barrel: 1, bulge: 1, bgScale: 1, mirrorX: 1, fold: 1 };
  var DETAIL = { 'skin-texture': 1, 'airbrushed': 1, 'fabric-detail': 1, 'macro-shot': 1, 'macro-lens': 1 };
  var CAT_RANK = { 'shot-size': 0, 'composition': 1, 'camera-angle': 2, 'lens-optics': 3, 'photo-genre': 4, 'camera-film': 5 };
  function framingTerm(terms) {
    var best = null, br = 99;
    terms.forEach(function (t) {
      if (DETAIL[t.id]) return;
      var has = (T[t.id].o || []).some(function (op) { return FRAMING[op[0]]; });
      if (!has) return;
      var r = CAT_RANK[t.category] == null ? 9 : CAT_RANK[t.category];
      if (r < br) { br = r; best = t.id; }
    });
    return best;
  }
  function compute(e, terms) {
    var ops = [], views = [], combo = terms.length > 1, ft = combo ? framingTerm(terms) : null;
    terms.forEach(function (t, ti) {
      (T[t.id].o || []).forEach(function (op, oi) {
        var def = OPS[op[0]]; if (!def) return;
        if (combo && (op[0] === 'ov' || (FRAMING[op[0]] && t.id !== ft))) return;
        var p = op[1] || {}, item = { n: op[0], p: p, ph: p.ph != null ? p.ph : def.ph, k: ti * 100 + oi };
        if (def.view) views.push(item); else ops.push(item);
      });
    });
    if (combo) {
      ops.sort(function (a, b) { return (a.ph - b.ph) || (a.k - b.k); });
      // merge grain / vignette into one pass at max strength; soften detail boosts; cap stacked contrast
      var gmax = null, vmax = null, conSum = 0, out = [];
      ops.forEach(function (op) {
        if (op.n === 'grain') { if (!gmax) gmax = { n: 'grain', p: { k: 0, big: 0 }, ph: op.ph, k: op.k }; gmax.p.k = Math.max(gmax.p.k, op.p.k || 0.05); gmax.p.big = gmax.p.big || op.p.big; return; }
        if (op.n === 'vign') { if (!vmax) vmax = { n: 'vign', p: { k: 0 }, ph: op.ph, k: op.k }; vmax.p.k = Math.max(vmax.p.k, op.p.k || 0.4); return; }
        if (op.n === 'clarity' || op.n === 'sharpen') { var q = {}, kk; for (kk in op.p) q[kk] = op.p[kk]; q.k = (op.p.k == null ? 0.5 : op.p.k) * 0.45; op = { n: op.n, p: q, ph: op.ph, k: op.k }; }
        if (op.n === 'grade' && op.p.con > 0) conSum += op.p.con;
        out.push(op);
      });
      if (conSum > 0.3) out = out.map(function (op) {
        if (op.n !== 'grade' || !(op.p.con > 0)) return op;
        var q = {}, kk; for (kk in op.p) q[kk] = op.p[kk]; q.con = op.p.con * 0.3 / conSum;
        return { n: op.n, p: q, ph: op.ph, k: op.k };
      });
      if (vmax) out.push(vmax);
      if (gmax) { gmax.p.k *= 0.7; out.push(gmax); }
      out.sort(function (a, b) { return (a.ph - b.ph) || (a.k - b.k); });
      ops = out;
    }
    var vp = { x: e.base.x, y: e.base.y, w: e.base.w, h: e.base.h };
    views.forEach(function (v) { vp = OPS[v.n].fn(vp, v.p, e) || vp; });
    var S = makeState(e, vp);
    ops.forEach(function (op) {
      try { OPS[op.n].fn(S, op.p); clampS(S); }
      catch (err) { if (window.console) console.warn('[r-image] op failed:', op.n, err); }
    });
    return { cv: toCanvas(S), ov: S.ov };
  }
  var CACHE = {}, CKEYS = [];
  function cachePut(k, v) {
    CACHE[k] = v; CKEYS.push(k);
    while (CKEYS.length > 30) delete CACHE[CKEYS.shift()];
  }
  var queue = Promise.resolve();
  function enqueue(fn) {
    var p = queue.then(function () {
      return new Promise(function (res) {
        setTimeout(function () {
          try { res(fn()); } catch (err) { if (window.console) console.warn('[r-image]', err); res(null); }
        }, 0);
      });
    });
    queue = p.then(null, function () {});
    return p;
  }
  function paint(cv, el, res) {
    var w = el.clientWidth || 300, h = el.clientHeight || Math.round(w / 1.5), dpr = Math.min(2, window.devicePixelRatio || 1);
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (cv.width !== pw) cv.width = pw;
    if (cv.height !== ph) cv.height = ph;
    var c = cv.getContext('2d'), s = Math.max(pw / W, ph / H), dw = W * s, dh = H * s, ox = (pw - dw) / 2, oy = (ph - dh) / 2;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, pw, ph);
    c.drawImage(res.cv, ox, oy, dw, dh);
    res.ov.forEach(function (fn) {
      c.save(); c.translate(ox, oy);
      try { fn(c, dw, dh, Math.max(1, dw / 640)); } catch (err) { /* overlay is decorative */ }
      c.restore();
    });
  }
  function caption(el, text) {
    var d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'position:absolute;left:8px;bottom:8px;padding:2px 8px;border-radius:6px;font-size:11px;line-height:1.6;' +
      'background:var(--surface);color:var(--muted);border:1px solid var(--line);pointer-events:none;';
    el.appendChild(d);
    return d;
  }
  function render(el, terms, ctx) {
    terms = (terms || []).filter(Boolean); ctx = ctx || {};
    var dead = false, ro = null, res = null, capEl = null;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.background = 'var(--surface)';
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;' + (ctx.reducedMotion ? '' : 'transition:opacity .25s ease;');
    el.appendChild(cv);
    var sup = terms.filter(supports);
    var key = ctx.primary && PRIM[ctx.primary] ? ctx.primary : (sup.length ? primaryFor(sup[0]) : (terms.length ? primaryFor(terms[0]) : 'portrait'));
    var ck = key + '|' + sup.map(function (t) { return t.id; }).join(',');
    if (terms.length && !sup.length) capEl = caption(el, '이 용어는 예시 이미지가 없어요');
    function draw() { if (!dead && res) paint(cv, el, res); }
    function done(r) {
      if (dead || !r) return;
      res = r; draw(); cv.style.opacity = '1';
      if (window.ResizeObserver && !ro) { ro = new ResizeObserver(draw); ro.observe(el); }
    }
    if (CACHE[ck]) done(CACHE[ck]);
    else {
      getSrc(key).then(function (e) {
        if (dead) return null;
        if (CACHE[ck]) return CACHE[ck];
        return enqueue(function () {
          if (dead) return null;
          if (CACHE[ck]) return CACHE[ck];
          var r = compute(e, sup);
          cachePut(ck, r);
          return r;
        });
      }).then(done).catch(function () {
        if (!dead && !capEl) capEl = caption(el, '이미지를 불러오지 못했어요');
      });
    }
    return function () {
      dead = true;
      if (ro) { ro.disconnect(); ro = null; }
      if (cv.parentNode) cv.parentNode.removeChild(cv);
      if (capEl && capEl.parentNode) capEl.parentNode.removeChild(capEl);
    };
  }

  var renderer = {
    aspect: '3/2',
    primaries: ['portrait', 'street', 'product', 'painting'].map(function (k) { var p = PRIM[k]; return { key: p.key, label: p.label, src: p.src, prompt: p.prompt }; }),
    primaryFor: primaryFor,
    supports: supports,
    render: render
  };
  if (typeof PD.registerRenderer === 'function') PD.registerRenderer('image', renderer);
  else { PD._pendingRenderers = PD._pendingRenderers || []; PD._pendingRenderers.push(['image', renderer]); }
  PD._imageRenderer = renderer;
  PD._imageInternals = { compute: compute, buildSrc: buildSrc, table: T };
})();
