import assert from "node:assert/strict";
import { test } from "node:test";
import { botMove } from "./bot.js";
import { legalMoves } from "./legal.js";
import { currentSeat } from "./moves.js";
import { replayGame } from "./replay.js";
import { checkInvariants } from "./test/helpers.js";
import type { GameState, Move } from "./types.js";
import { viewFor } from "./view.js";
import * as wrapper from "../wrapper.js";

const SETUPS: [number, Record<string, unknown>][] = [
	[2, { twoPlayerMode: "bank" }],
	[2, { twoPlayerMode: "fourHands", stockSwap: "unlimited" }],
	[3, { twoTiles: true, twoTilesRelaxed: true, handSize: "8" }],
	[4, { teamPlay: true, autoEnd: true, endSize: "31" }],
	[5, { limitedLog: true, sharesPerTurn: "5", stockSwap: "7" }],
	[6, { publicHoldings: true, freeMergerOrder: true, disposalOrder: "shares" }],
	[4, { holdingsVisibility: "cashAndShareCount", deadDrawsReplaced: true }],
];

function playByBots(players: number, options: Record<string, unknown>, seed: string): GameState {
	let state = wrapper.init(players, [], options, seed);
	for (let calls = 0; calls < 3000 && !state.ended; calls++) {
		state = wrapper.moveAI(state, wrapper.currentPlayer(state)!);
	}
	return state;
}

test("bots finish games under every option, with only legal moves, and the games replay exactly", () => {
	SETUPS.forEach(([players, options], i) => {
		const state = playByBots(players, options, `bot-${i}`);
		assert.equal(state.ended, true, JSON.stringify(options));
		checkInvariants(state);
		assert.deepEqual(replayGame(state), state);
		assert.ok(state.log.some((entry) => entry.type === "bought"));
	});
});

test("moveAI plays one turn for its player and leaves other players' decisions alone", () => {
	const state = wrapper.init(3, [], {}, "bot-turn");
	const player = wrapper.currentPlayer(state)!;
	const other = (player + 1) % 3;
	const before = JSON.stringify(state);
	assert.equal(JSON.stringify(wrapper.moveAI(state, other)), before);
	const turn = state.turn;
	const after = wrapper.moveAI(state, player);
	assert.equal(after.turn, turn + 1);
	const moves = after.log.filter((entry) => entry.type === "move");
	assert.ok(moves.length >= 2);
	assert.ok(moves.every((entry) => entry.type === "move" && after.seatOwner[entry.seat] === player && !entry.auto));
});

/** The same game with opponents' hands, the draw order and private holdings rearranged. */
function disguise(state: GameState, player: number): GameState {
	const copy = structuredClone(state);
	const others = copy.seats.flatMap((_, seat) => (copy.seatOwner[seat] === player ? [] : [seat]));
	const pool = copy.pool;
	for (const seat of others) {
		const hand = copy.seats[seat]!.hand;
		copy.seats[seat]!.hand = pool.splice(0, hand.length, ...hand);
	}
	copy.pool = pool.reverse();
	copy.seed = "disguised";
	if (others.length >= 2) {
		const [a, b] = [copy.seats[others[0]!]!, copy.seats[others[1]!]!];
		[a.shares, b.shares, a.cash, b.cash] = [b.shares, a.shares, b.cash, a.cash];
	}
	return copy;
}

test("the bot's decisions never depend on information its player cannot see", () => {
	let checked = 0;
	for (const [players, options] of [
		[4, {}],
		[5, { limitedLog: true }],
		[2, { twoPlayerMode: "fourHands" }],
	] as const) {
		const state = wrapper.init(players, [], options, `bot-fair-${players}`);
		for (let i = 0; i < 4000 && !state.ended; i++) {
			const seat = currentSeat(state)!;
			const player = state.seatOwner[seat]!;
			const move: Move = botMove(viewFor(state, player), player);
			if (i % 7 === 0) {
				const hidden = disguise(state, player);
				assert.deepEqual(botMove(viewFor(hidden, player), player), move);
				checked++;
			}
			assert.ok(legalMoves(state).some((legal) => JSON.stringify(legal) === JSON.stringify(move)));
			wrapper.move(state, move, player);
		}
	}
	assert.ok(checked > 50);
});
