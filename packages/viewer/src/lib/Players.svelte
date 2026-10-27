<script lang="ts">
	import { CHAIN_IDS, HIDDEN, currentSeat, isBankMode, projectedNetWorth, type GameState } from "acquire-engine";
	import ChainMark from "./ChainMark.svelte";
	import PlayerName from "./PlayerName.svelte";
	import { useStore } from "./store.svelte";

	let { state, seats }: { state: GameState; seats: number[] } = $props();

	const acting = $derived(currentSeat(state));
	const store = useStore();
	const t = $derived(store.lang.t);
	// Partial replay log entries are not complete decision states (bonuses/sales may be mid-update).
	const worth = $derived(store.replayAt === undefined ? projectedNetWorth(state) : undefined);
</script>

<section aria-label={t("players.label")}>
	<h2>{t("players.title")}</h2>
	<div class="table-scroll">
		<table>
			<thead>
				<tr>
					<th>{t("players.player")}</th>
					<th class="num"
						>{#if worth}{t("players.netWorth")}<small>{t("players.cash")}</small>{:else}{t("players.cash")}{/if}</th
					>
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
						{#if worth}
							<td class="num net-worth"
								><strong><bdi dir="ltr">{state.ended ? "" : "≈ "}{store.lang.money(worth[index]!.total)}</bdi></strong
								><small>{store.lang.money(seat.cash)}</small></td
							>
						{:else}
							<td class="num" class:hidden-value={hidden}>{store.lang.money(seat.cash)}</td>
						{/if}
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
	{#if worth && !state.ended}
		<details class="worth-details">
			<summary>{t("players.worthBreakdown")}</summary>
			<p>{t(isBankMode(state) ? "players.worthBank" : "players.worthNote")}</p>
			{#if state.options.teamPlay}<p>{t("players.worthTeams")}</p>{/if}
			{#if state.players !== state.seats.length}<p>{t("players.worthFourHands")}</p>{/if}
			<div class="table-scroll">
				<table>
					<thead
						><tr
							><th>{t("players.player")}</th><th class="num">{t("players.cash")}</th><th class="num"
								>{t("players.stock")}</th
							><th class="num">{t("players.bonuses")}</th></tr
						></thead
					>
					<tbody>
						{#each worth as value, index (index)}
							<tr
								><td><PlayerName {state} seat={index} /></td><td class="num">{store.lang.money(value.cash)}</td><td
									class="num">{store.lang.money(value.stock)}</td
								><td class="num">{isBankMode(state) ? "—" : store.lang.money(value.bonuses)}</td></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{/if}
</section>

<style>
	.net-worth {
		white-space: nowrap;
	}
	.net-worth small,
	th small {
		display: block;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-muted);
	}
	.worth-details {
		margin-top: 8px;
		font-size: 13px;
	}
	.worth-details summary {
		cursor: pointer;
		color: var(--ink-muted);
	}
	.worth-details p {
		margin: 8px 0;
	}
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
