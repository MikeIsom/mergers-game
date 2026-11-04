// The acting seat's cash and shares after a move, for previews before it is sent. Only the
// acting seat's own numbers are used; nothing is inferred about hidden holdings.
import {
	CHAIN_IDS,
	chainSize,
	currentSeat,
	placementEffect,
	sharePrice,
	stockSwapCost,
	parseTile,
	type ChainId,
	type GameState,
	type Move,
	type Shares,
} from "acquire-engine";

export interface Effect {
	cash: number;
	shares: Partial<Shares>;
}

/** The change `move` makes to the acting seat's cash and shares, or undefined when it pays bonuses. */
export function moveEffect(state: GameState, move: Move): Effect | undefined {
	const seat = currentSeat(state);
	if (seat === undefined) {
		return undefined;
	}
	const price = (chain: ChainId) => sharePrice(chain, chainSize(state.board, chain));
	switch (move.type) {
		case "buy": {
			const shares = Object.entries(move.shares) as [ChainId, number][];
			return {
				cash: -shares.reduce((sum, [chain, count]) => sum + count * price(chain), 0),
				shares: move.shares,
			};
		}
		case "swap":
			return {
				cash: -stockSwapCost(state, move.from, move.to, move.count),
				shares: { [move.from]: -move.count, [move.to]: move.count },
			};
		case "dispose": {
			const merger = state.merger!;
			const defunct = merger.current!;
			return {
				cash: move.sell * sharePrice(defunct, merger.sizes[defunct]!),
				shares: { [defunct]: -(move.sell + move.trade), [merger.survivor!]: move.trade / 2 },
			};
		}
		case "found":
			return { cash: 0, shares: state.bank[move.chain] > 0 ? { [move.chain]: 1 } : {} };
		case "place":
			return placementEffect(state.board, parseTile(move.tile)!).kind === "merge" ? undefined : { cash: 0, shares: {} };
		case "pass":
		case "announce":
			return { cash: 0, shares: {} };
		case "survivor":
		case "defunctOrder":
			return undefined;
	}
}

export interface HoldingChange {
	chain: ChainId;
	before: number;
	after: number;
}

/** The acting seat's cash and every holding it has or gains, before and after `effect`. */
export function holdingsAfter(state: GameState, effect: Effect) {
	const seat = state.seats[currentSeat(state)!]!;
	const shares: HoldingChange[] = CHAIN_IDS.flatMap((chain) => {
		const before = seat.shares[chain];
		const after = before + (effect.shares[chain] ?? 0);
		return before > 0 || after > 0 ? [{ chain, before, after }] : [];
	});
	return { cash: { before: seat.cash, after: seat.cash + effect.cash }, shares };
}
