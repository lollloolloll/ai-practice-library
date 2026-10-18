/* 프롬프트 언어 사전 — core: 데이터 색인, 라우터, 비교 띠, 화면들 */
(() => {
  'use strict';
  const D = window.PD_DATA;
  const PD = (window.PD = window.PD || {});
  const RES = () => window.PD_RESULTS || {};
  PD.renderers = PD.renderers || {};

  /* ── helpers ───────────────────────────────── */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.append(c.nodeType ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  }
  PD.h = h;

  const imgCache = new Map();
  PD.loadImage = (src) => {
    if (!imgCache.has(src)) {
      imgCache.set(src, new Promise((res, rej) => {
        const i = new Image();
        i.decoding = 'async';
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      }));
    }
    return imgCache.get(src);
  };

  let actx = null, stopCur = null;
  PD.sound = {
    ctx() {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    },
    claim(fn) {
      if (stopCur && stopCur !== fn) { try { stopCur(); } catch (e) { /* noop */ } }
      stopCur = fn;
    },
    release(fn) { if (stopCur === fn) stopCur = null; },
    stopAll() { if (stopCur) { try { stopCur(); } catch (e) { /* noop */ } } stopCur = null; },
  };

  const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 내가 올린 실제 결과 — 이 브라우저에만 저장(IndexedDB) */
  const MINE = {
    _db: null,
    cache: new Map(),
    open() {
      if (this._db) return this._db;
      this._db = new Promise((res) => {
        try {
          const rq = indexedDB.open('prompt-lexicon', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('results');
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return this._db;
    },
    async all() {
      const db = await this.open();
      if (!db) return;
      await new Promise((res) => {
        try {
          const tx = db.transaction('results').objectStore('results').openCursor();
          tx.onsuccess = () => { const c = tx.result; if (c) { this.cache.set(c.key, c.value); c.continue(); } else res(); };
          tx.onerror = () => res();
        } catch (e) { res(); }
      });
    },
    async put(key, file) {
      const val = { blob: file, type: file.type, name: file.name, at: Date.now() };
      this.cache.set(key, val);
      const db = await this.open();
      if (!db) return;
      try { db.transaction('results', 'readwrite').objectStore('results').put(val, key); } catch (e) { /* 저장 불가: 이번 방문 동안만 보여요 */ }
    },
    async del(key) {
      this.cache.delete(key);
      const db = await this.open();
      if (!db) return;
      try { db.transaction('results', 'readwrite').objectStore('results').delete(key); } catch (e) { /* noop */ }
    },
  };
  PD.mine = MINE;

  function toast(msg) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
  }
  function copy(text) {
    const done = () => toast('복사했어요');
    const fallback = () => {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('복사하지 못했어요. 직접 선택해서 복사해 주세요'); }
      ta.remove();
    };
    try {
      navigator.clipboard.writeText(text).then(done, fallback);
    } catch (e) { fallback(); }
  }
  const copyBtn = (getText, label = '복사') =>
    h('button', { class: 'btn small copy', type: 'button', onclick: (e) => { e.stopPropagation(); copy(getText()); } }, label);

  /* ── 데이터 색인 ───────────────────────────────── */
  const FIELDS = D.fields;
  const FMAP = Object.fromEntries(FIELDS.map((f) => [f.id, f]));
  const EN = { image: 'Image', video: 'Video', editing: 'Edit', audio: 'Sound', '3d': '3D', design: 'Design', writing: 'Writing', coding: 'Code' };
  const TERM = new Map();
  const byField = {};
  D.terms.forEach((t) => {
    TERM.set(t.field + ':' + t.id, t);
    (byField[t.field] = byField[t.field] || []).push(t);
  });
  const getTerm = (f, id) => TERM.get(f + ':' + id);
  const cat = (f, c) => (D.categories[f] || []).find((x) => x.id === c) || { id: c, name_ko: c };
  const shortName = (t) => String(t.term).split(/\s*[,(;/]\s*/)[0] || t.term;
  const LEVEL = { basic: '기초', intermediate: '중급', advanced: '고급' };

  function hasResult(t) {
    const r = RES()[t.field];
    return !!(r && r.terms && r.terms[t.id] && r.terms[t.id].length);
  }
  function hasDemo(t) {
    const f = FMAP[t.field];
    if (!f) return false;
    if (f.kind === 'results') return hasResult(t);
    const r = PD.renderers[t.field];
    try { return !!(r && r.supports(t)); } catch (e) { return false; }
  }

  /* ── 렌더러 등록 ───────────────────────────────── */
  let booted = false, rerenderTimer = 0;
  PD.registerRenderer = (field, impl) => {
    if (PD.renderers[field] === impl) return;
    PD.renderers[field] = impl;
    if (booted) {
      clearTimeout(rerenderTimer);
      rerenderTimer = setTimeout(() => route(true), 30);
    }
  };
  (PD._pendingRenderers || []).forEach(([f, impl]) => { PD.renderers[f] = impl; });

  /* 카테고리마다 차이가 가장 잘 보이는 기본 비교 묶음 */
  const PICKS = {
    'image:composition': ['rule-of-thirds', 'golden-ratio', 'leading-lines'],
    'image:shot-size': ['extreme-close-up', 'close-up', 'wide-shot'],
    'image:camera-angle': ['low-angle', 'high-angle', 'dutch-angle'],
    'image:lens-optics': ['lens-14mm', 'lens-85mm', 'fisheye-lens', 'tilt-shift'],
    'image:camera-film': ['kodak-portra-400', 'cinestill-800t', 'ilford-hp5', 'polaroid'],
    'image:lighting': ['rembrandt-lighting', 'rim-light', 'neon-lighting', 'low-key'],
    'image:time-weather': ['golden-hour', 'blue-hour', 'fog-mist', 'night'],
    'image:color': ['teal-orange', 'pastel', 'black-and-white', 'bleach-bypass'],
    'image:medium': ['oil-painting', 'watercolor', 'pixel-art', 'comic-book'],
    'image:art-movement': ['impressionism', 'pop-art', 'ukiyo-e', 'cubism'],
    'image:mood': ['cinematic', 'dreamy', 'eerie', 'nostalgic'],
    'video:camera-movement': ['dolly-in', 'orbit', 'dolly-zoom', 'handheld'],
    'video:speed-time': ['slow-motion', 'timelapse', 'speed-ramp'],
    'video:film-look-color': ['16mm-film', 'vhs', 'teal-orange'],
    'video:transition-editing': ['match-cut', 'cross-dissolve', 'whip-pan-transition'],
    'editing:cut-pacing': ['jump-cut', 'punch-in-cut', 'cut-on-beat', 'cold-open-hook'],
    'editing:transition': ['cross-dissolve', 'whip-pan-transition', 'glitch-transition', 'light-leak-transition'],
    'editing:effects-vfx': ['chroma-key', 'freeze-frame', 'split-screen', 'speed-ramp'],
    'editing:captions-subtitles': ['hormozi-captions', 'karaoke-highlight', 'yeneung-color-caption', 'lower-third'],
    'editing:color': ['color-grading', 'teal-orange', 'day-for-night'],
    'editing:audio-edit': ['audio-ducking', 'whoosh-sfx', 'silence-removal'],
    'editing:framing-format': ['vertical-9-16', 'blur-fill', 'shorts-safe-zone'],
    'editing:motion-graphics': ['progress-bar', 'callout-arrow', 'end-screen-cta', 'logo-sting'],
    'editing:ai-edit': ['replace-background', 'change-weather', 'style-transfer-v2v', 'frame-interpolation'],
    'audio:genre': ['lofi-hip-hop', 'deep-house', 'synthwave', 'bossa-nova'],
    'audio:tempo-rhythm': ['half-time', 'swing-shuffle', 'waltz-34'],
    'audio:key-harmony': ['minor-key', 'dorian', 'lydian'],
    'audio:production': ['reverb-heavy', 'lofi-texture', 'sidechain', 'distorted'],
    'audio:structure': ['build-up-tag', 'drop-tag', 'breakdown-tag'],
    '3d:modeling-style': ['low-poly', 'voxel', 'toon-cartoon', 'clay-style'],
    '3d:material-pbr': ['metallic', 'roughness', 'translucent', 'clearcoat'],
    '3d:camera': ['orthographic', 'focal-length', 'isometric-camera'],
    'design:design-movement': ['swiss-style', 'bauhaus', 'neo-brutalism', 'art-deco'],
    'design:typography': ['didone', 'condensed-type', 'oversized-type', 'script-font'],
    'design:logo-type': ['wordmark', 'emblem', 'negative-space-logo', 'mascot-logo'],
    'design:color': ['duotone', 'pastel-palette', 'neon-palette', 'earth-tones'],
  };

  /* ── 상태 ───────────────────────────────── */
  const S = { sel: {}, auto: {}, mode: {}, primary: {}, base: {}, techField: 'all', techCat: 'all', comboField: 'all' };
  let routeCleanups = [];
  const onLeave = (fn) => routeCleanups.push(fn);

  /* ── 비교 띠 ───────────────────────────────── */
  // entries(): [{ terms:[...], label?, sub?, removable? }]  — terms:[] 은 원본
  function strip({ field, entries, onRemove, title }) {
    const f = FMAP[field];
    const el = h('section', { class: 'strip', 'aria-label': '결과 비교' });
    let cleans = [];
    const clean = () => { cleans.forEach((fn) => { try { fn && fn(); } catch (e) { console.error(e); } }); cleans = []; };
    onLeave(clean);

    function draw() {
      clean();
      el.textContent = '';
      if (f.kind === 'render') drawRender(entries());
      else drawResults(entries());
    }

    function modeSeg(cur, opts, onPick) {
      return h('div', { class: 'seg', role: 'group', 'aria-label': '결과 종류' },
        opts.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(cur === k), onclick: () => onPick(k) }, label)));
    }

    function tileHead(entry) {
      if (!entry.terms.length) return h('div', { class: 'tile-h' }, h('span', { class: 'orig' }, entry.label || '원본'));
      const t = entry.terms[0];
      const single = entry.terms.length === 1;
      return h('div', { class: 'tile-h' },
        h('span', { class: 'n' },
          single ? h('a', { class: 'en', href: '#t.' + t.field + '.' + t.id, style: { textDecoration: 'none' } }, shortName(t))
            : h('span', { class: 'orig' }, entry.label || '조합 결과'),
          single ? h('span', { class: 'k' }, t.ko) : h('span', { class: 'k' }, entry.terms.length + '개 용어')),
        entry.removable && onRemove ? h('button', { class: 'x', type: 'button', 'aria-label': t.ko + ' 빼기', onclick: () => onRemove(t) }, '×') : null);
    }

    /* 이미지·영상·소리·3D·디자인 */
    function drawRender(list) {
      const r = PD.renderers[field];
      const mode = S.mode[field] || 'theory';
      const prims = (r && r.primaries) || [];
      const first = list.find((e) => e.terms.length);
      let key = S.primary[field];
      if (!key || !prims.some((p) => p.key === key)) {
        try { key = (r && first && r.primaryFor(first.terms[0])) || (prims[0] && prims[0].key); } catch (e) { key = prims[0] && prims[0].key; }
      }
      const prim = prims.find((p) => p.key === key) || prims[0];

      const actualCount = list.filter((e) => e.terms.length === 1 && actualFor(e.terms[0])).length;
      const bar = h('div', { class: 'strip-bar' },
        h('div', { class: 'l' },
          title ? h('b', null, title) : null,
          prims.length > 1 ? h('select', {
            class: 'sel', id: 'primary-' + field, 'aria-label': '원본 고르기',
            onchange: (e) => { S.primary[field] = e.target.value; draw(); },
          }, prims.map((p) => h('option', { value: p.key, selected: p.key === (prim && prim.key) }, '원본: ' + p.label))) : null,
          h('span', { class: 'note' }, mode === 'theory' ? '원리를 재현한 도해예요. 실제 AI 결과와 다를 수 있어요.' : '실제로 생성한 결과예요. 직접 만든 결과를 올릴 수도 있어요.')),
        modeSeg(mode, [['theory', '이론 결과'], ['actual', '실제 결과 ' + actualCount]], (k) => { S.mode[field] = k; draw(); }));
      el.append(bar);
      if (prim) el.append(h('div', { class: 'prompt-line' }, h('b', null, '원본 프롬프트 '), prim.prompt));

      const tiles = h('div', { class: 'tiles' });
      el.append(tiles);
      list.forEach((entry) => {
        const box = h('div', { class: 'box' + (entry.terms.length ? '' : ' orig'), style: { aspectRatio: (r && r.aspect) || '3 / 2' } });
        const full = prim ? [prim.prompt].concat(entry.terms.map((t) => t.term)).join(', ') : entry.terms.map((t) => t.term).join(', ');
        const single = entry.terms.length === 1 ? entry.terms[0] : null;
        const diag = single && mode === 'theory' && PD.diagram ? PD.diagram(single) : null;
        const foot = entry.terms.length
          ? h('div', { class: 'tile-f' },
            h('span', { class: 'add', title: full }, '+ ', h('mark', { class: 'ins' }, entry.terms.map((t) => t.term).join(', '))),
            copyBtn(() => full, '프롬프트 복사'))
          : null;
        const head = tileHead(entry);
        const boxwrap = h('div', { class: 'boxwrap' }, box);
        if (diag) {
          const btn = h('button', { class: 'diag-btn', type: 'button', 'aria-pressed': 'false', title: '원리 도식 보기' }, '도식');
          const layer = h('div', { class: 'diag', hidden: true }, diag);
          btn.addEventListener('click', () => { layer.hidden = !layer.hidden; btn.setAttribute('aria-pressed', String(!layer.hidden)); });
          const x = head.querySelector('.x');
          head.insertBefore(btn, x);
          boxwrap.append(layer);
        }
        tiles.append(h('div', { class: 'tile' }, head, boxwrap,
          single && single.effect_ko ? h('p', { class: 'cap' }, single.effect_ko) : null, foot));

        const actual = mode === 'actual' && entry.terms.length;
        if (actual) {
          if (single) actualView(box, single, () => draw());
          else box.append(h('div', { class: 'empty-actual' }, h('b', null, '조합의 실제 결과가 아직 없어요')));
          return;
        }
        if (!r) { box.append(h('div', { class: 'pending' }, '불러오는 중이에요')); return; }
        const supported = entry.terms.filter((t) => { try { return r.supports(t); } catch (e) { return false; } });
        if (entry.terms.length && !supported.length) {
          const t = entry.terms[0];
          box.append(h('div', { class: 'pending' }, h('div', null, h('b', null, '도해를 준비하고 있어요'), t.effect_ko || '')));
          return;
        }
        try {
          const c = r.render(box, supported, { primary: prim && prim.key, field, reducedMotion: reducedMotion() });
          if (typeof c === 'function') cleans.push(c);
        } catch (e) {
          console.error(e);
          box.append(h('div', { class: 'pending' }, '이 결과를 그리지 못했어요'));
        }
      });
    }

    /* 글쓰기·코딩 */
    function drawResults(list) {
      const R = RES()[field] || { base: {}, terms: {} };
      const rb = R.base || {};
      const bases = Object.keys(rb).filter((k) => !(k.endsWith('-code') && rb[k.slice(0, -5)])).map((k) => {
        const id = k.endsWith('-code') ? k.slice(0, -5) : k;
        const meta = (D.bases[field] || []).find((b) => b.id === id) || {};
        return { id: k, prompt_ko: meta.prompt_ko || rb[k].prompt, prompt_en: meta.prompt_en };
      });
      const mode = S.mode[field] || 'actual';
      const first = list.find((e) => e.terms.length && R.terms && R.terms[e.terms[0].id]);
      let base = S.base[field];
      if (!base || !bases.some((b) => b.id === base)) {
        const fb = first && R.terms[first.terms[0].id][0].base;
        base = bases.some((b) => b.id === fb) ? fb : bases.some((b) => b.id === fb + '-code') ? fb + '-code' : (bases[0] && bases[0].id);
      }
      const baseId = base && base.endsWith('-code') ? base.slice(0, -5) : base;
      const baseEntry = rb[base] ? Object.assign({}, rb[base], rb[baseId + '-code'] && base !== baseId + '-code' ? { code: rb[baseId + '-code'].code } : {}) : null;

      el.append(h('div', { class: 'strip-bar' },
        h('div', { class: 'l' },
          title ? h('b', null, title) : null,
          bases.length > 1 ? h('select', {
            class: 'sel', id: 'base-' + field, 'aria-label': '원안 고르기',
            onchange: (e) => { S.base[field] = e.target.value; draw(); },
          }, bases.map((b) => h('option', { value: b.id, selected: b.id === base }, '원안: ' + (b.prompt_ko || b.prompt_en).slice(0, 28) + '…'))) : null),
        modeSeg(mode, [['actual', '실제 결과'], ['theory', '이론']], (k) => { S.mode[field] = k; draw(); })));
      if (baseEntry) el.append(h('div', { class: 'prompt-line' }, h('b', null, '원본 프롬프트 '), baseEntry.prompt));

      const tiles = h('div', { class: 'tiles wide' });
      el.append(tiles);
      list.forEach((entry) => {
        const t = entry.terms[0];
        if (!entry.terms.length) {
          tiles.append(h('div', { class: 'tile' }, tileHead(entry),
            baseEntry ? outView(field, baseEntry, base, true, cleans) : h('div', { class: 'box' }, h('div', { class: 'pending' }, '원본 결과가 없어요'))));
          return;
        }
        const all = (R.terms && R.terms[t.id]) || [];
        const res = all.find((x) => x.base === base || x.base === baseId) || all[0];
        let body;
        if (mode === 'theory' || !res) {
          body = h('div', { class: 'box' }, h('div', { class: 'theory-text' },
            h('p', null, t.effect_ko || ''),
            t.snippet ? h('div', { class: 'mono' }, t.snippet) : null,
            !res && mode === 'actual' ? h('span', { class: 'chip' }, '실제 결과 준비 중') : null));
        } else {
          body = outView(field, res, base, false, cleans);
        }
        const added = res ? addedPart(baseEntry && baseEntry.prompt, res.prompt) : t.term;
        tiles.append(h('div', { class: 'tile' }, tileHead(entry),
          res && res.base !== base && res.base !== baseId ? h('span', { class: 'chip base-chip' }, '다른 원안 결과예요') : null,
          body,
          h('div', { class: 'tile-f' },
            h('span', { class: 'add', title: res ? res.prompt : '' }, '+ ', h('mark', { class: 'ins' }, added)),
            res ? copyBtn(() => res.prompt, '프롬프트 복사') : null)));
      });
    }

    draw();
    return { el, draw };
  }

  function addedPart(base, full) {
    if (!full) return '';
    if (base && full.startsWith(base)) return full.slice(base.length).trim() || full;
    if (base) {
      // 원안 문장 뒤에 덧붙인 지시만 보여 주기
      let i = 0;
      while (i < base.length && i < full.length && base[i] === full[i]) i++;
      if (i > 8) return full.slice(i).trim();
    }
    return full;
  }

  function actualFor(t) {
    const r = RES()[t.field];
    const list = r && r.terms && r.terms[t.id];
    if (list && list.length && (list[0].src || list[0].url)) return { kind: 'data', res: list[0] };
    const mine = MINE.cache.get(t.field + ':' + t.id);
    if (mine) return { kind: 'mine', res: mine };
    return null;
  }

  function actualView(box, t, redraw) {
    const a = actualFor(t);
    const key = t.field + ':' + t.id;
    const accept = { image: 'image/*', video: 'video/*', editing: 'video/*', audio: 'audio/*', '3d': 'image/*,video/*', design: 'image/*' }[t.field] || 'image/*';
    if (a && a.kind === 'data') { box.append(mediaView(a.res)); return; }
    if (a && a.kind === 'mine') {
      const url = URL.createObjectURL(a.res.blob);
      box.append(mediaView({ src: url, type: (a.res.type || '').split('/')[0] }));
      box.append(h('div', { class: 'mine-bar' }, h('span', null, '내가 올린 결과'),
        h('button', { type: 'button', onclick: async () => { await MINE.del(key); redraw(); } }, '지우기')));
      return;
    }
    const id = 'up-' + t.field + '-' + t.id;
    const input = h('input', { type: 'file', id, accept, hidden: true, onchange: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      await MINE.put(key, f);
      toast('결과를 올렸어요. 이 브라우저에만 저장돼요');
      redraw();
    } });
    box.append(h('div', { class: 'empty-actual' },
      h('b', null, '실제 결과가 아직 없어요'),
      h('span', null, '프롬프트를 복사해 만든 뒤 올려 보세요'),
      h('label', { class: 'btn small', for: id, style: { justifySelf: 'center' } }, '결과 올리기'), input));
  }

  function mediaView(res) {
    const src = res.src || res.url;
    if (res.type === 'video' || /\.(mp4|webm)$/i.test(src || '')) return h('video', { src, muted: true, loop: true, playsinline: true, autoplay: !reducedMotion(), controls: true, style: { width: '100%', height: '100%', objectFit: 'cover' } });
    if (res.type === 'audio' || /\.(mp3|wav|ogg)$/i.test(src || '')) return h('div', { class: 'pending' }, h('audio', { src, controls: true }));
    return h('img', { src, alt: res.alt || '', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } });
  }

  // 샌드박스 iframe은 저장소 접근이 막혀 있어요. 메모리 저장소로 대신해 결과 코드가 멈추지 않게 해요.
  const SHIM = '<script>(function(){function M(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}' +
    '["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){try{Object.defineProperty(window,n,{value:M(),configurable:true})}catch(_){}}});' +
    'try{document.cookie}catch(e){try{Object.defineProperty(document,"cookie",{get:function(){return""},set:function(){},configurable:true})}catch(_){}}})()<\/script>';
  PD.SHIM = SHIM;
  function withShim(html) {
    const m = /<head[^>]*>/i.exec(html);
    return m ? html.slice(0, m.index + m[0].length) + SHIM + html.slice(m.index + m[0].length) : SHIM + html;
  }

  function outView(field, res, baseId, isBase, cleans) {
    if (field === 'writing') {
      const lit = /story|poem/.test(baseId || '');
      return h('div', { class: 'box' }, h('div', { class: 'textout' + (lit ? ' lit' : '') }, res.output || ''));
    }
    // coding
    const views = [];
    if (res.html) views.push(['screen', '화면']);
    if (res.code) views.push(['code', '코드']);
    if (res.files && res.files.length) views.push(['files', '파일']);
    if (res.transcript) views.push(['transcript', 'AI 응답']);
    if (!views.length) return h('div', { class: 'box' }, h('div', { class: 'pending' }, '결과가 비어 있어요'));
    const wrap = h('div', { style: { display: 'grid', gap: '6px' } });
    const tabs = h('div', { class: 'tabs-mini', role: 'group', 'aria-label': '보기' });
    const box = h('div', { class: 'box' });
    let ro = null;
    const show = (k) => {
      if (ro) { ro.disconnect(); ro = null; }
      box.textContent = '';
      [...tabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
      if (k === 'screen') {
        const W = 960, H = 720;
        const frame = h('div', { class: 'frame' });
        const ifr = h('iframe', { sandbox: 'allow-scripts', title: '실행 결과', loading: 'lazy', style: { width: W + 'px', height: H + 'px' } });
        ifr.srcdoc = withShim(res.html);
        frame.append(ifr);
        box.append(frame);
        ro = new ResizeObserver(() => {
          const s = frame.clientWidth / W;
          ifr.style.transform = 'scale(' + s + ')';
        });
        ro.observe(frame);
      } else if (k === 'code') {
        box.append(h('pre', { class: 'codeview' }, res.code));
      } else if (k === 'files') {
        box.append(h('pre', { class: 'codeview' }, res.files.map((f) => [h('span', { class: 'path' }, f.path), f.code + '\n'])));
      } else {
        box.append(h('div', { class: 'textout' }, res.transcript));
      }
    };
    views.forEach(([k, label]) => tabs.append(h('button', { type: 'button', 'data-k': k, onclick: () => show(k) }, label)));
    if (views.length > 1) wrap.append(tabs);
    wrap.append(box);
    show(views[0][0]);
    cleans.push(() => { if (ro) ro.disconnect(); });
    return wrap;
  }

  /* ── 공통 조각 ───────────────────────────────── */
  /* 썸네일: 화면에 보일 때 하나씩 그려요 */
  const THUMB = { image: true, design: true, editing: true };
  const thumbQ = [];
  let thumbBusy = false, thumbIO = null;
  function pumpThumbs() {
    if (thumbBusy) return;
    const job = thumbQ.shift();
    if (!job) return;
    thumbBusy = true;
    const { box, t } = job;
    const r = PD.renderers[t.field];
    let c = null;
    try {
      if (box.isConnected && r) c = r.render(box, [t], { primary: r.primaryFor(t), field: t.field, reducedMotion: true, thumb: true });
    } catch (e) { console.error(e); }
    if (typeof c === 'function') onLeave(c);
    setTimeout(() => { thumbBusy = false; pumpThumbs(); }, 40);
  }
  function thumbBox(t) {
    const r = PD.renderers[t.field];
    const box = h('div', { class: 'thumb', style: { aspectRatio: (r && r.aspect) || '3 / 2' } });
    if (!thumbIO) {
      thumbIO = new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          if (!en.isIntersecting) return;
          thumbIO.unobserve(en.target);
          thumbQ.push(en.target._job);
          pumpThumbs();
        });
      }, { rootMargin: '200px' });
    }
    box._job = { box, t };
    thumbIO.observe(box);
    return box;
  }

  function termCard(t, pressed, onToggle) {
    const demo = hasDemo(t);
    const thumb = demo && THUMB[t.field] && PD.renderers[t.field] ? thumbBox(t) : null;
    return h('button', {
      class: 'term' + (thumb ? ' has-thumb' : ''), type: 'button', 'aria-pressed': String(!!pressed), 'data-id': t.id,
      title: t.effect_ko || '', onclick: () => onToggle(t),
    },
    thumb,
    h('div', { class: 'row' }, h('span', { class: 'en' }, shortName(t)),
      h('a', { class: 'open', href: '#t.' + t.field + '.' + t.id, onclick: (e) => e.stopPropagation(), 'aria-label': t.ko + ' 자세히' }, '↗')),
    h('span', { class: 'ko' }, h('i', { class: 'dot' + (demo ? ' on' : ''), title: demo ? '결과 있음' : '설명만' }), t.ko));
  }

  function sidebar(fid, current) {
    const f = FMAP[fid];
    const list = byField[fid] || [];
    return h('aside', { class: 'cats', 'aria-label': '카테고리' },
      h('div', { class: 'ft' }, EN[fid] || f.ko),
      D.categories[fid].map((c) => h('a', { href: '#' + fid + '.' + c.id, 'aria-current': String(c.id === current) },
        c.name_ko, h('span', null, list.filter((t) => t.category === c.id).length))),
      h('div', { class: 'extra' },
        THUMB[fid] ? h('a', { href: '#g.' + fid, 'aria-current': String(current === '__gallery') }, '결과로 찾기', h('span', null, '')) : null,
        h('a', { href: '#combos.' + fid, 'aria-current': String(current === '__combos') }, '조합 레시피', h('span', null, D.combos.filter((c) => c.field === fid).length)),
        h('a', { href: '#tech.' + fid }, '기법', h('span', null, D.techniques.filter((c) => c.field === fid).length))));
  }

  /* ── 화면: 홈 ───────────────────────────────── */
  function viewHome(app) {
    app.append(h('section', { class: 'hero' },
      h('h1', null, 'Prompt Lexicon', h('small', null, '같은 원본에 용어 하나만 넣으면 무엇이 달라질까요?'))));

    const pick = (f, ids) => ids.map((id) => getTerm(f, id)).filter(Boolean);
    const feat = pick('image', ['rembrandt-lighting', 'rim-light', 'golden-hour', 'neon-lighting', 'low-key', 'backlighting']).filter(hasDemo).slice(0, 3);
    const featTerms = feat.length ? feat : pick('image', ['rembrandt-lighting', 'rim-light', 'neon-lighting']);
    app.append(h('div', { class: 'section' },
      h('div', { class: 'section-h' }, h('h2', null, '조명 용어 하나로 달라지는 인물 사진'), h('a', { class: 'btn', href: '#image.lighting' }, '조명 용어 전부 보기')),
      strip({ field: 'image', entries: () => [{ terms: [] }].concat(featTerms.map((t) => ({ terms: [t] }))) }).el));

    app.append(h('div', { class: 'section' },
      h('div', { class: 'section-h' }, h('h2', null, '분야')),
      h('div', { class: 'fields' }, FIELDS.map((f) => {
        const list = byField[f.id] || [];
        const demos = list.filter(hasDemo).length;
        return h('a', { class: 'fcard', href: '#' + f.id },
          h('h3', null, f.ko, h('small', null, EN[f.id])),
          h('div', { class: 'nums' }, h('span', null, '용어 ', h('b', null, list.length)), h('span', null, '결과 ', h('b', null, demos))),
          h('div', { class: 'sample' }, list.slice(0, 4).map(shortName).join(' · ')));
      }))));

    app.append(h('div', { class: 'section' },
      h('div', { class: 'section-h' }, h('h2', null, '용어 다음 단계')),
      h('div', { class: 'layers' },
        h('a', { class: 'layer', href: '#combos' }, h('b', null, '조합 레시피 ' + D.combos.length), h('span', null, '함께 쓰면 잘 맞는 용어 묶음이에요')),
        h('a', { class: 'layer', href: '#tech' }, h('b', null, '상호작용 기법 ' + D.techniques.length), h('span', null, '참고 이미지, 시드, 부분 수정처럼 프롬프트 밖에서 AI를 다루는 법이에요')),
        h('a', { class: 'layer', href: '#briefs' }, h('b', null, '브리프 틀 ' + D.briefs.length), h('span', null, '실제로 뭔가 만들 때 AI에게 맥락을 주는 순서예요')))));

    app.append(h('div', { class: 'section' },
      h('div', { class: 'section-h' }, h('h2', null, '원본 출처')),
      h('p', { class: 'muted', style: { margin: 0, fontSize: '13px', maxWidth: '90ch' } },
        '인물 Christopher Campbell, 거리 Laura Bilger, 머그 NordWood Themes (Unsplash) · 회화 John Constable 〈The Hay Wain〉 1821 (퍼블릭 도메인) · 영상 Kmeel.com Videos (Pexels) · 의자 SheenChair (Khronos, CC0) · 조명 studio_small_08 (Poly Haven, CC0) · 기타 루프 ValentinSosnitskiy, 낭독 Sample_Me (Freesound, CC0) · 용어 데이터 ' + D.meta.built + ' 기준')));
  }

  /* ── 화면: 분야 ───────────────────────────────── */
  function viewField(app, fid, catId) {
    const cats = D.categories[fid];
    if (!cats.some((c) => c.id === catId)) catId = cats[0].id;
    const c = cat(fid, catId);
    const list = (byField[fid] || []).filter((t) => t.category === catId);
    const key = fid + ':' + catId;
    if (!S.sel[key] || S.auto[key]) {
      const withDemo = list.filter(hasDemo);
      const pick = (PICKS[key] || []).filter((id) => withDemo.some((t) => t.id === id));
      const rest = (withDemo.length ? withDemo : list).map((t) => t.id).filter((id) => !pick.includes(id));
      S.sel[key] = pick.concat(rest).slice(0, Math.max(3, pick.length));
      S.auto[key] = true;
    }
    const main = h('div', { style: { minWidth: '0' } });
    app.append(h('div', { class: 'fieldpage' }, sidebar(fid, catId), main));
    main.append(h('div', { class: 'page-h' },
      h('span', { class: 'eyebrow' }, FMAP[fid].ko),
      h('h1', null, c.name_ko),
      c.desc_ko ? h('p', null, c.desc_ko) : null));

    let cards;
    const toggle = (t) => {
      const sel = S.sel[key];
      S.auto[key] = false;
      const i = sel.indexOf(t.id);
      if (i >= 0) sel.splice(i, 1);
      else {
        sel.push(t.id);
        if (sel.length > 5) { sel.shift(); toast('최대 5개까지 비교해요. 먼저 넣은 용어를 뺐어요'); }
      }
      st.draw();
      [...cards.children].forEach((b) => b.setAttribute('aria-pressed', String(sel.includes(b.dataset.id))));
    };
    const st = strip({
      field: fid,
      entries: () => [{ terms: [] }].concat(S.sel[key].map((id) => getTerm(fid, id)).filter(Boolean).map((t) => ({ terms: [t], removable: true }))),
      onRemove: toggle,
    });
    main.append(st.el);
    const demos = list.filter(hasDemo);
    const only = S.onlyDemo !== false && demos.length > 0;
    const shown = only ? demos : list;
    main.append(h('div', { class: 'grid-h' },
      h('h2', null, (only ? '결과 있는 용어 ' + demos.length : '용어 ' + list.length) + '개',
        h('span', { class: 'muted hint' }, '눌러서 비교에 넣어요')),
      demos.length && demos.length < list.length ? h('div', { class: 'seg' },
        h('button', { type: 'button', 'aria-pressed': String(only), onclick: () => { S.onlyDemo = true; route(true); } }, '결과 있는 것 ' + demos.length),
        h('button', { type: 'button', 'aria-pressed': String(!only), onclick: () => { S.onlyDemo = false; route(true); } }, '전체 ' + list.length)) : null));
    cards = h('div', { class: 'terms' + (THUMB[fid] ? ' thumbs' : '') }, shown.map((t) => termCard(t, S.sel[key].includes(t.id), toggle)));
    main.append(cards);
  }

  /* ── 화면: 결과로 찾기(갤러리) ───────────────────────────────── */
  function viewGallery(app, fid) {
    const main = h('div', { style: { minWidth: '0' } });
    app.append(h('div', { class: 'fieldpage' }, sidebar(fid, '__gallery'), main));
    main.append(h('div', { class: 'page-h' }, h('span', { class: 'eyebrow' }, FMAP[fid].ko), h('h1', null, '결과로 찾기'),
      h('p', null, '마음에 드는 결과를 누르면 그 용어로 가요.')));
    D.categories[fid].forEach((c) => {
      const list = (byField[fid] || []).filter((t) => t.category === c.id && hasDemo(t));
      if (!list.length) return;
      main.append(h('div', { class: 'grid-h' }, h('h2', null, h('a', { href: '#' + fid + '.' + c.id, style: { textDecoration: 'none' } }, c.name_ko), h('span', { class: 'muted hint' }, list.length + '개'))));
      main.append(h('div', { class: 'terms thumbs' }, list.map((t) => termCard(t, false, () => { location.hash = 't.' + fid + '.' + t.id; }))));
    });
  }

  /* ── 화면: 용어 ───────────────────────────────── */
  function viewTerm(app, fid, id) {
    const t = getTerm(fid, id);
    if (!t) { app.append(h('p', null, '이 용어를 찾지 못했어요. ', h('a', { href: '#' + fid }, FMAP[fid] ? FMAP[fid].ko + '로 돌아가기' : '처음으로'))); return; }
    const key = 't:' + fid + ':' + id;
    if (!S.sel[key] || S.auto[key]) {
      const cw = (t.compare_with || []).map((x) => getTerm(fid, x)).filter(Boolean);
      cw.sort((a, b) => hasDemo(b) - hasDemo(a));
      S.sel[key] = [t.id].concat(cw.slice(0, 3).map((x) => x.id));
      S.auto[key] = true;
    }
    const c = cat(fid, t.category);
    const main = h('div', { style: { minWidth: '0' } });
    app.append(h('div', { class: 'fieldpage' }, sidebar(fid, t.category), main));
    main.append(h('div', { class: 'detail-h' },
      h('div', { class: 'crumbs' }, h('a', { href: '#' + fid }, FMAP[fid].ko), '›', h('a', { href: '#' + fid + '.' + c.id }, c.name_ko)),
      h('div', { class: 'title-row' }, h('h1', null, shortName(t)), h('span', { class: 'ko' }, t.ko)),
      h('div', { class: 'chips' },
        t.level ? h('span', { class: 'chip accent' }, LEVEL[t.level] || t.level) : null,
        (t.tools || []).slice(0, 8).map((x) => h('span', { class: 'chip' }, x)))));

    const toggle = (x) => {
      const sel = S.sel[key];
      S.auto[key] = false;
      const i = sel.indexOf(x.id);
      if (i >= 0) sel.splice(i, 1); else sel.push(x.id);
      st.draw();
    };
    if (THUMB[fid] && hasDemo(t)) main.append(slider(t));
    const st = strip({
      field: fid,
      entries: () => [{ terms: [] }].concat(S.sel[key].map((x) => getTerm(fid, x)).filter(Boolean).map((x) => ({ terms: [x], removable: x.id !== t.id }))),
      onRemove: toggle,
    });
    main.append(st.el);

    const combos = D.combos.filter((cb) => cb.field === fid && (cb.term_ids || []).includes(t.id));
    const cw = (t.compare_with || []).map((x) => getTerm(fid, x)).filter(Boolean);
    const sources = (t.sources || []).filter((s) => /^https?:/.test(s));
    main.append(h('div', { class: 'info' },
      t.snippet ? h('div', { class: 'panel' }, h('h3', null, '예시 프롬프트'), h('div', { class: 'snippet' }, t.snippet), h('div', null, copyBtn(() => t.snippet))) : null,
      cw.length ? h('div', { class: 'panel' }, h('h3', null, '비교해 볼 용어'),
        h('div', { class: 'chips' }, cw.map((x) => h('button', {
          class: 'chip' + (S.sel[key].includes(x.id) ? ' accent' : ''), type: 'button',
          onclick: (e) => { toggle(x); e.currentTarget.classList.toggle('accent'); },
        }, x.ko)))) : null,
      combos.length ? h('div', { class: 'panel' }, h('h3', null, '이 용어가 들어간 조합'),
        h('div', { class: 'chips' }, combos.map((cb) => h('a', { class: 'chip', href: '#c.' + fid + '.' + cb.id }, cb.name_ko)))) : null,
      sources.length ? h('div', { class: 'panel' }, h('h3', null, '출처'),
        h('ul', null, sources.slice(0, 5).map((s) => h('li', null, h('a', { href: s, target: '_blank', rel: 'noopener' }, s.replace(/^https?:\/\//, '').slice(0, 60)))))) : null));
  }

  /* 원본 ↔ 용어 겹쳐 보기 슬라이더 */
  function slider(t) {
    const r = PD.renderers[t.field];
    const prim = r.primaryFor(t);
    const a = h('div', { class: 'sl-layer' });
    const b = h('div', { class: 'sl-layer sl-top' });
    const handle = h('div', { class: 'sl-handle', 'aria-hidden': 'true' });
    const stage = h('div', { class: 'sl-stage', style: { aspectRatio: r.aspect || '3 / 2' } }, a, b, handle,
      h('span', { class: 'sl-tag l' }, '원본'), h('span', { class: 'sl-tag r' }, '+ ' + shortName(t)));
    const range = h('input', { type: 'range', id: 'sl-' + t.id, min: 0, max: 100, value: 50, 'aria-label': '원본과 비교 위치' });
    const set = (v) => { b.style.clipPath = 'inset(0 0 0 ' + v + '%)'; handle.style.left = v + '%'; };
    range.addEventListener('input', () => set(range.value));
    const drag = (e) => {
      const rc = stage.getBoundingClientRect();
      const v = Math.max(0, Math.min(100, ((e.clientX - rc.left) / rc.width) * 100));
      range.value = v; set(v);
    };
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); drag(e); });
    stage.addEventListener('pointermove', (e) => { if (e.buttons) drag(e); });
    set(50);
    try {
      const c1 = r.render(a, [], { primary: prim, field: t.field, reducedMotion: reducedMotion() });
      const c2 = r.render(b, [t], { primary: prim, field: t.field, reducedMotion: reducedMotion() });
      [c1, c2].forEach((c) => typeof c === 'function' && onLeave(c));
    } catch (e) { console.error(e); }
    const [aw, ah] = String(r.aspect || '3/2').split('/').map(Number);
    const maxW = aw && ah && ah > aw ? Math.round(560 * aw / ah) + 'px' : '900px';
    return h('div', { class: 'slider', style: { maxWidth: maxW } }, stage, range);
  }

  /* ── 화면: 조합 ───────────────────────────────── */
  function fieldFilters(cur, onPick, withAll = true, extra) {
    const opts = (withAll ? [['all', '전체']] : []).concat(extra || [], FIELDS.map((f) => [f.id, f.ko]));
    return h('div', { class: 'filters', role: 'group', 'aria-label': '분야 거르기' },
      opts.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(cur === k), onclick: () => onPick(k) }, label)));
  }

  function viewCombos(app, fid) {
    if (fid) S.comboField = fid;
    const cur = S.comboField;
    app.append(h('div', { class: 'page-h' }, h('span', { class: 'eyebrow' }, '조합 레시피'), h('h1', null, '함께 쓰면 잘 맞는 용어'),
      h('p', null, '원하는 결과별로 용어를 묶었어요. 누르면 원본과 조합 결과, 용어 하나씩 넣은 결과를 함께 보여 줘요.')));
    app.append(fieldFilters(cur, (k) => { location.hash = k === 'all' ? 'combos' : 'combos.' + k; }));
    const list = D.combos.filter((c) => cur === 'all' || c.field === cur);
    app.append(h('div', { class: 'cards' }, list.map((cb) => h('a', { class: 'card', href: '#c.' + cb.field + '.' + cb.id },
      h('span', { class: 'chip', style: { justifySelf: 'start' } }, FMAP[cb.field].ko),
      h('h3', null, cb.name_ko),
      h('span', { class: 'sub' }, cb.goal_ko || ''),
      h('div', { class: 'chips' }, (cb.term_ids || []).map((id) => getTerm(cb.field, id)).filter(Boolean).slice(0, 6).map((t) => h('span', { class: 'chip' }, t.ko)))))));
  }

  function viewCombo(app, fid, id) {
    const cb = D.combos.find((c) => c.field === fid && c.id === id);
    if (!cb) { app.append(h('p', null, '이 조합을 찾지 못했어요.')); return; }
    const terms = (cb.term_ids || []).map((x) => getTerm(fid, x)).filter(Boolean);
    const main = h('div', { style: { minWidth: '0' } });
    app.append(h('div', { class: 'fieldpage' }, sidebar(fid, '__combos'), main));
    main.append(h('div', { class: 'detail-h' },
      h('div', { class: 'crumbs' }, h('a', { href: '#combos.' + fid }, '조합 레시피'), '›', FMAP[fid].ko),
      h('div', { class: 'ko', style: { fontSize: '28px' } }, cb.name_ko),
      h('p', { class: 'fx' }, cb.goal_ko || ''),
      h('div', { class: 'chips' }, terms.map((t) => h('a', { class: 'chip', href: '#t.' + fid + '.' + t.id }, t.ko)))));
    if (FMAP[fid].kind === 'render') {
      main.append(strip({
        field: fid,
        entries: () => [{ terms: [] }, { terms, label: '조합 결과' }].concat(terms.filter(hasDemo).slice(0, 4).map((t) => ({ terms: [t] }))),
      }).el);
    }
    main.append(h('div', { class: 'info' },
      h('div', { class: 'panel', style: { gridColumn: '1 / -1' } }, h('h3', null, '완성 프롬프트'),
        h('div', { class: 'snippet' }, highlight(cb.prompt_en || '', terms)), h('div', null, copyBtn(() => cb.prompt_en || ''))),
      cb.notes_ko ? h('div', { class: 'panel' }, h('h3', null, '쓸 때 참고하세요'), h('div', null, cb.notes_ko)) : null,
      (cb.tools || []).length ? h('div', { class: 'panel' }, h('h3', null, '잘 맞는 도구'), h('div', { class: 'chips' }, cb.tools.map((x) => h('span', { class: 'chip' }, x)))) : null));
  }

  function highlight(text, terms) {
    const words = terms.map((t) => shortName(t)).filter((w) => w && w.length > 2)
      .sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return text;
    const re = new RegExp('(' + words.join('|') + ')', 'gi');
    return text.split(re).map((part, i) => (i % 2 ? h('mark', { class: 'ins' }, part) : part));
  }

  /* ── 화면: 기법 ───────────────────────────────── */
  function viewTech(app, filter, focusId) {
    if (filter) {
      if (FMAP[filter] || filter === 'interaction') { S.techField = filter; S.techCat = 'all'; }
      else if (D.techCategories.some((c) => c.id === filter)) { S.techField = 'interaction'; S.techCat = filter; }
    }
    app.append(h('div', { class: 'page-h' }, h('span', { class: 'eyebrow' }, '상호작용 기법'), h('h1', null, '프롬프트 밖에서 AI를 다루는 법'),
      h('p', null, '참고 이미지, 시드 고정, 부분 수정, 맥락 주기처럼 결과를 바꾸는 방법이에요.')));
    app.append(fieldFilters(S.techField, (k) => { location.hash = k === 'all' ? 'tech' : 'tech.' + k; }, true, [['interaction', '공통 기법']]));
    if (S.techField === 'interaction') {
      app.append(h('div', { class: 'filters', role: 'group', 'aria-label': '종류 거르기' },
        [['all', '모든 종류']].concat(D.techCategories.map((c) => [c.id, c.name_ko])).map(([k, label]) =>
          h('button', { type: 'button', 'aria-pressed': String(S.techCat === k), onclick: () => { S.techCat = k; route(true); } }, label))));
    }
    const list = D.techniques.filter((t) => (S.techField === 'all' || t.field === S.techField) &&
      (S.techField !== 'interaction' || S.techCat === 'all' || t.category === S.techCat));
    const techKey = (t) => t.field + '.' + t.id;
    let focusEl = null;
    const grid = h('div', { class: 'cards' }, list.map((t) => {
      const cw = (t.compare_with || []).map((x) => D.techniques.find((y) => y.id === x && y.field === t.field)).filter(Boolean);
      const isFocus = focusId && techKey(t) === focusId;
      const card = h('div', { class: 'card' + (isFocus ? ' hl' : ''), id: 'k-' + t.field + '-' + t.id },
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, t.field === 'interaction' ? '공통' : FMAP[t.field].ko),
          t.level ? h('span', { class: 'chip' }, LEVEL[t.level] || t.level) : null),
        h('h3', null, t.ko || t.name),
        h('span', { class: 'en' }, t.name),
        h('span', { class: 'sub' }, t.when_ko || ''),
        h('details', { open: isFocus || null },
          h('summary', null, '방법 보기'),
          h('dl', null,
            t.how_ko ? [h('dt', null, '어떻게'), h('dd', null, t.how_ko)] : null,
            t.effect_ko ? [h('dt', null, '달라지는 점'), h('dd', null, t.effect_ko)] : null,
            t.example ? [h('dt', null, '예시'), h('dd', null, h('div', { class: 'ex' }, t.example))] : null,
            (t.tools || []).length ? [h('dt', null, '도구'), h('dd', null, h('div', { class: 'chips' }, t.tools.slice(0, 8).map((x) => h('span', { class: 'chip' }, x))))] : null,
            cw.length ? [h('dt', null, '비교해 볼 기법'), h('dd', null, h('div', { class: 'chips' }, cw.map((x) => h('a', { class: 'chip', href: '#k.' + x.field + '.' + x.id }, x.ko || x.name))))] : null)));
      if (isFocus) focusEl = card;
      return card;
    }));
    app.append(grid);
    if (focusEl) requestAnimationFrame(() => focusEl.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
  }

  /* ── 화면: 브리프 ───────────────────────────────── */
  function viewBriefs(app) {
    app.append(h('div', { class: 'page-h' }, h('span', { class: 'eyebrow' }, '브리프 틀'), h('h1', null, '만들고 싶은 게 생겼을 때 AI에게 주는 맥락'),
      h('p', null, '칸을 채우면 AI에게 그대로 줄 수 있는 브리프가 만들어져요.')));
    app.append(h('div', { class: 'cards' }, D.briefs.map((b) => h('a', { class: 'card', href: '#b.' + b.id },
      h('h3', null, b.name_ko),
      h('span', { class: 'sub' }, b.fields.map((f) => f.name_ko).join(' · ')),
      h('div', { class: 'chips' }, (b.tags || []).map((x) => h('span', { class: 'chip' }, FMAP[x] ? FMAP[x].ko : x)))))));
  }

  function viewBrief(app, id) {
    const b = D.briefs.find((x) => x.id === id);
    if (!b) { app.append(h('p', null, '이 브리프 틀을 찾지 못했어요.')); return; }
    const vals = {};
    const pre = h('pre', null);
    const build = () => {
      const lines = b.fields.map((f) => f.name_ko + ': ' + (vals[f.key] || '').trim()).filter((l) => !/:\s*$/.test(l));
      return '<brief>\n' + lines.join('\n') + '\n</brief>\n<task>\n이 브리프에 맞춰 ' + b.name_ko.replace(/\s*브리프$/, '') +
        ' 시안을 3가지 방향으로 제안해 주세요.\n시작하기 전에 결과에 큰 영향을 줄 질문이 있으면 3개까지 먼저 물어봐 주세요.\n</task>';
    };
    const update = () => { pre.textContent = build(); };
    const form = h('form', { class: 'form', onsubmit: (e) => e.preventDefault() }, b.fields.map((f) => {
      vals[f.key] = f.example || '';
      return h('label', { for: 'bf-' + f.key },
        h('b', null, f.name_ko), h('span', null, f.desc_ko || ''),
        h('textarea', { id: 'bf-' + f.key, rows: 2, oninput: (e) => { vals[f.key] = e.target.value; update(); } }, f.example || ''));
    }));
    update();
    const techs = (b.technique_ids || []).map((x) => D.techniques.find((t) => t.id === x && t.field === 'interaction')).filter(Boolean);
    const example = h('pre', { hidden: true }, b.filled_example_ko || '');
    app.append(h('div', { class: 'detail-h' },
      h('div', { class: 'crumbs' }, h('a', { href: '#briefs' }, '브리프 틀')),
      h('div', { class: 'ko', style: { fontSize: '28px' } }, b.name_ko),
      h('p', { class: 'fx muted' }, '예시 값이 미리 들어 있어요. 내 내용으로 바꿔 보세요.')));
    app.append(h('div', { class: 'brief' }, form,
      h('div', { class: 'out' },
        h('div', { class: 'strip-bar' }, h('b', null, 'AI에게 줄 브리프'), copyBtn(build, '브리프 복사')),
        pre,
        b.filled_example_ko ? h('button', { class: 'btn', type: 'button', onclick: (e) => { example.hidden = !example.hidden; e.currentTarget.textContent = example.hidden ? '완성 예시 보기' : '완성 예시 접기'; } }, '완성 예시 보기') : null,
        example)));
    if ((b.workflow_ko || []).length || techs.length) {
      app.append(h('div', { class: 'info' },
        (b.workflow_ko || []).length ? h('div', { class: 'panel' }, h('h3', null, '진행 순서'), h('ol', { class: 'steps' }, b.workflow_ko.map((s) => h('li', null, s.replace(/^\d+단계[:.]?\s*/, ''))))) : null,
        techs.length ? h('div', { class: 'panel' }, h('h3', null, '이 과정에 쓰는 기법'), h('div', { class: 'chips' }, techs.map((t) => h('a', { class: 'chip', href: '#k.interaction.' + t.id }, t.ko || t.name)))) : null));
    }
  }

  /* ── 검색 ───────────────────────────────── */
  const IDX = [];
  D.terms.forEach((t) => IDX.push({ kind: '용어', t: shortName(t), d: t.ko + ' · ' + (t.effect_ko || ''), f: FMAP[t.field].ko, href: '#t.' + t.field + '.' + t.id,
    a: String(t.term).toLowerCase(), b: String(t.ko || '').toLowerCase(), c: ((t.effect_ko || '') + ' ' + (t.snippet || '')).toLowerCase() }));
  D.combos.forEach((c) => IDX.push({ kind: '조합', t: c.name_ko, d: c.goal_ko || '', f: FMAP[c.field].ko, href: '#c.' + c.field + '.' + c.id,
    a: '', b: String(c.name_ko || '').toLowerCase(), c: ((c.goal_ko || '') + ' ' + (c.prompt_en || '')).toLowerCase() }));
  D.techniques.forEach((t) => IDX.push({ kind: '기법', t: t.ko || t.name, d: t.when_ko || '', f: t.field === 'interaction' ? '공통' : FMAP[t.field].ko, href: '#k.' + t.field + '.' + t.id,
    a: String(t.name || '').toLowerCase(), b: String(t.ko || '').toLowerCase(), c: ((t.how_ko || '') + ' ' + (t.when_ko || '')).toLowerCase() }));
  D.briefs.forEach((b) => IDX.push({ kind: '브리프', t: b.name_ko, d: b.fields.map((f) => f.name_ko).join(' · '), f: '', href: '#b.' + b.id,
    a: '', b: b.name_ko.toLowerCase(), c: '' }));

  // "원하는 결과"로 찾을 때 쓰는 말 → 사전에 실제로 쓰인 말
  const SYN = {
    '저녁': ['golden hour', '골든아워', 'blue hour', '블루아워', 'dusk', '노을', '해 질'], '노을': ['golden hour', '골든아워', 'sunset'],
    '새벽': ['blue hour', '블루아워', 'dawn'], '밤': ['night', '야간', 'neon', '네온'], '아침': ['morning', '아침', 'soft'],
    '따뜻': ['warm', '따뜻', 'golden', '골든', 'portra', 'candle'], '차갑': ['cool', '차가운', 'blue', '푸른'], '차가운': ['cool', 'blue'],
    '영화': ['cinematic', '시네마틱', 'anamorphic', 'film', '필름'], '시네마틱': ['cinematic', 'anamorphic', 'teal'],
    '몽환': ['dreamy', '몽환', 'soft focus', 'haze', 'bloom'], '꿈': ['dreamy', '몽환', 'surreal'], '신비': ['eerie', 'mysterious', '신비', 'fog'],
    '레트로': ['retro', 'vintage', '80s', 'vhs', '레트로', '빈티지'], '옛날': ['vintage', 'retro', '빈티지', 'sepia'], '빈티지': ['vintage', 'retro', 'film', 'polaroid'],
    '귀여': ['cute', 'chibi', 'kawaii', 'toon', 'clay', '귀여'], '고급': ['luxury', 'premium', 'editorial', '고급', 'didone', 'art deco'],
    '어두': ['low-key', 'moody', 'dark', 'chiaroscuro', '어두'], '밝': ['high-key', 'bright', '밝', 'airy'], '무서': ['eerie', 'horror', '공포', 'unsettling'],
    '슬프': ['melancholic', 'sad', '슬픔', 'minor', '우울', 'bittersweet'], '슬픈': ['melancholic', 'sad', 'minor', '우울', 'bittersweet', 'blue hour'], '우울': ['melancholic', 'moody', 'minor', 'blue'], '신나': ['euphoric', 'energetic', 'upbeat', '신나'], '잔잔': ['ambient', 'calm', 'lofi', '잔잔', 'soft'],
    '긴장': ['tense', 'suspense', '긴장', 'dolly zoom'], '웅장': ['epic', 'orchestral', 'cinematic', '웅장'], '감성': ['lofi', 'film', 'nostalgic', '감성'],
    '흐릿': ['bokeh', 'shallow', 'blur', '흐림', 'soft focus'], '배경 흐림': ['bokeh', 'shallow depth'], '선명': ['deep focus', 'sharp', 'crisp'],
    '손그림': ['hand-drawn', 'sketch', 'watercolor', '손그림'], '그림': ['painting', 'illustration', '회화'], '만화': ['comic', 'anime', 'cel', '만화'],
    '사진': ['photo', 'photography', '사진'], '실사': ['photorealistic', 'realistic', '실사'], '깔끔': ['minimal', 'clean', '미니멀', 'flat'],
    '화려': ['maximalism', 'vibrant', 'neon', '화려'], '움직': ['motion', 'camera movement', 'dolly', '무빙'], '느리': ['slow motion', 'slow', '슬로'],
    '빠르': ['fast', 'timelapse', 'speed', 'whip'], '흔들': ['handheld', 'shaky', '핸드헬드'], '날아': ['drone', 'aerial', 'fpv', '드론'],
  };
  const stem = (w) => w.replace(/(스러운|스럽게|하게|하고|해요|했던|적인|적으로|으로|에서|한|하는|된|의|은|는|이|가|을|를|로|에|도|감|느낌)$/, '') || w;
  function expand(word) {
    const s = stem(word);
    const out = new Set([word, s]);
    Object.keys(SYN).forEach((k) => { if (s.length >= 1 && (k.startsWith(s) || s.startsWith(k))) SYN[k].forEach((x) => out.add(x.toLowerCase())); });
    return [...out].filter((x) => x.length >= 1);
  }
  const FIELD_WORDS = { '이미지': 'image', '사진': 'image', '그림': 'image', '영상': 'video', '동영상': 'video', '비디오': 'video', '편집': 'editing', '자막': 'editing', '쇼츠': 'editing', '음악': 'audio', '노래': 'audio', '사운드': 'audio', '소리': 'audio', '음성': 'audio', '3d': '3d', '디자인': 'design', '로고': 'design', '포스터': 'design', '글': 'writing', '글쓰기': 'writing', '소설': 'writing', '카피': 'writing', '코딩': 'coding', '코드': 'coding', '앱': 'coding', '게임': 'coding' };
  function search(q) {
    let words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const fieldWord = words.find((w) => FIELD_WORDS[stem(w)] || FIELD_WORDS[w]);
    const wantField = fieldWord && (FIELD_WORDS[stem(fieldWord)] || FIELD_WORDS[fieldWord]);
    const FKO = wantField && FMAP[wantField].ko;
    if (wantField && words.length > 1) words = words.filter((w) => w !== fieldWord);
    const groups = words.map(expand);
    const out = [];
    for (const it of IDX) {
      let s = 0, hit = 0;
      groups.forEach((alts, gi) => {
        let best = 0;
        alts.forEach((w, i) => {
          const direct = i < 2; // 입력한 말 그대로면 가산점
          let ws = 0;
          if (it.a.startsWith(w) || it.b.startsWith(w)) ws = 100;
          else if (it.a.includes(w) || it.b.includes(w)) ws = 70;
          else if (it.c.includes(w)) ws = 25;
          if (ws && !direct) ws *= 0.6;
          best = Math.max(best, ws);
        });
        if (best) { hit++; s += best; }
      });
      if (hit) out.push([(s * (hit === groups.length ? 2 : 1) + (it.kind === '용어' ? 5 : 0)) * (FKO ? (it.f === FKO ? 1.6 : 0.4) : 1), it]);
    }
    return out.sort((x, y) => y[0] - x[0]).slice(0, 40).map((x) => x[1]);
  }

  function setupSearch() {
    const q = document.getElementById('q');
    const box = document.getElementById('results');
    let items = [], cur = -1, timer = 0;
    const close = () => { box.hidden = true; cur = -1; };
    const paint = () => {
      box.textContent = '';
      if (!items.length) { box.append(h('div', { class: 'none' }, '맞는 결과가 없어요. 다른 말로 찾아보세요')); return; }
      let last = '';
      items.forEach((it, i) => {
        if (it.kind !== last) { box.append(h('div', { class: 'grp' }, it.kind)); last = it.kind; }
        box.append(h('a', { href: it.href, class: i === cur ? 'on' : '', onclick: () => { close(); q.blur(); } },
          h('span', { class: 't' }, it.t), h('span', { class: 'f' }, it.f), h('span', { class: 'd' }, it.d)));
      });
    };
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const v = q.value.trim();
        if (!v) { close(); return; }
        items = search(v);
        // 화면 순서를 종류별로
        const order = ['용어', '조합', '기법', '브리프'];
        items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
        cur = -1; box.hidden = false; paint();
      }, 60);
    });
    q.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { cur = Math.min(items.length - 1, cur + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { const it = items[Math.max(0, cur)]; if (it) { location.hash = it.href.slice(1); close(); q.blur(); } }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) close(); });
  }

  /* ── 라우터 ───────────────────────────────── */
  function nav(current) {
    const n = document.getElementById('nav');
    n.textContent = '';
    FIELDS.forEach((f) => n.append(h('a', { href: '#' + f.id, 'aria-current': current === f.id ? 'page' : null }, f.ko)));
    n.append(h('span', { class: 'sep', 'aria-hidden': 'true' }));
    [['combos', '조합'], ['tech', '기법'], ['briefs', '브리프']].forEach(([k, label]) =>
      n.append(h('a', { href: '#' + k, 'aria-current': current === k ? 'page' : null }, label)));
  }

  let lastHash = null;
  function route(force) {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!force && hash === lastHash) return;
    const sameView = hash === lastHash;
    lastHash = hash;
    routeCleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    routeCleanups = [];
    PD.sound.stopAll();
    const app = document.getElementById('app');
    const y = window.scrollY;
    app.textContent = '';
    const p = hash.split('.');
    let current = '';
    if (!hash || hash === 'home') viewHome(app);
    else if (FMAP[p[0]]) { current = p[0]; viewField(app, p[0], p.slice(1).join('.')); }
    else if (p[0] === 'g' && FMAP[p[1]]) { current = p[1]; viewGallery(app, p[1]); }
    else if (p[0] === 't' && FMAP[p[1]]) { current = p[1]; viewTerm(app, p[1], p.slice(2).join('.')); }
    else if (p[0] === 'combos') { current = 'combos'; viewCombos(app, p[1] && FMAP[p[1]] ? p[1] : (p[1] ? null : 'all')); }
    else if (p[0] === 'c' && FMAP[p[1]]) { current = p[1]; viewCombo(app, p[1], p.slice(2).join('.')); }
    else if (p[0] === 'tech') { current = 'tech'; viewTech(app, p[1] || 'all'); }
    else if (p[0] === 'k') { current = 'tech'; S.techField = p[1]; S.techCat = 'all'; viewTech(app, null, p[1] + '.' + p.slice(2).join('.')); }
    else if (p[0] === 'briefs') { current = 'briefs'; viewBriefs(app); }
    else if (p[0] === 'b') { current = 'briefs'; viewBrief(app, p.slice(1).join('.')); }
    else viewHome(app);
    nav(current);
    if (sameView) window.scrollTo(0, y);
    else if (p[0] !== 'k') window.scrollTo(0, 0);
    document.title = '프롬프트 언어 사전';
  }

  function boot() {
    booted = true;
    setupSearch();
    window.addEventListener('hashchange', () => route(false));
    route(true);
    MINE.all().then(() => { if (MINE.cache.size) route(true); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
