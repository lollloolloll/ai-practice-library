/* 실사용 스토리보드: 큰 캡처 한 장 + 번호 설명, 좌우로 넘겨요.
   사용: Storyboard(부모 요소, '../analyses/<대상>/', storyboard.json 객체) */
(() => {
  const css = `
.sb { display: grid; gap: 12px; min-width: 0; }
.sb-main { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.sb-stage { position: relative; border-radius: 12px; overflow: hidden; background: var(--surface-2); border: 1px solid var(--line); }
.sb-stage img { display: block; width: 100%; height: auto; cursor: zoom-in; }
.sb-stage.tall { max-width: 360px; margin: 0 auto; }
.sb-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 999px; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 20px; cursor: pointer; display: grid; place-items: center; }
.sb-nav:disabled { opacity: .25; cursor: default; }
.sb-nav.prev { left: 10px; } .sb-nav.next { right: 10px; }
.sb-side { display: grid; gap: 10px; align-content: start; min-width: 0; }
.sb-count { font: 500 12px var(--f-mono); color: var(--muted); }
.sb-side h3 { margin: 0; font-size: 19px; }
.sb-side p { margin: 0; font-size: 14.5px; line-height: 1.7; }
.sb-marks { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.sb-marks li { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 8px; font-size: 13.5px; line-height: 1.55; align-items: start; }
.sb-marks i { font-style: normal; width: 22px; height: 22px; border-radius: 999px; background: #ff3b30; color: #fff; font: 700 12px/22px var(--f-mono); text-align: center; }
.sb-toggle { justify-self: start; font-size: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.sb-strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.sb-strip button { flex: 0 0 auto; width: 92px; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; background: var(--surface-2); cursor: pointer; opacity: .6; }
.sb-strip button[aria-current="true"] { border-color: var(--accent); opacity: 1; }
.sb-strip img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
.sb-strip span { display: block; font: 500 10px var(--f-mono); color: var(--muted); padding: 2px 0; text-align: center; }
.sb-box { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.88); display: grid; place-items: center; padding: 16px; }
.sb-box img { max-width: 100%; max-height: calc(100vh - 32px); border-radius: 8px; }
@media (max-width: 900px) { .sb-main { grid-template-columns: minmax(0, 1fr); } .sb-nav { width: 34px; height: 34px; font-size: 17px; } }
`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.append(st);

  window.Storyboard = (root, base, sb) => {
    const S = sb.scenes;
    let i = 0, marked = true;
    const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
    const wrap = el('div', 'sb');
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-roledescription', '슬라이드');
    const main = el('div', 'sb-main');
    const stage = el('div', 'sb-stage');
    const img = el('img');
    const prev = el('button', 'sb-nav prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', '이전 장면');
    const next = el('button', 'sb-nav next', '›'); next.type = 'button'; next.setAttribute('aria-label', '다음 장면');
    stage.append(img, prev, next);
    const side = el('div', 'sb-side');
    const count = el('span', 'sb-count'), h3 = el('h3'), cap = el('p'), list = el('ol', 'sb-marks');
    const tog = el('button', 'sb-toggle', '표시 끄기'); tog.type = 'button';
    side.append(count, h3, cap, list, tog);
    main.append(stage, side);
    const strip = el('div', 'sb-strip');
    const thumbs = S.map((s, k) => {
      const b = el('button'); b.type = 'button'; b.setAttribute('aria-label', s.n + '. ' + s.title);
      const t = el('img'); t.src = base + (s.thumb || s.annotated); t.alt = '';
      b.append(t, el('span', null, String(s.n).padStart(2, '0')));
      b.onclick = () => go(k);
      strip.append(b);
      return b;
    });
    wrap.append(main, strip);
    root.append(wrap);

    const src = () => base + (marked ? S[i].annotated : S[i].image);
    function go(k) {
      i = Math.max(0, Math.min(S.length - 1, k));
      const s = S[i];
      img.src = src();
      img.alt = s.title;
      stage.classList.toggle('tall', /mobile/.test(s.id));
      count.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(S.length).padStart(2, '0');
      h3.textContent = s.title;
      cap.textContent = s.caption;
      list.textContent = '';
      s.marks.forEach((m) => { const li = el('li'); li.append(el('i', null, m.n), el('span', null, m.label)); list.append(li); });
      prev.disabled = i === 0;
      next.disabled = i === S.length - 1;
      thumbs.forEach((b, k2) => b.setAttribute('aria-current', String(k2 === i)));
      thumbs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (S[i + 1]) new Image().src = base + S[i + 1].annotated;
    }
    prev.onclick = () => go(i - 1);
    next.onclick = () => go(i + 1);
    tog.onclick = () => { marked = !marked; tog.textContent = marked ? '표시 끄기' : '표시 켜기'; img.src = src(); };
    img.onclick = () => {
      const box = el('div', 'sb-box'); const big = el('img'); big.src = src(); big.alt = S[i].title;
      box.append(big); box.onclick = () => box.remove(); document.body.append(box);
    };
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { go(i - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { go(i + 1); e.preventDefault(); }
    });
    let x0 = null;
    stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
    });
    go(0);
  };
})();
