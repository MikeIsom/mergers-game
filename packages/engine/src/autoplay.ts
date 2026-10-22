import { activeChains, playableTiles } from "./board.js";
import { CHAIN_IDS } from "./config.js";
import { merger, survivorCandidates } from "./merger.js";
import { sortTiles, tileLabel } from "./tiles.js";
import type { GameState, Move } from "./types.js";

/** rules.md §16: the decision a dropped seat makes in the current phase. Never announces. */
export function defaultMove(state: GameState, seat: number): Move {
	switch (state.phase) {
		case "place": {
			const [tile] = sortTiles(playableTiles(state, seat));
			return tile === undefined ? { type: "pass" } : { type: "place", tile: tileLabel(tile) };
		}
		case "found": {
			const active = activeChains(state.board);
			return { type: "found", chain: CHAIN_IDS.find((chain) => !active.includes(chain))! };
		}
		case "survivor":
			return { type: "survivor", chain: survivorCandidates(merger(state))[0]! };
		case "defunctOrder": {
			const m = merger(state);
			const defunct = CHAIN_IDS.filter((chain) => m.sizes[chain] !== undefined && chain !== m.survivor);
			// Array.prototype.sort is stable, so equal sizes keep config order.
			return { type: "defunctOrder", chains: defunct.sort((a, b) => m.sizes[b]! - m.sizes[a]!) };
		}
		case "dispose":
			return { type: "dispose", sell: 0, trade: 0 };
		case "buy":
			return { type: "buy", shares: {} };
		default:
			throw new Error(`No default move in phase ${state.phase}`);
	}
}
