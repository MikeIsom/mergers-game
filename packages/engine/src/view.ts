import { CHAIN_IDS } from "./config.js";
import { visibleLog } from "./limited-log.js";
import { holdingsVisibility, type HoldingsVisibility } from "./options.js";
import type { GameState, Shares } from "./types.js";

/** Value sent in place of anything the viewer may not see. */
export const HIDDEN = -1;

const HIDDEN_SHARES = Object.fromEntries(CHAIN_IDS.map((chain) => [chain, HIDDEN])) as Shares;

/** The internal seats a real player controls (two in fourHands); none for a spectator. */
export function seatsOf(state: GameState, player: number | undefined): number[] {
	return state.seatOwner.flatMap((owner, seat) => (owner === player ? [seat] : []));
}

/** The holdings level everyone sees now: all of them once the game has ended. */
export function visibilityNow(state: GameState): HoldingsVisibility {
	return state.ended ? "public" : holdingsVisibility(state.options);
}

/**
 * rules.md §13: another seat's cash and shares as shown at `level`. Below public, the
 * per-chain holdings are hidden; cashAndShareCount adds their total as `shareCount`.
 */
export function maskHoldings(
	holdings: { cash: number; shares: Shares },
	level: HoldingsVisibility
): { cash: number; shares: Shares; shareCount?: number } {
	if (level === "public") {
		return { cash: holdings.cash, shares: { ...holdings.shares } };
	}
	return {
		cash: level === "private" ? HIDDEN : holdings.cash,
		shares: { ...HIDDEN_SHARES },
		...(level === "cashAndShareCount"
			? { shareCount: Object.values(holdings.shares).reduce((sum, count) => sum + count, 0) }
			: {}),
	};
}

/**
 * rules.md §13: the state as `player` may see it (undefined for a spectator). Hidden numbers
 * are replaced by HIDDEN so the shape stays the same. Hands and the pool order are always
 * private; other seats' cash and holdings are shown as far as the holdings level allows
 * (maskHoldings), and fully once the game has ended. With limitedLog, older log entries are
 * replaced. The seed is removed because it determines the pool order.
 */
export function viewFor(state: GameState, player: number | undefined): GameState {
	const own = seatsOf(state, player);
	const level = visibilityNow(state);
	return {
		...structuredClone(state),
		seed: "",
		rngCounter: 0,
		pool: state.pool.map(() => HIDDEN),
		log: visibleLog(state, player),
		seats: state.seats.map((seat, index) => {
			if (own.includes(index)) {
				return structuredClone(seat);
			}
			return {
				...structuredClone(seat),
				hand: seat.hand.map(() => HIDDEN),
				...maskHoldings(seat, level),
			};
		}),
	};
}
