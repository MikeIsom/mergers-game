import assert from "node:assert/strict";
import { test } from "node:test";
import { type Move } from "acquire-engine";
import * as engine from "acquire-engine/wrapper";
import { preparedPosition } from "../tutorial/lessons.ts";
import { TurnDraft } from "./turn-draft.ts";

function setup() {
	const full = preparedPosition("founding");
	const base = engine.stripSecret(full, 0);
	const draft = new TurnDraft();
	draft.committed(base);
	const accept = (move: Move) => {
		const request = draft.begin(move);
		const result = engine.move(full, request, 0);
		const view = engine.logSlice(result, { player: 0 }).preview!;
		assert.equal(draft.accept(view, 0), true);
		return view;
	};
	return { full, base, draft, accept };
}

const place: Move = { type: "place", tile: "2A" };
const found: Move = { type: "found", chain: "tower" };

test("undo uses authoritative snapshots and discards changed choices from the next request", () => {
	const { draft, base, accept } = setup();
	const placed = accept(place);
	accept(found);
	assert.deepEqual(draft.undo(), placed);
	const replaced = accept({ type: "found", chain: "luxor" });
	assert.equal(replaced.board[0], "luxor");
	const final = draft.begin({ type: "buy", shares: {} });
	assert.deepEqual(final.moves, [place, { type: "found", chain: "luxor" }, { type: "buy", shares: {} }]);
	assert.equal(draft.undo(), undefined, "cannot undo an in-flight request");
	draft.reject(final);
	draft.undo();
	assert.deepEqual(draft.undo(), base);
	assert.equal(draft.count, 0);
});

test("saved-state refreshes do not erase pending or accepted choices", () => {
	const { draft, base, accept } = setup();
	accept(place);
	assert.equal(draft.committed(structuredClone(base)), false);
	const request = draft.begin(found);
	assert.equal(draft.committed(structuredClone(base)), false);
	assert.deepEqual(draft.pending, request);
	draft.reject(request);
	assert.equal(draft.count, 1);
});

test("rejected, stale, duplicate and other-player responses do not corrupt a draft", () => {
	const { draft, full, accept } = setup();
	const placed = accept(place);
	assert.equal(draft.accept(placed, 0), false);
	const request = draft.begin(found);
	const founded = engine.stripSecret(engine.move(full, request, 0), 0);
	assert.equal(draft.accept(placed, 0), false);
	assert.equal(draft.accept(founded, 1), false);
	assert.equal(draft.reject({ ...request, from: -1 }), false);
	assert.equal(draft.reject(request), true);
	assert.equal(draft.accept(founded, 0), false);
	assert.equal(draft.count, 1);
	assert.equal(draft.begin({ type: "found", chain: "luxor" }).moves.length, 2);
});

test("new committed states and player changes close undo; repeated revisions stay bounded", () => {
	const { draft, full, base, accept } = setup();
	for (let i = 0; i < 50; i++) {
		accept(place);
		assert.deepEqual(draft.undo(), base);
	}
	accept(place);
	accept(found);
	const result = engine.move(full, draft.begin({ type: "buy", shares: {} }), 0);
	assert.equal(draft.committed(engine.stripSecret(result, 0)), true);
	assert.equal(draft.count, 0);
	assert.equal(draft.undo(), undefined);
	assert.equal(draft.pending, undefined);
	draft.reset();
	assert.equal(draft.base, undefined);
});
