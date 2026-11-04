import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, type Move } from "acquire-engine";
import * as engine from "acquire-engine/wrapper";
import { preparedPosition } from "../tutorial/lessons.ts";
import { langFor } from "./format.ts";
import { holdingsAfter, moveEffect, turnSummary } from "./turn-summary.ts";

const lang = langFor("en");
const text = (lines: ReturnType<typeof turnSummary>) =>
	lines.map((line) => line.parts.map((part) => part.text).join(""));

test("the turn summary lists this turn's moves, then the pending move and the cash it leaves", () => {
	const full = preparedPosition("founding");
	const start = full.log.length;
	applyMove(full, { type: "place", tile: "2A" }, 0);
	const afterPlace = full.log.length;
	applyMove(full, { type: "found", chain: "tower" }, 0);
	const view = engine.stripSecret(full, 0);
	const buy: Move = { type: "buy", shares: { tower: 2 } };

	const lines = turnSummary(view, buy, lang, afterPlace);
	assert.deepEqual(text(lines), [
		"Alex placed 2A",
		"Alex founded Tower (2 tiles) and received a free share",
		"Alex bought 2 Tower for $400",
	]);
	assert.deepEqual(
		lines.map((line) => [line.final, line.pending]),
		[
			[true, false],
			[false, false],
			[false, true],
		]
	);
	assert.ok(turnSummary(view, buy, lang, start).every((line) => !line.final));

	const effect = moveEffect(view, buy)!;
	assert.deepEqual(effect, { cash: -400, shares: { tower: 2 } });
	assert.deepEqual(holdingsAfter(view, effect), {
		cash: { before: 6000, after: 5600 },
		shares: [{ chain: "tower", before: 1, after: 3 }],
	});
});

test("disposal and swap effects use the defunct sale price, the 2:1 trade and current prices", () => {
	const full = preparedPosition("mergers");
	applyMove(full, { type: "place", tile: "4A" }, 0);
	const view = engine.stripSecret(full, 0);
	assert.equal(view.phase, "dispose");
	const dispose: Move = { type: "dispose", sell: 1, trade: 2 };
	assert.deepEqual(moveEffect(view, dispose), { cash: 200, shares: { luxor: -3, tower: 1 } });
	const after = holdingsAfter(view, moveEffect(view, dispose)!);
	assert.equal(after.cash.after - after.cash.before, 200);
	assert.deepEqual(
		after.shares.map(({ chain, before, after }) => [chain, before, after]),
		[
			["tower", 0, 1],
			["luxor", 3, 0],
			["festival", 1, 1],
		]
	);
	assert.equal(
		text(turnSummary(view, dispose, lang, 0)).at(-1),
		"Alex sold 1 Luxor share for $200 and traded 2 Luxor shares for 1 of the survivor"
	);

	// Merger moves pay bonuses that may depend on hidden holdings: no forecast.
	const before = preparedPosition("mergers");
	assert.equal(moveEffect(engine.stripSecret(before, 0), { type: "place", tile: "4A" }), undefined);
	assert.deepEqual(moveEffect(engine.stripSecret(before, 0), { type: "place", tile: "12I" }), { cash: 0, shares: {} });
	assert.deepEqual(moveEffect(view, { type: "swap", from: "tower", to: "luxor", count: 1 })?.shares, {
		tower: -1,
		luxor: 1,
	});
});
