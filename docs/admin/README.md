# Admin panel content

Everything to paste or upload in the BGS admin panel for Acquire. All text is our own wording;
nothing is taken from any published edition's rulebook, card or box.

| File                             | Where it goes                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [description.md](description.md) | Game metadata → **description** (Markdown).                                                                                                   |
| [rules.md](rules.md)             | CMS page `acquire:rules` (English); set the metadata rules field to `[Rules](/page/acquire:rules)`.                                           |
| [credits.md](credits.md)         | Game metadata → **credits** (Markdown).                                                                                                       |
| [pictogram.svg](pictogram.svg)   | Pictogram upload: transparent background, tight bounds, square corners. Export to PNG at the size the panel asks for if it does not take SVG. |
| `release/qa/*-{light,dark}.png`  | Regenerate the screenshot gallery with `pnpm test:browser`, in the order below.                                                               |

Description, rules and credits are English. BGS stores per-language overlays for these three
fields (the admin panel can translate them); the viewer itself is already translated.

## Links

- **bgg:** https://boardgamegeek.com/boardgame/5/acquire
- **source:** https://github.com/boardgamers/mergers-game
- **publisher / purchase:** https://renegadegamestudios.com/acquire/

## Tags

Use **economic**, **tile placement** and **stock holding** from BGS’s shared tag list.

## Screenshots

Run `pnpm test:browser` to capture the built viewer with a fixed seed (`seed=bgs`, 4 players,
public holdings). The current images are written to `release/qa/`; the older tracked files in
`screenshots/` are not the release captures. Upload each light image and add the dark one with
**Add dark version**.

| Order | Light              | Dark              | Caption                                                                    |
| ----- | ------------------ | ----------------- | -------------------------------------------------------------------------- |
| 1     | overview-light.png | overview-dark.png | Hotel chains grow across the board; Continental is already safe.           |
| 2     | merger-light.png   | merger-dark.png   | A merger: sell, trade 2 for 1 or keep your shares of the chain taken over. |
| 3     | phone-light.png    | phone-dark.png    | The same decision on a phone.                                              |

Desktop captures frame the whole compact game at 1280 pixels wide. Phone captures are 390
pixels wide and include the complete decision, board and hand. Do not use full-page phone
screenshots: the supporting tables and expanded history make an unreadably tall gallery image.
The browser checks enforce maximum capture heights and verify the desktop panel arrangement.

## Live configuration and updates

Acquire is **public** on BGS as `acquire`, version `1` (verified 27 October 2026).
Preserve its current visibility when updating.

`gameinfo.json` is the initial-registration template and the source for individual option,
preference and tutorial declarations. Its `public: false` and empty engine/viewer URLs are
intentional bootstrap defaults, not instructions for the live game. Never upload the whole
file over the current configuration. Fetch live metadata and merge only the intended changes.

Follow [the publishing guide](../registering.md) for engine and viewer uploads, CMS updates,
verification and deployment records. See [release-check.md](release-check.md) for validation
and remaining work, and [AGENTS.md](../../AGENTS.md) for agent instructions.
