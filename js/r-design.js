/* r-design.js — design renderer (classic script, ES2020)
 * Each term = a style recipe that edits a shared spec (palette, fonts, layout, deco, surface, fx, illus, frame).
 * Recipes run in order; later ones override earlier ones per slot, fx accumulate.
 * Every variant is drawn as HTML/CSS/SVG inside its own Shadow DOM and scaled to the tile.
 */
(function () {
  'use strict';
  var PD = window.PD = window.PD || {};

  /* ------------------------------------------------------------------ fonts */
  var FAMILIES = [
    'Archivo:wght@400;600;800;900', 'Archivo+Black',
    'Bodoni+Moda:ital,wght@0,400;0,700;0,900;1,400;1,700',
    'Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700',
    'DM+Serif+Display:ital@0;1', 'Space+Mono:wght@400;700', 'IBM+Plex+Mono:wght@400;600',
    'Syne:wght@400;700;800', 'Unbounded:wght@400;700;900', 'Rubik+Mono+One', 'Bebas+Neue',
    'Abril+Fatface', 'Righteous', 'Monoton', 'Pacifico', 'Caveat:wght@400;700',
    'Josefin+Sans:wght@300;400;600;700', 'Poiret+One', 'Limelight',
    'Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600',
    'Work+Sans:wght@300;400;500;600;800', 'Manrope:wght@400;600;800',
    'Fraunces:ital,wght@0,400;0,600;0,900;1,400;1,600', 'Libre+Franklin:wght@400;600;800',
    'Big+Shoulders+Display:wght@700;900', 'Noto+Sans+KR:wght@400;700;900', 'Black+Han+Sans',
    'Gowun+Batang:wght@400;700', 'Fira+Sans:wght@400;600;800', 'Alfa+Slab+One',
    'Zilla+Slab:wght@500;700', 'UnifrakturMaguntia', 'Fredoka:wght@400;600;700',
    'Press+Start+2P', 'VT323', 'Shrikhand', 'Bungee', 'DM+Sans:wght@400;500;700'
  ];
  var FONT_URL = 'https://fonts.googleapis.com/css2?' + FAMILIES.map(function (f) { return 'family=' + f; }).join('&') + '&display=swap';
  function injectFonts() {
    if (document.getElementById('pd-design-fonts')) return;
    var l = document.createElement('link');
    l.id = 'pd-design-fonts'; l.rel = 'stylesheet'; l.href = FONT_URL;
    document.head.appendChild(l);
  }

  var F = {
    sys: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    arial: "Arial,Helvetica,sans-serif",
    times: "'Times New Roman',Times,serif",
    courier: "'Courier New',Courier,monospace",
    archivo: "'Archivo','Helvetica Neue',Arial,sans-serif",
    archivoBlack: "'Archivo Black','Arial Black',sans-serif",
    bodoni: "'Bodoni Moda','Didot','Bodoni 72',serif",
    playfair: "'Playfair Display',Georgia,serif",
    dmserif: "'DM Serif Display',Georgia,serif",
    spacemono: "'Space Mono','Courier New',monospace",
    plexmono: "'IBM Plex Mono',Menlo,Consolas,monospace",
    syne: "'Syne','Trebuchet MS',sans-serif",
    unbounded: "'Unbounded','Arial Black',sans-serif",
    rubikmono: "'Rubik Mono One','Arial Black',sans-serif",
    bebas: "'Bebas Neue',Impact,'Arial Narrow',sans-serif",
    abril: "'Abril Fatface','Didot',Georgia,serif",
    righteous: "'Righteous','Trebuchet MS',sans-serif",
    monoton: "'Monoton',Impact,sans-serif",
    pacifico: "'Pacifico','Brush Script MT',cursive",
    caveat: "'Caveat','Comic Sans MS',cursive",
    josefin: "'Josefin Sans',Futura,'Century Gothic',sans-serif",
    poiret: "'Poiret One','Century Gothic',sans-serif",
    limelight: "'Limelight','Didot',serif",
    cormorant: "'Cormorant Garamond',Garamond,Georgia,serif",
    work: "'Work Sans','Helvetica Neue',Arial,sans-serif",
    manrope: "'Manrope','Helvetica Neue',Arial,sans-serif",
    fraunces: "'Fraunces',Georgia,serif",
    franklin: "'Libre Franklin','Franklin Gothic Medium',Arial,sans-serif",
    bigshoulders: "'Big Shoulders Display',Impact,sans-serif",
    notokr: "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    blackhan: "'Black Han Sans','Noto Sans KR','Malgun Gothic',sans-serif",
    gowun: "'Gowun Batang','Nanum Myeongjo',serif",
    fira: "'Fira Sans','Segoe UI',sans-serif",
    alfa: "'Alfa Slab One',Rockwell,serif",
    zilla: "'Zilla Slab',Rockwell,serif",
    fraktur: "'UnifrakturMaguntia','Old English Text MT',serif",
    fredoka: "'Fredoka','Nunito','Arial Rounded MT Bold',sans-serif",
    pixel: "'Press Start 2P','VT323','Courier New',monospace",
    vt: "'VT323','Courier New',monospace",
    shrikhand: "'Shrikhand','Cooper Black',serif",
    bungee: "'Bungee',Impact,sans-serif",
    dmsans: "'DM Sans','Helvetica Neue',Arial,sans-serif",
    geist: "'Geist','DM Sans','Segoe UI',system-ui,sans-serif"
  };

  /* ---------------------------------------------------------------- utils */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function f1(n) { return Math.round(n * 10) / 10; }
  function svgWrap(vb, inner, cls, style, par) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (par ? ' preserveAspectRatio="' + par + '"' : '') +
      ' class="' + (cls || '') + '"' + (style ? ' style="' + style + '"' : '') + '>' + inner + '</svg>';
  }
  function has(s, fx) { return s.fx.indexOf(fx) >= 0; }

  /* ----------------------------------------------------------- base specs */
  var BASE = {
    poster: { pal: { bg: '#f3f1ec', fg: '#1b1b1b', mut: '#6a6a6a', a: '#1b1b1b', b: '#8c8c8c', c: '#d9d5cc' }, hf: F.sys, hw: 700, bf: F.sys },
    logo: { pal: { bg: '#fafafa', fg: '#262626', mut: '#8a8a8a', a: '#262626', b: '#9a9a9a', c: '#e4e4e4' }, hf: F.sys, hw: 600, bf: F.sys },
    landing: { pal: { bg: '#ffffff', fg: '#111111', mut: '#555555', a: '#0000ee', b: '#efefef', c: '#f4f4f4' }, hf: F.arial, hw: 700, bf: F.arial },
    'package': { pal: { bg: '#ffffff', fg: '#2a2a2a', mut: '#8a8a8a', a: '#2a2a2a', b: '#a8a8a8', c: '#ececec', st: '#e4e2de' }, hf: F.sys, hw: 600, bf: F.sys }
  };
  function baseSpec(primary) {
    var b = BASE[primary] || BASE.poster;
    return {
      primary: primary, pal: Object.assign({}, b.pal),
      hf: b.hf, hw: b.hw, hst: 'normal', htt: 'none', hls: '0em', hlh: 1.05, hsc: 1, bf: b.bf,
      rad: 0, layout: null, deco: null, surface: null, fx: [], illus: null, frame: null, photo: null,
      bg: null, css: [], ko: false, place: null, theme: null, comps: {}, focus: null, copy: null,
      logo: null, pkg: null, app: null, anim: false, applied: 0, fontSet: false, palSet: false,
      modal: false, toast: false, sticky: false, a11y: false, iconMode: null, iconStroke: null
    };
  }
  function vars(s) {
    var p = s.pal;
    return '--kbg:' + p.bg + ';--kfg:' + p.fg + ';--kmut:' + (p.mut || p.fg) + ';--ka:' + p.a + ';--kb:' + p.b + ';--kc:' + p.c +
      ';--kst:' + (p.st || '#e4e2de') + ';--ksurf:' + (p.surf || '#ffffff') + ';--hf:' + s.hf + ';--hw:' + s.hw + ';--hst:' + s.hst +
      ';--htt:' + s.htt + ';--hls:' + s.hls + ';--hlh:' + s.hlh + ';--hsc:' + s.hsc + ';--bf:' + s.bf + ';--rad:' + s.rad + 'px;--kline:' + (p.line || 'rgba(0,0,0,.1)') + ';--kon:' + (p.on || '#ffffff') + ';--pbf:' + s.bf +
      ';--zhf:' + (s.fontSet ? s.hf : F.manrope) + ';--zbf:' + (s.fontSet ? s.bf : F.manrope) + ';' +
      (s.bg ? 'background:' + s.bg + ';' : '');
  }

  /* --------------------------------------------------------- shared defs */
  var DEFS = '<defs>' +
    '<filter id="wob" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>' +
    '<filter id="stk" x="-25%" y="-25%" width="150%" height="155%"><feMorphology in="SourceAlpha" operator="dilate" radius="7" result="d"/><feFlood flood-color="#ffffff" result="wf"/><feComposite in="wf" in2="d" operator="in" result="w"/><feGaussianBlur in="d" stdDeviation="4" result="b"/><feOffset in="b" dy="5" result="o"/><feFlood flood-color="#000000" flood-opacity=".3" result="sf"/><feComposite in="sf" in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<filter id="clay" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="7" result="b"/><feDiffuseLighting in="b" surfaceScale="5" diffuseConstant="1.15" lighting-color="#ffffff" result="dif"><feDistantLight azimuth="235" elevation="52"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="dif" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/><feSpecularLighting in="b" surfaceScale="5" specularConstant=".7" specularExponent="22" lighting-color="#ffffff" result="spec"><feDistantLight azimuth="235" elevation="58"/></feSpecularLighting><feComposite in="spec" in2="SourceAlpha" operator="in" result="sp2"/><feComposite in="lit" in2="sp2" operator="arithmetic" k1="0" k2="1" k3=".8" k4="0" result="c1"/><feComposite in="c1" in2="SourceAlpha" operator="in" result="c2"/><feGaussianBlur in="SourceAlpha" stdDeviation="6" result="s0"/><feOffset in="s0" dy="10" result="s1"/><feComponentTransfer in="s1" result="s2"><feFuncA type="linear" slope=".28"/></feComponentTransfer><feMerge><feMergeNode in="s2"/><feMergeNode in="c2"/></feMerge></filter>' +
    '<filter id="px" x="0" y="0"><feFlood x="3" y="3" height="2" width="2"/><feComposite width="8" height="8"/><feTile result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/><feMorphology operator="dilate" radius="4"/></filter>' +
    '<filter id="pcs" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2.6" flood-color="#000000" flood-opacity=".35"/></filter>' +
    '<filter id="blr" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>' +
    '<linearGradient id="ghi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".18"/></linearGradient>' +
    '<linearGradient id="gfoil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5c1e"/><stop offset=".3" stop-color="#f7e7a1"/><stop offset=".5" stop-color="#b8892c"/><stop offset=".7" stop-color="#fff4c4"/><stop offset="1" stop-color="#8c6a24"/></linearGradient>' +
    '<linearGradient id="gholo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3d9"/><stop offset=".25" stop-color="#b3e5ff"/><stop offset=".5" stop-color="#d4ffb3"/><stop offset=".75" stop-color="#fff3b3"/><stop offset="1" stop-color="#e0b3ff"/></linearGradient>' +
    '<linearGradient id="gchrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#9aa6b8"/><stop offset=".5" stop-color="#3d4656"/><stop offset=".75" stop-color="#d9e2ee"/><stop offset="1" stop-color="#ffffff"/></linearGradient>' +
    '</defs>';

  /* ------------------------------------------------- illustration subjects
   * prim: ['p',d,role] fill path | ['s',d,role,w] stroke | ['c',cx,cy,r,role] | ['e',cx,cy,rx,ry,role] | ['r',x,y,w,h,rx,role]
   */
  var SUBJ = {
    sax: [
      ['p', 'M124 44 Q122 14 76 18 L56 22 L56 31 L76 28 Q100 26 100 44 Z', 'a'],
      ['r', 40, 21, 18, 11, 4, 'fg'],
      ['p', 'M100 40 L100 140 A34 34 0 0 0 168 140 L168 118 L182 94 L130 94 L144 118 L144 140 A10 10 0 0 1 124 140 L124 40 Z', 'a'],
      ['e', 156, 94, 26, 6, 'b'],
      ['c', 112, 64, 6, 'b'], ['c', 112, 82, 6, 'b'], ['c', 112, 100, 6, 'b'], ['c', 112, 118, 6, 'b'],
      ['s', 'M150 150 C150 164 136 168 128 160', 'b', 3]
    ],
    cup: [
      ['e', 100, 162, 72, 11, 'b'],
      ['p', 'M150 92 C182 90 184 136 146 134 L147 123 C168 123 168 101 149 103 Z', 'a'],
      ['p', 'M46 80 L154 80 L146 136 Q142 156 120 156 L80 156 Q58 156 54 136 Z', 'a'],
      ['r', 52, 104, 96, 14, 0, 'b'],
      ['e', 100, 80, 54, 9, 'c'],
      ['s', 'M80 62 C70 50 90 42 80 28', 'fg', 5], ['s', 'M100 60 C90 46 110 38 100 22', 'fg', 5], ['s', 'M120 62 C110 50 130 42 120 28', 'fg', 5]
    ],
    leaf: [
      ['s', 'M100 186 C100 150 98 112 100 60', 'fg', 4],
      ['p', 'M100 62 C80 40 84 16 100 4 C116 16 120 40 100 62 Z', 'a'],
      ['p', 'M99 124 C68 124 44 102 36 74 C64 72 92 92 99 124 Z', 'b'],
      ['p', 'M101 98 C130 100 152 80 162 52 C134 48 108 66 101 98 Z', 'a'],
      ['s', 'M100 56 L100 16', 'c', 2.5], ['s', 'M95 119 C78 110 60 98 44 80', 'c', 2.5], ['s', 'M105 93 C122 86 140 74 155 58', 'c', 2.5]
    ],
    note: [
      ['r', 44, 26, 112, 148, 12, 'c'],
      ['r', 44, 26, 20, 148, 8, 'a'],
      ['s', 'M80 64 H138', 'b', 5], ['s', 'M80 88 H138', 'b', 5], ['s', 'M80 112 H122', 'b', 5], ['s', 'M80 136 H130', 'b', 5],
      ['p', 'M118 162 L168 112 L182 126 L132 176 Z', 'b'],
      ['p', 'M118 162 L132 176 L110 182 Z', 'fg']
    ],
    bean: [
      ['p', 'M100 26 C152 26 176 88 164 130 C152 172 102 184 72 162 C38 138 38 80 58 54 C70 38 84 26 100 26 Z', 'a'],
      ['s', 'M104 36 C76 76 128 112 96 172', 'bg', 9]
    ]
  };
  var COL = { a: 'var(--ka)', b: 'var(--kb)', c: 'var(--kc)', fg: 'var(--kfg)', bg: 'var(--kbg)', w: '#ffffff', k: '#111111' };
  function roleOf(p) { return (p[0] === 'p' || p[0] === 's') ? p[2] : p[0] === 'c' ? p[4] : p[0] === 'e' ? p[5] : p[6]; }
  function shape(p, st) {
    var a = (st.fill ? 'fill:' + st.fill + ';' : 'fill:none;') +
      (st.stroke ? 'stroke:' + st.stroke + ';stroke-width:' + st.sw + ';stroke-linecap:round;stroke-linejoin:round;' : '') + (st.extra || '');
    var at = st.attr || '';
    var t = p[0];
    if (t === 'p' || t === 's') return '<path d="' + p[1] + '" style="' + a + '"' + at + '/>';
    if (t === 'c') return '<circle cx="' + p[1] + '" cy="' + p[2] + '" r="' + p[3] + '" style="' + a + '"' + at + '/>';
    if (t === 'e') return '<ellipse cx="' + p[1] + '" cy="' + p[2] + '" rx="' + p[3] + '" ry="' + p[4] + '" style="' + a + '"' + at + '/>';
    return '<rect x="' + p[1] + '" y="' + p[2] + '" width="' + p[3] + '" height="' + p[4] + '" rx="' + p[5] + '" style="' + a + '"' + at + '/>';
  }
  function colFor(role, s) {
    if (s && has(s, 'foil') && (role === 'a' || role === 'b')) return 'url(#gfoil)';
    if (s && has(s, 'holo') && role === 'a') return 'url(#gholo)';
    return COL[role] || role;
  }
  // render a subject's primitives in an illustration style
  function subjectInner(name, style, s) {
    var prims = SUBJ[name] || SUBJ.sax;
    var out = '';
    style = style || 'flat';
    function flat(extraAttr) {
      return prims.map(function (p) {
        var c = colFor(roleOf(p), s);
        if (p[0] === 's') return shape(p, { stroke: c, sw: p[3], attr: extraAttr });
        return shape(p, { fill: c, attr: extraAttr });
      }).join('');
    }
    function line(w, col) {
      return prims.map(function (p) {
        return shape(p, { stroke: col || 'var(--kfg)', sw: p[0] === 's' ? Math.min(p[3], w) : w });
      }).join('');
    }
    if (style === 'line' || style === 'outline' || style === 'monoline') out = line(style === 'monoline' ? 5 : 3.2);
    else if (style === 'mono' || style === 'glyph' || style === 'silhouette') out = prims.map(function (p) {
      if (p[0] === 's') return shape(p, { stroke: roleOf(p) === 'bg' ? 'var(--kbg)' : 'var(--kfg)', sw: p[3] });
      return shape(p, { fill: roleOf(p) === 'bg' ? 'var(--kbg)' : 'var(--kfg)' });
    }).join('');
    else if (style === 'vector') out = flat() + prims.filter(function (p) { return p[0] !== 's'; }).map(function (p) { return shape(p, { fill: 'url(#ghi)' }); }).join('');
    else if (style === 'doodle') out = '<g transform="translate(6 5)" opacity=".9">' + prims.filter(function (p) { return p[0] !== 's'; }).map(function (p) { return shape(p, { fill: colFor(roleOf(p), s) }); }).join('') + '</g><g filter="url(#wob)">' + line(3.4) + '</g>';
    else if (style === 'sticker') out = '<g filter="url(#stk)">' + flat() + '</g>';
    else if (style === 'clay') out = '<g filter="url(#clay)">' + flat() + '</g>';
    else if (style === 'pixel') out = '<g filter="url(#px)">' + flat() + '</g>';
    else if (style === 'paper') out = prims.map(function (p) {
      var c = colFor(roleOf(p), s);
      if (p[0] === 's') return shape(p, { stroke: c, sw: p[3], attr: ' filter="url(#pcs)"' });
      return shape(p, { fill: c, attr: ' filter="url(#pcs)"' });
    }).join('');
    else out = flat();
    return out;
  }
  function subjectSVG(name, style, s, cls, st) {
    return svgWrap('0 0 200 200', DEFS + subjectInner(name, style, s), cls || 'vis', st);
  }

  /* ---------------------------------------------------------------- icons */
  var ICONS = {
    file: [['o', 'M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'], ['l', 'M14 2v6h6'], ['x', 'M8 13h8M8 17h5']],
    link: [['l', 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5'], ['l', 'M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5']],
    search: [['c', 11, 11, 7], ['l', 'M21 21l-4.6-4.6']],
    sync: [['l', 'M21 12a9 9 0 0 1-15.4 6.4L3 16'], ['l', 'M3 12a9 9 0 0 1 15.4-6.4L21 8'], ['l', 'M21 3v5h-5'], ['l', 'M3 21v-5h5']],
    layout: [['r', 3, 3, 18, 18, 2], ['x', 'M3 9h18M9 21V9']],
    lock: [['r', 4, 11, 16, 10, 2], ['l', 'M8 11V7a4 4 0 0 1 8 0v4'], ['x', 'M12 15v2']],
    ticket: [['o', 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z'], ['x', 'M14 8v1.5M14 11.5v1M14 14.5v1.5']],
    music: [['l', 'M9 18V5l12-2v13'], ['c', 6, 18, 3], ['c', 18, 16, 3]],
    calendar: [['r', 3, 4, 18, 18, 2], ['l', 'M16 2v4M8 2v4'], ['x', 'M3 10h18']],
    pin: [['o', 'M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z'], ['cx', 12, 10, 2.5]],
    clock: [['c', 12, 12, 10], ['x', 'M12 6v6l4 2']],
    mic: [['r', 9, 2, 6, 12, 3], ['l', 'M5 10v1a7 7 0 0 0 14 0v-1'], ['l', 'M12 18v4']],
    cup: [['o', 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z'], ['l', 'M17 9h1.5a3 3 0 0 1 0 6H17'], ['l', 'M8 2v3M12 2v3']],
    bean: [['o', 'M7 4c5-3 13 3 10 11s-12 7-13 1C3 11 4 6 7 4z'], ['x', 'M8.5 16.5c3-3 1.5-7 5.5-11']],
    leaf: [['o', 'M11 20A7 7 0 0 1 4 13c0-6 6-10 16-10 0 9-4 17-9 17z'], ['x', 'M5 21c3-6 7-9 11-11']],
    thermo: [['o', 'M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0z']],
    timer: [['c', 12, 13, 8], ['l', 'M10 2h4'], ['x', 'M12 9v4l2.5 2']],
    croissant: [['o', 'M4 15c2-6 6-9 8-9s6 3 8 9c-2 1-5 1-8 1s-6 0-8-1z'], ['x', 'M9 9l1.5 6M15 9l-1.5 6']],
    wifi: [['l', 'M2 8.8a15 15 0 0 1 20 0'], ['l', 'M5 12.6a10 10 0 0 1 14 0'], ['l', 'M8.5 16.4a5 5 0 0 1 7 0'], ['c', 12, 20, 1]],
    star: [['o', 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z']]
  };
  function iconSvg(name, mode, size, color, cut, sw) {
    var parts = ICONS[name] || ICONS.star;
    var filled = mode === 'filled';
    var w = sw || 2;
    var col = color || 'currentColor';
    var out = parts.map(function (p) {
      var t = p[0];
      var closed = (t === 'o' || t === 'c' || t === 'r');
      var isCut = (t === 'x' || t === 'cx');
      var stroke = isCut && filled ? (cut || '#ffffff') : col;
      var fill = closed && filled ? col : 'none';
      var st = 'fill:' + fill + ';stroke:' + stroke + ';stroke-width:' + (filled && t === 'l' ? w + 0.4 : w) + ';stroke-linecap:round;stroke-linejoin:round';
      if (t === 'c' || t === 'cx') return '<circle cx="' + p[1] + '" cy="' + p[2] + '" r="' + p[3] + '" style="' + st + '"/>';
      if (t === 'r') return '<rect x="' + p[1] + '" y="' + p[2] + '" width="' + p[3] + '" height="' + p[4] + '" rx="' + p[5] + '" style="' + st + '"/>';
      return '<path d="' + p[1] + '" style="' + st + '"/>';
    }).join('');
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" style="display:block;overflow:visible">' + out + '</svg>';
  }

  /* ------------------------------------------------------- scene helpers */
  var CITY = 'M0 160 V122 H26 V102 H50 V128 H68 V92 H94 V118 H116 V104 H138 V62 H146 V44 H152 V10 H156 V44 H162 V62 H170 V112 H196 V96 H222 V122 H246 V84 H272 V110 H300 V98 H330 V124 H352 V104 H378 V118 H400 V160 Z';
  function isoBox(ox, oy, u, x, y, z, w, d, h, col) {
    function P(px, py, pz) { return f1(ox + (px - py) * 0.866 * u) + ',' + f1(oy + (px + py) * 0.5 * u - pz * u); }
    var top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)].join(' ');
    var left = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)].join(' ');
    var right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)].join(' ');
    return '<polygon points="' + top + '" style="fill:' + col + '"/>' +
      '<polygon points="' + left + '" style="fill:' + col + '"/><polygon points="' + left + '" style="fill:#000;opacity:.16"/>' +
      '<polygon points="' + right + '" style="fill:' + col + '"/><polygon points="' + right + '" style="fill:#000;opacity:.32"/>';
  }
  function isoScene(s, subject) {
    var o = '', ox = 200, oy = 150, u = 34;
    o += isoBox(ox, oy, u, 0, 0, 0, 5, 5, 0.5, 'var(--kc)');
    o += isoBox(ox, oy, u, 0.4, 0.4, 0.5, 1.6, 1.2, 2.2, 'var(--ka)');
    o += isoBox(ox, oy, u, 0.55, 0.45, 2.7, 1.3, 1.0, 0.25, 'var(--kfg)');
    o += isoBox(ox, oy, u, 3.0, 0.5, 0.5, 1.4, 1.4, 1.0, 'var(--kb)');
    o += isoBox(ox, oy, u, 3.2, 0.7, 1.5, 1.0, 1.0, 1.0, 'var(--ka)');
    o += isoBox(ox, oy, u, 1.0, 3.2, 0.5, 2.6, 1.0, 0.7, 'var(--kfg)');
    o += isoBox(ox, oy, u, 1.0, 3.2, 1.2, 0.3, 1.0, 0.25, 'var(--kbg)');
    o += isoBox(ox, oy, u, 1.6, 3.2, 1.2, 0.3, 1.0, 0.25, 'var(--kbg)');
    o += isoBox(ox, oy, u, 2.2, 3.2, 1.2, 0.3, 1.0, 0.25, 'var(--kbg)');
    o += '<g transform="translate(250 30) scale(.55)">' + subjectInner(subject, 'flat', s) + '</g>';
    return svgWrap('0 0 400 330', DEFS + o, 'scene');
  }
  function lowPoly(s, w, h, seed) {
    var R = rng(seed || 7), cols = 9, rows = 6, pts = [], o = '';
    for (var r = 0; r <= rows; r++) {
      var row = [];
      for (var c = 0; c <= cols; c++) {
        var x = c / cols * w + (c > 0 && c < cols ? (R() - 0.5) * w / cols * 0.7 : 0);
        var base = h * 0.32 + Math.abs(Math.sin(c * 0.9 + 0.6)) * h * 0.28 * (1 - c % 2 * 0.4);
        var y = r === 0 ? base : base + (h - base) * (r / rows) + (r < rows ? (R() - 0.5) * 14 : 0);
        row.push([f1(x), f1(y)]);
      }
      pts.push(row);
    }
    for (var r2 = 0; r2 < rows; r2++) {
      for (var c2 = 0; c2 < cols; c2++) {
        var p00 = pts[r2][c2], p10 = pts[r2][c2 + 1], p01 = pts[r2 + 1][c2], p11 = pts[r2 + 1][c2 + 1];
        var tris = [[p00, p10, p11], [p00, p11, p01]];
        for (var t = 0; t < 2; t++) {
          var pp = tris[t].map(function (q) { return q.join(','); }).join(' ');
          var col = r2 < 2 ? 'var(--kb)' : 'var(--ka)';
          o += '<polygon points="' + pp + '" style="fill:' + col + ';stroke:' + col + ';stroke-width:.6"/>';
          o += '<polygon points="' + pp + '" style="fill:' + (R() > 0.5 ? '#fff' : '#000') + ';opacity:' + f1(R() * 0.22) + '"/>';
        }
      }
    }
    // faceted moon
    var mx = w * 0.72, my = h * 0.2, mr = h * 0.11, n = 9, m = '';
    for (var k = 0; k < n; k++) {
      var a1 = k / n * Math.PI * 2, a2 = (k + 1) / n * Math.PI * 2;
      var tp = f1(mx) + ',' + f1(my) + ' ' + f1(mx + Math.cos(a1) * mr) + ',' + f1(my + Math.sin(a1) * mr) + ' ' + f1(mx + Math.cos(a2) * mr) + ',' + f1(my + Math.sin(a2) * mr);
      m += '<polygon points="' + tp + '" style="fill:var(--kc);stroke:var(--kc);stroke-width:.6"/><polygon points="' + tp + '" style="fill:#fff;opacity:' + f1(0.05 + (k % 3) * 0.12) + '"/>';
    }
    return m + o;
  }
  function paperHills(w, h) {
    var cols = ['var(--kc)', 'var(--kb)', 'var(--ka)', 'var(--kfg)'];
    var o = '<circle cx="' + f1(w * 0.68) + '" cy="' + f1(h * 0.26) + '" r="' + f1(h * 0.12) + '" style="fill:var(--kc)" filter="url(#pcs)"/>';
    for (var i = 0; i < 4; i++) {
      var y0 = h * (0.42 + i * 0.13), amp = h * 0.06, d = 'M0 ' + f1(y0);
      for (var x = 0; x <= w; x += w / 8) d += ' Q' + f1(x + w / 16) + ' ' + f1(y0 + ((Math.round(x / (w / 8)) + i) % 2 ? -amp : amp)) + ' ' + f1(x + w / 8) + ' ' + f1(y0);
      d += ' V' + h + ' H0 Z';
      o += '<path d="' + d + '" style="fill:' + cols[i] + '" filter="url(#pcs)"/>';
    }
    return o;
  }
  function personScene(s, prop) {
    var skin = '#7b6cf6';
    var o = '<ellipse cx="100" cy="252" rx="78" ry="8" style="fill:#000;opacity:.12"/>' +
      '<path d="M66 168 L52 246 L92 246 L100 192 L108 246 L148 246 L134 168 Z" style="fill:var(--kb)"/>' +
      '<ellipse cx="68" cy="248" rx="22" ry="7" style="fill:var(--kfg)"/><ellipse cx="132" cy="248" rx="22" ry="7" style="fill:var(--kfg)"/>' +
      '<path d="M64 102 Q100 86 136 102 L142 172 L58 172 Z" style="fill:var(--ka)"/>' +
      '<rect x="94" y="80" width="12" height="16" style="fill:' + skin + '"/>' +
      '<circle cx="100" cy="70" r="15" style="fill:' + skin + '"/>' +
      '<path d="M84 66 C84 46 118 44 118 64 C112 58 98 58 84 66 Z" style="fill:var(--kfg)"/>' +
      '<path d="M70 110 C34 136 52 168 86 150" style="fill:none;stroke:' + skin + ';stroke-width:15;stroke-linecap:round"/>' +
      '<path d="M130 110 C170 128 160 160 116 148" style="fill:none;stroke:' + skin + ';stroke-width:15;stroke-linecap:round"/>' +
      '<g transform="translate(60 96) scale(.42)">' + subjectInner(prop, 'flat', s) + '</g>' +
      '<path d="M18 40 q12 -12 24 0 t24 0" style="fill:none;stroke:var(--kc);stroke-width:6;stroke-linecap:round"/>' +
      '<circle cx="176" cy="40" r="12" style="fill:var(--kc)"/>' +
      '<path d="M160 200 l14 -24 l14 24 z" style="fill:var(--kc)"/>';
    return svgWrap('0 0 200 260', DEFS + o, 'scene');
  }
  // scene for the poster/landing illustration slot
  function illusScene(s, subject, w, h) {
    var st = s.illus || 'flat';
    if (st === 'iso') return isoScene(s, subject);
    if (st === 'corporate') return personScene(s, subject);
    if (st === 'lowpoly') return svgWrap('0 0 ' + w + ' ' + h, lowPoly(s, w, h, 11), 'scene', '', 'none');
    if (st === 'paper') return svgWrap('0 0 ' + w + ' ' + h, DEFS + paperHills(w, h) + '<g transform="translate(' + f1(w * 0.12) + ' ' + f1(h * 0.14) + ') scale(' + f1(h * 0.0036) + ')">' + subjectInner(subject, 'paper', s) + '</g>', 'scene', '', 'none');
    if (st === 'spot') return svgWrap('0 0 200 200', DEFS + '<path d="M40 110 C30 60 90 30 130 46 C176 62 182 128 140 156 C100 182 50 160 40 110 Z" style="fill:var(--kc)"/><circle cx="160" cy="44" r="6" style="fill:var(--ka)"/><circle cx="30" cy="160" r="4" style="fill:var(--kb)"/><g transform="translate(40 36) scale(.62)">' + subjectInner(subject, 'flat', s) + '</g>', 'scene');
    // flat / line / vector / doodle / sticker / clay / pixel / mono: moon + city + subject
    var cityStyle = (st === 'line' || st === 'doodle' || st === 'monoline') ? 'fill:none;stroke:var(--kfg);stroke-width:2.4;stroke-linejoin:round' : 'fill:var(--kfg)';
    var moonStyle = (st === 'line' || st === 'doodle' || st === 'monoline') ? 'fill:none;stroke:var(--kfg);stroke-width:2.4' : 'fill:var(--kc)';
    var g = '<circle cx="300" cy="80" r="56" style="' + moonStyle + '"' + (st === 'doodle' ? ' filter="url(#wob)"' : '') + '/>' +
      '<g transform="translate(0 170)"' + (st === 'doodle' ? ' filter="url(#wob)"' : '') + '><path d="' + CITY + '" style="' + cityStyle + '"/></g>' +
      '<g transform="translate(70 40) scale(1.3)">' + subjectInner(subject, st, s) + '</g>';
    if (st === 'clay') g = '<g filter="url(#clay)"><circle cx="300" cy="80" r="56" style="fill:var(--kc)"/><path transform="translate(0 170)" d="' + CITY + '" style="fill:var(--kb)"/></g><g transform="translate(70 40) scale(1.3)">' + subjectInner(subject, 'clay', s) + '</g>';
    if (st === 'pixel') g = '<g filter="url(#px)"><circle cx="300" cy="80" r="56" style="fill:var(--kc)"/><path transform="translate(0 170)" d="' + CITY + '" style="fill:var(--kfg)"/><g transform="translate(70 40) scale(1.3)">' + subjectInner(subject, 'flat', s) + '</g></g>';
    if (st === 'sticker') g = '<g filter="url(#stk)"><circle cx="300" cy="80" r="50" style="fill:var(--kc)"/></g><g transform="translate(70 40) scale(1.3)">' + subjectInner(subject, 'sticker', s) + '</g>';
    return svgWrap('0 0 400 330', DEFS + g, 'scene');
  }

  /* ------------------------------------------------------------- deco art */
  function psyRings() {
    var cols = ['var(--ka)', 'var(--kb)', 'var(--kc)', 'var(--kfg)'];
    var o = '';
    for (var i = 9; i >= 1; i--) {
      var R0 = i * 34, d = '';
      for (var k = 0; k <= 96; k++) {
        var th = k / 96 * Math.PI * 2;
        var r = R0 + Math.sin(th * 7 + i * 0.9) * (6 + i * 1.6);
        d += (k ? 'L' : 'M') + f1(200 + Math.cos(th) * r) + ' ' + f1(260 + Math.sin(th) * r * 1.12);
      }
      o += '<path d="' + d + 'Z" style="fill:' + cols[i % 4] + '"/>';
    }
    return o;
  }
  function stars(n, seed, w, h, col) {
    var R = rng(seed), o = '';
    for (var i = 0; i < n; i++) o += '<circle cx="' + f1(R() * w) + '" cy="' + f1(R() * h) + '" r="' + f1(0.5 + R() * 1.4) + '" style="fill:' + (col || '#fff') + ';opacity:' + f1(0.4 + R() * 0.6) + '"/>';
    return o;
  }
  function sparkle(x, y, r, col) {
    return '<path d="M' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + ' Z" style="fill:' + col + '"/>';
  }
  function burst(cx, cy, r, n, col, sw) {
    var o = '';
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, rr = i % 2 ? r * 0.55 : r;
      o += '<line x1="' + cx + '" y1="' + cy + '" x2="' + f1(cx + Math.cos(a) * rr) + '" y2="' + f1(cy + Math.sin(a) * rr) + '" style="stroke:' + col + ';stroke-width:' + sw + ';stroke-linecap:round"/>';
    }
    return o + '<circle cx="' + cx + '" cy="' + cy + '" r="' + f1(sw * 1.6) + '" style="fill:' + col + '"/>';
  }
  function sunRays(cx, cy, n, r, col, op) {
    var o = '';
    for (var i = 0; i < n; i++) {
      var a1 = Math.PI + i / n * Math.PI, a2 = Math.PI + (i + 0.5) / n * Math.PI;
      o += '<polygon points="' + cx + ',' + cy + ' ' + f1(cx + Math.cos(a1) * r) + ',' + f1(cy + Math.sin(a1) * r) + ' ' + f1(cx + Math.cos(a2) * r) + ',' + f1(cy + Math.sin(a2) * r) + '" style="fill:' + col + ';opacity:' + op + '"/>';
    }
    return o;
  }
  var DECO = {
    swiss: function () { return '<circle cx="292" cy="150" r="118" style="fill:var(--ka)"/>'; },
    bauhaus: function () {
      return '<rect x="28" y="40" width="150" height="150" style="fill:var(--kb)"/>' +
        '<circle cx="250" cy="168" r="112" style="fill:var(--ka);mix-blend-mode:multiply"/>' +
        '<path d="M28 296 L178 190 L178 296 Z" style="fill:var(--kc)"/>' +
        '<path d="M250 56 A112 112 0 0 1 362 168 L250 168 Z" style="fill:var(--kfg)"/>' +
        '<circle cx="336" cy="268" r="20" style="fill:var(--kfg)"/>' +
        '<rect x="28" y="296" width="344" height="10" style="fill:var(--kfg)"/>';
    },
    memphis: function () {
      return '<defs><pattern id="mdots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2" style="fill:var(--kfg)"/></pattern><pattern id="mgrid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" style="fill:none;stroke:var(--kfg);stroke-width:1.4"/></pattern></defs>' +
        '<rect x="250" y="24" width="120" height="96" style="fill:url(#mdots)"/>' +
        '<rect x="22" y="330" width="110" height="110" style="fill:url(#mgrid)"/>' +
        '<circle cx="330" cy="400" r="54" style="fill:var(--ka)"/>' +
        '<path d="M300 402 a30 30 0 0 1 60 0" style="fill:none;stroke:var(--kfg);stroke-width:5"/>' +
        '<path d="M40 64 l40 -36 l26 54 z" style="fill:var(--kb);stroke:var(--kfg);stroke-width:4;stroke-linejoin:round"/>' +
        '<path d="M150 470 q15 -26 30 0 t30 0 t30 0 t30 0" style="fill:none;stroke:var(--kb);stroke-width:8;stroke-linecap:round"/>' +
        '<path d="M330 200 l12 -12 l12 12 l12 -12 l12 12 l12 -12" transform="translate(-20 0)" style="fill:none;stroke:var(--kfg);stroke-width:5;stroke-linejoin:round"/>' +
        '<rect x="18" y="200" width="22" height="90" rx="11" style="fill:var(--kc)" transform="rotate(-24 29 245)"/>' +
        '<circle cx="372" cy="300" r="10" style="fill:none;stroke:var(--kfg);stroke-width:4"/>' +
        '<circle cx="190" cy="40" r="7" style="fill:var(--ka)"/>';
    },
    y2k: function () {
      return '<defs><radialGradient id="ybub" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" style="stop-color:var(--kc)"/><stop offset="1" style="stop-color:var(--kb)"/></radialGradient></defs>' +
        '<circle cx="330" cy="90" r="64" style="fill:url(#ybub);opacity:.9"/><circle cx="60" cy="420" r="44" style="fill:url(#ybub);opacity:.85"/><circle cx="90" cy="110" r="22" style="fill:url(#ybub)"/>' +
        '<ellipse cx="200" cy="250" rx="185" ry="70" style="fill:none;stroke:url(#gchrome);stroke-width:8" transform="rotate(-14 200 250)"/>' +
        sparkle(56, 60, 18, '#ffffff') + sparkle(352, 210, 14, '#ffffff') + sparkle(300, 440, 22, 'var(--ka)') + sparkle(140, 470, 10, '#ffffff') + sparkle(250, 30, 9, 'var(--ka)');
    },
    blobs: function () {
      return '<g filter="url(#blr)"><circle cx="90" cy="120" r="110" style="fill:var(--ka)"/><circle cx="330" cy="200" r="120" style="fill:var(--kb)"/><circle cx="160" cy="420" r="120" style="fill:var(--kc)"/></g>';
    },
    claybits: function () {
      return '<g filter="url(#clay)"><circle cx="70" cy="80" r="44" style="fill:var(--ka)"/><rect x="290" y="56" width="80" height="80" rx="26" style="fill:var(--kb)" transform="rotate(18 330 96)"/><circle cx="340" cy="420" r="36" style="fill:var(--kc)"/><path d="M40 430 q30 -60 70 -10 q30 40 -10 50 q-50 10 -60 -40z" style="fill:var(--kb)"/></g>';
    },
    flat: function () { return '<circle cx="200" cy="190" r="150" style="fill:var(--kc)"/><rect x="0" y="380" width="400" height="120" style="fill:var(--kb)"/>'; },
    deco: function () {
      var o = sunRays(200, 470, 22, 520, 'var(--ka)', 0.16);
      o += '<rect x="16" y="16" width="368" height="468" style="fill:none;stroke:var(--ka);stroke-width:2"/>' +
        '<rect x="26" y="26" width="348" height="448" style="fill:none;stroke:var(--ka);stroke-width:.8"/>' +
        '<path d="M200 60 L260 120 L200 180 L140 120 Z" style="fill:none;stroke:var(--ka);stroke-width:1.5"/>' +
        '<path d="M200 80 L240 120 L200 160 L160 120 Z" style="fill:var(--ka)"/>' +
        '<path d="M60 470 V300 H90 V250 H120 V210 H150" style="fill:none;stroke:var(--ka);stroke-width:1.5"/>' +
        '<path d="M340 470 V300 H310 V250 H280 V210 H250" style="fill:none;stroke:var(--ka);stroke-width:1.5"/>';
      for (var i = 0; i < 5; i++) o += '<path d="M' + (110 + i * 10) + ' 470 A' + (90 - i * 10) + ' ' + (90 - i * 10) + ' 0 0 1 ' + (290 - i * 10) + ' 470" style="fill:none;stroke:var(--ka);stroke-width:1"/>';
      return o;
    },
    nouveau: function () {
      var leaf = function (x, y, r, sc) { return '<path transform="translate(' + x + ' ' + y + ') rotate(' + r + ') scale(' + sc + ')" d="M0 0 C10 -14 30 -14 40 0 C30 14 10 14 0 0 Z" style="fill:var(--kb)"/>'; };
      return '<circle cx="200" cy="200" r="120" style="fill:var(--kc);opacity:.55"/>' +
        '<circle cx="200" cy="200" r="132" style="fill:none;stroke:var(--ka);stroke-width:1.5"/>' +
        '<path d="M48 486 V200 C48 92 120 30 200 30 C280 30 352 92 352 200 V486" style="fill:none;stroke:var(--ka);stroke-width:3"/>' +
        '<path d="M62 486 V204 C62 104 128 44 200 44 C272 44 338 104 338 204 V486" style="fill:none;stroke:var(--ka);stroke-width:1"/>' +
        '<path d="M48 300 C10 270 20 220 48 230 C70 238 60 270 36 262" style="fill:none;stroke:var(--ka);stroke-width:2.5"/>' +
        '<path d="M352 300 C390 270 380 220 352 230 C330 238 340 270 364 262" style="fill:none;stroke:var(--ka);stroke-width:2.5"/>' +
        '<path d="M48 420 C90 380 70 330 110 300 C130 286 150 300 140 316" style="fill:none;stroke:var(--kb);stroke-width:2.5"/>' +
        '<path d="M352 420 C310 380 330 330 290 300 C270 286 250 300 260 316" style="fill:none;stroke:var(--kb);stroke-width:2.5"/>' +
        leaf(70, 370, -40, 0.9) + leaf(92, 330, -70, 0.8) + leaf(330, 370, 220, 0.9) + leaf(308, 330, 250, 0.8) +
        '<circle cx="200" cy="30" r="6" style="fill:var(--ka)"/><circle cx="140" cy="316" r="5" style="fill:var(--ka)"/><circle cx="260" cy="316" r="5" style="fill:var(--ka)"/>';
    },
    constructivist: function () {
      return '<path d="M-20 360 L420 120 L420 210 L-20 450 Z" style="fill:var(--ka)"/>' +
        '<circle cx="300" cy="110" r="78" style="fill:var(--kfg)"/>' +
        '<path d="M0 0 L190 0 L0 260 Z" style="fill:var(--ka);opacity:.92"/>' +
        '<rect x="40" y="230" width="340" height="8" style="fill:var(--kfg)" transform="rotate(-28 210 234)"/>' +
        '<rect x="250" y="380" width="120" height="70" style="fill:var(--kfg)"/>';
    },
    destijl: function () {
      return '<rect x="0" y="0" width="150" height="190" style="fill:var(--ka)"/>' +
        '<rect x="310" y="0" width="90" height="120" style="fill:var(--kc)"/>' +
        '<rect x="0" y="420" width="150" height="80" style="fill:var(--kb)"/>' +
        '<rect x="330" y="400" width="70" height="100" style="fill:var(--ka)"/>' +
        '<rect x="150" y="440" width="180" height="60" style="fill:var(--kc)"/>' +
        '<g style="fill:var(--kfg)"><rect x="146" y="0" width="10" height="500"/><rect x="0" y="186" width="400" height="10"/><rect x="306" y="0" width="10" height="196"/><rect x="0" y="416" width="400" height="10"/><rect x="326" y="416" width="10" height="84"/><rect x="306" y="116" width="94" height="8"/></g>';
    },
    midcentury: function () {
      return '<path d="M30 120 C80 40 200 70 180 140 C160 210 60 200 30 120 Z" style="fill:var(--ka)"/>' +
        '<path d="M250 380 Q330 300 380 360 Q330 330 280 420 Z" style="fill:var(--kb)"/>' +
        '<circle cx="320" cy="90" r="46" style="fill:var(--kc)"/>' +
        burst(330, 230, 28, 16, 'var(--kfg)', 2.4) + burst(70, 300, 18, 12, 'var(--ka)', 2) +
        '<path d="M20 470 L120 470" style="stroke:var(--kfg);stroke-width:3"/>' +
        '<circle cx="140" cy="470" r="6" style="fill:var(--kb)"/><circle cx="160" cy="470" r="6" style="fill:var(--kc)"/><circle cx="180" cy="470" r="6" style="fill:var(--ka)"/>';
    },
    psychedelic: psyRings,
    vapor: function () {
      var o = '<defs><linearGradient id="vsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b0a4f"/><stop offset=".55" stop-color="#b13cb8"/><stop offset="1" stop-color="#ff71ce"/></linearGradient><linearGradient id="vsun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff35c"/><stop offset="1" stop-color="#ff2975"/></linearGradient></defs>' +
        '<rect width="400" height="320" style="fill:url(#vsky)"/>' + stars(40, 3, 400, 200, '#fff') +
        '<circle cx="200" cy="250" r="110" style="fill:url(#vsun)"/>';
      for (var i = 0; i < 6; i++) o += '<rect x="80" y="' + (250 + i * 13) + '" width="240" height="' + (2 + i * 1.3) + '" style="fill:#7a1fa2"/>';
      o += '<rect y="320" width="400" height="180" style="fill:#1a0636"/>';
      for (var j = 0; j <= 16; j++) o += '<line x1="' + (200 + (j - 8) * 18) + '" y1="320" x2="' + (200 + (j - 8) * 110) + '" y2="500" style="stroke:#ff71ce;stroke-width:1.4"/>';
      var ys = [324, 332, 344, 362, 388, 424, 474];
      for (var k = 0; k < ys.length; k++) o += '<line x1="0" y1="' + ys[k] + '" x2="400" y2="' + ys[k] + '" style="stroke:#01cdfe;stroke-width:1.4"/>';
      return o;
    },
    retrofuture: function () {
      return '<defs><radialGradient id="rfp" cx=".35" cy=".35" r=".75"><stop offset="0" style="stop-color:var(--kc)"/><stop offset="1" style="stop-color:var(--ka)"/></radialGradient></defs>' +
        stars(70, 9, 400, 500, '#fff') +
        '<circle cx="270" cy="160" r="92" style="fill:url(#rfp)"/>' +
        '<ellipse cx="270" cy="160" rx="160" ry="30" transform="rotate(-18 270 160)" style="fill:none;stroke:var(--kb);stroke-width:7"/>' +
        '<path d="M270 68 A92 92 0 0 1 362 160" style="fill:none;stroke:#fff;stroke-width:3;opacity:.4"/>' +
        '<ellipse cx="200" cy="560" rx="380" ry="170" style="fill:var(--kb);opacity:.3"/>' +
        '<path d="M40 330 L120 290" style="stroke:#fff;stroke-width:2;opacity:.6"/><path d="M60 352 L170 296" style="stroke:#fff;stroke-width:1;opacity:.4"/>' +
        '<g transform="translate(120 282) rotate(-28)"><path d="M0 -10 C30 -12 48 -4 56 0 C48 4 30 12 0 10 Z" style="fill:#eef2f7"/><path d="M8 -10 L-6 -20 L-2 -8 Z M8 10 L-6 20 L-2 8 Z" style="fill:var(--kb)"/><circle cx="34" cy="0" r="4" style="fill:var(--ka)"/><path d="M0 -5 L-16 0 L0 5 Z" style="fill:#ffb347"/></g>';
    },
    maximal: function () {
      var o = '<defs><pattern id="xs" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="10" height="20" style="fill:var(--kb)"/></pattern><pattern id="xd" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.4" style="fill:var(--kfg)"/></pattern></defs>' +
        '<rect width="400" height="500" style="fill:url(#xs);opacity:.5"/>' +
        '<circle cx="320" cy="110" r="90" style="fill:var(--ka)"/><circle cx="320" cy="110" r="64" style="fill:url(#xd)"/>' +
        '<rect x="-20" y="330" width="230" height="200" style="fill:var(--kc)" transform="rotate(-8 90 430)"/>';
      for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; o += '<ellipse cx="' + f1(80 + Math.cos(a) * 24) + '" cy="' + f1(90 + Math.sin(a) * 24) + '" rx="16" ry="9" transform="rotate(' + f1(a * 57.3) + ' ' + f1(80 + Math.cos(a) * 24) + ' ' + f1(90 + Math.sin(a) * 24) + ')" style="fill:var(--ka);stroke:var(--kfg);stroke-width:2"/>'; }
      o += '<circle cx="80" cy="90" r="12" style="fill:var(--kc);stroke:var(--kfg);stroke-width:2"/>' +
        '<path d="M220 470 l14 -20 l14 20 l14 -20 l14 20 l14 -20 l14 20 l14 -20 l14 20" style="fill:none;stroke:var(--kfg);stroke-width:5"/>' +
        sparkle(360, 300, 26, 'var(--kc)') + sparkle(40, 250, 16, 'var(--ka)') + burst(260, 380, 30, 18, 'var(--kfg)', 2.2) +
        '<path d="M330 440 q20 -40 40 0 t40 0" style="fill:none;stroke:var(--ka);stroke-width:8"/>';
      return o;
    }
  };
  // decoration strength behind text-heavy primaries (full for background-style decos)
  function decoOp(key) { return key === 'blobs' || key === 'vapor' || key === 'retrofuture' ? 1 : 0.3; }
  function decoSVG(key, cls, par) {
    if (!DECO[key]) return '';
    return svgWrap('0 0 400 500', DEFS + DECO[key](), cls || 'layer', '', par || 'xMidYMid slice');
  }

  /* ------------------------------------------------------- fx overlays */
  function fxLayers(s) {
    var o = '';
    if (has(s, 'paper') || has(s, 'letterpress')) o += '<svg class="layer fx-paper" preserveAspectRatio="none" viewBox="0 0 400 500"><filter id="fpap" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".045 .06" numOctaves="5" seed="8" result="n"/><feDiffuseLighting in="n" surfaceScale="1.6" lighting-color="#ffffff" diffuseConstant="1"><feDistantLight azimuth="45" elevation="62"/></feDiffuseLighting></filter><rect width="400" height="500" filter="url(#fpap)"/></svg>';
    if (has(s, 'grain') || has(s, 'riso')) {
      var fq = has(s, 'riso') ? '.62' : '.85';
      o += '<svg class="layer fx-grain" preserveAspectRatio="none" viewBox="0 0 400 500"><filter id="fgr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="' + fq + '" numOctaves="2" seed="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.85"/></filter><filter id="fgr2" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="' + fq + '" numOctaves="2" seed="9" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 2.2 0 0 -0.9"/></filter><rect width="400" height="500" filter="url(#fgr)"/><rect width="400" height="500" filter="url(#fgr2)"/></svg>';
    }
    if (has(s, 'halftone')) o += '<div class="layer fx-ht"><div class="ht-dots"></div><div class="ht-tint"></div></div>';
    if (has(s, 'holo')) o += '<div class="layer fx-holo"></div>';
    if (has(s, 'foil')) o += '<div class="layer fx-foil"></div>';
    return o;
  }
  var COMMON_CSS =
    ':host{all:initial}*{box-sizing:border-box}' +
    '.vp{position:absolute;inset:0;overflow:hidden}' +
    '.stage{position:absolute;left:0;top:0;transform-origin:0 0}' +
    '.d{position:relative;overflow:hidden;background:var(--kbg);color:var(--kfg);font-family:var(--bf);-webkit-font-smoothing:antialiased}' +
    '.d h1,.d h2,.d h3,.d p{margin:0}' +
    '.hd{font-family:var(--hf);font-weight:var(--hw);font-style:var(--hst);text-transform:var(--htt);letter-spacing:var(--hls);line-height:var(--hlh);margin:0}' +
    '.bd{font-family:var(--bf)}' +
    '.layer{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}' +
    '.vis,.scene{display:block;width:100%;height:100%;overflow:visible}' +
    '.fx-paper{mix-blend-mode:multiply;opacity:.55}' +
    '.fx-grain{opacity:.55;mix-blend-mode:normal}' +
    '.fx-ht{isolation:isolate;mix-blend-mode:multiply;opacity:.9}' +
    '.ht-dots{position:absolute;inset:0;background:radial-gradient(circle,#000 0,#fff 72%) 0 0/7px 7px,radial-gradient(circle at 88% 10%,#000 0,#777 26%,#fff 64%);background-blend-mode:multiply;filter:contrast(22)}' +
    '.ht-tint{position:absolute;inset:0;background:var(--ka);mix-blend-mode:screen}' +
    '.fx-holo{background:linear-gradient(115deg,rgba(255,255,255,0) 20%,rgba(255,255,255,.55) 38%,rgba(255,255,255,0) 52%,rgba(255,255,255,.35) 66%,rgba(255,255,255,0) 80%);mix-blend-mode:soft-light}' +
    '.fx-foil{background:radial-gradient(circle at 20% 15%,rgba(255,240,190,.12),transparent 40%);}' +
    '.duo{position:relative;overflow:hidden;background:var(--kb)}' +
    '.duo img{display:block;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.15);mix-blend-mode:multiply}' +
    '.duo::after{content:"";position:absolute;inset:0;background:var(--ka);mix-blend-mode:lighten}';

  /* surface treatments shared by every primary (.sf elements) */
  var SURF = {
    glass: 'background:rgba(255,255,255,.16);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.5);box-shadow:0 10px 40px rgba(20,10,60,.22),inset 0 1px 0 rgba(255,255,255,.6);border-radius:22px;',
    neu: 'background:var(--kbg);border:0;box-shadow:12px 12px 24px rgba(163,177,198,.75),-12px -12px 24px rgba(255,255,255,.9);border-radius:26px;',
    clay: 'background:var(--ksurf);border:0;border-radius:30px;box-shadow:inset -8px -10px 18px rgba(0,0,0,.12),inset 8px 10px 18px rgba(255,255,255,.75),0 18px 32px -8px rgba(80,40,120,.28);',
    brutal: 'background:#ffffff;border:2px solid #000;border-radius:0;box-shadow:none;',
    neobrutal: 'background:var(--kc);border:3px solid #000;border-radius:12px;box-shadow:6px 6px 0 #000;',
    flat: 'background:var(--kc);border:0;border-radius:6px;box-shadow:none;',
    skeuo: 'background:linear-gradient(#fdfdfd,#e3e1dc);border:1px solid #a9a6a0;border-radius:10px;box-shadow:inset 0 1px 0 #fff,0 2px 3px rgba(0,0,0,.25),0 8px 16px rgba(0,0,0,.15);',
    soft: 'background:var(--ksurf);border:0;border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 14px 34px -10px rgba(16,24,40,.22);',
    pill: 'border-radius:999px;'
  };
  function surfCss(s) { return s.surface && SURF[s.surface] ? '.d .sf{' + SURF[s.surface] + '}' : ''; }
  // recipe CSS: '&{...}' targets the design root, anything else is a descendant selector
  function extraCss(s) { return s.css.map(function (r) { return r.charAt(0) === '&' ? '.d.d.d' + r.slice(1) : '.d.d.d ' + r; }).join(''); }

  /* ================================================================ POSTER */
  var DATE = '2026.11.20';
  var LINEUP = ['Moonlight Quartet', 'Hana Kim Trio', 'The Blue Hour Big Band'];
  function W(s) { return s.ko ? ['서울', '재즈', '나이트'] : ['Seoul', 'Jazz', 'Night']; }
  function HL(s, sep) { return W(s).join(sep == null ? ' ' : sep); }
  function EN(s, cls) { return s.ko ? '<div class="bd ' + (cls || 'en') + '">Seoul Jazz Night</div>' : ''; }
  function vis(s, subject, size, pos) {
    return '<div class="visw" style="position:absolute;width:' + size + 'px;height:' + size + 'px;' + (pos || '') + '">' + subjectSVG(subject, s.illus || 'flat', s) + '</div>';
  }
  function photo(s, src, pos) {
    if (s.photo === 'duo') return '<div class="duo" style="position:absolute;' + pos + '"><img src="assets/primary/' + src + '" alt=""></div>';
    return '<div class="ph" style="position:absolute;' + pos + '"><img src="assets/primary/' + src + '" alt=""></div>';
  }

  var PL = {};
  PL.center = function (s) {
    return '<div class="c-wrap">' +
      '<div class="c-kick bd">Jazz Festival</div>' +
      (s.illus ? '<div style="width:190px;height:190px;margin:-6px 0 8px">' + subjectSVG('sax', s.illus, s) + '</div>' : '') +
      '<h1 class="hd c-h">' + HL(s) + '</h1>' + EN(s, 'c-en') +
      '<div class="c-date bd">' + DATE + '</div>' +
      '<div class="c-foot bd">Olympic Park, Seoul · 19:00<br>Moonlight Quartet · Hana Kim Trio · The Blue Hour</div></div>';
  };
  PL.designed = function (s) {
    var visual = s.photo ? photo(s, 'portrait.jpg', 'right:22px;top:150px;width:190px;height:236px') : vis(s, 'sax', 250, 'right:-8px;top:146px;transform:rotate(-14deg)');
    return svgWrap('0 0 400 500', '<circle cx="330" cy="118" r="128" style="fill:var(--kc)"/>', 'layer') +
      '<div class="ds-top bd"><span>Vol. 11</span><span>Seoul · Korea</span></div>' +
      '<h1 class="hd ds-h">' + W(s).join('<br>') + '</h1>' + EN(s, 'ds-en') +
      visual +
      '<div class="ds-date"><b class="hd">11.20</b><span class="bd">' + DATE + ' · FRI 19:00</span></div>' +
      '<div class="ds-band bd"><div>' + LINEUP.join('<br>') + '</div><div class="ds-ven">Olympic Park<br>88 Lawn<br>seouljazznight.kr</div></div>';
  };
  PL.illus = function (s) {
    return '<div class="il-art">' + illusScene(s, 'sax', 400, 330) + '</div>' +
      '<div class="il-txt"><h1 class="hd il-h">' + HL(s) + '</h1>' + EN(s, 'il-en') +
      '<div class="il-row bd"><b>' + DATE + '</b><span>Olympic Park · 19:00</span></div></div>';
  };
  PL.swiss = function (s) {
    return svgWrap('0 0 400 500', DECO.swiss() + '<rect x="28" y="300" width="344" height="2" style="fill:var(--kfg)"/><rect x="28" y="452" width="344" height="1" style="fill:var(--kfg)"/>', 'layer') +
      '<div class="sw-head bd"><span>Jazz<br>Festival</span><span>Edition 11<br>Seoul</span><span>Fri<br>19:00</span></div>' +
      '<h1 class="hd sw-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="sw-cols bd"><div><b>' + DATE + '</b><br>Doors 18:30<br>Show 19:00</div><div><b>Line-up</b><br>Moonlight Quartet<br>Hana Kim Trio<br>The Blue Hour</div><div><b>Venue</b><br>Olympic Park<br>88 Lawn</div></div>' +
      '<div class="sw-foot bd">seouljazznight.kr</div>';
  };
  PL.bauhaus = function (s) {
    return decoSVG('bauhaus') +
      '<h1 class="hd bh-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="bh-date hd">' + DATE + '</div>' +
      '<div class="bh-info bd">olympic park · 88 lawn · 19:00</div>';
  };
  PL.brutal = function (s) {
    return '<div class="br">' +
      '<div class="br-row br-top bd"><span>[01]</span><span>SEOUL-JAZZ-NIGHT/INDEX.HTML</span><span>KO / EN</span></div>' +
      '<h1 class="hd br-h">' + HL(s, '<br>') + '</h1>' +
      '<div class="br-row br-date hd">' + DATE + '</div>' +
      '<table class="br-t bd"><tr><td>19:00</td><td>MOONLIGHT QUARTET</td></tr><tr><td>20:30</td><td>HANA KIM TRIO</td></tr><tr><td>22:00</td><td>THE BLUE HOUR BIG BAND</td></tr></table>' +
      '<div class="br-row br-links bd"><a>BUY TICKETS</a><a>MAP</a><a>FAQ</a><span class="br-hl">88 LAWN, OLYMPIC PARK</span></div>' +
      '</div>';
  };
  PL.neobrutal = function (s) {
    return '<div class="nb-dots"></div>' +
      '<div class="nb-card sf"><div class="nb-tag bd">LIVE · OUTDOOR</div><h1 class="hd nb-h">' + W(s)[0] + '<br>' + W(s).slice(1).join(' ') + '</h1></div>' +
      '<div class="nb-date sf hd" style="background:var(--ka)">' + DATE + '</div>' +
      '<div class="nb-list bd"><span class="sf" style="background:#fff">Moonlight Quartet</span><span class="sf" style="background:var(--kb)">Hana Kim Trio</span><span class="sf" style="background:#fff">The Blue Hour</span></div>' +
      '<div class="nb-btn sf bd" style="background:var(--kfg);color:#fff">Get tickets →</div>' +
      svgWrap('0 0 100 100', '<path d="M50 4 L61 38 L96 38 L68 59 L79 94 L50 72 L21 94 L32 59 L4 38 L39 38 Z" style="fill:var(--kc);stroke:#000;stroke-width:4;stroke-linejoin:round"/>', 'nb-star');
  };
  PL.memphis = function (s) {
    return decoSVG('memphis') +
      '<h1 class="hd mp-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="mp-date hd">' + DATE + '</div>' +
      '<div class="mp-info bd">Olympic Park · 19:00<br>Moonlight Quartet · Hana Kim Trio</div>';
  };
  PL.y2k = function (s) {
    return decoSVG('y2k') +
      '<h1 class="hd y2-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="y2-pill bd">' + DATE + ' ✦ 19:00</div>' +
      '<div class="y2-info bd">Olympic Park · 88 Lawn</div>';
  };
  PL.glass = function (s) {
    return decoSVG('blobs') +
      '<div class="gl-card sf"><div class="gl-kick bd">Live under the stars</div><h1 class="hd gl-h">' + HL(s, '<br>') + '</h1>' +
      '<div class="gl-row bd"><span class="gl-chip sf">' + DATE + '</span><span class="gl-chip sf">19:00</span></div>' +
      '<div class="gl-list bd">' + LINEUP.join('<br>') + '</div></div>' +
      '<div class="gl-foot sf bd">Olympic Park · 88 Lawn</div>';
  };
  PL.neu = function (s) {
    return '<div class="nu-card sf"><div class="nu-disc sf"><div class="nu-play"></div></div>' +
      '<h1 class="hd nu-h">' + HL(s, '<br>') + '</h1><div class="nu-date bd">' + DATE + '</div>' +
      '<div class="nu-bar"><i></i></div><div class="nu-row bd"><span class="nu-btn sf">Tickets</span><span class="nu-btn sf">Line-up</span></div></div>';
  };
  PL.clay = function (s) {
    return decoSVG('claybits') +
      '<div class="cl-card sf"><h1 class="hd cl-h">' + HL(s, '<br>') + '</h1><div class="cl-date bd">' + DATE + '</div></div>' +
      '<div class="cl-vis">' + subjectSVG('sax', 'clay', s) + '</div>' +
      '<div class="cl-pill sf bd">Olympic Park · 19:00</div>';
  };
  PL.flat = function (s) {
    return decoSVG('flat') + vis(s, 'sax', 250, 'left:75px;top:56px') +
      '<h1 class="hd fl-h">' + HL(s) + '</h1>' +
      '<div class="fl-row bd"><span>' + DATE + '</span><span>Olympic Park · 19:00</span></div>';
  };
  PL.skeuo = function () {
    return '<div class="sk-wood"></div>' +
      '<div class="sk-rec"><div class="sk-lbl"><b>Seoul<br>Jazz Night</b><span>33⅓ RPM · SIDE A</span></div></div>' +
      '<div class="sk-ticket"><div class="sk-tl"><div class="sk-k">Admit one</div><div class="sk-t">Seoul Jazz Night</div><div class="sk-d">' + DATE + ' · 19:00 · Olympic Park</div></div><div class="sk-stub">No.<br><b>0117</b></div></div>';
  };
  PL.deco = function (s) {
    return decoSVG('deco') +
      '<div class="dc-kick bd">The Grand Evening of</div>' +
      '<h1 class="hd dc-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="dc-date bd">' + DATE + '</div>' +
      '<div class="dc-info bd">Olympic Park · Nineteen Hundred Hours</div>';
  };
  PL.nouveau = function (s) {
    return decoSVG('nouveau') +
      '<div class="nv-vis">' + subjectSVG('sax', s.illus || 'line', s) + '</div>' +
      '<h1 class="hd nv-h">' + HL(s) + '</h1>' +
      '<div class="nv-date bd">' + DATE + '</div>' +
      '<div class="nv-info bd">An evening of music in Olympic Park</div>';
  };
  PL.minimal = function (s) {
    return '<div class="mn-dot"></div>' +
      '<h1 class="hd mn-h">' + HL(s) + '</h1>' +
      '<div class="mn-rule"></div>' +
      '<div class="mn-date bd">' + DATE + '</div>';
  };
  PL.maximal = function (s) {
    return decoSVG('maximal') +
      '<div class="mx-kick bd">★ One night only ★ Live ★ Outdoor ★</div>' +
      '<h1 class="hd mx-h1">' + W(s)[0] + '</h1>' +
      '<div class="mx-h2">' + W(s)[1] + '</div>' +
      '<div class="mx-h3">' + W(s)[2] + '</div>' +
      vis(s, 'sax', 170, 'left:200px;top:250px;transform:rotate(12deg)') +
      '<div class="mx-date bd">' + DATE + '</div>' +
      '<div class="mx-stk bd">FREE<br>WINE</div>';
  };
  PL.constructivist = function (s) {
    return decoSVG('constructivist') +
      '<h1 class="hd cv-h">' + HL(s) + '</h1>' +
      '<div class="cv-date hd">' + DATE + '</div>' +
      '<div class="cv-info bd">OLYMPIC PARK<br>19:00</div>';
  };
  PL.destijl = function (s) {
    return decoSVG('destijl') +
      '<h1 class="hd dj-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="dj-date hd">' + DATE + '</div>' +
      '<div class="dj-info bd">Olympic Park<br>19:00</div>';
  };
  PL.midcentury = function (s) {
    return decoSVG('midcentury') +
      '<h1 class="hd mc-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="mc-date bd">' + DATE + '</div>' +
      '<div class="mc-info bd">Olympic Park · Cocktails at seven</div>';
  };
  PL.psychedelic = function (s) {
    return decoSVG('psychedelic') +
      '<h1 class="hd ps-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="ps-date hd">' + DATE + '</div>';
  };
  PL.vapor = function (s) {
    return decoSVG('vapor') +
      '<div class="vp-jp bd">ソウル・ジャズ・ナイト</div>' +
      '<h1 class="hd vp-h">' + HL(s) + '</h1>' +
      '<div class="vp-date bd">' + DATE + '</div>';
  };
  PL.retrofuture = function (s) {
    return decoSVG('retrofuture') +
      '<div class="rf-kick bd">Tomorrow\'s sound, tonight</div>' +
      '<h1 class="hd rf-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="rf-date bd">' + DATE + ' · Olympic Park</div>';
  };
  /* typography-driven */
  PL.hierarchy = function (s) {
    return '<div class="hi-1 bd">Jazz Festival · Edition 11</div>' +
      '<h1 class="hd hi-h">' + W(s).slice(0, 2).join(' ') + '<br>' + W(s)[2] + '</h1>' +
      '<div class="hi-date hd">' + DATE + '</div>' +
      '<div class="hi-3 bd"><b>Line-up</b><br>' + LINEUP.join('<br>') + '</div>' +
      '<div class="hi-4 bd">Olympic Park 88 Lawn · Doors 18:30 · seouljazznight.kr</div>';
  };
  PL.oversized = function (s) {
    return '<h1 class="hd ov-h">' + W(s)[1] + '</h1>' +
      '<div class="ov-s bd">' + W(s)[0] + ' ' + W(s)[1] + ' ' + W(s)[2] + '</div>' +
      '<div class="ov-date hd">' + DATE + '</div>';
  };
  PL.outline = function (s) {
    var w = W(s)[1];
    return '<div class="ot">' + [0, 1, 2, 3, 4].map(function (i) { return '<div class="hd ot-l' + (i === 2 ? ' ot-f' : '') + '">' + (i === 2 ? HL(s) : w + ' ' + w) + '</div>'; }).join('') + '</div>' +
      '<div class="ot-date bd">' + DATE + ' · Olympic Park</div>';
  };
  PL.stack = function (s) {
    return '<h1 class="hd st-h">' + W(s).join('<br>') + '</h1>' +
      '<p class="st-p bd">Three bands, one long night. On November 20 the 88 Lawn turns into a listening room under the open sky.</p>' +
      '<div class="st-date bd">' + DATE + '</div>';
  };
  PL.spaced = function (s) {
    return '<div class="sp-rule"></div><h1 class="hd sp-h">' + HL(s) + '</h1><div class="sp-rule"></div>' +
      '<div class="sp-date bd">' + DATE + '</div>';
  };
  /* layout & grid */
  PL.modular = function (s) {
    var g = '';
    for (var c = 1; c < 4; c++) g += '<line x1="' + (28 + c * 86) + '" y1="28" x2="' + (28 + c * 86) + '" y2="472"/>';
    for (var r = 1; r < 6; r++) g += '<line x1="28" y1="' + (28 + r * 74) + '" x2="372" y2="' + (28 + r * 74) + '"/>';
    return svgWrap('0 0 400 500', '<g style="stroke:var(--kb);stroke-width:.6;stroke-dasharray:3 3">' + g + '<rect x="28" y="28" width="344" height="444" style="fill:none"/></g>' +
      '<rect x="28" y="28" width="172" height="148" style="fill:var(--ka)"/><rect x="286" y="250" width="86" height="74" style="fill:var(--kc)"/><circle cx="329" cy="65" r="37" style="fill:var(--kfg)"/>', 'layer') +
      '<div class="md-n hd">11</div>' +
      '<h1 class="hd md-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="md-a bd"><b>' + DATE + '</b><br>Friday 19:00</div>' +
      '<div class="md-b bd"><b>Line-up</b><br>' + LINEUP.join('<br>') + '</div>' +
      '<div class="md-c bd"><b>Venue</b><br>Olympic Park<br>88 Lawn</div>';
  };
  PL.baseline = function (s) {
    var g = '';
    for (var y = 36; y < 500; y += 12) g += '<line x1="0" y1="' + y + '" x2="400" y2="' + y + '"/>';
    return svgWrap('0 0 400 500', '<g style="stroke:#3aa0ff;stroke-width:.5;opacity:.55">' + g + '</g>', 'layer') +
      '<div class="bl"><h1 class="hd bl-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="bl-date bd">' + DATE + '</div>' +
      '<p class="bl-p bd">Three bands, one long night. On November 20 the 88 Lawn turns into a listening room. Bring a blanket, the city keeps time.</p>' +
      '<p class="bl-p bd">Moonlight Quartet · Hana Kim Trio · The Blue Hour Big Band</p></div>';
  };
  PL.asym = function (s) {
    return svgWrap('0 0 400 500', '<circle cx="70" cy="420" r="16" style="fill:var(--ka)"/><rect x="250" y="40" width="1" height="200" style="fill:var(--kfg)"/>', 'layer') +
      '<div class="as-v bd">' + DATE + ' — Olympic Park</div>' +
      '<h1 class="hd as-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="as-i bd">Moonlight Quartet<br>Hana Kim Trio<br>The Blue Hour Big Band</div>';
  };
  PL.symmetric = function (s) {
    return svgWrap('0 0 400 500', '<rect x="20" y="20" width="360" height="460" style="fill:none;stroke:var(--kfg);stroke-width:1.2"/><rect x="28" y="28" width="344" height="444" style="fill:none;stroke:var(--kfg);stroke-width:.5"/><line x1="120" y1="306" x2="280" y2="306" style="stroke:var(--kfg)"/>' + burst(200, 74, 14, 12, 'var(--ka)', 1.6), 'layer') +
      '<div class="sy-vis">' + subjectSVG('sax', s.illus || 'flat', s) + '</div>' +
      '<h1 class="hd sy-h">' + HL(s) + '</h1>' + EN(s, 'sy-en') +
      '<div class="sy-row bd"><span>Nov</span><b class="hd">20</b><span>2026</span></div>' +
      '<div class="sy-f bd">Olympic Park · 19:00</div>';
  };
  PL.whitespace = function (s) {
    return '<div class="ws-vis">' + subjectSVG('sax', s.illus || 'flat', s) + '</div>' +
      '<h1 class="hd ws-h">' + HL(s) + '</h1><div class="ws-date bd">' + DATE + '</div>';
  };
  PL.split = function (s) {
    return '<div class="spl-l"><h1 class="hd spl-h">' + W(s)[1] + '</h1></div>' +
      '<div class="spl-r"><div class="spl-k bd">' + W(s)[0] + ' · ' + W(s)[2] + '</div>' +
      '<div class="spl-vis">' + subjectSVG('sax', s.illus || 'flat', s) + '</div>' +
      '<div class="spl-date hd">' + DATE + '</div><div class="spl-i bd">Olympic Park<br>19:00</div></div>';
  };
  PL.fullbleed = function (s) {
    return photo(s, 'street.jpg', 'inset:0;width:100%;height:100%') + '<div class="fb-scrim"></div>' +
      '<h1 class="hd fb-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="fb-date bd">' + DATE + ' · Olympic Park</div>';
  };
  PL.masonry = function (s) {
    return '<div class="ms">' +
      '<div class="ms-c" style="height:170px;background:var(--ka)"><h1 class="hd ms-h">' + HL(s, '<br>') + '</h1></div>' +
      '<div class="ms-c ms-img" style="height:120px"><img src="assets/primary/portrait.jpg" alt=""></div>' +
      '<div class="ms-c" style="height:90px;background:var(--kc)"><b class="hd">' + DATE + '</b></div>' +
      '<div class="ms-c" style="height:112px;background:var(--kfg);color:var(--kbg)"><span class="bd">Moonlight Quartet<br>Hana Kim Trio<br>The Blue Hour</span></div>' +
      '<div class="ms-c" style="height:140px;background:var(--kb)">' + subjectSVG('sax', 'flat', s) + '</div>' +
      '<div class="ms-c" style="height:80px;background:var(--kc)"><span class="bd">Olympic Park · 19:00</span></div>' +
      '</div>';
  };
  PL.golden = function (s) {
    var o = '<circle cx="324" cy="250" r="58" style="fill:var(--kc)"/>' +
      '<g style="fill:none;stroke:var(--ka);stroke-width:.9;opacity:.8"><line x1="0" y1="309" x2="400" y2="309"/><line x1="247" y1="0" x2="247" y2="309"/><line x1="247" y1="191" x2="400" y2="191"/><line x1="306" y1="191" x2="306" y2="309"/>' +
      '<path d="M0 309 A247 247 0 0 1 247 62"/><path d="M247 62 A153 129 0 0 1 400 191"/><path d="M400 191 A94 118 0 0 1 306 309"/><path d="M306 309 A58 58 0 0 1 247 250"/></g>' +
      '<text x="252" y="20" style="font:9px ' + "'Space Mono',monospace" + ';fill:var(--ka)">1 : 1.618</text>';
    return svgWrap('0 0 400 500', o, 'layer') +
      vis(s, 'sax', 130, 'left:262px;top:180px') +
      '<h1 class="hd gr-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="gr-date bd">' + DATE + '</div><div class="gr-i bd">Olympic Park · 88 Lawn · 19:00</div>';
  };
  PL.editorial = function (s) {
    return '<div class="ed-mast"><span class="bd">No. 11 — November 2026</span><span class="bd">Seoul</span></div>' +
      '<h1 class="hd ed-h">' + HL(s) + '</h1>' +
      '<div class="ed-ph"><img src="assets/primary/portrait.jpg" alt=""></div>' +
      '<div class="ed-cols bd"><p><span class="ed-cap hd">O</span>n November 20 the 88 Lawn turns into a listening room. Three bands, one long night, and a city that keeps time with them.</p>' +
      '<p class="ed-q hd">“Bring a coat. Stay for the encore.”</p><p>Doors 18:30. Moonlight Quartet opens at 19:00, Hana Kim Trio and The Blue Hour Big Band follow.</p></div>' +
      '<div class="ed-foot bd">' + DATE + ' · Olympic Park</div>';
  };
  PL.vhier = function (s) {
    return svgWrap('0 0 400 500', '<circle cx="200" cy="190" r="150" style="fill:var(--ka)"/>', 'layer') +
      vis(s, 'sax', 220, 'left:90px;top:80px') +
      '<h1 class="hd vh-h">' + HL(s) + '</h1>' +
      '<div class="vh-d bd">' + DATE + '</div><div class="vh-i bd">Olympic Park · 19:00 · seouljazznight.kr</div>';
  };
  PL.collage = function (s) {
    var L = HL(s).split('');
    var fonts = [F.abril, F.bebas, F.times, F.archivoBlack, F.pacifico, F.spacemono];
    var bgs = ['var(--ka)', '#fff', 'var(--kfg)', 'var(--kc)', '#fff', 'var(--kb)'];
    var R = rng(5);
    var letters = L.map(function (ch, i) {
      if (ch === ' ') return '<span style="display:inline-block;width:10px"></span>';
      var bg = bgs[i % 6], fg = bg === 'var(--kfg)' ? '#fff' : '#111';
      return '<span class="cg-l" style="font-family:' + fonts[i % 6] + ';background:' + bg + ';color:' + fg + ';transform:rotate(' + f1((R() - 0.5) * 14) + 'deg)">' + ch + '</span>';
    }).join('');
    return '<div class="cg-paper" style="left:-20px;top:40px;width:250px;height:200px;background:var(--kc);transform:rotate(-6deg)"></div>' +
      '<div class="cg-ph" style="left:170px;top:70px;transform:rotate(5deg)"><img src="assets/primary/portrait.jpg" alt=""></div>' +
      '<div class="cg-tape" style="left:210px;top:60px;transform:rotate(-12deg)"></div>' +
      '<div class="cg-paper cg-news bd" style="left:30px;top:300px;width:170px;transform:rotate(3deg)">THE 88 LAWN TURNS INTO A LISTENING ROOM — THREE BANDS, ONE LONG NIGHT — BRING A COAT —</div>' +
      vis(s, 'sax', 150, 'left:220px;top:300px;transform:rotate(-18deg)') +
      '<h1 class="cg-h">' + letters + '</h1>' +
      '<div class="cg-date bd">' + DATE + '</div>';
  };
  /* text-render */
  PL.textfocus = function (s) {
    return '<div class="tf-box"><h1 class="hd tf-h">' + HL(s) + '</h1><div class="tf-date bd">' + DATE + '</div></div>' +
      vis(s, 'sax', 120, 'left:140px;bottom:36px');
  };
  PL.placement = function (s) {
    return '<div class="pl-top"><h1 class="hd pl-h">' + HL(s) + '</h1></div>' +
      vis(s, 'sax', 240, 'left:80px;top:120px') +
      '<div class="pl-date hd">' + DATE + '</div>' +
      '<div class="pl-tag bd">TOP · CENTER<br>BOTTOM · RIGHT</div>';
  };
  PL.short = function (s) {
    return vis(s, 'sax', 230, 'left:85px;top:50px') +
      '<h1 class="hd sh-h">' + HL(s) + '</h1><div class="sh-date bd">' + DATE + '</div>';
  };
  PL.bento = function (s) {
    return '<div class="bt">' +
      '<div class="bt-c bt-a"><h1 class="hd">' + HL(s, '<br>') + '</h1></div>' +
      '<div class="bt-c bt-b"><b class="hd">20</b><span class="bd">NOV 2026</span></div>' +
      '<div class="bt-c bt-v">' + subjectSVG('sax', s.illus || 'flat', s) + '</div>' +
      '<div class="bt-c bt-d bd"><b>Line-up</b>' + LINEUP.join('<br>') + '</div>' +
      '<div class="bt-c bt-e bd">Olympic Park<br>19:00</div>' +
      '</div>';
  };

  var POSTER_CSS =
    '.pst .visw{pointer-events:none}.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.c-wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px}' +
    '.c-kick{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--kmut);margin-bottom:18px}' +
    '.c-h{font-size:calc(46px * var(--hsc))}.c-en{font-size:12px;letter-spacing:.14em;margin-top:6px;color:var(--kmut)}' +
    '.c-date{font-size:20px;margin-top:14px;letter-spacing:.04em}' +
    '.c-foot{position:absolute;bottom:34px;left:0;right:0;font-size:10.5px;line-height:1.6;color:var(--kmut)}' +
    /* designed */
    '.ds-top{position:absolute;top:22px;left:28px;right:28px;display:flex;justify-content:space-between;font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-weight:600}' +
    '.ds-h{position:absolute;left:26px;top:52px;font-size:calc(66px * var(--hsc));line-height:calc(var(--hlh) * .88)}' +
    '.ds-en{position:absolute;left:28px;top:262px;font-size:12px;letter-spacing:.16em;text-transform:uppercase}' +
    '.ds-date{position:absolute;left:28px;top:292px}.ds-date b{display:block;font-size:52px;line-height:1;color:var(--ka)}.ds-date span{font-size:10.5px;letter-spacing:.12em}' +
    '.ds-band{position:absolute;left:0;right:0;bottom:0;height:104px;padding:18px 28px;display:flex;justify-content:space-between;background:var(--kfg);color:var(--kbg);font-size:12px;line-height:1.55}' +
    '.ds-ven{text-align:right;opacity:.8}' +
    /* illus */
    '.il-art{position:absolute;left:0;top:14px;width:400px;height:330px}' +
    '.il-txt{position:absolute;left:28px;right:28px;bottom:28px}.il-h{font-size:calc(42px * var(--hsc))}.il-en{font-size:11px;letter-spacing:.14em;margin-top:4px}' +
    '.il-row{display:flex;justify-content:space-between;margin-top:12px;font-size:12px;border-top:1.5px solid var(--kfg);padding-top:10px}' +
    /* swiss */
    '.sw-head{position:absolute;top:26px;left:28px;right:28px;display:grid;grid-template-columns:repeat(3,1fr);font-size:9.5px;line-height:1.35;font-weight:600}' +
    '.sw-h{position:absolute;left:24px;top:146px;font-size:calc(58px * var(--hsc));line-height:calc(var(--hlh) * .86);mix-blend-mode:multiply}' +
    '.sw-cols{position:absolute;left:28px;right:28px;top:314px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:10px;line-height:1.5}' +
    '.sw-foot{position:absolute;left:28px;bottom:26px;font-size:9.5px;font-weight:600}' +
    /* bauhaus */
    '.bh-h{position:absolute;left:26px;top:318px;font-size:calc(46px * var(--hsc));line-height:calc(var(--hlh) * .86)}' +
    '.bh-date{position:absolute;right:24px;bottom:28px;writing-mode:vertical-rl;transform:rotate(180deg);font-size:24px;color:var(--ka)}' +
    '.bh-info{position:absolute;left:28px;bottom:20px;font-size:9.5px;letter-spacing:.06em}' +
    /* brutal */
    '.br{position:absolute;inset:0;padding:10px;display:flex;flex-direction:column;gap:0}' +
    '.br-row{border:2px solid #000;border-top:0;padding:6px 8px;display:flex;gap:14px;font-size:11px}' +
    '.br-top{border-top:2px solid #000;justify-content:space-between}' +
    '.br-h{border:2px solid #000;border-top:0;padding:8px;font-size:calc(70px * var(--hsc));line-height:.86;word-break:break-all}' +
    '.br-date{font-size:40px;padding:4px 8px}' +
    '.br-t{border-collapse:collapse;width:100%;font-size:11px}.br-t td{border:2px solid #000;border-top:0;padding:6px 8px}.br-t td:first-child{width:62px}' +
    '.br-links a{color:#0000ee;text-decoration:underline}.br-hl{background:#ffff00;margin-left:auto;padding:0 4px}' +
    /* neo-brutal */
    '.nb-dots{position:absolute;inset:0;background:radial-gradient(#000 1.2px,transparent 1.4px) 0 0/16px 16px;opacity:.18}' +
    '.nb-card{position:absolute;left:28px;top:44px;width:310px;padding:22px 22px 26px;transform:rotate(-2.5deg)}' +
    '.nb-tag{display:inline-block;font-size:10px;font-weight:700;border:2px solid #000;border-radius:99px;padding:3px 9px;background:#fff;margin-bottom:12px}' +
    '.nb-h{font-size:calc(50px * var(--hsc));line-height:calc(var(--hlh) * .9)}' +
    '.nb-date{position:absolute;left:150px;top:236px;padding:10px 16px;font-size:28px;transform:rotate(3deg)}' +
    '.nb-list{position:absolute;left:28px;top:318px;display:flex;flex-wrap:wrap;gap:10px;width:330px;font-size:13px;font-weight:700}.nb-list span{padding:7px 12px;border-radius:99px!important;box-shadow:3px 3px 0 #000!important}' +
    '.nb-btn{position:absolute;left:28px;bottom:36px;padding:12px 20px;font-size:15px;font-weight:700}' +
    '.nb-star{position:absolute;right:20px;top:200px;width:84px;height:84px;transform:rotate(14deg)}' +
    /* memphis */
    '.mp-h{position:absolute;left:46px;top:110px;font-size:calc(62px * var(--hsc));line-height:calc(var(--hlh) * .9);text-shadow:4px 4px 0 var(--kfg);color:#fff;-webkit-text-stroke:2px var(--kfg)}' +
    '.mp-date{position:absolute;left:46px;top:316px;font-size:22px;background:var(--kc);padding:6px 14px;border:3px solid var(--kfg);transform:rotate(-4deg)}' +
    '.mp-info{position:absolute;left:150px;top:386px;font-size:11px;line-height:1.6;font-weight:600}' +
    /* y2k */
    '.y2-h{position:absolute;left:0;right:0;top:132px;text-align:center;font-size:calc(52px * var(--hsc));line-height:calc(var(--hlh) * .95);background:linear-gradient(180deg,#ffffff 0%,#b9c4d6 42%,#36404f 50%,#dfe7f2 72%,#ffffff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.5px #4b5a7a;filter:drop-shadow(0 4px 10px rgba(80,90,200,.35))}' +
    '.y2-pill{position:absolute;left:50%;top:342px;transform:translateX(-50%);padding:9px 22px;border-radius:99px;font-size:14px;font-weight:700;color:#1d2a6b;background:linear-gradient(180deg,#ffffff,#c8d6ff 50%,#9fb4ff 51%,#e2e9ff);border:1.5px solid #7d8fdc;box-shadow:inset 0 2px 0 #fff,0 6px 16px rgba(60,80,200,.25);white-space:nowrap}' +
    '.y2-info{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#4b5a7a}' +
    /* glass */
    '.gl-card{position:absolute;left:40px;right:40px;top:90px;padding:26px 24px}' +
    '.gl-kick{font-size:10px;letter-spacing:.2em;text-transform:uppercase;opacity:.85}' +
    '.gl-h{font-size:calc(46px * var(--hsc));margin:10px 0 16px;line-height:calc(var(--hlh) * .92)}' +
    '.gl-row{display:flex;gap:8px}.gl-chip{padding:6px 12px;font-size:12px;font-weight:600;border-radius:99px!important}' +
    '.gl-list{margin-top:18px;font-size:12px;line-height:1.7;opacity:.9}' +
    '.gl-foot{position:absolute;left:40px;right:40px;bottom:36px;padding:12px 18px;font-size:12px;text-align:center;border-radius:16px!important}' +
    /* neu */
    '.nu-card{position:absolute;left:44px;right:44px;top:44px;bottom:44px;padding:30px 28px;text-align:center}' +
    '.nu-disc{width:120px;height:120px;border-radius:50%!important;margin:0 auto 26px;display:flex;align-items:center;justify-content:center}' +
    '.nu-play{width:0;height:0;border-left:26px solid var(--ka);border-top:16px solid transparent;border-bottom:16px solid transparent;margin-left:8px}' +
    '.nu-h{font-size:calc(34px * var(--hsc));color:var(--kfg)}.nu-date{margin-top:10px;font-size:14px;color:var(--kmut);letter-spacing:.08em}' +
    '.nu-bar{height:10px;border-radius:99px;margin:22px 6px 0;box-shadow:inset 3px 3px 6px rgba(163,177,198,.8),inset -3px -3px 6px #fff}.nu-bar i{display:block;width:42%;height:100%;border-radius:99px;background:var(--ka)}' +
    '.nu-row{display:flex;gap:14px;justify-content:center;margin-top:22px}.nu-btn{padding:10px 18px;font-size:12px;font-weight:700;color:var(--kmut);border-radius:14px!important}' +
    /* clay */
    '.cl-card{position:absolute;left:36px;right:36px;top:56px;padding:26px;text-align:center}' +
    '.cl-h{font-size:calc(42px * var(--hsc));color:var(--kfg);line-height:calc(var(--hlh) * .95)}.cl-date{margin-top:10px;font-size:15px;font-weight:600;color:var(--ka)}' +
    '.cl-vis{position:absolute;left:110px;top:224px;width:190px;height:190px}' +
    '.cl-pill{position:absolute;left:96px;right:96px;bottom:36px;padding:12px;text-align:center;font-size:13px;font-weight:600;border-radius:99px!important;background:var(--kb)!important;color:#fff}' +
    /* flat */
    '.fl-h{position:absolute;left:24px;right:24px;top:330px;text-align:center;font-size:calc(40px * var(--hsc));color:var(--kfg)}' +
    '.fl-row{position:absolute;left:24px;right:24px;bottom:30px;display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#fff}' +
    /* skeuo */
    '.sk-wood{position:absolute;inset:0;background:repeating-linear-gradient(92deg,rgba(0,0,0,.08) 0 2px,transparent 2px 9px),repeating-linear-gradient(88deg,rgba(255,255,255,.05) 0 1px,transparent 1px 23px),linear-gradient(180deg,#7a4a2a,#5a331b 60%,#4a2914)}' +
    '.sk-rec{position:absolute;left:40px;top:30px;width:300px;height:300px;border-radius:50%;background:repeating-radial-gradient(circle,#111 0 1.4px,#1d1d1d 1.4px 3px),#111;box-shadow:0 18px 30px rgba(0,0,0,.55),inset 0 0 0 6px #0b0b0b}' +
    '.sk-rec::after{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 30deg,transparent 0 40deg,rgba(255,255,255,.14) 60deg,transparent 80deg 220deg,rgba(255,255,255,.1) 240deg,transparent 260deg)}' +
    '.sk-lbl{position:absolute;left:95px;top:95px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,#111 0 4px,#d9a441 5px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:' + F.playfair + ';color:#3a230f;z-index:1}' +
    '.sk-lbl b{font-size:13px;line-height:1.05;margin-top:-34px;margin-bottom:38px}.sk-lbl span{font-size:6px;letter-spacing:.12em;font-family:' + F.sys + '}' +
    '.sk-ticket{position:absolute;left:58px;top:330px;width:300px;height:118px;display:flex;transform:rotate(-5deg);filter:drop-shadow(0 10px 12px rgba(0,0,0,.45))}' +
    '.sk-tl{flex:1;padding:14px 16px;background:linear-gradient(#f8eed5,#ecdcb4);border-radius:8px 0 0 8px;font-family:' + F.playfair + ';color:#5a2a12;border-right:2px dashed #b89a62}' +
    '.sk-k{font-size:9px;letter-spacing:.3em;text-transform:uppercase;font-family:' + F.sys + '}.sk-t{font-size:26px;font-weight:700;margin:4px 0;text-shadow:0 1px 0 rgba(255,255,255,.7)}.sk-d{font-size:10px;font-family:' + F.sys + '}' +
    '.sk-stub{width:72px;background:linear-gradient(#f3e3bc,#e3cd97);border-radius:0 8px 8px 0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:9px;color:#5a2a12;font-family:' + F.sys + '}.sk-stub b{font-size:18px;font-family:' + F.courier + '}' +
    /* deco */
    '.dc-kick{position:absolute;left:0;right:0;top:204px;text-align:center;font-size:10px;letter-spacing:.42em;text-transform:uppercase;color:var(--ka)}' +
    '.dc-h{position:absolute;left:0;right:0;top:224px;text-align:center;font-size:calc(44px * var(--hsc));line-height:calc(var(--hlh) * .95);color:var(--ka)}' +
    '.dc-date{position:absolute;left:0;right:0;top:388px;text-align:center;font-size:18px;letter-spacing:.32em;color:var(--kfg)}' +
    '.dc-info{position:absolute;left:0;right:0;bottom:40px;text-align:center;font-size:8.5px;letter-spacing:.3em;text-transform:uppercase;color:var(--ka)}' +
    /* nouveau */
    '.nv-vis{position:absolute;left:120px;top:96px;width:160px;height:160px}' +
    '.nv-h{position:absolute;left:60px;right:60px;top:330px;text-align:center;font-size:calc(36px * var(--hsc));color:var(--kfg)}' +
    '.nv-date{position:absolute;left:0;right:0;top:396px;text-align:center;font-size:14px;letter-spacing:.3em;color:var(--ka)}' +
    '.nv-info{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:11px;font-style:italic;color:var(--kmut)}' +
    /* minimal */
    '.mn-dot{position:absolute;left:44px;top:60px;width:10px;height:10px;border-radius:50%;background:var(--ka)}' +
    '.mn-h{position:absolute;left:44px;bottom:84px;font-size:calc(17px * var(--hsc))}' +
    '.mn-rule{position:absolute;left:44px;right:44px;bottom:70px;height:1px;background:var(--kfg)}' +
    '.mn-date{position:absolute;left:44px;bottom:48px;font-size:10px;letter-spacing:.14em;color:var(--kmut)}' +
    /* maximal */
    '.mx-kick{position:absolute;left:0;right:0;top:14px;text-align:center;font-size:10px;font-weight:800;letter-spacing:.12em;background:var(--kfg);color:var(--kc);padding:5px 0}' +
    '.mx-h1{position:absolute;left:18px;top:52px;font-size:calc(74px * var(--hsc));color:var(--kfg);text-shadow:4px 4px 0 var(--kc),8px 8px 0 var(--ka)}' +
    '.mx-h2{position:absolute;left:30px;top:150px;font-family:' + F.pacifico + ';font-size:70px;color:var(--ka);transform:rotate(-8deg);text-shadow:3px 3px 0 var(--kfg)}' +
    '.mx-h3{position:absolute;left:40px;top:250px;font-family:' + F.bebas + ';font-size:90px;line-height:1;color:var(--kb);-webkit-text-stroke:2px var(--kfg)}' +
    '.mx-date{position:absolute;left:24px;bottom:36px;font-size:24px;font-weight:800;background:#fff;border:3px solid var(--kfg);padding:4px 12px;transform:rotate(-3deg)}' +
    '.mx-stk{position:absolute;right:26px;top:180px;width:76px;height:76px;border-radius:50%;background:var(--kc);border:3px solid var(--kfg);display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;font-weight:800;transform:rotate(14deg)}' +
    /* constructivist */
    '.cv-h{position:absolute;left:14px;top:352px;font-size:calc(54px * var(--hsc));line-height:1;transform:rotate(-28.6deg);transform-origin:0 0;color:var(--kbg);white-space:nowrap}' +
    '.cv-date{position:absolute;left:262px;top:392px;font-size:22px;color:var(--kbg);line-height:1.1;width:100px}' +
    '.cv-info{position:absolute;left:24px;bottom:24px;font-size:11px;font-weight:800;letter-spacing:.1em;line-height:1.4}' +
    /* de stijl */
    '.dj-h{position:absolute;left:170px;top:210px;font-size:calc(42px * var(--hsc));line-height:calc(var(--hlh) * .9)}' +
    '.dj-date{position:absolute;left:14px;top:206px;font-size:16px;writing-mode:vertical-rl;transform:rotate(180deg);height:200px}' +
    '.dj-info{position:absolute;left:166px;top:370px;font-size:10px;line-height:1.4;font-weight:700}' +
    /* mid-century */
    '.mc-h{position:absolute;left:34px;top:190px;font-size:calc(50px * var(--hsc));line-height:calc(var(--hlh) * .92);color:var(--kfg)}' +
    '.mc-date{position:absolute;left:36px;top:368px;font-size:16px;letter-spacing:.2em;font-weight:700;color:var(--ka)}' +
    '.mc-info{position:absolute;left:36px;top:396px;font-size:11px;letter-spacing:.06em;font-style:italic}' +
    /* psychedelic */
    '.ps-h{position:absolute;left:0;right:0;top:140px;text-align:center;font-size:calc(58px * var(--hsc));line-height:calc(var(--hlh) * .85);color:var(--kc);-webkit-text-stroke:2px var(--kfg);text-shadow:4px 4px 0 var(--kfg);transform:skewY(-6deg) scaleY(1.25)}' +
    '.ps-date{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:24px;color:var(--kbg);-webkit-text-stroke:1px var(--kfg)}' +
    /* vapor */
    '.vp-jp{position:absolute;left:0;right:0;top:44px;text-align:center;font-size:13px;letter-spacing:.3em;color:#01cdfe}' +
    '.vp-h{position:absolute;left:0;right:0;top:78px;text-align:center;font-size:calc(40px * var(--hsc));color:#fff;text-shadow:3px 3px 0 #ff71ce,6px 6px 0 #01cdfe}' +
    '.vp-date{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:16px;letter-spacing:.4em;color:#fff35c}' +
    /* retro-futurism */
    '.rf-kick{position:absolute;left:30px;top:286px;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--kc)}' +
    '.rf-h{position:absolute;left:28px;top:304px;font-size:calc(46px * var(--hsc));line-height:calc(var(--hlh) * .9);background:linear-gradient(180deg,#fff2c8,var(--kc) 45%,var(--ka));-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.rf-date{position:absolute;left:30px;bottom:26px;font-size:11px;letter-spacing:.2em;color:#cfe8ff}' +
    /* typography layouts */
    '.hi-1{position:absolute;left:30px;top:34px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--kmut)}' +
    '.hi-h{position:absolute;left:28px;top:62px;font-size:calc(64px * var(--hsc));line-height:calc(var(--hlh) * .9)}' +
    '.hi-date{position:absolute;left:30px;top:220px;font-size:30px;color:var(--ka)}' +
    '.hi-3{position:absolute;left:30px;top:300px;font-size:14px;line-height:1.55}' +
    '.hi-4{position:absolute;left:30px;bottom:28px;font-size:9px;color:var(--kmut);letter-spacing:.04em}' +
    '.ov-h{position:absolute;left:-14px;top:40px;font-size:calc(210px * var(--hsc));line-height:.8;writing-mode:vertical-rl;transform:rotate(180deg);height:470px}' +
    '.ov-s{position:absolute;right:28px;top:40px;width:120px;font-size:14px;font-weight:700;line-height:1.3;text-align:right}' +
    '.ov-date{position:absolute;right:28px;bottom:30px;font-size:26px;text-align:right}' +
    '.ot{position:absolute;left:-10px;right:-10px;top:56px}.ot-l{font-size:calc(58px * var(--hsc));line-height:1.12;white-space:nowrap;color:transparent;-webkit-text-stroke:1.4px var(--kfg)}.ot-f{color:var(--ka);-webkit-text-stroke:0;padding-left:20px;font-size:calc(46px * var(--hsc))}' +
    '.ot-date{position:absolute;left:28px;bottom:28px;font-size:12px;letter-spacing:.12em}' +
    '.st-h{position:absolute;left:28px;top:44px;font-size:calc(72px * var(--hsc))}' +
    '.st-p{position:absolute;left:30px;right:120px;top:318px;font-size:12px;line-height:1.75}' +
    '.st-date{position:absolute;left:30px;bottom:30px;font-size:13px;font-weight:700}' +
    '.sp-rule{width:220px;height:1px;background:var(--kfg);margin:0 auto}' +
    '.ly-spaced{display:flex;flex-direction:column;justify-content:center;gap:22px}' +
    '.sp-h{text-align:center;font-size:calc(22px * var(--hsc));padding-left:.5em}' +
    '.sp-date{position:absolute;left:0;right:0;bottom:44px;text-align:center;font-size:10px;letter-spacing:.6em;padding-left:.6em}' +
    /* grids */
    '.md-n{position:absolute;left:40px;top:34px;font-size:96px;line-height:1;color:var(--kbg)}' +
    '.md-h{position:absolute;left:30px;top:186px;font-size:calc(50px * var(--hsc));line-height:calc(var(--hlh) * .9)}' +
    '.md-a{position:absolute;left:30px;top:360px;width:80px;font-size:10px;line-height:1.45}' +
    '.md-b{position:absolute;left:116px;top:360px;width:160px;font-size:10px;line-height:1.45}' +
    '.md-c{position:absolute;left:288px;top:360px;width:84px;font-size:10px;line-height:1.45}' +
    '.bl{position:absolute;left:30px;right:30px;top:36px}' +
    '.bl-h{font-size:calc(44px * var(--hsc));line-height:48px}.bl-date{font-size:12px;line-height:24px;margin-top:0;font-weight:700}' +
    '.bl-p{font-size:10px;line-height:12px;margin-top:12px!important;max-width:240px}' +
    '.as-v{position:absolute;left:30px;top:40px;writing-mode:vertical-rl;font-size:10px;letter-spacing:.2em}' +
    '.as-h{position:absolute;right:28px;top:250px;text-align:right;font-size:calc(52px * var(--hsc));line-height:calc(var(--hlh) * .88)}' +
    '.as-i{position:absolute;right:30px;bottom:30px;text-align:right;font-size:10px;line-height:1.5}' +
    '.sy-vis{position:absolute;left:130px;top:100px;width:140px;height:140px}' +
    '.sy-h{position:absolute;left:30px;right:30px;top:262px;text-align:center;font-size:calc(36px * var(--hsc))}' +
    '.sy-en{position:absolute;left:0;right:0;top:302px;text-align:center;font-size:11px;letter-spacing:.2em}' +
    '.sy-row{position:absolute;left:0;right:0;top:326px;display:flex;justify-content:center;align-items:center;gap:22px;font-size:11px;letter-spacing:.24em;text-transform:uppercase}.sy-row b{font-size:46px;letter-spacing:0}' +
    '.sy-f{position:absolute;left:0;right:0;bottom:44px;text-align:center;font-size:10px;letter-spacing:.24em;text-transform:uppercase}' +
    '.ws-vis{position:absolute;left:170px;top:150px;width:60px;height:60px}' +
    '.ws-h{position:absolute;left:0;right:0;top:300px;text-align:center;font-size:calc(15px * var(--hsc));letter-spacing:.06em}' +
    '.ws-date{position:absolute;left:0;right:0;top:324px;text-align:center;font-size:9px;letter-spacing:.2em;color:var(--kmut)}' +
    '.spl-l{position:absolute;left:0;top:0;bottom:0;width:180px;background:var(--kfg);overflow:hidden}' +
    '.spl-h{position:absolute;left:12px;bottom:20px;font-size:calc(120px * var(--hsc));line-height:.8;color:var(--kbg);writing-mode:vertical-rl;transform:rotate(180deg)}' +
    '.spl-r{position:absolute;left:180px;right:0;top:0;bottom:0;padding:30px 24px}' +
    '.spl-k{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}' +
    '.spl-vis{width:172px;height:172px;margin:44px 0 30px}' +
    '.spl-date{font-size:30px;color:var(--ka)}.spl-i{margin-top:8px;font-size:11px;line-height:1.5}' +
    '.fb-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.72))}' +
    '.fb-h{position:absolute;left:26px;bottom:62px;font-size:calc(56px * var(--hsc));line-height:calc(var(--hlh) * .88);color:#fff}' +
    '.fb-date{position:absolute;left:28px;bottom:30px;font-size:12px;letter-spacing:.14em;color:#fff}' +
    '.ms{position:absolute;inset:16px;columns:2;column-gap:12px}' +
    '.ms-c{break-inside:avoid;margin-bottom:12px;border-radius:10px;padding:14px;overflow:hidden;display:flex;align-items:flex-end;font-size:12px;line-height:1.5}' +
    '.ms-c .vis{width:100%;height:100%}.ms-h{font-size:calc(36px * var(--hsc));line-height:.95;color:var(--kbg)}.ms-c b{font-size:24px}' +
    '.ms-img{padding:0}.ms-img img{width:100%;height:100%;object-fit:cover}' +
    '.gr-h{position:absolute;left:24px;top:44px;font-size:calc(56px * var(--hsc));line-height:calc(var(--hlh) * .88)}' +
    '.gr-date{position:absolute;left:26px;top:324px;font-size:30px;font-weight:700}.gr-i{position:absolute;left:26px;top:364px;font-size:11px}' +
    '.ed-mast{position:absolute;left:24px;right:24px;top:18px;display:flex;justify-content:space-between;font-size:9px;letter-spacing:.16em;text-transform:uppercase;border-bottom:1px solid var(--kfg);padding-bottom:6px}' +
    '.ed-h{position:absolute;left:22px;right:22px;top:38px;font-size:calc(50px * var(--hsc));line-height:calc(var(--hlh) * .92)}' +
    '.ed-ph{position:absolute;left:24px;top:150px;width:200px;height:260px;overflow:hidden}.ed-ph img{width:100%;height:100%;object-fit:cover;filter:grayscale(.2)}' +
    '.ed-cols{position:absolute;left:236px;right:24px;top:150px;font-size:9.5px;line-height:1.5;text-align:justify;hyphens:auto}.ed-cols p{margin:0 0 8px}' +
    '.ed-cap{float:left;font-size:40px;line-height:.8;margin:2px 4px 0 0}.ed-q{font-size:16px;line-height:1.15;font-style:italic;text-align:left;border-top:1px solid;border-bottom:1px solid;padding:6px 0}' +
    '.ed-foot{position:absolute;left:24px;right:24px;bottom:22px;font-size:9px;letter-spacing:.16em;border-top:1px solid var(--kfg);padding-top:6px}' +
    '.vh-h{position:absolute;left:0;right:0;top:360px;text-align:center;font-size:calc(34px * var(--hsc))}' +
    '.vh-d{position:absolute;left:0;right:0;top:404px;text-align:center;font-size:15px;font-weight:700}.vh-i{position:absolute;left:0;right:0;bottom:24px;text-align:center;font-size:9px;color:var(--kmut)}' +
    '.cg-paper{position:absolute;box-shadow:0 3px 8px rgba(0,0,0,.25)}' +
    '.cg-news{background:#f1ead8;padding:10px;font-size:10px;font-family:' + F.times + ';line-height:1.3;color:#333}' +
    '.cg-ph{position:absolute;width:190px;height:220px;padding:8px;background:#fff;box-shadow:0 6px 14px rgba(0,0,0,.3)}.cg-ph img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.2)}' +
    '.cg-tape{position:absolute;width:90px;height:22px;background:rgba(255,240,180,.75)}' +
    '.cg-h{position:absolute;left:20px;right:20px;top:228px;font-size:30px;line-height:1.5;font-weight:400}' +
    '.cg-l{display:inline-block;padding:0 5px;margin:0 1px;box-shadow:1px 2px 3px rgba(0,0,0,.3)}' +
    '.cg-date{position:absolute;left:30px;bottom:26px;font-size:14px;font-weight:700;background:var(--kfg);color:var(--kbg);padding:3px 8px}' +
    '.tf-box{position:absolute;left:28px;right:28px;top:90px;border:3px solid var(--kfg);padding:30px 18px;text-align:center}' +
    '.tf-h{font-size:calc(50px * var(--hsc));line-height:calc(var(--hlh) * .95)}.tf-date{font-size:26px;margin-top:14px;font-weight:700;letter-spacing:.04em}' +
    '.pl-top{position:absolute;left:0;right:0;top:0;padding:28px 20px 0;text-align:center}.pl-h{font-size:calc(44px * var(--hsc))}' +
    '.pl-date{position:absolute;right:26px;bottom:26px;font-size:32px;color:var(--ka)}' +
    '.pl-tag{position:absolute;left:26px;bottom:30px;font-size:8px;letter-spacing:.14em;color:var(--kmut);line-height:1.6}' +
    '.sh-h{position:absolute;left:0;right:0;top:320px;text-align:center;font-size:calc(52px * var(--hsc))}' +
    '.sh-date{position:absolute;left:0;right:0;top:390px;text-align:center;font-size:24px;letter-spacing:.06em}' +
    '.bt{position:absolute;inset:16px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1.3fr 1fr 1fr;gap:10px}' +
    '.bt-c{border-radius:18px;padding:14px;overflow:hidden;background:var(--kc)}' +
    '.bt-a{grid-column:span 2;background:var(--kfg);color:var(--kbg);display:flex;align-items:flex-end}.bt-a h1{font-size:calc(38px * var(--hsc));line-height:.95}' +
    '.bt-b{background:var(--ka);color:#fff;display:flex;flex-direction:column;justify-content:space-between}.bt-b b{font-size:58px;line-height:1}.bt-b span{font-size:11px;letter-spacing:.14em}' +
    '.bt-v{grid-row:span 2;grid-column:span 2;background:var(--kb)}' +
    '.bt-d{font-size:11px;line-height:1.5}.bt-d b{display:block;margin-bottom:4px}.bt-e{background:#fff;font-size:12px;font-weight:700;display:flex;align-items:flex-end}';

  function buildPoster(s) {
    var lay = PL[s.layout] ? s.layout : (s.illus ? 'illus' : 'center');
    var html = '<div class="d pst ly-' + lay + '" style="' + vars(s) + 'width:400px;height:500px">' +
      (s.deco && DECO[s.deco] && ['center', 'illus', 'designed', 'hierarchy', 'stack', 'textfocus', 'short', 'placement'].indexOf(lay) >= 0 ? decoSVG(s.deco) : '') +
      PL[lay](s) + fxLayers(s) + '</div>';
    return { w: 400, h: 500, html: html, css: POSTER_CSS };
  }

  /* ================================================================== LOGO */
  function tsvg(inner, cls) { return svgWrap('0 0 200 200', DEFS + inner, cls || 'mk-svg'); }
  function textFont(fam, wt, size, extra) { return 'font-family:' + fam + ';font-weight:' + wt + ';font-size:' + size + 'px;' + (extra || ''); }
  var MK = {};
  MK.plain = function () { return '<div class="hd mk-plain">Morning Bean</div>'; };
  MK.wordmark = function () {
    return '<div class="hd mk-wm">morning bean</div><div class="bd mk-tag">COFFEE · SEOUL</div>';
  };
  MK.lettermark = function () {
    return '<div class="hd mk-lm"><span>M</span><span style="color:var(--ka)">B</span></div><div class="bd mk-tag">MORNING BEAN</div>';
  };
  MK.monogram = function (s) {
    return tsvg('<circle cx="100" cy="100" r="86" style="fill:none;stroke:var(--kfg);stroke-width:2"/><circle cx="100" cy="100" r="80" style="fill:none;stroke:var(--kfg);stroke-width:.8"/>' +
      '<text x="96" y="134" text-anchor="middle" style="' + textFont(s.hf, 400, 104, 'fill:none;stroke:var(--kfg);stroke-width:2.2') + '">M</text>' +
      '<text x="112" y="138" text-anchor="middle" style="' + textFont(s.hf, 700, 104, 'font-style:italic;fill:var(--ka);mix-blend-mode:multiply') + '">B</text>' +
      '<text x="100" y="40" text-anchor="middle" style="' + textFont(s.bf, 600, 8, 'letter-spacing:3px;fill:var(--kfg)') + '">EST · 2026</text>') +
      '<div class="hd mk-tag2">Morning Bean</div>';
  };
  MK.pictorial = function (s) {
    return '<div class="mk-sym" style="width:230px;height:230px">' + subjectSVG('cup', s.illus || 'flat', s) + '</div><div class="hd mk-name">Morning Bean</div>';
  };
  MK.abstract = function () {
    return tsvg('<circle cx="100" cy="100" r="80" style="fill:var(--kfg)"/><path d="M20 100 A80 80 0 0 0 180 100 Z" style="fill:var(--ka)"/>' +
      '<circle cx="100" cy="100" r="24" style="fill:var(--kc)"/><path d="M100 20 C58 62 142 138 100 180" style="fill:none;stroke:var(--kbg);stroke-width:12"/>') +
      '<div class="hd mk-name">Morning Bean</div>';
  };
  MK.combination = function (s) {
    return '<div class="mk-row"><div class="mk-sym" style="width:118px;height:118px">' + subjectSVG('cup', s.illus || 'flat', s) + '</div>' +
      '<div><div class="hd mk-cw">Morning<br>Bean</div><div class="bd mk-tag" style="text-align:left;margin-top:6px">COFFEE · SEOUL</div></div></div>';
  };
  function ringText(id, r, top) {
    // top: arc over the top (left→right), bottom: arc under the bottom (left→right)
    return '<path id="' + id + '" d="M' + (100 - r) + ' 100 A' + r + ' ' + r + ' 0 0 ' + (top ? 1 : 0) + ' ' + (100 + r) + ' 100" style="fill:none"/>';
  }
  MK.emblem = function (s) {
    return tsvg('<defs>' + ringText('emt', 72, true) + ringText('emb', 83, false) + '</defs>' +
      '<circle cx="100" cy="100" r="95" style="fill:var(--kfg)"/><circle cx="100" cy="100" r="89" style="fill:none;stroke:var(--kbg);stroke-width:1.4"/><circle cx="100" cy="100" r="60" style="fill:var(--kbg)"/>' +
      '<text style="' + textFont(s.hf, 700, 15, 'letter-spacing:3px;fill:var(--kbg)') + '"><textPath href="#emt" startOffset="50%" text-anchor="middle">MORNING BEAN</textPath></text>' +
      '<text style="' + textFont(s.bf, 700, 10, 'letter-spacing:3px;fill:var(--kbg)') + '"><textPath href="#emb" startOffset="50%" text-anchor="middle">COFFEE ROASTERS</textPath></text>' +
      '<text x="20" y="104" text-anchor="middle" style="font-size:10px;fill:var(--kbg)">★</text><text x="180" y="104" text-anchor="middle" style="font-size:10px;fill:var(--kbg)">★</text>' +
      '<g transform="translate(60 58) scale(.4)">' + subjectInner('cup', s.illus || 'flat', s) + '</g>');
  };
  MK.badge = function (s) {
    var dots = '';
    for (var i = 0; i < 48; i++) { var a = i / 48 * Math.PI * 2; dots += '<circle cx="' + f1(100 + Math.cos(a) * 92) + '" cy="' + f1(100 + Math.sin(a) * 92) + '" r="1.6" style="fill:var(--kbg)"/>'; }
    return tsvg('<defs>' + ringText('bdt', 66, true) + ringText('bdb', 76, false) + '</defs>' +
      '<circle cx="100" cy="100" r="98" style="fill:var(--kfg)"/>' + dots +
      '<circle cx="100" cy="100" r="86" style="fill:var(--kbg)"/><circle cx="100" cy="100" r="82" style="fill:none;stroke:var(--kfg);stroke-width:1.5"/><circle cx="100" cy="100" r="54" style="fill:none;stroke:var(--kfg);stroke-width:1.5"/>' +
      '<text style="' + textFont(s.hf, 400, 14, 'letter-spacing:2px;fill:var(--kfg)') + '"><textPath href="#bdt" startOffset="50%" text-anchor="middle">MORNING BEAN</textPath></text>' +
      '<text style="' + textFont(s.hf, 400, 9, 'letter-spacing:3px;fill:var(--kfg)') + '"><textPath href="#bdb" startOffset="50%" text-anchor="middle">COFFEE · SEOUL</textPath></text>' +
      '<g transform="translate(81 50) scale(.19)">' + subjectInner('cup', 'mono', s) + '</g>' +
      '<path d="M14 92 H186 L176 104 L186 116 H14 L24 104 Z" style="fill:var(--ka)"/>' +
      '<text x="100" y="108.5" text-anchor="middle" style="' + textFont(s.hf, 400, 11, 'letter-spacing:2px;fill:var(--kbg)') + '">EST. 2026</text>' +
      '<text x="100" y="138" text-anchor="middle" style="font-size:9px;letter-spacing:4px;fill:var(--kfg)">★★★</text>');
  };
  MK.mascot = function (s) {
    return tsvg('<ellipse cx="100" cy="176" rx="46" ry="7" style="fill:#000;opacity:.12"/>' +
      '<path d="M86 150 L82 172 M114 150 L118 172" style="stroke:var(--kfg);stroke-width:6;stroke-linecap:round"/>' +
      '<path d="M56 102 C38 108 40 128 54 132" style="fill:none;stroke:var(--kfg);stroke-width:6;stroke-linecap:round"/>' +
      '<ellipse cx="100" cy="100" rx="52" ry="64" transform="rotate(-12 100 100)" style="fill:var(--ka)"/>' +
      '<path d="M132 52 C112 84 142 118 122 152" style="fill:none;stroke:#000;stroke-opacity:.22;stroke-width:6;stroke-linecap:round"/>' +
      '<ellipse cx="82" cy="92" rx="10" ry="12" style="fill:#fff"/><ellipse cx="110" cy="88" rx="10" ry="12" style="fill:#fff"/>' +
      '<circle cx="85" cy="94" r="5.5" style="fill:var(--kfg)"/><circle cx="113" cy="90" r="5.5" style="fill:var(--kfg)"/><circle cx="87" cy="91.5" r="1.8" style="fill:#fff"/><circle cx="115" cy="87.5" r="1.8" style="fill:#fff"/>' +
      '<circle cx="72" cy="112" r="7" style="fill:#ff8fa3;opacity:.7"/><circle cx="122" cy="106" r="7" style="fill:#ff8fa3;opacity:.7"/>' +
      '<path d="M88 112 Q100 126 112 110" style="fill:none;stroke:var(--kfg);stroke-width:4;stroke-linecap:round"/>' +
      '<path d="M146 96 C162 102 164 118 154 126" style="fill:none;stroke:var(--kfg);stroke-width:6;stroke-linecap:round"/>' +
      '<g transform="translate(138 106) scale(.26)">' + subjectInner('cup', 'flat', s) + '</g>') +
      '<div class="hd mk-name">Morning Bean</div>';
  };
  MK.monoline = function (s) {
    var rays = '';
    for (var i = 0; i < 7; i++) { var a = Math.PI + (i + 0.5) / 7 * Math.PI; rays += '<line x1="' + f1(100 + Math.cos(a) * 62) + '" y1="' + f1(78 + Math.sin(a) * 62) + '" x2="' + f1(100 + Math.cos(a) * 76) + '" y2="' + f1(78 + Math.sin(a) * 76) + '"/>'; }
    return tsvg('<g style="fill:none;stroke:var(--kfg);stroke-width:4;stroke-linecap:round;stroke-linejoin:round">' + rays + '<path d="M50 78 A50 50 0 0 1 150 78"/></g>' +
      '<g transform="translate(40 60) scale(.6)">' + subjectInner('cup', 'monoline', s) + '</g>') +
      '<div class="hd mk-name" style="letter-spacing:.18em">MORNING BEAN</div>';
  };
  MK.negative = function () {
    return tsvg('<path d="' + SUBJ.bean[0][1] + '" style="fill:var(--kfg)"/>' +
      '<path d="M104 34 C80 64 124 90 100 114" style="fill:none;stroke:var(--kbg);stroke-width:8;stroke-linecap:round"/>' +
      '<path d="M72 120 L128 120 L123 148 Q120 158 109 158 L91 158 Q80 158 77 148 Z" style="fill:var(--kbg)"/>' +
      '<path d="M126 126 C142 124 142 146 122 144" style="fill:none;stroke:var(--kbg);stroke-width:5"/>') +
      '<div class="hd mk-name">Morning Bean</div>';
  };
  MK.geometric = function () {
    return tsvg('<g style="fill:none;stroke:var(--kb);stroke-width:.7;stroke-dasharray:3 3"><circle cx="100" cy="70" r="30"/><circle cx="100" cy="120" r="50"/><line x1="16" y1="120" x2="184" y2="120"/><line x1="100" y1="12" x2="100" y2="190"/><rect x="50" y="70" width="100" height="100"/><circle cx="152" cy="136" r="22"/></g>' +
      '<circle cx="100" cy="70" r="30" style="fill:var(--ka)"/>' +
      '<path d="M50 120 H150 A50 50 0 0 1 50 120 Z" style="fill:var(--kfg)"/>' +
      '<circle cx="150" cy="134" r="13" style="fill:none;stroke:var(--kfg);stroke-width:8"/>' +
      '<rect x="40" y="176" width="120" height="8" rx="4" style="fill:var(--kfg)"/>') +
      '<div class="hd mk-name" style="letter-spacing:.16em">MORNING BEAN</div>';
  };
  MK.appicon = function (s) {
    var glyph = '<div style="--kfg:#ffffff;--kbg:var(--ka);width:62%;height:62%">' + subjectSVG('cup', 'mono', s) + '</div>';
    return '<div class="mk-app sf-app">' + glyph + '</div><div class="bd mk-applbl">Morning Bean</div>' +
      '<div class="mk-approw">' + [60, 40, 29].map(function (z) { return '<div class="mk-app" style="width:' + z + 'px;height:' + z + 'px;border-radius:' + f1(z * 0.2237) + 'px;box-shadow:0 2px 6px rgba(0,0,0,.18)"><div style="--kfg:#ffffff;--kbg:var(--ka);width:62%;height:62%">' + subjectSVG('cup', 'mono', s) + '</div></div>'; }).join('') + '</div>';
  };
  MK.silhouette = function (s) {
    var g = '<path d="M46 86 L154 86 L146 140 Q142 158 120 158 L80 158 Q58 158 54 140 Z" style="fill:var(--kfg)"/><path d="M150 96 C184 92 184 140 144 138 L146 126 C166 126 166 106 148 108 Z" style="fill:var(--kfg)"/><path d="M100 18 C130 18 140 50 132 70 C124 86 98 88 84 78 C66 66 70 36 82 26 C88 21 94 18 100 18 Z" style="fill:var(--kfg)"/><path d="M102 24 C90 40 112 56 96 80" style="fill:none;stroke:var(--kbg);stroke-width:6"/><rect x="30" y="166" width="140" height="10" rx="5" style="fill:var(--kfg)"/>';
    return tsvg(g) + '<div class="mk-sil">' + [64, 32, 16].map(function (z) { return '<div style="width:' + z + 'px;height:' + z + 'px">' + tsvg(g, 'vis') + '</div>'; }).join('') + '</div>';
  };
  MK.script = function () {
    return '<div class="mk-scr"><div class="hd mk-scr-t">Morning Bean</div>' + svgWrap('0 0 300 30', '<path d="M20 18 C90 6 170 30 290 8" style="fill:none;stroke:var(--ka);stroke-width:4;stroke-linecap:round"/>', 'mk-swash') + '</div><div class="bd mk-tag">EST. 2026 · SEOUL</div>';
  };
  var LOGO_CSS =
    '.lg-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}' +
    '.mk{display:flex;flex-direction:column;align-items:center;text-align:center}' +
    '.mk-svg{display:block;width:220px;height:220px;overflow:visible}' +
    '.mk-plain{font-size:calc(38px * var(--hsc));color:var(--kfg)}' +
    '.mk-wm{font-size:calc(50px * var(--hsc));color:var(--kfg);white-space:nowrap}' +
    '.mk-tag{margin-top:12px;font-size:10px;letter-spacing:.36em;color:var(--kmut);padding-left:.36em}' +
    '.mk-tag2{margin-top:12px;font-size:22px;color:var(--kfg)}' +
    '.mk-lm{font-size:calc(150px * var(--hsc));line-height:.9;color:var(--kfg);letter-spacing:-.06em}' +
    '.mk-name{margin-top:14px;font-size:calc(28px * var(--hsc));color:var(--kfg);white-space:nowrap}' +
    '.mk-row{display:flex;align-items:center;gap:18px}.mk-cw{font-size:calc(40px * var(--hsc));line-height:calc(var(--hlh) * .9);color:var(--kfg);text-align:left}' +
    '.mk-app{width:180px;height:180px;border-radius:40px;background:linear-gradient(160deg,var(--kc),var(--ka) 70%);display:flex;align-items:center;justify-content:center;box-shadow:0 18px 34px -10px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.4)}' +
    '.mk-applbl{margin-top:12px;font-size:14px;font-weight:600;color:var(--kfg)}' +
    '.mk-approw{display:flex;gap:18px;align-items:flex-end;margin-top:34px}' +
    '.mk-sil{display:flex;gap:22px;align-items:flex-end;margin-top:26px;padding-top:18px;border-top:1px solid var(--kc)}' +
    '.mk-scr{position:relative}.mk-scr-t{font-size:calc(58px * var(--hsc));color:var(--kfg);white-space:nowrap;line-height:1.3}.mk-swash{display:block;width:280px;height:28px;margin:-10px auto 0}' +
    /* frames */
    '.lf-card{position:absolute;width:290px;height:170px;border-radius:6px;box-shadow:0 18px 30px -12px rgba(0,0,0,.45),0 2px 4px rgba(0,0,0,.12);overflow:hidden;display:flex;align-items:center;justify-content:center}' +
    '.lf-back{padding:20px 22px;flex-direction:column;align-items:flex-start;justify-content:space-between;font-size:10px;line-height:1.6}' +
    '.lf-back b{font-size:14px;display:block}' +
    '.lf-board{position:absolute;inset:18px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1.4fr 1fr 1fr;gap:10px}' +
    '.lf-t{border-radius:10px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;background:var(--kbg)}' +
    '.lf-sw{display:flex;flex-direction:column;padding:0;align-items:stretch}.lf-sw i{flex:1;display:flex;align-items:flex-end;padding:4px 8px;font-style:normal;font-size:8px;font-family:' + F.spacemono + '}' +
    '.lf-type{flex-direction:column;align-items:flex-start;justify-content:center;padding:12px;font-size:9px;color:var(--kfg)}.lf-type b{font-size:42px;line-height:1}' +
    '.lf-mood{position:absolute;inset:16px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);gap:8px}' +
    '.lf-mood>div{border-radius:8px;overflow:hidden;position:relative}.lf-mood img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.lf-menu{position:absolute;inset:22px;border-radius:6px;padding:22px 26px;display:flex;flex-direction:column}' +
    '.lf-mi{display:flex;align-items:baseline;gap:6px;font-size:13px;margin:7px 0}.lf-mi i{flex:1;border-bottom:1px dotted currentColor;opacity:.5}.lf-mi small{display:block;font-size:9px;opacity:.7}' +
    '.lf-check{position:absolute;inset:0;background:conic-gradient(#ddd 25%,#fff 0 50%,#ddd 0 75%,#fff 0) 0 0/20px 20px}' +
    '.lf-tab{position:absolute;left:30px;right:30px;top:40px;height:46px;background:#dee1e6;border-radius:10px 10px 0 0;display:flex;align-items:flex-end;padding:0 10px}' +
    '.lf-tab div{background:#fff;border-radius:8px 8px 0 0;height:36px;width:200px;display:flex;align-items:center;gap:8px;padding:0 12px;font:12px ' + F.sys + ';color:#333}' +
    '.lf-url{position:absolute;left:30px;right:30px;top:86px;height:34px;background:#fff;border-bottom:1px solid #ddd;font:11px ' + F.sys + ';color:#666;padding:9px 14px}' +
    '.lf-sizes{position:absolute;left:0;right:0;top:170px;display:flex;justify-content:center;align-items:flex-end;gap:30px}' +
    '.lf-sizes span{display:block;text-align:center;font:9px ' + F.spacemono + ';color:#777;margin-top:8px}' +
    '.lf-icons{position:absolute;left:36px;right:36px;top:60px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}' +
    '.lf-icons div{aspect-ratio:1;border-radius:14px;background:var(--ksurf);display:flex;align-items:center;justify-content:center;color:var(--kfg);border:1px solid rgba(0,0,0,.06)}' +
    '.lf-lid{position:absolute;inset:0;background:linear-gradient(160deg,#4b4f57,#2a2d33)}' +
    '.lf-stk{position:absolute;filter:drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff) drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff) drop-shadow(0 8px 10px rgba(0,0,0,.45))}' +
    '.lf-sw3{position:absolute;left:0;right:0;bottom:44px;display:flex;justify-content:center;gap:14px}' +
    '.lf-sw3 div{width:70px;text-align:center;font:9px ' + F.spacemono + ';color:var(--kfg)}.lf-sw3 i{display:block;height:46px;border-radius:8px;margin-bottom:6px;border:1px solid rgba(0,0,0,.1)}';

  function markHTML(s) {
    var k = MK[s.logo] ? s.logo : 'plain';
    return '<div class="mk mk-' + k + '">' + MK[k](s) + '</div>';
  }
  function scaled(inner, k, extra) { return '<div style="transform:scale(' + k + ');transform-origin:50% 50%;' + (extra || '') + '">' + inner + '</div>'; }
  function anchorsOverlay() {
    var o = '', prims = SUBJ.cup;
    prims.forEach(function (p) {
      if (p[0] !== 'p' && p[0] !== 's') return;
      o += '<path d="' + p[1] + '" style="fill:none;stroke:#1e7bff;stroke-width:1"/>';
      var nums = p[1].match(/-?\d+(\.\d+)?/g) || [];
      for (var i = 0; i + 1 < nums.length; i += 2) o += '<rect x="' + (+nums[i] - 2.5) + '" y="' + (+nums[i + 1] - 2.5) + '" width="5" height="5" style="fill:#fff;stroke:#1e7bff;stroke-width:1"/>';
    });
    prims.forEach(function (p) {
      if (p[0] === 'e') o += '<ellipse cx="' + p[1] + '" cy="' + p[2] + '" rx="' + p[3] + '" ry="' + p[4] + '" style="fill:none;stroke:#1e7bff;stroke-width:1"/>' +
        '<rect x="' + (p[1] - p[3] - 2.5) + '" y="' + (p[2] - 2.5) + '" width="5" height="5" style="fill:#1e7bff"/><rect x="' + (p[1] + p[3] - 2.5) + '" y="' + (p[2] - 2.5) + '" width="5" height="5" style="fill:#1e7bff"/>';
      if (p[0] === 'r') o += '<rect x="' + p[1] + '" y="' + p[2] + '" width="' + p[3] + '" height="' + p[4] + '" style="fill:none;stroke:#1e7bff;stroke-width:1"/>';
    });
    return o;
  }
  var LF = {};
  LF.card = function (s) {
    return '<div class="lf-card" style="left:40px;top:70px;background:var(--kbg);transform:rotate(-6deg)">' + scaled(markHTML(s), 0.5) + '</div>' +
      '<div class="lf-card lf-back bd" style="left:70px;top:250px;background:var(--kfg);color:var(--kbg);transform:rotate(4deg)"><div><b class="hd">Jiwoo Han</b>Head Roaster</div><div>12 Yeonhui-ro, Seodaemun-gu, Seoul<br>hello@morningbean.kr · @morningbean</div></div>';
  };
  LF.board = function (s) {
    var p = s.pal;
    var sw = [['bg', p.bg, p.fg], ['fg', p.fg, p.bg], ['a', p.a, '#fff'], ['b', p.b, '#fff'], ['c', p.c, p.fg]];
    return '<div class="lf-board">' +
      '<div class="lf-t" style="grid-column:span 2;background:var(--kbg)">' + scaled(markHTML(s), 0.62) + '</div>' +
      '<div class="lf-t lf-sw">' + sw.map(function (x) { return '<i style="background:' + x[1] + ';color:' + x[2] + '">' + x[1].toUpperCase() + '</i>'; }).join('') + '</div>' +
      '<div class="lf-t lf-type" style="background:var(--kc)"><b class="hd">Aa</b><span class="bd">Headline / Body</span><span class="bd">Slow mornings, honest coffee.</span></div>' +
      '<div class="lf-t" style="background:var(--kfg)"><div style="width:70px;height:96px;border-radius:6px 6px 14px 14px;background:var(--kbg);display:flex;align-items:center;justify-content:center"><div style="width:44px;height:44px">' + subjectSVG('cup', s.illus || 'flat', s) + '</div></div></div>' +
      '<div class="lf-t" style="background:var(--ka);color:#fff;flex-direction:column;font-size:11px"><b class="hd" style="font-size:20px">Morning Bean</b><span class="bd">Open 7:00 – 18:00</span></div>' +
      '</div>';
  };
  LF.mood = function (s) {
    return '<div class="lf-mood">' +
      '<div style="grid-column:span 2;grid-row:span 2"><img src="assets/primary/product.jpg" alt=""></div>' +
      '<div style="background:var(--ka)"></div>' +
      '<div style="background:var(--kc);display:flex;align-items:center;justify-content:center">' + scaled(markHTML(s), 0.3) + '</div>' +
      '<div style="background:var(--kfg);color:var(--kbg);display:flex;align-items:center;justify-content:center;font:italic 600 18px ' + F.fraunces + ';text-align:center;padding:8px">Slow mornings</div>' +
      '<div style="background:repeating-linear-gradient(45deg,var(--kb) 0 6px,var(--kbg) 6px 12px)"></div>' +
      '<div style="background:var(--kb)"></div>' +
      '<div style="grid-column:span 2;background:#efe7da;display:flex;align-items:center;justify-content:center;gap:10px;font:500 12px ' + F.work + ';color:#5a4636;letter-spacing:.14em">WARM · HONEST · LOCAL</div>' +
      '<div style="background:radial-gradient(circle at 30% 30%,#fff7,transparent 50%),var(--kc)"></div>' +
      '<div style="grid-column:span 2;background:var(--kbg);display:flex;align-items:center;justify-content:center;gap:10px">' + ['var(--kfg)', 'var(--ka)', 'var(--kb)', 'var(--kc)'].map(function (c) { return '<i style="width:26px;height:26px;border-radius:50%;background:' + c + ';border:1px solid rgba(0,0,0,.1)"></i>'; }).join('') + '</div>' +
      '</div>';
  };
  LF.menu = function (s) {
    var items = [['Espresso', 'Single origin, Huila', '4.0'], ['Americano', 'Hot or iced', '4.5'], ['Flat White', 'Double shot, whole milk', '5.0'], ['Hand Drip', 'Ask for today\'s bean', '6.0'], ['Butter Croissant', 'Baked at 6 am', '4.0']];
    return '<div class="lf-menu" style="background:var(--kbg);color:var(--kfg);box-shadow:0 20px 40px -16px rgba(0,0,0,.45);border:1px solid rgba(0,0,0,.08)">' +
      '<div style="display:flex;justify-content:center;height:96px;align-items:center">' + scaled(markHTML(s), 0.4) + '</div>' +
      '<div class="bd" style="text-align:center;font-size:9px;letter-spacing:.3em;margin:6px 0 14px;opacity:.75">MENU · ₩ 1,000</div>' +
      items.map(function (it) { return '<div class="lf-mi bd"><span><b class="hd" style="font-size:15px">' + it[0] + '</b><small>' + it[1] + '</small></span><i></i><b>' + it[2] + '</b></div>'; }).join('') +
      '</div>';
  };
  LF.checker = function (s) {
    return '<div class="lf-check"></div><div class="lg-c">' + markHTML(s) + '</div>' +
      '<div class="bd" style="position:absolute;left:0;right:0;bottom:22px;text-align:center;font:10px ' + F.spacemono + ';color:#666">morning-bean.png · alpha</div>';
  };
  LF.vector = function (s) {
    return '<div class="lg-c"><div style="position:relative;width:260px;height:260px">' + subjectSVG('cup', 'flat', s) +
      svgWrap('0 0 200 200', anchorsOverlay(), 'layer') + '</div>' +
      '<div class="bd" style="margin-top:18px;font:10px ' + F.spacemono + ';color:#1e7bff">morning-bean.svg · 6 paths · editable</div></div>';
  };
  LF.sizes = function (s) {
    var m = function (z) { return '<div><div style="width:' + z + 'px;height:' + z + 'px">' + subjectSVG('cup', 'mono', s) + '</div><span>' + z + 'px</span></div>'; };
    return '<div class="lf-tab"><div><span style="width:16px;height:16px;display:inline-block">' + subjectSVG('cup', 'mono', s) + '</span>Morning Bean — Coffee</div></div>' +
      '<div class="lf-url">morningbean.kr</div>' +
      '<div class="lf-sizes">' + m(96) + m(48) + m(32) + m(16) + '</div>' +
      '<div class="bd" style="position:absolute;left:0;right:0;bottom:60px;text-align:center;font-size:30px;color:var(--kfg)"><span class="hd">Morning Bean</span></div>';
  };
  LF.iconset = function (s) {
    var names = ['cup', 'bean', 'croissant', 'leaf', 'timer', 'thermo', 'wifi', 'pin', 'clock'];
    var mode = s.iconMode || 'outline';
    return '<div class="lf-icons">' + names.map(function (n) { return '<div>' + iconSvg(n, mode, 44, 'var(--kfg)', 'var(--ksurf)', s.iconStroke || 2) + '</div>'; }).join('') + '</div>' +
      '<div class="bd" style="position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:11px;letter-spacing:.2em;color:var(--kmut)">MORNING BEAN · ICONS · 24 GRID · 2 PX</div>';
  };
  LF.sticker = function (s) {
    return '<div class="lf-lid"></div>' +
      '<div class="lf-stk" style="left:70px;top:60px;transform:rotate(-8deg)"><div style="background:var(--kbg);padding:18px 20px;border-radius:24px">' + scaled(markHTML(s), 0.7) + '</div></div>' +
      '<div class="lf-stk" style="left:200px;top:280px;width:150px;height:150px;transform:rotate(12deg)">' + subjectSVG('cup', 'flat', s) + '</div>' +
      '<div class="lf-stk" style="left:46px;top:330px;width:120px;height:120px;transform:rotate(-14deg)">' + subjectSVG('bean', 'flat', s) + '</div>';
  };
  LF.swatch3 = function (s) {
    var p = s.pal;
    return '<div class="lg-c" style="padding-bottom:80px">' + markHTML(s) + '</div>' +
      '<div class="lf-sw3">' + [p.fg, p.a, p.bg].map(function (c) { return '<div><i style="background:' + c + '"></i>' + c.toUpperCase() + '</div>'; }).join('') + '</div>';
  };
  function buildLogo(s) {
    var fr = LF[s.frame] ? s.frame : null;
    var bgStyle = fr === 'card' || fr === 'board' || fr === 'mood' || fr === 'menu' || fr === 'sticker' ? 'background:var(--kst);' : '';
    var inner = fr ? LF[fr](s) : '<div class="lg-c">' + markHTML(s) + '</div>';
    var html = '<div class="d lg" style="' + vars(s) + bgStyle + 'width:400px;height:500px">' +
      (!fr && s.deco && DECO[s.deco] ? '<div class="layer" style="opacity:' + decoOp(s.deco) + '">' + decoSVG(s.deco) + '</div>' : '') +
      (s.surface && !fr ? '<div class="sf" style="position:absolute;left:40px;right:40px;top:90px;bottom:90px"></div>' : '') +
      inner + fxLayers(s) + '</div>';
    return { w: 400, h: 500, html: html, css: LOGO_CSS };
  }

  /* =============================================================== PACKAGE */
  function boxFront(s) {
    if (!s.pkg) {
      return '<div class="pk-box pk-plain"><div class="hd pk-pn">Leaf &amp; Co.</div><div class="bd pk-ps">Organic Tea</div></div>';
    }
    var st = s.illus || 'flat';
    var scene = ['paper', 'lowpoly', 'iso', 'corporate', 'spot'].indexOf(st) >= 0;
    var art = scene ? '<div class="pk-scene">' + illusScene(s, 'leaf', 240, 190) + '</div>' : '<div class="pk-vis">' + subjectSVG('leaf', st, s) + '</div>';
    return '<div class="pk-box sf">' +
      (s.deco && DECO[s.deco] ? '<div class="layer" style="opacity:' + decoOp(s.deco) + '">' + decoSVG(s.deco) + '</div>' : '') + art +
      '<div class="bd pk-top">EST. 2026 · ORGANIC</div>' +
      '<div class="hd pk-brand">Leaf &amp; Co.</div>' +
      '<div class="pk-rule"></div>' +
      '<div class="hd pk-prod">Sencha</div>' +
      '<div class="bd pk-sub">Organic Green Tea · 20 bags</div>' +
      '<div class="bd pk-seal">100%<br>ORGANIC</div>' +
      '<div class="bd pk-wt">NET 40 g</div>' +
      '</div>';
  }
  function boxSide(s) {
    return '<div class="pk-side"><div class="hd pk-sbrand">Leaf &amp; Co.</div><div class="bd pk-sinfo">Ingredients: organic green tea leaves (Boseong, Korea).<br>Steep 2–3 min at 80°C.</div></div>';
  }
  var PF = {};
  PF.box3d = function (s) {
    return '<div class="pk-studio"></div><div class="pk-floor"></div><div class="pk-shadow"></div>' +
      '<div class="pk-scene3d"><div class="pk-cube">' +
      '<div class="pk-face pk-f">' + boxFront(s) + '</div>' +
      '<div class="pk-face pk-r">' + boxSide(s) + '</div>' +
      '<div class="pk-face pk-t"></div>' +
      '</div></div>';
  };
  PF.dieline = function (s) {
    var x0 = 63, y0 = 180, G = 14, S = 40, Fw = 90, H = 135;
    var xs = [x0, x0 + G, x0 + G + S, x0 + G + S + Fw, x0 + G + S + Fw + S, x0 + G + S + Fw + S + Fw];
    var cut = 'fill:none;stroke:#e5322d;stroke-width:1.1';
    var fold = 'fill:none;stroke:#1a73e8;stroke-width:1;stroke-dasharray:4 3';
    // top tuck flap on front panel (between xs[2] and xs[3])
    var o = '<path d="M' + xs[2] + ' ' + y0 + ' V' + (y0 - 36) + ' Q' + xs[2] + ' ' + (y0 - 50) + ' ' + (xs[2] + 16) + ' ' + (y0 - 50) + ' H' + (xs[3] - 16) + ' Q' + xs[3] + ' ' + (y0 - 50) + ' ' + xs[3] + ' ' + (y0 - 36) + ' V' + y0 + '" style="' + cut + '"/>' +
      '<path d="M' + xs[1] + ' ' + y0 + ' L' + xs[0] + ' ' + (y0 + 10) + ' L' + xs[0] + ' ' + (y0 + H - 10) + ' L' + xs[1] + ' ' + (y0 + H) + '" style="' + cut + '"/>' +
      '<path d="M' + xs[5] + ' ' + y0 + ' V' + (y0 + H) + '" style="' + cut + '"/>' +
      // dust flaps top on sides
      '<path d="M' + xs[1] + ' ' + y0 + ' L' + (xs[1] + 6) + ' ' + (y0 - 26) + ' H' + (xs[2] - 4) + ' L' + xs[2] + ' ' + y0 + '" style="' + cut + '"/>' +
      '<path d="M' + xs[3] + ' ' + y0 + ' L' + (xs[3] + 4) + ' ' + (y0 - 26) + ' H' + (xs[4] - 6) + ' L' + xs[4] + ' ' + y0 + '" style="' + cut + '"/>' +
      '<path d="M' + xs[4] + ' ' + y0 + ' V' + (y0 - 30) + ' H' + xs[5] + ' V' + y0 + '" style="' + cut + '"/>' +
      // bottom flaps
      '<path d="M' + xs[1] + ' ' + (y0 + H) + ' L' + (xs[1] + 6) + ' ' + (y0 + H + 26) + ' H' + (xs[2] - 4) + ' L' + xs[2] + ' ' + (y0 + H) + '" style="' + cut + '"/>' +
      '<path d="M' + xs[2] + ' ' + (y0 + H) + ' V' + (y0 + H + 40) + ' H' + xs[3] + ' V' + (y0 + H) + '" style="' + cut + '"/>' +
      '<path d="M' + xs[3] + ' ' + (y0 + H) + ' L' + (xs[3] + 4) + ' ' + (y0 + H + 26) + ' H' + (xs[4] - 6) + ' L' + xs[4] + ' ' + (y0 + H) + '" style="' + cut + '"/>' +
      '<path d="M' + xs[4] + ' ' + (y0 + H) + ' V' + (y0 + H + 40) + ' H' + xs[5] + ' V' + (y0 + H) + '" style="' + cut + '"/>';
    for (var i = 1; i < 5; i++) o += '<path d="M' + xs[i] + ' ' + y0 + ' V' + (y0 + H) + '" style="' + fold + '"/>';
    o += '<path d="M' + xs[1] + ' ' + y0 + ' H' + xs[5] + ' M' + xs[1] + ' ' + (y0 + H) + ' H' + xs[5] + '" style="' + fold + '"/>';
    o += '<g style="font:9px ' + "'Space Mono',monospace" + '"><line x1="' + xs[2] + '" y1="' + (y0 + H + 58) + '" x2="' + xs[3] + '" y2="' + (y0 + H + 58) + '" style="stroke:#555"/><text x="' + (xs[2] + 45) + '" y="' + (y0 + H + 70) + '" text-anchor="middle" style="fill:#555">70 mm</text>' +
      '<text x="' + x0 + '" y="420" style="fill:#e5322d">— CUT</text><text x="' + (x0 + 70) + '" y="420" style="fill:#1a73e8">- - FOLD</text><text x="' + (x0 + 150) + '" y="420" style="fill:#555">70 × 105 × 30 mm</text></g>';
    var k = Fw / 240;
    return '<div class="pk-net" style="left:' + xs[2] + 'px;top:' + y0 + 'px;width:' + Fw + 'px;height:' + H + 'px"><div style="width:240px;height:360px;transform:scale(' + k + ');transform-origin:0 0">' + boxFront(s) + '</div></div>' +
      '<div class="pk-net" style="left:' + xs[4] + 'px;top:' + y0 + 'px;width:' + Fw + 'px;height:' + H + 'px;background:var(--kbg)"><div class="bd" style="padding:8px;font-size:5.5px;line-height:1.5;color:var(--kfg)"><b style="font-size:8px">Leaf &amp; Co.</b><br>Ingredients: organic green tea leaves.<br>Origin: Boseong, Korea.<br>Steep 2–3 min at 80°C.<br><br>▮▮▯▮▮▮▯▮▯▮▮</div></div>' +
      '<div class="pk-net" style="left:' + xs[1] + 'px;top:' + y0 + 'px;width:' + S + 'px;height:' + H + 'px;background:var(--kbg)"></div>' +
      '<div class="pk-net" style="left:' + xs[3] + 'px;top:' + y0 + 'px;width:' + S + 'px;height:' + H + 'px;background:var(--kbg)"><div class="hd" style="writing-mode:vertical-rl;font-size:13px;color:var(--kfg);margin:10px auto">Leaf &amp; Co.</div></div>' +
      svgWrap('0 0 400 500', o, 'layer') +
      '<div class="bd" style="position:absolute;left:0;right:0;top:40px;text-align:center;font:10px ' + F.spacemono + ';color:#555;letter-spacing:.1em">TUCK-END BOX · DIELINE</div>';
  };
  PF.label = function (s) {
    return '<div class="pk-tin"><div class="pk-lid"></div><div class="pk-body"><div class="pk-lbl"><div style="width:240px;height:360px;transform:scale(.72);transform-origin:0 0">' + boxFront(s) + '</div><div class="pk-curve"></div></div></div></div>';
  };
  PF.infographic = function (s) {
    var step = function (ic, big, small) { return '<div class="pi-s"><div class="pi-ic">' + iconSvg(ic, 'outline', 28, 'var(--ka)') + '</div><b class="hd">' + big + '</b><span class="bd">' + small + '</span></div>'; };
    var bar = function (n, v) { return '<div class="pi-bar bd"><span>' + n + '</span><i><em style="width:' + v + '%"></em></i></div>'; };
    return '<div class="pk-box pk-back sf"><div class="hd pi-h">How to brew</div><div class="bd pi-k">Leaf &amp; Co. · Sencha</div>' +
      '<div class="pi-steps">' + step('thermo', '80°C', 'water') + step('leaf', '2 g', 'per 200 ml') + step('timer', '2–3 min', 'steep') + step('cup', '3×', 'infusions') + '</div>' +
      '<div class="bd pi-t">Flavor profile</div>' + bar('Grassy', 80) + bar('Sweet', 55) + bar('Umami', 70) + bar('Bitter', 25) +
      '<div class="pi-map bd"><svg viewBox="0 0 60 80" width="38" height="50"><path d="M20 4 L36 2 L44 14 L40 30 L50 44 L44 62 L30 76 L18 70 L22 56 L12 42 L18 26 Z" style="fill:var(--kc)"/><circle cx="24" cy="66" r="4" style="fill:var(--ka)"/></svg><div><b>Boseong, Korea</b><br>Hand-picked in May</div></div></div>';
  };
  PF.hex = function (s) {
    var p = s.pal;
    return '<div style="position:absolute;left:100px;top:34px;width:240px;height:360px;transform:scale(.83);transform-origin:0 0">' + boxFront(s) + '</div>' +
      '<div class="pk-hex">' + [p.bg, p.fg, p.a, p.b].map(function (c) { return '<div><i style="background:' + c + '"></i>' + c.toUpperCase() + '</div>'; }).join('') + '</div>';
  };
  var PKG_CSS =
    '.pk-wrap{position:absolute;left:80px;top:62px;width:240px;height:360px;box-shadow:0 26px 40px -18px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.12)}' +
    '.pk-box{position:relative;width:240px;height:360px;overflow:hidden;background:var(--kbg);color:var(--kfg);border-radius:0}' +
    '.pk-plain{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #d6d6d6}' +
    '.pk-pn{font-size:calc(30px * var(--hsc))}.pk-ps{font-size:12px;color:var(--kmut);margin-top:6px}' +
    '.pk-vis{position:absolute;left:52px;top:96px;width:136px;height:136px}' +
    '.pk-scene{position:absolute;left:0;right:0;bottom:0;height:190px}' +
    '.pk-top{position:absolute;left:0;right:0;top:20px;text-align:center;font-size:7.5px;letter-spacing:.32em;padding-left:.32em;opacity:.85}' +
    '.pk-brand{position:absolute;left:0;right:0;top:36px;text-align:center;font-size:calc(34px * var(--hsc))}' +
    '.pk-rule{position:absolute;left:96px;right:96px;top:84px;height:1.5px;background:var(--ka)}' +
    '.pk-prod{position:absolute;left:0;right:0;top:244px;text-align:center;font-size:30px;font-style:italic;font-weight:400}' +
    '.pk-sub{position:absolute;left:0;right:0;top:284px;text-align:center;font-size:9.5px;letter-spacing:.08em}' +
    '.pk-seal{position:absolute;left:18px;bottom:16px;width:44px;height:44px;border-radius:50%;border:1.3px solid currentColor;display:flex;align-items:center;justify-content:center;text-align:center;font-size:6.5px;font-weight:700;line-height:1.2;letter-spacing:.06em}' +
    '.pk-wt{position:absolute;right:18px;bottom:20px;font-size:9px;letter-spacing:.12em}' +
    '.pk-side{width:100%;height:100%;background:var(--kbg);color:var(--kfg);padding:18px 12px;display:flex;flex-direction:column;justify-content:space-between}' +
    '.pk-sbrand{writing-mode:vertical-rl;font-size:26px;margin:0 auto}.pk-sinfo{font-size:6.5px;line-height:1.5}' +
    '.pk-studio{position:absolute;inset:0;background:radial-gradient(circle at 50% 30%,#fbfaf7,var(--kst) 70%)}' +
    '.pk-floor{position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(#d9d3c7,#cfc7b8)}' +
    '.pk-shadow{position:absolute;left:70px;bottom:92px;width:290px;height:40px;border-radius:50%;background:radial-gradient(rgba(0,0,0,.4),transparent 70%)}' +
    '.pk-scene3d{position:absolute;left:96px;top:60px;width:200px;height:300px;perspective:1100px}' +
    '.pk-cube{position:relative;width:200px;height:300px;transform-style:preserve-3d;transform:rotateX(-10deg) rotateY(-30deg)}' +
    '.pk-face{position:absolute;left:0;top:0;overflow:hidden;backface-visibility:hidden}' +
    '.pk-f{width:200px;height:300px;transform:translateZ(37px)}.pk-f>.pk-box{transform:scale(.8333);transform-origin:0 0}' +
    '.pk-r{width:74px;height:300px;left:63px;transform:rotateY(90deg) translateZ(100px)}.pk-r::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.2)}' +
    '.pk-t{width:200px;height:74px;top:113px;background:var(--kbg);transform:rotateX(90deg) translateZ(150px)}.pk-t::after{content:"";position:absolute;inset:0;background:rgba(255,255,255,.18)}' +
    '.pk-net{position:absolute;overflow:hidden}' +
    '.pk-tin{position:absolute;left:96px;top:44px;width:208px;height:400px}' +
    '.pk-lid{position:absolute;left:0;right:0;top:0;height:46px;border-radius:50%/22px;background:linear-gradient(90deg,#8d939b,#e9edf1 30%,#a7adb5 60%,#6d737b);box-shadow:0 2px 0 #5d636b}' +
    '.pk-body{position:absolute;left:0;right:0;top:22px;bottom:0;border-radius:0 0 50% 50%/0 0 22px 22px;background:linear-gradient(90deg,#7e848c,#dfe3e8 30%,#a4aab2 62%,#5f656d);overflow:hidden}' +
    '.pk-lbl{position:absolute;left:14px;right:14px;top:66px;height:260px;overflow:hidden;background:var(--kbg)}.pk-lbl>div:first-child{margin-left:4px;margin-top:0}' +
    '.pk-curve{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.38),rgba(0,0,0,0) 26%,rgba(255,255,255,.22) 40%,rgba(0,0,0,0) 60%,rgba(0,0,0,.42))}' +
    '.pk-back{padding:20px 18px}.pi-h{font-size:24px}.pi-k{font-size:9px;letter-spacing:.14em;opacity:.7;margin-top:2px}' +
    '.pi-steps{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.pi-s{border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:2px}.pi-s b{font-size:17px}.pi-s span{font-size:8px;opacity:.7}' +
    '.pi-t{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}' +
    '.pi-bar{display:flex;align-items:center;gap:8px;font-size:8.5px;margin:4px 0}.pi-bar span{width:40px}.pi-bar i{flex:1;height:6px;border-radius:9px;background:rgba(0,0,0,.08)}.pi-bar em{display:block;height:100%;border-radius:9px;background:var(--ka)}' +
    '.pi-map{display:flex;gap:10px;align-items:center;font-size:8.5px;line-height:1.4;margin-top:14px}' +
    '.pk-hex{position:absolute;left:24px;right:24px;bottom:30px;display:flex;justify-content:center;gap:10px}' +
    '.pk-hex div{width:76px;font:9px ' + F.spacemono + ';color:#333;text-align:center}.pk-hex i{display:block;height:40px;border-radius:6px;margin-bottom:5px;border:1px solid rgba(0,0,0,.12)}';

  function buildPackage(s) {
    var fr = PF[s.frame] ? s.frame : null;
    var inner = fr ? PF[fr](s) : '<div class="pk-wrap">' + boxFront(s) + '</div>';
    var html = '<div class="d pk" style="' + vars(s) + 'background:var(--kst);width:400px;height:500px">' + inner + fxLayers(s) + '</div>';
    return { w: 400, h: 500, html: html, css: PKG_CSS };
  }

  /* =============================================================== LANDING */
  var COPY = {
    plain: {
      h1: 'Welcome to Notely', p: 'Notely is a note-taking app. Take notes, organize them and find them later.', c1: 'Sign up', c2: 'Learn more',
      fh: 'Features', fs: '',
      feats: [['Fast', 'Write notes quickly.'], ['Organized', 'Keep notes in folders.'], ['Search', 'Find your notes.'], ['Sync', 'Use it on all your devices.'], ['Templates', 'Start from a template.'], ['Secure', 'Your notes are private.']],
      ph: 'Pricing', ps: '',
      plans: [['Free', '$0', '/month', 'Basic features'], ['Pro', '$8', '/month', 'All features'], ['Team', '$15', '/user/month', 'For teams']],
      foot: '© 2026 Notely. All rights reserved.'
    },
    real: {
      h1: 'Capture a thought in 2 seconds. Find it in 2 years.', p: 'Notely links every note you write, so ideas resurface exactly when you need them. Works offline, syncs everywhere.', c1: 'Start writing — free', c2: 'Watch the 90-sec demo',
      fh: 'Built for how you actually think', fs: 'Six small tools that keep your notes connected.',
      feats: [['Quick capture', 'Press ⌘J anywhere to jot a note without leaving your work.'], ['Backlinks', 'Type [[ to link notes. Connections stay both ways.'], ['Search that reads', 'Find a note by what it meant, not only the words in it.'], ['Offline first', 'Write on the subway. Everything syncs when you are back.'], ['Templates', 'Meeting notes, reading logs and weekly reviews, ready to go.'], ['Private by default', 'End-to-end encryption on every plan, including Free.']],
      ph: 'Start free. Upgrade when it clicks.', ps: 'No card needed. Cancel any time.',
      plans: [['Free', '$0', '/mo', 'For personal notes'], ['Pro', '$8', '/mo', 'For heavy note-takers'], ['Team', '$15', '/user/mo', 'For shared knowledge']],
      foot: 'Made in Seoul. © 2026 Notely Inc.'
    }
  };
  var PLAN_LI = [['Unlimited notes', '2 devices', 'Basic search'], ['Everything in Free', 'Unlimited devices', 'AI search', 'Version history'], ['Everything in Pro', 'Shared spaces', 'Admin controls & SSO']];
  var FEAT_IC = ['file', 'link', 'search', 'sync', 'layout', 'lock'];

  function appMock() {
    return '<div class="app sf2"><div class="ab"><i></i><i></i><i></i><span>Notely</span></div><div class="ac">' +
      '<div class="as"><b>Workspace</b><span class="on">Inbox <em>12</em></span><span>Today</span><span>Projects</span><span>Reading list</span><span>Archive</span></div>' +
      '<div class="al"><div class="ali on"><b>Q4 planning</b><span>Ship offline mode first</span></div><div class="ali"><b>Customer interviews</b><span>5 calls, 3 themes</span></div><div class="ali"><b>Book notes: Deep Work</b><span>Chapter 3, rules</span></div><div class="ali"><b>Weekly review</b><span>Wins, misses, next</span></div></div>' +
      '<div class="ae"><h4>Q4 planning</h4><div class="am">Edited 2 min ago · 3 backlinks</div><p>Goals for the quarter, in order:</p><ul><li class="ck">Ship offline mode</li><li class="ck">Launch AI search beta</li><li>Redesign onboarding</li></ul><p>Related: <span class="lk">[[Customer interviews]]</span></p></div>' +
      '</div></div>';
  }
  function heroDeco(s) {
    if (s.illus === 'corporate') return '';
    return s.deco && DECO[s.deco] ? '<div class="hdeco" style="opacity:' + decoOp(s.deco) + '">' + decoSVG(s.deco, 'layer', 'xMidYMid slice') + '</div>' : '';
  }
  function landingPage(s, width) {
    var C = COPY[s.copy || (s.theme ? 'real' : 'plain')];
    var cm = s.comps;
    var designed = !!s.theme;
    var dz = function (k) { return designed || cm[k] ? ' dz' : ''; };
    var badges = designed || cm.badge;
    var cls = 'd L' + (width < 600 ? ' mob' : width < 1000 ? ' tab' : '') + (s.theme ? ' t-' + s.theme : '') +
      (cm.cta ? ' c-cta' : '') + (cm.card ? ' c-card' : '') + (cm.radius ? ' c-rad' : '') + (cm.micro ? ' c-micro' : '') + (cm.badge ? ' c-badge' : '') +
      (s.anim ? ' anim' : '') + (s.a11y ? ' a11y' : '') + (s.surface ? ' has-sf' : '');
    var d = 0;
    var rv = function () { d += 1; return s.anim ? ' style="animation-delay:' + (d * 0.12).toFixed(2) + 's"' : ''; };
    var sf = s.surface ? ' sf' : '';
    var nav = '<header class="nav' + dz('nav') + ' rv" data-k="nav"' + rv() + '><div class="in">' +
      (s.a11y ? '<a class="skip">Skip to content</a>' : '') +
      '<b class="logo hd"><i class="lmk"></i>Notely' + (badges ? '<span class="pill">Beta</span>' : '') + '</b>' +
      '<nav class="links"><a' + (cm.nav ? ' class="act"' : '') + '>Product' + (cm.nav ? ' ▾' : '') + '</a><a>Features</a><a>Pricing</a><a>Blog</a></nav>' +
      '<div class="nr"><a class="login">Log in</a><a class="btn pri' + sf + '">Get started</a><i class="hb"></i></div>' +
      (cm.nav && !designed ? '<div class="dd"><a><b>Notes</b><span>Write and link ideas</span></a><a><b>Search</b><span>Find anything in seconds</span></a><a><b>Sync</b><span>Every device, offline too</span></a></div>' : '') +
      '</div></header>';
    var visual = s.illus ? '<div class="hill">' + illusScene(s, 'note', 400, 330) + '</div>' : appMock();
    var hero = '<section class="hero' + dz('hero') + '" data-k="hero">' + (designed || cm.hero ? heroDeco(s) : '') + '<div class="in">' +
      '<div class="ht">' + (badges ? '<span class="bdg rv"' + rv() + '><i></i>New · AI search is here</span>' : '') +
      '<h1 class="hd rv"' + rv() + '>' + C.h1 + '</h1><p class="rv"' + rv() + '>' + C.p + '</p>' +
      '<div class="ctas rv"' + rv() + '><a class="btn pri' + sf + '">' + C.c1 + '</a><a class="btn sec' + sf + '">' + C.c2 + '</a></div>' +
      (cm.micro ? '<div class="states"><span><a class="btn pri st-d">Default</a><em>Default</em></span><span><a class="btn pri st-h">Hover</a><em>Hover</em><svg class="cur" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-3 6z" style="fill:#111;stroke:#fff;stroke-width:1.5"/></svg></span><span><a class="btn pri st-p">Pressed</a><em>Pressed</em></span><span><a class="btn pri st-f">Focus</a><em>Focus</em></span></div>' : '') +
      (designed ? '<div class="hnote rv"' + rv() + '>Free forever for personal use · 4.9 ★ from 2,100 reviews</div>' : '') +
      '</div><div class="hv rv"' + rv() + '>' + visual + '</div></div></section>';
    var logos = cm.logos ? '<section class="logos dz" data-k="logos"><div class="in"><p>Trusted by 40,000 teams at</p><div class="lr">' +
      '<span style="font-family:' + F.archivoBlack + '">Northwind</span><span style="font-family:' + F.josefin + ';font-weight:700">lumen</span><span style="font-family:' + F.bebas + ';font-size:34px;letter-spacing:.06em">FIELDNOTE</span><span style="font-family:' + F.syne + ';font-weight:800">Orbit°</span><span style="font-family:' + F.fraunces + ';font-style:italic">Kettle &amp; Co</span><span style="font-family:' + F.spacemono + ';font-weight:700">PARALLEL</span>' +
      '</div></div></section>' : '';
    var feat = '<section class="feat' + dz('feat') + '" data-k="feat"><div class="in"><h2 class="hd">' + C.fh + '</h2>' + (C.fs && (designed || cm.feat) ? '<p class="sub">' + C.fs + '</p>' : '') +
      '<div class="fg">' + C.feats.map(function (f, i) {
        return '<div class="fc card' + sf + ' rv"' + rv() + '><i class="fi">' + iconSvg(FEAT_IC[i], s.iconMode || 'outline', 22, 'currentColor', 'var(--kc)') + '</i><h3>' + f[0] + '</h3><p>' + f[1] + '</p></div>';
      }).join('') + '</div></div></section>';
    var testi = cm.testi ? '<section class="testi dz" data-k="testi"><div class="in"><h2 class="hd">Loved by people who write a lot</h2><div class="tg">' +
      [['I stopped losing ideas between meetings. Backlinks alone are worth it.', 'Minji Park', 'Product designer, Lumen', '#f4b740'],
       ['Notely is the first notes app our whole team actually opens every day.', 'Daniel Cho', 'Engineering lead, Orbit', '#5b8def'],
       ['Offline mode saved my thesis on a 12-hour flight.', 'Sora Lee', 'PhD student, KAIST', '#e86a5a']].map(function (t) {
        return '<figure class="tc card' + sf + '"><div class="stars">★★★★★</div><blockquote>“' + t[0] + '”</blockquote><figcaption><i style="background:' + t[3] + '">' + t[1].charAt(0) + '</i><span><b>' + t[1] + '</b>' + t[2] + '</span></figcaption></figure>';
      }).join('') + '</div></div></section>' : '';
    var price = '<section class="price' + dz('price') + '" data-k="price"><div class="in"><h2 class="hd">' + C.ph + '</h2>' + (C.ps && (designed || cm.price) ? '<p class="sub">' + C.ps + '</p>' : '') +
      '<div class="pg">' + C.plans.map(function (p, i) {
        return '<div class="pc card' + sf + (i === 1 ? ' pop' : '') + '">' + (i === 1 && (designed || cm.price || badges) ? '<span class="pp">Most popular</span>' : '') +
          '<h3>' + p[0] + '</h3><div class="amt">' + p[1] + '<small>' + p[2] + '</small></div><p>' + p[3] + '</p><ul>' + PLAN_LI[i].map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' +
          '<a class="btn' + (i === 1 ? ' pri' : '') + sf + '">' + (i === 0 ? 'Start free' : i === 1 ? 'Try Pro free' : 'Contact sales') + '</a></div>';
      }).join('') + '</div></div></section>';
    var faq = cm.faq ? '<section class="faq dz" data-k="faq"><div class="in"><h2 class="hd">Questions, answered</h2><div class="fq">' +
      '<div class="qi open"><div class="qq">Is there really a free plan?<i>−</i></div><div class="qa">Yes. Free includes unlimited notes on two devices, with no time limit.</div></div>' +
      '<div class="qi"><div class="qq">Can I import from other apps?<i>+</i></div></div>' +
      '<div class="qi"><div class="qq">Does Notely work offline?<i>+</i></div></div>' +
      '<div class="qi"><div class="qq">How is my data encrypted?<i>+</i></div></div></div></div></section>' : '';
    var foot = '<footer class="foot' + dz('foot') + '" data-k="foot"><div class="in"><div class="fb"><b class="logo hd"><i class="lmk"></i>Notely</b><p>' + C.foot + '</p>' +
      (designed || cm.foot ? '<div class="nl"><span>you@email.com</span><a class="btn pri">Subscribe</a></div>' : '') + '</div>' +
      '<div class="fcols"><div><b>Product</b><a>Features</a><a>Pricing</a><a>Changelog</a></div><div><b>Company</b><a>About</a><a>Careers</a><a>Contact</a></div><div><b>Legal</b><a>Privacy</a><a>Terms</a></div></div></div></footer>';
    var over = '';
    if (s.modal) over += '<div class="ov"><div class="mdl"><span class="x">×</span><h3>Create your free account</h3><p>Start writing in under a minute. No card needed.</p><label>Work email</label><div class="inp">minji@lumen.so</div><a class="btn pri">Continue</a><small>By continuing you agree to the Terms.</small></div></div>';
    if (s.toast) over += '<div class="toast"><i>✓</i><div><b>Note saved</b><span>“Q4 planning” synced to all devices.</span></div><a>Undo</a></div>';
    var body = (s.sticky ? '' : nav) + hero + logos + feat + testi + price + faq + foot;
    if (s.sticky) {
      return '<div class="' + cls + ' sticky" style="' + vars(s) + 'width:' + width + 'px">' + '<div class="scr">' + body + '</div>' +
        nav.replace('class="nav', 'class="nav stk dz') + '<div class="sbar"><i></i></div>' + over + '</div>';
    }
    return '<div class="' + cls + '" style="' + vars(s) + 'width:' + width + 'px">' + body + over + '</div>';
  }

  var L_CSS =
    '.L{font-family:var(--pbf);font-size:16px;line-height:1.45;color:var(--kfg);background:var(--kbg);position:relative}' +
    '.L a{color:var(--ka);text-decoration:underline;cursor:pointer}' +
    '.L .in{max-width:1080px;margin:0 auto;padding:0 24px;position:relative}' +
    '.L h1,.L h2,.L h3,.L h4,.L p,.L ul,.L figure,.L blockquote{margin:0}' +
    /* plain 원본 */
    '.nav{padding:14px 0;border-bottom:1px solid #cccccc;background:var(--kbg)}.nav .in{display:flex;align-items:center;gap:24px}' +
    '.logo{font-size:22px;color:var(--kfg);display:flex;align-items:center;gap:9px}.lmk{display:none}.hb{display:none}.skip{display:none}' +
    '.links{display:flex;gap:16px;font-size:15px}.nr{margin-left:auto;display:flex;gap:12px;align-items:center;font-size:15px}' +
    '.L .btn{display:inline-block;font:13px Arial,sans-serif;padding:4px 10px;border:1px solid #767676;border-radius:3px;background:#efefef;color:#000;text-decoration:none}' +
    '.pill{display:none}.bdg{display:none}' +
    '.hero{padding:40px 0;text-align:center}.hero h1{font-size:36px;margin-bottom:12px}.hero p{margin-bottom:16px}' +
    '.ctas{display:flex;gap:8px;justify-content:center}.hv{margin:30px auto 0;max-width:760px}.hill{width:100%;aspect-ratio:400/330}' +
    '.feat,.price{padding:30px 0;border-top:1px solid #cccccc}.feat h2,.price h2{font-size:26px;margin-bottom:16px}' +
    '.fg{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.fc h3{font-size:18px;margin-bottom:4px}.fc p{font-size:15px}.fi{display:none}' +
    '.pg{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.pc{border:1px solid #cccccc;padding:16px}.pc h3{font-size:18px;margin-bottom:4px}' +
    '.amt{font-size:24px;font-weight:700}.amt small{font-size:13px;font-weight:400}.pc ul{margin:10px 0;padding-left:18px;font-size:14px}.pp{display:none}' +
    '.foot{padding:24px 0;border-top:1px solid #cccccc;font-size:13px}.foot .in{display:flex;gap:60px}.fcols{display:flex;gap:40px}.fcols div{display:flex;flex-direction:column;gap:2px}' +
    '.app{border:1px solid #999999;background:#ffffff;text-align:left;font-size:13px;color:#111}' +
    '.ab{height:26px;background:#dddddd;display:flex;align-items:center;gap:6px;padding:0 10px;font-size:12px}.ab i{width:10px;height:10px;border-radius:50%;background:#bbbbbb}.ab span{margin-left:8px}' +
    '.ac{display:grid;grid-template-columns:150px 200px 1fr;min-height:300px}.as{border-right:1px solid #cccccc;padding:10px;display:flex;flex-direction:column;gap:6px}.as em{font-style:normal;float:right}' +
    '.al{border-right:1px solid #cccccc}.ali{padding:10px;border-bottom:1px solid #dddddd;display:flex;flex-direction:column}.ali span{color:#666;font-size:12px}' +
    '.ae{padding:16px}.ae h4{font-size:20px;margin:0 0 4px}.am{font-size:11px;color:#777;margin-bottom:12px}.ae ul{padding-left:18px;margin:8px 0}.lk{color:#0000ee;text-decoration:underline}' +
    /* designed sections */
    '.nav.dz{border:0;padding:0;height:76px;display:flex;align-items:center;border-bottom:1px solid var(--kline)}.nav.dz .in{width:100%}' +
    '.dz .logo{font-size:22px;letter-spacing:-.02em}.dz .lmk{display:block;width:26px;height:26px;border-radius:8px;background:var(--ka);position:relative}' +
    '.dz .lmk::after{content:"";position:absolute;left:7px;top:6px;width:12px;height:14px;border-radius:2px;background:var(--kon);box-shadow:inset 0 -4px 0 rgba(0,0,0,.18)}' +
    '.dz .links{margin-left:28px;gap:30px}.dz .links a,.dz .login{color:var(--kmut);text-decoration:none;font-size:15px;font-weight:500}' +
    '.dz .btn,.c-cta .hero .btn{font:600 15px/1 var(--bf);padding:13px 20px;border-radius:var(--rad);border:1px solid var(--kline);background:var(--ksurf);color:var(--kfg);text-decoration:none}' +
    '.dz .btn.pri,.c-cta .hero .btn.pri{background:var(--ka);border-color:var(--ka);color:var(--kon)}.dz .btn.sec{background:transparent}' +
    '.c-cta .hero .btn{padding:16px 26px;font-size:17px;border-radius:12px}.c-cta .hero .btn.pri{box-shadow:0 10px 24px -8px var(--ka),inset 0 1px 0 rgba(255,255,255,.3)}' +
    '.c-cta .hero .btn.pri::after{content:" →"}.c-cta .hero .btn.sec{background:transparent;border:1.5px solid var(--kfg);color:var(--kfg)}' +
    '.dz .pill{display:inline-block;font:600 11px/1 var(--bf);padding:4px 7px;border-radius:999px;background:var(--kc);color:var(--ka);margin-left:4px}' +
    '.hero.dz{padding:96px 0 88px;text-align:left;overflow:hidden;position:relative}.hero.dz .in{display:grid;grid-template-columns:1.02fr 1fr;gap:56px;align-items:center}' +
    '.hdeco{position:absolute;inset:0;opacity:.9}' +
    '.hero.dz h1{font-size:calc(62px * var(--hsc));margin:18px 0 20px}.hero.dz p{font-size:19px;line-height:1.55;color:var(--kmut);max-width:520px}' +
    '.hero.dz .ctas{justify-content:flex-start;gap:12px;margin-top:32px}.hero.dz .hv{margin:0;max-width:none}' +
    '.hnote{font-size:13px;color:var(--kmut);margin-top:18px}' +
    '.dz .bdg,.c-badge .bdg{display:inline-flex;align-items:center;gap:8px;font:600 13px var(--bf);padding:7px 13px;border-radius:999px;background:var(--kc);color:var(--ka)}.bdg i{width:7px;height:7px;border-radius:50%;background:var(--ka)}' +
    '.c-badge .pill,.c-badge .pp{display:inline-block;font:600 11px/1 var(--bf);padding:5px 9px;border-radius:999px;background:#ffe9a8;color:#7a4b00;margin-left:6px}' +
    '.feat.dz,.price.dz{border:0;padding:96px 0}.feat.dz h2,.price.dz h2,.testi h2,.faq h2{font-size:calc(42px * var(--hsc));text-align:center;letter-spacing:var(--hls);margin-bottom:12px}' +
    '.sub{text-align:center;color:var(--kmut);font-size:18px;margin-bottom:48px!important}' +
    '.dz .fc,.c-card .fc{padding:28px;border-radius:calc(var(--rad) + 4px);background:var(--ksurf);border:1px solid var(--kline)}' +
    '.c-card .fc{box-shadow:0 1px 2px rgba(0,0,0,.05),0 12px 28px -14px rgba(0,0,0,.25);border-radius:16px}' +
    '.dz .fi,.c-card .fi{display:flex;width:46px;height:46px;border-radius:12px;align-items:center;justify-content:center;background:var(--kc);color:var(--ka);margin-bottom:18px}' +
    '.dz .fc h3{font-size:19px;margin-bottom:8px}.dz .fc p{color:var(--kmut);font-size:15.5px;line-height:1.55}' +
    '.dz .pc{padding:30px;border-radius:calc(var(--rad) + 6px);background:var(--ksurf);border:1px solid var(--kline);position:relative}' +
    '.dz .pc.pop{border:2px solid var(--ka);box-shadow:0 24px 48px -20px rgba(0,0,0,.28)}' +
    '.dz .pp{display:block;position:absolute;top:-13px;left:30px;font:700 12px/1 var(--bf);padding:7px 11px;border-radius:999px;background:var(--ka);color:var(--kon)}' +
    '.dz .pc h3{font-size:18px}.dz .pc p{color:var(--kmut);font-size:15px}.dz .amt{font:800 46px/1 var(--hf);margin:14px 0 8px;letter-spacing:-.02em}.dz .amt small{font:500 15px var(--bf);color:var(--kmut);letter-spacing:0}' +
    '.dz .pc ul{list-style:none;padding:0;margin:20px 0 26px;font-size:15px;line-height:2.1}.dz .pc li::before{content:"✓";color:var(--ka);font-weight:700;margin-right:10px}.dz .pc .btn{display:block;text-align:center}' +
    '.foot.dz{border-top:1px solid var(--kline);padding:60px 0 48px}.foot.dz .in{justify-content:space-between}.foot.dz .fcols{gap:72px}.foot.dz .fcols div{gap:10px;font-size:14px}.foot.dz .fcols a{color:var(--kmut);text-decoration:none}' +
    '.foot.dz p{color:var(--kmut);font-size:14px;margin-top:12px}.nl{display:flex;gap:8px;margin-top:20px}.nl span{border:1px solid var(--kline);border-radius:var(--rad);padding:11px 14px;font-size:14px;color:var(--kmut);width:220px;background:var(--ksurf)}' +
    '.dz .app{border:1px solid var(--kline);border-radius:16px;overflow:hidden;background:var(--ksurf);color:var(--kfg);box-shadow:0 40px 80px -30px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.06);font-family:var(--bf)}' +
    '.dz .ab{background:transparent;border-bottom:1px solid var(--kline);height:38px;padding:0 14px}.dz .ab i:nth-child(1){background:#ff5f57}.dz .ab i:nth-child(2){background:#febc2e}.dz .ab i:nth-child(3){background:#28c840}.dz .ab span{color:var(--kmut);font-weight:600}' +
    '.dz .ac{grid-template-columns:140px 190px 1fr;min-height:330px}.dz .as,.dz .al{border-color:var(--kline)}.dz .as{font-size:13px;gap:4px;padding:14px 10px;color:var(--kmut)}.dz .as b{font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}' +
    '.dz .as span{padding:6px 8px;border-radius:7px}.dz .as .on{background:var(--kc);color:var(--ka);font-weight:600}' +
    '.dz .ali{border-color:var(--kline);padding:12px 14px}.dz .ali.on{background:var(--kc)}.dz .ali span{color:var(--kmut)}' +
    '.dz .ae{padding:22px 24px;font-size:14px;line-height:1.6}.dz .ae h4{font:700 24px var(--hf);letter-spacing:-.01em}.dz .am{color:var(--kmut)}' +
    '.dz .ae ul{list-style:none;padding:0}.dz .ae li{padding-left:26px;position:relative}.dz .ae li::before{content:"";position:absolute;left:0;top:4px;width:15px;height:15px;border-radius:4px;border:1.5px solid var(--kline)}' +
    '.dz .ae li.ck::before{background:var(--ka);border-color:var(--ka)}.dz .ae li.ck{color:var(--kmut);text-decoration:line-through}.dz .lk{color:var(--ka);text-decoration:none;background:var(--kc);padding:1px 5px;border-radius:5px}' +
    /* extra sections */
    '.logos{padding:44px 0;border-top:1px solid var(--kline);border-bottom:1px solid var(--kline);text-align:center}.logos p{font-size:14px;color:var(--kmut);margin-bottom:22px}' +
    '.lr{display:flex;justify-content:space-between;align-items:center;font-size:26px;color:var(--kmut);opacity:.85}' +
    '.testi{padding:96px 0;background:var(--kc)}.tg{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:40px}' +
    '.tc{background:var(--ksurf);border:1px solid var(--kline);border-radius:18px;padding:28px;display:flex;flex-direction:column;gap:16px}.stars{color:#f5a623;letter-spacing:2px}' +
    '.tc blockquote{font-size:19px;line-height:1.45;font-family:var(--hf)}.tc figcaption{display:flex;gap:12px;align-items:center;font-size:14px;color:var(--kmut)}.tc figcaption b{display:block;color:var(--kfg)}' +
    '.tc figcaption i{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-style:normal;font-weight:700}' +
    '.faq{padding:96px 0}.fq{max-width:760px;margin:40px auto 0}.qi{border-bottom:1px solid var(--kline)}.qq{display:flex;justify-content:space-between;padding:22px 4px;font-size:19px;font-weight:600}.qq i{font-style:normal;color:var(--ka);font-size:24px;line-height:1}' +
    '.qi.open{background:var(--kc);border-radius:14px;border:0;padding:0 18px;margin-bottom:6px}.qa{padding:0 4px 22px;color:var(--kmut);font-size:16px}' +
    '.dd{position:absolute;left:150px;top:46px;background:#ffffff;border:1px solid #dddddd;border-radius:12px;box-shadow:0 18px 40px -12px rgba(0,0,0,.25);padding:10px;display:flex;flex-direction:column;width:280px;z-index:3}' +
    '.dd a{text-decoration:none;color:#111;padding:10px 12px;border-radius:8px;display:flex;flex-direction:column;font-size:14px}.dd a:first-child{background:#f2f4ff}.dd span{color:#666;font-size:13px}' +
    '.links .act{font-weight:700;text-decoration:none;border-bottom:2px solid var(--ka)}' +
    '.states{display:flex;gap:18px;margin-top:30px;justify-content:inherit}.states span{display:flex;flex-direction:column;align-items:center;gap:8px;position:relative}.states em{font:12px ' + F.spacemono + ';font-style:normal;color:var(--kmut)}' +
    '.states .btn{font:600 15px/1 var(--bf)!important;padding:12px 20px!important;border-radius:10px!important;background:#2f5bff!important;border:0!important;color:#fff!important}' +
    '.states .st-h{background:#2449d8!important;box-shadow:0 8px 18px -6px rgba(36,73,216,.7);transform:translateY(-2px)}.states .st-p{background:#1c3bb3!important;transform:translateY(1px) scale(.98)}' +
    '.states .st-f{outline:3px solid #9fb3ff;outline-offset:3px}.cur{position:absolute;width:22px;height:22px;left:58%;top:22px}' +
    '.c-micro .fc:nth-child(2){transform:translateY(-6px);box-shadow:0 18px 30px -12px rgba(0,0,0,.3)}' +
    '.c-rad .btn{border-radius:999px!important}.c-rad .pc,.c-rad .fc,.c-rad .app,.c-rad .tc{border-radius:24px!important;overflow:hidden}' +
    '.ov{position:absolute;left:0;right:0;top:0;height:1700px;background:rgba(10,12,20,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);z-index:5}' +
    '.mdl{position:absolute;left:50%;top:300px;width:460px;margin-left:-230px;background:#ffffff;color:#111;border-radius:18px;padding:34px;box-shadow:0 40px 80px -20px rgba(0,0,0,.5);font-family:' + F.dmsans + ';display:flex;flex-direction:column;gap:12px}' +
    '.mdl h3{font-size:26px}.mdl p{color:#555}.mdl label{font-size:13px;font-weight:600;margin-top:6px}.mdl .inp{border:1.5px solid #2f5bff;border-radius:10px;padding:13px 14px;box-shadow:0 0 0 4px rgba(47,91,255,.15)}' +
    '.mdl .btn{font:600 16px/1 ' + F.dmsans + '!important;padding:15px!important;border-radius:10px!important;text-align:center;background:#2f5bff!important;color:#fff!important;border:0!important}.mdl small{color:#777;text-align:center}' +
    '.mdl .x{position:absolute;right:18px;top:12px;font-size:26px;color:#888}' +
    '.toast{position:absolute;right:40px;top:100px;z-index:6;display:flex;gap:14px;align-items:center;background:#16181d;color:#fff;border-radius:14px;padding:16px 20px;width:390px;box-shadow:0 24px 50px -16px rgba(0,0,0,.5);font-family:' + F.dmsans + '}' +
    '.toast i{width:30px;height:30px;border-radius:50%;background:#22c55e;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:700;flex:none}.toast b{display:block;font-size:15px}.toast span{font-size:13px;color:#b8bcc6}.toast a{margin-left:auto;color:#9fb3ff;font-weight:600;text-decoration:none}' +
    '.sticky .scr{transform:translateY(-640px)}.nav.stk{position:absolute;left:0;right:0;top:0;z-index:4;background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(14px) saturate(180%);backdrop-filter:blur(14px) saturate(180%);box-shadow:0 8px 24px -12px rgba(0,0,0,.25)}' +
    '.t-reference .nav.stk,.t-dark .nav.stk{background:rgba(10,10,14,.6)}' +
    '.sbar{position:absolute;right:6px;top:84px;width:8px;height:900px;border-radius:9px;background:rgba(0,0,0,.06);z-index:4}.sbar i{display:block;width:8px;height:200px;margin-top:300px;border-radius:9px;background:rgba(0,0,0,.35)}' +
    '.has-sf .fc.sf,.has-sf .pc.sf,.has-sf .tc.sf{padding:26px}' +
    /* staggered reveal */
    '@keyframes rv{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}.anim .rv{animation:rv .8s cubic-bezier(.2,.7,.2,1) both}' +
    /* a11y */
    '.a11y .skip{display:block;position:absolute;left:24px;top:-6px;background:var(--kfg);color:var(--kbg);padding:6px 12px;border-radius:0 0 8px 8px;font-size:13px;text-decoration:none}' +
    '.a11y .hero .btn.pri{outline:3px solid var(--kfg);outline-offset:4px}.a11y .links a{text-decoration:underline;color:var(--kfg)}.a11y .hero p{font-size:20px;color:var(--kfg)}' +
    /* responsive */
    '.mob .links,.mob .login,.mob .nr .btn{display:none}.mob .hb{display:block;width:24px;height:16px;border-top:2.5px solid var(--kfg);border-bottom:2.5px solid var(--kfg);position:relative}.mob .hb::after{content:"";position:absolute;left:0;right:0;top:4.5px;border-top:2.5px solid var(--kfg)}' +
    '.mob .in{padding:0 20px}.mob .hero.dz{padding:44px 0 40px}.mob .hero.dz .in,.tab .hero.dz .in{grid-template-columns:1fr;gap:36px}.mob .hero.dz h1{font-size:40px}.mob .hero.dz p{font-size:17px}' +
    '.mob .ctas{flex-direction:column}.mob .ctas .btn{text-align:center}.mob .fg,.mob .pg,.mob .tg{grid-template-columns:1fr}.tab .fg{grid-template-columns:1fr 1fr}' +
    '.mob .ac,.tab .ac{grid-template-columns:1fr}.mob .as,.mob .al,.tab .as{display:none}.mob .feat.dz,.mob .price.dz{padding:56px 0}.mob .feat.dz h2,.mob .price.dz h2{font-size:30px}' +
    '.mob .foot .in{flex-direction:column;gap:28px}.mob .fcols{gap:28px!important}.mob .nav.dz{height:62px}.mob .lr{flex-wrap:wrap;gap:16px;justify-content:center}' +
    '.mob .hero{padding:24px 0}.mob .hero h1{font-size:28px}.mob .feat .fg{gap:12px}';

  var THEME_CSS =
    '.t-shadcn .dz .btn{font:500 14px/1 var(--bf);padding:11px 16px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05)}.t-shadcn .dz .fi{background:transparent;border:1px solid var(--kline);color:var(--kfg);border-radius:8px;width:40px;height:40px}' +
    '.t-shadcn .dz .bdg{background:transparent;border:1px solid var(--kline);color:var(--kfg);font-weight:500}.t-shadcn .bdg i{background:#22c55e}.t-shadcn .hero.dz h1{font-weight:700;letter-spacing:-.035em}.t-shadcn .dz .pc.pop{border:2px solid var(--kfg)}.t-shadcn .dz .pp{background:var(--kfg)}' +
    '.t-tailwind .hero.dz{background:linear-gradient(180deg,#eef2ff,var(--kbg))}.t-tailwind .dz .btn{border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.08)}.t-tailwind .dz .btn.pri{background:#4f46e5;border-color:#4f46e5}.t-tailwind .dz .fi{background:#4f46e5;color:#fff;border-radius:8px}' +
    '.t-tailwind .dz .fc{box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px -1px rgba(0,0,0,.1);border-color:#e5e7eb}.t-tailwind .dz .bdg{background:#e0e7ff;color:#4338ca}' +
    '.t-reference .hero.dz{background:radial-gradient(ellipse 60% 50% at 30% 0%,rgba(94,106,210,.35),transparent 70%),radial-gradient(ellipse 40% 40% at 90% 20%,rgba(180,90,220,.18),transparent 70%)}' +
    '.t-reference .hero.dz h1{background:linear-gradient(180deg,#ffffff 30%,#8a8f98);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.t-reference .dz .fc,.t-reference .dz .pc{background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01))}.t-reference .dz .app{box-shadow:0 0 0 1px rgba(255,255,255,.06),0 40px 120px -20px rgba(94,106,210,.45)}' +
    '.t-reference .dz .fi{background:rgba(94,106,210,.16);color:#a5adff}.t-reference .dz .btn.pri{color:#fff}' +
    '.t-distinct .dz .btn{border-radius:0;border:1.5px solid var(--kfg);font-family:' + F.plexmono + ';font-size:14px;text-transform:uppercase;letter-spacing:.06em}.t-distinct .dz .btn.pri{box-shadow:4px 4px 0 var(--kfg)}' +
    '.t-distinct .hero.dz h1{font-size:84px;line-height:.95;font-weight:400}.t-distinct .hero.dz h1::first-line{font-style:italic}.t-distinct .dz .fc,.t-distinct .dz .pc{border:1.5px solid var(--kfg);border-radius:0;background:transparent}' +
    '.t-distinct .feat.dz .fg{gap:0}.t-distinct .dz .fc{margin:-.75px}.t-distinct .dz .fi{background:transparent;color:var(--ka);border:1.5px solid var(--kfg);border-radius:50%}.t-distinct .dz .pp{border-radius:0;font-family:' + F.plexmono + '}' +
    '.t-distinct .dz .app{border-radius:0;border:1.5px solid var(--kfg);box-shadow:10px 10px 0 var(--ka)}.t-distinct .dz .bdg{border-radius:0;background:var(--kfg);color:var(--kbg);font-family:' + F.plexmono + '}' +
    '.t-brief .hero .ht::before{content:"For researchers, writers and students";display:block;font:600 13px var(--bf);letter-spacing:.12em;text-transform:uppercase;color:var(--ka);margin-bottom:6px}';

  /* ---------------------------------------------------------- app screens */
  function sideNav(active, full) {
    var items = [['file', 'All notes', '1,284'], ['star', 'Favorites', '36'], ['calendar', 'Today', '4'], ['layout', 'Projects', ''], ['link', 'Backlinks', ''], ['lock', 'Private', ''], ['sync', 'Synced', '']];
    return '<aside class="sn">' +
      '<div class="sn-ws"><i>N</i><div><b>Minji’s notes</b><span>Personal · Pro</span></div></div>' +
      '<div class="sn-sr">' + iconSvg('search', 'outline', 16, 'currentColor') + '<span>Search</span><kbd>⌘K</kbd></div>' +
      items.map(function (it, i) { return '<div class="sn-it' + (i === active ? ' on' : '') + '">' + iconSvg(it[0], 'outline', 18, 'currentColor') + '<span>' + it[1] + '</span><em>' + it[2] + '</em></div>'; }).join('') +
      (full ? '<div class="sn-sub"><span>Q4 planning</span><span>Customer interviews</span><span>Launch checklist</span></div>' : '') +
      '<div class="sn-h">Tags</div>' + ['#research', '#meetings', '#reading', '#ideas'].map(function (t, i) { return '<div class="sn-tg"><i style="background:' + ['#f59e0b', '#3b82f6', '#10b981', '#ec4899'][i] + '"></i>' + t + '</div>'; }).join('') +
      '<div class="sn-me"><i>M</i><div><b>Minji Park</b><span>minji@lumen.so</span></div></div></aside>';
  }
  function appScreen(s) {
    var k = s.app, main = '';
    if (k === 'sidebar') {
      main = '<div class="ap-list"><div class="ap-lh"><b>All notes</b><span>1,284</span></div>' +
        [['Q4 planning', 'Ship offline mode first, then AI search beta.', '2m'], ['Customer interviews', 'Five calls, three recurring themes.', '1h'], ['Book notes: Deep Work', 'Chapter 3, rules for focus.', 'Mon'], ['Weekly review', 'Wins, misses, next week.', 'Sun'], ['Launch checklist', 'Docs, pricing page, changelog.', 'Fri'], ['Reading list', '12 essays queued.', 'Thu']].map(function (n, i) {
          return '<div class="ap-li' + (i === 0 ? ' on' : '') + '"><b>' + n[0] + '</b><span>' + n[1] + '</span><em>' + n[2] + '</em></div>';
        }).join('') + '</div>' +
        '<div class="ap-ed"><div class="ap-crumb">Projects / Q4 planning</div><h2 class="hd">Q4 planning</h2><p class="ap-meta">Edited 2 min ago · 3 backlinks</p><p>Goals for the quarter, in order of impact:</p><ul><li class="ck">Ship offline mode</li><li class="ck">Launch AI search beta</li><li>Redesign onboarding</li><li>Publish the public API</li></ul><p>Related: <span class="lk">[[Customer interviews]]</span> <span class="lk">[[Launch checklist]]</span></p></div>';
      return '<div class="ap">' + sideNav(0, true) + main + '</div>';
    }
    if (k === 'dashboard') {
      var bars = [12, 18, 9, 22, 30, 16, 26, 34, 28, 20, 38, 32];
      var chart = bars.map(function (v, i) { return '<rect x="' + (i * 42 + 10) + '" y="' + (200 - v * 5) + '" width="26" height="' + (v * 5) + '" rx="5" style="fill:' + (i === 10 ? 'var(--ka)' : 'var(--kc)') + '"/>'; }).join('');
      main = '<div class="ap-db"><div class="ap-top"><div><h2 class="hd">Good morning, Minji</h2><p>Here’s what moved in your notes this week.</p></div><a class="ap-btn">+ New note</a></div>' +
        '<div class="ap-stats">' + [['Notes', '1,284', '+32 this week'], ['Words written', '48.2k', '+12%'], ['Linked ideas', '3,410', '+118'], ['Writing streak', '18 days', 'Best: 24']].map(function (x) { return '<div class="ap-st"><span>' + x[0] + '</span><b class="hd">' + x[1] + '</b><em>' + x[2] + '</em></div>'; }).join('') + '</div>' +
        '<div class="ap-grid"><div class="ap-card"><div class="ap-ch"><b>Notes per week</b><span>Last 12 weeks</span></div>' + svgWrap('0 0 510 210', chart, 'ap-chart') + '</div>' +
        '<div class="ap-card"><div class="ap-ch"><b>Top tags</b></div>' + [['#research', 82], ['#meetings', 64], ['#reading', 41], ['#ideas', 28]].map(function (t) { return '<div class="ap-tag"><span>' + t[0] + '</span><i><em style="width:' + t[1] + '%"></em></i></div>'; }).join('') + '</div></div>' +
        '<div class="ap-card"><div class="ap-ch"><b>Recently edited</b><span>View all</span></div>' + [['Q4 planning', 'Projects', '2 min ago'], ['Customer interviews', 'Research', '1 hour ago'], ['Weekly review', 'Personal', 'Yesterday'], ['Launch checklist', 'Projects', 'Friday']].map(function (r) { return '<div class="ap-row"><b>' + r[0] + '</b><span class="ap-chip">' + r[1] + '</span><em>' + r[2] + '</em></div>'; }).join('') + '</div></div>';
      return '<div class="ap">' + sideNav(-1, false) + main + '</div>';
    }
    if (k === 'table') {
      var rows = [['Q4 planning', 'Projects', '#planning', '2 min ago', '1,204'], ['Customer interviews', 'Research', '#research', '1 hour ago', '3,880'], ['Book notes: Deep Work', 'Reading', '#reading', 'Mon', '2,150'], ['Weekly review', 'Personal', '#review', 'Sun', '640'], ['Launch checklist', 'Projects', '#launch', 'Fri', '512'], ['Pricing experiments', 'Research', '#growth', 'Thu', '1,730'], ['Onboarding ideas', 'Projects', '#ideas', 'Wed', '890'], ['Reading list', 'Reading', '#reading', 'Tue', '310'], ['Hiring loop notes', 'Team', '#meetings', 'Oct 2', '2,045'], ['Design critique', 'Team', '#meetings', 'Sep 30', '1,120'], ['API naming', 'Projects', '#eng', 'Sep 28', '760'], ['Trip to Busan', 'Personal', '#travel', 'Sep 21', '420'], ['Quarterly OKRs', 'Team', '#planning', 'Sep 18', '980'], ['Podcast ideas', 'Personal', '#ideas', 'Sep 12', '355']];
      main = '<div class="ap-tb"><div class="ap-top"><div><h2 class="hd">All notes</h2><p>1,284 notes · sorted by last edited</p></div><a class="ap-btn">+ New note</a></div>' +
        '<div class="ap-flt"><span class="on">All</span><span>Projects</span><span>Research</span><span>Reading</span><span>Team</span><div class="ap-q">' + iconSvg('search', 'outline', 15, 'currentColor') + 'Filter notes…</div></div>' +
        '<table class="ap-t"><thead><tr><th><i class="cb"></i></th><th>Title ↓</th><th>Folder</th><th>Tag</th><th>Updated</th><th style="text-align:right">Words</th></tr></thead><tbody>' +
        rows.map(function (r, i) { return '<tr' + (i === 1 ? ' class="sel"' : '') + '><td><i class="cb' + (i === 1 ? ' on' : '') + '"></i></td><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td><span class="ap-chip">' + r[2] + '</span></td><td>' + r[3] + '</td><td style="text-align:right;font-variant-numeric:tabular-nums">' + r[4] + '</td></tr>'; }).join('') +
        '</tbody></table><div class="ap-pg"><span>Showing 1–14 of 1,284</span><span><a>‹ Prev</a><a class="on">1</a><a>2</a><a>3</a><a>Next ›</a></span></div></div>';
      return '<div class="ap">' + sideNav(0, false) + main + '</div>';
    }
    if (k === 'empty') {
      main = '<div class="ap-em"><div class="ap-emv">' + subjectSVG('note', s.illus || 'flat', s) + '</div><h2 class="hd">No notes yet</h2><p>Press ⌘J anywhere to capture your first thought. It lands here.</p><div class="ap-emb"><a class="ap-btn">+ New note</a><a class="ap-btn sec">Import from Markdown</a></div><div class="ap-tip">Tip: type [[ to link two notes together.</div></div>';
      return '<div class="ap">' + sideNav(1, false) + main + '</div>';
    }
    // skeleton
    var sk = function (w, h, r, mt) { return '<i class="sk" style="width:' + w + ';height:' + h + 'px;border-radius:' + (r || 8) + 'px;margin-top:' + (mt || 0) + 'px"></i>'; };
    return '<div class="skp"><div class="sk-nav">' + sk('120px', 26) + '<span style="flex:1"></span>' + sk('70px', 14) + sk('70px', 14) + sk('70px', 14) + sk('120px', 40, 10) + '</div>' +
      '<div class="sk-hero"><div style="flex:1">' + sk('180px', 28, 99) + sk('92%', 46, 10, 26) + sk('70%', 46, 10, 14) + sk('84%', 18, 6, 30) + sk('64%', 18, 6, 12) + '<div style="display:flex;gap:12px;margin-top:34px">' + sk('170px', 50, 12) + sk('170px', 50, 12) + '</div></div>' +
      '<div style="flex:1">' + sk('100%', 380, 18) + '</div></div>' +
      '<div class="sk-cards">' + [0, 1, 2, 3, 4, 5].map(function () { return '<div class="sk-c">' + sk('46px', 46, 12) + sk('60%', 18, 6, 20) + sk('92%', 12, 6, 14) + sk('80%', 12, 6, 10) + '</div>'; }).join('') + '</div>' +
      '<div class="sk-load"><b>Loading Notely…</b></div></div>';
  }
  var APP_CSS =
    '.ap{display:flex;width:1120px;height:1400px;background:var(--kbg);color:var(--kfg);font-family:var(--bf);font-size:15px}' +
    '.sn{width:270px;flex:none;border-right:1px solid var(--kline);padding:20px 14px;display:flex;flex-direction:column;gap:3px;background:var(--ksurf)}' +
    '.sn-ws{display:flex;gap:10px;align-items:center;padding:6px 8px 16px}.sn-ws i,.sn-me i{width:34px;height:34px;border-radius:9px;background:var(--ka);color:var(--kon);font-style:normal;font-weight:800;display:flex;align-items:center;justify-content:center}' +
    '.sn-ws b,.sn-me b{display:block;font-size:14px}.sn-ws span,.sn-me span{font-size:12px;color:var(--kmut)}' +
    '.sn-sr{display:flex;gap:8px;align-items:center;border:1px solid var(--kline);border-radius:9px;padding:9px 10px;color:var(--kmut);font-size:14px;margin-bottom:12px}.sn-sr kbd{margin-left:auto;font:11px ' + F.plexmono + ';border:1px solid var(--kline);border-radius:5px;padding:1px 5px}' +
    '.sn-it{display:flex;gap:11px;align-items:center;padding:9px 10px;border-radius:9px;color:var(--kmut);font-size:14.5px}.sn-it em{margin-left:auto;font-style:normal;font-size:12px}.sn-it.on{background:var(--kc);color:var(--ka);font-weight:600}' +
    '.sn-sub{display:flex;flex-direction:column;gap:2px;margin:2px 0 6px 38px;border-left:1px solid var(--kline);padding-left:12px;font-size:13.5px;color:var(--kmut)}.sn-sub span{padding:5px 0}.sn-sub span:first-child{color:var(--kfg);font-weight:600}' +
    '.sn-h{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--kmut);padding:18px 10px 6px}' +
    '.sn-tg{display:flex;gap:10px;align-items:center;padding:6px 10px;font-size:14px;color:var(--kmut)}.sn-tg i{width:8px;height:8px;border-radius:50%}' +
    '.sn-me{margin-top:auto;display:flex;gap:10px;align-items:center;padding:12px 8px;border-top:1px solid var(--kline)}.sn-me i{border-radius:50%;background:#f4b740;color:#3a2600}' +
    '.ap-list{width:300px;flex:none;border-right:1px solid var(--kline)}.ap-lh{display:flex;justify-content:space-between;padding:22px 20px 14px;font-size:15px}.ap-lh span{color:var(--kmut)}' +
    '.ap-li{padding:14px 20px;border-top:1px solid var(--kline);display:grid;grid-template-columns:1fr auto;gap:2px}.ap-li span{grid-column:1;color:var(--kmut);font-size:13px}.ap-li em{grid-row:1;grid-column:2;font-style:normal;color:var(--kmut);font-size:12px}.ap-li.on{background:var(--kc)}' +
    '.ap-ed{flex:1;padding:40px 48px;font-size:16px;line-height:1.7}.ap-crumb{font-size:13px;color:var(--kmut)}.ap-ed h2{font-size:38px;margin:10px 0 2px;letter-spacing:-.02em}.ap-meta{color:var(--kmut);font-size:13px;margin-bottom:20px!important}' +
    '.ap-ed ul{list-style:none;padding:0;margin:10px 0 18px}.ap-ed li{position:relative;padding-left:30px;margin:4px 0}.ap-ed li::before{content:"";position:absolute;left:0;top:6px;width:17px;height:17px;border-radius:5px;border:1.5px solid var(--kline)}.ap-ed li.ck::before{background:var(--ka);border-color:var(--ka)}.ap-ed li.ck{color:var(--kmut);text-decoration:line-through}' +
    '.ap .lk{color:var(--ka);background:var(--kc);padding:2px 6px;border-radius:6px;margin-right:6px}' +
    '.ap-db,.ap-tb{flex:1;padding:36px 40px;display:flex;flex-direction:column;gap:22px}.ap-top{display:flex;justify-content:space-between;align-items:flex-start}.ap-top h2{font-size:32px;letter-spacing:-.02em}.ap-top p{color:var(--kmut);margin-top:4px!important}' +
    '.ap-btn{background:var(--ka);color:var(--kon);font-weight:600;font-size:14px;padding:11px 16px;border-radius:10px;text-decoration:none;display:inline-block}.ap-btn.sec{background:transparent;color:var(--kfg);border:1px solid var(--kline)}' +
    '.ap-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.ap-st,.ap-card{background:var(--ksurf);border:1px solid var(--kline);border-radius:16px;padding:20px}.ap-st span{font-size:13px;color:var(--kmut)}.ap-st b{display:block;font-size:30px;margin:6px 0 2px}.ap-st em{font-style:normal;font-size:12.5px;color:#16a34a}' +
    '.ap-grid{display:grid;grid-template-columns:1.7fr 1fr;gap:16px}.ap-ch{display:flex;justify-content:space-between;margin-bottom:16px}.ap-ch span{color:var(--kmut);font-size:13px}.ap-chart{width:100%;height:auto;display:block}' +
    '.ap-tag{display:flex;flex-direction:column;gap:6px;margin:12px 0;font-size:14px}.ap-tag i{height:8px;border-radius:9px;background:var(--kc)}.ap-tag em{display:block;height:100%;border-radius:9px;background:var(--ka)}' +
    '.ap-row{display:grid;grid-template-columns:1fr 140px 120px;padding:13px 0;border-top:1px solid var(--kline);align-items:center}.ap-row em{font-style:normal;color:var(--kmut);font-size:13px;text-align:right}' +
    '.ap-chip{display:inline-block;font-size:12px;padding:3px 9px;border-radius:999px;background:var(--kc);color:var(--ka);font-weight:600;justify-self:start}' +
    '.ap-flt{display:flex;gap:8px;align-items:center}.ap-flt span{padding:7px 13px;border-radius:999px;border:1px solid var(--kline);font-size:13.5px}.ap-flt span.on{background:var(--kfg);color:var(--kbg);border-color:var(--kfg)}' +
    '.ap-q{margin-left:auto;display:flex;gap:8px;align-items:center;border:1px solid var(--kline);border-radius:9px;padding:8px 12px;width:260px;color:var(--kmut);font-size:13.5px}' +
    '.ap-t{width:100%;border-collapse:collapse;font-size:14px;background:var(--ksurf);border:1px solid var(--kline);border-radius:14px;overflow:hidden}.ap-t th{text-align:left;font-size:12.5px;color:var(--kmut);font-weight:600;padding:12px 14px;border-bottom:1px solid var(--kline);background:var(--kbg)}' +
    '.ap-t td{padding:13px 14px;border-bottom:1px solid var(--kline)}.ap-t tr.sel td{background:var(--kc)}.cb{display:block;width:16px;height:16px;border-radius:5px;border:1.5px solid var(--kline)}.cb.on{background:var(--ka);border-color:var(--ka)}' +
    '.ap-pg{display:flex;justify-content:space-between;color:var(--kmut);font-size:13.5px}.ap-pg a{margin-left:10px;color:var(--kmut);text-decoration:none}.ap-pg a.on{color:var(--kfg);font-weight:700}' +
    '.ap-em{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px}.ap-emv{width:240px;height:240px;margin-bottom:22px}.ap-em h2{font-size:34px;letter-spacing:-.02em}.ap-em p{color:var(--kmut);font-size:17px;margin:10px 0 26px!important;max-width:380px}' +
    '.ap-emb{display:flex;gap:10px}.ap-tip{margin-top:36px;font-size:13.5px;color:var(--kmut);background:var(--kc);padding:9px 14px;border-radius:9px}' +
    '.skp{width:1280px;height:1600px;background:#ffffff;padding:0 100px;font-family:' + F.dmsans + '}' +
    '.sk{display:block;background:linear-gradient(90deg,#eceef2 0,#f6f7f9 40%,#eceef2 80%) 0 0/600px 100%;animation:skm 1.4s linear infinite}' +
    '@keyframes skm{from{background-position:-300px 0}to{background-position:300px 0}}.rm .sk{animation:none}' +
    '.sk-nav{height:84px;display:flex;align-items:center;gap:22px;border-bottom:1px solid #f0f0f3}.sk-hero{display:flex;gap:56px;padding:96px 0 80px;align-items:center}' +
    '.sk-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.sk-c{border:1px solid #f0f0f3;border-radius:16px;padding:28px}.sk-load{text-align:center;color:#9aa0aa;font-size:15px;margin-top:60px}';

  /* -------------------------------------------------------- landing frames */
  function pageBox(s, width, scale, viewH, extra) {
    return '<div class="pf" style="width:' + f1(width * scale) + 'px;height:' + f1(viewH * scale) + 'px;' + (extra || '') + '"><div style="width:' + width + 'px;transform:scale(' + scale + ');transform-origin:0 0">' + landingPage(s, width) + '</div></div>';
  }
  var LFR = {};
  LFR.device = function (s) {
    return '<div class="fr-bg"></div>' +
      '<div class="lap"><div class="lap-scr">' + pageBox(s, 1280, 0.7438, 800) + '</div><div class="lap-base"></div></div>' +
      '<div class="phn" style="left:880px;top:660px;width:310px;height:640px"><div class="phn-scr">' + pageBox(s, 390, 0.723, 846) + '</div></div>';
  };
  LFR.phone = function (s) {
    return '<div class="fr-bg"></div><div class="phn" style="left:330px;top:90px;width:620px;height:1290px"><div class="phn-scr">' + pageBox(s, 390, 1.518, 832) + '</div></div>' +
      '<div class="fr-lbl" style="left:330px;top:1420px;width:620px;text-align:center">390 px · mobile first</div>';
  };
  LFR.responsive = function (s) {
    return '<div class="fr-bg"></div>' +
      '<div class="fr-lbl" style="left:60px;top:70px">Desktop · 1280</div><div class="fr-win" style="left:60px;top:110px">' + pageBox(s, 1280, 0.72, 760) + '</div>' +
      '<div class="fr-lbl" style="left:140px;top:740px">Tablet · 768</div><div class="fr-win" style="left:140px;top:780px;border-radius:22px">' + pageBox(s, 768, 0.6, 1220) + '</div>' +
      '<div class="fr-lbl" style="left:720px;top:740px">Mobile · 390</div><div class="phn" style="left:720px;top:780px;width:262px;height:540px"><div class="phn-scr">' + pageBox(s, 390, 0.6, 853) + '</div></div>';
  };
  LFR.tokens = function (s) {
    var p = s.pal;
    var tok = [['--color-bg', p.bg], ['--color-fg', p.fg], ['--color-primary', p.a], ['--color-muted', p.mut || '#666'], ['--color-subtle', p.c], ['--color-accent', p.b]];
    return '<div class="tk" style="' + vars(s) + '">' +
      '<div class="tk-l"><div class="tk-h">tokens.css</div>' +
      '<div class="tk-sec">Color</div>' + tok.map(function (t) { return '<div class="tk-row"><i style="background:' + t[1] + '"></i><code>' + t[0] + '</code><span>' + t[1].toUpperCase() + '</span></div>'; }).join('') +
      '<div class="tk-sec">Type</div>' + [['--text-4xl', '48px', 48], ['--text-2xl', '28px', 28], ['--text-base', '16px', 16], ['--text-sm', '13px', 13]].map(function (t) { return '<div class="tk-row"><b class="hd" style="font-size:' + t[2] + 'px;width:120px;line-height:1">Aa</b><code>' + t[0] + '</code><span>' + t[1] + '</span></div>'; }).join('') +
      '<div class="tk-sec">Radius · Space · Shadow</div><div class="tk-rads">' + [4, 8, 16, 999].map(function (r) { return '<div><i style="border-radius:' + Math.min(r, 40) + 'px"></i><code>' + (r === 999 ? 'full' : r) + '</code></div>'; }).join('') + '</div>' +
      '<div class="tk-sp">' + [4, 8, 12, 16, 24, 32, 48].map(function (x) { return '<i style="width:' + x + 'px;height:' + x + 'px"></i>'; }).join('') + '</div>' +
      '<div class="tk-sh"><i style="box-shadow:0 1px 2px rgba(0,0,0,.08)"></i><i style="box-shadow:0 8px 20px -6px rgba(0,0,0,.2)"></i><i style="box-shadow:0 24px 48px -12px rgba(0,0,0,.3)"></i></div></div>' +
      '<div class="tk-r"><div class="tk-h">Applied</div><div class="tk-card"><span class="tk-bdg">--color-subtle</span><h3 class="hd">Notely Pro</h3><div class="tk-amt hd">$8<small>/mo</small></div><p>Unlimited devices, AI search and version history.</p><a class="tk-btn">Try Pro free</a><a class="tk-btn sec">Compare plans</a></div>' +
      '<div class="tk-card" style="margin-top:24px"><div class="tk-in">minji@lumen.so</div><div class="tk-toggle"><i></i>Sync on cellular</div></div></div></div>';
  };
  LFR.contrast = function (s) {
    var panel = function (bad) {
      var fg = bad ? '#a0a0a0' : '#595959', btn = bad ? '#8ab4f8' : '#1d4ed8';
      return '<div class="cx-p"><div class="cx-tag ' + (bad ? 'no' : 'ok') + '">' + (bad ? 'Before' : 'After') + '</div>' +
        '<h2 style="color:' + (bad ? '#9a9a9a' : '#111111') + '">Capture a thought in 2 seconds.</h2>' +
        '<p style="color:' + fg + '">Notely links every note you write, so ideas resurface exactly when you need them.</p>' +
        '<a class="cx-b" style="background:' + btn + '">Start writing — free</a>' +
        '<div class="cx-chips"><span class="' + (bad ? 'no' : 'ok') + '">Body text ' + (bad ? '2.6:1 ✕' : '7.0:1 ✓ AAA') + '</span><span class="' + (bad ? 'no' : 'ok') + '">Button ' + (bad ? '2.1:1 ✕' : '6.7:1 ✓ AA') + '</span></div></div>';
    };
    return '<div class="cx">' + panel(true) + panel(false) + '</div>';
  };
  LFR.themes = function (s) {
    var th = [['Light', { bg: '#ffffff', fg: '#0b0b0f', a: '#18181b', c: '#f4f4f5', mut: '#71717a', line: '#e4e4e7', on: '#ffffff' }], ['Dark', { bg: '#0b0b0f', fg: '#fafafa', a: '#fafafa', c: '#1c1c22', mut: '#a1a1aa', line: '#27272a', on: '#0b0b0f' }], ['Brand', { bg: '#fff7ed', fg: '#431407', a: '#ea580c', c: '#ffedd5', mut: '#9a3412', line: '#fed7aa', on: '#ffffff' }]];
    return '<div class="thm">' + th.map(function (t) {
      var v = t[1];
      var st = '--tbg:' + v.bg + ';--tfg:' + v.fg + ';--ta:' + v.a + ';--tc:' + v.c + ';--tm:' + v.mut + ';--tl:' + v.line + ';--ton:' + v.on;
      return '<div class="thm-c" style="' + st + '"><div class="thm-n">' + t[0] + '</div><div class="thm-card"><span class="thm-b">New</span><h3 class="hd">Your notes, finally organized.</h3><p>Write, link and find anything in seconds.</p><a class="thm-btn">Start free</a><a class="thm-btn sec">Demo</a></div>' +
        '<pre>--background: ' + v.bg + ';\n--foreground: ' + v.fg + ';\n--primary: ' + v.a + ';\n--muted: ' + v.c + ';\n--border: ' + v.line + ';</pre></div>';
    }).join('') + '</div>';
  };
  LFR.states = function (s) {
    var sk = function (w, h, mt) { return '<i class="sk" style="width:' + w + ';height:' + h + 'px;border-radius:8px;margin-top:' + (mt || 0) + 'px"></i>'; };
    return '<div class="sts">' +
      '<div class="sts-p"><div class="sts-n">Loading</div>' + [0, 1, 2, 3].map(function () { return '<div class="sts-row">' + sk('40px', 40) + '<div style="flex:1">' + sk('60%', 14) + sk('90%', 11, 10) + '</div></div>'; }).join('') + '</div>' +
      '<div class="sts-p"><div class="sts-n">Empty</div><div class="sts-c"><div style="width:150px;height:150px">' + subjectSVG('note', 'flat', s) + '</div><b>No notes yet</b><span>Press ⌘J to capture your first thought.</span><a class="sts-btn">+ New note</a></div></div>' +
      '<div class="sts-p"><div class="sts-n">Error</div><div class="sts-c"><div class="sts-err">!</div><b>Couldn’t sync your notes</b><span>You’re offline. Changes are saved on this device and will sync later.</span><a class="sts-btn">Try again</a><small>Error code: SYNC_TIMEOUT</small></div></div>' +
      '</div>';
  };
  var FR_CSS =
    '.fr{position:relative;width:1280px;height:1600px;overflow:hidden;font-family:' + F.dmsans + '}' +
    '.fr-bg{position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,#ffffff,#e8e6ef 60%,#dcd9e6)}' +
    '.pf{overflow:hidden;position:relative;background:#fff}' +
    '.lap{position:absolute;left:150px;top:120px;width:980px}.lap-scr{border:14px solid #1d1d22;border-bottom-width:18px;border-radius:22px 22px 0 0;overflow:hidden;background:#000}' +
    '.lap-base{height:30px;margin:0 -70px;background:linear-gradient(#d4d6db,#a9acb3);border-radius:0 0 26px 26px;box-shadow:0 30px 40px -18px rgba(0,0,0,.45)}' +
    '.phn{position:absolute;background:#121216;border-radius:44px;padding:14px;box-shadow:0 40px 70px -20px rgba(0,0,0,.5),inset 0 0 0 2px #2c2c33}' +
    '.phn-scr{width:100%;height:100%;border-radius:32px;overflow:hidden;background:#fff}.phn-scr .pf{width:100%!important}' +
    '.fr-win{position:absolute;border-radius:12px;overflow:hidden;box-shadow:0 30px 60px -24px rgba(0,0,0,.4),0 0 0 1px rgba(0,0,0,.08)}' +
    '.fr-lbl{position:absolute;font:600 22px ' + F.spacemono + ';color:#4b4b5a}' +
    '.tk{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;background:var(--kbg);color:var(--kfg);font-family:var(--bf)}' +
    '.tk-l{padding:70px 50px;border-right:1px solid var(--kline);background:var(--ksurf)}.tk-r{padding:70px 60px}' +
    '.tk-h{font:600 18px ' + F.plexmono + ';color:var(--kmut);margin-bottom:26px}.tk-sec{font-size:15px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:34px 0 14px;color:var(--kmut)}' +
    '.tk-row{display:flex;align-items:center;gap:18px;padding:10px 0;border-bottom:1px solid var(--kline)}.tk-row i{width:48px;height:48px;border-radius:12px;border:1px solid var(--kline)}.tk-row code{font:17px ' + F.plexmono + ';flex:1}.tk-row span{font:15px ' + F.plexmono + ';color:var(--kmut)}' +
    '.tk-rads{display:flex;gap:24px}.tk-rads div{display:flex;flex-direction:column;align-items:center;gap:8px;font:14px ' + F.plexmono + '}.tk-rads i{width:70px;height:70px;background:var(--kc);border:2px solid var(--ka)}' +
    '.tk-sp{display:flex;align-items:flex-end;gap:14px;margin-top:26px}.tk-sp i{background:var(--ka);opacity:.75}' +
    '.tk-sh{display:flex;gap:26px;margin-top:30px}.tk-sh i{width:110px;height:70px;border-radius:12px;background:var(--ksurf)}' +
    '.tk-card{border:1px solid var(--kline);border-radius:var(--rad);padding:36px;background:var(--ksurf);display:flex;flex-direction:column;gap:14px;box-shadow:0 24px 48px -24px rgba(0,0,0,.25)}' +
    '.tk-bdg{align-self:flex-start;font:14px ' + F.plexmono + ';background:var(--kc);color:var(--ka);padding:5px 10px;border-radius:999px}.tk-card h3{font-size:32px}.tk-amt{font-size:64px;line-height:1}.tk-amt small{font-size:20px;color:var(--kmut)}.tk-card p{color:var(--kmut);font-size:18px}' +
    '.tk-btn{display:block;text-align:center;padding:16px;border-radius:var(--rad);background:var(--ka);color:var(--kon);font-weight:600;font-size:17px;text-decoration:none}.tk-btn.sec{background:transparent;color:var(--kfg);border:1px solid var(--kline)}' +
    '.tk-in{border:1.5px solid var(--ka);border-radius:var(--rad);padding:15px;font-size:17px;box-shadow:0 0 0 4px var(--kc)}.tk-toggle{display:flex;gap:14px;align-items:center;font-size:17px}.tk-toggle i{width:52px;height:30px;border-radius:99px;background:var(--ka);position:relative}.tk-toggle i::after{content:"";position:absolute;right:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#fff}' +
    '.cx{position:absolute;inset:0;display:grid;grid-template-rows:1fr 1fr;background:#fff;font-family:' + F.dmsans + '}.cx-p{padding:90px 110px;position:relative;border-bottom:1px solid #eee}' +
    '.cx-p h2{font-size:64px;letter-spacing:-.02em;line-height:1.05;margin-bottom:22px!important;max-width:900px}.cx-p p{font-size:26px;max-width:820px;line-height:1.5}' +
    '.cx-b{display:inline-block;margin-top:34px;padding:20px 32px;border-radius:12px;color:#fff;font-weight:600;font-size:22px;text-decoration:none}' +
    '.cx-tag{position:absolute;right:110px;top:90px;font:700 20px ' + F.spacemono + ';padding:8px 16px;border-radius:999px}.cx-tag.no{background:#fee2e2;color:#b91c1c}.cx-tag.ok{background:#dcfce7;color:#15803d}' +
    '.cx-chips{display:flex;gap:14px;margin-top:34px}.cx-chips span{font:600 19px ' + F.spacemono + ';padding:9px 16px;border-radius:10px}.cx-chips .no{background:#fee2e2;color:#b91c1c}.cx-chips .ok{background:#dcfce7;color:#15803d}' +
    '.thm{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);gap:0}' +
    '.thm-c{background:var(--tbg);color:var(--tfg);padding:120px 40px;display:flex;flex-direction:column;gap:40px;font-family:' + F.dmsans + '}.thm-n{font:700 22px ' + F.plexmono + ';color:var(--tm)}' +
    '.thm-card{border:1px solid var(--tl);border-radius:14px;padding:34px;display:flex;flex-direction:column;gap:16px;background:var(--tbg)}.thm-b{align-self:flex-start;background:var(--tc);color:var(--tfg);font-size:15px;font-weight:600;padding:5px 11px;border-radius:99px}' +
    '.thm-card h3{font-size:36px;line-height:1.1;letter-spacing:-.02em}.thm-card p{color:var(--tm);font-size:19px}.thm-btn{display:block;text-align:center;padding:15px;border-radius:10px;background:var(--ta);color:var(--ton);font-weight:600;font-size:18px;text-decoration:none}.thm-btn.sec{background:transparent;color:var(--tfg);border:1px solid var(--tl)}' +
    '.thm-c pre{margin:0;font:17px/1.7 ' + F.plexmono + ';background:var(--tc);color:var(--tfg);padding:24px;border-radius:12px;white-space:pre-wrap}' +
    '.sts{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding:150px 50px;background:#f4f5f7;font-family:' + F.dmsans + '}' +
    '.sts-p{background:#fff;border-radius:22px;padding:34px;box-shadow:0 20px 40px -24px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:20px}.sts-n{font:700 20px ' + F.plexmono + ';color:#6b7280}' +
    '.sts-row{display:flex;gap:14px;align-items:center}.sts-c{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px}.sts-c b{font-size:26px}.sts-c span{color:#6b7280;font-size:18px;line-height:1.45}.sts-c small{color:#9ca3af;font:14px ' + F.plexmono + '}' +
    '.sts-btn{margin-top:10px;background:#111827;color:#fff;padding:14px 22px;border-radius:12px;font-weight:600;font-size:17px;text-decoration:none}.sts-err{width:84px;height:84px;border-radius:50%;background:#fee2e2;color:#dc2626;font-size:46px;font-weight:800;display:flex;align-items:center;justify-content:center}';

  function buildLanding(s, ctx) {
    var css = L_CSS + THEME_CSS;
    if (s.frame && LFR[s.frame]) {
      return { w: 1280, h: 1600, html: '<div class="fr' + (ctx && ctx.reducedMotion ? ' rm' : '') + '">' + LFR[s.frame](s) + '</div>', css: css + FR_CSS + APP_CSS };
    }
    if (s.app) {
      if (s.app === 'skeleton') return { w: 1280, h: 1600, html: '<div class="d' + (ctx && ctx.reducedMotion ? ' rm' : '') + '" style="' + vars(s) + '">' + appScreen(s) + '</div>', css: css + APP_CSS };
      return { w: 1120, h: 1400, html: '<div class="d" style="' + vars(s) + '">' + appScreen(s) + '</div>', css: css + APP_CSS };
    }
    return { w: 1280, h: 1600, html: landingPage(s, 1280), css: css, focus: s.focus };
  }

  /* ------------------------------------------------ poster extras & frames */
  PL.icons = function (s) {
    var m = s.iconMode || 'outline';
    var row = function (ic, t, sub) { return '<div class="ic-r"><i>' + iconSvg(ic, m, 26, 'var(--ka)', 'var(--kbg)') + '</i><div><b>' + t + '</b><span>' + sub + '</span></div></div>'; };
    return '<h1 class="hd ic-h">' + W(s).join('<br>') + '</h1>' +
      '<div class="ic-list bd">' + row('calendar', DATE, 'Friday') + row('clock', '19:00', 'Doors 18:30') + row('pin', 'Olympic Park', '88 Lawn, Seoul') + row('music', 'Moonlight Quartet', 'Hana Kim Trio · The Blue Hour') + row('ticket', '₩55,000', 'seouljazznight.kr') + '</div>';
  };
  PL.bookcover = function (s) {
    return svgWrap('0 0 400 500', '<circle cx="290" cy="150" r="110" style="fill:var(--kc)"/>', 'layer') +
      vis(s, 'sax', 230, 'left:70px;top:110px;transform:rotate(-10deg)') +
      '<div class="bk-k bd">A Novel</div><h1 class="hd bk-h">' + W(s).join('<br>') + '</h1><div class="bk-a bd">HANA KIM</div>';
  };
  POSTER_CSS +=
    '.ic-h{position:absolute;left:30px;top:40px;font-size:calc(52px * var(--hsc));line-height:calc(var(--hlh) * .9)}' +
    '.ic-list{position:absolute;left:30px;right:30px;top:226px;display:flex;flex-direction:column;gap:12px}' +
    '.ic-r{display:flex;gap:14px;align-items:center;border-top:1px solid var(--kc);padding-top:11px}.ic-r i{width:40px;height:40px;border-radius:12px;background:var(--kc);display:flex;align-items:center;justify-content:center;flex:none}' +
    '.ic-r b{display:block;font-size:13.5px}.ic-r span{font-size:10.5px;color:var(--kmut)}' +
    '.bk-k{position:absolute;left:30px;top:34px;font-size:12px;letter-spacing:.3em;text-transform:uppercase}' +
    '.bk-h{position:absolute;left:28px;top:330px;font-size:calc(48px * var(--hsc));line-height:calc(var(--hlh) * .9)}' +
    '.bk-a{position:absolute;left:30px;bottom:24px;font-size:13px;letter-spacing:.34em;font-weight:700}' +
    '.bkw{position:absolute;left:60px;top:44px;width:280px;height:410px;transform:perspective(1200px) rotateY(-14deg);transform-origin:0 50%;filter:drop-shadow(18px 22px 22px rgba(0,0,0,.45))}' +
    '.bk-cv{position:absolute;inset:0;overflow:hidden;border-radius:2px 6px 6px 2px}' +
    '.bk-sp{position:absolute;left:0;top:0;bottom:0;width:16px;background:linear-gradient(90deg,rgba(0,0,0,.35),rgba(255,255,255,.18) 40%,rgba(0,0,0,.15));z-index:2}' +
    '.bk-pg{position:absolute;right:-9px;top:6px;bottom:6px;width:10px;background:repeating-linear-gradient(90deg,#f4f1ea 0 1px,#d9d4c9 1px 2px);border-radius:0 3px 3px 0}' +
    '.so{position:absolute;overflow:hidden;background:var(--kbg);color:var(--kfg);border-radius:8px;box-shadow:0 14px 26px -12px rgba(0,0,0,.4);display:flex;flex-direction:column;justify-content:flex-end}' +
    '.so-l{position:absolute;font:600 10px ' + F.spacemono + ';color:#555;text-align:center}';
  function socialCard(s, x, y, w, h) {
    return '<div class="so" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;padding:' + f1(w * 0.08) + 'px">' +
      svgWrap('0 0 100 100', '<circle cx="78" cy="22" r="34" style="fill:var(--kc)"/>', 'layer', '', 'xMaxYMin meet') +
      '<div style="position:absolute;right:-' + f1(w * 0.08) + 'px;top:' + f1(h * 0.08) + 'px;width:' + f1(w * 0.72) + 'px;height:' + f1(w * 0.72) + 'px;transform:rotate(-14deg)">' + subjectSVG('sax', s.illus || 'flat', s) + '</div>' +
      '<div class="hd" style="position:relative;font-size:' + f1(w * 0.15) + 'px;line-height:calc(var(--hlh) * .9)">' + W(s).join('<br>') + '</div>' +
      '<div class="bd" style="position:relative;font-size:' + f1(w * 0.075) + 'px;font-weight:700;color:var(--ka);margin-top:' + f1(w * 0.03) + 'px">' + DATE + '</div></div>';
  }
  function buildPosterFramed(s) {
    var b;
    if (s.frame === 'book') {
      var cover = Object.assign({}, s, { layout: 'bookcover' });
      var inner = buildPoster(cover);
      b = { w: 400, h: 500, css: inner.css, html: '<div class="d" style="' + vars(s) + 'background:linear-gradient(160deg,#e9e4da,#cfc7b8);width:400px;height:500px"><div class="bkw"><div class="bk-pg"></div><div class="bk-cv"><div style="width:400px;height:500px;transform:scale(.7,.82);transform-origin:0 0">' + inner.html + '</div></div><div class="bk-sp"></div></div></div>' };
      return b;
    }
    if (s.frame === 'social') {
      var row = 'left:0;right:0';
      b = { w: 400, h: 500, css: POSTER_CSS, html: '<div class="d" style="' + vars(s) + 'background:#ece9e2;width:400px;height:500px">' +
        socialCard(s, 10, 120, 112, 199) + socialCard(s, 132, 191, 128, 128) + socialCard(s, 270, 169, 120, 150) +
        '<div class="so-l" style="left:10px;top:330px;width:112px">9:16 Story</div><div class="so-l" style="left:132px;top:330px;width:128px">1:1 Feed</div><div class="so-l" style="left:270px;top:330px;width:120px">4:5 Portrait</div>' +
        '<div class="so-l" style="' + row + ';top:64px;font-size:11px;color:#333">Seoul Jazz Night · social kit</div></div>' };
      return b;
    }
    return buildPoster(s);
  }

  /* =============================================================== RECIPES */
  var CAFE = { bg: '#f6efe4', fg: '#3b2417', mut: '#8a6f5c', a: '#e07a2f', b: '#7a4a2a', c: '#f2c14e' };
  var FOREST = { bg: '#2f5d50', fg: '#f2e8cf', mut: '#cfd9c8', a: '#c9a227', b: '#8fb996', c: '#f2e8cf', st: '#e9e4d8' };
  var NOTELY = { bg: '#fbfaf7', fg: '#16161d', mut: '#5d5d6b', a: '#3b5bfd', b: '#ffd23f', c: '#eef0ff', surf: '#ffffff', line: 'rgba(22,22,29,.1)', on: '#ffffff' };
  var JAZZ = { bg: '#f1ebe0', fg: '#141d2b', mut: '#5b6270', a: '#d9482b', b: '#2f6f8f', c: '#f2b84b' };
  var DARKL = 'rgba(255,255,255,.14)';

  function setPal(s, p) { s.pal = Object.assign({}, s.pal, p); s.palSet = true; }
  function softPal(s, p) { if (!s.palSet) setPal(s, p); }
  function font(s, hf, hw, o) {
    o = o || {};
    s.hf = hf; s.hw = hw == null ? s.hw : hw;
    s.hst = o.st || 'normal'; s.htt = o.tt || 'none'; s.hls = o.ls || '0em'; s.hlh = o.lh || 1.05; s.hsc = o.sc || 1;
    if (o.bf) s.bf = o.bf;
    s.fontSet = true;
  }
  function soft(s, key, val) { if (s[key] == null) s[key] = val; }
  function softAll(s) {
    // give every primary a sensible designed base when a style term arrives
    soft(s, 'pkg', 'designed');
    soft(s, 'theme', 'designed');
  }
  var MV = {
    'swiss-style': { pal: { bg: '#f2efe8', fg: '#111111', mut: '#555555', a: '#e2231a', b: '#111111', c: '#d9d4c7' }, f: [F.archivo, 800, { ls: '-0.02em', lh: 1, bf: F.archivo }], layout: 'swiss', deco: 'swiss', logo: 'wordmark' },
    'bauhaus': { pal: { bg: '#efe9dc', fg: '#141414', mut: '#444444', a: '#d7262e', b: '#1d4fa0', c: '#f2b705' }, f: [F.josefin, 700, { tt: 'lowercase', lh: 1, bf: F.josefin }], layout: 'bauhaus', deco: 'bauhaus', logo: 'geometric' },
    'brutalism-web': { pal: { bg: '#ffffff', fg: '#000000', mut: '#000000', a: '#0000ee', b: '#000000', c: '#ffff00' }, f: [F.times, 700, { tt: 'uppercase', ls: '-0.02em', lh: 0.9, bf: F.courier }], layout: 'brutal', surface: 'brutal', logo: 'plain' },
    'neo-brutalism': { pal: { bg: '#fff4d6', fg: '#000000', mut: '#222222', a: '#ff6b6b', b: '#4d96ff', c: '#ffd93d', surf: '#ffffff', line: '#000000' }, f: [F.archivoBlack, 400, { lh: 0.95, bf: F.archivo }], layout: 'neobrutal', surface: 'neobrutal', logo: 'combination', rad: 12 },
    'memphis': { pal: { bg: '#fff0f3', fg: '#111111', mut: '#333333', a: '#ff6fae', b: '#2ec4b6', c: '#ffd23f' }, f: [F.righteous, 400, { lh: 0.95, bf: F.work }], layout: 'memphis', deco: 'memphis', logo: 'combination' },
    'y2k': { pal: { bg: '#e6f0ff', fg: '#1d2a6b', mut: '#4b5a7a', a: '#ff4fd8', b: '#7aa8ff', c: '#c9f1ff' }, bg: 'linear-gradient(160deg,#f3e9ff,#d7ecff 45%,#ffe3f5)', f: [F.unbounded, 900, { lh: 1, bf: F.manrope }], layout: 'y2k', deco: 'y2k', logo: 'lettermark' },
    'glassmorphism': { pal: { bg: '#1b1640', fg: '#ffffff', mut: '#e3defa', a: '#ff6ac1', b: '#4f7cff', c: '#22d3ee', line: 'rgba(255,255,255,.18)', surf: 'rgba(255,255,255,.08)' }, f: [F.manrope, 800, { lh: 1, bf: F.manrope }], layout: 'glass', deco: 'blobs', surface: 'glass', logo: 'combination' },
    'neumorphism': { pal: { bg: '#e4e8ee', fg: '#4a5568', mut: '#7b8794', a: '#6c8cff', b: '#a3b1c6', c: '#e4e8ee', surf: '#e4e8ee', line: 'rgba(163,177,198,.45)', st: '#e4e8ee' }, f: [F.manrope, 800, { bf: F.manrope }], layout: 'neu', surface: 'neu', logo: 'pictorial' },
    'claymorphism': { pal: { bg: '#f3e8ff', fg: '#3b2a5a', mut: '#6b5a8a', a: '#ff7ab6', b: '#8b7bff', c: '#7ee0c3', surf: '#ffffff', st: '#f3e8ff' }, f: [F.fredoka, 700, { bf: F.fredoka }], layout: 'clay', deco: 'claybits', surface: 'clay', illus: 'clay', logo: 'pictorial', rad: 22 },
    'flat-design': { pal: { bg: '#ffcf56', fg: '#1d1d1d', mut: '#3d3d3d', a: '#ef476f', b: '#118ab2', c: '#ffffff' }, f: [F.work, 800, { bf: F.work }], layout: 'flat', deco: 'flat', surface: 'flat', illus: 'flat', logo: 'pictorial' },
    'skeuomorphism': { pal: { bg: '#f3efe6', fg: '#3a230f', mut: '#7a5a3a', a: '#d9a441', b: '#8a5a2b', c: '#ecdcb4', surf: '#f8f4ec', st: '#7a4a2a' }, f: [F.playfair, 700, { bf: F.sys }], layout: 'skeuo', surface: 'skeuo', illus: 'vector', logo: 'emblem' },
    'art-deco': { pal: { bg: '#0e0e10', fg: '#f3e9d2', mut: '#c9b88a', a: '#d4af37', b: '#8a6d1d', c: '#1d1d22', line: DARKL, on: '#111111', st: '#1a1a1e', surf: '#16161a' }, f: [F.limelight, 400, { tt: 'uppercase', ls: '0.08em', bf: F.poiret }], layout: 'deco', deco: 'deco', logo: 'emblem' },
    'art-nouveau': { pal: { bg: '#efe6cf', fg: '#3d3b22', mut: '#6b6440', a: '#a7792b', b: '#6f7d3c', c: '#e0c98f' }, f: [F.cormorant, 600, { st: 'italic', bf: F.cormorant }], layout: 'nouveau', deco: 'nouveau', logo: 'monogram' },
    'minimalism': { pal: { bg: '#f5f4f0', fg: '#1a1a1a', mut: '#8a8a8a', a: '#c8553d', b: '#cccccc', c: '#ebe9e3' }, f: [F.work, 500, { ls: '0.02em', bf: F.work }], layout: 'minimal', logo: 'wordmark' },
    'maximalism': { pal: { bg: '#ffe14d', fg: '#1a1033', mut: '#1a1033', a: '#ff3d7f', b: '#00b3a4', c: '#7b2ff7' }, f: [F.abril, 400, { bf: F.work }], layout: 'maximal', deco: 'maximal', logo: 'badge' },
    'constructivism': { pal: { bg: '#efe6d2', fg: '#141414', mut: '#333333', a: '#d62828', b: '#141414', c: '#efe6d2' }, f: [F.bebas, 400, { tt: 'uppercase', ls: '0.02em', bf: F.archivo }], layout: 'constructivist', deco: 'constructivist', logo: 'lettermark' },
    'de-stijl': { pal: { bg: '#f7f5ef', fg: '#111111', mut: '#333333', a: '#d62828', b: '#1d4fa0', c: '#f2c500' }, f: [F.archivoBlack, 400, { tt: 'uppercase', lh: 0.95, bf: F.archivo }], layout: 'destijl', deco: 'destijl', logo: 'geometric' },
    'mid-century-modern': { pal: { bg: '#f3e9d2', fg: '#3b2f2a', mut: '#6b5a4a', a: '#e0a526', b: '#2a7f7a', c: '#d9572b' }, f: [F.josefin, 700, { tt: 'uppercase', ls: '0.04em', bf: F.josefin }], layout: 'midcentury', deco: 'midcentury', logo: 'combination' },
    'psychedelic': { pal: { bg: '#2b0f3a', fg: '#2b0f3a', mut: '#2b0f3a', a: '#ff6b1a', b: '#d6249f', c: '#ffe066', line: DARKL }, f: [F.shrikhand, 400, { bf: F.work }], layout: 'psychedelic', deco: 'psychedelic', logo: 'badge' },
    'vaporwave': { pal: { bg: '#1a0636', fg: '#ffffff', mut: '#d9c2ff', a: '#ff71ce', b: '#01cdfe', c: '#b967ff', line: DARKL, surf: '#24104a' }, f: [F.righteous, 400, { ls: '0.06em', bf: F.spacemono }], layout: 'vapor', deco: 'vapor', logo: 'lettermark' },
    'retro-futurism': { pal: { bg: '#0b1430', fg: '#eaf2ff', mut: '#9fb4d9', a: '#ff7b39', b: '#3cc6c0', c: '#ffd166', line: DARKL, surf: '#12204a' }, f: [F.unbounded, 900, { tt: 'uppercase', bf: F.manrope }], layout: 'retrofuture', deco: 'retrofuture', logo: 'emblem' }
  };
  function movement(o) {
    return function (s) {
      setPal(s, o.pal);
      if (o.bg) s.bg = o.bg;
      font.apply(null, [s].concat(o.f));
      s.layout = o.layout; s.deco = o.deco || null; s.surface = o.surface || null;
      if (o.illus) s.illus = o.illus;
      if (o.rad != null) s.rad = o.rad;
      s.logo = s.logo || o.logo;
      softAll(s);
    };
  }
  function typo(hf, hw, o, extra) {
    return function (s) { font(s, hf, hw, o); if (extra) extra(s); soft(s, 'logo', 'wordmark'); };
  }
  function colorTerm(p, extra) {
    return function (s) { setPal(s, p); soft(s, 'layout', 'designed'); soft(s, 'logo', 'combination'); softAll(s); if (extra) extra(s); };
  }
  function illus(st, p, extra) {
    return function (s) { s.illus = st; if (p) softPal(s, p); soft(s, 'logo', 'pictorial'); soft(s, 'pkg', 'designed'); if (extra) extra(s); };
  }
  function ui(key, focus, extra) {
    return function (s) { s.comps[key] = true; s.focus = focus || s.focus; softPal(s, NOTELY); if (extra) extra(s); };
  }
  function app(k) { return function (s) { s.app = k; softPal(s, NOTELY); soft(s, 'theme', 'designed'); }; }
  function logoKind(k, p, f, extra) {
    return function (s) { s.logo = k; softPal(s, p || CAFE); if (f && !s.fontSet) font.apply(null, [s].concat(f)); if (extra) extra(s); };
  }
  function frame(fr, extra) { return function (s) { s.frame = fr; if (extra) extra(s); }; }

  var R = {};
  function def(id, p, f) { R[id] = { p: p, f: f }; }
  Object.keys(MV).forEach(function (id) { def(id, 'poster', movement(MV[id])); });

  // typography
  def('serif', 'poster', typo(F.dmserif, 400, { sc: 1.08 }));
  def('sans-serif', 'poster', typo(F.work, 600, { ls: '-0.01em' }));
  def('geometric-sans', 'poster', typo(F.josefin, 700, { ls: '0.01em', sc: 1.05 }));
  def('neo-grotesk', 'poster', typo(F.archivo, 800, { ls: '-0.035em', sc: 1.08 }));
  def('humanist-sans', 'poster', typo(F.fira, 600, { sc: 1.02 }));
  def('slab-serif', 'poster', typo(F.alfa, 400, { sc: 1.0 }));
  def('didone', 'poster', typo(F.bodoni, 700, { sc: 1.1, lh: 1 }));
  def('monospace', 'poster', typo(F.spacemono, 700, { ls: '-0.03em', sc: 0.98, bf: F.spacemono }));
  def('display-typeface', 'poster', typo(F.monoton, 400, { sc: 0.88, lh: 1.15 }));
  def('script-font', 'poster', typo(F.pacifico, 400, { sc: 1.1, lh: 1.35 }));
  def('blackletter', 'poster', typo(F.fraktur, 400, { sc: 1.2 }));
  def('condensed-type', 'poster', typo(F.bebas, 400, { tt: 'uppercase', ls: '0.01em', sc: 1.6, lh: 0.92 }));
  def('kerning', 'poster', typo(F.archivo, 900, { ls: '-0.065em', sc: 1.22, lh: 0.95 }));
  def('tracking', 'poster', typo(F.work, 500, { tt: 'uppercase', ls: '0.5em' }, function (s) { s.layout = 'spaced'; }));
  def('leading', 'poster', typo(F.archivo, 800, { lh: 0.84, ls: '-0.02em' }, function (s) { s.layout = 'stack'; }));
  def('typographic-hierarchy', 'poster', typo(F.archivo, 800, { ls: '-0.02em' }, function (s) { s.layout = 'hierarchy'; }));
  def('font-pairing', 'poster', typo(F.playfair, 700, { bf: F.work }, function (s) { s.layout = 'hierarchy'; }));
  def('oversized-type', 'poster', typo(F.bigshoulders, 900, { tt: 'uppercase' }, function (s) { s.layout = 'oversized'; }));
  def('all-caps', 'poster', function (s) { s.htt = 'uppercase'; s.hls = '0.06em'; soft(s, 'logo', 'wordmark'); });
  def('outline-text', 'poster', typo(F.archivoBlack, 400, { tt: 'uppercase' }, function (s) { s.layout = 'outline'; }));

  // layout & grid
  function lay(k, p) { return function (s) { s.layout = k; if (p) softPal(s, p); }; }
  def('bento-grid', 'landing', function (s) {
    s.layout = 'bento'; softPal(s, NOTELY); s.comps.feat = true; s.focus = 'feat';
    s.css.push('.feat.dz .fg{grid-template-columns:repeat(4,1fr);grid-auto-rows:190px;gap:16px}', '.feat.dz .fc:nth-child(1){grid-column:span 2;grid-row:span 2;background:var(--ka);color:#fff}', '.feat.dz .fc:nth-child(1) p{color:rgba(255,255,255,.8);font-size:19px}', '.feat.dz .fc:nth-child(1) h3{font-size:32px}', '.feat.dz .fc:nth-child(4){grid-column:span 2;background:var(--kb)}', '.feat.dz .fc:nth-child(6){grid-column:span 2}', '.feat.dz .fc{border-radius:24px}');
  });
  def('modular-grid', 'poster', lay('modular', JAZZ));
  def('twelve-column-grid', 'landing', function (s) {
    softPal(s, NOTELY); soft(s, 'theme', 'designed');
    var cols = '';
    s.css.push('&::after{content:"";position:absolute;left:100px;right:100px;top:0;bottom:0;background:repeating-linear-gradient(90deg,rgba(255,64,96,.09) 0 70px,transparent 70px 90px);pointer-events:none;z-index:9}');
    s.css.push('.L .in{max-width:1100px}');
    return cols;
  });
  def('baseline-grid', 'poster', lay('baseline'));
  def('asymmetric-layout', 'poster', lay('asym', JAZZ));
  def('centered-symmetric', 'poster', lay('symmetric', JAZZ));
  def('generous-whitespace', 'poster', lay('whitespace'));
  def('z-pattern', 'landing', function (s) {
    softPal(s, NOTELY); soft(s, 'theme', 'designed');
    s.css.push('&::after{content:"";position:absolute;left:0;top:0;width:1280px;height:1600px;pointer-events:none;z-index:9;background:no-repeat url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 1600"><path d="M120 40 H1160 L120 760 H1160" fill="none" stroke="#ff3d6e" stroke-width="6" stroke-dasharray="18 14" opacity=".75"/><circle cx="120" cy="40" r="14" fill="#ff3d6e"/><path d="M1140 744 l26 16 -26 16z" fill="#ff3d6e"/></svg>') + '")}');
  });
  def('f-pattern', 'landing', function (s) {
    softPal(s, NOTELY); soft(s, 'theme', 'designed'); s.comps.feat = true; s.focus = 'feat';
    s.css.push('.feat.dz .fg{grid-template-columns:1fr;gap:0}', '.feat.dz .fc{display:grid;grid-template-columns:60px 260px 1fr;align-items:center;border-radius:0;border-width:0 0 1px 0;padding:22px 0;background:transparent}', '.feat.dz .fi{margin:0}', '.feat.dz h2,.feat.dz .sub{text-align:left}', '.feat.dz .fc p{font-size:15px}');
    s.css.push('.feat.dz .in::after{content:"";position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;background:linear-gradient(90deg,rgba(255,61,110,.18) 0 70%,transparent 70%) 0 0/100% 70px no-repeat,linear-gradient(90deg,rgba(255,61,110,.14) 0 45%,transparent 45%) 0 160px/100% 60px no-repeat,linear-gradient(rgba(255,61,110,.12),rgba(255,61,110,.12)) 0 0/90px 100% no-repeat}');
  });
  def('split-screen', 'poster', lay('split', JAZZ));
  def('full-bleed', 'poster', lay('fullbleed'));
  def('masonry', 'poster', lay('masonry', JAZZ));
  def('golden-ratio', 'poster', lay('golden', JAZZ));
  def('editorial-layout', 'poster', function (s) { s.layout = 'editorial'; if (!s.fontSet) font(s, F.playfair, 700, { bf: F.work }); });
  def('visual-hierarchy', 'poster', lay('vhier', JAZZ));
  def('layered-collage', 'poster', lay('collage', JAZZ));

  // logo types
  def('wordmark', 'logo', logoKind('wordmark', CAFE, [F.fraunces, 600, { ls: '-0.035em' }]));
  def('lettermark', 'logo', logoKind('lettermark', CAFE, [F.fraunces, 900, {}]));
  def('monogram', 'logo', logoKind('monogram', CAFE, [F.bodoni, 700, {}]));
  def('pictorial-mark', 'logo', logoKind('pictorial', CAFE, [F.fraunces, 600, { ls: '-0.02em' }]));
  def('abstract-mark', 'logo', logoKind('abstract', CAFE, [F.manrope, 800, { ls: '-0.02em' }]));
  def('combination-mark', 'logo', logoKind('combination', CAFE, [F.fraunces, 700, { ls: '-0.02em' }]));
  def('emblem', 'logo', logoKind('emblem', CAFE, [F.archivo, 800, {}]));
  def('mascot-logo', 'logo', logoKind('mascot', { bg: '#fff4e6', fg: '#3b2417', mut: '#8a6f5c', a: '#9a5b34', b: '#e07a2f', c: '#f2c14e' }, [F.fredoka, 700, {}]));
  def('monoline', 'logo', logoKind('monoline', CAFE, [F.poiret, 400, {}]));
  def('negative-space-logo', 'logo', logoKind('negative', CAFE, [F.manrope, 800, { ls: '-0.02em' }]));
  def('vintage-badge', 'logo', logoKind('badge', { bg: '#efe4cf', fg: '#3a2618', mut: '#6a5038', a: '#b5562b', b: '#7a4a2a', c: '#d9b77a' }, [F.alfa, 400, {}], function (s) { if (s.fx.indexOf('paper') < 0) s.fx.push('paper'); }));
  def('geometric-logo', 'logo', logoKind('geometric', CAFE, [F.josefin, 600, { tt: 'uppercase' }]));
  def('app-icon', 'logo', logoKind('appicon', CAFE, [F.manrope, 700, {}], function (s) { if (!s.bg) s.bg = 'linear-gradient(160deg,#ffe2c2,#f6b8c6 55%,#b9c6ff)'; }));
  def('strong-silhouette', 'logo', logoKind('silhouette', CAFE));

  // color
  def('monochrome', 'poster', colorTerm({ bg: '#f2f2f2', fg: '#111111', mut: '#555555', a: '#111111', b: '#6a6a6a', c: '#c4c4c4', st: '#dddddd' }, function (s) { s.css.push('img{filter:grayscale(1)}'); }));
  def('monochromatic', 'poster', colorTerm({ bg: '#0e2a47', fg: '#e6f0fb', mut: '#9fbbe0', a: '#3d7cc9', b: '#8fb8e8', c: '#1d4a7a', line: DARKL, st: '#0a1f36', surf: '#143858' }));
  def('complementary', 'poster', colorTerm({ bg: '#13294b', fg: '#fdf3e3', mut: '#c9d3e6', a: '#f28c28', b: '#f6b26b', c: '#2b4f86', line: DARKL, st: '#0e1f3a', surf: '#1b3561' }));
  def('analogous', 'poster', colorTerm({ bg: '#fbe3d0', fg: '#5a1a12', mut: '#8a4a3a', a: '#e2442f', b: '#f08a24', c: '#f7c548' }));
  def('triadic', 'poster', colorTerm({ bg: '#fbf7ef', fg: '#1e1e2a', mut: '#55556a', a: '#00a6a6', b: '#d1349b', c: '#f5a623' }));
  def('duotone', 'poster', colorTerm({ bg: '#ffd6c9', fg: '#1f2a6b', mut: '#1f2a6b', a: '#1f2a6b', b: '#ff7a8a', c: '#ff7a8a' }, function (s) { s.photo = 'duo'; }));
  def('pastel-palette', 'package', colorTerm({ bg: '#fdf6f0', fg: '#5b5470', mut: '#8a83a0', a: '#f4a7b9', b: '#9fd8c3', c: '#c9d3f5', st: '#efe7f2' }));
  def('earth-tones', 'package', colorTerm({ bg: '#efe6d8', fg: '#3e2c1c', mut: '#6e5a45', a: '#a0522d', b: '#6b7a4b', c: '#d4a373', st: '#ded2bf' }));
  def('neon-palette', 'poster', colorTerm({ bg: '#0b0b14', fg: '#f5f5ff', mut: '#b9b9d9', a: '#ff2bd6', b: '#00f0ff', c: '#c6ff00', line: DARKL, st: '#06060c', surf: '#14141f', on: '#0b0b14' }));
  def('jewel-tones', 'poster', colorTerm({ bg: '#0d2b2a', fg: '#f3e9d2', mut: '#c9bfa6', a: '#9b111e', b: '#0f52ba', c: '#d4a537', line: DARKL, st: '#081d1c', surf: '#123a38' }));
  def('muted-palette', 'package', colorTerm({ bg: '#e9e5df', fg: '#4a4a48', mut: '#7a7a76', a: '#9aa59a', b: '#c2a99b', c: '#8c9aa8', st: '#d9d4cc' }));
  def('limited-palette', 'poster', colorTerm({ bg: '#f4efe6', fg: '#1c1c1c', mut: '#1c1c1c', a: '#e8452c', b: '#1c1c1c', c: '#e8452c' }));
  def('hex-color-codes', 'package', function (s) { setPal(s, { bg: '#2F5D50', fg: '#F2E8CF', mut: '#CFD9C8', a: '#C9A227', b: '#8FB996', c: '#F2E8CF', st: '#E9E4D8' }); s.frame = s.frame || 'hex'; softAll(s); soft(s, 'layout', 'designed'); soft(s, 'logo', 'combination'); });
  def('sixty-thirty-ten', 'landing', function (s) {
    setPal(s, { bg: '#f7f5f0', fg: '#1f2a37', mut: '#5b6472', a: '#ff6b35', b: '#1f3a5f', c: '#e6ebf2', surf: '#ffffff', line: 'rgba(31,42,55,.12)' });
    soft(s, 'theme', 'designed'); soft(s, 'layout', 'designed'); soft(s, 'pkg', 'designed');
    s.css.push('.nav.dz,.hero.dz,.foot.dz{background:var(--kb)}', '.nav.dz .logo,.hero.dz h1,.foot.dz b{color:#ffffff}', '.hero.dz p,.nav.dz .links a,.nav.dz .login,.hnote,.foot.dz p,.foot.dz .fcols a{color:#c3cfdf}', '.hero.dz .btn.sec{color:#fff;border-color:rgba(255,255,255,.3)}', '.nav.dz{border-color:rgba(255,255,255,.1)}');
  });
  def('accent-color', 'landing', function (s) {
    setPal(s, { bg: '#ffffff', fg: '#111111', mut: '#6b6b6b', a: '#ff5a1f', b: '#e5e5e5', c: '#f4f4f4', surf: '#ffffff', line: '#e8e8e8' });
    soft(s, 'theme', 'designed'); soft(s, 'layout', 'designed'); soft(s, 'pkg', 'designed');
    s.css.push('.fi{color:#111!important}', '.as .on,.ali.on{background:#f4f4f4!important;color:#111!important}');
  });
  def('color-contrast-wcag', 'landing', frame('contrast'));

  // illustration
  var NIGHT = { bg: '#16213e', fg: '#e8e8f0', mut: '#a9b0c9', a: '#f4a261', b: '#e76f51', c: '#f6e7b4', line: DARKL, st: '#0f172e', surf: '#1d2a4d' };
  def('flat-illustration', 'poster', illus('flat', NIGHT));
  def('vector-illustration', 'poster', illus('vector', { bg: '#1d3557', fg: '#f1faee', mut: '#a8c4d8', a: '#e63946', b: '#a8dadc', c: '#f1faee', line: DARKL, st: '#14263f' }));
  def('isometric-illustration', 'poster', illus('iso', { bg: '#eef1f8', fg: '#2b2d42', mut: '#5c5f7a', a: '#5e60ce', b: '#48bfe3', c: '#c9cfe2' }));
  def('line-art', 'poster', illus('line', { bg: '#f7f3ea', fg: '#1f1f1f', mut: '#6b6b6b', a: '#1f1f1f', b: '#1f1f1f', c: '#e9e2d2' }));
  def('outline-icons', 'poster', function (s) { s.iconMode = 'outline'; s.layout = 'icons'; softPal(s, JAZZ); s.comps.feat = true; s.focus = s.focus || 'feat'; s.frame = s.frame || (s.primary === 'logo' ? 'iconset' : null); });
  def('filled-icons', 'poster', function (s) { s.iconMode = 'filled'; s.layout = 'icons'; softPal(s, JAZZ); s.comps.feat = true; s.focus = s.focus || 'feat'; s.frame = s.frame || (s.primary === 'logo' ? 'iconset' : null); });
  def('hand-drawn-doodle', 'poster', illus('doodle', { bg: '#fffdf5', fg: '#2b2b2b', mut: '#5b5b5b', a: '#ffb703', b: '#8ecae6', c: '#ffd6e0' }, function (s) { if (!s.fontSet) font(s, F.caveat, 700, { sc: 1.3, lh: 1 }); }));
  def('corporate-memphis', 'landing', illus('corporate', { bg: '#f7f4ff', fg: '#1e1b4b', mut: '#56528a', a: '#6d5dfc', b: '#ff8a65', c: '#ffd166', surf: '#ffffff', line: 'rgba(30,27,75,.1)' }, function (s) { soft(s, 'theme', 'designed'); }));
  def('3d-clay-render', 'poster', illus('clay', { bg: '#fde2e4', fg: '#3d2c4a', mut: '#6d5a7a', a: '#7b9cff', b: '#ff9eb5', c: '#ffd6a5', surf: '#ffffff' }));
  def('paper-cut', 'package', illus('paper', { bg: '#f4efe3', fg: '#1f3b2d', mut: '#4a6a55', a: '#4f8a5b', b: '#8cbf7a', c: '#d9e8c4', st: '#e6e0d0' }));
  def('low-poly', 'poster', illus('lowpoly', { bg: '#1b2a41', fg: '#f0f4f8', mut: '#a9b8cc', a: '#324a5f', b: '#5c7a99', c: '#f6d38b', line: DARKL }));
  def('pixel-art', 'poster', illus('pixel', { bg: '#1a1c2c', fg: '#f4f4f4', mut: '#94b0c2', a: '#ef7d57', b: '#ffcd75', c: '#a7f070', line: DARKL }, function (s) { if (!s.fontSet) font(s, F.pixel, 400, { sc: 0.52, lh: 1.5, bf: F.vt }); }));
  def('spot-illustration', 'poster', illus('spot', { bg: '#fbf8f3', fg: '#1f1f1f', mut: '#6b6b6b', a: '#e85d3f', b: '#2a6f97', c: '#ffe3d3' }));
  def('die-cut-sticker', 'logo', function (s) { s.frame = 'sticker'; softPal(s, CAFE); soft(s, 'logo', 'combination'); if (!s.fontSet) font(s, F.fraunces, 700, { ls: '-0.02em' }); s.illus = s.illus || 'flat'; });

  // print formats
  def('poster-design', 'poster', function (s) { s.layout = 'designed'; softPal(s, JAZZ); if (!s.fontSet) font(s, F.archivoBlack, 400, { ls: '-0.01em', bf: F.archivo }); softAll(s); });
  def('packaging-design', 'package', function (s) { s.pkg = 'designed'; softPal(s, FOREST); if (!s.fontSet) font(s, F.fraunces, 600, { bf: F.work }); });
  function pkgFrame(fr) { return function (s) { s.frame = fr; soft(s, 'pkg', 'designed'); softPal(s, FOREST); if (!s.fontSet) font(s, F.fraunces, 600, { bf: F.work }); }; }
  def('dieline', 'package', pkgFrame('dieline'));
  def('label-design', 'package', pkgFrame('label'));
  def('mockup', 'package', pkgFrame('box3d'));
  def('infographic', 'package', function (s) { s.frame = 'infographic'; softPal(s, { bg: '#f4efe3', fg: '#1f3b2d', mut: '#4a6a55', a: '#4f8a5b', b: '#8cbf7a', c: '#d9e8c4', st: '#e6e0d0' }); if (!s.fontSet) font(s, F.fraunces, 600, { bf: F.work }); });
  def('device-mockup', 'landing', function (s) { s.frame = 'device'; softPal(s, NOTELY); soft(s, 'theme', 'designed'); });
  function logoFrame(fr, kind, f) { return function (s) { s.frame = fr; softPal(s, CAFE); soft(s, 'logo', kind); if (!s.fontSet) font.apply(null, [s].concat(f || [F.fraunces, 700, { ls: '-0.02em' }])); }; }
  def('brand-identity-board', 'logo', logoFrame('board', 'combination'));
  def('mood-board', 'logo', logoFrame('mood', 'wordmark'));
  def('business-card', 'logo', logoFrame('card', 'combination'));
  def('book-cover', 'poster', function (s) { s.frame = 'book'; softPal(s, JAZZ); if (!s.fontSet) font(s, F.playfair, 900, { bf: F.work }); });
  def('social-post-format', 'poster', function (s) { s.frame = 'social'; softPal(s, JAZZ); if (!s.fontSet) font(s, F.archivoBlack, 400, { bf: F.archivo }); });
  def('menu-design', 'logo', logoFrame('menu', 'wordmark', [F.fraunces, 600, { ls: '-0.03em', bf: F.work }]));

  // textures
  function fx(k) { return function (s) { if (s.fx.indexOf(k) < 0) s.fx.push(k); }; }
  def('grain-noise', 'poster', function (s) { fx('grain')(s); soft(s, 'layout', 'designed'); softPal(s, JAZZ); soft(s, 'pkg', 'designed'); });
  def('halftone', 'poster', function (s) { fx('halftone')(s); soft(s, 'layout', 'designed'); softPal(s, JAZZ); soft(s, 'pkg', 'designed'); });
  def('risograph', 'poster', function (s) {
    fx('riso')(s); setPal(s, { bg: '#f4eee0', fg: '#0078bf', mut: '#0078bf', a: '#ff48b0', b: '#0078bf', c: '#ffe800', st: '#e8e0cc' });
    soft(s, 'layout', 'designed'); soft(s, 'pkg', 'designed');
    s.css.push('.hd{color:var(--ka);text-shadow:3px 2px 0 rgba(0,120,191,.85);mix-blend-mode:multiply}', '.visw,.vis,.scene,.mk-svg{mix-blend-mode:multiply}', '.visw svg{transform:translate(2px,1px)}');
  });
  def('gradient-mesh', 'poster', function (s) {
    s.bg = 'radial-gradient(at 18% 14%,#ff9a8b 0,transparent 48%),radial-gradient(at 84% 8%,#a18cd1 0,transparent 50%),radial-gradient(at 72% 82%,#fbc2eb 0,transparent 55%),radial-gradient(at 12% 88%,#84fab0 0,transparent 50%),#f6d365';
    softPal(s, { bg: '#f6d365', fg: '#1d1b3a', mut: '#3d3a5c', a: '#1d1b3a', b: '#5a4fcf', c: '#ffffff' });
    s.css.push('.pk-box{background:' + s.bg + '}', '.hero.dz,.nav.dz{background:transparent}');
  });
  def('glow', 'poster', function (s) {
    setPal(s, { bg: '#0b0a12', fg: '#ffffff', mut: '#b9b4d6', a: '#ff3ec8', b: '#3ef0ff', c: '#2a1f4a', line: DARKL, st: '#07060c', surf: '#15132a' });
    s.css.push('.hd{color:#fff4fd;text-shadow:0 0 4px #fff,0 0 12px var(--ka),0 0 26px var(--ka),0 0 52px var(--ka)}', '.visw svg,.mk-svg,.vis{filter:drop-shadow(0 0 5px var(--kb)) drop-shadow(0 0 14px var(--kb))}', '.btn.pri{box-shadow:0 0 18px var(--ka),0 0 40px var(--ka)}');
  });
  def('soft-shadow', 'landing', function (s) { s.surface = 'soft'; s.comps.card = true; softPal(s, NOTELY); s.focus = s.focus || 'feat'; });
  def('paper-texture', 'poster', function (s) { fx('paper')(s); soft(s, 'layout', 'designed'); softPal(s, { bg: '#efe6d2', fg: '#2a2620', mut: '#5a5246', a: '#c0392b', b: '#2c5d7c', c: '#e2c48a', st: '#e4dac4' }); soft(s, 'pkg', 'designed'); });
  def('letterpress', 'logo', function (s) {
    fx('letterpress')(s); setPal(s, { bg: '#f4f0e8', fg: '#23395b', mut: '#5a6a85', a: '#b23a48', b: '#23395b', c: '#e6dfd0', st: '#e9e3d6' });
    soft(s, 'logo', 'wordmark'); if (!s.fontSet) font(s, F.bodoni, 700, {});
    s.css.push('.mk,.hd,.c-wrap,.ds-h{filter:drop-shadow(0 1px 0 rgba(255,255,255,.95)) drop-shadow(0 -1px 0 rgba(0,0,0,.35))}', '.hd{opacity:.9}');
  });
  def('foil-stamping', 'package', function (s) {
    fx('foil')(s); setPal(s, { bg: '#13241f', fg: '#e9d9a6', mut: '#bfae7c', a: '#c9a227', b: '#a37f1c', c: '#2a4a3f', st: '#d8d2c6', line: DARKL });
    soft(s, 'pkg', 'designed'); soft(s, 'layout', 'designed'); soft(s, 'logo', 'emblem'); if (!s.fontSet) font(s, F.cormorant, 600, { bf: F.work });
    var g = 'background:linear-gradient(115deg,#8a6a26,#f6e6a2 30%,#b8892c 48%,#fff6cc 62%,#9a7428 80%,#e8cf7a);-webkit-background-clip:text;background-clip:text;color:transparent';
    s.css.push('.hd{' + g + '}', '.pk-rule{background:linear-gradient(90deg,#8a6a26,#f6e6a2,#9a7428)}', '.pk-seal,.pk-top,.pk-sub,.pk-wt{color:#e2c86f}');
  });
  def('holographic', 'package', function (s) {
    fx('holo')(s); softPal(s, { bg: '#f1ecff', fg: '#2d2a4a', mut: '#5a5680', a: '#7c6cf0', b: '#5ec8e5', c: '#ffffff', st: '#e3e0ee' });
    soft(s, 'pkg', 'designed'); soft(s, 'layout', 'designed');
    var h = 'linear-gradient(120deg,#ffd1f0,#c9f0ff 25%,#e6ffd1 45%,#fff2c2 60%,#e1c9ff 80%,#c9fff6)';
    s.css.push('.pk-box{background:' + h + '}', '&.pst{background:' + h + '}', '.mk-svg{filter:drop-shadow(0 4px 10px rgba(124,108,240,.35))}');
  });

  // UI components
  def('hero-section', 'landing', ui('hero', 'hero'));
  def('navbar', 'landing', ui('nav', 'nav'));
  def('cta', 'landing', ui('cta', 'hero'));
  def('card', 'landing', ui('card', 'feat'));
  def('feature-grid', 'landing', ui('feat', 'feat'));
  def('pricing-table', 'landing', ui('price', 'price'));
  def('testimonials', 'landing', ui('testi', 'testi'));
  def('logo-cloud', 'landing', ui('logos', 'logos'));
  def('faq-accordion', 'landing', ui('faq', 'faq'));
  def('footer', 'landing', ui('foot', 'foot'));
  def('modal', 'landing', function (s) { s.modal = true; softPal(s, NOTELY); });
  def('toast', 'landing', function (s) { s.toast = true; softPal(s, NOTELY); });
  def('sidebar-navigation', 'landing', app('sidebar'));
  def('dashboard', 'landing', app('dashboard'));
  def('data-table', 'landing', app('table'));
  def('empty-state', 'landing', app('empty'));
  def('skeleton-loading', 'landing', function (s) { s.app = 'skeleton'; });
  def('dark-mode', 'landing', function (s) {
    setPal(s, { bg: '#0f1115', fg: '#e8eaf0', mut: '#9aa1b2', a: '#7c9cff', b: '#2a2f3a', c: '#1b2030', surf: '#161a22', line: 'rgba(255,255,255,.09)', on: '#0f1115', st: '#0a0c10' });
    soft(s, 'theme', 'designed'); soft(s, 'layout', 'designed'); soft(s, 'pkg', 'designed'); soft(s, 'logo', 'combination');
  });
  def('design-tokens', 'landing', function (s) { s.frame = 'tokens'; softPal(s, NOTELY); if (!s.rad) s.rad = 12; });
  def('border-radius', 'landing', ui('radius', null, function (s) { s.rad = 20; }));
  def('micro-interactions', 'landing', ui('micro', 'hero'));
  def('responsive-breakpoints', 'landing', function (s) { s.frame = 'responsive'; softPal(s, NOTELY); soft(s, 'theme', 'designed'); });
  def('sticky-header', 'landing', function (s) { s.sticky = true; softPal(s, NOTELY); });
  def('badge', 'landing', ui('badge', 'hero'));

  // web-gen
  def('product-brief', 'landing', function (s) { s.theme = 'brief'; softPal(s, NOTELY); s.copy = 'real'; if (!s.fontSet) font(s, F.manrope, 800, { ls: '-0.03em', bf: F.manrope }); });
  def('reference-sites', 'landing', function (s) {
    s.theme = 'reference';
    setPal(s, { bg: '#08090a', fg: '#f7f8f8', mut: '#8a8f98', a: '#5e6ad2', b: '#26272b', c: '#141518', surf: '#0f1012', line: 'rgba(255,255,255,.08)', on: '#ffffff' });
    if (!s.fontSet) font(s, F.dmsans, 700, { ls: '-0.035em', bf: F.dmsans });
  });
  def('shadcn-ui', 'landing', function (s) {
    s.theme = 'shadcn'; s.rad = 8;
    setPal(s, { bg: '#ffffff', fg: '#09090b', mut: '#71717a', a: '#18181b', b: '#f4f4f5', c: '#f4f4f5', surf: '#ffffff', line: '#e4e4e7', on: '#fafafa' });
    font(s, F.geist, 700, { ls: '-0.03em', bf: F.geist });
  });
  def('tailwind-css', 'landing', function (s) {
    s.theme = 'tailwind'; s.rad = 8;
    setPal(s, { bg: '#ffffff', fg: '#111827', mut: '#6b7280', a: '#4f46e5', b: '#e0e7ff', c: '#eef2ff', surf: '#ffffff', line: '#e5e7eb' });
    font(s, "ui-sans-serif,system-ui,sans-serif,'Apple Color Emoji','Segoe UI Emoji'", 800, { ls: '-0.025em', bf: "ui-sans-serif,system-ui,sans-serif" });
  });
  def('lucide-react', 'landing', function (s) {
    s.comps.feat = true; s.comps.nav = true; s.focus = 'feat'; s.iconMode = 'outline'; softPal(s, NOTELY);
    s.css.push('.fi{background:transparent!important;border:1.5px solid var(--kline);color:var(--kfg)!important}');
  });
  def('css-variables-theming', 'landing', frame('themes'));
  def('mobile-first', 'landing', function (s) { s.frame = 'phone'; softPal(s, NOTELY); soft(s, 'theme', 'designed'); });
  def('accessibility-a11y', 'landing', function (s) { s.a11y = true; softPal(s, { bg: '#ffffff', fg: '#111111', mut: '#3d3d3d', a: '#1d4ed8', b: '#ffd23f', c: '#eef2ff', surf: '#ffffff', line: 'rgba(0,0,0,.18)' }); soft(s, 'theme', 'designed'); });
  def('real-copy', 'landing', function (s) { s.copy = 'real'; });
  def('named-google-fonts', 'landing', function (s) { font(s, F.syne, 800, { ls: '-0.02em', bf: F.manrope }); softPal(s, NOTELY); soft(s, 'theme', 'designed'); soft(s, 'logo', 'wordmark'); });
  def('staggered-reveal', 'landing', function (s, ctx) { s.anim = !(ctx && ctx.reducedMotion); softPal(s, NOTELY); soft(s, 'theme', 'designed'); });
  def('avoid-generic-ai-aesthetic', 'landing', function (s) {
    s.theme = 'distinct'; s.rad = 0;
    setPal(s, { bg: '#f1ece3', fg: '#1a1a1a', mut: '#5a554c', a: '#d1462f', b: '#1a1a1a', c: '#e6dfd2', surf: '#f7f3ec', line: '#1a1a1a', on: '#ffffff' });
    font(s, F.fraunces, 400, { ls: '-0.03em', lh: 0.98, bf: F.work });
  });
  def('ui-states', 'landing', frame('states'));

  // text rendering
  def('quoted-text', 'poster', function (s) { s.layout = 'textfocus'; if (!s.fontSet) font(s, F.archivo, 900, { ls: '-0.02em' }); });
  def('font-description', 'logo', logoKind('script', CAFE, [F.pacifico, 400, { lh: 1.3 }]));
  def('text-placement', 'poster', function (s) { s.layout = 'placement'; softPal(s, JAZZ); if (!s.fontSet) font(s, F.archivo, 800, { ls: '-0.02em' }); });
  def('short-text', 'poster', function (s) { s.layout = 'short'; softPal(s, JAZZ); if (!s.fontSet) font(s, F.archivo, 900, { ls: '-0.03em' }); });
  def('korean-hangul-text', 'poster', function (s) { s.ko = true; font(s, F.blackhan, 400, { lh: 1, sc: 1.05, bf: F.notokr }); soft(s, 'layout', 'designed'); softPal(s, JAZZ); });

  // vector output
  def('svg-vector-output', 'logo', function (s) { s.frame = 'vector'; softPal(s, CAFE); });
  def('transparent-background', 'logo', function (s) { s.frame = 'checker'; softPal(s, CAFE); soft(s, 'logo', 'combination'); if (!s.fontSet) font(s, F.fraunces, 700, { ls: '-0.02em' }); });
  def('flat-fills-no-gradients', 'logo', function (s) { softPal(s, CAFE); soft(s, 'logo', 'emblem'); s.illus = 'flat'; s.bg = null; s.fx = s.fx.filter(function (k) { return k !== 'holo' && k !== 'foil'; }); if (!s.fontSet) font(s, F.archivo, 800, {}); });
  def('limited-color-count', 'logo', function (s) { setPal(s, { bg: '#f6efe4', fg: '#3b2417', mut: '#3b2417', a: '#e07a2f', b: '#3b2417', c: '#e07a2f' }); s.frame = s.frame || 'swatch3'; soft(s, 'logo', 'combination'); if (!s.fontSet) font(s, F.fraunces, 700, { ls: '-0.02em' }); });
  def('consistent-stroke-weight', 'logo', function (s) { s.frame = 'iconset'; s.iconMode = 'outline'; s.iconStroke = 2; softPal(s, CAFE); });
  def('isolated-on-white', 'logo', function (s) { s.pal = Object.assign({}, s.pal, { bg: '#ffffff', st: '#ffffff' }); s.palSet = true; if (s.pal.fg === BASE.logo.pal.fg) setPal(s, Object.assign({}, CAFE, { bg: '#ffffff' })); s.deco = null; s.surface = null; s.bg = null; soft(s, 'logo', 'combination'); if (!s.fontSet) font(s, F.fraunces, 700, { ls: '-0.02em' }); });
  def('icon-content-type', 'logo', function (s) { s.frame = 'iconset'; s.iconMode = 'filled'; softPal(s, CAFE); });
  def('favicon-legibility', 'logo', function (s) { s.frame = 'sizes'; softPal(s, CAFE); if (!s.fontSet) font(s, F.fraunces, 700, {}); });

  /* ================================================================ MOUNT */
  var CAT_PRIMARY = { 'design-movement': 'poster', typography: 'poster', 'layout-grid': 'poster', 'logo-type': 'logo', color: 'poster', illustration: 'poster', 'print-format': 'package', 'texture-effect': 'poster', 'ui-component': 'landing', 'web-gen': 'landing', 'text-render': 'poster', 'vector-output': 'logo' };
  function primaryFor(term) {
    if (!term) return 'poster';
    if (R[term.id]) return R[term.id].p;
    return CAT_PRIMARY[term.category] || 'poster';
  }
  var DZ_FONT = '.dz{font-family:var(--zbf)}.dz .hd,.ap .hd{font-family:var(--zhf)}';
  function build(s, ctx) {
    var b;
    if (s.primary === 'logo') b = buildLogo(s);
    else if (s.primary === 'package') b = buildPackage(s);
    else if (s.primary === 'landing') {
      b = buildLanding(s, ctx);
      b.css = b.css.replace(/var\(--bf\)/g, 'var(--zbf)').replace(/var\(--hf\)/g, 'var(--zhf)') + DZ_FONT;
    } else b = buildPosterFramed(s);
    b.css = b.css + surfCss(s) + extraCss(s);
    return b;
  }
  function mount(el, built, ctx) {
    var alive = true;
    var host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden';
    el.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = '<style>' + COMMON_CSS + built.css + '</style><div class="vp"><div class="stage" style="width:' + built.w + 'px;height:' + built.h + 'px">' + built.html + '</div></div>';
    var stage = root.querySelector('.stage');
    var page = stage && stage.firstElementChild;
    function fit() {
      if (!alive || !stage) return;
      var w = el.clientWidth || (el.getBoundingClientRect ? el.getBoundingClientRect().width : 0) || built.w;
      stage.style.transform = 'scale(' + (w / built.w) + ')';
    }
    function focus() {
      if (!alive || !built.focus || !page) return;
      var t = page.querySelector('[data-k="' + built.focus + '"]');
      if (!t) return;
      var y = Math.max(0, Math.min(t.offsetTop - 40, page.scrollHeight - built.h));
      page.style.transform = 'translateY(' + (-y) + 'px)';
    }
    fit(); focus();
    var ro = null, onWin = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(fit); ro.observe(el); }
    else { onWin = fit; window.addEventListener('resize', onWin); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { focus(); });
    var replay = null;
    if (page && page.classList && page.classList.contains('anim')) {
      replay = function () { page.classList.remove('anim'); void page.offsetWidth; page.classList.add('anim'); };
      host.addEventListener('click', replay);
    }
    return function () {
      alive = false;
      if (ro) ro.disconnect();
      if (onWin) window.removeEventListener('resize', onWin);
      if (replay) host.removeEventListener('click', replay);
      root.innerHTML = '';
      if (host.parentNode) host.parentNode.removeChild(host);
    };
  }
  function caption(el, text) {
    var c = document.createElement('div');
    c.textContent = text;
    c.style.cssText = 'position:absolute;left:8px;bottom:8px;max-width:calc(100% - 16px);padding:4px 8px;border-radius:6px;font:12px/1.4 system-ui,sans-serif;background:var(--surface);color:var(--muted);border:1px solid var(--line);z-index:2;pointer-events:none';
    el.appendChild(c);
    return c;
  }
  var PRIMS = { poster: 1, logo: 1, landing: 1, 'package': 1 };

  var renderer = {
    aspect: '4/5',
    primaries: [
      { key: 'poster', label: '재즈 공연 포스터', prompt: 'A poster for a jazz festival with the headline "Seoul Jazz Night" and the date "2026.11.20".' },
      { key: 'logo', label: '카페 로고', prompt: 'A logo for a small neighborhood coffee shop called "Morning Bean".' },
      { key: 'landing', label: '앱 랜딩 페이지', prompt: 'A landing page for a note-taking app called Notely, with a hero, features, pricing and footer.' },
      { key: 'package', label: '차 패키지', prompt: 'Packaging for an organic tea brand called "Leaf & Co.".' }
    ],
    primaryFor: primaryFor,
    supports: function (term) { return !!(term && R[term.id]); },
    render: function (el, terms, ctx) {
      injectFonts();
      ctx = ctx || {};
      terms = terms || [];
      var primary = PRIMS[ctx.primary] ? ctx.primary : primaryFor(terms[0]);
      var s = baseSpec(primary), skipped = 0, built;
      terms.forEach(function (t) {
        var r = t && R[t.id];
        if (!r) { skipped++; return; }
        try { r.f(s, ctx); s.applied++; } catch (e) { skipped++; }
      });
      try { built = build(s, ctx); } catch (e) { built = build(baseSpec(primary), ctx); skipped = Math.max(skipped, 1); }
      var cleanup = mount(el, built, ctx);
      var cap = null;
      if (skipped && terms.length) cap = caption(el, skipped >= terms.length ? '이 용어는 예시를 준비 중이에요' : '예시가 없는 용어는 건너뛰었어요');
      return function () {
        cleanup();
        if (cap && cap.parentNode) cap.parentNode.removeChild(cap);
      };
    }
  };

  PD.designRenderer = renderer;
  if (typeof PD.registerRenderer === 'function') PD.registerRenderer('design', renderer);
  else (PD._pendingRenderers = PD._pendingRenderers || []).push(['design', renderer]);
})();
