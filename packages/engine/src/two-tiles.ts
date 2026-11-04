import { placementEffect } from "./board.js";
import type { ChainId } from "./config.js";
import type { Tile } from "./tiles.js";
import type { GameState } from "./types.js";

/**
 * Why rules.md §15 twoTiles rules out a tile this turn: `oneFounding` (a second founding),
 * `mergeFounded` (a merger involving the chain founded this turn), or, in games created
 * under the original limits, `foundOrMerge` (a founding and a merger in one turn).
 */
export type TwoTileLimit = "oneFounding" | "mergeFounded" | "foundOrMerge";

/**
 * What the active seat's placements have done so far this turn, read from the log: how many
 * tiles it placed, the chain it founded (if any) and whether it caused a merger.
 */
export function turnPlacements(state: GameState): { placed: number; founded: ChainId | null; merged: boolean } {
	const result: { placed: number; founded: ChainId | null; merged: boolean } = {
		placed: 0,
		founded: null,
		merged: false,
	};
	for (let i = state.log.length - 1; i >= 0; i--) {
		const entry = state.log[i]!;
		if (entry.type === "turn") {
			break;
		}
		if (entry.type === "move" && entry.move.type === "place") {
			result.placed++;
		} else if (entry.type === "founded") {
			result.founded = entry.chain;
		} else if (entry.type === "merger" && !entry.byBank) {
			// rules.md §15 twoTiles: mergers caused by bank tiles do not count.
			result.merged = true;
		}
	}
	return result;
}

/**
 * rules.md §4.1: a turn founds at most one chain, and its second tile cannot merge the chain
 * its first tile founded. Games created before the relaxed limits (no `twoTilesRelaxed`)
 * also forbid founding and merging in the same turn, in either order.
 */
export function twoTileLimit(state: GameState, tile: Tile): TwoTileLimit | undefined {
	if (!state.options.twoTiles) {
		return undefined;
	}
	const { founded, merged } = turnPlacements(state);
	const effect = placementEffect(state.board, tile);
	if (effect.kind === "found" && founded !== null) {
		return "oneFounding";
	}
	if (!state.options.twoTilesRelaxed) {
		return (effect.kind === "found" && merged) || (effect.kind === "merge" && founded !== null)
			? "foundOrMerge"
			: undefined;
	}
	return effect.kind === "merge" && founded !== null && effect.chains.includes(founded) ? "mergeFounded" : undefined;
}

/** Whether `tile` is ruled out by what this turn's placements already did (rules.md §4.1). */
export function blockedThisTurn(state: GameState, tile: Tile): boolean {
	return twoTileLimit(state, tile) !== undefined;
}

/** rules.md §15 twoTiles: whether the active seat places another tile before buying. */
export function secondPlacementDue(state: GameState): boolean {
	return state.options.twoTiles === true && turnPlacements(state).placed === 1;
}
