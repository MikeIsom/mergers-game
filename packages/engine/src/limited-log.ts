import type { GameState, LogEntry } from "./types.js";

/** Setup entries describe options and turn order, not play, so they always stay visible. */
const SETUP: LogEntry["type"][] = ["init", "optionIgnored", "turnOrder"];

/**
 * rules.md §13 limitedLog: the first log index anyone may read. Every player and spectator
 * sees the same window: the current turn, including a merger in progress, and the full round
 * of turns before it (one turn per seat, so four in fourHands). It always reaches back at least
 * to the start of each player's own previous turn, wherever they sit. The whole log is visible
 * when the option is off or the game is over.
 */
export function logWindowStart(state: GameState): number {
	if (!state.options.limitedLog || state.ended) {
		return 0;
	}
	let turns = 0;
	for (let index = state.log.length - 1; index >= 0; index--) {
		if (state.log[index]!.type === "turn" && ++turns > state.seats.length) {
			return index;
		}
	}
	return 0;
}

/** The log as anyone may read it: earlier entries become placeholders, keeping its length. */
export function visibleLog(state: GameState): LogEntry[] {
	const start = logWindowStart(state);
	return state.log.map((entry, index) =>
		index >= start || SETUP.includes(entry.type) ? structuredClone(entry) : { type: "hidden" }
	);
}
