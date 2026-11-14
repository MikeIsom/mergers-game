# Acquire achievements — revision 1

Game identity: `acquire`, BGS version `1`. Achievement engine: `0.0.9`.
Based on canonical `origin/main` commit `701b8a2`, including the drawn-dead-tile fix,
with the previous release records integrated from `30c7223`. Version `0.0.8` was already
live and is not reused. See [release receipts](release-check.md) for deployment status.
No viewer or CMS changes are required.

## Manifest

The authoritative manifest is `achievementDefinitions()` in
[`packages/engine/src/achievements.ts`](../../packages/engine/src/achievements.ts),
exported by the BGS wrapper. IDs are game-local, stable lowercase hyphenated strings;
never repurpose them. Revision is **1**. Definition changes require a revision bump.

| ID                      | Requirement in a completed game                                                        |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `win`                   | Rank first, including shared victory                                                   |
| `win-2-players`         | Win with 2 real players                                                                |
| `win-3-players`         | Win with 3 real players                                                                |
| `win-4-players`         | Win with 4 real players                                                                |
| `win-5-players`         | Win with 5 real players                                                                |
| `win-6-players`         | Win with 6 real players                                                                |
| `team-win`              | Win in team play                                                                       |
| `four-hands-win`        | Win in four-hands mode                                                                 |
| `found-three-chains`    | One internal seat founds 3 distinct chains                                             |
| `make-merger`           | Personally place a merger tile; bank tiles excluded                                    |
| `three-chain-merger`    | Personally merge at least 3 chains with one tile; bank tiles excluded                  |
| `trade-six-shares`      | Trade at least 6 defunct shares in one disposal (receiving at least 3 survivor shares) |
| `ten-share-investor`    | One seat sells at least 10 shares of one chain at final scoring                        |
| `three-chain-portfolio` | One seat sells shares of at least 3 distinct chains at final scoring                   |
| `luxury-investor`       | One seat sells at least 10 Imperial or 10 Continental shares at final scoring          |
| `thirty-thousand`       | One seat finishes with at least $30,000 settled cash                                   |
| `fifty-thousand`        | One seat finishes with at least $50,000 settled cash                                   |

Icons are protocol-supported short alphanumeric text marks, not external URLs or
unpublished asset keys. No artwork upload prerequisite.

## Evidence and eligibility

- Optional methods use the official `@boardgamers/protocol@0.11.0/engine` types.
  Tests validate the manifest and results with the published `/achievements` schemas.
- Input is the complete serialized `GameState` object, not a JSON string or stripped
  viewer state. Extraction is pure and deterministic. No new saved fields, normalized
  options, counters or replay formats are introduced.
- `ended`, phase `ended`, a `gameEnd` event and a terminal `result` event are required.
  Tentative drafts and the actual tutorial seed prefix `acquire-tutorial-` are excluded.
  Explicit host boolean markers `cancelled`, `canceled`, `analysis`, `practice`, or
  `tutorial` also suppress results defensively; these are not native Acquire fields.
- The engine has no native cancelled state or persisted platform analysis/practice flag.
  **The platform must gate cancelled, analysis, practice and ineligible-account runs.**
  Replaying a finished game alone cannot distinguish a real finish from platform analysis.
- Use actual `playerRankings()` after settlement, not the logged result's ranks (the log
  is written before `ended` becomes true, which matters for team rankings). Shared first
  places are `win`, not `draw`, per rules §11.2.4. Team scores combine alternating seats;
  four-hands scores use the richest seat, not the sum. No bot-aware promotion occurs.
- Results use original zero-based BGS player indices. Four-hands internal seats map via
  `seatOwner`; feats from a player's seats are unioned, never summed across seats.
  Dropped seats earn no feats, including any from later automatic play. BGS remains
  responsible for mapping original seats to eligible accounts and excluding bots.
- Non-winning feats are independent of victory. Normal announced, automatic-condition,
  stalled and dropped-player endings are settled finishes, not cancellation.
- Foundings, mergers and disposals are counted only from existing committed engine events.
  `byBank` excludes bank-created mergers. Final sales supply exact pre-liquidation
  holdings; inactive worthless shares do not qualify. These events are retained in the
  saved state even with limited logs enabled. No achievements infer unrecorded history,
  hypothetical payouts, majority leadership or peak wealth.
- Thresholds respect the 25-share supply: six-for-three trades and ten-share investments
  are possible. Cash thresholds have no artificial rules ceiling (bank cash is unlimited).
  Tests use invariant-checked positions, real settlement and merger actions, plus seeded
  complete legal games and replay; position fixtures are not claims of historical play.

## Review and eventual release prerequisites

- Engine source/version, protocol dependency and lockfile are included together. The
  viewer remains on its existing version and dependency: no viewer artifact changed.
- Validate with `pnpm check`; no UI change means browser screenshot checks are not required.
- Independent feature review and coordinator approval are required before merge or publish.
  This branch must not push to main or deploy BGS artifacts autonomously.
- Confirm the deployed platform supports both optional hooks, manifest ingestion, original
  seat eligibility, outcome semantics and platform-only exclusion gates before activation.
- After approval, follow [the publishing guide](../registering.md): pack the engine,
  fetch fresh live metadata, preserve visibility and unrelated fields, upload engine first,
  retain BGS version 1, and verify asynchronous installation. Do not overwrite live metadata
  with the bootstrap template. No npm publication is required.
