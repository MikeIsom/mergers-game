import assert from "node:assert/strict";
import { test } from "node:test";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat, dropPlayerSeats } from "./moves.js";
import { positionAt } from "./position.js";
import { replayGame } from "./replay.js";
import { initGame } from "./setup.js";
import { viewFor } from "./view.js";

const OPTIONS: [number, Record<string, unknown>][] = [
	[2, {}],
	[2, { twoPlayerMode: "fourHands" }],
	[3, { publicHoldings: true }],
	[4, { teamPlay: true }],
	[5, { endSize: "31" }],
	[6, { autoEnd: true }],
];

test("replay positions rebuilt from the public log match the seeded replay at every move", () => {
	for (const [players, options] of OPTIONS) {
		const state = initGame(players, options, `position-${players}-${JSON.stringify(options)}`);
		const boundaries = [state.log.length];
		for (let step = 1; !state.ended; step++) {
			if (players >= 3 && step === 90) {
				dropPlayerSeats(state, 1);
			} else {
				const moves = legalMoves(state).filter((move) => move.type !== "announce" || step > 250);
				applyMove(state, moves[(step * 7919) % moves.length]!, currentSeat(state)!);
			}
			boundaries.push(state.log.length);
		}
		// A stripped view carries no seed, so the replay controls must work from it alone.
		const view = viewFor(state, 0);
		for (const to of boundaries) {
			const expected = replayGame(state, to);
			const position = positionAt(view, to);
			const label = `${players} players ${JSON.stringify(options)}, log position ${to}`;
			assert.deepEqual(position.board, expected.board, `${label}: board`);
			assert.deepEqual(position.bank, expected.bank, `${label}: bank shares`);
			assert.deepEqual(
				position.seats,
				expected.seats.map(({ cash, shares, hand }) => ({ cash, shares, tiles: hand.length })),
				`${label}: cash, stock and tile counts`
			);
		}
	}
});
