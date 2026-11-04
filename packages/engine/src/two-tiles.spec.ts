import assert from "node:assert/strict";
import { test } from "node:test";
import * as wrapper from "../wrapper.js";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat, dropPlayerSeats } from "./moves.js";
import { normalizeOptions } from "./options.js";
import { blockedThisTurn, turnPlacements, twoTileLimit } from "./two-tiles.js";
import { positionAt } from "./position.js";
import { initGame } from "./setup.js";
import { turnSummary } from "./simple.js";
import { chainAt, checkInvariants, row, scenario, t } from "./test/helpers.js";
import type { GameState, LogEntry, Move } from "./types.js";

const TWO_TILES = { twoTiles: true };

function play(state: GameState, seat: number, move: Move): GameState {
	applyMove(state, move, seat);
	checkInvariants(state);
	return state;
}

const place = (tile: string): Move => ({ type: "place", tile });
const buy: Move = { type: "buy", shares: {} };

function placeable(state: GameState): string[] {
	return legalMoves(state).flatMap((move) => (move.type === "place" ? [move.tile] : []));
}

function entries<T extends LogEntry["type"]>(state: GameState, type: T): Extract<LogEntry, { type: T }>[] {
	return state.log.filter((e): e is Extract<LogEntry, { type: T }> => e.type === type);
}

test("§15 twoTiles defaults off and leaves the init log of standard games unchanged", () => {
	assert.equal("twoTiles" in normalizeOptions(3, {}).options, false);
	for (const twoTiles of [false, "true", 1, null]) {
		const { options, ignored } = normalizeOptions(3, { twoTiles });
		assert.equal("twoTiles" in options, false);
		assert.deepEqual(ignored, []);
	}
	assert.equal(normalizeOptions(3, TWO_TILES).options.twoTiles, true);
	const standard = initGame(3, {}, "standard");
	assert.equal("twoTiles" in (standard.log[0] as Extract<LogEntry, { type: "init" }>).options, false);
	assert.ok(standard.seats.every((seat) => seat.hand.length === 6));
});

test("§15 twoTiles: hands hold 8 tiles, both tiles are placed before one buy step, then the hand refills", () => {
	for (const players of [2, 3, 4, 5, 6]) {
		const state = initGame(players, TWO_TILES, `eight-${players}`);
		assert.ok(state.seats.every((seat) => seat.hand.length === 8));
		assert.ok(positionAt(state, state.log.length).seats.every((seat) => seat.tiles === 8));
	}
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["5E", "9I", "12A", "12C", "12E", "12G", "3I", "1I"], ["10C"], ["10E"]],
		poolTop: ["7G", "7I"],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("5E"));
	assert.equal(state.phase, "place", "the second tile comes before buying");
	assert.deepEqual(placeable(state), ["9I", "12A", "12C", "12E", "12G", "3I", "1I"]);
	play(state, 0, place("9I"));
	assert.equal(state.phase, "buy");
	assert.equal(currentSeat(state), 0);
	play(state, 0, { type: "buy", shares: { tower: 3 } });
	assert.deepEqual(state.seats[0]!.hand.slice(-2), [t("7G"), t("7I")]);
	assert.equal(state.seats[0]!.hand.length, 8, "draws back up to 8");
	assert.equal(state.activeSeat, 1);
	assert.equal(turnSummary(state, state.log.length - 1), "Player 1 placed 5E, placed 9I, bought 3 Tower");
});

test("§15 twoTiles: the second tile is skipped when none is playable", () => {
	// 2A founds a chain with 1A; 2C would found a second one, so it cannot follow.
	const state = scenario({
		board: { "1A": "loose", "1C": "loose" },
		hands: [["2A", "2C"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("2A"));
	play(state, 0, { type: "found", chain: "tower" });
	assert.equal(state.phase, "buy");
	assert.deepEqual(placeable(state), []);
});

// Two pairs of chains to merge, and loose tiles to found a chain next to.
const LIMITS_BOARD = {
	...chainAt("tower", ["1A", "2A"]),
	...chainAt("luxor", ["4A", "5A"]),
	...chainAt("american", ["1E", "2E"]),
	...chainAt("festival", ["4E", "5E"]),
	"8G": "loose",
	"1I": "loose",
} as const;

test("§4.1 twoTiles: a merger with the first tile, then a founding with the second, is allowed", () => {
	const state = scenario({
		board: LIMITS_BOARD,
		hands: [["3A", "9G"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("3A"));
	play(state, 0, { type: "survivor", chain: "tower" });
	assert.equal(state.phase, "place");
	assert.deepEqual(placeable(state), ["9G"]);
	play(state, 0, place("9G"));
	play(state, 0, { type: "found", chain: "worldwide" });
	assert.equal(state.phase, "buy");
	play(state, 0, buy);
	assert.equal(turnSummary(state, state.log.length - 1), "Player 1 merged Luxor into Tower, founded Worldwide");
});

test("§4.1 twoTiles: a founding with the first tile, then a merger of two other chains, is allowed", () => {
	const state = scenario({
		board: LIMITS_BOARD,
		hands: [["9G", "3A", "3E"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("9G"));
	play(state, 0, { type: "found", chain: "worldwide" });
	assert.deepEqual(placeable(state), ["3A", "3E"]);
	play(state, 0, place("3E"));
	play(state, 0, { type: "survivor", chain: "american" });
	assert.equal(state.phase, "buy");
	play(state, 0, buy);
	assert.equal(turnSummary(state, state.log.length - 1), "Player 1 founded Worldwide, merged Festival into American");
});

test("§4.1 twoTiles: a merger, then another merger, is allowed", () => {
	const state = scenario({
		board: LIMITS_BOARD,
		hands: [["3A", "3E", "9G"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("3A"));
	play(state, 0, { type: "survivor", chain: "tower" });
	assert.deepEqual(placeable(state), ["3E", "9G"]);
	play(state, 0, place("3E"));
	play(state, 0, { type: "survivor", chain: "american" });
	assert.equal(state.phase, "buy");
	play(state, 0, buy);
	assert.equal(
		turnSummary(state, state.log.length - 1),
		"Player 1 merged Luxor into Tower, merged Festival into American"
	);
});

test("§4.1 twoTiles: a turn cannot found two chains; growing the new chain is allowed", () => {
	const state = scenario({
		board: LIMITS_BOARD,
		hands: [["9G", "2I", "10G"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("9G"));
	play(state, 0, { type: "found", chain: "worldwide" });
	assert.equal(twoTileLimit(state, t("2I")), "oneFounding");
	assert.throws(() => applyMove(state, place("2I"), 0), /cannot found two chains/);
	assert.deepEqual(placeable(state), ["10G"]);
	play(state, 0, place("10G"));
	assert.equal(state.phase, "buy");
});

test("§4.1 twoTiles: the second tile cannot merge the chain founded this turn", () => {
	// 9G founds a chain with 8G; 7G would then merge it with Imperial.
	const state = scenario({
		board: { ...LIMITS_BOARD, ...chainAt("imperial", ["6G", "6H"]) },
		hands: [["9G", "7G", "3A"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	assert.equal(twoTileLimit(state, t("7G")), undefined);
	play(state, 0, place("9G"));
	play(state, 0, { type: "found", chain: "worldwide" });
	assert.equal(twoTileLimit(state, t("7G")), "mergeFounded");
	assert.equal(twoTileLimit(state, t("3A")), undefined);
	assert.throws(() => applyMove(state, place("7G"), 0), /cannot merge the chain it founded/);
	assert.deepEqual(placeable(state), ["3A"]);
	play(state, 0, place("3A"));
	play(state, 0, { type: "survivor", chain: "luxor" });
	play(state, 0, buy);
	assert.equal(twoTileLimit(state, t("7G")), undefined, "the limit ends with the turn");
});

test("§4.1 twoTiles: the second tile is skipped when only a merger with the new chain remains", () => {
	const state = scenario({
		board: { ...LIMITS_BOARD, ...chainAt("imperial", ["6G", "6H"]) },
		hands: [["9G", "7G"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("9G"));
	play(state, 0, { type: "found", chain: "worldwide" });
	assert.deepEqual(placeable(state), []);
	assert.equal(state.phase, "buy");
});

test("§15 twoTiles: a tile made dead by the first tile cannot be the second and is replaced next turn", () => {
	// 11A makes Tower safe, so 2B would then merge two safe chains.
	const state = scenario({
		board: {
			...chainAt("tower", row("A", 1, 10)),
			...chainAt("continental", row("C", 1, 11)),
			...chainAt("luxor", ["1G", "2G"]),
		},
		hands: [["11A", "2B"], ["12E"], ["12G"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	assert.deepEqual(placeable(state), ["11A", "2B"]);
	play(state, 0, place("11A"));
	assert.equal(state.phase, "buy");
	play(state, 0, buy);
	assert.ok(state.seats[0]!.hand.includes(t("2B")), "dead tiles stay in hand at the end of the turn");
	assert.equal(entries(state, "discarded").length, 0);
	for (const seat of [1, 2]) {
		play(
			state,
			seat,
			legalMoves(state).find((move) => move.type === "place")!
		);
		play(state, seat, buy);
	}
	assert.equal(state.activeSeat, 0);
	const turn = state.log.map((entry) => entry.type).lastIndexOf("turn");
	assert.deepEqual(state.log.slice(turn, turn + 2), [
		{ type: "turn", seat: 0 },
		{ type: "discarded", seat: 0, tiles: [t("2B")] },
	]);
	assert.ok(!state.seats[0]!.hand.includes(t("2B")));
});

test("§15 twoTiles: the end may be announced between the two tiles once a condition holds", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 10)),
		hands: [["11A", "5E"], ["12E"], ["12G"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	assert.equal(
		legalMoves(state).some((move) => move.type === "announce"),
		false
	);
	play(state, 0, place("11A"));
	assert.equal(state.phase, "place");
	play(state, 0, { type: "announce" });
	play(state, 0, place("5E"));
	play(state, 0, buy);
	assert.equal(state.ended, true);
	assert.deepEqual(entries(state, "gameEnd"), [{ type: "gameEnd", reason: "announced" }]);
});

test("§15 twoTiles with §12: bank tiles are placed between the two tiles", () => {
	const state = scenario({
		seats: 2,
		board: { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) },
		hands: [["4A", "9I", "9G", "12A", "12C", "12E", "12G", "12I"], ["1I"]],
		shares: [{}, { luxor: 3 }],
		poolTop: ["9C"],
		poolOnly: true,
		options: TWO_TILES,
	});
	play(state, 0, place("4A"));
	play(state, 1, { type: "dispose", sell: 3, trade: 0 });
	assert.equal(state.phase, "place");
	assert.equal(currentSeat(state), 0);
	assert.deepEqual(state.log.at(-1), { type: "bankTile", tile: t("9C"), result: "loose" });
	assert.equal(state.board[t("9C")], "loose");
	play(state, 0, place("9I"));
	assert.equal(state.phase, "buy");
});

test("§15 twoTiles with §16: a dropped seat places its first two playable tiles", () => {
	const state = scenario({
		hands: [["5E", "9I", "1A"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	dropPlayerSeats(state, 0);
	const placed = entries(state, "move").filter((entry) => entry.seat === 0 && entry.move.type === "place");
	assert.deepEqual(
		placed.map((entry) => entry.move),
		[place("1A"), place("5E")]
	);
	assert.ok(placed.every((entry) => entry.auto));
	assert.equal(currentSeat(state), 1);
});

test("§15 twoTiles: both placements can be drafted privately before committing", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["5E", "9I"], ["12C"], ["12E"]],
		poolOnly: true,
		options: TWO_TILES,
	});
	const player = 0;
	const original = structuredClone(state);
	const draft = wrapper.move(
		state,
		{ type: "turn", from: state.log.length, moves: [place("5E"), place("9I")] },
		player
	);
	assert.equal(draft.phase, "buy");
	assert.deepEqual(draft.tentative, { player, from: state.log.length });
	assert.equal(wrapper.toSave(draft), undefined);
	assert.deepEqual(wrapper.timeIncrements(draft), [0, 0, 0]);
	for (let revision = 0; revision < 3; revision++) {
		const revised = wrapper.move(state, { type: "turn", from: state.log.length, moves: [place("9I")] }, player);
		assert.equal(revised.phase, "place");
		assert.equal(wrapper.toSave(revised), undefined);
		assert.deepEqual(wrapper.timeIncrements(revised), [0, 0, 0]);
		assert.deepEqual(state, original);
	}
	const committed = wrapper.move(
		state,
		{ type: "turn", from: state.log.length, moves: [place("5E"), place("9I"), buy] },
		player
	);
	assert.equal(wrapper.toSave(committed), committed);
	assert.deepEqual(wrapper.timeIncrements(committed), [1, 0, 0]);
	assert.equal(committed.log.filter((entry) => entry.type === "move").length, 3);
});

test("§14.7 twoTiles games replay exactly", () => {
	let state = wrapper.init(4, [], TWO_TILES, "replay-two-tiles");
	for (let i = 0; i < 60 && !state.ended; i++) {
		const player = wrapper.currentPlayer(state)!;
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		state = wrapper.move(state, moves[i % moves.length]!, player);
	}
	assert.deepEqual(wrapper.replay(state), state);
});

/** Two-tile games created before the relaxed limits have no `twoTilesRelaxed` option. */
function legacy(state: GameState): GameState {
	delete state.options.twoTilesRelaxed;
	const init = state.log[0];
	if (init?.type === "init") {
		delete init.options.twoTilesRelaxed;
	}
	return state;
}

test("§4.1 twoTiles: new games record the relaxed limits; replay keeps a game's own revision", () => {
	assert.equal(normalizeOptions(3, TWO_TILES).options.twoTilesRelaxed, true);
	assert.equal("twoTilesRelaxed" in normalizeOptions(3, {}).options, false);
	assert.equal("twoTilesRelaxed" in normalizeOptions(3, TWO_TILES, { twoTiles: true }).options, false);
	assert.equal(normalizeOptions(3, TWO_TILES, { twoTiles: true, twoTilesRelaxed: true }).options.twoTilesRelaxed, true);
	assert.equal("twoTilesRelaxed" in normalizeOptions(3, {}, { twoTilesRelaxed: true }).options, false);
});

test("§4.1 twoTiles in games created before the relaxed limits: no founding and merger in one turn", () => {
	const foundThenMerge = legacy(
		scenario({
			board: LIMITS_BOARD,
			hands: [["9G", "3A", "12A"], ["12C"], ["12E"]],
			poolOnly: true,
			options: TWO_TILES,
		})
	);
	play(foundThenMerge, 0, place("9G"));
	play(foundThenMerge, 0, { type: "found", chain: "worldwide" });
	assert.equal(twoTileLimit(foundThenMerge, t("3A")), "foundOrMerge");
	assert.throws(() => applyMove(foundThenMerge, place("3A"), 0), /cannot both found a chain and cause a merger/);
	assert.deepEqual(placeable(foundThenMerge), ["12A"]);

	const mergeThenFound = legacy(
		scenario({ board: LIMITS_BOARD, hands: [["3A", "9G", "3E"], ["12C"], ["12E"]], poolOnly: true, options: TWO_TILES })
	);
	play(mergeThenFound, 0, place("3A"));
	play(mergeThenFound, 0, { type: "survivor", chain: "tower" });
	assert.equal(twoTileLimit(mergeThenFound, t("9G")), "foundOrMerge");
	assert.deepEqual(placeable(mergeThenFound), ["3E"], "two mergers are still allowed");
});

test("§4.1 twoTiles in games created before the relaxed limits: bank-caused mergers do not count", () => {
	const state = legacy(
		scenario({ board: LIMITS_BOARD, hands: [["12A", "9G"], ["12C"], ["12E"]], poolOnly: true, options: TWO_TILES })
	);
	play(state, 0, place("12A"));
	state.log.push({ type: "merger", seat: 0, tile: t("3A"), sizes: { tower: 2, luxor: 2 }, byBank: true });
	assert.equal(turnPlacements(state).merged, false);
	assert.equal(twoTileLimit(state, t("9G")), undefined);
	state.log.push({ type: "merger", seat: 0, tile: t("3E"), sizes: { american: 2, festival: 2 } });
	assert.equal(turnPlacements(state).merged, true);
	assert.equal(twoTileLimit(state, t("9G")), "foundOrMerge");
});

test("§14.7 twoTiles games created before the relaxed limits replay under them", () => {
	const state = legacy(initGame(3, TWO_TILES, "legacy-two-tiles"));
	let differs = false;
	for (let i = 0; i < 400 && !state.ended; i++) {
		if (state.phase === "place") {
			const relaxed = { ...state, options: { ...state.options, twoTilesRelaxed: true as const } };
			differs ||= state.seats[state.activeSeat]!.hand.some(
				(tile) => blockedThisTurn(state, tile) && !blockedThisTurn(relaxed, tile)
			);
		}
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		play(state, currentSeat(state)!, moves[(i * 7919) % moves.length]!);
	}
	assert.ok(differs, "the game reaches a turn where the original limits block a tile");
	assert.equal("twoTilesRelaxed" in state.options, false);
	assert.deepEqual(wrapper.replay(structuredClone(state)), state);
});
