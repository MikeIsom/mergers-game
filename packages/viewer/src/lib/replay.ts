// BGS replay controls: the state to display at a log position, built from the engine's
// positionAt (the public log replayed with the engine's own placement functions).
import { CHAIN_IDS, HIDDEN, positionAt, seatsOf, type GameState, type Shares } from "acquire-engine";

const HIDDEN_SHARES = Object.fromEntries(CHAIN_IDS.map((chain) => [chain, HIDDEN])) as Shares;

/** The first replay position: the board after setup, at the start of the first turn. */
export function replayStart(state: GameState): number {
	const firstTurn = state.log.findIndex((entry) => entry.type === "turn");
	return firstTurn < 0 ? state.log.length : firstTurn + 1;
}

/**
 * The game as it stood after `at` log entries. Holdings show only where they are public now:
 * public holdings, a finished game, or the viewer's own seats. Tiles in hand are never shown.
 */
export function replayView(state: GameState, player: number | undefined, at: number): GameState {
	const position = positionAt(state, at);
	const own = seatsOf(state, player);
	const holdingsPublic = state.options.publicHoldings || state.ended;
	return {
		...state,
		board: position.board,
		bank: position.bank,
		seats: state.seats.map((seat, index) => {
			const shown = position.seats[index]!;
			const visible = holdingsPublic || own.includes(index);
			return {
				...seat,
				cash: visible ? shown.cash : HIDDEN,
				shares: visible ? shown.shares : { ...HIDDEN_SHARES },
				hand: Array.from({ length: shown.tiles }, () => HIDDEN),
			};
		}),
		log: state.log.slice(0, at),
		merger: null,
		pendingTile: null,
		endAnnounced: null,
		ended: false,
	};
}
