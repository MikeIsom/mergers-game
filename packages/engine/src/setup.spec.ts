import assert from "node:assert/strict";
import { test } from "node:test";
import { activeChains } from "./board.js";
import { CHAIN_IDS } from "./config.js";
import { initGame } from "./setup.js";
import { neighbours } from "./tiles.js";
import { checkInvariants } from "./test/helpers.js";

test("§1/§3 each player starts with $6,000, 6 tiles and no stock; the bank holds 25 of each chain", () => {
	for (let seats = 2; seats <= 6; seats++) {
		const state = initGame(seats, {}, `setup-${seats}`);
		for (const seat of state.seats) {
			assert.equal(seat.cash, 6000);
			assert.equal(seat.hand.length, 6);
			assert.ok(CHAIN_IDS.every((chain) => seat.shares[chain] === 0));
		}
		assert.ok(CHAIN_IDS.every((chain) => state.bank[chain] === 25));
		assert.equal(state.pool.length, 108 - seats - 6 * seats);
		checkInvariants(state);
	}
});

test("§3.2 turn-order tiles stay on the board as loose tiles and never form a chain", () => {
	for (let seats = 2; seats <= 6; seats++) {
		const state = initGame(seats, {}, `order-${seats}`);
		assert.equal(state.board.filter((cell) => cell === "loose").length, seats);
		assert.deepEqual(activeChains(state.board), []);
	}
});

test("§3.2 turn-order tiles stay loose even when two of them are adjacent", () => {
	let found = false;
	for (let i = 0; i < 2000 && !found; i++) {
		const state = initGame(6, {}, `adjacent-${i}`);
		const entry = state.log.find((e) => e.type === "turnOrder");
		assert.ok(entry?.type === "turnOrder");
		const adjacent = entry.tiles.some((tile) => neighbours(tile).some((n) => entry.tiles.includes(n)));
		if (adjacent) {
			found = true;
			assert.deepEqual(activeChains(state.board), []);
			assert.ok(entry.tiles.every((tile) => state.board[tile] === "loose"));
		}
	}
	assert.ok(found, "expected some seed to draw adjacent turn-order tiles");
});

test("§3.3 the player who drew the lowest tile goes first", () => {
	for (let i = 0; i < 50; i++) {
		const state = initGame(2 + (i % 5), {}, `first-${i}`);
		const entry = state.log.find((e) => e.type === "turnOrder");
		assert.ok(entry?.type === "turnOrder");
		const lowest = entry.tiles.indexOf(Math.min(...entry.tiles));
		assert.equal(entry.first, lowest);
		assert.equal(state.activeSeat, lowest);
	}
});

test("§3.1 the tile pool is shuffled deterministically from the seed", () => {
	assert.deepEqual(initGame(4, {}, "same"), initGame(4, {}, "same"));
	assert.notDeepEqual(initGame(4, {}, "one").pool, initGame(4, {}, "two").pool);
});

test("§1 player counts outside 2-6 are rejected", () => {
	assert.throws(() => initGame(1, {}, "x"));
	assert.throws(() => initGame(7, {}, "x"));
});
