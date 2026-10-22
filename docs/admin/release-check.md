# Acquire private beta — 22 October 2026

Private BGS registration: `acquire`, version `1`. Engine `0.0.1`, viewer `0.0.5`.
Source: <https://github.com/boardgamers/mergers-game>. Keep `public: false`.

## Validation

- `pnpm check`: formatting, lint, TypeScript/Svelte checks, 198 engine tests,
  51 viewer/tutorial tests, and the production build. Two pre-existing lint warnings
  remain (an unused test import and Svelte's `bind:this` assignment).
- Protocol diagnostics: all eight required engine methods; full core/chat/replay
  viewer coverage, preferences, avatars and theme handlers. Protocol `0.10.0` is the
  latest published npm version checked for this release.
- `pnpm test:browser` loads the compiled IIFE and CSS. It covers 68 combinations
  of locale and viewport (1280, 844, 390 and 320 pixels), Persian RTL, color-blind
  symbols, chat permissions/sending, analysis chat suppression, every six-player
  and four-hands seat plus spectators, replay/live navigation and real tile moves.
- All three tutorials run through normal controls on desktop and phone. Checks
  cover saved progress, reload, step retry, rejected unrelated actions, French and
  Persian resume, the final $15,800 scoring example, reference controls after
  completion, and returning to an earlier step. The price and bonus explanations
  have 68 additional locale/viewport checks, including the expanded price table
  at 320 pixels. Unit tests complete and restore every chapter in all 17 locales
  using the real engine.
- Screenshots and a machine-readable report are generated in `release/qa/`.
  The gallery uses three distinct views, each with light and dark variants. Height
  checks prevent oversized captures; desktop panels and the full-log toggle are checked.
- Wide-screen checks cover the full-window background, outer margins, board sizing,
  permanently visible chat, player colors, and preservation of chat drafts when appearance changes.
- Hand markers remain visible between turns, but only legal moves are clickable. Browser checks
  cover selecting and confirming from the board, spectator privacy, and hiding markers in replay.

## Fixes made for beta

- Snapshot Svelte move data before handing it to the host. Nested share selections
  and merger-order arrays must be structured-cloneable for iframe messaging and
  tutorial persistence.
- Contain wide player/chain tables on narrow screens, without widening the page.
- Keep both stock-purchase buttons visible on narrow phones, including languages
  with longer table headings.
- Supply default player symbols in color-blind mode when BGS sends no assignments.
- Translate shared chat permissions, unread counts and dates in all 17 locales.
- Add three interactive tutorials: founding, mergers and scoring. Lesson text and
  controls are translated in all 17 locales; progress is stored locally.
- Add a built-bundle development mode and repeatable browser checks.
- Spread players, recent history and chat across the desktop below the play area;
  show eight recent log entries with the full history available on demand. Gallery
  captures frame the game instead of including an entire scrolling phone page.
- Split the game description into two paragraphs.
- Remove outer iframe margins and paint the full document with the game theme. Let the board
  fill its desktop column, keep chat open, and use consistent player colors in the table and chat.
- Use chain letters in both color modes; reserve extra symbols for players.
- Explain tile adjacency, chain price tiers (no special abilities), price bands,
  majority/minority bonuses and ties, safe chains, and final payouts alongside
  the tutorial actions in all 17 languages. Include an expandable price table
  within the buying lesson. Keep references usable after chapter completion;
  only game moves are disabled.

## Still required before a public release

- Translate the English CMS rules, description, credits and BGS setup/preference
  labels, including the tutorial launcher cards. The in-game UI, journal and
  tutorial content are translated; the engine's plain `simple` last-move summaries
  used by the BGS game list remain English. Do not use automated translation APIs.
- Implement and test playable historical analysis. The engine supports replay,
  but has no `createAnalysis`, `analysisMove` or hidden-information scenario
  implementation. Do not enable ongoing-game analysis.
- Human playtesting of the private beta, including two-player bank mode, four
  hands, team play, long games and translation quality. Automated coverage is not
  a claim of a complete human rules review.

## Metadata

- Base title: Acquire; 2–6 players; publication year 1964.
- Credits name Sid Sackson, 3M, current publisher Renegade Game Studios and the
  digital implementation's author. Publisher/purchase:
  <https://renegadegamestudios.com/acquire/>; BGG:
  <https://boardgamegeek.com/boardgame/5/acquire>.
- Upload the original transparent `pictogram.svg`, English rules as the CMS page
  `acquire:rules`, and `gameinfo.json` for the initial version/configuration.
- Tags: `economic`, `tile-placement` and `stock-holding`.
- Intended beta accounts: not2cool, Spock and AlphaZero. GitHub collaborator:
  MikeIsom, write permission (requires accepting GitHub's invitation).
