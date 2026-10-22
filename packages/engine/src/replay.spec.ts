import assert from "node:assert/strict";
import { test } from "node:test";
import { legalMoves } from "./legal.js";
import { initGame } from "./setup.js";
import type { GameState } from "./types.js";
import * as wrapper from "../wrapper.js";

/** A few hundred deterministic moves, with a drop part-way through. */
function playedGame(): { state: GameState; boundaries: number[] } {
	const state = initGame(4, { teamPlay: true, endSize: "31" }, "replay-unit");
	wrapper.setPlayerMetaData(state, 2, { name: "Ada" });
	const boundaries = [wrapper.logLength(state)];
	for (let step = 1; !state.ended && step < 400; step++) {
		if (step === 60) {
			wrapper.dropPlayer(state, 3);
		} else {
			const moves = legalMoves(state).filter((move) => move.type !== "announce");
			wrapper.move(state, moves[(step * 7919) % moves.length]!, wrapper.currentPlayer(state)!);
		}
		boundaries.push(wrapper.logLength(state));
	}
	return { state, boundaries };
}

test("replay without `to` rebuilds the current state, keeping player names", () => {
	const { state } = playedGame();
	const replayed = wrapper.replay(structuredClone(state));
	assert.deepEqual(replayed, state);
	assert.equal(replayed.seats[2]!.name, "Ada");
});

test("replay to a move boundary returns exactly that log length (BGS undo and analysis check this)", () => {
	const { state, boundaries } = playedGame();
	for (const to of [boundaries[0]!, boundaries[1]!, boundaries[60]!, boundaries[61]!, boundaries.at(-2)!]) {
		assert.equal(wrapper.logLength(wrapper.replay(state, { to })), to);
	}
});

test("replay rejects positions that are not between two moves", () => {
	const { state, boundaries } = playedGame();
	const inside = boundaries.find((to, i) => i > 0 && to - boundaries[i - 1]! > 1)! - 1;
	assert.throws(() => wrapper.replay(state, { to: inside }), /not between two moves/);
	assert.throws(() => wrapper.replay(state, { to: 1 }), /not between two moves/);
	assert.throws(() => wrapper.replay(state, { to: state.log.length + 1 }), /Cannot replay/);
	assert.throws(() => wrapper.replay(state, { to: -1 }), /Cannot replay/);
});

test("replay refuses a stripped state, which has no seed", () => {
	const { state } = playedGame();
	assert.throws(() => wrapper.replay(wrapper.stripSecret(state, 0)), /full game state/);
});

test("replay throws rather than rewriting history when the log does not match", () => {
	const { state } = playedGame();
	const tampered = structuredClone(state);
	const index = tampered.log.findIndex((entry) => entry.type === "bought" && entry.cost > 0);
	const entry = tampered.log[index]!;
	assert.ok(entry.type === "bought");
	entry.cost += 100;
	assert.throws(() => wrapper.replay(tampered), new RegExp(`diverged at log entry ${index}`));
});

test("replay does not change the state it is given", () => {
	const { state, boundaries } = playedGame();
	const before = structuredClone(state);
	wrapper.replay(state, { to: boundaries[30]! });
	assert.deepEqual(state, before);
});
