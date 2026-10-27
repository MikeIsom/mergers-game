import { activeChains, chainSize } from "./board.js";
import type { ChainId } from "./config.js";
import { sharePrice } from "./prices.js";
import type { GameState } from "./types.js";

/** The shared allowance counts shares given, across every exchange in this seat's turn. */
export function stockSwapsRemaining(state: GameState): number {
	const limit = state.options.stockSwap;
	if (limit === "unlimited") {
		return Infinity;
	}
	if (!limit) {
		return 0;
	}
	let used = 0;
	for (let i = state.log.length - 1; i >= 0; i--) {
		const entry = state.log[i]!;
		if (entry.type === "turn") {
			break;
		}
		if (entry.type === "swapped") {
			used += entry.count;
		}
	}
	return Math.max(0, limit - used);
}

/** Positive means paying the bank; negative means receiving cash from it. */
export function stockSwapCost(state: GameState, from: ChainId, to: ChainId, count: number): number {
	return count * (sharePrice(to, chainSize(state.board, to)) - sharePrice(from, chainSize(state.board, from)));
}

export function maxStockSwap(state: GameState, from: ChainId, to: ChainId): number {
	if (state.ended || state.phase !== "buy" || state.merger || from === to) {
		return 0;
	}
	const active = activeChains(state.board);
	if (!active.includes(from) || !active.includes(to)) {
		return 0;
	}
	const seat = state.seats[state.activeSeat]!;
	const cost = stockSwapCost(state, from, to, 1);
	return Math.max(
		0,
		Math.min(
			stockSwapsRemaining(state),
			seat.shares[from],
			state.bank[to],
			cost > 0 ? Math.floor(seat.cash / cost) : Infinity
		)
	);
}

export function swapStock(state: GameState, from: ChainId, to: ChainId, count: number): void {
	const seat = state.seats[state.activeSeat]!;
	const cost = stockSwapCost(state, from, to, count);
	seat.shares[from] -= count;
	state.bank[from] += count;
	seat.shares[to] += count;
	state.bank[to] -= count;
	seat.cash -= cost;
	state.log.push({ type: "swapped", seat: state.activeSeat, from, to, count, cost });
}
