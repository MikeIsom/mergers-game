<script lang="ts">
	import { BOARD_COLUMNS, BOARD_ROWS, tileLabel, type GameState, type Tile } from "acquire-engine";
	import { chainName } from "./format";
	import { CHAIN_STYLES, patternCss } from "./palette";
	import { useStore } from "./store.svelte";

	let {
		state,
		selected,
		onconfirm,
	}: {
		state: GameState;
		/** A tile selected in the hand: its square is highlighted and clicking it places the tile. */
		selected?: Tile;
		onconfirm?: () => void;
	} = $props();

	// Rows A-I down, columns 1-12 across, like the printed board. Tile index = (column - 1) * 9 + row.
	const ROW_LETTERS = "ABCDEFGHI";
	const rows = Array.from({ length: BOARD_ROWS }, (_, row) => row);
	const columns = Array.from({ length: BOARD_COLUMNS }, (_, column) => column);
	const tileAt = (row: number, column: number) => column * BOARD_ROWS + row;
	const pendingTile = $derived(state.merger?.tile ?? state.pendingTile);
	const store = useStore();
	const t = $derived(store.lang.t);
</script>

<div class="frame" dir="ltr">
	<div></div>
	<div class="numbers" aria-hidden="true">
		{#each columns as column (column)}<span>{column + 1}</span>{/each}
	</div>
	<div class="letters" aria-hidden="true">
		{#each rows as row (row)}<span>{ROW_LETTERS[row]}</span>{/each}
	</div>
	<div class="board" aria-label={t("board.label")}>
		{#each rows as row (row)}
			{#each columns as column (column)}
				{@const tile = tileAt(row, column)}
				{@const cell = state.board[tile] ?? null}
				{@const label = tileLabel(tile)}
				{#if tile === selected && cell === null}
					<button
						type="button"
						class="square empty selected actionable"
						aria-label={t("board.place", { tile: label })}
						onclick={() => onconfirm?.()}
					>
						<span class="coord">{label}</span>
					</button>
				{:else if cell === null}
					<div class="square empty" aria-label={t("board.empty", { tile: label })}>
						<span class="coord">{label}</span>
					</div>
				{:else if cell === "loose"}
					<div class="square loose" class:pending={tile === pendingTile} aria-label={t("board.loose", { tile: label })}>
						<span class="coord">{label}</span>
					</div>
				{:else}
					{@const style = CHAIN_STYLES[cell]}
					<div
						class="square chain"
						style:background={style.fill}
						style:color={style.text}
						aria-label={t("board.chain", { tile: label, chain: chainName(cell) })}
					>
						{#if store.colorBlind}
							<!-- Colour-blind mode: the chain's pattern, with the letter on a solid patch so its
							     contrast never changes. Edge labels give the coordinate. -->
							<span class="pattern" style:background={patternCss(style.pattern, style.patternInk)}></span>
							<span class="letter patch" style:background={style.fill}>{style.letter}</span>
						{:else}
							<span class="corner-label">{label}</span>
							<span class="letter">{style.letter}</span>
						{/if}
					</div>
				{/if}
			{/each}
		{/each}
	</div>
</div>

<style>
	.frame {
		display: grid;
		grid-template-columns: 16px minmax(0, 1fr);
		grid-template-rows: 18px auto;
		width: 100%;
		max-width: 660px;
	}
	/* Edge labels use the same 2px padding and gaps as the board so they line up with squares. */
	.numbers,
	.letters {
		display: grid;
		gap: 2px;
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-muted);
	}
	.numbers {
		grid-template-columns: repeat(12, minmax(0, 1fr));
		padding: 0 2px;
		align-items: end;
		text-align: center;
	}
	.letters {
		grid-template-rows: repeat(9, minmax(0, 1fr));
		padding: 2px 0;
		align-items: center;
	}
	/* The dark board shows through 2px gaps between squares; the gaps are not outlines. */
	.board {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 2px;
		padding: 2px;
		background: var(--gap);
	}
	.square {
		position: relative;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		overflow: hidden;
		margin: 0;
		padding: 0;
		border: none;
		font: inherit;
	}
	/* An empty square only shows its small, muted coordinate, like the printed board. */
	.empty {
		background: var(--empty);
	}
	.empty .coord {
		font-size: 10px;
		color: var(--on-empty);
	}
	/* The selected tile's square: page colour plus an accent outline, since the accent is only
	   2.92:1 against the grey. */
	.empty.selected {
		background: var(--page);
		outline: 4px solid var(--accent);
		outline-offset: -4px;
	}
	.empty.selected .coord {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink);
	}
	/* A loose tile is black with a light coordinate. */
	.loose {
		background: var(--loose);
	}
	.loose .coord {
		font-size: 11px;
		font-weight: 600;
		color: var(--on-loose);
	}
	/* The merging tile, or a tile waiting for a chain name: an accent stripe on a thin page-coloured
	   line, so the accent never sits directly on the black tile. */
	.loose.pending {
		box-shadow:
			inset 0 -6px 0 var(--accent),
			inset 0 -8px 0 var(--page);
	}
	/* Some chain colours are close to the grey in brightness; the bold letter tells them apart. */
	.chain .letter {
		font-weight: 800;
		font-size: clamp(14px, 2.6vw, 22px);
		line-height: 1;
	}
	/* On narrow screens the edge labels give the coordinates; corner labels would crowd the letter. */
	@media (max-width: 520px) {
		.chain .corner-label {
			display: none;
		}
		.empty .coord {
			font-size: 9px;
		}
		.loose .coord {
			font-size: 10px;
		}
	}
	.chain .pattern {
		position: absolute;
		inset: 0;
	}
	.chain .patch {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 58%;
		height: 58%;
	}
	.chain .corner-label {
		position: absolute;
		top: 1px;
		left: 2px;
		font-size: 8px;
		line-height: 1;
	}
</style>
