import assert from "node:assert/strict";
import { test } from "node:test";
import * as wrapper from "../wrapper.js";
import { applyMove } from "./moves.js";
import { projectedNetWorth } from "./net-worth.js";
import { endGame } from "./scoring.js";
import { chainAt, row, scenario } from "./test/helpers.js";

const publicHoldings = { publicHoldings: true };
const total = (state: Parameters<typeof projectedNetWorth>[0]) => projectedNetWorth(state)!.map((seat) => seat.total);

test("public net worth includes cash, active shares and bonuses and matches actual final settlement", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["12I"], ["11I"], ["10I"]],
		shares: [{ tower: 4, festival: 6 }, { tower: 2 }, { tower: 1 }],
		options: publicHoldings,
	});
	const before = structuredClone(state);
	assert.deepEqual(projectedNetWorth(state), [
		{ cash: 6000, stock: 2800, bonuses: 7000, total: 15800 },
		{ cash: 6000, stock: 1400, bonuses: 3500, total: 10900 },
		{ cash: 6000, stock: 700, bonuses: 0, total: 6700 },
	]);
	assert.deepEqual(wrapper.scores(state), [15800, 10900, 6700]);
	assert.deepEqual(projectedNetWorth(wrapper.stripSecret(state)), projectedNetWorth(state));
	assert.deepEqual(state, before, "valuation does not change cash, RNG, log, or any saved state");
	endGame(state, "announced");
	assert.deepEqual(wrapper.scores(state), [15800, 10900, 6700]);
	assert.ok(projectedNetWorth(state)!.every((seat) => seat.stock === 0 && seat.bonuses === 0));
});

test("projected shareholder bonuses preserve majority/minority ties, rounding and sole holders", () => {
	for (const [holdings, bonuses] of [
		[
			[3, 3, 3],
			[1500, 1500, 1500],
		],
		[
			[3, 1, 1],
			[3000, 800, 800],
		],
		[
			[3, 0, 0],
			[4500, 0, 0],
		],
	] as const) {
		const state = scenario({
			board: chainAt("tower", row("A", 1, 3)),
			hands: [["12I"], ["11I"], ["10I"]],
			shares: holdings.map((tower) => ({ tower })),
			options: publicHoldings,
		});
		assert.deepEqual(
			projectedNetWorth(state)!.map((seat) => seat.bonuses),
			bonuses
		);
		const expected = total(state);
		endGame(state, "announced");
		assert.deepEqual(
			state.seats.map((seat) => seat.cash),
			expected
		);
	}
});

test("private or masked holdings cannot reveal net worth through helpers or public BGS scores", () => {
	const state = scenario({ shares: [{ tower: 5 }], hands: [["12I"], ["11I"], ["10I"]] });
	assert.equal(projectedNetWorth(state), undefined);
	assert.equal(projectedNetWorth(wrapper.stripSecret(state, 0)), undefined);
	assert.deepEqual(wrapper.scores(state), [0, 0, 0]);
	const masked = wrapper.stripSecret(state, 0);
	masked.options.publicHoldings = true;
	assert.equal(projectedNetWorth(masked), undefined);
	assert.deepEqual(wrapper.scores(masked), [0, 0, 0]);
	state.options.publicHoldings = true;
	assert.deepEqual(total(state), [6000, 6000, 6000], "inactive shares have no liquidation value");
});

test("bank-mode forecasts omit uncertain bonuses and are independent of secret hands and draws", () => {
	const state = scenario({
		seats: 2,
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["12I"], ["11I"]],
		shares: [{ tower: 7 }, { tower: 3 }],
		options: publicHoldings,
	});
	assert.deepEqual(total(state), [7400, 6600]);
	assert.ok(projectedNetWorth(state)!.every((seat) => seat.bonuses === 0));
	const masked = wrapper.stripSecret(state);
	assert.deepEqual(wrapper.scores(masked), wrapper.scores(state));
	state.pool.reverse();
	state.seed = "different secret";
	assert.deepEqual(wrapper.scores(state), [7400, 6600]);
});

test("merger estimates avoid double-paid bonuses and stop valuing kept defunct shares after disposal", () => {
	const state = scenario({
		board: { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) },
		hands: [["4A"], ["11I"], ["10I"]],
		shares: [{ tower: 2, luxor: 3 }, { tower: 1, luxor: 2 }, { luxor: 1 }],
		options: publicHoldings,
	});
	applyMove(state, { type: "place", tile: "4A" }, 0);
	assert.deepEqual(projectedNetWorth(state), [
		{ cash: 8000, stock: 1800, bonuses: 6000, total: 15800 },
		{ cash: 7000, stock: 1000, bonuses: 3000, total: 11000 },
		{ cash: 6000, stock: 200, bonuses: 0, total: 6200 },
	]);
	applyMove(state, { type: "dispose", sell: 0, trade: 0 }, 0);
	assert.deepEqual(total(state), [15200, 11000, 6200]);
	applyMove(state, { type: "dispose", sell: 2, trade: 0 }, 1);
	assert.deepEqual(total(state), [15200, 11000, 6200]);
	applyMove(state, { type: "dispose", sell: 0, trade: 0 }, 2);
	assert.equal(state.merger, null);
	assert.deepEqual(total(state), [15200, 11000, 6000]);
});

test("multi-chain estimates include outstanding bonuses once through order selection and each disposal", () => {
	const state = scenario({
		board: {
			...chainAt("tower", ["1D", "2D", "3D", "3C"]),
			...chainAt("luxor", ["4B", "4C"]),
			...chainAt("festival", ["4E", "4F"]),
		},
		hands: [["4D"], ["11I"], ["10I"]],
		shares: [{ tower: 1, luxor: 1, festival: 1 }],
		options: publicHoldings,
	});
	applyMove(state, { type: "place", tile: "4D" }, 0);
	assert.equal(state.phase, "defunctOrder");
	const estimate = total(state);
	applyMove(state, { type: "defunctOrder", chains: ["luxor", "festival"] }, 0);
	assert.deepEqual(total(state), estimate);
	applyMove(state, { type: "dispose", sell: 1, trade: 0 }, 0);
	assert.deepEqual(total(state), estimate);
	applyMove(state, { type: "dispose", sell: 1, trade: 0 }, 0);
	assert.equal(state.merger, null);
	assert.deepEqual(total(state), estimate);
});

test("public BGS forecasts use the team's combined value or the richest seat in four-hands", () => {
	const teams = scenario({
		seats: 4,
		hands: [["12I"], ["11I"], ["10I"], ["9I"]],
		cash: [5000, 4000, 2000, 7000],
		options: { ...publicHoldings, teamPlay: true },
	});
	assert.deepEqual(wrapper.scores(teams), [7000, 11000, 7000, 11000]);
	const four = scenario({
		hands: [["12I"], ["11I"], ["10I"], ["9I"]],
		cash: [9000, 8000, 1000, 8500],
		options: { ...publicHoldings, twoPlayerMode: "fourHands" },
	});
	assert.deepEqual(wrapper.scores(four), [9000, 8500]);
});
