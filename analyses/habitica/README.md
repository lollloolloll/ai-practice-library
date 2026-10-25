---
target: Habitica (Android) — com.habitrpg.android.habitica
kind: mobile app, open source (GPL-3.0)
analysis_type: static reverse engineering from official source + public store UI
analyzed_at: 2026-10-25
source_commit: 52fbfd7a1bc76b153fb55fba7220644798de54b2
evidence_contract: ../README.md
---

# Habitica — AI entry point

## Scope and method
- **Static source analysis** of https://github.com/HabitRPG/habitica-android at the commit above. Nothing was built or executed. → `source.json`, `source-report.md` (evidence `S#`, findings `F#`).
- **Public UI archive** from the Google Play listing (no login): 8 phone + 5 Wear OS screenshots, icon, feature graphic, original resolution, sha256 recorded → `ui/play/`, `ui/index.json`, `ui/ui-report.md` (evidence `P#`). Smaller copies for display: `ui/thumbs/`.
- **Merged view** → `dossier.json` (build: `python -I tools/build_dossier.py habitica`). Human summary → `synthesis.json`.
- Why not decompile: no trusted APK source (official GitHub releases ship no APK; third-party mirrors excluded) and the source is public, which is more accurate than decompiled output. rea's evidence contract was applied; rea's JADX path was not run.

## Headline facts
- v4.11.0 (27850), minSdk 26, target/compile 37; modules `:Habitica :wearos :common :shared` [S…, see source.json].
- UI: hybrid XML/ViewBinding + Jetpack Compose (Material3); Hilt; Retrofit 3 + OkHttp 5; Realm.
- 83 screens in 11 feature areas; main = drawer + 4-tab bottom bar (Habits / Dailies / To-Dos / Rewards) + center "+".
- Design: purple brand scale (#6133B4 / #925CF3), 8 selectable color themes with dark variants, task value → color scale maroon → red → orange → yellow → green → teal → blue.
- API: `/api/v4/`, 136 endpoints (user 46, groups 25, tasks 21); full user sync every 3 min, server-authoritative game math.
- Monetization: Play Billing (gems, subscriptions, gift subscriptions); no ad SDK found in inspected scope. No analytics events found.
- i18n: 23 locales incl. Korean (1,540 / 1,615 strings).
- Store (2026-10-25): 4.6★ from 76,007 ratings, 5M+ installs, Editor's Choice.

## Open questions
See `dossier.json` → `unknowns` (production URL/keys, server formulas, live remote-config values, exported receiver caller checks, SKU prices).
