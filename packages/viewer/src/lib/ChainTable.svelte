<script lang="ts">
	import { CHAIN_IDS, SAFE_SIZE, chainSize, sharePrice, type GameState } from "acquire-engine";
	import ChainMark from "./ChainMark.svelte";
	import { useStore } from "./store.svelte";

	let { state, seats }: { state: GameState; seats: number[] } = $props();
	const store = useStore();
	const t = $derived(store.lang.t);

	const rows = $derived(
		CHAIN_IDS.map((chain) => {
			const size = chainSize(state.board, chain);
			const held = seats.reduce((sum, seat) => sum + Math.max(0, state.seats[seat]!.shares[chain]), 0);
			return { chain, size, price: size >= 2 ? sharePrice(chain, size) : undefined, bank: state.bank[chain], held };
		})
	);
</script>

<section aria-label={t("chains.label")}>
	<h2>{t("chains.title")}</h2>
	<div class="table-scroll">
		<table>
			<thead>
				<tr>
					<th>{t("chains.chain")}</th>
					<th class="num">{t("chains.size")}</th>
					<th class="num">{t("chains.price")}</th>
					<th class="num">{t("chains.bank")}</th>
					{#if seats.length > 0}<th class="num">{t("chains.yours")}</th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.chain)}
					<tr class:inactive={row.size === 0}>
						<td><ChainMark chain={row.chain} withName /></td>
						<td class="num">
							{#if row.size === 0}
								{t("chains.notOnBoard")}
							{:else}
								{row.size}{#if row.size >= SAFE_SIZE}<span class="safe">{t("chains.safe")}</span>{/if}
							{/if}
						</td>
						<td class="num">{row.price === undefined ? "" : store.lang.money(row.price)}</td>
						<td class="num">{store.lang.count(row.bank)}</td>
						{#if seats.length > 0}<td class="num">{row.held}</td>{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.inactive td {
		color: var(--ink-muted);
	}
	.safe {
		margin-left: 6px;
		padding: 0 4px;
		font-size: 11px;
		font-weight: 600;
		background: var(--accent);
		color: var(--on-accent);
	}
</style>
