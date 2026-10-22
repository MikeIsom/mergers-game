import assert from "node:assert/strict";
import { test } from "node:test";
import { endConditionHolds } from "./board.js";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat } from "./moves.js";
import { chainAt, checkInvariants, row, scenario } from "./test/helpers.js";
import { startTurn } from "./turn.js";
import type { GameState, LogEntry } from "./types.js";
import * as wrapper from "../wrapper.js";

function play(state: GameState, seat: number, move: unknown): GameState {
	applyMove(state, move, seat);
	checkInvariants(state);
	return state;
}

const place = (tile: string) => ({ type: "place", tile });
const buy = (shares: Record<string, number> = {}) => ({ type: "buy", shares });
const announce = { type: "announce" };

function entries<T extends LogEntry["type"]>(state: GameState, type: T): Extract<LogEntry, { type: T }>[] {
	return state.log.filter((e): e is Extract<LogEntry, { type: T }> => e.type === type);
}

const SAFE_TOWER = chainAt("tower", row("A", 1, 11));
const TOWER_10 = chainAt("tower", row("A", 1, 10));
const TOWER_41 = chainAt("tower", [
	...row("A", 1, 10),
	...row("B", 1, 10),
	...row("C", 1, 10),
	...row("D", 1, 10),
	"11A",
]);

test("§11.1 end condition: a chain of 41 or more tiles, even with open chains on the board", () => {
	const state = scenario({ board: { ...TOWER_41, ...chainAt("luxor", ["1G", "2G"]) }, hands: [["9I"]] });
	assert.equal(endConditionHolds(state.board), true);
});

test("§11.1 end condition: every active chain is safe", () => {
	const both = scenario({ board: { ...SAFE_TOWER, ...chainAt("luxor", row("C", 1, 11)) }, hands: [["9I"]] });
	assert.equal(endConditionHolds(both.board), true);
	const oneOpen = scenario({ board: { ...SAFE_TOWER, ...chainAt("luxor", ["1G", "2G"]) }, hands: [["9I"]] });
	assert.equal(endConditionHolds(oneOpen.board), false);
});

test("§11.1 end condition: never holds with no chain on the board", () => {
	const state = scenario({ board: { "1A": "loose" }, hands: [["9I"]] });
	assert.equal(endConditionHolds(state.board), false);
});

test("§11.1 the end may be announced before placing, then the turn finishes normally", () => {
	const state = scenario({ board: SAFE_TOWER, hands: [["9G"], ["9I"], ["11I"]], poolTop: ["12I"] });
	play(state, 0, announce);
	assert.equal(state.phase, "place");
	assert.equal(state.endAnnounced, 0);
	play(state, 0, place("9G"));
	assert.equal(state.phase, "buy");
	assert.throws(() => applyMove(state, announce, 0), /cannot be ended/);
	play(state, 0, buy({ tower: 1 }));
	assert.equal(state.ended, true);
	assert.equal(state.phase, "ended");
	assert.equal(currentSeat(state), undefined);
	assert.deepEqual(entries(state, "gameEnd"), [{ type: "gameEnd", reason: "announced" }]);
	assert.ok(
		entries(state, "drew").some((e) => e.seat === 0),
		"§4.5 the turn's draw still happens"
	);
});

test("§11.1 the end may be announced during the buy step", () => {
	const state = scenario({ board: SAFE_TOWER, hands: [["9G"], ["9I"]] });
	play(state, 0, place("9G"));
	play(state, 0, announce);
	assert.equal(state.phase, "buy");
	play(state, 0, buy());
	assert.equal(state.ended, true);
});

test("§11.1 announcing is optional", () => {
	const state = scenario({ board: SAFE_TOWER, hands: [["9G"], ["9I"]] });
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.equal(state.ended, false);
	assert.equal(state.activeSeat, 1);
});

test("§11.1 the end cannot be announced when no condition holds", () => {
	const state = scenario({ board: TOWER_10, hands: [["9G"], ["9I"]] });
	assert.throws(() => applyMove(state, announce, 0), /cannot be ended/);
	play(state, 0, place("9G"));
	assert.throws(() => applyMove(state, announce, 0), /cannot be ended/);
});

test("§11.1 the condition is checked when announcing: founding an unsafe chain removes the option", () => {
	const state = scenario({ board: { ...SAFE_TOWER, "9F": "loose" }, hands: [["9G"], ["9I"]] });
	assert.ok(
		legalMoves(state).some((move) => move.type === "announce"),
		"announcing before placing is allowed"
	);
	play(state, 0, place("9G"));
	play(state, 0, { type: "found", chain: "luxor" });
	assert.equal(state.phase, "buy");
	assert.throws(() => applyMove(state, announce, 0), /cannot be ended/);
});

test("§11.1 the end can only be announced by the active player at the two announcement points", () => {
	const tied = { ...chainAt("festival", ["3H", "4H"]), ...chainAt("imperial", ["6H", "7H"]), ...TOWER_41 };
	const state = scenario({ board: tied, hands: [["5H"], ["9I"]] });
	play(state, 0, place("5H"));
	assert.equal(state.phase, "survivor");
	assert.throws(() => applyMove(state, announce, 0), /before placing a tile or while buying/);
	assert.throws(() => applyMove(state, announce, 1), /not your turn/);
});

test("§11.2 final scoring: bonuses for every active chain, then all stock sold at current prices", () => {
	// Both chains are safe at size 11: minor tier, $700 a share, bonuses $7,000 / $3,500.
	const state = scenario({
		board: { ...SAFE_TOWER, ...chainAt("luxor", row("C", 1, 11)) },
		hands: [["9G"], ["9I"], ["11I"]],
		shares: [{ tower: 5, luxor: 2, festival: 6 }, { tower: 3 }, { luxor: 4 }],
	});
	play(state, 0, announce);
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.deepEqual(
		entries(state, "bonuses").map(({ chain, payouts }) => ({ chain, payouts })),
		[
			{
				chain: "tower",
				payouts: [
					{ seat: 0, amount: 7000 },
					{ seat: 1, amount: 3500 },
				],
			},
			{
				chain: "luxor",
				payouts: [
					{ seat: 0, amount: 3500 },
					{ seat: 2, amount: 7000 },
				],
			},
		]
	);
	assert.deepEqual(
		state.seats.map((seat) => seat.cash),
		[6000 + 7000 + 3500 + 5 * 700 + 2 * 700, 6000 + 3500 + 3 * 700, 6000 + 7000 + 4 * 700]
	);
	assert.equal(state.seats[0]!.shares.tower, 0);
	assert.equal(state.bank.tower, 25);
	assert.equal(state.bank.luxor, 25);
	assert.equal(state.seats[0]!.shares.festival, 6, "§11.2.3 stock in chains not on the board is worthless");
	assert.equal(state.bank.festival, 19);
	assert.deepEqual(wrapper.scores(state), [21400, 11600, 15800]);
	assert.deepEqual(wrapper.rankings(state), [1, 3, 2]);
	assert.deepEqual(entries(state, "result"), [{ type: "result", cash: [21400, 11600, 15800], ranks: [1, 3, 2] }]);
});

test("§11.2.4 tied players share the victory", () => {
	const state = scenario({ board: SAFE_TOWER, hands: [["9G"], ["9I"], ["11I"]], cash: [5000, 3000, 5000] });
	play(state, 0, announce);
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.deepEqual(wrapper.rankings(state), [1, 3, 1]);
});

test("§13 scores are 0 during play while holdings are private, then the final cash", () => {
	const state = scenario({ seats: 2, board: SAFE_TOWER, hands: [["9G"], ["9I"]], cash: [4000, 7000] });
	assert.deepEqual(wrapper.scores(state), [0, 0]);
	play(state, 0, announce);
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.deepEqual(wrapper.scores(state), [4000, 7000]);
});

test("§13 scores are live cash while holdings are public", () => {
	const state = scenario({
		seats: 2,
		board: SAFE_TOWER,
		hands: [["9G"], ["9I"]],
		cash: [4000, 7000],
		options: { publicHoldings: true },
	});
	assert.deepEqual(wrapper.scores(state), [4000, 7000]);
});

test("§11.1 stall rule: the game ends after a full round in which no tile was placed", () => {
	const state = scenario({ board: chainAt("tower", ["1A", "2A"]), hands: [["9G"], [], []], poolOnly: true });
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.equal(state.activeSeat, 1);
	assert.equal(state.phase, "buy");
	play(state, 1, buy());
	play(state, 2, buy());
	assert.equal(state.ended, false, "seat 0 placed a tile, so this round still had a placement");
	assert.equal(state.activeSeat, 0);
	play(state, 0, buy());
	assert.equal(state.ended, true);
	assert.deepEqual(entries(state, "gameEnd"), [{ type: "gameEnd", reason: "stall" }]);
});

test("§11.1 stall rule: a round of automatically skipped turns ends the game without hanging", () => {
	const state = scenario({ hands: [["9G"], [], []], poolOnly: true });
	play(state, 0, place("9G"));
	assert.equal(state.ended, true);
	assert.deepEqual(entries(state, "gameEnd"), [{ type: "gameEnd", reason: "stall" }]);
	assert.deepEqual(
		state.log.filter((e) => e.type === "turn").map((e) => (e.type === "turn" ? e.seat : -1)),
		[0, 1, 2, 0]
	);
});

test("automatic turn advances stop with a clear error if the stall rule ever fails to end the game", () => {
	const state = scenario({ hands: [["9G"], [], []], poolOnly: true });
	state.seats[0]!.hand = [];
	state.turnsWithoutPlacement = -1000;
	assert.throws(() => startTurn(state), /Deadlock/);
});

test("no move is accepted after the game has ended", () => {
	const state = scenario({ board: SAFE_TOWER, hands: [["9G"], ["9I"]] });
	play(state, 0, announce);
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.throws(() => applyMove(state, buy(), 1), /ended/);
});
