import { applyMove, dropPlayerSeats } from "./moves.js";
import { initGame } from "./setup.js";
import type { GameState } from "./types.js";

/**
 * Rebuilds the game from its seed by re-applying the logged decisions and drops up to log
 * length `to`. Automatic steps are regenerated and must match the log exactly, or this throws.
 * Player names are not logged, so they come from the given state.
 */
export function replayGame(data: GameState, to: number = data.log.length): GameState {
	if (!Number.isInteger(to) || to < 0 || to > data.log.length) {
		throw new Error(`Cannot replay to position ${to}`);
	}
	const first = data.log[0];
	if (!data.seed || first?.type !== "init") {
		throw new Error("Replay needs the full game state, including the seed");
	}
	const state = initGame(first.players, first.rawOptions, data.seed);
	checkLog(state, data, 0);
	while (state.log.length < to) {
		const checked = state.log.length;
		const entry = data.log[checked]!;
		if (entry.type === "move" && entry.auto !== true) {
			applyMove(state, entry.move, entry.seat);
		} else if (entry.type === "dropped") {
			dropPlayerSeats(state, state.seatOwner[entry.seat]!);
		} else {
			throw new Error(`Replay diverged: log entry ${checked} (${entry.type}) is not a player action`);
		}
		checkLog(state, data, checked);
	}
	if (state.log.length !== to) {
		throw new Error(`Position ${to} is not between two moves`);
	}
	state.seats.forEach((seat, index) => {
		seat.name = data.seats[index]!.name;
	});
	return state;
}

function checkLog(state: GameState, data: GameState, from: number): void {
	for (let i = from; i < state.log.length; i++) {
		if (JSON.stringify(state.log[i]) !== JSON.stringify(data.log[i])) {
			throw new Error(`Replay diverged at log entry ${i}`);
		}
	}
}
