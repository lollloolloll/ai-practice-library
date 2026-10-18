/* r-audio.js — 오디오 '이론적 결과' 렌더러 (classic script, ES2020, Web Audio API only) */
(function () {
  'use strict';
  var PD = window.PD = window.PD || {};
  var SR = 44100;

  /* ───────────── 기본 유틸 ───────────── */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mkBuf(ch, len, rate) {
    return new AudioBuffer({ numberOfChannels: ch, length: Math.max(1, Math.floor(len)), sampleRate: rate || SR });
  }
  function chans(b) { var a = []; for (var c = 0; c < b.numberOfChannels; c++) a.push(b.getChannelData(c)); return a; }
  function fromChans(arr) {
    var b = mkBuf(arr.length, arr[0].length);
    for (var c = 0; c < arr.length; c++) b.copyToChannel(arr[c] instanceof Float32Array ? arr[c] : new Float32Array(arr[c]), c);
    return b;
  }
  function stereo(arr) { return [arr, arr.slice()]; }
  function normalize(a, peak) {
    var m = 0; for (var i = 0; i < a.length; i++) { var v = Math.abs(a[i]); if (v > m) m = v; }
    if (m > 0) { var g = peak / m; for (var j = 0; j < a.length; j++) a[j] *= g; }
    return a;
  }
  function fadeEdges(a, sec) {
    var f = Math.min(a.length >> 2, Math.floor(SR * (sec || 0.02)));
    for (var i = 0; i < f; i++) { var g = i / f; a[i] *= g; a[a.length - 1 - i] *= g; }
    return a;
  }
  function osc(c, type, f, t, stop, det) {
    var o = c.createOscillator(); o.type = type; o.frequency.value = f;
    if (det) o.detune.value = det;
    o.start(t); o.stop(stop); return o;
  }
  function gainN(c, v) { var g = c.createGain(); g.gain.value = (v == null ? 1 : v); return g; }
  function filt(c, type, f, q) {
    var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (q != null) b.Q.value = q;
    return b;
  }
  function arrSrc(c, arr, t, dest, g) {
    var b = mkBuf(1, arr.length); b.copyToChannel(arr, 0);
    var s = c.createBufferSource(); s.buffer = b;
    var gg = gainN(c, g == null ? 1 : g); s.connect(gg); gg.connect(dest); s.start(t);
    return s;
  }

  var _noise = null;
  function noiseBuf() {
    if (_noise) return _noise;
    var b = mkBuf(1, SR * 2), d = b.getChannelData(0), r = rng(7);
    for (var i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    _noise = b; return b;
  }
  var _nOff = 0;
  function noiseSrc(c, t, dur) {
    var s = c.createBufferSource(); s.buffer = noiseBuf(); s.loop = true;
    _nOff = (_nOff + 0.37) % 1.6;
    s.start(t, _nOff); s.stop(t + dur + 0.05);
    return s;
  }

  /* 임펄스 응답(리버브) 생성: room / hall / plate / spring / cave / stadium */
  var _ir = {};
  function makeIR(type, rate) {
    var sr = rate || SR, ck = type + '@' + sr;
    if (_ir[ck]) return _ir[ck];
    var cfg = {
      room: [0.8, 3.0, 0.004, 7000], hall: [3.2, 2.3, 0.022, 5200], plate: [2.2, 2.6, 0.0, 10000],
      spring: [1.8, 2.4, 0.008, 4200], cave: [6.0, 1.7, 0.05, 3600], stadium: [4.5, 1.9, 0.07, 4500]
    }[type] || [1.5, 2.5, 0.01, 7000];
    var len = Math.floor(cfg[0] * sr), pre = Math.floor(cfg[2] * sr);
    var b = mkBuf(2, len + pre, sr), r = rng(type.length * 99 + 3);
    var a = Math.exp(-2 * Math.PI * cfg[3] / sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), lp = 0;
      for (var i = 0; i < len; i++) {
        var x = i / len, env = Math.pow(1 - x, cfg[1]);
        var n = r() * 2 - 1;
        if (type === 'spring') n *= 1 + 0.9 * Math.sin(2 * Math.PI * (260 - 190 * x) * i / sr);
        var aa = a + (1 - a) * 0.6 * x;          /* 꼬리로 갈수록 어두워짐 */
        lp = lp * aa + n * (1 - aa);
        d[i + pre] = (type === 'plate' ? n * 0.5 + lp * 0.5 : lp) * env;
      }
      if (type === 'room' || type === 'stadium') {
        var refl = type === 'room' ? [0.007, 0.013, 0.021, 0.029] : [0.06, 0.11, 0.17];
        for (var k = 0; k < refl.length; k++) {
          var p = Math.floor((refl[k] + ch * 0.0017) * sr); if (p < d.length) d[p] += 0.5 / (k + 1);
        }
      }
    }
    _ir[ck] = b; return b;
  }

  /* 웨이브셰이퍼 곡선 */
  var _curves = {};
  function curve(kind, k) {
    var key = kind + ':' + k; if (_curves[key]) return _curves[key];
    var n = 2048, c = new Float32Array(n), off = 0.12;
    for (var i = 0; i < n; i++) {
      var x = i * 2 / (n - 1) - 1, y;
      if (kind === 'tanh') y = Math.tanh(k * x) / Math.tanh(k);
      else if (kind === 'tape') y = (Math.tanh(k * (x + off)) - Math.tanh(k * off)) / Math.tanh(k);
      else if (kind === 'hard') y = clamp(x * k, -1, 1);
      else { var s = x < 0 ? -1 : 1; y = s * (1 - Math.exp(-Math.abs(x) * k)) / (1 - Math.exp(-k)); }
      c[i] = y;
    }
    _curves[key] = c; return c;
  }

  /* ───────────── 파일 로딩(모듈 캐시) ───────────── */
  var FILES = { guitar: 'assets/primary/guitar.mp3', voice: 'assets/primary/voice.mp3' };
  var _files = {};
  function decode(arr) {
    var oc = new OfflineAudioContext(2, 1, SR);
    return new Promise(function (res, rej) {
      var p = oc.decodeAudioData(arr, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }
  function loadFile(key) {
    if (!_files[key]) {
      var p = fetch(FILES[key]).then(function (r) {
        if (!r.ok) throw new Error('load ' + key);
        return r.arrayBuffer();
      }).then(decode).then(function (b) { return key === 'voice' ? trimVoice(b) : b; });
      _files[key] = p;
      p.catch(function () { delete _files[key]; });
    }
    return _files[key];
  }

  function envOf(b, win) {
    var d = b.getChannelData(0), n = Math.floor(b.length / win), e = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0, cnt = 0;
      for (var j = i * win; j < (i + 1) * win; j += 4) { var v = d[j]; s += v * v; cnt++; }
      e[i] = Math.sqrt(s / cnt);
    }
    return e;
  }
  /* 27초 낭독을 13–18초 사이 가장 조용한 지점에서 잘라 루프 길이를 줄임 */
  function trimVoice(b) {
    if (b.duration < 19) return b;
    var win = Math.floor(SR / 100), e = envOf(b, win);
    var lo = 1300, hi = Math.min(e.length - 3, 1800), best = lo, bv = 1e9;
    for (var i = lo; i < hi; i++) { var v = e[i] + e[i + 1] + e[i + 2]; if (v < bv) { bv = v; best = i; } }
    var cut = (best + 1) * win;
    return fromChans(chans(b).map(function (a) { return fadeEdges(a.slice(0, cut), 0.03); }));
  }

  /* ───────────── 버퍼 가공(JS) ───────────── */
  function hann(N) { var w = new Float32Array(N); for (var i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); return w; }

  /* WSOLA 타임 스트레치: f>1 이면 느려짐(음높이 유지) */
  function stretchArr(src, f) {
    var N = 1024, Hs = 512, tol = 256, mono = src[0];
    var outLen = Math.floor(mono.length * f);
    var out = src.map(function () { return new Float32Array(outLen + N); });
    var norm = new Float32Array(outLen + N), win = hann(N), prev = 0, k = 0;
    for (var op = 0; op + N < outLen; op += Hs, k++) {
      var ideal = Math.round(op / f), pos = ideal;
      if (k > 0) {
        var nat = prev + Hs, best = -1e9, bestD = 0;
        for (var dd = -tol; dd <= tol; dd += 8) {
          var cand = ideal + dd;
          if (cand < 0 || cand + N >= mono.length) continue;
          var s = 0;
          for (var j = 0; j < N / 2; j += 8) s += mono[cand + j] * mono[nat + j];
          if (s > best) { best = s; bestD = dd; }
        }
        pos = ideal + bestD;
      }
      if (pos < 0) pos = 0;
      if (pos + N >= mono.length) break;
      for (var c = 0; c < src.length; c++) {
        var sc = src[c], oc = out[c];
        for (var j2 = 0; j2 < N; j2++) oc[op + j2] += sc[pos + j2] * win[j2];
      }
      for (var j3 = 0; j3 < N; j3++) norm[op + j3] += win[j3];
      prev = pos;
    }
    return out.map(function (o) {
      for (var i = 0; i < outLen; i++) if (norm[i] > 0.15) o[i] /= norm[i];
      return o.slice(0, outLen);
    });
  }
  function resampleArr(src, q) {
    return src.map(function (a) {
      var n = Math.floor(a.length / q), o = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var x = i * q, i0 = Math.floor(x), fr = x - i0, a1 = i0 + 1 < a.length ? a[i0 + 1] : 0;
        o[i] = a[i0] * (1 - fr) + a1 * fr;
      }
      return o;
    });
  }
  function pitchArr(src, st) { var q = Math.pow(2, st / 12); return resampleArr(stretchArr(src, q), q); }

  function findPauses(b) {
    var win = Math.floor(SR / 100), e = envOf(b, win), mx = 0, i;
    for (i = 0; i < e.length; i++) if (e[i] > mx) mx = e[i];
    var thr = mx * 0.07, res = [], run = 0;
    for (i = 0; i < e.length; i++) {
      if (e[i] < thr) run++;
      else { if (run >= 14 && i - run > 25) res.push(Math.floor((i - run / 2) * win)); run = 0; }
    }
    return res;
  }
  function insertAt(b, points, lens, fillFn) {
    var src = chans(b), total = b.length, i;
    for (i = 0; i < points.length; i++) total += lens[i];
    var out = src.map(function () { return new Float32Array(total); }), w = 0, last = 0;
    for (var k = 0; k <= points.length; k++) {
      var end = k < points.length ? points[k] : b.length;
      for (var c = 0; c < src.length; c++) out[c].set(src[c].subarray(last, end), w);
      w += end - last; last = end;
      if (k < points.length) {
        if (fillFn) { var fa = fillFn(k, lens[k]); for (var c2 = 0; c2 < out.length; c2++) out[c2].set(fa.subarray(0, lens[k]), w); }
        w += lens[k];
      }
    }
    return fromChans(out);
  }
  function breathArr(dur, kind) {
    var n = Math.floor(dur * SR), o = new Float32Array(n), r = rng(kind === 'in' ? 31 : 23), l1 = 0, l2 = 0;
    for (var i = 0; i < n; i++) {
      var x = i / n, env;
      if (kind === 'in') env = Math.pow(Math.sin(Math.PI * x), 1.5);
      else env = x < 0.22 ? Math.sin(x / 0.22 * Math.PI / 2) : Math.pow(1 - (x - 0.22) / 0.78, 1.7);
      var c = (kind === 'in' ? 0.35 : 0.22) * (1 - 0.45 * x);
      var nz = r() * 2 - 1; l1 += (nz - l1) * c; l2 += (l1 - l2) * 0.08;
      o[i] = (l1 - l2) * env;
    }
    return normalize(o, kind === 'in' ? 0.12 : 0.22);
  }
  function applauseArr(dur) {
    var n = Math.floor(dur * SR), o = new Float32Array(n), r = rng(77);
    var claps = Math.floor(dur * 70);
    for (var k = 0; k < claps; k++) {
      var t = Math.floor(Math.pow(r(), 0.8) * (n - 4000)), len = 900 + Math.floor(r() * 900), amp = 0.3 + r() * 0.7, bp = 0, lp = 0;
      var x0 = t / n, env = x0 < 0.15 ? x0 / 0.15 : (x0 > 0.7 ? (1 - x0) / 0.3 : 1);
      for (var j = 0; j < len && t + j < n; j++) {
        var nz = r() * 2 - 1; lp += (nz - lp) * 0.5; bp = nz - lp;
        o[t + j] += (lp * 0.6 + bp * 0.4) * Math.exp(-j / 160) * amp * env;
      }
    }
    return normalize(o, 0.5);
  }
  /* LPC 보코더로 성대 진동을 숨소리(노이즈)로 바꿔 속삭임에 가깝게 */
  function whisperArr(m) {
    var N = 1024, H = 512, P = 36, n = m.length, out = new Float32Array(n + N), r = rng(5);
    var win = hann(N), fr = new Float64Array(N), R = new Float64Array(P + 1), a = new Float64Array(P + 1), tmp = new Float64Array(P + 1), y = new Float64Array(N + P);
    for (var st = 0; st + N < n; st += H) {
      var prevS = st > 0 ? m[st - 1] : 0, i, j;
      for (i = 0; i < N; i++) { var cur = m[st + i]; fr[i] = (cur - 0.92 * prevS) * win[i]; prevS = cur; }
      for (var k = 0; k <= P; k++) { var s = 0; for (i = 0; i < N - k; i++) s += fr[i] * fr[i + k]; R[k] = s; }
      if (R[0] < 1e-7) continue;
      R[0] *= 1.0001;
      for (i = 0; i <= P; i++) a[i] = 0;
      a[0] = 1; var err = R[0];
      for (i = 1; i <= P; i++) {
        var acc = R[i];
        for (j = 1; j < i; j++) acc += a[j] * R[i - j];
        var kk = -acc / err;
        for (j = 0; j <= P; j++) tmp[j] = a[j];
        for (j = 1; j < i; j++) a[j] = tmp[j] + kk * tmp[i - j];
        a[i] = kk; err *= (1 - kk * kk);
        if (err <= 0) { err = 1e-9; break; }
      }
      var g = Math.sqrt(Math.max(err, 0) / N * 3);
      for (i = 0; i < P; i++) y[i] = 0;
      for (i = 0; i < N; i++) {
        var v = g * (r() * 2 - 1);
        for (j = 1; j <= P; j++) v -= a[j] * y[P + i - j];
        y[P + i] = v;
        out[st + i] += v * win[i];
      }
    }
    var de = 0, o2 = new Float32Array(n);
    for (var q = 0; q < n; q++) { de = out[q] + 0.6 * de; o2[q] = de; }
    var pk = 0; for (q = 0; q < n; q++) { var av = Math.abs(m[q]); if (av > pk) pk = av; }
    return normalize(o2, pk * 0.85 || 0.5);
  }

  var PROC = {
    reverse: function (b) { return fromChans(chans(b).map(function (a) { return a.slice().reverse(); })); },
    crush: function (b, o) {
      var step = SR / o.rate, q = Math.pow(2, o.bits - 1);
      return fromChans(chans(b).map(function (a) {
        var out = new Float32Array(a.length), hold = 0, acc = step;
        for (var i = 0; i < a.length; i++) { acc += 1; if (acc >= step) { acc -= step; hold = Math.round(a[i] * q) / q; } out[i] = hold; }
        return out;
      }));
    },
    stretch: function (b, o) { return fromChans(stretchArr(chans(b), o.f)); },
    pitch: function (b, o) { return fromChans(pitchArr(chans(b), o.st)); },
    gaps: function (b, o) {
      var ps = findPauses(b).slice(0, o.max || 99), lens = [];
      for (var i = 0; i < ps.length; i++) lens.push(Math.floor(SR * (i === 0 && o.first ? o.first : o.extra)));
      return insertAt(b, ps, lens, null);
    },
    breaths: function (b) {
      var ps = findPauses(b).slice(0, 6), lens = [], br = breathArr(0.5, 'in');
      for (var i = 0; i < ps.length; i++) lens.push(br.length);
      return insertAt(b, ps, lens, function () { return br; });
    },
    breath: function (b, o) {
      var br = breathArr(o.dur, o.kind), gap = Math.floor(SR * 0.3), lead = new Float32Array(br.length + gap);
      lead.set(br, 0);
      return insertAt(b, [0], [lead.length], function () { return lead; });
    },
    whisper: function (b, o) {
      var src = chans(b), m = src[0], w = whisperArr(m), mix = o.mix || 0;
      var out = src.map(function (a) { var x = new Float32Array(a.length); for (var i = 0; i < a.length; i++) x[i] = w[i] + a[i] * mix; return x; });
      return fromChans(out);
    },
    phrases: function (b, o) {
      var ps = findPauses(b), cut = ps.length >= o.n ? ps[o.n - 1] : b.length;
      return fromChans(chans(b).map(function (a) { return fadeEdges(a.slice(0, cut), 0.02); }));
    },
    applause: function (b) {
      var ap = applauseArr(3.2), gap = Math.floor(SR * 0.25), src = chans(b), n = b.length + gap + ap.length + Math.floor(SR * 0.6);
      return fromChans(src.map(function (a) { var o = new Float32Array(n); o.set(a, 0); for (var i = 0; i < ap.length; i++) o[b.length + gap + i] = ap[i]; return o; }));
    },
    speakers: function (b) {
      var ps = findPauses(b), src = chans(b), n = b.length, L = new Float32Array(n), R = new Float32Array(n), last = 0;
      var mono = src[0];
      for (var k = 0; k <= ps.length; k++) {
        var end = k < ps.length ? ps[k] : n, seg = mono.slice(last, end);
        if (k % 2 === 1 && seg.length > 4096) {
          var sh = pitchArr([seg], -4)[0], s2 = new Float32Array(seg.length); s2.set(sh.subarray(0, Math.min(sh.length, seg.length)));
          seg = s2;
        }
        var gl = k % 2 === 0 ? 1 : 0.45, gr = k % 2 === 0 ? 0.45 : 1;
        for (var i = 0; i < seg.length; i++) { L[last + i] = seg[i] * gl; R[last + i] = seg[i] * gr; }
        last = end;
      }
      return fromChans([L, R]);
    },
    stutter: function (b, o) {
      var src = chans(b), n = b.length, slice = Math.floor(SR * 60 / (o.bpm || 100) / 4), r = rng(42);
      var out = src.map(function () { return new Float32Array(n); });
      function put(from, to, len, rev, g) {
        var f = Math.min(132, len >> 2);
        for (var c = 0; c < src.length; c++) {
          var s = src[c], oc = out[c];
          for (var i = 0; i < len && to + i < n; i++) {
            var si = rev ? from + len - 1 - i : from + i; if (si >= n) break;
            var e = i < f ? i / f : (i > len - f ? (len - i) / f : 1);
            oc[to + i] = s[si] * e * g;
          }
        }
      }
      var w = 0;
      while (w < n) {
        var p = r();
        if (p < 0.5) { put(w, w, slice * 2, false, 1); w += slice * 2; }
        else if (p < 0.72) { var sub = slice >> 1; for (var q = 0; q < 4; q++) put(w, w + q * sub, sub, false, 1); w += slice * 2; }
        else if (p < 0.84) { var s4 = slice >> 2; for (var q2 = 0; q2 < 8; q2++) put(w, w + q2 * s4, s4, false, 0.4 + q2 * 0.08); w += slice * 2; }
        else if (p < 0.95) { put(w, w, slice * 2, true, 1); w += slice * 2; }
        else w += slice;
      }
      return fromChans(out);
    },
    fade: function (b) {
      return fromChans(chans(b).map(function (a) {
        var o = a.slice(), n = o.length, f = Math.floor(n * 0.3);
        for (var i = 0; i < f; i++) { o[i] *= i / f; o[n - 1 - i] *= i / f; }
        return o;
      }));
    }
  };
  var _proc = {};
  function procBuf(key, b, ops) {
    if (!ops || !ops.length) return Promise.resolve(b);
    var k = key + JSON.stringify(ops);
    if (!_proc[k]) {
      _proc[k] = new Promise(function (res) {
        setTimeout(function () {
          var out = b;
          for (var i = 0; i < ops.length; i++) { try { out = PROC[ops[i].op](out, ops[i]); } catch (e) { /* 실패한 가공은 건너뜀 */ } }
          res(out);
        }, 0);
      });
    }
    return _proc[k];
  }

  var _peaks = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function peaksOf(b, n) {
    var hit = _peaks && _peaks.get(b);
    if (hit && hit.length === n) return hit;
    var d = b.getChannelData(0), per = Math.max(1, Math.floor(d.length / n)), out = new Float32Array(n), mx = 0;
    for (var i = 0; i < n; i++) {
      var m = 0;
      for (var j = i * per; j < (i + 1) * per && j < d.length; j += 3) { var v = Math.abs(d[j]); if (v > m) m = v; }
      out[i] = m; if (m > mx) mx = m;
    }
    if (mx > 0) for (var k = 0; k < n; k++) out[k] /= mx;
    if (_peaks) _peaks.set(b, out);
    return out;
  }

  /* ───────────── 신스 악기 ───────────── */
  function envG(g, t, a, pk, decTo, decT, end, rel) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk, t + a);
    if (decT) g.gain.setTargetAtTime(pk * decTo, t + a, decT);
    g.gain.setTargetAtTime(0, Math.max(end, t + a), rel);
  }
  function vib(c, param, t, stop, rate, depth, delay) {
    var lf = osc(c, 'sine', rate, t, stop), lg = gainN(c, 0);
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(depth, t + (delay || 0.3));
    lf.connect(lg); lg.connect(param);
  }

  var _ks = {};
  function ksBuf(m, dur, damp, bright) {
    var key = m + '|' + dur + '|' + damp + '|' + bright;
    if (_ks[key]) return _ks[key];
    var P = SR / mtof(m), L = Math.max(2, Math.round(P - 0.5));
    var n = Math.floor(dur * SR), b = mkBuf(1, n), o = b.getChannelData(0);
    var line = new Float32Array(L), r = rng(m * 31 + 7), lp = 0, i;
    for (i = 0; i < L; i++) { var nz = r() * 2 - 1; lp += (nz - lp) * bright; line[i] = lp; }
    var mean = 0; for (i = 0; i < L; i++) mean += line[i]; mean /= L;
    for (i = 0; i < L; i++) line[i] -= mean;
    var idx = 0;
    for (var j = 0; j < n; j++) {
      var nx = idx + 1 === L ? 0 : idx + 1, y = line[idx];
      line[idx] = damp * 0.5 * (line[idx] + line[nx]);
      o[j] = y; idx = nx;
    }
    normalize(o, 0.8); fadeEdges(o, 0.004);
    var f = Math.min(n >> 2, Math.floor(SR * 0.05));
    for (i = 0; i < f; i++) o[n - 1 - i] *= i / f;
    _ks[key] = b; return b;
  }
  function ks(c, out, t, d, m, v, o) {
    var len = o.len || 2.5, b = ksBuf(m, len, o.damp || 0.996, o.bright || 0.6);
    var s = c.createBufferSource(); s.buffer = b;
    var g = gainN(c, 0), node = s;
    if (o.lp) { var f = filt(c, 'lowpass', o.lp, 0.7); s.connect(f); node = f; }
    node.connect(g); g.connect(out);
    g.gain.setValueAtTime(v * (o.g || 0.6), t);
    g.gain.setTargetAtTime(0, t + Math.max(d, o.min || 0.05), o.rel || 0.15);
    if (o.bend) { s.playbackRate.setValueAtTime(Math.pow(2, o.bend / 12), t); s.playbackRate.linearRampToValueAtTime(1, t + 0.09); }
    if (o.vib) vib(c, s.playbackRate, t, t + len, 5.2, o.vib, 0.25);
    s.start(t); s.stop(t + Math.min(len, d + (o.rel || 0.15) * 6 + 0.05));
    return s;
  }
  function fmKeys(c, out, t, d, m, v, idx, tr, tAmt, dec) {
    var f = mtof(m), stop = t + d + 1.0;
    var car = osc(c, 'sine', f, t, stop), mod = osc(c, 'sine', f, t, stop), mg = gainN(c, 0);
    mod.connect(mg); mg.connect(car.frequency);
    mg.gain.setValueAtTime(f * idx, t); mg.gain.setTargetAtTime(f * idx * 0.15, t, 0.3);
    var g = gainN(c, 0); car.connect(g); g.connect(out);
    envG(g, t, 0.005, 0.32 * v, 0.45, dec || 0.9, t + d, 0.18);
    var tine = osc(c, 'sine', f * tr, t, t + 0.4), tg = gainN(c, 0);
    tg.gain.setValueAtTime(tAmt * v, t); tg.gain.setTargetAtTime(0, t, 0.06);
    tine.connect(tg); tg.connect(out);
  }
  function sawStack(c, dest, f, t, stop, dets, type) {
    for (var i = 0; i < dets.length; i++) osc(c, type || 'sawtooth', f, t, stop, dets[i]).connect(dest);
  }
  function formant(c, src, dest, vowel) {
    var F = { a: [[800, 1], [1150, 0.5], [2900, 0.22]], o: [[450, 1], [800, 0.45], [2830, 0.15]], u: [[325, 1], [700, 0.25], [2530, 0.08]] }[vowel || 'a'];
    for (var i = 0; i < F.length; i++) {
      var bp = filt(c, 'bandpass', F[i][0], 6), g = gainN(c, F[i][1] * 2.2);
      src.connect(bp); bp.connect(g); g.connect(dest);
    }
  }

  var INST = {
    piano: function (c, out, t, d, m, v, L) { pianoCore(c, out, t, d, m, v, 1); },
    grand: function (c, out, t, d, m, v) { pianoCore(c, out, t, d + 0.4, m, v * 1.1, 1.7); },
    pianoX: function (c, out, t, d, m, v, bright) {
      var f = mtof(m), stop = t + d + 0.9, lp = filt(c, 'lowpass', 2000, 0.5), g = gainN(c, 0);
      osc(c, 'triangle', f, t, stop).connect(lp);
      var g2 = gainN(c, 0.3); osc(c, 'sine', f * 2, t, stop, 3).connect(g2); g2.connect(lp);
      var g3 = gainN(c, 0.1 * bright); osc(c, 'sawtooth', f, t, stop, -4).connect(g3); g3.connect(lp);
      lp.frequency.setValueAtTime(Math.min(15000, f * 9 * bright), t);
      lp.frequency.setTargetAtTime(Math.max(500, f * 2.5), t, 0.35);
      lp.connect(g); g.connect(out);
      var dec = clamp(2.6 - (m - 48) * 0.035, 0.5, 3);
      envG(g, t, 0.004, 0.36 * v, 0.2, dec * 0.3, t + d, 0.12);
    },
    felt: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 1.0, lp = filt(c, 'lowpass', Math.min(1100, f * 3), 0.4), g = gainN(c, 0);
      osc(c, 'triangle', f, t, stop).connect(lp);
      var g2 = gainN(c, 0.25); osc(c, 'sine', f * 2, t, stop).connect(g2); g2.connect(lp);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.012, 0.4 * v, 0.3, 0.6, t + d, 0.2);
    },
    rhodes: function (c, out, t, d, m, v) { fmKeys(c, out, t, d, m, v, 1.6, 7.1, 0.05, 1.1); },
    dx: function (c, out, t, d, m, v) { fmKeys(c, out, t, d, m, v, 2.6, 14, 0.09, 0.7); },
    pad: function (c, out, t, d, m, v, L) {
      var f = mtof(m), a = (L && L.att) || 0.35, cut = (L && L.cut) || 1500, stop = t + Math.max(a, d) + 1.4;
      var lp = filt(c, 'lowpass', cut, 0.8), g = gainN(c, 0);
      sawStack(c, lp, f, t, stop, [-11, 0, 9]);
      lp.frequency.setValueAtTime(cut * 0.4, t); lp.frequency.linearRampToValueAtTime(cut, t + a * 2 + 0.01);
      lp.connect(g); g.connect(out);
      var pk = 0.11 * v, hold = Math.max(a, d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.setValueAtTime(pk, t + hold); g.gain.linearRampToValueAtTime(0, t + hold + 1.2);
    },
    supersaw: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.6, lp = filt(c, 'lowpass', 6000, 0.6), g = gainN(c, 0);
      sawStack(c, lp, f, t, stop, [-24, -12, -4, 5, 13, 25]);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.01, 0.07 * v, 0.8, 0.3, t + d, 0.12);
    },
    strings: function (c, out, t, d, m, v, L) {
      var f = mtof(m), a = (L && L.att) || 0.18, stop = t + d + 1.2, lp = filt(c, 'lowpass', 3200, 0.5), g = gainN(c, 0);
      var o1 = osc(c, 'sawtooth', f, t, stop, -6), o2 = osc(c, 'sawtooth', f, t, stop, 7);
      o1.connect(lp); o2.connect(lp);
      vib(c, o1.frequency, t, stop, 5.3, f * 0.006, 0.35); vib(c, o2.frequency, t, stop, 4.9, f * 0.006, 0.35);
      lp.connect(g); g.connect(out);
      var pk = 0.12 * v, hold = Math.max(a, d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.setValueAtTime(pk, t + hold); g.gain.setTargetAtTime(0, t + hold, 0.25);
    },
    stacc: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + 0.4, lp = filt(c, 'lowpass', 2600, 0.6), g = gainN(c, 0);
      sawStack(c, lp, f, t, stop, [-5, 6]);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.008, 0.16 * v, 0.3, 0.06, t + Math.min(d, 0.12), 0.04);
    },
    brass: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.6, lp = filt(c, 'lowpass', 400, 1.2), g = gainN(c, 0);
      sawStack(c, lp, f, t, stop, [-7, 6]);
      lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 7), t + 0.05); lp.frequency.setTargetAtTime(f * 3, t + 0.06, 0.2);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.03, 0.15 * v, 0.7, 0.2, t + d, 0.09);
    },
    organ: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.4, g = gainN(c, 0), hs = [[1, 0.5], [2, 0.35], [3, 0.2], [4, 0.15], [6, 0.08]];
      for (var i = 0; i < hs.length; i++) { var gg = gainN(c, hs[i][1]); osc(c, 'sine', f * hs[i][0], t, stop).connect(gg); gg.connect(g); }
      g.connect(out);
      envG(g, t, 0.008, 0.16 * v, 1, 0, t + d, 0.04);
    },
    lead: function (c, out, t, d, m, v, L) {
      var f = mtof(m), stop = t + d + 0.6, lp = filt(c, 'lowpass', 2600, 0.8), g = gainN(c, 0);
      var o1 = osc(c, 'sawtooth', f, t, stop), o2 = osc(c, 'triangle', f * 2, t, stop, 4), g2 = gainN(c, 0.4);
      o1.connect(lp); o2.connect(g2); g2.connect(lp);
      if (d > 0.3) { vib(c, o1.frequency, t, stop, 5.5, f * 0.008, 0.25); }
      lp.connect(g); g.connect(out);
      envG(g, t, 0.012, 0.16 * v, 0.75, 0.2, t + d, 0.07);
    },
    saw: function (c, out, t, d, m, v, L) {
      var f = mtof(m), stop = t + d + 0.4, lp = filt(c, 'lowpass', (L && L.lp2) || 3500, (L && L.q) || 1), g = gainN(c, 0);
      osc(c, 'sawtooth', f, t, stop).connect(lp); osc(c, 'sawtooth', f, t, stop, 9).connect(lp);
      lp.frequency.setValueAtTime(Math.min(12000, f * 10), t); lp.frequency.setTargetAtTime(f * 3, t, 0.08);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.004, 0.12 * v, 0.5, 0.1, t + d, 0.05);
    },
    square: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.3, lp = filt(c, 'lowpass', 4500, 0.5), g = gainN(c, 0);
      osc(c, 'square', f, t, stop).connect(lp); lp.connect(g); g.connect(out);
      envG(g, t, 0.003, 0.08 * v, 0.7, 0.1, t + d, 0.03);
    },
    pluck: function (c, out, t, d, m, v) { ks(c, out, t, d, m, v, { len: 2.4, damp: 0.996, bright: 0.75, g: 0.5, min: 0.6, rel: 0.4 }); },
    nylon: function (c, out, t, d, m, v) { ks(c, out, t, d, m, v, { len: 2.2, damp: 0.995, bright: 0.45, lp: 3000, g: 0.55, min: 0.5, rel: 0.35 }); },
    muted: function (c, out, t, d, m, v) { ks(c, out, t, 0.08, m, v, { len: 0.35, damp: 0.96, bright: 0.6, lp: 2200, g: 0.7, rel: 0.03 }); },
    gayageum: function (c, out, t, d, m, v) { ks(c, out, t, d, m, v, { len: 2.6, damp: 0.997, bright: 0.85, g: 0.6, min: 0.9, rel: 0.5, bend: -1.2, vib: 0.013 }); },
    pizz: function (c, out, t, d, m, v) { ks(c, out, t, 0.1, m, v, { len: 0.6, damp: 0.985, bright: 0.5, lp: 2500, g: 0.6, rel: 0.12 }); },
    fuzz: function (c, out, t, d, m, v, L) {
      var f = mtof(m), stop = t + d + 0.4, g = gainN(c, 0);
      osc(c, 'sawtooth', f, t, stop).connect(g); osc(c, 'square', f, t, stop, 8).connect(g);
      g.connect(out);
      envG(g, t, 0.004, 0.14 * v, 0.85, 0.3, t + d, 0.06);
    },
    steel: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 1.0, lp = filt(c, 'lowpass', 2400, 0.6), g = gainN(c, 0);
      var o1 = osc(c, 'sawtooth', f, t, stop), o2 = osc(c, 'triangle', f, t, stop, 5);
      o1.frequency.setValueAtTime(f * 0.89, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.28);
      o2.frequency.setValueAtTime(f * 0.89, t); o2.frequency.exponentialRampToValueAtTime(f, t + 0.28);
      o1.connect(lp); o2.connect(lp);
      vib(c, o1.frequency, t, stop, 5.6, f * 0.01, 0.45); vib(c, o2.frequency, t, stop, 5.6, f * 0.01, 0.45);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.12, 0.14 * v, 0.6, 0.6, t + d, 0.3);
    },
    bell: function (c, out, t, d, m, v, L) {
      var f = mtof(m) * (L && L.det ? Math.pow(2, L.det / 1200) : 1), stop = t + 2.2;
      var car = osc(c, 'sine', f, t, stop), mod = osc(c, 'sine', f * 3.5, t, stop), mg = gainN(c, 0);
      mod.connect(mg); mg.connect(car.frequency);
      mg.gain.setValueAtTime(f * 2.5, t); mg.gain.setTargetAtTime(0, t, 0.25);
      var g = gainN(c, 0); car.connect(g); g.connect(out);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25 * v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, 0.45);
    },
    musicbox: function (c, out, t, d, m, v, L) {
      var f = mtof(m) * (L && L.det ? Math.pow(2, L.det / 1200) : 1), stop = t + 1.6, g = gainN(c, 0);
      osc(c, 'sine', f, t, stop).connect(g);
      var g2 = gainN(c, 0.35); osc(c, 'sine', f * 4.02, t, stop).connect(g2); g2.connect(g);
      var g3 = gainN(c, 0.15); osc(c, 'sine', f * 6.9, t, t + 0.2).connect(g3); g3.connect(g);
      g.connect(out);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * v, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, 0.32);
    },
    choir: function (c, out, t, d, m, v, L) { choirCore(c, out, t, d, m, v, (L && L.vowel) || 'a'); },
    choirX: function (c, out, t, d, m, v, vowel) {
      var f = mtof(m), a = 0.25, stop = t + d + 1.0, src = gainN(c, 1), g = gainN(c, 0);
      var o1 = osc(c, 'sawtooth', f, t, stop, -8), o2 = osc(c, 'sawtooth', f, t, stop, 9);
      o1.connect(src); o2.connect(src);
      vib(c, o1.frequency, t, stop, 5.4, f * 0.007, 0.3); vib(c, o2.frequency, t, stop, 5.0, f * 0.007, 0.3);
      formant(c, src, g, vowel);
      g.connect(out);
      var pk = 0.09 * v, hold = Math.max(a, d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.setValueAtTime(pk, t + hold); g.gain.setTargetAtTime(0, t + hold, 0.18);
    },
    hum: function (c, out, t, d, m, v, L) {
      var lp = filt(c, 'lowpass', 900, 0.5); lp.connect(out);
      choirCore(c, lp, t, d, m, v * 1.4, 'u');
    },
    cowbell: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + 0.5, bp = filt(c, 'bandpass', f * 1.3, 1.6), g = gainN(c, 0);
      osc(c, 'square', f, t, stop).connect(bp); osc(c, 'square', f * 1.48, t, stop).connect(bp);
      bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.3 * v, t); g.gain.setTargetAtTime(0, t + 0.01, 0.09);
    },
    clav: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + 0.4, bp = filt(c, 'bandpass', Math.min(5000, f * 3), 2.5), g = gainN(c, 0);
      osc(c, 'square', f, t, stop).connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.4 * v, t); g.gain.setTargetAtTime(0, t + 0.005, 0.07);
    },
    cello: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 1.5, lp = filt(c, 'lowpass', 900, 0.7), g = gainN(c, 0);
      var o1 = osc(c, 'sawtooth', f, t, stop, -5), o2 = osc(c, 'sawtooth', f, t, stop, 5);
      o1.connect(lp); o2.connect(lp); vib(c, o1.frequency, t, stop, 4.6, f * 0.005, 0.8);
      lp.connect(g); g.connect(out);
      var a = Math.min(1.0, d * 0.4), hold = Math.max(a, d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * v, t + a); g.gain.setValueAtTime(0.16 * v, t + hold); g.gain.linearRampToValueAtTime(0, t + hold + 1.0);
    },
    bass: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.4, lp = filt(c, 'lowpass', 700, 0.7), g = gainN(c, 0);
      osc(c, 'sine', f, t, stop).connect(lp);
      var g2 = gainN(c, 0.5); osc(c, 'triangle', f * 2, t, stop).connect(g2); g2.connect(lp);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.006, 0.55 * v, 0.6, 0.3, t + d * 0.9, 0.05);
    },
    sub: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.3, g = gainN(c, 0);
      osc(c, 'sine', f, t, stop).connect(g); g.connect(out);
      envG(g, t, 0.008, 0.7 * v, 0.85, 0.4, t + d * 0.95, 0.04);
    },
    synbass: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.3, lp = filt(c, 'lowpass', 300, 4), g = gainN(c, 0);
      osc(c, 'sawtooth', f, t, stop).connect(lp); osc(c, 'square', f / 2, t, stop).connect(lp);
      lp.frequency.setValueAtTime(Math.min(3500, f * 18), t); lp.frequency.setTargetAtTime(f * 2.5, t, 0.06);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.004, 0.32 * v, 0.6, 0.12, t + d * 0.9, 0.03);
    },
    pickbass: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.3, lp = filt(c, 'lowpass', 1400, 1), g = gainN(c, 0);
      osc(c, 'sawtooth', f, t, stop).connect(lp); osc(c, 'square', f, t, stop, 6).connect(lp);
      lp.frequency.setValueAtTime(2600, t); lp.frequency.setTargetAtTime(700, t, 0.08);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.003, 0.3 * v, 0.55, 0.15, t + d * 0.9, 0.03);
    },
    reese: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.4, lp = filt(c, 'lowpass', 520, 1.5), g = gainN(c, 0);
      osc(c, 'sawtooth', f, t, stop, -18).connect(lp); osc(c, 'sawtooth', f, t, stop, 18).connect(lp);
      var sg = gainN(c, 0.6); osc(c, 'sine', f, t, stop).connect(sg); sg.connect(g);
      vib(c, lp.frequency, t, stop, 0.4, 260, 0.5);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.02, 0.3 * v, 0.9, 0.5, t + d * 0.97, 0.05);
    },
    wob: function (c, out, t, d, m, v, L, n) {
      var f = mtof(m), stop = t + d + 0.3, lp = filt(c, 'lowpass', 500, 9), g = gainN(c, 0), sh = c.createWaveShaper();
      osc(c, 'sawtooth', f, t, stop).connect(lp); osc(c, 'square', f, t, stop, 10).connect(lp);
      var lf = osc(c, 'sine', (n && n.lf) || 4, t, stop), lg = gainN(c, 1300); lf.connect(lg); lg.connect(lp.frequency);
      lp.frequency.setValueAtTime(1400, t);
      sh.curve = curve('tanh', 3); lp.connect(sh); sh.connect(g); g.connect(out);
      var sg = gainN(c, 0.5); osc(c, 'sine', f, t, stop).connect(sg); sg.connect(g);
      envG(g, t, 0.01, 0.35 * v, 1, 0, t + d * 0.97, 0.03);
    },
    upright: function (c, out, t, d, m, v) { ks(c, out, t, d, m, v, { len: 1.2, damp: 0.993, bright: 0.35, lp: 900, g: 1.0, min: 0.25, rel: 0.12 }); },
    slapb: function (c, out, t, d, m, v) {
      var f = mtof(m), stop = t + d + 0.3, lp = filt(c, 'lowpass', 400, 3), g = gainN(c, 0);
      osc(c, 'sawtooth', f, t, stop).connect(lp); osc(c, 'sine', f, t, stop).connect(g);
      lp.frequency.setValueAtTime(m > 48 ? 4200 : 2600, t); lp.frequency.setTargetAtTime(500, t, 0.05);
      lp.connect(g); g.connect(out);
      envG(g, t, 0.002, 0.32 * v, 0.4, 0.12, t + d * 0.85, 0.03);
    },
    b808: function (c, out, t, d, m, v, L, n) {
      var f = mtof(m), stop = t + d + 0.5, o = osc(c, 'sine', f, t, stop), g = gainN(c, 0), sh = c.createWaveShaper();
      o.frequency.setValueAtTime(f * 2.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
      if (n && n.gl) { o.frequency.setValueAtTime(f, t + d * 0.7); o.frequency.exponentialRampToValueAtTime(mtof(n.gl), t + d * 0.7 + 0.09); }
      sh.curve = curve('tanh', (L && L.drive) || 1.6);
      o.connect(g); g.connect(sh); sh.connect(out);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.004);
      g.gain.setTargetAtTime(0.5 * v, t + 0.05, Math.max(0.2, d * 0.5));
      g.gain.setTargetAtTime(0, t + d, 0.06);
    },
    vox: function (c, out, t, d, m, v, L, n) {
      var vb = n && n.vb; if (!vb) return;
      var s = c.createBufferSource(); s.buffer = vb; s.playbackRate.value = Math.pow(2, (m - 67) / 12);
      var g = gainN(c, 0), hp = filt(c, 'highpass', 180, 0.7); s.connect(hp); hp.connect(g); g.connect(out);
      var len = Math.min(d, 0.26);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * v, t + 0.006); g.gain.setValueAtTime(0.9 * v, t + len - 0.02); g.gain.linearRampToValueAtTime(0, t + len);
      s.start(t, n.vo || 0); s.stop(t + len + 0.02);
    }
  };

  function pianoCore(c, out, t, d, m, v, b) { INST.pianoX(c, out, t, d, m, v, b); }
  function choirCore(c, out, t, d, m, v, w) { INST.choirX(c, out, t, d, m, v, w); }

  /* ───────────── 드럼 ───────────── */
  function nz(c, t, dur, dest, type, f, q, v, dec, att) {
    var s = noiseSrc(c, t, dur), fl = filt(c, type, f, q), g = gainN(c, 0);
    s.connect(fl); fl.connect(g); g.connect(dest);
    if (att) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + att); }
    else g.gain.setValueAtTime(v, t);
    g.gain.setTargetAtTime(0, t + (att || 0), dec);
    return g;
  }
  var DRUM = {
    k: function (c, out, t, v) {
      var o = osc(c, 'sine', 160, t, t + 0.6), g = gainN(c, 0);
      o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
      o.connect(g); g.connect(out);
      g.gain.setValueAtTime(1.0 * v, t); g.gain.setTargetAtTime(0, t + 0.02, 0.13);
      nz(c, t, 0.02, out, 'highpass', 2500, 0.7, 0.18 * v, 0.004);
    },
    s: function (c, out, t, v, S) {
      var o = osc(c, 'triangle', 190, t, t + 0.25), g = gainN(c, 0);
      o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      o.connect(g); g.connect(out); g.gain.setValueAtTime(0.45 * v, t); g.gain.setTargetAtTime(0, t, 0.045);
      nz(c, t, 0.35, out, 'highpass', 1400, 0.6, 0.5 * v, 0.06);
      if (S && S.gated) {
        var gg = nz(c, t, 0.4, out, 'bandpass', 2600, 0.5, 0.0, 0.03, 0.01);
        gg.gain.cancelScheduledValues(t);
        gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.38 * v, t + 0.012);
        gg.gain.linearRampToValueAtTime(0.3 * v, t + 0.27); gg.gain.linearRampToValueAtTime(0, t + 0.29);
      }
    },
    c: function (c, out, t, v) {
      for (var i = 0; i < 3; i++) nz(c, t + i * 0.011, 0.03, out, 'bandpass', 1300, 1.1, 0.5 * v, 0.006);
      nz(c, t + 0.03, 0.3, out, 'bandpass', 1300, 1.0, 0.45 * v, 0.07);
    },
    h: function (c, out, t, v) { nz(c, t, 0.12, out, 'highpass', 7500, 0.8, 0.22 * v, 0.018); },
    o: function (c, out, t, v) { nz(c, t, 0.5, out, 'highpass', 7000, 0.8, 0.18 * v, 0.11); },
    y: function (c, out, t, v) { nz(c, t, 0.9, out, 'bandpass', 6500, 0.9, 0.16 * v, 0.2); var g = gainN(c, 0.025 * v); osc(c, 'sine', 3400, t, t + 0.6).connect(g); g.connect(out); g.gain.setTargetAtTime(0, t, 0.15); },
    sh: function (c, out, t, v) { nz(c, t, 0.14, out, 'bandpass', 6000, 1.1, 0.16 * v, 0.03, 0.012); },
    r: function (c, out, t, v) {
      var g = gainN(c, 0); osc(c, 'triangle', 820, t, t + 0.08).connect(g); g.connect(out);
      g.gain.setValueAtTime(0.3 * v, t); g.gain.setTargetAtTime(0, t, 0.012);
      nz(c, t, 0.05, out, 'bandpass', 2200, 2, 0.25 * v, 0.01);
    },
    b: function (c, out, t, v) { var g = nz(c, t, 0.4, out, 'bandpass', 2800, 0.5, 0.2 * v, 0.07, 0.03); return g; },
    p: function (c, out, t, v) {
      var o = osc(c, 'sine', 360, t, t + 0.3), g = gainN(c, 0); o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(330, t + 0.05);
      o.connect(g); g.connect(out); g.gain.setValueAtTime(0.4 * v, t); g.gain.setTargetAtTime(0, t, 0.05);
    },
    q: function (c, out, t, v) {
      var o = osc(c, 'sine', 230, t, t + 0.4), g = gainN(c, 0); o.frequency.setValueAtTime(250, t); o.frequency.exponentialRampToValueAtTime(205, t + 0.06);
      o.connect(g); g.connect(out); g.gain.setValueAtTime(0.45 * v, t); g.gain.setTargetAtTime(0, t, 0.07);
    },
    t: function (c, out, t, v) {
      var o = osc(c, 'sine', 95, t, t + 1.5), g = gainN(c, 0); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.25);
      o.connect(g); g.connect(out); g.gain.setValueAtTime(1.0 * v, t); g.gain.setTargetAtTime(0, t + 0.03, 0.3);
      nz(c, t, 0.5, out, 'lowpass', 500, 0.7, 0.45 * v, 0.09);
    },
    m: function (c, out, t, v) { for (var i = 0; i < 3; i++) nz(c, t + i * 0.018, 0.1, out, 'highpass', 6500, 1, 0.2 * v * (1 - i * 0.25), 0.03); },
    w: function (c, out, t, v) { INST.cowbell(c, out, t, 0.2, 73, v * 1.2); },
    x: function (c, out, t, v) { var g = gainN(c, 0); osc(c, 'sine', 2100, t, t + 0.05).connect(g); g.connect(out); g.gain.setValueAtTime(0.18 * v, t); g.gain.setTargetAtTime(0, t, 0.006); },
    cr: function (c, out, t, v) { nz(c, t, 2.4, out, 'highpass', 4200, 0.6, 0.3 * v, 0.5); }
  };

  /* ───────────── 시퀀서: 음계·패턴·이벤트 생성 ───────────── */
  var SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11], pentatonic: [0, 2, 4, 7, 9], minpent: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10]
  };
  function sdeg(sc, i) { var n = sc.length, o = Math.floor(i / n); return sc[((i % n) + n) % n] + 12 * o; }

  /* 드럼 패턴: x=강, o=보통, g=고스트 */
  var DP = {
    basic: { k: 'x.......x.o.....', s: '....x.......x...', h: 'o.o.o.o.o.o.o.o.' },
    four: { k: 'x...x...x...x...', c: '....x.......x...', o: '..o...o...o...o.', h: 'g.g.g.g.g.g.g.g.' },
    house: { k: 'x...x...x...x...', c: '....x.......x...', o: '..o...o...o...o.', sh: 'gggggggggggggggg' },
    techno: { k: 'x...x...x...x...', c: '....g.......g...', o: '..o...o...o...o.', h: 'gggggggggggggggg', r: '......o.......o.' },
    euro: { k: 'x...x...x...x...', c: '....x.......x...', o: '..x...x...x...x.', h: 'g.g.g.g.g.g.g.g.' },
    kpop: { k: 'x...x...x...x...', c: '....x.......x...', s: '....o.......o...', h: 'ogogogogogogogog' },
    boombap: { k: 'x.......x.x.....', s: '....x.......x...', h: 'o.o.o.o.o.o.o.og' },
    lofi: { k: 'x......xx.......', s: '....x.......x...', h: 'o.g.o.g.o.g.o.g.' },
    trap: { k: 'x......x..x.....', s: '........x.......', c: '........x.......' },
    halftime: { k: 'x.........x.....', s: '........x.......', h: 'o.o.o.o.o.o.o.o.' },
    double: { k: 'x...x...x...x...', s: '..x...x...x...x.', h: 'xgxgxgxgxgxgxgxg' },
    brk: { k: 'x.x.......x.....', s: '....x..g.g..x..g', h: 'o.o.o.o.o.o.o.o.', o: '..............o.' },
    dnb: { k: 'x.........x.....', s: '....x..g....x.g.', h: 'o.o.o.o.o.o.o.o.' },
    dembow: { k: 'x...x...x...x...', s: '...x..x....x..x.', h: 'o.o.o.o.o.o.o.o.' },
    afro: { k: 'x.....x...x.....', s: '...........x....', r: '...x.....x....x.', p: '..x..x.x..x..x.x', sh: 'ogogogogogogogog' },
    bossa: { k: 'x..xx..xx..xx..x', r: 'x..x..x...x..x..', sh: 'gggggggggggggggg' },
    brush: { k: 'x.......x.......', b: 'o.o.o.o.o.o.o.o.', s: '....g.......g...', h: '....o.......o...' },
    jazz: { y: 'x...x.o.x...x.o.', h: '....o.......o...', k: 'g...............', s: '..........g.....' },
    punk: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    drive: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xgxgxgxgxgxgxgxg' },
    funk: { k: 'x..x..x...x..x..', s: '....x..g.g..x..g', h: 'ogogogogogogogog' },
    city: { k: 'x.......x.x.....', s: '....x.......x...', h: 'ogogogogogogogog', o: '..............o.' },
    y2k: { k: 'x..x....x.x.....', s: '....x.......x...', c: '....x.......x...', h: 'ogogogogogogogog' },
    soul60: { k: 'x.......x.......', s: '....x.......x...', m: '....x.......x...', h: 'o.o.o.o.o.o.o.o.' },
    rockabilly: { k: 'x.......x.......', s: '....x.......x...', h: 'o.o.o.o.o.o.o.o.' },
    wash: { k: 'x.......x.o.....', s: '....x.......x...', y: 'o.o.o.o.o.o.o.o.' },
    folk: { k: 'x.......x.......', s: '....g.......g...', m: '....o.......o...', sh: 'o.o.o.o.o.o.o.o.' },
    taiko: { t: 'x.....o.x...o.o.', k: 'x.......x.......' },
    cine: { t: 'x.......x..o.o..', s: '................' },
    tense: { x: 'o.o.o.o.o.o.o.o.', k: 'x.......x.......' },
    polybase: { k: 'x.......x.......', sh: 'o.o.o.o.o.o.o.o.' },
    sparse: { k: 'x...............' },
    m12: { k: 'x...........', s: '......x.....', h: 'o.o.o.o.o.o.' },
    waltz: { k: 'x...........', s: '....g...g...', h: '....o...o...' },
    m20: { k: 'x.....x...x.........', s: '....x.......x...x...', h: 'o.o.o.o.o.o.o.o.o.o.' },
    m14: { k: 'x.......x.....', s: '....x......x..', h: 'o.o.o.o.o.o.o.' }
  };
  var DKO = { basic: '기본 비트', four: '포온더플로어', house: '하우스 비트', techno: '테크노 비트', euro: '유로댄스 비트', kpop: '댄스 비트', boombap: '붐뱁 드럼', lofi: '로파이 드럼', trap: '트랩 비트', halftime: '하프타임', double: '더블타임', brk: '브레이크비트', dnb: 'DnB 브레이크', dembow: '뎀보우 리듬', afro: '아프로 리듬', bossa: '보사노바 리듬', brush: '브러시 드럼', jazz: '스윙 라이드', punk: '8비트 록', drive: '드라이빙 비트', funk: '펑키 그루브', city: '시티팝 비트', y2k: 'R&B 그루브', soul60: '탬버린 비트', rockabilly: '셔플 비트', wash: '심벌 워시', folk: '어쿠스틱 퍼커션', taiko: '타이코', cine: '타이코', tense: '째깍 리듬', polybase: '3:2 폴리리듬', sparse: '킥 하나' };

  var CP = {
    pop: [[0, 8], [8, 8]], block: [[0, 16]], quarter: [[0, 4], [4, 4], [8, 4], [12, 4]],
    eighth: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    stab: [[2, 1.5], [6, 1.5], [10, 1.5], [14, 1.5]], skank: [[4, 1.5], [12, 1.5]],
    house: [[0, 2], [3, 2], [7, 1], [10, 2], [14, 1]], lofi: [[0, 7], [7, 9]], stab2: [[0, 3], [10, 3]],
    bossa: [[0, 3], [3, 3], [6, 4], [10, 3], [13, 3]], charleston: [[0, 3], [6, 3], [12, 2]],
    city: [[0, 3], [3, 3], [8, 2], [11, 5]], kpop: [[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]],
    syncop: [[0, 2], [3, 1], [6, 2], [10, 1], [11, 3], [14, 2]],
    chop: [[0, 1], [2, 1], [3, 1], [6, 1], [8, 1], [10, 1], [11, 1], [14, 1]],
    brass: [[0, 2], [3, 1.5], [12, 2]], fanfare: [[0, 4], [4, 2], [6, 2], [8, 8]], cine: [[0, 6], [10, 6]],
    sparse: [[0, 16]], waltz: [[4, 4], [8, 4]], m12: [[0, 6], [6, 6]], m20: [[0, 12], [12, 8]], m14: [[0, 4], [4, 4], [8, 6]]
  };
  var BP = {
    root: [[0, 6, 0], [8, 5, 0], [14, 2, 0]], eighth: [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 0], [14, 2, 0]],
    offbeat: [[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 0]], house: [[2, 2, 0], [6, 1, 0], [7, 1, 12], [10, 2, 0], [14, 1, 7]],
    rolling: [[1, 1, 0], [2, 1, 0], [3, 1, 0], [5, 1, 0], [6, 1, 0], [7, 1, 0], [9, 1, 0], [10, 1, 0], [11, 1, 0], [13, 1, 0], [14, 1, 0], [15, 1, 0]],
    slap: [[0, 2, 0], [3, 1, 12], [6, 2, 0], [8, 1, 0], [10, 1, 12], [11, 1, 7], [14, 2, 12]],
    b808: [[0, 7, 0], [7, 3, 0], [10, 6, 0]], sustain: [[0, 16, 0]], half: [[0, 8, 0], [8, 8, 0]],
    syncop: [[0, 3, 0], [3, 3, 0], [6, 2, 7], [8, 3, 0], [11, 3, 0], [14, 2, 12]], dembow: [[0, 3, 0], [3, 3, 0], [8, 3, 0], [11, 3, 0]],
    pp: [[0, 2, 0], [2, 2, 0], [4, 2, 12], [6, 2, 0], [8, 2, 7], [10, 2, 0], [12, 2, 12], [14, 2, 10]],
    bossa: [[0, 6, 0], [6, 2, 7], [8, 6, 7], [14, 2, 0]], waltz: [[0, 4, 0]],
    boogie: [[0, 2, 0], [2, 2, 4], [4, 2, 7], [6, 2, 9], [8, 2, 10], [10, 2, 9], [12, 2, 7], [14, 2, 4]]
  };
  var MR = {
    pop: [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]], sparse: [[0, 6], [8, 8]],
    fast: [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 1], [13, 1], [14, 2]],
    hook: [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]], chant: [[0, 8], [8, 8]], long: [[0, 16]],
    city: [[0, 2], [3, 3], [6, 2], [10, 2], [12, 4]], waltz: [[0, 6], [6, 2], [8, 4]]
  };

  function baseSong() {
    return {
      bpm: 100, root: 60, mode: 'major', mel: null, prog: [0, 4, 5, 3], ext: 0, ch: 'triad', chords: null,
      meter: 4, unit: 1, swing: 0, shuffle: 0, human: 0.5, bars: 0,
      drums: 'basic', dv: 0.85, hats: '', kit: {}, fill: true, crash: false,
      layers: [
        { role: 'chord', inst: 'piano', pat: 'pop', vol: 0.6 },
        { role: 'bass', inst: 'bass', pat: 'root', vol: 0.55 }
      ],
      rev: 0.16, revType: 'room', drumRev: 0.06, pump: 0, gated: false, poly: false, tr: 0, weird: 0, seed: 3, master: 0.9, sec: null, g: 0, chops: 0
    };
  }
  function lay(S, role) { for (var i = 0; i < S.layers.length; i++) if (S.layers[i].role === role) return S.layers[i]; return null; }
  function setLay(S, role, o) { var l = lay(S, role); if (!l) { l = { role: role }; S.layers.push(l); } for (var k in o) l[k] = o[k]; return l; }
  function setIf(S, role, o) { var l = lay(S, role); if (l) for (var k in o) l[k] = o[k]; return l; }
  function noLay(S, role) { S.layers = S.layers.filter(function (l) { return l.role !== role; }); }
  function Ly(role, inst, pat, vol, x) { var o = { role: role, inst: inst, pat: pat, vol: vol }; if (x) for (var k in x) o[k] = x[k]; return o; }
  function kindOf(role) { return { chord: 'c', pad: 'c', ch2: 'c', ch3: 'c', arp: 'a', arp2: 'a', mel: 'm', mel2: 'm', bass: 'b', drone: 'd', ost: 'o' }[role] || 'c'; }

  function barSteps(S) { return Math.round(S.meter * S.unit * 4); }
  function stepDur(S) { return 60 / S.bpm / 4; }
  function autoBars(S) { var bd = barSteps(S) * stepDur(S), n = S.prog.length; while (n * bd < 7 && n < 16) n *= 2; return n; }

  function tAt(S, tb, s, st) {
    var p = ((s % 4) + 4) % 4, pi = Math.floor(p), off = 0;
    if (S.unit === 1) {
      if (pi === 1 || pi === 3) off += S.swing;
      off += S.shuffle * [0, 1, 2, 1][pi];
    }
    return tb + (s + off) * st;
  }

  function chordNotes(S, bi) {
    var base = S.root + S.tr, sc = SCALES[S.mode] || SCALES.major, semis, d, r0, i;
    if (sc.length !== 7) sc = SCALES.major;
    if (S.chords) semis = S.chords[bi % S.chords.length].slice();
    else {
      d = S.prog[bi % S.prog.length]; r0 = sdeg(sc, d);
      if (S.ch === 'power') semis = [r0, r0 + 7, r0 + 12];
      else if (S.ch === 'sus') semis = [r0, sdeg(sc, d + 3), sdeg(sc, d + 4)];
      else if (S.ch === 'sus2') semis = [r0, sdeg(sc, d + 1), sdeg(sc, d + 4)];
      else {
        semis = [r0, sdeg(sc, d + 2), sdeg(sc, d + 4)];
        if (S.ext >= 7) semis.push(sdeg(sc, d + 6));
        if (S.ext >= 9) semis.push(sdeg(sc, d + 8));
        if (S.ch === 'cluster') semis.push(r0 + 1, r0 + 6);
      }
    }
    var root = base + semis[0], out = [], lo = S.vlo || 53;
    if (S.ch === 'power') {
      var n0 = root; while (n0 < 45) n0 += 12; while (n0 > 56) n0 -= 12;
      out = [n0, n0 + 7, n0 + 12];
    } else {
      for (i = 0; i < semis.length; i++) {
        var n = base + semis[i];
        while (n < lo) n += 12; while (n > lo + 17) n -= 12;
        if (out.indexOf(n) < 0) out.push(n);
      }
      out.sort(function (a, b) { return a - b; });
    }
    var pcs = semis.map(function (x) { return (((x + base) % 12) + 12) % 12; });
    return { notes: out, root: root, pcs: pcs };
  }
  function foldTo(n, lo) { while (n < lo) n += 12; while (n >= lo + 12) n -= 12; return n; }

  function genEvents(S0, vinfo) {
    var ev = { notes: [], drums: [], secs: [], auto: [], len: 0, layers: [] };
    var secs = S0.sec && S0.sec.length ? S0.sec : [{ bars: S0.bars || autoBars(S0) }];
    var t = 0, barNo = 0, ms;
    for (var i = 0; i < secs.length; i++) {
      var sd = secs[i], S = clone(S0); S.sec = null; ms = {};
      if (sd.ap && AP[sd.ap]) AP[sd.ap](S);
      if (sd.type && SEC[sd.type]) SEC[sd.type](S, sd);
      var nb = sd.bars || 2, bd = barSteps(S) * stepDur(S), t1 = t + nb * bd;
      var base = ev.layers.length, n0 = ev.notes.length;
      for (var li = 0; li < S.layers.length; li++) ev.layers.push(S.layers[li]);
      genBars(S, t, nb, barNo, ev, ms, vinfo, i === secs.length - 1);
      for (var ni = n0; ni < ev.notes.length; ni++) ev.notes[ni].L += base;
      if (secs.length > 1) {
        var lp = S.aLp || [20000, 20000], ga = S.aGain || [1, 1];
        ev.auto.push({ type: 'lp', t0: t, t1: t1, a: lp[0], b: lp[1] });
        ev.auto.push({ type: 'gain', t0: t, t1: t1, a: ga[0], b: ga[1] });
      } else {
        if (S.aLp) ev.auto.push({ type: 'lp', t0: t, t1: t1, a: S.aLp[0], b: S.aLp[1] });
        if (S.aGain) ev.auto.push({ type: 'gain', t0: t, t1: t1, a: S.aGain[0], b: S.aGain[1] });
      }
      if (S.riser) ev.auto.push({ type: 'riser', t0: t, t1: t1 });
      if (S.crash || sd.crash) ev.drums.push({ t: t, k: 'cr', v: 0.9 });
      ev.secs.push({ label: sd.label || '', t0: t, t1: t1, hl: !!sd.hl });
      barNo += nb; t = t1;
    }
    ev.len = t;
    return ev;
  }

  function genBars(S, t0, nb, barNo, ev, ms, vinfo, lastSec) {
    var st = stepDur(S), steps = barSteps(S), bd = steps * st, hr = rng(S.seed * 1009 + barNo * 13 + 5);
    function hum() { return (hr() - 0.5) * 0.014 * S.human; }
    for (var b = 0; b < nb; b++) {
      var bi = b, tb = t0 + b * bd, ch = chordNotes(S, bi), nextCh = chordNotes(S, bi + 1);
      for (var li = 0; li < S.layers.length; li++) {
        var L = S.layers[li], k = kindOf(L.role), vol = 1;
        if (L.mute) continue;
        if (k === 'c') {
          var pat = CP[L.pat || 'pop'] || CP.pop;
          if (steps !== 16) pat = (steps === 12 && L.pat === 'waltz') ? CP.waltz : (CP['m' + steps] || [[0, steps]]);
          for (var pi = 0; pi < pat.length; pi++) {
            var ts = Math.max(0, tAt(S, tb, pat[pi][0], st) + hum()), dur = pat[pi][1] * st * (L.leg || 0.95);
            var notes = ch.notes;
            if (L.oct) notes = notes.map(function (x) { return x + 12 * L.oct; });
            if (L.top) notes = notes.slice(-L.top);
            for (var q = 0; q < notes.length; q++) ev.notes.push({ t: ts + q * (L.strum || 0), d: dur, m: notes[q], v: (pi === 0 ? 1 : 0.82) * vol, i: L.inst, L: li });
          }
        } else if (k === 'a') {
          var pool = ch.notes.map(function (x) { return x + 12 * (L.oct == null ? 1 : L.oct); });
          var ext = pool.concat(pool.map(function (x) { return x + 12; }));
          var ap = L.pat || '16up', every = (ap === '8up' || ap === 'broken' || ap === 'travis') ? 2 : 1, kk = 0;
          var mask = L.mask || null;
          for (var s = 0; s < steps; s += every, kk++) {
            if (mask && mask.charAt(s % mask.length) === '.') continue;
            var m;
            if (ap === 'updown16' || ap === 'broken') { var cyc = Math.max(1, ext.length * 2 - 2), qq = kk % cyc; m = ext[qq < ext.length ? qq : cyc - qq]; }
            else if (ap === 'travis') {
              if (kk % 2 === 0) { var bassR = foldTo(ch.root, 40); m = (kk % 4 === 0) ? bassR : bassR + 7; }
              else m = pool[Math.min(pool.length - 1, 1 + ((kk >> 1) % Math.max(1, pool.length - 1)))];
            }
            else if (ap === 'tremolo') m = pool[pool.length - 1 - (Math.floor(kk / 4) % pool.length)];
            else if (ap === 'random16') { var rr0 = rng(S.seed + bi * 31 + kk)(); m = ext[Math.floor(rr0 * ext.length)]; }
            else m = ext[kk % ext.length];
            ev.notes.push({ t: Math.max(0, tAt(S, tb, s, st) + hum()), d: every * st * (L.leg || 0.8), m: m, v: s % 4 === 0 ? 1 : 0.72, i: L.inst, L: li });
          }
        } else if (k === 'm') {
          genMel(S, L, li, tb, steps, st, ch, ev, bi, ms, vinfo, hum);
        } else if (k === 'b') {
          var lo = 36 + 12 * (L.oct || 0), r = foldTo(ch.root, lo), bpz = L.pat || 'root';
          if (bpz === 'walk' && steps === 16) {
            var nr = foldTo(nextCh.root, lo), tones = [r, r + (ch.notes.length > 1 ? ((ch.pcs[1] - ch.pcs[0] + 12) % 12) : 4), r + 7, nr + (nr > r ? -1 : 1)];
            for (var w = 0; w < 4; w++) ev.notes.push({ t: Math.max(0, tAt(S, tb, w * 4, st) + hum()), d: 3.6 * st, m: tones[w], v: w === 0 ? 1 : 0.85, i: L.inst, L: li });
          } else {
            var bp = BP[bpz] || BP.root;
            if (steps !== 16) bp = steps === 12 ? (L.pat === 'waltz' ? BP.waltz : [[0, 6, 0], [6, 6, 7]]) : (steps === 20 ? [[0, 6, 0], [6, 6, 7], [12, 8, 0]] : [[0, 4, 0], [4, 4, 7], [8, 6, 0]]);
            for (var bq = 0; bq < bp.length; bq++) {
              var off = bp[bq][2], mm = r + off;
              if (off === 4 || off === 9) mm = r + ((ch.pcs.length > 1 && ((ch.pcs[1] - ch.pcs[0] + 12) % 12) === 3) ? off - 1 : off);
              var nn = { t: Math.max(0, tAt(S, tb, bp[bq][0], st) + hum()), d: bp[bq][1] * st * 0.92, m: mm, v: bq === 0 ? 1 : 0.85, i: L.inst, L: li };
              if (L.slide && bq === bp.length - 1 && foldTo(nextCh.root, lo) !== r) nn.gl = foldTo(nextCh.root, lo);
              if (L.inst === 'wob') nn.lf = S.bpm / 60 * [1, 2, 3, 4][(bi + bq) % 4];
              ev.notes.push(nn);
            }
          }
        } else if (k === 'd') {
          if (b === 0) ev.notes.push({ t: tb, d: nb * bd, m: foldTo(S.root + S.tr, 36 + 12 * (L.oct || 0)), v: 1, i: L.inst, L: li });
        } else if (k === 'o') {
          var oseq = [0, 0, 12, 0, 7, 0, 8, 0], or0 = foldTo(ch.root, 50 + 12 * (L.oct || 0));
          for (var os = 0; os < steps; os++) ev.notes.push({ t: tAt(S, tb, os, st), d: st * 0.5, m: or0 + oseq[os % 8], v: os % 4 === 0 ? 1 : 0.7, i: L.inst, L: li });
        }
      }
      genDrums(S, tb, steps, st, bi, b === nb - 1, b, nb, ev, hum, lastSec);
    }
  }

  function genMel(S, L, li, tb, steps, st, ch, ev, bi, ms, vinfo, hum) {
    var rhy = MR[L.pat || 'pop'] || MR.pop, i;
    if (L.pat === 'solo') { rhy = []; for (i = 0; i < steps; i++) if (i % 4 !== 3 || i % 8 === 7) rhy.push([i, 1]); }
    else if (steps !== 16) {
      if (steps === 12) rhy = MR.waltz;
      else { rhy = []; for (i = 0; i < steps; i += 2) rhy.push([i, 2]); }
    }
    var sc = SCALES[L.scale || S.mel || S.mode] || SCALES.major, base = S.root + S.tr, lo = (L.lo || 67) + S.tr, hi = lo + (L.span || 14);
    var cand = [];
    for (var m = lo; m <= hi; m++) { var pc = (((m - base) % 12) + 12) % 12; if (sc.indexOf(pc) >= 0) cand.push(m); }
    if (!cand.length) return;
    var key = 'm' + li, st0 = ms[key] || (ms[key] = { prev: null, dir: 1 });
    var cyc = L.pat === 'hook' ? 2 : 4;
    if (bi % cyc === 0) st0.prev = null;
    var rr = rng(S.seed * 131 + (bi % cyc) * 17 + (L.seed || 0) + (bi % 8 >= 4 && L.pat !== 'hook' ? 5 : 0));
    for (i = 0; i < rhy.length; i++) {
      var s = rhy[i][0], len = rhy[i][1], strong = (s % 8 === 0), pi2;
      if (L.rest && rr() < L.rest && i > 0) continue;
      var pidx = st0.prev == null ? Math.floor(cand.length * 0.45) : nearestIdx(cand, st0.prev), m2;
      if (L.pat === 'solo') {
        if (rr() < 0.2) st0.dir = -st0.dir;
        pi2 = pidx + st0.dir * (rr() < 0.8 ? 1 : 2);
        if (pi2 >= cand.length - 1) st0.dir = -1; if (pi2 <= 0) st0.dir = 1;
        m2 = cand[clamp(pi2, 0, cand.length - 1)];
      } else if (strong || i === 0) {
        var opts = [];
        for (var j = 0; j < cand.length; j++) if (ch.pcs.indexOf(cand[j] % 12) >= 0 && Math.abs(j - pidx) <= 3) opts.push(cand[j]);
        if (!opts.length) for (j = 0; j < cand.length; j++) if (ch.pcs.indexOf(cand[j] % 12) >= 0) opts.push(cand[j]);
        m2 = opts.length ? opts[Math.floor(rr() * opts.length)] : cand[pidx];
      } else {
        var stp = [-2, -1, -1, 1, 1, 2][Math.floor(rr() * 6)];
        if (pidx > cand.length * 0.75) stp = -Math.abs(stp);
        if (pidx < cand.length * 0.25) stp = Math.abs(stp);
        m2 = cand[clamp(pidx + stp, 0, cand.length - 1)];
      }
      var tt = tAt(S, tb, s, st) + hum();
      if (S.weird && rr() < S.weird * 0.6) { m2 += [1, -1, 6, -5, 11][Math.floor(rr() * 5)]; tt += (rr() - 0.5) * st * 2 * S.weird; }
      var n = { t: Math.max(0, tt), d: len * st * (L.leg || 0.9), m: m2, v: strong ? 1 : 0.82, i: L.inst, L: li };
      if (L.inst === 'vox' && vinfo) { n.vb = vinfo.buf; n.vo = vinfo.on[(Math.abs(m2) + i) % vinfo.on.length]; }
      ev.notes.push(n);
      st0.prev = m2;
    }
  }
  function nearestIdx(arr, v) { var b = 0, bd = 1e9; for (var i = 0; i < arr.length; i++) { var d = Math.abs(arr[i] - v); if (d < bd) { bd = d; b = i; } } return b; }

  function genDrums(S, tb, steps, st, bi, isLast, b, nb, ev, hum, lastSec) {
    var kit = S.kit || {}, i;
    function put(k, t, v) { var kv = kit[k] == null ? 1 : kit[k]; if (kv > 0 && v > 0) ev.drums.push({ t: Math.max(0, t), k: k, v: v * kv, pu: S.pump || 0, gt: S.gated ? 1 : 0 }); }
    if (S.roll) {
      for (i = 0; i < steps; i += 4) put('k', tb + i * st, 0.9);
      var prog = (b + 1) / nb, div = b < nb - 1 ? 2 : 1;
      for (i = 0; i < steps; i += div) {
        var vv = 0.25 + 0.75 * ((b * steps + i) / (nb * steps));
        put('s', tb + i * st, vv);
        if (b === nb - 1 && i >= steps - 4) put('s', tb + (i + 0.5) * st, vv);
      }
      return;
    }
    if (!S.drums || S.drums === 'none') return;
    var P = DP[S.drums] || DP.basic;
    if ((P.k || P.t || P.x || P.y || P.b || '').length !== steps) P = DP['m' + steps] || {};
    if (steps === 12 && S.drums === 'waltz') P = DP.waltz;
    for (var lane in P) {
      var str = P[lane];
      if (str.length !== steps) continue;
      if (lane === 'h' && S.hats) continue;
      for (var s = 0; s < steps; s++) {
        var c = str.charAt(s), v = c === 'x' ? 1 : (c === 'o' ? 0.7 : (c === 'g' ? 0.35 : 0));
        if (!v) continue;
        if (S.fill && isLast && lastSec && steps === 16 && s >= 12 && (lane === 's' || lane === 'k' || lane === 'h')) continue;
        put(lane, tAt(S, tb, s, st) + hum(), v);
      }
    }
    if (S.hats === '16') for (i = 0; i < steps; i++) put('h', tAt(S, tb, i, st) + hum(), i % 2 === 0 ? 0.75 : 0.4);
    if (S.hats === '8') for (i = 0; i < steps; i += 2) put('h', tAt(S, tb, i, st) + hum(), 0.7);
    if (S.hats === 'trap') {
      for (i = 0; i < steps; i += 2) {
        var beat = Math.floor(i / 4);
        if (bi % 2 === 1 && beat === 3) continue;
        if (bi % 2 === 0 && beat === 3 && i % 4 === 0) { for (var tr = 0; tr < 6; tr++) put('h', tb + (i + tr * 4 / 6) * st, 0.4 + tr * 0.08); i += 2; continue; }
        put('h', tb + i * st, i % 4 === 0 ? 0.75 : 0.5);
      }
      if (bi % 2 === 1) for (var r32 = 0; r32 < 8; r32++) put('h', tb + (12 + r32 * 0.5) * st, 0.3 + r32 * 0.07);
    }
    if (S.roll8 && b === nb - 1) for (i = 8; i < steps; i += 2) put('s', tb + i * st, 0.4 + i * 0.03);
    if (S.fill && isLast && lastSec && steps === 16) {
      put('k', tb + 12 * st, 0.9);
      for (i = 12; i < 16; i++) put('s', tb + i * st, 0.45 + (i - 12) * 0.17);
    }
    if (S.poly) {
      var bd = steps * st;
      for (i = 0; i < 6; i++) put('p', tb + i * bd / 6, i % 3 === 0 ? 0.9 : 0.6);
      for (i = 0; i < 4; i++) put('q', tb + i * bd / 4, i % 2 === 0 ? 0.9 : 0.65);
    }
  }

  /* ───────────── 오프라인 렌더(루프 꼬리를 앞으로 접어 끊김 없는 루프) ───────────── */
  function wrapTail(buf, len) {
    var L = Math.floor(len * SR), out = [];
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var d = buf.getChannelData(c), o = new Float32Array(L);
      o.set(d.subarray(0, Math.min(L, d.length)));
      for (var i = L; i < d.length; i++) { var j = i - L; if (j < L) o[j] += d[i]; }
      out.push(o);
    }
    return fromChans(out);
  }
  function needsVoice(S) { for (var i = 0; i < S.layers.length; i++) if (S.layers[i].inst === 'vox') return true; return !!S.chops; }
  function voiceInfo(vb) {
    var win = Math.floor(SR / 100), e = envOf(vb, win), on = [], mx = 0, i;
    for (i = 0; i < e.length; i++) if (e[i] > mx) mx = e[i];
    for (i = 2; i < e.length - 30 && on.length < 24; i++) if (e[i] > mx * 0.35 && e[i - 2] < mx * 0.15) { on.push(i * win / SR); i += 25; }
    if (!on.length) on = [0.5, 1.5, 2.5];
    return { buf: vb, on: on };
  }
  function riser(c, dest, t0, t1) {
    var dur = t1 - t0, s = noiseSrc(c, t0, dur), bp = filt(c, 'bandpass', 300, 1.4), g = gainN(c, 0);
    s.connect(bp); bp.connect(g); g.connect(dest);
    bp.frequency.setValueAtTime(250, t0); bp.frequency.exponentialRampToValueAtTime(9000, t1);
    g.gain.setValueAtTime(0.06, t0); g.gain.linearRampToValueAtTime(0.18, t0 + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.55, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
  }

  /* 오프라인 렌더 우선순위: 사용자 클릭 렌더가 진행 중이면 배경 렌더는 0.5초마다 멈춰 기다림 */
  var userPending = 0, freeWaiters = [];
  function userBegin() { userPending++; }
  function userEnd() {
    userPending = Math.max(0, userPending - 1);
    if (!userPending) { var w = freeWaiters; freeWaiters = []; w.forEach(function (f) { try { f(); } catch (e) { /* noop */ } }); }
  }
  function whenFree() { return userPending ? new Promise(function (r) { freeWaiters.push(r); }) : Promise.resolve(); }
  function runOffline(oc, dur, user) {
    if (!user && typeof oc.suspend === 'function') {
      for (var t = 0.5; t < dur - 0.1; t += 0.5) {
        (function (tt) {
          try { var sp = oc.suspend(tt); if (sp && sp.then) sp.then(function () { whenFree().then(function () { try { oc.resume(); } catch (e) { /* noop */ } }); }, function () { /* noop */ }); }
          catch (e) { /* suspend 미지원 */ }
        })(t);
      }
    }
    return oc.startRendering();
  }
  var _songs = {};
  function renderSong(S, user) { return songCached(S, 0, user); }
  function renderSongPart(S, lim) { return songCached(S, lim, true); }
  function songCached(S, limit, user) {
    var key = JSON.stringify(S) + '|' + limit;
    if (_songs[key]) return _songs[key];
    var p = (needsVoice(S) ? loadFile('voice').then(voiceInfo) : Promise.resolve(null)).then(function (vinfo) {
      var ev = genEvents(S, vinfo), tail = 2.5, len = ev.len, notes = ev.notes, drums = ev.drums;
      if (limit && limit < len - 1) {
        notes = notes.filter(function (n) { return n.t < limit; });
        drums = drums.filter(function (d) { return d.t < limit; });
        len = limit; tail = 0.8;
      } else limit = 0;
      var oc = new OfflineAudioContext(2, Math.ceil((len + tail) * SR), SR);
      var master = gainN(oc, S.master), comp = oc.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; comp.knee.value = 8;
      var glp = filt(oc, 'lowpass', 20000, 0.7);
      glp.connect(master); master.connect(comp); comp.connect(oc.destination);
      var rv = oc.createConvolver(); rv.buffer = makeIR(S.revType || 'room'); rv.connect(glp);
      var pump = gainN(oc, 1); pump.connect(glp);
      var LAY = ev.layers;
      var buses = LAY.map(function (L) {
        var g = gainN(oc, L.vol == null ? 0.5 : L.vol), node = g;
        if (L.dist) {
          var sh = oc.createWaveShaper(); sh.curve = curve('fuzz', L.dist); sh.oversample = '2x';
          var post = filt(oc, 'lowpass', L.distLp || 4800, 0.7), pg = gainN(oc, 0.6);
          node.connect(sh); sh.connect(post); post.connect(pg); node = pg;
        }
        if (L.lp) { var f = filt(oc, 'lowpass', L.lp, L.q || 0.8); node.connect(f); node = f; }
        var pan = oc.createStereoPanner(); pan.pan.value = L.pan || 0; node.connect(pan);
        pan.connect(pump);
        var send = gainN(oc, L.rev == null ? S.rev : L.rev); pan.connect(send); send.connect(rv);
        return g;
      });
      var dbus = gainN(oc, S.dv); dbus.connect(glp);
      var ds = gainN(oc, S.drumRev || 0); dbus.connect(ds); ds.connect(rv);
      notes.forEach(function (n) {
        var fn = INST[n.i] || INST.piano;
        if (!buses[n.L]) return;
        try { fn(oc, buses[n.L], n.t, n.d, n.m, n.v, LAY[n.L], n); } catch (e) { /* 개별 음 실패 무시 */ }
      });
      drums.forEach(function (d) { var fn = DRUM[d.k]; if (fn) { try { fn(oc, dbus, d.t, d.v, { gated: d.gt }); } catch (e) { /* skip */ } } });
      if (ev.drums.some(function (d) { return d.k === 'k' && d.pu > 0; })) {
        var bt = 60 / S.bpm;
        pump.gain.setValueAtTime(1, 0);
        ev.drums.forEach(function (d) {
          if (d.k !== 'k' || !(d.pu > 0)) return;
          pump.gain.setValueAtTime(1, Math.max(0, d.t - 0.004));
          pump.gain.linearRampToValueAtTime(1 - d.pu, d.t + 0.01);
          pump.gain.setTargetAtTime(1, d.t + 0.03, bt * 0.16);
        });
      }
      ev.auto.forEach(function (a) {
        if (a.type === 'gain') { master.gain.setValueAtTime(S.master * a.a, a.t0); master.gain.linearRampToValueAtTime(S.master * a.b, a.t1); }
        else if (a.type === 'lp') { glp.frequency.setValueAtTime(a.a, a.t0); glp.frequency.exponentialRampToValueAtTime(a.b, Math.max(a.t0 + 0.01, a.t1 - 0.01)); }
        else if (a.type === 'riser') riser(oc, glp, a.t0, a.t1);
      });
      return runOffline(oc, len + tail, user).then(function (buf) { return { buf: limit ? buf : wrapTail(buf, len), ev: ev, part: !!limit }; });
    });
    _songs[key] = p;
    p.catch(function () { delete _songs[key]; });
    return p;
  }

  /* ───────────── 효과음(SFX) 합성 ───────────── */
  function creakArr(dur, seed, f0, f1, res) {
    var n = Math.floor(dur * SR), o = new Float32Array(n), r = rng(seed), ph = 0;
    res = res || [[380, 0.995], [820, 0.993], [1650, 0.99], [2600, 0.985]];
    var y1 = [0, 0, 0, 0, 0], y2 = [0, 0, 0, 0, 0];
    var coef = res.map(function (q) { var w = 2 * Math.PI * q[0] / SR; return [2 * q[1] * Math.cos(w), -q[1] * q[1]]; });
    for (var i = 0; i < n; i++) {
      var x = i / n;
      var rate = f0 + (f1 - f0) * x + 22 * Math.sin(x * 9 + Math.sin(x * 23) * 2);
      var amp = Math.sin(Math.PI * Math.min(1, x * 1.12));
      ph += Math.max(8, rate) / SR;
      var imp = 0;
      if (ph >= 1) { ph -= 1; imp = (0.6 + 0.4 * r()) * amp; }
      var sum = 0;
      for (var k = 0; k < coef.length; k++) { var y = imp + coef[k][0] * y1[k] + coef[k][1] * y2[k]; y2[k] = y1[k]; y1[k] = y; sum += y * (1 - k * 0.18); }
      o[i] = sum;
    }
    return normalize(o, 0.55);
  }
  function gravelArr(seed, wet) {
    var n = Math.floor(0.42 * SR), o = new Float32Array(n), r = rng(seed), i;
    for (i = 0; i < 1400; i++) { var x = i / 1400, env = Math.exp(-i / 160) * 0.6; var nz = r() * 2 - 1; o[i] += nz * env * (1 - x); }
    var lpS = 0; for (i = 0; i < 2200; i++) { lpS += ((r() * 2 - 1) - lpS) * 0.05; o[i] += lpS * Math.exp(-i / 500) * 2.5; }
    for (var g = 0; g < 70; g++) {
      var t = Math.floor(Math.pow(r(), 1.6) * (n - 300)), len = 40 + Math.floor(r() * 140), amp = (0.15 + r() * 0.5) * (1 - t / n), hp = 0, prev = 0;
      for (var j = 0; j < len; j++) { var z = r() * 2 - 1; hp = z - prev; prev = z; o[t + j] += hp * amp * Math.exp(-j / (len * 0.3)); }
    }
    if (wet) { var bp = 0, lp2 = 0; for (i = 0; i < n; i++) { var w = r() * 2 - 1; lp2 += (w - lp2) * 0.12; bp += (lp2 - bp) * 0.3; o[i] += (lp2 - bp) * Math.exp(-i / 4000) * 0.9; } }
    return normalize(o, 0.6);
  }
  function crackleArr(dur, seed, density) {
    var n = Math.floor(dur * SR), o = new Float32Array(n), r = rng(seed), b = 0, i;
    for (i = 0; i < n; i++) { b = b * 0.995 + (r() * 2 - 1) * 0.02; o[i] = b * 0.5; }
    var cnt = Math.floor(dur * density);
    for (var k = 0; k < cnt; k++) {
      var t = Math.floor(r() * (n - 2000)), amp = Math.pow(r(), 2) * 0.9 + 0.05, f = 1200 + r() * 2600, dec = 30 + r() * 220;
      for (var j = 0; j < 1600; j++) o[t + j] += Math.sin(2 * Math.PI * f * j / SR) * amp * Math.exp(-j / dec) * (r() < 0.5 ? 1 : -1) * 0.5;
    }
    return o;
  }
  function seamless(a, xf) {
    var n = a.length, f = Math.floor(xf * SR), o = new Float32Array(n - f);
    for (var i = 0; i < n - f; i++) o[i] = a[i];
    for (var j = 0; j < f; j++) { var g = j / f; o[j] = a[n - f + j] * (1 - g) + a[j] * g; }
    return o;
  }
  function partials(c, out, t, list, dec, v) {
    for (var i = 0; i < list.length; i++) {
      var g = gainN(c, 0); osc(c, 'sine', list[i], t, t + dec * 5).connect(g); g.connect(out);
      g.gain.setValueAtTime(v / (1 + i * 0.4), t); g.gain.setTargetAtTime(0, t, dec * (1 - i * 0.08));
    }
  }
  function boom(c, out, t, v, f0, f1, dec) {
    var o = osc(c, 'sine', f0, t, t + dec * 6), g = gainN(c, 0);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec);
    o.connect(g); g.connect(out); g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t + 0.02, dec);
  }
  function doorSfx(c, out, len) {
    len = len || 2.6;
    var cl = len - 0.75;
    nz(c, 0.02, 0.05, out, 'bandpass', 2400, 2, 0.35, 0.01);
    nz(c, 0.07, 0.05, out, 'bandpass', 1500, 2, 0.25, 0.012);
    arrSrc(c, creakArr(cl, 11, 42, 105), 0.15, out, 0.9);
    var tt = 0.15 + cl + 0.05;
    boom(c, out, tt, 0.9, 85, 45, 0.12);
    nz(c, tt, 0.4, out, 'lowpass', 420, 0.8, 0.6, 0.07);
    nz(c, tt + 0.01, 0.15, out, 'bandpass', 1800, 3, 0.15, 0.02);
  }
  var SFX = {
    door: { len: 2.6, gap: 1.2, rev: ['room', 0.18], fn: function (c, o) { doorSfx(c, o, 2.6); } },
    door4: { len: 4.0, gap: 0.4, rev: ['room', 0.18], fn: function (c, o) { doorSfx(c, o, 4.0); } },
    impact: { len: 3.2, gap: 0.8, rev: ['hall', 0.35], fn: function (c, o) {
      boom(c, o, 0, 1.0, 95, 30, 0.5); nz(c, 0, 0.6, o, 'lowpass', 2200, 0.7, 0.8, 0.12);
      partials(c, o, 0, [212, 487, 731, 1123, 1590, 2210, 3170], 0.6, 0.18);
    } },
    whoosh: { len: 1.5, gap: 1.0, rev: ['room', 0.2], fn: function (c, o) {
      var s = noiseSrc(c, 0, 1.4), bp = filt(c, 'bandpass', 300, 1.8), g = gainN(c, 0), p = c.createStereoPanner();
      s.connect(bp); bp.connect(g); g.connect(p); p.connect(o);
      bp.frequency.setValueAtTime(260, 0); bp.frequency.exponentialRampToValueAtTime(2600, 0.6); bp.frequency.exponentialRampToValueAtTime(420, 1.3);
      g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, 0.58); g.gain.exponentialRampToValueAtTime(0.0001, 1.35);
      p.pan.setValueAtTime(-1, 0); p.pan.linearRampToValueAtTime(1, 1.3);
    } },
    braam: { len: 5.0, gap: 0.5, rev: ['hall', 0.4], fn: function (c, o) {
      var lp = filt(c, 'lowpass', 120, 2), g = gainN(c, 0), sh = c.createWaveShaper(); sh.curve = curve('tanh', 2.5);
      [24, 36, 43, 48].forEach(function (m) { sawStack(c, lp, mtof(m), 0, 4.6, [-14, 0, 13]); });
      lp.frequency.setValueAtTime(110, 0); lp.frequency.exponentialRampToValueAtTime(1900, 0.5); lp.frequency.exponentialRampToValueAtTime(260, 4.2);
      lp.connect(sh); sh.connect(g); g.connect(o);
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.5, 0.08); g.gain.setTargetAtTime(0.25, 0.3, 1.0); g.gain.linearRampToValueAtTime(0, 4.5);
      boom(c, o, 0, 0.8, 70, 35, 0.6);
    } },
    glitch: { len: 2.8, gap: 0.6, rev: ['room', 0.1], arr: function () {
      var src = creakArr(2.2, 11, 42, 105), n = Math.floor(2.8 * SR), out = new Float32Array(n), r = rng(9), w = 0, sl = Math.floor(SR * 0.075);
      while (w < n - sl) {
        var from = Math.floor(r() * (src.length - sl)), rep = r() < 0.5 ? 1 : 2 + Math.floor(r() * 5), len = r() < 0.4 ? sl >> 2 : sl, crush = r() < 0.4 ? 8 + Math.floor(r() * 30) : 1;
        for (var q = 0; q < rep && w < n - len; q++) {
          var hold = 0;
          for (var i = 0; i < len; i++) { if (i % crush === 0) hold = src[from + i]; out[w + i] = (crush > 1 ? Math.round(hold * 8) / 8 : hold) * Math.min(1, (len - i) / 60); }
          w += len;
        }
        if (r() < 0.15) w += sl >> 1;
      }
      return out;
    } },
    drone: { len: 8.0, gap: 0, rev: ['cave', 0.35], fn: function (c, o) {
      var lp = filt(c, 'lowpass', 300, 3), g = gainN(c, 0.0);
      sawStack(c, lp, mtof(31), 0, 8.6, [-9, 7]); sawStack(c, lp, mtof(38), 0, 8.6, [-5, 12]);
      var lf = osc(c, 'sine', 0.125, 0, 8.6), lg = gainN(c, 260); lf.connect(lg); lg.connect(lp.frequency);
      lp.connect(g); g.connect(o); g.gain.setValueAtTime(0.35, 0);
      var sub = gainN(c, 0.5); osc(c, 'sine', mtof(19), 0, 8.6).connect(sub); sub.connect(o);
      var s = noiseSrc(c, 0, 8.55), nl = filt(c, 'lowpass', 90, 1), ng = gainN(c, 0.6); s.connect(nl); nl.connect(ng); ng.connect(o);
    }, wrap: true },
    ambience: { len: 8.0, gap: 0, rev: ['room', 0.25], fn: function (c, o) {
      var s = noiseSrc(c, 0, 8.55), hp = filt(c, 'highpass', 900, 0.5), lp = filt(c, 'lowpass', 6500, 0.5), g = gainN(c, 0.14);
      s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(o);
      var r = rng(4);
      for (var i = 0; i < 260; i++) {
        var t = r() * 7.9, f = 1800 + r() * 4200, dg = gainN(c, 0);
        osc(c, 'sine', f, t, t + 0.04).connect(dg); dg.connect(o);
        dg.gain.setValueAtTime(0.05 + r() * 0.12, t); dg.gain.setTargetAtTime(0, t, 0.004 + r() * 0.006);
      }
      var th = noiseSrc(c, 2.0, 5.9), tl = filt(c, 'lowpass', 140, 0.8), tg = gainN(c, 0);
      th.connect(tl); tl.connect(tg); tg.connect(o);
      tg.gain.setValueAtTime(0, 2.0); tg.gain.linearRampToValueAtTime(1.6, 2.7); tg.gain.setTargetAtTime(0, 2.9, 1.3);
    }, wrap: true },
    foley: { len: 4.0, gap: 0.6, rev: ['room', 0.12], fn: function (c, o) {
      for (var i = 0; i < 4; i++) { boom(c, o, i * 0.95, 0.5, 120, 60, 0.05); arrSrc(c, gravelArr(20 + i, true), i * 0.95 + 0.01, o, 0.8); }
    } },
    coin: { len: 0.6, gap: 0.9, rev: ['room', 0.12], fn: function (c, o) {
      var lp = filt(c, 'lowpass', 7000, 0.5), g = gainN(c, 0); lp.connect(g); g.connect(o);
      var a = osc(c, 'square', 988, 0, 0.08); a.connect(lp);
      var b = osc(c, 'square', 1319, 0.075, 0.6); b.connect(lp);
      g.gain.setValueAtTime(0.22, 0); g.gain.setValueAtTime(0.22, 0.075); g.gain.setTargetAtTime(0, 0.1, 0.12);
    } },
    fire: { len: 6.0, gap: 0, rev: ['room', 0.1], arr: function () { return seamless(crackleArr(6.5, 3, 34), 0.5); }, loopMark: true },
    riser: { len: 8.0, gap: 1.5, rev: ['hall', 0.25], fn: function (c, o) {
      riser(c, o, 0, 8);
      var lp = filt(c, 'lowpass', 2000, 1), g = gainN(c, 0); lp.connect(g); g.connect(o);
      var s1 = osc(c, 'sawtooth', mtof(48), 0, 8), s2 = osc(c, 'sawtooth', mtof(55), 0, 8, 8);
      s1.frequency.exponentialRampToValueAtTime(mtof(72), 8); s2.frequency.exponentialRampToValueAtTime(mtof(79), 8);
      s1.connect(lp); s2.connect(lp);
      g.gain.setValueAtTime(0.02, 0); g.gain.exponentialRampToValueAtTime(0.13, 7.95); g.gain.linearRampToValueAtTime(0, 8);
    } },
    stinger: { len: 3.2, gap: 0.8, rev: ['hall', 0.4], fn: function (c, o) {
      [76, 77, 79, 80, 83, 84].forEach(function (m, i) {
        var f = mtof(m), g = gainN(c, 0), lp = filt(c, 'lowpass', 5000, 0.6), s = osc(c, 'sawtooth', f, 0, 3);
        vib(c, s.frequency, 0, 3, 6.5 + i * 0.4, f * 0.03, 0.05);
        s.frequency.setValueAtTime(f, 0); s.frequency.linearRampToValueAtTime(f * 1.06, 2.5);
        s.connect(lp); lp.connect(g); g.connect(o);
        g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.05, 0.03); g.gain.setTargetAtTime(0, 0.6, 0.7);
      });
      [40, 41, 46].forEach(function (m) { var g = gainN(c, 0), lp = filt(c, 'lowpass', 1600, 1); sawStack(c, lp, mtof(m), 0, 2.5, [-8, 8]); lp.connect(g); g.connect(o); g.gain.setValueAtTime(0.18, 0); g.gain.setTargetAtTime(0, 0.05, 0.5); });
      boom(c, o, 0, 0.9, 80, 32, 0.45); nz(c, 0, 0.5, o, 'lowpass', 900, 0.7, 0.6, 0.1);
    } },
    ui: { len: 0.6, gap: 1.0, rev: ['plate', 0.25], fn: function (c, o) {
      INST.bell(c, o, 0.0, 0.3, 88, 0.6, null); INST.bell(c, o, 0.085, 0.4, 95, 0.5, null);
    } },
    glass: { len: 2.2, gap: 0.8, rev: ['room', 0.2], fn: function (c, o) {
      boom(c, o, 0, 0.5, 120, 60, 0.06); nz(c, 0, 0.2, o, 'highpass', 3000, 0.7, 0.8, 0.05);
      var r = rng(13);
      for (var i = 0; i < 70; i++) {
        var t = Math.pow(r(), 2.2) * 1.6, f = 2400 + r() * 7000, g = gainN(c, 0);
        osc(c, 'sine', f, t, t + 0.6).connect(g); g.connect(o);
        g.gain.setValueAtTime((0.04 + r() * 0.12) * (1 - t / 1.8), t); g.gain.setTargetAtTime(0, t, 0.01 + r() * 0.07);
        if (r() < 0.4) nz(c, t, 0.02, o, 'highpass', 5000, 1, 0.15 * (1 - t / 1.8), 0.004);
      }
    } },
    sequence: { len: 4.6, gap: 0.8, rev: ['room', 0.2], fn: function (c, o) {
      for (var i = 0; i < 3; i++) { boom(c, o, i * 0.8, 0.45, 120, 60, 0.05); arrSrc(c, gravelArr(40 + i, false), i * 0.8 + 0.01, o, 0.75); }
      arrSrc(c, creakArr(1.4, 5, 70, 190, [[940, 0.997], [2130, 0.996], [3400, 0.995], [5200, 0.993]]), 2.7, o, 0.55);
      partials(c, o, 4.1, [310, 742, 1210, 1830], 0.35, 0.2); boom(c, o, 4.1, 0.5, 90, 50, 0.1);
    } },
    explosion: { len: 4.5, gap: 0.6, rev: ['hall', 0.45], fn: function (c, o) {
      boom(c, o, 0, 1.0, 60, 24, 0.9);
      var s = noiseSrc(c, 0, 4.3), lp = filt(c, 'lowpass', 1800, 0.7), g = gainN(c, 0);
      s.connect(lp); lp.connect(g); g.connect(o);
      lp.frequency.setValueAtTime(1800, 0); lp.frequency.exponentialRampToValueAtTime(150, 3.5);
      g.gain.setValueAtTime(0.9, 0); g.gain.setTargetAtTime(0, 0.05, 0.9);
      arrSrc(c, crackleArr(2.5, 8, 60), 0.1, o, 0.5);
    } }
  };
  var _sfx = {};
  function renderSfx(name, user) {
    if (_sfx[name]) return _sfx[name];
    var D = SFX[name] || SFX.door, total = D.len + 2.5;
    var oc = new OfflineAudioContext(2, Math.ceil(total * SR), SR), bus = gainN(oc, 0.9), comp = oc.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 3;
    bus.connect(comp); comp.connect(oc.destination);
    var rv = oc.createConvolver(); rv.buffer = makeIR(D.rev[0]); var rs = gainN(oc, D.rev[1]); rs.connect(rv); rv.connect(comp);
    var src = gainN(oc, 1); src.connect(bus); src.connect(rs);
    if (D.arr) arrSrc(oc, D.arr(), 0, src, 1); else D.fn(oc, src);
    var p = runOffline(oc, total, user).then(function (buf) {
      var loopLen = D.len + D.gap;
      if (D.wrap) return fromChans(chans(buf).map(function (a) { return seamless(a.slice(0, Math.floor((D.len + 0.5) * SR)), 0.5); }));
      if (D.loopMark) return wrapTail(buf, D.len);
      var L = Math.floor(loopLen * SR), out = [];
      for (var ch = 0; ch < buf.numberOfChannels; ch++) {
        var d = buf.getChannelData(ch), o = new Float32Array(L);
        o.set(d.subarray(0, Math.min(L, d.length)));
        for (var i = L; i < d.length; i++) { var j = i - L; if (j < L) o[j] += d[i]; }
        var f = Math.floor(SR * 0.02); for (var k = 0; k < f && L - 1 - k >= 0; k++) o[L - 1 - k] *= k / f;
        out.push(o);
      }
      return fromChans(out);
    });
    _sfx[name] = p;
    p.catch(function () { delete _sfx[name]; });
    return p;
  }

  /* ───────────── 섹션(곡 구조) ───────────── */
  function ensureMel(S, pat, inst) {
    var m = lay(S, 'mel');
    if (!m) S.layers.push(Ly('mel', inst || 'lead', pat, 0.28, { lo: 67 }));
    else { m.pat = pat; if (inst) m.inst = inst; }
  }
  function addPad(S, vol) { if (!lay(S, 'pad')) S.layers.push(Ly('pad', 'pad', 'block', vol || 0.3)); }
  function drumsOn(S, d) { if (!S.drums || S.drums === 'none') S.drums = d || 'basic'; }
  var SEC = {
    intro: function (S) { S.drums = 'none'; noLay(S, 'mel'); noLay(S, 'bass'); addPad(S, 0.25); S.aLp = [500, 6000]; S.fill = false; },
    verse: function (S) { drumsOn(S); S.kit.h = 0.55; S.kit.o = 0.5; S.fill = false; ensureMel(S, 'sparse'); noLay(S, 'pad'); },
    pre: function (S) { drumsOn(S); S.prog = [3, 4]; setIf(S, 'bass', { pat: 'eighth' }); S.roll8 = true; S.fill = false; ensureMel(S, 'pop'); S.aLp = [2500, 20000]; },
    chorus: function (S) { drumsOn(S); S.crash = true; ensureMel(S, 'hook'); addPad(S, 0.28); setIf(S, 'bass', { pat: 'eighth' }); S.kit.h = 1; },
    post: function (S) { drumsOn(S, 'four'); noLay(S, 'mel'); S.layers.push(Ly('mel', 'choir', 'hook', 0.4, { vowel: 'o', lo: 69 })); addPad(S, 0.2); },
    hook: function (S) { drumsOn(S); ensureMel(S, 'hook'); var m = lay(S, 'mel'); m.vol = (m.vol || 0.28) * 1.3; },
    bridge: function (S) { S.prog = [5, 3]; S.drums = 'halftime'; noLay(S, 'arp'); noLay(S, 'pad'); ensureMel(S, 'sparse'); S.fill = false; },
    breakdown: function (S) { S.drums = 'none'; noLay(S, 'bass'); noLay(S, 'mel'); addPad(S, 0.4); S.aLp = [900, 2200]; S.fill = false; },
    buildup: function (S) { S.roll = true; S.riser = true; S.aLp = [400, 16000]; noLay(S, 'mel'); S.aGain = [0.75, 1]; S.fill = false; },
    drop: function (S) {
      S.drums = 'four'; S.pump = 0.6; S.crash = true; S.fill = false;
      setLay(S, 'bass', { inst: 'synbass', pat: 'offbeat', vol: 0.55 });
      setLay(S, 'chord', { inst: 'supersaw', pat: 'stab', vol: 0.5 });
      ensureMel(S, 'hook', 'saw');
    },
    instrumental: function (S) { drumsOn(S); noLay(S, 'mel'); S.layers.push(Ly('mel', 'saw', 'pop', 0.3, { lo: 72 })); },
    solo: function (S) { drumsOn(S, 'punk'); noLay(S, 'mel'); S.layers.push(Ly('mel', 'fuzz', 'solo', 0.3, { lo: 64, span: 19, dist: 9 })); },
    outro: function (S) { noLay(S, 'mel'); S.kit.s = 0.5; S.kit.h = 0.5; S.fill = false; S.aGain = [1, 0.35]; },
    fadeout: function (S) { S.aGain = [1, 0.001]; S.fill = false; },
    crescendo: function (S) { S.aGain = [0.2, 1]; S.aLp = [700, 18000]; ensureMel(S, 'pop'); S.crash = false; },
    keychange: function (S) { SEC.chorus(S); S.tr += 2; },
    silence: function (S) { drumsOn(S); S.layers = []; S.fill = false; },
    param: function (S) { S.drums = 'none'; S.layers = [Ly('arp', 'pluck', 'travis', 0.55), Ly('mel', 'hum', 'sparse', 0.3, { lo: 64 })]; },
    instr0: function (S) { noLay(S, 'mel'); S.fill = false; }
  };
  function secList(list) {
    return list.map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; if (!o.bars) o.bars = 2; return o; });
  }

  /* ───────────── 장르·시대 프리셋 ───────────── */
  function G(S, o, layers) { for (var k in o) S[k] = o[k]; S.layers = layers; S.g = 1; S.kit = S.kit || {}; }
  var GEN = {
    synthwave: function (S) { G(S, { bpm: 110, mode: 'minor', root: 53, prog: [0, 5, 2, 6], drums: 'basic', gated: true, rev: 0.25, revType: 'hall' },
      [Ly('pad', 'pad', 'block', 0.5, { cut: 2200 }), Ly('arp', 'saw', '16up', 0.2, { oct: 1, lp: 2800, leg: 0.6, rev: 0.3 }), Ly('bass', 'synbass', 'eighth', 0.55), Ly('mel', 'lead', 'sparse', 0.24, { lo: 69 })]); },
    darkwave: function (S) { G(S, { bpm: 120, mode: 'minor', root: 52, prog: [0, 0, 5, 6], drums: 'basic', hats: '16', rev: 0.3, revType: 'plate' },
      [Ly('pad', 'pad', 'block', 0.4, { cut: 1300, att: 0.2 }), Ly('bass', 'pickbass', 'pp', 0.6), Ly('arp', 'square', '8up', 0.14, { lp: 1800 })]); },
    lofi: function (S) { G(S, { bpm: 80, mode: 'major', root: 60, prog: [1, 4, 0, 5], ext: 7, swing: 0.28, drums: 'lofi', dv: 0.7, human: 1 },
      [Ly('chord', 'rhodes', 'lofi', 0.65), Ly('bass', 'sub', 'half', 0.5), Ly('mel', 'felt', 'sparse', 0.25, { lo: 72, rest: 0.3 })]); },
    boombap: function (S) { G(S, { bpm: 90, mode: 'dorian', root: 62, prog: [0, 3], ext: 7, swing: 0.22, drums: 'boombap', dv: 1, kit: { k: 1.2, s: 1.1 } },
      [Ly('chord', 'piano', 'stab2', 0.55, { lp: 3500 }), Ly('bass', 'sub', 'root', 0.55)]); },
    trap: function (S) { G(S, { bpm: 140, mode: 'minor', root: 60, prog: [0, 5, 0, 4], drums: 'trap', hats: 'trap', fill: false },
      [Ly('mel', 'bell', 'pop', 0.3, { lo: 72 }), Ly('pad', 'strings', 'block', 0.16), Ly('bass', 'b808', 'b808', 0.8, { slide: 1 })]); },
    phonk: function (S) { G(S, { bpm: 130, mode: 'phrygian', root: 61, prog: [0, 1], drums: 'trap', hats: 'trap', fill: false, kit: { c: 1.3 } },
      [Ly('mel', 'cowbell', 'fast', 0.4, { lo: 73, span: 10 }), Ly('bass', 'b808', 'b808', 0.75, { drive: 7, slide: 1 })]); },
    deephouse: function (S) { G(S, { bpm: 122, mode: 'dorian', root: 57, prog: [0, 3], ext: 9, drums: 'house', rev: 0.2 },
      [Ly('chord', 'rhodes', 'house', 0.55), Ly('bass', 'bass', 'house', 0.6), Ly('pad', 'pad', 'block', 0.18, { cut: 1100 })]); },
    techno: function (S) { G(S, { bpm: 126, mode: 'minor', root: 57, prog: [0, 5, 3, 4], drums: 'techno', rev: 0.25, revType: 'hall' },
      [Ly('arp', 'saw', '16up', 0.2, { oct: 0, lp: 1900, q: 4, leg: 0.5 }), Ly('pad', 'pad', 'block', 0.32, { cut: 1500 }), Ly('bass', 'synbass', 'rolling', 0.42)]); },
    dnb: function (S) { G(S, { bpm: 174, mode: 'minor', root: 57, prog: [0, 5, 2, 6], ext: 7, drums: 'dnb', rev: 0.25 },
      [Ly('pad', 'pad', 'block', 0.4), Ly('chord', 'rhodes', 'pop', 0.35), Ly('bass', 'reese', 'sustain', 0.55)]); },
    dubstep: function (S) { G(S, { bpm: 140, mode: 'minor', root: 53, prog: [0, 0, 5, 4], drums: 'halftime', kit: { s: 1.3 }, fill: false },
      [Ly('bass', 'wob', 'sustain', 0.6), Ly('pad', 'pad', 'block', 0.18, { cut: 900 })]); },
    citypop: function (S) { G(S, { bpm: 112, mode: 'major', root: 62, prog: [3, 2, 1, 0], ext: 7, drums: 'city' },
      [Ly('chord', 'rhodes', 'city', 0.55), Ly('bass', 'slapb', 'slap', 0.55), Ly('ch2', 'brass', 'brass', 0.25, { top: 3, oct: 1 }), Ly('mel', 'lead', 'city', 0.22, { lo: 72 })]); },
    kpop: function (S) { G(S, { bpm: 124, mode: 'major', root: 62, prog: [5, 3, 0, 4], drums: 'kpop' },
      [Ly('chord', 'pluck', 'kpop', 0.45), Ly('pad', 'supersaw', 'block', 0.18), Ly('bass', 'synbass', 'syncop', 0.5), Ly('mel', 'lead', 'hook', 0.3, { lo: 69 })]); },
    bedroom: function (S) { G(S, { bpm: 88, mode: 'major', root: 60, prog: [0, 5, 3, 4], ext: 7, drums: 'brk', dv: 0.5 },
      [Ly('chord', 'muted', 'chop', 0.55), Ly('pad', 'pad', 'block', 0.2, { cut: 900 }), Ly('bass', 'bass', 'root', 0.45)]); },
    hyperpop: function (S) { G(S, { bpm: 160, mode: 'major', root: 64, prog: [0, 4, 5, 3], drums: 'kpop', hats: 'trap' },
      [Ly('mel', 'supersaw', 'fast', 0.32, { lo: 76, dist: 3 }), Ly('chord', 'square', 'kpop', 0.2), Ly('bass', 'b808', 'b808', 0.7, { drive: 8 })]); },
    neosoul: function (S) { G(S, { bpm: 84, mode: 'dorian', root: 62, prog: [0, 3, 6, 2], ext: 9, swing: 0.25, drums: 'lofi', dv: 0.7, human: 1.2 },
      [Ly('chord', 'rhodes', 'lofi', 0.6), Ly('bass', 'bass', 'syncop', 0.55)]); },
    bossa: function (S) { G(S, { bpm: 132, mode: 'major', root: 60, prog: [1, 4, 0, 0], ext: 7, drums: 'bossa', dv: 0.55, rev: 0.2 },
      [Ly('chord', 'nylon', 'bossa', 0.55, { strum: 0.012 }), Ly('bass', 'upright', 'bossa', 0.6)]); },
    shoegaze: function (S) { G(S, { bpm: 100, mode: 'major', root: 64, prog: [0, 3, 5, 3], drums: 'wash', rev: 0.55, revType: 'hall' },
      [Ly('chord', 'fuzz', 'eighth', 0.35, { dist: 12, distLp: 3500 }), Ly('pad', 'pad', 'block', 0.3), Ly('mel', 'lead', 'chant', 0.16, { rev: 0.9 }), Ly('bass', 'pickbass', 'eighth', 0.45)]); },
    postrock: function (S) { G(S, { bpm: 90, mode: 'major', root: 62, prog: [0, 5, 3, 4], drums: 'basic', dv: 0.75, rev: 0.4, revType: 'hall', aGain: [0.3, 1], aLp: [900, 18000] },
      [Ly('arp', 'pluck', 'tremolo', 0.42, { oct: 1 }), Ly('pad', 'strings', 'block', 0.22), Ly('bass', 'bass', 'half', 0.42)]); },
    cine: function (S) { G(S, { bpm: 90, mode: 'minor', root: 62, prog: [0, 5, 2, 6], drums: 'cine', rev: 0.4, revType: 'hall', fill: false, crash: true },
      [Ly('chord', 'strings', 'block', 0.45), Ly('ch2', 'brass', 'cine', 0.3), Ly('ost', 'stacc', '', 0.22), Ly('pad', 'choir', 'block', 0.3), Ly('bass', 'cello', 'half', 0.35)]); },
    ambient: function (S) { G(S, { bpm: 70, mode: 'lydian', root: 64, prog: [0, 1], drums: 'none', rev: 0.6, revType: 'cave', fill: false },
      [Ly('pad', 'pad', 'block', 0.5, { att: 1.2, cut: 1600 }), Ly('mel', 'bell', 'sparse', 0.2, { lo: 76, rest: 0.3 }), Ly('drone', 'cello', '', 0.2)]); },
    afro: function (S) { G(S, { bpm: 105, mode: 'major', root: 65, prog: [0, 5, 3, 4], drums: 'afro' },
      [Ly('arp', 'pluck', '16up', 0.4, { mask: 'x..xx.x.x.xx..x.', oct: 1, leg: 0.5 }), Ly('chord', 'rhodes', 'stab', 0.25), Ly('bass', 'bass', 'syncop', 0.55)]); },
    reggaeton: function (S) { G(S, { bpm: 95, mode: 'minor', root: 57, prog: [0, 5, 2, 6], drums: 'dembow' },
      [Ly('chord', 'pluck', 'stab', 0.4), Ly('pad', 'pad', 'block', 0.15), Ly('bass', 'sub', 'dembow', 0.6), Ly('mel', 'lead', 'hook', 0.24)]); },
    folk: function (S) { G(S, { bpm: 96, mode: 'major', root: 55, prog: [0, 4, 5, 3], drums: 'folk', dv: 0.5, rev: 0.2 },
      [Ly('arp', 'pluck', 'travis', 0.6), Ly('pad', 'strings', 'block', 0.12), Ly('mel', 'hum', 'sparse', 0.2, { lo: 64 })]); },
    e80: function (S) { G(S, { bpm: 118, mode: 'major', root: 62, prog: [0, 5, 3, 4], drums: 'basic', gated: true, crash: true, rev: 0.25, revType: 'plate' },
      [Ly('chord', 'dx', 'pop', 0.45), Ly('pad', 'pad', 'block', 0.25), Ly('bass', 'synbass', 'eighth', 0.5), Ly('mel', 'bell', 'pop', 0.18, { lo: 74 })]); },
    e70: function (S) { G(S, { bpm: 96, mode: 'major', root: 60, prog: [0, 3, 0, 4], ext: 7, drums: 'basic', human: 1.6, kit: { h: 0.8 } },
      [Ly('chord', 'rhodes', 'syncop', 0.45), Ly('ch2', 'organ', 'block', 0.15), Ly('bass', 'bass', 'syncop', 0.55, { lp: 900 })]); },
    e90: function (S) { G(S, { bpm: 132, mode: 'minor', root: 57, prog: [0, 5, 2, 6], drums: 'euro' },
      [Ly('mel', 'supersaw', 'hook', 0.3, { lo: 69 }), Ly('chord', 'supersaw', 'stab', 0.18), Ly('bass', 'synbass', 'offbeat', 0.55)]); },
    e50: function (S) { G(S, { bpm: 168, mode: 'major', root: 57, prog: [0, 3, 4, 0], shuffle: 0.33, drums: 'rockabilly' },
      [Ly('bass', 'upright', 'boogie', 0.65), Ly('chord', 'piano', 'eighth', 0.3, { top: 3 })]); },
    y2k: function (S) { G(S, { bpm: 100, mode: 'major', root: 63, prog: [0, 5, 3, 4], ext: 7, drums: 'y2k' },
      [Ly('chord', 'pluck', 'kpop', 0.38), Ly('pad', 'pad', 'block', 0.2), Ly('bass', 'sub', 'syncop', 0.5), Ly('mel', 'bell', 'hook', 0.2, { lo: 74 })]); },
    e60: function (S) { G(S, { bpm: 104, mode: 'major', root: 60, prog: [0, 5, 3, 4], shuffle: 0.15, drums: 'soul60' },
      [Ly('chord', 'piano', 'quarter', 0.38), Ly('ch2', 'brass', 'brass', 0.25, { top: 3, oct: 1 }), Ly('bass', 'bass', 'root', 0.5), Ly('mel', 'choir', 'chant', 0.22, { vowel: 'o', lo: 67 })]); }
  };
  function moodMode(S, mode, root) {
    S.mode = mode;
    if (mode === 'minor' && S.prog.join() === '0,4,5,3') { S.prog = [0, 5, 2, 6]; if (root) S.root = root; }
    if (mode === 'major' && S.prog.join() === '0,5,2,6') S.prog = [0, 4, 5, 3];
  }
  function chordLay(S) { return lay(S, 'chord') || lay(S, 'pad') || lay(S, 'arp'); }
  function setInst(S, inst, pat) { var l = lay(S, 'chord'); if (l) { l.inst = inst; if (pat) l.pat = pat; } else S.layers.unshift(Ly('chord', inst, pat || 'pop', 0.55)); }

  /* ───────────── 용어 → 파라미터 표 ───────────── */
  function gs(name) { return function (S) { GEN[name](S); }; }
  var T = {
    /* 장르 */
    'synthwave': { p: 'synth', s: gs('synthwave') },
    'darkwave': { p: 'synth', s: gs('darkwave'), fx: { chorus: { rate: 0.7, depth: 0.004, mix: 0.4 } } },
    'lofi-hip-hop': { p: 'synth', s: gs('lofi'), fx: { lp: 5200, noise: { type: 'vinyl', lvl: 0.05 }, wow: { rate: 0.5, depth: 9 } }, c: ['바이닐'] },
    'boom-bap': { p: 'synth', s: gs('boombap'), fx: { comp: [-22, 4, 1.7], lp: 9000 } },
    'trap': { p: 'synth', s: gs('trap') },
    'phonk': { p: 'synth', s: gs('phonk'), fx: { dist: { k: 2, c: 'tanh', tone: 9000, post: 0.85 } } },
    'deep-house': { p: 'synth', s: gs('deephouse') },
    'melodic-techno': { p: 'synth', s: gs('techno') },
    'drum-and-bass': { p: 'synth', s: gs('dnb') },
    'dubstep': { p: 'synth', s: gs('dubstep') },
    'city-pop': { p: 'synth', s: gs('citypop'), fx: { chorus: { rate: 0.8, depth: 0.003, mix: 0.25 } } },
    'k-pop': { p: 'synth', s: gs('kpop'), fx: { comp: [-20, 3, 1.4], hs: [9000, 3] } },
    'bedroom-pop': { p: 'synth', s: gs('bedroom'), fx: { lp: 7000, wow: { rate: 0.4, depth: 5 } } },
    'hyperpop': { p: 'synth', s: gs('hyperpop'), fx: { hs: [6000, 5], comp: [-18, 5, 1.4] } },
    'neo-soul': { p: 'synth', s: gs('neosoul') },
    'bossa-nova': { p: 'synth', s: gs('bossa') },
    'shoegaze': { p: 'synth', s: gs('shoegaze'), fx: { chorus: { rate: 0.5, depth: 0.006, mix: 0.4 } } },
    'post-rock': { p: 'synth', s: gs('postrock'), c: ['점점 커짐'] },
    'cinematic-orchestral': { p: 'synth', s: gs('cine') },
    'ambient': { p: 'synth', s: gs('ambient') },
    'afrobeats': { p: 'synth', s: gs('afro') },
    'reggaeton': { p: 'synth', s: gs('reggaeton') },
    'indie-folk': { p: 'synth', s: gs('folk') },
    /* 시대 */
    'eighties-sound': { p: 'synth', s: gs('e80'), fx: { chorus: { rate: 0.6, depth: 0.004, mix: 0.3 } }, c: ['게이트 리버브'] },
    'seventies-sound': { p: 'synth', s: gs('e70'), fx: { lp: 8000, dist: { k: 1.5, c: 'tape', tone: 9000, post: 1 }, noise: { type: 'hiss', lvl: 0.01 }, wow: { rate: 0.4, depth: 4 } }, c: ['테이프'] },
    'nineties-sound': { p: 'synth', s: gs('e90') },
    'fifties-rocknroll': { p: 'synth', s: gs('e50'), fx: { delay: { t: 0.11, fb: 0.12, mix: 0.45 }, mono: true, lp: 7000 }, c: ['슬랩백', '모노'] },
    'y2k-pop': { p: 'synth', s: gs('y2k'), fx: { hs: [8000, 3] } },
    'sixties-soul': { p: 'synth', s: gs('e60'), fx: { mono: true, lp: 6500, hp: 120 }, c: ['모노'] },

    /* 템포·리듬 */
    'bpm-number': { p: 'synth', s: function (S) { S.bpm = 128; } },
    'slow-tempo': { p: 'synth', s: function (S) { S.bpm = 70; if (!S.g) { S.drums = 'halftime'; S.dv = 0.6; } } },
    'fast-driving': { p: 'synth', s: function (S) { S.bpm = 160; if (!S.g) S.drums = 'drive'; setIf(S, 'bass', { pat: 'eighth' }); } },
    'half-time': { p: 'synth', s: function (S) { S.bpm = 140; S.drums = 'halftime'; } },
    'double-time': { p: 'synth', s: function (S) { S.drums = 'double'; S.hats = '16'; } },
    'swing-shuffle': { p: 'synth', s: function (S) { S.shuffle = 0.33; S.swing = 0; if (!S.g) { S.ext = 7; } } },
    'straight-quantized': { p: 'synth', s: function (S) { S.shuffle = 0; S.swing = 0; S.human = 0; S.hats = '16'; } },
    'four-on-the-floor': { p: 'synth', s: function (S) { S.drums = 'four'; } },
    'breakbeat': { p: 'synth', s: function (S) { S.drums = 'brk'; } },
    'waltz-34': { p: 'synth', s: function (S) {
      S.meter = 3; S.unit = 1; S.bpm = Math.min(S.bpm, 100); S.drums = 'waltz'; S.hats = '';
      S.layers.forEach(function (l) { if (l.role === 'chord') l.pat = 'waltz'; if (l.role === 'bass') l.pat = 'waltz'; });
    } },
    'six-eight': { p: 'synth', s: function (S) {
      S.meter = 6; S.unit = 0.5; S.bpm = 70; S.drums = 'm12'; S.hats = '';
      noLay(S, 'arp'); var c = lay(S, 'chord'); if (c) { c.role = 'arp'; c.pat = 'broken'; c.oct = 0; c.leg = 1.2; }
    } },
    'odd-meter': { p: 'synth', s: function (S) {
      S.meter = 7; S.unit = 0.5; S.bpm = 110; S.drums = 'm14'; S.hats = '';
      if (!S.g) { setInst(S, 'pluck'); var c = lay(S, 'chord'); c.role = 'arp'; c.pat = '8up'; c.oct = 1; }
    } },
    'syncopation': { p: 'synth', s: function (S) { S.drums = 'funk'; setIf(S, 'bass', { pat: 'syncop' }); setIf(S, 'chord', { pat: 'syncop' }); } },
    'triplet-hihats': { p: 'synth', s: function (S) { S.hats = 'trap'; if (S.bpm < 120) { S.bpm = 140; S.drums = 'trap'; } } },
    'polyrhythm': { p: 'synth', s: function (S) { S.poly = true; if (!S.g) S.drums = 'polybase'; } },

    /* 조성·화성 */
    'minor-key': { p: 'synth', s: function (S) { moodMode(S, 'minor', 57); } },
    'major-key': { p: 'synth', s: function (S) { moodMode(S, 'major'); if (!S.g) setInst(S, 'piano', 'quarter'); } },
    'specific-key': { p: 'synth', s: function (S) { S.root = 53; moodMode(S, 'minor'); S.bpm = 128; } },
    'dorian': { p: 'synth', s: function (S) { S.root = 62; S.mode = 'dorian'; S.prog = [0, 3]; S.ext = 7; ensureMel(S, 'pop'); } },
    'phrygian': { p: 'synth', s: function (S) { S.root = 64; S.mode = 'phrygian'; S.prog = [0, 1, 0, 1]; if (!S.g) { S.ch = 'power'; setInst(S, 'fuzz', 'eighth'); lay(S, 'chord').dist = 8; lay(S, 'chord').vol = 0.35; } } },
    'lydian': { p: 'synth', s: function (S) { S.root = 65; S.mode = 'lydian'; S.prog = [0, 1]; S.ext = 7; if (!S.g) { setInst(S, 'pad', 'block'); S.drums = 'none'; S.rev = 0.4; } ensureMel(S, 'pop', 'bell'); } },
    'mixolydian': { p: 'synth', s: function (S) { S.root = 55; S.mode = 'mixolydian'; S.prog = [0, 6, 3, 0]; if (!S.g) { setInst(S, 'fuzz', 'eighth'); lay(S, 'chord').dist = 6; lay(S, 'chord').vol = 0.32; S.drums = 'punk'; S.shuffle = 0.2; } } },
    'pentatonic': { p: 'synth', s: function (S) { S.mel = S.mode === 'minor' ? 'minpent' : 'pentatonic'; S.ch = 'sus2'; ensureMel(S, 'pop', S.g ? null : 'pluck'); } },
    'extended-chords': { p: 'synth', s: function (S) { S.ext = 9; var c = lay(S, 'chord'); if (c && c.inst === 'piano') c.inst = 'rhodes'; } },
    'power-chords': { p: 'synth', s: function (S) { S.ch = 'power'; setInst(S, 'fuzz', 'eighth'); var c = lay(S, 'chord'); c.dist = 14; c.vol = 0.35; setIf(S, 'bass', { pat: 'eighth', inst: 'pickbass' }); if (!S.g) S.drums = 'punk'; } },
    'dissonant': { p: 'synth', s: function (S) {
      S.ch = 'cluster'; S.mode = 'harmonic';
      if (!S.g) { S.drums = 'none'; S.rev = 0.4; S.revType = 'hall'; S.layers = [Ly('pad', 'strings', 'block', 0.3), Ly('mel', 'strings', 'chant', 0.3, { lo: 84, span: 8 }), Ly('bass', 'sub', 'eighth', 0.6)]; S.weird = 0.5; S.prog = [0, 1]; }
    } },
    'consonant-warm': { p: 'synth', s: function (S) { S.ch = 'triad'; S.ext = 0; S.prog = [0, 3, 4, 0]; addPad(S, 0.22); if (!S.g) { setInst(S, 'felt', 'pop'); S.dv = 0.5; } } },
    'drone-pedal': { p: 'synth', s: function (S) { noLay(S, 'drone'); S.layers.push(Ly('drone', 'cello', '', 0.45)); } },

    /* 악기 */
    'analog-pads': { p: 'synth', s: function (S) { setInst(S, 'pad', 'block'); var c = lay(S, 'chord'); c.cut = 2400; c.vol = 0.5; } },
    'arpeggiator': { p: 'synth', s: function (S) { noLay(S, 'arp'); S.layers.push(Ly('arp', 'saw', '16up', 0.2, { oct: 1, lp: 2800, leg: 0.55 })); } },
    '808-bass': { p: 'synth', s: function (S) { setLay(S, 'bass', { inst: 'b808', pat: 'b808', vol: 0.8, drive: 5, slide: 1 }); S.kit.k = 0.7; } },
    'rhodes': { p: 'synth', s: function (S) { setInst(S, 'rhodes'); } },
    'felt-piano': { p: 'synth', s: function (S) { setInst(S, 'felt'); if (!S.g) { S.drums = 'none'; S.rev = 0.08; ensureMel(S, 'sparse', 'felt'); } } },
    'grand-piano': { p: 'synth', s: function (S) {
      setInst(S, 'grand'); S.rev = 0.35; S.revType = 'hall';
      if (!S.g) { S.drums = 'none'; noLay(S, 'bass'); S.layers.push(Ly('bass', 'grand', 'half', 0.4, { oct: 0 })); ensureMel(S, 'pop', 'grand'); }
    } },
    'nylon-guitar': { p: 'synth', s: function (S) { noLay(S, 'chord'); noLay(S, 'arp'); S.layers.unshift(Ly('arp', 'nylon', 'travis', 0.6)); if (!S.g) { S.drums = 'none'; noLay(S, 'bass'); } } },
    'muted-guitar': { p: 'synth', s: function (S) { setInst(S, 'muted', 'chop'); } },
    'slap-bass': { p: 'synth', s: function (S) { setLay(S, 'bass', { inst: 'slapb', pat: 'slap', vol: 0.6 }); if (!S.g) S.drums = 'funk'; } },
    'upright-bass': { p: 'synth', s: function (S) { setLay(S, 'bass', { inst: 'upright', pat: 'walk', vol: 0.7 }); if (!S.g) { S.shuffle = 0.33; S.ext = 7; S.prog = [1, 4, 0, 5]; S.drums = 'jazz'; setInst(S, 'piano', 'charleston'); } } },
    'string-quartet': { p: 'synth', s: function (S) {
      if (!S.g) { S.drums = 'none'; S.rev = 0.25; S.revType = 'hall'; S.layers = [Ly('chord', 'strings', 'block', 0.4, { vlo: 55 }), Ly('mel', 'strings', 'pop', 0.3, { lo: 72 }), Ly('bass', 'cello', 'half', 0.35)]; }
      else S.layers.push(Ly('ch2', 'strings', 'block', 0.25));
    } },
    'full-orchestra': { p: 'synth', s: function (S) {
      if (!S.g) { GEN.cine(S); S.mode = 'major'; S.prog = [0, 5, 3, 4]; ensureMel(S, 'hook', 'brass'); }
      else { S.layers.push(Ly('ch2', 'strings', 'block', 0.3)); S.layers.push(Ly('ch3', 'brass', 'cine', 0.25)); }
    } },
    'brass-stabs': { p: 'synth', s: function (S) { if (!S.g) { S.root = 53; moodMode(S, 'minor'); S.drums = 'funk'; } noLay(S, 'ch2'); S.layers.push(Ly('ch2', 'brass', 'brass', 0.35, { top: 3, oct: 1 })); } },
    'taiko': { p: 'synth', s: function (S) { S.drums = 'taiko'; S.kit.t = 1.2; if (!S.g) { S.mode = 'minor'; S.prog = [0, 5, 2, 6]; setInst(S, 'strings', 'block'); S.rev = 0.3; S.revType = 'hall'; } } },
    'gayageum': { p: 'synth', s: function (S) {
      if (!S.g) { S.bpm = 84; S.root = 62; S.drums = 'none'; S.mel = 'pentatonic'; S.prog = [0, 3]; S.layers = [Ly('pad', 'pad', 'block', 0.3, { cut: 1200, att: 0.8 }), Ly('mel', 'gayageum', 'pop', 0.6, { lo: 62, span: 17 })]; S.rev = 0.35; S.revType = 'hall'; }
      else S.layers.push(Ly('mel2', 'gayageum', 'pop', 0.5, { lo: 62, span: 17, seed: 9 }));
    } },
    'music-box': { p: 'synth', s: function (S) {
      if (!S.g) { S.drums = 'none'; S.rev = 0.3; S.layers = [Ly('mel', 'musicbox', 'pop', 0.5, { lo: 79 }), Ly('arp', 'musicbox', '8up', 0.25, { oct: 1 })]; }
      else S.layers.push(Ly('mel2', 'musicbox', 'pop', 0.4, { lo: 79 }));
    } },
    'pedal-steel': { p: 'synth', s: function (S) { if (!S.g) { setInst(S, 'pluck', 'quarter'); lay(S, 'chord').strum = 0.015; S.drums = 'brush'; S.shuffle = 0.15; } S.layers.push(Ly('mel', 'steel', 'sparse', 0.45, { lo: 64 })); } },
    'choir': { p: 'synth', s: function (S) {
      if (!S.g) { moodMode(S, 'minor', 57); S.drums = 'none'; S.rev = 0.45; S.revType = 'hall'; S.layers = [Ly('chord', 'choir', 'block', 0.5, { vowel: 'a' }), Ly('mel', 'choir', 'chant', 0.35, { vowel: 'o', lo: 69 }), Ly('bass', 'cello', 'half', 0.3)]; }
      else S.layers.push(Ly('ch2', 'choir', 'block', 0.35));
    } },
    'solo-instrument': { p: 'synth', s: function (S) { S.root = 60; moodMode(S, 'minor'); S.drums = 'none'; S.rev = 0.3; S.revType = 'hall'; S.layers = [Ly('chord', 'grand', 'pop', 0.5), Ly('mel', 'grand', 'pop', 0.45, { lo: 72 })]; } },

    /* 보컬(합성 가능한 것만) */
    'stacked-harmonies': { p: 'synth', s: function (S) { S.layers.push(Ly('ch2', 'choir', 'block', 0.4, { vowel: 'a', vlo: 60 })); ensureMel(S, 'hook', 'choir'); } },
    'a-cappella': { p: 'synth', s: function (S) { S.root = 57; S.mode = 'major'; S.bpm = 90; S.drums = 'none'; S.rev = 0.3; S.layers = [Ly('chord', 'choir', 'block', 0.45, { vowel: 'o' }), Ly('mel', 'choir', 'pop', 0.4, { vowel: 'a', lo: 69 }), Ly('bass', 'hum', 'half', 0.6, { oct: 1 })]; }, n: '합창 신스로 흉내 낸 소리예요' },
    'humming': { p: 'synth', s: function (S) { ensureMel(S, 'pop', 'hum'); lay(S, 'mel').vol = 0.5; if (!S.g) { S.drums = 'none'; setInst(S, 'felt', 'pop'); } } },
    'vocal-chops': { p: 'synth', s: function (S) { if (!S.g) { GEN.deephouse(S); } noLay(S, 'mel'); S.layers.push(Ly('mel', 'vox', 'hook', 0.55, { lo: 67, span: 12 })); } },
    'breathy-vocals': { p: 'voice', proc: [{ op: 'whisper', mix: 0.75 }], fx: { hs: [7000, 4] }, c: ['숨소리 섞음'] },
    'raspy-vocals': { p: 'voice', proc: [{ op: 'whisper', mix: 1.0 }], fx: { dist: { k: 3, c: 'tanh', tone: 6500, post: 0.8, pre: 1.5 }, pk: [[2500, 3, 1]] }, c: ['거친 질감'] },
    'clean-vocals': { p: 'voice', fx: { hp: 90, comp: [-24, 3, 1.6], hs: [8000, 3], pk: [[300, -2, 1]] }, c: ['컴프', '고역 보정'] },
    'whispered-vocals': { p: 'voice', proc: [{ op: 'whisper', mix: 0 }], fx: { hp: 250 }, bed: function (S) { S.layers = [Ly('arp', 'pluck', 'travis', 0.45)]; S.drums = 'none'; }, c: ['속삭임', '기타 반주'] },
    'double-tracked': { p: 'voice', fx: { double: { ms: 28 } }, c: ['더블링 L/R'] },
    'spoken-word': { p: 'voice', fx: { rev: { type: 'room', mix: 0.12 } }, bed: function (S) { GEN.ambient(S); S.master = 0.55; }, c: ['패드 위 낭독'] },

    /* 프로덕션 */
    'reverb-heavy': { p: 'guitar', any: 1, fx: { rev: { type: 'cave', mix: 0.75, dry: 0.7 } }, c: ['동굴 리버브'] },
    'dry-vocals': { p: 'voice', any: 1, fx: { comp: [-20, 3, 1.4], ls: [200, 2] }, c: ['리버브 없음'] },
    'gated-reverb': { p: 'synth', s: function (S) { S.gated = true; drumsOn(S); S.kit.s = 1.2; }, c: ['게이트 리버브'] },
    'slapback-echo': { p: 'voice', any: 1, fx: { delay: { t: 0.11, fb: 0.1, mix: 0.5 } }, c: ['딜레이 110ms'] },
    'ping-pong-delay': { p: 'guitar', any: 1, fx: { delay: { t: 0.33, fb: 0.45, mix: 0.45, pp: true } }, c: ['핑퐁 L↔R'] },
    'sidechain': { p: 'synth', s: function (S) { S.pump = 0.75; if (S.drums !== 'four' && S.drums !== 'house') S.drums = 'four'; addPad(S, 0.5); }, c: ['킥에 맞춰 펌핑'] },
    'tape-saturation': { p: 'guitar', any: 1, fx: { dist: { k: 2.5, c: 'tape', tone: 9000, post: 0.9, pre: 1.6 }, lp: 12000, wow: { rate: 0.6, depth: 5 } }, c: ['테이프 포화'] },
    'warm-analog': { p: 'guitar', any: 1, fx: { ls: [180, 3], hs: [7000, -5], dist: { k: 1.5, c: 'tape', tone: 10000, post: 1 }, noise: { type: 'hiss', lvl: 0.012 } }, c: ['저역 업', '고역 다운'] },
    'lofi-texture': { p: 'guitar', any: 1, proc: [{ op: 'crush', rate: 11025, bits: 12 }], fx: { lp: 3800, hp: 120, noise: { type: 'vinyl', lvl: 0.06 }, wow: { rate: 0.5, depth: 18 } }, c: ['11kHz', '바이닐', '와우'] },
    'polished-mix': { p: 'guitar', any: 1, fx: { hp: 60, comp: [-26, 4, 2.0], hs: [9000, 4], pk: [[350, -3, 1]], width: 10 }, c: ['컴프', '고역 반짝임'] },
    'raw-live': { p: 'guitar', any: 1, fx: { rev: { type: 'room', mix: 0.35 }, noise: { type: 'room', lvl: 0.02 }, hs: [8000, -2] }, c: ['룸 앰비언스'] },
    'wide-stereo': { p: 'guitar', any: 1, fx: { width: 18, chorus: { rate: 0.6, depth: 0.004, mix: 0.35 } }, c: ['하스 18ms'] },
    'vintage-mono': { p: 'guitar', any: 1, fx: { mono: true, hp: 180, lp: 5500, dist: { k: 1.2, c: 'tape', tone: 8000, post: 1 } }, c: ['모노', '대역 좁힘'] },
    'punchy-drums': { p: 'synth', s: function (S) { drumsOn(S); S.kit.k = 1.3; S.kit.s = 1.2; S.dv = 1.05; S.drumRev = 0; }, fx: { comp: [-20, 4, 1.6] }, c: ['드럼 컴프'] },
    'room-mic-drums': { p: 'synth', s: function (S) { drumsOn(S); S.drumRev = 0.7; S.revType = 'room'; S.kit.s = 1.15; }, c: ['룸 마이크'] },
    'soft-brushed': { p: 'synth', s: function (S) { S.drums = 'brush'; S.shuffle = Math.max(S.shuffle, 0.2); S.dv = 0.7; } },
    'close-micd': { p: 'guitar', any: 1, fx: { ls: [220, 6], hs: [5000, 2], comp: [-20, 3, 1.3] }, c: ['근접 효과 저역'] },
    'sub-bass-heavy': { p: 'synth', s: function (S) { setLay(S, 'bass', { inst: 'sub', pat: (lay(S, 'bass') || {}).pat || 'half', vol: 0.95, oct: -1 }); }, c: ['서브 강조'] },
    'distorted': { p: 'guitar', any: 1, fx: { dist: { k: 40, c: 'fuzz', tone: 4200, pre: 2, post: 0.35 }, hp: 90 }, c: ['퍼즈 디스토션'] },
    'clean-tone': { p: 'guitar', any: 1, fx: { chorus: { rate: 0.9, depth: 0.005, mix: 0.5 }, comp: [-18, 2, 1.2] }, c: ['코러스'] },
    'bitcrushed': { p: 'guitar', any: 1, proc: [{ op: 'crush', rate: 6000, bits: 5 }], c: ['5비트', '6kHz'] },
    'filter-sweep': { p: 'guitar', any: 1, fx: { sweep: { period: 8, lo: 180, hi: 9000, q: 5 } }, c: ['로우패스 8초 스윕'] },
    'sparse-arrangement': { p: 'synth', s: function (S) { S.drums = 'none'; noLay(S, 'pad'); noLay(S, 'arp'); noLay(S, 'bass'); setInst(S, 'piano', 'sparse'); ensureMel(S, 'sparse', 'felt'); }, c: ['피아노만'] },
    'wall-of-sound': { p: 'synth', s: function (S) { drumsOn(S); S.crash = true; addPad(S, 0.35); S.layers.push(Ly('ch2', 'strings', 'block', 0.25)); S.layers.push(Ly('ch3', 'pluck', 'eighth', 0.3, { oct: 1 })); S.rev = 0.45; S.revType = 'hall'; S.drumRev = 0.3; }, c: ['레이어 겹침'] },

    /* 무드 */
    'euphoric': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 128, mode: 'major', prog: [3, 4, 5, 0], drums: 'four', crash: true, pump: 0.5, rev: 0.3, revType: 'hall' }, [Ly('pad', 'supersaw', 'block', 0.3), Ly('arp', 'pluck', '16up', 0.2), Ly('bass', 'synbass', 'offbeat', 0.5), Ly('mel', 'lead', 'hook', 0.3)]);
      else { moodMode(S, 'major'); addPad(S, 0.25); }
    } },
    'melancholic': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 72, mode: 'minor', root: 57, prog: [0, 5, 2, 6], drums: 'halftime', dv: 0.4, rev: 0.35, revType: 'hall', fill: false }, [Ly('chord', 'felt', 'pop', 0.55), Ly('pad', 'strings', 'block', 0.2), Ly('mel', 'felt', 'sparse', 0.3, { lo: 72 })]);
      else { moodMode(S, 'minor', 57); S.bpm = Math.round(S.bpm * 0.85); }
    } },
    'nostalgic': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 86, mode: 'major', prog: [0, 5, 3, 4], ext: 7, drums: 'lofi', dv: 0.55, swing: 0.15 }, [Ly('chord', 'rhodes', 'lofi', 0.55), Ly('bass', 'bass', 'half', 0.45), Ly('mel', 'bell', 'sparse', 0.2, { lo: 74 })]);
    }, fx: { wow: { rate: 0.45, depth: 10 }, lp: 6500, noise: { type: 'vinyl', lvl: 0.025 } }, c: ['테이프 흔들림'] },
    'eerie': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 70, mode: 'phrygian', root: 59, prog: [0, 1], drums: 'none', rev: 0.6, revType: 'cave', fill: false, weird: 0.25 }, [Ly('drone', 'cello', '', 0.4), Ly('mel', 'musicbox', 'sparse', 0.3, { lo: 76, det: 35 }), Ly('pad', 'pad', 'block', 0.2, { cut: 900 })]);
      else { S.mode = 'phrygian'; S.layers.push(Ly('drone', 'cello', '', 0.35)); }
    } },
    'triumphant': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 100, mode: 'mixolydian', root: 60, prog: [0, 6, 3, 0], drums: 'cine', crash: true, rev: 0.35, revType: 'hall', fill: false }, [Ly('chord', 'brass', 'fanfare', 0.35), Ly('pad', 'strings', 'block', 0.35), Ly('bass', 'cello', 'half', 0.35), Ly('mel', 'brass', 'hook', 0.3, { lo: 67 })]);
      else { moodMode(S, 'major'); S.layers.push(Ly('ch3', 'brass', 'fanfare', 0.3)); }
    } },
    'dreamy': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 80, mode: 'lydian', root: 60, prog: [0, 1], ext: 7, drums: 'none', rev: 0.6, revType: 'hall', fill: false }, [Ly('pad', 'pad', 'block', 0.45, { att: 0.8 }), Ly('arp', 'bell', '8up', 0.2, { oct: 1 })]);
      else { S.mode = 'lydian'; S.rev = Math.max(S.rev, 0.45); }
    }, fx: { chorus: { rate: 0.5, depth: 0.005, mix: 0.35 } } },
    'aggressive': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 150, mode: 'phrygian', root: 52, ch: 'power', prog: [0, 0, 1, 0], drums: 'punk', kit: { k: 1.2 } }, [Ly('chord', 'fuzz', 'eighth', 0.4, { dist: 20 }), Ly('bass', 'pickbass', 'eighth', 0.5, { dist: 3 })]);
      else { S.bpm = Math.round(S.bpm * 1.15); var c = chordLay(S); if (c) c.dist = 10; }
    } },
    'chillhop-mood': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 84, mode: 'major', prog: [1, 4, 0, 5], ext: 7, swing: 0.25, drums: 'lofi', dv: 0.6 }, [Ly('chord', 'rhodes', 'lofi', 0.6), Ly('bass', 'sub', 'half', 0.45)]);
      else { S.bpm = Math.round(S.bpm * 0.85); S.swing = Math.max(S.swing, 0.2); }
    } },
    'bittersweet': { p: 'synth', s: function (S) {
      S.mode = 'major'; S.prog = [5, 3, 0, 4];
      if (!S.g) { S.bpm = 92; S.ext = 7; setInst(S, 'piano', 'pop'); addPad(S, 0.22); lay(S, 'pad').inst = 'strings'; ensureMel(S, 'pop', 'felt'); S.dv = 0.55; }
    } },
    'tense': { p: 'synth', s: function (S) {
      if (!S.g) G(S, { bpm: 110, mode: 'minor', root: 57, prog: [0, 0, 5, 5], drums: 'tense', rev: 0.3, revType: 'hall', fill: false }, [Ly('ost', 'stacc', '', 0.35), Ly('drone', 'cello', '', 0.35), Ly('pad', 'strings', 'block', 0.15)]);
      else { S.layers.push(Ly('ost', 'stacc', '', 0.3)); S.mode = 'minor'; }
    } },

    /* 곡 구조 */
    'intro-tag': { p: 'synth', sec: [{ type: 'intro', label: '[Intro]', hl: 1 }, { type: 'verse', label: '[Verse]' }] },
    'verse-tag': { p: 'synth', sec: [{ type: 'verse', label: '[Verse 1]', hl: 1 }, { type: 'chorus', label: '[Chorus]' }] },
    'pre-chorus-tag': { p: 'synth', sec: [{ type: 'verse', label: '[Verse]' }, { type: 'pre', label: '[Pre-Chorus]', hl: 1 }, { type: 'chorus', label: '[Chorus]' }] },
    'chorus-tag': { p: 'synth', sec: [{ type: 'verse', label: '[Verse]' }, { type: 'chorus', label: '[Chorus]', hl: 1 }] },
    'post-chorus-tag': { p: 'synth', sec: [{ type: 'chorus', label: '[Chorus]' }, { type: 'post', label: '[Post-Chorus]', hl: 1 }] },
    'hook-tag': { p: 'synth', sec: [{ type: 'verse', label: '[Verse]' }, { type: 'hook', label: '[Hook]', hl: 1 }] },
    'bridge-tag': { p: 'synth', sec: [{ type: 'chorus', label: '[Chorus]' }, { type: 'bridge', label: '[Bridge]', hl: 1 }, { type: 'chorus', label: '[Chorus]' }] },
    'breakdown-tag': { p: 'synth', sec: [{ type: 'chorus', label: '[Chorus]' }, { type: 'breakdown', label: '[Breakdown]', hl: 1 }] },
    'build-up-tag': { p: 'synth', sec: [{ type: 'breakdown', label: '[Breakdown]' }, { type: 'buildup', label: '[Build-Up]', hl: 1 }, { type: 'drop', label: '[Drop]' }] },
    'drop-tag': { p: 'synth', sec: [{ type: 'buildup', label: '[Build-Up]' }, { type: 'drop', label: '[Drop]', hl: 1 }] },
    'instrumental-tag': { p: 'synth', sec: [{ type: 'verse', label: '[Verse]' }, { type: 'instrumental', label: '[Instrumental]', hl: 1 }] },
    'solo-tag': { p: 'synth', sec: [{ type: 'chorus', label: '[Chorus]' }, { type: 'solo', label: '[Guitar Solo]', hl: 1 }] },
    'outro-tag': { p: 'synth', sec: [{ type: 'chorus', label: '[Chorus]' }, { type: 'outro', label: '[Outro]', hl: 1 }, { type: 'fadeout', label: '[Fade Out]', hl: 1 }] },
    'fade-out-tag': { p: 'synth', sec: [{ type: 'chorus', label: '[Chorus]' }, { type: 'fadeout', label: '[Fade Out]', hl: 1, bars: 4 }] },
    'crescendo-tag': { p: 'synth', sec: [{ type: 'crescendo', label: '[Crescendo]', hl: 1, bars: 4 }] },
    'key-change-tag': { p: 'synth', sec: [{ type: 'chorus', label: '[Chorus]' }, { type: 'keychange', label: '[Key Change] +2', hl: 1 }] },
    'parameterized-tag': { p: 'synth', sec: [{ type: 'param', label: '[Verse: 기타만]', hl: 1 }, { type: 'chorus', label: '[Chorus]' }] },
    'silence-tag': { p: 'synth', sec: [{ type: 'verse', label: '[Verse]' }, { type: 'silence', label: 'just drums', hl: 1 }] },
    'timed-cues': { p: 'synth', sec: [{ type: 'instr0', label: '0:00 연주만', bars: 2 }, { type: 'verse', label: '0:15 가사 시작', hl: 1 }, { type: 'instrumental', label: '1:45 연주만' }] },

    /* 효과음 */
    'impact': { p: 'sfx', sfx: 'impact' },
    'whoosh': { p: 'sfx', sfx: 'whoosh', c: ['왼쪽 → 오른쪽'] },
    'braam': { p: 'sfx', sfx: 'braam' },
    'glitch-sfx': { p: 'sfx', sfx: 'glitch' },
    'drone-sfx': { p: 'sfx', sfx: 'drone' },
    'ambience': { p: 'sfx', sfx: 'ambience', c: ['빗소리', '먼 천둥'] },
    'foley': { p: 'sfx', sfx: 'foley', c: ['젖은 자갈'] },
    'one-shot': { p: 'sfx', sfx: 'coin', c: ['한 번 울림'] },
    'seamless-loop': { p: 'sfx', sfx: 'fire', c: ['이음새 없음'] },
    'stem': { p: 'synth', s: function (S) { S.layers = []; drumsOn(S); S.fill = true; }, c: ['드럼 스템만'] },
    'riser': { p: 'sfx', sfx: 'riser', c: ['8초 상승'] },
    'stinger': { p: 'sfx', sfx: 'stinger', c: ['3초'] },
    'ui-sound': { p: 'sfx', sfx: 'ui', c: ['0.5초'] },
    'material-surface': { p: 'sfx', sfx: 'glass', c: ['유리 · 콘크리트'] },
    'sequence-then': { p: 'sfx', sfx: 'sequence', c: ['발소리 → 철문'] },
    'distance-perspective': { p: 'sfx', sfx: 'explosion', fx: { lp: 320, rev: { type: 'hall', mix: 0.45 }, gain: 0.8 }, c: ['벽 너머', '로우패스'] },

    /* 음성·TTS */
    'tag-whispers': { p: 'voice', proc: [{ op: 'whisper', mix: 0 }], fx: { hp: 300, hs: [5000, 3] }, card: { k: 'script', ko: '[속삭임] 소리 내지 마.' }, c: ['속삭임 근사'] },
    'tag-sighs': { p: 'voice', proc: [{ op: 'breath', dur: 1.3, kind: 'out' }], card: { k: 'script', ko: '[한숨] 또 월요일이네.' }, c: ['앞에 한숨'] },
    'tag-excited': { p: 'voice', proc: [{ op: 'stretch', f: 0.88 }, { op: 'pitch', st: 2 }], fx: { hs: [4000, 3], comp: [-20, 3, 1.4] }, card: { k: 'script', ko: '[신남] 우리가 해냈어!' }, c: ['빠르게', '+2음'], n: '감정은 못 만들어요. 빠르고 높은 근사치예요' },
    'tag-sfx-inline': { p: 'voice', proc: [{ op: 'phrases', n: 2 }, { op: 'applause' }], card: { k: 'script', ko: '그리고 우승자는... [박수]' }, c: ['박수 삽입'] },
    'ellipsis-pause': { p: 'voice', proc: [{ op: 'gaps', extra: 0.7 }], card: { k: 'script', ko: '알아... 그냥 말하기 싫었어.' }, c: ['쉼 +0.7초'] },
    'ssml-break': { p: 'voice', proc: [{ op: 'gaps', extra: 0.03, first: 1.0 }], card: { k: 'script', ko: '환영해요. <쉼 1초> 시작할게요.' }, c: ['첫 쉼 1초'] },
    'ssml-prosody': { p: 'voice', proc: [{ op: 'stretch', f: 1.18 }, { op: 'pitch', st: -2 }], card: { k: 'script', ko: '속도 85% · 음높이 -2' }, c: ['85%', '-2음'] },
    'speed-setting': { p: 'voice', proc: [{ op: 'stretch', f: 1.11 }], card: { k: 'script', ko: 'speed 0.9' }, c: ['0.9배'] },
    'openai-instructions': { p: 'voice', proc: [{ op: 'stretch', f: 1.12 }, { op: 'gaps', extra: 0.35 }], fx: { ls: [250, 3], hs: [6000, -3] }, card: { k: 'script', ko: '차분하고 따뜻하게, 천천히' }, c: ['느리게', '따뜻한 EQ'] },
    'pacing-instruction': { p: 'voice', proc: [{ op: 'stretch', f: 1.2 }, { op: 'gaps', extra: 0.5 }], card: { k: 'script', ko: '천천히, 또박또박' }, c: ['0.83배', '쉼 늘림'] },
    'persona-narrator': { p: 'voice', proc: [{ op: 'pitch', st: -3 }], fx: { ls: [150, 6], comp: [-24, 4, 2], rev: { type: 'hall', mix: 0.25 } }, bed: function (S) { G(S, { bpm: 70, mode: 'minor', root: 50, prog: [0, 5], drums: 'none', rev: 0.4, revType: 'hall', master: 0.5 }, [Ly('drone', 'cello', '', 0.5), Ly('pad', 'strings', 'block', 0.25)]); }, card: { k: 'script', ko: '예고편 내레이터처럼 말해요' }, c: ['-3음', '홀', '저역'] },
    'breath-control': { p: 'voice', proc: [{ op: 'breath', dur: 0.9, kind: 'out' }, { op: 'breaths' }], card: { k: 'script', ko: '[숨] 좋아. 해 보자.' }, c: ['숨소리 삽입'] },
    'multi-speaker': { p: 'voice', proc: [{ op: 'speakers' }], card: { k: 'script', ko: '화자 1 ↔ 화자 2' }, c: ['화자 2: -4음 · 오른쪽'] },

    /* 모델 문법(소리 데모가 있는 것만) */
    'style-field': { p: 'synth', s: function (S) { GEN.folk(S); S.bpm = 80; moodMode(S, 'minor', 57); S.prog = [0, 5, 2, 6]; }, card: { k: 'field', title: 'Style of Music' } },
    'lyrics-field': { p: 'synth', sec: [{ type: 'verse', label: '[Verse 1]' }, { type: 'chorus', label: '[Chorus]', hl: 1 }], card: { k: 'field', title: 'Lyrics' } },
    'exclude-styles': { p: 'synth', sec: [{ ap: 'xsBefore', label: '제외 전' }, { ap: 'xsAfter', label: '제외 후', hl: 1 }], card: { k: 'field', title: 'Exclude Styles' } },
    'weirdness': { p: 'synth', sec: [{ ap: 'w25', label: '25%' }, { ap: 'w75', label: '75%', hl: 1 }], card: { k: 'slider', title: 'Weirdness', a: 25, b: 75 } },
    'instrumental-toggle': { p: 'synth', s: function (S) { ensureMel(S, 'pop', 'saw'); }, card: { k: 'toggle', title: 'Instrumental' }, c: ['보컬 없음'] },
    'cover-feature': { p: 'synth', sec: [{ ap: 'orig', label: '원곡' }, { ap: 'bossaCover', label: '커버 · 보사노바', hl: 1 }], card: { k: 'field', title: 'Cover' } },
    'extend-feature': { p: 'synth', sec: [{ type: 'chorus', label: '~2:10 기존' }, { type: 'outro', label: '연장 [Outro]', hl: 1 }], card: { k: 'field', title: 'Extend' } },
    'replace-section': { p: 'synth', sec: [{ type: 'verse', label: '0:25' }, { type: 'bridge', label: '0:45–1:05 교체', hl: 1 }, { type: 'chorus', label: '1:05' }], card: { k: 'field', title: 'Replace Section' } },
    'stems-feature': { p: 'synth', sec: [{ ap: 'full', label: '전체' }, { ap: 'drumsOnly', label: '드럼', hl: 1 }, { ap: 'bassOnly', label: '베이스', hl: 1 }, { ap: 'musicOnly', label: '코드·멜로디', hl: 1 }], card: { k: 'field', title: 'Get Stems' } },
    'udio-manual-mode': { p: 'synth', s: gs('synthwave'), card: { k: 'field', title: 'Manual Mode' } },
    'duration-setting': { p: 'sfx', sfx: 'door4', card: { k: 'field', title: 'duration' }, c: ['4초'] },
    'composition-plan': { p: 'synth', s: gs('synthwave'), sec: [{ type: 'intro', label: 'intro' }, { type: 'chorus', label: 'main', hl: 1 }], card: { k: 'field', title: 'composition_plan' } },
    'negative-prompt': { p: 'synth', sec: [{ ap: 'negBefore', label: '기본' }, { ap: 'negAfter', label: '네거티브 적용', hl: 1 }], card: { k: 'field', title: 'negative_prompt' } },
    'pipe-structured': { p: 'synth', s: function (S) { G(S, { bpm: 110, mode: 'dorian', root: 62, prog: [0, 3], ext: 7, drums: 'funk' }, [Ly('chord', 'clav', 'chop', 0.5), Ly('bass', 'slapb', 'slap', 0.6), Ly('ch2', 'rhodes', 'stab2', 0.3)]); }, card: { k: 'field', title: 'Format | Genre | BPM' } },
    'melody-conditioning': { p: 'synth', sec: [{ ap: 'humIn', label: '입력 · 허밍' }, { ap: 'stringsOut', label: '결과 · 현악', hl: 1 }], card: { k: 'field', title: 'melody + text' } },
    'lyria-realtime': { p: 'synth', s: function (S) { G(S, { bpm: 124, mode: 'minor', root: 57, prog: [0, 0, 5, 3], drums: 'techno' }, [Ly('bass', 'synbass', 'rolling', 0.45), Ly('chord', 'piano', 'stab', 0.3), Ly('arp', 'saw', '8up', 0.14, { lp: 1600 })]); }, card: { k: 'field', title: 'weighted prompts' } }
  };

  /* 모델 문법 섹션용 프리셋 */
  var AP = {
    xsBefore: function (S) { S.layers = [Ly('chord', 'fuzz', 'eighth', 0.3, { dist: 16 }), Ly('bass', 'pickbass', 'eighth', 0.5), Ly('mel', 'lead', 'pop', 0.28)]; S.drums = 'punk'; },
    xsAfter: function (S) { S.drums = 'none'; S.layers = [Ly('chord', 'piano', 'pop', 0.55), Ly('bass', 'bass', 'root', 0.5), Ly('mel', 'felt', 'pop', 0.32)]; },
    w25: function (S) { ensureMel(S, 'pop'); S.weird = 0.05; },
    w75: function (S) { ensureMel(S, 'fast', 'square'); S.weird = 0.75; S.ch = 'cluster'; S.drums = 'brk'; S.mode = 'phrygian'; },
    orig: function (S) { ensureMel(S, 'pop', 'lead'); },
    bossaCover: function (S) { var pr = S.prog, rt = S.root, md = S.mode; GEN.bossa(S); S.prog = pr; S.root = rt; S.mode = md; S.bpm = 100; S.layers.push(Ly('mel', 'felt', 'pop', 0.32, { lo: 67 })); },
    full: function (S) { ensureMel(S, 'pop'); },
    drumsOnly: function (S) { S.layers = []; },
    bassOnly: function (S) { S.drums = 'none'; S.layers = S.layers.filter(function (l) { return l.role === 'bass'; }); },
    musicOnly: function (S) { S.drums = 'none'; ensureMel(S, 'pop'); noLay(S, 'bass'); },
    negBefore: function (S) { setInst(S, 'fuzz', 'eighth'); lay(S, 'chord').dist = 14; lay(S, 'chord').vol = 0.3; S.layers.push(Ly('mel', 'choir', 'pop', 0.4, { vowel: 'a' })); },
    negAfter: function (S) { ensureMel(S, 'pop', 'saw'); },
    humIn: function (S) { S.drums = 'none'; S.layers = [Ly('mel', 'hum', 'pop', 0.6, { lo: 67 })]; S.rev = 0.1; },
    stringsOut: function (S) { S.drums = 'cine'; S.rev = 0.4; S.revType = 'hall'; S.layers = [Ly('mel', 'strings', 'pop', 0.45, { lo: 67 }), Ly('chord', 'strings', 'block', 0.3), Ly('bass', 'cello', 'half', 0.35)]; }
  };

  /* ───────────── 용어 조합 → 재생 파라미터 ───────────── */
  var CAT_ORDER = { genre: 0, era: 1, mood: 2, 'key-harmony': 3, 'tempo-rhythm': 4, instrument: 5, vocal: 6, production: 7, structure: 8, sfx: 9, 'voice-tts': 10, 'model-syntax': 11 };
  var CANON = ['intro', 'instr0', 'verse', 'pre', 'chorus', 'post', 'hook', 'bridge', 'breakdown', 'buildup', 'drop', 'instrumental', 'solo', 'keychange', 'crescendo', 'param', 'silence', 'outro', 'fadeout'];
  var NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MODEKO = { major: '장조', minor: '단조', dorian: '도리안', phrygian: '프리지안', lydian: '리디안', mixolydian: '믹솔리디안', harmonic: '화성단음계' };
  var INSTKO = {
    piano: '피아노', grand: '그랜드 피아노', felt: '펠트 피아노', rhodes: '로즈 피아노', dx: 'FM 일렉 피아노', pad: '아날로그 패드', supersaw: '슈퍼소 신스',
    strings: '현악', stacc: '스타카토 현악', brass: '브라스', organ: '오르간', lead: '신스 리드', saw: '톱니파 신스', square: '사각파 신스',
    pluck: '어쿠스틱 기타', nylon: '나일론 기타', muted: '뮤트 기타', gayageum: '가야금', pizz: '피치카토', fuzz: '퍼즈 기타', steel: '페달 스틸',
    bell: '벨', musicbox: '뮤직박스', choir: '합창', hum: '허밍', cowbell: '카우벨', clav: '클라비넷', cello: '첼로 드론', vox: '보컬 찹',
    bass: '베이스', sub: '서브베이스', synbass: '신스 베이스', pickbass: '피크 베이스', reese: '리스 베이스', wob: '워블 베이스', upright: '업라이트 베이스', slapb: '슬랩 베이스', b808: '808 베이스'
  };
  var BASECHIPS = { guitar: ['원본', 'D 코드 스트럼'], voice: ['원본', '시 낭독'], sfx: ['원본', '문 삐걱 · 쿵'] };

  function primaryFor(t) {
    var e = t && T[t.id]; if (e) return e.p;
    var c = t && t.category;
    return c === 'production' ? 'guitar' : (c === 'voice-tts' || c === 'vocal' ? 'voice' : (c === 'sfx' ? 'sfx' : 'synth'));
  }
  function mergeFx(dst, fx) {
    for (var k in fx) {
      if (k === 'pk') dst.pk = (dst.pk || []).concat(fx.pk);
      else if (k === 'rev' && dst.rev) { if (fx.rev.mix > dst.rev.mix) dst.rev = fx.rev; }
      else if (k === 'gain') dst.gain = (dst.gain || 1) * fx.gain;
      else dst[k] = fx[k];
    }
  }
  function songChips(S) {
    var out = [S.bpm + ' BPM', NOTE[(((S.root + S.tr) % 12) + 12) % 12] + ' ' + (MODEKO[S.mode] || '')];
    if (S.meter !== 4) out.push(S.unit < 1 ? S.meter + '/8박' : S.meter + '/4박');
    var main = lay(S, 'mel') || lay(S, 'chord') || lay(S, 'arp') || lay(S, 'pad') || lay(S, 'drone');
    if (main && INSTKO[main.inst]) out.push(INSTKO[main.inst]);
    if (!S.drums || S.drums === 'none') out.push('드럼 없음');
    else if (S.drums !== 'basic' && DKO[S.drums]) out.push(DKO[S.drums]);
    if (S.shuffle >= 0.2) out.push('셔플'); else if (S.swing >= 0.15) out.push('스윙');
    if (S.ch === 'power') out.push('파워코드'); else if (S.ext >= 9) out.push('9th 코드'); else if (S.ext >= 7) out.push('7th 코드');
    return out;
  }
  function build(terms, primary) {
    var P = { src: primary, S: baseSong(), fx: {}, proc: [], sfx: 'door', bed: null, cards: [], tchips: [], notes: [], skip: 0, used: 0, secs: [] };
    var list = terms.map(function (t, i) { return { t: t, i: i }; });
    list.sort(function (a, b) { var ca = CAT_ORDER[a.t.category], cb = CAT_ORDER[b.t.category]; ca = ca == null ? 6 : ca; cb = cb == null ? 6 : cb; return ca - cb || a.i - b.i; });
    list.forEach(function (it) {
      var t = it.t, e = t && T[t.id], src = P.src, ok = false;
      if (!e) { P.skip++; return; }
      try {
        if (e.p === src) {
          if (src === 'synth') { if (e.s) e.s(P.S); if (e.sec) P.secs.push(e.sec); }
          else if (src === 'sfx') { if (e.sfx) P.sfx = e.sfx; }
          else if (e.bed) { if (!P.bed) { P.bed = baseSong(); P.bed.drums = 'none'; P.bed.master = 0.5; } e.bed(P.bed); }
          ok = true;
        }
        if (e.p === src || e.any) {
          if (e.fx) mergeFx(P.fx, e.fx);
          if (e.proc) P.proc = P.proc.concat(e.proc);
          if (e.any) ok = true;
        }
      } catch (err) { ok = false; }
      if (!ok) { P.skip++; return; }
      P.used++;
      if (e.c) P.tchips = P.tchips.concat(e.c);
      if (e.n) P.notes.push(e.n);
      if (e.card) { var cd = {}; for (var k in e.card) cd[k] = e.card[k]; cd.text = t.snippet || t.term || ''; P.cards.push(cd); }
    });
    if (P.secs.length === 1) P.S.sec = secList(P.secs[0]);
    else if (P.secs.length > 1) {
      var seen = {}, pick = [];
      P.secs.forEach(function (lst) { lst.forEach(function (s) { var key = s.type || s.ap; if (s.hl && !seen[key]) { seen[key] = 1; pick.push(s); } }); });
      pick.sort(function (a, b) { return CANON.indexOf(a.type) - CANON.indexOf(b.type); });
      P.S.sec = secList(pick.slice(0, 6));
    }
    if (P.src === 'synth' && P.S.layers.length === 0 && (!P.S.drums || P.S.drums === 'none') && !P.S.sec) P.S.drums = 'basic';
    var chips;
    if (P.src === 'synth') chips = songChips(P.S).concat(P.tchips);
    else chips = P.used ? P.tchips.slice() : BASECHIPS[P.src].slice();
    var uniq = [];
    chips.forEach(function (c) { if (c && uniq.indexOf(c) < 0) uniq.push(c); });
    P.chips = uniq.slice(0, 5);
    return P;
  }

  /* ───────────── 실시간 이펙트 체인 ───────────── */
  var _loops = {};
  function noiseLoop(type) {
    if (_loops[type]) return _loops[type];
    var n = SR * 4, a = new Float32Array(n), r = rng(type.length * 17), lp = 0, i;
    if (type === 'vinyl') {
      for (i = 0; i < n; i++) { lp += ((r() * 2 - 1) - lp) * 0.3; a[i] = lp * 0.08; }
      for (var k = 0; k < 90; k++) { var p = Math.floor(r() * (n - 200)), amp = 0.2 + Math.pow(r(), 3) * 0.8; for (var j = 0; j < 60; j++) a[p + j] += (r() * 2 - 1) * amp * Math.exp(-j / 8); }
    } else if (type === 'room') {
      for (i = 0; i < n; i++) { lp = lp * 0.985 + (r() * 2 - 1) * 0.06; a[i] = lp; }
    } else {
      for (i = 0; i < n; i++) { var w = r() * 2 - 1; lp += (w - lp) * 0.6; a[i] = (w - lp) * 0.25 + lp * 0.1; }
    }
    var b = fromChans(stereo(seamlessEnd(a)));
    _loops[type] = b; return b;
  }
  function seamlessEnd(a) { return seamless(a, 0.2); }
  function ctlBuf(ac, period, fn) {
    var rate = 8000, n = Math.max(2, Math.floor(period * rate)), b = ac.createBuffer(1, n, rate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = fn(i / n);
    return b;
  }
  function buildChain(ac, fx) {
    var nodes = [], stops = [], now = ac.currentTime;
    function N(n) { nodes.push(n); return n; }
    function LO(type, f) { var o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(now); stops.push(o); nodes.push(o); return o; }
    function monoNode() { var g = N(gainN(ac, 1)); g.channelCount = 1; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; return g; }
    var inp = N(gainN(ac, fx.gain || 1)), cur = inp;
    function chain(n) { cur.connect(n); cur = n; return n; }
    if (fx.hp) chain(N(filt(ac, 'highpass', fx.hp, 0.7)));
    if (fx.lp) chain(N(filt(ac, 'lowpass', fx.lp, 0.7)));
    if (fx.ls) { var ls = N(filt(ac, 'lowshelf', fx.ls[0])); ls.gain.value = fx.ls[1]; chain(ls); }
    if (fx.hs) { var hs = N(filt(ac, 'highshelf', fx.hs[0])); hs.gain.value = fx.hs[1]; chain(hs); }
    if (fx.pk) fx.pk.forEach(function (p) { var b = N(filt(ac, 'peaking', p[0], p[2] || 1)); b.gain.value = p[1]; chain(b); });
    if (fx.dist) {
      var d = fx.dist; chain(N(gainN(ac, d.pre || 1)));
      var sh = N(ac.createWaveShaper()); sh.curve = curve(d.c || 'fuzz', d.k); sh.oversample = '4x'; chain(sh);
      chain(N(filt(ac, 'lowpass', d.tone || 5000, 0.7))); chain(N(gainN(ac, d.post == null ? 0.6 : d.post)));
    }
    if (fx.comp) {
      var c = N(ac.createDynamicsCompressor()); c.threshold.value = fx.comp[0]; c.ratio.value = fx.comp[1]; c.attack.value = 0.005; c.release.value = 0.15; c.knee.value = 6;
      chain(c); chain(N(gainN(ac, fx.comp[2] || 1.4)));
    }
    if (fx.sweep) {
      var sw = N(filt(ac, 'lowpass', 1000, fx.sweep.q || 4)), lo = fx.sweep.lo, hi = fx.sweep.hi;
      sw.frequency.value = 0;
      var cs = ac.createBufferSource(); nodes.push(cs); stops.push(cs);
      cs.buffer = ctlBuf(ac, fx.sweep.period, function (x) { var y = x < 0.75 ? x / 0.75 : 1 - (x - 0.75) / 0.25; return lo * Math.pow(hi / lo, y); });
      cs.loop = true; cs.connect(sw.frequency); cs.start(now);
      chain(sw);
    }
    if (fx.mono) chain(monoNode());
    if (fx.chorus) {
      var ch = fx.chorus, sum = N(gainN(ac, 1)), mer = N(ac.createChannelMerger(2));
      cur.connect(sum);
      for (var i = 0; i < 2; i++) {
        var dl = N(ac.createDelay(0.1)); dl.delayTime.value = 0.018 + i * 0.007;
        var lf = LO('sine', ch.rate * (1 + i * 0.17)), lg = N(gainN(ac, ch.depth)); lf.connect(lg); lg.connect(dl.delayTime);
        var wg = N(gainN(ac, ch.mix)); cur.connect(dl); dl.connect(wg); wg.connect(mer, 0, i);
      }
      mer.connect(sum); cur = sum;
    }
    if (fx.width) {
      var mo = monoNode(), m2 = N(ac.createChannelMerger(2)), hd = N(ac.createDelay(0.1));
      hd.delayTime.value = fx.width / 1000; cur.connect(mo); mo.connect(m2, 0, 0); mo.connect(hd); hd.connect(m2, 0, 1); cur = m2;
    }
    if (fx.double) {
      var md = monoNode(), m3 = N(ac.createChannelMerger(2)), dd = N(ac.createDelay(0.2)), dg = N(gainN(ac, 0.9));
      dd.delayTime.value = fx.double.ms / 1000;
      var lf2 = LO('sine', 0.35), lg2 = N(gainN(ac, 0.0025)); lf2.connect(lg2); lg2.connect(dd.delayTime);
      cur.connect(md); md.connect(m3, 0, 0); md.connect(dd); dd.connect(dg); dg.connect(m3, 0, 1); cur = m3;
    }
    var out = N(gainN(ac, 1)), dry = N(gainN(ac, fx.rev && fx.rev.dry != null ? fx.rev.dry : 1));
    cur.connect(dry); dry.connect(out);
    if (fx.delay) {
      var dy = fx.delay, wet = N(gainN(ac, dy.mix));
      if (dy.pp) {
        var mi = monoNode(), dL = N(ac.createDelay(2)), dR = N(ac.createDelay(2)), fb = N(gainN(ac, dy.fb)), mer2 = N(ac.createChannelMerger(2));
        dL.delayTime.value = dy.t; dR.delayTime.value = dy.t;
        cur.connect(mi); mi.connect(dL); dL.connect(dR); dR.connect(fb); fb.connect(dL);
        dL.connect(mer2, 0, 0); dR.connect(mer2, 0, 1); mer2.connect(wet);
      } else {
        var d2 = N(ac.createDelay(2)), fb2 = N(gainN(ac, dy.fb)), lpD = N(filt(ac, 'lowpass', 4500, 0.7));
        d2.delayTime.value = dy.t; cur.connect(d2); d2.connect(lpD); lpD.connect(fb2); fb2.connect(d2); lpD.connect(wet);
      }
      wet.connect(out);
    }
    if (fx.rev) {
      var cv = N(ac.createConvolver()); cv.buffer = makeIR(fx.rev.type, ac.sampleRate); var rw = N(gainN(ac, fx.rev.mix));
      cur.connect(cv); cv.connect(rw); rw.connect(out);
    }
    if (fx.noise) {
      var ns = ac.createBufferSource(); nodes.push(ns); stops.push(ns);
      ns.buffer = noiseLoop(fx.noise.type); ns.loop = true;
      var ng = N(gainN(ac, fx.noise.lvl * 5)); ns.connect(ng); ng.connect(out); ns.start(now);
    }
    return { inp: inp, out: out, nodes: nodes, stops: stops };
  }

  function startPlayback(ac, P, buf, bedBuf, loop) {
    var ch = buildChain(ac, P.fx), now = ac.currentTime, t0 = now + 0.05, srcs = [], lgW = null;
    var master = gainN(ac, 0), an = ac.createAnalyser();
    an.fftSize = 1024; an.smoothingTimeConstant = 0.78;
    ch.out.connect(master); master.connect(an); an.connect(ac.destination);
    master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(1, t0 + 0.04);
    var s = ac.createBufferSource(); s.buffer = buf; s.loop = loop !== false; s.connect(ch.inp);
    if (P.fx.wow && s.detune) {
      var lf = ac.createOscillator(); lf.frequency.value = P.fx.wow.rate;
      lgW = gainN(ac, P.fx.wow.depth); lf.connect(lgW); lgW.connect(s.detune); lf.start(now); ch.stops.push(lf); ch.nodes.push(lf, lgW);
    }
    s.start(t0); srcs.push(s);
    var stopped = false;
    function bed(b, at) {
      var bs = ac.createBufferSource(); bs.buffer = b; bs.loop = true;
      var bg = gainN(ac, 0.85); bs.connect(bg); bg.connect(master); bs.start(at); srcs.push(bs); ch.nodes.push(bg);
    }
    if (bedBuf) bed(bedBuf, t0);
    var ret = {
      an: an, t0: t0, len: buf.duration,
      /* 짧은 첫 구간 → 전체 루프로 같은 위치에서 교체 */
      swap: function (nb) {
        if (stopped) return;
        var n2 = ac.currentTime, tS = n2 + 0.06, off = Math.max(0, tS - t0) % nb.duration;
        var s2 = ac.createBufferSource(); s2.buffer = nb; s2.loop = true; s2.connect(ch.inp);
        if (lgW && s2.detune) lgW.connect(s2.detune);
        s2.start(tS, off);
        try { s.stop(tS); } catch (e) { /* noop */ }
        srcs.push(s2); s = s2; ret.len = nb.duration;
      },
      addBed: function (b) { if (!stopped && b) bed(b, ac.currentTime + 0.03); },
      stop: function () {
        if (stopped) return; stopped = true;
        var n2 = ac.currentTime;
        try { master.gain.cancelScheduledValues(n2); master.gain.setValueAtTime(master.gain.value, n2); master.gain.linearRampToValueAtTime(0, n2 + 0.06); } catch (e) { /* noop */ }
        setTimeout(function () {
          srcs.concat(ch.stops).forEach(function (n) { try { n.stop(); } catch (e) { /* noop */ } });
          ch.nodes.concat(srcs, [master, an]).forEach(function (n) { try { n.disconnect(); } catch (e) { /* noop */ } });
        }, 110);
      }
    };
    return ret;
  }

  /* ───────────── 백그라운드 미리 렌더(한 번에 하나, 유휴 시간) ───────────── */
  var BGQ = [], bgBusy = false;
  function bgEnqueue(fn) { var task = { fn: fn, dead: false }; BGQ.push(task); setTimeout(bgPump, 0); return task; }
  var bgWaiting = false;
  function bgPump() {
    if (bgBusy) return;
    if (userPending) { if (!bgWaiting) { bgWaiting = true; whenFree().then(function () { bgWaiting = false; setTimeout(bgPump, 80); }); } return; }
    var task = null;
    while (BGQ.length) { var t = BGQ.shift(); if (!t.dead) { task = t; break; } }
    if (!task) return;
    bgBusy = true;
    var ric = window.requestIdleCallback ? function (cb) { window.requestIdleCallback(cb, { timeout: 1500 }); } : function (cb) { setTimeout(cb, 120); };
    ric(function () {
      if (userPending) { BGQ.unshift(task); bgBusy = false; bgPump(); return; }
      var p = null;
      if (!task.dead) { try { p = task.fn(); } catch (e) { p = null; } }
      Promise.resolve(p).then(null, function () { /* 미리 렌더 실패는 무시 */ }).then(function () { bgBusy = false; setTimeout(bgPump, 40); });
    });
  }

  /* ───────────── 타일 UI ───────────── */
  function tok() {
    var cs = getComputedStyle(document.documentElement);
    function g(n, d) { var v = cs.getPropertyValue(n).trim(); return v || d; }
    return { fg: g('--fg', '#1a1a1a'), muted: g('--muted', '#8a8a8a'), accent: g('--accent', '#3a6df0'), line: g('--line', '#dddddd') };
  }
  var ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8v12.4c0 .6.7 1 1.2.7l9.6-6.2c.5-.3.5-1.1 0-1.4L7.2 3.1C6.7 2.8 6 3.2 6 3.8z" fill="currentColor"/></svg>';
  var ICON_STOP = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor"/></svg>';
  var ICON_LOAD = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="2.5"/><path d="M11 3a8 8 0 0 1 8 8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 11 11" to="360 11 11" dur="0.8s" repeatCount="indefinite"/></path></svg>';
  var ICON_LOAD_STATIC = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="6" cy="11" r="2" fill="currentColor"/><circle cx="11" cy="11" r="2" fill="currentColor" opacity=".7"/><circle cx="16" cy="11" r="2" fill="currentColor" opacity=".4"/></svg>';
  var HEAVY = { whisper: 1, stretch: 1, pitch: 1, speakers: 1, stutter: 1 };
  var KIND_COL = { c: 'fg', a: 'accent', m: 'accent', b: 'muted', d: 'muted', o: 'fg' };
  var LANE_ROW = { k: 0, t: 0, q: 0, s: 1, c: 1, r: 1, b: 1, p: 1, w: 1, m: 1, h: 2, o: 2, y: 2, sh: 2, x: 2, cr: 2 };

  function el$(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function cardHTML(cd) {
    var mono = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';
    var title = '<div style="font-size:10px;letter-spacing:.02em;color:var(--muted);margin-bottom:3px">' + esc(cd.title || '대본') + '</div>';
    var text = String(cd.text || '');
    if (text.length > 120) text = text.slice(0, 118) + '…';
    if (cd.k === 'script') {
      return '<div style="' + mono + 'font-size:12px;line-height:1.35;color:var(--fg)">' + esc(text) + '</div>' +
        (cd.ko ? '<div style="font-size:11px;line-height:1.35;color:var(--muted);margin-top:2px">' + esc(cd.ko) + '</div>' : '');
    }
    if (cd.k === 'slider') {
      return title + '<div style="position:relative;height:6px;border-radius:3px;background:var(--line);margin:6px 2px 4px">' +
        '<div style="position:absolute;left:0;top:0;bottom:0;width:' + cd.b + '%;border-radius:3px;background:var(--accent)"></div>' +
        '<div style="position:absolute;left:calc(' + cd.a + '% - 5px);top:-3px;width:10px;height:12px;border-radius:3px;background:var(--muted)"></div>' +
        '<div style="position:absolute;left:calc(' + cd.b + '% - 5px);top:-3px;width:10px;height:12px;border-radius:3px;background:var(--accent)"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)"><span>' + cd.a + '%</span><span style="color:var(--fg)">' + cd.b + '%</span></div>';
    }
    if (cd.k === 'toggle') {
      return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--fg)">' + esc(cd.title) +
        '<span style="display:inline-block;width:30px;height:16px;border-radius:8px;background:var(--accent);position:relative"><span style="position:absolute;right:2px;top:2px;width:12px;height:12px;border-radius:50%;background:var(--bg)"></span></span>' +
        '<span style="color:var(--muted)">ON</span></div>';
    }
    return title + '<div style="' + mono + 'font-size:11.5px;line-height:1.35;color:var(--fg);white-space:pre-wrap">' + esc(text) + '</div>';
  }

  function render(el, terms, ctx) {
    terms = Array.isArray(terms) ? terms : [];
    ctx = ctx || {};
    var primary = ctx.primary || (terms.length ? primaryFor(terms[0]) : 'guitar');
    if (['guitar', 'voice', 'synth', 'sfx'].indexOf(primary) < 0) primary = terms.length ? primaryFor(terms[0]) : 'guitar';
    var P;
    try { P = build(terms, primary); } catch (e) { P = build([], primary); P.skip = terms.length; }
    var reduced = !!ctx.reducedMotion;
    var dead = false, playing = null, loading = null, raf = 0, idle = null, ev = null, viewBuf = null, acRef = null, bins = null;

    el.innerHTML = '';
    var cv = el$('canvas', 'position:absolute;inset:0;width:100%;height:100%;display:block');
    cv.setAttribute('aria-hidden', 'true');
    var chipsEl = el$('div', 'position:absolute;top:8px;left:8px;right:8px;display:flex;flex-wrap:wrap;gap:4px;pointer-events:none');
    P.chips.forEach(function (c) {
      chipsEl.appendChild(el$('span', 'font-size:11px;line-height:1;padding:4px 7px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);white-space:nowrap', esc(c)));
    });
    var btn = el$('button', 'position:absolute;left:10px;bottom:10px;width:44px;height:44px;border-radius:50%;border:0;padding:0;background:var(--accent);color:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.18)');
    btn.type = 'button';
    var cap = el$('div', 'position:absolute;left:62px;right:10px;bottom:14px;font-size:11px;line-height:1.3;color:var(--muted);pointer-events:none;text-align:right');
    el.appendChild(cv); el.appendChild(chipsEl);
    var hasCard = P.cards.length > 0;
    if (hasCard) {
      var card = el$('div', 'position:absolute;left:50%;top:34px;transform:translateX(-50%);width:max-content;max-width:86%;max-height:46%;overflow:hidden;box-sizing:border-box;padding:7px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);pointer-events:none');
      card.innerHTML = cardHTML(P.cards[0]);
      el.appendChild(card);
    }
    el.appendChild(btn); el.appendChild(cap);

    var capText = '';
    if (terms.length === 1 && P.skip) capText = '이 용어는 소리로 보여주기 어려워요';
    else if (P.skip) capText = '적용 못 한 용어 ' + P.skip + '개는 건너뛰었어요';
    else if (P.notes.length) capText = P.notes[0];
    cap.textContent = capText;

    function setBtn(state) {
      btn.innerHTML = state === 'stop' ? ICON_STOP : (state === 'load' ? (reduced ? ICON_LOAD_STATIC : ICON_LOAD) : ICON_PLAY);
      btn.setAttribute('aria-label', state === 'play' ? '재생' : (state === 'load' ? '만드는 중, 누르면 취소' : '정지'));
      btn.setAttribute('aria-pressed', state === 'play' ? 'false' : 'true');
      btn.setAttribute('aria-busy', state === 'load' ? 'true' : 'false');
      if (state === 'load') cap.textContent = '소리를 만드는 중이에요';
    }
    setBtn('play');

    /* ── 그리기 ── */
    var dpr = 1, W = 0, H = 0;
    function geom() {
      var x0 = 62 * dpr, x1 = W - 12 * dpr, top = (hasCard ? 0.52 : 0.24) * H;
      return { x0: x0, x1: x1, top: top, bot: H * 0.7, drum: H * 0.73, secY: H * 0.8, secH: Math.max(12 * dpr, H * 0.09) };
    }
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.max(10, el.clientWidth), h = Math.max(10, el.clientHeight);
      W = Math.round(w * dpr); H = Math.round(h * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    }
    function drawIdle() {
      if (dead) return;
      size();
      var tk = tok(), off = document.createElement('canvas'); off.width = W; off.height = H;
      var g = off.getContext('2d'), G2 = geom();
      g.clearRect(0, 0, W, H);
      if (P.src === 'synth') {
        if (!ev) { try { ev = genEvents(P.S, null); } catch (e) { ev = { notes: [], drums: [], secs: [], len: 1 }; } }
        drawRoll(g, G2, tk);
      } else if (viewBuf) drawWave(g, G2, tk, viewBuf, P.used > 0);
      else { g.globalAlpha = 0.35; g.fillStyle = tk.muted; g.fillRect(G2.x0, (G2.top + G2.bot) / 2, G2.x1 - G2.x0, Math.max(1, dpr)); g.globalAlpha = 1; }
      idle = off;
      var c2 = cv.getContext('2d'); c2.clearRect(0, 0, W, H); c2.drawImage(off, 0, 0);
    }
    function drawRoll(g, G2, tk) {
      var len = ev.len || 1, lo = 127, hi = 0, i;
      for (i = 0; i < ev.notes.length; i++) { var m = ev.notes[i].m; if (m < lo) lo = m; if (m > hi) hi = m; }
      if (lo > hi) { lo = 48; hi = 72; }
      var span = Math.max(12, hi - lo + 1), rowH = (G2.bot - G2.top) / span, sx = (G2.x1 - G2.x0) / len;
      for (i = 0; i < ev.notes.length; i++) {
        var n = ev.notes[i], L = ev.layers ? ev.layers[n.L] : null, kd = L ? kindOf(L.role) : 'c';
        var col = tk[KIND_COL[kd] || 'fg'];
        g.globalAlpha = kd === 'm' ? 0.95 : (kd === 'c' ? 0.32 : 0.55);
        g.fillStyle = col;
        var x = G2.x0 + n.t * sx, w = Math.max(1.5 * dpr, Math.min(n.d, len - n.t) * sx - dpr), y = G2.bot - (n.m - lo + 1) * rowH;
        g.fillRect(x, y, w, Math.max(1.5 * dpr, rowH * 0.78));
      }
      var rh = Math.max(2 * dpr, (G2.secY - G2.drum) / 4);
      g.fillStyle = tk.muted;
      for (i = 0; i < ev.drums.length; i++) {
        var d = ev.drums[i], row = LANE_ROW[d.k] == null ? 1 : LANE_ROW[d.k];
        g.globalAlpha = 0.25 + 0.5 * Math.min(1, d.v);
        g.fillRect(G2.x0 + d.t * sx, G2.drum + (2 - row) * rh, Math.max(1.5 * dpr, 1.6 * dpr), rh * 0.7);
      }
      g.globalAlpha = 1;
      if (ev.secs.length > 1 || (ev.secs[0] && ev.secs[0].label)) {
        g.font = Math.round(10.5 * dpr) + 'px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
        for (i = 0; i < ev.secs.length; i++) {
          var s = ev.secs[i], a = G2.x0 + s.t0 * sx, b = G2.x0 + s.t1 * sx;
          g.globalAlpha = s.hl ? 0.22 : 0.08; g.fillStyle = s.hl ? tk.accent : tk.fg;
          g.fillRect(a + dpr, G2.secY, b - a - 2 * dpr, G2.secH);
          g.globalAlpha = 1; g.fillStyle = s.hl ? tk.accent : tk.muted;
          var lab = s.label || '', maxW = b - a - 6 * dpr;
          while (lab.length > 2 && g.measureText(lab).width > maxW) lab = lab.slice(0, -2) + '…';
          g.fillText(lab, (a + b) / 2, G2.secY + G2.secH / 2);
        }
      }
    }
    function drawWave(g, G2, tk, b, processed) {
      var bw = 2 * dpr, gap = 1 * dpr, n = Math.max(8, Math.floor((G2.x1 - G2.x0) / (bw + gap))), pk = peaksOf(b, n);
      var mid = (G2.top + H * 0.86) / 2, amp = (H * 0.86 - G2.top) / 2;
      g.fillStyle = processed ? tk.accent : tk.fg; g.globalAlpha = processed ? 0.75 : 0.45;
      for (var i = 0; i < n; i++) { var h = Math.max(dpr, pk[i] * amp); g.fillRect(G2.x0 + i * (bw + gap), mid - h, bw, h * 2); }
      g.globalAlpha = 1;
    }
    function frame() {
      if (dead || !playing) return;
      raf = requestAnimationFrame(frame);
      var c2 = cv.getContext('2d'), G2 = geom(), tk = tok();
      c2.clearRect(0, 0, W, H);
      if (idle) c2.drawImage(idle, 0, 0);
      if (!reduced) {
        if (!bins) bins = new Uint8Array(playing.an.frequencyBinCount);
        playing.an.getByteFrequencyData(bins);
        var N = 48, bwid = (G2.x1 - G2.x0) / N;
        c2.fillStyle = tk.accent; c2.globalAlpha = 0.28;
        for (var i = 0; i < N; i++) {
          var a = Math.floor(Math.pow(i / N, 2) * bins.length * 0.7) + 1, b2 = Math.max(a + 1, Math.floor(Math.pow((i + 1) / N, 2) * bins.length * 0.7) + 1), s = 0;
          for (var j = a; j < b2; j++) s += bins[j];
          var v = s / (b2 - a) / 255, h = v * H * 0.5;
          c2.fillRect(G2.x0 + i * bwid, H * 0.9 - h, Math.max(dpr, bwid - dpr), h);
        }
        c2.globalAlpha = 1;
      }
      var len = playing.len || 1, pos = ((acRef.currentTime - playing.t0) % len + len) % len;
      if (acRef.currentTime < playing.t0) pos = 0;
      var x = G2.x0 + pos / len * (G2.x1 - G2.x0);
      c2.fillStyle = tk.accent; c2.fillRect(x - dpr, G2.top - 4 * dpr, 2 * dpr, H * 0.9 - G2.top + 4 * dpr);
    }

    /* ── 준비·재생 ── */
    var fullBuf = null, bedBuf = null, mainPromise = null, bedPromise = null, bgTask = null;
    function mainP(user) {
      if (!mainPromise) {
        var mp;
        if (P.src === 'synth') mp = renderSong(P.S, user).then(function (r) { ev = r.ev; return procBuf('song:' + JSON.stringify(P.S), r.buf, P.proc); });
        else if (P.src === 'sfx') mp = renderSfx(P.sfx, user).then(function (b) { return procBuf('sfx:' + P.sfx, b, P.proc); });
        else mp = loadFile(P.src).then(function (b) { return procBuf(P.src, b, P.proc); });
        mainPromise = mp;
        mp.then(function (x) { fullBuf = x; }, function () { if (mainPromise === mp) mainPromise = null; });
      }
      return mainPromise;
    }
    function bedP() {
      if (!P.bed) return Promise.resolve(null);
      if (!bedPromise) {
        var bp = renderSong(P.bed).then(function (r) { return r.buf; });
        bedPromise = bp;
        bp.then(function (x) { bedBuf = x; }, function () { if (bedPromise === bp) bedPromise = null; });
      }
      return bedPromise;
    }
    function stopAll() {
      loading = null;
      if (playing) { playing.stop(); playing = null; }
      if (raf) cancelAnimationFrame(raf); raf = 0;
      if (!dead) { setBtn('play'); cap.textContent = capText; drawIdle(); }
    }
    btn.addEventListener('click', function () {
      if (playing || loading) { stopAll(); return; }
      var ac = null;
      try { ac = PD.sound && PD.sound.ctx ? PD.sound.ctx() : null; } catch (e) { ac = null; }
      if (!ac) { cap.textContent = '이 브라우저에서는 소리를 낼 수 없어요'; return; }
      acRef = ac;
      try { if (PD.sound.claim) PD.sound.claim(stopAll); } catch (e) { /* noop */ }
      var token = {}, started = false;
      loading = token; setBtn('load');
      function live() { return !dead && loading === token; }
      function begin(buf, partial) {
        if (!live()) return false;
        loading = null; started = true;
        cap.textContent = capText;
        if (P.src !== 'synth') { viewBuf = buf; drawIdle(); }
        playing = startPlayback(ac, P, buf, bedBuf, !partial);
        playing.token = token;
        if (partial && ev && ev.len) playing.len = ev.len;
        setBtn('stop'); bins = null;
        raf = requestAnimationFrame(frame);
        if (P.bed && !bedBuf) bedP().then(function (bb) { if (!dead && playing && playing.token === token) playing.addBed(bb); }, function () { /* 반주 없이 재생 */ });
        return true;
      }
      function fail() { if (!live()) return; loading = null; setBtn('play'); cap.textContent = '소리를 불러오지 못했어요'; }
      if (fullBuf) { begin(fullBuf, false); return; }
      if (P.src === 'synth') {
        /* 첫 2초만 바로 렌더(배경 렌더는 그동안 멈춤) → 재생 → 전체 루프로 교체 */
        var ended = false;
        var done = function () { if (!ended) { ended = true; userEnd(); } };
        var startFull = function () {
          mainP(false).then(function (fb) {
            if (started) { if (!dead && playing && playing.token === token) playing.swap(fb); }
            else begin(fb, false);
          }, fail);
        };
        userBegin();
        renderSongPart(P.S, 2).then(function (r) { return procBuf('part:' + JSON.stringify(P.S), r.buf, P.proc); }).then(function (pb) {
          done();
          if (!fullBuf && !started) begin(pb, true);
          if (fullBuf && !started) begin(fullBuf, false);
          if (live() || (playing && playing.token === token)) startFull();
        }, function () { done(); if (live()) startFull(); });
      } else mainP(true).then(function (fb) { begin(fb, false); }, fail);
    });

    /* ── 정지 상태 미리보기 ── */
    drawIdle();
    var heavy = P.proc.some(function (o) { return HEAVY[o.op]; });
    if (P.src === 'guitar' || P.src === 'voice') {
      var vp = heavy ? loadFile(P.src) : loadFile(P.src).then(function (b) { return procBuf(P.src, b, P.proc); });
      vp.then(function (b) { if (!dead && !viewBuf) { viewBuf = b; if (!playing) drawIdle(); } }).catch(function () { /* 파일 없음: 빈 미리보기 유지 */ });
    }
    bgTask = bgEnqueue(function () {
      if (dead || fullBuf) return null;
      return Promise.all([mainP(false), bedP()]).then(function () {
        if (!dead && P.src !== 'synth' && fullBuf && (!viewBuf || P.src === 'sfx')) { viewBuf = fullBuf; if (!playing) drawIdle(); }
      });
    });
    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () { if (!dead) { var w = Math.round(el.clientWidth * Math.min(2, window.devicePixelRatio || 1)); if (w !== W) drawIdle(); } });
      ro.observe(el);
    }

    return function cleanup() {
      dead = true;
      loading = null;
      if (bgTask) bgTask.dead = true;
      if (playing) { playing.stop(); playing = null; }
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      el.innerHTML = '';
    };
  }

  /* ───────────── 등록 ───────────── */
  var DEF = {
    aspect: '16/9',
    primaries: [
      { key: 'guitar', label: '어쿠스틱 기타 루프', src: 'assets/primary/guitar.mp3', prompt: 'A short acoustic guitar loop strumming a D chord' },
      { key: 'synth', label: '4마디 기본 루프', prompt: 'a simple 4-bar instrumental loop' },
      { key: 'voice', label: '시 낭독', src: 'assets/primary/voice.mp3', prompt: 'A woman reading a short poem aloud' },
      { key: 'sfx', label: '나무 문 열림', prompt: 'a heavy wooden door opening' }
    ],
    primaryFor: function (term) { return primaryFor(term); },
    supports: function (term) { return !!(term && T[term.id]); },
    render: function (el, terms, ctx) {
      try { return render(el, terms, ctx); }
      catch (e) { el.innerHTML = ''; var m = el$('div', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted)', '미리보기를 만들지 못했어요'); el.appendChild(m); return function () { el.innerHTML = ''; }; }
    }
  };
  var tries = 0;
  function reg() {
    if (typeof PD.registerRenderer === 'function') { PD.registerRenderer('audio', DEF); return; }
    if (tries++ < 100) setTimeout(reg, 100);
  }
  reg();
})();
