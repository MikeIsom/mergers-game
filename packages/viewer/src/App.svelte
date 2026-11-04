<script lang="ts">
	import ActionPanel from "./lib/ActionPanel.svelte";
	import Board from "./lib/Board.svelte";
	import ChainTable from "./lib/ChainTable.svelte";
	import Chat from "./lib/Chat.svelte";
	import Hand from "./lib/Hand.svelte";
	import Log from "./lib/Log.svelte";
	import PlaceConfirm from "./lib/PlaceConfirm.svelte";
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
		<!-- Each column stacks its panels independently on wider screens, so a short panel never stretches
		     to the board's height; phones place the panels individually (the columns are display: contents). -->
		<div class="layout">
			<div class="column turn-column">
				<div class="controls">
					<Status {state} seats={store.seats} />
					<ActionPanel {store} />
				</div>
				{#if store.seats.length > 0 && store.replayAt === undefined}
					<div class="hand">
						<Hand {store} />
						<div class="hand-confirm"><PlaceConfirm {store} nearHand /></div>
					</div>
				{/if}
				<div class="market">
					<ChainTable {state} seats={store.seats} />
					<PriceTable {state} />
				</div>
			</div>
			<div class="column board-column">
				<div class="board">
					<Board
						{state}
						selected={store.selected}
						onplace={(tile) => store.send({ type: "place", tile: tileLabel(tile) })}
					/>
				</div>
				<div class="players">
					<Players {state} seats={store.seats} />
				</div>
			</div>
			<div class="column talk-column">
				<div class="history"><Log {state} /></div>
				{#if !store.analysis}
					<div class="conversation"><Chat /></div>
				{/if}
			</div>
		</div>
	{:else}
		<p>{store.lang.t("loading")}</p>
	{/if}
</main>

<style>
	/* Phones: one column that keeps the decision, board and hand together. */
	.layout {
		display: grid;
		gap: 20px;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: "controls" "board" "hand" "market" "players" "conversation" "history";
		align-items: start;
	}
	.column {
		display: contents;
	}
	.column,
	.column > div {
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
	/* Tablets and phones in landscape: the board and players beside the decision, hand and chains;
	   history and chat below. */
	@media (min-width: 700px) {
		.layout {
			grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr);
			grid-template-areas: "main turn" "history conversation";
		}
		.board-column,
		.turn-column {
			display: flex;
			flex-direction: column;
			gap: 20px;
		}
		.board-column {
			grid-area: main;
		}
		.turn-column {
			grid-area: turn;
		}
		/* Placing a tile needs no second confirmation here: the decision is right above the hand. */
		.hand-confirm {
			display: none;
		}
	}
	/* Desktop: three independent columns (board and players; decision, hand and chains; history and
	   chat), so none of them leaves an empty area beside the board. */
	@media (min-width: 1200px) {
		.layout {
			grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr) minmax(320px, 1fr);
			grid-template-areas: "main turn talk";
		}
		.column {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}
		.talk-column {
			grid-area: talk;
		}
	}
</style>
