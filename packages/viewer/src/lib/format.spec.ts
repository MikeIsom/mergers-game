import assert from "node:assert/strict";
import { test } from "node:test";
import { initGame, type LogEntry } from "acquire-engine";
import { describeEntry, describeEntryParts, langFor } from "./format.ts";
import { LOCALES } from "./i18n.ts";

test("styled log preserves translations, lists and cash formatting", () => {
	const state = initGame(3, {}, "log-colors");
	const entries: LogEntry[] = [
		...state.log,
		{ type: "bought", seat: 0, shares: { tower: 1, luxor: 2 }, cost: 1200 },
		{ type: "merger", seat: 0, tile: 3, sizes: { tower: 5, luxor: 5 } },
		{ type: "mergerPlan", survivor: "tower", defunct: ["luxor", "imperial"] },
		{
			type: "bonuses",
			chain: "luxor",
			size: 5,
			payouts: [
				{ seat: 0, amount: 5000 },
				{ seat: 1, amount: 2500 },
			],
		},
		{ type: "disposed", seat: 1, chain: "luxor", sold: 1, traded: 2, held: 3, proceeds: 500 },
		{ type: "finalSale", seat: 2, chain: "tower", shares: 2, proceeds: 2400 },
		{ type: "result", cash: [15000, 10000, 7000], ranks: [1, 2, 3] },
	];
	for (const locale of LOCALES) {
		const lang = langFor(locale);
		for (const entry of entries) {
			assert.equal(
				describeEntryParts(state, entry, lang)
					?.map((part) => part.text)
					.join(""),
				describeEntry(state, entry, lang),
				`${locale}: ${entry.type}`
			);
		}
	}
});

test("player names cannot be mistaken for chain names, markup or formatting tokens", () => {
	const state = initGame(3, {}, "log-colors");
	for (const name of ["Tower", "<img src=x>", "\uFFF90\uFFFB"]) {
		state.seats[0]!.name = name;
		const parts = describeEntryParts(
			state,
			{ type: "bought", seat: 0, shares: { tower: 1 }, cost: 200 },
			langFor("en")
		)!;
		assert.deepEqual(
			parts.filter((part) => part.kind === "player"),
			[{ kind: "player", seat: 0, text: name }]
		);
		assert.deepEqual(
			parts.filter((part) => part.kind === "chain"),
			[{ kind: "chain", chain: "tower", text: "Tower" }]
		);
		assert.deepEqual(
			parts.filter((part) => part.kind === "money"),
			[{ kind: "money", text: "$200" }]
		);
	}
});
