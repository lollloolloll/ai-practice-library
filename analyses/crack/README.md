---
target: 뤼튼 크랙 (Wrtn Crack) — https://crack.wrtn.ai/
kind: web + mobile AI character-chat / interactive story platform
analysis_type: attention & engagement teardown (not code reverse engineering)
analyzed_at: 2026-10-25
logged_in: false
evidence_contract: ../README.md
---

# Crack — AI entry point

## Question
What makes Crack capture attention, retain users, and monetize? Answer = `synthesis.json`.

## Method
1. **UI observation (`ui/`)**: Playwright + installed Chrome, fresh profile (no cookies, not logged in), desktop 1440×900 and mobile 390×844@2x, 2026-10-25. 17 curated screenshots in `ui/shots/` (JPEG), lossless originals in `ui/raw/` with sha256 in `ui/shots.json`. Logged-out lists use the site's safety filter (`isSafetyOnly=true`).
2. **Desk research (`research.md`, `research.json`)**: news, store listings, company statements. Every fact has a date, URL and status `observed | reported | unverified`.
3. **Synthesis (`synthesis.json`)**: hooks grouped by funnel stage (enter → choose → immerse → return → pay → spread).

## Evidence ids
- `C01–C17`: screenshots (`ui/index.json` → `images`)
- `UI:H01–H14`: hooks observed on screen (`ui/index.json` → `hooks`)
- `W1–W44`: researched facts (`research.json` → `facts`)
- `R:H1–H14`: researched hooks (`research.json` → `hooks`)

## Headline conclusions
- Borrows Korean web-novel/webtoon cover grammar (vertical cover + large Korean title + situation-in-one-line title) — observed [C05, C06].
- Zero-signup onboarding: one tap on 남성향/여성향/전체 personalizes the feed — observed [C01].
- Social proof everywhere: chat counts (e.g. 18.1M), rank numbers on covers — observed [C03, C05, C10].
- Monetization = per-message currency (크래커) by model tier + memory upgrade; bundles with escalating bonus and a "추천" decoy at ₩28,000 — observed [C11], tier prices unverified [W30].
- Creator economy: cash-out since 2026-09, originals program — reported [W26, W27].
- Scale: MAU ≈ 0.54M (Mobileindex, 2026-08) to 0.98M (WiseApp, 2026-02); #2 in Korea behind Zeta — reported [W8–W10].
- Risks: teen protection and sexual content concerns — reported [W20–W23].

## Not covered
Logged-in home, chat screen, currency spend per turn, onboarding branch differences. See `ui/index.json` → `unknowns`.

## Rights
Screenshots are of a public website for analysis and commentary. Character art belongs to Wrtn and its creators.
