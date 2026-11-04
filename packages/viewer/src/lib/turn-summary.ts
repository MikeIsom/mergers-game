// The turn summary shown before a move that ends the turn: this turn's log lines, the move
// about to be sent, and the acting seat's cash and shares afterwards. Only the acting seat's own
// numbers are used; nothing is inferred about hidden holdings.
import {
	CHAIN_IDS,
	chainSize,
	connectedLoose,
	currentSeat,
	placementEffect,
	sharePrice,
	stockSwapCost,
	parseTile,
	type ChainId,
	type GameState,
	type LogEntry,
	type Move,
	type Shares,
} from "acquire-engine";
import { describePlacement } from "./decisions.ts";
import { describeEntryParts, type Lang, type LogPart } from "./format.ts";
import { currentTurnEntries } from "./turn-draft.ts";

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

export interface SummaryLine {
	key: string;
	parts: LogPart[];
	/** Already saved: Undo cannot take it back. */
	final: boolean;
	/** The move that confirming will send. */
	pending: boolean;
}

/** How the pending move will be logged, built from the same log entries and translations. */
function pendingEntry(state: GameState, move: Move, seat: number): LogEntry | undefined {
	switch (move.type) {
		case "buy": {
			const cost = -(moveEffect(state, move)?.cash ?? 0);
			return { type: "bought", seat, shares: move.shares, cost };
		}
		case "swap":
			return {
				type: "swapped",
				seat,
				from: move.from,
				to: move.to,
				count: move.count,
				cost: stockSwapCost(state, move.from, move.to, move.count),
			};
		case "dispose": {
			const merger = state.merger!;
			const chain = merger.current!;
			return {
				type: "disposed",
				seat,
				chain,
				sold: move.sell,
				traded: move.trade,
				held: state.seats[seat]!.shares[chain] - move.sell - move.trade,
				proceeds: move.sell * sharePrice(chain, merger.sizes[chain]!),
			};
		}
		case "pass":
			return { type: "skipPlace", seat };
		case "announce":
			return { type: "announced", seat };
		case "found":
			return {
				type: "founded",
				seat,
				chain: move.chain,
				size: connectedLoose(state.board, state.pendingTile!).length,
				bonus: state.bank[move.chain] > 0,
			};
		default:
			return { type: "move", seat, move };
	}
}

/** This turn's lines, oldest first, ending with the move about to be sent. */
export function turnSummary(state: GameState, move: Move, lang: Lang, undoFrom: number): SummaryLine[] {
	const seat = currentSeat(state)!;
	const start = state.log.length - currentTurnEntries(state).length;
	const lines: SummaryLine[] = [];
	state.log.slice(start).forEach((entry, offset) => {
		const index = start + offset;
		const parts = describeEntryParts(state, entry, lang);
		if (parts) {
			lines.push({ key: String(index), parts, final: index < undoFrom, pending: false });
		}
	});
	const parts =
		move.type === "place"
			? [
					{
						kind: "text" as const,
						text: lang.t("place.effect", {
							tile: move.tile,
							effect: describePlacement(state, parseTile(move.tile)!, lang),
						}),
					},
				]
			: describeEntryParts(state, pendingEntry(state, move, seat)!, lang);
	if (parts) {
		lines.push({ key: "pending", parts, final: false, pending: true });
	}
	return lines;
}
