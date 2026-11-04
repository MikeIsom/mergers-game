import assert from "node:assert/strict";
import { test } from "node:test";
import * as wrapper from "../wrapper.js";
import { legalMoves } from "./legal.js";
import { logWindowStart } from "./limited-log.js";
import { applyMove, currentSeat } from "./moves.js";
import { normalizeOptions } from "./options.js";
import { initGame } from "./setup.js";
import { simpleLine } from "./simple.js";
import type { GameState, LogEntry } from "./types.js";

const LIMITED = { limitedLog: true };

function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/** Plays random legal moves (never announcing) until `done` holds or the game ends. */
function playUntil(state: GameState, random: () => number, done: (state: GameState) => boolean = () => false) {
	while (!state.ended && !done(state)) {
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		applyMove(state, moves[Math.floor(random() * moves.length)]!, currentSeat(state)!);
	}
}

function turnIndexes(state: GameState, seat: number): number[] {
	return state.log.flatMap((entry, index) => (entry.type === "turn" && entry.seat === seat ? [index] : []));
}

const hiddenCount = (log: LogEntry[]) => log.filter((entry) => entry.type === "hidden").length;

test("§15 limitedLog defaults off: every viewer gets the whole log", () => {
	assert.equal("limitedLog" in normalizeOptions(3, {}).options, false);
	assert.equal(normalizeOptions(3, { limitedLog: "true" }).options.limitedLog, undefined);
	assert.equal(normalizeOptions(3, LIMITED).options.limitedLog, true);
	const state = initGame(3, {}, "full-log");
	playUntil(state, lcg(1), (s) => s.turn > 12);
	for (const player of [0, 1, 2, undefined]) {
		assert.deepEqual(wrapper.stripSecret(state, player).log, state.log);
	}
});

/** Index of the `count`-th last turn entry (1 = the current turn). */
function nthLastTurn(state: GameState, count: number): number {
	return state.log.flatMap((entry, index) => (entry.type === "turn" ? [index] : [])).at(-count)!;
}

test("§13 limitedLog: everyone sees the current turn and the full round before it, with setup kept", () => {
	const state = initGame(4, LIMITED, "window");
	playUntil(state, lcg(2), (s) => s.turn > 14 && s.phase === "place");
	const start = nthLastTurn(state, 5);
	assert.equal(logWindowStart(state), start);
	const spectator = wrapper.stripSecret(state, undefined).log;
	for (const player of [0, 1, 2, 3]) {
		const view = wrapper.stripSecret(state, player);
		assert.equal(view.log.length, state.log.length, "the log keeps its length for turn drafts");
		view.log.forEach((entry, index) => {
			const setup = ["init", "optionIgnored", "turnOrder"].includes(state.log[index]!.type);
			assert.deepEqual(entry, index >= start || setup ? state.log[index] : { type: "hidden" }, `entry ${index}`);
		});
		assert.deepEqual(view.log, spectator, "every seat and spectators see the same window");
		assert.ok(hiddenCount(view.log) > 0);
		// The window always reaches back to the start of your own previous turn.
		assert.ok(start <= turnIndexes(state, player).at(player === state.activeSeat ? -2 : -1)!);
	}
});

test("§13 limitedLog: seat 0 sees the full previous round during seat 1's turn (owner's report)", () => {
	const state = initGame(4, LIMITED, "first-seat");
	playUntil(state, lcg(7), (s) => s.turn > 8 && s.activeSeat === 1 && s.phase === "place");
	const start = nthLastTurn(state, 5);
	const view = wrapper.stripSecret(state, 0).log;
	assert.deepEqual(view.slice(start), state.log.slice(start));
	assert.deepEqual(
		state.log.slice(start).flatMap((entry) => (entry.type === "turn" ? [entry.seat] : [])),
		[1, 2, 3, 0, 1],
		"seat 0 sees seats 1, 2 and 3's turns as well as its own"
	);
	assert.ok(start < turnIndexes(state, 0).at(-1)!, "the old rule started at seat 0's own turn, hiding the others");
});

test("§13 limitedLog: four-hands uses all four seats for the round, for players and spectators", () => {
	const state = initGame(2, { ...LIMITED, twoPlayerMode: "fourHands" }, "four-hands-window");
	playUntil(state, lcg(2), (s) => s.turn > 14 && s.phase === "place");
	assert.equal(logWindowStart(state), nthLastTurn(state, 5));
	assert.deepEqual(wrapper.stripSecret(state).log, wrapper.stripSecret(state, 0).log);
	assert.deepEqual(wrapper.stripSecret(state, 1).log, wrapper.stripSecret(state, 0).log);
});

test("§13 limitedLog: the window is never shorter than the old one from your own last turn", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of [LIMITED, { ...LIMITED, twoPlayerMode: "fourHands" }]) {
			const state = initGame(players, options, `never-less-${players}`);
			const random = lcg(players * 13);
			while (!state.ended) {
				const start = logWindowStart(state);
				for (let seat = 0; seat < state.seats.length; seat++) {
					const own = turnIndexes(state, seat).filter((index) => index < nthLastTurn(state, 1));
					if (own.length > 0) {
						assert.ok(start <= own.at(-1)!, `${players} players, seat ${seat}`);
					}
				}
				const moves = legalMoves(state).filter((move) => move.type !== "announce");
				applyMove(state, moves[Math.floor(random() * moves.length)]!, currentSeat(state)!);
			}
		}
	}
});

test("§13 limitedLog: a merger in progress stays fully visible to every disposer", () => {
	const state = initGame(4, LIMITED, "mergers");
	const random = lcg(6);
	let disposals = 0;
	while (!state.ended && disposals < 20) {
		if (state.phase === "dispose") {
			const current = state.log.map((entry) => entry.type).lastIndexOf("turn");
			const view = wrapper.stripSecret(state, state.seatOwner[currentSeat(state)!]);
			assert.deepEqual(view.log.slice(current), state.log.slice(current));
			disposals++;
		}
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		applyMove(state, moves[Math.floor(random() * moves.length)]!, currentSeat(state)!);
	}
	assert.ok(disposals > 0, "the game reached a stock disposal");
});

test("§13 limitedLog: visible turn summaries cannot reveal an earlier hidden turn", () => {
	const state = initGame(4, LIMITED, "summary-window");
	playUntil(state, lcg(2), (s) => s.turn > 14 && s.phase === "place");
	const start = logWindowStart(state);
	for (const player of [0, 1, 2, 3, undefined]) {
		assert.ok(start > 0);
		const view = wrapper.stripSecret(state, player);
		assert.equal(view.log[start - 1]!.type, "hidden");
		const slice = wrapper.logSlice(state, { player, start, end: start }).log;
		assert.equal(slice[0]!.simple, simpleLine(state, state.log[start]!));
	}
});

test("§13 limitedLog: the whole log is revealed once the game ends", () => {
	const state = initGame(3, LIMITED, "revealed");
	playUntil(state, lcg(3));
	assert.equal(state.ended, true);
	for (const player of [0, 1, 2, undefined]) {
		assert.deepEqual(wrapper.stripSecret(state, player).log, state.log);
		assert.equal(hiddenCount(wrapper.logSlice(state, { player }).log), 0);
	}
});

test("§13 limitedLog: logSlice hides the same entries, and new entries are never hidden", () => {
	const state = initGame(3, LIMITED, "slice");
	const random = lcg(4);
	playUntil(state, random, (s) => s.turn > 10);
	for (const player of [0, 1, 2, undefined]) {
		const { log } = wrapper.logSlice(state, { player });
		assert.deepEqual(
			log.map(({ simple: _simple, ...entry }) => entry),
			wrapper.stripSecret(state, player).log
		);
		for (const entry of log) {
			assert.ok(entry.simple.length > 0);
		}
	}
	const before = state.log.length;
	playUntil(state, random, (s) => s.log.length > before + 5);
	for (const player of [0, 1, 2]) {
		assert.equal(hiddenCount(wrapper.logSlice(state, { player, start: before }).log), 0);
	}
});

test("§13 limitedLog: legal moves and turn drafts work from a player's limited view", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of [LIMITED, { ...LIMITED, twoTiles: true, stockSwap: "unlimited" }]) {
			const state = initGame(players, options, `view-${players}`);
			const random = lcg(players);
			for (let i = 0; i < 300 && !state.ended; i++) {
				const seat = currentSeat(state)!;
				const view = wrapper.stripSecret(state, state.seatOwner[seat]);
				assert.deepEqual(legalMoves(view), legalMoves(state), `${players} players, move ${i}`);
				const moves = legalMoves(state).filter((move) => move.type !== "announce");
				applyMove(state, moves[Math.floor(random() * moves.length)]!, seat);
			}
		}
	}
	const state = initGame(3, LIMITED, "draft");
	playUntil(state, lcg(5), (s) => s.turn > 9 && s.phase === "place");
	const player = wrapper.currentPlayer(state)!;
	const view = wrapper.stripSecret(state, player);
	const move = legalMoves(view).find((m) => m.type === "place")!;
	const result = wrapper.move(state, { type: "turn", from: view.log.length, moves: [move] }, player);
	assert.equal(result.log.length > state.log.length || result.tentative !== undefined, true);
});
