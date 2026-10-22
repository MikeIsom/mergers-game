import assert from "node:assert/strict";
import { test } from "node:test";
import { activeChains } from "./board.js";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat } from "./moves.js";
import { initGame } from "./setup.js";
import { chainAt, checkInvariants, row, scenario, t } from "./test/helpers.js";
import type { GameState, LogEntry } from "./types.js";
import * as wrapper from "../wrapper.js";

const place = (tile: string) => ({ type: "place", tile });
const buy = { type: "buy", shares: {} };

function play(state: GameState, seat: number, move: unknown): GameState {
	applyMove(state, move, seat);
	checkInvariants(state);
	return state;
}

function autoMoves(state: GameState): { seat: number; move: unknown }[] {
	return state.log
		.filter((e): e is Extract<LogEntry, { type: "move" }> => e.type === "move" && e.auto === true)
		.map(({ seat, move }) => ({ seat, move }));
}

test("§16 a dropped player's turn is played automatically: first playable tile in board order, buy nothing", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["12I", "3I", "5E"], ["11G"]],
		activeSeat: 1,
	});
	wrapper.dropPlayer(state, 1);
	checkInvariants(state);
	assert.deepEqual(autoMoves(state), [
		{ seat: 1, move: { type: "place", tile: "3I" } },
		{ seat: 1, move: { type: "buy", shares: {} } },
	]);
	assert.equal(state.activeSeat, 2);
	assert.deepEqual(
		state.log.filter((e) => e.type === "dropped"),
		[{ type: "dropped", seat: 1 }]
	);
});

test("§16 a dropped player is only played for when it is their decision", () => {
	const state = scenario({ hands: [["9G"], ["9I"], ["11G"]] });
	wrapper.dropPlayer(state, 2);
	assert.equal(autoMoves(state).length, 0);
	assert.equal(currentSeat(state), 0);
	play(state, 0, place("9G"));
	play(state, 1, place("9I"));
	assert.deepEqual(autoMoves(state), [{ seat: 2, move: { type: "place", tile: "11G" } }]);
	assert.equal(currentSeat(state), 0);
});

test("§16 a dropped founder names the first available chain in config order", () => {
	const state = scenario({
		board: { ...chainAt("tower", ["1A", "2A"]), "9F": "loose" },
		hands: [["12I"], ["9G"], ["11G"]],
		activeSeat: 1,
	});
	wrapper.dropPlayer(state, 1);
	assert.equal(state.board[t("9G")], "luxor");
	assert.equal(state.seats[1]!.shares.luxor, 1);
});

test("§16 a dropped mergermaker picks the first tied survivor and orders tied defunct chains in config order", () => {
	const board = {
		...chainAt("festival", ["3E", "4E"]),
		...chainAt("luxor", ["6E", "7E"]),
		...chainAt("imperial", ["5F", "5G"]),
		...chainAt("tower", ["5C", "5D"]),
	};
	const state = scenario({ board, hands: [["9I"], ["5E"], ["11G"]], activeSeat: 1 });
	wrapper.dropPlayer(state, 1);
	const plan = state.log.find((e) => e.type === "mergerPlan");
	assert.deepEqual(plan, { type: "mergerPlan", survivor: "tower", defunct: ["luxor", "festival", "imperial"] });
	assert.deepEqual(activeChains(state.board), ["tower"]);
});

test("§16 a dropped holder who is not the active player holds all defunct stock mid-merger", () => {
	const board = { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) };
	const state = scenario({ board, hands: [["4A"], ["9I"], ["11G"]], shares: [{}, { luxor: 2 }, { luxor: 3 }] });
	wrapper.dropPlayer(state, 2);
	play(state, 0, place("4A"));
	assert.equal(currentSeat(state), 1);
	play(state, 1, { type: "dispose", sell: 2, trade: 0 });
	assert.deepEqual(autoMoves(state), [{ seat: 2, move: { type: "dispose", sell: 0, trade: 0 } }]);
	assert.equal(state.seats[2]!.shares.luxor, 3);
	assert.equal(state.phase, "buy");
	assert.equal(currentSeat(state), 0);
});

test("§16 a player who drops while they must dispose is played for immediately", () => {
	const board = { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) };
	const state = scenario({ board, hands: [["4A"], ["9I"], ["11G"]], shares: [{}, { luxor: 2 }, { luxor: 3 }] });
	play(state, 0, place("4A"));
	assert.equal(currentSeat(state), 1);
	wrapper.dropPlayer(state, 1);
	assert.equal(currentSeat(state), 2);
	assert.equal(state.seats[1]!.shares.luxor, 2);
});

test("§16 a dropped player never announces the end", () => {
	const state = scenario({ board: chainAt("tower", row("A", 1, 11)), hands: [["9G"], [], ["11G"]], activeSeat: 1 });
	assert.equal(state.phase, "place", "an announcement point");
	wrapper.dropPlayer(state, 1);
	assert.deepEqual(autoMoves(state), [
		{ seat: 1, move: { type: "pass" } },
		{ seat: 1, move: { type: "buy", shares: {} } },
	]);
	assert.equal(state.endAnnounced, null);
	assert.equal(state.ended, false);
});

test("§16 dropping is idempotent and has no effect after the game ends", () => {
	const state = scenario({ board: chainAt("tower", row("A", 1, 11)), hands: [["9G"], ["9I"], ["11G"]] });
	wrapper.dropPlayer(state, 2);
	const once = structuredClone(state);
	wrapper.dropPlayer(state, 2);
	assert.deepEqual(state, once);
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.equal(state.ended, true);
	const ended = structuredClone(state);
	wrapper.dropPlayer(state, 1);
	assert.deepEqual(state, ended);
	assert.throws(() => wrapper.dropPlayer(state, 7), /Unknown player/);
});

test("§16 when a drop leaves one player, the game ends and is scored immediately", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 5)),
		hands: [["9G"], ["9I"], ["11G"]],
		shares: [{ tower: 2 }, { tower: 5 }, { tower: 1 }],
	});
	wrapper.dropPlayer(state, 1);
	assert.equal(state.ended, false, "two players remain, so play goes on");
	wrapper.dropPlayer(state, 2);
	assert.equal(state.ended, true);
	assert.equal(wrapper.currentPlayer(state), undefined);
	assert.deepEqual(
		state.log.filter((e) => e.type === "gameEnd"),
		[{ type: "gameEnd", reason: "dropped" }]
	);
	// Tower (minor, size 5: $500, bonuses $5,000 / $2,500): seat 1 first, seat 0 second; all stock sold.
	assert.deepEqual(
		state.seats.map((seat) => seat.cash),
		[6000 + 2500 + 2 * 500, 6000 + 5000 + 5 * 500, 6000 + 1 * 500]
	);
	assert.deepEqual(wrapper.rankings(state), [1, 2, 2], "§16 dropped players rank last, whatever their cash");
	checkInvariants(state);
});

test("§16 a drop that leaves one player ends the game mid-merger; the merger is abandoned", () => {
	// Two players with the bank: 4A merges luxor into tower, and seat 1 must dispose of luxor.
	const board = { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) };
	const state = scenario({
		seats: 2,
		board,
		hands: [["4A"], ["12I"]],
		shares: [{}, { luxor: 2 }],
		poolTop: ["9C"],
	});
	applyMove(state, place("4A"), 0);
	assert.equal(state.phase, "dispose");
	assert.deepEqual(state.bankTiles, [t("9C")]);
	wrapper.dropPlayer(state, 1);
	assert.equal(state.ended, true);
	assert.equal(state.merger, null);
	assert.deepEqual(state.bankTiles, []);
	assert.ok(state.removed.includes(t("9C")), "§16 waiting bank tiles are removed from the game");
	assert.deepEqual(activeChains(state.board), ["tower", "luxor"], "§16 the untaken chain is scored as active");
	assert.equal(state.seats[1]!.shares.luxor, 0, "§11.2 its stock was sold at final scoring");
	assert.deepEqual(wrapper.rankings(state), [1, 2]);
	checkInvariants(state);
});

test("§16 a dropped player ranks below every remaining player even with the most cash", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["9I"], ["11G"]],
		cash: [3000, 50000, 2000],
	});
	wrapper.dropPlayer(state, 1);
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.equal(state.ended, true);
	assert.deepEqual(wrapper.scores(state), [3000, 50000, 2000], "§16 a dropped player's cash is still their score");
	assert.deepEqual(wrapper.rankings(state), [1, 3, 2]);
});

test("§16 several dropped players share the rank below the remaining players", () => {
	const state = scenario({
		seats: 4,
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["9I"], ["11G"], ["12G"]],
		cash: [3000, 9000, 2000, 8000],
	});
	wrapper.dropPlayer(state, 1);
	wrapper.dropPlayer(state, 3);
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.deepEqual(wrapper.rankings(state), [1, 3, 2, 3]);
});

test("§15/§16 teamPlay: teams are ranked by combined cash, and a dropped teammate still ranks last", () => {
	const state = scenario({
		seats: 4,
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["9I"], ["11G"], ["12G"]],
		cash: [3000, 2000, 4000, 9000],
		options: { teamPlay: true },
	});
	wrapper.dropPlayer(state, 3);
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy);
	assert.deepEqual(wrapper.scores(state), [7000, 11000, 7000, 11000]);
	assert.deepEqual(wrapper.rankings(state), [2, 1, 2, 3]);
});

const OPTION_SETS: Record<string, unknown>[] = [
	{},
	{ publicHoldings: true },
	{ autoEnd: true },
	{ endSize: "31" },
	{ teamPlay: true },
	{ twoPlayerMode: "fourHands" },
	{ autoEnd: true, endSize: "31", publicHoldings: true },
];

test("§16 auto-play between two remaining players stays far inside the 10-second move limit", () => {
	let slowest = 0;
	for (let players = 3; players <= 6; players++) {
		for (const options of OPTION_SETS) {
			const state = initGame(players, options, `two-left-${players}-${JSON.stringify(options)}`);
			const time = (action: () => void) => {
				const started = performance.now();
				action();
				slowest = Math.max(slowest, performance.now() - started);
			};
			for (let player = 2; player < players; player++) {
				time(() => wrapper.dropPlayer(state, player));
			}
			for (let step = 0; !state.ended; step++) {
				assert.ok(step < 5000, "game did not finish");
				const moves = legalMoves(state).filter((move) => move.type !== "announce");
				const player = wrapper.currentPlayer(state)!;
				assert.ok(player === 0 || player === 1, "only remaining players are asked to move");
				time(() => wrapper.move(state, moves[(step * 7919) % moves.length]!, player));
				checkInvariants(state);
			}
		}
	}
	assert.ok(slowest < 1000, `slowest call took ${slowest.toFixed(0)} ms (BGS allows 10 s)`);
});

test("§16 players dropping at random points never deadlock and keep every invariant", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of OPTION_SETS) {
			const state = initGame(players, options, `random-drop-${players}-${JSON.stringify(options)}`);
			let step = 0;
			while (!state.ended) {
				step++;
				assert.ok(step < 5000, "game did not finish");
				if (step % 37 === 0) {
					wrapper.dropPlayer(state, step % players);
					checkInvariants(state);
					continue;
				}
				const moves = legalMoves(state);
				const move = moves[(step * 7919) % moves.length]!;
				applyMove(state, move, currentSeat(state)!);
				checkInvariants(state);
			}
		}
	}
});
