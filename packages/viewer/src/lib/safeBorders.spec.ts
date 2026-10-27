import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTile, TILE_COUNT, type Cell } from "acquire-engine";
import { safeBorders } from "./safeBorders.ts";

test("safe borders appear at 11 tiles, omit interior seams, and disappear when a position is restored", () => {
	const board: Cell[] = Array(TILE_COUNT).fill(null);
	for (let column = 1; column <= 10; column++) {
		board[parseTile(`${column}A`)!] = "tower";
	}
	assert.deepEqual(safeBorders(board), []);
	board[parseTile("11A")!] = "tower";
	const [outline] = safeBorders(board);
	assert.equal(outline!.chain, "tower");
	assert.equal(outline!.path.split(" ").length, 24, "an 11 × 1 footprint has 24 exterior unit edges");
	assert.deepEqual(
		outline!.path.split(" ").filter((edge) => edge.endsWith("v1")),
		["M0,0v1", "M11,0v1"]
	);
	board[parseTile("11A")!] = null;
	assert.deepEqual(safeBorders(board), []);
});

test("safe borders follow concave edges and enclosed gaps at the bottom-right board boundary", () => {
	const board: Cell[] = Array(TILE_COUNT).fill(null);
	for (let x = 8; x < 12; x++) {
		for (let y = 5; y < 9; y++) {
			if (x === 8 || x === 11 || y === 5 || y === 8) {
				board[x * 9 + y] = "continental";
			}
		}
	}
	board[parseTile("1A")!] = "luxor";
	const borders = safeBorders(board);
	assert.equal(borders.length, 1);
	const edges = borders[0]!.path.split(" ");
	assert.equal(edges.length, 24, "16 exterior edges plus 8 around the empty centre");
	for (const edge of ["M12,8v1", "M11,9h1", "M9,6h1", "M9,6v1", "M11,7v1", "M10,8h1"]) {
		assert.ok(edges.includes(edge), edge);
	}
});
