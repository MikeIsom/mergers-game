import assert from "node:assert/strict";
import { test } from "node:test";
import { legalMoves } from "./legal.js";
import { applyMove } from "./moves.js";
import { positionAt } from "./position.js";
import { initGame } from "./setup.js";
import { chainAt, checkInvariants, row, scenario, t } from "./test/helpers.js";
import type { GameState, Move } from "./types.js";
import * as wrapper from "../wrapper.js";

const place = (tile: string): Move => ({ type: "place", tile });
const buy: Move = { type: "buy", shares: {} };

function play(state: GameState, seat: number, move: Move): GameState {
	applyMove(state, move, seat);
	checkInvariants(state);
	return state;
}

test("§15 handSize: every seat is dealt the chosen hand in every mode and player count", () => {
	for (const handSize of ["6", "8", "10", "12"]) {
		for (const twoTiles of [false, true]) {
			for (let players = 2; players <= 6; players++) {
				const modes = players === 2 ? ["bank", "fourHands"] : ["bank"];
				for (const twoPlayerMode of modes) {
					const state = initGame(
						players,
						{ ...(twoTiles && { twoTiles }), ...(players === 4 && { teamPlay: true }), twoPlayerMode, handSize },
						`deal-${handSize}-${players}-${twoPlayerMode}-${twoTiles}`
					);
					checkInvariants(state);
					const size = Number(handSize);
					assert.ok(state.seats.every((seat) => seat.hand.length === size));
					assert.ok(positionAt(state, state.log.length).seats.every((seat) => seat.tiles === size));
					const view = wrapper.stripSecret(state, 0);
					assert.ok(
						view.seats.every((seat) => seat.hand.length === size),
						"masked hands keep their size"
					);
				}
			}
		}
	}
	// Six hands of 12 plus six turn-order tiles still leave 30 of the 108 tiles to draw.
	assert.equal(initGame(6, { handSize: "12" }, "deal-max").pool.length, 30);
});

test("§15 handSize: the hand refills to the chosen size after a turn", () => {
	const hand = ["5E", "9G", "11G", "3I", "6I", "9I", "1G", "1I", "12A", "12C"];
	const state = scenario({ hands: [hand, ["12E"]], poolTop: ["12G", "12I"], options: { handSize: "10" } });
	play(state, 0, place("5E"));
	assert.equal(state.seats[0]!.hand.length, 10);
	assert.ok(state.seats[0]!.hand.includes(t("12G")));
	assert.ok(!state.seats[0]!.hand.includes(t("12I")));
});

test("§15 handSize: dead tiles are replaced up to the chosen size", () => {
	const state = scenario({
		board: { ...chainAt("tower", row("A", 1, 11)), ...chainAt("continental", row("C", 1, 11)) },
		hands: [["1B", "10G", "12E", "12G", "12I", "10I", "8I", "6I", "4I", "2I", "8G", "6G"], ["5E"]],
		options: { handSize: "12" },
	});
	play(state, 0, place("10G"));
	play(state, 0, buy);
	assert.ok(state.removed.includes(t("1B")));
	assert.equal(state.seats[0]!.hand.length, 12);
	assert.deepEqual(state.log.filter((entry) => entry.type === "drew").at(-1), { type: "drew", seat: 0, count: 2 });
});

test("§15 handSize with twoTiles: both tiles are placed, then the hand refills to the chosen size", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["5E", "9I", "12A", "12C", "12E", "12G"], ["10C"], ["10E"]],
		poolTop: ["7G", "7I"],
		options: { twoTiles: true, handSize: "6" },
	});
	assert.equal(state.options.handSize, 6);
	play(state, 0, place("5E"));
	play(state, 0, place("9I"));
	play(state, 0, buy);
	assert.equal(state.seats[0]!.hand.length, 6);
	assert.deepEqual(state.seats[0]!.hand.slice(-2), [t("7G"), t("7I")]);
});

/** Plays a random game to the end, checking invariants after every move, and replays it. */
function playToEnd(players: number, options: Record<string, unknown>, seed: string): GameState {
	const state = wrapper.init(players, [], options, seed);
	for (let step = 0; !state.ended; step++) {
		assert.ok(step < 5000, `${seed} did not finish`);
		const moves = legalMoves(state);
		const others = moves.filter((move) => move.type !== "announce");
		const choices = others.length > 0 && step % 23 !== 0 ? others : moves;
		wrapper.move(state, choices[(step * 7919) % choices.length]!, wrapper.currentPlayer(state)!);
		checkInvariants(state);
	}
	assert.deepEqual(wrapper.replay(structuredClone(state)), state, `§14.7 ${seed} replays exactly`);
	return state;
}

test("§14.8 handSize 12: full games finish and replay with 6 players, two-player bank mode and four hands", () => {
	playToEnd(6, { handSize: "12" }, "hand-12-six");
	playToEnd(6, { handSize: "12", twoTiles: true }, "hand-12-six-two-tiles");
	playToEnd(2, { handSize: "12", twoPlayerMode: "bank" }, "hand-12-bank");
	playToEnd(2, { handSize: "12", twoPlayerMode: "fourHands", twoTiles: true }, "hand-12-four-hands");
	playToEnd(4, { handSize: "10", teamPlay: true, publicHoldings: true }, "hand-10-teams");
});
