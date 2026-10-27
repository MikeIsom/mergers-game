<script lang="ts">
	import { activeChains, chainSize, chainTier, type GameState } from "acquire-engine";
	import ChainMark from "./ChainMark.svelte";
	import { useStore } from "./store.svelte";
	import { TIERS, chainsInTier, priceTable, rangeLabel, rowIndexFor } from "./priceTable";

	let { state: game }: { state: GameState } = $props();

	const table = priceTable();
	const store = useStore();
	const t = $derived(store.lang.t);
	const money = $derived(store.lang.money);
	const TIER_KEYS = { minor: "prices.minor", medium: "prices.medium", major: "prices.major" } as const;
	let open = $state(false);

	// Each active chain is marked in its tier column, in the row matching its current size.
	const marks = $derived(
		activeChains(game.board).map((chain) => {
			const tier = chainTier(chain);
			return { chain, tier, row: rowIndexFor(table, tier, chainSize(game.board, chain)) };
		})
	);
</script>

<section aria-label={t("prices.label")}>
	<button type="button" class="toggle actionable" aria-expanded={open} onclick={() => (open = !open)}>
		{open ? t("prices.hide") : t("prices.show")}
	</button>
	{#if open}
		<table class="prices">
			<thead>
				<tr>
					{#each TIERS as tier (tier)}
						<th class="tier" scope="col">
							<span class="sr-only">{t(TIER_KEYS[tier])}</span>
							<span class="heads">
								{#each chainsInTier(tier) as chain (chain)}<ChainMark {chain} small />{/each}
							</span>
						</th>
					{/each}
					<th class="num" scope="col">{t("prices.price")}</th>
					<th class="num" scope="col">{t("prices.first")}</th>
					<th class="num" scope="col">{t("prices.second")}</th>
				</tr>
			</thead>
			<tbody>
				{#each table as row, index (row.price)}
					<tr>
						{#each TIERS as tier (tier)}
							{@const here = marks.filter((mark) => mark.tier === tier && mark.row === index)}
							<td class="tier">
								<span class="size">{rangeLabel(row.sizes[tier])}</span>
								{#if here.length > 0}
									<span class="heads">
										{#each here as mark (mark.chain)}<ChainMark chain={mark.chain} small />{/each}
									</span>
								{/if}
							</td>
						{/each}
						<td class="num">{money(row.price)}</td>
						<td class="num">{money(row.first)}</td>
						<td class="num">{money(row.second)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="note">{t("prices.note")}</p>
	{/if}
</section>

<style>
	.toggle {
		padding: 6px 12px;
		min-height: 44px;
		background: var(--page);
		color: var(--ink);
		font: inherit;
		border: none;
	}
	/* Six columns must fit a 375px phone: compact type, and markers wrap under the size. */
	.prices {
		margin: 8px 0 0;
		table-layout: fixed;
		font-size: 12px;
	}
	.prices th,
	.prices td {
		padding: 3px 3px;
		vertical-align: top;
	}
	.tier {
		width: 19%;
	}
	.heads {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		margin-top: 2px;
	}
	.size {
		font-variant-numeric: tabular-nums;
	}
	.note {
		font-size: 12px;
		color: var(--ink-muted);
		margin: 4px 0 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
