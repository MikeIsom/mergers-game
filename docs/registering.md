# Registering Acquire on boardgamers.space

How to publish the engine and viewer to BGS, following the BGS guide
(<https://docs.boardgamers.space/guide/adding-a-game.md>). You need BGS admin access, or an
admin token with the `gameinfo` grant for the command-line route.

Save the game private first (`public: false`) and play-test it there.

## 1. Build the two artifacts

Each GitHub Release has both attached. To build them yourself:

```bash
pnpm install
pnpm check
cd packages/engine && pnpm pack
```

| Artifact | File(s)                                                                                                    | BGS field                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Engine   | `packages/engine/acquire-engine-<version>.tgz` (contains `dist/` and `package.json` only)                  | `engine.package` (set by the upload), `engine.entryPoint: "dist/wrapper.js"`          |
| Viewer   | `packages/viewer/dist/acquire-viewer.iife.js`, `acquire-viewer.css`, optional `acquire-viewer.iife.js.map` | `viewer.url`, `viewer.dependencies.stylesheets`, `viewer.topLevelVariable: "acquire"` |

`pnpm check` rebuilds `packages/viewer/dist` from scratch, so upload that folder straight
after it. The engine's only runtime dependency is `seedrandom`, which BGS installs.

## 2. Register the game (admin panel)

In Boardgames, choose + New game and fill in:

- **Game id:** `acquire`; **version:** `1`.
- **Label:** `Acquire`.
- **Players:** `[2, 3, 4, 5, 6]`. Player counts are not a game option.
- **Options:** paste the declarations below.
- **Preferences:** none (`[]`). Chain letters and player names identify everything without relying on color.
- **Settings:** none.
- **Public:** off.

Save.

### Game options

These match rules.md §15 and the engine's option reader. Unticked checkboxes are not sent,
and selects are always sent as strings; the engine handles both, never rejects an option, and
logs any option that does not apply to the player count.

```json
[
	{
		"name": "publicHoldings",
		"label": "Public holdings (everyone sees all stock and cash)",
		"type": "checkbox",
		"default": false
	},
	{ "name": "teamPlay", "label": "Team play (4 players: seats 1+3 against 2+4)", "type": "checkbox", "default": false },
	{
		"name": "twoPlayerMode",
		"label": "Two-player mode",
		"type": "select",
		"default": "bank",
		"items": [
			{ "name": "bank", "label": "Bank as third shareholder" },
			{ "name": "fourHands", "label": "Four hands (each player controls two seats)" }
		]
	},
	{
		"name": "autoEnd",
		"label": "End automatically when an end condition is met",
		"type": "checkbox",
		"default": false
	},
	{
		"name": "endSize",
		"label": "Chain size that ends the game",
		"type": "select",
		"default": "41",
		"items": [
			{ "name": "41", "label": "41 tiles (standard)" },
			{ "name": "31", "label": "31 tiles (shorter game)" }
		]
	}
]
```

## 3. Upload the engine

In the version form, choose Upload .tgz… and pick `acquire-engine-<version>.tgz`. BGS reads the
package name and version from the tarball and sets `engine.package` itself. Then set
**entry point** to `dist/wrapper.js` and save.

BGS installs the engine within about a minute. `meta.replay` is set because the engine
exports `replay`; `meta.bots` stays off, as there is no bot.

## 4. Upload the viewer

Choose Upload bundle… and select `acquire-viewer.iife.js`, `acquire-viewer.css` and, if you want
source maps in devtools, `acquire-viewer.iife.js.map`, together. Then set:

- Top-level variable: `acquire` (the global `registerViewer` creates).
- Chat: on, with in-game controls always accessible (`integratedControls: ["chat"]`). The
  chat panel sits beside the log and is hidden in analysis mode.
- Replayable: on.
- Full screen on mobile: off. The layout is width-based and works at content height.
- Tutorials: copy `tutorial` from `docs/admin/gameinfo.json` (founding, mergers and scoring).
  All three are interactive and translated into the 17 viewer locales.

Save, open the game page, create a private game, and play.

## Command-line alternative

The same steps against the admin API, with a token from a platform admin (never commit it):

```bash
AUTH="Authorization: Bearer $BGS_ADMIN_TOKEN"
BASE=https://admin.boardgamers.space/api/admin/gameinfo/acquire

# Engine: the raw npm-pack tarball; this sets engine.package on version 1.
curl -X POST "$BASE/1/engine" -H "$AUTH" -H "Content-Type: application/octet-stream" \
	--data-binary @packages/engine/acquire-engine-0.0.1.tgz

# Viewer files: one POST each with a shared bundle id; each returns the hosted URL.
BUNDLE=acquire-$(git rev-parse --short HEAD)
JS_URL=$(curl -X POST "$BASE/1/viewer/file?filename=acquire-viewer.iife.js&bundle=$BUNDLE" -H "$AUTH" \
	-H "Content-Type: application/octet-stream" --data-binary @packages/viewer/dist/acquire-viewer.iife.js | jq -r .url)
CSS_URL=$(curl -X POST "$BASE/1/viewer/file?filename=acquire-viewer.css&bundle=$BUNDLE" -H "$AUTH" \
	-H "Content-Type: application/octet-stream" --data-binary @packages/viewer/dist/acquire-viewer.css | jq -r .url)

# Save the URLs, entry point and global name into the version doc.
curl "$BASE/1" -H "$AUTH" |
	jq --arg js "$JS_URL" --arg css "$CSS_URL" \
		'.viewer.url = $js | .viewer.dependencies.stylesheets = [$css] | .viewer.topLevelVariable = "acquire" | .engine.entryPoint = "dist/wrapper.js"' |
	curl -X PUT "$BASE/1" -H "$AUTH" -H "Content-Type: application/json" --data-binary @-
```

## Updating later

Bump `packages/engine/package.json`'s version and upload the new tarball to the **same**
version integer: ongoing games pick up the new engine within about a minute. A new version
integer only affects new games. Upload the engine and viewer together whenever the move or
state format changes, since they are coupled.

## Before making a version public

BGS's release checklist, and where this repo stands:

- Protocol: core, chat, replay, preferences and avatar handlers are implemented.
- Replays and analysis: the engine exports `replay`, and the viewer's replay controls rebuild
  each position from the public log. Analysis of ongoing games stays off.
- Mobile: phone portrait and landscape, tablet and desktop, both themes, 44px touch targets.
- History: no tentative or revisable moves.
- Color accessibility: chain letters and player names are always visible; no separate mode is needed.
- Languages: the viewer is translated into all 17 BGS locales. The game list's last-move text
  comes from the English `simple` line that `logSlice` adds to each log entry.
- Admin panel content (rules page, pictogram, credits, description, links, screenshots) is in
  `docs/admin/`; its README says where each file goes.

The October 2026 private-beta audit is in [admin/release-check.md](admin/release-check.md).
