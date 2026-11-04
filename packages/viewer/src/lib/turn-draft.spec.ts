import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyMove,
	currentSeat,
	draftCanContinue,
	dropPlayerSeats,
	initGame,
	legalMoves,
	parseTile,
	tileLabel,
	type GameState,
	type Move,
} from "acquire-engine";
import * as engine from "acquire-engine/wrapper";
import { preparedPosition } from "../tutorial/lessons.ts";
import { currentTurnEntries, moveOutcome, reviewFor, TurnDraft, type MoveOutcome } from "./turn-draft.ts";

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

function truth(full: GameState, move: Move, player: number): MoveOutcome {
	const seat = currentSeat(full)!;
	const after = applyMove(structuredClone(full), move, seat);
	// A dropped player's automatic turn depends on their hidden hand and cash.
	const automatic = after.log.slice(full.log.length).some((entry) => entry.type === "move" && entry.auto);
	return {
		commits: !draftCanContinue(full, after, player),
		endsTurn: seat === full.activeSeat && (after.ended || after.turn !== full.turn),
		endsGame: after.ended && !automatic,
	};
}

test("commit boundaries predicted from a private view match the engine's draft boundaries", () => {
	// The second twoTiles seed drops a player, whose later turns are played automatically.
	const variants: [number, Record<string, unknown>, string][] = [
		[4, {}, "a"],
		[3, { twoTiles: true }, "a"],
		[3, { twoTiles: true }, "drop"],
		[3, { stockSwap: "3" }, "a"],
		[2, {}, "a"],
		[2, { twoPlayerMode: "fourHands", twoTiles: true }, "a"],
		[4, { publicHoldings: true, autoEnd: true, endSize: "31" }, "a"],
		[4, { limitedLog: true, stockSwap: "5" }, "a"],
		[6, { sharesPerTurn: "5" }, "a"],
	];
	const seen = new Set<string>();
	for (const [players, options, seed] of variants) {
		const state = initGame(players, options, `outcome-${seed}`);
		for (let step = 0; step < 400 && !state.ended; step++) {
			if (seed === "drop" && step === 150) {
				dropPlayerSeats(state, 2);
				continue;
			}
			const seat = currentSeat(state)!;
			const player = state.seatOwner[seat]!;
			const view = engine.stripSecret(state, player);
			const moves = legalMoves(state);
			const buys = moves.filter((move) => move.type === "buy");
			const sample = [...moves.filter((move) => move.type !== "buy").slice(0, 3), buys[0], buys.at(-1)];
			for (const move of sample) {
				if (!move) {
					continue;
				}
				const expected = truth(state, move, player);
				assert.deepEqual(moveOutcome(view, move, player), expected, `${players} ${JSON.stringify(options)} ${step}`);
				seen.add(`${move.type}:${expected.commits}:${expected.endsTurn}:${expected.endsGame}`);
			}
			const choices = moves.filter((move) => move.type !== "announce" || step > 250);
			applyMove(state, choices[(step * 7919) % choices.length]!, seat);
		}
	}
	for (const kind of [
		"place:false:false:false",
		"place:true:false:false",
		"place:true:true:false",
		"survivor:true:false:false",
		"dispose:true:false:false",
		"dispose:false:false:false",
		"swap:false:false:false",
		"announce:false:false:false",
		"buy:true:true:false",
		"buy:true:true:true",
	]) {
		assert.ok(seen.has(kind), `covered ${kind}`);
	}
});

const review = (view: GameState, move: Move, player: number, undoable: number) =>
	reviewFor(view, move, moveOutcome(view, move, player), undoable);

test("only the turn's final step, or a placement that ends undo, asks for review", () => {
	const full = preparedPosition("founding");
	const view = () => engine.stripSecret(full, 0);
	assert.equal(review(view(), place, 0, 0), undefined, "placing a founding tile continues");
	applyMove(full, place, 0);
	applyMove(full, found, 0);
	assert.equal(review(view(), { type: "buy", shares: {} }, 0, 2), "end");
	assert.equal(review(view(), { type: "announce" }, 0, 2), undefined);
	assert.deepEqual(
		currentTurnEntries(view()).flatMap((entry) => (entry.type === "move" ? [entry.move.type] : [])),
		["place", "found"]
	);

	// A lone placement that ends the turn already has the placement confirmation.
	const quiet = initGame(3, {}, "lone");
	const seat = quiet.activeSeat;
	quiet.board.fill(null);
	const tile = quiet.seats[seat]!.hand[0]!;
	const lone: Move = { type: "place", tile: tileLabel(tile) };
	assert.equal(moveOutcome(engine.stripSecret(quiet, seat), lone, seat).endsTurn, true);
	assert.equal(review(engine.stripSecret(quiet, seat), lone, seat, 0), undefined);

	// With two tiles, the second placement ends the turn after an earlier move.
	const two = initGame(3, { twoTiles: true }, "two");
	two.board.fill(null);
	const turnSeat = two.activeSeat;
	two.seats[turnSeat]!.hand = ["1A", "5E", "9I"].map((label) => parseTile(label)!);
	applyMove(two, { type: "place", tile: "1A" }, turnSeat);
	const second: Move = { type: "place", tile: "5E" };
	assert.equal(two.phase, "place");
	assert.equal(moveOutcome(engine.stripSecret(two, turnSeat), second, turnSeat).endsTurn, true);
	assert.equal(review(engine.stripSecret(two, turnSeat), second, turnSeat, 1), "end");
});

test("a placement that pays merger bonuses after an undoable move warns before undo ends", () => {
	const full = preparedPosition("mergers");
	full.options = { ...full.options, twoTiles: true };
	full.seats[0]!.hand = [parseTile("12I")!, parseTile("4A")!];
	applyMove(full, { type: "place", tile: "12I" }, 0);
	const view = engine.stripSecret(full, 0);
	const merge: Move = { type: "place", tile: "4A" };
	assert.deepEqual(moveOutcome(view, merge, 0), { commits: true, endsTurn: false, endsGame: false });
	assert.equal(review(view, merge, 0, 1), "commit");
	assert.equal(review(view, merge, 0, 0), undefined, "nothing to lose without undoable moves");
	assert.equal(moveOutcome(view, merge, undefined).commits, true, "spectators never act");
});
