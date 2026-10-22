import assert from "node:assert/strict";
import { test } from "node:test";
import { endConditionHolds } from "./board.js";
import { applyMove } from "./moves.js";
import { DEFAULT_OPTIONS, normalizeOptions } from "./options.js";
import { sharePrice } from "./prices.js";
import { initGame } from "./setup.js";
import { chainAt, checkInvariants, row, scenario } from "./test/helpers.js";
import type { GameState, LogEntry } from "./types.js";
import * as wrapper from "../wrapper.js";

function play(state: GameState, seat: number, move: unknown): GameState {
	applyMove(state, move, seat);
	checkInvariants(state);
	return state;
}

function ignoredLog(state: GameState): Extract<LogEntry, { type: "optionIgnored" }>[] {
	return state.log.filter((e): e is Extract<LogEntry, { type: "optionIgnored" }> => e.type === "optionIgnored");
}

const place = (tile: string) => ({ type: "place", tile });
const buy = { type: "buy", shares: {} };

test("§15 defaults reproduce the standard game", () => {
	assert.deepEqual(DEFAULT_OPTIONS, {
		publicHoldings: false,
		teamPlay: false,
		twoPlayerMode: "bank",
		autoEnd: false,
		endSize: 41,
	});
	for (let players = 2; players <= 6; players++) {
		const state = initGame(players, {}, "defaults");
		assert.deepEqual(state.options, DEFAULT_OPTIONS);
		assert.deepEqual(ignoredLog(state), []);
	}
});

test("§15 BGS option values are read as sent: ticked checkboxes, selects as strings", () => {
	const { options, ignored } = normalizeOptions(2, {
		publicHoldings: true,
		autoEnd: true,
		twoPlayerMode: "fourHands",
		endSize: "31",
	});
	assert.deepEqual(options, {
		publicHoldings: true,
		teamPlay: false,
		twoPlayerMode: "fourHands",
		autoEnd: true,
		endSize: 31,
	});
	assert.deepEqual(ignored, []);
});

test("§15 an option that does not apply to the player count is ignored and logged", () => {
	const five = initGame(5, { teamPlay: true }, "team5");
	assert.equal(five.options.teamPlay, false);
	assert.deepEqual(ignoredLog(five), [
		{ type: "optionIgnored", option: "teamPlay", value: true, reason: "only applies with exactly 4 players" },
	]);
	const three = initGame(3, { twoPlayerMode: "fourHands" }, "four3");
	assert.equal(three.options.twoPlayerMode, "bank");
	assert.equal(three.seats.length, 3);
	assert.deepEqual(ignoredLog(three), [
		{
			type: "optionIgnored",
			option: "twoPlayerMode",
			value: "fourHands",
			reason: "only applies with exactly 2 players",
		},
	]);
	assert.equal(initGame(4, { teamPlay: true }, "team4").options.teamPlay, true);
});

test("§15 the always-sent default twoPlayerMode is not logged as ignored", () => {
	for (const players of [3, 4, 5, 6]) {
		assert.deepEqual(ignoredLog(initGame(players, { twoPlayerMode: "bank" }, "bank-default")), []);
	}
});

test("§3.5 options are never rejected: unknown values are ignored and logged", () => {
	const state = initGame(4, { twoPlayerMode: "solo", endSize: "50", teamPlay: "yes", mystery: 1 }, "junk");
	assert.deepEqual(state.options, { ...DEFAULT_OPTIONS });
	assert.deepEqual(
		ignoredLog(state).map((e) => [e.option, e.value]),
		[
			["twoPlayerMode", "solo"],
			["endSize", "50"],
		]
	);
	assert.doesNotThrow(() => wrapper.init(2, [], { teamPlay: true, twoPlayerMode: "fourHands", endSize: 7 }, "x"));
});

test("§15 endSize 31: a 31-tile chain meets the end condition; safe size and prices are unchanged", () => {
	const tiles = [...row("A", 1, 12), ...row("B", 1, 12), ...row("C", 1, 7)];
	const board = scenario({ board: chainAt("tower", tiles), hands: [["9I"]] }).board;
	const open = scenario({
		board: { ...chainAt("tower", tiles), ...chainAt("luxor", ["1G", "2G"]) },
		hands: [["9I"]],
	}).board;
	assert.equal(tiles.length, 31);
	assert.equal(endConditionHolds(open, 41), false);
	assert.equal(endConditionHolds(open, 31), true);
	assert.equal(endConditionHolds(board, 31), true);
	const short = scenario({
		board: { ...chainAt("tower", tiles), ...chainAt("luxor", ["1G", "2G"]) },
		hands: [["9I"]],
		options: { endSize: "31" },
	});
	assert.doesNotThrow(() => applyMove(short, { type: "announce" }, 0));
	const standard = scenario({
		board: { ...chainAt("tower", tiles), ...chainAt("luxor", ["1G", "2G"]) },
		hands: [["9I"]],
	});
	assert.throws(() => applyMove(standard, { type: "announce" }, 0), /cannot be ended/);
	const tenTiles = scenario({ board: chainAt("tower", row("A", 1, 10)), hands: [["9I"]], options: { endSize: "31" } });
	assert.throws(
		() => applyMove(tenTiles, { type: "announce" }, 0),
		/cannot be ended/,
		"a 10-tile chain is still not safe"
	);
	assert.equal(sharePrice("tower", 31), 900);
});

test("§15 autoEnd: the game ends at the end of the turn in which an end condition first holds", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 10)),
		hands: [["11A"], ["9I"]],
		options: { autoEnd: true },
	});
	assert.throws(() => applyMove(state, { type: "announce" }, 0), /cannot be ended/);
	play(state, 0, place("11A"));
	assert.equal(state.ended, false, "the turn is finished first");
	assert.throws(() => applyMove(state, { type: "announce" }, 0), /cannot be ended/, "there is nothing to announce");
	play(state, 0, buy);
	assert.equal(state.ended, true);
	assert.deepEqual(
		state.log.filter((e) => e.type === "gameEnd"),
		[{ type: "gameEnd", reason: "condition" }]
	);
});

test("§15 without autoEnd the same turn does not end the game", () => {
	const state = scenario({ board: chainAt("tower", row("A", 1, 10)), hands: [["11A"], ["9I"]] });
	play(state, 0, place("11A"));
	play(state, 0, buy);
	assert.equal(state.ended, false);
});

test("§15 teamPlay: seats 1+3 and 2+4 combine their cash at final scoring", () => {
	const state = scenario({
		seats: 4,
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["9I"], ["11I"], ["12G"]],
		cash: [5000, 9000, 6000, 1000],
		options: { teamPlay: true },
	});
	assert.deepEqual(wrapper.scores(state), [0, 0, 0, 0]);
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.deepEqual(wrapper.scores(state), [11000, 10000, 11000, 10000]);
	assert.deepEqual(wrapper.rankings(state), [1, 2, 1, 2], "seat 2 is richest alone, but its team loses");
});

test("§15 teamPlay: tied teams share the victory", () => {
	const state = scenario({
		seats: 4,
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["9I"], ["11I"], ["12G"]],
		cash: [5000, 4000, 5000, 6000],
		options: { teamPlay: true },
	});
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.deepEqual(wrapper.rankings(state), [1, 1, 1, 1]);
});

test("§15 teamPlay with private holdings: teammates cannot see each other's holdings", () => {
	const state = scenario({
		seats: 4,
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["9I"], ["11I"], ["12G"]],
		shares: [{ tower: 1 }, {}, { tower: 3 }],
		options: { teamPlay: true },
	});
	const view = wrapper.stripSecret(state, 0);
	assert.equal(view.seats[2]!.cash, -1);
	assert.equal(view.seats[2]!.shares.tower, -1);
	assert.deepEqual(view.seats[2]!.hand, [-1]);
	assert.equal(view.seats[0]!.shares.tower, 1);
});

test("§15 publicHoldings: everyone's cash and stock are visible, hands are not", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["9I"], ["11I"]],
		shares: [{}, { tower: 2 }],
		options: { publicHoldings: true },
	});
	const view = wrapper.stripSecret(state, 0);
	assert.equal(view.seats[1]!.cash, 6000);
	assert.equal(view.seats[1]!.shares.tower, 2);
	assert.deepEqual(view.seats[1]!.hand, [-1]);
});
