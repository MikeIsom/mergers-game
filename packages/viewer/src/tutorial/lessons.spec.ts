import assert from "node:assert/strict";
import { test } from "node:test";
import { createTutorial } from "@boardgamers/protocol/tutorial";
import { allTiles, CHAIN_IDS, viewFor, HIDDEN, type Move } from "acquire-engine";
import { CHAPTERS, lesson, preparedPosition, type Chapter } from "./lessons.ts";
import { LOCALES } from "../lib/i18n.ts";

const solutions: Record<Chapter, Move[]> = {
	founding: [
		{ type: "place", tile: "2A" },
		{ type: "found", chain: "tower" },
		{ type: "buy", shares: { tower: 2 } },
	],
	mergers: [
		{ type: "place", tile: "4A" },
		{ type: "dispose", sell: 1, trade: 2 },
		{ type: "buy", shares: {} },
	],
	scoring: [{ type: "announce" }, { type: "place", tile: "12A" }, { type: "buy", shares: {} }],
};

for (const chapter of CHAPTERS) {
	test(`${chapter}: prepared position conserves tiles and shares and hides opponents' hands`, () => {
		const state = preparedPosition(chapter);
		const tiles = [
			...state.pool,
			...state.seats.flatMap((seat) => seat.hand),
			...allTiles().filter((tile) => state.board[tile] !== null),
		];
		assert.equal(tiles.length, 108);
		assert.equal(new Set(tiles).size, 108);
		for (const chain of CHAIN_IDS) {
			assert.equal(state.bank[chain] + state.seats.reduce((sum, seat) => sum + seat.shares[chain], 0), 25);
		}
		const shown = viewFor(state, 0);
		assert.ok(shown.seats[1]!.hand.every((tile) => tile === HIDDEN));
		assert.equal(shown.seats[1]!.cash, HIDDEN);
	});
	test(`${chapter}: all languages finish, persist, retry and replay with the real engine`, async () => {
		for (const locale of LOCALES) {
			const saved = new Map<string, string>();
			const storage = {
				getItem: (key: string) => saved.get(key) ?? null,
				setItem: (key: string, value: string) => {
					saved.set(key, value);
				},
			};
			const options = { ...lesson(chapter, locale), storage };
			const controller = await createTutorial(options);
			const first = solutions[chapter][0]!;
			assert.equal(await controller.play(first), true);
			const afterFirst = structuredClone(controller.snapshot.state);
			await controller.previousStep();
			assert.equal(controller.snapshot.step, 0);
			assert.equal(await controller.play(first), true);
			assert.deepEqual(controller.snapshot.state, afterFirst);
			await controller.restartStep();
			assert.equal(controller.snapshot.step, 1);
			const resumed = await createTutorial(options);
			assert.deepEqual(resumed.snapshot.state, controller.snapshot.state);
			controller.destroy();
			for (const move of solutions[chapter].slice(1)) {
				assert.equal(await resumed.play(move), true, resumed.snapshot.error);
			}
			assert.equal(resumed.snapshot.completed, true);
			const state = resumed.snapshot.state;
			if (chapter === "founding") {
				assert.equal(state.seats[0]!.cash, 5600);
				assert.equal(state.seats[0]!.shares.tower, 3);
			}
			if (chapter === "mergers") {
				assert.equal(state.seats[0]!.cash, 8200);
				assert.equal(state.seats[0]!.shares.tower, 1);
				assert.equal(state.seats[0]!.shares.luxor, 0);
			}
			if (chapter === "scoring") {
				assert.equal(state.ended, true);
				assert.deepEqual(
					state.seats.map((seat) => seat.cash),
					[15800, 10900, 6700]
				);
			}
			const finished = await createTutorial(options);
			assert.equal(finished.snapshot.completed, true);
			assert.deepEqual(finished.snapshot.state, state);
			await finished.restart();
			assert.equal(finished.snapshot.step, 0);
			resumed.destroy();
			finished.destroy();
		}
	});
}

test("tutorial rejects an unrelated move without changing the state or advancing", async () => {
	const controller = await createTutorial(lesson("founding", "fr"));
	const before = structuredClone(controller.snapshot.state);
	assert.equal(await controller.play({ type: "buy", shares: {} }), false);
	assert.equal(controller.snapshot.step, 0);
	assert.deepEqual(controller.snapshot.state, before);
	assert.match(controller.snapshot.error, /Sélectionnez 2A/);
	controller.destroy();
});
