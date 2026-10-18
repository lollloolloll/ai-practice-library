# -*- coding: utf-8 -*-
"""Assemble data/results-coding.js from the HTML files in this folder."""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'data', 'results-coding.js')
coding = json.load(open(os.path.join(ROOT, 'research', 'coding.json'), encoding='utf-8'))
TERM_IDS = {t['id']: t for t in coding['terms']}
BASE = {b['id']: b['prompt_ko'] for b in coding['base_prompts']}

T, B, L, D = 'todo-app', 'bouncing-ball-game', 'landing-page', 'sales-dashboard'
# term id -> (base, 추가 문장)
VARIANTS = {
    # ui
    'responsive': (L, '반응형 레이아웃(responsive layout)으로 모바일·태블릿·데스크톱에서 모두 잘 보이게 해줘.'),
    'mobile-first': (T, '모바일 우선(mobile-first)으로 설계해줘.'),
    'dark-mode': (T, '다크 모드(dark mode with toggle)를 지원하고 전환 토글을 넣어줘.'),
    'accessible-a11y': (T, '접근성(accessible, WCAG 2.2 AA)을 지켜줘.'),
    'keyboard-navigation': (T, '키보드 조작과 단축키(keyboard navigation & shortcuts)를 지원해줘.'),
    'high-contrast': (D, '고대비(high contrast) 디자인으로 만들어줘.'),
    'micro-interactions': (T, '마이크로 인터랙션(micro-interactions)을 넣어줘.'),
    'css-transitions': (L, '애니메이션은 CSS 전환 효과(CSS transitions only)만 사용해줘.'),
    'reduced-motion': (L, '모션 줄이기 설정(respect prefers-reduced-motion)을 존중해줘.'),
    'skeleton-loading': (D, '데이터를 불러오는 동안 스켈레톤 로딩(skeleton loading)을 보여줘.'),
    'loading-error-states': (D, '로딩·빈·오류 상태(loading, empty and error states)를 모두 처리해줘.'),
    'empty-state': (T, '할 일이 없을 때 보여줄 빈 상태 화면(designed empty state)을 디자인해줘.'),
    'optimistic-ui': (T, '낙관적 UI 업데이트(optimistic UI updates)를 적용해줘.'),
    'infinite-scroll': (D, '주문 목록은 무한 스크롤(infinite scroll)로 불러와줘.'),
    'pagination': (D, '주문 목록에 페이지네이션(pagination)을 넣어줘.'),
    'search-filter-sort': (T, '검색·필터·정렬(search, filter and sort) 기능을 넣어줘.'),
    'toast-notifications': (T, '동작마다 토스트 알림(toast notifications)을 띄워줘.'),
    'undo-action': (T, '삭제할 때 확인창 대신 실행 취소(undo instead of confirm)를 제공해줘.'),
    'modal-dialog': (L, '구독 신청은 모달 대화상자(modal dialog)로 받아줘.'),
    'inline-editing': (T, '항목을 인라인 편집(inline editing)할 수 있게 해줘.'),
    'drag-and-drop': (T, '드래그 앤 드롭으로 순서를 바꿀 수 있게(drag-and-drop reordering) 해줘.'),
    'inline-form-validation': (L, '가입 폼에 실시간 입력 검증(inline form validation)을 넣어줘.'),
    'command-palette': (T, '커맨드 팔레트(command palette, Cmd/Ctrl+K)를 넣어줘.'),
    'sticky-header': (L, '고정 헤더(sticky header / navbar)를 적용해줘.'),
    'dashboard-layout': (D, '사이드바와 KPI 카드가 있는 대시보드 레이아웃(dashboard layout)으로 구성해줘.'),
    # style
    'distinctive-aesthetic': (L, '흔한 AI 느낌이 나지 않는 개성 있는 디자인(distinctive, non-generic aesthetic)으로 만들어줘.'),
    'typography-pairing': (L, '개성 있는 서체 조합(distinctive typography pairing)을 사용해줘.'),
    'dominant-accent-palette': (L, '주조색 하나와 날카로운 강조색(dominant color + sharp accent) 팔레트로 만들어줘.'),
    'minimal-style': (T, '미니멀(minimal / clean) 스타일로 만들어줘.'),
    'neo-brutalism': (T, '네오 브루탈리즘(neo-brutalism) 스타일로 만들어줘.'),
    'glassmorphism': (D, '글래스모피즘(glassmorphism) 스타일로 만들어줘.'),
    'bento-grid': (L, '벤토 그리드 레이아웃(bento grid layout)으로 구성해줘.'),
    'real-content': (L, 'lorem ipsum 없이 실제 같은 문구(realistic copy, no lorem ipsum)를 써줘.'),
    'design-reference': (L, '애플 제품 페이지 스타일로(in the style of Apple product pages) 만들어줘.'),
    # game
    'game-loop': (B, 'requestAnimationFrame 기반 게임 루프(game loop)로 점수와 목숨이 있는 게임으로 만들어줘.'),
    'delta-time': (B, '델타 타임(delta-time movement)으로 프레임 속도와 무관하게 움직이게 해줘.'),
    'fixed-timestep': (B, '물리는 고정 시간 간격(fixed timestep physics)으로 계산해줘.'),
    'physics': (B, '중력·속도·마찰·반발(gravity, velocity, friction, bounce) 물리를 넣어줘.'),
    'collision-detection': (B, '공끼리, 공과 벽의 충돌 감지(collision detection, circle)를 넣어줘.'),
    'spatial-hash': (B, '공이 많아도 빠르게 공간 분할 충돌 최적화(spatial hashing / broad phase)를 적용해줘.'),
    'particle-system': (B, '튈 때마다 파티클 시스템(particle system)으로 효과를 넣어줘.'),
    'game-juice': (B, '화면 흔들림·히트 스톱·찌그러짐 같은 게임 손맛(game juice)을 넣어줘.'),
    'easing-tweening': (B, '움직임에 이징·트윈(easing / tweening)을 적용해줘.'),
    'game-state-machine': (B, '메뉴·플레이·일시정지·게임오버 상태 머신(game state machine)으로 구성해줘.'),
    'procedural-generation': (B, '시드 기반 절차적 생성(procedural generation, seeded)으로 레벨을 만들어줘.'),
    'perlin-noise': (B, '펄린 노이즈(Perlin noise)로 지형을 만들어줘.'),
    'tilemap': (B, '타일맵(tilemap / grid-based world) 기반 맵으로 만들어줘.'),
    'sprite-animation': (B, '스프라이트 시트 애니메이션(sprite sheet animation)을 사용해줘.'),
    'pixel-art-crisp': (B, '흐림 없는 픽셀아트 렌더링(pixel-art rendering, no smoothing)으로 만들어줘.'),
    'parallax': (B, '패럴랙스 스크롤 배경(parallax scrolling background)을 넣어줘.'),
    'input-handling': (B, '키보드와 터치 입력 처리(keyboard + touch input handling)를 모두 지원해줘.'),
    'high-score': (B, '최고 점수를 저장(persistent high score)해줘.'),
    'web-audio-sfx': (B, 'Web Audio로 효과음(procedural sound effects)을 넣어줘.'),
    'ecs': (B, 'ECS 구조(Entity-Component-System)로 설계해줘.'),
    # performance
    'lazy-loading': (L, '이미지는 지연 로딩(lazy loading)해줘.'),
    'code-splitting': (D, '코드 분할(code splitting)로 필요한 모듈만 나중에 불러와줘.'),
    'memoization': (D, '무거운 계산은 메모이제이션(memoization, useMemo / React.memo)해줘.'),
    'debounce': (T, '검색 입력에 디바운스(debounce)를 적용해줘.'),
    'throttle': (L, '스크롤 이벤트에 스로틀(throttle)을 적용해줘.'),
    'virtualization': (D, '주문 1만 건 목록은 가상화(list virtualization, windowing)해줘.'),
    'object-pooling': (B, '파티클 2000개를 오브젝트 풀링(object pooling)으로 관리해줘.'),
    'web-worker': (D, '무거운 계산은 웹 워커(Web Worker)로 분리해줘.'),
    'performance-budget': (B, '60fps 성능 목표(performance budget)를 지키게 해줘.'),
    # data
    'crud': (T, '생성·조회·수정·삭제 전체 CRUD(full CRUD)를 구현해줘.'),
    'localstorage': (T, '로컬스토리지에 저장(persist to localStorage)해줘.'),
    'indexeddb': (T, 'IndexedDB에 저장(IndexedDB storage)해줘.'),
    'rest-api': (T, 'REST API로 데이터를 주고받게(REST API) 해줘.'),
    'data-schema': (T, '데이터 스키마를 먼저 정의(define data schema / model first)하고 만들어줘.'),
    'mock-data': (D, '현실적인 목업 데이터(seed / mock data)를 생성해서 채워줘.'),
    'json-import-export': (T, 'JSON 가져오기·내보내기(JSON import/export)를 지원해줘.'),
    'url-state': (T, '필터 상태를 URL 쿼리에 저장(state in URL query params)해줘.'),
}

ALLOWED = ('https://cdn.jsdelivr.net/npm/', 'https://cdnjs.cloudflare.com/', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com')

def load(name):
    p = os.path.join(HERE, name + '.html')
    s = open(p, encoding='utf-8').read().strip()
    assert s.lower().startswith('<!doctype html>'), name
    for url in re.findall(r'(?:src|href)="(https?://[^"]+)"', s):
        assert url.startswith(ALLOWED), (name, url)
    for url in re.findall(r"loadScript\('([^']+)'\)", s):
        assert url.startswith(ALLOWED), (name, url)
    return s

bases = {bid: {'prompt': BASE[bid], 'html': load('base__' + bid)} for bid in BASE}
terms = {}
for tid, (base, extra) in VARIANTS.items():
    assert tid in TERM_IDS, 'unknown term ' + tid
    terms[tid] = [{'base': base, 'prompt': BASE[base].rstrip() + ' ' + extra, 'html': load(tid)}]

def dump(o):
    return json.dumps(o, ensure_ascii=False).replace('</script', '<\\/script').replace('</SCRIPT', '<\\/SCRIPT')

js = ('window.PD_RESULTS = window.PD_RESULTS || {};\n'
      'window.PD_RESULTS.coding = Object.assign(window.PD_RESULTS.coding || {}, {});\n'
      '(function(R){ R.base = Object.assign(R.base||{}, ' + dump(bases) + '); R.terms = Object.assign(R.terms||{}, ' + dump(terms) + '); })(window.PD_RESULTS.coding);\n')
open(OUT, 'w', encoding='utf-8').write(js)

# validate: re-parse both JSON blobs
m = re.match(r'.*?R\.base = Object\.assign\(R\.base\|\|\{\}, (.*)\); R\.terms = Object\.assign\(R\.terms\|\|\{\}, (.*)\); \}\)\(window\.PD_RESULTS\.coding\);\s*$', js, re.S)
b2, t2 = json.loads(m.group(1)), json.loads(m.group(2))
assert b2 == bases and t2 == terms
assert '</script' not in js.lower()
cats = {}
for tid in terms: cats.setdefault(TERM_IDS[tid]['category'], []).append(tid)
sys.stdout.reconfigure(encoding='utf-8')
for c, ids in cats.items(): print(c, len(ids))
print('terms', len(terms), 'KB', round(os.path.getsize(OUT) / 1024, 1))
big = sorted(((len(v[0]['html'].encode()), k) for k, v in terms.items()), reverse=True)[:5]
print('largest', big)
