import assert from "node:assert/strict";
import { test } from "node:test";
import * as engine from "../wrapper.js";
import { legalMoves } from "./legal.js";
import { MAX_TURN_MOVES } from "./turn-draft.js";
import { chainAt, checkInvariants, scenario, t } from "./test/helpers.js";
import type { GameState, Move, TurnRequest } from "./types.js";

const place: Move = { type: "place", tile: "2A" };
const found: Move = { type: "found", chain: "tower" };
const buy: Move = { type: "buy", shares: { tower: 2 } };
const baseGame = () => scenario({ board: { "1A": "loose" }, hands: [["2A", "12I"], ["10G"], ["8E"]] });
const request = (state: GameState, moves: Move[]): TurnRequest => ({ type: "turn", from: state.log.length, moves });
const draft = (state: GameState, moves: Move[], player = engine.currentPlayer(state)!) =>
	engine.move(state, request(state, moves), player);

test("undo revisions never save history or award time, and the accepted turn is saved once", () => {
	const base = baseGame();
	const original = structuredClone(base);
	for (let i = 0; i < 30; i++) {
		const placed = draft(base, [place]);
		assert.equal(placed.phase, "found");
		assert.equal(engine.toSave(placed), undefined);
		const founded = draft(base, [place, { type: "found", chain: i % 2 ? "tower" : "luxor" }]);
		assert.equal(engine.toSave(founded), undefined);
		assert.deepEqual(engine.timeIncrements(founded), [0, 0, 0]);
		assert.deepEqual(base, original);
	}
	const saved = draft(base, [place, found, buy]);
	assert.equal(engine.toSave(saved), saved);
	assert.equal(saved.tentative, undefined);
	assert.deepEqual(engine.timeIncrements(saved), [1, 0, 0]);
	assert.deepEqual(saved.log.slice(0, base.log.length), base.log);
	assert.deepEqual(
		saved.log.filter((e) => e.type === "move").map((e) => e.move),
		[place, found, buy]
	);
	const direct = structuredClone(base);
	for (const move of [place, found, buy]) {
		engine.move(direct, move, 0);
	}
	assert.deepEqual(saved, direct);
	checkInvariants(saved);
});

test("private previews are sent only to their owner and strip all hidden information", () => {
	const base = baseGame();
	const result = draft(base, [place, found]);
	const preview = engine.logSlice(result, { start: base.log.length, player: 0 }).preview!;
	assert.equal(preview.phase, "buy");
	assert.equal(preview.seed, "");
	assert.ok(preview.pool.every((tile) => tile === -1));
	assert.equal(preview.seats[1]!.cash, -1);
	assert.equal(preview.seats[1]!.shares.luxor, -1);
	assert.deepEqual(preview.seats[1]!.hand, [-1]);
	assert.equal(engine.logSlice(result, { player: 1 }).preview, undefined);
	assert.equal(engine.logSlice(result).preview, undefined);
	assert.equal(engine.stripSecret(base, 0).supportsTurnDrafts, true);
});

test("stale, malformed, wrong-player, and overlong requests cannot mutate the saved state", () => {
	const base = baseGame();
	const original = structuredClone(base);
	for (const raw of [
		{ ...request(base, [place]), from: base.log.length - 1 },
		request(base, []),
		request(base, Array(MAX_TURN_MOVES + 1).fill(place)),
		{ type: "turn", from: base.log.length, moves: null },
		request(base, [place, { type: "buy", shares: {} }]),
		request(base, [place, found, buy, { type: "place", tile: "10G" }]),
	]) {
		assert.throws(() => engine.move(base, raw, 0));
	}
	assert.throws(() => draft(base, [place], 1), /not your turn/);
	const preview = draft(base, [place]);
	assert.throws(() => draft(preview, [found]), /game changed/);
	assert.deepEqual(base, original);
});

test("drawing tiles closes undo, including placements that automatically skip buying", () => {
	const base = scenario({ hands: [["1A"], ["12I"], ["10G"]] });
	const result = draft(base, [{ type: "place", tile: "1A" }]);
	assert.ok(result.log.some((e) => e.type === "drew"));
	assert.equal(engine.toSave(result), result);
	assert.deepEqual(engine.timeIncrements(result), [1, 0, 0]);
});

const merger = () =>
	scenario({
		board: { ...chainAt("tower", ["1A", "2A"]), ...chainAt("luxor", ["4A", "5A"]) },
		hands: [["3A"], ["12I"], ["10G"]],
		shares: [{ luxor: 1 }, { luxor: 2 }, {}],
	});

test("merger placement can be revised until bonuses are revealed, even when the same player still acts", () => {
	const base = merger();
	const moves: Move[] = [
		{ type: "place", tile: "3A" },
		{ type: "survivor", chain: "tower" },
	];
	const placed = draft(base, [moves[0]!]);
	assert.equal(engine.toSave(placed), undefined);
	assert.equal(placed.phase, "survivor");
	const revealed = draft(base, moves);
	assert.equal(engine.toSave(revealed), revealed);
	assert.equal(engine.currentPlayer(revealed), 0);
	assert.ok(revealed.log.some((e) => e.type === "bonuses"));
	assert.throws(() => draft(base, [...moves, { type: "dispose", sell: 1, trade: 0 }]), /committed/);
	assert.deepEqual(engine.timeIncrements(revealed), [0, 0, 0]);
	const handedOff = draft(revealed, [{ type: "dispose", sell: 1, trade: 0 }]);
	assert.equal(engine.toSave(handedOff), handedOff);
	assert.equal(engine.currentPlayer(handedOff), 1);
	assert.deepEqual(engine.timeIncrements(handedOff), [0, 0, 0]);
	const returned = draft(handedOff, [{ type: "dispose", sell: 2, trade: 0 }]);
	assert.equal(engine.toSave(returned), returned);
	assert.equal(engine.currentPlayer(returned), 0);
	assert.deepEqual(engine.timeIncrements(returned), [0, 1, 0]);
	const ended = draft(returned, [{ type: "buy", shares: {} }]);
	assert.deepEqual(engine.timeIncrements(ended), [1, 1, 0]);
});

test("four-hands credits real players, not seats or individual choices", () => {
	const base = scenario({
		options: { twoPlayerMode: "fourHands" },
		activeSeat: 2,
		board: { "1A": "loose" },
		hands: [["12I"], ["10G"], ["2A"], ["8E"]],
	});
	const saved = draft(base, [place, found, buy]);
	const expected = [0, 0];
	expected[base.seatOwner[2]!] = 1;
	assert.deepEqual(engine.timeIncrements(saved), expected);
});

test("end announcement can be undone; final scoring credits the completed turn only once", () => {
	const base = scenario({
		board: chainAt(
			"tower",
			Array.from({ length: 11 }, (_, i) => `${i + 1}A`)
		),
		hands: [["12I"], ["10G"], ["8E"]],
	});
	const moves: Move[] = [{ type: "announce" }, { type: "place", tile: "12I" }, { type: "buy", shares: {} }];
	assert.equal(engine.toSave(draft(base, [moves[0]!])), undefined);
	const ended = draft(base, moves);
	assert.equal(ended.ended, true);
	assert.equal(engine.toSave(ended), ended);
	assert.deepEqual(engine.timeIncrements(ended), [1, 0, 0]);
});

test("committed drafts remain replayable, with monotonic increments and no transient state across a full game", () => {
	let state = engine.init(4, [], { autoEnd: true, endSize: "31" }, "undo-replay");
	let preview = state;
	let buffer: Move[] = [];
	let increments = engine.timeIncrements(state);
	let commits = 0;
	for (let step = 0; !state.ended && step < 1200; step++) {
		const legal = legalMoves(preview).filter((m) => m.type !== "announce");
		buffer.push(legal[(step * 7919) % legal.length]!);
		preview = draft(state, buffer);
		if (engine.toSave(preview)) {
			const next = engine.timeIncrements(preview);
			assert.ok(next.every((n, i) => n >= increments[i]!));
			increments = next;
			state = preview;
			buffer = [];
			commits++;
		}
	}
	assert.equal(state.ended, true);
	assert.ok(commits > 10);
	assert.equal(state.tentative, undefined);
	assert.deepEqual(engine.replay(state), state);
	assert.ok(state.board[t("1A")] !== undefined);
});

test("bank, four-hands, teams and dropped players preserve private boundaries and monotonic clock totals", () => {
	for (const [players, options] of [
		[2, {}],
		[2, { twoPlayerMode: "fourHands" }],
		[4, { teamPlay: true }],
		[6, { publicHoldings: true }],
	] as const) {
		let state = engine.init(
			players,
			[],
			{ ...options, autoEnd: true, endSize: "31" },
			`draft-${players}-${JSON.stringify(options)}`
		);
		let preview = state;
		let buffer: Move[] = [];
		let increments = engine.timeIncrements(state);
		let dropped = false;
		for (let step = 0; !state.ended && step < 1500; step++) {
			if (players > 2 && step >= 35 && !buffer.length && !dropped) {
				state = engine.dropPlayer(state, players - 1);
				preview = state;
				dropped = true;
			} else {
				const legal = legalMoves(preview).filter((move) => move.type !== "announce");
				buffer.push(legal[(step * 7919) % legal.length]!);
				preview = draft(state, buffer);
				if (!engine.toSave(preview)) {
					continue;
				}
				state = preview;
				buffer = [];
			}
			const next = engine.timeIncrements(state);
			assert.ok(next.every((n, i) => n >= increments[i]!));
			increments = next;
			assert.equal(state.tentative, undefined);
			checkInvariants(state);
		}
		assert.equal(state.ended, true);
		assert.deepEqual(engine.replay(state), state);
	}
});
