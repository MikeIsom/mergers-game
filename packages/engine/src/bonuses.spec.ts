import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBonuses } from "./bonuses.js";

test("§10 single holder receives both the majority and minority bonus", () => {
	assert.deepEqual(computeBonuses([0, 5, 0], 4000, 2000), [0, 6000, 0]);
});

test("§10 clear first and clear second", () => {
	assert.deepEqual(computeBonuses([5, 3, 1], 4000, 2000), [4000, 2000, 0]);
});

test("§10 tie for first: both bonuses are added and split; nobody else gets a minority bonus", () => {
	assert.deepEqual(computeBonuses([5, 5, 1], 4000, 2000), [3000, 3000, 0]);
	assert.deepEqual(computeBonuses([4, 4, 4], 3000, 1500), [1500, 1500, 1500]);
});

test("§10 clear first, tie for second: the minority bonus is split among the tied players", () => {
	assert.deepEqual(computeBonuses([6, 2, 2], 6000, 3000), [6000, 1500, 1500]);
});

test("§10 rounding: a split first-place bonus is rounded up to the next $100", () => {
	assert.deepEqual(computeBonuses([3, 3], 3000, 1500), [2300, 2300]);
	assert.deepEqual(computeBonuses([2, 2, 2, 2], 7000, 3500), [2700, 2700, 2700, 2700]);
});

test("§10 rounding: a split second-place bonus is also rounded up to the next $100", () => {
	assert.deepEqual(computeBonuses([6, 2, 2], 3000, 1500), [3000, 800, 800]);
	assert.deepEqual(computeBonuses([9, 1, 1, 1], 5000, 2500), [5000, 900, 900, 900]);
});

test("§10 players with zero shares never receive a bonus", () => {
	assert.deepEqual(computeBonuses([0, 0, 0], 2000, 1000), [0, 0, 0]);
	assert.deepEqual(computeBonuses([0, 4, 0, 2], 2000, 1000), [0, 2000, 0, 1000]);
});
