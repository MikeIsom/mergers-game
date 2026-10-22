# Admin panel content

Everything to paste or upload in the BGS admin panel for Acquire. All text is our own wording;
nothing is taken from any published edition's rulebook, card or box.

| File                             | Where it goes                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [description.md](description.md) | Game metadata → **description** (Markdown).                                                                                                                                                           |
| [rules.md](rules.md)             | Game metadata → **rules** (Markdown; the boardgame page's "See rules" toggle). The BGS guide also mentions a CMS page `acquire:rules`; if the admin panel still uses that, paste the same text there. |
| [credits.md](credits.md)         | Game metadata → **credits** (Markdown).                                                                                                                                                               |
| [pictogram.svg](pictogram.svg)   | Pictogram upload: transparent background, tight bounds, square corners. Export to PNG at the size the panel asks for if it does not take SVG.                                                         |
| [screenshots/](screenshots)      | Screenshot gallery, in the order below.                                                                                                                                                               |

Description, rules and credits are English. BGS stores per-language overlays for these three
fields (the admin panel can translate them); the viewer itself is already translated.

## Links

- **bgg:** https://boardgamegeek.com/boardgame/5/acquire
- **source:** https://github.com/MikeIsom/mergers-game
- **publisher / purchase:** Renegade Game Studios' Acquire page, if you want one. Optional.

## Tags

The BGS guide says to pick tags from a shared list (`packages/models/boardgame-tags.ts`), but that
file and a tags field don't exist in the BGS repository yet. Suggested tags for when they do:
**economic**, **stock holding**, **tile placement**, **area majority**, **classic**, **family**.

## Screenshots

Captured from the dev page with a fixed seed (`seed=bgs`, 4 players, public holdings) at 2× scale.
Upload each light image and add the dark one with **Add dark version**.

| Order | Light              | Dark              | Caption                                                                    |
| ----- | ------------------ | ----------------- | -------------------------------------------------------------------------- |
| 1     | overview-light.png | overview-dark.png | Hotel chains grow across the board; Continental is already safe.           |
| 2     | merger-light.png   | merger-dark.png   | A merger: sell, trade 2 for 1 or keep your shares of the chain taken over. |
| 3     | phone-light.png    | phone-dark.png    | The same decision on a phone.                                              |

To recreate them, run the viewer dev server and open, for example,
`http://localhost:5173/?players=4&seed=bgs&publicHoldings=1&bar=0&theme=dark&moves=50&merger=1`
in a 1280 × 860 window (390 × 844 for the phone view).
