---
target: 뤼튼 크랙 (Wrtn Crack) — https://crack.wrtn.ai/
kind: web + mobile AI character-chat / interactive story platform
analysis_type: attention & engagement teardown (not code reverse engineering)
analyzed_at: 2026-10-25
logged_in: "partly — logged-out UI (ui/shots) + one logged-in play session (ui/session)"
evidence_contract: ../README.md
---

# Crack — AI entry point

## Question
What makes Crack capture attention, retain users, and monetize? Answer = `synthesis.json`.

## Method
1. **UI observation (`ui/`)**: Playwright + installed Chrome, fresh profile (no cookies, not logged in), desktop 1440×900 and mobile 390×844@2x, 2026-10-25. 17 curated screenshots in `ui/shots/` (JPEG), lossless originals in `ui/raw/` with sha256 in `ui/shots.json`. Logged-out lists use the site's safety filter (`isSafetyOnly=true`).
2. **Desk research (`research.md`, `research.json`)**: news, store listings, company statements. Every fact has a date, URL and status `observed | reported | unverified`.
3. **Real play (`ui/session/`, `ui/storyboard.json`, `ui/annotated/`)**: the user logged in themselves (Kakao) in a dedicated profile, then two turns of 국가의 시대 were played, plus my page and a visual novel. Name, nickname and username were replaced in the DOM with 테스트 계정 before each screenshot; the profile was deleted afterwards. `ui/storyboard.json` orders 10 scenes with captions and numbered marks (`box = [x, y, w, h]` px); `ui/annotated/` holds the marked copies (originals untouched; redraw with `python -I tools/annotate.py analyses/crack`). Reply text: `ui/session/s03.txt`, `s06.txt`.
4. **Synthesis (`synthesis.json`)**: hooks grouped by funnel stage (enter → choose → immerse → return → pay → spread).

## Evidence ids
- `C01–C17`: screenshots (`ui/index.json` → `images`)
- `UI:H01–H14`: hooks observed on screen (`ui/index.json` → `hooks`)
- `W1–W44`: researched facts (`research.json` → `facts`)
- `R:H1–H14`: researched hooks (`research.json` → `hooks`)
- `RP1–RP10`: real-play findings (`synthesis.json` → `realplay_findings`), each citing `ui/session/*` files

## Headline conclusions
- Borrows Korean web-novel/webtoon cover grammar (vertical cover + large Korean title + situation-in-one-line title) — observed [C05, C06].
- Zero-signup onboarding: one tap on 남성향/여성향/전체 personalizes the feed — observed [C01].
- Social proof everywhere: chat counts (e.g. 18.1M), rank numbers on covers — observed [C03, C05, C10].
- Monetization = per-message currency (크래커) by model tier + memory upgrade; bundles with escalating bonus and a "추천" decoy at ₩28,000 — observed [C11], tier prices unverified [W30].
- Creator economy: cash-out since 2026-09, originals program — reported [W26, W27].
- Scale: MAU ≈ 0.54M (Mobileindex, 2026-08) to 0.98M (WiseApp, 2026-02); #2 in Korea behind Zeta — reported [W8–W10].
- Risks: teen protection and sexual content concerns — reported [W20–W23].

## Real-play findings (observed, 2026-10-25)
- Replies look like game output: [속보] news + decision prompt + numeric INFO status panel [RP2].
- The AI used the account name as the protagonist name [RP3].
- 추천답변 gives 3 AI-written next moves every turn; no typing needed [RP4].
- 이어서 생성 → "최대 출력량을 조절하시겠어요?" cracker upsell at the moment of immersion [RP6].
- Free chat ticket covered the turns; balance stayed 500 [RP7].
- My page stacks 충전 / 메모리 PRO / 크리에이터 도전 / 친구 초대 [RP8].

## Not covered
Currency spend per turn once free tickets run out, onboarding branch differences, mobile app chat. See `ui/index.json` → `unknowns`.

## Rights
Screenshots are of a public website for analysis and commentary. Character art belongs to Wrtn and its creators.
