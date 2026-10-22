import assert from "node:assert/strict";
import { test } from "node:test";
import { placementEffect, tileLegality } from "./board.js";
import { allTiles } from "./tiles.js";
import { chainAt, row, t } from "./test/helpers.js";
import type { Cell } from "./types.js";

function boardOf(spec: Record<string, Exclude<Cell, null>>): Cell[] {
	const board: Cell[] = allTiles().map(() => null);
	for (const [label, cell] of Object.entries(spec)) {
		board[t(label)] = cell;
	}
	return board;
}

const SEVEN_CHAINS = {
	...chainAt("tower", ["1A", "2A"]),
	...chainAt("luxor", ["4A", "5A"]),
	...chainAt("worldwide", ["7A", "8A"]),
	...chainAt("american", ["10A", "11A"]),
	...chainAt("festival", ["1C", "2C"]),
	...chainAt("imperial", ["4C", "5C"]),
	...chainAt("continental", ["7C", "8C"]),
};

test("§5.1 a tile with no neighbours becomes loose", () => {
	assert.deepEqual(placementEffect(boardOf({ "1A": "loose" }), t("5E")), { kind: "loose" });
});

test("§5.1 a tile next to only loose tiles founds a chain", () => {
	assert.deepEqual(placementEffect(boardOf({ "5D": "loose" }), t("5E")), { kind: "found" });
});

test("§5.1 a tile next to one chain (and loose tiles) grows that chain", () => {
	const board = boardOf({ ...chainAt("tower", ["5C", "5D"]), "6E": "loose" });
	assert.deepEqual(placementEffect(board, t("5E")), { kind: "grow", chain: "tower" });
});

test("§5.1 a tile next to two different chains causes a merger", () => {
	const board = boardOf({ ...chainAt("tower", ["5C", "5D"]), ...chainAt("luxor", ["6E", "7E"]) });
	assert.deepEqual(placementEffect(board, t("5E")), { kind: "merge", chains: ["tower", "luxor"] });
});

test("§5.2 merging two safe chains is permanently unplayable", () => {
	const board = boardOf({ ...chainAt("tower", row("A", 1, 11)), ...chainAt("luxor", row("C", 1, 11)) });
	assert.equal(tileLegality(board, t("1B")), "permanentlyUnplayable");
});

test("§5.2 merging two safe chains is unplayable even when an open chain is also touched", () => {
	const board = boardOf({
		...chainAt("tower", row("A", 1, 11)),
		...chainAt("luxor", row("C", 1, 11)),
		...chainAt("festival", ["12B", "12C"]),
	});
	assert.equal(tileLegality(board, t("11B")), "permanentlyUnplayable");
});

test("§5.2 one safe chain may take over an open chain", () => {
	const board = boardOf({ ...chainAt("tower", row("A", 1, 11)), ...chainAt("luxor", row("C", 1, 10)) });
	assert.equal(tileLegality(board, t("1B")), "playable");
});

test("§5.2 founding while all 7 chains are active is temporarily unplayable", () => {
	const board = boardOf({ ...SEVEN_CHAINS, "1G": "loose" });
	assert.equal(tileLegality(board, t("1H")), "temporarilyUnplayable");
});

test("§5.2 a tile touching a chain is not blocked by the 7-chain rule, even if it touches loose tiles", () => {
	const board = boardOf({ ...SEVEN_CHAINS, "10C": "loose" });
	assert.equal(tileLegality(board, t("9C")), "playable");
});

test("§5.2 a tile with no neighbours is playable with all 7 chains active", () => {
	assert.equal(tileLegality(boardOf(SEVEN_CHAINS), t("10G")), "playable");
});

test("§5.2 legality is recomputed from the board: freeing a chain name makes the tile playable", () => {
	const board = boardOf({ ...SEVEN_CHAINS, "1G": "loose" });
	assert.equal(tileLegality(board, t("1H")), "temporarilyUnplayable");
	board[t("7C")] = null;
	board[t("8C")] = null;
	assert.equal(tileLegality(board, t("1H")), "playable");
});
