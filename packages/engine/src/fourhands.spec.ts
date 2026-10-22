import assert from "node:assert/strict";
import { test } from "node:test";
import { chainAt, checkInvariants, row, scenario, t } from "./test/helpers.js";
import type { GameState } from "./types.js";
import * as wrapper from "../wrapper.js";

const FOUR_HANDS = { twoPlayerMode: "fourHands" };
const place = (tile: string) => ({ type: "place", tile });
const buy = { type: "buy", shares: {} };

function play(state: GameState, player: number, move: unknown): GameState {
	wrapper.move(state, move, player);
	checkInvariants(state);
	return state;
}

test("§15 fourHands: two players get four seats; player A has seats 1 and 3, player B seats 2 and 4", () => {
	const state = wrapper.init(2, [], FOUR_HANDS, "four");
	assert.equal(state.players, 2);
	assert.equal(state.seats.length, 4);
	assert.deepEqual(state.seatOwner, [0, 1, 0, 1]);
	for (const seat of state.seats) {
		assert.equal(seat.cash, 6000);
		assert.equal(seat.hand.length, 6);
	}
	checkInvariants(state);
});

test("§15 fourHands: currentPlayer maps the acting seat to the player who controls it", () => {
	for (const [activeSeat, player] of [
		[0, 0],
		[1, 1],
		[2, 0],
		[3, 1],
	] as const) {
		const state = scenario({ hands: [["9G"], ["9I"], ["11I"], ["12G"]], activeSeat, options: FOUR_HANDS });
		assert.equal(wrapper.currentPlayer(state), player);
	}
});

test("§15 fourHands: only the controlling player may move for a seat", () => {
	const state = scenario({ hands: [["9G"], ["9I"], ["11I"], ["12G"]], activeSeat: 2, options: FOUR_HANDS });
	assert.throws(() => wrapper.move(state, place("11I"), 1), /not your turn/);
	play(state, 0, place("11I"));
	assert.equal(state.activeSeat, 3);
	assert.equal(wrapper.currentPlayer(state), 1);
});

test("§15 fourHands: during disposal currentPlayer is the controller of the disposing seat", () => {
	const board = { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) };
	const state = scenario({
		board,
		hands: [["4A"], ["9I"], ["11I"], ["12G"]],
		shares: [{}, {}, {}, { luxor: 2 }],
		options: FOUR_HANDS,
	});
	play(state, 0, place("4A"));
	assert.equal(state.phase, "dispose");
	assert.equal(wrapper.currentPlayer(state), 1);
	assert.throws(() => wrapper.move(state, { type: "dispose", sell: 0, trade: 0 }, 0), /not your turn/);
	play(state, 1, { type: "dispose", sell: 2, trade: 0 });
	assert.equal(wrapper.currentPlayer(state), 0);
});

test("§15 fourHands never uses the bank shareholder", () => {
	const board = { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) };
	const state = scenario({
		board,
		hands: [["4A"], ["9I"], ["11I"], ["12G"]],
		shares: [{}, { luxor: 1 }],
		options: FOUR_HANDS,
	});
	const poolBefore = state.pool.length;
	play(state, 0, place("4A"));
	const bonus = state.log.find((e) => e.type === "bonuses");
	assert.ok(bonus?.type === "bonuses");
	assert.equal(bonus.bank, undefined);
	assert.deepEqual(bonus.payouts, [{ seat: 1, amount: 3000 }]);
	assert.equal(state.pool.length, poolBefore);
	assert.deepEqual(state.bankTiles, []);
});

test("§13/§15 fourHands: stripSecret shows a player both of their own seats and nothing of the other's", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["9I"], ["11I"], ["12G"]],
		shares: [{ tower: 1 }, { tower: 2 }, { tower: 3 }, { tower: 4 }],
		cash: [1000, 2000, 3000, 4000],
		options: FOUR_HANDS,
	});
	for (const [player, own, other] of [
		[0, [0, 2], [1, 3]],
		[1, [1, 3], [0, 2]],
	] as const) {
		const view = wrapper.stripSecret(state, player);
		for (const seat of own) {
			assert.deepEqual(view.seats[seat]!.hand, state.seats[seat]!.hand);
			assert.equal(view.seats[seat]!.cash, state.seats[seat]!.cash);
			assert.equal(view.seats[seat]!.shares.tower, state.seats[seat]!.shares.tower);
		}
		for (const seat of other) {
			assert.deepEqual(view.seats[seat]!.hand, [-1]);
			assert.equal(view.seats[seat]!.cash, -1);
			assert.equal(view.seats[seat]!.shares.tower, -1);
		}
		assert.equal(view.seed, "");
		assert.ok(view.pool.every((tile) => tile === -1));
	}
	const spectator = wrapper.stripSecret(state, undefined);
	assert.ok(spectator.seats.every((seat) => seat.cash === -1 && seat.hand.every((tile) => tile === -1)));
});

test("§13/§15 fourHands: scores and rankings are per player; scores stay 0 during play with private holdings", () => {
	const state = scenario({ hands: [["9G"], ["9I"], ["11I"], ["12G"]], options: FOUR_HANDS });
	assert.deepEqual(wrapper.scores(state), [0, 0]);
	assert.equal(wrapper.rankings(state).length, 2);
});

test("§15 fourHands: the player controlling the single richest seat wins; seats are not combined", () => {
	// Player A: seats 1 and 3 hold $9,000 and $1,000 ($10,000 combined).
	// Player B: seats 2 and 4 hold $8,000 and $8,500 ($16,500 combined) but no single richer seat.
	const state = scenario({
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["9I"], ["11I"], ["12G"]],
		cash: [9000, 8000, 1000, 8500],
		options: FOUR_HANDS,
	});
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.equal(state.ended, true);
	assert.deepEqual(wrapper.scores(state), [9000, 8500]);
	assert.deepEqual(wrapper.rankings(state), [1, 2]);
});

test("§15 fourHands: equal richest seats share the victory", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["9I"], ["11I"], ["12G"]],
		cash: [7000, 7000, 1000, 2000],
		options: FOUR_HANDS,
	});
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.deepEqual(wrapper.rankings(state), [1, 1]);
});

test("§16 fourHands: a dropping player loses both seats; one player is left, so the game ends", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["9I"], ["11I"], ["12G"]],
		activeSeat: 1,
		cash: [9000, 3000, 9500, 2000],
		options: FOUR_HANDS,
	});
	wrapper.dropPlayer(state, 0);
	assert.deepEqual(
		state.seats.map((seat) => seat.dropped),
		[true, false, true, false]
	);
	assert.equal(state.ended, true);
	assert.deepEqual(wrapper.scores(state), [9500, 3000]);
	assert.deepEqual(wrapper.rankings(state), [2, 1], "§16 the dropped player ranks last despite the richest seat");
	checkInvariants(state);
});
