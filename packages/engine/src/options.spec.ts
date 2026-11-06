import assert from "node:assert/strict";
import { test } from "node:test";
import { endConditionHolds } from "./board.js";
import { applyMove } from "./moves.js";
import { legalMoves } from "./legal.js";
import {
	DEFAULT_OPTIONS,
	PUBLIC_HOLDINGS_OVERRIDE,
	handSize,
	holdingsVisibility,
	normalizeOptions,
} from "./options.js";
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
		deadDrawsReplaced: true,
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
		deadDrawsReplaced: true,
	});
	assert.deepEqual(ignored, []);
});

test("§5.3 new games record deadDrawsReplaced; replay keeps a game's own revision", () => {
	assert.equal(normalizeOptions(3, {}).options.deadDrawsReplaced, true);
	assert.equal("deadDrawsReplaced" in normalizeOptions(3, {}, { publicHoldings: false }).options, false);
	assert.equal(normalizeOptions(3, {}, { deadDrawsReplaced: true }).options.deadDrawsReplaced, true);
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

test("§15 handSize: missing keeps the legacy hand of 6, or 8 with twoTiles, and leaves the init log unchanged", () => {
	assert.equal("handSize" in normalizeOptions(3, {}).options, false);
	assert.equal(handSize(normalizeOptions(3, {}).options), 6);
	assert.equal("handSize" in normalizeOptions(3, { twoTiles: true }).options, false);
	assert.equal(handSize(normalizeOptions(3, { twoTiles: true }).options), 8);
	const init = initGame(3, {}, "no-hand-size").log[0] as Extract<LogEntry, { type: "init" }>;
	assert.deepEqual(init.options, DEFAULT_OPTIONS);
});

test("§15 handSize: every size is read as BGS sends it, alone or with twoTiles; the legacy size is omitted", () => {
	for (const twoTiles of [false, true]) {
		const legacy = twoTiles ? 8 : 6;
		for (const size of [6, 8, 10, 12]) {
			for (const sent of [String(size), size]) {
				const { options, ignored } = normalizeOptions(3, { ...(twoTiles && { twoTiles }), handSize: sent });
				assert.deepEqual(ignored, []);
				assert.equal(handSize(options), size);
				assert.equal(options.handSize, size === legacy ? undefined : size);
				assert.equal("handSize" in options, size !== legacy, `handSize ${sent} with twoTiles ${twoTiles}`);
			}
		}
	}
	assert.deepEqual(normalizeOptions(3, { handSize: "10" }).options, { ...DEFAULT_OPTIONS, handSize: 10 });
});

test("§15 handSize: unknown values are ignored and logged, keeping the legacy size", () => {
	for (const value of ["7", 7, "", "eight", "08", " 8", 6.5, 14, true, null, ["8"]]) {
		for (const twoTiles of [false, true]) {
			const state = initGame(3, { ...(twoTiles && { twoTiles }), handSize: value }, "bad-hand-size");
			assert.equal("handSize" in state.options, false);
			assert.deepEqual(
				ignoredLog(state).map((e) => [e.option, e.value, e.reason]),
				[["handSize", value, "unknown value"]]
			);
			assert.ok(state.seats.every((seat) => seat.hand.length === (twoTiles ? 8 : 6)));
		}
	}
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

test("§15 holdingsVisibility: missing and private keep the historical options, intermediate levels are stored", () => {
	const normalized = (raw: Record<string, unknown>) => normalizeOptions(3, raw);
	for (const raw of [{}, { holdingsVisibility: "private" }]) {
		assert.deepEqual(normalized(raw), { options: DEFAULT_OPTIONS, ignored: [] });
	}
	for (const level of ["cash", "cashAndShareCount"] as const) {
		const { options, ignored } = normalized({ holdingsVisibility: level });
		assert.deepEqual(options, { ...DEFAULT_OPTIONS, holdingsVisibility: level });
		assert.deepEqual(ignored, []);
		assert.equal(holdingsVisibility(options), level);
	}
	// Full public is stored exactly as the legacy checkbox stores it.
	const legacy = normalized({ publicHoldings: true });
	assert.deepEqual(legacy, { options: { ...DEFAULT_OPTIONS, publicHoldings: true }, ignored: [] });
	assert.deepEqual(normalized({ holdingsVisibility: "public" }), legacy);
	assert.equal(holdingsVisibility(legacy.options), "public");
	assert.equal(holdingsVisibility(DEFAULT_OPTIONS), "private");
	assert.equal("holdingsVisibility" in initGame(3, { publicHoldings: true }, "legacy").options, false);
});

test("§15 holdingsVisibility: invalid values are ignored and logged, falling back to the checkbox", () => {
	for (const value of ["everything", "Cash", true, 2, null]) {
		const { options, ignored } = normalizeOptions(3, { holdingsVisibility: value });
		assert.deepEqual(options, DEFAULT_OPTIONS);
		assert.deepEqual(ignored, [{ option: "holdingsVisibility", value, reason: "unknown value" }]);
		assert.equal(normalizeOptions(3, { holdingsVisibility: value, publicHoldings: true }).options.publicHoldings, true);
	}
	assert.equal(normalizeOptions(3, { publicHoldings: "true" }).options.publicHoldings, false);
});

test("§15 holdingsVisibility: the legacy publicHoldings checkbox wins, and only a real conflict is logged", () => {
	for (const level of ["private", "public"]) {
		assert.deepEqual(normalizeOptions(3, { publicHoldings: true, holdingsVisibility: level }), {
			options: { ...DEFAULT_OPTIONS, publicHoldings: true },
			ignored: [],
		});
	}
	for (const level of ["cash", "cashAndShareCount"]) {
		const state = initGame(3, { publicHoldings: true, holdingsVisibility: level }, "conflict");
		assert.deepEqual(state.options, { ...DEFAULT_OPTIONS, publicHoldings: true });
		assert.deepEqual(ignoredLog(state), [
			{ type: "optionIgnored", option: "holdingsVisibility", value: level, reason: PUBLIC_HOLDINGS_OVERRIDE },
		]);
	}
});

test("§13 holdingsVisibility cash: opponents' exact cash is visible, their stock is not", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["9I"], ["11I"]],
		shares: [{ tower: 1 }, { tower: 2, luxor: 3 }],
		cash: [6000, 4300, 5100],
		options: { holdingsVisibility: "cash" },
	});
	for (const player of [0, undefined]) {
		const view = wrapper.stripSecret(state, player);
		assert.equal(view.seats[1]!.cash, 4300);
		assert.equal(view.seats[2]!.cash, 5100);
		assert.equal(view.seats[1]!.shares.tower, -1);
		assert.equal(view.seats[1]!.shares.luxor, -1);
		assert.equal("shareCount" in view.seats[1]!, false);
		assert.deepEqual(view.seats[1]!.hand, [-1]);
	}
	assert.deepEqual(wrapper.stripSecret(state, 0).seats[0], state.seats[0], "your own seat is complete");
});

test("§13 holdingsVisibility cashAndShareCount: exact cash and total shares, never the chains", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["9I"], ["11I"]],
		// Kept shares of a chain not on the board still count.
		shares: [{ tower: 1 }, { tower: 2, luxor: 3 }],
		cash: [6000, 4300, 5100],
		options: { holdingsVisibility: "cashAndShareCount" },
	});
	for (const player of [0, undefined]) {
		const view = wrapper.stripSecret(state, player);
		assert.equal(view.seats[1]!.cash, 4300);
		assert.equal(view.seats[1]!.shareCount, 5);
		assert.equal(view.seats[2]!.shareCount, 0);
		assert.ok(Object.values(view.seats[1]!.shares).every((count) => count === -1));
		assert.deepEqual(view.seats[1]!.hand, [-1]);
	}
	const own = wrapper.stripSecret(state, 0).seats[0]!;
	assert.deepEqual(own, state.seats[0], "your own seat is complete, without a share count");
	assert.deepEqual(legalMoves(wrapper.stripSecret(state, 0)), legalMoves(state));
});

test("§13 holdingsVisibility: every level reveals everything once the game ends", () => {
	for (const holdingsVisibility of ["cash", "cashAndShareCount"]) {
		const state = scenario({
			board: chainAt("tower", ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A"]),
			hands: [["9G"], ["9I", "12A"], ["11G"]],
			shares: [{}, { luxor: 3 }],
			cash: [6000, 4100, 6000],
			options: { holdingsVisibility },
		});
		applyMove(state, { type: "announce" }, 0);
		applyMove(state, { type: "place", tile: "9G" }, 0);
		applyMove(state, { type: "buy", shares: {} }, 0);
		assert.equal(state.ended, true);
		const seat = wrapper.stripSecret(state, 0).seats[1]!;
		assert.equal(seat.cash, 4100);
		assert.equal(seat.shares.luxor, 3);
		assert.equal("shareCount" in seat, false);
	}
});

test("§15 holdingsVisibility games replay identically", () => {
	for (const holdingsVisibility of ["cash", "cashAndShareCount", "public"]) {
		const state = initGame(4, { holdingsVisibility }, `replay-${holdingsVisibility}`);
		for (let step = 1; !state.ended && step < 200; step++) {
			const moves = legalMoves(state).filter((move) => move.type !== "announce");
			wrapper.move(state, moves[(step * 7919) % moves.length]!, wrapper.currentPlayer(state)!);
		}
		assert.deepEqual(wrapper.replay(structuredClone(state)), state);
	}
});
