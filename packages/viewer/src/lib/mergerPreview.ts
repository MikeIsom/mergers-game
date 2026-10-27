import { connectedLoose, sharePrice, type GameState } from "acquire-engine";

/** The known result of this merger, before any later bank-tile placements in two-player games. */
export function mergerPreview(state: GameState) {
	const merger = state.merger;
	if (!merger?.survivor) {
		return undefined;
	}
	// All participating chains, the connecting tile, and any connected loose tiles join the survivor.
	const size =
		Object.values(merger.sizes).reduce((total, count) => total + count, 0) +
		connectedLoose(state.board, merger.tile).length;
	return {
		chain: merger.survivor,
		size,
		beforePrice: sharePrice(merger.survivor, merger.sizes[merger.survivor]!),
		price: sharePrice(merger.survivor, size),
	};
}
