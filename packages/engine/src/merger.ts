import { bankHolding, placeNextBankTile } from "./bank.js";
import { chainSize, connectedLoose } from "./board.js";
import { computeBonuses } from "./bonuses.js";
import { CHAIN_IDS, type ChainId } from "./config.js";
import { majorityBonus, minorityBonus, sharePrice } from "./prices.js";
import type { Tile } from "./tiles.js";
import type { GameState, MergerState } from "./types.js";

export function merger(state: GameState): MergerState {
	if (!state.merger) {
		throw new Error("No merger is in progress");
	}
	return state.merger;
}

/** rules.md §7.1: the largest chains by pre-merger size; more than one means a tie. */
export function survivorCandidates(m: MergerState): ChainId[] {
	const chains = CHAIN_IDS.filter((chain) => m.sizes[chain] !== undefined);
	const largest = Math.max(...chains.map((chain) => m.sizes[chain]!));
	return chains.filter((chain) => m.sizes[chain] === largest);
}

/** rules.md §7.2: defunct chains must be resolved largest first; only ties are a choice. */
export function isValidDefunctOrder(m: MergerState, order: ChainId[]): boolean {
	const expected = CHAIN_IDS.filter((chain) => m.sizes[chain] !== undefined && chain !== m.survivor);
	if (order.length !== expected.length || new Set(order).size !== order.length) {
		return false;
	}
	if (!order.every((chain) => expected.includes(chain))) {
		return false;
	}
	return order.every((chain, i) => i === 0 || m.sizes[order[i - 1]!]! >= m.sizes[chain]!);
}

/** Starts a merger for a tile already on the board as a loose tile, placed by a player or the bank. */
export function startMerger(state: GameState, tile: Tile, chains: ChainId[], byBank = false): void {
	const sizes = Object.fromEntries(chains.map((chain) => [chain, chainSize(state.board, chain)]));
	state.merger = {
		tile,
		mergermaker: state.activeSeat,
		sizes,
		survivor: null,
		defunct: [],
		current: null,
		disposers: [],
	};
	state.log.push({ type: "merger", seat: state.activeSeat, tile, sizes, ...(byBank ? { byBank: true as const } : {}) });
	const candidates = survivorCandidates(state.merger);
	if (candidates.length > 1) {
		state.phase = "survivor";
		return;
	}
	setSurvivor(state, candidates[0]!);
}

export function setSurvivor(state: GameState, survivor: ChainId): void {
	const m = merger(state);
	m.survivor = survivor;
	const defunct = CHAIN_IDS.filter((chain) => m.sizes[chain] !== undefined && chain !== survivor).sort(
		(a, b) => m.sizes[b]! - m.sizes[a]!
	);
	const sizes = defunct.map((chain) => m.sizes[chain]!);
	if (new Set(sizes).size !== sizes.length) {
		state.phase = "defunctOrder";
		return;
	}
	setDefunctOrder(state, defunct);
}

export function setDefunctOrder(state: GameState, order: ChainId[]): void {
	const m = merger(state);
	m.defunct = [...order];
	state.log.push({ type: "mergerPlan", survivor: m.survivor!, defunct: [...order] });
	resolveNextDefunct(state);
}

/** rules.md §7.2: pay bonuses for the next defunct chain, then start its stock disposal. */
function resolveNextDefunct(state: GameState): void {
	const m = merger(state);
	for (;;) {
		const chain = m.defunct.shift();
		if (chain === undefined) {
			completeMerger(state);
			return;
		}
		m.current = chain;
		payBonuses(state, chain, m.sizes[chain]!, "wait");
		const seats = state.seats.length;
		m.disposers = Array.from({ length: seats }, (_, i) => (m.mergermaker + i) % seats).filter(
			(seat) => state.seats[seat]!.shares[chain] > 0
		);
		if (m.disposers.length > 0) {
			state.phase = "dispose";
			return;
		}
	}
}

/**
 * rules.md §10, plus §12.1.1-2 in two-player bank mode: the bank draws a tile and competes as a
 * shareholder, and whatever it wins is not paid out. The drawn tile waits to be placed (§12.1.4).
 */
export function payBonuses(state: GameState, chain: ChainId, size: number, bankTileFate: "wait" | "setAside"): void {
	const bank = bankHolding(state, bankTileFate);
	const holdings = state.seats.map((seat) => seat.shares[chain]);
	const amounts = computeBonuses(
		bank ? [...holdings, bank.shares] : holdings,
		majorityBonus(chain, size),
		minorityBonus(chain, size)
	);
	const payouts = holdings.flatMap((_, seat) => (amounts[seat]! > 0 ? [{ seat, amount: amounts[seat]! }] : []));
	for (const { seat, amount } of payouts) {
		state.seats[seat]!.cash += amount;
	}
	state.log.push({
		type: "bonuses",
		chain,
		size,
		payouts,
		...(bank ? { bank: { ...bank, amount: amounts[holdings.length]! } } : {}),
	});
}

/** The most defunct shares `seat` may trade in now (§7.2: 2-for-1, limited by the bank). */
export function maxTrade(state: GameState, seat: number): number {
	const m = merger(state);
	const held = state.seats[seat]!.shares[m.current!];
	const byBank = state.bank[m.survivor!] * 2;
	const limit = Math.min(held, byBank);
	return limit - (limit % 2);
}

export function dispose(state: GameState, seat: number, sell: number, trade: number): void {
	const m = merger(state);
	const chain = m.current!;
	const survivor = m.survivor!;
	const player = state.seats[seat]!;
	const held = player.shares[chain] - sell - trade;
	const proceeds = sell * sharePrice(chain, m.sizes[chain]!);
	player.shares[chain] -= sell + trade;
	state.bank[chain] += sell + trade;
	player.cash += proceeds;
	player.shares[survivor] += trade / 2;
	state.bank[survivor] -= trade / 2;
	state.log.push({ type: "disposed", seat, chain, sold: sell, traded: trade, held, proceeds });
	m.disposers.shift();
	if (m.disposers.length > 0) {
		return;
	}
	resolveNextDefunct(state);
}

/** rules.md §7.3: the survivor absorbs the defunct chains, the merging tile and connected loose tiles. */
function completeMerger(state: GameState): void {
	const m = merger(state);
	const survivor = m.survivor!;
	for (let tile = 0; tile < state.board.length; tile++) {
		const cell = state.board[tile] ?? null;
		if (cell !== null && cell !== "loose" && cell !== survivor && m.sizes[cell] !== undefined) {
			state.board[tile] = survivor;
		}
	}
	for (const tile of connectedLoose(state.board, m.tile)) {
		state.board[tile] = survivor;
	}
	state.log.push({ type: "merged", survivor, size: chainSize(state.board, survivor) });
	state.merger = null;
	placeNextBankTile(state);
}
