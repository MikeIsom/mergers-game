import assert from "node:assert/strict";
import { test } from "node:test";
import { initGame } from "./setup.js";
import { simpleLine, turnSummary } from "./simple.js";
import { t } from "./test/helpers.js";
import type { GameState, LogEntry } from "./types.js";
import * as wrapper from "../wrapper.js";

function named(players: number, options: Record<string, unknown> = {}): GameState {
	const state = initGame(players, options, "simple");
	["Ann", "Bo", "Cy", "Di"]
		.slice(0, players)
		.forEach((name, player) => wrapper.setPlayerMetaData(state, player, { name }));
	return state;
}

const disposed: LogEntry = { type: "disposed", seat: 1, chain: "luxor", sold: 2, traded: 4, held: 3, proceeds: 1200 };

test("simple lines read as plain English sentences", () => {
	const state = named(3);
	assert.equal(simpleLine(state, { type: "move", seat: 0, move: { type: "place", tile: "5C" } }), "Ann placed 5C");
	assert.equal(
		simpleLine(state, { type: "bought", seat: 2, shares: { tower: 2, continental: 1 }, cost: 1500 }),
		"Cy bought 2 Tower and 1 Continental for $1,500"
	);
	assert.equal(simpleLine(state, { type: "drew", seat: 1, count: 1 }), "Bo drew a tile");
	assert.equal(
		simpleLine(state, { type: "bonuses", chain: "imperial", size: 12, payouts: [{ seat: 0, amount: 10500 }] }),
		"Imperial bonuses at size 12: Ann $10,500"
	);
	assert.equal(
		simpleLine(state, { type: "gameEnd", reason: "stall" }),
		"Game over: a full round passed with no tile placed"
	);
});

test("§13 simple lines leave out how many shares were kept while holdings are private", () => {
	assert.equal(simpleLine(named(3), disposed), "Bo sold 2 Luxor for $1,200 and traded 4 Luxor for 2 of the survivor");
	assert.equal(simpleLine(named(3), { ...disposed, sold: 0, traded: 0, proceeds: 0 }), "Bo kept their Luxor shares");
	assert.equal(
		simpleLine(named(3, { publicHoldings: true }), disposed),
		"Bo sold 2 Luxor for $1,200, traded 4 Luxor for 2 of the survivor and kept 3 Luxor"
	);
});

test("simple lines name the seat when a player controls two (§15 fourHands)", () => {
	const state = named(2, { twoPlayerMode: "fourHands" });
	assert.equal(simpleLine(state, { type: "drew", seat: 2, count: 1 }), "Ann (seat 3) drew a tile");
});

test("simple lines describe bank tiles (§12)", () => {
	const state = named(2);
	assert.equal(
		simpleLine(state, { type: "merger", seat: 0, tile: t("9F"), sizes: { tower: 3, luxor: 2 }, byBank: true }),
		"The bank's tile 9F merges Tower (3) and Luxor (2)"
	);
});

test("logSlice gives every entry a simple line, using the current player names", () => {
	const state = named(4);
	const { log } = wrapper.logSlice(state, {});
	assert.equal(log.length, state.log.length);
	for (const entry of log) {
		assert.ok(entry.simple.length > 0, entry.type);
	}
	assert.match(log.find((entry) => entry.type === "turnOrder")!.simple, /goes first$/);
	assert.ok(!("simple" in state.log[0]!), "simple lines are not stored in the game state");
});

const merger: LogEntry[] = [
	{ type: "turn", seat: 0 },
	{ type: "move", seat: 0, move: { type: "place", tile: "6E" } },
	{ type: "merger", seat: 0, tile: t("6E"), sizes: { luxor: 2, tower: 4 } },
	{ type: "mergerPlan", survivor: "tower", defunct: ["luxor"] },
	{ type: "bonuses", chain: "luxor", size: 2, payouts: [{ seat: 1, amount: 3000 }] },
	{ type: "disposed", seat: 1, chain: "luxor", sold: 1, traded: 0, held: 0, proceeds: 200 },
	{ type: "merged", survivor: "tower", size: 7 },
	{ type: "move", seat: 0, move: { type: "buy", shares: { tower: 2 } } },
	{ type: "bought", seat: 0, shares: { tower: 2 }, cost: 1400 },
	{ type: "drew", seat: 0, count: 1 },
	{ type: "turn", seat: 1 },
];

test("the next turn's line sums up the turn that just finished, placement first", () => {
	const state = named(3);
	state.log = merger;
	assert.equal(turnSummary(state, 10), "Ann merged Luxor into Tower, bought 2 Tower");
	assert.equal(wrapper.logSlice(state, { start: 7 }).log.at(-1)!.simple, "Ann merged Luxor into Tower, bought 2 Tower");
	assert.equal(turnSummary(state, 0), "The game started");
});

test("turn summaries cover founding, no placement and announcing", () => {
	const state = named(3);
	state.log = [
		{ type: "turn", seat: 1 },
		{ type: "move", seat: 1, move: { type: "place", tile: "3B" } },
		{ type: "founded", seat: 1, chain: "imperial", size: 2, bonus: true },
		{ type: "move", seat: 1, move: { type: "buy", shares: {} } },
		{ type: "bought", seat: 1, shares: {}, cost: 0 },
		{ type: "turn", seat: 2 },
		{ type: "skipPlace", seat: 2 },
		{ type: "move", seat: 2, move: { type: "announce" } },
		{ type: "announced", seat: 2 },
		{ type: "turn", seat: 0 },
	];
	assert.equal(turnSummary(state, 5), "Bo founded Imperial");
	assert.equal(turnSummary(state, 9), "Cy placed no tile, announced the end");
});
