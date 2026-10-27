import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, initGame, legalMoves, currentSeat, type Move, type LogEntry } from "acquire-engine";
import { ActionSoundTracker, cueForEntries } from "./sounds.ts";
import { lesson } from "../tutorial/lessons.ts";

test("action sounds start silently, ignore duplicates, rewinds and multi-move catch-up", () => {
	const state = initGame(3, {}, "sound-test");
	const tracker = new ActionSoundTracker();
	assert.equal(tracker.observe(state), undefined);
	const before = structuredClone(state);
	applyMove(
		state,
		legalMoves(state).find((m) => m.type === "place")!,
		currentSeat(state)!
	);
	assert.ok(tracker.observe(state));
	assert.equal(tracker.observe(state), undefined);
	assert.equal(tracker.observe(before), undefined);
	for (let i = 0; i < 3; i++) {
		applyMove(state, legalMoves(state)[0]!, currentSeat(state)!);
	}
	assert.equal(tracker.observe(state), undefined);
});

test("real founding, merger, bonus, trade and final scoring events choose one fitting cue", async () => {
	const founding = lesson("founding", "en");
	const state = founding.initialState();
	const observeMove = async (options: typeof founding, game: typeof state, move: Move) => {
		const from = game.log.length;
		await options.move(game, move);
		return cueForEntries(game.log.slice(from));
	};
	assert.equal(await observeMove(founding, state, { type: "place", tile: "2A" }), "place");
	assert.equal(await observeMove(founding, state, { type: "found", chain: "tower" }), "found");
	// Normal purchases are a cash cue; the tutorial itself stays silent.
	const from = state.log.length;
	applyMove(state, { type: "buy", shares: { tower: 2 } }, 0);
	assert.equal(cueForEntries(state.log.slice(from)), "cash");
	const merger = lesson("mergers", "en");
	const second = merger.initialState();
	assert.equal(await observeMove(merger, second, { type: "place", tile: "4A" }), "merge");
	const beforeTrade = second.log.length;
	applyMove(second, { type: "dispose", sell: 1, trade: 2 }, 0);
	assert.equal(cueForEntries(second.log.slice(beforeTrade)), "cash");
	const scoring = lesson("scoring", "en");
	const end = scoring.initialState();
	assert.equal(await observeMove(scoring, end, { type: "announce" }), undefined);
	assert.equal(await observeMove(scoring, end, { type: "place", tile: "12A" }), "place");
	assert.equal(await observeMove(scoring, end, { type: "buy", shares: {} }), "end");
});

test("bonuses and trades sound, but keeping shares and buying nothing stay quiet", () => {
	const move: LogEntry = { type: "move", seat: 0, move: { type: "dispose", sell: 0, trade: 0 } };
	assert.equal(
		cueForEntries([move, { type: "bonuses", chain: "festival", size: 2, payouts: [{ seat: 0, amount: 4500 }] }]),
		"cash"
	);
	assert.equal(
		cueForEntries([move, { type: "disposed", seat: 0, chain: "festival", sold: 0, traded: 2, held: 0, proceeds: 0 }]),
		"cash"
	);
	assert.equal(
		cueForEntries([move, { type: "disposed", seat: 0, chain: "festival", sold: 0, traded: 0, held: 1, proceeds: 0 }]),
		undefined
	);
	assert.equal(
		cueForEntries([
			{ type: "move", seat: 0, move: { type: "buy", shares: {} } },
			{ type: "bought", seat: 0, shares: {}, cost: 0 },
		]),
		undefined
	);
});
