import assert from "node:assert/strict";
import { test } from "node:test";
import { chainsInTier, priceTable, rangeLabel, rowIndexFor } from "./priceTable.ts";

// rules.md §8, transcribed: minor sizes, medium sizes, major sizes, price, 1st bonus, 2nd bonus.
const RULES_TABLE = [
	["2", "—", "—", 200, 2000, 1000],
	["3", "2", "—", 300, 3000, 1500],
	["4", "3", "2", 400, 4000, 2000],
	["5", "4", "3", 500, 5000, 2500],
	["6–10", "5", "4", 600, 6000, 3000],
	["11–20", "6–10", "5", 700, 7000, 3500],
	["21–30", "11–20", "6–10", 800, 8000, 4000],
	["31–40", "21–30", "11–20", 900, 9000, 4500],
	["41+", "31–40", "21–30", 1000, 10000, 5000],
	["—", "41+", "31–40", 1100, 11000, 5500],
	["—", "—", "41+", 1200, 12000, 6000],
];

test("§8 the generated price table matches the rules table row for row", () => {
	const generated = priceTable().map((row) => [
		rangeLabel(row.sizes.minor),
		rangeLabel(row.sizes.medium),
		rangeLabel(row.sizes.major),
		row.price,
		row.first,
		row.second,
	]);
	assert.deepEqual(generated, RULES_TABLE);
});

test("§8 tier columns are headed by the chains of that tier", () => {
	assert.deepEqual(chainsInTier("minor"), ["tower", "luxor"]);
	assert.deepEqual(chainsInTier("medium"), ["worldwide", "american", "festival"]);
	assert.deepEqual(chainsInTier("major"), ["imperial", "continental"]);
});

test("a chain's current size is marked in the right row", () => {
	const table = priceTable();
	assert.equal(table[rowIndexFor(table, "minor", 7)]!.price, 600);
	assert.equal(table[rowIndexFor(table, "medium", 11)]!.price, 800);
	assert.equal(table[rowIndexFor(table, "major", 2)]!.price, 400);
	assert.equal(table[rowIndexFor(table, "major", 60)]!.price, 1200);
});
