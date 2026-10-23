# Acquire private beta — 23 October 2026

Private BGS registration: `acquire`, version `1`. Engine `0.0.2`, viewer `0.0.12`.
Source: <https://github.com/boardgamers/mergers-game>. Keep `public: false`.

## Validation

- Merger disposal shows the surviving chain's price after this merger before players sell or trade.
  Verified the reported Festival (3) / Imperial (3) case: Imperial grows from $500 to $800 at
  7 tiles, while Festival sales remain $400 each. Preview checks include connected loose tiles,
  unchanged price bands, multi-chain mergers, bank mode and four-hands games. Browser checks cover
  the price preview in all 17 languages at 1280, 390 and 320 pixels.

- Undo keeps unfinished choices in a private server-validated draft. Repeated placement/founding
  revisions never persist undo entries or award time. One increment is earned per completed turn;
  other players' merger disposal decisions each earn their own increment. Drawing tiles, revealing
  merger bonuses, ending the game or handing off a decision commits the draft. Checks cover stale
  requests, hidden-information masking, replay, bank mode, four-hands, teams and dropped players.
  Desktop/phone checks exercise repeated undo, saved-state refreshes, final history and clock totals.

- `pnpm check`: formatting, lint, TypeScript/Svelte checks, 207 engine tests,
  63 viewer/tutorial tests, and the production build. Two pre-existing lint warnings
  remain (an unused test import and Svelte's `bind:this` assignment).
- Protocol diagnostics: all eight required engine methods; full core/chat/replay
  viewer coverage, preferences, avatars and theme handlers. Protocol `0.10.0` is the
  latest published npm version checked for this release.
- `pnpm test:browser` loads the compiled IIFE and CSS. It covers 68 combinations
  of locale and viewport (1280, 844, 390 and 320 pixels), Persian RTL, chain letters,
  chat permissions/sending, analysis chat suppression, every six-player
  and four-hands seat plus spectators, replay/live navigation and real tile moves.
- Tutorials now have 5 founding, 7 merger and 3 scoring steps. They run through normal controls on desktop and phone. Checks
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
- Log names use the same player colors as the table and chat. Chain names use their chain colors;
  cash retains its currency symbol with emphasized, tabular digits. Checks cover both themes,
  contrast, translated word order and player names that match chain names.
- Hand markers remain visible between turns, but only legal moves are clickable. Browser checks
  cover immediate placement from a single board click on desktop and phone, spectator privacy,
  and hiding markers in replay. Selecting from the hand still offers a placement preview.

## Fixes made for beta

- Snapshot Svelte move data before handing it to the host. Nested share selections
  and merger-order arrays must be structured-cloneable for iframe messaging and
  tutorial persistence.
- Contain wide player/chain tables on narrow screens, without widening the page.
- Keep both stock-purchase buttons visible on narrow phones, including languages
  with longer table headings.
- Remove the redundant color-blind toggle and player symbols. Names and chain letters identify
  everything without relying on color; BGS supporter colors remain supported.
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
- Keep chain letters visible for everyone in both themes.
- Explain tile adjacency, chain price tiers (no special abilities), price bands,
  majority/minority bonuses and ties, safe chains, and final payouts alongside
  the tutorial actions in all 17 languages. Explicitly distinguish absorbed-chain merger bonuses
  from final bonuses for every active chain, including safe chains and the 41+ price bands.
  Include an expandable price table
  within the buying lesson. Keep references usable after chapter completion;
  only game moves are disabled.

- Add audible tile, founding, merger, share transaction and endgame cues, with layered
  Web Audio tones. Honor BGS’s global sound preference, and stay silent during initial
  load, replay, analysis, duplicate state updates and multi-move catch-up.
- Expand founding with a second turn showing Tower’s price rise from $200 to $300.
  Add a second merger with an equal-size choice and a sole shareholder’s $4,500 payout.
  Both expanded chapters use tutorial version 2; scoring retains version 1.
- Finished-game analysis uses BGS’s default replay/move/view adapters. A local audit
  checked 12 historical move boundaries across 2/4/6 players and four hands, playing
  up to 20 hypothetical moves at each without changing the source.

## Still required before a public release

- Translate the English CMS rules, description, credits and BGS setup/preference
  labels, including the tutorial launcher cards. The in-game UI, journal and
  tutorial content are translated; the engine's plain `simple` last-move summaries
  used by the BGS game list remain English. Do not use automated translation APIs.
- Test finished-game analysis end to end on BGS, including non-move log positions
  (the current replay rejects those) and dropped-player automation. Historical
  analysis at valid move boundaries works through BGS’s default adapters without
  custom `createAnalysis` / `analysisMove` hooks.
- Implement hidden-information scenarios before enabling ongoing-game analysis.
  Opponent hands and future draws must be simulated, never copied from the live game.
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
