# Renderer contract (프롬프트 사전)

Static site, no build step, no Node. Served over HTTP (python -m http.server) and later published as a claude.ai Artifact.

## Folder
```
index.html            app shell (core, written by lead)
css/app.css           core styles + design tokens
js/core.js            router, views, registry (lead)
js/r-image.js         image renderer        (classic script)
js/r-video.js         video renderer        (classic script)
js/r-audio.js         audio renderer        (classic script)
js/r-3d.js            3D renderer           (type="module", imports three from jsdelivr via importmap)
js/r-design.js        design renderer       (classic script)
data/dict.js          window.PD_DATA  (built by tools/build_data.py from research/*.json)
data/results-writing.js  window.PD_RESULTS.writing
data/results-coding.js   window.PD_RESULTS.coding
assets/primary/       portrait.jpg street.jpg product.jpg painting.jpg coffee.mp4 chair.glb studio.hdr guitar.mp3 voice.mp3
```

## Hard limits (Artifact CSP)
- External scripts ONLY from cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, unpkg.com — pinned exact versions. Fonts ONLY from fonts.googleapis.com.
- No fetch to other hosts. Load own assets via relative URLs (`assets/primary/...`).
- No alert/confirm/prompt. Audio starts only from a click.
- Must respect `prefers-reduced-motion` (no auto camera shake etc. → offer play button instead).
- Every color in a renderer's chrome uses core CSS tokens: `var(--bg) var(--fg) var(--muted) var(--line) var(--surface) var(--accent) var(--mark)`. Inside the *content* of a result (e.g. a design mock, a color-graded photo) literal colors are fine.

## Registry
```js
window.PD = window.PD || {};
PD.registerRenderer('image', {
  aspect: '3/2',                 // CSS aspect-ratio of a tile
  primaries: [                    // the fixed 원본 sources this field offers
    { key:'portrait', label:'인물 사진', src:'assets/primary/portrait.jpg',
      prompt:'Portrait of a young woman with a copper bob haircut, a lake and hills softly blurred behind her' }
  ],
  primaryFor(term) { return 'portrait'; },   // best primary key for this term (by category)
  supports(term) { return true; },          // true if a theory demo exists for this term
  render(el, terms, ctx) {                  // see below
    return () => {/* cleanup: stop loops, dispose GL, revoke URLs */};
  }
});
```
`PD.registerRenderer` may be called before or after core boots (3D is a module and loads late); core re-renders when a renderer arrives.

### render(el, terms, ctx)
- `el`: an empty `<div>` that core has already sized (`width:100%; aspect-ratio: <aspect>`; `position:relative; overflow:hidden`). Fill it completely.
- `terms`: array of term objects (from PD_DATA). `[]` → draw the untouched 원본. `[t]` → apply one term. Many → a combo: apply every supported term in order, skip unsupported ones.
- `ctx`: `{ primary: 'portrait', field: 'image', reducedMotion: bool }`.
- Return a cleanup function. Core calls it before re-rendering the tile or leaving the page.
- Must be robust: never throw for an unknown term id — fall back to drawing the 원본 plus a small caption.
- Keep it fast: a compare view may show up to 6 tiles at once. Cache decoded images / audio buffers / GLTF at module level.

### Term object (fields you can rely on)
`{ id, field, term, ko, category, tags[], effect_ko, snippet, compare_with[], tools[], level }`
Ids are unique within a field. Read the term ids for your field from `research/<field>.json` and map them to parameters in your own file — do NOT edit research/*.json.

### Shared helpers core provides
- `PD.sound.ctx()` → shared AudioContext (lazy, resumes on call; call only inside a click handler path).
- `PD.sound.claim(stopFn)` → stops whatever else is playing, registers yours. Call before starting playback.
- `PD.loadImage(src)` → Promise<HTMLImageElement> (cached).
- `PD.h(tag, attrs, ...children)` → tiny DOM helper.

## Copy rules (any visible text)
Korean, 해요체, Toss writing principles: one message per sentence, no filler, plain words. Labels as short nouns. Keep visible text minimal — results speak.
