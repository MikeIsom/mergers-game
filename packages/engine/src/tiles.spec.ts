import assert from "node:assert/strict";
import { test } from "node:test";
import { allTiles, neighbours, parseTile, sortTiles, tileLabel } from "./tiles.js";

test("§1 board has 108 squares from 1A to 12I, each with a unique label", () => {
	const labels = allTiles().map(tileLabel);
	assert.equal(labels.length, 108);
	assert.equal(new Set(labels).size, 108);
	assert.equal(labels[0], "1A");
	assert.equal(labels.at(-1), "12I");
	for (const label of labels) {
		assert.equal(tileLabel(parseTile(label)!), label);
	}
});

test("§1 malformed tile labels are rejected", () => {
	for (const bad of ["", "0A", "13A", "1J", "A1", "1a", "01A", 5, null, undefined]) {
		assert.equal(parseTile(bad), undefined, String(bad));
	}
});

test("§2 adjacency is edge-sharing only, never diagonal", () => {
	const label = (tiles: number[]) => sortTiles(tiles).map(tileLabel);
	assert.deepEqual(label(neighbours(parseTile("5E")!)), ["4E", "5D", "5F", "6E"]);
	assert.deepEqual(label(neighbours(parseTile("1A")!)), ["1B", "2A"]);
	assert.deepEqual(label(neighbours(parseTile("12I")!)), ["11I", "12H"]);
	assert.deepEqual(label(neighbours(parseTile("1I")!)), ["1H", "2I"]);
});

test("§3.3 tile order compares number first, then letter", () => {
	const order = ["2B", "2E", "3A", "10A", "1I"].map((l) => parseTile(l)!);
	assert.deepEqual(sortTiles(order).map(tileLabel), ["1I", "2B", "2E", "3A", "10A"]);
});
