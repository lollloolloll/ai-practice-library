/* 원리 도식: 조명 평면도, 카메라 높이, 샷 크기, 화각 — 분야에 상관없이 용어 id로 찾아요 */
(() => {
  'use strict';
  const PD = (window.PD = window.PD || {});
  const FG = 'var(--fg)', MU = 'var(--muted)', LN = 'var(--line)', AC = 'var(--accent)', SF = 'var(--surface-2)';
  const st = (o) => 'style="' + Object.entries(o).map(([k, v]) => k + ':' + v).join(';') + '"';
  const txt = (x, y, s, o = {}) => '<text x="' + x + '" y="' + y + '" ' + st(Object.assign({ fill: MU, 'font-size': '11px', 'font-family': 'var(--f-body)', 'text-anchor': 'middle' }, o)) + '>' + s + '</text>';
  const svg = (w, hgt, body) => {
    const d = document.createElement('div');
    d.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + hgt + '" xmlns="http://www.w3.org/2000/svg" role="img">' + body + '</svg>';
    return d.firstChild;
  };

  /* ── 조명 평면도 (위에서 본 모습, 카메라는 아래) ───────────── */
  // a: 피사체 기준 각도(0=카메라 쪽, 90=화면 왼쪽, 180=뒤), r: 거리, k: 종류(soft|hard|win|lamp), c: 색, p: 세기(0~1), l: 이름, hi: 높이
  const L = {
    'rembrandt-lighting': [{ a: 45, k: 'soft', l: '키', hi: '위 45°' }],
    'split-lighting': [{ a: 90, k: 'soft', l: '키', hi: '눈높이' }],
    'butterfly-lighting': [{ a: 0, k: 'soft', l: '키', hi: '정면 위' }],
    'loop-lighting': [{ a: 30, k: 'soft', l: '키', hi: '조금 위' }],
    'clamshell-lighting': [{ a: 0, k: 'soft', l: '위', hi: '위' }, { a: 0, r: 46, k: 'soft', l: '반사판', hi: '아래', p: 0.5 }],
    'three-point-lighting': [{ a: 45, k: 'soft', l: '키' }, { a: -45, k: 'soft', l: '필', p: 0.45 }, { a: 160, k: 'hard', l: '백', p: 0.8 }],
    'rim-light': [{ a: 140, k: 'hard', l: '림' }, { a: -140, k: 'hard', l: '림' }],
    'backlighting': [{ a: 180, k: 'hard', l: '역광' }],
    'silhouette': [{ a: 180, k: 'soft', l: '밝은 배경', p: 1 }],
    'front-lighting': [{ a: 0, r: 100, k: 'soft', l: '정면' }],
    'chiaroscuro': [{ a: 75, k: 'hard', l: '키', hi: '강한 대비' }],
    'low-key': [{ a: 70, k: 'hard', l: '키', hi: '필 없음' }],
    'high-key': [{ a: 35, k: 'soft', l: '키' }, { a: -35, k: 'soft', l: '필', p: 0.8 }, { a: 165, k: 'soft', l: '배경', p: 0.9 }],
    'softbox': [{ a: 45, k: 'soft', l: '소프트박스', big: 1 }],
    'hard-light': [{ a: 45, k: 'hard', l: '작은 광원' }],
    'direct-flash': [{ a: 0, r: 96, k: 'hard', l: '플래시', hi: '카메라 위' }],
    'window-light': [{ a: 80, k: 'win', l: '창문' }],
    'soft-window-light': [{ a: 80, k: 'win', l: '창문' }],
    'neon-lighting': [{ a: 70, k: 'hard', c: '#ff3fa4', l: '핑크' }, { a: -70, k: 'hard', c: '#25d8ff', l: '시안' }],
    'night-neon': [{ a: 70, k: 'hard', c: '#ff3fa4', l: '네온' }, { a: -70, k: 'hard', c: '#25d8ff', l: '네온' }],
    'gel-lighting': [{ a: 50, k: 'hard', c: '#ff4d4d', l: '레드 젤' }, { a: -120, k: 'hard', c: '#4d7bff', l: '블루 젤' }],
    'practical-lighting': [{ a: 60, r: 52, k: 'lamp', c: '#ffb347', l: '화면 속 램프' }],
    'practical-lights': [{ a: 60, r: 52, k: 'lamp', c: '#ffb347', l: '화면 속 램프' }],
    'candlelight': [{ a: 25, r: 44, k: 'lamp', c: '#ff9a3c', l: '촛불', hi: '아래' }],
    'volumetric-light': [{ a: 135, k: 'beam', l: '빛줄기', hi: '연기 속' }],
    'motivated-lighting': [{ a: 80, k: 'win', l: '창문(동기)' }, { a: 80, r: 104, k: 'soft', l: '실제 조명', p: 0.6 }],
    'studio-lighting': [{ a: 45, k: 'soft', l: '키' }, { a: -45, k: 'soft', l: '필', p: 0.5 }, { a: 180, k: 'soft', l: '배경', p: 0.6 }],
    'neutral-lighting': [{ a: 40, k: 'soft', l: '키', p: 0.7 }, { a: -40, k: 'soft', l: '필', p: 0.7 }],
    'hdri': [{ a: 0, k: 'dome', l: '주변 전체가 빛' }],
    'harsh-noon': [{ a: 0, k: 'sun', l: '정오의 해', hi: '머리 위' }],
    'golden-hour': [{ a: 70, k: 'sun', c: '#ffae42', l: '낮은 해', hi: '지평선 가까이' }],
    'blue-hour': [{ a: 0, k: 'dome', c: '#5b7cff', l: '푸른 하늘빛' }],
    'overcast': [{ a: 0, k: 'dome', l: '구름 낀 하늘' }],
  };

  function lightDiagram(lights) {
    const cx = 150, cy = 92;
    let beams = '', lamps = '';
    lights.forEach((s) => {
      const p = s.p == null ? 1 : s.p;
      const col = s.c || 'var(--mark)';
      if (s.k === 'dome' || s.k === 'sun' && s.hi === '머리 위') {
        lamps += '<circle cx="' + cx + '" cy="' + cy + '" r="78" ' + st({ fill: 'none', stroke: col, 'stroke-width': 10, opacity: .35, 'stroke-dasharray': '2 6' }) + '/>';
        lamps += txt(cx, 14, s.l + (s.hi ? ' · ' + s.hi : ''), { fill: FG, 'font-weight': 600 });
        return;
      }
      const R = s.r || 76;
      const rad = (s.a * Math.PI) / 180;
      const x = cx - Math.sin(rad) * R, y = cy + Math.cos(rad) * R;
      const ang = Math.atan2(cy - y, cx - x);
      const spread = s.k === 'hard' || s.k === 'sun' ? 0.16 : s.k === 'beam' ? 0.1 : s.big ? 0.62 : 0.42;
      const far = Math.hypot(cx - x, cy - y) + 8;
      const ax = x + Math.cos(ang - spread) * far, ay = y + Math.sin(ang - spread) * far;
      const bx = x + Math.cos(ang + spread) * far, by = y + Math.sin(ang + spread) * far;
      beams += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' L' + bx.toFixed(1) + ' ' + by.toFixed(1) + 'Z" ' + st({ fill: col, opacity: (0.18 + 0.32 * p).toFixed(2) }) + '/>';
      const deg = (ang * 180) / Math.PI;
      if (s.k === 'soft' || s.k === 'win') {
        const w = s.k === 'win' ? 40 : s.big ? 36 : 26;
        lamps += '<rect x="' + (-5) + '" y="' + (-w / 2) + '" width="10" height="' + w + '" rx="' + (s.k === 'win' ? 1 : 3) + '" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + deg.toFixed(1) + ')" ' + st({ fill: col, stroke: FG, 'stroke-width': 1.2, opacity: 0.5 + 0.5 * p }) + '/>';
      } else {
        lamps += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (s.k === 'lamp' ? 6 : 8) + '" ' + st({ fill: col, stroke: FG, 'stroke-width': 1.2 }) + '/>';
      }
      const lx = x + (x - cx) * 0.28, ly = y + (y - cy) * 0.28;
      lamps += txt(Math.max(30, Math.min(270, lx)).toFixed(1), Math.max(14, Math.min(176, ly + 4)).toFixed(1), s.l + (s.hi ? ' · ' + s.hi : ''), { fill: FG, 'font-weight': 600 });
    });
    const subject =
      '<ellipse cx="' + cx + '" cy="' + (cy + 4) + '" rx="34" ry="14" ' + st({ fill: SF, stroke: MU, 'stroke-width': 1 }) + '/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="15" ' + st({ fill: 'var(--surface)', stroke: FG, 'stroke-width': 1.5 }) + '/>' +
      '<path d="M' + (cx - 4) + ' ' + (cy + 14) + ' L' + cx + ' ' + (cy + 21) + ' L' + (cx + 4) + ' ' + (cy + 14) + '" ' + st({ fill: 'none', stroke: FG, 'stroke-width': 1.5 }) + '/>';
    const cam = '<rect x="' + (cx - 13) + '" y="181" width="26" height="15" rx="3" ' + st({ fill: FG }) + '/><rect x="' + (cx - 5) + '" y="176" width="10" height="6" rx="1" ' + st({ fill: FG }) + '/>' + txt(cx + 34, 193, '카메라');
    return svg(300, 200, beams + subject + lamps + cam + txt(26, 196, '위에서 본 배치', { 'text-anchor': 'start', 'font-size': '10px' }));
  }

  /* ── 카메라 높이·기울기 (옆에서 본 모습) ───────────── */
  const ANG = {
    'eye-level': { y: 72, tilt: 0, l: '눈높이' },
    'low-angle': { y: 128, tilt: -22, l: '아래에서 올려다봐요' },
    'high-angle': { y: 26, tilt: 22, l: '위에서 내려다봐요' },
    'birds-eye-view': { y: 8, tilt: 80, x: 150, l: '바로 위' },
    'aerial-view': { y: 8, tilt: 50, x: 70, l: '높은 하늘' },
    'worms-eye-view': { y: 152, tilt: -45, x: 120, l: '바닥에서' },
    'dutch-angle': { dutch: true, l: '카메라를 옆으로 기울여요' },
    'profile-view': { top: 90, l: '옆모습' }, 'profile-shot': { top: 90, l: '옆모습' },
    'three-quarter-view': { top: 45, l: '3/4 각도' },
    'rear-shot': { top: 180, l: '뒤에서' },
    'front-view': { top: 0, l: '정면' },
    'isometric-view': { iso: true, l: '등각 투영' }, 'isometric-camera': { iso: true, l: '등각 투영' },
    'orthographic': { iso: true, l: '원근 없이 평행하게' },
    'over-the-shoulder': { ots: true, l: '어깨 너머' },
    'pov-shot': { pov: true, l: '인물의 눈으로' },
  };
  function person(x, base, s = 1) {
    const hd = base - 118 * s;
    return '<circle cx="' + x + '" cy="' + hd + '" r="' + 11 * s + '" ' + st({ fill: 'none', stroke: FG, 'stroke-width': 1.6 }) + '/>' +
      '<path d="M' + x + ' ' + (hd + 11 * s) + ' V' + (base - 52 * s) + ' M' + (x - 22 * s) + ' ' + (hd + 34 * s) + ' L' + x + ' ' + (hd + 24 * s) + ' L' + (x + 22 * s) + ' ' + (hd + 34 * s) + ' M' + (x - 14 * s) + ' ' + base + ' L' + x + ' ' + (base - 52 * s) + ' L' + (x + 14 * s) + ' ' + base + '" ' + st({ fill: 'none', stroke: FG, 'stroke-width': 1.6, 'stroke-linecap': 'round' }) + '/>';
  }
  function camAt(x, y, deg) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + deg + ')"><rect x="-14" y="-9" width="22" height="18" rx="3" ' + st({ fill: FG }) + '/><path d="M8 -6 L20 -11 V11 L8 6Z" ' + st({ fill: FG }) + '/></g>';
  }
  function angleDiagram(a) {
    const ground = '<line x1="10" y1="170" x2="290" y2="170" ' + st({ stroke: LN, 'stroke-width': 2 }) + '/>';
    if (a.dutch) {
      return svg(300, 200, '<g transform="rotate(-14 150 95)"><rect x="70" y="40" width="160" height="110" rx="4" ' + st({ fill: 'none', stroke: AC, 'stroke-width': 2 }) + '/>' + person(150, 145, 0.8) + '</g>' + txt(150, 190, a.l, { fill: FG, 'font-weight': 600 }));
    }
    if (a.top != null) {
      const rad = (a.top * Math.PI) / 180;
      const cx = 150 - Math.sin(rad) * 70, cy = 92 + Math.cos(rad) * 70;
      const deg = (Math.atan2(92 - cy, 150 - cx) * 180) / Math.PI;
      return svg(300, 200, '<circle cx="150" cy="92" r="16" ' + st({ fill: 'var(--surface)', stroke: FG, 'stroke-width': 1.5 }) + '/><path d="M146 106 L150 113 L154 106" ' + st({ fill: 'none', stroke: FG, 'stroke-width': 1.5 }) + '/>' +
        camAt(cx.toFixed(1), cy.toFixed(1), deg.toFixed(1)) + txt(150, 192, a.l + ' · 위에서 본 배치', { fill: FG, 'font-weight': 600 }));
    }
    if (a.iso) {
      const box = '<path d="M150 40 L210 72 L150 104 L90 72Z" ' + st({ fill: SF, stroke: FG, 'stroke-width': 1.5 }) + '/><path d="M90 72 V130 L150 162 V104" ' + st({ fill: 'none', stroke: FG, 'stroke-width': 1.5 }) + '/><path d="M210 72 V130 L150 162" ' + st({ fill: 'none', stroke: FG, 'stroke-width': 1.5 }) + '/>';
      return svg(300, 200, box + txt(150, 190, a.l + ' · 멀어져도 크기가 같아요', { fill: FG, 'font-weight': 600 }));
    }
    if (a.ots) {
      return svg(300, 200, '<circle cx="110" cy="120" r="22" ' + st({ fill: SF, stroke: FG, 'stroke-width': 1.5 }) + '/><circle cx="200" cy="60" r="16" ' + st({ fill: 'var(--surface)', stroke: FG, 'stroke-width': 1.5 }) + '/>' + camAt(78, 160, -45) +
        '<path d="M86 150 L200 60" ' + st({ stroke: AC, 'stroke-dasharray': '4 4', 'stroke-width': 1.5 }) + '/>' + txt(150, 192, a.l + ' · 앞사람 어깨가 걸쳐요', { fill: FG, 'font-weight': 600 }));
    }
    if (a.pov) {
      return svg(300, 200, '<path d="M60 150 Q150 20 240 150" ' + st({ fill: 'none', stroke: LN, 'stroke-width': 2 }) + '/><ellipse cx="150" cy="150" rx="40" ry="10" ' + st({ fill: SF }) + '/><path d="M110 150 L95 185 M190 150 L205 185" ' + st({ stroke: FG, 'stroke-width': 6, 'stroke-linecap': 'round' }) + '/>' + txt(150, 100, a.l, { fill: FG, 'font-weight': 600 }));
    }
    const cx = a.x || 60, cy = a.y;
    const sight = '<line x1="' + cx + '" y1="' + cy + '" x2="215" y2="' + (a.tilt > 60 ? 160 : 92) + '" ' + st({ stroke: AC, 'stroke-dasharray': '4 4', 'stroke-width': 1.5 }) + '/>';
    return svg(300, 200, ground + person(215, 170) + sight + camAt(cx, cy, a.tilt > 60 ? 90 : a.tilt) + txt(150, 192, a.l, { fill: FG, 'font-weight': 600 }));
  }

  /* ── 샷 크기 (사람 몸에 프레임을 얹어요) ───────────── */
  const SHOT = {
    'extreme-close-up': [0.04, 0.09, '눈만'], 'close-up': [0.0, 0.2, '얼굴'], 'medium-close-up': [-0.01, 0.3, '가슴 위'],
    'medium-shot': [-0.02, 0.5, '허리 위'], 'cowboy-shot': [-0.02, 0.68, '허벅지까지'], 'medium-full-shot': [-0.02, 0.72, '무릎까지'],
    'full-body-shot': [-0.05, 1.04, '전신'], 'full-shot': [-0.05, 1.04, '전신'], 'wide-shot': [-0.25, 1.4, '사람과 주변'],
    'wide-establishing-shot': [-0.4, 1.9, '장소 전체'], 'extreme-wide-shot': [-0.6, 2.6, '사람은 아주 작게'],
    'insert-shot': [0.55, 0.12, '손이나 물건'], 'macro-shot': [0.06, 0.05, '아주 가까이'], 'two-shot': [-0.05, 0.55, '두 사람'],
  };
  function shotDiagram(s, id) {
    const top = 34, H = 140, base = top + H;
    const y0 = top + s[0] * H, y1 = top + s[1] * H;
    const hgt = Math.max(10, y1 - y0), w = hgt * 1.5;
    const x0 = 150 - w / 2;
    let body = person(150, base, H / 130);
    if (id === 'two-shot') body = person(125, base, H / 130) + person(178, base, H / 130);
    const clipFrame = '<rect x="' + x0.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hgt.toFixed(1) + '" ' + st({ fill: 'var(--mark)', 'fill-opacity': 0.16, stroke: AC, 'stroke-width': 2 }) + '/>';
    return svg(300, 200, body + clipFrame + txt(150, 196, s[2], { fill: FG, 'font-weight': 600 }));
  }

  /* ── 화각 (초점거리) ───────────── */
  const FOV = {
    'lens-14mm': [114, '14mm · 아주 넓게'], 'wide-angle-lens': [84, '24mm 안팎 · 넓게'], 'lens-35mm': [63, '35mm · 눈과 비슷하게 넓게'],
    'lens-50mm': [47, '50mm · 사람 눈 느낌'], '50mm-lens': [47, '50mm · 사람 눈 느낌'], 'lens-85mm': [28, '85mm · 인물 압축'], '85mm-portrait': [28, '85mm · 인물 압축'],
    'telephoto-lens': [12, '200mm 안팎 · 배경이 당겨져요'], 'fisheye-lens': [180, '피시아이 · 180°'], 'focal-length': [47, '초점거리에 따라 화각이 바뀌어요'],
  };
  function fovDiagram(f) {
    const cx = 40, cy = 100, R = 230;
    const half = (Math.min(f[0], 178) / 2) * Math.PI / 180;
    const ax = cx + Math.cos(-half) * R, ay = cy + Math.sin(-half) * R;
    const bx = cx + Math.cos(half) * R, by = cy + Math.sin(half) * R;
    const cone = '<path d="M' + cx + ' ' + cy + ' L' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + bx.toFixed(1) + ' ' + by.toFixed(1) + 'Z" ' + st({ fill: 'var(--mark)', 'fill-opacity': 0.25, stroke: AC, 'stroke-width': 1.5 }) + '/>';
    const trees = [120, 190, 255].map((x, i) => '<circle cx="' + x + '" cy="' + (100 + (i - 1) * 26) + '" r="7" ' + st({ fill: SF, stroke: MU }) + '/>').join('');
    return svg(300, 200, '<clipPath id="fc"><rect width="300" height="182"/></clipPath><g clip-path="url(#fc)">' + cone + trees + '</g>' + camAt(cx, cy, 0) + txt(150, 196, f[1], { fill: FG, 'font-weight': 600 }));
  }

  PD.diagram = (t) => {
    if (!t) return null;
    const id = t.id;
    try {
      if (L[id]) return lightDiagram(L[id]);
      if (SHOT[id] && (t.category === 'shot-size' || t.category === 'camera')) return shotDiagram(SHOT[id], id);
      if (ANG[id]) return angleDiagram(ANG[id]);
      if (FOV[id]) return fovDiagram(FOV[id]);
    } catch (e) { console.error(e); }
    return null;
  };
})();
