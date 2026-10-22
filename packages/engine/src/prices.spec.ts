import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChainId } from "./config.js";
import { majorityBonus, minorityBonus, sharePrice } from "./prices.js";

// rules.md §8, transcribed row by row: [minor sizes, medium sizes, major sizes, price, 1st, 2nd].
type Band = [number, number] | null;
const TABLE: [Band, Band, Band, number, number, number][] = [
	[[2, 2], null, null, 200, 2000, 1000],
	[[3, 3], [2, 2], null, 300, 3000, 1500],
	[[4, 4], [3, 3], [2, 2], 400, 4000, 2000],
	[[5, 5], [4, 4], [3, 3], 500, 5000, 2500],
	[[6, 10], [5, 5], [4, 4], 600, 6000, 3000],
	[[11, 20], [6, 10], [5, 5], 700, 7000, 3500],
	[[21, 30], [11, 20], [6, 10], 800, 8000, 4000],
	[[31, 40], [21, 30], [11, 20], 900, 9000, 4500],
	[[41, 108], [31, 40], [21, 30], 1000, 10000, 5000],
	[null, [41, 108], [31, 40], 1100, 11000, 5500],
	[null, null, [41, 108], 1200, 12000, 6000],
];

const TIER_CHAINS: ChainId[][] = [
	["tower", "luxor"],
	["worldwide", "american", "festival"],
	["imperial", "continental"],
];

TABLE.forEach((row, index) => {
	const [, , , price, first, second] = row;
	test(`§8 price table row ${index + 1}: $${price} share, $${first} / $${second} bonuses`, () => {
		for (let tier = 0; tier < 3; tier++) {
			const band = row[tier] as Band;
			if (!band) {
				continue;
			}
			for (let size = band[0]; size <= band[1]; size++) {
				for (const chain of TIER_CHAINS[tier]!) {
					assert.equal(sharePrice(chain, size), price, `${chain} size ${size} price`);
					assert.equal(majorityBonus(chain, size), first, `${chain} size ${size} 1st bonus`);
					assert.equal(minorityBonus(chain, size), second, `${chain} size ${size} 2nd bonus`);
				}
			}
		}
	});
});

test("§8 every chain size from 2 to 108 is covered by exactly one table row per tier", () => {
	for (let tier = 0; tier < 3; tier++) {
		for (let size = 2; size <= 108; size++) {
			const rows = TABLE.filter((row) => {
				const band = row[tier] as Band;
				return band !== null && size >= band[0] && size <= band[1];
			});
			assert.equal(rows.length, 1, `tier ${tier} size ${size}`);
		}
	}
});

test("§8 prices are not defined below chain size 2", () => {
	assert.throws(() => sharePrice("tower", 1));
});
