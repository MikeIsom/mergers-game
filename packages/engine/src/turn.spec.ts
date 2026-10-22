import assert from "node:assert/strict";
import { test } from "node:test";
import { activeChains, chainSize } from "./board.js";
import { applyMove } from "./moves.js";
import { tileLabel } from "./tiles.js";
import { chainAt, checkInvariants, row, scenario, t } from "./test/helpers.js";
import type { GameState } from "./types.js";

const SIX_CHAINS = {
	...chainAt("tower", ["1A", "2A"]),
	...chainAt("luxor", ["4A", "5A"]),
	...chainAt("worldwide", ["7A", "8A"]),
	...chainAt("american", ["10A", "11A"]),
	...chainAt("festival", ["1C", "2C"]),
	...chainAt("imperial", ["4C", "5C"]),
};
const SEVEN_CHAINS = { ...SIX_CHAINS, ...chainAt("continental", ["7C", "8C"]) };
const SAFE_PAIR = { ...chainAt("tower", row("A", 1, 11)), ...chainAt("luxor", row("C", 1, 11)) };

function play(state: GameState, seat: number, move: unknown): GameState {
	applyMove(state, move, seat);
	checkInvariants(state);
	return state;
}

const place = (tile: string) => ({ type: "place", tile });
const buy = (shares: Record<string, number> = {}) => ({ type: "buy", shares });

test("§5.1 a tile with no neighbours becomes loose and the turn passes clockwise", () => {
	const state = scenario({ hands: [["5E"], ["9G"], ["11G"]] });
	play(state, 0, place("5E"));
	assert.equal(state.board[t("5E")], "loose");
	assert.equal(state.activeSeat, 1);
	assert.equal(state.phase, "place");
});

test("§3.3 play proceeds in ascending seat order and wraps around", () => {
	const state = scenario({ hands: [["9G"], ["11G"], ["5E"]], activeSeat: 2 });
	play(state, 2, place("5E"));
	assert.equal(state.activeSeat, 0);
});

test("§6.1 founding: the founder chooses any chain not on the board", () => {
	const state = scenario({ board: { "5D": "loose", ...chainAt("tower", ["1A", "2A"]) }, hands: [["5E"]] });
	play(state, 0, place("5E"));
	assert.equal(state.phase, "found");
	assert.equal(state.activeSeat, 0);
	assert.throws(() => applyMove(state, { type: "found", chain: "tower" }, 0), /already on the board/);
	play(state, 0, { type: "found", chain: "imperial" });
	assert.equal(state.board[t("5D")], "imperial");
	assert.equal(state.board[t("5E")], "imperial");
	assert.equal(state.phase, "buy");
});

test("§6.2 the new chain includes all loose tiles connected to the placed tile", () => {
	const state = scenario({
		board: { "5C": "loose", "5D": "loose", "6E": "loose", "7E": "loose", "9A": "loose" },
		hands: [["5E"]],
	});
	play(state, 0, place("5E"));
	play(state, 0, { type: "found", chain: "tower" });
	assert.equal(chainSize(state.board, "tower"), 5);
	assert.equal(state.board[t("9A")], "loose");
});

test("§6.3 the founder receives one free share", () => {
	const state = scenario({ board: { "5D": "loose" }, hands: [["5E"]] });
	play(state, 0, place("5E"));
	play(state, 0, { type: "found", chain: "luxor" });
	assert.equal(state.seats[0]!.shares.luxor, 1);
	assert.equal(state.bank.luxor, 24);
	assert.equal(state.seats[0]!.cash, 6000);
});

test("§6.3 no founder's bonus when the bank has no shares left in that chain", () => {
	const state = scenario({ board: { "5D": "loose" }, hands: [["5E"]], shares: [{}, { tower: 25 }] });
	play(state, 0, place("5E"));
	play(state, 0, { type: "found", chain: "tower" });
	assert.equal(state.seats[0]!.shares.tower, 0);
	assert.equal(state.bank.tower, 0);
	assert.deepEqual(
		state.log.find((e) => e.type === "founded"),
		{ type: "founded", seat: 0, chain: "tower", size: 2, bonus: false }
	);
});

test("§6.4 stock held from an earlier merger counts once the chain is founded again", () => {
	const state = scenario({ board: { "5D": "loose" }, hands: [["5E"]], shares: [{}, { festival: 4 }] });
	play(state, 0, place("5E"));
	play(state, 0, { type: "found", chain: "festival" });
	assert.equal(state.seats[1]!.shares.festival, 4);
	assert.equal(state.bank.festival, 20);
});

test("§6.1 the only remaining chain is named automatically", () => {
	const state = scenario({ board: { ...SIX_CHAINS, "1G": "loose" }, hands: [["1H"]] });
	play(state, 0, place("1H"));
	assert.equal(state.board[t("1H")], "continental");
	assert.equal(state.board[t("1G")], "continental");
	assert.equal(state.seats[0]!.shares.continental, 1);
	assert.equal(state.phase, "buy");
});

test("§5.1 joining a chain also brings in all loose tiles connected to the placed tile", () => {
	const state = scenario({
		board: { ...chainAt("tower", ["1A", "2A"]), "3B": "loose", "3C": "loose" },
		hands: [["3A"]],
	});
	play(state, 0, place("3A"));
	assert.equal(chainSize(state.board, "tower"), 5);
	assert.ok(["3A", "3B", "3C"].every((label) => state.board[t(label)] === "tower"));
});

test("§5.2 with all 7 chains active, a tile touching a chain and loose tiles is playable and the loose tiles join that chain", () => {
	const state = scenario({ board: { ...SEVEN_CHAINS, "10C": "loose", "10D": "loose" }, hands: [["9C"], ["12I"]] });
	assert.equal(state.phase, "place");
	play(state, 0, place("9C"));
	assert.ok(["9C", "10C", "10D"].every((label) => state.board[t(label)] === "continental"));
	assert.equal(chainSize(state.board, "continental"), 5);
});

test("§5.2 a temporarily unplayable tile cannot be placed", () => {
	const state = scenario({ board: { ...SEVEN_CHAINS, "1G": "loose" }, hands: [["1H", "10G"]] });
	assert.throws(() => applyMove(state, place("1H"), 0), /cannot be played/);
});

test("§5.2 a permanently unplayable tile cannot be placed", () => {
	const state = scenario({ board: SAFE_PAIR, hands: [["1B", "10G"]] });
	assert.throws(() => applyMove(state, place("1B"), 0), /cannot be played/);
});

test("§5.3 a player with no playable tile skips placement but may still buy", () => {
	const state = scenario({ board: { ...SEVEN_CHAINS, "1G": "loose" }, hands: [["1H"]] });
	assert.equal(state.phase, "buy");
	assert.equal(state.activeSeat, 0);
	assert.ok(state.log.some((e) => e.type === "skipPlace" && e.seat === 0));
});

test("§5.3 permanently unplayable tiles are discarded and replaced at the end of the turn", () => {
	const state = scenario({ board: SAFE_PAIR, hands: [["1B", "10G"], ["9G"]], poolTop: ["12I", "12H"] });
	play(state, 0, place("10G"));
	play(state, 0, buy());
	assert.ok(state.removed.includes(t("1B")));
	assert.ok(!state.seats[0]!.hand.includes(t("1B")));
	assert.equal(state.seats[0]!.hand.length, 6);
	assert.deepEqual(
		state.log.find((e) => e.type === "discarded"),
		{ type: "discarded", seat: 0, tiles: [t("1B")] }
	);
});

test("§5.3 temporarily unplayable tiles are never replaced", () => {
	const state = scenario({ board: { ...SEVEN_CHAINS, "1G": "loose" }, hands: [["1H", "10G"], ["9G"]] });
	play(state, 0, place("10G"));
	play(state, 0, buy());
	assert.ok(state.seats[0]!.hand.includes(t("1H")));
	assert.equal(state.removed.length, 0);
});

test("§4.5 after placing, the player draws one tile from the pool to get back to 6", () => {
	const hand = ["5E", "9G", "11G", "3I", "6I", "9I"];
	const state = scenario({ hands: [hand, ["12A"]], poolTop: ["12C", "12E"] });
	play(state, 0, place("5E"));
	assert.equal(state.seats[0]!.hand.length, 6);
	assert.ok(state.seats[0]!.hand.includes(t("12C")));
	assert.ok(!state.seats[0]!.hand.includes(t("12E")));
});

test("§5.3 with an empty pool nothing is drawn and hands shrink", () => {
	const hand = ["5E", "9G", "11G", "3I", "6I", "9I"];
	const state = scenario({ hands: [hand, ["12A"]], poolOnly: true });
	play(state, 0, place("5E"));
	assert.equal(state.seats[0]!.hand.length, 5);
	assert.equal(
		state.log.some((e) => e.type === "drew"),
		false
	);
});

test("§9.1 a player may buy up to 3 shares across several chains", () => {
	const board = { ...chainAt("tower", ["1A", "2A"]), ...chainAt("luxor", ["4A", "5A"]) };
	const state = scenario({ board, hands: [["9G"], ["11G"]] });
	play(state, 0, place("9G"));
	assert.throws(() => applyMove(state, buy({ tower: 2, luxor: 2 }), 0), /at most 3/);
	play(state, 0, buy({ tower: 2, luxor: 1 }));
	assert.equal(state.seats[0]!.shares.tower, 2);
	assert.equal(state.seats[0]!.shares.luxor, 1);
	assert.equal(state.seats[0]!.cash, 6000 - 3 * 200);
	assert.equal(state.activeSeat, 1);
});

test("§9.1 buying nothing ends the turn", () => {
	const state = scenario({ board: chainAt("tower", ["1A", "2A"]), hands: [["9G"], ["11G"]] });
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.equal(state.activeSeat, 1);
	assert.equal(state.seats[0]!.cash, 6000);
});

test("§9.2 shares can only be bought in chains on the board", () => {
	const state = scenario({ board: chainAt("tower", ["1A", "2A"]), hands: [["9G"], ["11G"]] });
	play(state, 0, place("9G"));
	assert.throws(() => applyMove(state, buy({ luxor: 1 }), 0), /on the board/);
	assert.throws(() => applyMove(state, buy({ nope: 1 }), 0), /Unknown chain/);
});

test("§9.2 shares can only be bought while the bank has them", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["11G"]],
		shares: [{}, { tower: 24 }],
	});
	play(state, 0, place("9G"));
	assert.throws(() => applyMove(state, buy({ tower: 2 }), 0), /bank does not have/);
	play(state, 0, buy({ tower: 1 }));
	assert.equal(state.bank.tower, 0);
});

test("§9.3 the price is based on the chain's size after this turn's placement", () => {
	const state = scenario({ board: chainAt("tower", ["1A", "2A"]), hands: [["3A"], ["11G"]] });
	play(state, 0, place("3A"));
	play(state, 0, buy({ tower: 3 }));
	assert.equal(state.seats[0]!.cash, 6000 - 3 * 300);
});

test("§9.4 a player cannot buy shares they cannot afford", () => {
	const state = scenario({ board: chainAt("imperial", ["1A", "2A"]), hands: [["9G"], ["11G"]], cash: [700] });
	play(state, 0, place("9G"));
	assert.throws(() => applyMove(state, buy({ imperial: 2 }), 0), /cannot afford/);
	play(state, 0, buy({ imperial: 1 }));
	assert.equal(state.seats[0]!.cash, 300);
});

test("§9.6 with private holdings the buy step is not skipped for lack of cash", () => {
	const state = scenario({ board: chainAt("tower", ["1A", "2A"]), hands: [["9G"], ["11G"]], cash: [100] });
	play(state, 0, place("9G"));
	assert.equal(state.activeSeat, 0);
	assert.equal(state.phase, "buy");
	assert.throws(() => applyMove(state, buy({ tower: 1 }), 0), /cannot afford/);
	play(state, 0, buy());
	assert.equal(state.activeSeat, 1);
});

test("§9.6 with public holdings the buy step is skipped when the player cannot afford any share", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["11G"]],
		cash: [100],
		options: { publicHoldings: true },
	});
	play(state, 0, place("9G"));
	assert.equal(state.activeSeat, 1);
	assert.equal(state.phase, "place");
});

test("§9.6 the buy step is skipped when no chain is on the board", () => {
	const state = scenario({ hands: [["9G"], ["11G"]] });
	play(state, 0, place("9G"));
	assert.equal(state.activeSeat, 1);
});

test("§9.6 the buy step is skipped when the bank has no shares in any active chain", () => {
	const state = scenario({
		board: chainAt("tower", ["1A", "2A"]),
		hands: [["9G"], ["11G"]],
		shares: [{}, { tower: 25 }],
	});
	play(state, 0, place("9G"));
	assert.equal(state.activeSeat, 1);
});

test("§4 an end condition keeps the placement step even with no playable tile", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 11)),
		hands: [[], ["11G"]],
		shares: [{}, { tower: 25 }],
	});
	assert.equal(state.activeSeat, 0);
	assert.equal(state.phase, "place");
	play(state, 0, { type: "pass" });
	assert.equal(state.activeSeat, 0, "§4 the buy step is kept too, though nothing can be bought");
	assert.equal(state.phase, "buy");
	play(state, 0, buy());
	assert.equal(state.activeSeat, 1);
});

test("§4 without an end condition the same empty turn is skipped entirely", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 10)),
		hands: [[], ["11G"]],
		shares: [{}, { tower: 25 }],
	});
	assert.equal(state.activeSeat, 1);
	assert.ok(state.log.some((e) => e.type === "skipPlace" && e.seat === 0));
});

test("§4 an end condition keeps the buy step after placing even when nothing can be bought", () => {
	const state = scenario({
		board: chainAt("tower", row("A", 1, 11)),
		hands: [["9G"], ["11G"]],
		shares: [{}, { tower: 25 }],
	});
	play(state, 0, place("9G"));
	assert.equal(state.phase, "buy");
	assert.equal(state.activeSeat, 0);
});

test("§4 passing is only allowed when no tile is playable", () => {
	const state = scenario({ board: chainAt("tower", row("A", 1, 11)), hands: [["9G"], ["11G"]] });
	assert.throws(() => applyMove(state, { type: "pass" }, 0), /must place/);
});

test("moves are validated: wrong seat, wrong phase and malformed input are rejected without changes", () => {
	const state = scenario({ board: { "5D": "loose" }, hands: [["5E", "9G"], ["11G"]] });
	const before = structuredClone(state);
	for (const [seat, move] of [
		[1, place("11G")],
		[0, buy()],
		[0, place("11G")],
		[0, place("5e")],
		[0, null],
		[0, "place"],
		[0, { type: "found", chain: "tower" }],
	] as const) {
		assert.throws(() => applyMove(state, move, seat));
		assert.deepEqual(state, before);
	}
});

test("§5.2 placing a tile and founding never lets more than 7 chains exist", () => {
	const state = scenario({ board: { ...SEVEN_CHAINS, "1G": "loose" }, hands: [["1H"], ["12I"]] });
	assert.equal(activeChains(state.board).length, 7);
	assert.equal(state.phase, "buy");
	assert.equal(tileLabel(state.seats[0]!.hand[0]!), "1H");
});
