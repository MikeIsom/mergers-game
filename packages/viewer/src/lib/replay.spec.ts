import assert from "node:assert/strict";
import { test } from "node:test";
import { HIDDEN, initGame, legalMoves, applyMove, currentSeat, type GameState } from "acquire-engine";
import { replayView } from "./replay.ts";

function played(options: Record<string, unknown>): GameState {
	const state = initGame(3, options, "replay-levels");
	for (let step = 1; step < 120 && !state.ended; step++) {
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		applyMove(state, moves[(step * 7919) % moves.length]!, currentSeat(state)!);
	}
	return state;
}

test("replay positions show other seats' holdings only as far as the holdings level allows", () => {
	const at = (state: GameState) => state.log.length;
	const cases: [Record<string, unknown>, (seat: GameState["seats"][number]) => void][] = [
		[{}, (seat) => assert.equal(seat.cash, HIDDEN)],
		[{ holdingsVisibility: "cash" }, (seat) => assert.ok(seat.cash > 0 && seat.shareCount === undefined)],
		[{ holdingsVisibility: "cashAndShareCount" }, (seat) => assert.equal(typeof seat.shareCount, "number")],
	];
	for (const [options, check] of cases) {
		const state = played(options);
		const view = replayView(state, 0, at(state));
		check(view.seats[1]!);
		assert.equal(view.seats[1]!.shares.tower, HIDDEN);
		assert.deepEqual(view.seats[0]!.shares, state.seats[0]!.shares, "your own holdings are shown");
		assert.equal(view.seats[0]!.shareCount, undefined);
	}
	const open = played({ holdingsVisibility: "public" });
	assert.deepEqual(replayView(open, 0, at(open)).seats[1]!.shares, open.seats[1]!.shares);
});
