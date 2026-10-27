import assert from "node:assert/strict";
import { test } from "node:test";
import {
	allTiles,
	CHAIN_IDS,
	applyMove,
	currentSeat,
	initGame,
	legalMoves,
	parseTile,
	sharePrice,
	type GameState,
} from "acquire-engine";
import { stripSecret } from "acquire-engine/wrapper";
import { preparedPosition } from "../tutorial/lessons.ts";
import { mergerPreview } from "./mergerPreview.ts";

const tile = (label: string) => parseTile(label)!;

function conservePosition(state: GameState) {
	const held = new Set(state.seats.flatMap((seat) => seat.hand));
	state.pool = allTiles().filter((tile) => state.board[tile] === null && !held.has(tile));
	for (const chain of CHAIN_IDS) {
		state.bank[chain] = 25 - state.seats.reduce((sum, seat) => sum + seat.shares[chain], 0);
	}
}

test("Festival 3 into Imperial 3 shows the $500 → $800 rise before Spock's sell/trade decision", () => {
	const state = preparedPosition("mergers");
	state.board.fill(null);
	for (const label of ["1A", "2A", "3A"]) {
		state.board[tile(label)] = "festival";
	}
	for (const label of ["5A", "6A", "7A"]) {
		state.board[tile(label)] = "imperial";
	}
	state.seats[0]!.shares.festival = 7;
	conservePosition(state);
	applyMove(state, { type: "place", tile: "4A" }, 0);
	assert.equal(mergerPreview(state), undefined, "wait for the tied survivor to be chosen");
	applyMove(state, { type: "survivor", chain: "imperial" }, 0);
	const before = structuredClone(state);
	assert.deepEqual(mergerPreview(stripSecret(state, 0)), { chain: "imperial", size: 7, beforePrice: 500, price: 800 });
	assert.deepEqual(state, before, "preview does not change the board or the disposal price");
	applyMove(state, { type: "dispose", sell: 7, trade: 0 }, 0);
	assert.equal(state.log.filter((e) => e.type === "disposed").at(-1)?.proceeds, 2800);
	assert.equal(state.log.filter((e) => e.type === "merged").at(-1)?.size, 7);
	assert.equal(mergerPreview(state), undefined);
});

test("merger preview includes loose tiles, and does not invent a price rise within the same band", () => {
	const state = preparedPosition("mergers");
	for (const label of ["4B", "4C", "4D", "4E", "4F"]) {
		state.board[tile(label)] = "loose";
	}
	conservePosition(state);
	applyMove(state, { type: "place", tile: "4A" }, 0);
	assert.deepEqual(mergerPreview(state), { chain: "tower", size: 11, beforePrice: 300, price: 700 });
	const safe = preparedPosition("mergers");
	safe.board.fill(null);
	for (let column = 1; column <= 11; column++) {
		safe.board[tile(`${column}A`)] = "tower";
	}
	safe.board[tile("1C")] = safe.board[tile("2C")] = "luxor";
	safe.seats[0]!.hand = [tile("1B")];
	conservePosition(safe);
	applyMove(safe, { type: "place", tile: "1B" }, 0);
	assert.deepEqual(mergerPreview(safe), { chain: "tower", size: 14, beforePrice: 700, price: 700 });
});

test("public merger previews match actual completion across multi-chain, bank and four-hands games", () => {
	let comparisons = 0;
	for (const [players, options] of [
		[2, {}],
		[2, { twoPlayerMode: "fourHands" }],
		[4, {}],
	] as const) {
		const state = initGame(
			players,
			{ ...options, autoEnd: true, endSize: "31" },
			`preview-${players}-${JSON.stringify(options)}`
		);
		for (let step = 0; !state.ended && step < 1500; step++) {
			const preview = mergerPreview(stripSecret(state));
			const logLength = state.log.length;
			const moves = legalMoves(state).filter((move) => move.type !== "announce");
			applyMove(state, moves[(step * 7919) % moves.length]!, currentSeat(state)!);
			const result = state.log.slice(logLength).find((entry) => entry.type === "merged");
			if (preview && result) {
				assert.equal(preview.chain, result.survivor);
				assert.equal(preview.size, result.size);
				assert.equal(preview.price, sharePrice(result.survivor, result.size));
				comparisons++;
			}
		}
	}
	assert.ok(comparisons >= 10);
});
