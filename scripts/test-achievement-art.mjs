import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { achievementManifestSchema } from "../packages/engine/node_modules/@boardgamers/protocol/dist/achievements.js";
const root = new URL("../", import.meta.url);
const art = new URL("docs/admin/achievement-art/", root);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", art)));
const { achievementDefinitions } = await import(
	process.env.ACQUIRE_PACKED_WRAPPER || "../packages/engine/dist/wrapper.js"
);
const defs = achievementDefinitions();
achievementManifestSchema.parse(defs);
assert.equal(defs.revision, 2);
assert.equal(manifest.game, "acquire");
assert.equal(manifest.engineVersion, "0.0.10");
assert.equal(manifest.engineVersion, JSON.parse(readFileSync(new URL("packages/engine/package.json", root))).version);
assert.equal(manifest.revision, 2);
assert.equal(manifest.revision, defs.revision);
assert.equal(manifest.pictogram.path, "docs/admin/pictogram.svg");
assert.equal(
	manifest.pictogram.sha256,
	createHash("sha256")
		.update(readFileSync(new URL(manifest.pictogram.path, root)))
		.digest("hex")
);
// Pillow is already a generator dependency. load() decodes every pixel, unlike
// reading IHDR dimensions (or Pillow verify(), which only validates structure).
execFileSync(
	process.env.PYTHON || "python3",
	[
		"-c",
		`
import json, sys
from pathlib import Path
from PIL import Image
root = Path(sys.argv[1])
manifest = json.loads((root / 'manifest.json').read_text())
for asset in manifest['assets']:
    with Image.open(root / asset['png']) as image:
        assert image.format == 'PNG'
        image.load()
        assert image.size == (512, 512)
        assert image.mode == 'RGBA'
for size in [32, 48, 64, 160]:
    with Image.open(root / f'contact-{size}.png') as image:
        assert image.format == 'PNG'
        image.load()
        assert image.size == (1000, 17 * (size + 18))
`,
		art.pathname,
	],
	{ stdio: "inherit" }
);
assert.equal(manifest.assets.length, 17);
assert.deepEqual(defs.achievements.map((a) => a.id).sort(), manifest.assets.map((a) => a.id).sort());
const hashes = new Set();
for (const a of manifest.assets) {
	assert.deepEqual(defs.achievements.find((d) => d.id === a.id).icon, { type: "asset", key: a.key });
	for (const ext of ["svg", "png"]) {
		const data = readFileSync(new URL(a[ext], art));
		assert.equal(createHash("sha256").update(data).digest("hex"), a[ext + "Sha256"]);
		if (ext === "svg") {
			assert.match(data.toString(), /data-pictogram="actual"/);
			const pictogram = readFileSync(new URL("docs/admin/pictogram.svg", root), "utf8");
			assert.ok(data.toString().includes(pictogram.slice(pictogram.indexOf("<rect"), pictogram.lastIndexOf("</svg>"))));
		} else {
			assert.equal(data.readUInt32BE(16), 512);
			assert.equal(data.readUInt32BE(20), 512);
			hashes.add(a.pngSha256);
		}
	}
}
assert.equal(hashes.size, 17);
const baseline = execFileSync(
	"git",
	["show", "f7346b5615dcc63f04bf3f858741f8de6a37ad29:packages/engine/src/achievements.ts"],
	{ cwd: root, encoding: "utf8" }
);
const current = readFileSync(new URL("packages/engine/src/achievements.ts", root), "utf8");
assert.equal(current.split("/** Pure projection")[1], baseline.split("/** Pure projection")[1]);
assert.equal(current.split("\treturn {")[0], baseline.split("\treturn {")[0]);
console.log(
	"17 assets: hashes, dimensions, pictogram geometry, exact references, stable definitions and unchanged evaluator verified"
);
