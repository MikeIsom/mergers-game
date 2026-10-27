import { isBankMode } from "./bank.js";
import { activeChains, chainSize, connectedLoose } from "./board.js";
import { computeBonuses } from "./bonuses.js";
import { majorityBonus, minorityBonus, sharePrice } from "./prices.js";
import type { GameState } from "./types.js";

export interface NetWorth {
	cash: number;
	stock: number;
	bonuses: number;
	total: number;
}

/** Public liquidation estimate, without inspecting hands, future draws or random state. */
export function projectedNetWorth(state: GameState): NetWorth[] | undefined {
	if (!state.ended && !state.options.publicHoldings) {
		return undefined;
	}
	if (state.seats.some((seat) => seat.cash < 0 || Object.values(seat.shares).some((count) => count < 0))) {
		return undefined;
	}
	const worth = state.seats.map((seat) => ({ cash: seat.cash, stock: 0, bonuses: 0, total: seat.cash }));
	if (state.ended) {
		return worth; // Final sales and bonuses are already in cash.
	}
	const m = state.merger;
	for (const chain of activeChains(state.board)) {
		let size = chainSize(state.board, chain);
		let bonusPending = true;
		let sellers: number[] | undefined;
		if (m?.survivor && m.sizes[chain] !== undefined) {
			if (chain === m.survivor) {
				size =
					Object.values(m.sizes).reduce((sum, count) => sum + count, 0) + connectedLoose(state.board, m.tile).length;
			} else if (m.current === chain) {
				// This bonus has already been paid. Only players still disposing may sell these shares.
				bonusPending = false;
				sellers = m.disposers;
			} else if (m.current !== null && !m.defunct.includes(chain)) {
				continue; // Resolved, absorbed chain: retained shares are now inactive.
			}
		}
		const price = sharePrice(chain, size);
		const bonuses =
			bonusPending && !isBankMode(state)
				? computeBonuses(
						state.seats.map((seat) => seat.shares[chain]),
						majorityBonus(chain, size),
						minorityBonus(chain, size)
					)
				: state.seats.map(() => 0);
		for (const [seat, value] of worth.entries()) {
			value.stock += sellers === undefined || sellers.includes(seat) ? state.seats[seat]!.shares[chain] * price : 0;
			value.bonuses += bonuses[seat]!;
			value.total = value.cash + value.stock + value.bonuses;
		}
	}
	return worth;
}
