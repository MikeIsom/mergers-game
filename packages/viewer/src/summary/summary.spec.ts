import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAIN_IDS, applyMove, currentSeat, legalMoves, type GameState } from "acquire-engine";
import * as engine from "acquire-engine/wrapper";
import { summarize } from "./summary.ts";

function playOut(players: number, options: Record<string, unknown>, seed: string): GameState {
	const state = engine.init(players, [], options, seed);
	let rng = seed.length + 1;
	for (let i = 0; i < 20000 && !state.ended; i++) {
		const moves = legalMoves(state);
		const pick = moves.filter((m) => m.type !== "announce");
		rng = (Math.imul(rng, 1103515245) + 12345) >>> 0;
		const list = pick.length > 0 && i < 4000 ? pick : moves;
		applyMove(state, list[rng % list.length]!, currentSeat(state)!);
	}
	assert.ok(state.ended, "game finished");
	return state;
}

const CASES: [number, Record<string, unknown>][] = [
	[4, {}],
	[2, {}],
	[2, { twoPlayerMode: "fourHands" }],
	[4, { teamPlay: true, stockSwap: "3", twoTiles: true }],
	[6, { freeMergerOrder: true, disposalOrder: "shares", sharesPerTurn: "5" }],
];

test("every seat's money sources add up to its final cash, in every mode", () => {
	for (const [players, options] of CASES) {
		for (const seed of ["s1", "s2", "s3"]) {
			const state = playOut(players, options, seed);
			const summary = summarize(state);
			assert.ok(summary.balanced, `${JSON.stringify(options)} ${seed}: replayed cash matches`);
			summary.seats.forEach((s, seat) => {
				const bonuses = CHAIN_IDS.reduce((sum, c) => sum + s.bonusFirst[c] + s.bonusSecond[c], 0);
				const finals = CHAIN_IDS.reduce((sum, c) => sum + s.finalSales[c], 0);
				assert.equal(s.start + bonuses + s.mergerSales + finals + s.swapNet - s.buys, state.seats[seat]!.cash);
			});
			assert.equal(summary.timeline.at(-1)!.worth.join(), state.seats.map((s) => s.cash).join());
		}
	}
});
