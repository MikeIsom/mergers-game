# Acquire achievement artwork — revision 2

Issue: <https://codeberg.org/boardgamers/boardgamers/issues/595>

Seventeen original vector compositions replace the text icons in engine 0.0.10
(previously 0.0.9, achievement revision 1). IDs, names, descriptions, eligibility
and evaluator are unchanged. No publication has been performed by this change.

## Sources and licence

Every composition embeds the actual rectangle geometry from
`docs/admin/pictogram.svg`, unchanged within a translation/scale group. Its
orange/cyan groups and dark central tile are original implementation artwork,
not artwork from any commercial edition. Source provenance is the canonical
`https://github.com/boardgamers/mergers-game` repository, baseline
`f7346b5615dcc63f04bf3f858741f8de6a37ad29`, under its AGPL-3.0-only licence.
The supplied publicly verified `acquire-followup-pictogram.webp` was visually
compared with this source; no raster or commercial artwork is traced or embedded.

All additional geometry is newly authored in
`scripts/generate-achievement-art.py`, under the same AGPL-3.0-only licence.
No external icon packs, photographs, proprietary chain logos or edition assets
are used. Supplementary numerals use DejaVu Sans (Bitstream Vera/DejaVu font
licences); no font file is redistributed. The SVGs are editable source exports.
`manifest.json` pins source pictogram, SVG and PNG SHA-256 hashes and stable
`achievement-<id>` upload keys. Each PNG is 512 × 512 RGBA.

## Visual semantics

- Victory: board/laurel/crown; table variants have exactly 2/3/4/5/6 investors
  in opposing, triangular, square, pentagonal and long-table arrangements.
- Team: linked partners jointly support the board. Four hands: one controller
  branches into two separate portfolios, rather than four independent players.
- Foundations: three separate building plinths. Mergers: a placement hand and
  arrow to the dark connecting tile; the three-chain variant adds a patterned
  third group converging on the placement.
- Trade: exactly six source certificates and three survivor certificates,
  with reciprocal exchange arrows (2:1 disposal, not optional stock swaps).
- Final sales: certificates flow to a checked settlement tray. Diversification
  instead joins three certificate types into one closing ledger. Luxury instead
  has one dominant stepped premium hotel with tall windows and an arched entrance,
  a separate board at upper right and a downward arrow into checked cash settlement.
  This architectural silhouette replaces the similar certificate stack after review;
  one hotel stands for Imperial OR Continental, never a requirement for both.
- Cash: closed ledger/counting tray versus open treasury with bundled notes.
  Threshold numerals are supplementary; no victory decoration on economic awards.

## Reproduction and checks

Use Python 3 with CairoSVG 2.8.2, Pillow 11.3.0, system Cairo and DejaVu Sans:

```sh
python3 scripts/generate-achievement-art.py
pnpm --filter acquire-engine test
pnpm --filter acquire-engine build
node scripts/test-achievement-art.mjs
pnpm --filter acquire-engine tsc
pnpm lint
pnpm --filter acquire-engine pack --pack-destination "$PWD/release/achievement-art"
```

For an extracted tarball, set `ACQUIRE_PACKED_WRAPPER` to its absolute
`file:///.../package/dist/wrapper.js` URL and rerun the art test with its runtime
seedrandom dependency installed. The test validates protocol schema, exact key
coverage, explicit game/version/revision and source-pictogram hash assertions,
asset hashes, full Pillow pixel decode/dimensions of all PNGs and contact sheets,
actual pictogram inclusion and byte-identical baseline definitions/evaluator.
Set `PYTHON` to the existing generator virtualenv's Python when running the Node
test if Pillow is not installed on the default `python3`. Existing 288 engine tests cover awards,
thresholds, team/four-hands ownership and engine regressions.

`contact-32.png`, `contact-48.png`, `contact-64.png` and `contact-160.png` show
actual rendered pixels, not browser CSS approximations. In each row the first
two images use light/dark backgrounds; the last two additionally apply circular
cropping. Author inspection is not independent publication approval.
