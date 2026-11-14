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
