import seedrandom from "seedrandom";
import type { GameState } from "./types.js";

// All randomness is derived from the game seed plus a counter stored in the state,
// so draws stay deterministic across save/load and replay without persisting PRNG internals.

export function nextRandom(state: GameState): number {
	const rng = seedrandom(`${state.seed}:${state.rngCounter}`);
	state.rngCounter += 1;
	return rng();
}

export function nextInt(state: GameState, maxExclusive: number): number {
	return Math.floor(nextRandom(state) * maxExclusive);
}

/** Fisher-Yates shuffle in place, driven by the state PRNG. */
export function shuffle<T>(state: GameState, items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = nextInt(state, i + 1);
		const a = items[i] as T;
		items[i] = items[j] as T;
		items[j] = a;
	}
	return items;
}
