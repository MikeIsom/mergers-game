<script lang="ts">
	import ActionPanel from "./lib/ActionPanel.svelte";
	import Board from "./lib/Board.svelte";
	import ChainTable from "./lib/ChainTable.svelte";
	import Chat from "./lib/Chat.svelte";
	import Hand from "./lib/Hand.svelte";
	import Log from "./lib/Log.svelte";
	import Players from "./lib/Players.svelte";
	import PriceTable from "./lib/PriceTable.svelte";
	import Status from "./lib/Status.svelte";
	import type { ViewerStore } from "./lib/store.svelte";
	import { tileLabel } from "acquire-engine";

	let { store }: { store: ViewerStore } = $props();
</script>

<main class="acquire" data-theme={store.theme} lang={store.locale} dir={store.rightToLeft ? "rtl" : "ltr"}>
	{#if store.state}
		{@const state = store.view!}
		<div class="layout">
			<div class="controls">
				<Status {state} seats={store.seats} />
				<ActionPanel {store} />
			</div>
			<div class="board">
				<Board
					{state}
					selected={store.selected}
					onconfirm={() =>
						store.selected !== undefined && store.send({ type: "place", tile: tileLabel(store.selected) })}
				/>
			</div>
			{#if store.seats.length > 0 && store.replayAt === undefined}
				<div class="hand"><Hand {store} /></div>
			{/if}
			<div class="info">
				<ChainTable {state} seats={store.seats} />
				<PriceTable {state} />
				<Players {state} seats={store.seats} />
				{#if !store.analysis}
					<Chat />
				{/if}
				<Log {state} />
			</div>
		</div>
	{:else}
		<p>{store.lang.t("loading")}</p>
	{/if}
</main>

<style>
	/* Narrow screens: one column, decision and board together so a selected square and its confirm
	   button are both visible. No viewport-height units: BGS sizes the iframe to its content. */
	.layout {
		display: grid;
		gap: 12px 20px;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: "controls" "board" "hand" "info";
		align-items: start;
	}
	.controls {
		grid-area: controls;
	}
	.board {
		grid-area: board;
		max-width: 660px;
	}
	.hand {
		grid-area: hand;
	}
	.info {
		grid-area: info;
		min-width: 0;
		display: grid;
		gap: 16px;
	}
	.info > :global(section) {
		min-width: 0;
	}
	/* Tablets and phones in landscape: the board beside the decision and hand. */
	@media (min-width: 700px) {
		.layout {
			grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr);
			grid-template-areas: "board controls" "board hand" "info info";
			grid-template-rows: auto 1fr auto;
		}
	}
	/* Desktop: board, decision and hand, then the chain, player and log columns. */
	@media (min-width: 1200px) {
		.layout {
			grid-template-columns: minmax(0, 620px) minmax(280px, 380px) minmax(320px, 1fr);
			grid-template-areas: "board controls info" "board hand info";
			grid-template-rows: auto 1fr;
		}
	}
</style>
