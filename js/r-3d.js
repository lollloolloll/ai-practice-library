// r-3d.js — 3D renderer for 프롬프트 사전 (ES module, three@0.160.0 via importmap)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
const SIZE = 1.4;
const CHAIR_SRC = 'assets/primary/chair.glb';
const HDR_SRC = 'assets/primary/studio.hdr';
const PAL = [0xe4572e, 0x29a36a, 0x3d7bd9, 0xf2c14e, 0x9b5de5, 0x17bebb];

// ---------------------------------------------------------------- utils
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function fmt(n) { return Math.round(n || 0).toLocaleString('en-US'); }
function std(color, rough, metal) {
  return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.5 : rough, metalness: metal || 0 });
}
function pastel(hex) { const c = new THREE.Color(hex); c.lerp(new THREE.Color(0xffffff), 0.4); return c; }
function mk(geo, mat, kind) {
  const m = new THREE.Mesh(geo, mat);
  m.userData.subj = true; m.userData.ownGeo = true; m.userData.kind = kind || 'part';
  return m;
}
function subjMeshes(root) {
  const out = [];
  root.traverse(function (o) { if (o.isMesh && o.userData.subj && o.visible) out.push(o); });
  return out;
}
function ownGeo(m) {
  if (!m.userData.ownGeo) { m.geometry = m.geometry.clone(); m.userData.ownGeo = true; }
}
function has(spec, f) { return spec.fx.indexOf(f) >= 0; }
// bounding box of the visible subject only (ignores blob shadows, helpers, floors)
function subjBox(obj) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3();
  obj.traverse(function (o) {
    if (!o.visible || !o.userData.subj || !(o.isMesh || o.isPoints)) return;
    const morph = o.geometry && o.geometry.morphAttributes && o.geometry.morphAttributes.position;
    b.expandByObject(o, !o.isInstancedMesh && !o.isPoints && !morph);
  });
  if (b.isEmpty()) b.setFromObject(obj);
  return b;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------- noise + canvases (module cache)
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = function (a) { return ((a % period) + period) % period; };
  const a = hash2(w(x0), w(y0), seed), b = hash2(w(x0 + 1), w(y0), seed);
  const c = hash2(w(x0), w(y0 + 1), seed), d = hash2(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(u, v, base, oct, seed) {
  let sum = 0, amp = 0.5, f = base, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(u * f, v * f, f, seed + o); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
const FIELD = new Map();
function heightField(S, base, oct, seed) {
  const key = S + '_' + base + '_' + oct + '_' + seed;
  if (!FIELD.has(key)) {
    const H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = fbm(x / S, y / S, base, oct, seed);
    FIELD.set(key, H);
  }
  return FIELD.get(key);
}
function imgCanvas(S, fn) {
  const c = mkCanvas(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), d = im.data;
  const col = [0, 0, 0];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      fn(x, y, col);
      const i = (y * S + x) * 4;
      d[i] = clamp(col[0], 0, 1) * 255; d[i + 1] = clamp(col[1], 0, 1) * 255; d[i + 2] = clamp(col[2], 0, 1) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}
function normalCanvas(H, S, str) {
  return imgCanvas(S, function (x, y, o) {
    const l = H[y * S + (x + S - 1) % S], r = H[y * S + (x + 1) % S];
    const u = H[((y + S - 1) % S) * S + x], d = H[((y + 1) % S) * S + x];
    const nx = (l - r) * str, ny = (d - u) * str, nz = 1;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    o[0] = nx / len * 0.5 + 0.5; o[1] = ny / len * 0.5 + 0.5; o[2] = nz / len * 0.5 + 0.5;
  });
}
const GEN = {
  checker: function () {
    const S = 512, N = 8, c = mkCanvas(S, S), g = c.getContext('2d'), s = S / N;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold ' + Math.round(s * 0.3) + 'px sans-serif';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const hue = (x * 45 + y * 20) % 360, dark = (x + y) % 2 === 1;
        g.fillStyle = dark ? 'hsl(' + hue + ',55%,40%)' : 'hsl(' + hue + ',60%,82%)';
        g.fillRect(x * s, y * s, s, s);
        g.fillStyle = dark ? '#ffffff' : '#222222';
        g.fillText(String.fromCharCode(65 + x) + (y + 1), x * s + s / 2, y * s + s / 2);
      }
    }
    return c;
  },
  normal: function () { return normalCanvas(heightField(256, 6, 5, 5), 256, 20); },
  height: function () {
    const S = 256, H = heightField(S, 6, 5, 5);
    return imgCanvas(S, function (x, y, o) { const v = H[y * S + x]; o[0] = v; o[1] = v; o[2] = v; });
  },
  finger: function () { return normalCanvas(heightField(256, 20, 2, 9), 256, 8); },
  wood: function () {
    const S = 256;
    return imgCanvas(S, function (x, y, o) {
      const u = x / S, v = y / S;
      const n = fbm(u, v, 4, 4, 21);
      const ring = 0.5 + 0.5 * Math.sin((u * 9 + n * 2.6) * Math.PI * 2);
      const fine = fbm(u, v, 32, 2, 23);
      const k = Math.pow(ring, 2.2) * 0.75 + fine * 0.25;
      o[0] = 0.78 - 0.36 * k; o[1] = 0.56 - 0.28 * k; o[2] = 0.34 - 0.2 * k;
    });
  },
  marble: function () {
    const S = 256;
    return imgCanvas(S, function (x, y, o) {
      const u = x / S, v = y / S;
      const n = fbm(u, v, 3, 5, 31);
      const t = Math.abs(Math.sin((u * 3 + v * 2 + n * 4) * Math.PI));
      const vein = clamp(Math.pow(1 - t, 5) * 0.9 + fbm(u, v, 16, 2, 33) * 0.12, 0, 1);
      o[0] = 0.95 - 0.53 * vein; o[1] = 0.94 - 0.5 * vein; o[2] = 0.92 - 0.44 * vein;
    });
  },
  tile: function () {
    const S = 256;
    return imgCanvas(S, function (x, y, o) {
      const k = smooth(0.3, 0.75, fbm(x / S, y / S, 4, 5, 51));
      o[0] = 0.86 - 0.36 * k; o[1] = 0.76 - 0.33 * k; o[2] = 0.6 - 0.28 * k;
    });
  },
  tileSeam: function () {
    const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
    g.drawImage(cv('tile'), 0, 0);
    let gr = g.createLinearGradient(0, 0, S, 0);
    gr.addColorStop(0, 'rgba(60,40,20,0.5)'); gr.addColorStop(1, 'rgba(255,250,240,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(255,250,240,0.25)'); gr.addColorStop(1, 'rgba(40,30,20,0.3)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  },
  grime: function () {
    const S = 256;
    const c = imgCanvas(S, function (x, y, o) {
      const u = x / S, v = y / S;
      const blot = smooth(0.52, 0.72, fbm(u, v, 4, 5, 41));
      const sp = smooth(0.6, 0.8, fbm(u, v, 32, 2, 43));
      const val = 1 - 0.5 * blot - 0.25 * sp;
      o[0] = val; o[1] = val * 0.94; o[2] = val * 0.84;
    });
    const g = c.getContext('2d'), r = rng(44);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(40,30,20,0.35)';
      g.lineWidth = 0.6 + r();
      const x = r() * S, y = r() * S, a = r() * Math.PI, l = 6 + r() * 26;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return c;
  },
  painted: function () {
    const S = 512, c = mkCanvas(S, S), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, '#f6c98f'); gr.addColorStop(0.55, '#d9824a'); gr.addColorStop(1, '#7a3b2a');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    const r = rng(3), cols = ['#ffe3b3', '#f2b880', '#e89a5c', '#b8573a', '#9c4a34', '#6e2f2a'];
    for (let i = 0; i < 700; i++) {
      const x = r() * S, y = r() * S;
      const ci = Math.min(cols.length - 1, Math.floor((y / S) * cols.length * 0.9 + r() * 1.5));
      g.globalAlpha = 0.12 + r() * 0.22;
      g.fillStyle = cols[ci];
      g.save(); g.translate(x, y); g.rotate(-0.5 + r() * 0.4);
      g.beginPath(); g.ellipse(0, 0, 10 + r() * 26, 3 + r() * 6, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    return c;
  },
  matcap: function () {
    const S = 256, L = new V3(-0.45, 0.55, 0.7).normalize(), Hh = new V3(L.x, L.y, L.z + 1).normalize();
    return imgCanvas(S, function (x, y, o) {
      const nx = (x + 0.5) / S * 2 - 1, ny = 1 - (y + 0.5) / S * 2, rr = nx * nx + ny * ny;
      if (rr > 1) { o[0] = 0.18; o[1] = 0.08; o[2] = 0.06; return; }
      const nz = Math.sqrt(1 - rr);
      const d = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
      const sp = Math.pow(Math.max(0, nx * Hh.x + ny * Hh.y + nz * Hh.z), 40);
      const rim = Math.pow(1 - nz, 3);
      const k = 0.22 + 0.9 * d;
      o[0] = 0.66 * k + sp * 0.35 + rim * 0.08; o[1] = 0.38 * k + sp * 0.33 + rim * 0.06; o[2] = 0.32 * k + sp * 0.3 + rim * 0.05;
    });
  },
  caustics: function () {
    const S = 256, r = rng(77), pts = [];
    for (let i = 0; i < 22; i++) pts.push([r(), r()]);
    return imgCanvas(S, function (x, y, o) {
      const u = x / S, v = y / S;
      let d1 = 9, d2 = 9;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(u - pts[i][0]), dy = Math.abs(v - pts[i][1]);
        if (dx > 0.5) dx = 1 - dx;
        if (dy > 0.5) dy = 1 - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      const k = 0.25 + 1.2 * Math.pow(1 - smooth(0, 0.05, e), 2);
      o[0] = k; o[1] = k; o[2] = k;
    });
  },
  blob: function () {
    const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  },
  disc: function () {
    const S = 64, c = mkCanvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  }
};
const LINEAR_TEX = { normal: true, height: true, finger: true };
const CV = new Map();
function cv(name) { if (!CV.has(name)) CV.set(name, GEN[name]()); return CV.get(name); }

// per-tile texture factory
function makeTexFactory(bag) {
  const base = new Map(), grads = new Map();
  return {
    tex: function (name, o) {
      o = o || {};
      let b = base.get(name);
      if (!b) {
        b = new THREE.CanvasTexture(cv(name));
        b.wrapS = b.wrapT = THREE.RepeatWrapping;
        if (!LINEAR_TEX[name]) b.colorSpace = THREE.SRGBColorSpace;
        b.anisotropy = 4;
        base.set(name, b); bag.tex.add(b);
      }
      const r = o.repeat || [1, 1];
      if (r[0] === 1 && r[1] === 1) return b;
      const t = b.clone();
      t.repeat.set(r[0], r[1]);
      t.needsUpdate = true;
      bag.tex.add(t);
      return t;
    },
    grad: function (n) {
      if (!grads.has(n)) {
        const d = new Uint8Array(n);
        for (let i = 0; i < n; i++) d[i] = Math.round(70 + (185 * i) / Math.max(1, n - 1));
        const t = new THREE.DataTexture(d, n, 1, THREE.RedFormat);
        t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
        grads.set(n, t); bag.tex.add(t);
      }
      return grads.get(n);
    },
    pixel: function (src, size) {
      const img = src && src.image;
      if (!img || !(img.width > 0)) return src;
      const c = mkCanvas(size, size), g = c.getContext('2d');
      try { g.drawImage(img, 0, 0, size, size); } catch (e) { return src; }
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      t.colorSpace = src.colorSpace; t.flipY = src.flipY; t.wrapS = src.wrapS; t.wrapT = src.wrapT;
      t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.rotation = src.rotation; t.center.copy(src.center);
      t.channel = src.channel;
      bag.tex.add(t);
      return t;
    }
  };
}

function tokenColor(el, name, fallback) {
  try {
    const probe = document.createElement('span');
    probe.style.color = 'var(' + name + ')';
    probe.style.display = 'none';
    el.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const cvs = mkCanvas(1, 1), g = cvs.getContext('2d');
    g.fillStyle = '#f3f3f3'; g.fillStyle = c; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
  } catch (e) {
    return new THREE.Color(fallback);
  }
}

// ---------------------------------------------------------------- asset loading (module cache)
const SHARED = { geos: new Set(), tex: new Set() };
let chairP = null, hdrP = null, rectInit = false;
function loadChair() {
  if (!chairP) {
    chairP = new Promise(function (res, rej) {
      new GLTFLoader().load(CHAIR_SRC, function (g) {
        const s = g.scene;
        s.traverse(function (o) {
          if (!o.isMesh) return;
          SHARED.geos.add(o.geometry);
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(function (m) { for (const k in m) { const v = m[k]; if (v && v.isTexture) SHARED.tex.add(v); } });
        });
        res(s);
      }, undefined, rej);
    });
    chairP.catch(function () { chairP = null; });
  }
  return chairP;
}
function loadHDR() {
  if (!hdrP) {
    hdrP = new Promise(function (res, rej) {
      new RGBELoader().load(HDR_SRC, function (t) {
        t.mapping = THREE.EquirectangularReflectionMapping;
        SHARED.tex.add(t);
        res(t);
      }, undefined, rej);
    });
    hdrP.catch(function () { hdrP = null; });
  }
  return hdrP;
}

// ---------------------------------------------------------------- geometry helpers
function clusterGeo(src, cell) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const p = g.attributes.position, n = p.count, inv = 1 / cell;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    P[i * 3] = Math.round(p.getX(i) * inv) * cell;
    P[i * 3 + 1] = Math.round(p.getY(i) * inv) * cell;
    P[i * 3 + 2] = Math.round(p.getZ(i) * inv) * cell;
  }
  const keep = [];
  for (let t = 0; t + 2 < n; t += 3) {
    const o = t * 3;
    const ax = P[o], ay = P[o + 1], az = P[o + 2];
    const bx = P[o + 3] - ax, by = P[o + 4] - ay, bz = P[o + 5] - az;
    const cx = P[o + 6] - ax, cy = P[o + 7] - ay, cz = P[o + 8] - az;
    const x = by * cz - bz * cy, y = bz * cx - bx * cz, z = bx * cy - by * cx;
    if (x * x + y * y + z * z > 1e-14) keep.push(t);
  }
  const out = new THREE.BufferGeometry();
  const m = keep.length * 3;
  const pos = new Float32Array(m * 3);
  keep.forEach(function (t, j) { for (let q = 0; q < 9; q++) pos[j * 9 + q] = P[t * 3 + q]; });
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ['uv', 'uv1'].forEach(function (name) {
    const a = g.attributes[name];
    if (!a) return;
    const arr = new Float32Array(m * 2);
    keep.forEach(function (t, j) {
      for (let q = 0; q < 3; q++) { arr[(j * 3 + q) * 2] = a.getX(t + q); arr[(j * 3 + q) * 2 + 1] = a.getY(t + q); }
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, 2));
  });
  out.computeVertexNormals();
  g.dispose();
  return out;
}
function removeGroup(geo, gi) {
  if (!geo.index || !geo.groups[gi]) return;
  const src = geo.index.array, g = geo.groups[gi], out = [];
  for (let i = 0; i < src.length; i++) { if (i >= g.start && i < g.start + g.count) continue; out.push(src[i]); }
  geo.setIndex(out);
  geo.clearGroups();
}
function linesFrom(pos, idx) {
  const out = new Float32Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) { out[i * 3] = pos.getX(idx[i]); out[i * 3 + 1] = pos.getY(idx[i]); out[i * 3 + 2] = pos.getZ(idx[i]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return g;
}
function quadLines(m) {
  const geo = m.geometry, pos = geo.attributes.position, ud = m.userData, idx = [];
  if (ud.grid) {
    const C = ud.grid.cols, R = ud.grid.rows, W = C + 1;
    if (pos.count < (R + 1) * W) return new THREE.EdgesGeometry(geo, 10);
    for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) idx.push(r * W + c, r * W + c + 1);
    for (let r = 0; r < R; r++) for (let c = 0; c <= C; c++) idx.push(r * W + c, (r + 1) * W + c);
  } else if (ud.boxQuads && geo.index) {
    const a = geo.index.array;
    for (let i = 0; i + 5 < a.length; i += 6) {
      const A = a[i], B = a[i + 1], D = a[i + 2], Cc = a[i + 4];
      idx.push(A, B, B, Cc, Cc, D, D, A);
    }
  } else {
    return new THREE.EdgesGeometry(geo, 10);
  }
  return linesFrom(pos, idx);
}
function seamLines(geo) {
  if (!geo.index || !geo.attributes.uv) return null;
  const pos = geo.attributes.position, ix = geo.index.array;
  const keyMap = new Map(), pid = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
    let id = keyMap.get(k);
    if (id === undefined) { id = keyMap.size; keyMap.set(k, id); }
    pid[i] = id;
  }
  const B = 67108864, edges = new Map(), seam = [];
  function visit(a, b) {
    let pa = pid[a], pb = pid[b], ia = a, ib = b;
    if (pa > pb) { const t = pa; pa = pb; pb = t; const u = ia; ia = ib; ib = u; }
    const pk = pa * B + pb, ik = ia * B + ib, prev = edges.get(pk);
    if (prev === undefined) edges.set(pk, ik);
    else if (prev !== ik && prev !== -1) { edges.set(pk, -1); seam.push(ia, ib); }
  }
  for (let t = 0; t + 2 < ix.length; t += 3) { visit(ix[t], ix[t + 1]); visit(ix[t + 1], ix[t + 2]); visit(ix[t + 2], ix[t]); }
  if (!seam.length) return null;
  return linesFrom(pos, seam);
}
function outlineMat(t) {
  const m = new THREE.MeshBasicMaterial({ color: 0x15161a, side: THREE.BackSide });
  const tt = t.toFixed(5);
  m.onBeforeCompile = function (sh) {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ) + normalize( normal ) * ' + tt + ';');
  };
  m.customProgramCacheKey = function () { return 'outline' + tt; };
  return m;
}
function fitGround(obj, target) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new V3());
  const k = target / (Math.max(s.x, s.y, s.z) || 1);
  obj.scale.multiplyScalar(k);
  reground(obj);
  return k;
}
function reground(obj) {
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj), c = b.getCenter(new V3());
  obj.position.set(-c.x, -b.min.y, -c.z);
  obj.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- subjects
function buildChair(src) {
  const root = src.clone(true);
  root.traverse(function (o) {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.userData.subj = true;
    o.userData.kind = /fabric/i.test(o.name) ? 'fabric' : (/wood/i.test(o.name) ? 'wood' : 'part');
    if (o.userData.kind === 'fabric') o.userData.main = true;
  });
  return root;
}
function primGeos(detail, holes) {
  const P = {};
  if (detail === 'low') {
    P.sphere = new THREE.IcosahedronGeometry(0.28, 1); P.sg = null;
    P.knot = new THREE.TorusKnotGeometry(0.3, 0.1, 36, 5); P.kg = { cols: 5, rows: 36 };
    P.box = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  } else {
    const D = { lowmid: [16, 12, 72, 10, 2], mid: [40, 28, 180, 20, 4], high: [128, 96, 512, 48, 12] }[detail] || [40, 28, 180, 20, 4];
    P.sphere = holes ? new THREE.SphereGeometry(0.28, D[0], D[1], 0, Math.PI * 1.45) : new THREE.SphereGeometry(0.28, D[0], D[1]);
    P.sg = { cols: D[0], rows: D[1] };
    P.knot = new THREE.TorusKnotGeometry(0.3, 0.1, D[2], D[3]); P.kg = { cols: D[3], rows: D[2] };
    P.box = new RoundedBoxGeometry(0.42, 0.42, 0.42, D[4], 0.06);
  }
  if (holes) removeGroup(P.box, 2);
  return P;
}
function buildPrims(spec) {
  const g = new THREE.Group(), d = spec.geo.detail || 'mid', P = primGeos(d, !!spec.geo.holes);
  const ped = mk(new THREE.CylinderGeometry(0.42, 0.46, 0.34, 64), std(0xdcd8d1, 0.65), 'pedestal');
  ped.position.y = 0.17; ped.userData.base = true;
  const knot = mk(P.knot, std(0x3d7bd9, 0.35, 0.1), 'knot');
  knot.position.y = 0.34 + 0.42; knot.userData.grid = P.kg; knot.userData.main = true;
  const sph = mk(P.sphere, std(0xc8643c, 0.5), 'sphere');
  sph.position.set(-0.8, 0.28, 0.12); sph.userData.grid = P.sg;
  const box = mk(P.box, std(0xe8c547, 0.55), 'box');
  box.position.set(0.78, 0.21, -0.05); box.rotation.y = 0.45; box.userData.boxQuads = true;
  if (d === 'low') { knot.userData.flat = true; sph.userData.flat = true; box.userData.flat = true; }
  if (spec.geo.holes) {
    [sph, box].forEach(function (m) {
      const inner = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x5a1010, side: THREE.BackSide }));
      inner.userData.helper = true;
      m.add(inner);
    });
  }
  g.add(ped, knot, sph, box);
  return g;
}
function buildHard(kit) {
  const g = new THREE.Group();
  const metal = function () { return std(0x8d939b, 0.38, 0.8); };
  const dark = function () { return std(0x2a2d31, 0.5, 0.4); };
  const acc = function () { return std(0xe07a2e, 0.45, 0.1); };
  const add = function (geo, mat, x, y, z, kind) { const m = mk(geo, mat, kind); m.position.set(x, y, z); g.add(m); return m; };
  const body = add(new RoundedBoxGeometry(1.0, 0.42, 0.7, 3, 0.05), metal(), 0, 0.29, 0, 'body');
  body.userData.main = true; body.userData.boxQuads = true;
  [[-0.4, -0.27], [0.4, -0.27], [-0.4, 0.27], [0.4, 0.27]].forEach(function (p) { add(new THREE.BoxGeometry(0.14, 0.08, 0.14), dark(), p[0], 0.04, p[1]); });
  const top = add(new RoundedBoxGeometry(0.55, 0.24, 0.5, 3, 0.04), metal(), -0.12, 0.62, 0, 'top');
  top.userData.boxQuads = true;
  const barrel = add(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 24), dark(), 0.4, 0.62, 0);
  barrel.rotation.z = Math.PI / 2;
  const muzzle = add(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 24), acc(), 0.72, 0.62, 0);
  muzzle.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(1.012, 0.014, 0.712), dark(), 0, 0.33, 0);
  add(new THREE.BoxGeometry(0.014, 0.43, 0.712), dark(), 0.16, 0.29, 0);
  add(new THREE.BoxGeometry(0.2, 0.006, 0.5), acc(), -0.12, 0.743, 0);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.26, 0.02, 0.006), dark(), -0.28, 0.2 + i * 0.045, 0.352);
  [[-0.45, 0.45], [0.45, 0.45], [-0.45, 0.13], [0.45, 0.13]].forEach(function (p) {
    const b = add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), acc(), p[0], p[1], 0.352);
    b.rotation.x = Math.PI / 2;
  });
  if (kit) {
    const r = rng(11);
    const mats = [metal, dark, acc, function () { return std(0x5b7da8, 0.4, 0.3); }];
    for (let i = 0; i < 46; i++) {
      const w = 0.04 + r() * 0.12, h = 0.03 + r() * 0.12, d = 0.04 + r() * 0.12;
      const geo = r() < 0.35 ? new THREE.CylinderGeometry(w * 0.5, w * 0.5, h, 16) : new THREE.BoxGeometry(w, h, d);
      const face = r();
      let x, y, z;
      if (face < 0.5) {
        x = -0.45 + r() * 0.9; z = -0.3 + r() * 0.6; y = 0.5 + h / 2;
        if (x > -0.42 && x < 0.18 && Math.abs(z) < 0.27) y = 0.74 + h / 2;
      } else if (face < 0.8) {
        x = -0.45 + r() * 0.9; y = 0.12 + r() * 0.32; z = 0.35 + d / 2;
      } else {
        x = 0.5 + w / 2; y = 0.12 + r() * 0.32; z = -0.3 + r() * 0.6;
      }
      add(geo, mats[Math.floor(r() * mats.length)](), x, y, z);
    }
  }
  return g;
}
function blobGeometry(seg, fine, asym) {
  const rows = Math.max(6, Math.round(seg * 0.75));
  const g = new THREE.SphereGeometry(0.5, seg, rows);
  const p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const xs = v.x * v.x;
    let d = 0.16 * Math.sin(3.4 * xs + 1.1) * Math.sin(2.3 * v.y + 0.4) + 0.12 * Math.sin(2.2 * v.z + 2.0 * v.y) + 0.1 * v.y - 0.12 * xs;
    if (asym) d += 0.18 * Math.sin(4.5 * v.x + 0.6) * Math.max(0, v.x) + 0.06 * Math.sin(6 * v.x * v.y);
    if (fine) d += 0.02 * Math.sin(23 * xs + 3 * v.z) * Math.sin(19 * v.y) + 0.012 * Math.sin(41 * v.y + 31 * xs + 9 * v.z);
    const r = 0.5 * (1 + d);
    p.setXYZ(i, v.x * r, v.y * r * 1.25, v.z * r);
  }
  g.computeVertexNormals();
  return { geo: g, grid: { cols: seg, rows: rows } };
}
function buildBlob(spec, sculpt) {
  const g = new THREE.Group();
  let b, mat;
  if (sculpt) {
    b = spec.geo.retopo ? blobGeometry(28, false, !!spec.geo.asym) : blobGeometry(160, true, !!spec.geo.asym);
    mat = std(0xb9a89a, 0.7);
  } else {
    b = blobGeometry(96, false, !!spec.geo.asym);
    mat = new THREE.MeshPhysicalMaterial({ color: 0xd9a184, roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(0xffc2a8) });
  }
  const m = mk(b.geo, mat, 'blob');
  m.userData.grid = b.grid; m.userData.main = true;
  g.add(m);
  return g;
}
function buildMannequin(spec) {
  const pr = (spec.geo && spec.geo.prop) || [1, 1], sx = pr[0], sy = pr[1];
  const g = new THREE.Group(), J = {}, body = [];
  const matC = function () { return std(0xcfc8bf, 0.55); };
  const L = { thigh: 0.42 * sy, shin: 0.42 * sy, upper: 0.28 * sy, fore: 0.26 * sy, torso: 0.5 * sy };
  const r0 = 0.055 * sx;
  const seg = function (len, r) {
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14);
    geo.translate(0, -len / 2, 0);
    return geo;
  };
  const part = function (parent, geo, x, y, z) {
    const m = mk(geo, matC(), 'body');
    m.position.set(x || 0, y || 0, z || 0);
    parent.add(m); body.push(m);
    return m;
  };
  const piv = function (parent, x, y, z, name) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z); parent.add(o); J[name] = o;
    return o;
  };
  const hipY = L.thigh + L.shin + 0.05;
  const pelvis = piv(g, 0, hipY, 0, 'pelvis');
  pelvis.userData.y0 = hipY;
  const pg = new THREE.CapsuleGeometry(0.1 * sx, 0.1 * sx, 6, 14);
  pg.rotateZ(Math.PI / 2);
  part(pelvis, pg);
  const spine = piv(pelvis, 0, 0.03, 0, 'spine');
  const tg = new THREE.CapsuleGeometry(0.15 * sx, Math.max(0.01, L.torso - 0.3 * sx), 6, 16);
  tg.translate(0, L.torso / 2, 0);
  tg.scale(1, 1, 0.7);
  part(spine, tg);
  const head = part(spine, new THREE.SphereGeometry(0.11, 24, 16), 0, L.torso + 0.17, 0);
  head.userData.main = true;
  const sides = [['L', 1], ['R', -1]];
  sides.forEach(function (sd) {
    const s = sd[0], k = sd[1];
    const sh = piv(spine, k * 0.21 * sx, L.torso - 0.07, 0, 'shoulder' + s);
    part(sh, seg(L.upper, r0));
    const el = piv(sh, 0, -L.upper, 0, 'elbow' + s);
    part(el, seg(L.fore, r0 * 0.88));
    part(el, new THREE.SphereGeometry(0.05, 14, 10), 0, -L.fore - 0.03, 0);
    const hip = piv(pelvis, k * 0.1 * sx, -0.04, 0, 'hip' + s);
    part(hip, seg(L.thigh, r0 * 1.3));
    const kn = piv(hip, 0, -L.thigh, 0, 'knee' + s);
    part(kn, seg(L.shin, r0 * 1.08));
    part(kn, new THREE.BoxGeometry(0.09, 0.05, 0.2), 0, -L.shin, 0.05);
  });
  const arm = spec.pose === 't' ? 90 : (spec.pose === 'walk' ? 8 : 45);
  J.shoulderL.rotation.z = arm * DEG;
  J.shoulderR.rotation.z = -arm * DEG;
  if (spec.fx && spec.fx.indexOf('bones') >= 0) {
    if (spec.mat !== 'heat') body.forEach(function (m) { m.material.transparent = true; m.material.opacity = 0.3; m.material.depthWrite = false; });
    const boneMat = new THREE.MeshBasicMaterial({ color: 0x2f7df6, depthTest: false, transparent: true });
    const jointMat = new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false, transparent: true });
    const up = new V3(0, 1, 0);
    const bone = function (parent, a, b) {
      const dir = new V3().subVectors(b, a), len = dir.length();
      if (len < 1e-4) return;
      const geo = new THREE.CylinderGeometry(0.012, 0.022, len, 6);
      geo.translate(0, len / 2, 0);
      const m = new THREE.Mesh(geo, boneMat);
      m.position.copy(a);
      m.quaternion.setFromUnitVectors(up, dir.normalize());
      m.renderOrder = 20; m.userData.helper = true;
      parent.add(m);
    };
    const joint = function (parent, p) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), jointMat);
      m.position.copy(p); m.renderOrder = 21; m.userData.helper = true;
      parent.add(m);
    };
    const O = new V3(0, 0, 0), chest = new V3(0, L.torso - 0.07, 0), headP = new V3(0, L.torso + 0.17, 0);
    bone(spine, O, chest); bone(spine, chest, headP); joint(spine, O); joint(spine, chest); joint(spine, headP);
    joint(pelvis, O);
    sides.forEach(function (sd) {
      const s = sd[0], k = sd[1];
      bone(spine, chest, new V3(k * 0.21 * sx, L.torso - 0.07, 0));
      bone(pelvis, O, new V3(k * 0.1 * sx, -0.04, 0));
      bone(J['shoulder' + s], O, new V3(0, -L.upper, 0)); joint(J['shoulder' + s], O);
      bone(J['elbow' + s], O, new V3(0, -L.fore, 0)); joint(J['elbow' + s], O); joint(J['elbow' + s], new V3(0, -L.fore, 0));
      bone(J['hip' + s], O, new V3(0, -L.thigh, 0)); joint(J['hip' + s], O);
      bone(J['knee' + s], O, new V3(0, -L.shin, 0)); joint(J['knee' + s], O); joint(J['knee' + s], new V3(0, -L.shin, 0));
    });
  }
  g.userData.joints = J;
  return g;
}
function walkPose(J, t) {
  const p = t * 4.2, s = Math.sin(p), c = Math.cos(p);
  J.hipL.rotation.x = -s * 0.5; J.hipR.rotation.x = s * 0.5;
  J.kneeL.rotation.x = 0.12 + Math.max(0, c) * 0.75;
  J.kneeR.rotation.x = 0.12 + Math.max(0, -c) * 0.75;
  J.shoulderL.rotation.x = s * 0.45; J.shoulderR.rotation.x = -s * 0.45;
  J.elbowL.rotation.x = -0.3; J.elbowR.rotation.x = -0.3;
  J.pelvis.position.y = J.pelvis.userData.y0 + Math.abs(c) * 0.02;
}
function buildBlend() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.45, 96, 64), tgt = geo.clone();
  const p = tgt.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const lon = Math.atan2(v.z, v.x), lat = Math.asin(clamp(v.y, -1, 1));
    const r = 0.45 * (1 + 0.38 * Math.max(0, Math.sin(lon * 3)) * Math.pow(Math.cos(lat), 2) + 0.12 * Math.max(0, v.y));
    p.setXYZ(i, v.x * r, v.y * r * 0.8, v.z * r);
  }
  tgt.computeVertexNormals();
  geo.morphAttributes.position = [tgt.attributes.position];
  geo.morphAttributes.normal = [tgt.attributes.normal];
  const m = mk(geo, std(0x7cc6a4, 0.35), 'blend');
  m.userData.main = true;
  m.position.y = 0.45;
  if (m.morphTargetInfluences) m.morphTargetInfluences[0] = 0.5;
  g.add(m);
  g.userData.morph = m;
  return g;
}
function buildSubd(level) {
  const g = new THREE.Group();
  let geo;
  if (!level) geo = new THREE.BoxGeometry(0.8, 0.8, 0.8, 2, 2, 2);
  else geo = new RoundedBoxGeometry(0.8, 0.8, 0.8, level === 1 ? 2 : 5, level === 1 ? 0.16 : 0.32);
  const m = mk(geo, std(0x8fb3e8, 0.45), 'box');
  m.userData.boxQuads = true; m.userData.main = true;
  if (!level) m.userData.flat = true;
  m.position.y = 0.4; m.rotation.y = 0.5;
  g.add(m);
  return g;
}

// ---------------------------------------------------------------- material pipeline
const NEED_PHYS = ['clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'attenuationColor', 'attenuationDistance', 'anisotropy', 'sheen', 'sheenColor', 'sheenRoughness'];
function toPhysical(m) {
  const p = new THREE.MeshPhysicalMaterial();
  ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'displacementMap'].forEach(function (k) { if (m[k]) p[k] = m[k]; });
  ['roughness', 'metalness', 'aoMapIntensity', 'emissiveIntensity', 'envMapIntensity', 'flatShading', 'side', 'vertexColors', 'transparent', 'opacity', 'depthWrite', 'displacementScale', 'displacementBias', 'normalMapType'].forEach(function (k) { if (m[k] !== undefined) p[k] = m[k]; });
  p.color.copy(m.color); p.emissive.copy(m.emissive); p.normalScale.copy(m.normalScale);
  p.name = m.name;
  return p;
}
function heatRamp(w, c) {
  if (w < 0.5) { const t = w * 2; c.setRGB(0.05 + 0.05 * t, 0.15 + 0.7 * t, 0.9 - 0.7 * t); }
  else { const t = (w - 0.5) * 2; c.setRGB(0.1 + 0.85 * t, 0.85 - 0.75 * t, 0.2 - 0.15 * t); }
}
function heatColors(m, J) {
  const S = J.shoulderL.getWorldPosition(new V3()), E = J.elbowL.getWorldPosition(new V3());
  const seg = new THREE.Line3(S, E), cp = new V3(), v = new V3(), c = new THREE.Color();
  const len = S.distanceTo(E) || 1;
  const p = m.geometry.attributes.position, cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
    seg.closestPointToPoint(v, true, cp);
    const w = 1 - smooth(0.12, 0.7, v.distanceTo(cp) / len);
    heatRamp(w, c);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  m.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}
function bakeColors(m) {
  const g = m.geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const N = g.attributes.normal, p = g.attributes.position;
  const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
  const L = new V3(0.5, 0.8, 0.35).normalize(), v = new V3(), w = new V3();
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    w.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
    const dif = Math.max(0, v.dot(L)), sky = 0.5 + 0.5 * v.y;
    const ao = 0.45 + 0.55 * clamp(w.y / 0.6, 0, 1);
    const val = clamp((0.22 * sky + 0.95 * dif) * ao + 0.06, 0, 1.2);
    cols[i * 3] = val; cols[i * 3 + 1] = val * 0.97; cols[i * 3 + 2] = val * 0.92;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}
function heightColors(m) {
  const g = m.geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, N = g.attributes.normal;
  const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
  const a = new THREE.Color(0x3d7bd9), b = new THREE.Color(0x29a36a), c = new THREE.Color(0xf2c14e);
  const w = new V3(), n = new V3(), col = new THREE.Color(), cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    w.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
    n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    const t = clamp(w.y / 1.2, 0, 1);
    if (t < 0.5) col.lerpColors(a, b, t * 2); else col.lerpColors(b, c, (t - 0.5) * 2);
    const k = 0.85 + 0.15 * n.x;
    cols[i * 3] = col.r * k; cols[i * 3 + 1] = col.g * k; cols[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}
function layerLines(mat) {
  mat.onBeforeCompile = function (sh) {
    sh.vertexShader = 'varying float vLayerY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLayerY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
    sh.fragmentShader = 'varying float vLayerY;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tfloat layF = fract( vLayerY * 70.0 );\n\tdiffuseColor.rgb *= 0.8 + 0.2 * smoothstep( 0.0, 0.35, layF ) * smoothstep( 1.0, 0.65, layF );');
  };
  mat.customProgramCacheKey = function () { return 'print'; };
}
function applyGrime(mat, T) {
  if (!('map' in mat)) return;
  const gt = T.tex('grime');
  if (!mat.map) { mat.map = gt; return; }
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.grimeMap = { value: gt };
    sh.fragmentShader = 'uniform sampler2D grimeMap;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= texture2D( grimeMap, vMapUv * 0.5 ).rgb;');
  };
  mat.customProgramCacheKey = function () { return 'grime'; };
}
function checkerRepeat(m, mode) {
  const k = m.userData.kind;
  if (mode === 'even') return ({ sphere: [4, 2], knot: [9, 1], box: [1, 1], pedestal: [6, 1] })[k] || [1, 1];
  if (mode === 'uneven') return ({ sphere: [1, 1], knot: [24, 4], box: [3, 3], pedestal: [1, 1], fabric: [4, 4] })[k] || [1, 1];
  return ({ sphere: [2, 1], knot: [12, 1], box: [1, 1], pedestal: [4, 1] })[k] || [1, 1];
}
function applyMaterials(holder, spec, T, info, bag) {
  const meshes = subjMeshes(holder);
  let foundAO = false;
  meshes.forEach(function (m, i) {
    const orig = m.material, base = !!m.userData.base;
    let mat = orig;
    const oc = orig.color ? orig.color.clone() : new THREE.Color(0xffffff);
    const pc = PAL[i % PAL.length];
    switch (spec.mat) {
      case 'clay': mat = std(0xb8b8b8, 1); break;
      case 'clayWhite': mat = std(0xf0f0f0, 0.9); break;
      case 'plasticine':
        mat = std(base ? 0xd8cfc4 : pc, 0.55);
        mat.normalMap = T.tex('finger', { repeat: [2, 2] }); mat.normalScale.set(0.45, 0.45);
        break;
      case 'toon': mat = new THREE.MeshToonMaterial({ color: oc, map: orig.map || null, gradientMap: T.grad(3) }); break;
      case 'toonBold': mat = new THREE.MeshToonMaterial({ color: base ? 0xf4efe6 : pc, gradientMap: T.grad(2) }); break;
      case 'stylized': mat = new THREE.MeshToonMaterial({ color: pastel(base ? 0xe9e1d6 : pc), gradientMap: T.grad(4) }); break;
      case 'matcap': mat = new THREE.MeshMatcapMaterial({ matcap: T.tex('matcap') }); break;
      case 'basic': mat = new THREE.MeshBasicMaterial({ color: oc, map: orig.map || null }); break;
      case 'phong': mat = new THREE.MeshPhongMaterial({ color: oc, map: orig.map || null, shininess: 30, specular: 0x333333 }); break;
      case 'baked': ownGeo(m); bakeColors(m); mat = new THREE.MeshBasicMaterial({ color: oc, map: orig.map || null, vertexColors: true }); break;
      case 'vcolor': ownGeo(m); heightColors(m); mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }); break;
      case 'ao':
        if (orig.aoMap) { foundAO = true; mat = new THREE.MeshBasicMaterial({ map: orig.aoMap }); }
        else mat = std(0xf2f2f2, 1);
        break;
      case 'parts': mat = std(pc, 0.5); break;
      case 'heat':
        if (holder.userData.joints) { ownGeo(m); heatColors(m, holder.userData.joints); mat = new THREE.MeshBasicMaterial({ vertexColors: true }); }
        break;
      case 'print': mat = std(0xf08a24, 0.62); layerLines(mat); break;
      case 'stl': mat = std(0x9aa1a8, 0.55); mat.flatShading = true; break;
      case 'vinyl': mat = new THREE.MeshPhysicalMaterial({ color: base ? 0x1b1b1f : pc, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }); break;
      case 'glossy': mat = new THREE.MeshPhysicalMaterial({ color: pastel(base ? 0xffffff : pc), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }); break;
      case 'painted': mat = new THREE.MeshBasicMaterial({ map: T.tex('painted') }); break;
      default: break;
    }
    if (m.userData.flat || spec.geo.flat) mat.flatShading = true;
    // parameter overrides
    const pk = Object.keys(spec.props);
    if (pk.length && !base && mat.isMeshStandardMaterial) {
      if (!mat.isMeshPhysicalMaterial && pk.some(function (k) { return NEED_PHYS.indexOf(k) >= 0; })) {
        const pm = toPhysical(mat);
        if (mat !== orig) bag.mats.add(mat);
        mat = pm;
      }
      pk.forEach(function (k) {
        const v = spec.props[k];
        if ((k === 'emissive' || k === 'emissiveIntensity') && !m.userData.main && meshes.length > 1) return;
        if (!(k in mat)) return;
        if (mat[k] && mat[k].isColor) mat[k].set(v); else mat[k] = v;
      });
      if (spec.props.anisotropy) {
        ownGeo(m);
        try {
          const gg = m.geometry;
          if (gg.index && gg.attributes.uv && gg.attributes.normal) gg.computeTangents();
        } catch (e) { /* ignore */ }
      }
    }
    // procedural maps
    const mp = spec.maps;
    const tgt = mp.target === 'main' ? !!m.userData.main : true;
    if (tgt && 'map' in mat) {
      if (mp.checker) { mat.map = T.tex('checker', { repeat: checkerRepeat(m, mp.texel) }); if (mat.color) mat.color.set(0xffffff); }
      if (mp.wood) { mat.map = T.tex('wood'); if (mat.color) mat.color.set(0xffffff); if ('roughness' in mat) mat.roughness = 0.5; }
      if (mp.marble) {
        mat.map = T.tex('marble'); if (mat.color) mat.color.set(0xffffff);
        if ('roughness' in mat) mat.roughness = 0.12;
        if ('metalness' in mat) mat.metalness = 0;
        if ('sheen' in mat) mat.sheen = 0;
      }
      if (mp.tile) { mat.map = T.tex(mp.tile === 'seam' ? 'tileSeam' : 'tile', { repeat: [3, 3] }); if (mat.color) mat.color.set(0xffffff); }
      if (mp.normalNoise && 'normalMap' in mat) { mat.normalMap = T.tex('normal', { repeat: [2, 2] }); mat.normalScale.set(1.4, 1.4); }
      if (mp.displace && !base && 'displacementMap' in mat) {
        const s = m.getWorldScale(new V3()).x || 1;
        mat.displacementMap = T.tex('height', { repeat: [2, 2] });
        mat.displacementScale = 0.06 / s; mat.displacementBias = -0.03 / s;
      }
      if (mp.grime) applyGrime(mat, T);
      if (mp.ensureMap && !mat.map) { mat.map = T.tex('wood'); if (mat.color) mat.color.set(0xffffff); }
      if (mp.pixel && mat.map) mat.map = T.pixel(mat.map, mp.pixel);
    }
    mat.needsUpdate = true;
    if (mat !== orig) { bag.mats.add(orig); m.material = mat; }
    m.castShadow = spec.lights !== 'caustics';
    m.receiveShadow = true;
  });
  if (spec.mat === 'ao' && !foundAO) info.needSSAO = true;
}
function addOverlays(holder, spec) {
  const meshes = subjMeshes(holder).filter(function (m) { return !m.isInstancedMesh; });
  meshes.forEach(function (m) {
    const s = m.getWorldScale(new V3()).x || 1;
    if (spec.outline) {
      const om = new THREE.Mesh(m.geometry, outlineMat(spec.outline / s));
      om.userData.helper = true; om.castShadow = false;
      m.add(om);
    }
    if (spec.wire) {
      let lg = null;
      if (spec.wire === 'tri') lg = new THREE.WireframeGeometry(m.geometry);
      else if (spec.wire === 'quad') lg = quadLines(m);
      else if (spec.wire === 'edges') lg = new THREE.EdgesGeometry(m.geometry, 20);
      else if (spec.wire === 'seams') lg = seamLines(m.geometry);
      if (lg) {
        const g = m.geometry, tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        const seams = spec.wire === 'seams';
        const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
          color: spec.wireColor || (seams ? 0xff2d55 : 0x111318),
          transparent: true,
          opacity: seams ? 1 : (spec.wire === 'tri' && tris > 20000 ? 0.28 : 0.55)
        }));
        ls.userData.helper = true;
        m.add(ls);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach(function (mm) { mm.polygonOffset = true; mm.polygonOffsetFactor = 1; mm.polygonOffsetUnits = 1; });
      }
    }
  });
}
function voxelize(holder, cell, splat, T) {
  holder.updateMatrixWorld(true);
  const meshes = subjMeshes(holder).filter(function (m) { return !m.isInstancedMesh; });
  const a = new V3(), b = new V3(), c = new V3(), tri = new THREE.Triangle();
  const ent = [];
  let total = 0;
  meshes.forEach(function (m) {
    const g = m.geometry, p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count;
    let area = 0;
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = ix ? ix.getX(i) : i, i1 = ix ? ix.getX(i + 1) : i + 1, i2 = ix ? ix.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, i0).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(p, i1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(p, i2).applyMatrix4(m.matrixWorld);
      tri.set(a, b, c);
      area += tri.getArea();
    }
    ent.push({ m: m, area: area });
    total += area;
  });
  if (!total) return 0;
  const N = splat ? 16000 : 40000, p = new V3(), nrm = new V3(), r = rng(5);
  const cells = new Map(), P = [], C = [];
  ent.forEach(function (e) {
    const cnt = Math.max(30, Math.round(N * e.area / total));
    let s;
    try { s = new MeshSurfaceSampler(e.m).build(); } catch (er) { return; }
    const col = e.m.material && e.m.material.color ? e.m.material.color.clone() : new THREE.Color(1, 1, 1);
    for (let i = 0; i < cnt; i++) {
      s.sample(p, nrm);
      p.applyMatrix4(e.m.matrixWorld);
      if (splat) {
        const j = 0.8 + r() * 0.4;
        P.push(p.x, p.y, p.z); C.push(col.r * j, col.g * j, col.b * j);
      } else {
        const kx = Math.round(p.x / cell), ky = Math.round(p.y / cell), kz = Math.round(p.z / cell);
        const key = kx + ',' + ky + ',' + kz;
        if (!cells.has(key)) cells.set(key, [kx, ky, kz, col]);
      }
    }
    e.m.visible = false;
  });
  if (splat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, map: T.tex('disc'), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9 }));
    pts.userData.subj = true;
    holder.add(pts);
    return P.length / 3;
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.97, cell * 0.97, cell * 0.97), new THREE.MeshStandardMaterial({ roughness: 0.75 }), Math.max(1, cells.size));
  const mtx = new THREE.Matrix4();
  let i = 0;
  cells.forEach(function (v) {
    mtx.makeTranslation(v[0] * cell, v[1] * cell, v[2] * cell);
    im.setMatrixAt(i, mtx);
    im.setColorAt(i, v[3]);
    i++;
  });
  im.count = cells.size;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.userData.subj = true; im.userData.ownGeo = true; im.userData.kind = 'voxel';
  holder.add(im);
  return cells.size;
}
function holderFx(holder, spec, T, info) {
  const box = subjBox(holder), s = box.getSize(new V3());
  if (has(spec, 'colliders')) {
    subjMeshes(holder).forEach(function (m) {
      if (m.isInstancedMesh) return;
      const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new V3());
      holder.add(new THREE.Box3Helper(b, 0x16a34a));
      const cm = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sz.x, 0.005), Math.max(sz.y, 0.005), Math.max(sz.z, 0.005)),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.14, depthWrite: false }));
      b.getCenter(cm.position);
      holder.add(cm);
    });
  }
  if (has(spec, 'bbox')) {
    holder.add(new THREE.Box3Helper(box.clone(), 0x2f7df6));
    const rs = info.rawSize, bb = spec.geo.bbox || [1, 1, 1];
    info.dims = 'W ' + (rs.x * bb[0]).toFixed(2) + ' × D ' + (rs.z * bb[2]).toFixed(2) + ' × H ' + (rs.y * bb[1]).toFixed(2) + ' m';
  }
  if (has(spec, 'pivot')) {
    const ax = new THREE.AxesHelper(0.5);
    ax.material.depthTest = false; ax.renderOrder = 30;
    holder.add(ax);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false }));
    dot.renderOrder = 31;
    holder.add(dot);
  }
  if (spec.shadow !== 'none') {
    const d = Math.max(s.x, s.z) * 1.35;
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(d, d), new THREE.MeshBasicMaterial({ map: T.tex('blob'), transparent: true, depthWrite: false, toneMapped: false }));
    bl.rotation.x = -Math.PI / 2;
    bl.position.set((box.min.x + box.max.x) / 2, 0.003, (box.min.z + box.max.z) / 2);
    bl.renderOrder = 1;
    holder.add(bl);
  }
}
function countTris(root) {
  let n = 0;
  root.traverse(function (o) {
    if (!o.isMesh || !o.visible || !o.userData.subj) return;
    const g = o.geometry, t = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    n += o.isInstancedMesh ? t * o.count : t;
  });
  return Math.round(n);
}
const CLUSTERABLE = { chair: true, hard: true, kitbash: true, organic: true, sculpt: true };
function buildHolder(spec, chairSrc, T, bag) {
  const kind = spec._subject;
  let root;
  if (kind === 'chair') root = buildChair(chairSrc);
  else if (kind === 'hard') root = buildHard(false);
  else if (kind === 'kitbash') root = buildHard(true);
  else if (kind === 'organic') root = buildBlob(spec, false);
  else if (kind === 'sculpt') root = buildBlob(spec, true);
  else if (kind === 'mannequin') root = buildMannequin(spec);
  else if (kind === 'blend') root = buildBlend();
  else if (kind === 'subd') root = buildSubd(spec.geo.subd == null ? 2 : spec.geo.subd);
  else root = buildPrims(spec);
  root.updateMatrixWorld(true);
  const rawSize = new THREE.Box3().setFromObject(root).getSize(new V3());
  const rawMax = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
  let subj = subjMeshes(root);
  if (spec.geo.cluster && CLUSTERABLE[kind]) {
    subj.forEach(function (m) {
      const ws = m.getWorldScale(new V3()).x || 1;
      m.geometry = clusterGeo(m.geometry, spec.geo.cluster * rawMax / ws);
      m.userData.ownGeo = true; m.userData.flat = true;
    });
  }
  if (spec.geo.blockout) {
    subj.forEach(function (m) {
      const b = new THREE.Box3().setFromObject(m), s = b.getSize(new V3()), c = b.getCenter(new V3());
      const bm = mk(new THREE.BoxGeometry(Math.max(s.x, 0.01), Math.max(s.y, 0.01), Math.max(s.z, 0.01)), std(0xbdbdbd, 0.9), 'block');
      bm.position.copy(c);
      root.add(bm);
      m.visible = false;
    });
    subj = subjMeshes(root);
  }
  if (has(spec, 'explode') && kind !== 'mannequin') {
    subj.map(function (m) { return { m: m, y: new THREE.Box3().setFromObject(m).getCenter(new V3()).y }; })
      .sort(function (a, b) { return a.y - b.y; })
      .forEach(function (e, i) { e.m.position.y += i * 0.16 * rawMax; });
  }
  const holder = new THREE.Group(), inner = new THREE.Group();
  inner.add(root); holder.add(inner);
  const k = fitGround(inner, SIZE);
  if (spec.geo.bbox) {
    const bb = spec.geo.bbox;
    inner.scale.set(inner.scale.x * bb[0], inner.scale.y * bb[1], inner.scale.z * bb[2]);
    reground(inner);
  }
  holder.updateMatrixWorld(true);
  const info = { tris: 0, vox: 0, parts: subj.filter(function (m) { return m.visible; }).length, rawSize: rawSize, k: k, dims: '', needSSAO: false };
  holder.userData.joints = root.userData.joints || null;
  holder.userData.morph = root.userData.morph || null;
  if (spec.geo.voxel) info.vox = voxelize(holder, spec.geo.voxel, false, T);
  else if (spec.geo.splat) info.vox = voxelize(holder, 0, true, T);
  applyMaterials(holder, spec, T, info, bag);
  addOverlays(holder, spec);
  holderFx(holder, spec, T, info);
  info.tris = countTris(holder);
  holder.userData.info = info;
  return holder;
}

// ---------------------------------------------------------------- scene fx, lights, camera
function sceneFx(scene, spec, content, T) {
  const s = content.getSize(new V3()), c = content.getCenter(new V3());
  const foot = Math.max(s.x, s.z);
  const out = { groundY: 0, fit: [] };
  const add = function (m, cast) { m.castShadow = !!cast; m.receiveShadow = true; scene.add(m); return m; };
  if (has(spec, 'diorama')) {
    const S = foot * 1.5 + 0.3;
    const dirt = add(new THREE.Mesh(new THREE.BoxGeometry(S, 0.26, S), std(0x8a5a3b, 0.9)));
    dirt.position.set(c.x, -0.19, c.z);
    const grass = add(new THREE.Mesh(new THREE.BoxGeometry(S * 1.005, 0.06, S * 1.005), std(0x6aa84f, 0.85)));
    grass.position.set(c.x, -0.03, c.z);
    out.fit.push(dirt);
    [[-1, -1], [1, -1], [-1, 1]].forEach(function (q, i) {
      const x = c.x + q[0] * S * 0.38, z = c.z + q[1] * S * 0.38;
      const trunk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 8), std(0x6b4423, 0.9)), true);
      trunk.position.set(x, 0.08, z);
      const cm = std(i === 1 ? 0x58a05a : 0x3f8f4a, 0.8); cm.flatShading = true;
      const crown = add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 7), cm), true);
      crown.position.set(x, 0.33, z);
    });
    [[0.3, 0.42], [-0.42, 0.1]].forEach(function (q) {
      const rm = std(0x9a9a96, 0.9); rm.flatShading = true;
      const rock = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.06), rm), true);
      rock.position.set(c.x + q[0] * S, 0.03, c.z + q[1] * S);
    });
    out.groundY = -0.32;
  }
  if (has(spec, 'figbase')) {
    const r = foot * 0.62;
    const b = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.08, 64), new THREE.MeshPhysicalMaterial({ color: 0x1b1b1f, roughness: 0.25, clearcoat: 1 })));
    b.position.set(c.x, -0.04, c.z);
    out.fit.push(b);
    out.groundY = Math.min(out.groundY, -0.08);
  }
  if (has(spec, 'turntableDisc')) {
    const r = foot * 0.7;
    const d = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 64), std(0xe9e6e1, 0.6)));
    d.position.set(c.x, -0.02, c.z);
    out.fit.push(d);
    out.groundY = Math.min(out.groundY, -0.04);
  }
  if (has(spec, 'grid')) {
    const gh = new THREE.GridHelper(4, 16, 0x8a8f98, 0xc4c8ce);
    const gms = Array.isArray(gh.material) ? gh.material : [gh.material];
    gms.forEach(function (m) { m.transparent = true; m.opacity = 0.6; });
    gh.position.set(c.x, 0.002, c.z);
    scene.add(gh);
  }
  if (has(spec, 'neon')) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(foot * 0.62, 0.016, 12, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.9, 0.35) }));
    ring.rotation.x = Math.PI / 2; ring.position.set(c.x, 0.02, c.z);
    scene.add(ring);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, s.y * 1.1, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 4) }));
    bar.position.set(c.x - foot * 0.55, s.y * 0.55, c.z - foot * 0.45);
    scene.add(bar);
  }
  if (has(spec, 'dofProps')) {
    const az = (spec.cam.azim != null ? spec.cam.azim : 36) * DEG;
    const d = new V3(Math.sin(az), 0, Math.cos(az)), p = new V3(Math.cos(az), 0, -Math.sin(az));
    const front = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 20), std(0x8fb3e8, 0.4)), true);
    front.position.copy(c).addScaledVector(d, foot * 1.1).addScaledVector(p, foot * 0.45); front.position.y = 0.16;
    const back = add(new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.4, 0.4, 3, 0.05), std(0xe8c547, 0.5)), true);
    back.position.copy(c).addScaledVector(d, -foot * 1.7).addScaledVector(p, -foot * 0.55); back.position.y = 0.2;
    const back2 = add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.07, 120, 16), std(0xc8643c, 0.4)), true);
    back2.position.copy(c).addScaledVector(d, -foot * 2.4).addScaledVector(p, foot * 0.7); back2.position.y = 0.32;
  }
  if (spec.floor === 'gi') {
    const f = add(new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std(0xb8321f, 0.9)));
    f.rotation.x = -Math.PI / 2; f.position.y = out.groundY;
    const w = add(new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), std(0x2f6fd6, 0.9)));
    w.rotation.y = Math.PI / 2; w.position.set(content.min.x - 0.35, 1.3 + out.groundY, c.z);
  } else if (spec.floor === 'lit') {
    const f = add(new THREE.Mesh(new THREE.CircleGeometry(3, 64), std(0xe2ded6, 0.95)));
    f.rotation.x = -Math.PI / 2; f.position.y = out.groundY;
  }
  return out;
}
function addLights(scene, spec, box, T) {
  const c = box.getCenter(new V3()), s = box.getSize(new V3());
  const R = Math.max(s.x, s.y, s.z) * 0.9 + 0.5;
  const shadowOn = spec.shadow !== 'none';
  const out = { lights: [], rays: null };
  const dir = function (color, inten, x, y, z, cast) {
    const l = new THREE.DirectionalLight(color, inten);
    l.position.set(c.x + x, y, c.z + z);
    l.target.position.copy(c);
    scene.add(l, l.target);
    if (cast && shadowOn) {
      l.castShadow = true;
      const sc = l.shadow.camera;
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.1; sc.far = 30;
      const ms = spec.shadow === 'hard' ? 2048 : 1024;
      l.shadow.mapSize.set(ms, ms);
      l.shadow.bias = -0.0005; l.shadow.normalBias = 0.02; l.shadow.radius = spec.shadow === 'hard' ? 1 : 4;
    }
    out.lights.push(l);
    return l;
  };
  const spot = function (color, inten, x, y, z, angle, pen, map) {
    const l = new THREE.SpotLight(color, inten, 0, angle, pen, 2);
    l.position.set(c.x + x, y, c.z + z);
    l.target.position.copy(c);
    if (map) l.map = map;
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0005; l.shadow.normalBias = 0.02;
    scene.add(l, l.target);
    out.lights.push(l);
    return l;
  };
  const point = function (color, inten, x, y, z) { const l = new THREE.PointLight(color, inten, 0, 2); l.position.set(x, y, z); scene.add(l); };
  switch (spec.lights) {
    case 'three':
      dir(0xfff1e0, 2.6, 2.4, 3.2, 2.4, true); dir(0xdfe8ff, 0.7, -3, 1.6, 1.4); dir(0xffffff, 3.2, -1, 3, -3);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 0.15));
      break;
    case 'rim':
      dir(0xbfd7ff, 5, -1.6, 2.2, -3, true); dir(0xffd2a6, 4, 2.2, 1.8, -2.6); dir(0xffffff, 0.25, 1, 1.2, 3);
      break;
    case 'softbox': {
      if (!rectInit) { RectAreaLightUniformsLib.init(); rectInit = true; }
      const rect = function (inten, w, h, x, y, z) {
        const l = new THREE.RectAreaLight(0xffffff, inten, w, h);
        l.position.set(c.x + x, y, c.z + z); l.lookAt(c); scene.add(l);
      };
      rect(9, 1.4, 1.0, 1.6, 2.0, 1.8); rect(3.5, 1.0, 1.6, -2.2, 1.2, 0.6); rect(4, 1.6, 1.6, 0, 2.8, -0.6);
      dir(0xffffff, 0.5, 0.5, 4, 0.8, true);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 0.35));
      break;
    }
    case 'sun':
      dir(0xfff0d6, 4.5, 3, 4.5, 1.2, true);
      scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x8a7a66, 0.6));
      break;
    case 'flat':
      scene.add(new THREE.AmbientLight(0xffffff, 2.8));
      break;
    case 'gi':
      dir(0xffffff, 1.6, 2.2, 4, 2.6, true);
      point(0xff5a3a, 1.2, c.x, 0.08, c.z + s.z * 0.7);
      point(0x3a7bff, 1.0, box.min.x - 0.1, c.y, c.z);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xff5030, 0.5));
      break;
    case 'caustics':
      spot(0xffffff, 40, 0.5, 3.2, 0.6, 0.6, 0.35, T.tex('caustics'));
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.35));
      break;
    case 'volumetric': {
      const l = spot(0xfff1d0, 35, 0.4, 3.4, -0.4, 0.42, 0.55);
      scene.add(new THREE.HemisphereLight(0x223044, 0x000000, 0.3));
      out.rays = godRays(scene, l.position.clone(), c, 0.42);
      break;
    }
    default:
      dir(0xffffff, 1.8, 2.2, 4, 2.6, true);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.5));
  }
  return out;
}
function godRays(scene, from, to, angle) {
  const dirV = new V3().subVectors(to, from);
  const h = (from.y + 0.2) / Math.max(0.2, -dirV.clone().normalize().y);
  const rad = Math.tan(angle) * h;
  const geo = new THREE.ConeGeometry(rad, h, 48, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0xfff1d0) }, uH: { value: h } },
    vertexShader: 'uniform float uH; varying float vY; varying vec3 vN; varying vec3 vV;\nvoid main() {\n  vY = position.y / uH + 0.5;\n  vec4 mv = modelViewMatrix * vec4( position, 1.0 );\n  vV = -mv.xyz;\n  vN = normalMatrix * normal;\n  gl_Position = projectionMatrix * mv;\n}',
    fragmentShader: 'uniform vec3 uColor; varying float vY; varying vec3 vN; varying vec3 vV;\nvoid main() {\n  float f = abs( dot( normalize( vN ), normalize( vV ) ) );\n  float a = pow( f, 2.0 ) * ( 0.03 + 0.24 * vY );\n  gl_FragColor = vec4( uColor * a, a );\n}'
  });
  const cone = new THREE.Mesh(geo, mat);
  const nd = dirV.clone().normalize();
  cone.quaternion.setFromUnitVectors(new V3(0, -1, 0), nd);
  cone.position.copy(from).addScaledVector(nd, h / 2);
  cone.renderOrder = 5;
  scene.add(cone);
  // dust motes
  const r = rng(9), P = [];
  for (let i = 0; i < 260; i++) {
    const t = 0.15 + r() * 0.85, a = r() * Math.PI * 2, rr = Math.sqrt(r()) * rad * t * 0.9;
    const q = new V3(Math.cos(a) * rr, h / 2 - t * h, Math.sin(a) * rr).applyQuaternion(cone.quaternion).add(cone.position);
    P.push(q.x, q.y, q.z);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff1d0, size: 0.012, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts);
  return pts;
}
function makeCam(def, box, aspect, orbit) {
  def = def || {};
  const size = box.getSize(new V3()), center = box.getCenter(new V3());
  const az = (def.azim != null ? def.azim : 36) * DEG, el = (def.elev != null ? def.elev : 18) * DEG;
  const dir = new V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  // subject should fill ~76% of frame height (or ~88% of width when wide)
  const FILL_V = 0.76, FILL_H = 0.88;
  let halfW, depthHalf;
  if (orbit) { halfW = Math.max(size.x, size.z) / 2 * 1.08; depthHalf = halfW; }
  else {
    halfW = (Math.abs(Math.cos(az)) * size.x + Math.abs(Math.sin(az)) * size.z) / 2;
    depthHalf = (Math.abs(Math.sin(az)) * size.x + Math.abs(Math.cos(az)) * size.z) / 2;
  }
  const halfV = (size.y / 2) * Math.cos(el) + depthHalf * Math.sin(el);
  let cam;
  if (def.ortho) {
    const hh = Math.max(halfV / FILL_V, halfW / (FILL_H * aspect));
    cam = new THREE.OrthographicCamera(-hh * aspect, hh * aspect, hh, -hh, 0.01, 100);
    cam.userData.hh = hh;
    cam.position.copy(center).addScaledVector(dir, 20);
    cam.userData.dist = 20;
  } else {
    const fov = def.fov || 30, v = fov * DEG / 2, h = Math.atan(Math.tan(v) * aspect);
    const dist = (Math.max(halfV / (FILL_V * Math.tan(v)), halfW / (FILL_H * Math.tan(h))) + depthHalf * 0.3) * (def.distMul || 1);
    cam = new THREE.PerspectiveCamera(fov, aspect, Math.max(0.01, dist / 60), dist * 8);
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.userData.dist = dist;
  }
  cam.lookAt(center);
  cam.userData.target = center.clone();
  return cam;
}
function setAspect(cam, a) {
  if (cam.isPerspectiveCamera) cam.aspect = a;
  else { const hh = cam.userData.hh || 1; cam.left = -hh * a; cam.right = hh * a; }
  cam.updateProjectionMatrix();
}

// ---------------------------------------------------------------- spec + term table
const NESTED = ['props', 'maps', 'geo', 'cam', 'post'];
function baseSpec() {
  return {
    subject: null, mat: null, props: {}, maps: {}, geo: {}, cam: {}, post: {}, fx: [], chips: [],
    wire: null, wireColor: null, outline: 0, env: 1, hdriBg: null, lights: 'default', shadow: 'soft',
    tone: 'aces', exposure: 1, bg: null, alphaBg: false, views: null, spin: true, pixel: 0, floor: null,
    anim: null, pose: 'a', variants: null
  };
}
function mergeInto(spec, p) {
  for (const k in p) {
    const v = p[k];
    if (NESTED.indexOf(k) >= 0) spec[k] = Object.assign({}, spec[k], v);
    else if (k === 'fx') { spec.fx = spec.fx.slice(); v.forEach(function (f) { if (spec.fx.indexOf(f) < 0) spec.fx.push(f); }); }
    else if (k === 'chip') spec.chips = spec.chips.concat([v]);
    else spec[k] = v;
  }
  return spec;
}
function cloneSpec(s) {
  const o = Object.assign({}, s);
  NESTED.forEach(function (k) { o[k] = Object.assign({}, s[k]); });
  o.fx = s.fx.slice(); o.chips = s.chips.slice();
  return o;
}
function variantSpec(s, patch) {
  const o = cloneSpec(s);
  o.variants = null;
  const p = Object.assign({}, patch || {});
  delete p.chip; delete p.variants;
  return mergeInto(o, p);
}

const mmFov = function (mm) { return 2 * Math.atan(24 / (2 * mm)) / DEG; };
const GLASS = { transmission: 1, roughness: 0.04, metalness: 0, thickness: 0.6, ior: 1.5, color: 0xffffff, map: null, sheen: 0 };
const POLY = {
  variants: [
    { label: '{tris} tris', patch: { geo: { detail: 'low', cluster: 0.08, flat: true } } },
    { label: '{tris} tris', patch: { geo: { detail: 'high' } } }
  ],
  wire: 'tri', chip: 'polycount'
};
const GEO_RES = {
  variants: [
    { label: 'low · {tris}', patch: { geo: { detail: 'lowmid', cluster: 0.05, flat: true } } },
    { label: 'high · {tris}', patch: { geo: { detail: 'high' } } }
  ],
  chip: 'geometry quality'
};
const TEX_Q = {
  variants: [
    { label: 'standard', patch: { maps: { ensureMap: true, pixel: 48 } } },
    { label: 'detailed', patch: { maps: { ensureMap: true } } }
  ],
  chip: 'texture quality'
};
const GAME = { geo: { cluster: 0.035, detail: 'lowmid' }, chip: 'game-ready · {tris} tris' };
const GI = { floor: 'gi', lights: 'gi', env: 0.5, chip: 'GI 근사' };
const VIEW_FSB = [
  { label: 'front', azim: 0, elev: 0, ortho: true }, { label: 'side', azim: 90, elev: 0, ortho: true }, { label: 'back', azim: 180, elev: 0, ortho: true }
];
const VIEW_TURN = [
  { label: 'front', azim: 0, elev: 0, ortho: true }, { label: '3/4', azim: 45, elev: 0, ortho: true },
  { label: 'side', azim: 90, elev: 0, ortho: true }, { label: 'back', azim: 180, elev: 0, ortho: true }
];
const VIEW_FOCAL = [24, 50, 135].map(function (mm) { return { label: mm + 'mm', fov: mmFov(mm), azim: 36, elev: 14 }; });
const VIEW_MULTI = [
  { label: 'front', azim: 0, elev: 6 }, { label: 'right', azim: 90, elev: 6 }, { label: 'back', azim: 180, elev: 6 }, { label: 'left', azim: 270, elev: 6 }
];

const TABLE = {
  // modeling-style
  'low-poly': { geo: { cluster: 0.07, detail: 'low', flat: true }, chip: 'low poly · {tris} tris' },
  'stylized': { mat: 'stylized', outline: 0.006, chip: 'stylized' },
  'realistic': { hdriBg: 0.35, env: 1.1, post: { ssao: 'beauty' }, chip: 'photoreal' },
  'hard-surface': { subject: 'hard', chip: 'hard surface' },
  'organic': { subject: 'organic', chip: 'organic' },
  'sculpted': { subject: 'sculpt', mat: 'matcap', chip: 'sculpt · {tris} tris' },
  'voxel': { geo: { voxel: 0.05 }, chip: 'voxel · {vox}개' },
  'toon-cartoon': { mat: 'toonBold', outline: 0.012, chip: 'toon · outline' },
  'clay-style': { mat: 'plasticine', chip: 'clay' },
  'isometric-diorama': { fx: ['diorama'], cam: { ortho: true, azim: 45, elev: 35.264 }, chip: 'isometric diorama' },
  'miniature': { fx: ['diorama'], cam: { elev: 40, fov: 26 }, post: { dof: 'tilt' }, chip: 'tilt-shift' },
  'figurine': { mat: 'vinyl', fx: ['figbase'], chip: 'vinyl figure' },
  'ps1-retro': { geo: { cluster: 0.06, detail: 'low', flat: true }, maps: { pixel: 16 }, pixel: 0.3, tone: 'linear', chip: 'PS1 · 저해상도' },
  'kitbash': { subject: 'kitbash', chip: 'kitbash' },
  'game-ready': GAME,
  'subdivision-smooth': {
    subject: 'subd', wire: 'quad', chip: 'subdivision',
    variants: [{ label: 'cage', patch: { geo: { subd: 0 } } }, { label: 'subdivision 2', patch: { geo: { subd: 2 } } }]
  },
  // topology
  'quad-topology': { wire: 'quad', chip: 'quad topology' },
  'triangle-mesh': { wire: 'tri', chip: '{tris} tris' },
  'retopology': {
    subject: 'sculpt', mat: 'clay', chip: 'retopology',
    variants: [{ label: 'sculpt · {tris}', patch: { wire: 'tri' } }, { label: 'retopo · {tris}', patch: { wire: 'quad', geo: { retopo: true } } }]
  },
  'polycount': POLY,
  'lod': {
    wire: 'tri', chip: 'LOD',
    variants: [
      { label: 'LOD0 · {tris}', patch: { geo: { detail: 'high' } } },
      { label: 'LOD1 · {tris}', patch: { geo: { detail: 'lowmid', cluster: 0.035 } } },
      { label: 'LOD2 · {tris}', patch: { geo: { detail: 'low', cluster: 0.09, flat: true } } }
    ]
  },
  'edge-flow': { mat: 'clay', wire: 'quad', wireColor: 0x2f6fd6, chip: 'edge flow' },
  'watertight': {
    subject: 'prims', chip: 'watertight',
    variants: [{ label: '구멍 있음', patch: { geo: { holes: true } } }, { label: 'watertight', patch: {} }]
  },
  'decimation': { wire: 'tri', geo: { cluster: 0.06, detail: 'low', flat: true }, chip: 'decimate · {tris} tris' },
  'remesh': { mat: 'clay', wire: 'tri', geo: { cluster: 0.03, detail: 'lowmid' }, chip: 'remesh · {tris} tris' },
  'flat-vs-smooth-shading': {
    chip: 'shading',
    variants: [{ label: 'flat', patch: { geo: { flat: true, detail: 'lowmid' } } }, { label: 'smooth', patch: { geo: { detail: 'lowmid' } } }]
  },
  'smart-low-poly': { geo: { cluster: 0.05, detail: 'low', flat: true }, wire: 'edges', chip: 'smart low poly · {tris}' },
  // material-pbr
  'pbr': { mat: 'phong', chip: 'PBR 끔 · Phong' },
  'albedo': { props: { color: 0x2f9e8f }, chip: 'base color #2F9E8F' },
  'roughness': { props: { roughness: 0.05, metalness: 0 }, chip: 'roughness 0.05' },
  'metallic': { props: { metalness: 1, roughness: 0.25, color: 0xd4a84a, map: null }, chip: 'metallic 1.0' },
  'normal-map': { maps: { normalNoise: true }, chip: 'normal map' },
  'ao-map': { mat: 'ao', env: 0, shadow: 'none', chip: 'AO map' },
  'height-displacement': { subject: 'prims', maps: { displace: true }, geo: { detail: 'high' }, chip: 'displacement 0.06' },
  'subsurface-scattering': {
    lights: 'three', env: 0.3, chip: 'SSS 근사',
    props: { color: 0xf0b49a, transmission: 0.55, thickness: 1.2, roughness: 0.45, metalness: 0, ior: 1.4, attenuationColor: 0xd23a2a, attenuationDistance: 0.4, map: null, sheen: 0 }
  },
  'emissive': { props: { emissive: 0xff6a2a, emissiveIntensity: 2.2 }, env: 0.25, bg: '#15161a', chip: 'emissive 2.2' },
  'translucent': { props: GLASS, chip: 'transmission 1' },
  'clearcoat': { props: { color: 0x9b111e, metalness: 0.5, roughness: 0.45, map: null, clearcoat: 1, clearcoatRoughness: 0.03 }, chip: 'clearcoat 1.0' },
  'anisotropic': { props: { color: 0xcfd3d6, metalness: 1, roughness: 0.35, map: null, anisotropy: 0.9 }, chip: 'anisotropy 0.9' },
  'shaded-baked': { mat: 'baked', env: 0, chip: 'baked lighting' },
  'remove-lighting': { mat: 'basic', env: 0, shadow: 'none', chip: 'unlit albedo' },
  'material-words': {
    chip: 'material words',
    variants: [
      { label: 'worn leather', patch: { props: { color: 0x6b3a1f, roughness: 0.75, metalness: 0, map: null }, maps: { normalNoise: true, grime: true } } },
      { label: 'brushed steel', patch: { props: { color: 0xc9ccd0, metalness: 1, roughness: 0.32, anisotropy: 0.8, map: null } } },
      { label: 'ceramic', patch: { props: { color: 0xf3efe6, roughness: 0.08, metalness: 0, clearcoat: 1, map: null } } }
    ]
  },
  // texturing
  'uv-unwrap': { maps: { checker: true }, chip: 'UV checker' },
  'uv-seams': { maps: { checker: true }, wire: 'seams', chip: 'UV seams' },
  'texture-baking': {
    subject: 'prims', chip: 'normal bake',
    variants: [
      { label: 'high · {tris}', patch: { geo: { detail: 'high' }, maps: { displace: true } } },
      { label: 'low + bake · {tris}', patch: { geo: { detail: 'lowmid' }, maps: { normalNoise: true } } }
    ]
  },
  'hand-painted-texture': { mat: 'painted', chip: 'hand-painted' },
  'texture-resolution': { maps: { ensureMap: true, pixel: 32 }, chip: 'texture 32px' },
  'texel-density': {
    maps: { checker: true }, chip: 'texel density',
    variants: [{ label: '불균일', patch: { maps: { texel: 'uneven' } } }, { label: '균일', patch: { maps: { texel: 'even' } } }]
  },
  'tileable': {
    chip: 'tileable',
    variants: [{ label: '이음새 보임', patch: { maps: { tile: 'seam' } } }, { label: 'seamless', patch: { maps: { tile: 'seamless' } } }]
  },
  'texture-prompt': { maps: { marble: true, target: 'main' }, chip: 'retexture · marble' },
  'vertex-color': { mat: 'vcolor', chip: 'vertex color' },
  'weathering': { maps: { grime: true }, props: { roughness: 0.85 }, chip: 'grime · wear' },
  // rendering
  'lumen': GI,
  'global-illumination': GI,
  'ray-tracing': { floor: 'mirror', lights: 'sun', shadow: 'hard', env: 0.6, chip: '반사 · 하드 섀도' },
  'path-tracing': { floor: 'gi', lights: 'gi', env: 0.6, post: { ssao: 'beauty' }, chip: 'GI · AO 근사' },
  'ambient-occlusion': { post: { ssao: 'beauty', strong: true }, chip: 'SSAO' },
  'clay-render': { mat: 'clay', chip: 'clay render' },
  'wireframe-render': { mat: 'clayWhite', wire: 'tri', chip: 'wireframe · {tris} tris' },
  'cel-shading': { mat: 'toon', outline: 0.007, chip: 'cel shading' },
  'keyshot-product': { bg: '#ffffff', lights: 'softbox', env: 0.6, chip: 'product render' },
  '3d-icon': { mat: 'glossy', bg: '#e9e5ff', lights: 'softbox', env: 0.6, cam: { fov: 14 }, chip: 'glossy 3D' },
  'depth-of-field': { post: { dof: 'normal' }, fx: ['dofProps'], chip: 'depth of field' },
  'bloom': { post: { bloom: true }, fx: ['neon'], env: 0.4, bg: '#121317', chip: 'bloom' },
  // lighting
  'hdri': { hdriBg: 0.2, env: 1.2, chip: 'HDRI' },
  'three-point-lighting': { lights: 'three', env: 0.12, chip: 'key · fill · rim' },
  'studio-lighting': { lights: 'softbox', env: 0.35, chip: 'softbox' },
  'rim-light': { lights: 'rim', env: 0.05, bg: '#14161b', chip: 'rim light' },
  'neutral-lighting': { lights: 'flat', env: 0, shadow: 'none', chip: 'flat light' },
  'volumetric-light': { lights: 'volumetric', env: 0.1, bg: '#0e1015', chip: 'god rays' },
  'caustics': { lights: 'caustics', floor: 'lit', env: 0.35, props: GLASS, chip: 'caustics' },
  // camera
  'turntable': { anim: 'turntable', fx: ['turntableDisc'], chip: 'turntable' },
  'orthographic': { cam: { ortho: true }, chip: 'orthographic' },
  'front-view': { views: VIEW_FSB, chip: 'front · side · back' },
  'three-quarter-view': { cam: { azim: 45, elev: 20 }, chip: '3/4 view' },
  'isometric-camera': { cam: { ortho: true, azim: 45, elev: 35.264 }, chip: 'isometric' },
  'focal-length': { views: VIEW_FOCAL, chip: 'focal length' },
  'character-turnaround': { subject: 'mannequin', pose: 'a', views: VIEW_TURN, chip: 'turnaround' },
  // rigging-animation
  'auto-rig': { subject: 'mannequin', pose: 'walk', fx: ['bones'], anim: 'walk', chip: 'auto rig' },
  't-pose': { subject: 'mannequin', pose: 't', chip: 'T-pose' },
  'a-pose': { subject: 'mannequin', pose: 'a', chip: 'A-pose' },
  'skinning': { subject: 'mannequin', pose: 'a', mat: 'heat', fx: ['bones'], chip: 'weight · 왼팔' },
  'skeleton-armature': { subject: 'mannequin', pose: 't', fx: ['bones'], chip: 'armature' },
  'retargeting': {
    subject: 'mannequin', pose: 'walk', anim: 'walk', chip: '같은 모션',
    variants: [{ label: '원본 리그', patch: {} }, { label: '다른 체형', patch: { geo: { prop: [1.3, 0.8] } } }]
  },
  'animation-preset': { subject: 'mannequin', pose: 'walk', anim: 'walkRoot', fx: ['grid'], chip: 'walk cycle' },
  'in-place': { subject: 'mannequin', pose: 'walk', anim: 'walk', fx: ['grid'], chip: 'in place' },
  'blendshapes': { subject: 'blend', anim: 'morph', chip: 'shape key' },
  // output-format
  'stl': { mat: 'stl', chip: 'STL · 색·UV 없음' },
  'ply-spz': { geo: { splat: true }, chip: 'splats · {vox}' },
  // use-case
  'game-asset': GAME,
  '3d-printing': { mat: 'print', chip: 'FDM 레이어' },
  'auto-size': { fx: ['bbox', 'scaleRef'], chip: '{dims}' },
  'origin-pivot': { fx: ['pivot'], chip: 'pivot · 바닥 중심' },
  'parts-segmentation': { mat: 'parts', fx: ['explode'], chip: '{parts} parts' },
  // input-prep
  'plain-background': { bg: '#ffffff', chip: '흰 배경' },
  'background-removal': { alphaBg: true, shadow: 'none', chip: '투명 배경' },
  'multiview-input': { views: VIEW_MULTI, chip: '4 views' },
  // model-params
  'meshy-geometry-resolution': GEO_RES,
  'tripo-geometry-quality': GEO_RES,
  'meshy-target-polycount': POLY,
  'tripo-face-limit': POLY,
  'meshy-symmetry': {
    subject: 'organic', mat: 'clay', cam: { azim: 0, elev: 8 }, spin: false, chip: 'symmetry',
    variants: [{ label: 'symmetry off', patch: { geo: { asym: true } } }, { label: 'symmetry on', patch: {} }]
  },
  'meshy-art-style': { mat: 'matcap', chip: 'art_style · sculpture' },
  'meshy-preview-refine': {
    chip: 'preview → refine',
    variants: [{ label: 'preview', patch: { mat: 'clay', geo: { cluster: 0.05, detail: 'lowmid' } } }, { label: 'refine', patch: {} }]
  },
  'tripo-texture-quality': TEX_Q,
  'rodin-highpack': TEX_Q,
  'rodin-material': { chip: 'material', variants: [{ label: 'PBR', patch: {} }, { label: 'Shaded', patch: { mat: 'baked' } }] },
  'rodin-mesh-quality': { chip: 'mesh mode', variants: [{ label: 'Raw · 삼각형', patch: { wire: 'tri' } }, { label: 'Quad', patch: { wire: 'quad' } }] },
  'rodin-tapose': { subject: 'mannequin', chip: 'TAPose', variants: [{ label: 'T-pose', patch: { pose: 't' } }, { label: 'A-pose', patch: { pose: 'a' } }] },
  'rodin-bbox': { fx: ['bbox'], geo: { bbox: [1.6, 0.8, 1] }, chip: 'bbox 1.6 : 0.8 : 1' },
  'hunyuan-generate-type': {
    chip: 'generate_type',
    variants: [
      { label: 'Normal', patch: {} },
      { label: 'LowPoly', patch: { geo: { cluster: 0.07, detail: 'low', flat: true } } },
      { label: 'Geometry', patch: { mat: 'clayWhite' } }
    ]
  },
  // world-gen
  'gaussian-splatting': { geo: { splat: true }, chip: '3DGS · {vox} splats' },
  'collider-mesh': { fx: ['colliders'], chip: 'collider' },
  'chisel-blockout': {
    chip: 'blockout → style',
    variants: [{ label: 'blockout', patch: { geo: { blockout: true }, mat: 'clay' } }, { label: 'style prompt', patch: {} }]
  },
  'panorama-360': { hdriBg: 0, cam: { fov: 70 }, env: 1, chip: '360° panorama' }
};
const PRIM_PREF = new Set([
  'quad-topology', 'triangle-mesh', 'polycount', 'edge-flow', 'watertight', 'flat-vs-smooth-shading',
  'pbr', 'albedo', 'roughness', 'metallic', 'normal-map', 'height-displacement', 'subsurface-scattering', 'emissive',
  'translucent', 'clearcoat', 'anisotropic', 'material-words', 'texel-density', 'tileable', 'texture-baking', 'caustics',
  'rodin-mesh-quality', 'meshy-target-polycount', 'tripo-face-limit', 'meshy-geometry-resolution', 'tripo-geometry-quality'
]);
function resolve(terms) {
  const spec = baseSpec(), used = [];
  (terms || []).forEach(function (t) {
    const p = t && Object.prototype.hasOwnProperty.call(TABLE, t.id) ? TABLE[t.id] : null;
    if (!p) return;
    mergeInto(spec, p);
    used.push(t);
  });
  return { spec: spec, used: used };
}

// ---------------------------------------------------------------- UI overlay
function makeUI(el) {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
  el.appendChild(layer);
  const base = 'position:absolute;font-size:12px;line-height:1.4;font-family:inherit;padding:2px 8px;border-radius:999px;' +
    'background:var(--surface);color:var(--fg);border:1px solid var(--line);white-space:nowrap;max-width:calc(100% - 16px);' +
    'overflow:hidden;text-overflow:ellipsis;opacity:0.94;box-sizing:border-box;';
  let chipEl = null, statusEl = null;
  return {
    chip: function (text) {
      if (!text) { if (chipEl) chipEl.remove(); chipEl = null; return; }
      if (!chipEl) { chipEl = document.createElement('div'); chipEl.style.cssText = base + 'left:8px;bottom:8px;'; layer.appendChild(chipEl); }
      chipEl.textContent = text;
    },
    status: function (text) {
      if (!text) { if (statusEl) statusEl.remove(); statusEl = null; return; }
      if (!statusEl) { statusEl = document.createElement('div'); statusEl.style.cssText = base + 'left:50%;top:50%;transform:translate(-50%,-50%);color:var(--muted);'; layer.appendChild(statusEl); }
      statusEl.textContent = text;
    },
    label: function (text, x, y, center) {
      const d = document.createElement('div');
      d.style.cssText = base + 'font-size:11px;left:' + x.toFixed(2) + '%;top:calc(' + y.toFixed(2) + '% + 6px);' + (center ? 'transform:translateX(-50%);' : '');
      d.textContent = text;
      layer.appendChild(d);
    },
    button: function (text, onClick) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text;
      b.style.cssText = base + 'right:8px;bottom:8px;pointer-events:auto;cursor:pointer;';
      b.addEventListener('click', onClick);
      layer.appendChild(b);
      return b;
    },
    remove: function () { layer.remove(); }
  };
}

// ---------------------------------------------------------------- mount
async function mount(el, terms, ctx, state, ui) {
  const thumb = !!ctx.thumb;
  const reduced = !!ctx.reducedMotion || thumb;
  const res = resolve(terms), spec = res.spec, used = res.used;
  const primary = ctx.primary || IMPL.primaryFor(terms[0]);
  const defSubject = primary === 'primitives' ? 'prims' : 'chair';
  const vlist = spec.variants
    ? spec.variants.map(function (v) { return { label: v.label, spec: variantSpec(spec, v.patch) }; })
    : [{ label: null, spec: spec }];
  vlist.forEach(function (v) { v.spec._subject = v.spec.subject || defSubject; });
  const needChair = vlist.some(function (v) { return v.spec._subject === 'chair'; });
  if (needChair) ui.status('불러오는 중');
  const loaded = await Promise.all([
    needChair ? loadChair().then(function (s) { return s; }, function () { return null; }) : Promise.resolve(null),
    loadHDR().then(function (t) { return t; }, function () { return null; })
  ]);
  ui.status('');
  if (state.disposed) return function () {};
  const chairSrc = loaded[0], hdrTex = loaded[1];
  let note = '';
  if (needChair && !chairSrc) {
    vlist.forEach(function (v) { if (v.spec._subject === 'chair') v.spec._subject = 'prims'; });
    note = '의자 모델을 못 불러왔어요';
  }

  let W = el.clientWidth || 400, H = el.clientHeight || 300;
  const renderer = new THREE.WebGLRenderer({ antialias: !spec.pixel, alpha: !!spec.alphaBg });
  renderer.setPixelRatio(spec.pixel ? spec.pixel : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = spec.tone === 'linear' ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure || 1;
  renderer.shadowMap.enabled = spec.shadow !== 'none';
  renderer.shadowMap.type = spec.shadow === 'hard' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  if (spec.alphaBg) renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;' + (spec.pixel ? 'image-rendering:pixelated;' : '');
  el.insertBefore(canvas, el.firstChild);
  const prevBg = el.style.background;
  if (spec.alphaBg) el.style.background = 'repeating-conic-gradient(var(--line) 0 25%, var(--surface) 0 50%) 0 0 / 16px 16px';

  const scene = new THREE.Scene();
  const bag = { mats: new Set(), tex: new Set() };
  const T = makeTexFactory(bag);
  if (!spec.alphaBg) scene.background = spec.bg ? new THREE.Color(spec.bg) : tokenColor(el, '--surface', 0xffffff);
  let envRT = null;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    if (hdrTex) envRT = pm.fromEquirectangular(hdrTex);
    else { const room = new RoomEnvironment(); envRT = pm.fromScene(room, 0.04); if (room.dispose) room.dispose(); }
    pm.dispose();
  } catch (e) { envRT = null; }
  if (envRT && spec.env > 0) scene.environment = envRT.texture;
  if (spec.hdriBg != null && hdrTex && !spec.alphaBg) { scene.background = hdrTex; scene.backgroundBlurriness = spec.hdriBg; }

  // subjects
  const holders = vlist.map(function (v) { return { h: buildHolder(v.spec, chairSrc, T, bag), label: v.label, spec: v.spec }; });
  const multi = holders.length > 1;
  if (multi) {
    const gap = 0.14;
    const ws = holders.map(function (o) { const s = subjBox(o.h).getSize(new V3()); return Math.max(s.x, s.z); });
    const total = ws.reduce(function (a, b) { return a + b; }, 0) + gap * (ws.length - 1);
    let x = -total / 2;
    holders.forEach(function (o, i) { o.h.position.x = x + ws[i] / 2; x += ws[i] + gap; });
  }
  holders.forEach(function (o) { o.h.userData.baseYaw = o.h.rotation.y; scene.add(o.h); });
  scene.updateMatrixWorld(true);
  const content = new THREE.Box3();
  holders.forEach(function (o) { content.union(subjBox(o.h)); });
  if (has(spec, 'scaleRef')) {
    const man = buildMannequin({ geo: {}, fx: [], pose: 'a' });
    const wrap = new THREE.Group();
    wrap.add(man);
    man.scale.setScalar(holders[0].h.userData.info.k);
    reground(man);
    wrap.position.x = content.max.x + 0.25 + 0.3 * holders[0].h.userData.info.k;
    subjMeshes(man).forEach(function (m) { m.castShadow = true; m.material.color.set(0x9aa3ad); });
    scene.add(wrap);
    scene.updateMatrixWorld(true);
    content.expandByObject(wrap);
  }
  const fxOut = sceneFx(scene, spec, content, T);
  const lightOut = addLights(scene, spec, content, T);
  const fitBox = content.clone();
  fxOut.fit.forEach(function (m) { m.updateMatrixWorld(true); fitBox.expandByObject(m); });
  if (spec.shadow !== 'none' && spec.floor !== 'gi' && spec.floor !== 'lit') {
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: spec.shadow === 'hard' ? 0.35 : 0.22 }));
    sc.rotation.x = -Math.PI / 2; sc.position.y = fxOut.groundY + 0.001; sc.receiveShadow = true;
    scene.add(sc);
  }
  let reflector = null;
  if (spec.floor === 'mirror') {
    const pr = renderer.getPixelRatio();
    reflector = new Reflector(new THREE.CircleGeometry(2.6, 64), { clipBias: 0.003, textureWidth: Math.round(W * pr), textureHeight: Math.round(H * pr), color: 0x8a8a8a });
    reflector.rotation.x = -Math.PI / 2; reflector.position.y = fxOut.groundY - 0.001;
    scene.add(reflector);
  }
  scene.traverse(function (o) {
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    ms.forEach(function (m) { if (m.isMeshStandardMaterial) m.envMapIntensity = spec.env; });
  });

  // cameras
  let camera = null, views = null, controls = null;
  function layoutViews() {
    const n = views.length, cols = n === 4 ? 2 : n, rows = n === 4 ? 2 : 1;
    const cw = W / cols, ch = H / rows;
    views.forEach(function (v, i) {
      const c = i % cols, r = Math.floor(i / cols);
      v.x = c * cw; v.y = H - (r + 1) * ch; v.w = cw; v.h = ch;
      v.lx = (c / cols) * 100; v.ly = (r / rows) * 100;
      if (v.cam) setAspect(v.cam, cw / ch);
    });
  }
  if (spec.views) {
    views = spec.views.map(function (d) { return { def: d, cam: null }; });
    layoutViews();
    views.forEach(function (v) { v.cam = makeCam(v.def, fitBox, v.w / v.h, false); });
  } else {
    camera = makeCam(spec.cam, fitBox, W / H, !multi);
  }
  const yawMode = multi || !!views;
  if (camera && !yawMode && !thumb) {
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(camera.userData.target);
    controls.enableZoom = false; controls.enablePan = false;
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.autoRotate = !reduced && spec.spin !== false && spec.anim !== 'turntable';
    controls.autoRotateSpeed = 0.8;
    controls.update();
  }

  // post-processing
  let composer = null;
  const post = Object.assign({}, spec.post);
  if (holders.some(function (o) { return o.h.userData.info.needSSAO; })) post.ssao = 'ao';
  if (camera && !views && (post.bloom || post.dof || post.ssao)) {
    try {
      composer = new EffectComposer(renderer);
      composer.setSize(W, H);
      composer.addPass(new RenderPass(scene, camera));
      if (post.ssao && camera.isPerspectiveCamera) {
        const sp = new SSAOPass(scene, camera, W, H);
        sp.kernelRadius = post.strong ? 0.16 : 0.1;
        sp.minDistance = 0.00008;
        sp.maxDistance = post.strong ? 0.02 : 0.012;
        sp.output = post.ssao === 'ao' ? SSAOPass.OUTPUT.SSAO : SSAOPass.OUTPUT.Default;
        composer.addPass(sp);
      }
      if (post.dof && camera.isPerspectiveCamera) {
        const tilt = post.dof === 'tilt';
        composer.addPass(new BokehPass(scene, camera, { focus: camera.userData.dist, aperture: tilt ? 0.03 : 0.012, maxblur: tilt ? 0.016 : 0.01 }));
      }
      if (post.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.9, 0.45, 0.85));
      composer.addPass(new OutputPass());
    } catch (e) {
      composer = null;
    }
  }

  // chips + labels
  const info0 = holders[0].h.userData.info;
  const fill = function (s, info) {
    return String(s).replace('{tris}', fmt(info.tris)).replace('{vox}', fmt(info.vox)).replace('{parts}', String(info.parts)).replace('{dims}', info.dims || '');
  };
  const chips = spec.chips.map(function (c) { return fill(c, info0); }).filter(function (c) { return c; });
  if (note) chips.unshift(note);
  if (terms.length && !used.length) chips.push('3D 미리보기 없음');
  ui.chip(chips.join(' · '));
  if (multi && camera) {
    holders.forEach(function (o) {
      if (!o.label) return;
      // label sits just under each copy
      const b = subjBox(o.h), cc = b.getCenter(new V3());
      const lp = new V3(cc.x, b.min.y, b.max.z).project(camera);
      ui.label(fill(o.label, o.h.userData.info), clamp((lp.x * 0.5 + 0.5) * 100, 10, 90), clamp((0.5 - lp.y * 0.5) * 100, 5, 82), true);
    });
  }
  if (views) views.forEach(function (v) { ui.label(v.def.label, v.lx + 1.5, v.ly, false); });

  // animation state
  const anim = spec.anim;
  let playing = !!anim && !reduced, tAnim = 0, autoYaw = 0, dragYaw = 0;
  const spinOn = yawMode && !views && !reduced && spec.spin !== false;
  function applyAnim() {
    holders.forEach(function (o) {
      const h = o.h, J = h.userData.joints;
      if ((anim === 'walk' || anim === 'walkRoot') && J) {
        walkPose(J, tAnim);
        if (anim === 'walkRoot') h.position.z = ((tAnim * 0.45) % 1.2) - 0.6;
      }
      if (anim === 'morph' && h.userData.morph && h.userData.morph.morphTargetInfluences) {
        h.userData.morph.morphTargetInfluences[0] = 0.5 + 0.5 * Math.sin(tAnim * 1.6);
      }
      if (yawMode || anim === 'turntable') {
        h.rotation.y = h.userData.baseYaw + autoYaw + dragYaw + (anim === 'turntable' ? tAnim * 0.9 : 0);
      }
    });
  }
  if (anim && !playing) { tAnim = anim === 'morph' ? 0.6 : 0.35; applyAnim(); }

  // render loop
  let raf = 0, visible = true, dirty = true;
  const clock = new THREE.Clock();
  function draw() {
    if (views) {
      renderer.setScissorTest(true);
      views.forEach(function (v) {
        renderer.setViewport(v.x, v.y, v.w, v.h);
        renderer.setScissor(v.x, v.y, v.w, v.h);
        renderer.render(scene, v.cam);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
    } else if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }
  function frame() {
    raf = 0;
    if (state.disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    let moving = false;
    if (playing && anim) { tAnim += dt; moving = true; }
    if (spinOn) { autoYaw += dt * 0.35; moving = true; }
    if (moving || yawMode) applyAnim();
    if (controls && controls.update(dt)) moving = true;
    if (moving || dirty) { draw(); dirty = false; }
    if (visible && moving) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf && visible && !state.disposed) { clock.getDelta(); raf = requestAnimationFrame(frame); }
  }
  if (controls) {
    controls.addEventListener('change', function () { dirty = true; kick(); });
    controls.addEventListener('start', kick);
  }
  if (anim && reduced && !thumb) {
    const btn = ui.button('재생', function () {
      playing = !playing;
      btn.textContent = playing ? '정지' : '재생';
      kick();
    });
  }
  // drag-to-rotate for side-by-side / multi-view
  let dragging = false, lastX = 0;
  const onDown = function (e) { dragging = true; lastX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } };
  const onMove = function (e) {
    if (!dragging) return;
    dragYaw += (e.clientX - lastX) * 0.01; lastX = e.clientX;
    applyAnim(); dirty = true; kick();
  };
  const onUp = function () { dragging = false; };
  if (yawMode && !thumb) {
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }
  let io = null, ro = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(function (es) {
      visible = es.some(function (e) { return e.isIntersecting; });
      if (visible) { dirty = true; kick(); }
    }, { rootMargin: '120px' });
    io.observe(el);
  }
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(function () {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h || (w === W && h === H)) return;
      W = w; H = h;
      renderer.setSize(W, H, false);
      if (camera) setAspect(camera, W / H);
      if (views) layoutViews();
      if (composer) composer.setSize(W, H);
      dirty = true; draw(); dirty = false; kick();
    });
    ro.observe(el);
  }
  applyAnim();
  draw(); dirty = false;
  kick();

  return function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (io) io.disconnect();
    if (ro) ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    if (controls) controls.dispose();
    if (composer) {
      composer.passes.forEach(function (p) { if (p.dispose) p.dispose(); });
      if (composer.dispose) composer.dispose();
    }
    if (reflector && reflector.dispose) reflector.dispose();
    scene.traverse(function (o) {
      if (o.isLight && o.shadow && o.shadow.dispose) o.shadow.dispose();
      if (o.geometry && !SHARED.geos.has(o.geometry)) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      ms.forEach(function (m) {
        for (const k in m) { const v = m[k]; if (v && v.isTexture && !SHARED.tex.has(v)) v.dispose(); }
        m.dispose();
      });
    });
    bag.mats.forEach(function (m) { m.dispose(); });
    bag.tex.forEach(function (t) { t.dispose(); });
    if (envRT) envRT.dispose();
    renderer.renderLists.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    canvas.remove();
    if (spec.alphaBg) el.style.background = prevBg;
  };
}

// ---------------------------------------------------------------- registry
const IMPL = {
  aspect: '4/3',
  primaries: [
    { key: 'chair', label: '라운지 체어', src: CHAIR_SRC, prompt: 'A modern lounge chair with soft fabric cushions and wooden legs, studio lighting' },
    { key: 'primitives', label: '조형 오브젝트', src: null, prompt: 'A simple sculpted object on a pedestal' }
  ],
  primaryFor: function (term) { return term && PRIM_PREF.has(term.id) ? 'primitives' : 'chair'; },
  supports: function (term) { return !!(term && Object.prototype.hasOwnProperty.call(TABLE, term.id)); },
  render: function (el, terms, ctx) {
    const state = { disposed: false, cleanup: null };
    const ui = makeUI(el);
    mount(el, terms || [], ctx || {}, state, ui).then(function (fn) {
      if (state.disposed) fn(); else state.cleanup = fn;
    }).catch(function (e) {
      if (window.console) console.error('[r-3d]', e);
      if (!state.disposed) { ui.status(''); ui.chip('3D를 표시하지 못했어요'); }
    });
    return function () {
      state.disposed = true;
      if (state.cleanup) { const c = state.cleanup; state.cleanup = null; c(); }
      ui.remove();
    };
  }
};

// warm caches early
loadHDR().catch(function () {});
loadChair().catch(function () {});

(window.PD = window.PD || {});
(window.PD._pendingRenderers = window.PD._pendingRenderers || []).push(['3d', IMPL]);
if (typeof window.PD.registerRenderer === 'function') window.PD.registerRenderer('3d', IMPL);
