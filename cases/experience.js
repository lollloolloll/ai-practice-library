/* 체험기: 사용자 입장에서 본 몰입 순서(감정 곡선 + 장면), 도파민 지점, 식는 지점, 문법.
   사용: Experience(부모 요소, '../analyses/<대상>/', experience.json 객체) */
(() => {
  const css = `
.xp { display: grid; gap: 28px; min-width: 0; }
.xp-verdict { font-size: 17px; line-height: 1.8; max-width: 72ch; padding: 16px 18px; border-left: 3px solid var(--accent); background: var(--surface); border-radius: 0 var(--r) var(--r) 0; margin: 0; }
.xp-persona { font-size: 14px; color: var(--muted); margin: 0; max-width: 72ch; }
.xp h3 { margin: 0; font-size: 18px; }
.xp-sub { display: grid; gap: 12px; min-width: 0; }
.xp-sub > p { margin: 0; font-size: 14px; color: var(--muted); max-width: 72ch; }
.xp-loop { display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch; }
.xp-loop div { flex: 1 1 140px; padding: 10px 12px; border-radius: var(--r); background: var(--surface); border: 1px solid var(--line); display: grid; gap: 4px; align-content: start; position: relative; min-width: 0; }
.xp-loop b { font-size: 13px; color: var(--accent); }
.xp-loop span { font-size: 13.5px; line-height: 1.55; }
.xp-loop div:not(:last-child)::after { content: '→'; position: absolute; right: -11px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 14px; z-index: 1; }
.xp-loop div:last-child { border-style: dashed; }
.xp-scales { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 10px; }
.xp-scales div { padding: 10px 12px; border-radius: var(--r); background: var(--surface); border: 1px solid var(--line); display: grid; gap: 4px; }
.xp-scales b { font: 500 12px var(--f-mono); color: var(--muted); }
.xp-scales span { font-size: 13.5px; line-height: 1.6; }
.xp-curve { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 12px 8px 4px; overflow-x: auto; }
.xp-curve svg { display: block; width: 100%; min-width: 560px; height: auto; }
.xp-curve .dot { cursor: pointer; }
.xp-curve .dot:hover circle, .xp-curve .dot:focus circle { r: 9; }
.xp-curve .dot:focus { outline: none; }
.xp-moments { display: grid; gap: 14px; }
.xp-m { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 0; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); overflow: hidden; scroll-margin-top: 90px; }
.xp-m.hot { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.xp-m .pic { border: 0; padding: 0; margin: 0; background: var(--surface-2); cursor: zoom-in; display: block; align-self: stretch; }
.xp-m .pic img { display: block; width: 100%; height: auto; }
.xp-m .nopic { display: grid; place-items: center; padding: 24px; color: var(--muted); font-size: 13px; background: var(--surface-2); text-align: center; }
.xp-m .body { padding: 14px 16px 16px; display: grid; gap: 10px; align-content: start; min-width: 0; }
.xp-m .top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font: 500 12px var(--f-mono); color: var(--muted); }
.xp-m h4 { margin: 0; font-size: 17px; }
.xp-kick { font: 700 11px var(--f-sans, inherit); padding: 2px 8px; border-radius: 999px; color: #fff; }
.xp-heat { letter-spacing: 1px; color: var(--accent); }
.xp-heat i { font-style: normal; color: var(--line); }
.xp-m .did { margin: 0; font-size: 14px; line-height: 1.7; }
.xp-m blockquote { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); font-size: 15.5px; line-height: 1.65; font-weight: 500; }
.xp-m blockquote::before { content: '속마음 '; font: 700 11px var(--f-mono); color: var(--accent); display: block; margin-bottom: 2px; }
.xp-m .why { margin: 0; font-size: 13.5px; line-height: 1.7; color: var(--fg); }
.xp-m .why b { color: var(--muted); font-size: 12px; margin-right: 6px; }
.xp-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 10px; }
.xp-cards article { padding: 12px 14px; border-radius: var(--r); background: var(--surface); border: 1px solid var(--line); display: grid; gap: 6px; align-content: start; min-width: 0; }
.xp-cards h4 { margin: 0; font-size: 15px; display: flex; gap: 8px; justify-content: space-between; align-items: baseline; }
.xp-cards .tr { font-size: 13px; color: var(--accent); font-weight: 600; }
.xp-cards p { margin: 0; font-size: 13.5px; line-height: 1.65; }
.xp-cards .src { font: 400 11px var(--f-mono); color: var(--muted); overflow-wrap: anywhere; }
.xp-cards.cool article { border-style: dashed; }
.xp-syn { width: 100%; border-collapse: collapse; font-size: 14px; }
.xp-syn th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--line); }
.xp-syn td { padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.6; }
.xp-syn td:first-child { font-weight: 600; white-space: nowrap; }
.xp-scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r); background: var(--surface); }
.xp-todo { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14px; max-width: 72ch; }
.xp-st { font: 700 10px var(--f-mono); padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
.xp-st.observed { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
.xp-st.inferred { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); }
.xp-st.unknown { background: var(--surface-2); color: var(--muted); }
.xp-box { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.85); display: grid; place-items: center; padding: 24px; }
.xp-box img { max-width: min(1300px, 100%); max-height: calc(100vh - 80px); object-fit: contain; border-radius: 8px; }
.xp-box button { position: absolute; top: 14px; right: 16px; background: #fff; color: #111; border: 0; border-radius: 999px; padding: 6px 12px; font-weight: 700; }
@media (max-width: 760px) {
  .xp-m { grid-template-columns: minmax(0, 1fr); }
  .xp-loop div:not(:last-child)::after { content: '↓'; right: auto; left: 50%; top: auto; bottom: -13px; transform: translateX(-50%); }
  .xp-loop div { flex-basis: 100%; }
  .xp-syn td:first-child { white-space: normal; }
}`;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  // 감정 종류별 색: 밝은 면과 어두운 면 모두에서 흰 글씨가 읽히는 중간 밝기
  const KICK = { '보상': '#d9480f', '뽑기': '#c2255c', '수집': '#7048e8', '욕심': '#e8590c', '긴장': '#c92a2a', '주인공감': '#1971c2', '통제': '#0c8599', '기대': '#5f3dc4', '과제': '#495057', '연속': '#2b8a3e', '정리감': '#2f9e44', '소속': '#1864ab', '결제 유혹': '#868e96', '안심': '#868e96', '궁금증': '#9c36b5' };
  const ST = { observed: '관찰', inferred: '추정', unknown: '미확인' };

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v; else el.setAttribute(k, v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c.nodeType ? c : document.createTextNode(String(c))); };
    kids.forEach(add);
    return el;
  };
  const stTag = (s) => h('span', { class: 'xp-st ' + s }, ST[s] || s);
  const kick = (k) => h('span', { class: 'xp-kick', style: 'background:' + (KICK[k] || '#495057') }, k);
  const heat = (n) => h('span', { class: 'xp-heat', 'aria-label': '몰입도 ' + n + '/5' }, '●'.repeat(n), h('i', null, '●'.repeat(5 - n)));

  const zoom = (src, alt) => {
    const box = h('div', { class: 'xp-box', role: 'dialog', 'aria-label': alt, onclick: (e) => { if (e.target === box) close(); } },
      h('img', { src, alt }), h('button', { type: 'button', onclick: () => close() }, '닫기'));
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { box.remove(); removeEventListener('keydown', esc); };
    addEventListener('keydown', esc);
    document.body.append(box);
  };

  const SVGNS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, ...kids) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    kids.forEach((c) => el.append(c.nodeType ? c : document.createTextNode(String(c))));
    return el;
  };

  // 감정 곡선: 장면마다 몰입도(1~5) 점, 누르면 해당 장면으로 이동
  const curve = (moments, jump) => {
    const W = 760, H = 210, L = 34, R = 16, T = 18, B = 62;
    const step = (W - L - R) / Math.max(1, moments.length - 1);
    const x = (i) => L + i * step, y = (v) => T + (5 - v) * (H - T - B) / 4;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '장면별 몰입도 곡선' });
    for (let v = 1; v <= 5; v++) {
      svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), style: 'stroke:var(--line);stroke-width:1' }));
      svg.append(s('text', { x: L - 10, y: y(v) + 4, 'text-anchor': 'end', style: 'fill:var(--muted);font:11px var(--f-mono)' }, v));
    }
    const pts = moments.map((m, i) => [x(i), y(m.heat)]);
    const d = pts.map((p, i) => {
      if (!i) return 'M' + p.join(',');
      const q = pts[i - 1], cx = (q[0] + p[0]) / 2;
      return `C${cx},${q[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
    }).join(' ');
    svg.append(s('path', { d: d + ` L${pts[pts.length - 1][0]},${y(1) + 8} L${pts[0][0]},${y(1) + 8} Z`, style: 'fill:var(--accent-soft);stroke:none' }));
    svg.append(s('path', { d, style: 'fill:none;stroke:var(--accent);stroke-width:2.5' }));
    // 날이 바뀌는 곳에 세로 구분선과 "n일 차" 표시
    moments.forEach((m, i) => {
      if (!m.day || (i && moments[i - 1].day === m.day)) return;
      const dx = i ? (pts[i - 1][0] + pts[i][0]) / 2 : L;
      if (i) svg.append(s('line', { x1: dx, x2: dx, y1: T - 8, y2: H - B + 4, style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:4 3' }));
      svg.append(s('text', { x: dx + 6, y: T - 4, style: 'fill:var(--muted);font:600 11px var(--f-mono)' }, m.day + '일 차'));
    });
    moments.forEach((m, i) => {
      const g = s('g', { class: 'dot', tabindex: '0', role: 'button', 'aria-label': `${i + 1}. ${m.title}, 몰입도 ${m.heat}`, onclick: () => jump(i), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(i); } } },
        s('circle', { cx: pts[i][0], cy: pts[i][1], r: 7, style: `fill:${KICK[m.kick] || '#495057'};stroke:var(--surface);stroke-width:2;${m.status === 'inferred' ? 'stroke-dasharray:3 2;' : ''}` }),
        s('text', { x: pts[i][0], y: H - B + 18, 'text-anchor': 'middle', style: 'fill:var(--fg);font:600 11px var(--f-mono)' }, i + 1),
        s('text', { x: pts[i][0], y: H - B + 34, 'text-anchor': 'middle', style: 'fill:var(--muted);font:11px var(--f-sans, sans-serif)' }, m.kick));
      g.append(s('title', null, m.title));
      svg.append(g);
    });
    return h('div', { class: 'xp-curve' }, svg);
  };

  window.Experience = (parent, BASE, X) => {
    const cards = [];
    const jump = (i) => {
      const el = cards[i]; if (!el) return;
      el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      cards.forEach((c) => c.classList.remove('hot')); el.classList.add('hot');
    };
    const moment = (m, i) => {
      const pic = m.image
        ? h('button', { class: 'pic', type: 'button', 'aria-label': m.title + ' 화면 크게 보기', onclick: () => zoom(BASE + m.image, m.title) }, h('img', { src: BASE + m.image, alt: m.title, loading: 'lazy' }))
        : h('div', { class: 'nopic' }, '이번 플레이에서 못 본 장면이에요');
      const card = h('article', { class: 'xp-m', id: 'xp-' + m.id }, pic,
        h('div', { class: 'body' },
          h('div', { class: 'top' }, (m.day ? m.day + '일 차 · ' : '') + '장면 ' + (i + 1), kick(m.kick), heat(m.heat), stTag(m.status)),
          h('h4', null, m.title),
          h('p', { class: 'did' }, m.did),
          h('blockquote', null, m.felt),
          h('p', { class: 'why' }, h('b', null, '왜 이렇게 짰나'), m.why)));
      cards.push(card);
      return card;
    };
    const ev = (list) => (list && list.length ? list.map((e) => e.replace(/^ui\/session\//, '')).join(', ') : '');
    const wrap = h('div', { class: 'xp' },
      h('p', { class: 'xp-persona' }, '이 기록의 나: ' + X.persona),
      h('p', { class: 'xp-verdict' }, X.verdict),
      h('div', { class: 'xp-sub' },
        h('h3', null, '빠져드는 순서'),
        h('p', null, '실제로 플레이한 순서예요. 점이 높을수록 손을 떼기 어려운 순간이에요. 점을 누르면 그 장면으로 가요. 점선 테두리는 이번에 직접 보지 못한 장면이에요.'),
        curve(X.moments, jump),
        h('div', { class: 'xp-moments' }, X.moments.map(moment))),
      h('div', { class: 'xp-sub' },
        h('h3', null, X.loop.name),
        h('p', null, '이 고리 하나가 계속 반복돼요. 마지막 칸이 다시 첫 칸을 불러요.'),
        h('div', { class: 'xp-loop' }, X.loop.steps.map((p) => h('div', null, h('b', null, p.k), h('span', null, p.t)))),
        h('div', { class: 'xp-scales' }, X.timescales.map((t) => h('div', null, h('b', null, t.scale, ' ', t.status ? stTag(t.status) : null), h('span', null, t.what))))),
      h('div', { class: 'xp-sub' },
        h('h3', null, '도파민이 터지는 곳'),
        h('div', { class: 'xp-cards' }, X.dopamine.map((d) => h('article', null,
          h('h4', null, d.name, stTag(d.status)), h('span', { class: 'tr' }, d.trigger), h('p', null, d.why), h('span', { class: 'src' }, ev(d.evidence)))))),
      h('div', { class: 'xp-sub' },
        h('h3', null, '식는 곳'),
        h('p', null, '애호가로서 아쉬웠거나, 오래 하면 떨어져 나갈 것 같은 지점이에요.'),
        h('div', { class: 'xp-cards cool' }, X.cooldown.map((d) => h('article', null,
          h('h4', null, d.what, stTag(d.status)), h('p', null, d.why), h('span', { class: 'src' }, ev(d.evidence)))))),
      h('div', { class: 'xp-sub' },
        h('h3', null, '가져갈 문법'),
        h('p', null, '이 경험을 만드는 구성 규칙이에요. 다른 작품에 그대로 옮겨 쓸 수 있어요.'),
        h('div', { class: 'xp-scroll' }, h('table', { class: 'xp-syn' },
          h('thead', null, h('tr', null, h('th', null, '요소'), h('th', null, '여기서는'), h('th', null, '옮겨 쓰면'))),
          h('tbody', null, X.syntax.map((r) => h('tr', null, h('td', null, r.element), h('td', null, r.rule), h('td', null, r.reuse))))))),
      h('div', { class: 'xp-sub' },
        h('h3', null, '더 해 봐야 아는 것'),
        h('ul', { class: 'xp-todo' }, X.not_played.map((t) => h('li', null, t)))));
    parent.append(wrap);
  };
})();
