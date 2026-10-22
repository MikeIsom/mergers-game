import assert from "node:assert/strict";
import { test } from "node:test";
import { placeNextBankTile } from "./bank.js";
import { activeChains, chainSize } from "./board.js";
import { applyMove, currentSeat } from "./moves.js";
import { chainAt, checkInvariants, row, scenario, t } from "./test/helpers.js";
import type { GameState, LogEntry } from "./types.js";

function play(state: GameState, seat: number, move: unknown): GameState {
	applyMove(state, move, seat);
	checkInvariants(state);
	return state;
}

const place = (tile: string) => ({ type: "place", tile });
const dispose = (sell: number, trade: number) => ({ type: "dispose", sell, trade });
const buy = (shares: Record<string, number> = {}) => ({ type: "buy", shares });

function entries<T extends LogEntry["type"]>(state: GameState, type: T): Extract<LogEntry, { type: T }>[] {
	return state.log.filter((e): e is Extract<LogEntry, { type: T }> => e.type === type);
}

// tower 1A-3A (3) and luxor 5A-6A (2, minor: $200, bonuses $2,000 / $1,000); 4A merges them.
const TWO_CHAINS = { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) };

test("§12.1.1 the bank holds shares equal to the drawn tile's column and can win the majority", () => {
	const state = scenario({
		seats: 2,
		board: TWO_CHAINS,
		hands: [["4A"], ["12I"]],
		shares: [{}, { luxor: 3 }],
		poolTop: ["9C"],
	});
	play(state, 0, place("4A"));
	const [bonus] = entries(state, "bonuses");
	assert.deepEqual(bonus?.bank, { tile: t("9C"), shares: 9, amount: 2000 });
	assert.deepEqual(bonus?.payouts, [{ seat: 1, amount: 1000 }]);
	assert.equal(state.seats[1]!.cash, 7000, "§12.1.2 the bank's majority bonus is not paid to anyone");
});

test("§12.1.2 a bank tie is split normally and the bank's portion is not paid out", () => {
	const state = scenario({
		seats: 2,
		board: TWO_CHAINS,
		hands: [["4A"], ["12I"]],
		shares: [{}, { luxor: 4 }],
		poolTop: ["4I"],
	});
	play(state, 0, place("4A"));
	const [bonus] = entries(state, "bonuses");
	assert.deepEqual(bonus?.bank, { tile: t("4I"), shares: 4, amount: 1500 });
	assert.deepEqual(bonus?.payouts, [{ seat: 1, amount: 1500 }]);
});

test("§12.1.3 the bank never disposes of stock", () => {
	const state = scenario({
		seats: 2,
		board: TWO_CHAINS,
		hands: [["4A"], ["12I"]],
		shares: [{}, { luxor: 2 }],
		poolTop: ["9C"],
	});
	play(state, 0, place("4A"));
	assert.equal(currentSeat(state), 1);
	play(state, 1, dispose(2, 0));
	assert.equal(state.phase, "buy");
	assert.equal(entries(state, "disposed").length, 1);
});

test("§12.1.5 one bank tile is drawn per defunct chain", () => {
	const board = {
		...chainAt("tower", row("E", 1, 4)),
		...chainAt("luxor", row("E", 6, 8)),
		...chainAt("festival", ["5F", "5G"]),
	};
	const state = scenario({ seats: 2, board, hands: [["5E"], ["12A"]], poolTop: ["12I", "10I"] });
	play(state, 0, place("5E"));
	assert.deepEqual(
		entries(state, "bonuses").map((e) => [e.chain, e.bank?.shares]),
		[
			["luxor", 12],
			["festival", 10],
		]
	);
});

test("§12.1.5 with an empty pool the bank holds 0 shares", () => {
	const state = scenario({
		seats: 2,
		board: TWO_CHAINS,
		hands: [["4A"], ["12I"]],
		shares: [{}, { luxor: 1 }],
		poolOnly: true,
	});
	play(state, 0, place("4A"));
	const [bonus] = entries(state, "bonuses");
	assert.deepEqual(bonus?.bank, { tile: null, shares: 0, amount: 0 });
	assert.deepEqual(bonus?.payouts, [{ seat: 1, amount: 3000 }], "§10 a single holder gets both bonuses");
	assert.deepEqual(entries(state, "bankTile"), []);
});

test("§12.1.4 bank tiles are placed after every defunct chain is resolved, before the buy step", () => {
	const state = scenario({
		seats: 2,
		board: TWO_CHAINS,
		hands: [["4A"], ["12I"]],
		shares: [{}, { luxor: 2 }],
		poolTop: ["9C"],
	});
	play(state, 0, place("4A"));
	assert.equal(state.phase, "dispose");
	assert.equal(state.board[t("9C")], null);
	assert.deepEqual(state.bankTiles, [t("9C")], "§14.3 a drawn bank tile waits in the bank queue");
	play(state, 1, dispose(0, 0));
	assert.equal(state.board[t("9C")], "loose");
	assert.deepEqual(state.bankTiles, []);
	assert.equal(state.phase, "buy");
	assert.equal(state.activeSeat, 0);
});

test("§12.1.4 waiting bank tiles are placed in the order they were drawn", () => {
	const board = {
		...chainAt("tower", row("E", 1, 4)),
		...chainAt("luxor", row("E", 6, 8)),
		...chainAt("festival", ["5F", "5G"]),
	};
	const state = scenario({ seats: 2, board, hands: [["5E"], ["12A"]], poolTop: ["12I", "10I"] });
	play(state, 0, place("5E"));
	assert.deepEqual(
		entries(state, "bankTile").map((e) => e.tile),
		[t("12I"), t("10I")]
	);
});

test("§12.1.4 a bank tile joining a chain brings connected loose tiles with it", () => {
	const board = {
		...TWO_CHAINS,
		...chainAt("festival", ["9A", "9B"]),
		"10C": "loose" as const,
		"11C": "loose" as const,
	};
	const state = scenario({ seats: 2, board, hands: [["4A"], ["12I"]], poolTop: ["9C"] });
	play(state, 0, place("4A"));
	assert.deepEqual(entries(state, "bankTile"), [{ type: "bankTile", tile: t("9C"), result: "joined" }]);
	assert.ok(["9C", "10C", "11C"].every((label) => state.board[t(label)] === "festival"));
	assert.equal(chainSize(state.board, "festival"), 5);
});

test("§12.1.4 a bank tile causing another merger resolves it with a fresh bank draw, repeating until no merger occurs", () => {
	// The player's 4A merges tower and luxor; the bank draws 9B. 9B merges worldwide (3) and
	// american (2); the bank draws 9G. 9G merges imperial (3) and festival (2); the bank draws 1I,
	// which lands on its own.
	const board = {
		...TWO_CHAINS,
		...chainAt("worldwide", ["8B", "8C", "8D"]),
		...chainAt("american", ["10B", "11B"]),
		...chainAt("imperial", ["10G", "11G", "12G"]),
		...chainAt("festival", ["7G", "8G"]),
	};
	const state = scenario({
		seats: 2,
		board,
		hands: [["4A"], ["12I"]],
		shares: [{ american: 2, festival: 1 }, { luxor: 1 }],
		poolTop: ["9B", "9G", "1I"],
	});
	play(state, 0, place("4A"));
	assert.equal(currentSeat(state), 1, "luxor disposal");
	play(state, 1, dispose(1, 0));
	assert.equal(currentSeat(state), 0, "american disposal in the bank-tile merger");
	play(state, 0, dispose(0, 2));
	assert.equal(currentSeat(state), 0, "festival disposal in the second bank-tile merger");
	play(state, 0, dispose(1, 0));

	assert.deepEqual(
		entries(state, "merger").map((e) => [e.tile, e.byBank === true]),
		[
			[t("4A"), false],
			[t("9B"), true],
			[t("9G"), true],
		]
	);
	assert.deepEqual(
		entries(state, "bonuses").map((e) => [e.chain, e.bank?.tile]),
		[
			["luxor", t("9B")],
			["american", t("9G")],
			["festival", t("1I")],
		]
	);
	assert.deepEqual(
		entries(state, "bankTile").map((e) => [e.tile, e.result]),
		[
			[t("9B"), "merger"],
			[t("9G"), "merger"],
			[t("1I"), "loose"],
		]
	);
	assert.deepEqual(activeChains(state.board), ["tower", "worldwide", "imperial"]);
	assert.equal(chainSize(state.board, "tower"), 6);
	assert.equal(chainSize(state.board, "worldwide"), 6);
	assert.equal(chainSize(state.board, "imperial"), 6);
	assert.equal(state.board[t("1I")], "loose");
	assert.equal(state.seats[0]!.shares.worldwide, 1);
	assert.equal(state.phase, "buy");
	assert.equal(state.activeSeat, 0);
});

test("§12.1.4 in a merger caused by a bank tile the active player is the mergermaker", () => {
	// Seat 1 plays 4A; the bank's 9B ties worldwide (2) and american (2).
	const board = {
		...TWO_CHAINS,
		...chainAt("worldwide", ["8B", "8C"]),
		...chainAt("american", ["10B", "11B"]),
	};
	const state = scenario({
		seats: 2,
		board,
		hands: [["12I"], ["4A"]],
		activeSeat: 1,
		shares: [{ american: 2 }, { american: 1 }],
		poolTop: ["9B", "1I"],
	});
	play(state, 1, place("4A"));
	assert.equal(state.phase, "survivor");
	assert.equal(currentSeat(state), 1);
	assert.throws(() => applyMove(state, { type: "survivor", chain: "worldwide" }, 0), /not your turn/);
	play(state, 1, { type: "survivor", chain: "worldwide" });
	// American (medium, size 2: $300, $3,000 / $1,500): seat 0 first; seat 1 ties the bank (1I = 1).
	const american = entries(state, "bonuses").find((e) => e.chain === "american");
	assert.deepEqual(american?.payouts, [
		{ seat: 0, amount: 3000 },
		{ seat: 1, amount: 800 },
	]);
	assert.deepEqual(american?.bank, { tile: t("1I"), shares: 1, amount: 800 });
	assert.equal(currentSeat(state), 1, "disposal starts with the active player");
	play(state, 1, dispose(1, 0));
	assert.equal(currentSeat(state), 0);
	play(state, 0, dispose(0, 0));
	assert.equal(state.phase, "buy");
	assert.equal(state.activeSeat, 1);
});

test("§12.1.4 a permanently unplayable bank tile is removed from the game", () => {
	const board = { ...TWO_CHAINS, ...chainAt("worldwide", row("G", 1, 11)), ...chainAt("american", row("I", 1, 11)) };
	const state = scenario({ seats: 2, board, hands: [["4A"], ["12I"]], poolTop: ["1H"] });
	play(state, 0, place("4A"));
	assert.deepEqual(entries(state, "bankTile"), [{ type: "bankTile", tile: t("1H"), result: "removed" }]);
	assert.equal(state.board[t("1H")], null);
	assert.ok(state.removed.includes(t("1H")));
	assert.equal(state.phase, "buy");
});

test("§12.1.4 a bank tile that would found a chain stays loose; the next player to extend it founds and gets the bonus", () => {
	const state = scenario({
		seats: 2,
		board: { ...TWO_CHAINS, "9E": "loose" },
		hands: [["4A"], ["9G"]],
		poolTop: ["9F"],
	});
	play(state, 0, place("4A"));
	assert.equal(state.board[t("9F")], "loose");
	assert.equal(state.board[t("9E")], "loose");
	assert.deepEqual(activeChains(state.board), ["tower"]);
	play(state, 0, buy());
	play(state, 1, place("9G"));
	play(state, 1, { type: "found", chain: "festival" });
	assert.equal(chainSize(state.board, "festival"), 3);
	assert.equal(state.seats[1]!.shares.festival, 1);
	assert.equal(state.seats[0]!.shares.festival, 0);
});

test("§12.1.4 a bank tile that would found a chain stays loose even with all 7 chains active", () => {
	// A merger always frees a name, so this cannot arise from a real merger; the placement step is
	// exercised directly on a constructed position to pin down the rule.
	const seven = {
		...chainAt("tower", ["1A", "2A"]),
		...chainAt("luxor", ["4A", "5A"]),
		...chainAt("worldwide", ["7A", "8A"]),
		...chainAt("american", ["10A", "11A"]),
		...chainAt("festival", ["1C", "2C"]),
		...chainAt("imperial", ["4C", "5C"]),
		...chainAt("continental", ["7C", "8C"]),
		"1G": "loose" as const,
	};
	const state = scenario({ seats: 2, board: seven, hands: [["12I"], ["10I"]], poolTop: ["1H"] });
	state.pool.pop();
	state.bankTiles = [t("1H")];
	checkInvariants(state);
	placeNextBankTile(state);
	assert.equal(state.board[t("1H")], "loose");
	assert.equal(state.board[t("1G")], "loose");
	assert.equal(activeChains(state.board).length, 7);
	checkInvariants(state);
});

test("§12.2 at final scoring the bank draws a tile per active chain, competes, and the tiles are set aside", () => {
	// Tower and luxor are both safe at 11 (minor: $700, bonuses $7,000 / $3,500).
	const state = scenario({
		seats: 2,
		board: { ...chainAt("tower", row("A", 1, 11)), ...chainAt("luxor", row("C", 1, 11)) },
		hands: [["9G"], ["12I"]],
		shares: [{ tower: 5 }, { luxor: 4 }],
		poolTop: ["1E", "2E", "3E", "4E", "5E", "6E", "8I", "2I"],
		poolOnly: true,
	});
	play(state, 0, { type: "announce" });
	play(state, 0, place("9G"));
	play(state, 0, buy());
	assert.equal(state.ended, true);
	const bonuses = entries(state, "bonuses");
	assert.deepEqual(
		bonuses.map((e) => [e.chain, e.bank, e.payouts]),
		[
			["tower", { tile: t("8I"), shares: 8, amount: 7000 }, [{ seat: 0, amount: 3500 }]],
			["luxor", { tile: t("2I"), shares: 2, amount: 3500 }, [{ seat: 1, amount: 7000 }]],
		]
	);
	assert.deepEqual(
		state.seats.map((seat) => seat.cash),
		[6000 + 3500 + 5 * 700, 6000 + 7000 + 4 * 700]
	);
	assert.equal(state.board[t("8I")], null, "§12.2 bank tiles are not placed");
	assert.equal(state.board[t("2I")], null);
	assert.ok(
		state.removed.includes(t("8I")) && state.removed.includes(t("2I")),
		"§14.3 set-aside tiles count as removed"
	);
	assert.deepEqual(state.bankTiles, []);
	checkInvariants(state);
});

test("§12 with three or more players there is no bank shareholder", () => {
	const state = scenario({
		seats: 3,
		board: TWO_CHAINS,
		hands: [["4A"], ["12I"], ["10I"]],
		shares: [{}, { luxor: 1 }],
	});
	const poolBefore = state.pool.length;
	play(state, 0, place("4A"));
	const [bonus] = entries(state, "bonuses");
	assert.equal(bonus?.bank, undefined);
	assert.deepEqual(bonus?.payouts, [{ seat: 1, amount: 3000 }]);
	assert.equal(state.pool.length, poolBefore);
});
