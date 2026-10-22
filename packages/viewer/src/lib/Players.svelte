<script lang="ts">
	import { CHAIN_IDS, HIDDEN, currentSeat, type GameState } from "acquire-engine";
	import ChainMark from "./ChainMark.svelte";
	import PlayerName from "./PlayerName.svelte";
	import { useStore } from "./store.svelte";

	let { state, seats }: { state: GameState; seats: number[] } = $props();

	const acting = $derived(currentSeat(state));
	const store = useStore();
	const t = $derived(store.lang.t);
</script>

<section aria-label={t("players.label")}>
	<h2>{t("players.title")}</h2>
	<div class="table-scroll">
		<table>
			<thead>
				<tr>
					<th>{t("players.player")}</th>
					<th class="num">{t("players.cash")}</th>
					<th>{t("players.stock")}</th>
					<th class="num">{t("players.tiles")}</th>
				</tr>
			</thead>
			<tbody>
				{#each state.seats as seat, index (index)}
					{@const held = CHAIN_IDS.filter((chain) => seat.shares[chain] !== 0)}
					{@const hidden = seat.cash === HIDDEN}
					<tr class:you={seats.includes(index)}>
						<td>
							{#if index === acting}<span class="turn" aria-label={t("players.acting")}>▶</span>{/if}
							<PlayerName {state} seat={index} />
							{#if seats.includes(index)}<span class="tag">{t("players.you")}</span>{/if}
							{#if index === state.activeSeat && index !== acting && !state.ended}<span class="tag"
									>{t("players.turn")}</span
								>{/if}
							{#if seat.dropped}<span class="tag">{t("players.left")}</span>{/if}
						</td>
						<td class="num" class:hidden-value={hidden}>{store.lang.money(seat.cash)}</td>
						<td>
							{#if hidden}
								<span class="hidden-value">{t("hidden")}</span>
							{:else if held.length === 0}
								<span class="none">{t("players.none")}</span>
							{:else}
								<span class="stock">
									{#each held as chain (chain)}
										<span class="holding"><ChainMark {chain} />{seat.shares[chain]}</span>
									{/each}
								</span>
							{/if}
						</td>
						<td class="num">{seat.hand.length}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.you td {
		font-weight: 600;
	}
	.turn {
		color: var(--ink);
		margin-right: 2px;
	}
	.tag {
		margin-left: 6px;
		padding: 0 4px;
		font-size: 11px;
		font-weight: 600;
		background: var(--panel);
		color: var(--ink-muted);
	}
	.stock {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.holding {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-variant-numeric: tabular-nums;
	}
	.none {
		color: var(--ink-muted);
	}
</style>
