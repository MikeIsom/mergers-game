// BGS replay controls: the state to display at a log position, built from the engine's
// positionAt (the public log replayed with the engine's own placement functions).
import { HIDDEN, maskHoldings, positionAt, seatsOf, visibilityNow, type GameState } from "acquire-engine";

/** The first replay position: the board after setup, at the start of the first turn. */
export function replayStart(state: GameState): number {
	const firstTurn = state.log.findIndex((entry) => entry.type === "turn");
	return firstTurn < 0 ? state.log.length : firstTurn + 1;
}

/**
 * The game as it stood after `at` log entries. Holdings show only as far as they are public now
 * (the holdings level, or all of them in a finished game), except on the viewer's own seats.
 * Tiles in hand are never shown.
 */
export function replayView(state: GameState, player: number | undefined, at: number): GameState {
	const position = positionAt(state, at);
	const own = seatsOf(state, player);
	const level = visibilityNow(state);
	return {
		...state,
		board: position.board,
		bank: position.bank,
		seats: state.seats.map((seat, index) => {
			const shown = position.seats[index]!;
			const { shareCount: _, ...rest } = seat;
			return {
				...rest,
				...maskHoldings(shown, own.includes(index) ? "public" : level),
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
