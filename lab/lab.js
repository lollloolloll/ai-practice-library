/* 분해실: 작품을 순서(sequence)와 문법(syntax)으로 뜯어보고, 고른 문법으로 조립 주문서를 만들어요.
   작품 추가: WORKS에 한 줄 넣고 analyses/<id>/experience.json을 두면 돼요. */
(() => {
  const WORKS = [
    { id: 'habitica', name: 'Habitica', kind: '습관 앱 · 할 일을 RPG로', src: '../analyses/habitica/', old: '../cases/habitica.html',
      remix: { name: '오늘의 퀘스트', href: '../cases/remix/habit.html', say: 'Habitica의 문법만 가져와 만든 작은 습관 앱이에요.' } },
    { id: 'crack', name: '크랙', kind: 'AI 이야기 채팅 · 세계가 반응하는 웹소설', src: '../analyses/crack/', old: '../cases/crack.html',
      remix: { name: '판 깔기', href: '../cases/remix/story.html', say: '크랙의 문법으로 어느 챗봇에서나 판을 까는 프롬프트 생성기예요.' } },
    { id: 'polish', name: '이 사이트의 마감', kind: '웹사이트 · 상용 서비스처럼 다듬기', old: '../cases/lexicon-polish.html',
      data: {
        verdict: '마감의 쾌감은 "막히는 곳이 없다"예요. 기능은 금방 만들지만, 믿을 만하다는 느낌은 거친 가장자리 19곳을 하나씩 깎아야 생겨요.',
        persona: '사용자가 아니라 만든 사람 쪽 기록이에요. 처음 온 사람처럼 직접 눌러 보며 찾은 19곳의 전과 후를 사진으로 남겼어요.',
        moments: [], dopamine: [], cooldown: [], not_played: ['실제 휴대폰에서 접히는 헤더와 누름 영역 확인'],
        syntax: [
          { element: '막다른 길이 없다', rule: '없는 주소, 없는 용어, 404, 멈춘 로딩 어디서든 다음에 갈 곳을 보여 줘요.', reuse: '빈 화면과 오류 화면마다 "그럼 여기로" 버튼을 하나 이상 둬요.' },
          { element: '누른 자리에서 답한다', rule: '복사 버튼이 스스로 "복사했어요 ✓"로 바뀌어요.', reuse: '결과는 화면 구석 알림이 아니라 누른 버튼 자리에서 먼저 보여 줘요.' },
          { element: '거짓말하지 않는다', rule: '복사가 실패하면 실패했다고 말하고 대신 할 방법을 알려 줘요.', reuse: '성공 문구는 결과를 확인한 뒤에만 띄워요.' },
          { element: '돌아오면 그대로다', rule: '뒤로 가면 보던 자리, 탭 제목은 보던 화면 이름이에요.', reuse: '스크롤 위치, 고른 필터, 쓰던 글을 기억해서 다시 찾지 않게 해요.' },
          { element: '손과 상황에 맞춘다', rule: '손가락엔 44px, 휴대폰에선 접히는 헤더, 키보드엔 / 키.', reuse: '터치·키보드·느린 회선에서 각각 한 번씩 같은 길을 가 봐요.' },
        ],
      } },
  ];
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    if (typeof attrs === 'string') e.className = attrs; else if (attrs) for (const k in attrs) { if (k === 'on') for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]); else if (k in e && k !== 'list') e[k] = attrs[k]; else e.setAttribute(k, attrs[k]); }
    kids.flat().forEach((k) => k != null && k !== false && e.append(k.nodeType ? k : document.createTextNode(k)));
    return e;
  };
  const svg = (tag, attrs, ...kids) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); kids.flat().forEach((k) => k != null && e.append(k.nodeType ? k : document.createTextNode(k))); return e; };
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  let toastT; const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); };

  // 데이터
  const cache = {};
  async function load(w) {
    if (cache[w.id]) return cache[w.id];
    let d = w.data;
    if (!d) { const r = await fetch(w.src + 'experience.json'); if (!r.ok) throw new Error(r.status); d = await r.json(); }
    d.moments = d.moments || []; d.syntax = d.syntax || [];
    d.syntax.forEach((s, i) => { s.key = w.id + ':' + i; s.work = w.name; s.wid = w.id; });
    return (cache[w.id] = d);
  }
  const loadAll = () => Promise.all(WORKS.map((w) => load(w).catch(() => null)));

  // 고른 문법
  let picks = store.get('lab-picks', []);
  const isOn = (k) => picks.includes(k);
  function toggle(k) { picks = isOn(k) ? picks.filter((x) => x !== k) : [...picks, k]; store.set('lab-picks', picks); badge(); }
  function badge() { const b = $('#pickN'); b.hidden = !picks.length; b.textContent = picks.length; }

  // 몰입 곡선
  function path(pts) {
    if (pts.length < 2) return '';
    let d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2; d += ' C' + mx + ',' + y0 + ' ' + mx + ',' + y1 + ' ' + x1 + ',' + y1; }
    return d;
  }
  function spark(moments) {
    const W = 300, H = 56, n = moments.length; if (n < 2) return el('small', null, '사진으로 남긴 전후 기록');
    const pts = moments.map((m, i) => [8 + (i * (W - 16)) / (n - 1), H - 8 - ((m.heat - 1) / 4) * (H - 18)]);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': '몰입 곡선' },
      svg('path', { d: path(pts), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke' }),
      pts.map((p, i) => moments[i].heat >= 5 ? svg('circle', { cx: p[0], cy: p[1], r: 3.5, fill: 'var(--hot)' }) : null));
    return s;
  }
  function curve(moments, cur, onPick) {
    const n = moments.length, step = Math.max(92, Math.min(120, 1000 / n)), W = Math.max(640, 120 + step * (n - 1)), H = 230, top = 28, bot = 150;
    const X = (i) => 60 + i * ((W - 120) / Math.max(1, n - 1)), Y = (h) => bot - ((h - 1) / 4) * (bot - top);
    const pts = moments.map((m, i) => [X(i), Y(m.heat)]);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': '몰입 곡선. 점을 누르면 그 장면을 보여 줘요.' });
    [1, 3, 5].forEach((h) => s.append(svg('line', { x1: 36, x2: W - 20, y1: Y(h), y2: Y(h), stroke: 'var(--line)', 'stroke-dasharray': '2 5' }), svg('text', { x: 12, y: Y(h) + 4, class: 'lbl' }, h === 5 ? '뜨거움' : h === 1 ? '식음' : '')));
    moments.forEach((m, i) => { if (i && m.day && m.day !== moments[i - 1].day) { const x = (X(i) + X(i - 1)) / 2; s.append(svg('line', { x1: x, x2: x, y1: 10, y2: H - 8, stroke: 'var(--ink)', 'stroke-width': 1 }), svg('text', { x: x + 6, y: 20, class: 'lbl' }, m.day + '일째 →')); } });
    s.append(svg('path', { d: path(pts) + ` L${pts[n - 1][0]},${bot + 8} L${pts[0][0]},${bot + 8} Z`, fill: 'var(--hot-soft)', opacity: .55 }), svg('path', { d: path(pts), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2 }));
    moments.forEach((m, i) => {
      const on = i === cur, hot = m.heat >= 4, t = m.title.length > 9 ? m.title.slice(0, 8) + '…' : m.title;
      const g = svg('g', { class: 'dot', tabindex: 0, role: 'button', 'aria-label': `${i + 1}. ${m.title}, 몰입 ${m.heat}/5`, 'aria-current': on },
        svg('circle', { cx: pts[i][0], cy: pts[i][1], r: 22, fill: 'transparent' }),
        svg('circle', { cx: pts[i][0], cy: pts[i][1], r: on ? 9 : 5.5, fill: on || hot ? 'var(--hot)' : 'var(--card)', stroke: on ? 'var(--ink)' : hot ? 'var(--hot)' : 'var(--ink)', 'stroke-width': on ? 2.5 : 1.8 }),
        svg('text', { x: pts[i][0], y: bot + 30 + (i % 2) * 16, 'text-anchor': 'middle', class: 'lbl' }, t));
      g.addEventListener('click', () => onPick(i)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i); } });
      s.append(g);
    });
    return s;
  }

  const firstSentence = (t) => (t.match(/^.*?[.!?]["”]?(?=\s|$)/) || [t])[0];
  function marked(t) { const out = [], re = /"([^"]+)"/; const m = t.match(re); if (!m) return [t]; out.push(t.slice(0, m.index), el('b', null, '"' + m[1] + '"'), t.slice(m.index + m[0].length)); return out; }
  const secH = (n, title, sub) => el('div', 'sec-h', el('span', 'n', n), el('h2', null, title), sub ? el('p', null, sub) : null);
  function ruleCard(s, rerender) {
    const on = isOn(s.key);
    return el('article', 'rule' + (on ? ' on' : ''), el('span', 'src', s.work), el('h4', null, s.element), el('p', 'was', s.rule), el('p', 'use', s.reuse),
      el('button', { type: 'button', 'aria-pressed': String(on), on: { click: () => { toggle(s.key); toast(isOn(s.key) ? '조립대에 담았어요' : '조립대에서 뺐어요'); rerender(); } } }, on ? '✓ 담았어요' : '+ 조립대에 담기'));
  }
  function zoom(src, alt) { const z = $('#zoom'); z.querySelector('img').src = src; z.querySelector('img').alt = alt; z.showModal(); }
  $('#zoom').addEventListener('click', () => $('#zoom').close());

  // 화면: 처음
  async function home() {
    document.title = '분해실 · 잘 만든 것을 뜯어보고 다시 만들기';
    const all = await loadAll();
    const total = all.reduce((a, d) => a + (d ? d.syntax.length : 0), 0);
    app.replaceChildren(
      el('section', 'hero',
        el('span', 'tag', 'syntax × sequence'),
        el('h1', null, '잘 만든 것은 ', el('em', null, '왜'), ' 손에서 안 놓일까요'),
        el('p', null, '기능 목록으로는 안 보여요. 직접 사용자가 되어 겪은 순서를 적고, 그 안에서 되풀이되는 문법을 뽑아요. 그리고 그 문법으로 내 것을 만들어요.'),
        el('div', 'flow', el('div', null, el('b', null, '① 겪기'), el('span', null, '어디서 뜨거워지고 식는지')), el('div', null, el('b', null, '② 뜯기'), el('span', null, '다시 쓸 수 있는 규칙으로')), el('div', null, el('b', null, '③ 다시 만들기'), el('span', null, '고른 규칙으로 조립')))),
      el('section', 'sec', secH('01', '뜯어본 작품', `작품 ${WORKS.length}개 · 문법 ${total}개`),
        el('div', 'works', WORKS.map((w, i) => { const d = all[i]; if (!d) return null;
          return el('a', { class: 'work', href: '#/w/' + w.id }, el('span', 'no', String(i + 1).padStart(2, '0')),
            el('div', null, el('span', 'kind', w.kind), el('h3', null, w.name), el('p', 'say', firstSentence(d.verdict))),
            el('div', 'sig', spark(d.moments), d.moments.length ? el('small', null, `장면 ${d.moments.length}개의 몰입 곡선`) : null),
            el('span', 'go', `문법 ${d.syntax.length}개 →`)); }))),
      el('section', 'sec', secH('02', '다음 단계'),
        el('div', 'jump', el('a', { class: 'btn', href: '#/grammar' }, '문법 모음 보기'), el('a', { class: 'btn hot', href: '#/bench' }, '조립대에서 만들기'))));
  }

  // 화면: 작품
  async function work(id) {
    const w = WORKS.find((x) => x.id === id); if (!w) return lost();
    const d = await load(w); document.title = w.name + ' · 분해실';
    const M = d.moments; let cur = Math.min(store.get('lab-at-' + id, 0), Math.max(0, M.length - 1));
    const score = el('div', 'score'), rules = el('div', 'rules');
    const drawRules = () => rules.replaceChildren(...d.syntax.map((s) => ruleCard(s, drawRules)));
    function drawScore(focus) {
      const m = M[cur], src = w.src + m.image;
      const go = (i) => { cur = Math.max(0, Math.min(M.length - 1, i)); store.set('lab-at-' + id, cur); drawScore(true); };
      const c = el('div', 'curve', curve(M, cur, go));
      const st = el('div', 'stage',
        m.image ? el('button', { class: 'pic', type: 'button', 'aria-label': m.title + ' 화면 크게 보기', on: { click: () => zoom(src, m.title) } }, el('img', { src, alt: m.title + ' 화면', loading: 'lazy' })) : null,
        el('div', 'txt',
          el('div', 'meta', el('span', null, `${cur + 1} / ${M.length}`), m.day ? el('span', null, m.day + '일째') : null, el('span', 'kick', m.kick), el('span', { class: 'heat', 'aria-label': `몰입 ${m.heat}/5` }, '●'.repeat(m.heat), el('i', null, '●'.repeat(5 - m.heat)))),
          el('h3', null, m.title), el('p', 'did', m.did), el('blockquote', null, m.felt), el('p', 'why', el('b', null, '왜 통하나 '), m.why),
          m.status === 'inferred' ? el('span', 'infer', '직접 본 게 아니라 규칙에서 추론한 장면이에요') : null,
          el('div', 'pager', el('button', { type: 'button', 'aria-label': '이전 장면', disabled: cur === 0, on: { click: () => go(cur - 1) } }, '←'), el('button', { type: 'button', 'aria-label': '다음 장면', disabled: cur === M.length - 1, on: { click: () => go(cur + 1) } }, '→'), el('span', null, '← → 키로도 넘겨요'))));
      score.replaceChildren(c, st);
      const dot = c.querySelector('[aria-current="true"] circle'); if (dot) { const x = +dot.getAttribute('cx') / c.firstChild.viewBox.baseVal.width * c.scrollWidth; c.scrollLeft = x - c.clientWidth / 2; }
      if (focus) c.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
    }
    keyNav = M.length ? (e) => { if (e.target.closest?.('input,textarea')) return; if (e.key === 'ArrowRight' && cur < M.length - 1) { cur++; store.set('lab-at-' + id, cur); drawScore(); } if (e.key === 'ArrowLeft' && cur > 0) { cur--; store.set('lab-at-' + id, cur); drawScore(); } } : null;
    drawRules();
    app.replaceChildren(
      el('section', 'w-head', el('a', { class: 'back', href: '#/' }, '← 작품 목록'), el('span', 'tag', w.kind), el('h1', null, w.name), el('p', 'verdict', marked(d.verdict)), d.persona ? el('p', 'persona', '겪은 사람: ' + d.persona) : null,
        el('div', 'jump', el('a', { class: 'btn flat', href: '#/w/' + id + '/seq', on: { click: (e) => { e.preventDefault(); $('#seq').scrollIntoView(); } } }, '① 순서'), el('a', { class: 'btn flat', href: '#', on: { click: (e) => { e.preventDefault(); $('#syn').scrollIntoView(); } } }, '② 문법'), w.remix ? el('a', { class: 'btn flat', href: '#', on: { click: (e) => { e.preventDefault(); $('#rmx').scrollIntoView(); } } }, '③ 다시 만든 것') : null)),
      el('section', { class: 'sec', id: 'seq', style: 'scroll-margin-top:80px' }, secH('①', '순서', M.length ? '겪은 차례대로. 선이 높을수록 빠져든 순간이에요.' : null),
        M.length ? score : el('p', 'plain', '이 작품은 체험 순서 대신 고치기 전과 후를 사진 20장으로 남겼어요. ', el('a', { href: w.old }, '전후 사진 보기 →')),
        d.loop ? el('div', { style: 'margin-top:28px' }, el('p', 'tag', '되풀이되는 한 바퀴 · ' + d.loop.name), el('div', { class: 'loop', style: 'margin-top:8px' }, d.loop.steps.map((s) => el('div', null, el('b', null, s.k), el('span', null, s.t)))),
          d.timescales ? el('div', 'scales', d.timescales.map((t) => el('div', null, el('b', null, t.scale), t.what))) : null) : null),
      (d.dopamine?.length || d.cooldown?.length) ? el('section', 'sec', secH('', '뜨거운 곳과 식는 곳'), el('div', 'two',
        el('div', 'col', el('h3', null, el('i'), '빠져드는 지점'), el('ul', null, d.dopamine.map((x) => el('li', null, el('b', null, x.name), x.trigger + ' ', el('span', null, x.why))))),
        el('div', 'col cold', el('h3', null, el('i'), '식는 지점'), el('ul', null, d.cooldown.map((x) => el('li', null, el('b', null, x.what), el('span', null, x.why))))))) : null,
      el('section', { class: 'sec', id: 'syn', style: 'scroll-margin-top:80px' }, secH('②', '문법', '위쪽은 이 작품이 한 일, 아래쪽은 내 작품에 옮기는 법이에요.'), rules),
      w.remix ? el('section', { class: 'sec', id: 'rmx', style: 'scroll-margin-top:80px' }, secH('③', '다시 만든 것'), el('div', 'remix', el('div', null, el('h3', null, w.remix.name), el('p', null, w.remix.say)), el('a', { class: 'btn', href: w.remix.href, style: 'color:var(--ink)' }, '써 보기 →'))) : null,
      el('section', 'sec', secH('', '아직 안 해 본 것'), el('ul', 'left', (d.not_played || []).map((t) => el('li', null, t))), el('p', 'plain', el('a', { href: w.old }, '이전 형식의 분석 페이지 보기'))));
    if (M.length) drawScore();
  }

  // 화면: 문법 모음
  async function grammar() {
    document.title = '문법 모음 · 분해실';
    const all = (await loadAll()).filter(Boolean).flatMap((d) => d.syntax); let f = store.get('lab-gf', 'all');
    const chips = el('div', { class: 'chips', role: 'group', 'aria-label': '작품으로 거르기' }), rules = el('div', 'rules');
    function draw() {
      chips.replaceChildren(...[['all', '전체'], ...WORKS.map((w) => [w.id, w.name])].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(f === k), on: { click: () => { f = k; store.set('lab-gf', f); draw(); } } }, n)));
      rules.replaceChildren(...all.filter((s) => f === 'all' || s.wid === f).map((s) => ruleCard(s, draw)));
    }
    draw();
    app.replaceChildren(el('section', 'w-head', el('span', 'tag', 'syntax'), el('h1', null, '문법 모음'), el('p', 'verdict', `작품 ${WORKS.length}개에서 뽑은 규칙 ${all.length}개예요. 마음에 드는 걸 담아서 조립대로 가져가요.`)),
      el('section', 'sec', chips, rules, el('div', { class: 'jump', style: 'margin-top:28px' }, el('a', { class: 'btn hot', href: '#/bench' }, '조립대로 가기 →'))));
  }

  // 화면: 조립대
  async function bench() {
    document.title = '조립대 · 분해실';
    const all = (await loadAll()).filter(Boolean).flatMap((d) => d.syntax);
    let what = store.get('lab-what', '');
    const list = el('div'), pre = el('pre'), copyB = el('button', { class: 'btn', type: 'button' }, '복사');
    const mine = () => picks.map((k) => all.find((s) => s.key === k)).filter(Boolean);
    const build = () => { const P = mine(); if (!P.length) return '';
      return `[만들 것]\n${what.trim() || '(여기에 만들 것을 한 줄로 적어요)'}\n\n[지킬 문법 ${P.length}개]\n` + P.map((s, i) => `${i + 1}. ${s.element}\n   - 적용: ${s.reuse}\n   - 본보기(${s.work}): ${s.rule}`).join('\n') +
        `\n\n[순서]\n1. 먼저 사용자가 처음 1분 동안 겪는 장면을 차례로 적어 줘. 장면마다 어느 문법이 들어가는지 번호로 표시해 줘.\n2. 문법끼리 부딪치는 곳이 있으면 어느 쪽을 택했는지 한 줄로 말해 줘.\n3. 그다음에 만들어 줘.\n\n[스스로 점검]\n- 처음 1분 안에 보상이 한 번은 오는가\n- 끝났을 때 "다음에 할 일"이 하나 남는가\n- 위 문법 중 빠진 것이 없는가`; };
    function draw() {
      const P = mine();
      list.replaceChildren(P.length ? el('ul', 'picked', P.map((s) => el('li', null, el('div', null, s.element, el('small', null, s.work + ' · ' + s.reuse)), el('button', { type: 'button', 'aria-label': s.element + ' 빼기', on: { click: () => { toggle(s.key); draw(); } } }, '×'))))
        : el('div', 'empty', el('span', null, '아직 담은 문법이 없어요.'), el('a', { class: 'btn', href: '#/grammar' }, '문법 고르러 가기')));
      const t = build(); pre.textContent = t || '문법을 하나 이상 담으면 여기에 주문서가 만들어져요.'; copyB.disabled = !t;
    }
    copyB.addEventListener('click', async () => { let ok = false; try { await navigator.clipboard.writeText(pre.textContent); ok = true; } catch (e) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      if (ok) { const w = copyB.offsetWidth; copyB.style.minWidth = w + 'px'; copyB.textContent = '복사했어요 ✓'; setTimeout(() => { copyB.textContent = '복사'; }, 1600); } else toast('복사하지 못했어요. 글을 선택해 뒀으니 Ctrl+C를 눌러 주세요'); });
    const input = el('input', { id: 'what', type: 'text', value: what, placeholder: '예: 영어 단어 외우기 앱, 운동 기록 챗봇', autocomplete: 'off', on: { input: (e) => { what = e.target.value; store.set('lab-what', what); pre.textContent = build() || pre.textContent; } } });
    draw();
    app.replaceChildren(el('section', 'w-head', el('span', 'tag', 'remix'), el('h1', null, '조립대'), el('p', 'verdict', '만들 것을 적고 문법을 담으면, AI에게 그대로 건넬 주문서가 돼요.')),
      el('section', 'sec bench', el('div', null, el('div', 'field', el('label', { htmlFor: 'what' }, '무엇을 만드나요'), input, el('small', null, '한 줄이면 돼요. 이 기기에만 저장해요.')), el('p', 'tag', '담은 문법'), list, picks.length ? el('p', { style: 'margin-top:14px' }, el('a', { href: '#/grammar' }, '+ 더 담기')) : null),
        el('div', 'out', el('div', 'out-h', el('b', null, '주문서'), copyB), pre)));
  }

  function lost() { document.title = '없는 화면 · 분해실'; app.replaceChildren(el('section', 'w-head', el('span', 'tag', '404'), el('h1', null, '이 화면은 없어요'), el('p', 'verdict', '주소가 바뀌었거나 잘못 입력됐어요.'), el('div', 'jump', el('a', { class: 'btn hot', href: '#/' }, '작품 목록으로'), el('a', { class: 'btn', href: '#/grammar' }, '문법 모음')))); }

  let keyNav = null;
  document.addEventListener('keydown', (e) => keyNav && keyNav(e));
  async function route() {
    const h = location.hash.replace(/^#\/?/, ''), [a, b] = h.split('/'); keyNav = null;
    document.querySelectorAll('[data-nav]').forEach((n) => { const on = (n.dataset.nav === 'home' && (!a || a === 'w')) || n.dataset.nav === a; on ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current'); });
    try { if (!a) await home(); else if (a === 'w') await work(b); else if (a === 'grammar') await grammar(); else if (a === 'bench') await bench(); else lost(); }
    catch (e) { console.error(e); app.replaceChildren(el('section', 'w-head', el('h1', null, '불러오지 못했어요'), el('p', 'verdict', '잠시 뒤 새로고침해 주세요. 파일을 직접 열었다면 서버로 열어야 해요.'), el('div', 'jump', el('button', { class: 'btn hot', type: 'button', on: { click: () => location.reload() } }, '새로고침')))); }
    scrollTo(0, 0);
  }
  addEventListener('hashchange', route); badge(); route();
})();
