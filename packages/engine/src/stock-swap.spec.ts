import assert from "node:assert/strict";
import { test } from "node:test";
import * as wrapper from "../wrapper.js";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat } from "./moves.js";
import { normalizeOptions } from "./options.js";
import { positionAt } from "./position.js";
import { initGame } from "./setup.js";
import { maxStockSwap, stockSwapCost, stockSwapsRemaining } from "./stock-swap.js";
import { buyStepAvailable } from "./turn.js";
import { chainAt, checkInvariants, row, scenario } from "./test/helpers.js";
import type { Move } from "./types.js";

const exchange: Move = { type: "swap", from: "tower", to: "continental", count: 2 };
const buy: Move = { type: "buy", shares: {} };
function position(limit: unknown = "3") {
	const state = scenario({
		board: { ...chainAt("tower", row("A", 1, 3)), ...chainAt("continental", row("E", 1, 5)) },
		hands: [["12I"], ["11I"], ["10I"]],
		shares: [{ tower: 10, continental: 5 }],
		options: { stockSwap: limit },
	});
	applyMove(state, { type: "place", tile: "12I" }, 0);
	return state;
}

test("stock swap defaults off, accepts all five settings and preserves historical option shape", () => {
	for (const raw of [undefined, "off"]) {
		const { options, ignored } = normalizeOptions(3, raw === undefined ? {} : { stockSwap: raw });
		assert.equal("stockSwap" in options, false);
		assert.deepEqual(ignored, []);
		assert.equal(
			legalMoves(position(raw ?? "off")).some((m) => m.type === "swap"),
			false
		);
	}
	for (const raw of [3, 5, 7, "3", "5", "7", "unlimited"]) {
		assert.equal(normalizeOptions(3, { stockSwap: raw }).options.stockSwap, raw === "unlimited" ? raw : Number(raw));
	}
	for (const stockSwap of [null, true, 0, 4, -1, [], {}, "Infinity", "3.0"]) {
		const { options, ignored } = normalizeOptions(3, { stockSwap });
		assert.equal(options.stockSwap, undefined);
		assert.equal(ignored.length, 1);
	}
	const old = initGame(3, {}, "before-swaps");
	assert.deepEqual(wrapper.replay(old), old);
});

test("one-for-one swaps pay or receive the current price difference and preserve all stock", () => {
	const state = position("unlimited");
	assert.equal(stockSwapCost(state, "tower", "continental", 2), 800);
	applyMove(state, exchange, 0);
	assert.equal(state.seats[0]!.cash, 5200);
	assert.equal(state.seats[0]!.shares.tower, 8);
	assert.equal(state.seats[0]!.shares.continental, 7);
	assert.equal(state.bank.tower, 17);
	assert.equal(state.bank.continental, 18);
	applyMove(state, { type: "swap", from: "continental", to: "tower", count: 2 }, 0);
	assert.equal(state.seats[0]!.cash, 6000);
	assert.equal(state.seats[0]!.shares.tower, 10);
	assert.equal(state.seats[0]!.shares.continental, 5);
	checkInvariants(state);
	const equal = scenario({
		board: { ...chainAt("tower", row("A", 1, 3)), ...chainAt("luxor", row("E", 1, 3)) },
		hands: [["12I"]],
		shares: [{ tower: 1 }],
		options: { stockSwap: 3 },
	});
	applyMove(equal, { type: "place", tile: "12I" }, 0);
	applyMove(equal, { type: "swap", from: "tower", to: "luxor", count: 1 }, 0);
	assert.equal(equal.seats[0]!.cash, 6000);
	checkInvariants(equal);
});

test("the shared 3/5/7 allowance counts only outgoing shares and buying three remains separate", () => {
	for (const limit of [3, 5, 7]) {
		const state = position(limit);
		applyMove(state, exchange, 0);
		assert.equal(stockSwapsRemaining(state), limit - 2);
		applyMove(state, { type: "swap", from: "continental", to: "tower", count: limit - 2 }, 0);
		assert.equal(stockSwapsRemaining(state), 0);
		assert.equal(
			legalMoves(state).some((m) => m.type === "swap"),
			false
		);
		assert.throws(() => applyMove(state, exchange, 0));
		applyMove(state, { type: "buy", shares: { tower: 3 } }, 0);
		assert.equal(stockSwapsRemaining(state), limit, "allowance resets for the next seat");
		checkInvariants(state);
	}
});

test("invalid swaps are rejected atomically: wrong seat/phase, inactive chain, funds, stock and malformed counts", () => {
	const base = position();
	for (const patch of [
		{ count: 0 },
		{ count: -1 },
		{ count: 1.5 },
		{ count: "2" },
		{ count: Infinity },
		{ count: 4 },
		{ from: "continental", to: "continental" },
		{ from: "missing" },
		{ to: "luxor" },
	]) {
		const before = structuredClone(base);
		assert.throws(() => applyMove(base, { ...exchange, ...patch }, 0));
		assert.deepEqual(base, before);
	}
	assert.throws(() => applyMove(base, exchange, 1), /not your turn/);
	for (const phase of ["place", "found", "survivor", "defunctOrder"] as const) {
		const state = { ...structuredClone(base), phase };
		assert.throws(() => applyMove(state, exchange, 0));
	}
	base.seats[0]!.cash = 700;
	assert.equal(maxStockSwap(base, "tower", "continental"), 1);
	assert.throws(() => applyMove(base, exchange, 0));
	base.seats[0]!.cash = 6000;
	base.bank.continental = 1;
	assert.equal(maxStockSwap(base, "tower", "continental"), 1);
	base.bank.continental = 20;
	base.seats[0]!.shares.tower = 1;
	assert.equal(maxStockSwap(base, "tower", "continental"), 1);
	base.options.stockSwap = undefined;
	assert.throws(() => applyMove(base, exchange, 0));
});

test("buying is not auto-skipped when swaps can release cash, regardless of hidden holdings", () => {
	for (const publicHoldings of [false, true]) {
		const state = position();
		state.options.publicHoldings = publicHoldings;
		state.seats[0]!.cash = 0;
		assert.equal(buyStepAvailable(state), true);
		assert.equal(maxStockSwap(state, "continental", "tower"), 3);
		applyMove(state, { type: "swap", from: "continental", to: "tower", count: 3 }, 0);
		assert.equal(state.seats[0]!.cash, 1200);
		applyMove(state, { type: "buy", shares: { tower: 3 } }, 0);
		assert.equal(state.seats[0]!.cash, 300);
		checkInvariants(state);
	}
	const state = position();
	state.seats[0]!.cash = 0;
	state.seats[0]!.shares.tower = state.seats[0]!.shares.continental = 0;
	assert.equal(buyStepAvailable(state), true, "auto-skip does not expose secret holdings");
});

test("swaps wait for the entire merger and use the survivor's grown price", () => {
	const state = scenario({
		board: {
			...chainAt("tower", ["1A", "2A", "3A"]),
			...chainAt("luxor", ["5A", "6A"]),
			...chainAt("continental", ["1E", "2E"]),
		},
		hands: [["4A"], ["11I"], ["10I"]],
		shares: [{ tower: 2, luxor: 1 }, { luxor: 1 }],
		options: { stockSwap: 3 },
	});
	applyMove(state, { type: "place", tile: "4A" }, 0);
	assert.equal(state.phase, "dispose");
	assert.throws(() => applyMove(state, { ...exchange, count: 1 }, 0));
	applyMove(state, { type: "dispose", sell: 1, trade: 0 }, 0);
	applyMove(state, { type: "dispose", sell: 1, trade: 0 }, 1);
	assert.equal(state.phase, "buy");
	assert.equal(stockSwapCost(state, "tower", "continental", 1), -200);
	const cash = state.seats[0]!.cash;
	applyMove(state, { ...exchange, count: 1 }, 0);
	assert.equal(state.seats[0]!.cash, cash + 200);
	checkInvariants(state);
});

test("swap revisions and unlimited sequences stay private; only the final turn adds history and one increment", () => {
	const base = position("unlimited");
	const original = structuredClone(base);
	for (let i = 0; i < 20; i++) {
		const preview = wrapper.move(
			base,
			{ type: "turn", from: base.log.length, moves: [{ ...exchange, count: (i % 2) + 1 }] },
			0
		);
		assert.equal(wrapper.toSave(preview), undefined);
		assert.deepEqual(wrapper.timeIncrements(preview), [0, 0, 0]);
		assert.equal(wrapper.logSlice(preview, { player: 1 }).preview, undefined);
		assert.equal(wrapper.stripSecret(preview, 0).seats[1]!.cash, -1);
	}
	assert.deepEqual(base, original);
	const swaps: Move[] = Array.from({ length: 24 }, (_, i) => ({
		type: "swap",
		from: i % 2 ? "continental" : "tower",
		to: i % 2 ? "tower" : "continental",
		count: 1,
	}));
	const saved = wrapper.move(base, { type: "turn", from: base.log.length, moves: [...swaps, buy] }, 0);
	assert.equal(wrapper.toSave(saved), saved);
	assert.equal(saved.log.filter((e) => e.type === "swapped").length, 24);
	assert.deepEqual(wrapper.timeIncrements(saved), [1, 0, 0]);
	assert.equal(saved.seats[0]!.cash, 6000);
	checkInvariants(saved);
});

test("real seeded games with swaps replay identically, including public stock/cash reconstruction", () => {
	for (const options of [{ stockSwap: "3" }, { stockSwap: "unlimited", twoPlayerMode: "fourHands" }, {}]) {
		const state = initGame(options.twoPlayerMode ? 2 : 3, options, "swap-replay");
		let exchanged = 0;
		for (let i = 0; i < 180 && !state.ended; i++) {
			const moves = legalMoves(state);
			const swap = moves.find((m) => m.type === "swap");
			const move =
				swap && exchanged < 3 ? swap : moves.filter((m) => m.type !== "swap" && m.type !== "announce").at(-1)!;
			if (move.type === "swap") {
				exchanged++;
			}
			applyMove(state, move, currentSeat(state)!);
		}
		assert.ok(!options.stockSwap || exchanged > 0);
		assert.deepEqual(wrapper.replay(state), state);
		const publicState = positionAt(state, state.log.length);
		assert.deepEqual(publicState.board, state.board);
		assert.deepEqual(publicState.bank, state.bank);
		assert.deepEqual(
			publicState.seats.map((s) => [s.cash, s.shares]),
			state.seats.map((s) => [s.cash, s.shares])
		);
		checkInvariants(state);
	}
});
