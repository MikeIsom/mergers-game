<script lang="ts">
	import { HIDDEN, parseTile, sortTiles, tileLabel, tileLegality, type Tile } from "acquire-engine";
	import { ofType } from "./decisions";
	import { seatName } from "./format";
	import type { ViewerStore } from "./store.svelte";

	let { store }: { store: ViewerStore } = $props();
	const t = $derived(store.lang.t);

	const state = $derived(store.state!);
	// Tiles the engine would accept right now; only these are actionable.
	const playable = $derived(new Set(ofType(store.moves, "place").map((move) => parseTile(move.tile)!)));

	function why(tile: Tile): string {
		const legality = tileLegality(state.board, tile);
		if (legality === "permanentlyUnplayable") {
			return t("hand.dead");
		}
		if (legality === "temporarilyUnplayable") {
			return t("hand.eighth");
		}
		return "";
	}

	function choose(tile: Tile): void {
		store.selected = store.selected === tile ? undefined : tile;
	}
</script>

{#each store.seats as seat (seat)}
	<!-- Masked tiles can only appear while a new seat's state is still arriving; never show them. -->
	{@const hand = sortTiles(state.seats[seat]!.hand.filter((tile) => tile !== HIDDEN))}
	<section class="hand" aria-label={t("hand.of", { name: seatName(state, seat, store.lang) })}>
		<h2>{store.seats.length > 1 ? t("hand.seat", { seat: seat + 1 }) : t("hand.yours")}</h2>
		<div class="tiles">
			{#each hand as tile, index (index)}
				{#if playable.has(tile)}
					<button
						type="button"
						class="tile"
						class:actionable={!store.sending}
						class:selected={store.selected === tile}
						aria-pressed={store.selected === tile}
						disabled={store.sending}
						onclick={() => choose(tile)}>{tileLabel(tile)}</button
					>
				{:else}
					<span class="tile" title={why(tile)}>
						{tileLabel(tile)}
						{#if why(tile)}<small>{why(tile)}</small>{/if}
					</span>
				{/if}
			{:else}
				<span class="none">{t("hand.none")}</span>
			{/each}
		</div>
	</section>
{/each}

<style>
	.hand {
		margin: 12px 0 0;
	}
	/* Six tiles fit on one row; the 12px gaps leave room for outlines drawn outside the tiles. */
	.tiles {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 52px));
		gap: 12px;
		padding: 8px;
		background: var(--rack);
		width: max-content;
		max-width: 100%;
	}
	.tile {
		position: relative;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 1;
		min-height: 44px;
		margin: 0;
		padding: 0;
		border: none;
		background: var(--loose);
		color: var(--on-loose);
		font: inherit;
		font-weight: 600;
		font-size: 15px;
	}
	/* The outline sits outside the black tile, against the rack. */
	.tile.actionable {
		outline-offset: 3px;
	}
	/* The selected tile keeps its black face; the accent outline replaces the ink one. */
	.tile.actionable.selected {
		outline: 4px solid var(--accent);
	}
	.tile small {
		font-size: 9px;
		font-weight: 400;
		line-height: 1.1;
		text-align: center;
		padding: 0 2px;
		color: var(--on-loose);
	}
	.none {
		color: var(--ink-muted);
	}
</style>
