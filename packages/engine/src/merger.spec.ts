import assert from "node:assert/strict";
import { test } from "node:test";
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
const OTHER_HANDS = [["12I"], ["12G"], ["10I"]];

function hands(seat: number, tile: string): string[][] {
	return OTHER_HANDS.map((hand, i) => (i === seat ? [tile] : hand));
}

function entries<T extends LogEntry["type"]>(state: GameState, type: T): Extract<LogEntry, { type: T }>[] {
	return state.log.filter((e): e is Extract<LogEntry, { type: T }> => e.type === type);
}

// tower 1A-3A (3) and luxor 5A-6A (2); 4A merges them.
const TWO_CHAINS = { ...chainAt("tower", ["1A", "2A", "3A"]), ...chainAt("luxor", ["5A", "6A"]) };

// Around 5E: tower 1E-4E (4), luxor 6E-8E (3), festival 5F-5G (2), imperial 5C-5D (2).
const AROUND_5E = {
	...chainAt("tower", row("E", 1, 4)),
	...chainAt("luxor", row("E", 6, 8)),
	...chainAt("festival", ["5F", "5G"]),
};

test("§7.1 the largest chain survives without a choice", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A") });
	play(state, 0, place("4A"));
	assert.deepEqual(entries(state, "mergerPlan"), [{ type: "mergerPlan", survivor: "tower", defunct: ["luxor"] }]);
	assert.deepEqual(activeChains(state.board), ["tower"]);
	assert.equal(chainSize(state.board, "tower"), 6);
	assert.equal(state.phase, "buy");
});

test("§7.1.1 chain sizes are measured before the merging tile is placed", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A") });
	play(state, 0, place("4A"));
	assert.deepEqual(entries(state, "merger")[0]?.sizes, { tower: 3, luxor: 2 });
});

test("§7.1.3 tied survivors: mergermaker chooses", () => {
	const board = { ...chainAt("tower", ["1A", "2A"]), ...chainAt("luxor", ["4A", "5A"]) };
	const state = scenario({ board, hands: hands(1, "3A"), activeSeat: 1 });
	play(state, 1, place("3A"));
	assert.equal(state.phase, "survivor");
	assert.equal(currentSeat(state), 1);
	assert.throws(() => applyMove(state, { type: "survivor", chain: "festival" }, 1), /largest/);
	play(state, 1, { type: "survivor", chain: "luxor" });
	assert.deepEqual(activeChains(state.board), ["luxor"]);
	assert.equal(chainSize(state.board, "luxor"), 5);
});

test("§7.1.4 a safe chain takes over an open chain", () => {
	const board = { ...chainAt("tower", row("A", 1, 11)), ...chainAt("luxor", ["1C", "2C"]) };
	const state = scenario({ board, hands: hands(0, "1B") });
	play(state, 0, place("1B"));
	assert.deepEqual(activeChains(state.board), ["tower"]);
	assert.equal(chainSize(state.board, "tower"), 14);
});

test("§7.2.1 majority bonuses for the defunct chain use its pre-merger size", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A"), shares: [{}, { luxor: 3 }, { luxor: 1 }] });
	play(state, 0, place("4A"));
	assert.deepEqual(entries(state, "bonuses"), [
		{
			type: "bonuses",
			chain: "luxor",
			size: 2,
			payouts: [
				{ seat: 1, amount: 2000 },
				{ seat: 2, amount: 1000 },
			],
		},
	]);
	assert.equal(state.seats[1]!.cash, 8000);
	assert.equal(state.seats[2]!.cash, 7000);
});

test("§7.2.2 disposal starts with the mergermaker, goes clockwise, and skips players without stock", () => {
	const state = scenario({
		seats: 4,
		board: TWO_CHAINS,
		hands: [["12I"], ["12G"], ["4A"], ["10I"]],
		activeSeat: 2,
		shares: [{ luxor: 1 }, {}, { luxor: 2 }, { luxor: 1 }],
	});
	play(state, 2, place("4A"));
	assert.equal(state.phase, "dispose");
	const order: number[] = [];
	while (state.phase === "dispose") {
		const seat = currentSeat(state)!;
		order.push(seat);
		play(state, seat, dispose(0, 0));
	}
	assert.deepEqual(order, [2, 3, 0]);
	assert.equal(state.activeSeat, 2);
	assert.equal(state.phase, "buy");
});

test("§7.2.2 only the player who must dispose may move", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A"), shares: [{}, { luxor: 2 }] });
	play(state, 0, place("4A"));
	assert.equal(currentSeat(state), 1);
	assert.throws(() => applyMove(state, dispose(0, 0), 0), /not your turn/);
});

test("§7.2.2 selling pays the defunct chain's pre-merger share price", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A"), shares: [{}, { luxor: 3 }, { luxor: 1 }] });
	play(state, 0, place("4A"));
	play(state, 1, dispose(3, 0));
	assert.equal(state.seats[1]!.shares.luxor, 0);
	assert.equal(state.seats[1]!.cash, 6000 + 2000 + 3 * 200);
	assert.equal(state.bank.luxor, 25 - 1);
});

test("§7.2.2 trading gives one survivor share for every two defunct shares", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A"), shares: [{}, { luxor: 5 }] });
	play(state, 0, place("4A"));
	assert.throws(() => applyMove(state, dispose(0, 3), 1), /two for one/);
	play(state, 1, dispose(1, 4));
	assert.equal(state.seats[1]!.shares.tower, 2);
	assert.equal(state.seats[1]!.shares.luxor, 0);
	assert.equal(state.bank.tower, 23);
	assert.equal(state.bank.luxor, 25);
});

test("§7.2.2 held shares stay with the player after the chain is gone", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A"), shares: [{}, { luxor: 5 }] });
	play(state, 0, place("4A"));
	play(state, 1, dispose(1, 2));
	assert.equal(state.seats[1]!.shares.luxor, 2);
	assert.deepEqual(entries(state, "disposed"), [
		{ type: "disposed", seat: 1, chain: "luxor", sold: 1, traded: 2, held: 2, proceeds: 200 },
	]);
});

test("§7.2.2 a player cannot dispose of more shares than they hold", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A"), shares: [{}, { luxor: 3 }] });
	play(state, 0, place("4A"));
	assert.throws(() => applyMove(state, dispose(2, 2), 1), /do not hold/);
	assert.throws(() => applyMove(state, dispose(-1, 0), 1), /non-negative/);
});

test("§7.2.2 trades are limited by the survivor shares left in the bank", () => {
	const state = scenario({
		board: TWO_CHAINS,
		hands: hands(0, "4A"),
		shares: [{ tower: 22, luxor: 2 }, { luxor: 6 }],
		activeSeat: 0,
	});
	play(state, 0, place("4A"));
	assert.equal(currentSeat(state), 0);
	play(state, 0, dispose(0, 2));
	assert.equal(state.bank.tower, 2);
	assert.equal(currentSeat(state), 1);
	assert.throws(() => applyMove(state, dispose(0, 6), 1), /enough survivor shares/);
	play(state, 1, dispose(0, 4));
	assert.equal(state.bank.tower, 0);
	assert.equal(state.seats[1]!.shares.tower, 2);
});

test("§7.3 the survivor absorbs defunct tiles, the merging tile and loose tiles connected to it", () => {
	const state = scenario({
		board: { ...TWO_CHAINS, "4B": "loose", "4C": "loose", "9C": "loose" },
		hands: hands(0, "4A"),
	});
	play(state, 0, place("4A"));
	assert.ok(["4A", "4B", "4C", "5A", "6A"].every((label) => state.board[t(label)] === "tower"));
	assert.equal(state.board[t("9C")], "loose");
	assert.equal(chainSize(state.board, "tower"), 8);
});

test("§7.3 defunct chain names become available again", () => {
	const state = scenario({ board: { ...TWO_CHAINS, "9C": "loose" }, hands: [["4A"], ["9D"], ["12I"]] });
	play(state, 0, place("4A"));
	play(state, 0, { type: "buy", shares: {} });
	play(state, 1, place("9D"));
	play(state, 1, { type: "found", chain: "luxor" });
	assert.equal(chainSize(state.board, "luxor"), 2);
});

test("§7.2 defunct chains are resolved largest first", () => {
	const state = scenario({ board: AROUND_5E, hands: hands(0, "5E"), shares: [{}, { luxor: 2, festival: 2 }] });
	play(state, 0, place("5E"));
	assert.deepEqual(entries(state, "mergerPlan"), [
		{ type: "mergerPlan", survivor: "tower", defunct: ["luxor", "festival"] },
	]);
	assert.deepEqual(
		entries(state, "bonuses").map((e) => e.chain),
		["luxor"]
	);
	play(state, 1, dispose(0, 0));
	assert.deepEqual(
		entries(state, "bonuses").map((e) => e.chain),
		["luxor", "festival"]
	);
});

test("§7.3 one defunct chain's disposal is completed by all players before the next chain's bonuses", () => {
	const state = scenario({
		board: AROUND_5E,
		hands: hands(0, "5E"),
		shares: [{ luxor: 1, festival: 1 }, { luxor: 2 }, { festival: 3 }],
	});
	play(state, 0, place("5E"));
	play(state, 0, dispose(1, 0));
	assert.equal(entries(state, "bonuses").length, 1);
	play(state, 1, dispose(2, 0));
	const bonusChains = entries(state, "bonuses").map((e) => e.chain);
	assert.deepEqual(bonusChains, ["luxor", "festival"]);
	const lastLuxorDisposal = Math.max(
		...state.log.flatMap((e, i) => (e.type === "disposed" && e.chain === "luxor" ? [i] : []))
	);
	const festivalBonus = state.log.findIndex((e) => e.type === "bonuses" && e.chain === "festival");
	assert.ok(lastLuxorDisposal < festivalBonus);
	assert.equal(currentSeat(state), 0);
	play(state, 0, dispose(1, 0));
	assert.equal(currentSeat(state), 2);
	play(state, 2, dispose(3, 0));
	assert.deepEqual(activeChains(state.board), ["tower"]);
	assert.equal(chainSize(state.board, "tower"), 4 + 3 + 2 + 1);
});

test("§7.2 tied defunct chains: the mergermaker chooses their order", () => {
	const board = {
		...chainAt("tower", row("E", 1, 4)),
		...chainAt("luxor", ["6E", "7E"]),
		...chainAt("festival", ["5F", "5G"]),
	};
	const state = scenario({ board, hands: hands(0, "5E") });
	play(state, 0, place("5E"));
	assert.equal(state.phase, "defunctOrder");
	assert.equal(currentSeat(state), 0);
	assert.throws(() => applyMove(state, { type: "defunctOrder", chains: ["festival"] }, 0), /every defunct/);
	assert.throws(() => applyMove(state, { type: "defunctOrder", chains: ["tower", "festival"] }, 0), /every defunct/);
	play(state, 0, { type: "defunctOrder", chains: ["festival", "luxor"] });
	assert.deepEqual(entries(state, "mergerPlan")[0]?.defunct, ["festival", "luxor"]);
});

test("§7.2 a tied defunct order must still put larger chains first", () => {
	const board = {
		...chainAt("tower", row("E", 1, 4)),
		...chainAt("luxor", row("E", 6, 8)),
		...chainAt("festival", ["5F", "5G"]),
		...chainAt("imperial", ["5C", "5D"]),
	};
	const state = scenario({ board, hands: hands(0, "5E") });
	play(state, 0, place("5E"));
	assert.equal(state.phase, "defunctOrder");
	assert.throws(() => applyMove(state, { type: "defunctOrder", chains: ["festival", "luxor", "imperial"] }, 0));
	play(state, 0, { type: "defunctOrder", chains: ["luxor", "imperial", "festival"] });
	assert.equal(chainSize(state.board, "tower"), 4 + 3 + 2 + 2 + 1);
});

test("§7.1/§7.2 a four-way tie: the mergermaker picks the survivor, then the defunct order", () => {
	const board = {
		...chainAt("tower", ["3E", "4E"]),
		...chainAt("luxor", ["6E", "7E"]),
		...chainAt("festival", ["5F", "5G"]),
		...chainAt("imperial", ["5C", "5D"]),
	};
	const state = scenario({ board, hands: hands(0, "5E") });
	play(state, 0, place("5E"));
	assert.equal(state.phase, "survivor");
	play(state, 0, { type: "survivor", chain: "imperial" });
	assert.equal(state.phase, "defunctOrder");
	play(state, 0, { type: "defunctOrder", chains: ["luxor", "tower", "festival"] });
	assert.deepEqual(activeChains(state.board), ["imperial"]);
	assert.equal(chainSize(state.board, "imperial"), 9);
});

test("§9.3 after a merger, shares are bought at the survivor's new size", () => {
	const state = scenario({ board: TWO_CHAINS, hands: hands(0, "4A") });
	play(state, 0, place("4A"));
	play(state, 0, { type: "buy", shares: { tower: 1 } });
	assert.equal(state.seats[0]!.cash, 6000 - 600);
});

test("§7/§10 four-way merger: survivor tie, tied defunct order, and the survivor's bank shares running out", () => {
	// Around 5E: tower 2E-4E (3) and luxor 6E-8E (3) tie for largest; imperial 5C-5D (2) and
	// festival 5F-5G (2) tie as defunct chains. The bank has only 3 luxor shares left.
	const board = {
		...chainAt("tower", row("E", 2, 4)),
		...chainAt("luxor", row("E", 6, 8)),
		...chainAt("imperial", ["5C", "5D"]),
		...chainAt("festival", ["5F", "5G"]),
	};
	const state = scenario({
		seats: 4,
		board,
		hands: [["12I"], ["5E"], ["12G"], ["10I"]],
		activeSeat: 1,
		shares: [
			{ luxor: 22, imperial: 3 },
			{ tower: 4 },
			{ tower: 2, imperial: 3 },
			{ tower: 2, imperial: 2, festival: 2 },
		],
	});
	assert.equal(state.bank.luxor, 3);

	play(state, 1, place("5E"));
	assert.equal(state.phase, "survivor");
	assert.equal(currentSeat(state), 1);
	play(state, 1, { type: "survivor", chain: "luxor" });
	assert.equal(state.phase, "defunctOrder");
	assert.throws(() => applyMove(state, { type: "defunctOrder", chains: ["imperial", "tower", "festival"] }, 1));
	play(state, 1, { type: "defunctOrder", chains: ["tower", "imperial", "festival"] });

	// Tower (minor, size 3: $300, bonuses $3,000 / $1,500): seat 1 first, seats 2 and 3 tie for second.
	assert.equal(currentSeat(state), 1);
	play(state, 1, dispose(2, 2));
	play(state, 2, dispose(0, 0));
	play(state, 3, dispose(0, 2));
	assert.equal(state.bank.luxor, 1);

	// Imperial (major, size 2: $400, bonuses $4,000 / $2,000): seats 0 and 2 tie for first.
	// Seat 1 holds none and is skipped; seat 2's trade takes the last luxor share.
	assert.equal(currentSeat(state), 2);
	play(state, 2, dispose(1, 2));
	assert.equal(state.bank.luxor, 0);
	assert.throws(() => applyMove(state, dispose(0, 2), 3), /enough survivor shares/);
	play(state, 3, dispose(2, 0));
	assert.throws(() => applyMove(state, dispose(0, 2), 0), /enough survivor shares/);
	play(state, 0, dispose(0, 0));

	// Festival (medium, size 2: $300, bonuses $3,000 / $1,500): seat 3 is the single holder.
	assert.throws(() => applyMove(state, dispose(0, 2), 3), /enough survivor shares/);
	play(state, 3, dispose(2, 0));

	assert.deepEqual(
		entries(state, "bonuses").map(({ chain, size, payouts }) => ({ chain, size, payouts })),
		[
			{
				chain: "tower",
				size: 3,
				payouts: [
					{ seat: 1, amount: 3000 },
					{ seat: 2, amount: 800 },
					{ seat: 3, amount: 800 },
				],
			},
			{
				chain: "imperial",
				size: 2,
				payouts: [
					{ seat: 0, amount: 3000 },
					{ seat: 2, amount: 3000 },
				],
			},
			{ chain: "festival", size: 2, payouts: [{ seat: 3, amount: 4500 }] },
		]
	);
	assert.deepEqual(
		entries(state, "disposed").map(({ seat, chain }) => [chain, seat]),
		[
			["tower", 1],
			["tower", 2],
			["tower", 3],
			["imperial", 2],
			["imperial", 3],
			["imperial", 0],
			["festival", 3],
		]
	);

	assert.deepEqual(
		state.seats.map((seat) => seat.cash),
		[6000 + 3000, 6000 + 3000 + 600, 6000 + 800 + 3000 + 400, 6000 + 800 + 800 + 4500 + 600]
	);
	const holdings = state.seats.map(({ shares }) => ({
		tower: shares.tower,
		luxor: shares.luxor,
		imperial: shares.imperial,
		festival: shares.festival,
	}));
	assert.deepEqual(holdings, [
		{ tower: 0, luxor: 22, imperial: 3, festival: 0 },
		{ tower: 0, luxor: 1, imperial: 0, festival: 0 },
		{ tower: 2, luxor: 1, imperial: 0, festival: 0 },
		{ tower: 0, luxor: 1, imperial: 0, festival: 0 },
	]);
	assert.deepEqual(
		{ tower: state.bank.tower, luxor: state.bank.luxor, imperial: state.bank.imperial, festival: state.bank.festival },
		{ tower: 23, luxor: 0, imperial: 22, festival: 25 }
	);

	assert.deepEqual(activeChains(state.board), ["luxor"]);
	assert.equal(chainSize(state.board, "luxor"), 3 + 3 + 2 + 2 + 1);
	assert.equal(state.activeSeat, 1);
});
