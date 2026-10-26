---
purpose: AI-readable reverse-engineering dossiers
audience: LLM agents (Claude, Codex, etc.); humans read the rendered pages in /cases/
format_version: 1
---

# Analyses — AI entry point

Each subfolder is one reverse-engineered target. Read `<target>/README.md` first; it states scope, method, and which files hold what. Every claim in every file follows the evidence contract below.

## Evidence contract (adapted from morluto/rea)

- Every finding has `status`: `observed` (seen directly in a cited artifact) | `inferred` (reasoned from cited evidence, not seen) | `unknown` (open question).
- Every finding cites evidence ids. Evidence ids are stable within a dossier: `S#` = source-code file/line, `P#` = Play/store listing artifact (image or metadata), `W#` = web page, `R#` = runtime observation.
- "Absent" means "not found within inspected scope"; the scope is recorded.
- Names, strings, or layout alone never prove behavior.
- Images are archived under `<target>/ui/` with sha256; never rely on a remote URL staying stable.

## File layout per target

| File | Content |
|---|---|
| `README.md` | Scope, method, file map, headline conclusions, how to extend |
| `dossier.json` | Single merged machine-readable view: target, evidence, findings, screens, ui images, design tokens, api, unknowns |
| `source.json` / `source-report.md` | Static analysis of source code (or decompiled code) |
| `ui/index.json` / `ui/ui-report.md` | Archived UI images with per-image breakdown (regions, components, visible text, palette) |
| `ui/play/*` | Archived store screenshots, icon, feature graphic |
| `ui/session/*` | Real logged-in usage screenshots (PII replaced before capture) with `_session.json` (sha256, steps) |
| `ui/storyboard.json` | Ordered scenes of real usage: title, caption, numbered marks with px boxes |
| `ui/annotated/*` | Marked copies of session screenshots (`tools/annotate.py`); `thumbs/` for strips |

## Targets

| Target | Kind | Dossier |
|---|---|---|
| Habitica (Android) | Mobile app, open source (GPL-3.0); static source + store UI + logged-in web play | [habitica/](habitica/) |
| Crack (crack.wrtn.ai) | Web/app service; attention & engagement teardown, logged-out UI + logged-in play + desk research | [crack/](crack/) |

Human-readable pages: `/cases/` on the site.
