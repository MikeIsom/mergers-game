import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAIN_IDS } from "./config.js";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat } from "./moves.js";
import { initGame } from "./setup.js";
import { parseTile } from "./tiles.js";
import { chainAt, scenario } from "./test/helpers.js";
import type { GameState, LogEntry } from "./types.js";
import { simpleLine } from "./simple.js";
import { HIDDEN, seatsOf } from "./view.js";
import * as wrapper from "../wrapper.js";

const OPTION_SETS: Record<string, unknown>[] = [
	{},
	{ publicHoldings: true },
	{ teamPlay: true },
	{ twoPlayerMode: "fourHands" },
	{ twoPlayerMode: "fourHands", publicHoldings: true },
];

function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/**
 * Plays a random game, calling `inspect` on the starting state, after every `every`-th move,
 * and on the final state.
 */
function randomGame(
	players: number,
	options: Record<string, unknown>,
	seed: string,
	inspect: (state: GameState) => void,
	every = 1
) {
	const state = initGame(players, options, seed);
	const random = lcg(seed.length * 7919 + players);
	inspect(state);
	for (let moveCount = 1; !state.ended; moveCount++) {
		const moves = legalMoves(state);
		// Announce rarely so games run long enough to reach mergers and late-game positions.
		const pool = random() < 0.05 ? moves : moves.filter((move) => move.type !== "announce");
		const move = (pool.length > 0 ? pool : moves)[Math.floor(random() * (pool.length || moves.length))]!;
		applyMove(state, move, currentSeat(state)!);
		if (moveCount % every === 0 || state.ended) {
			inspect(state);
		}
	}
	return state;
}

function viewers(state: GameState): (number | undefined)[] {
	return [...Array.from({ length: state.players }, (_, player) => player), undefined];
}

/** The state with every field the viewer may not see replaced by a fixed marker, for comparison. */
function withoutSecrets(state: GameState, player: number | undefined): unknown {
	const own = seatsOf(state, player);
	const holdingsPublic = state.options.publicHoldings || state.ended;
	return {
		...state,
		seed: "",
		rngCounter: 0,
		pool: state.pool.length,
		seats: state.seats.map((seat, index) =>
			own.includes(index)
				? seat
				: {
						...seat,
						hand: seat.hand.length,
						...(holdingsPublic ? {} : { cash: "hidden", shares: "hidden" }),
					}
		),
	};
}

test("§13 each viewer's state hides exactly the private fields and passes everything else through", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of OPTION_SETS) {
			randomGame(
				players,
				options,
				`view-${players}-${JSON.stringify(options)}`,
				(state) => {
					const before = structuredClone(state);
					for (const player of viewers(state)) {
						const view = wrapper.stripSecret(state, player);
						const own = seatsOf(state, player);
						const holdingsPublic = state.options.publicHoldings || state.ended;

						assert.equal(view.seed, "", "§13 the seed (which fixes the pool order) is never sent");
						assert.equal(view.rngCounter, 0);
						assert.equal(view.pool.length, state.pool.length);
						assert.ok(
							view.pool.every((tile) => tile === HIDDEN),
							"§13 the pool order is always private"
						);

						view.seats.forEach((seat, index) => {
							if (own.includes(index)) {
								assert.deepEqual(seat, state.seats[index], "a player sees all of their own seat");
								return;
							}
							assert.equal(seat.hand.length, state.seats[index]!.hand.length);
							assert.ok(
								seat.hand.every((tile) => tile === HIDDEN),
								"§13 other players' hands are private"
							);
							if (holdingsPublic) {
								assert.equal(seat.cash, state.seats[index]!.cash);
								assert.deepEqual(seat.shares, state.seats[index]!.shares);
							} else {
								assert.equal(seat.cash, HIDDEN, "§13 other players' cash is private");
								assert.ok(
									CHAIN_IDS.every((chain) => seat.shares[chain] === HIDDEN),
									"§13 other players' stock is private"
								);
							}
						});

						const masked = withoutSecrets(view, player) as Record<string, unknown>;
						const expected = withoutSecrets({ ...state, supportsTurnDrafts: true }, player) as Record<string, unknown>;
						assert.deepEqual(masked, expected, "§13 the board, chains, bank, merger and log stay public");
					}
					assert.deepEqual(state, before, "stripSecret never changes the real state");
				},
				3
			);
		}
	}
});

test("§13 a viewer cannot tell apart games that differ only in what is hidden from them", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of OPTION_SETS) {
			randomGame(
				players,
				options,
				`indist-${players}-${JSON.stringify(options)}`,
				(state) => {
					for (const player of viewers(state)) {
						const own = seatsOf(state, player);
						const variant = structuredClone(state);
						variant.seed = `${state.seed}-different`;
						variant.rngCounter += 17;
						variant.pool.reverse();
						const other = variant.seats.findIndex((seat, index) => !own.includes(index) && seat.hand.length > 0);
						if (other >= 0 && variant.pool.length > 0) {
							const opponent = variant.seats[other]!;
							[opponent.hand[0], variant.pool[0]] = [variant.pool[0]!, opponent.hand[0]!];
						}
						if (!state.options.publicHoldings && !state.ended) {
							variant.seats.forEach((seat, index) => {
								if (!own.includes(index)) {
									seat.cash += 100;
									seat.shares.tower += 1;
								}
							});
						}
						assert.deepEqual(
							JSON.stringify(wrapper.stripSecret(variant, player)),
							JSON.stringify(wrapper.stripSecret(state, player)),
							`viewer ${player} could distinguish hidden information`
						);
					}
				},
				10
			);
		}
	}
});

function loggedTiles(entry: LogEntry): number[] {
	switch (entry.type) {
		case "turnOrder":
		case "discarded":
			return entry.tiles;
		case "merger":
		case "bankTile":
			return [entry.tile];
		case "bonuses":
			return entry.bank?.tile != null ? [entry.bank.tile] : [];
		case "move":
			return entry.move.type === "place" ? [parseTile(entry.move.tile)!] : [];
		default:
			return [];
	}
}

test("§13 the log never names a tile that is still in the pool or in any hand", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of OPTION_SETS) {
			randomGame(players, options, `log-${players}-${JSON.stringify(options)}`, (state) => {
				const secret = new Set([...state.pool, ...state.seats.flatMap((seat) => seat.hand)]);
				for (const entry of state.log) {
					for (const tile of loggedTiles(entry)) {
						assert.ok(!secret.has(tile), `${entry.type} names a private tile`);
					}
					if (entry.type === "drew") {
						assert.deepEqual(Object.keys(entry).sort(), ["count", "seat", "type"], "§13 draws only show how many");
					}
				}
				const serialized = JSON.stringify(state.log);
				assert.ok(!serialized.includes(state.seed), "§13 the seed never appears in the log");
			});
		}
	}
});

const TILE_LABEL = /\b(?:1[0-2]|[1-9])[A-I]\b/g;

test("§13 simple lines never name a tile still in the pool or a hand, or reveal a private holding", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of OPTION_SETS) {
			let checked = 0;
			randomGame(players, options, `simple-${players}-${JSON.stringify(options)}`, (state) => {
				const secret = new Set([...state.pool, ...state.seats.flatMap((seat) => seat.hand)]);
				// A tile only ever leaves the pool and hands, so each entry is checked once, as soon
				// as it exists.
				const entries = wrapper.logSlice(state, { start: checked }).log;
				checked = state.log.length;
				for (const entry of entries) {
					const line = entry.simple;
					assert.ok(line && !/^[[{"]/.test(line), `${entry.type} has a plain-text simple line`);
					for (const label of line.match(TILE_LABEL) ?? []) {
						assert.ok(!secret.has(parseTile(label)!), `§13 "${line}" names a private tile`);
					}
					if (entry.type === "drew") {
						assert.equal(line.match(TILE_LABEL), null, "§13 draws only show how many");
					}
					assert.ok(!line.includes(state.seed), "§13 the seed never appears in a simple line");
					if (entry.type === "disposed" && !state.options.publicHoldings) {
						const { simple: _, ...stored } = entry;
						assert.equal(
							simpleLine(state, { ...stored, held: stored.held + 7 }),
							line,
							`§13 "${line}" reveals how many shares were kept`
						);
					}
				}
			});
		}
	}
});

test("§13 logSlice is the same for every player and spectator", () => {
	const state = randomGame(4, {}, "log-same", () => {});
	const spectator = wrapper.logSlice(state, {});
	for (const player of [0, 1, 2, 3]) {
		assert.deepEqual(wrapper.logSlice(state, { player }), spectator);
	}
});

test("§13 after the game ends, holdings and cash become public but hands and the pool stay private", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A"]),
		hands: [["9G"], ["9I", "12A"], ["11G"]],
		shares: [{}, { luxor: 3 }],
		cash: [6000, 4100, 6000],
	});
	assert.equal(wrapper.stripSecret(state, 0).seats[1]!.cash, HIDDEN);
	applyMove(state, { type: "announce" }, 0);
	applyMove(state, { type: "place", tile: "9G" }, 0);
	applyMove(state, { type: "buy", shares: {} }, 0);
	assert.equal(state.ended, true);
	const view = wrapper.stripSecret(state, 0);
	assert.equal(view.seats[1]!.cash, 4100);
	assert.equal(view.seats[1]!.shares.luxor, 3);
	assert.deepEqual(view.seats[1]!.hand, [HIDDEN, HIDDEN]);
	assert.ok(view.pool.every((tile) => tile === HIDDEN));
});

test("§13 the engine asks BGS to hash the seed before init, since it fixes hidden tile order", () => {
	assert.equal(wrapper.hashSeed, true);
});

test("§13 an unknown player index is treated as a spectator", () => {
	const state = initGame(3, {}, "unknown-viewer");
	assert.deepEqual(wrapper.stripSecret(state, 9), wrapper.stripSecret(state, undefined));
});
