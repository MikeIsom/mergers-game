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
					onplace={(tile) => store.send({ type: "place", tile: tileLabel(tile) })}
				/>
			</div>
			{#if store.seats.length > 0 && store.replayAt === undefined}
				<div class="hand"><Hand {store} /></div>
			{/if}
			<div class="market">
				<ChainTable {state} seats={store.seats} />
				<PriceTable {state} />
			</div>
			<div class="players">
				<Players {state} seats={store.seats} />
			</div>
			{#if !store.analysis}
				<div class="conversation"><Chat /></div>
			{/if}
			<div class="history"><Log {state} /></div>
		</div>
	{:else}
		<p>{store.lang.t("loading")}</p>
	{/if}
</main>

<style>
	/* Keep the decision and board together on narrow screens. */
	.layout {
		display: grid;
		gap: 20px;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: "controls" "board" "hand" "market" "players" "conversation" "history";
		align-items: start;
	}
	.layout > div {
		min-width: 0;
	}
	.controls {
		grid-area: controls;
	}
	.board {
		grid-area: board;
	}
	.hand {
		grid-area: hand;
	}
	.market {
		grid-area: market;
		display: grid;
		gap: 16px;
	}
	.market > :global(section) {
		min-width: 0;
	}
	.players {
		grid-area: players;
	}
	.conversation {
		grid-area: conversation;
	}
	.history {
		grid-area: history;
	}
	/* Tablets and phones in landscape: the board beside the decision and hand. */
	@media (min-width: 700px) {
		.layout {
			grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr);
			grid-template-areas:
				"board controls"
				"board hand"
				"market players"
				"history conversation";
			grid-template-rows: auto 1fr auto auto;
		}
	}
	/* Desktop: keep the market beside the board; spread the supporting panels across a second row
	   instead of letting chat and history make one very tall sidebar. */
	@media (min-width: 1200px) {
		.layout {
			row-gap: 16px;
			grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr) minmax(320px, 1fr);
			grid-template-areas:
				"board controls market"
				"board hand market"
				"players history conversation";
			grid-template-rows: auto 1fr auto;
		}
	}
</style>
