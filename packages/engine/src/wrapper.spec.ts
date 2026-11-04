import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectEngine, type Engine } from "@boardgamers/protocol/engine";
import * as wrapper from "../wrapper.js";
import type { GameState } from "./types.js";

const engine: Engine<GameState, unknown> = wrapper;

test("wrapper: exports every required Engine API method", () => {
	const report = inspectEngine(engine);
	assert.equal(report.compatible, true);
	assert.deepEqual(report.required.missing, []);
});

test("wrapper: init creates one seat per player and a fresh game", () => {
	for (let players = 2; players <= 6; players++) {
		const state = wrapper.init(players, [], {}, "seed");
		assert.equal(state.seats.length, players);
		assert.equal(wrapper.ended(state), false);
		assert.deepEqual(wrapper.scores(state), Array(players).fill(0));
	}
});

test("wrapper: init rejects player counts outside 2-6", () => {
	assert.throws(() => wrapper.init(1, [], {}, "seed"));
	assert.throws(() => wrapper.init(7, [], {}, "seed"));
});

test("wrapper: state is JSON-serializable", () => {
	const state = wrapper.init(4, [], {}, "seed");
	assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test("wrapper: logSlice includes both endpoints", () => {
	const state = wrapper.init(3, [], {}, "seed");
	const length = wrapper.logLength(state);
	assert.ok(length >= 3);
	assert.equal(wrapper.logSlice(state).log.length, length);
	assert.equal(wrapper.logSlice(state, { start: 0, end: 0 }).log.length, 1);
	assert.equal(wrapper.logSlice(state, { start: 1, end: 2 }).log.length, 2);
	assert.equal(wrapper.logSlice(state, { start: length }).log.length, 0);
});

test("wrapper: setPlayerMetaData stores the player name", () => {
	const state = wrapper.setPlayerMetaData(wrapper.init(2, [], {}, "seed"), 1, { name: "Ada" });
	assert.equal(state.seats[1]?.name, "Ada");
});

test("wrapper: BGS setup values for holdingsVisibility reach stripSecret, and scores stay private", () => {
	for (const [raw, cash, shareCount] of [
		[{ holdingsVisibility: "private" }, -1, undefined],
		[{ holdingsVisibility: "cash" }, 6000, undefined],
		[{ holdingsVisibility: "cashAndShareCount" }, 6000, 0],
	] as const) {
		const state = wrapper.init(3, [], raw, "seed");
		const opponent = wrapper.stripSecret(state, 0).seats[1]!;
		assert.equal(opponent.cash, cash, JSON.stringify(raw));
		assert.equal(opponent.shareCount, shareCount);
		assert.deepEqual(wrapper.scores(state), [0, 0, 0]);
	}
	for (const raw of [{ publicHoldings: true }, { holdingsVisibility: "public" }]) {
		const state = wrapper.init(3, [], raw, "seed");
		assert.deepEqual(wrapper.stripSecret(state, 0).seats[1]!.shares, state.seats[1]!.shares);
		assert.deepEqual(wrapper.scores(state), [6000, 6000, 6000]);
	}
});
