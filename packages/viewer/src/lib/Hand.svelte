<script lang="ts">
	import { handSize, HIDDEN, parseTile, sortTiles, tileLabel, tileLegality, type Tile } from "acquire-engine";
	import { ofType, turnLimit } from "./decisions";
	import { seatName } from "./format";
	import type { ViewerStore } from "./store.svelte";
	import TileStatusIcon from "./TileStatusIcon.svelte";

	let { store }: { store: ViewerStore } = $props();
	const t = $derived(store.lang.t);

	const state = $derived(store.state!);
	// Tiles the engine would accept right now; only these are actionable.
	const playable = $derived(new Set(ofType(store.moves, "place").map((move) => parseTile(move.tile)!)));

	// With two tiles per turn, dead tiles are swapped at the start of the turn (rules.md §4.1).
	const replacement = $derived(t(state.options.twoTiles ? "hand.deadNextTurn" : "hand.deadReplacement"));

	function why(seat: number, tile: Tile): string {
		const legality = tileLegality(state.board, tile);
		if (legality === "permanentlyUnplayable") {
			return `${t("hand.dead")}. ${replacement}.`;
		}
		if (legality === "temporarilyUnplayable") {
			return t("hand.eighth");
		}
		const limit = turnLimit(state, seat, tile);
		return limit ? t(`hand.${limit}`) : "";
	}

	function choose(tile: Tile): void {
		store.selected = store.selected === tile ? undefined : tile;
	}
</script>

{#each store.seats as seat (seat)}
	<!-- Masked tiles can only appear while a new seat's state is still arriving; never show them. -->
	{@const hand = sortTiles(state.seats[seat]!.hand.filter((tile) => tile !== HIDDEN))}
	{@const dead = hand.filter((tile) => tileLegality(state.board, tile) === "permanentlyUnplayable")}
	{@const paused = hand.filter((tile) => tileLegality(state.board, tile) === "temporarilyUnplayable")}
	{@const limited = hand.filter((tile) => turnLimit(state, seat, tile) !== undefined)}
	<section class="hand" aria-label={t("hand.of", { name: seatName(state, seat, store.lang) })}>
		<h2>{store.seats.length > 1 ? t("hand.seat", { seat: seat + 1 }) : t("hand.yours")}</h2>
		<div class="tiles" data-size={handSize(state.options)}>
			{#each hand as tile, index (index)}
				{@const permanent = dead.includes(tile)}
				{@const blocked = permanent || paused.includes(tile) || limited.includes(tile)}
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
					<span
						class="tile"
						class:dead={permanent}
						class:paused={paused.includes(tile) || limited.includes(tile)}
						title={why(seat, tile)}
						role="img"
						aria-label={blocked ? `${tileLabel(tile)} — ${why(seat, tile)}` : tileLabel(tile)}
					>
						<span class="coordinate">{tileLabel(tile)}</span>
						{#if blocked}<span class="tile-status"><TileStatusIcon {permanent} /></span>{/if}
					</span>
				{/if}
			{:else}
				<span class="none">{t("hand.none")}</span>
			{/each}
		</div>
		{#if dead.length || paused.length || limited.length}
			<ul class="tile-notes">
				{#if dead.length}
					<li class="dead-note">
						<TileStatusIcon permanent={true} />
						<span><bdi>{dead.map(tileLabel).join(", ")}</bdi> — {replacement}</span>
					</li>
				{/if}
				{#if paused.length}
					<li class="paused-note">
						<TileStatusIcon permanent={false} />
						<span><bdi>{paused.map(tileLabel).join(", ")}</bdi> — {t("hand.eighth")}</span>
					</li>
				{/if}
				{#each ["oneFounding", "mergeFounded", "foundOrMerge"] as const as limit (limit)}
					{@const tiles = limited.filter((tile) => turnLimit(state, seat, tile) === limit)}
					{#if tiles.length}
						<li class="paused-note">
							<TileStatusIcon permanent={false} />
							<span><bdi>{tiles.map(tileLabel).join(", ")}</bdi> — {t(`hand.${limit}`)}</span>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</section>
{/each}

<style>
	.hand {
		margin: 12px 0 0;
		container-type: inline-size;
	}
	.hand:first-child {
		margin-top: 0;
	}
	/* Six tiles fit on one row; the 12px gaps leave room for outlines drawn outside the tiles.
	   A row of n 52px tiles needs 64n + 4px; 44px tiles need 56n + 4px. */
	.tiles {
		--columns: 6;
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 52px));
		gap: 12px;
		padding: 8px;
		background: var(--rack);
		width: max-content;
		max-width: 100%;
	}
	/* Larger hands take one row where the rack's column fits it, otherwise two even rows. */
	.tiles[data-size="8"] {
		--columns: 4;
	}
	.tiles[data-size="10"] {
		--columns: 5;
	}
	.tiles[data-size="12"] {
		--columns: 6;
	}
	@container (min-width: 516px) {
		.tiles[data-size="8"] {
			--columns: 8;
		}
	}
	@container (min-width: 644px) {
		.tiles[data-size="10"] {
			--columns: 10;
		}
	}
	@container (min-width: 772px) {
		.tiles[data-size="12"] {
			--columns: 12;
		}
	}
	/* Narrow phones: three rows of four rather than tiles below the 44px touch size. */
	@container (max-width: 339px) {
		.tiles[data-size="12"] {
			--columns: 4;
		}
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
	.tile.dead,
	.tile.paused {
		gap: 3px;
		color: color-mix(in srgb, var(--on-loose) 76%, var(--loose));
	}
	.tile.dead {
		background-image: repeating-linear-gradient(135deg, transparent 0 5px, #ffffff14 5px 7px);
	}
	.dead .coordinate {
		background: var(--loose);
		padding: 0 3px;
	}
	.tile-status {
		display: flex;
		background: var(--loose);
	}
	.tile-notes {
		list-style: none;
		margin: 4px 0 0;
		padding: 0;
		max-width: 388px;
		font-size: 12px;
		color: var(--ink-muted);
	}
	.tile-notes li {
		display: flex;
		align-items: start;
		gap: 6px;
		margin-top: 4px;
	}
	.tile-notes :global(svg) {
		flex: 0 0 auto;
	}
	.tile-notes bdi {
		font-weight: 600;
		color: var(--ink);
	}
	.none {
		color: var(--ink-muted);
	}
</style>
