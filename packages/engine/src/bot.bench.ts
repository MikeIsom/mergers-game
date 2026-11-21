// Bot strength benchmark: node dist-test/src/bot.bench.js [games] [opponent=random|simple|bot]
// Plays whole games with the bot in one rotating seat (or every seat), counting its wins, ties
// and any decision the engine rejected. Not part of the test suite: it is slow by design.
import { defaultMove } from "./autoplay.js";
import { activeChains, chainSize } from "./board.js";
import { botMove } from "./bot.js";
import { CHAIN_IDS } from "./config.js";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat } from "./moves.js";
import { playerRankings } from "./scoring.js";
import { initGame } from "./setup.js";
import type { GameState, Move } from "./types.js";
import { viewFor } from "./view.js";

const games = Number(process.argv[2] ?? 60);
const opponent = process.argv[3] ?? "random";

function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const setups: [number, Record<string, unknown>][] = [
	[2, {}],
	[2, { twoPlayerMode: "fourHands" }],
	[3, {}],
	[4, {}],
	[4, { teamPlay: true }],
	[5, { stockSwap: "3", twoTiles: true }],
	[6, { limitedLog: true, sharesPerTurn: "4" }],
	[3, { publicHoldings: true, freeMergerOrder: true, disposalOrder: "shares" }],
];

/** A casual player: first tile, priciest chain, sells merger stock, buys into the biggest chain. */
function simpleMove(state: GameState, seat: number): Move {
	const moves = legalMoves(state).filter((m) => m.type !== "announce");
	if (state.phase === "found") {
		const found = moves.filter((m) => m.type === "found");
		return found[found.length - 1]!;
	}
	if (state.phase === "dispose") {
		const all = moves.filter((m) => m.type === "dispose" && m.trade === 0);
		return all[all.length - 1]!;
	}
	if (state.phase === "buy") {
		const chains = activeChains(state.board).sort((a, b) => chainSize(state.board, b) - chainSize(state.board, a));
		const buys = moves.filter((m): m is Extract<Move, { type: "buy" }> => m.type === "buy");
		for (const chain of chains) {
			const pick = buys
				.filter((m) => CHAIN_IDS.every((c) => c === chain || !m.shares[c]))
				.sort((a, b) => (b.shares[chain] ?? 0) - (a.shares[chain] ?? 0))[0];
			if (pick && (pick.shares[chain] ?? 0) > 0) {
				return pick;
			}
		}
		return { type: "buy", shares: {} };
	}
	return defaultMove(state, seat);
}

let wins = 0;
let ties = 0;
let rejected = 0;
let decisions = 0;
let played = 0;
const started = Date.now();
for (let g = 0; g < games; g++) {
	const [players, options] = setups[g % setups.length]!;
	const state: GameState = initGame(players, options, `bench-${g}`);
	const botPlayer = g % players;
	const random = lcg(g + 1);
	for (let i = 0; i < 20000 && !state.ended; i++) {
		const seat = currentSeat(state)!;
		const owner = state.seatOwner[seat]!;
		let move: Move;
		if (owner === botPlayer || opponent === "bot") {
			decisions++;
			move = botMove(viewFor(state, owner), owner);
		} else if (opponent === "simple") {
			move = simpleMove(state, seat);
		} else {
			const moves = legalMoves(state).filter((m) => m.type !== "announce");
			move = moves[Math.floor(random() * moves.length)]!;
		}
		try {
			applyMove(state, move, seat);
		} catch (error) {
			rejected++;
			if (rejected <= 5) {
				console.log("rejected", JSON.stringify(move), state.phase, String(error));
			}
			const moves = legalMoves(state);
			applyMove(state, moves[0]!, seat);
		}
	}
	if (!state.ended) {
		console.log("unfinished game", g);
		continue;
	}
	played++;
	const ranks = playerRankings(state);
	if (ranks[botPlayer] === 1) {
		if (ranks.filter((r) => r === 1).length > 1) {
			ties++;
		} else {
			wins++;
		}
	}
}
const ms = Date.now() - started;
console.log(
	`${played} games vs ${opponent}: bot first ${wins} (+${ties} tied), rejected ${rejected}/${decisions} decisions, ` +
		`${(ms / Math.max(1, decisions)).toFixed(2)} ms per decision`
);
